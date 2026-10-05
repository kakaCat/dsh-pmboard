/**
 * AdvanceChain 用例（REQ-4842fe t7 / FR-11、FR-12）——**事件链执行器**。
 *
 * 机制一句话：不是"一条传送带一直转"，而是"推倒第一张骨牌，它自己撞倒下一张"——
 * 每完成一步自动触发下一步，直到 ROLLUP（需求进验收）或 PAUSE（失败/熔断/人工关闭）。
 *
 * 四性（design/architecture §4）：
 *  - 小：一次事件只推进一张子卡 / 一步收尾；
 *  - 幂等：选择依据全部来自台账状态（重复触发只会 noop）；
 *  - 可中断：不触发下一步，链即停住；
 *  - 留痕：台账 advance.history + docs/requirements/<REQ>/advance-log.md。
 *
 * 并发：进程内单飞 Set + 台账 advance.lockAt（stale 阈值可接管）。
 *
 * @module dsh-pmboard/application/use-cases/AdvanceChain
 */
import type { UseCaseDeps } from '../ports.js'
import { fmt } from '../../domain/text/fmt.js'
import { LIMITS } from '../../domain/limits.js'
import {
  hasOpenWork,
  selectAdvanceBatch,
  subtasksOf,
  type AdvanceSelection,
} from '../internal/advance-select.js'
import { groupSubtaskEvents } from '../internal/advance-parallel.js'
import { executeSubtask } from './ExecuteTask.js'
import { expandSubtasks } from '../internal/lazy-expand.js'
import { applyTaskRollupVia } from '../internal/rollup.js'
import { assertDoneEvidence, dispatchOwnerOf, assertWritableRequirementProject } from '../internal/support.js'
// REQ-261002141430-a5ef FR-1：派卡准入的"有人在等吗"判据（在途弹框 → 本轮不派卡）
import { dialogInFlightFor } from '../internal/awaiting-confirm.js'
import { classifyFailure, isTransientAbort, rollbackSubtask } from '../internal/failure-handling.js'
import {
  type AdvanceEvent,
  type AdvanceRecord,
  type TaskRecord,
} from '../../shared/protocol.js'
import { transitionTask } from '../internal/task-transition.js'
import {
  closeExecutions,
  openExecution,
  safeWindowKey,
  snapshotForWindow,
  snapshotProviderFor,
} from '../internal/token-usage.js'
import { requirementStoreOf, taskStoreOf, mutateIfPresent } from './queue-access.js'

export type AdvanceStop =
  | 'rollup' | 'paused' | 'noop' | 'terminal' | 'not_autorun' | 'not_found' | 'max_steps' | 'locked'
  /**
   * 人工门禁弹框在途（REQ-261002141430-a5ef FR-1）：本轮不派卡，等作答。
   * **不置 autoRun=false、不计 noopStreak**——等人不是停摆，也不是停滞熔断的形态。
   */
  | 'awaiting-confirm'
  /**
   * 后台任务**投递失败**（REQ-261002173819-69c7 FR-1）：没有 run 在跑、锁已回收、可立刻重试。
   * 此前这一支返回 `'not_found'`，于是工具壳把它映射成 `REQBOARD_REQ_NOT_FOUND`（"需求不存在"）——
   * 一条纯误导的回执；独立取值后落到兜底映射 `REQBOARD_DISPATCH_FAILED`。
   */
  | 'dispatch_failed'
  /**
   * 全局在制上限已满（FR-4，REQ-261004110201-f253）：本轮未投递本需求（不是错误，是排队）。
   * 回执 reason 点名在跑的需求、上限值与解除方式。
   */
  | 'wip_limit'
  /**
   * 子卡执行引擎不可达（REQ-261004065652-5c1c FR-10）：**开工前**预检拦下，本次不落任何子卡。
   * 与 `dispatch_failed` 的区别：那是有 run 但投递失败；这里是**根本不该开工**（环境前提不满足）。
   */
  | 'engine_unreachable'
  /**
   * manual 段（人工核对）停链等人（REQ-261003203909-55f2 FR-2）：核对清单骨架已落盘、子卡停在
   * in_progress 等人动手。**不动 autoRun、不计 noopStreak、不是失败**（同 awaiting-confirm 的口径——
   * 等人不是停摆）；人核对后窗口 agent 调 reqboard_task_report 补核对记录，链即续跑。
   */
  | 'awaiting-manual'

export interface AdvanceStep {
  event: AdvanceEvent
  outcome: 'ok' | 'failed' | 'skipped' | 'noop'
  parentId?: string
  subtaskId?: string
  detail: string
  durationMs: number
}

export interface AdvanceOutcome {
  requirementId: string
  steps: AdvanceStep[]
  stopped: AdvanceStop
  /** 是否成功投递（REQ-260925110957-552d FR-1） */
  dispatched?: boolean
  /** Job ID（dispatched=true 时） */
  job_id?: string
  /** Run ID（dispatched=true 时） */
  run_id?: string
  /** 拒绝原因（dispatched=false 时） */
  reason?: string
  /** 已有的 run ID（幂等检查时） */
  existing_run_id?: string
}

/** 进程内单飞（同需求同时只允许一个事件在跑）。 */
const inflight = new Set<string>()

const TERMINAL_REQ = new Set(['accepting', 'archived', 'canceled', 'done'])

function stepOf(
  event: AdvanceEvent,
  outcome: AdvanceStep['outcome'],
  detail: string,
  startedAt: number,
  now: number,
  extra: Partial<AdvanceStep> = {},
): AdvanceStep {
  return { event, outcome, detail, durationMs: Math.max(0, now - startedAt), ...extra }
}

async function appendHistory(deps: UseCaseDeps, requirementId: string, record: AdvanceRecord): Promise<void> {
  await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
    const adv = (req.advance ??= {})
    adv.history = [...(adv.history ?? []), record]
    return { changed: true }
  })
  // 事件日志（append-only，best-effort：写文档失败不改变链的推进结果）
  try {
    // REQ-261001203710-0fbf t7 / FR-2：推进日志是工作区相对落盘，写前按需求 id 核验根
    await assertWritableRequirementProject(deps, requirementId)
    const path = fmt('docs/requirements/{req}/advance-log.md', { req: requirementId })
    const prev = deps.docs.exists(path) ? await deps.docs.read(path) : '# 推进事件日志\n'
    const line = fmt('- {at} [{event}] parent={parent} subtask={sub} {outcome}：{detail}', {
      at: new Date(record.at).toISOString(),
      event: record.event,
      parent: record.parentId ?? '-',
      sub: record.subtaskId ?? '-',
      outcome: record.outcome,
      detail: record.detail,
    })
    await deps.docs.write(path, prev.replace(/\s*$/, '\n') + line + '\n')
  } catch { /* 日志失败不影响链 */ }
}

