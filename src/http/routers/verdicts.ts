/**
 * Verdicts 路由（REQ-47939a t7）——从 host/routes.ts 的 createReqboardHandler 内联处理器**逐字搬入**。
 *
 * 只做协议转换（请求体 → 用例/领域判定 → JSON 信封）；状态字面量比较一律经 domain 判定函数
 * （layer-boundary INV-2）。错误 → HTTP 状态码映射集中在本目录 shared.ts 的 fail()。
 *
 * REQ-a8d582 起本文件承载两处语义变更：
 *   - FR-3/FR-4：验收通过不再要求"已交材料"，但不合规通过（有不合格项 / 无材料）必须显式覆盖并留痕。
 *   - REQ-327bdf「覆盖即可通过」与 FR-4 的合并语义（REQ-f0579a t1）：覆盖不再走独立早退分支，
 *     统一走下方路径——confirm_override 免除产物闸门，但必须落 acceptanceOverride 台账留痕。
 *
 * REQ-308b9a t2/t6：逐项裁决**收敛为委托 applyVerdicts**（原先本文件内联了一份重复实现），
 * 并**推翻 REQ-a8d582 FR-2**——裁决含 failed 时自动回退实施 + 物化返工卡。
 *
 * @module dsh-pmboard/http/routers/Verdicts
 */
import { mutateIfPresent } from '../../application/use-cases/queue-access.js'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  assertReqTransition,
  normalizeText,
  type RequirementRecord,
  type ReqboardLedger,
  type TaskRecord,
} from '../../shared/protocol.js'
import {
  countFailedItems, countPassedItems, countPendingItems, isAccepting, isAcceptingStage,
  isDecidableItemStatus, isFailedItem, isUnverifiedItem, isVerifiableStage,
} from '../../domain/status/Predicates.js'
import { ACCEPTED_REQ_STATUS, REWORK_REQ_STATUS } from '../../domain/requirement/RequirementStatus.js'
import { isFullyDecided } from '../../domain/workflow/AcceptanceSheetSpec.js'
import { unverifiedAdviceOf, unverifiedSummaryOf } from '../../domain/workflow/VerdictNotices.js'
import { applyVerdicts, materializeReworkFromSheet } from '../../application/internal/verdicts.js'
import { transitionRequirement } from '../../application/internal/token-usage.js'
import { rewriteVerificationDoc } from '../../application/internal/verification-doc-writer.js'
import type { RouterCtx } from './shared.js'

