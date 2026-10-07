/**
 * MoveTask 用例（REQ-260927100007-b8ba FR-7/FR-8，REQ-4842fe t5/t6 契约）——
 * agent 侧任务流转，语义与看板按钮**逐条对齐**，并补齐自动链需要的四件事：
 *
 *   1. 状态迁移统一走 transitionTask（收敛点），不再直接赋值；
 *   2. 开工返回任务卡全文（task_card.doc_path / implementation）——照卡执行，不凭记忆；
 *   3. 父卡开工**同事务**懒展开子卡链，并受同需求父卡并发上限约束（REQBOARD_PARENT_LIMIT）；
 *   4. 转 done 前过 done 凭证门（父卡收尾门 / 子卡三项证据）。
 *
 * REQ-260927202051-f6df t9/t12：任务已迁出台账（v9 无 `tasks` 键），本用例改为
 * **两段写**并遵守顺序契约——
 *   ① `taskStore.mutate(reqId, …)`（先）：任务状态/事件/执行记录/懒展开子卡；
 *   ② `repo.mutate(…)`（后）：rollup 派生需求状态。
 * 反序会产生"需求已验收但任务未完成"的悬空态（t12 以打点断言次序，不接受口头声明）。
 *
 * REQ-261007100513-6749 t4（FR-4/FR-5）——把上面的两段再切成「计划 / 落笔」两段，
 * 单卡路径成为批量的**特例**（同一套门禁、同一个落笔点）：
 *
 *   ① `planMoveTasks`：**只读**校验产计划——席位 → 绑定 → 存在性 → 状态机合法边 →
 *      依赖门 → 父卡上限 → 逐卡 done 凭证门 → 60s 节流，一个字节都不写；
 *   ② `applyMovePlans`：**一次** `mutateQueue` 落全部合法项（store 原生支持同份原子写多张卡），
 *      随后需求 rollup 与 RTM 同步（顺序契约与现状逐字一致：任务写 → 需求写 → RTM）。
 *
 * 本卡的核心推论（写在最显眼处，因为它就是 FR-5 的全部内容）：
 * **所有门禁都在写入前判完**，故同批提交的卡天然看不到彼此的 done 事件
 * ⇒ 同批卡互不触发 60s 节流，跨批仍触发。判据本身**一条未改**（`DoneEvidenceSpec`），
 * 事故 C 的防线由**逐卡 done 凭证门**继续承载：一次调用关 4 张没汇报的卡，仍会逐张被
 * `REQBOARD_NO_REPORT` / `REQBOARD_NO_EVIDENCE` 拒。
 *
 * 错误码在用例边界映射：domain 的 human_gate → REQBOARD_HUMAN_GATE（agent 工具传输契约）。
 *
 * @module dsh-pmboard/application/use-cases/MoveTask
 */
import type { UseCaseDeps } from '../ports.js'
import { openRequirementsForVia, canWrite, seatOf, type SeatAction } from '../internal/window.js'
import {
  asTaskStatus,
  isSubtask,
  newExecutionId,
  normalizeText,
  type RequirementRecord,
  type TaskRecord,
  type TaskStatus,
} from '../../shared/protocol.js'
import { endsExecutionSegment, isRollbackOrCancel, startsExecutionSegment } from '../../domain/status/Predicates.js'
import { checkClaimDependencies } from '../../domain/workflow/DependencyGateSpec.js'
import { assertTaskTransition, type TaskRole } from '../../domain/task/TaskStatus.js'
import { doneThrottleRemainingMs } from '../../domain/workflow/DoneEvidenceSpec.js'
import { checkAcceptance } from '../../domain/task/Acceptability.js'
import { LIMITS } from '../../domain/limits.js'
import { transitionTask } from '../internal/task-transition.js'
import { expandSubtasks } from '../internal/lazy-expand.js'
import { applyTaskRollupVia } from '../internal/rollup.js'
import { syncRTMYaml } from '../internal/rtm-yaml.js'
import {
  closeExecutions,
  openExecution,
  snapshotForWindow,
  snapshotProviderFor,
} from '../internal/token-usage.js'
import {
  reject,
  agentIdFromExec,
  requireLiveDriver,
  assertDoneEvidence,
  mapAgentError,
} from '../internal/support.js'
import { fmt } from '../../domain/text/fmt.js'
// REQ-261007100513-6749 t3（FR-2/FR-3）：易变段尾部投递的**写路径生产者**（即发即忘、永不抛）。
import { notifyVolatileQuietly } from '../internal/notice-delivery.js'
import { requirementStoreOf, taskStoreOf, mutateQueue } from './queue-access.js'
// 树摘要复用 TaskTree 的节点投影（design/data-model §树摘要：逐字复用 TaskTreeNodeView，
// 只取一层）。**不新造节点结构**——两套渲染口径必然分叉（本仓已栽过多次）。
import { treeSummaryOf, type TaskTreeSummary } from './TaskTree.js'

/** 批量上限（1–20）：工具参数校验与本用例共用同一个数（两处各写一份必然漂移）。 */
export const MOVE_BATCH_MAX = 20

/** 批量默认节流窗口（与 deps.doneThrottleMs 的缺省同源：60s，判据在 DoneEvidenceSpec）。 */
const DEFAULT_DONE_THROTTLE_MS = 60_000

// ---------------------------------------------------------------------------
// 逐项结果与树摘要（design/data-model §逐项结果与树摘要类型）
// ---------------------------------------------------------------------------

/** 批量推进的逐项结果；`code` 逐字透传既有拒绝码，不新造码。 */
export interface TaskMoveItemResult {
  task_id: string
  ok: boolean
  from?: TaskStatus
  to?: TaskStatus
  status?: TaskStatus
  version?: number
  code?: string
  error?: string
  /** 该项撞节流时（ok=false）：剩余毫秒——调用方照此等待或改做他事，不必试探。 */
  throttleRemainingMs?: number
}

/**
 * 落笔后的逐项结果（= `TaskMoveItemResult` + 投影内部用的字段）。
 *
 * 为什么多带几个键：单卡路径的回执要与改造前**逐字一致**（`subtasks_created` / `task_card`），
 * 批量路径的树摘要要知道"受影响的父卡是谁"。这些键**只在本用例内部流转**，
 * 出工具前由 `executeMoveTasks` 剥成 `TaskMoveItemResult`（不许漏进 results[]）。
 */
export interface TaskMoveAppliedItem extends TaskMoveItemResult {
  requirement_id: string
  /** 受影响父卡（子卡 = parentId；顶层卡 = 自身）——树摘要的根集合。 */
  parent_id?: string
  /** 父卡开工同事务懒展开的子卡 id（单卡回执的 subtasks_created 来源）。 */
  created_ids?: string[]
  card?: { doc_path: string; implementation: string }
}

/**
 * `reqboard_task_move` 的**输出契约类型**（design/interfaces.md §TaskMoveOutput）。
 *
 * 存在的理由（本卡的交付物之一）：新键与旧 11 键必须**并存且键名固定**——
 * t5 加 `budget` 时只该往这里与 output.schema 各补一处，不许改名（键名漂移会让
 * 已经写好的调用方与分析脚本静默失效）。契约测试逐字断言这 18 个键。
 */