async function pauseRequirement(deps: UseCaseDeps, requirementId: string, reason: string, detail: string): Promise<void> {
  const now = deps.clock.now()
  await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
    req.autoRun = false
    const adv = (req.advance ??= {})
    adv.pausedReason = reason
    adv.noopStreak = 0
    adv.history = [...(adv.history ?? []), { at: now, requirementId, event: 'PAUSE', outcome: 'skipped', durationMs: 0, detail }]
    req.comments.push({
      id: deps.ids.comment(),
      body: fmt('[自动链暂停] {reason}：{detail}（autoRun 已置 false，可人工继续）', { reason, detail }),
      createdAt: now,
      createdBy: { kind: 'system' },
    })
    return { changed: true }
  })
}

/**
 * 投递失败后**回收推进锁**并留痕（REQ-261002173819-69c7 FR-1/FR-2）。
 *
 * 为什么必须回收：`advance.lockAt/runId` 是"有 run 在跑"的唯一凭据，而锁是在 `jobs.start`
 * **之前**认领的。投递抛错时根本没有 run，留着这把锁就把自己挡死 `LIMITS.advanceLockStaleMs`
 * （15 分钟，2026-10-02 实测：08:36:10 的 reqboard_task_run 被 REQBOARD_ADVANCE_LOCKED 挡下）。
 *
 * 三条纪律：
 *  ① **只清自己认领的那把**（`adv.runId === 本次 runId`），绝不误伤别人的新鲜锁；
 *  ② 失败必须留痕（`advance.history` + comment），且正文含 requirementId 与分类，**不得**出现
 *     `[object Object]`（那是投递失败最难诊断的形态）；
 *  ③ 本函数失败不吞掉投递失败本身——调用方据返回值决定 reason，另把回收异常追加进去。
 */
async function releaseClaim(
  deps: UseCaseDeps, requirementId: string, runId: string, kind: string, message: string,
): Promise<void> {
  const now = deps.clock.now()
  await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
    const adv = req?.advance
    if (adv === undefined) return undefined
    if (adv.runId !== runId) return undefined
    adv.lockAt = undefined
    adv.runId = undefined
    adv.history = [
      ...(adv.history ?? []),
      {
        at: now, requirementId, event: 'DISPATCH_FAILED', outcome: 'failed', durationMs: 0,
        detail: kind + ': ' + message,
      },
    ]
    req.comments.push({
      id: deps.ids.comment(),
      body: fmt('[自动链投递失败] {req} 未能投递后台任务（原因：{kind}）。锁已回收，可直接重试 reqboard_task_run。原始错误：{msg}', {
        req: requirementId, kind, msg: message,
      }),
      createdAt: now,
      createdBy: { kind: 'system' },
    })
    req.updatedAt = now
    return { changed: true }
  })
}

async function openParent(deps: UseCaseDeps, requirementId: string, parentId: string, startedAt: number, exec?: unknown): Promise<AdvanceStep> {
  const now = deps.clock.now()
  const store = taskStoreOf(deps)
  // 需求侧只读（台账仍在）：req 供 autoRun/sourceSessionId；任务一律走队列（v9 无 tasks）。
  const req = await requirementStoreOf(deps).get(requirementId)
  let created: TaskRecord[] = []
  // 顺序契约（REQ-260927202051-f6df t9）：任务写经 TaskStore，本函数**不动需求**（comments 等由
  // advance-history 单独写），故不存在任务/需求交错。
  const changed = await store.mutate(requirementId, (tasks) => {
    const parent = tasks.find((t) => t.id === parentId)
    if (req === undefined || parent === undefined || parent.status !== 'todo') return undefined
    const active = tasks.filter(
      (t) => t.parentId === undefined && t.status === 'in_progress',
    ).length
    if (active >= LIMITS.advanceMaxParallelParents) return undefined
    transitionTask(parent, 'in_progress', { at: now, actor: { kind: 'system' }, role: 'parent' })
    parent.claimedAt = now
    parent.claimedBy = 'system'
    // 执行快照唯一写入口（REQ-260927121324-abde FR-4）：开工落记录 + 写 start 快照。
    // 自动链父卡会话码 = safeWindowKey(deps, exec) ?? req.sourceSessionId；解析不到（system /
    // 无 agent）→ 诚实不写快照（缺失 ≠ 0，禁止编造 token 归属）。
    const sessionKey = safeWindowKey(deps, exec) ?? req.sourceSessionId
    openExecution(
      parent,
      {
        id: deps.ids.execution(),
        trigger: 'auto',
        at: now,
        ...(sessionKey !== undefined ? { sessionId: sessionKey } : {}),
      },
      snapshotForWindow(deps, sessionKey),
    )
    // 懒展开（reader-http 已裂变）：只返回新建子卡、不落库 → 由本回调 append 进 draft。
    created = expandSubtasks(tasks, parent, req, now, deps.ids)
    // TaskRecord → QueueTask：layer 为派生占位，落盘前由 TaskStore.recompute 重算。
    if (created.length > 0) tasks.push(...created.map(c => ({ ...c, layer: 0 })))
    return tasks
  })
  if (changed.length === 0) {
    return stepOf('OPEN_PARENT', 'noop', fmt('父卡 {id} 不可开工（已在跑/已达并发上限）', { id: parentId }), startedAt, deps.clock.now(), { parentId })
  }
  return stepOf('OPEN_PARENT', 'ok', fmt('父卡 {id} 自动开工并落子卡 {n} 张', { id: parentId, n: created.length }), startedAt, deps.clock.now(), { parentId })
}

