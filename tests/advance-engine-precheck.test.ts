// serves: FR-10, FR-11
/**
 * 子卡引擎开工预检（REQ-261004065652-5c1c · t7 / TC-11）。
 *
 * ## 复现的现场
 *
 * 2026-10-03：本 profile 的 agent preset 用 `isolate: { workflowEngine: true }` 把引擎圈在 agent
 * 作用域，profile 级插件**永远取不到**——实测同一条需求连挂 4 次，每次都得到一句无法行动的原因
 * （`subtask_engine_unreachable`），诱使操作者反复重试；另一条需求的 10 张父卡最终只有 1 张落了子卡。
 *
 * ## 本文件钉住三件事
 *
 * ① **开工前**预检：不可达 → `stopped='engine_unreachable'`、**本次未落任何子卡**、回话含两条出路；
 * ② **幂等短路**：连续推进 3 次只有第 1 次写台账，后两次**零写入**（revision 不变）；
 * ③ **不误伤**：探针缺失（缺省）或可达时，行为与改动前逐字一致（照常落子卡、照常跑）。
 */
import { describe, it, expect } from 'vitest'
import { advanceRequirement, ENGINE_UNREACHABLE_MARK } from '../src/application/use-cases/AdvanceChain.js'
import { ENGINE_UNREACHABLE_CODE } from '../src/adapters/WorkflowEngineRunner.js'
import type { WorkflowRunner, WorkflowRunOutcome } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'

/** 一条 implementing + autoRun 的需求，带一张待开工的父卡（开工后会懒展开子卡）。 */
async function seed() {
  const h = makeHarness()
  h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
  h.seedTasks('REQ-000001', [
    task({ id: 't-p1', requirementId: 'REQ-000001', status: 'todo', title: '父卡', scope: { apis: [], tables: [], files: [] } }),
  ])
  await h.seedSettled()
  return h
}

/** 探针固定的执行器（start 不会真被调到，除非可达）。 */
function runner(reachable: boolean | undefined): WorkflowRunner {
  return {
    start: async (): Promise<WorkflowRunOutcome> => ({ ok: true, runId: 'run-x' }) as unknown as WorkflowRunOutcome,
    ...(reachable === undefined ? {} : { reachable: () => reachable }),
  }
}

const childCount = async (h: Awaited<ReturnType<typeof seed>>): Promise<number> =>
  (await h.taskStore.listByRequirement('REQ-000001')).filter((t) => t.parentId !== undefined).length

describe('TC-11 · 不可达 → 开工前拦下、不落假子卡', () => {
  it('第一次推进：stopped=engine_unreachable、回话含「本次未落任何子卡」与两条出路、父卡未开工', async () => {
    const h = await seed()
    h.deps.workflow = runner(false)

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out.stopped).toBe('engine_unreachable')
    const detail = out.steps.map((s) => s.detail).join('\n')
    expect(detail).toContain('子卡执行引擎不可达')
    expect(detail).toContain('本次未落任何子卡')
    expect(detail).toContain('reqboard_task_report')
    expect(detail).toContain('重试无解')
    // 父卡仍是 todo（**没有假装开工**），也没有落任何子卡
    const parent = (await h.taskStore.listByRequirement('REQ-000001')).find((t) => t.id === 't-p1')
    expect(parent?.status).toBe('todo')
    expect(await childCount(h)).toBe(0)
  })

  it('连续推进 3 次：只有第 1 次写台账，后两次 revision 不变（幂等短路）', async () => {
    const h = await seed()
    h.deps.workflow = runner(false)

    const first = await advanceRequirement(h.deps, 'REQ-000001')
    expect(first.stopped).toBe('engine_unreachable')
    const rev1 = (await h.store.head()).revision
    const historyAfterFirst = ((await h.store.get('REQ-000001'))?.advance?.history ?? []).filter((r) => r.detail.includes(ENGINE_UNREACHABLE_MARK))
    expect(historyAfterFirst, '第 1 次如实记一条').toHaveLength(1)

    const second = await advanceRequirement(h.deps, 'REQ-000001')
    const third = await advanceRequirement(h.deps, 'REQ-000001')
    expect(second.stopped).toBe('engine_unreachable')
    expect(third.stopped).toBe('engine_unreachable')
    expect((await h.store.head()).revision, '短路必须零写入').toBe(rev1)
    const historyNow = ((await h.store.get('REQ-000001'))?.advance?.history ?? []).filter((r) => r.detail.includes(ENGINE_UNREACHABLE_MARK))
    expect(historyNow, '后两次不该再刷历史').toHaveLength(1)
    // 回话仍然如实（不是静默）
    expect(second.steps.map((s) => s.detail).join(' ')).toContain('本次未落任何子卡')
  })

  it('标记常量与适配器的错误码同值（防两处字面量漂移）', () => {
    expect(ENGINE_UNREACHABLE_MARK).toBe(ENGINE_UNREACHABLE_CODE)
  })
})

describe('TC-11 · 不误伤：可达或缺省时行为不变', () => {
  it('探针说可达 → 照常落子卡（预检不是新门槛）', async () => {
    const h = await seed()
    h.deps.workflow = runner(true)

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out.stopped).not.toBe('engine_unreachable')
    expect(await childCount(h), '可达时子卡照常落').toBeGreaterThan(0)
  })

  it('未装配探针（缺省 undefined）→ 不预检、行为与改动前一致', async () => {
    const h = await seed()
    h.deps.workflow = runner(undefined)

    const out = await advanceRequirement(h.deps, 'REQ-000001')

    expect(out.stopped).not.toBe('engine_unreachable')
    expect(await childCount(h)).toBeGreaterThan(0)
  })

  it('探针抛错 → 按可达处理（预检的 bug 不该拦住链）', async () => {
    const h = await seed()
    h.deps.workflow = { start: runner(true).start, reachable: () => { throw new Error('探针炸了') } }

    const out = await advanceRequirement(h.deps, 'REQ-000001')
    expect(out.stopped).not.toBe('engine_unreachable')
    expect(await childCount(h)).toBeGreaterThan(0)
  })
})
