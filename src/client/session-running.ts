/**
 * 会话运行态读数（REQ-261004210128-283d t1 / FR-1、FR-2、FR-6）——看板「哪条需求正在被处理」的**唯一**读数入口。
 *
 * ## 为什么是纯客户端
 *
 * DSH 客户端本就持有权威且实时的运行态：`ctx.sessions.list` 是一个快照 store，每行带
 * `running: boolean`（host 侧 `agents.get(id)?.status === 'running'`，并经 `api-session/status`
 * **全量**推送）。左侧会话列表的转圈用的就是这个字段——本模块把它接到看板，判据与侧栏同源，
 * 不另造「谁在干活」的推断，也不新增任何 host 接口。
 *
 * ## 三条纪律
 *
 * - **不抛错**：服务未注入（旧客户端）、`list` 缺失、行缺失、字段形状异常——一律降级为
 *   「不在跑」/ 空集 / no-op 退订。能力不可得是降级，不是业务失败（与 `archivedSessionIds()` 同款）。
 * - **不伪造**：绝不用 `updatedAt` / `autoRun` / 执行记录 `outcome === 'running'` 之类近似推断在跑。
 *   唯一的例外是**推进锁**（`advanceLockAt`）——它不是近似推断，而是 host 认领 + 30s 心跳续租的
 *   「有 run 在跑」证书（REQ-261005213603-eaed FR-1/FR-2；旧红线中这一条已被该需求取代，见
 *   `docs/architecture/client-running-indicator.md`）。
 * - **只读**：不缓存副本、不落盘；每次渲染时实时读（避免第二份真相）。
 *
 * @module dsh-pmboard/client/session-running
 */
import { LIMITS } from '../domain/limits.js'
import { windowServiceAccess, type SessionServiceAccess } from './session-jump.ts'

/** 运行态读数只用到服务的这一面（便于测试注入假投影）。 */
export type SessionRunningAccess = Pick<SessionServiceAccess, 'getSessions'>

/** 空集合常量：所有「没有在跑的会话」路径共用同一实例（便于集合比较与断言）。 */
export const NO_RUNNING: ReadonlySet<string> = new Set<string>()

/** 会话列表投影（缺 `byId` 或缺行都合法——都按「不在跑」处理）。 */
interface SessionsListFace {
  getSnapshot(): { byId?: Record<string, unknown> } | undefined
  subscribe?(fn: () => void): () => void
}

/** 取会话列表投影；服务缺失 / 形状不符 / 任何抛错 → undefined（调用方一律降级）。 */
function listOf(access?: SessionRunningAccess): SessionsListFace | undefined {
  try {
    const sessions = (access ?? windowServiceAccess()).getSessions() as { list?: SessionsListFace } | undefined
    const list = sessions?.list
    if (list === undefined || typeof list.getSnapshot !== 'function') return undefined
    return list
  } catch {
    return undefined
  }
}

/** 该会话是否正在执行回合。`sid` 为空 / 服务缺失 / 行缺失 / `running` 非 `true` → false。 */
export function isSessionRunning(sid: string | undefined, access?: SessionRunningAccess): boolean {
  if (sid === undefined || sid.length === 0) return false
  const list = listOf(access)
  if (list === undefined) return false
  try {
    const row = list.getSnapshot()?.byId?.[sid]
    if (typeof row !== 'object' || row === null) return false
    return (row as { running?: unknown }).running === true
  } catch {
    return false
  }
}

/** 当前全部在跑的会话 id 集合。服务不可得 / 形状不符 → `NO_RUNNING`（空集）。 */
export function runningSessionIds(access?: SessionRunningAccess): ReadonlySet<string> {
  const list = listOf(access)
  if (list === undefined) return NO_RUNNING
  try {
    const byId = list.getSnapshot()?.byId
    if (byId === undefined) return NO_RUNNING
    const out = new Set<string>()
    for (const [sid, row] of Object.entries(byId)) {
      if (typeof row === 'object' && row !== null && (row as { running?: unknown }).running === true) out.add(sid)
    }
    return out
  } catch {
    return NO_RUNNING
  }
}

/**
 * 订阅会话运行态变化；返回**幂等**退订函数。
 * 服务 / 订阅能力缺失（旧客户端）→ 返回 no-op 退订，调用方无需分支。
 */
export function subscribeSessionRunning(fn: () => void, access?: SessionRunningAccess): () => void {
  const list = listOf(access)
  const subscribe = list?.subscribe
  if (typeof subscribe !== 'function') return () => { /* 旧客户端：没有实时性，但读数仍可用 */ }
  try {
    const off = subscribe.call(list, fn)
    return typeof off === 'function' ? off : () => { /* 服务未给退订句柄：按 no-op 处理 */ }
  } catch {
    return () => { /* 订阅失败：失去实时性，不抛给渲染层 */ }
  }
}

/** 需求侧参与判定的最小形状（`RequirementSummary` 与 `RequirementRecord` 都是它的结构子类型）。 */
export interface RequirementSessionShape {
  /** 立项来源窗口（= owner 会话 id）；人工建卡不填。 */
  sourceSessionId?: string
  /** 需求席位；**有值即权威**（与 host `seatsOf` 同口径），缺省 = 存量需求折算单 owner。 */
  seats?: readonly { windowKey?: string }[]
}

/**
 * 这条需求此刻是否有会话在跑：席位权威 ∪ `sourceSessionId` 折算，**任一在跑即算在跑**。
 *
 * 为什么把 `isRunning` 作为参数注入：判定要能纯函数化（单测不需要假服务），且不得产生第二次读数。
 */
