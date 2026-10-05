/**
 * 内置默认值的**下限守卫**（REQ-261004103330-005f · 人裁定 2026-10-04）。
 *
 * ## 为什么需要这条
 *
 * 人看设置表时把 `maxRounds: 1` 读成了"这个阶段只能跑一轮"——那四个阶段（立项 / 已完成 /
 * 已归档 / 已取消）其实 `autoExecute: false`、根本不会自动续跑，但**表里的 1 本身就在误导人**。
 * 裁定：内置默认**不得低于 5**。
 *
 * 这条断言的作用不是"多一个测试"，而是**不让这个下限被后人悄悄改回去**：
 * 谁把某个阶段调回 1，这里立刻红。
 */
import { describe, it, expect } from 'vitest'
import { STAGE_CONFIGS } from '../src/application/dive/stage-configs.ts'
import type { RequirementStatus } from '../src/shared/protocol.ts'

/** 人裁定的内置默认下限。 */
const FLOOR = 5

describe('阶段内置默认值的下限', () => {
  const entries = Object.entries(STAGE_CONFIGS) as [RequirementStatus, { maxRounds: number }][]

  it('九个阶段一个不漏地被这条守卫覆盖', () => {
    expect(entries.length).toBe(9)
  })

  it(`每个阶段的内置默认 ≥ ${FLOOR}`, () => {
    for (const [stage, cfg] of entries) {
      expect(cfg.maxRounds, `${stage} 的内置默认低于下限`).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('不自动跑的四个阶段也满足下限（它们不改行为，只是不再"看着像只能跑一轮"）', () => {
    for (const stage of ['draft', 'done', 'archived', 'canceled'] as RequirementStatus[]) {
      expect(STAGE_CONFIGS[stage].maxRounds, stage).toBeGreaterThanOrEqual(FLOOR)
    }
  })
})
