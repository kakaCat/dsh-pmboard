/**
 * MoveRequirement 用例（REQ-260927100007-b8ba FR-7 + FR-3）——agent 侧需求阶段推进。
 *
 * 语义与看板移动 HTTP 路由逐条对齐（先产物闸门、后状态机；预检 + mutate 内复查防并发），
 * 额外加 FR-3 的任务完整性守卫。**五道人工门 agent 一律不可越过**——由 assertReqTransition
 * 在收敛点（transitionRequirement）内抛 human_gate，本用例不做任何绕过。
 *
 * @module dsh-pmboard/application/use-cases/MoveRequirement
 */
import type { UseCaseDeps } from '../ports.js'
import { canWrite, firstWritableBound, seatOfSummary } from '../../application/internal/window.js'
import { boundSummariesOf } from '../internal/binding-read.js'
import { asReqStatus, normalizeText, type TaskRecord } from '../../shared/protocol.js'
import { assertArtifactGates } from '../internal/artifact-gates.js'
import { taskCompletenessGap } from '../internal/task-completeness.js'
// 回退方向判定（FR-1）与回退编排单点（FR-3/FR-4/FR-5）：两侧入口共用同一处实现。
import { isRollback } from '../../domain/requirement/RollbackSpec.js'
import { applyRequirementRollback, recordRollbackMaterialized, resetInjectionAfterRollback } from '../internal/rollback.js'
// REQ-261008011118-defe BUG-3（DD-3）：回退两段写的**队列补偿单点**（留档 / 归还 / 失败响亮）。
import {
  compensateRollbackQueue as compensateQueue,
  raiseRollbackCompensationFailed as raiseCompensationFailedAt,
  rememberRollbackPreImage,
  type CompensationOutcome,
} from '../internal/rollback-compensation.js'
import { captureSnapshot, transitionRequirement } from '../internal/token-usage.js'
import {
  reject, agentIdFromExec, requireLiveDriver, mapAgentError, gateQuestionCard,
  // REQ-261005105032-3b02：内容门读盘前按需求工作区校正根（与既有读盘门同款纪律）
  applyRequirementWorkspaceRoot,
} from '../internal/support.js'
import { fmt } from '../../domain/text/fmt.js'
// REQ-261007100513-6749 t3（FR-2/FR-3）：易变段尾部投递的**写路径生产者**（即发即忘、永不抛）。
import { notifyVolatileQuietly } from '../internal/notice-delivery.js'
// REQ-2d1c74 FR-2：design→decomposing 的 G2 文档集完整性闸门（与看板侧 / 弹框侧同一道）。
import { gateForTransition } from '../../domain/gate/GateCatalog.js'
import { checkDesignCompletenessGate, contentGatesForMove } from '../internal/content-gate-wiring.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent, mutateQueue, createManyQueue } from './queue-access.js'
// REQ-261004065652-5c1c FR-9：走进终态即收回自动意图（预防半边，两条入口共用一份实现）。
import { disarmDiveOnTerminal } from '../internal/terminal-disarm.js'
// REQ-261005105032-3b02 t11（FR-2）：进入需求阶段即幂等落原型骨架（UI 需求才有；失败只告警不阻断）。
import { landPrototypeSkeleton } from '../internal/prototype-skeleton.js'

/**
 * 产物闸门的**内部码 → 工具传输码**映射（单一事实源）。
 *
 * 为什么需要它：`assertArtifactGates` 返回的是内部码（`artifact_not_confirmed` /
 * `missing_artifact`），而 agent 工具面对外承诺的是 `REQBOARD_*` 码——两条 e2e 契约
 * （e2e-design-handoff / design-gate-messages）按后者断言。集中一处映射，避免再次各写各的。
 *
 * REQ-261005105032-3b02 §10 #35：由"不是 X 就一律当缺产物"的隐式推导改为**显式映射表**。
 * 为什么必须改：本需求一次加五个新门（原型三门 + 裁定门），隐式推导会把它们**静默降级**成
 * `REQBOARD_MISSING_ARTIFACT`——而"补原型 / 写裁定"与"登记产物"是三条不同的补救动作，
 * agent 按码分支就会去补错东西（这正是 §10 #35 点名不许发生的事）。
 * 未知内部码**原样透传**：不认识就如实说，不猜一个"看起来合理"的码。
 */