async function finalizeParent(deps: UseCaseDeps, parentId: string, startedAt: number, exec?: unknown): Promise<AdvanceStep> {
  const now = deps.clock.now()
  const store = taskStoreOf(deps)
  const parent0 = await store.get(parentId)
  // t8/B11：只取该需求整条（原为整册读里 find 一条）
  const parentReq = parent0 === undefined ? undefined : await requirementStoreOf(deps).get(parent0.requirementId)
  try {
    const changed = await store.mutate(parent0?.requirementId ?? '', (tasks) => {
      const parent = tasks.find((t) => t.id === parentId)
      if (parent === undefined || parent.status !== 'in_progress') return undefined
      const subs = subtasksOf({ tasks }, parent.id)
      if (subs.length === 0 || !subs.every((s) => s.status === 'done' || s.status === 'canceled')) return undefined
      const files = [...new Set(subs.flatMap((s) => s.lastReport?.filesChanged ?? []))]
      const completed = [...new Set(subs.flatMap((s) => s.lastReport?.completed ?? []))]
      parent.lastReport = {
        at: now,
        reportIndex: (parent.lastReport?.reportIndex ?? 0) + 1,
        filesChanged: files,
        completed: completed.length > 0 ? completed : [fmt('子卡 {n} 张全部完成', { n: subs.length })],
      }
      // D4：assertDoneEvidence 新签名 (deps, windowKey, task, ledger, tasks)。
      assertDoneEvidence(deps, 'system', parent, parentReq?.createdAt, tasks)
      transitionTask(parent, 'done', { at: now, actor: { kind: 'system' }, role: 'parent' })
      // 收尾唯一入口（REQ-260927121324-abde FR-5）：闭合全部 running 并写 end/delta（快照在收尾
      // 时刻新取，非开工旧值）；会话码解析同 openParent，无会话只闭合记录、不写 token 字段。
      const sessionKey = safeWindowKey(deps, exec) ?? parentReq?.sourceSessionId
      closeExecutions(parent, { at: now, outcome: 'succeeded' }, snapshotForWindow(deps, sessionKey))
      return tasks
    })
    if (changed.length === 0) {
      return stepOf('FINALIZE_PARENT', 'noop', fmt('父卡 {id} 尚不可收尾', { id: parentId }), startedAt, deps.clock.now(), { parentId })
    }
    return stepOf('FINALIZE_PARENT', 'ok', fmt('父卡 {id} 汇总子卡产出并收尾', { id: parentId }), startedAt, deps.clock.now(), { parentId })
  } catch (err) {
    return stepOf('FINALIZE_PARENT', 'failed', (err as Error).message, startedAt, deps.clock.now(), { parentId })
  }
}

/**
 * manual 段（人工核对）分支（REQ-261003203909-55f2 FR-2 / design interfaces §4）——
 * 「这步归人」的显式形态：**不派 workflow run**，生成核对清单骨架后停链等人。
 *
 * 四步契约：① 清单骨架落盘（含生成时间戳——凭证门 mtime 判定的锚：核对后的更新必须晚于它，
 * 只生成骨架不核对过不了门）；② 子卡 todo → in_progress（开执行记录，trigger='auto'）；
 * ③ comment + alert 告诉人「该你动手了」；④ 返回 AWAIT_MANUAL → 链停 awaiting-manual。
 *
 * 幂等：子卡已在 in_progress（= 已在等人）→ 不重写清单（防止覆盖人正在填的核对结果），
 * 返回 noop 但仍停链（重复触发只会原地等）。
 */
async function awaitManualStep(deps: UseCaseDeps, requirementId: string, parentId: string, subtaskId: string, startedAt: number, exec?: unknown): Promise<AdvanceStep> {
  const now = deps.clock.now()
  const store = taskStoreOf(deps)
  const sub = await store.get(subtaskId)
  const parent = await store.get(parentId)
  const checklistPath = fmt('docs/requirements/{req}/manual/{task}.md', { req: requirementId, task: subtaskId })

  if (sub === undefined) {
    return stepOf('AWAIT_MANUAL', 'failed', fmt('manual 子卡 {id} 不存在', { id: subtaskId }), startedAt, deps.clock.now(), { parentId, subtaskId })
  }
  if (sub.status !== 'todo') {
    // 已在等人（或已完成）——原地停链，不重写清单（幂等，防覆盖人工填写中的核对结果）
    return stepOf('AWAIT_MANUAL', 'noop', fmt('子卡 {id} 已在等人工核对（清单：{path}）', { id: subtaskId, path: checklistPath }), startedAt, deps.clock.now(), { parentId, subtaskId })
  }

  // ① 清单骨架落盘（核对项拆自父卡验收标准；生成时间戳是防伪造锚点）
  const items = (parent?.acceptance ?? '').split(/\n|；|;/).map((s) => s.trim()).filter((s) => s.length > 0)
  const checklist = [
    '# 人工核对清单 · ' + (sub.title || subtaskId),
    '',
    '> 骨架生成时间：' + new Date(now).toISOString() + '（' + now + '）——本文件由实施链生成；',
    '> 人完成核对后，由窗口 agent 把核对结果写进本文件（**更新必须晚于骨架生成时间**，凭证门据此防伪造），',
    '> 再调 reqboard_task_report（filesChanged 含本文件与截图/证据路径），链即续跑。',
    '',
    '## 核对项',
    ...(items.length > 0
      ? items.map((it) => '- [ ] ' + it + ' —— 结果：（通过 / 不通过+现象）；证据：（截图/路径）')
      : ['- [ ] （父卡未写验收标准，按父卡标题与实施方案逐项核对）—— 结果：；证据：']),
    '',
    '## 核对结论',
    '（待人工填写：总体结论 + 核对时间 + 核对人）',
    '',
  ].join('\n')
  try {
    await deps.docs.write(checklistPath, checklist)
  } catch (err) {
    return stepOf('AWAIT_MANUAL', 'failed', fmt('核对清单落盘失败：{err}', { err: err instanceof Error ? err.message : String(err) }), startedAt, deps.clock.now(), { parentId, subtaskId })
  }

  // ② 子卡 todo → in_progress（开执行记录 + 写骨架时间锚；会话码解析同 openParent，解析不到诚实不写快照）
  const req = await requirementStoreOf(deps).get(requirementId)
  const sessionKey = safeWindowKey(deps, exec) ?? req?.sourceSessionId
  await store.mutate(requirementId, (tasks) => {
    const t = tasks.find((x) => x.id === subtaskId)
    if (t === undefined || t.status !== 'todo') return undefined
    transitionTask(t, 'in_progress', { at: now, actor: { kind: 'system' }, role: 'subtask' })
    // 防伪造锚点（FR-2）：凭证门对 manual 段的新鲜度基准收紧为「晚于骨架生成」。
    t.manualSkeletonAt = now
    openExecution(
      t,
      { id: deps.ids.execution(), trigger: 'auto', at: now, ...(sessionKey !== undefined ? { sessionId: sessionKey } : {}) },
      snapshotForWindow(deps, sessionKey),
    )
    return tasks
  })

  // ③ comment + alert（告诉人「该你动手了」；告警失败不阻断语义）
  const note = fmt('子卡 {sub}（{title}）需人工核对：清单 {path}；完成后 reqboard_task_report 补记录即续跑', {
    sub: subtaskId, title: sub.title, path: checklistPath,
  })
  await mutateIfPresent(requirementStoreOf(deps), requirementId, (r2) => {
    r2.comments.push({
      id: deps.ids.comment(),
      body: fmt('[人工核对] {note}', { note }),
      createdAt: now,
      createdBy: { kind: 'system' },
    })
    return { changed: true }
  })
  try {
    deps.alert?.alert({
      requirementId,
      title: fmt('【需人工核对】{req}', { req: requirementId }),
      content: note,
    })
  } catch { /* 告警失败不阻断停链语义 */ }

  return stepOf('AWAIT_MANUAL', 'ok', fmt('manual 子卡 {id}：核对清单已落盘，链停下等人（autoRun 不变）', { id: subtaskId }), startedAt, deps.clock.now(), { parentId, subtaskId })
}

