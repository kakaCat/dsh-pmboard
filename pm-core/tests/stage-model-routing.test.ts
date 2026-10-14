/**
 * 阶段模型路由（REQ-261004110201-f253 FR-1）——**纯函数判据段**。
 *
 * 2026-10-11 退役 workflow 引擎（删包 `pm-workflow` / 删 `workflow-script.ts` 与 `UseCaseDeps.workflow`）：
 * 原「生成器段」与「端到端注入段」两个 describe 一并删除——它们唯一测的是**脚本注入 route**
 * （`generateSubtaskScript` + 假引擎捕获脚本），随引擎退役属**有意行为变化**（执行面只剩 Agent Teams，
 * 注入面不复存在；团队等价物覆盖见 `pm-core/tests/execute-subtask-team.test.ts`）。
 * 保留的是与之无关的纯函数路由判据：
 *  ① 路由表校验（非法即抛并点名）；
 *  ② 两级命中解析（stageKind@difficulty 优先于 stageKind；未命中/未配置 → undefined）；
 *  ③ 三个配置 accessor 的缺省与非法语义。
 */
import { describe, it, expect } from 'vitest'
import { validateStageRouting, resolveStageModel } from 'pm-core/domain/task/StageRouting.js'
import {
  stageRoutingSetting,
  maxInFlightRequirementsSetting,
  zeroOutputAlertThresholdSetting,
} from 'pm-core/plugin-config.js'
import { STAGE_KINDS } from 'pm-core/domain/task/SubtaskTemplate.js'
import { ALL_PROMPT_DIFFICULTIES } from 'pm-core/protocol-domain.js'

describe('FR-1 契约段 ① 路由表校验：非法即抛并点名', () => {
  it('未配置（undefined / 空对象）合法 → {}（= 不注入，现状行为）', () => {
    expect(validateStageRouting(undefined)).toEqual({})
    expect(validateStageRouting(null)).toEqual({})
    expect(validateStageRouting({})).toEqual({})
  })

  it('合法形状：StageKind 与 StageKind@difficulty 都收，空串字段被拒', () => {
    const ok = validateStageRouting({
      dev: { model: 'strong' },
      'test@expert': { provider: 'p1', model: 'strong' },
      review: { provider: 'p2' },
    })
    expect(ok.dev).toEqual({ model: 'strong' })
    expect(ok['test@expert']).toEqual({ provider: 'p1', model: 'strong' })
    expect(ok.review).toEqual({ provider: 'p2' })
  })

  it('未知 stageKind → 抛错并点名（不静默忽略）', () => {
    expect(() => validateStageRouting({ devv: { model: 'x' } }))
      .toThrowError(/devv/)
    try {
      validateStageRouting({ devv: { model: 'x' } })
    } catch (err) {
      expect((err as { code?: string }).code).toBe('REQBOARD_STAGE_ROUTING_INVALID')
    }
  })

  it('空值（provider/model 全空或空串）→ 抛错；未知字段 → 抛错；非法难度 → 抛错', () => {
    expect(() => validateStageRouting({ dev: {} })).toThrowError(/至少要有一项/)
    expect(() => validateStageRouting({ dev: { model: '   ' } })).toThrowError(/model/)
    expect(() => validateStageRouting({ dev: { model: 'x', temperature: 1 } as never })).toThrowError(/未知字段/)
    expect(() => validateStageRouting({ 'dev@ultra': { model: 'x' } })).toThrowError(/难度非法/)
    expect(() => validateStageRouting({ 'dev@simple@x': { model: 'x' } })).toThrowError(/至多一个 @/)
    expect(() => validateStageRouting('dev' as never)).toThrowError(/必须是对象/)
  })

  it('难度枚举与 shared 的 PromptDifficulty 逐值一致（真实枚举锁死，非抄常量）', () => {
    for (const d of ALL_PROMPT_DIFFICULTIES) {
      expect(() => validateStageRouting({ ['test@' + d]: { model: 'x' } }), d).not.toThrow()
    }
    // 反向：非枚举值必须被拒（防"加了第五档却没人同步"）
    expect(() => validateStageRouting({ 'test@ultra': { model: 'x' } })).toThrow()
  })

  it('STAGE_KINDS 全量可用作路由键（防阶段扩段后路由表漏同步）', () => {
    for (const kind of STAGE_KINDS) {
      expect(() => validateStageRouting({ [kind]: { model: 'm' } }), kind).not.toThrow()
    }
  })
})

