/**
 * 驱动「本拍放弃」的有界留痕（REQ-261006170150-52cc FR-4）——回答「它为什么没起轮」。
 *
 * 要解决的问题：驱动每拍都会因为「弹框在途 / 台账不可驱动 / 人工门开着」而**正常地**收手，
 * 但此前这些收手只落在进程日志里（可能进死管道），事后没人能从可查面回答
 * 「这次确认之后为什么没有起轮」。本模块把每个放弃点写成一条有界痕迹。
 *
 * 三条纪律：
 *   ① **有界**：同 (需求, 原因) 在冷却窗内只记一次——放弃是**每拍都会发生**的正常动作，
 *      不加冷却会把诊断面刷爆，反而盖住真正的信号；
 *   ② **不写台账**：只进诊断面（`captureDiag`）。台账评论是给人读的业务留痕，
 *      日常的"这一拍放弃了"不属于业务事实，写进去就是刷屏；
 *   ③ **永不抛**：留痕失败不得影响驱动（与 `captureDiag` 本身的容错口径一致）。
 *
 * 为什么独立成模块而不是塞进 `round-driver.ts`：后者已超 400 行尺寸门禁，
 * 本仓既定做法是「把可测的规则搬到小模块」（同 `dialog-inflight-expiry.ts`），
 * 且冷却判据是纯时间函数，独立后可在 L1 用固定时钟直接穷举。
 *
 * @module dsh-pmboard/application/dive/wake-skip-trace
 */

/** 放弃本拍的受控原因（**闭集**：诊断面按它做聚合，不接受自由文本）。 */
export type WakeGiveUpReason = 'dialog-in-flight' | 'not-drivable' | 'human-gate'

/** 默认冷却窗（毫秒）：同 (需求, 原因) 窗口内只记一条。 */
export const WAKE_SKIP_COOLDOWN_MS = 60_000

export interface WakeSkipTracerDeps {
  /** 时间源（组合根传 `ports.now`；用例注入固定时钟）。 */
  now: () => number
  /** 落痕通道（组合根传 `captureDiag`；用例注入数组收集）。 */
  emit: (line: string) => void
  /** 冷却窗；缺省 `WAKE_SKIP_COOLDOWN_MS`（60 秒）。 */
  cooldownMs?: number
}

export interface WakeSkipTracer {
  /**
   * 记一条「本拍放弃」痕迹。
   *
   * @returns 本次**是否真的记了**（冷却窗内重复 → `false`，便于用例与调用方断言频次）
   */
  noteGiveUp(requirementId: string, status: string, reason: WakeGiveUpReason): boolean
}

/**
 * 建一个留痕器。冷却表住在本闭包里（**每个驱动器一份**）：
 * 全进程共享一张表会让多窗口互相吃掉对方的痕迹。
 */
export function createWakeSkipTracer(deps: WakeSkipTracerDeps): WakeSkipTracer {
  const cooldownMs = deps.cooldownMs ?? WAKE_SKIP_COOLDOWN_MS
  /** key = 需求 + 原因（**异因互不影响**：分别计时，各自该记就记）。 */
  const lastAt = new Map<string, number>()
  return {
    noteGiveUp(requirementId, status, reason) {
      // 判据用**严格小于**：恰好到冷却窗那一下可以再记（与 TTL 判据同口径的边界约定）。
      const now = deps.now()
      const key = requirementId + '\u0000' + reason
      const prev = lastAt.get(key)
      if (prev !== undefined && now - prev < cooldownMs) return false
      lastAt.set(key, now)
      try {
        deps.emit('[WAKE-SKIP] reason=' + reason + ' req=' + requirementId + ' status=' + status)
      } catch {
        // 留痕通道抛错不冒泡：诊断面绝不能反过来挡住驱动。
      }
      return true
    },
  }
}