async function runSubtaskStep(deps: UseCaseDeps, requirementId: string, parentId: string, subtaskId: string, startedAt: number, exec?: unknown, runSignal?: AbortSignal): Promise<AdvanceStep> {
  // REQ-261003203909-55f2 FR-2：manual 段不派 workflow run（引擎干不了人的活），走停链等人分支。
  const sub = await taskStoreOf(deps).get(subtaskId)
  if (sub?.stageKind === 'manual') {
    return awaitManualStep(deps, requirementId, parentId, subtaskId, startedAt, exec)
  }
  // REQ-4842fe design/architecture §3：`parent: exec.agent`——调用者 agent 必须一路透传到引擎，
  // 否则 workflow-ptc 读 request.parent.session 直接抛错（start_failed）。缺 exec 时保持原样，
  // 由引擎显式失败（不静默成功）。
  const r = await executeSubtask(deps, {
    subtaskId,
    windowKey: 'system',
    ...(exec !== undefined ? { exec } : {}),
    // Phase2：把**后台 job 的 signal** 透传下去（取消权归工作单元，不是派发它的 turn）。
    ...(runSignal !== undefined ? { runSignal } : {}),
  })
  return stepOf(
    'RUN_SUBTASK',
    r.ok ? 'ok' : 'failed',
    r.ok ? fmt('子卡 {id} 执行完成', { id: subtaskId }) : (r.reason ?? '执行失败'),
    startedAt,
    deps.clock.now(),
    { parentId, subtaskId },
  )
}

async function rollupStep(deps: UseCaseDeps, requirementId: string, startedAt: number, exec?: unknown): Promise<AdvanceStep> {
  const now = deps.clock.now()
  // D6：rollup 的输入任务改从队列取（台账 v9 无 tasks）；repo.mutate 只写需求（顺序契约的"后"）。
  const rollupTasks = await taskStoreOf(deps).listByRequirement(requirementId)
  // B12 阶段②e：rollup 改**定点版**。
  const rolled = await applyTaskRollupVia(
    requirementStoreOf(deps),
    rollupTasks,
    // 派生推进快照提供者（REQ-260927121324-abde FR-6）：显式窗口码 safeWindowKey(deps, exec)
    // 优先，退回 req.sourceSessionId；都无 → 诚实不传（与启动对账同一口径）。
    { now, commentId: () => deps.ids.comment(), snapshot: snapshotProviderFor(deps, safeWindowKey(deps, exec)) },
    requirementId,
  )
  const ok = rolled !== undefined
  return stepOf('ROLLUP', ok ? 'ok' : 'noop', ok ? '需求已全部任务完成，滚进验收' : '暂不可 rollup', startedAt, deps.clock.now())
}

async function runSelection(deps: UseCaseDeps, requirementId: string, sel: AdvanceSelection, startedAt: number, exec?: unknown, runSignal?: AbortSignal): Promise<AdvanceStep> {
  if (sel.event === 'OPEN_PARENT' && sel.parentId !== undefined) return openParent(deps, requirementId, sel.parentId, startedAt, exec)
  if (sel.event === 'FINALIZE_PARENT' && sel.parentId !== undefined) return finalizeParent(deps, sel.parentId, startedAt, exec)
  if (sel.event === 'RUN_SUBTASK' && sel.subtaskId !== undefined) return runSubtaskStep(deps, requirementId, sel.parentId ?? '', sel.subtaskId, startedAt, exec, runSignal)
  if (sel.event === 'ROLLUP') return rollupStep(deps, requirementId, startedAt, exec)
  return stepOf('PAUSE', 'skipped', '无对应事件实现', startedAt, deps.clock.now())
}

/**
 * 推进锁续租心跳（REQ-261003222428-3556 FR-1）：在跑 run 每 heartbeatIntervalMs
 * 刷新一次 `adv.lockAt`（**仅当 adv.runId 仍是自己**）——单卡执行超过
 * `advanceLockStaleMs`（15min）时，锁不再被误判残留而遭二次投递接管
 * （同需求双链并跑的病根；历史实测单卡 24.7min）。进程死亡 → 心跳自然停 →
 * stale 接管原样生效（崩溃不丢链语义不变）。
 *
 * 时序安全：心跳在 driveChain 的 finally 清锁之后仍可能活一小窗（外层 finally 才停），
 * 但清锁后 `adv.runId` 已 undefined ≠ 本次 runId → 守卫使心跳写必为 no-op，
 * 故「先清锁、后停心跳」与「先停、后清」等价安全，无需强排序。
 */
function startLockHeartbeat(deps: UseCaseDeps, requirementId: string, runId: string): () => void {
  const timer = setInterval(() => {
    void mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
      const adv = req?.advance
      if (adv === undefined || adv.runId !== runId) return undefined
      adv.lockAt = deps.clock.now()
      return { changed: true }
    }).catch(() => { /* 单次心跳失败不致命：下个节拍再试，stale 接管是兜底 */ })
  }, LIMITS.heartbeatIntervalMs)
  // 不拿心跳吊住进程：job 收尾后只剩定时器时允许事件循环退出
  if (typeof (timer as { unref?: unknown }).unref === 'function') (timer as { unref: () => void }).unref()
  return () => clearInterval(timer)
}