const TRANSPORT_CODE_BY_INTERNAL: Readonly<Record<string, string>> = {
  // 改造前就在此函数里的两条：逐字保住，两条既有 e2e 契约按它们断言（零行为变化）
  missing_artifact: 'REQBOARD_MISSING_ARTIFACT',
  artifact_not_confirmed: 'REQBOARD_ARTIFACT_NOT_CONFIRMED',
  // 原型三门（§10 #35）
  prototype_missing: 'REQBOARD_MISSING_PROTOTYPE',
  prototype_version_conflict: 'REQBOARD_PROTOTYPE_VERSION_CONFLICT',
  prototype_anchor_missing: 'REQBOARD_PROTOTYPE_ANCHOR_MISSING',
  // REQ-261006201649-cc89：**同一道门（锚点门）**的两个新问，成对登记——
  // 只登内部码会让会话侧路径走"未知内部码原样透传"，人看到的是英文码而不是可读类别；
  // 只登传输码则看板侧继续落 500。两侧各报各的码，缺一侧就是半条链。
  prototype_placeholder: 'REQBOARD_PROTOTYPE_PLACEHOLDER',
  prototype_geometry_unverified: 'REQBOARD_PROTOTYPE_GEOMETRY_UNVERIFIED',
  // 裁定门（§10 #35）
  decision_log_missing: 'REQBOARD_DECISION_LOG_MISSING',
  decision_entry_invalid: 'REQBOARD_DECISION_ENTRY_INVALID',
  // 验收缺对照项 / 阶段门逾期（§10 #38/#39）：门的实现与触发点在 SubmitVerification /
  // StageGateTimeline，但传输码契约同在一张总表（interfaces.md 错误码总表）——一并登记，
  // 免得将来接线时又被隐式推导降级成缺产物。
  verification_prototype_compare_missing: 'REQBOARD_VERIFICATION_INCOMPLETE',
  stage_gate_overdue: 'REQBOARD_STAGE_GATE_OVERDUE',
  // 粒度门禁（REQ-261007125552-32cb FR-2 / FR-4）：与原型门同款理由——两侧各报各的码，
  // 缺一侧就是半条链（会话侧透传内部码、看板侧落 500）。
  plan_interface_map_missing: 'REQBOARD_PLAN_INTERFACE_MAP_MISSING',
  plan_component_map_missing: 'REQBOARD_PLAN_COMPONENT_MAP_MISSING',
  plan_card_multi_interface: 'REQBOARD_PLAN_CARD_MULTI_INTERFACE',
}

/**
 * 内部码 → 传输码。导出仅为**用例可直接锁这张表**：
 * 门禁函数在别的卡实现，接线前没有真实触发点能覆盖这些码。
 */
export function transportCodeOf(internalCode: string): string {
  return TRANSPORT_CODE_BY_INTERNAL[internalCode] ?? internalCode
}