describe('FR-1 契约段 ② 两级命中解析', () => {
  const routing = {
    dev: { model: 'dev-model' },
    'dev@expert': { model: 'expert-dev-model' },
    review: { model: 'review-model' },
  }

  it('stageKind@difficulty 优先于 stageKind', () => {
    expect(resolveStageModel('dev', 'expert', routing)).toEqual({ model: 'expert-dev-model' })
    expect(resolveStageModel('dev', 'simple', routing)).toEqual({ model: 'dev-model' })
    expect(resolveStageModel('dev', undefined, routing)).toEqual({ model: 'dev-model' })
  })

  it('未命中与未配置 → undefined（调用方据此不注入）', () => {
    expect(resolveStageModel('integration', 'expert', routing)).toBeUndefined()
    expect(resolveStageModel('dev', 'expert', undefined)).toBeUndefined()
    expect(resolveStageModel('dev', 'expert', {})).toBeUndefined()
  })
})

describe('FR-1/FR-3/FR-4 契约段 ③ 三个配置 accessor：缺省 = 现状，非法 = 抛错', () => {
  it('stageRouting：未配置 → {}；非法 → 装配期抛错', () => {
    expect(stageRoutingSetting(undefined)).toEqual({})
    expect(stageRoutingSetting({})).toEqual({})
    expect(stageRoutingSetting({ stageRouting: { dev: { model: 'm' } } })).toEqual({ dev: { model: 'm' } })
    expect(() => stageRoutingSetting({ stageRouting: { nope: { model: 'm' } } })).toThrow()
  })

  it('maxInFlightRequirements：缺省 0（不限）；合法整数通过；负数/小数/非数抛错', () => {
    expect(maxInFlightRequirementsSetting(undefined)).toBe(0)
    expect(maxInFlightRequirementsSetting({})).toBe(0)
    expect(maxInFlightRequirementsSetting({ maxInFlightRequirements: 0 })).toBe(0)
    expect(maxInFlightRequirementsSetting({ maxInFlightRequirements: 3 })).toBe(3)
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(() => maxInFlightRequirementsSetting({ maxInFlightRequirements: bad }), String(bad)).toThrow()
    }
    try {
      maxInFlightRequirementsSetting({ maxInFlightRequirements: -1 })
    } catch (err) {
      expect((err as { code?: string }).code).toBe('REQBOARD_MAX_INFLIGHT_INVALID')
    }
  })

  it('zeroOutputAlertThreshold：缺省 2；≥1 整数通过；0/负数/非整数抛错', () => {
    expect(zeroOutputAlertThresholdSetting(undefined)).toBe(2)
    expect(zeroOutputAlertThresholdSetting({})).toBe(2)
    expect(zeroOutputAlertThresholdSetting({ zeroOutputAlertThreshold: 1 })).toBe(1)
    expect(zeroOutputAlertThresholdSetting({ zeroOutputAlertThreshold: 5 })).toBe(5)
    for (const bad of [0, -2, 1.5]) {
      expect(() => zeroOutputAlertThresholdSetting({ zeroOutputAlertThreshold: bad }), String(bad)).toThrow()
    }
    try {
      zeroOutputAlertThresholdSetting({ zeroOutputAlertThreshold: 0 })
    } catch (err) {
      expect((err as { code?: string }).code).toBe('REQBOARD_ZERO_OUTPUT_THRESHOLD_INVALID')
    }
  })

  it('协议三个新键均为可选：缺省记录上键不存在（不是 undefined 值）', () => {
    const execution = { id: 'e1', trigger: 'auto', startedAt: 1, outcome: 'running' } as const
    expect(Object.prototype.hasOwnProperty.call(execution, 'outputCount')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(execution, 'zeroOutput')).toBe(false)
    const requirement = { id: 'REQ-x', title: 't', description: '', status: 'draft', blocked: false } as Record<string, unknown>
    expect(Object.prototype.hasOwnProperty.call(requirement, 'priority')).toBe(false)
  })
})