export function createVerdictsRouter(ctx: RouterCtx) {
  const { taskStore, now, ids, ok, readBody, badInput, notFound } = ctx
  // B12 阶段④-2：写点已迁新端口；未装配时**响亮拒绝**（不静默写不进去）
  // B12 阶段④-2：新端口在 RouterCtx 上已转**必填**（装配漏了编译期就红），此处不再兜底
  const requireStore = (): RouterCtx['requirementStore'] => ctx.requirementStore

  /**
   * 验收人工审核（仅人）：pass → archived（验收通过即归档），rework → implementing（必须写意见）。
   *
   * REQ-a8d582 FR-3/FR-4：按钮在验收态就可见（不再以"已交材料"为前置），所以"没有材料"也能点进来；
   * 它与"有不合格项"一样属于**不合规通过**——必须带 confirm_override（覆盖说明），否则拒绝。
   * 覆盖会写进台账 acceptanceOverride + 评论 + 状态事件，三处可查。
   */
  async function handleVerifyDecision(req: IncomingMessage, res: ServerResponse, pass: boolean): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const note = normalizeText(body.note, 'note', 1000)
    const confirmOverride = normalizeText(body.confirm_override, 'confirm_override', 1000)
    if (!pass && note.length === 0) badInput('退回返工必须写清意见（note）')
    // ── 两存储顺序契约（REQ-260927202051-f6df / design/interfaces I-11）：**任务先、需求后** ──
    // 先在台账**草稿**上把整段逻辑算完（纯计算、不落盘）→ 拿到返工卡 → createMany（任务）
    // → 再整条替换需求记录（需求）。反序会出现"返工卡已建、需求态未落"的悬空态。
    const [draftRec, draftHead, draftTriages] = await Promise.all([
      ctx.requirementStore.get(id),
      ctx.requirementStore.head(),
      ctx.requirementStore.listTriages(),
    ])
    const draft: ReqboardLedger = {
      schemaVersion: draftHead?.schemaVersion ?? 0,
      revision: draftHead?.revision ?? 0,
      requirements: draftRec === undefined ? [] : [structuredClone(draftRec)],
      triages: draftTriages.map(x => structuredClone(x)) as never,
    }
    const statusBefore = (draft.requirements.find(x => x.id === id) ?? notFound("需求 " + id)).status
    // 队列任务先取（返工卡 id 冲突检测与"未过项"判定需要它）。
    const queueTasks = await taskStore.listByRequirement(id)
    // 纯计算（原 mutate 回调体逐字保留，只是不再落盘）：在草稿上完成校验与全部就地改写。
    const compute = (ledger: ReqboardLedger): { updated: RequirementRecord; reworkTasks: TaskRecord[] } => {
      const r = ledger.requirements.find(x => x.id === id) ?? notFound("需求 " + id)
      if (!isAccepting(r)) badInput("需求 " + id + " 当前处于 " + r.status + "，不在验收态（先提交验收）")

      // REQ-f0579a t1 修复（2026-09-20）：REQ-327bdf 曾在此设早退分支——带 confirm_override
      // 即直接归档，但它①从不写 acceptanceOverride（违反 REQ-a8d582 FR-4 三处留痕）②无材料时
      // 伪造 verification 记录（下游会把合成材料当真证据）③使下方统一校验路径成为死代码。
      // 已删除：覆盖与正常通过统一走下方路径——不合规通过必须有 confirm_override，
      // 且覆盖会写进台账 acceptanceOverride + 评论 + 状态事件，三处可查。
      const v = r.verification
      const items = v?.sheet?.items ?? []
      const failed = countFailedItems(items)
      const pending = countPendingItems(items)
      // REQ-261006092213-4f5b FR-6（D-5）：`unverified`（点了通过却没结果）**不算通过**——
      // 不放行必须与 domain 的 `sheetGateStatus` / `isFullyDecided` 同口径，否则
      // "全未复核"能从这个后门直接归档（放行判据的分裂点）。
      const unverified = items.filter(isUnverifiedItem).length
      const noMaterials = v === undefined
      const unqualified = noMaterials || failed + pending + unverified > 0
      if (pass && unqualified && confirmOverride.length === 0) {
        throw Object.assign(
          new Error('需求 ' + r.id + ' 未执行验收通过：'
            + (noMaterials
                ? '尚无验收材料（本次通过没有任何验收证据）'
                : '验收单里不通过 ' + failed + ' 项 / 未裁决 ' + pending + ' 项 / 未复核 ' + unverified + ' 项')
            + '。这属于不合规通过，须由人显式覆盖（带 confirm_override 重发）——覆盖会写入台账留痕'),
          { code: 'verify_override_required' },
        )
      }
      // REQ-9f4a44：验收通过 → 直接归档（无 done 中转）；退回仍回 implementing
      const to = pass ? ACCEPTED_REQ_STATUS : REWORK_REQ_STATUS
      assertReqTransition(r.status, to, 'human')
      // ── 分类感知产物闸门（REQ-31e11f t4）──
      // 覆盖路径跳过：无材料时本就没有 verification 产物可登记，而人已显式确认"知道没有证据仍要通过"。
      if (pass && !unqualified) {
        const artifacts = r.artifacts
        const isLegacy = artifacts === undefined || artifacts.length === 0
        if (!isLegacy) {
          const verArtifact = artifacts.find(a => isAcceptingStage(a.stage) && a.kind === 'verification')
          if (verArtifact === undefined) {
            throw Object.assign(new Error('节点产物缺失：accepting 阶段须先完成产物（kind=verification）并登记'), { code: 'missing_artifact' })
          }
        }
      }
      // REQ-a8d582 FR-2：返工任务跟着"退回返工"这个**人的动作**走（原先在裁决时就自动生成）。
      const reworkTasks = pass ? [] : materializeReworkFromSheet(r, queueTasks, { kind: 'human' }, now())
      if (v !== undefined) {
        v.reviewedAt = now()
        v.reviewedBy = { kind: 'human' }
        v.decision = pass ? 'pass' : 'rework'
        if (note.length > 0) v.reviewNote = note
      }
      if (pass && unqualified) {
        r.acceptanceOverride = {
          at: now(),
          by: { kind: 'human' },
          detail: confirmOverride,
          failed,
          pending,
          noMaterials,
        }
      }
      // REQ-260927121324-abde FR-1：五连写收敛到唯一迁移助手；会话码取需求绑定的
      // sourceSessionId，取不到则诚实不传快照（不伪造写时快照）。
      const verifySid = r.sourceSessionId
      const verifySnap = verifySid !== undefined && verifySid.length > 0 ? ctx.deps.tokenSnapshot?.(verifySid) : undefined
      transitionRequirement(r, to, {
        at: now(),
        actor: { kind: 'human', ...(verifySid !== undefined && verifySid.length > 0 ? { sessionId: verifySid } : {}) },
        reason: pass
          ? (unqualified ? '人工验收通过（带覆盖：' + confirmOverride + '）' : '人工验收通过')
          : '人工验收退回返工：' + note,
        ...(verifySnap !== undefined ? { snap: verifySnap } : {}),
      })
      r.comments.push({
        id: ids.comment(),
        body: pass
          ? (unqualified
              ? '[验收] 人工审核通过（带覆盖）：' + confirmOverride
                + (v !== undefined ? '｜材料结论：' + v.summary : '｜尚无验收材料')
              : '[验收] 人工审核通过（人）：' + (v?.summary ?? ''))
          : '[验收] 人工审核退回返工（人）：' + note
            + (reworkTasks.length > 0 ? '（按未过项生成 ' + reworkTasks.length + ' 个返工任务）' : ''),
        createdAt: now(),
        createdBy: { kind: 'human' },
      })
      return { updated: r, reworkTasks }
    }
    const { updated, reworkTasks } = compute(draft)
    // ① 任务写（**先**）：返工卡物化到队列（幂等键 = 任务 id；重复调用不覆盖）
    if (reworkTasks.length > 0) await taskStore.createMany(id, reworkTasks)
    // ② 需求写（**后**）：整条替换（防并发漂移：状态须仍是计算时的）
    // B12 阶段④-2：写点迁新端口（乐观并发的前置校验搬进回调内——校验与写在同一读-改-写里）
    await mutateIfPresent(requireStore(), id, (cur) => {
      if (cur.status !== statusBefore) {
        throw Object.assign(new Error('需求 ' + id + ' 状态在计算期间发生变化，请重试'), { code: 'store_inconsistent' })
      }
      Object.assign(cur, updated)
      return { changed: true }
    })
    ok(res, updated)
  }

  /**
   * POST /dashboard/api/reqboard/req/verdicts
   * 验收单逐项裁决（REQ-2e9473 t14/W6）：人逐项打勾（passed/failed + 意见）。
   *  - 全部通过 → 提示人点「验收通过」归档（不自动归档：验收通过是人工门）；
   *  - 有不通过 → **只记录**（REQ-a8d582 FR-2）：需求留在验收态，由人点「退回返工」生成返工任务；
   *  - 仍有待验项 → 挂起（验收单状态持久化，稍后从断点续验）。
   */
  async function handleVerdicts(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    const id = normalizeText(body.id, 'id', 64)
    const version = typeof body.version === 'number' ? body.version : NaN
    if (!Number.isFinite(version)) badInput('version 必须是数字（验收单版本）')
    const rawVerdicts = Array.isArray(body.verdicts) ? body.verdicts : []
    if (rawVerdicts.length === 0) badInput('verdicts 不能为空（逐项裁决：itemId/status/opinion）')
    const verdicts = rawVerdicts.map((v: unknown) => {
      const o = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
      const itemId = normalizeText(o.itemId, 'verdicts[].itemId', 64)
      const status = normalizeText(o.status, 'verdicts[].status', 16)
      if (itemId.length === 0) badInput('verdicts[].itemId 不能为空')
      if (!isDecidableItemStatus(status)) badInput('verdicts[].status 只能是 passed / failed / not_verifiable')
      const opinion = normalizeText(o.opinion, 'verdicts[].opinion', 1000)
      // REQ-261006201920-2adc FR-3 / D-3：覆盖 agent 实测结果时的**变更理由**。此处只做形态归一，
      // **判定权归应用层**（缺理由的拒绝在 `applyVerdicts` 的前置校验里，看板与弹框两通道同源）。
      const changeReason = normalizeText(o.changeReason, 'verdicts[].changeReason', 1000)
      if (isFailedItem(status) && opinion.length === 0) badInput('不通过的验收项必须写意见（opinion）')
      // REQ-308b9a FR-9 / AC-9.2：不可验收同样必须写原因——不允许静默消失。
      if (status === 'not_verifiable' && opinion.length === 0) badInput('不可验收的验收项必须写原因（opinion）')
      // REQ-261006092213-4f5b FR-4 / FR-6（D-5，**推翻 REQ-260930094139-2d65 FR-1 的「通过必填」**）：
      // 路由层**不再**对 `passed` 的空 `opinion` 做 400 预校验——判定权统一归 `applyVerdicts`：
      // 有 `item.result` 即零输入通过（`opinion` 取该项 result），两者皆空记 `unverified`。
      // 为什么删在路由层：预校验与域层各判一套必然漂移（本仓「两处判定必漂移」的老账），
      // 且前端已不再把必填推给人（看板留空点通过是合法动作）。
      return { itemId, status, opinion, ...(changeReason.length > 0 ? { changeReason } : {}) }
    })
    const nowTs = now()
    // ── 两存储顺序契约（REQ-260927202051-f6df / design/interfaces I-11）：**任务先、需求后** ──
    // 同 handleVerifyDecision：先在台账草稿上算完 → 返工卡写队列 → 需求记录写台账。
    const [draftRec, draftHead, draftTriages] = await Promise.all([
      ctx.requirementStore.get(id),
      ctx.requirementStore.head(),
      ctx.requirementStore.listTriages(),
    ])
    const draft: ReqboardLedger = {
      schemaVersion: draftHead?.schemaVersion ?? 0,
      revision: draftHead?.revision ?? 0,
      requirements: draftRec === undefined ? [] : [structuredClone(draftRec)],
      triages: draftTriages.map(x => structuredClone(x)) as never,
    }
    const statusBefore = (draft.requirements.find(x => x.id === id) ?? notFound('需求 ' + id)).status
    // 队列任务先取（applyVerdicts 需要它做 id 冲突检测与"未过项"判定）。
    const queueTasks = await taskStore.listByRequirement(id)
    const compute = (ledger: ReqboardLedger): { updated: RequirementRecord; reworkTasks: TaskRecord[] } => {
      const r = ledger.requirements.find(x => x.id === id) ?? notFound('需求 ' + id)
      if (!isVerifiableStage(r)) {
        badInput('需求 ' + id + ' 当前处于 ' + r.status + '，不在验收/返工态（先提交验收单）')
      }
      const v = r.verification
      if (v === undefined || v.sheet === undefined) ctx.badInput('需求 ' + id + ' 还没有验收单（先 reqboard_verify_submit）')
      const sheet = v.sheet
      if (sheet.version !== version) badInput('验收单版本不匹配：当前 v' + sheet.version + '，收到 v' + version + '（防并发错版）')
      // ── 单一裁决实现（REQ-308b9a t2/t6 收敛）──────────────────────────────
      // 此前这里**内联实现了一遍**与 application/internal/verdicts.ts 相同的逻辑，
      // 而后者文件头却写着"路由与会话工具共用的单一实现"——两处必然漂移。
      // 现统一委托 applyVerdicts：逐项裁决 + failed 自动回退实施（FR-8）+ 物化返工卡。
      // REQ-260927121324-abde FR-3：failed 自动回退要结算离开 accepting 节点的快照；
      // 会话码取需求 sourceSessionId，取不到则诚实不传（undefined → 不写快照）。
      const verdictSid = r.sourceSessionId
      const verdictSnap = verdictSid !== undefined && verdictSid.length > 0 ? ctx.deps.tokenSnapshot?.(verdictSid) : undefined
      const applied = applyVerdicts(
        r, queueTasks, version, verdicts as never, { kind: 'human' }, nowTs, () => ids.comment(), verdictSnap,
      )
      return { updated: applied.requirement, reworkTasks: applied.reworkTasks }
    }
    const { updated: r, reworkTasks } = compute(draft)
    // ① 任务写（**先**）：返工卡物化到队列（幂等键 = 任务 id；重复调用不覆盖）
    if (reworkTasks.length > 0) await taskStore.createMany(id, reworkTasks)
    // ② 需求写（**后**）：整条替换（防并发漂移：状态须仍是计算时的）
    // B12 阶段④-2：写点迁新端口（乐观并发的前置校验搬进回调内——校验与写在同一读-改-写里）
    await mutateIfPresent(requireStore(), id, (cur) => {
      if (cur.status !== statusBefore) {
        throw Object.assign(new Error('需求 ' + id + ' 状态在计算期间发生变化，请重试'), { code: 'store_inconsistent' })
      }
      Object.assign(cur, r)
      return { changed: true }
    })
    // REQ-308b9a FR-7 / AC-7.7：看板裁决后回填 verification.md 的验收结果表（有 docs 端口才写；任务从队列取）。
    await rewriteVerificationDoc(
      { repo: { get: (id) => ctx.requirementStore?.get(id) ?? Promise.resolve(undefined) }, ...(ctx.deps.docs !== undefined ? { docs: ctx.deps.docs } : {}) },
      r.id,
      await taskStore.listByRequirement(r.id),
    )
    const sheet = r.verification?.sheet
    const failed = sheet === undefined ? 0 : countFailedItems(sheet.items)
    const pending = sheet === undefined ? 0 : countPendingItems(sheet.items)
    // ── 未复核回执（REQ-261007160829-1991 FR-2 / FR-4 · design/interfaces.md I-7 / I-9、backend.md S-4）──
    // 看板通道与弹框通道（AcceptSheet）必须取**同一处**文案：原先这里写死一句「挂起中，或仍有未处置的
    // 缺口项——补上实际结果/处置后即可归档」，说不清为什么没过（没写结果 vs 写了但没锚点）、该补什么。
    //
    // 原因取值与弹框通道同口径：未复核项的 `unverifiedReason` **集合只有一个取值**才把它当唯一真因；
    // 混合、或全是老数据（字段缺席 ⇒ `undefined`）一律传 `undefined`——中性措辞恰好同时覆盖两类，
    // 不把老数据猜成某一类（猜错正是实测的返工来源）。
    const unverifiedItems = sheet === undefined ? [] : sheet.items.filter(isUnverifiedItem)
    const unverifiedReasons = new Set(unverifiedItems.map(i => i.unverifiedReason))
    // 无未复核项时 `unverifiedSummaryOf` 返回空串——先守空串，不留多余空格、不留孤立的补法句。
    const unverifiedNote = unverifiedItems.length === 0
      ? ''
      : unverifiedSummaryOf(unverifiedItems)
        + ' '
        + unverifiedAdviceOf(unverifiedReasons.size === 1 ? unverifiedItems[0]?.unverifiedReason : undefined)
    return ok(res, {
      requirement_id: r.id,
      status: r.status,
      sheet_version: sheet?.version ?? 0,
      pending,
      passed: sheet === undefined ? 0 : countPassedItems(sheet.items),
      failed,
      // REQ-308b9a FR-8：裁决含 failed 时返回真实生成的返工卡 id 列表。
      rework_tasks: reworkTasks.map(t => t.id),
      note: failed > 0
        ? '有 ' + failed + ' 项不通过：已自动回退实施并生成 ' + reworkTasks.length + ' 张返工任务'
        // REQ-261006201920-2adc FR-4：回执文案必须与**放行判据同源**——原先读 `isFullyDecidedItems`，
        // 而它的签名里没有 opinion/gapKind，**判不出「系统缺口项处置无效」**；于是 FR-4 上线后会出现
        // 「文案说可以归档、门禁却拦下」的两处相反口径。改读 domain 的 `isFullyDecided`（那才是放行判据）。
        : ((sheet !== undefined && isFullyDecided(sheet as never))
            ? '全部已裁决 → 请点「验收通过」归档（人工门）'
            // REQ-261007160829-1991 FR-2 / FR-4（design/interfaces.md I-9、backend.md S-4）：未复核项在
            // 场时按**真实原因**分派——「分类计数 + 该补什么」由 domain/workflow/VerdictNotices.ts 单点拼出
            // （与弹框通道同一处文案，禁在本文件再写死一句）。此处先守空串：无未复核项时不留孤立补法句。
            : (unverifiedNote.length > 0
                ? unverifiedNote
                // 无未复核项 ⇒ 剩下两类真因：仍有待裁决项 / 系统缺口项处置无效。文案与它们各自对齐，
                // 不再用一句话含糊盖过（旧句「挂起中，或仍有未处置的缺口项」已删）。
                : (pending > 0
                    ? '裁决已记录（仍有 ' + pending + ' 项待裁决）：裁决完即可点「验收通过」归档（人工门）'
                    : '裁决已记录（尚有未处置的缺口项）：补齐处置后即可归档（人工门）'))),
    })
  }

  return { handleVerifyDecision, handleVerdicts }
}