/**
 * 链的推进循环（REQ-260927100007-b8ba t-8bce7d）——投递路径与**无后台任务端口**的
 * 同步兼容路径共用同一份逻辑，避免两份实现漂移。
 *
 * `ownRunId`（FR-1）：投递路径传入本次 runId，finally 清锁只清自己的——
 * 旧 run 的收尾不得清掉接管后新 run 的锁（stale 接管窗口存在双 run 竞态）；
 * 同步兼容路径不传（未认领锁），保持既有清理行为。
 */
/**
 * 引擎不可达的**留痕标记**（REQ-261004065652-5c1c FR-10）。
 * 与 `adapters/WorkflowEngineRunner.ENGINE_UNREACHABLE_CODE` 同值；应用层不得 import adapters，
 * 故用字面量 + 一条静态断言锁住两者不漂移（见 tests/advance-engine-precheck.test.ts）。
 */
export const ENGINE_UNREACHABLE_MARK = 'subtask_engine_unreachable'

/**
 * FR-10 **入口守卫**：引擎不可达时不开工、不落任何子卡，如实报一次，之后幂等短路。
 *
 * 为什么放在链的最前面而不是"派卡失败后再报"：
 *   ① 不可达是**环境前提**不满足（agent preset 把引擎 isolate 在 agent 作用域），重试无解——
 *      派卡必然失败，白跑一趟还会回滚子卡；
 *   ② 实测同一条需求连挂 4 次，每次都得到一句无法行动的原因，诱使操作者反复重试。
 *      ⇒ 第一次就把"为什么 + 两条出路"写进台账与评论，之后**零写入**短路（不再刷屏、不 bump version）。
 */
async function engineUnreachableGuard(
  deps: UseCaseDeps,
  requirementId: string,
): Promise<{ steps: AdvanceStep[]; stopped: AdvanceStop } | undefined> {
  let probe: boolean | undefined
  try { probe = deps.workflow?.reachable?.() } catch { probe = undefined }
  // 探针缺失/抛错 → 按可达处理（不改变既有行为；预检是"多一道保险"，不是新门槛）。
  if (probe !== false) return undefined
  const now = deps.clock.now()
  const req = await requirementStoreOf(deps).get(requirementId)
  const text = fmt(
    '子卡执行引擎不可达（{code}）：**本次未落任何子卡**。两条出路：'
    + '① 改由本窗口自证过凭证门（reqboard_task_report 写 filesChanged 或 completed）；'
    + '② 让 workflowEngine 在本插件可见的作用域可达（当前 profile 按设计不可达，重试无解）。',
    { code: ENGINE_UNREACHABLE_MARK },
  )
  const already = (req?.advance?.history ?? []).some(
    (h) => h.event === 'OPEN_PARENT' && h.outcome === 'failed' && h.detail.includes(ENGINE_UNREACHABLE_MARK),
  )
  if (already) {
    // 幂等短路：**一个字节都不写**（revision 不变），但仍然如实回话。
    return { steps: [stepOf('OPEN_PARENT', 'failed', text, now, now)], stopped: 'engine_unreachable' }
  }
  await mutateIfPresent(requirementStoreOf(deps), requirementId, (r) => {
    const adv = (r.advance ??= {})
    adv.history = [...(adv.history ?? []), {
      at: now, requirementId, event: 'OPEN_PARENT', outcome: 'failed', durationMs: 0, detail: text,
    }]
    r.comments.push({
      id: deps.ids.comment(),
      body: '[自动链停手] ' + text,
      createdAt: now,
      createdBy: { kind: 'system' },
    })
    r.updatedAt = now
    return { changed: true }
  })
  return { steps: [stepOf('OPEN_PARENT', 'failed', text, now, now)], stopped: 'engine_unreachable' }
}

