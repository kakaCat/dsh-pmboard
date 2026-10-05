/**
 * 自动投递回执必须说真话（REQ-261001154450-b918 t5 / serves: FR-3）。
 *
 * 修前：投递函数返回 dispatched:false 时，回执仍写「已触发首个任务执行」——本会话实测
 * 三次计划批准后 run 快照都是 jobStatus: not_found，而回执说"已触发"。本用例把它钉死。
 */
import { describe, it, expect } from 'vitest'
import { dispatchNoteOf } from '../src/application/internal/auto-advance-note.js'

describe('dispatchNoteOf（FR-3：不冒功、不吞失败）', () => {
  it('未投递 → 明说未投递 + 原因 + 续跑入口', () => {
    const note = dispatchNoteOf({ dispatched: false, reason: 'jobs_unavailable' })
    expect(note).toContain('未投递')
    expect(note).toContain('jobs_unavailable')
    expect(note).toContain('reqboard_task_run')
    expect(note).not.toContain('已投递首个任务')
  })

  it('未投递且无原因 → 也如实说"未给出原因"，不编', () => {
    expect(dispatchNoteOf({ dispatched: false })).toContain('未给出原因')
  })

  it('已投递 → 带 run id 便于核对', () => {
    expect(dispatchNoteOf({ dispatched: true, runId: 'run-abc' })).toContain('run-abc')
  })

  it('老形状（无 dispatched 字段）→ 按已投递处理，不误报失败', () => {
    expect(dispatchNoteOf({})).toContain('已投递首个任务')
  })
})
