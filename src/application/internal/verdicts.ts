/**
 * 验收单逐项裁决（REQ-2e9473 W6 补充）：路由（看板勾选）与会话工具（弹框答复）
 * 共用的**单一实现**——避免两条通道逻辑漂移。
 *
 * 语义（REQ-a8d582 FR-2 起）：逐项 passed/failed（不通过必填意见）→ **只写验收单**。
 *
 * 为什么不再自动打回：以前"有一项不通过就立刻打回 implementing + 批量建返工任务"，等于
 * 系统替人做了"退回"这个决定，还顺手让看板的「验收通过」按钮消失。现在两条状态迁移都由
 * 人的动作触发——退回走 handleVerifyDecision(pass=false)（在那里建返工卡，见
 * materializeReworkFromSheet），通过走 handleVerifyDecision(pass=true)。
 *
 * REQ-47939a t4：**裁决规则**（意见必填 / 项状态更新 / 返工规格）已迁至
 * domain/workflow/AcceptanceSheetSpec.ts；本文件只做台账校验（需求/状态/版本）与
 * 落地（生成任务 id、写状态事件与评论）——规则单点，副作用单点。
 *
 * @module dsh-pmboard/host/verdicts
 */
import {
  asScope, newTaskId, recordStatus,
  type ActorRef, type RequirementRecord, type TaskRecord, type TokenSnapshot,
} from '../../shared/protocol.js'
import { hasErrorCode, REQBOARD_ERROR_CODES } from '../../domain/errors.js'
import {
  applyVerdicts as applySheetVerdicts,
  isSystemItem,
  isResultOverride,
  reworkSpecsFor,
  type ReworkTaskSpec,
} from '../../domain/workflow/AcceptanceSheetSpec.js'
import { transitionRequirement } from './token-usage.js'
import { REWORK_REQ_STATUS } from '../../domain/requirement/RequirementStatus.js'
// REQ-261006092213-4f5b FR-4：人改结果的截断口径与 agent 侧同源（台账存摘要，不存整屏）。
import { RESULT_MAX_CHARS } from '../../domain/workflow/ResultBinding.js'
import { itemResultBindingEnabled } from '../../domain/workflow/AcceptanceSheetSpec.js'

export interface VerdictInput {
  itemId: string
  status: 'passed' | 'failed' | 'unverified'
  opinion?: string
  /**
   * 覆盖 agent 实测结果时必须给出的**变更理由**（REQ-261006201920-2adc FR-3 / D-3）。
   * 不构成覆盖时不读取；构成覆盖而缺失 → 该批被拒（`result_change_reason_required`）。
   */
  changeReason?: string
}

export interface ApplyVerdictsResult {
  requirement: RequirementRecord
  reworkTasks: TaskRecord[]
  pending: number
  passed: number
  failed: number
}