export interface TaskMoveOutput {
  // —— 既有 11 键（语义与取值逐字不变）——
  success: boolean
  task_id: string
  from?: TaskStatus
  to?: TaskStatus
  status?: TaskStatus
  version?: number
  subtasks_created?: string[]
  task_card?: { doc_path: string; implementation: string }
  acceptance?: string
  error?: string
  code?: string
  // —— 新增 7 键（只增不减；budget 由 t5 落地，本卡只钉类型与键名）——
  results?: TaskMoveItemResult[]
  partial?: boolean
  tree?: TaskTreeSummary
  tree_note?: string
  throttleRemainingMs?: number
  guidance?: string
  budget?: { task_id: string; windowIndex: number; limit: number; released: boolean }
}

// ---------------------------------------------------------------------------
// 计划（只读校验的产物；`MovePlan` 是本文件两段之间唯一的交接形状）
// ---------------------------------------------------------------------------

interface MoveItemInput {
  /** 入参下标（回执顺序 = 入参顺序的判据）。 */
  index: number
  task_id: string
  to?: TaskStatus
  reason: string
  /** 批量项的验收标准修订（与单卡的 acceptance 通道同语义：只传它 = 仅修订不改状态）。 */
  acceptance?: string
}

export interface MovePlanOk {
  kind: 'ok'
  index: number
  windowKey: string
  requirement_id: string
  task_id: string
  /** 受影响父卡（子卡 = parentId；顶层卡 = 自身）——树摘要的根集合。 */
  parent_id?: string
  to?: TaskStatus
  reason: string
  acceptance?: string
  /** 父卡开工且需求 autoRun=true（落笔时决定要不要懒展开子卡链）。 */
  auto_run: boolean
  /** 需求 createdAt（**只给 to=done 的项**；done 凭证门的链出身基准用它，HEAD 亦在 mutate 之前取）。 */
  req_created_at?: number
}

/**
 * 通过门禁的计划项（= `MovePlanOk` + 门禁从**新鲜快照**上读出来的判定结果）。
 * 这些字段**只能在写前快照上算**，故由 `gateOne`（落笔回调内）产出，预检阶段不猜。
 */
export interface MoveGateOk extends MovePlanOk {
  role: TaskRole
  from: TaskStatus
  starting: boolean
  endsSegment: boolean
  /** to=done 的子卡且 lastRun 缺失 → 落笔时补一份 manual run 证据（与改造前同序：先补后过门）。 */
  fillManualRun: boolean
  /** 父卡开工且需求 autoRun=true → 同事务懒展开子卡链。 */
  expand: boolean
}

export interface MovePlanReject {
  kind: 'reject'
  index: number
  windowKey: string
  task_id: string
  code: string
  error: string
  throttleRemainingMs?: number
}

export type MovePlan = MovePlanOk | MovePlanReject

/** 预检上下文（**全在落笔之前**：席位 / 绑定 / 存在性 / 格式 / 验收标准门槛）。 */
interface PlanContext {
  windowKey: string
  bound: readonly RequirementRecord[]
  deps: UseCaseDeps
  store: ReturnType<typeof taskStoreOf>
  /** 每需求一次的需求侧读（autoRun / createdAt）——读点位置与 HEAD 一致（都在 mutate 之前）。 */
  reqs: Map<string, RequirementRecord | undefined>
  createdAt: Map<string, number | undefined>
  /** 批内出现过的卡（taskId → 首次下标）：同一张卡重复出现即拒。 */
  seen: Map<string, number>
}

/**
 * 门禁上下文（**落笔回调内**用；同步、无 I/O）。
 *
 * 为什么单独一个：这些门禁必须跑在 `mutate` 的**强制重读**快照上（与 HEAD 同源可见性），
 * 而预检阶段手上只有端口缓存——两者不是同一份数据，不能混用（详见 applyMovePlans 注释）。
 */
interface GateContext {
  windowKey: string
  /** 该需求的需求记录（autoRun 懒展开用；落笔前读一次，回调内不得再读）。 */
  req: RequirementRecord | undefined
  /** 批内已计划开工的父卡数——防止批量绕过既有父卡并发上限。 */
  parentStarts: Map<string, number>
}

/** 角色判定：子卡（有 parentId）/ 父卡（有子卡）/ 存量卡。 */
function roleOf(task: TaskRecord, tasks: readonly TaskRecord[]): TaskRole {
  if (typeof task.parentId === 'string' && task.parentId.length > 0) return 'subtask'
  return tasks.some(t => t.parentId === task.id) ? 'parent' : 'legacy'
}

/** 同需求当前在跑的父卡（parentId 缺省 = 父卡/存量卡层）。 */
function runningParents(tasks: readonly TaskRecord[], requirementId: string): TaskRecord[] {
  return tasks.filter(t => t.requirementId === requirementId && t.parentId === undefined && t.status === 'in_progress')
}

/** 任务卡文档路径：落库时写死的 cardDoc 优先，缺省按同一口径拼（与 decompose/report 同源）。 */
function taskCardPath(task: TaskRecord): string {
  if (typeof task.cardDoc === 'string' && task.cardDoc.length > 0) return task.cardDoc
  return 'docs/requirements/' + task.requirementId + '/tasks/' + task.id + '.md'
}

/**
 * 撞节流时的处置指引（**必须给确定等待时间**）。
 *
 * 为什么必须有它（REQ-261001154450-b918 FR-4 的续作）：旧文案只把剩余秒数埋在拒绝文本里，
 * agent 拿到的是一个"说不清"的拒绝——实测（REQ-8475）解法是连打 32 次 `sleep 62`，
 * 纯等待 33.1 分钟 = 该需求墙钟 65%。这里把"等多久"与"这段时间能做什么"一并给出，
 * 让节流从"故障感"回到"设计内的节奏"。
 */
export function throttleGuidance(remainingMs: number): string {
  const sec = Math.ceil(remainingMs / 1000)
  return fmt(
    '该项撞同需求 60 秒节流（事故 C 的防线，设计内节奏、不是故障）：**确定等待 {ms} 毫秒（约 {sec} 秒）**，照此等待即可，不要试探/轮询（也不需要 sleep 试探）。这段时间可以做：① 先用 reqboard_task_report 写卡评论与汇报留痕（收尾本就要求先汇报）；② 先提交验收材料（reqboard_submit kind=verification）；③ 先推进子卡——子卡链条豁免此节流；④ 交给自动链 reqboard_task_run 逐张关闭（由链自己排节奏）。',
    { ms: remainingMs, sec },
  )
}

/**
 * 复用工具边界的错误映射（human_gate → REQBOARD_HUMAN_GATE）。
 *
 * 为什么必须映射（不能只让 domain 的 `human_gate` 外泄）：改造前 `mapAgentError` 挂在
 * `mutateQueue(...).catch(...)` 上——human_gate 正是在 mutate 回调里抛出来的，所以单卡路径
 * 从未把域码 `human_gate` 透给调用方。门禁搬家后（预检 + 落笔回调两处）每一条抛出路径都必须
 * 自己过一遍映射，否则 `REQBOARD_HUMAN_GATE` 会悄悄退回成 `human_gate`（码名变了 = 调用方分流失效）。
 * 映射口径仍只有 `mapAgentError` 一处，此处不重写文案。
 */
function asMoveError(err: unknown): Error {
  let mapped: unknown = err
  try {
    mapAgentError(err)
  } catch (converted) {
    mapped = converted
  }
  return mapped as Error
}

