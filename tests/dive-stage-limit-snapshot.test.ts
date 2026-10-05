// serves: FR-2
/**
 * 阶段回合上限的**设置来源**单测（REQ-261004103330-005f t6）。
 *
 * ## 这份测试锁的是什么
 *
 * 1. **未安装快照 → 与改造前逐字一致**（回落 `stage-configs` 默认表，未知阶段 10）——
 *    这是向后兼容的底线，既有 `tests/dive-round-state.test.ts` 也锁了一遍；
 * 2. **装了快照就按快照走**，且是**同步**读到（热路径约束）；
 * 3. 快照刷新（模拟 PATCH 广播 / 文件轮询）后立刻生效；
 * 4. 快照里值非法（非有限数）或阶段缺失 → 回落默认，**绝不把 NaN 带进判定**
 *    （`roundsInStage >= NaN` 恒 false ⇒ 上限静默失效，正是本卡要根治的形态）；
 * 5. 卸载后回到默认。
 */
import { afterEach, describe, expect, it } from 'vitest'
import {
  installStageLimitSnapshot,
  roundLimitFor,
  type StageLimitSource,
} from '../src/application/dive/round-state.js'
import { STAGE_CONFIGS } from '../src/application/dive/stage-configs.js'

/** 造一个最小快照源（结构类型：不需要 ResolvedRunSettings 全套）。 */
function source(entries: Record<string, number | undefined>): StageLimitSource {
  const stageMaxRounds: Record<string, { value: number } | undefined> = {}
  for (const [stage, value] of Object.entries(entries)) {
    stageMaxRounds[stage] = value === undefined ? undefined : { value }
  }
  return { stageMaxRounds }
}

// 模块级状态：每个用例后必须卸载，否则会串味到同文件后续用例
afterEach(() => installStageLimitSnapshot(undefined))

describe('未安装快照 · 向后兼容（与改造前逐字一致）', () => {
  it('取 stage-configs 的默认值；未知阶段回落 10', () => {
    expect(roundLimitFor('implementing')).toBe(1000)
    expect(roundLimitFor('decomposing')).toBe(100)
    expect(roundLimitFor('design')).toBe(200)
    expect(roundLimitFor('nonsense')).toBe(10)
  })

  it('对全部阶段都与默认表逐一相等', () => {
    for (const [stage, cfg] of Object.entries(STAGE_CONFIGS)) {
      expect(roundLimitFor(stage)).toBe(cfg.maxRounds)
    }
  })
})

describe('已安装快照 · 同步生效与刷新', () => {
  it('装了快照就按快照走；未提及的阶段仍回落默认', () => {
    installStageLimitSnapshot(source({ implementing: 5 }))
    expect(roundLimitFor('implementing')).toBe(5)
    expect(roundLimitFor('design')).toBe(STAGE_CONFIGS.design.maxRounds)
  })

  it('快照被替换（模拟 PATCH 广播）后立刻读到新值——同步、无需 await', () => {
    installStageLimitSnapshot(source({ implementing: 5 }))
    expect(roundLimitFor('implementing')).toBe(5)
    installStageLimitSnapshot(source({ implementing: 7 }))
    expect(roundLimitFor('implementing')).toBe(7)
  })

  it('快照里没有该阶段（或值为 undefined）→ 回落默认', () => {
    installStageLimitSnapshot(source({ implementing: undefined }))
    expect(roundLimitFor('implementing')).toBe(1000)
  })

  it('未知阶段在装了快照后仍回落 10', () => {
    installStageLimitSnapshot(source({ implementing: 5 }))
    expect(roundLimitFor('nonsense')).toBe(10)
  })

  it('卸载后回到默认（幂等：重复卸载不出错）', () => {
    installStageLimitSnapshot(source({ implementing: 5 }))
    installStageLimitSnapshot(undefined)
    installStageLimitSnapshot(undefined)
    expect(roundLimitFor('implementing')).toBe(1000)
  })
})

describe('非法值不得静默失效（NaN 会让 roundsInStage >= limit 恒 false）', () => {
  it('快照里是 NaN / Infinity / 非数字 → 回落默认，而不是当成上限', () => {
    installStageLimitSnapshot(source({ implementing: Number.NaN }))
    expect(roundLimitFor('implementing')).toBe(1000)
    installStageLimitSnapshot(source({ implementing: Number.POSITIVE_INFINITY }))
    expect(roundLimitFor('implementing')).toBe(1000)
    installStageLimitSnapshot({ stageMaxRounds: { implementing: { value: '8' as never } } })
    expect(roundLimitFor('implementing')).toBe(1000)
  })

  it('回落之后判定仍然成立：默认上限 1000 对 roundsInStage=1000 会停手', () => {
    installStageLimitSnapshot(source({ implementing: Number.NaN }))
    const limit = roundLimitFor('implementing')
    expect(Number.isFinite(limit)).toBe(true)
    expect(1000 >= limit).toBe(true)
  })
})
