/**
 * WorkflowRunner：引擎**不可达**时的结构化失败（2026-10-03 二次修复）。
 *
 * ## 为什么需要这一层
 *
 * `workflowEngine` 被 DSH 的 agent preset 用
 * `isolate: { workflowEngine: true }`（`packages/bundle/web-app/presets/cordis.patch.yml`）
 * 圈在 agent 的 delegation 组内，profile 级插件按设计取不到它。原实现只回一句裸的
 * `engine_unavailable`，读起来像瞬时故障，诱使操作者反复重试——实测子卡链连挂 4 次
 * （`docs/requirements/REQ-261003191948-e94a/advance-log.md`）。
 *
 * 现在要求：**响亮 + 可行动 + 可追溯**，且**绝不静默成功**。
 */
import { describe, expect, it } from 'vitest'
import {
  ENGINE_UNREACHABLE_CODE,
  WorkflowEngineRunner,
  type WorkflowEngineLike,
  type WorkflowRunLike,
} from '../../src/adapters/WorkflowEngineRunner.js'

const input = { script: 'return 1', meta: { name: 'reqboard-subtask-dev', description: '子卡执行：x' } }

describe('引擎不可达：结构化 reason + 诊断留痕（不静默成功）', () => {
  it('① 不可达 → ok:false，主码可行动，附探针输出与两条出路，并留痕一行', async () => {
    const lines: string[] = []
    const runner = new WorkflowEngineRunner(() => undefined, {
      describeUnavailable: () =>
        'inject=function get=function byGet=false captured=false [tools=true agents=true webServer=true]',
      diag: (line) => { lines.push(line) },
    })

    const out = await runner.start(input)

    expect(out.ok, '绝不静默成功').toBe(false)
    expect(out.reason).toContain(ENGINE_UNREACHABLE_CODE)
    expect(out.reason, '带上可达性探针输出，便于一次定位').toContain('byGet=false')
    expect(out.reason, '要给出可行动的出路，而不是只说失败').toContain('reqboard_task_report')
    expect(out.reason, '必须说明重试无解').toContain('重试无解')
    // 失败分类器（failure-handling）按 includes('engine_unavailable') 归类 ⇒ 保留该子串
    expect(out.reason, 'legacy 码保留，失败分类不漂移').toContain('engine_unavailable')

    expect(lines, '诊断通道恰好一行').toHaveLength(1)
    expect(lines[0]).toContain('SUBTASK-ENGINE-UNREACHABLE')
    expect(lines[0]).toContain(ENGINE_UNREACHABLE_CODE)
  })

  it('② 没有注入钩子时，主码也不退回裸的 engine_unavailable', async () => {
    const runner = new WorkflowEngineRunner(() => undefined)
    const out = await runner.start(input)
    expect(out.ok).toBe(false)
    expect(out.reason?.startsWith(ENGINE_UNREACHABLE_CODE)).toBe(true)
  })

  it('③ 探针抛错 / 诊断抛错都**不得**把优雅失败变成异常（2026-10-03 回归防线）', async () => {
    const runner = new WorkflowEngineRunner(() => undefined, {
      describeUnavailable: () => { throw new Error('probe boom') },
      diag: () => { throw new Error('diag boom') },
    })

    const out = await runner.start(input) // 不得 reject
    expect(out.ok).toBe(false)
    expect(out.reason).toContain(ENGINE_UNREACHABLE_CODE)
    expect(out.reason, '探针自身抛错也要响亮但安全').toContain('probe boom')
  })

  it('④ 引擎可达时行为逐字不变：成功委托、失败透传、dispose 必被调用', async () => {
    let disposed = 0
    const run: WorkflowRunLike = {
      result: Promise.resolve({ value: { output: '{"filesChanged":[]}' }, stopReason: 'completed' }),
      dispose: async () => { disposed += 1 },
    }
    const engine: WorkflowEngineLike = { start: () => run }
    const runner = new WorkflowEngineRunner(() => engine, {
      describeUnavailable: () => '不应被调用',
      diag: () => { throw new Error('不应被调用') },
    })

    const out = await runner.start(input)
    expect(out.ok).toBe(true)
    expect(out.value).toEqual({ output: '{"filesChanged":[]}' })
    expect(disposed).toBe(1)
  })

  it('⑤ 引擎可达但 run 非 completed → 透传 stopReason（旧口径不变、不被新码顶替）', async () => {
    const engine: WorkflowEngineLike = {
      start: () => ({ result: Promise.resolve({ stopReason: 'cancelled' }) }),
    }
    const runner = new WorkflowEngineRunner(() => engine)
    const out = await runner.start(input)
    expect(out.ok).toBe(false)
    expect(out.reason).toBe('cancelled')
    expect(out.reason).not.toContain(ENGINE_UNREACHABLE_CODE)
  })
})