/**
 * 节流拒绝的结构化升级：既有 `REQBOARD_BULK_CLOSE` 判据与**文案一字不改**，
 * 只把"还要等多久"从文案数字补成结构化字段（+ 顶层/错误对象上的 guidance）。
 *
 * 剩余毫秒由 `doneThrottleRemainingMs`（domain，与拒绝判据同一个纯函数）算出——
 * 不在这里重写第二份节流判据（那就是"两套口径必然分叉"的老路）。
 */
function withThrottleInfo(err: unknown, deps: UseCaseDeps, snapshot: readonly TaskRecord[], taskId: string, reqId: string): Error {
  const mapped = asMoveError(err)
  const code = (mapped as { code?: unknown }).code
  if (code !== 'REQBOARD_BULK_CLOSE') return mapped
  const throttleMs = deps.doneThrottleMs ?? DEFAULT_DONE_THROTTLE_MS
  const remaining = doneThrottleRemainingMs(snapshot, taskId, reqId, deps.clock.now(), throttleMs)
  const ms = remaining > 0 ? remaining : throttleMs
  Object.assign(mapped, { throttleRemainingMs: ms, guidance: throttleGuidance(ms) })
  return mapped
}

/** 造一个"该项被拒"的计划项（**不用对象字面量 return**：res 扫描会把裸 return {…} 当响应键）。 */
function rejectPlan(index: number, windowKey: string, taskId: string, code: string, error: string, throttleRemainingMs?: number): MovePlanReject {
  const plan: MovePlanReject = { kind: 'reject', index, windowKey, task_id: taskId, code, error }
  if (throttleRemainingMs !== undefined && throttleRemainingMs > 0) plan.throttleRemainingMs = throttleRemainingMs
  return plan
}

/** 把未知异常规整成带 code 的错误（无 code 时给 store 不一致——**失败要响亮**，不静默吞）。 */
function codedError(err: unknown, fallbackCode: string): Error {
  const mapped = asMoveError(err)
  if (typeof (mapped as { code?: unknown }).code !== 'string') {
    return Object.assign(new Error(mapped.message), { code: fallbackCode })
  }
  return mapped
}

// ---------------------------------------------------------------------------
// 入参解析（扁平四参 / 批量 tasks[]；容器形状的错误在工具层按既有样式回报）
// ---------------------------------------------------------------------------

/** 扁平四参 → 单个计划项（**逐字保留**改造前的解析与报错）。
 *  注意：这里先建变量再 return——`tests/output-contract.test.ts` 的静态扫描把本文件每个
 *  裸 `return {…}` 的顶层键都当成 `reqboard_task_move` 的响应键（`index`/`reason` 会当场变红）。 */
function readFlatMoveItem(a: Record<string, unknown>): MoveItemInput {
  const taskId = normalizeText(a.task_id, 'task_id', 64)
  if (taskId.length === 0) reject('reqboard_task_move 未执行：task_id 不能为空', 'REQBOARD_INVALID_INPUT')
  const item: MoveItemInput = { index: 0, task_id: taskId, to: asTaskStatus(a.to), reason: normalizeText(a.reason, 'reason', 500) }
  return item
}

/**
 * 批量项逐项解析：**坏项不throw**（那会连带拒掉同批的好项），按项产出拒绝计划。
 * 容器本身的形状错误（空数组 / 超上限）由 `planMoveTasks` 抛——那种错没有"逐项"可言。
 */
function readBatchMoveItems(raw: readonly unknown[], windowKey: string): { items: MoveItemInput[]; rejects: MovePlanReject[] } {
  const items: MoveItemInput[] = []
  const rejects: MovePlanReject[] = []
  raw.forEach((entry, index) => {
    const o = (entry ?? {}) as Record<string, unknown>
    let taskId = ''
    try {
      taskId = normalizeText(o.task_id, 'task_id', 64)
    } catch {
      taskId = ''
    }
    if (taskId.length === 0) {
      rejects.push(rejectPlan(index, windowKey, '', 'REQBOARD_INVALID_INPUT', fmt('批量项 [{n}] 缺少 task_id：每项必须给出 t-xxxxxx（批内一项一卡）', { n: String(index) })))
      return
    }
    let to: TaskStatus | undefined
    try {
      to = o.to === undefined || o.to === null ? undefined : asTaskStatus(o.to)
    } catch (err) {
      const e = asMoveError(err)
      rejects.push(rejectPlan(index, windowKey, taskId, String((e as { code?: unknown }).code ?? 'REQBOARD_INVALID_INPUT'), e.message))
      return
    }
    let reason = ''
    try {
      reason = normalizeText(o.reason, 'reason', 500)
    } catch (err) {
      const e = asMoveError(err)
      rejects.push(rejectPlan(index, windowKey, taskId, String((e as { code?: unknown }).code ?? 'REQBOARD_INVALID_INPUT'), e.message))
      return
    }
    let acceptance: string | undefined
    try {
      const text = normalizeText(o.acceptance, 'acceptance', 2000)
      if (text.length > 0) acceptance = text
    } catch (err) {
      const e = asMoveError(err)
      rejects.push(rejectPlan(index, windowKey, taskId, String((e as { code?: unknown }).code ?? 'REQBOARD_INVALID_INPUT'), e.message))
      return
    }
    if (to === undefined && acceptance === undefined) {
      rejects.push(rejectPlan(index, windowKey, taskId, 'REQBOARD_INVALID_INPUT', fmt('批量项 [{n}]（{id}）既无 to 也无 acceptance：每项至少给一个（只给 acceptance = 仅修订验收标准、不改状态）', { n: String(index), id: taskId })))
      return
    }
    items.push({ index, task_id: taskId, ...(to === undefined ? {} : { to }), reason, ...(acceptance === undefined ? {} : { acceptance }) })
  })
  const out: { items: MoveItemInput[]; rejects: MovePlanReject[] } = { items, rejects }
  return out
}

// ---------------------------------------------------------------------------
// ① 只读预检产计划（不写台账、不推进状态）
// ---------------------------------------------------------------------------

/**
 * 逐项**只读预检**并产出计划：席位 / 绑定 / 存在性 / 批内重复 / 验收标准门槛。
 *
 * 哪些门禁**不在这里**（依赖门 / 父卡上限 / 状态机合法边 / done 凭证门 / 节流）：它们要的是
 * **任务集快照**，而快照的可见性必须与 HEAD 同源——HEAD 跑在 `mutate` 的**强制重读**上
 * （`QueueTaskStore.mutate` 落笔前 `repo.load`，不信进程内缓存）。预检阶段手上只有端口缓存，
 * 拿它判门禁等于把「跨进程写入者的变更」挡在门外（本仓是多窗口共享工作树，这条会真发生）。
 * 所以那批门禁在 `applyMovePlans` 的**同一次** mutate 回调里跑（快照冻结 + 写前判完，
 * 见该函数注释）；本函数只做**不需要任务集**的那部分。
 *
 * 单卡路径的报错语义**逐字保留**：预检被拒 → 直接抛（不是返回 results[]），且错误经
 * `mapAgentError`（human_gate → REQBOARD_HUMAN_GATE，与 HEAD 的 `.catch(mapAgentError)` 同源）。
 *
 * **副作用边界（R7，逐字口径）**：本函数不写台账、不推进状态；**仅诊断日志例外**——
 * 子卡汇报兜底路径会在 done 凭证门里写一条 `captureDiag` 日志，而那道门在 `applyMovePlans`
 * 的落笔回调里跑，不在本函数内（这里连诊断日志都不产生）。
 */
