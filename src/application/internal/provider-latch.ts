/**
 * 全局上游闩（REQ-261004065652-5c1c FR-1 · t1）。
 *
 * ## 为什么是"全局"而不是"每条需求各停各的"
 *
 * 2026-10-03 实测：两个窗口（REQ-261003222428-3556 / REQ-261003203909-55f2）共享同一份
 * provider 额度，**同一分钟一起撞上限**（18:03:45 / 18:03:52）。只让"撞上的那条需求"停手，
 * 第二个窗口会继续把剩余额度打光——所以致命错误必须**进程级**记账。
 *
 * ## 三条纪律
 *
 *   ① `isOpen()` 是**纯读、同步、不 await**——它要被 idle 同步拍调用，不能引入 I/O；
 *   ② `trip` 幂等：闩已开且病因相同时**不延长 until**（否则持续报错会把 TTL 无限续期 = 永久停摆）；
 *   ③ `clear` 只能由人（看板「继续」/确认推进）或系统"额度恢复"显式调用——
 *      **自动路径永不 clear**，否则又变成自旋。
 *
 * @module dsh-pmboard/application/internal/provider-latch
 */

/** 缺省 TTL = 5 小时（provider 的额度窗口口径；实测 5 小时限额的 reset 就是这个量级）。 */
export const DEFAULT_PROVIDER_LATCH_TTL_MS = 5 * 60 * 60 * 1000

export interface ProviderLatchSnapshot {
  open: boolean
  reasonClass?: string
  until?: number
  requirementId?: string
  /** 最近一次人工清闩的时刻（可观测：人看得见"是谁在什么时候解开的"）。 */
  clearedAt?: number
}

export interface ProviderLatch {
  /** 置闩（幂等：已开且同因 → 不延长）。 */
  trip(input: { reasonClass: string; requirementId?: string; ttlMs?: number }): void
  /** 是否仍在闩内（纯读，用注入的 now()）。 */
  isOpen(): boolean
  /** 闩的失效时刻（未置闩 / 已过期 = undefined）。 */
  until(): number | undefined
  /** 当前闩的病因类别（未置闩 / 已过期 = undefined）。 */
  reasonClass(): string | undefined
  /** 人/系统显式清闩。 */
  clear(input: { by: 'human' | 'system'; reason?: string }): void
  /** 只读快照（诊断与看板用）。 */
  snapshot(): ProviderLatchSnapshot
}

interface LatchState {
  reasonClass: string
  until: number
  requirementId?: string
}

export function createProviderLatch(deps: {
  now: () => number
  defaultTtlMs?: number
}): ProviderLatch {
  const ttl = deps.defaultTtlMs ?? DEFAULT_PROVIDER_LATCH_TTL_MS
  let state: LatchState | undefined
  let clearedAt: number | undefined

  const isOpen = (): boolean => state !== undefined && deps.now() < state.until
  const live = (): LatchState | undefined => (isOpen() ? state : undefined)

  return {
    trip(input) {
      const now = deps.now()
      const current = live()
      // 幂等：闩已开且病因相同 → 保持原 until（不续期，见头注纪律②）。
      if (current !== undefined && current.reasonClass === input.reasonClass) return
      const span = input.ttlMs ?? ttl
      state = {
        reasonClass: input.reasonClass,
        until: now + (span > 0 ? span : ttl),
        ...(input.requirementId !== undefined ? { requirementId: input.requirementId } : {}),
      }
    },

    isOpen,

    until() {
      return live()?.until
    },

    reasonClass() {
      return live()?.reasonClass
    },

    clear(input) {
      if (input.by !== 'human' && input.by !== 'system') return
      state = undefined
      clearedAt = deps.now()
    },

    snapshot() {
      const current = live()
      return {
        open: current !== undefined,
        ...(current !== undefined
          ? {
              reasonClass: current.reasonClass,
              until: current.until,
              ...(current.requirementId !== undefined ? { requirementId: current.requirementId } : {}),
            }
          : {}),
        ...(clearedAt !== undefined ? { clearedAt } : {}),
      }
    },
  }
}
