/**
 * 父子链收尾不该被节流（REQ-261001170807-06fd t1/t4 · serves: FR-1）。
 *
 * 复现（修复前必红）：子卡关闭豁免节流，但它的 done 事件会给父卡"上弦"——
 * 于是"关完子卡 → 关父卡"这个唯一正确的收尾顺序，必然命中 60s 批量关闭节流。
 *
 * A1 父卡收尾一次成功 / A2 兄弟卡仍被拦 / A3 跨卡仍被拦 —— A2/A3 是**红线**：
 * 修 A1 不许把防滥用的能力一起放宽。
 */
import { describe, it, expect } from 'vitest'
import { findRecentAgentDoneTask, doneThrottleRemainingMs } from '../src/domain/workflow/DoneEvidenceSpec.js'

const REQ = 'REQ-x'
const done = (at: number) => [{ status: 'done', by: { kind: 'agent' }, at }]
const task = (id: string, parentId: string | undefined, history: any[]) =>
  ({ id, title: id, requirementId: REQ, ...(parentId === undefined ? {} : { parentId }), statusHistory: history }) as never

const NOW = 30_000
const THROTTLE = 60_000

describe('父子链收尾（FR-1）', () => {
  it('A1：本卡刚关掉的子卡，不再给父卡上弦 → 父卡可立即收尾', () => {
    const tasks = [task('t-parent', undefined, []), task('t-child', 't-parent', done(1_000))]
    expect(findRecentAgentDoneTask(tasks, 't-parent', REQ, NOW, THROTTLE)).toBeUndefined()
    expect(doneThrottleRemainingMs(tasks, 't-parent', REQ, NOW, THROTTLE)).toBe(0)
  })

  it('A2（红线）：刚关掉的是**兄弟卡** → 仍被节流拦住', () => {
    const tasks = [task('t-a', undefined, []), task('t-b', undefined, done(1_000))]
    expect(findRecentAgentDoneTask(tasks, 't-a', REQ, NOW, THROTTLE)?.id).toBe('t-b')
    expect(doneThrottleRemainingMs(tasks, 't-a', REQ, NOW, THROTTLE)).toBe(31_000)
  })

  it('A3（红线）：子卡的 done 不影响**别的父卡** → 跨卡仍被拦', () => {
    const tasks = [task('t-other', undefined, []), task('t-child', 't-parent', done(1_000))]
    expect(findRecentAgentDoneTask(tasks, 't-other', REQ, NOW, THROTTLE)?.id).toBe('t-child')
  })

  it('窗口过期后一律不节流（既有语义不变）', () => {
    const tasks = [task('t-parent', undefined, []), task('t-child', 't-parent', done(1_000))]
    expect(doneThrottleRemainingMs(tasks, 't-parent', REQ, 70_000, THROTTLE)).toBe(0)
  })
})
