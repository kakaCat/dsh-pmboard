/**
 * reqboard_task_tree(task_id) 单卡台账数据源（原 reqboard_task_status，REQ-261007220012-bd29 FR-3 并入）。
 * serves: FR-3
 *
 * 口径：TC-8 跑过链的卡读到真实 run 结果；TC-9 无 lastRun → run/workflow 缺省、不报错、不伪造。
 * 关键：测试**不放任何卡文档**（FakeDocs 为空）——读数不依赖卡文档，死数据源才算真删掉。
 */
import { describe, expect, it } from 'vitest'
import { makeHarness, req, task } from './application/harness.js'
import { defineTaskTreeTool } from '../src/tools/index.js'
import { expectNoCode } from './helpers/code-assert.js'

const W = 'session-w-001'
const run = (t: unknown, args: unknown): Promise<Record<string, any>> =>
  (t as { execute: (a: unknown, e: unknown) => Promise<Record<string, any>> }).execute(args, { agent: { id: W } })

describe('reqboard_task_tree(task_id)（FR-3：并入单卡查询，读台账 lastRun/lastReport）', () => {
  it('TC-8 跑过链的子卡 → 读到真实 run 结果与汇报摘要（不依赖卡文档）', async () => {
    const h = makeHarness({ tasks: [task({
      id: 't-s1', requirementId: 'REQ-000001', status: 'in_review',
      lastRun: { at: 7, ok: false, stopReason: 'error', valueNonEmpty: false, reason: 'engine_unavailable' },
      lastReport: { at: 7, reportIndex: 1, filesChanged: ['src/a.ts', 'src/b.ts'], completed: ['改完 a.ts'] },
    })] })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()
    const out = await run(defineTaskTreeTool(h.deps), { task_id: 't-s1' })
    expect(out.success).toBe(true)
    expect(out.task.status).toBe('in_review')
    expect(out.task.progress).toBe(85)
    expect(out.task.run.ok).toBe(false)
    expect(out.task.run.stopReason).toBe('error')
    expect(out.task.run.reason).toBe('engine_unavailable')
    expect(out.task.report.completedCount).toBe(1)
    expect(out.task.report.filesChangedCount).toBe(2)
    // workflow 键保留（既有消费者契约），内容换成真实 run 摘要
    expect(out.task.workflow.stopReason).toBe('error')
  })

  it('TC-9 无 lastRun 的卡 → run/workflow 缺省，不报错、不伪造', async () => {
    const h = makeHarness({ tasks: [task({ id: 't-a', requirementId: 'REQ-000001', status: 'todo' })] })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()
    const out = await run(defineTaskTreeTool(h.deps), { task_id: 't-a' })
    expect(out.success).toBe(true)
    expect(out.task.run).toBeUndefined()
    expect(out.task.workflow).toBeUndefined()
    expect(out.task.progress).toBe(0)
  })

  it('任务不存在 → success=false + 明确 error（不返回空当成功）', async () => {
    const h = makeHarness()
    const out = await run(defineTaskTreeTool(h.deps), { task_id: 't-nope' })
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码——该分支契约上**不带码**（判别位是 status=not_found），
    // 故钉判别位 + 「不携带码」，而不是编一个码出来。
    expect(out.task.status).toBe('not_found')
    expectNoCode(out)
    expect(String(out.error)).toContain('t-nope')
  })

  it('FR-3：task_id 与 parent_id 互斥——同传即拒（一次只查一样）', async () => {
    const h = makeHarness({ tasks: [task({ id: 't-a', requirementId: 'REQ-000001', status: 'todo' })] })
    h.seedRequirementSync(req({ status: 'implementing' }))
    await h.seedSettled()
    const out = await run(defineTaskTreeTool(h.deps), { task_id: 't-a', parent_id: 't-a' })
    expect(out.success).toBe(false)
    expect(String(out.error)).toContain('REQBOARD_INVALID_INPUT')
    expect(String(out.error)).toContain('互斥')
  })
})
