// serves: FR-4
/**
 * 驱动「本拍放弃」的有界留痕用例（REQ-261006170150-52cc · design/test-cases.md 的 TC-10）。
 *
 * 锁的是什么：放弃是**每拍都会发生**的正常动作（弹框在途 / 不可驱动 / 人工门开着），
 * 因此留痕必须**有界**——同 (需求, 原因) 在冷却窗内只记一条，否则诊断面会被刷爆、
 * 真正的信号反而看不见；同时**异因必须各记各的**，否则三种放弃会互相吃掉痕迹。
 *
 * 为什么是 L1：冷却判据是纯时间函数，注入固定时钟即可把边界穷举干净，零 IO。
 */
import { describe, it, expect } from 'vitest'
import {
  createWakeSkipTracer,
  WAKE_SKIP_COOLDOWN_MS,
} from '../src/application/dive/wake-skip-trace.js'

const REQ = 'REQ-000001'
const REQ2 = 'REQ-000002'
const STATUS = 'implementing'

/** 固定时钟夹具：`lines` 收集落痕通道收到的原文。 */
function make(cooldownMs?: number) {
  let now = 1_000_000
  const lines: string[] = []
  const tracer = createWakeSkipTracer({
    now: () => now,
    emit: (line) => { lines.push(line) },
    ...(cooldownMs === undefined ? {} : { cooldownMs }),
  })
  return { tracer, lines, advance: (ms: number) => { now += ms } }
}

describe('TC-10 放弃留痕的冷却（FR-4）', () => {
  it('同需求同因连续 5 拍 ⇒ 冷却窗内恰好 1 条', () => {
    const { tracer, lines } = make()

    const recorded = [
      tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight'),
      tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight'),
      tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight'),
      tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight'),
      tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight'),
    ]

    expect(lines).toHaveLength(1)
    // 只有第一拍真的记了，其余 4 拍被判为冷却内重复
    expect(recorded).toEqual([true, false, false, false, false])
  })

  it('留痕行文 = [WAKE-SKIP] reason=… req=… status=…（诊断面按此聚合）', () => {
    const { tracer, lines } = make()

    tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight')

    expect(lines[0]).toBe('[WAKE-SKIP] reason=dialog-in-flight req=' + REQ + ' status=' + STATUS)
  })

  it('跨冷却窗 ⇒ 再记 1 条（冷却不吞掉后续的真实放弃）', () => {
    const { tracer, lines, advance } = make()
    tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight')

    advance(WAKE_SKIP_COOLDOWN_MS)

    expect(tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight')).toBe(true)
    expect(lines).toHaveLength(2)
  })

  it('恰好到冷却窗边界（差值 == 冷却窗）仍可记：判据用严格小于', () => {
    const { tracer, lines, advance } = make()
    tracer.noteGiveUp(REQ, STATUS, 'not-drivable')

    advance(WAKE_SKIP_COOLDOWN_MS - 1)
    expect(tracer.noteGiveUp(REQ, STATUS, 'not-drivable')).toBe(false)
    expect(lines).toHaveLength(1)

    advance(1) // 差值恰好 = 冷却窗
    expect(tracer.noteGiveUp(REQ, STATUS, 'not-drivable')).toBe(true)
    expect(lines).toHaveLength(2)
  })

  it('异因互不影响：同需求三种原因各记各的（不会互相吃掉痕迹）', () => {
    const { tracer, lines } = make()

    tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight')
    tracer.noteGiveUp(REQ, STATUS, 'not-drivable')
    tracer.noteGiveUp(REQ, STATUS, 'human-gate')

    expect(lines).toHaveLength(3)
    expect(lines.map(l => l.replace(/^.*reason=/, '').split(' ')[0]))
      .toEqual(['dialog-in-flight', 'not-drivable', 'human-gate'])
  })

  it('异需求互不影响：两条需求各自计时', () => {
    const { tracer, lines } = make()

    tracer.noteGiveUp(REQ, STATUS, 'dialog-in-flight')
    tracer.noteGiveUp(REQ2, STATUS, 'dialog-in-flight')

    expect(lines).toHaveLength(2)
  })

  it('自定义冷却窗可覆盖（默认 60 秒不被写死）', () => {
    const { tracer, lines, advance } = make(1_000)
    tracer.noteGiveUp(REQ, STATUS, 'human-gate')

    advance(1_000)

    expect(tracer.noteGiveUp(REQ, STATUS, 'human-gate')).toBe(true)
    expect(lines).toHaveLength(2)
  })

  it('落痕通道抛错不外溢（诊断面不得反过来挡住驱动）', () => {
    let now = 1_000_000
    const tracer = createWakeSkipTracer({
      now: () => now,
      emit: () => { throw new Error('诊断面炸了') },
    })

    expect(() => { tracer.noteGiveUp(REQ, STATUS, 'not-drivable') }).not.toThrow()
    now += WAKE_SKIP_COOLDOWN_MS
    expect(() => { tracer.noteGiveUp(REQ, STATUS, 'not-drivable') }).not.toThrow()
  })
})