async function driveChain(
  deps: UseCaseDeps,
  requirementId: string,
  exec: unknown,
  isAborted: () => boolean,
  /** 承载本次链的后台 job 的 signal（Phase2）；同步兼容路径不传 → 子卡回落调用方 turn 的 signal。 */
  runSignal?: AbortSignal,
  /** 本次投递的 runId（FR-1）；传入时 finally 清锁带归属守卫。 */
  ownRunId?: string,
): Promise<{ steps: AdvanceStep[]; stopped: AdvanceStop }> {
  inflight.add(requirementId)
  const steps: AdvanceStep[] = []
  let stopped: AdvanceStop = 'max_steps'

  try {
    // FR-10：开工前预检（不可达 → 本次不落任何子卡 + 幂等短路）
    const guarded = await engineUnreachableGuard(deps, requirementId)
    if (guarded !== undefined) {
      steps.push(...guarded.steps)
      stopped = guarded.stopped
      return { steps, stopped }
    }

    for (let i = 0; i < LIMITS.advanceMaxStepsPerCall; i += 1) {
      if (isAborted()) {
        stopped = 'paused'
        break
      }

      // B12 阶段②e：改**权威定点读**（原先借桥镜像，写迁走后会自己写自己读不到）。
      const req = await requirementStoreOf(deps).get(requirementId)
      if (req === undefined) { stopped = 'not_found'; break }
      if (req.autoRun !== true) { stopped = 'not_autorun'; break }
      if (TERMINAL_REQ.has(req.status)) { stopped = 'terminal'; break }
      // REQ-261002141430-a5ef FR-1：人工门禁弹框在途 → 本轮不派卡（等人，不是停摆）。
      // 位置在 autoRun 判定**之后**：不动开关、不计 noopStreak（否则等人会被误判成停滞熔断）。
      if (dialogInFlightFor(deps, requirementId)) { stopped = 'awaiting-confirm'; break }

      // 任务已迁出台账（v9）：每轮迭代按需求取一次队列任务（事件选择的唯一输入）。
      const queueTasks = await taskStoreOf(deps).listByRequirement(requirementId)
      const batch = selectAdvanceBatch({ tasks: queueTasks }, requirementId, LIMITS.advanceMaxParallelParents)
      if (batch.length === 0) {
        if (!hasOpenWork({ tasks: queueTasks }, requirementId)) { stopped = 'noop'; break }
        const streak = (req.advance?.noopStreak ?? 0) + 1
        if (streak >= LIMITS.advanceNoopBreaker) {
          await pauseRequirement(deps, requirementId, 'stagnation', fmt('连续 {n} 次无可推进事件（疑似依赖死锁）', { n: streak }))
          steps.push(stepOf('PAUSE', 'skipped', fmt('停滞熔断：连续 {n} 次 noop', { n: streak }), deps.clock.now(), deps.clock.now()))
          stopped = 'paused'
          break
        }
        await mutateIfPresent(requirementStoreOf(deps), requirementId, (r2) => {
          const adv = (r2.advance ??= {})
          adv.noopStreak = streak
          return { changed: true }
        })
        steps.push(stepOf('PAUSE', 'noop', fmt('无可推进事件（第 {n} 次）', { n: streak }), deps.clock.now(), deps.clock.now()))
        stopped = 'noop'
        break
      }

      // REQ-261003222428-3556 FR-2：批内真并行——重写「REQ-260929195829-6e02 t2」的假并行
      // （此前注释称并行、代码是 for…await 串行，maxParallelParents 从未兑现）。
      // 分层：非 RUN_SUBTASK（OPEN_PARENT/FINALIZE_PARENT/ROLLUP）= 台账快事件，串行先行；
      // RUN_SUBTASK = 重活，按写集分组（advance-parallel），组间串行、组内 Promise.all。
      // 未声明写集的卡独占一组 ⇒ 存量行为 ≡ 旧串行（行为不变式 2）。
      const startedAt = deps.clock.now()
      const batchSteps: AdvanceStep[] = []
      // 同批事件共享 batchId：事后可从 history 还原「这批是一起跑的」（FR-2 新增可选留痕字段）
      const batchId = fmt('batch-{ts}-{i}', { ts: startedAt, i })
      const quickSels = batch.filter((s) => s.event !== 'RUN_SUBTASK')
      const runSels = batch.filter((s) => s.event === 'RUN_SUBTASK')
      const selGroups = [
        ...quickSels.map((s) => [s]),
        ...groupSubtaskEvents(runSels, queueTasks),
      ]
      let stopBatch = false
      for (const group of selGroups) {
        if (stopBatch) break
        if (isAborted()) { stopped = 'paused'; stopBatch = true; break }
        // 组内并行（单事件组 = 退化为串行，与旧行为逐步等价）
        const groupSteps = await Promise.all(
          group.map((sel) => runSelection(deps, requirementId, sel, startedAt, exec, runSignal)),
        )
        // 留痕按组内顺序（确定性）；失败统一收集后按「首个失败」决策，语义与旧串行对齐
        const failedSteps: AdvanceStep[] = []
        for (const step of groupSteps) {
          batchSteps.push(step)
          await appendHistory(deps, requirementId, {
            at: deps.clock.now(),
            requirementId,
            event: step.event,
            ...(step.parentId !== undefined ? { parentId: step.parentId } : {}),
            ...(step.subtaskId !== undefined ? { subtaskId: step.subtaskId } : {}),
            outcome: step.outcome,
            durationMs: step.durationMs,
            detail: step.detail,
            batchId,
          })
          if (step.outcome === 'failed') failedSteps.push(step)
        }
        for (const step of groupSteps) {
          if (step.event === 'PAUSE') { stopped = 'paused'; stopBatch = true; break }
          if (step.event === 'ROLLUP') { stopped = 'rollup'; stopBatch = true; break }
          // manual 段（REQ-261003203909-55f2 FR-2）：等人不是失败——停链但不动 autoRun、不进失败处理
          if (step.event === 'AWAIT_MANUAL') { stopped = 'awaiting-manual'; stopBatch = true; break }
        }
        if (stopBatch) break
        if (failedSteps.length > 0) {
          // 回滚**全部**失败子卡（并行组里可能不止一张）；成功卡的结果保留、不动
          for (const f of failedSteps) {
            if (f.subtaskId === undefined) continue
            const subId = f.subtaskId
            const failure = classifyFailure({ ok: false, reason: f.detail })
            await taskStoreOf(deps).mutate(requirementId, (tasks) => {
              const changed = rollbackSubtask(tasks, subId, deps.clock.now(), deps.ids, failure)
              return changed ? tasks : undefined
            })
          }
          // 首个失败决定 重试 or 暂停（与旧串行逐张处理的首败语义一致）
          const step = failedSteps[0]!
          const failure = classifyFailure({ ok: false, reason: step.detail })
          if (step.subtaskId !== undefined && isTransientAbort(step.detail)) {
            const afterAttempt = (await taskStoreOf(deps).get(step.subtaskId))?.attempt ?? 2
            if (afterAttempt <= 1) {
              const retryAt = deps.clock.now()
              await appendHistory(deps, requirementId, {
                at: retryAt, requirementId, event: 'RETRY', outcome: 'skipped', durationMs: 0,
                subtaskId: step.subtaskId, parentId: step.parentId, batchId,
                detail: fmt('子卡 {id} 瞬断，同一 job 内自动重试一次（{why}）', { id: step.subtaskId, why: step.detail.slice(0, 120) }),
              })
              batchSteps.push(stepOf('RETRY', 'skipped', step.detail, retryAt, retryAt, { subtaskId: step.subtaskId, parentId: step.parentId }))
              continue
            }
          }
          await pauseRequirement(deps, requirementId, 'fail', step.detail)
          batchSteps.push(stepOf('PAUSE', 'skipped', step.detail, deps.clock.now(), deps.clock.now()))
          try {
            deps.alert?.alert({
              requirementId,
              title: fmt('【实施链暂停】{req}', { req: requirementId }),
              content: fmt(
                '卡住位置：父卡 {parent} / 子卡 {sub}\n失败原因：[{category}] {detail}\n已做处理：子卡退回待办、autoRun 已置 false、链停在实施态未进验收\n可选处置：重跑该卡 / 退回上游重新描述需求 / 取消',
                { parent: step.parentId ?? '-', sub: step.subtaskId ?? '-', category: failure.category, detail: failure.reason },
              ),
            })
          } catch { /* 告警失败不阻断暂停语义 */ }
          stopped = 'paused'
          stopBatch = true
          break
        }
      }
      // 合并 batchSteps 到外层 steps 数组
      steps.push(...batchSteps)
      // 如果任何 step 导致停止，跳出外层循环
      if (stopped !== 'max_steps') break
      // 检查是否有 ok 的 step 来重置 noopStreak
      const hasOk = batchSteps.some(s => s.outcome === 'ok')
      if (hasOk) {
        await mutateIfPresent(requirementStoreOf(deps), requirementId, (r2) => {
          const adv = (r2.advance ??= {})
          if (adv.noopStreak === undefined || adv.noopStreak === 0) return undefined
          adv.noopStreak = 0
          return { changed: true }
        })
      }
    }
  } finally {
    try {
      await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
        if (req?.advance === undefined) return undefined
        // 未认领过（同步兼容路径）→ 不写盘，避免无意义地推高 revision。
        if (req.advance.lockAt === undefined && req.advance.runId === undefined) return undefined
        // FR-1 归属守卫：投递路径只清自己的锁——旧 run 收尾不得清接管后新 run 的锁。
        if (ownRunId !== undefined && req.advance.runId !== ownRunId) return undefined
        req.advance.lockAt = undefined
        req.advance.runId = undefined
        return { changed: true }
      })
    } catch { /* 解锁失败由 stale 接管 */ }
    inflight.delete(requirementId)
  }

  return { steps, stopped }
}