export async function executeMoveRequirement(deps: UseCaseDeps, args: unknown, exec: unknown): Promise<unknown> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as { requirement_id?: unknown; to?: unknown; reason?: unknown }
  const explicitId = normalizeText(a.requirement_id, 'requirement_id', 64)
  const to = asReqStatus(a.to)
  const reason = normalizeText(a.reason, 'reason', 500)

  // t8/B11：绑定读走新端口（只读摘要）
  const bound = await boundSummariesOf(requirementStoreOf(deps), windowKey)
  if (bound.length === 0) reject('reqboard_move 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  const picked = explicitId.length > 0 ? bound.find(r => r.id === explicitId) : firstWritableBound(bound, windowKey)
  if (picked === undefined) {
    reject(fmt('reqboard_move 未执行：需求 {id} 不是本窗口绑定的进行中需求', { id: explicitId }), 'REQBOARD_NOT_BOUND_TO_WINDOW')
  }
  // FR-3（REQ-261003215944-9e04）：推进阶段是 **owner-only** 动作。
  // worker 可以领卡干活、可以汇报，但推阶段/把关仍然只有 owner 能做——这条以前靠"一个窗口一条需求"隐含保证，
  // 席位模型下必须显式问一句"我在这条上是什么角色"。
  {
    const verdict = canWrite(seatOfSummary(picked, windowKey), 'move-requirement')
    if (!verdict.ok) {
      reject(
        fmt('reqboard_move 未执行：本席位无权推进需求阶段（只有 owner 能推，当前角色不是 owner）。{why}', { why: verdict.code }),
        verdict.code,
      )
    }
  }
  // 判据过了才取**整条**（下游断言产物闸门/完整性都要整条）；get() 可空 ⇒ 显式守卫
  const req0 = await requirementStoreOf(deps).get(picked.id)
  if (req0 === undefined) {
    reject(fmt('reqboard_move 未执行：需求 {id} 不在台账中', { id: picked.id }), 'REQBOARD_REQUIREMENT_NOT_FOUND')
  }
  const from = req0.status

  // 任务已迁出台账（v9）：完整性判据的任务集从 TaskStore 取一次，预检与 mutate 内复查共用同一份
  // 快照（mutate 回调是同步契约，不能在回调里 await；并发漂移由需求侧 from 复查兜底）。
  const store = taskStoreOf(deps)
  const reqTasks = await store.listByRequirement(req0.id)

  // 只读预检（拒绝次序与会话侧一致：先产物闸门，后 G2 完整性门，最后任务完整性）
  const preGate = assertArtifactGates(req0, from, to)
  if (preGate !== undefined) {
    // REQ-2d1c74 FR-2：**工具侧错误码带 REQBOARD_ 前缀**（e2e-design-handoff / design-gate-messages
    // 两条契约如此断言）。09-29 快照同步把这段映射弄丢过，直接透传 gate.code 会让 agent 拿到
    // `artifact_not_confirmed` 这类内部码、按码分支的调用方与用例全断——故集中一处映射。
    const hint = preGate.code === 'artifact_not_confirmed'
      ? '；首选调 reqboard_ask_confirm 弹框请人确认（自动落章+推进），兜底用户看板一键确认'
        + gateQuestionCard(preGate.kind, from, to)
      : ''
    reject(
      fmt('reqboard_move 未执行：{msg}{hint}', { msg: preGate.message, hint }),
      transportCodeOf(preGate.code),
    )
  }
  // ── REQ-261005105032-3b02 §10 #46：唯一 async 内容门（原型三门 + 裁定门）──────────
  // 位置照 interfaces.md 的四路径调用顺序钉死：① 同步 assertArtifactGates → ② 本调用 →
  // ③ 既有 G2 完整性门（**不合并**：合并会把本需求扩成重构，#46 明令另立项）。
  // 读盘前按需求工作区校正根（REQ-260930193929-897b 同款纪律）：不校正就会去别的窗口的根下
  // 找 requirement.md，后果是**误拦**（说文档不存在）或**静默放行**（读不到前端声明）——两个方向都坏。
  // 探针用既有的 `deps.session`（§10 #20：不新增数据源），它只影响裁定门的真空态豁免那一步。
  {
    applyRequirementWorkspaceRoot(deps, req0)
    const contentGate = await contentGatesForMove(deps.docs, req0, from, to, {
      ...(deps.session !== undefined ? { sessionProbe: deps.session } : {}),
    })
    if (contentGate !== undefined) {
      reject(fmt('reqboard_move 未执行：{msg}', { msg: contentGate.message }), transportCodeOf(contentGate.code))
    }
  }
  // ── REQ-2d1c74 FR-2：G2 文档集完整性闸门（design→decomposing 四条转移路径之一）──
  // 09-29 快照同步把本段从本用例弄丢（tests/design-completeness-gate.test.ts「路径①」于是长期红）：
  // 后果是**会话 reqboard_move 能绕过文档集核验**——REQ-261004222448-292a 就是走这条路径过的
  // （声明了 frontend 却零前端设计、原型无处落地）。看板侧与弹框侧一直有这道门，此处补齐同一道。
  // 注意：doc 读取是 async，而 mutate 回调是同步契约 ⇒ 只能做**读前预检**，并发漂移窗口
  // 与看板侧 preGate 同量级（提交文档是低频人工动作）。
  if (gateForTransition(from, to)?.id === 'G2') {
    const completeness = await checkDesignCompletenessGate(deps.docs, req0)
    if (completeness !== undefined) {
      reject(fmt('reqboard_move 未执行：{msg}', { msg: completeness.message }), completeness.code)
    }
  }
  const preGap = taskCompletenessGap(req0, reqTasks, to)
  if (preGap !== undefined) reject(fmt('reqboard_move 未执行：{msg}', { msg: preGap }), 'REQBOARD_TASK_INCOMPLETE')

  const actor = { kind: 'agent' as const, sessionId: windowKey }
  const at = deps.clock.now()
  const rollbackReason = reason.length > 0 ? reason : '（未填理由）'
  const rollbackIds = { task: () => deps.ids.task(), comment: () => deps.ids.comment() }

  // ── 回退分支（REQ-261003204149-1e80 FR-1/FR-3/FR-4）──────────────────────
  // 先在**副本**上把编排算出来：编排「先算卡计划、后改需求」，抛错时真 req 一个字段未动。
  // 顺序纪律与既有 I-11 同款：**任务先写、需求后写**（队列与需求台账是两个存储）。
  //
  // REQ-261008011118-defe BUG-3（DD-3，2026-10-08）——I-11 顺序**不动**（任务先写是对的：
  // 任务写失败 ⇒ 需求未动，干净）；缺的是「第二段失败时对第一段的归还」。故此处采集
  // **补偿两件套**：① 本轮物化的重做卡 id（撤销用）；② 队列写面卡的本前快照 preImage
  // （在覆写之前逐卡留档）——需求侧未落账时据此把队列恢复成回退前的样子。
  const rollbackPre = isRollback(from, to)
    ? applyRequirementRollback(structuredClone(req0), reqTasks, from, to, at, actor, rollbackIds, rollbackReason)
    : undefined
  const createdDraftIds: string[] = rollbackPre !== undefined
    ? rollbackPre.taskPlan.reworkDrafts.map(t => t.id)
    : []
  const preImage = new Map<string, TaskRecord>()
  if (rollbackPre !== undefined) {
    // ① 任务先写：物化重做卡 → 取消旧卡（两者都是队列写）
    if (rollbackPre.taskPlan.reworkDrafts.length > 0) {
      await createManyQueue(deps, req0.id, rollbackPre.taskPlan.reworkDrafts)
    }
    if (rollbackPre.taskPlan.canceled.length > 0 || rollbackPre.taskPlan.resetTasks.length > 0) {
      // REQ-261004121649-bfa7 FR-1：一次写成「取消顶层父卡 + 复位子卡」两类整卡副本（写法一致）
      const canceledById = new Map(
        [...rollbackPre.taskPlan.canceled, ...rollbackPre.taskPlan.resetTasks].map(t => [t.id, t]),
      )
      await mutateQueue(deps, req0.id, (queueTasks) => {
        let touched = false
        for (const qt of queueTasks) {
          const c = canceledById.get(qt.id)
          if (c === undefined) continue
          // 补偿依据（BUG-3 / DD-3）：**覆写之前**留一份本前快照（同一快照里读，不会滞后）。
          rememberRollbackPreImage(preImage, qt)
          qt.status = c.status
          qt.revisions = c.revisions
          qt.updatedAt = c.updatedAt
          // 字段面与 `transitionTask`（唯一收敛点）同源（BUG-3 补）：状态事件与 version 必须落盘，
          // 否则「复位子卡看不到原地复位事件」「取消卡没有 canceled 事件」「两类卡 version 不 +1」
          // ——那正是本次要修的形态（计划里写了、白名单丢了）。
          if (c.statusHistory !== undefined) qt.statusHistory = c.statusHistory
          if (c.version !== undefined) qt.version = c.version
          if (c.updatedBy !== undefined) qt.updatedBy = c.updatedBy
          // 取消留痕（REQ-261005193546-1b1a FR-3）：计划副本上的三字段必须**逐键搬过来**，
          // 否则等于「plan 上写了、落盘时按白名单丢了」（设计 §1.3 的静默不落盘形态）。
          // 逐键 `!== undefined` 判定（不是无条件赋值）：本 map 同时含「子卡原地复位」副本
          // ——复位 ≠ 取消，无条件赋值会把该卡**此前保留的**留痕抹成 undefined（违反 INV-D2）。
          if (c.canceledAt !== undefined) qt.canceledAt = c.canceledAt
          if (c.canceledBy !== undefined) qt.canceledBy = c.canceledBy
          if (c.cancelReason !== undefined) qt.cancelReason = c.cancelReason
          touched = true
        }
        return touched ? queueTasks : undefined // 无变更不写盘
      })
    }
  }

  /**
   * 队列补偿（BUG-3 / DD-3）——实现单点在 `internal/rollback-compensation.ts`（本用例只装配）。
   * 触发条件（两个都要）：需求侧抛错；或需求侧走成 no-op（回调因 `req.status !== from`
   * 返回 undefined ⇒ 漂移）。
   */
  const compensateRollbackQueue = (): Promise<CompensationOutcome> =>
    compensateQueue({ deps, requirementId: req0.id, createdDraftIds, preImage })

  /** 补偿失败时的响亮处置：需求台账留痕 + 抛 REQBOARD_ROLLBACK_COMPENSATION_FAILED。 */
  const raiseCompensationFailed = (cause: string, detail: string): Promise<never> =>
    raiseCompensationFailedAt({
      deps,
      requirementId: req0.id,
      to,
      cause,
      detail,
      affected: [...new Set([...createdDraftIds, ...preImage.keys()])],
    })

  // 用例边界：domain 状态机抛 human_gate，agent 工具的传输码是 REQBOARD_HUMAN_GATE（FR-7 契约）。
  let result: Awaited<ReturnType<typeof mutateIfPresent>>
  try {
    result = await mutateIfPresent(requirementStoreOf(deps), req0.id, (req) => {
    if (req.status !== from) return undefined
    // mutate 内复查（防并发漂移）
    const gate = assertArtifactGates(req, req.status, to)
    if (gate !== undefined) throw Object.assign(new Error(gate.message), { code: transportCodeOf(gate.code) })
    const gap = taskCompletenessGap(req, reqTasks, to)
    if (gap !== undefined) throw Object.assign(new Error(gap), { code: 'REQBOARD_TASK_INCOMPLETE' })
    // ② 需求后写：对**真 req** 重放编排的撤销半边（卡计划已在 ① 落库；此处重算结果幂等、丢弃即可）。
    if (rollbackPre !== undefined) {
      applyRequirementRollback(req, reqTasks, from, to, at, actor, rollbackIds, rollbackReason)
      // 记本次物化的卡 id（FR-4）：批量清理入口靠它划边界。必须在撤销半边之后——
      // 它补写的是同一个 req.rollback 对象上的两个新字段。
      recordRollbackMaterialized(
        req, at, rollbackPre.taskPlan.reworkDrafts.map((t) => t.id),
      )
    }
    // 收敛点：human_gate / invalid_transition / system_gate 在此抛错 → mutate 回滚，状态不变
    transitionRequirement(req, to, {
      at,
      actor,
      ...(reason.length > 0 ? { reason } : {}),
      snap: captureSnapshot(deps, windowKey),
    })
    // ③ 注入与断点重算（FR-6）：必须在状态转移**之后**——stampCheckpoint 按 req.status 现算，
    // 早一步会把断点算成旧阶段的下一步（那正是本卡要消灭的残留）。
    // FR-9：回退解除自动链的归因如实透传（工具路径 = agent）
    if (rollbackPre !== undefined) resetInjectionAfterRollback(req, at, actor)
    // REQ-261004065652-5c1c FR-9（**预防半边**）：需求走进终态即收回自动意图。
    // 为什么必须在这一刻做：归档后该记录落入冷侧只读（除"归档收口"外禁写 `dive`），
    // 事后再归一就写不动了——实测 3 条「已归档却还 armed」正是这样留下的自相矛盾状态。
    // 此刻 `before.status` 仍是旧状态（非冷），这一笔照常可写。看板路径共用同一实现。
    disarmDiveOnTerminal(req, { to, at, commentId: () => deps.ids.comment() })
    req.comments.push({
      id: deps.ids.comment(),
      body: fmt('[状态] {from} → {to}（reqboard_move{why}）', { from, to, why: reason.length > 0 ? '：' + reason : '' }),
      createdAt: at,
      createdBy: actor,
    })
    return { changed: true }
  }).catch(mapAgentError)
  } catch (err) {
    // 需求侧**未落账**（写失败 / 域校验抛错）⇒ 归还第一段（BUG-3 / DD-3）。
    // 顺序契约不动：任务先写仍然是对的（任务写失败 ⇒ 需求未动，干净）；补偿是第二段的对价。
    const comp = await compensateRollbackQueue()
    if (!comp.ok) {
      return await raiseCompensationFailed((err as Error).message ?? String(err), comp.detail)
    }
    // 补偿成功：把「队列已归还」写进抛出消息（mapAgentError 只映射 human_gate，其余原样抛）
    if (err instanceof Error) err.message = err.message + '——' + comp.detail
    mapAgentError(err)
  }
  // 漂移（并发改走）：需求回调因 `req.status !== from` no-op（`changed !== true`）——
  // 队列已写、需求没退，同样必须归还（静默放过 = 留一个半成品台账）。
  if (rollbackPre !== undefined && (result === undefined || result.changed !== true)) {
    const comp = await compensateRollbackQueue()
    if (!comp.ok) {
      return await raiseCompensationFailed('需求回退未落账（记录被并发改动，回调 no-op）', comp.detail)
    }
    throw Object.assign(
      new Error(fmt(
        'reqboard_move 未执行：需求回退未落账——期望当前状态为 {from}，但记录已被并发改动（回调 no-op）；'
        + '{detail}（REQBOARD_CONFLICT）',
        { from, detail: comp.detail },
      )),
      { code: 'REQBOARD_CONFLICT' },
    )
  }
  const changed = result?.requirement
  // REQ-261007100513-6749 t3（FR-2）：阶段**已落账** → 通知尾部通道刷新易变段。
  // 这里**不传 kind**（= 状态行 / 当前任务块 / 阶段纪律三态全量刷新），两个理由：
  //   ① 阶段推进同时改变「看板状态行」（`- REQ-x 当前状态：…`），而状态行**没有别的生产者**；
  //      只通知 stage 会让状态行在通道可用后再也到不了会话（静默丢失，正是本需求要防的那类事故）；
  //   ② 三态刷新是幂等的（内容哈希去重），多算两段正文的代价远小于"漏一段"。
  if (changed !== undefined) notifyVolatileQuietly(deps.volatileNotice, windowKey)
  // REQ-261005105032-3b02 t11（FR-2）：**进入需求阶段**时幂等落原型骨架（UI 需求才有：判据读
  // requirement.md 的 sides，读不到按类型模板的缺省 sides）。位置放在转移**成功之后**——状态已进
  // brainstorming 才谈"这个阶段的产物"；已存在不覆盖、失败只告警（骨架是脚手架，不是转移的前置条件）。
  if (to === 'brainstorming') {
    await landPrototypeSkeleton(deps.docs, changed ?? req0, { nowMs: deps.clock.now() })
  }
  return {
    success: true,
    requirement_id: req0.id,
    from,
    to,
    status: changed?.status ?? to,
    // 回退回执（FR-1）：四个键与 tools/MoveTool 的 output.schema 逐字对应；前进方向**整体省略**。
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
  }
}
