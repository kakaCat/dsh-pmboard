/**
 * 难度声明接进取词（REQ-261005154851-8512）——投影、四档映射、取重不取轻、三处接线与留痕的唯一用例集。
 *
 * serves: REQ-261005154851-8512 FR-1, FR-2, FR-3, FR-4, FR-5
 *
 * 钉四件事：
 *  ① 同步缝投影：`factsOf` 带 / 不带 `promptDifficulty` 两形态（**键不出现**，不是 undefined 占位）；
 *  ② 四档映射与**取重不取轻**：expert/advanced → heavy、simple/standard → light、冲突取重；
 *  ③ 无声明 / 脏数据：取词结果与改造前**逐字相同**（分片 id 全等），且不抛错；
 *  ④ 三处接线是静态事实：三个调用点必须都经 `difficultyFromDeclaredPrompt` 与 `resolveStagePrompt`
 *     （源码级断言——接线被回退时这条会红，而不是靠"我记得改过"）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { factsOf } from '../src/domain/requirement/RequirementSummary.js'
import { difficultyFromDeclaredPrompt } from '../src/domain/prompt/difficulty-mapping.js'
import { resolveStagePrompt } from '../src/domain/prompt/index.js'
import type { SummarizableRequirement } from '../src/domain/requirement/RequirementSummary.js'

/** 基线标本：一段**推不出档位**的普通描述（推断 undefined → 默认 light）。 */
const SAMPLE = {
  title: '难度注入验收标本',
  description: '一段普通描述，不涉及架构、跨子系统或数据模型改动。',
}

/** 改造前的基线（无声明时的取词结果，逐字快照）。 */
const BASELINE_FRAGMENTS = [
  'brainstorming/light/feature',
  'brainstorming/light',
  'brainstorming/feature',
  'common/iron-rules',
]

function record(over: Partial<SummarizableRequirement> = {}): SummarizableRequirement {
  return {
    id: 'REQ-000000000001-abcd',
    title: '难度注入验收标本',
    status: 'brainstorming',
    createdAt: 1,
    updatedAt: 1,
    version: 1,
    ...over,
  } as SummarizableRequirement
}

/** 三个调用点复用的取词组合（与生产代码逐字同形：映射 → 传 declaredDifficulty）。 */
function resolveLike(stage: 'brainstorming' | 'design', declared: unknown) {
  const mapped = difficultyFromDeclaredPrompt(typeof declared === 'string' ? declared : undefined)
  return resolveStagePrompt({
    stage,
    category: 'feature',
    requirement: SAMPLE,
    ...(mapped === undefined ? {} : { declaredDifficulty: mapped }),
  })
}

describe('factsOf 投影（FR-1）', () => {
  it('T-01 带声明：facts 里含 promptDifficulty', () => {
    expect(factsOf(record({ promptDifficulty: 'expert' })).promptDifficulty).toBe('expert')
  })

  it('T-02 存量记录（无声明）：键**不出现**（不是 undefined 占位）', () => {
    const facts = factsOf(record())
    expect('promptDifficulty' in facts).toBe(false)
  })
})

describe('四档映射与取重不取轻（FR-2）', () => {
  it('T-03 声明 expert → 取重档（改造前此处是 light）', () => {
    const r = resolveLike('brainstorming', 'expert')
    expect(r.routeKey).toBe('brainstorming/heavy/feature')
    expect(r.fragmentIds).toContain('brainstorming/heavy')
  })

  it('T-04 声明 advanced → 取重档', () => {
    expect(resolveLike('brainstorming', 'advanced').routeKey).toBe('brainstorming/heavy/feature')
  })

  it('T-05 声明 standard / simple → 轻档', () => {
    expect(resolveLike('brainstorming', 'standard').routeKey).toBe('brainstorming/light/feature')
    expect(resolveLike('brainstorming', 'simple').routeKey).toBe('brainstorming/light/feature')
  })

  it('T-06 声明 simple 而文本推断为重 → **取重**（宁可多给纪律）', () => {
    const heavyText = {
      title: '重构门禁架构',
      description: '要动数据模型、跨子系统与架构分层，涉及四个模块的接口重排。',
    }
    const r = resolveStagePrompt({
      stage: 'brainstorming',
      category: 'feature',
      requirement: heavyText,
      declaredDifficulty: 'light',
    })
    expect(r.routeKey).toBe('brainstorming/heavy/feature')
    expect((r.difficultyReasons ?? []).join(' ')).toContain('取重不取轻')
  })
})

describe('无声明与脏数据：行为与改造前逐字相同（FR-1/FR-2）', () => {
  it('T-07 无声明 → 分片 id 与基线快照**全等**', () => {
    const r = resolveLike('brainstorming', undefined)
    expect(r.routeKey).toBe('brainstorming/light/feature')
    expect([...r.fragmentIds]).toEqual(BASELINE_FRAGMENTS)
  })

  it('T-08 脏数据（大小写 / 空白 / 空串 / null / 非字符串）一律按未声明且不抛错', () => {
    for (const dirty of ['EXPERT', ' expert ', '', null, 42, {}]) {
      expect(difficultyFromDeclaredPrompt(dirty as never)).toBeUndefined()
      const r = resolveLike('brainstorming', dirty)
      expect([...r.fragmentIds]).toEqual(BASELINE_FRAGMENTS)
    }
  })

  it('T-11 无声明且推断不出 → 不编造依据（reasons 为空）', () => {
    const r = resolveLike('brainstorming', undefined)
    expect(r.difficultyReasons ?? []).toHaveLength(0)
  })
})

describe('三处接线是静态事实（FR-3）', () => {
  const read = (rel: string): string => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')

  it('T-09 三个调用点都经 difficultyFromDeclaredPrompt，且两处 resolveStagePrompt 传了 declaredDifficulty', () => {
    const captureSection = read('src/application/internal/capture-section.ts')
    const sessionDriver = read('src/application/dive/session-driver.ts')
    const isolate = read('src/application/use-cases/IsolateNodeContext.ts')

    for (const [name, src] of [['capture-section', captureSection], ['session-driver', sessionDriver], ['IsolateNodeContext', isolate]] as const) {
      expect(src, name + ' 必须用映射函数').toContain('difficultyFromDeclaredPrompt(')
    }
    for (const [name, src] of [['capture-section', captureSection], ['session-driver', sessionDriver]] as const) {
      expect(src, name + ' 必须把 declaredDifficulty 传给取词入口').toContain('declaredDifficulty')
    }
    // 第三处：显式优先 + 声明兜底（两者都没有则不传）
    expect(isolate).toContain('request.difficulty ?? declared')
  })

  it('T-10 有声明时留痕给出依据句（声明难度 → 取词档）', () => {
    const r = resolveLike('design', 'expert')
    expect((r.difficultyReasons ?? []).join(' ')).toContain('声明难度')
    expect((r.difficultyReasons ?? []).join(' ')).toContain('heavy')
  })
})
