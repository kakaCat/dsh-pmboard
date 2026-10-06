/**
 * Requirements 路由（REQ-47939a t7）——从 host/routes.ts 的 createReqboardHandler 内联处理器**逐字搬入**。
 *
 * 只做协议转换（请求体 → 用例/领域判定 → JSON 信封）；状态字面量比较一律经 domain 判定函数
 * （layer-boundary INV-2）。错误 → HTTP 状态码映射集中在本目录 shared.ts 的 fail()。
 *
 * @module dsh-pmboard/http/routers/Requirements
 */
import { mutateIfPresent } from '../../application/use-cases/queue-access.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  assertReqTransition,
  asActor,
  asReqStatus,
  normalizeText,
  normalizeTitle,
  recordStatus,
  type ActorRef,
  type CommentRecord,
  type RequirementRecord,
} from '../../shared/protocol.js'
import { assertArtifactGates, artifactsToConfirm, type GateFailure } from '../../application/internal/artifact-gates.js'
import { checkDesignCompletenessGate, checkDesignDecompositionGate, contentGatesForMove } from '../../application/internal/content-gate-wiring.js'
// REQ-260930193929-897b FR-1：看板侧无会话上下文，读盘根必须由**需求记录**决定。
import { applyRequirementWorkspaceRoot, requireSameProject } from '../../application/internal/support.js'
import { isDesignArtifactKind } from '../../domain/artifact/ArtifactSpec.js'
// REQ-261002175818-80a8 t6 / FR-6：看板批准路径的披露取**同一份**超容量摘要（不另写措辞）
import { overCapacitySummary } from '../../domain/task/Footprint.js'
import { resolveRoundCapacity } from '../../plugin-config.js'
import { transitionRequirement } from '../../application/internal/token-usage.js'
import { disarmDiveOnTerminal } from '../../application/internal/terminal-disarm.js'
import { executeDecompose } from '../../application/use-cases/Decompose.js'
// REQ-261004183621-de3f t3：归档清单补录（工具与看板共用同一用例）
import { amendArchiveManifest } from '../../application/use-cases/AmendArchiveManifest.js'
import { armExplicit } from '../../application/internal/rearm.js'
import { applyRebind } from '../../application/internal/binding-write.js'
import { INITIAL_REQ_STATUS, canReqTransition } from '../../domain/requirement/RequirementStatus.js'
import { isRollback } from '../../domain/requirement/RollbackSpec.js'
import { applyRequirementRollback, recordRollbackMaterialized, resetInjectionAfterRollback } from '../../application/internal/rollback.js'
import { executeRollbackCleanup } from '../../application/use-cases/RollbackCleanup.js'
// REQ-261006164732-6503 t13（serves: FR-4、FR-5）：看板两条落章通道与其余通道共用
// 落章前提（gateStaleReason）与首写纪律（stampArtifactOnce / stampPlanOnce）——独立复核发现的漏网写点
import { stampArtifactOnce, stampPlanOnce } from '../../application/internal/confirm-settle.js'
import { gateForTransition, gateFromStage } from '../../domain/gate/GateCatalog.js'
import { fmt } from '../../domain/text/fmt.js'
import type { RouterCtx } from './shared.js'
import { syncRTMYamlWithSnapshot } from '../../application/internal/rtm-yaml.js'
import { landApprovedPlan } from '../../application/internal/approved-plan-landing.js'
// REQ-261005105032-3b02 t11（FR-2）：看板移动进需求阶段时幂等落原型骨架（失败只告警不阻断）。
import { landPrototypeSkeleton } from '../../application/internal/prototype-skeleton.js'

