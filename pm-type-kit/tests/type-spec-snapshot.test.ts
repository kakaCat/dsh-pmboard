/**
 * 六类型规格快照（REQ-261009174713-7bc8 · 卡 t-960cb2 / RF-26 · 裁定 D-5）。
 *
 * ## 这条门禁拦的是什么
 *
 * 把「某类型要求什么」从 core 搬进六个类型包，最危险的失效**不是测试红**，而是**判据悄悄变了**
 * （必填节少一节、归档去向少一个目录、模板地址换一份）——表面测试全绿，门禁口径却已经漂移。
 * 故这里把**迁移前实测值**（t1 基线 `type-spec.json` 的六条 spec）冻成 fixture，逐字段钉死。
 *
 * ## 为什么要拷一份 fixture 而不是直接读 `.dsh-data/`
 *
 * `.dsh-data/` 是 gitignore 的**运行时台账**，fresh clone / CI 里不存在；基线判据不能依赖它。
 * fixture 是它的逐字拷贝（`tests/fixtures/type-spec-baseline.json`），来源在卡 t-62745e 的 t1 基线。
 *
 * ## 覆盖面（逐字段点名）
 *
 * 基线含 5 个值字段：`requiredSections`（→ `rootSectionsDelta`）· `requiredDesignDocs` ·
 * `conditionalStageArtifacts` · `archive` · `templates`。
 * 基线**不含**的两个字段（`label` / `conditionalDesignDocs`）改用 literal 钉住——不然它们就是盲区。
 *
 * @module dsh-pmboard/tests/type-spec-snapshot
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { repoPath } from 'tests/helpers/repo-root.js'
import { createTypeRegistry, type RequirementTypeSpec } from 'pm-type-kit'
import { spec as featureSpec } from 'pm-type-feature'
import { spec as bugSpec } from 'pm-type-bug'
import { spec as docSpec } from 'pm-type-doc'
import { spec as refactorSpec } from 'pm-type-refactor'
import { spec as spikeSpec } from 'pm-type-spike'
import { spec as choreSpec } from 'pm-type-chore'

const LIVE: readonly RequirementTypeSpec[] = [featureSpec, bugSpec, docSpec, refactorSpec, spikeSpec, choreSpec]

interface BaselineSpec {
  category: string
  requiredSections: string[]
  requiredDesignDocs: string[]
  conditionalStageArtifacts?: { stage: string; kind: string; side: string }[]
  archive: unknown
  templates?: { stage: string; templates: Record<string, unknown> }[]
}
const BASELINE = JSON.parse(
  readFileSync(repoPath('tests/fixtures/type-spec-baseline.json'), 'utf8'),
) as { categories: string[]; spec: BaselineSpec[] }

/** 阶段模板表扁平化：`StageTemplates`（stage + 各键）↔ 基线的 `{stage, templates:{…}}`。 */
function flatTemplates(spec: RequirementTypeSpec): { stage: string; templates: Record<string, unknown> }[] {
  return (spec.templates ?? []).map((entry) => {
    const { stage, ...rest } = entry
    return { stage, templates: rest as Record<string, unknown> }
  })
}

/**
 * 逐字段比对：返回**逐条差异**（空数组 = 与迁移前逐字一致）。
 *
 * 刻意写成纯函数（吃两份数据）而不是直接 expect：这样「改一处必被抓住」的自检能复用同一个比较器，
 * 判据不会出现「自检走另一条路」的假绿。
 */
function diffAgainstBaseline(specs: readonly RequirementTypeSpec[], baseline: readonly BaselineSpec[]): string[] {
  const diffs: string[] = []
  const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)
  for (const spec of specs) {
    const b = baseline.find((x) => x.category === spec.category)
    if (b === undefined) { diffs.push(`${spec.category}：基线里没有这个类型`); continue }
    if (!eq([...spec.rootSectionsDelta], b.requiredSections)) diffs.push(`${spec.category}.requiredSections`)
    if (!eq([...spec.requiredDesignDocs], b.requiredDesignDocs)) diffs.push(`${spec.category}.requiredDesignDocs`)
    if (!eq(spec.conditionalStageArtifacts ?? [], b.conditionalStageArtifacts ?? [])) diffs.push(`${spec.category}.conditionalStageArtifacts`)
    if (!eq(spec.archive, b.archive)) diffs.push(`${spec.category}.archive`)
    if (!eq(flatTemplates(spec), b.templates ?? [])) diffs.push(`${spec.category}.templates`)
  }
  for (const b of baseline) {
    if (!specs.some((s) => s.category === b.category)) diffs.push(`${b.category}：类型包里缺这个 spec`)
  }
  return diffs
}

describe('六类型规格快照：与迁移前基线逐字一致', () => {
  it('五类值字段（必填节 / 必交设计文档 / 条件阶段产物 / 归档去向 / 模板引用）逐字相同', () => {
    expect(BASELINE.spec.length).toBe(6)
    expect(diffAgainstBaseline(LIVE, BASELINE.spec)).toEqual([])
  })

  it('六类齐备且注册表能装配（缺类即红）', () => {
    const reg = createTypeRegistry(LIVE)
    expect(() => reg.requireComplete()).not.toThrow()
    expect([...reg.categories()].sort()).toEqual(['bug', 'chore', 'doc', 'feature', 'refactor', 'spike'])
  })

  it('基线未覆盖的两个字段用 literal 钉住（否则是盲区）', () => {
    expect(LIVE.map((s) => s.label)).toEqual(['功能（新增能力）', '缺陷（修复线上/代码问题）', '文档（只改文档，不产代码）', '重构（行为不变的结构调整）', '调研（产出是结论，不是留下的代码）', '杂项（维护性小改）'])
    const cond = Object.fromEntries(LIVE.map((s) => [s.category, s.conditionalDesignDocs ?? []]))
    expect(cond.feature).toEqual([{ name: 'frontend.md', side: 'frontend' }, { name: 'backend.md', side: 'backend' }])
    expect(cond.bug).toEqual([])
    expect(cond.refactor).toEqual([])
  })

  it('判据非空转：改一处 rootSectionsDelta 必被抓住（自检）', () => {
    const mutated = LIVE.map((s) => (s.category === 'feature' ? { ...s, rootSectionsDelta: [...s.rootSectionsDelta, '多出来的节'] } : s))
    const caught = diffAgainstBaseline(mutated, BASELINE.spec)
    expect(caught).toContain('feature.requiredSections')
    // 反向：原样的 LIVE 必须一条都不报（否则这条自检本身就是假绿）
    expect(diffAgainstBaseline(LIVE, BASELINE.spec)).toEqual([])
  })

  it('快照 dump 确定性：两次逐字相同，且含六类', () => {
    const reg = createTypeRegistry(LIVE)
    const a = reg.snapshot()
    expect(a).toBe(reg.snapshot())
    for (const c of BASELINE.categories) expect(a).toContain(`"category": "${c}"`)
  })
})
