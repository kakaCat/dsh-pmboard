/**
 * 心跳对账（迁自 `pm-round-driver/src/wake-heartbeat.ts`）：**防静默停摆**。
 *
 * 【它防的两类静默】2026-10-02 实测：台账 `armed` 两分钟 `roundsInStage` 恒 0——
 * 需求"看着在跑"，实际没有任何人在推进；以及"台账写着等弹框、实际无在途"的死等。
 *
 * 【判据（纯函数 `planWake`）+ 副作用（端口）】
 *   ① 在闸（上游闩 / 本驱动闭锁）→ **整趟跳过**：不叫醒、不刷 `lastWakeAt`、不碰健康位；
 *   ② 不可驱动（未 armed / 运行时暂停 / advance 告警）→ 不叫醒；
 *   ③ 有人在等（弹框在途）→ 不叫醒（**停手不是故障**）；
 *   ④ 还新鲜（`lastWakeAt` / `lastActiveAt` 在窗内）→ 不叫醒；
 *   ⑤ 否则：**叫醒**；窗口是死的（受理失败）→ 记失败，达阈值写停手位并留痕（响亮，不静默）。
 *
 * @module dsh-pmboard/goal-round/heartbeat
 */

/** 心跳判据要读的需求事实（窄投影）。 */
export interface HeartbeatFacts {
  readonly id: string
  /** 人的意图（armed 才叫得醒）。 */
  readonly armed: boolean
  /** 运行时健康：paused 说明驱动侧已停手（可能正等人）。 */
  readonly runtimePaused?: boolean
  /** 推进告警（advance.pausedReason 存在 ⇒ 不叫醒）。 */
  readonly advancePausedReason?: string
  /** 上次成功叫醒时刻。 */
  readonly lastWakeAt?: number
  /** 上次活跃时刻（回合跑过的证据）。 */
  readonly lastActiveAt?: number
  /** 有人在等（弹框在途 / 等人工确认）。 */
  readonly awaitingHuman?: boolean
  /** 该需求是否有可跑之事（有 active goal 或 ready 卡）。 */
  readonly hasWork?: boolean
}

export type WakePlan =
  | { readonly kind: 'wake'; readonly id: string }
  | { readonly kind: 'reconcile'; readonly id: string; readonly reason: string }
  | { readonly kind: 'skip'; readonly id: string; readonly reason: string }

export interface PlanWakeOptions {
  /** 新鲜窗（毫秒）：窗内有活跃或叫醒记录即不再叫。 */
  readonly freshMs: number
}

/**
 * 单个需求的唤醒判据（纯函数）。
 *
 * `awaitingHuman` 与 `hasWork` 的取舍：**有人等**优先于"有活"——等人不是故障，硬叫只会空转。
 * 但"台账写着等弹框、实际无在途"是**死等**：这一形态交给调用侧的 `reconcileDialog` 判据处理
 * （本函数只按 `awaitingHuman` 跳过）。
 */
export function planWake(f: HeartbeatFacts, now: number, opts: PlanWakeOptions): WakePlan {
  if (!f.armed) return { kind: 'skip', id: f.id, reason: 'not-armed' }
  if (f.runtimePaused === true && f.awaitingHuman !== true) {
    return { kind: 'skip', id: f.id, reason: 'runtime-paused' }
  }
  if (f.advancePausedReason !== undefined) {
    return { kind: 'skip', id: f.id, reason: 'advance-paused:' + f.advancePausedReason }
  }
  if (f.awaitingHuman === true) return { kind: 'skip', id: f.id, reason: 'awaiting-human' }
  if (f.hasWork === false) return { kind: 'skip', id: f.id, reason: 'no-work' }
  const last = Math.max(f.lastWakeAt ?? 0, f.lastActiveAt ?? 0)
  if (last > 0 && now - last < opts.freshMs) return { kind: 'skip', id: f.id, reason: 'fresh' }
  return { kind: 'wake', id: f.id }
}

/** 心跳副作用端口（全部注入：台账写、叫醒、留痕）。 */
export interface HeartbeatPorts {
  /** 取需求事实（同步窄投影）。 */
  facts(): readonly HeartbeatFacts[]
  /** 叫醒一次；返回 false = 窗口不受理（死窗口，如未绑活 agent）。 */
  wake(id: string): Promise<boolean>
  /** 叫醒成功：刷 `lastWakeAt`。 */
  markWoken(id: string, at: number): void
  /** 窗口不受理：写停手位 + 留痕（响亮）。 */
  markWakeFailed(id: string, reason: string, at: number): void
  /** 有界留痕（诊断面）。 */
  trace(reason: string, id?: string): void
  /** 在闸（上游闩 / 驱动闭锁）：整趟跳过。 */
  latchOpen?: () => boolean
  now(): number
  logger: { info(m: string): void; debug(m: string): void; warn(m: string, err?: unknown): void }
}

export interface HeartbeatOptions {
  readonly freshMs: number
  /** 连续不受理达此数 → 写停手位（缺省 3）。 */
  readonly maxFailures?: number
}

export interface HeartbeatTick {
  /** 本趟是否因在闸而整趟跳过。 */
  readonly skippedByLatch: boolean
  readonly woken: readonly string[]
  readonly skipped: readonly { id: string; reason: string }[]
  readonly failed: readonly string[]
}

/** 心跳（一拍一次；由组合根的定时器/宿主心跳驱动）。 */
export function createGoalHeartbeat(ports: HeartbeatPorts, opts: HeartbeatOptions) {
  const failures = new Map<string, number>()
  const maxFailures = opts.maxFailures ?? 3

  async function tick(): Promise<HeartbeatTick> {
    if (ports.latchOpen?.() === true) {
      // 在闸 → 整趟跳过：**不刷 lastWakeAt、不碰健康位**（否则会把"停手"洗成"健康"）。
      ports.logger.debug('goal-heartbeat: 在闸 → 整趟跳过')
      return { skippedByLatch: true, woken: [], skipped: [], failed: [] }
    }
    const now = ports.now()
    const woken: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []
    const failed: string[] = []

    for (const f of ports.facts()) {
      const plan = planWake(f, now, { freshMs: opts.freshMs })
      if (plan.kind === 'skip') {
        skipped.push({ id: plan.id, reason: plan.reason })
        continue
      }
      let accepted = false
      try {
        accepted = await ports.wake(plan.id)
      } catch (err) {
        ports.logger.warn('goal-heartbeat: 叫醒抛错——' + plan.id, err)
        accepted = false
      }
      if (accepted) {
        failures.delete(plan.id)
        ports.markWoken(plan.id, ports.now())
        woken.push(plan.id)
        continue
      }
      failed.push(plan.id)
      const n = (failures.get(plan.id) ?? 0) + 1
      failures.set(plan.id, n)
      ports.trace('wake-undeliverable:' + n, plan.id)
      if (n >= maxFailures) {
        // 达阈值：写停手位（**只写健康位，不改人的意图**）+ 留痕。
        ports.markWakeFailed(plan.id, 'wake-undeliverable:' + n, ports.now())
        ports.logger.warn('goal-heartbeat: 连续 ' + n + ' 次叫不醒 → 写停手位（需求=' + plan.id + '）')
      }
    }
    return { skippedByLatch: false, woken, skipped, failed }
  }

  return { tick, failures }
}
