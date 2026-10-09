/*
 * serves: BUG-1（run 节字段集：死字段不再回报）
 * reqboard_status 的 run 节回归（原 reqboard_run_status 工具壳，REQ-261007220012-bd29 FR-3 并入）。
 *
 * 历史根因（原工具壳）：execute 曾把 QueryRunStatus 用例当 (deps, id, exec) 调用，
 * 而用例契约是单个 QueryParams 对象 → 运行期 getRequirement 为 undefined 直接抛错。
 * 并入后本测试锁同样四件事：① 有 checkpoint + 宿主 JobsPort → run.runId/stepIndex/jobStatus；
 * ② 无 JobsPort → 不抛错、如实 not_found；③ 无 checkpoint → run.runId 键**整体省略**（不是 null）；
 * ④ 需求缺失 → run 节如实报 error（不把整个 status 拖崩）。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req, task } from './application/harness.js'
import { defineStatusTool } from '../src/tools/index.js'

const W = 'session-w-001'

/** 造一个"已绑定本窗口 + 有 checkpoint"的现场；返回 status 工具的 execute。 */
function scene(over: { advance?: unknown; tasks?: unknown[]; jobs?: unknown } = {}) {
  const tasks = (over.tasks ?? []) as never[]
  const h = makeHarness({ tasks: tasks as never })
  h.seedRequirementSync(req({
    id: 'REQ-261007220099-a001', status: 'implementing', sourceSessionId: W,
    ...(over.advance !== undefined ? { advance: over.advance } : {}),
  } as never))
  if (over.jobs !== undefined) (h.deps as { jobs?: unknown }).jobs = over.jobs
  const tool = defineStatusTool(h.deps) as unknown as {
    execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>>
  }
  return { tool, h }
}

function runSectionOf(out: Record<string, unknown>): Record<string, unknown> {
  return (out.run ?? {}) as Record<string, unknown>
}

/**
 * 闸门：**run 节必须能通过 status 自己声明的输出 schema**。
 *
 * 为什么需要它（2026-09-27 实测事故）：无 active run 时原工具把 `snapshot.runId` 发成 `null`，
 * 而 schema 声明为 `type: 'string'` ⇒ 值级类型校验失败，把「当前没有链在跑」这个**正常事实**
 * 转译成硬错误 `value.snapshot.runId must be a string`。单测只断言返回值、从不过 schema，
 * 所以没拦住。本函数补上这道闸门——声明为 string/number/boolean 的键一旦出现就必须是该类型。
 */
function assertConformsToSchema(schema: any, value: any, path = '$'): void {
  if (schema?.type !== 'object' || schema.properties === undefined) return
  const obj = (value ?? {}) as Record<string, unknown>
  for (const [key, spec] of Object.entries<any>(schema.properties)) {
    if (!(key in obj)) continue // 键整体省略是合法的（这正是降级路径的正确形状）
    const v = obj[key]
    const declared = spec?.type
    if (declared === 'string' || declared === 'number' || declared === 'boolean') {
      expect(typeof v, `${path}.${key} 在 schema 里声明为 ${declared}，实际值 ${JSON.stringify(v)}`).toBe(declared)
    } else if (declared === 'array') {
      expect(Array.isArray(v), `${path}.${key} 应声明为 array，实际 ${JSON.stringify(v)}`).toBe(true)
    } else if (declared === 'object') {
      assertConformsToSchema(spec, v, `${path}.${key}`)
    }
  }
}

const runningJobs = {
  start: async (): Promise<string> => 'job-1',
  get: async (): Promise<{ id: string; status: string }> => ({ id: 'run-1', status: 'running' }),
  available: (): boolean => true,
}