/**
 * 投递需求实施链（REQ-260925110957-552d FR-1）：认领 + 注册后台任务 + 立即返回。
 *
 * 改造前：同步循环 20 步（占用调用方预算）。改造后：投递即返回（链在后台 ctx.jobs 中执行）。
 *
 * 兼容路径（REQ-260927100007-b8ba t-8bce7d）：**无后台任务端口**（内存测试 / 嵌入调用）时
 * 同步跑完并返回真实停止原因——此前这类调用方只会拿到一个 `not_found` 空壳，
 * 链明明可跑却被判"系统不可用"（advance-chain / concurrency-limits 一族测试由此长红）。
 */
export async function advanceRequirement(deps: UseCaseDeps, requirementId: string, exec?: unknown): Promise<AdvanceOutcome> {
  // 1. 前置校验：单飞锁 + 需求态
  // 失败要响亮（2026-09-28 实测）：**每条早退路径**都必须给出 dispatched:false + 人话 reason。
  // 此前早退不设 dispatched，工具壳的 `out.dispatched === false` 判断漏过它们，于是走成功回执、
  // 带上 job_id/run_id=undefined 返回——undefined 不是 lossless JSON，dsh-tools 的
  // snapshotJsonValue 直接抛 ["value is not lossless JSON"]，agent 只拿到无信息的硬错误、只能猜。
  if (inflight.has(requirementId)) {
    return {
      requirementId, steps: [], stopped: 'locked', dispatched: false,
      reason: '该需求已有推进事件在本进程内运行（in-flight），本次未投递新任务；请等待当前 run 结束或稍后重试',
    }
  }

  // B12 阶段②e：同上，权威定点读。
  const req0 = await requirementStoreOf(deps).get(requirementId)
  if (req0 === undefined) {
    return {
      requirementId, steps: [], stopped: 'not_found', dispatched: false,
      reason: fmt('需求 {id} 不存在，无法推进', { id: requirementId }),
    }
  }
  if (req0.autoRun !== true) {
    return {
      requirementId, steps: [], stopped: 'not_autorun', dispatched: false,
      reason: '自动链未开启（autoRun=false）——请人工确认后再触发 reqboard_task_run 续跑',
    }
  }
  if (TERMINAL_REQ.has(req0.status)) {
    return {
      requirementId, steps: [], stopped: 'terminal', dispatched: false,
      reason: fmt('需求已到终态（status={status}），无需再推进', { status: req0.status }),
    }
  }

  const now0 = deps.clock.now()
  if (req0.advance?.lockAt !== undefined && now0 - req0.advance.lockAt < LIMITS.advanceLockStaleMs) {
    return {
      requirementId, steps: [], stopped: 'locked', dispatched: false,
      reason: fmt('该需求已有 run 在跑（runId={runId}，锁未过期），本次未投递；请等待其结束或稍后重试', {
        runId: req0.advance.runId ?? '(未知)',
      }),
    }
  }

  // 2. 残留锁回收（2026-09-28 实测死锁）：走到这里说明 lockAt 缺省或已过期 ⇒ 没有活 job 在跑。
  //    driveChain 正常收尾会清 lockAt/runId，但**进程被杀/重启时 finally 不执行**，
  //    advance.runId 会永久留下；旧逻辑只看「runId 是否存在」就判「已有 run 在跑」，
  //    于是该需求此后**再也无法投递**（实测：quick_restart 后恒返回 REQBOARD_ADVANCE_LOCKED，
  //    连启动恢复扫描 scanAndResume 也被同一判断挡下——"崩溃不丢链"的承诺因此失效）。
  //    锁已过期即视为残留：显式回收后继续投递（无残留时不写盘，保持幂等）。
  if (req0.advance?.runId !== undefined) {
    await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
      if (req?.advance === undefined) return undefined
      if (req.advance.runId === undefined && req.advance.lockAt === undefined) return undefined
      req.advance.lockAt = undefined
      req.advance.runId = undefined
      return { changed: true }
    })
  }

  // 3. 无后台任务端口 → 同步兼容路径（驱动逻辑与投递路径共用 driveChain）
  if (deps.jobs === undefined || !deps.jobs.available()) {
    const { steps, stopped } = await driveChain(deps, requirementId, exec, () => false)
    return {
      requirementId, steps, stopped, dispatched: false,
      reason: fmt('无后台任务端口：已同步推进并停于 stopped={s}', { s: stopped }),
    }
  }

  // 4. 生成 runId 并认领
  const runId = `run-${deps.clock.now()}-${Math.random().toString(36).slice(2, 9)}`
  // owner 口径（REQ-261002173819-69c7 FR-2）：宿主 `agents.get(id)` 只认 id 字符串；取不到 id
  // 时按 **unowned** 投递（宿主 `resolveOwner(undefined)` 明文允许），并在同一次认领里留痕，
  // 便于事后判断"这条 job 没有户主"。
  const ownerId = dispatchOwnerOf(exec)

  await mutateIfPresent(requirementStoreOf(deps), requirementId, (req) => {
    const adv = (req.advance ??= {})
    adv.lockAt = now0
    adv.runId = runId
    if (ownerId === undefined) {
      req.comments.push({
        id: deps.ids.comment(),
        body: fmt('[自动链投递] {req} 的投递 owner 缺失（owner_missing）——按无主 job 投递：不会被会话归档连带取消，也不计入每 owner 并发上限。', { req: requirementId }),
        createdAt: now0,
        createdBy: { kind: 'system' },
      })
      req.updatedAt = now0
    }
    return { changed: true }
  })

  // 5. 投递后台任务
  let jobId: string
  try {
    jobId = await deps.jobs.start({
      kind: 'reqboard',
      label: `REQ ${requirementId}`,
      // 宿主契约要 owner 是 **id 字符串**（agents.get(id) 解析 live agent）；传 agent 对象会被判
      // 「session "[object Object]" has no live agent」——2026-10-02 实测投递因此恒失败。
      owner: ownerId,
      run: async (signal?: AbortSignal) => {
        // FR-1：job 存活期间续租推进锁——长跑子卡越过 stale 阈值也不再被二次投递接管。
        const stopHeartbeat = startLockHeartbeat(deps, requirementId, runId)
        try {
          // Phase2：job 的 signal 一路透传到子卡 run —— 取消权归工作单元（job），
          // 而不是派发它的那个 turn（turn 结束不再掐掉正在跑的子卡）。
          await driveChain(deps, requirementId, exec, () => signal?.aborted ?? false, signal ?? undefined, runId)
        } finally {
          // 停心跳（清锁已在 driveChain 的 finally 发生；runId 守卫使两序等价，见 startLockHeartbeat 注）
          stopHeartbeat()
        }
      },
    })
  } catch (err) {
    // ctx.jobs.start 抛错 = 前置校验失败。**先回收锁再返回**（FR-1）：锁是投递前认领的，
    // 留着它就把自己挡死 15 分钟（LIMITS.advanceLockStaleMs），而此刻根本没有 run 在跑。
    const message = err instanceof Error ? err.message : String(err)
    const kind = /has no live agent/.test(message) ? 'owner_unresolvable' : 'dispatch_failed'
    let releaseNote = ''
    try {
      await releaseClaim(deps, requirementId, runId, kind, message)
    } catch (releaseErr) {
      // 回收失败也不能吞：如实写进 reason，调用方与看板都能看见"锁还在"
      releaseNote = '；锁回收失败（可待 stale 阈值后自动接管）：'
        + (releaseErr instanceof Error ? releaseErr.message : String(releaseErr))
    }
    return {
      requirementId,
      steps: [],
      stopped: 'dispatch_failed' as AdvanceStop,
      dispatched: false,
      reason: `投递失败（${kind}）：${message}${releaseNote}`,
    }
  }

  // 6. 成功：立即返回
  return {
    requirementId,
    steps: [],
    stopped: 'noop' as AdvanceStop,
    dispatched: true,
    job_id: jobId,
    run_id: runId,
  }
}