export function createRequirementsRouter(ctx: RouterCtx) {
  // B12 阶段④-2-③：本文件的读/写已全部迁到 `ctx.requirementStore` ⇒ 旧口不再需要
  const { taskStore, now, ids, mintId, ok, readBody, badInput, notFound } = ctx

  /** G2 文档集完整性闸门的看板侧调用（REQ-2d1c74 FR-2）。docs 未装配 → fail-closed（"端口没接"不是绕过口）。 */
  async function g2CompletenessFailure(req: RequirementRecord, gateKind: GateFailure['kind']): Promise<GateFailure | undefined> {
    // isLegacy 判定不需要 docs：存量需求（artifacts 空/undefined）一律放行（REQ-2d1c74 FR-6）
    if (req.artifacts === undefined || req.artifacts.length === 0) return undefined
    const docs = ctx.deps.docs
    if (docs === undefined) {
      return { code: 'design_doc_incomplete', kind: gateKind, message: 'design → decomposing 被拦：文档读取端口未装配，无法核验文档集完整性' }
    }
    // REQ-260930193929-897b FR-1：看板侧无会话上下文，根只由需求记录决定——
    // 不校正就会沿用「最后一次会话残留的根」，判定随别的窗口漂移。
    // 看板 ctx.deps 只有 docs（没有 taskStore.repo），故按最小依赖面传参。
    applyRequirementWorkspaceRoot({ docs, taskStore: ctx.taskStore }, req)
    return checkDesignCompletenessGate(docs, req)
  }

  /**
   * 内容门（原型三门 + 裁定门）的看板侧调用（REQ-261005105032-3b02 §10 #46）。
   *
   * 看板侧无会话上下文：读盘根只由需求记录决定（与 g2CompletenessFailure 同款纪律），
   * 裁定留痕探针取既有的 `deps.sessionProbe`（§10 #20：不新增数据源）。
   *
   * `docs` 未装配 → **放行**（判不了就不加仪式）：本门是否适用**只能**从 requirement.md 的
   * front-matter（`sides`）判——没有文档端口时连"这是不是 UI 需求"都无从判定，硬拦等于把
   * 纯后端 / 文档需求一并拦下（与 g2CompletenessFailure 不同：那个门的判据全在记录里，
   * 缺端口才是漏洞）。这一支只会在组合根漏装配时命中（生产装配恒传 docs，见 src/index.ts）。
   */
  async function contentGateFailure(
    req: RequirementRecord,
    from: RequirementRecord['status'],
    to: RequirementRecord['status'],
  ): Promise<GateFailure | undefined> {
    const docs = ctx.deps.docs
    if (docs === undefined) return undefined
    applyRequirementWorkspaceRoot({ docs, taskStore: ctx.taskStore }, req)
    return await contentGatesForMove(docs, req, from, to, {
      ...(ctx.deps.sessionProbe !== undefined ? { sessionProbe: ctx.deps.sessionProbe } : {}),
    })
  }

  /** 解析在线 agent（未装配 / 不在线 / 查询抛错 → undefined，一律视为离线）。 */
  function onlineAgent(windowKey: string | undefined): unknown {
    if (windowKey === undefined || windowKey.length === 0) return undefined
    const agents = ctx.deps.agents?.()
    if (typeof agents?.get !== 'function') return undefined
    try {
      return agents.get(windowKey) ?? undefined
    } catch {
      return undefined
    }
  }

  async function handleReqCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const nowTs = now()
    const actor: ActorRef = { kind: 'human' }
    const record: RequirementRecord = {
      id: await mintId('requirement'),
      title: normalizeTitle(body.title),
      description: normalizeText(body.description, 'description'),
      ...(body.docLinks !== undefined ? { docLinks: body.docLinks as RequirementRecord['docLinks'] } : {}),
      status: INITIAL_REQ_STATUS,
      blocked: false,
      comments: [],
      version: 1,
      createdAt: nowTs,
      updatedAt: nowTs,
      createdBy: actor,
      updatedBy: actor,
    }
    recordStatus(record, INITIAL_REQ_STATUS, nowTs, actor, '创建（看板人工建卡）')
    // B12 阶段④-2-③：创建型改走新端口的 `create`（入参只表达标量），随后把其余字段补写进去。
    // ★ 语义差异（须知）：旧路径是"整册一次原子写"，这里是"create + 一条定点补写"两次写；
    //   两者都在同一请求内完成，失败则抛错（不静默）。
    await ctx.requirementStore.create({
      id: record.id,
      title: record.title,
      description: record.description,
      category: record.category as never,
      status: record.status,
      createdAtFallback: undefined,
    } as never, record.createdBy as never)
    await mutateIfPresent(ctx.requirementStore, record.id, (r) => {
      Object.assign(r, record)
      return { changed: true }
    })
    ok(res, record)
  }

  async function handleReqMove(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const to = asReqStatus(body.to)
    const actor = asActor(body.actor ?? 'human')
    const reason = normalizeText(body.reason, 'reason', 500)
    // REQ-260927121324-abde FR-1：请求体可选 sessionId（看板侧无会话 → 诚实不传快照）
    const sessionId = normalizeText(body.sessionId, 'sessionId', 128) || undefined
    // mutate 前只读两级校验（REQ-2d1c74 FR-2：与 MoveRequirement 同次序——先产物闸门、后 G2 完整性门；
    // 预检让两条门的拒绝次序与会话侧一致，mutate 内的复查保留防并发漂移）。
    const current = (await ctx.requirementStore.get(id))
    if (current !== undefined) {
      const preGate = assertArtifactGates(current, current.status, to)
      if (preGate !== undefined) throw Object.assign(new Error(preGate.message), { code: preGate.code })
      // ── REQ-261005105032-3b02 §10 #46：唯一 async 内容门（位置钉死：preGate 之后、
      // g2CompletenessFailure 之前；G2 **不合并**）。
      // 与 g2CompletenessFailure 同款：async 门只能在 mutate 之外做**读前预检**（mutate 回调是
      // 同步契约），故这段是这条路径的 ②；同步的 assertArtifactGates 在 mutate 内仍原样复查
      // （那半条防并发漂移的锁没有丢，见 mutate 回调里的注释）。
      const contentGate = await contentGateFailure(current, current.status, to)
      if (contentGate !== undefined) throw Object.assign(new Error(contentGate.message), { code: contentGate.code })
      const g2 = gateForTransition(current.status, to)
      if (g2?.id === 'G2' && g2.requiredKind !== undefined) {
        const failure = await g2CompletenessFailure(current, g2.requiredKind)
        if (failure !== undefined) throw Object.assign(new Error(failure.message), { code: failure.code })
      }
    }
    // ── 回退分支（REQ-261003204149-1e80 FR-5 单点）：与 reqboard_move **共用同一编排** ──
    // 与工具侧同款顺序：先在副本上算（抛错时零副作用），再「任务先写、需求后写」。
    const at = now()
    const rbActor = { kind: actor, ...(sessionId !== undefined ? { sessionId } : {}) }
    const rollbackReason = reason.length > 0 ? reason : '（未填理由）'
    let rollbackPre: ReturnType<typeof applyRequirementRollback> | undefined
    let rollbackTasks: Awaited<ReturnType<typeof taskStore.listByRequirement>> = []
    let rbMinted: string[] = []
    let rbCursor = 0
    const rbIds = { task: () => rbMinted[rbCursor++] ?? 't-unminted', comment: () => ids.comment() }
    if (current !== undefined && isRollback(current.status, to)) {
      rollbackTasks = await taskStore.listByRequirement(id)
      // 看板侧的 id 铸造是**异步**的（要避让台账），故先铸好一批再交给同步的编排口。
      const liveCount = rollbackTasks.filter(t => t.status !== 'canceled').length
      rbMinted = []
      for (let i = 0; i < liveCount; i++) rbMinted.push(await mintId('task'))
      rollbackPre = applyRequirementRollback(
        structuredClone(current), rollbackTasks, current.status, to, at, rbActor, rbIds, rollbackReason,
      )
      if (rollbackPre.taskPlan.reworkDrafts.length > 0) {
        await taskStore.createMany(id, rollbackPre.taskPlan.reworkDrafts)
      }
      if (rollbackPre.taskPlan.canceled.length > 0 || rollbackPre.taskPlan.resetTasks.length > 0) {
        // REQ-261004121649-bfa7 FR-1：父卡取消 + 子卡原地复位，一次写入（两类都是整卡副本）
        const canceledById = new Map(
          [...rollbackPre.taskPlan.canceled, ...rollbackPre.taskPlan.resetTasks].map(t => [t.id, t]),
        )
        await taskStore.mutate(id, (queueTasks) => {
          let touched = false
          for (const qt of queueTasks) {
            const c = canceledById.get(qt.id)
            if (c === undefined) continue
            qt.status = c.status
            qt.revisions = c.revisions
            qt.updatedAt = c.updatedAt
            // 取消留痕（REQ-261005193546-1b1a FR-3）：与工具侧落点同款——计划副本上的三字段
            // 逐键搬过来，否则看板回退路径「plan 写了、落盘丢了」。逐键判 `!== undefined`：
            // 本 map 含子卡原地复位副本，复位不清空留痕（INV-D2）。
            if (c.canceledAt !== undefined) qt.canceledAt = c.canceledAt
            if (c.canceledBy !== undefined) qt.canceledBy = c.canceledBy
            if (c.cancelReason !== undefined) qt.cancelReason = c.cancelReason
            touched = true
          }
          return touched ? queueTasks : undefined
        })
      }
    }
    const result = await mutateIfPresent(ctx.requirementStore, id, (req) => {
      assertReqTransition(req.status, to, actor)
      // 回退：对**真 req** 重放编排的撤销半边（卡计划已在上面落库；此处重算幂等、结果丢弃）
      if (rollbackPre !== undefined && current !== undefined) {
        applyRequirementRollback(req, rollbackTasks, current.status, to, at, rbActor, rbIds, rollbackReason)
        // 记本次物化的卡 id（FR-4）：与工具侧同款口径，批量清理入口靠它划边界。
        recordRollbackMaterialized(req, at, rollbackPre.taskPlan.reworkDrafts.map((t) => t.id))
      }
      // ── 分类感知产物闸门（REQ-31e11f t4）：assertReqTransition 之后、写盘之前 ──
      const gate = assertArtifactGates(req, req.status, to)
      if (gate !== undefined) {
        throw Object.assign(new Error(gate.message), { code: gate.code })
      }

      // REQ-260927121324-abde FR-1：五连写收敛到唯一迁移助手（结算离开节点 + 迁移 + 事件带快照）。
      // 会话码优先级：请求体可选 sessionId → 需求的 sourceSessionId；都没有 → 诚实不传（不伪造）。
      const sid = sessionId ?? req.sourceSessionId
      const snap = sid !== undefined ? ctx.deps.tokenSnapshot?.(sid) : undefined
      transitionRequirement(req, to, {
        at: now(),
        actor: { kind: actor, ...(sid !== undefined ? { sessionId: sid } : {}) },
        reason,
        ...(snap !== undefined ? { snap } : {}),
      })
      // ③ 注入与断点重算（FR-6）：与工具侧同款单点函数，同样在状态转移之后
      // FR-9：看板路径的回退归因 = human（人按的，不许记成 system）
      if (rollbackPre !== undefined) resetInjectionAfterRollback(req, at, { kind: actor, ...(sid !== undefined ? { sessionId: sid } : {}) })
      if (reason) {
        // REQ-261004065652-5c1c FR-9（预防半边）：看板把需求推进到终态时同样收回自动意图。
        // 与工具路径共用同一实现（`application/internal/terminal-disarm`），不许各写一份。
        disarmDiveOnTerminal(req, { to, at, commentId: () => ids.comment() })
        req.comments.push({ id: ids.comment(), body: `[状态] ${req.status} ← 转移说明：${reason}`, createdAt: now(), createdBy: { kind: actor } })
      }
      return { changed: true }
    })
    // REQ-261005105032-3b02 t11（FR-2）：看板路径进需求阶段同样幂等落原型骨架（与 reqboard_move
    // 同一姿势：已存在不覆盖、非 UI 不落、失败只告警）——看板是真实入口，漏它 = 默认流程拿不到骨架。
    if (to === 'brainstorming' && result?.requirement !== undefined && ctx.deps.docs !== undefined) {
      await landPrototypeSkeleton(ctx.deps.docs, result.requirement, { nowMs: now() })
    }
    ok(res, {
      ...(result?.requirement ?? {}),
      ...(rollbackPre !== undefined
        ? {
            rollback: {
              artifacts_revoked: rollbackPre.revocation.artifactsRevoked,
              plan_approval_revoked: rollbackPre.revocation.planApprovalRevoked,
              tasks_canceled: rollbackPre.taskPlan.canceled.length,
              tasks_reworked: rollbackPre.taskPlan.reworkDrafts.length,
            },
          }
        : {}),
    })
  }

  async function handleReqUpdate(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const result = await mutateIfPresent(ctx.requirementStore, id, (req) => {
      if (body.title !== undefined) req.title = normalizeTitle(body.title)
      if (body.description !== undefined) req.description = normalizeText(body.description, 'description')
      if (body.docLinks !== undefined) req.docLinks = body.docLinks as RequirementRecord['docLinks']
      if (body.blocked !== undefined) {
        req.blocked = Boolean(body.blocked)
        req.blockedReason = req.blocked ? normalizeText(body.blockedReason, 'blockedReason', 300) : undefined
      }
      if (body.paused !== undefined) req.paused = Boolean(body.paused)
      req.updatedAt = now()
      req.updatedBy = { kind: 'human' }
      return { changed: true }
    })
    ok(res, result?.requirement)
  }

  /**
   * 计划裁决（仅人）：批准 / 退回需求的拆分计划。
   * 这是 plan mode 的唯一人工闸门——批准 = 允许拆分；退回 = 打回重写（附理由）。
   * 除它之外，需求分析→拆分→实施→验收全部由窗口 agent 自行推进（2026-09-11 用户裁定）。
   */
  async function handlePlanDecision(req: IncomingMessage, res: ServerResponse, approve: boolean): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const reason = normalizeText(body.reason, 'reason', 500)
    if (!approve && reason.length === 0) {
      throw Object.assign(new Error('退回计划必须写清理由（reason）'), { code: 'invalid_input' })
    }
    /** 落库结果（FR-1/FR-6）：无论落没落、成没成，都如实回给看板，不静默。 */
    let landing: Record<string, unknown> | undefined
    const result = await mutateIfPresent(ctx.requirementStore, id, (r) => {
      const plan = r.plan ?? notFound("需求 " + id + " 的拆分计划")
      if (approve) {
        // REQ-261006164732-6503 t13（serves: FR-4）：看板批准同样「首写即事实」——
        // 独立复核实测：此处原本无条件赋值，重复点「批准」会把已批准的 approvedAt/证据改写。
        stampPlanOnce(plan, now(), { by: { kind: 'human' }, via: 'board' })
        delete plan.rejectedAt
        delete plan.rejectedReason
      } else {
        plan.rejectedAt = now()
        plan.rejectedReason = reason
        delete plan.approvedAt
        delete plan.approvedBy
      }
      // 仅当确有超容量卡时追加一句（空串 ⇒ 既有评论逐字节不变）。看板批准路径**唯一能被人看见的载体
      // 是这条评论**（响应体形状刻意不加字段），故措辞与弹框共用同一份摘要、容量走同一单点解析（FR-6）。
      const ocap = approve ? overCapacitySummary(plan.tasks, resolveRoundCapacity({ capacity: ctx.deps.applicationDeps?.capacity }).value) : ''
      r.comments.push({
        id: ids.comment(),
        body: approve
          ? '[计划] 已批准（人）：' + plan.tasks.length + ' 个任务（看板批准与弹框批准共用同一落库层）'
            + (ocap === '' ? '' : '；' + ocap + '——详见计划文档标记')
          : '[计划] 已退回（人）：' + reason,
        createdAt: now(),
        createdBy: { kind: 'human' },
      })
      r.updatedAt = now()
      r.updatedBy = { kind: 'human' }
      return { changed: true }
    })
    if (approve) {
      // 「批准即落库」（REQ-261002164800-d8f2 t4 / FR-1）：看板批准与弹框批准必须落出**同样的结果**。
      // 此前这里只盖 approvedAt、注释写「窗口可拆分落库」，而弹框路径同一时刻已自动落库——两条通道
      // 行为不一致，文案却声称等价。现在两条通道共用同一个落库层（取数单点 + FR 覆盖硬门 + 幂等 + 读数）。
      //
      // applicationDeps 缺省（测试/嵌入调用未装配用例依赖）→ 保持既有行为（只落章），并**如实说明**没落库。
      const app = ctx.deps.applicationDeps
      if (app !== undefined) {
        try {
          const landed = await landApprovedPlan(app, {
            requirementId: id,
            windowKey: 'board',
            nowTs: now(),
            source: 'board',
          })
          // 落库成功（或幂等跳过）→ 同一调用内推进到实施（与弹框路径同语义：autoRun 一并置真）
          // REQ-261005122915-9f90 t4 / FR-3：**只有真卡在**才推进。`alreadyLanded` 已收窄为真卡数
          // （占位重做卡不计），故「本次落了卡 或 真卡已在」就是推进的充分且必要条件；
          // 两者皆 0 说明一张新卡都没落（队列里只剩回退占位卡）——此时推进就是把「没落库」说成成功。
          const landingEffective = landed.createdCount > 0 || landed.alreadyLanded > 0
          if (landingEffective) {
            await mutateIfPresent(ctx.requirementStore, id, (r) => {
              if (r.status !== 'decomposing') return undefined
              transitionRequirement(r, 'implementing', {
                at: now(),
                actor: { kind: 'human' },
                reason: '看板批准计划后自动进入实施（与弹框路径共用同一落库层）',
              })
              r.autoRun = true
              r.comments.push({
                id: ids.comment(),
                body: fmt('[自动开跑] 看板批准拆分计划 → 落库 {n} 张卡并自动进入实施（autoRun=true）', { n: landed.createdCount }),
                createdAt: now(),
                createdBy: { kind: 'human' },
              })
              r.updatedAt = now()
              return { changed: true }
            })
          }
          landing = {
            performed: landingEffective,
            landed: landed.createdCount,
            already_landed: landed.alreadyLanded,
            unrefed_cards: landed.unrefed,
            ...(landed.staleReworkCanceled > 0 ? { stale_rework_canceled: landed.staleReworkCanceled } : {}),
            ...(landingEffective
              ? {}
              : {
                  reason: '本次未落任何任务卡（队列里只有回退物化的占位重做卡）：已拒绝推进到实施——'
                    + '请先在需求详情点「清理误物化重做卡」，再重新批准或调 reqboard_decompose 落库',
                }),
            ...(landed.warning === undefined ? {} : { warning: landed.warning }),
          }
        } catch (err) {
          // 门禁拒（如某条 FR 没人接）：计划已批准，但**不推进**、不静默——结果如实回给看板
          const e = err as { message?: string; code?: string }
          landing = {
            performed: false,
            failed: true,
            reason: e.message ?? String(err),
            ...(e.code === undefined ? {} : { code: e.code }),
          }
        }
      } else {
        landing = {
          performed: false,
          reason: 'applicationDeps 缺失（组合根未装配用例依赖）——本次仅落章，请调 reqboard_decompose 落库',
        }
      }
    }
    if (approve) {
      // RTM 触发点 5（REQ-260926140539-457b FR-2）：看板批准计划 → rtm-decomposing.yml + rtm-implementing.yml
      const rtmRoot = ctx.deps.docs?.workspaceRoot() ?? ctx.deps.cwd
      if (rtmRoot !== undefined) {
        // 任务来自队列（REQ-260927202051-f6df：RTM 的 tasksOf 读队列任务，v9 台账已无 tasks）；
        // 本同步放在**落库之后**，serves 才能反映刚落库的卡（此前同步时队列还是空的）。
        const rtmTasks = await taskStore.listByRequirement(id)
        syncRTMYamlWithSnapshot(rtmRoot, ({ requirements: (await ctx.requirementStore.listSummaries({ scope: 'all' }))?.items as never }), rtmTasks, id, 'confirm:plan')
      }
    }
    // 回给看板的必须是**落库/推进之后**的台账态（落库可能改了状态与 autoRun）——
    // 若直接回 mutate 时的旧快照，看板会显示"批准了但状态没动"，那是另一次自我欺骗。
    const after = (await ctx.requirementStore.get(id)) ?? result?.requirement
    ok(res, { ...after, ...(landing === undefined ? {} : { landing }) })
  }

  /**
   * POST /dashboard/api/reqboard/req/artifact/confirm
   * 产物人工确认（REQ-31e11f t4，五道人工确认门）：人在看板一键确认某 kind 的产物。
   * 仅 human actor 可调（参照既有 plan/approve 的 human 判定——路由层 actor 默认 human）。
   * 确认后该门放行：req.artifacts 里该 kind 产物写 confirmedAt=now / confirmedBy={kind:'human'}。
   */
  async function handleArtifactConfirm(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const kind = normalizeText(body.kind, 'kind', 64)
    if (kind.length === 0) badInput('kind 不能为空')
    // REQ-2d1c74 FR-3：确认 kind=design 落章前扫描拆分内容（三通道之一：看板一键）。
    // 存量无可扫对象放行；非存量且 docs 未装配 → fail-closed（与完整性门同口径）。
    if (isDesignArtifactKind(kind)) {
      const target = (await ctx.requirementStore.get(id))
      if (target !== undefined && target.artifacts !== undefined && target.artifacts.length > 0) {
        if (ctx.deps.docs === undefined) {
          throw Object.assign(new Error('确认被拦：文档读取端口未装配，无法扫描设计文档拆分内容'), { code: 'design_contains_decomposition' })
        }
        // REQ-260930193929-897b FR-1：读盘前按需求记录校正根（看板 ctx.deps 只给 docs）
        applyRequirementWorkspaceRoot({ docs: ctx.deps.docs, taskStore: ctx.taskStore }, target)
        const scan = await checkDesignDecompositionGate(ctx.deps.docs, target)
        if (scan !== undefined) throw Object.assign(new Error(scan.message), { code: scan.code })
      }
    }
    const result = await mutateIfPresent(ctx.requirementStore, id, (r) => {
      // REQ-261006164732-6503 t13（serves: FR-4）：看板确认的**首写纪律**——
      // 独立复核实测：这条路径原本无条件赋值，重复点确认会把已落章产物与证据改写（FR-4 点名「看板重试」）。
      // 判据只用首写纪律（不按"迁移是否已发生"拒绝）：本通道同样承担**补章**职责。
      const arts = artifactsToConfirm(r, kind as never)
      if (arts.length === 0) badInput("需求 " + id + " 没有 kind=" + kind + " 的产物（须先由工具登记）")
      let stampedNow = 0
      for (const artifact of arts) {
        // 首写即事实（共用单点）：已盖过的不覆写
        if (stampArtifactOnce(artifact, now(), { by: { kind: 'human' }, via: 'board' })) stampedNow += 1
      }
      // 评论只在真的盖上时才写——否则重复确认会反复留「人已确认」的假记录
      if (stampedNow > 0) {
        r.comments.push({
          id: ids.comment(),
          body: '[产物确认] 人已确认产物（kind=' + kind + (arts.length > 1 ? '，成组确认 ' + arts.length + ' 份' : '') + '）：' + arts.map(a => a.path).join('、'),
          createdAt: now(),
          createdBy: { kind: 'human' },
        })
      }
      r.updatedAt = now()
      r.updatedBy = { kind: 'human' }
      return { changed: true }
    })
    const confirmed = result?.requirement as RequirementRecord
    // RTM 触发点 3（REQ-260926140539-457b FR-2）：看板一键确认产物 → 对应 RTM 落章
    {
      const rtmRoot = ctx.deps.docs?.workspaceRoot() ?? ctx.deps.cwd
      if (rtmRoot !== undefined) {
        // 任务来自队列（同 RTM 触发点 5）
        const rtmTasks = await taskStore.listByRequirement(id)
        syncRTMYamlWithSnapshot(rtmRoot, ({ requirements: (await ctx.requirementStore.listSummaries({ scope: 'all' }))?.items as never }), rtmTasks, id, 'confirm:artifact')
      }
    }

    // ── 确认即推进 + 链侧投递（REQ-e3b6a0 t9 / FR-9）────────────────────────
    // 两者都以「绑定窗口在线」为前提：窗口不在线就只落章，并如实说明——不伪造推进成功。
    const windowKey = confirmed.sourceSessionId
    const agent = onlineAgent(windowKey)
    if (agent === undefined) {
      ok(res, { ...confirmed, advanced: false, delivered: false, note: '窗口不在线，请回会话推进（本次仅落章）' })
      return
    }

    const gate = gateFromStage(confirmed.status)
    let advanced = false
    // 护栏：确认的产物必须**正是该门要求的产物**（gate.requiredKind === kind）。
    // 否则二次确认同一产物会顺着新状态的门再推进一次（B 后再点一次 = 连跳两格）。
    const gateMatches = gate !== undefined && gate.requiredKind === kind
    if (gateMatches && gate.autoAdvance && gate.from !== undefined && canReqTransition(gate.from, gate.to)) {
      // ── REQ-261005105032-3b02 §10 #46：唯一 async 内容门（看板"确认产物即推进"这条路径）──
      // 落章保留（确认动作有效），只拦推进：返回 advanced:false + gate_failure + 可读消息
      // （与另三条路径同款，不静默）。
      const contentGate = await contentGateFailure(confirmed, gate.from, gate.to)
      if (contentGate !== undefined) {
        ok(res, { ...confirmed, advanced: false, delivered: false, gate_failure: contentGate, note: '已落章，但 ' + gate.from + ' → ' + gate.to + ' 未推进：' + contentGate.message })
        return
      }
      // REQ-2d1c74 FR-2：看板确认后自动推进同样先过 G2 完整性闸门（四路径之一；落章保留，推进可拦）。
      const g2Failure = gate.id === 'G2' && gate.requiredKind !== undefined
        ? await g2CompletenessFailure((await ctx.requirementStore.get(id)) ?? confirmed, gate.requiredKind)
        : undefined
      if (g2Failure !== undefined) {
        ok(res, { ...confirmed, advanced: false, delivered: false, gate_failure: g2Failure, note: '已落章，但 design → decomposing 未推进：' + g2Failure.message })
        return
      }
      // REQ-260927121324-abde FR-2：确认即推进带写时快照，actor 带会话 id（窗口码 = sourceSessionId）
      const confirmSnap = windowKey !== undefined && windowKey.length > 0 ? ctx.deps.tokenSnapshot?.(windowKey) : undefined
      await mutateIfPresent(ctx.requirementStore, id, (r) => {
        if (r.status !== gate.from) return undefined // 并发下已推进过 → 幂等，不重复推进
        transitionRequirement(r, gate.to, {
          at: now(),
          actor: { kind: 'human', ...(windowKey !== undefined ? { sessionId: windowKey } : {}) },
          reason: fmt('看板确认即推进（{from} → {to}）', { from: gate.from, to: gate.to }),
          ...(confirmSnap !== undefined ? { snap: confirmSnap } : {}),
        })
        r.comments.push({
          id: ids.comment(),
          body: fmt('[自动推进] {from} → {to}：看板一键确认产物（kind={kind}）', { from: gate.from, to: gate.to, kind }),
          createdAt: now(),
          createdBy: { kind: 'human' },
        })
        return { changed: true }
      })
      advanced = true
    }

    let delivered = false
    let note: string | undefined
    const chain = ctx.deps.gateChain
    if (chain === undefined) {
      note = '闸门后置链未装配：本次仅落章与推进，未触发压缩/注入/唤醒'
    } else if (!gateMatches || windowKey === undefined) {
      note = fmt('当前状态 {s} 与已确认产物 kind={kind} 不构成闸门，未触发后置链', { s: confirmed.status, kind })
    } else {
      chain.enqueue({
        windowKey,
        gate: gate.id,
        ...(gate.from === undefined ? {} : { from: gate.from }),
        to: gate.to,
        requirementId: id,
        verdict: 'affirmative',
        answers: [{ id: 'board-confirm', selected: [fmt('确认 {kind}', { kind })] }],
        decidedAt: now(),
      })
      const run = await chain.runPending(windowKey, (agent as { session?: unknown }).session)
      delivered = run.ran
      note = delivered ? undefined : '链路未执行（无待处理闸门或幂等命中）'
    }

    const final = (await ctx.requirementStore.get(id)) ?? confirmed
    ok(res, { ...final, advanced, delivered, ...(note === undefined ? {} : { note }) })
  }

  async function handleComment(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const target = normalizeText(body.target, 'target', 16)
    const id = normalizeText(body.id, 'id', 64)
    const actor = asActor(body.actor ?? 'human')
    const comment: CommentRecord = {
      id: ids.comment(),
      body: normalizeText(body.body, 'body', 2000),
      createdAt: now(),
      createdBy: { kind: actor },
    }
    if (comment.body.length === 0) throw Object.assign(new Error('评论不能为空'), { code: 'invalid_input' })
    // 任务评论写**队列**（REQ-260927202051-f6df：任务不在台账、LedgerChange.tasks 已移除）。
    if (target === 'task') {
      const existing = await taskStore.get(id)
      if (existing === undefined) return notFound(`任务 ${id}`)
      const changed = await taskStore.mutate(existing.requirementId, (tasks) => {
        const t = tasks.find(x => x.id === id)
        if (t === undefined) return undefined
        t.comments.push(comment)
        t.updatedAt = now()
        return tasks
      })
      ok(res, { comment, target: changed[0]?.id ?? existing.id })
      return
    }
    if (target !== 'req') throw Object.assign(new Error('target 必须是 req/task'), { code: 'invalid_input' })
    const result = await mutateIfPresent(ctx.requirementStore, id, (req) => {
      req.comments.push(comment)
      req.updatedAt = now()
      return { changed: true }
    })
    ok(res, { comment, target: result?.requirement?.id })
  }

  /**
   * POST /dashboard/api/reqboard/req/autorun
   * 自动链控制面（REQ-4842fe FR-12 / t-3be71b，仅人）：暂停 / 继续某需求的自动链。
   * 继续 = 置 autoRun=true **并立即触发一次推进事件**；推进器未装配或触发失败时**如实说明**，
   * 不把"只置了开关"伪装成"已续跑"（失败要响亮）。
   */
  async function handleAutoRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const on = body.on === true
    const reason = normalizeText(body.reason, 'reason', 300)
    const result = await mutateIfPresent(ctx.requirementStore, id, (r) => {
      r.autoRun = on
      const adv = (r.advance ??= {})
      if (on) {
        adv.pausedReason = undefined
        adv.noopStreak = 0
        adv.failureStreak = 0
      } else {
        adv.pausedReason = 'manual'
      }
      r.comments.push({
        id: ids.comment(),
        body: fmt('[自动链] 人已{verb}（autoRun={state}）{why}', {
          verb: on ? '继续' : '暂停', state: String(on), why: reason.length > 0 ? '：' + reason : '',
        }),
        createdAt: now(),
        createdBy: { kind: 'human' },
      })
      r.updatedAt = now()
      r.updatedBy = { kind: 'human' }
      return { changed: true }
    })
    const updated = result?.requirement as RequirementRecord

    let advanceNote: string | undefined
    let rearmed = false
    if (on) {
      // REQ-261001201200-8f8b FR-4：看板「继续」也是恢复入口——人显式表达「我要它继续」时，顺手把
      // 误停摆（disarmed+active）的需求重新武装；否则仅置 autoRun 对 disarmed 需求毫无作用
      // （drive() 首行 isDrivableRequirement 不成立就直接 return）。恢复失败不阻断既有「继续」语义。
      // REQ-261002173819-69c7 FR-3：改用 **armExplicit**——看板「继续」是人显式动作，必须也能救
      // `disarmed+idle`（人自己按过 clear_pause 的形态，自动路径按纪律永不改写它）。这是唯一入口。
      // REQ-261002141430-a5ef FR-4①：弹框仍在途时**不越权**清停手位（否则"框还在屏幕上、链已跑"）。
      // 看板侧的在途表在 applicationDeps.dialogs 上（与 ticket 表同实例）；未装配则退回既有行为。
      const boardDialogs = ctx.deps.applicationDeps?.dialogs
      const boardDialogInFlight = boardDialogs === undefined
        ? {}
        : { dialogInFlight: (reqId: string): boolean => boardDialogs.inFlightFor(reqId) }
      // B12 阶段②c：`RearmDeps.store` 必填（写已迁新端口）。未装配时**不解除等待**并如实
      // 报 false——绝不假装"已解除"（失败要响亮）；生产侧 routes.ts 已传必填的新端口。
      const rearmStore = ctx.requirementStore
      try {
        rearmed = rearmStore === undefined
          ? false
          : await armExplicit({  store: rearmStore, now, ...boardDialogInFlight }, id, 'board-resume')
      } catch { rearmed = false }
      if (boardDialogs?.inFlightFor(id) === true) {
        // 如实说明为什么点了「继续」链没动——不说就等于让人以为是 bug（失败要响亮）
        advanceNote = '该需求仍在等待人工确认（弹框在途）：请先在弹框作答或取消，本次未解除等待'
      } else if (ctx.deps.advance === undefined) {
        advanceNote = '推进器未装配：已置 autoRun=true，请回会话触发一次推进事件'
      } else {
        try {
          const out = await ctx.deps.advance(id)
          advanceNote = fmt('已触发一次推进：{steps} 步，停止于 {stop}', { steps: String(out.steps), stop: out.stopped })
        } catch (err) {
          advanceNote = '触发推进失败（开关已置）：' + (err instanceof Error ? err.message : String(err))
        }
      }
    }
    // 恢复留痕并进既有 note 通道（**不新增返回键**，保持响应形状不变）。
    // REQ-261002173819-69c7 FR-3：文案取"人显式要继续"——看板这条通道救回的可能是"人按过 clear_pause"
    // 的手动模式需求，写"检测到误停摆"会误导复盘。
    if (rearmed) advanceNote = '已重新武装（人显式要继续，Dive 将在一分钟内接上）；' + (advanceNote ?? '已置 autoRun=true')
    const final = (await ctx.requirementStore.get(id)) ?? updated
    ok(res, { ...final, ...(advanceNote === undefined ? {} : { advanceNote }) })
  }

  /**
   * POST /dashboard/api/reqboard/req/decompose
   * 看板「拆分」入口（2026-09-26 恢复）：把**已批准**的拆分计划落库为任务卡 DAG。
   * 背景：批准计划时的门合并自动拆分依赖 `deps.jobs`（JobsPort 未装配）→ 需求被推进到
   * implementing 但 0 任务卡；工具面也不再暴露 reqboard_decompose。本入口是恢复通道。
   * 前置：需求已绑定窗口且窗口在线（拆分 = 该窗口在继续推进其需求，走 live driver 认证）。
   */
  async function handleReqDecompose(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const target = (await ctx.requirementStore.get(id)) ?? notFound('需求 ' + id)
    const app = ctx.deps.applicationDeps
    if (app === undefined) {
      throw Object.assign(new Error('拆分入口未装配：applicationDeps 缺失（组合根未传用例依赖）'), { code: 'invalid_input' })
    }
    const windowKey = target.sourceSessionId
    const agent = onlineAgent(windowKey)
    if (agent === undefined) {
      throw Object.assign(
        new Error('拆分被拒：绑定窗口 ' + (windowKey ?? '(无)') + ' 不在线——拆分需要 live driver，请回会话触发'),
        { code: 'invalid_input' },
      )
    }
    // 看板触发没有"当前发起回合"（currentInitiator 为空），故只保留窗口身份解析，
    // 豁免 live-driver 的回合校验——"窗口在线"的判据已由上面的 onlineAgent 保证。
    // 工具路径（窗口 agent 在回合内调用）仍走完整校验；本豁免只作用于看板恢复入口。
    const probe = app.session as unknown as {
      windowKey: (exec: unknown) => string
      requireLiveDriver: (exec: unknown) => void
    }
    const boardDeps = {
      ...app,
      session: {
        ...(app.session as object),
        windowKey: (exec: unknown) => probe.windowKey(exec),
        requireLiveDriver: () => undefined,
      },
    } as unknown as typeof app
    const result = await executeDecompose(boardDeps, { requirement_id: id }, { agent }) as Record<string, unknown>
    ok(res, result)
  }

  /**
   * POST /dashboard/api/reqboard/req/archive-amend
   * 看板「补录归档清单」入口（REQ-261004183621-de3f FR-4）：与工具 `reqboard_archive_amend`
   * **共用同一用例**（`amendArchiveManifest`），只追加清单条目 + 留痕，不改产物与状态。
   *
   * 与拆分入口同纪律：窗口身份取自需求绑定，但豁免 live-driver 的回合校验
   * （人在看板上点按钮时没有"当前发起回合"）；"窗口不在线"不阻断补录——
   * 补录是**事后整理**，不该要求原窗口还开着（与拆分不同：拆分是继续推进）。
   */
  async function handleArchiveAmend(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const target = (await ctx.requirementStore.get(id)) ?? notFound('需求 ' + id)
    const app = ctx.deps.applicationDeps
    if (app === undefined) {
      throw Object.assign(new Error('补录入口未装配：applicationDeps 缺失（组合根未传用例依赖）'), { code: 'invalid_input' })
    }
    const boardDeps = {
      ...app,
      session: {
        ...(app.session as object),
        requireLiveDriver: () => undefined,
      },
    } as unknown as typeof app
    const result = await amendArchiveManifest(
      boardDeps,
      { requirement_id: id, docs: body.docs, reason: body.reason },
      { agent: { id: target.sourceSessionId } },
    ) as unknown as Record<string, unknown>
    ok(res, result)
  }

  /**
   * POST /dashboard/api/reqboard/req/rebind
   * 看板「改绑到本窗口」入口（REQ-261003222428-3556 FR-6 / N-2，**仅人发起**）。
   *
   * 背景：N-2 实测需求的窗口绑定曾被仓外脚本静默改写、台账零留痕。自本入口起，
   * 仓内改写一律经 applyRebind 留痕（actor/at/from/to 进评论）。本入口刻意**不注册任何
   * agent 工具**——agent 面没有可调用的改绑工具（代码级拒绝 = 工具面不存在）；
   * 与 armExplicit 同纪律：能力只开在看板 HTTP 通道（人点按钮）。
   */
  async function handleReqRebind(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const toWindow = normalizeText(body.windowKey, 'windowKey', 128)
    if (toWindow.length === 0) {
      throw Object.assign(new Error('改绑被拒：windowKey 必填（改绑到哪个窗口）'), { code: 'invalid_input' })
    }
    const target = (await ctx.requirementStore.get(id)) ?? notFound('需求 ' + id)
    // 目标窗口必须在线（改绑到死窗口 = 制造下一个 N-1）
    const agent = onlineAgent(toWindow)
    if (agent === undefined) {
      throw Object.assign(
        new Error('改绑被拒：目标窗口 ' + toWindow + ' 不在线（无活 agent）——请先打开该会话再改绑'),
        { code: 'invalid_input' },
      )
    }
    const reason = normalizeText(body.reason, 'reason', 300)
    // REQ-261005141830-7a3b t6（FR-11）：**跨项目不得改绑**——把别项目的窗口改成本项目需求的 owner，
    // 与跨项目派席是同一个危险（那个窗口随后就能替本项目写盘）。校验在任何写入之前 ⇒ 被拒时台账零改动。
    // 未装配 applicationDeps（老装配）→ 不校验，行为与改造前逐字一致（FR-8）。
    const appDeps = ctx.deps.applicationDeps
    if (appDeps !== undefined) requireSameProject(appDeps, target, toWindow, '改绑')
    const result = await mutateIfPresent(ctx.requirementStore, id, (r) => {
      const changed = applyRebind(r, {
        toWindow,
        actor: { kind: 'human' },
        at: now(),
        commentId: () => ids.comment(),
        ...(reason.length > 0 ? { reason } : {}),
      })
      return changed ? { changed: true } : undefined
    })
    const final = (await ctx.requirementStore.get(id)) ?? target
    const rebound = result?.changed === true
    ok(res, {
      id,
      rebound,
      from: target.sourceSessionId ?? null,
      to: final.sourceSessionId ?? null,
      ...(rebound ? {} : { note: '目标窗口与当前绑定相同，未做变更（幂等）' }),
    })
  }

  /**
   * POST /dashboard/api/reqboard/req/rollback-cleanup
   * 误物化批量清场入口（REQ-261004121649-bfa7 t3/t6 · FR-4）——**仅人**。
   *
   * 背景：一次回退会为每张顶层父卡物化一张重做卡。范围选错、或上次没清就再退一次时，
   * 现状只能逐张去队列点取消（实测一次要清 53 张）。本入口按**该次回退物化的卡清单**一次清掉。
   *
   * 「仅人」怎么落地（人工裁定 2026-10-04，与 `handleReqRebind` 同款）：
   * 本入口**刻意不注册任何 agent 工具**——agent 面没有可调用的清场工具，**代码级拒绝 = 工具面不存在**。
   * 设计文档 §三 曾写「agent 调用返回 REQBOARD_HUMAN_GATE」，但那做不到也测不出：HTTP 调用方
   * 的身份（人点的按钮 vs agent 发的 fetch）在服务端无法辨别，靠 body 自称等于把门锁在标签上。
   * 故本入口不新增 agent 可调用面，与改绑入口共用同一条既证有效的纪律。
   *
   * 落库顺序：**先任务后需求**（与回退同款 I-11）——任务写失败时需求未动（干净）。
   */
  async function handleRollbackCleanup(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const seqRaw = body.rollbackSeq
    // 序号必填且必须是正整数：缺省就"猜一个"会把清理打到别人的批次上（宁可拒绝）。
    if (!(typeof seqRaw === 'number' && Number.isInteger(seqRaw) && seqRaw > 0)) {
      throw Object.assign(new Error('清场被拒：rollbackSeq 必填且必须是正整数（第几次回退）'), { code: 'invalid_input' })
    }
    const reason = normalizeText(body.reason, 'reason', 300)
    // 编排与落库在用例里（唯一实现处）；本处只做协议转换。
    const result = await executeRollbackCleanup(
      {
        requirementStore: ctx.requirementStore,
        taskStore,
        now,
        newCommentId: () => ids.comment(),
      },
      { id, rollbackSeq: seqRaw, ...(reason.length > 0 ? { reason } : {}) },
    )
    ok(res, result)
  }

  return { handleReqCreate, handleReqMove, handleReqUpdate, handlePlanDecision, handleArtifactConfirm, handleComment, handleAutoRun, handleReqDecompose, handleArchiveAmend, handleReqRebind, handleRollbackCleanup }
}