export function requirementRunning(
  req: RequirementSessionShape,
  isRunning: (sid: string) => boolean,
): boolean {
  const seats = req.seats
  if (seats !== undefined) {
    for (const seat of seats) {
      const sid = seat?.windowKey
      if (typeof sid === 'string' && sid.length > 0 && isRunning(sid)) return true
    }
    return false
  }
  const sid = req.sourceSessionId
  return typeof sid === 'string' && sid.length > 0 ? isRunning(sid) : false
}

/* ------------------------------------------------------------------ 后台 run 在跑（推进锁） */

/**
 * 在跑**成因**（REQ-261005213603-eaed FR-3）——两种事实共用同一个圈，只有文案区分。
 *
 * - `session`：绑定窗口正在跑回合（既有判据）；
 * - `run`：该需求有**新鲜推进锁**——后台 run（自动链 / `reqboard_task_run`）在跑子卡。
 */
export type RunningCause = 'session' | 'run'

/** 在跑标记（FR-1/FR-3）：只有成因一个字段；`undefined` = 不在跑（与空对象严格区分）。 */
export interface RunningMark {
  readonly cause: RunningCause
}

/** 推进锁判据只读摘要里这一个键（FR-2；便于测试注入假对象）。 */
export interface RequirementRunShape {
  /** host 推进锁持有时刻（ms）；缺省 = 没有 run 在跑（缺失 ≠ 0）。 */
  readonly advanceLockAt?: number
}

/**
 * 推进锁是否**新鲜** = 该需求此刻有一个后台 run 在跑（FR-1、FR-2）。
 *
 * 为什么这是"事实"而不是"近似推断"：`advance` 的 `lockAt` 由 host 在**投递前**认领、
 * run 在跑期间每 `heartbeatIntervalMs`（30s）心跳续租、`finally` 清锁
 * （`application/use-cases/AdvanceChain.ts` 的 `startLockHeartbeat` 与收尾块），
 * host 自己的 WIP 闸门也用同一条判据（`runningOf`）——本函数与它**同阈值、同运算符**。
 *
 * 任何非法输入一律 `false`（缺键 / `null` / 字符串 / `NaN` / `Infinity` / 恰好等于阈值 / 已过期）；
 * 锁时间在未来（`now - lock < 0`）判新鲜——与 host 同一表达式，不另写规则（FR-2）。
 *
 * @param now     当前时刻（ms）；注入以便纯函数化
 * @param staleMs 过期阈值；缺省 = `LIMITS.advanceLockStaleMs`（15min，单一来源，不复制字面量）
 */
export function requirementRunInFlight(
  req: RequirementRunShape,
  now: number,
  staleMs: number = LIMITS.advanceLockStaleMs,
): boolean {
  try {
    const lock = req?.advanceLockAt
    if (typeof lock !== 'number' || !Number.isFinite(lock)) return false
    return now - lock < staleMs
  } catch {
    return false
  }
}

/**
 * 需求此刻的在跑标记（FR-1、FR-3）——**全仓唯一的在跑映射点**（泳道卡与列表行共用）。
 *
 * 成因优先级（钉死，FR-3）：两种成因同时成立时取 `session`——「有窗口正在跑回合」是更直接的事实，
 * `run` 成因兜底。都不成立返回 `undefined`（**不返回空对象**：缺失即无指示）。
 */
export function requirementRunningMark(
  req: RequirementSessionShape & RequirementRunShape,
  isRunning: (sid: string) => boolean,
  now: number,
  staleMs?: number,
): RunningMark | undefined {
  if (requirementRunning(req, isRunning)) return { cause: 'session' }
  if (requirementRunInFlight(req, now, staleMs)) return { cause: 'run' }
  return undefined
}

/**
 * 布尔便捷入口（FR-1）：**实现即 mark 存在**——薄包装，不构成第二份判据。
 * 需要布尔（或只需要"亮不亮"）的调用方用它；需要成因（文案）的用 `requirementRunningMark`。
 */
export function requirementBusy(
  req: RequirementSessionShape & RequirementRunShape,
  isRunning: (sid: string) => boolean,
  now: number,
  staleMs?: number,
): boolean {
  return requirementRunningMark(req, isRunning, now, staleMs) !== undefined
}

/**
 * 一组需求 → 本次渲染关心的「相关会话 id 集合」（重绘门控的比对基准）。
 *
 * 只收当前页出现过的需求所绑定的窗口：别的窗口在跑与本页无关，不该让看板重绘。
 */
export function relevantSessionIds(reqs: readonly RequirementSessionShape[]): ReadonlySet<string> {
  const out = new Set<string>()
  for (const req of reqs) {
    const seats = req.seats
    if (seats !== undefined) {
      for (const seat of seats) {
        const sid = seat?.windowKey
        if (typeof sid === 'string' && sid.length > 0) out.add(sid)
      }
      continue
    }
    const sid = req.sourceSessionId
    if (typeof sid === 'string' && sid.length > 0) out.add(sid)
  }
  return out
}

/** 两个运行态集合是否相同（重绘门控用；空集与 `NO_RUNNING` 视为相同）。 */
export function sameRunningSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a === b) return true
  if (a.size !== b.size) return false
  for (const sid of a) if (!b.has(sid)) return false
  return true
}

/** 把「相关会话 × 运行态」收敛成本次渲染要用的在跑集合（只含相关会话，避免无关抖动）。 */
export function runningAmong(
  relevant: ReadonlySet<string>,
  all: ReadonlySet<string> = runningSessionIds(),
): ReadonlySet<string> {
  if (relevant.size === 0 || all.size === 0) return NO_RUNNING
  const out = new Set<string>()
  for (const sid of relevant) if (all.has(sid)) out.add(sid)
  return out.size === 0 ? NO_RUNNING : out
}