/** 
 * 启动恢复扫描（崩溃不丢链）：autoRun=true 且未到验收态的需求 → 续跑下一个事件。
 * 
 * REQ-260925110957-552d：补充 exec 参数透传给 advanceRequirement（解决 parent undefined 问题）。
 */
export async function scanAndResume(deps: UseCaseDeps, exec?: unknown): Promise<AdvanceOutcome[]> {
  // B12 阶段②e：要**列表**，用带过滤的摘要查询。
  const page = await requirementStoreOf(deps).listSummaries({ scope: 'active' })
  const candidates = page.items.filter(
    (r) => r.autoRun === true && !TERMINAL_REQ.has(r.status),
  )
  // FR-4（REQ-261004110201-f253）：**优先级排序 + 全局在制上限**。
  //   · 排序键 = (-priority, createdAt)：priority 缺省视作 0；同值按创建时间升序（稳定，不抖动）；
  //   · 在制判据 = **有新鲜推进锁**（真有 run 在跑），不是「开了 autoRun」——
  //     否则上限一开就把「已武装但还没轮到」的需求也算在制，自我堵死（设计取舍见 design/architecture）。
  const now = deps.clock.now()
  const sorted = [...candidates].sort((a, b) => {
    const pa = a.priority ?? 0
    const pb = b.priority ?? 0
    if (pa !== pb) return pb - pa
    return (a.createdAt ?? 0) - (b.createdAt ?? 0)
  })
  const limit = deps.maxInFlightRequirements ?? 0
  const runningOf = (list: readonly { id: string; advanceLockAt?: number }[]): string[] =>
    list
      .filter((r) => r.advanceLockAt !== undefined && now - r.advanceLockAt < LIMITS.advanceLockStaleMs)
      .map((r) => r.id)
  let inFlight = runningOf(sorted)

  const out: AdvanceOutcome[] = []
  for (const req of sorted) {
    if (limit > 0 && inFlight.length >= limit) {
      // 如实拒绝：不是错误，是「排队等前面的跑完」——回执点名谁在跑、上限多少、怎么解除。
      out.push({
        requirementId: req.id,
        steps: [],
        stopped: 'wip_limit' as AdvanceStop,
        dispatched: false,
        reason: fmt('WIP 上限已满（在制 {n} / 上限 {limit}）：正在跑 {running}；本轮未投递本需求（优先级 {p}）。'
          + '解除方式：等其中一条结束，或调大 maxInFlightRequirements。', {
          n: String(inFlight.length), limit: String(limit), running: inFlight.join('、'), p: String(req.priority ?? 0),
        }),
      })
      continue
    }
    const outcome = await advanceRequirement(deps, req.id, exec)
    out.push(outcome)
    // 投递成功即占一个在制名额（后续候选按新额度判断）
    if (outcome.dispatched === true) inFlight = [...new Set([...inFlight, req.id])]
  }
  return out
}

/** 供测试/诊断：当前在跑的需求（进程内单飞视图）。 */
export function inflightRequirements(): string[] {
  return [...inflight]
}

/**
 * 需求进度口径（FR-12 看板进度）：父卡 done/总、子卡 done/总。
 *
 * 入参改名为 `view`（REQ-260927202051-f6df t12）：任务已不在台账，这里收的是**队列任务视图**
 * `{ tasks }`。改名同时消除 TC-8.12 静态门禁对"台账取任务"字样的误报——语义上也更诚实。
 */
export function progressOf(
  view: { tasks: readonly TaskRecord[] },
  requirementId: string,
): { parentsDone: number; parentsTotal: number; subtasksDone: number; subtasksTotal: number } {
  const parents = view.tasks.filter((t) => t.requirementId === requirementId && t.parentId === undefined && t.status !== 'canceled')
  const subs = view.tasks.filter((t) => t.requirementId === requirementId && t.parentId !== undefined && t.status !== 'canceled')
  return {
    parentsDone: parents.filter((p) => p.status === 'done').length,
    parentsTotal: parents.length,
    subtasksDone: subs.filter((s) => s.status === 'done').length,
    subtasksTotal: subs.length,
  }
}
