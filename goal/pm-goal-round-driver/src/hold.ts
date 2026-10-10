/**
 * 停手纪律（**写入侧**：何时置位、何时解锁）——从 `pm-round-driver` 原样迁入。
 *
 * 【为什么这笔纪律值钱】2026-10-03 的死循环里，台账**写对了**（18:03:52 就写了 paused），
 * 但驱动**读不到**（投影陈旧）⇒ 空转 4 小时 36 分。闭锁的全部价值就是
 * 「**与 I/O 无关的当拍判定**」：即使投影再出一次同样的缺陷，也不可能出现"没人推进却一直起轮"。
 *
 * 【三条不变量（写错即破坏本纪律）】
 *   ① 解锁要**两条证据**同时成立：本次停手的台账写已成功（`writable`）**且**台账**显式** healthy；
 *   ② 人的意图被改成手动（activation ≠ armed）→ 继续闭锁（只有人能 arm 回来）；
 *   ③ 退避期内不起轮；连续同因失败达阈值 → 熔断（同因累加、异因归零）。
 *
 * @module dsh-pmboard/goal-round/hold
 */
import {
  backoffFor, breakerTripped, recordFailure,
  type DriverFailure, type DriverLatch,
} from 'pm-core/application/dive-core/round-state.js'

/** 每 agent 的内存停手态（**不落盘**：落盘会让它退化成"第二个台账"，重新依赖 I/O）。 */
export interface HoldState {
  latch?: DriverLatch
  failure?: DriverFailure
}

/** 解锁判据要读的台账事实（窄投影，调用方现取）。 */
export interface LatchFacts {
  /** 进程级上游闸是否在闸（额度/鉴权）。 */
  readonly providerLatchOpen?: boolean
  /** 该需求是否绑定到某条记录（读不到 = 还没就绪 → 继续闭锁）。 */
  readonly requirementPresent: boolean
  /** 人的意图（armed 才有资格解锁）。 */
  readonly activation?: string
  /** 运行时健康位（**显式** healthy 才算"有人清过"）。 */
  readonly driverHealthState?: string
}

export interface LatchVerdict {
  /** true = 本拍不起轮。 */
  readonly blocked: boolean
  /** 本拍刚刚解锁（调用方据此留痕）。 */
  readonly released: boolean
}

/**
 * 闭锁是否挡路（唯一解锁规则在此）。
 *
 * 刻意**不用** `isDrivableRequirement` 当解锁判据：写盘失败时它照样为真（台账里没有停手位），
 * 那是"没写上"而不是"有人修好了"——反向演练② 实测抓到过这个假解锁。
 */
export function latchBlocks(state: HoldState, facts: LatchFacts): LatchVerdict {
  const latch = state.latch
  if (latch === undefined) return { blocked: false, released: false }
  if (facts.providerLatchOpen === true) return { blocked: true, released: false }
  if (!facts.requirementPresent) return { blocked: true, released: false }
  if (facts.activation !== 'armed') return { blocked: true, released: false }
  if (!latch.writable) return { blocked: true, released: false }
  if (facts.driverHealthState !== 'healthy') return { blocked: true, released: false }
  state.latch = undefined
  return { blocked: false, released: true }
}

/**
 * 置内存闭锁。`writable` 初值恒 false——由停手位落库的回执翻真（见 `markLatchWritable`）。
 * @param truncate 由调用方注入的截断器（域层不 import 文本工具）
 */
export function setLatch(
  state: HoldState, reasonClass: string, reasonText: string, now: number,
  truncate: (s: string) => string,
): void {
  state.latch = { reasonClass, reason: truncate(reasonClass + ' · ' + reasonText), at: now, writable: false }
}

/** 停手位落库的回执：只翻**同一把锁**（防止旧回执翻新锁）。 */
export function markLatchWritable(state: HoldState, reasonClass: string, ok: boolean): void {
  if (!ok) return
  const latch = state.latch
  if (latch !== undefined && latch.reasonClass === reasonClass) latch.writable = true
}

/** 退避期内不起轮。 */
export function inBackoff(state: HoldState, now: number): boolean {
  return state.failure !== undefined && now < state.failure.nextAt
}

/** 记一次回合失败：同因累加、异因归零；返回记完后的账（含熔断判据）。 */
export function noteFailure(
  state: HoldState, reasonClass: string, now: number,
): { failure: DriverFailure; tripped: boolean; backoffMs: number } {
  const failure = recordFailure(state.failure, reasonClass, now)
  state.failure = failure
  return { failure, tripped: breakerTripped(failure), backoffMs: backoffFor(failure.count) }
}

/** 回合成功 → 清退避账（抖动自愈：一次成功即归零）。 */
export function clearFailure(state: HoldState): void {
  state.failure = undefined
}