describe('reqboard_status 的 run 节（原 reqboard_run_status 工具壳）', () => {
  it('有 active run + JobsPort：run 节只给活字段（runId/jobStatus/autoRun）——恒 0 的进度字段不再回报', async () => {
    // REQ-261008011118-defe BUG-1（DD-1）：`stepIndex`/`currentSubtaskId` 的写侧
    // （CheckpointManager.writeCheckpoint）在生产代码 0 调用方 ⇒ 读侧恒报第 0 步。
    // 夹具**故意**把这两个遗产字段种进 `advance`：修后它们必须被忽略（不出现在 run 节），
    // 这条断言才是可证伪的（修前 `run.stepIndex === 3`，因为它读的就是夹具自己写的值）。
    const { tool } = scene({
      advance: { runId: 'run-1', stepIndex: 3, currentSubtaskId: 't-a' },
      tasks: [task({ id: 't-a', requirementId: 'REQ-261007220099-a001', status: 'todo' })],
      jobs: runningJobs,
    })
    const out = await tool.execute({ requirement_id: 'REQ-261007220099-a001' }, { agent: { id: W } })
    expect(out.success).not.toBe(false)
    const run = runSectionOf(out)
    expect(run.requirement_id).toBe('REQ-261007220099-a001')
    expect(run.runId).toBe('run-1')
    expect(run.jobStatus).toBe('running')
    expect(run.autoRun).toBe(true)
    // 死字段不再回报（真数据的活字段仍是上面三条）
    expect('stepIndex' in run).toBe(false)
    expect('currentSubtaskId' in run).toBe(false)
  })

  it('无 JobsPort：不抛错，jobStatus 如实 not_found（不伪装成运行中）', async () => {
    const { tool } = scene({ advance: { runId: 'run-1', stepIndex: 1 } })
    const out = await tool.execute({ requirement_id: 'REQ-261007220099-a001' }, { agent: { id: W } })
    const run = runSectionOf(out)
    expect(run.runId).toBe('run-1')
    expect(run.jobStatus).toBe('not_found')
    expect(run.autoRun).toBe(false)
  })

  it('无 checkpoint：run.runId 键**整体省略**（不是 null），且降级形状能过自己的 schema', async () => {
    const { tool } = scene({})
    const out = await tool.execute({ requirement_id: 'REQ-261007220099-a001' }, { agent: { id: W } })
    const run = runSectionOf(out)
    // 旧断言是 `toBeNull()` —— 那正是事故根源：null 与 schema 的 `type: 'string'` 冲突，
    // 工具输出校验会把它转成硬错误（本仓 DSL 表达不了 `string | null`）。
    expect('runId' in run).toBe(false)
    expect(run.jobStatus).toBe('not_found')
    expect(run.autoRun).toBe(false)
    expect('stepIndex' in run).toBe(false)
    assertConformsToSchema((defineStatusTool(scene({}).h.deps) as any).output.schema, out)
  })

  it('未绑定窗口且不传参：run 键整体省略（status 其余小节照常可用）', async () => {
    const h = makeHarness()
    const tool = defineStatusTool(h.deps) as unknown as {
      execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>>
    }
    const out = await tool.execute({}, { agent: { id: 'session-other-001' } })
    expect('run' in out).toBe(false)
    expect(out.bound).toBe(false)
  })

  it('有 active run 的返回体同样必须过自己的 schema（防止修复把正常路径一起改坏）', async () => {
    const { tool } = scene({
      advance: { runId: 'run-1', stepIndex: 3, currentSubtaskId: 't-a' },
      tasks: [task({ id: 't-a', requirementId: 'REQ-261007220099-a001', status: 'todo' })],
      jobs: runningJobs,
    })
    const out = await tool.execute({ requirement_id: 'REQ-261007220099-a001' }, { agent: { id: W } })
    assertConformsToSchema((defineStatusTool(scene({}).h.deps) as any).output.schema, out)
  })

  it('闸门本身不是恒真：把 run.runId 塞成 null 必须被它拦下（故障注入）', () => {
    const schema = (defineStatusTool(scene({}).h.deps) as any).output.schema
    expect(() => assertConformsToSchema(schema, { success: true, run: { runId: null } })).toThrow()
    // 对照组：键省略时放行（这才是合并后的正确形状）
    expect(() => assertConformsToSchema(schema, { success: true, run: { jobStatus: 'not_found' } })).not.toThrow()
  })

  it('显式点名不存在的需求：响亮抛 REQBOARD_REQUIREMENT_NOT_FOUND（不静默成功）', async () => {
    const { tool } = scene({ advance: { runId: 'run-1', stepIndex: 1 } })
    // 口径与合并前的运行态查询工具一致：**显式**点名目标需求时，读路径的失败必须被调用方看见
    // （error-code-matrix 的 REQBOARD_REQUIREMENT_NOT_FOUND 就是这条契约）；只有走窗口绑定的
    // 缺省路径才降级为「run 键整体省略」。
    await expect(tool.execute({ requirement_id: 'REQ-261007220099-ffff' }, { agent: { id: W } }))
      .rejects.toMatchObject({ code: 'REQBOARD_REQUIREMENT_NOT_FOUND' })
  })
})