export class VerdictError extends Error {
  readonly code: string
  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

/**
 * 返工规格 → 任务记录（id 冲突重试；状态事件与时间戳在此写）。
 *
 * **不落库**（REQ-260927202051-f6df）：任务已不在台账，调用方拿到返回的 TaskRecord 后
 * 经 `taskStore.createMany(reqId, …)` 落队列。`tasks` 只用于 id 冲突检测。
 */
function materializeReworkTask(
  tasks: readonly TaskRecord[],
  reqId: string,
  spec: ReworkTaskSpec,
  actor: ActorRef,
  nowTs: number,
): TaskRecord {
  let tid = newTaskId()
  for (let g = 0; g < 50 && tasks.some(t => t.id === tid); g++) tid = newTaskId()
  const task: TaskRecord = {
    id: tid,
    requirementId: reqId,
    title: spec.title,
    description: spec.description,
    phase: spec.phase as TaskRecord['phase'],
    side: spec.side as TaskRecord['side'],
    dependsOn: [],
    scope: (spec.scope ?? asScope({})) as TaskRecord['scope'],
    acceptance: spec.acceptance,
    implementation: spec.implementation,
    context: spec.context,
    // REQ-261006201920-2adc FR-2：把规格里从来源卡继承的四类字段逐字搬到卡上。
    // 不继承 `prototypeRefs` 会让 UI 卡的返工卡被 UI 卡原型锚点门禁拒绝——生成即死路。
    ...(spec.requirementRefs !== undefined ? { requirementRefs: [...spec.requirementRefs] } : {}),
    ...(spec.prototypeRefs !== undefined ? { prototypeRefs: [...spec.prototypeRefs] } : {}),
    ...(spec.decisionRefs !== undefined ? { decisionRefs: [...spec.decisionRefs] } : {}),
    ...(spec.footprint !== undefined ? { footprint: spec.footprint } : {}),
    status: 'todo',
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: nowTs,
    updatedAt: nowTs,
    createdBy: actor,
    updatedBy: actor,
  }
  recordStatus(task, 'todo', nowTs, actor, '验收不通过 → 自动生成返工任务（W6）')
  return task
}

/**
 * 应用逐项裁决（**纯函数式：不落库**，只就地改台账需求记录并返回待落库的返工卡）。
 *
 * @param tasks 队列任务（REQ-260927202051-f6df：`LedgerView.tasks` 已随 schema v9 移除）——
 *              只读输入，用于 id 冲突检测与验收项→任务的判定；**本函数不写它**。
 * @param actor 裁决人（看板=human / 会话弹框=human+sessionId）
 * @param commentId 评论 id 生成器
 * @returns `reworkTasks` = 新 TaskRecord[]（**调用方负责落库**：`taskStore.createMany` **先**、
 *          `repo.mutate` 写需求态 **后**——顺序契约见 design/interfaces.md I-11）
 */
export function applyVerdicts(
  record: RequirementRecord,
  tasks: readonly TaskRecord[],
  version: number,
  verdicts: readonly VerdictInput[],
  actor: ActorRef,
  nowTs: number,
  commentId: () => string,
  /** token 快照（REQ-308b9a FR-8：自动回退要结算离开 accepting 节点的快照）。 */
  snap?: TokenSnapshot,
): ApplyVerdictsResult {
  // t8/B11：窄输入——只吃**目标需求单条**（存在性由调用方 get 后守卫保证）
  const r = structuredClone(record)
  if (r.status !== 'accepting' && r.status !== 'implementing') {
    throw new VerdictError('需求 ' + r.id + ' 当前处于 ' + r.status + '，不在验收/返工态（先提交验收单）', 'bad_status')
  }
  const v = r.verification
  if (v === undefined || v.sheet === undefined) {
    throw new VerdictError('需求 ' + r.id + ' 还没有验收单（先 reqboard_verify_submit）', 'no_sheet')
  }
  const sheet = v.sheet
  if (sheet.version !== version) {
    throw new VerdictError('验收单版本不匹配：当前 v' + sheet.version + '，收到 v' + version + '（防并发错版）', 'version_mismatch')
  }
  // 项存在性预校验：保持既有传输码 item_not_found（域内 invalid_input 只留给"不通过缺意见"）。
  for (const verdict of verdicts) {
    if (!sheet.items.some(i => i.id === verdict.itemId)) {
      throw new VerdictError('验收项 ' + verdict.itemId + ' 不存在', 'item_not_found')
    }
  }
  let applied: ReturnType<typeof applySheetVerdicts>
  // ── 「人写结果」的**前置**校验：（REQ-261006201920-2adc FR-3 / D-3）先整批验证、后落状态 ──
  // 判定与写入必须分开：写入发生在 `applySheetVerdicts` 之后（那时项状态已变），但**校验**必须
  // 在此之前——否则「缺理由」会在半批已改之后才发现，破坏本函数既有的原子性承诺。
  //
  // 两条路径，判据不同（混为一谈会要出两种错）：
  //   · **首次填写**（该项本来没有实测结果）→ 人的文本就是结果，写 `result` + 来源 `human`；
  //   · **覆盖**（该项已有实测结果且与人的文本不同）→ 除上述外还要**变更理由** + 原文留档。
  // 未改动预填值（文本 === 既有 result）两条都不走，老老实实跳过（TC-15）。
  interface ResultWritePlan { id: string; op: string; reason: string; superseded?: string }
  const writePlans: ResultWritePlan[] = []
  if (itemResultBindingEnabled(process.env)) {
    for (const v of verdicts) {
      if (v.status !== 'passed') continue
      const it = sheet.items.find(i => i.id === v.itemId)
      // 「只能人看」的项也排除（REQ-261006201920-2adc FR-3）：它的 `result` 只是**供人参照的材料**
      // （与 domain `needsHumanNeedsText` 同口径），人的判断记在 `opinion` 里——覆盖参照材料既没有
      // 语义，也会逼人在「唯一要人动手」的项上多答一问。
      if (it === undefined || isSystemItem(it) || it.needsHuman === true) continue
      const op = (v.opinion ?? '').trim()
      const existing = (it.result ?? '').trim()
      // 两条写路径的**分流判据**：与既有实测结果不同=覆盖（要理由+留档）；本无结果=首次填写。
      if (op.length === 0 || op === existing) continue
      const override = isResultOverride(it, op)
      writePlans.push({
        id: v.itemId,
        op,
        reason: (v.changeReason ?? '').trim(),
        ...(override ? { superseded: existing } : {}),
      })
    }
  }
  for (const p of writePlans) {
    if (p.superseded === undefined || p.reason.length > 0) continue
    throw new VerdictError(
      '验收项 ' + p.id + ' 的实测结果由 agent 记录，**覆盖它必须写变更理由**（changeReason）——'
      + '两条路：① 不覆盖（清空输入框，保留 agent 原文）；② 补一句为什么改'
      + '（如「agent 跑的是旧分支，重跑后输出不同」）',
      'result_change_reason_required',
    )
  }
  try {
    applied = applySheetVerdicts(sheet, verdicts, actor, nowTs, tasks)
  } catch (err) {
    if (hasErrorCode(err, REQBOARD_ERROR_CODES.invalidInput)) {
      // 保持既有传输码 opinion_required（工具层据此回执）；消息文案不变。
      throw new VerdictError((err as Error).message, 'opinion_required')
    }
    throw err
  }
  const pending = applied.pending
  // REQ-261006092213-4f5b FR-6：未复核项也要进裁决留痕——它与 pending 一样"不放行"。
  const unverifiedCount = sheet.items.filter(i => i.status === 'unverified').length
  // ── 人改过结果 → 写 result 与来源（REQ-261006092213-4f5b FR-4 / D-5）─────────────
  // 两条通道（看板 / 会话弹框）共用的**唯一写点**：`resultSource='human'` 从此不再是死分支。
  // 纪律：
  //   · **只对「通过」的项**——failed / not_verifiable 的 opinion 是处置意见，不是实际结果，
  //     不得覆盖该项的实测结果（实际结果列要保住 agent 原文，意见另行留痕）；
  //   · **系统项（gapKind / 不可照着验）跳过**（复核 S3）：它的 opinion 是"这个缺口怎么处置"，
  //     同样不是实测结果——写进 `result` 会让 FR-7 的「实际结果」列与看板的「人工填写」徽标
  //     把处置意见冒充实测结论；
  //   · 与现值相等则不写（零输入通过时 opinion 就是 result ⇒ 来源保持 `agent`，不被误标成 human）；
  //   · **回滚开关开启时整段跳过**：旧口径从不写 `result`（`evidence[0]` 兜底出来的文本是"系统回填"，
  //     不是人写的）——开关承诺"一行配置退回今天行为"，把系统回填标成 `human` 会污染来源可辨性；
  //   · 截断口径与 agent 侧同源（`RESULT_MAX_CHARS`），台账不存整屏；
  //   · **覆盖是原子四元组**（REQ-261006201920-2adc FR-3 / D-3）：`result` + `resultSource='human'`
  //     + `resultSuperseded`（被取代的 agent 原文）+ `resultChangeReason`（变更理由）**一起写**。
  //     半截写入（翻了来源却没留原文）会让「谁填的」与「改之前是什么」同时不可考；
  //     重复覆盖时 `resultSuperseded` 保留**最初那次**的 agent 原文，不被中间值冲掉。
  //     缺理由的情况已在上面**前置校验**里整批拦下（先验后改）。
  if (itemResultBindingEnabled(process.env)) {
    for (const p of writePlans) {
      const it = sheet.items.find(i => i.id === p.id)
      if (it === undefined) continue
      // 覆盖才写留档：原文保留**最初那次**的 agent 文本（重复覆盖不冲掉），理由与之一并落库。
      if (p.superseded !== undefined) {
        if (it.resultSuperseded === undefined) it.resultSuperseded = p.superseded.slice(0, RESULT_MAX_CHARS)
        it.resultChangeReason = p.reason.slice(0, RESULT_MAX_CHARS)
      }
      it.result = p.op.slice(0, RESULT_MAX_CHARS)
      it.resultSource = 'human'
    }
  }
  // REQ-308b9a FR-8（**推翻 REQ-a8d582 FR-2**，用户订正①）：
  // 出现 failed → **同笔 mutate 内**自动回退实施 + 物化返工卡；不再等人点「退回返工」。
  // 原子性（AC-8.3）：物化或状态迁移抛错 → 整笔 mutate 回滚，不出现"状态改了卡没建"。
  const reworkTasks: TaskRecord[] = applied.failed > 0
    ? materializeReworkFromSheet(r, tasks, actor, nowTs)
    : []
  if (applied.failed > 0 && r.status !== REWORK_REQ_STATUS) {
    transitionRequirement(r, REWORK_REQ_STATUS, {
      at: nowTs,
      actor,
      reason: '验收不通过（' + applied.failed + ' 项）→ 自动回退实施并生成 ' + reworkTasks.length + ' 张返工卡（REQ-308b9a FR-8）',
      ...(snap !== undefined ? { snap } : {}),
    })
  }
  r.version += 1
  r.updatedAt = nowTs
  r.updatedBy = actor
  r.comments.push({
    id: commentId(),
    body: '[验收单] v' + sheet.version + ' 逐项裁决：通过 ' + applied.passed + ' 项，不通过 ' + applied.failed + ' 项，'
      + '不可验收 ' + applied.notVerifiable + ' 项，待验 ' + pending + ' 项'
      + '、未复核 ' + unverifiedCount + ' 项'
      + (applied.failed > 0
          ? '（已自动回退实施并生成 ' + reworkTasks.length + ' 张返工任务）'
          // 放行口径与判据同源（REQ-261006092213-4f5b FR-6）：只数 pending 会让台账写下
          // 「全部已裁决 → 可点验收通过」，而实际被未复核项拦住——同一件事两处相反的口径。
          : (pending === 0 && unverifiedCount === 0
              ? '（全部已裁决 → 可点「验收通过」归档）'
              : (pending > 0 ? '（挂起，稍后从断点续验）' : '（仍有未复核项：补上实际结果后再归档）'))),
    createdAt: nowTs,
    createdBy: actor,
  })
  return {
    requirement: r,
    reworkTasks,
    pending,
    passed: applied.passed,
    failed: applied.failed,
  }
}

/**
 * 「退回返工」路径：按当前验收单里**已判不通过**的项生成返工任务（REQ-a8d582 FR-2）。
 *
 * 为什么搬到这里：裁决本身不再改状态（见 applyVerdicts），返工卡必须跟着人的"退回"动作走——
 * 否则会重新出现"人还没决定、系统已经建了一堆卡"。规格仍单点在 domain/workflow/AcceptanceSheetSpec。
 */
export function materializeReworkFromSheet(
  record: RequirementRecord,
  tasks: readonly TaskRecord[],
  actor: ActorRef,
  nowTs: number,
): TaskRecord[] {
  const r = record
  const sheet = r.verification?.sheet
  if (sheet === undefined) return []
  return reworkSpecsFor(sheet, tasks).map(spec => materializeReworkTask(tasks, r.id, spec, actor, nowTs))
}
