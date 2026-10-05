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
 * - **不伪造**：绝不用 `updatedAt` / `autoRun` / `advanceLockAt` 之类近似推断运行态。
 *   宁可没有指示，也不给一个可能是假的指示。
 * - **只读**：不缓存副本、不落盘；每次渲染时实时读（避免第二份真相）。
 *
 * @module dsh-pmboard/client/session-running
 */
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