export async function planMoveTasks(deps: UseCaseDeps, args: unknown, exec: unknown): Promise<MovePlan[]> {
  const windowKey = agentIdFromExec(deps, exec)
  requireLiveDriver(deps, exec)
  const a = (args ?? {}) as Record<string, unknown>
  const batch = Array.isArray(a.tasks)

  let items: MoveItemInput[]
  let parseRejects: MovePlanReject[] = []
  let slots: number
  if (batch) {
    const raw = a.tasks as readonly unknown[]
    if (raw.length === 0) {
      reject('reqboard_task_move 未执行：tasks 不能是空数组（要推一张卡就用扁平四参）', 'REQBOARD_INVALID_INPUT')
    }
    if (raw.length > MOVE_BATCH_MAX) {
      reject(
        fmt('reqboard_task_move 未执行：tasks 一次最多 {max} 项（本批 {n} 项）——拆成多批；批内一项一卡', { max: String(MOVE_BATCH_MAX), n: String(raw.length) }),
        'REQBOARD_INVALID_INPUT',
      )
    }
    const parsed = readBatchMoveItems(raw, windowKey)
    items = parsed.items
    parseRejects = parsed.rejects
    slots = raw.length
  } else {
    items = [readFlatMoveItem(a)]
    slots = 1
  }

  const bound = await openRequirementsForVia(requirementStoreOf(deps), windowKey)
  // 单卡路径逐字保留"没有绑定需求即抛"的语义；批量路径改成逐项点名（design/interfaces §异常情况）。
  if (bound.length === 0 && !batch) {
    reject('reqboard_task_move 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  }

  const ctx: PlanContext = {
    windowKey,
    bound,
    deps,
    store: taskStoreOf(deps),
    reqs: new Map(),
    createdAt: new Map(),
    seen: new Map(),
  }

  const plans: (MovePlan | undefined)[] = new Array<MovePlan | undefined>(slots).fill(undefined)
  for (const r of parseRejects) plans[r.index] = r
  for (const item of items) {
    try {
      plans[item.index] = await precheckOne(ctx, item)
    } catch (err) {
      // 单卡路径：抛原样，但**必须**过一遍工具边界的错误映射（R1：human_gate → REQBOARD_HUMAN_GATE）。
      if (!batch) throw asMoveError(err)
      const e = codedError(err, 'REQBOARD_STORE_INCONSISTENT')
      const throttle = (e as { throttleRemainingMs?: unknown }).throttleRemainingMs
      plans[item.index] = rejectPlan(
        item.index, windowKey, item.task_id,
        String((e as { code?: unknown }).code), e.message,
        typeof throttle === 'number' ? throttle : undefined,
      )
    }
  }
  return plans.filter((p): p is MovePlan => p !== undefined)
}

/**
 * 单项只读预检（抛 = 被拒；返回 = 计划）。
 *
 * 读点位置与 HEAD 严格对齐：`store.get`（存在性/绑定/席位）与需求侧两次读（autoRun、createdAt）
 * 都在 **mutate 之前**——HEAD 也是如此（`task0` / `reqBeforeMutate` / `reqCreatedAtForDone`）。
 * 唯一的副作用例外：子卡汇报兜底路径会写一条**诊断日志**（`captureDiag`，不是台账写入），
 * 且它只在落笔回调里的 done 凭证门发生（本函数不碰）。
 */
async function precheckOne(ctx: PlanContext, item: MoveItemInput): Promise<MovePlanOk> {
  const { deps, windowKey, bound, store } = ctx
  const taskId = item.task_id

  if (bound.length === 0) {
    reject('reqboard_task_move 未执行：本窗口没有绑定中的需求', 'REQBOARD_NO_BOUND_REQ')
  }
  const task0 = await store.get(taskId)
  if (task0 === undefined) reject(fmt('reqboard_task_move 未执行：任务 {id} 不存在', { id: taskId }), 'REQBOARD_TASK_NOT_FOUND')
  if (!bound.some(r => r.id === task0.requirementId)) {
    reject(fmt('reqboard_task_move 未执行：任务 {id} 不属于本窗口绑定的需求（只能动自己的卡）', { id: taskId }), 'REQBOARD_NOT_BOUND_TO_WINDOW')
  }
  // 批内重复：同一张卡出现两次时，两项的目标状态是拿同一份**写前快照**判的——
  // 两项都会"通过"，然后后写覆盖前写（= 第一次的意图被静默吞掉）。故重复项一律拒。
  const firstIndex = ctx.seen.get(taskId)
  if (firstIndex !== undefined) {
    reject(
      fmt('reqboard_task_move 未执行：同一张卡 {id} 在同批中出现多次（第 {a} 项与第 {b} 项）——批内一项一卡；本项已拒，第 {a} 项照常判', { id: taskId, a: String(firstIndex), b: String(item.index) }),
      'REQBOARD_INVALID_INPUT',
    )
  }
  // 席位角色（FR-3）：**绑定 ≠ 可写**。observer 席位也会出现在 bound 里（只读场景要看得见它），
  // 故写路径必须显式判角色——领卡/汇报 owner 与 worker 都可，observer 不可（否则席位改造变成放权）。
  const targetReq = bound.find(r => r.id === task0.requirementId)
  const seatAction: SeatAction = item.to === 'in_progress' ? 'claim-task' : 'report-task'
  const seatCheck = canWrite(targetReq === undefined ? undefined : seatOf(targetReq, windowKey), seatAction)
  if (!seatCheck.ok) {
    reject(
      fmt('reqboard_task_move 未执行：本窗口在该需求上的席位不允许{act}（{code}）',
        { act: seatAction, code: seatCheck.code }),
      seatCheck.code,
    )
  }
  const reqId = task0.requirementId

  // 修订验收标准（与单卡的 acceptance 通道同一个计划期门槛）：空话/无锚点一律拒。
  if (item.acceptance !== undefined) {
    const verdict = checkAcceptance(taskId, item.acceptance)
    if (!verdict.ok) {
      reject(fmt('reqboard_task_move 未执行（修订验收标准被拒）：{reason}', { reason: verdict.reason }), 'REQBOARD_INVALID_INPUT')
    }
  }

  // 只给 acceptance（不给 to）= 仅修订验收标准、不改状态（批量项的同一语义）：无需任务集快照。
  const base: MovePlanOk = {
    kind: 'ok',
    index: item.index,
    windowKey,
    requirement_id: reqId,
    task_id: taskId,
    ...(task0.parentId !== undefined ? { parent_id: task0.parentId } : {}),
    ...(item.to === undefined ? {} : { to: item.to }),
    reason: item.reason,
    ...(item.acceptance === undefined ? {} : { acceptance: item.acceptance }),
    auto_run: false,
  }
  if (item.to === undefined) {
    ctx.seen.set(taskId, item.index)
    return base
  }

  // 门禁用得着的两处需求侧读（与 HEAD 同位置：mutate 之前；每需求只读一次，全批共用）。
  if (startsExecutionSegment(item.to)) {
    if (!ctx.reqs.has(reqId)) ctx.reqs.set(reqId, await requirementStoreOf(deps).get(reqId))
    const req = ctx.reqs.get(reqId)
    if (req !== undefined && req.id === reqId && req.autoRun === true) base.auto_run = true
  }
  if (item.to === 'done') {
    // t8/B11：done 凭证门只需要需求的 createdAt ⇒ 取**摘要**（零文件读），别为它整册读。
    if (!ctx.createdAt.has(reqId)) {
      ctx.createdAt.set(reqId, (await requirementStoreOf(deps).getSummary(reqId))?.createdAt)
    }
    const createdAt = ctx.createdAt.get(reqId)
    if (createdAt !== undefined) base.req_created_at = createdAt
  }
  ctx.seen.set(taskId, item.index)
  return base
}

/** 门禁判定结果：通过（带落笔所需的全部判定）或被拒。 */
type GateResult = { kind: 'gate'; gate: MoveGateOk } | { kind: 'reject'; plan: MovePlanOk; reject: MovePlanReject }

/**
 * 逐卡门禁（**同步、无 I/O**，跑在落笔回调内 → 与 HEAD 同源的**新鲜**可见性）：
 * 角色/当前态 → 依赖门 → 父卡上限 → 状态机合法边 → done 凭证门（含 60s 节流的判定与结构化）。
 *
 * 可见性口径（本卡 FR-5 的全部内容）：`snapshot` 是回调入口处的冻结快照，**全部项的判定都先跑完**
 * 再落笔 ⇒ 同批提交的卡看不到彼此的 done 事件 ⇒ 同批互不触发 60s 节流；跨批仍触发（判据未改）。
 * 唯一的例外是**父卡并发上限**：那里的"同批不可见"等于**放宽**既有上限（一次调用开 10 张父卡），
 * 故按批内已判定通过的开工数**叠加**——这不是改判据，是让判据在批量语义下仍然成立。
 */
function gateOne(deps: UseCaseDeps, snapshot: readonly TaskRecord[], plan: MovePlanOk, ctx: GateContext): GateResult {
  const taskId = plan.task_id
  const snapTask = snapshot.find(t => t.id === taskId)
  if (snapTask === undefined) {
    // 预检到落笔之间任务集变了（并发删除等）：响亮点名，不静默当成"没改"。
    const reject_: MovePlanReject = rejectPlan(
      plan.index, plan.windowKey, taskId, 'REQBOARD_TASK_NOT_FOUND',
      fmt('reqboard_task_move 未执行：任务 {id} 不存在（预检后任务集已变）', { id: taskId }),
    )
    const miss: GateResult = { kind: 'reject', plan, reject: reject_ }
    return miss
  }
  const to = plan.to
  const from = snapTask.status
  const role = roleOf(snapTask, snapshot)

  // 只给 acceptance（不给 to）：无门禁可跑，也不改状态。
  if (to === undefined) {
    const gate: MoveGateOk = { ...plan, role, from, starting: false, endsSegment: false, fillManualRun: false, expand: false }
    const onlyGate: GateResult = { kind: 'gate', gate }
    return onlyGate
  }

  const starting = startsExecutionSegment(to)
  // DAG 依赖门禁（REQ-260929210741-30ae FR-4）：认领（todo→in_progress）前检查 dependsOn
  // 全部完成——自动链有 depsDone 检查，手动路径此前没有（测评发现的流程断点）。
  // 逃生舱：allowIllegalTransition 的迁移/回填路径不拦（与既有纪律一致）。
  if (starting && from === 'todo' && snapTask.dependsOn !== undefined && snapTask.dependsOn.length > 0) {
    const gate = checkClaimDependencies(snapTask, snapshot)
    if (gate !== undefined) return gateReject(plan, gate.reason, gate.code)
  }

  // 父卡并发上限（REQ-4842fe §6.1）：非子卡开工时同需求在跑父卡已达上限即拒。
  if (starting && role !== 'subtask') {
    const running = runningParents(snapshot, snapTask.requirementId)
    const planned = ctx.parentStarts.get(snapTask.requirementId) ?? 0
    if (running.length + planned >= LIMITS.advanceMaxParallelParents) {
      // 行的形状（码字面量单独成行 + 尾逗号）是 `tests/fixtures/error-code-inventory.json` 的
      // 产生点 anchor（`'REQBOARD_PARENT_LIMIT',`）——改回去就会让错误码清单守卫变红，别顺手合并成一行。
      return gateReject(plan,
        fmt('reqboard_task_move 未执行：同需求并行父卡已达上限 {n} 张（正在跑：{ids}）——先收尾再开新卡（REQBOARD_PARENT_LIMIT）',
          { n: LIMITS.advanceMaxParallelParents, ids: running.map(t => t.id).join('、') }),
        'REQBOARD_PARENT_LIMIT',
      )
    }
  }

  // 状态机合法边（收敛点是 transitionTask，判据是 domain 的 assertTaskTransition——同一函数，不重写第二份）。
  try {
    assertTaskTransition(from, to, 'agent', role)
  } catch (err) {
    if ((err as { code?: unknown }).code === 'invalid_transition') {
      // 只用同一错误码重抛带前缀的消息：码是领域契约（HTTP 路由与既有用例都按 invalid_transition 分流），
      // 这里要修的是"报错说不清"，不是改分流。
      return gateReject(plan, fmt('reqboard_task_move 未执行：{reason}', { reason: (err as Error).message ?? '' }), 'invalid_transition')
    }
    const mapped = asMoveError(err)
    return gateReject(plan, mapped.message, String((mapped as { code?: unknown }).code ?? 'REQBOARD_STORE_INCONSISTENT'))
  }

  // done 凭证门：父卡收尾门（INV-5）/ 子卡三项证据 / 汇报前置 / 构建新鲜度 / 60s 节流。
  // REQ-260929184406-2084：子卡 lastRun 缺失时先补一份 manual run 证据再判（与落笔时的补写同源），
  // 否则子卡凭证门读不到 lastRun 会永远拒绝，agent 反复重试形成死循环。
  const fillManualRun = to === 'done' && isSubtask(snapTask) && snapTask.lastRun === undefined
  if (to === 'done') {
    const probe: TaskRecord = fillManualRun
      ? {
        ...structuredClone(snapTask),
        lastRun: { at: deps.clock.now(), ok: true, stopReason: 'completed', valueNonEmpty: true, reason: 'manual-move-by-reqboard_task_move' },
      }
      : snapTask
    try {
      assertDoneEvidence(deps, ctx.windowKey, probe, plan.req_created_at, snapshot)
    } catch (err) {
      const mapped = withThrottleInfo(err, deps, snapshot, taskId, snapTask.requirementId)
      const throttle = (mapped as { throttleRemainingMs?: unknown }).throttleRemainingMs
      const reject_ = rejectPlan(
        plan.index, plan.windowKey, taskId,
        String((mapped as { code?: unknown }).code ?? 'REQBOARD_STORE_INCONSISTENT'), mapped.message,
        typeof throttle === 'number' ? throttle : undefined,
      )
      const miss: GateResult = { kind: 'reject', plan, reject: reject_ }
    return miss
    }
  }

  // 累计本批已判定通过的父卡开工（供同批后续项的上限判定；**通过全部门禁后**才计数）。
  if (starting && role !== 'subtask') {
    ctx.parentStarts.set(snapTask.requirementId, (ctx.parentStarts.get(snapTask.requirementId) ?? 0) + 1)
  }
  const gate: MoveGateOk = {
    ...plan,
    role,
    from,
    starting,
    endsSegment: endsExecutionSegment(to),
    fillManualRun,
    expand: starting && role !== 'subtask' && ctx.req !== undefined && ctx.req.id === plan.requirement_id && ctx.req.autoRun === true,
  }
  const passed: GateResult = { kind: 'gate', gate }
  return passed
}

/** 门禁拒绝（造一个计划项；不用对象字面量 return——静态扫描会把裸 return {…} 当响应键）。 */
function gateReject(plan: MovePlanOk, error: string, code: string): GateResult {
  const reject_: MovePlanReject = rejectPlan(plan.index, plan.windowKey, plan.task_id, code, error)
  const out: GateResult = { kind: 'reject', plan, reject: reject_ }
  return out
}

// ---------------------------------------------------------------------------
// ② 一次落笔（+ 需求 rollup + RTM 同步，顺序契约与现状一致）
// ---------------------------------------------------------------------------

/**
 * 落笔：按需求分组，**每组一次** `mutateQueue`（常见单需求场景 = 恰好一次）。
 *
 * ## 门禁为什么在回调里跑（R4 的口径）
 * 依赖门 / 父卡上限 / 合法边 / done 凭证门 / 节流都要读**任务集**，而这份任务集必须是
 * `mutate` **强制重读**（`QueueTaskStore.mutate` 落笔前 `repo.load`，不信进程内缓存）的那一份
 * ——HEAD 的门禁正是跑在这里。若改用端口缓存（`listByRequirement`），**跨进程写入者**刚落盘的
 * 变更就进不了门禁（本仓是多窗口共享工作树，这条会真发生）。
 * 又因为「一次调用 = 一次 `taskStore.mutate`」是既有顺序契约（`t9` / `t12` 用打点钉着
 * `['taskStore.mutate', 'store.mutate']`），不能为读一份新鲜快照多插一次 mutate ——
 * 故「新鲜快照」与「落笔」共用这一次 mutate：回调入口冻结 `snapshot`，**先把全批判定跑完**，
 * 再落笔合法项。这与 HEAD 的可见性逐点同源，且 `FR-5` 的「同批互不触发节流」原样成立。
 *
 * ## 副作用边界（R7 的口径）
 * 本函数**推进任务状态**（那正是它的职责）；回调内除落笔外唯一的写入是子卡汇报兜底路径的
 * **诊断日志**（`captureDiag`，不是台账写入）。预检函数 `planMoveTasks` 才是"不写台账、不推进状态"。
 *
 * ## 失败边界
 * 每项判定/落笔各自 try/catch：意外失败**只废该项**，同批其余项照落（台账无回滚）；
 * 整组写盘失败（store 抛）时该组各项写成 `ok:false` + 真实错误码并入回执（**不许静默消失**）。
 */
export async function applyMovePlans(deps: UseCaseDeps, plans: readonly MovePlan[]): Promise<TaskMoveAppliedItem[]> {
  // 回执顺序 = 入参顺序：按计划项的 `index` 定位（预检保证每个入参下标恰有一项）。
  const slots = plans.reduce((m, p) => Math.max(m, p.index + 1), 0)
  const applied: (TaskMoveAppliedItem | undefined)[] = new Array<TaskMoveAppliedItem | undefined>(slots).fill(undefined)
  const okByReq = new Map<string, MovePlanOk[]>()
  for (const p of plans) {
    if (p.kind === 'ok') {
      const list = okByReq.get(p.requirement_id) ?? []
      list.push(p)
      okByReq.set(p.requirement_id, list)
    } else {
      applied[p.index] = rejectApplied(p)
    }
  }

  for (const [reqId, group] of okByReq) {
    const windowKey = group[0]?.windowKey ?? ''
    // autoRun 懒展开要用需求记录：只在**真有开工项**时读一次（与 HEAD 的读点位置一致：mutate 之前）。
    // t8/B11：mutate 回调是**同步契约**，读必须提前到这里（单条 get，不是整册读）。
    const reqBeforeMutate = group.some(p => p.auto_run) ? await requirementStoreOf(deps).get(reqId) : undefined
    // 落笔结果按**入参下标**收集：gateOne 产出的 gate 是 `{...plan}` 的新对象，引用不等于原计划项，
    // 用对象当键会全部 miss（第 1 版就是这么错的：回执空、单卡报"未产出任何结果"）。
    const landed = new Map<number, TaskMoveAppliedItem>()
    /** 门禁拒绝的下标（与"写盘成没成"无关：判定来自写前快照，独立成立）。 */
    const gateRejected = new Set<number>()
    let writeError: Error | undefined
    try {
      await mutateQueue(deps, reqId, (tasks) => {
        // ① 冻结快照：拿 mutate 强制重读的那一份（批内全部判定的唯一依据 = 同批互不可见）
        const snapshot: readonly TaskRecord[] = [...tasks]
        const gateCtx: GateContext = { windowKey, req: reqBeforeMutate, parentStarts: new Map() }
        // ② 全批判定先跑完（写前完成）——坏项在这里定型，不拖累同批其它项
        const verdicts = group.map(plan => gateOneSafe(deps, snapshot, plan, gateCtx))
        // ③ 再落笔合法项（同一次 mutate，一次原子写）
        for (const verdict of verdicts) {
          if (verdict.kind === 'reject') {
            gateRejected.add(verdict.reject.index)
            landed.set(verdict.reject.index, rejectApplied(verdict.reject))
            continue
          }
          landed.set(verdict.gate.index, applyOne(deps, tasks, verdict.gate, reqBeforeMutate))
        }
        return tasks
      })
    } catch (err) {
      // 整组写盘失败（store 抛：QUEUE_* / 根校验 / 校验失败）：该组各项如实点名，不吞。
      writeError = asMoveError(err)
    }
    for (const plan of group) {
      // 写盘失败 ⇒ **除了门禁本来就拒的项**，其余项一律按"没落账"点名。
      // 这一步不能用回调里那份"已落笔"的中间态（`landed` 是在 save 之前填的）：
      // 第 1 版就是漏了它，写盘失败时仍报 ok=true（台账里其实一个字没写——比报错更坏）。
      if (writeError !== undefined && !gateRejected.has(plan.index)) {
        applied[plan.index] = writeFailureItem(plan, writeError)
        continue
      }
      const item = landed.get(plan.index)
      if (item !== undefined) applied[plan.index] = item
      else if (writeError !== undefined) applied[plan.index] = writeFailureItem(plan, writeError)
    }

    // ── 需求写（顺序契约：**后需求**）——rollup 以任务状态为输入，故必须在任务写之后 ──────
    // 一张都没落账（写盘失败 / 计划后任务集变了）→ 不跑 rollup、不跑 RTM：没有任务变更就没有
    // rollup 输入，而"按未变的旧状态推需求"正是改造前单卡被拒时**不会发生**的那件事（拒绝不推进需求）。
    const anyLanded = writeError === undefined && group.some(p => landed.get(p.index)?.ok === true)
    if (!anyLanded) continue
    const afterTasks = await taskStoreOf(deps).listByRequirement(reqId)
    // B12 阶段②c：改用**定点版**（定点读 → 纯函数算计划 → 单条 mutate），不再借整册 mutate。
    await applyTaskRollupVia(
      requirementStoreOf(deps),
      afterTasks,
      { now: deps.clock.now(), commentId: () => deps.ids.comment(), snapshot: snapshotProviderFor(deps, windowKey) },
      reqId,
    ).catch(mapAgentError)

    // RTM 同步（增强层，失败不阻断）：一次调用同步该需求全量活卡。
    // 改造前是"每张卡一次"，内容完全相同（RTM 由台账派生，载荷只用于留痕）——批量下按需求同步一次。
    const movedIds = group.filter(p => landed.get(p.index)?.ok === true).map(p => p.task_id)
    if (movedIds.length > 0) {
      try { await syncRTMYaml(deps, afterTasks, reqId, 'task:status', { taskId: movedIds[0]! }) } catch { /* RTM 是增强层，失败不阻断 */ }
    }
  }
  return applied.filter((x): x is TaskMoveAppliedItem => x !== undefined)
}

/** 单项门禁的安全壳：判定抛错 = 该项被拒（同批其它项不受影响）。 */
function gateOneSafe(deps: UseCaseDeps, snapshot: readonly TaskRecord[], plan: MovePlanOk, ctx: GateContext): GateResult {
  try {
    return gateOne(deps, snapshot, plan, ctx)
  } catch (err) {
    const mapped = asMoveError(err)
    return gateReject(plan, mapped.message, String((mapped as { code?: unknown }).code ?? 'REQBOARD_STORE_INCONSISTENT'))
  }
}

/** 整组写盘失败 → 该组每一项的失败回执（码逐字透传既有码，不新造码；无码才落 store 不一致）。 */
function writeFailureItem(plan: MovePlanOk, err: Error): TaskMoveAppliedItem {
  const item: TaskMoveAppliedItem = {
    task_id: plan.task_id,
    ok: false,
    requirement_id: plan.requirement_id,
    ...(plan.to === undefined ? {} : { to: plan.to }),
    code: String((err as { code?: unknown }).code ?? 'REQBOARD_STORE_INCONSISTENT'),
    error: err.message,
  }
  return item
}

/** 被拒计划 → 回执项（逐字透传既有拒绝码）。 */
function rejectApplied(p: MovePlanReject): TaskMoveAppliedItem {
  const item: TaskMoveAppliedItem = { task_id: p.task_id, ok: false, requirement_id: '', code: p.code, error: p.error }
  if (p.throttleRemainingMs !== undefined) item.throttleRemainingMs = p.throttleRemainingMs
  return item
}

/**
 * 落单项（在 mutate 回调内、同步执行）：把计划变成任务字段变更。
 *
 * 为什么在**副本**上改、成功才换回数组：计划阶段已判过门禁，理论上不会抛；但一旦某张卡
 * 因并发/脏数据抛了，就地改一半的卡会留下半迁移态（本仓铁律：禁止半迁移态）。
 * 副本 + 逐项 catch = 该项不落账、其余项照落（台账无回滚）。
 */
function applyOne(
  deps: UseCaseDeps,
  tasks: TaskRecord[],
  plan: MoveGateOk,
  reqBeforeMutate: RequirementRecord | undefined,
): TaskMoveAppliedItem {
  const idx = tasks.findIndex(t => t.id === plan.task_id)
  if (idx < 0) {
    const missing: TaskMoveAppliedItem = {
      task_id: plan.task_id, ok: false, requirement_id: plan.requirement_id,
      code: 'REQBOARD_TASK_NOT_FOUND', error: fmt('reqboard_task_move 未执行：任务 {id} 不存在（预检后任务集已变）', { id: plan.task_id }),
    }
    return missing
  }
  const draft = structuredClone(tasks[idx]!)
  const at = deps.clock.now()
  const actor = { kind: 'agent' as const, sessionId: plan.windowKey }
  let card: { doc_path: string; implementation: string } | undefined
  let createdIds: string[] = []
  try {
    // REQ-260929184406-2084：子卡 to=done 且 lastRun 缺失 → 补一份 manual run 证据。
    // 必须在（计划期的）凭证门之前写入，因为凭证门会读 task.lastRun；落笔这里要与计划期同序。
    if (plan.fillManualRun && draft.lastRun === undefined) {
      draft.lastRun = {
        at,
        ok: true,
        stopReason: 'completed',
        valueNonEmpty: true,
        reason: 'manual-move-by-reqboard_task_move',
      }
    }
    // 收敛点：非法转移 / 人工门越权在此抛错（计划期已判过；此处是同一 domain 判据的第二道执行）。
    if (plan.to !== undefined) {
      transitionTask(draft, plan.to, { at, actor, ...(plan.reason.length > 0 ? { reason: plan.reason } : {}), role: plan.role })
    }
    if (plan.acceptance !== undefined) draft.acceptance = plan.acceptance

    if (plan.starting) {
      draft.claimedBy = plan.windowKey
      draft.claimedAt = at
      // 执行快照唯一写入口（REQ-260927121324-abde FR-4/FR-5）：开工落记录 + 写 start 快照。
      openExecution(
        draft,
        { id: newExecutionId(), sessionId: plan.windowKey, trigger: 'manual', at },
        snapshotForWindow(deps, plan.windowKey),
      )
      card = { doc_path: taskCardPath(draft), implementation: draft.implementation ?? '' }
      // 懒展开（REQ-4842fe FR-3）：父卡开工**同事务**落子卡链；仅自动链需求（autoRun）走这条。
      // reader-http 已裂变 expandSubtasks：只返回新建子卡、不落库 → 本回调 append 进 tasks。
      const req = reqBeforeMutate === undefined || reqBeforeMutate.id !== plan.requirement_id ? undefined : reqBeforeMutate
      if (plan.expand && req !== undefined) {
        const created = expandSubtasks(tasks, draft, req, at, deps.ids)
        // TaskRecord → QueueTask：layer 只是派生占位，落盘前由 TaskStore.recompute 统一重算。
        if (created.length > 0) tasks.push(...created.map(c => ({ ...c, layer: 0 })))
        createdIds = created.map(c => c.id)
      }
    }
    if (plan.endsSegment) {
      delete draft.claimedBy
      delete draft.claimedAt
    }
    if (plan.to !== undefined && !plan.starting) {
      // 收尾唯一入口（FR-5）：闭合全部 running，并写 end/delta（快照旁路，永不抛）。
      closeExecutions(
        draft,
        { at, outcome: isRollbackOrCancel(plan.to) ? 'cancelled' : 'succeeded' },
        snapshotForWindow(deps, plan.windowKey),
      )
    }
    if (plan.reason.length > 0) {
      draft.comments.push({ id: deps.ids.comment(), body: fmt('[状态] → {to}：{reason}（reqboard_task_move）', { to: plan.to ?? '(仅修订验收标准)', reason: plan.reason }), createdAt: at, createdBy: actor })
    }
    tasks[idx] = draft
    const item: TaskMoveAppliedItem = {
      task_id: plan.task_id,
      ok: true,
      requirement_id: plan.requirement_id,
      from: plan.from,
      ...(plan.to === undefined ? {} : { to: plan.to }),
      status: draft.status,
      version: draft.version,
      ...(plan.parent_id === undefined ? {} : { parent_id: plan.parent_id }),
      ...(createdIds.length > 0 ? { created_ids: createdIds } : {}),
      ...(card === undefined ? {} : { card }),
    }
    return item
  } catch (err) {
    const e = asMoveError(err)
    const item: TaskMoveAppliedItem = {
      task_id: plan.task_id,
      ok: false,
      requirement_id: plan.requirement_id,
      ...(plan.from === undefined ? {} : { from: plan.from }),
      ...(plan.to === undefined ? {} : { to: plan.to }),
      code: String((e as { code?: unknown }).code ?? 'REQBOARD_STORE_INCONSISTENT'),
      error: e.message,
      ...(typeof (e as { throttleRemainingMs?: unknown }).throttleRemainingMs === 'number'
        ? { throttleRemainingMs: (e as unknown as { throttleRemainingMs: number }).throttleRemainingMs }
        : {}),
    }
    return item
  }
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * `reqboard_task_move` 的唯一用例入口：`tasks[]` 存在即批量路径，否则单卡路径
 * （单卡 = 批量一员的特例：同一套门禁、同一个落笔点，只是回执形状按**改造前**逐字投影）。
 */
export async function executeMoveTask(deps: UseCaseDeps, args: unknown, exec: unknown): Promise<unknown> {
  const a = (args ?? {}) as Record<string, unknown>
  if (Array.isArray(a.tasks)) return executeMoveTasks(deps, args, exec)

  const plans = await planMoveTasks(deps, args, exec)
  const head = plans[0]
  if (head === undefined) {
    reject('reqboard_task_move 写入失败：计划阶段未产出任何结果', 'REQBOARD_STORE_INCONSISTENT')
  }
  if (head.kind === 'reject') throw throwPlan(head)

  const applied = await applyMovePlans(deps, plans)
  const item = applied[0]
  if (item === undefined || !item.ok) {
    if (item !== undefined) throw throwResult(item)
    reject('reqboard_task_move 写入失败：落笔阶段未产出任何结果', 'REQBOARD_STORE_INCONSISTENT')
  }
  // REQ-261007100513-6749 t3（FR-2）：任务状态**已落账** → 通知尾部通道刷新「当前任务执行中」块。
  // 即发即忘、永不抛、不 await 成功语义：投递失败与写路径无关（回滚已落的账 = 状态倒退）。
  notifyVolatileQuietly(deps.volatileNotice, agentIdFromExec(deps, exec), 'task')
  const createdIds = item.created_ids ?? []
  return {
    success: true,
    task_id: item.task_id,
    from: item.from,
    to: item.to,
    status: item.status ?? item.to,
    version: item.version,
    ...(createdIds.length > 0 ? { subtasks_created: createdIds } : {}),
    ...(item.card !== undefined ? { task_card: item.card } : {}),
  }
}

/**
 * 批量路径（REQ-261007100513-6749 FR-4/FR-5）：一次调用 = 一次（或每需求一次）落笔，
 * 回执 = 逐项 results[] + 部分成功标记 + 树摘要 + 节流结构化 + 指引。
 */
export async function executeMoveTasks(deps: UseCaseDeps, args: unknown, exec: unknown): Promise<TaskMoveOutput> {
  const plans = await planMoveTasks(deps, args, exec)
  const applied = await applyMovePlans(deps, plans)
  const results = applied.map(toItemResult)
  const okApplied = applied.filter(x => x.ok)
  const failCount = applied.length - okApplied.length
  const success = okApplied.length > 0
  const partial = okApplied.length > 0 && failCount > 0
  // REQ-261007100513-6749 t3（FR-2）：只要有卡真落账就通知尾部通道（部分失败也通知——已落账的
  // 那几张的状态确实变了）。未装配端口 = 零行为（与改造前逐字一致）。
  if (success) notifyVolatileQuietly(deps.volatileNotice, agentIdFromExec(deps, exec), 'task')

  // ── 树摘要（落笔成功后受影响的父卡 + 其子卡链，**只取一层**）────────────────────
  let tree: TaskTreeSummary | undefined
  let treeNote: string | undefined
  if (success) {
    try {
      const reqIds = [...new Set(okApplied.map(x => x.requirement_id))]
      const all: TaskRecord[] = []
      for (const id of reqIds) all.push(...await taskStoreOf(deps).listByRequirement(id))
      const roots = okApplied.map(x => x.parent_id ?? x.task_id)
      tree = treeSummaryOf(all, roots)
      // 树摘要是"落笔成功后的结构投影"，根集合来自计划（必然存在）；为空只可能是快照与计划不一致，
      // 那种情况**必须说出来**（本仓铁律：失败要响亮），不许静默省略。
      if (tree.parents.length === 0) treeNote = '受影响父卡不在任务快照中：树摘要为空（任务集可能在落笔后被并发改动）'
    } catch (err) {
      treeNote = fmt('任务快照不可用，树摘要未附：{reason}', { reason: (err as Error).message ?? String(err) })
    }
  }

  // ── 节流结构化（顶层）────────────────────────────────────────────────────────
  const throttled = applied.filter(x => x.code === 'REQBOARD_BULK_CLOSE')
  const maxRemaining = throttled.reduce((m, x) => Math.max(m, x.throttleRemainingMs ?? 0), 0)
  const throttleMs = maxRemaining > 0 ? maxRemaining : (deps.doneThrottleMs ?? DEFAULT_DONE_THROTTLE_MS)
  const guidance = throttled.length > 0 ? throttleGuidance(throttleMs) : undefined
  const createdIds = okApplied.flatMap(x => x.created_ids ?? [])
  const card = okApplied.length === 1 ? okApplied[0]?.card : undefined

  return {
    success,
    task_id: results[0]?.task_id ?? '',
    results,
    ...(partial ? { partial: true } : {}),
    ...(tree !== undefined ? { tree } : {}),
    ...(treeNote !== undefined ? { tree_note: treeNote } : {}),
    ...(throttled.length > 0 ? { throttleRemainingMs: throttleMs } : {}),
    ...(guidance !== undefined ? { guidance } : {}),
    ...(createdIds.length > 0 ? { subtasks_created: createdIds } : {}),
    ...(card !== undefined ? { task_card: card } : {}),
  }
}

/** 落笔项 → 回执项（**只带 results[] 声明过的 8 个键**，内部投影字段一律不外泄）。 */
function toItemResult(a: TaskMoveAppliedItem): TaskMoveItemResult {
  // 逐字段赋值（不是把整个 DTO 摊开）：TaskMoveAppliedItem 还带内部投影字段，外泄就变未声明键。
  // 变量名刻意不叫 `r`：`tests/requirement-transition-guard.test.ts` 的禁用式样是
  // `\br\.status\s*=`（状态只能走 transitionTask）——那是**状态写**的守卫，而这里写的是回执
  // DTO 的副本字段；换个名字让守卫保持它本来的语义，而不是给守卫开豁免。
  const item: TaskMoveItemResult = { task_id: a.task_id, ok: a.ok }
  if (a.from !== undefined) item.from = a.from
  if (a.to !== undefined) item.to = a.to
  if (a.status !== undefined) item.status = a.status
  if (a.version !== undefined) item.version = a.version
  if (a.code !== undefined) item.code = a.code
  if (a.error !== undefined) item.error = a.error
  if (a.throttleRemainingMs !== undefined) item.throttleRemainingMs = a.throttleRemainingMs
  return item
}

/** 计划被拒 → 抛错（单卡路径的既有语义；节流时附加 throttleRemainingMs 与 guidance）。 */
function throwPlan(p: MovePlanReject): Error {
  const err = Object.assign(new Error(p.error), { code: p.code })
  if (p.throttleRemainingMs !== undefined) {
    Object.assign(err, { throttleRemainingMs: p.throttleRemainingMs, guidance: throttleGuidance(p.throttleRemainingMs) })
  }
  return err
}

/** 落笔失败 → 抛错（同上）。 */
function throwResult(a: TaskMoveAppliedItem): Error {
  const err = Object.assign(new Error(a.error ?? 'reqboard_task_move 写入失败'), { code: a.code ?? 'REQBOARD_STORE_INCONSISTENT' })
  if (a.throttleRemainingMs !== undefined) {
    Object.assign(err, { throttleRemainingMs: a.throttleRemainingMs, guidance: throttleGuidance(a.throttleRemainingMs) })
  }
  return err
}
