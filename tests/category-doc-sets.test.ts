/**
 * 分类文档集单测（REQ-d3e61a T-13 / serve FR-15）
 *
 * 验收口径：六类样例——少交必填文档 → 被拒并指出缺失文档名；**bug 缺"复现步骤" → 拒绝**。
 * 底线：类型只减少文档**数量**，不取消**追溯**。
 * （BASE + DELTA 的两层性质由 tests/base-delta.test.ts 覆盖——那是 T-14。）
 *
 * REQ-261005105032-3b02 t4 追加（serve FR-1, FR-2）：条件必交**阶段产物**——
 * feature/refactor 且 sides 含 frontend 时，需求阶段必交 kind=prototype。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import {
  CATEGORY_DELTAS, conditionalStageArtifactsFor, deltaFor, designDocPolicyFrom, hasRootSection,
  missingCategoryDocs, requiredRootSectionsFor, requiredStageArtifactKinds,
} from '../src/application/internal/category-doc-sets.js'
import { checkDesignSectionsHaveServes } from '../src/application/internal/content-gates.js'
import { parseDocument } from '../src/application/internal/doc-parse.js'
import {
  generateTaskCardPlaceholders, renderTaskCard, type PlanTask as CardPlanTask,
} from '../src/application/internal/task-card-generator.js'
import { STAGE_ARTIFACT_REQUIREMENTS } from '../src/domain/artifact/ArtifactSpec.js'

// REQ-2d1c74 FR-1：feature 必交扩为五份（补 use-cases.md）；条件必交 frontend/backend 由 design-doc-policy.test.ts 覆盖
const FEATURE_DESIGN = ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md']
const BASE_TEXT = '## 边界\n'

describe('deltaFor / requiredRootSectionsFor（六类齐全，未知类型不拦）', () => {
  it('六类都有 DELTA', () => {
    expect(CATEGORY_DELTAS.map(s => s.category).sort()).toEqual(['bug', 'chore', 'doc', 'feature', 'refactor', 'spike'])
  })
  it('未知类型 / undefined → 不拦', () => {
    expect(deltaFor(undefined)).toBeUndefined()
    expect(deltaFor('nonsense')).toBeUndefined()
    expect(requiredRootSectionsFor('nonsense')).toEqual([])
  })
  it('**底线**：每个类型都要求至少一条必填节（类型只减数量，不取消追溯）', () => {
    for (const d of CATEGORY_DELTAS) expect(requiredRootSectionsFor(d.category).length).toBeGreaterThan(0)
  })
})

describe('missingCategoryDocs', () => {
  it('根文档不存在 → 空（还没到可判阶段，不制造噪声）', () => {
    expect(missingCategoryDocs({ category: 'feature', rootExists: false, rootText: '', designNames: [] })).toEqual([])
  })

  it('feature 齐活 → 无缺失', () => {
    const root = '# 需求\n\n' + BASE_TEXT + '\n## 产品定义\n\n## 用户与角色\n\n## 功能点\n'
    expect(missingCategoryDocs({ category: 'feature', rootExists: true, rootText: root, designNames: FEATURE_DESIGN })).toEqual([])
  })

  it('feature 缺节 → 点出节名；少交设计文档 → 点出文件名', () => {
    const root = '# 需求\n\n' + BASE_TEXT + '\n## 产品定义\n'
    const missing = missingCategoryDocs({ category: 'feature', rootExists: true, rootText: root, designNames: ['architecture.md'] })
    expect(missing.join(' ')).toContain('用户与角色')
    expect(missing.join(' ')).toContain('design/data-model.md')
    expect(missing.join(' ')).toContain('design/test-cases.md')
  })

  it('**bug 缺「复现步骤」→ 拒绝**（验收要点）', () => {
    const root = '# 缺陷\n\n' + BASE_TEXT + '\n## 现象\n\n## 根因\n\n## 回归\n'
    expect(missingCategoryDocs({ category: 'bug', rootExists: true, rootText: root, designNames: [] }).join(' ')).toContain('复现步骤')
  })

  it('bug 齐活 → 无缺失（裁的是**数量**：不要 PRD 那套用户角色，仍要追溯）', () => {
    const root = '# 缺陷\n\n' + BASE_TEXT + '\n## 复现步骤\n\n## 根因\n\n## 回归\n'
    expect(missingCategoryDocs({ category: 'bug', rootExists: true, rootText: root, designNames: [] })).toEqual([])
    expect(requiredRootSectionsFor('bug')).not.toContain('用户')
  })

  it('refactor 要求"行为不变式"', () => {
    const root = '# 重构\n\n' + BASE_TEXT + '\n## 现状\n\n## 目标结构\n'
    expect(missingCategoryDocs({ category: 'refactor', rootExists: true, rootText: root, designNames: ['architecture.md', 'migration.md'] }).join(' ')).toContain('行为不变式')
  })

  it('chore 最简：BASE + 完成判据', () => {
    expect(requiredRootSectionsFor('chore').filter(s => s === '完成判据')).toEqual(['完成判据'])
    const missing = missingCategoryDocs({ category: 'chore', rootExists: true, rootText: '# 杂务\n\n## 边界\n', designNames: [] })
    expect(missing).toContain('requirement.md 缺必填节「完成判据」')
  })
})

// ---------------------------------------------------------------------------
// REQ-261005105032-3b02 t4（serve FR-1, FR-2）：条件必交**阶段产物**（原型）
// ---------------------------------------------------------------------------

describe('conditionalStageArtifactsFor（UI 需求需求阶段必交原型）', () => {
  const PROTOTYPE_HIT = [{ stage: 'brainstorming', kind: 'prototype', side: 'frontend' }]

  it('feature / refactor + sides 含 frontend → 命中需求阶段原型', () => {
    expect(conditionalStageArtifactsFor('feature', ['frontend'])).toEqual(PROTOTYPE_HIT)
    expect(conditionalStageArtifactsFor('refactor', ['frontend'])).toEqual(PROTOTYPE_HIT)
  })

  it('sides 不含 frontend（纯后端 / 无声明 / 只有 backend）→ 不命中（不给非 UI 需求加仪式）', () => {
    expect(conditionalStageArtifactsFor('feature', ['backend'])).toEqual([])
    expect(conditionalStageArtifactsFor('feature', [])).toEqual([])
    expect(conditionalStageArtifactsFor('feature', ['doc'])).toEqual([])
  })

  it('非 feature/refactor 类型即使声明 frontend 也不命中', () => {
    for (const c of ['bug', 'spike', 'doc', 'chore']) expect(conditionalStageArtifactsFor(c, ['frontend'])).toEqual([])
  })

  it('未知类型 / undefined → []（不拦）', () => {
    expect(conditionalStageArtifactsFor('nonsense', ['frontend'])).toEqual([])
    expect(conditionalStageArtifactsFor(undefined, ['frontend'])).toEqual([])
  })

  it('sides 解析与 designDocPolicyFrom 同源：括号写法与逗号写法等价（REQ-261004222448-292a 教训）', () => {
    const bracket = designDocPolicyFrom({ sides: '[frontend, backend]' }).sides
    const comma = designDocPolicyFrom({ sides: 'frontend, backend' }).sides
    expect(bracket).toEqual(comma)
    expect(conditionalStageArtifactsFor('feature', bracket)).toEqual(PROTOTYPE_HIT)
    // 纯 UI 需求的反例：旧实现把 `[frontend, backend]` 切坏后只剩 backend → 原型门永远不会触发
    expect(conditionalStageArtifactsFor('feature', ['backend'])).toEqual([])
  })

  it('DELTA 只在 feature / refactor 两条登记条件阶段产物（其余类型不写该键）', () => {
    const withStage = CATEGORY_DELTAS.filter(d => (d.conditionalStageArtifacts ?? []).length > 0).map(d => d.category)
    expect(withStage.sort()).toEqual(['feature', 'refactor'])
  })
})

describe('requiredStageArtifactKinds（阶段必备产物 = 基线 ∪ 条件命中项）', () => {
  it('brainstorming：基线 requirement；UI 需求再并上 prototype', () => {
    expect(requiredStageArtifactKinds('brainstorming', 'feature', ['backend'])).toEqual([...STAGE_ARTIFACT_REQUIREMENTS.brainstorming!])
    expect(requiredStageArtifactKinds('brainstorming', 'feature', ['frontend'])).toEqual(['requirement', 'prototype'])
    expect(requiredStageArtifactKinds('brainstorming', 'refactor', ['frontend', 'backend'])).toEqual(['requirement', 'prototype'])
  })

  it('条件项只叠加在它自己的 stage 上（design 阶段不因 UI 需求多出原型）', () => {
    expect(requiredStageArtifactKinds('design', 'feature', ['frontend'])).toEqual([...STAGE_ARTIFACT_REQUIREMENTS.design!])
  })

  it('非 UI 需求 = 基线原样（既有产物语义不动）', () => {
    for (const stage of ['brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived'] as const) {
      expect(requiredStageArtifactKinds(stage, 'feature', [])).toEqual([...(STAGE_ARTIFACT_REQUIREMENTS[stage] ?? [])])
    }
  })

  it('未知类型 → 基线原样（不拦、不乱加）', () => {
    expect(requiredStageArtifactKinds('brainstorming', undefined, ['frontend'])).toEqual(['requirement'])
    expect(requiredStageArtifactKinds('brainstorming', 'chore', ['frontend'])).toEqual(['requirement'])
  })
})

// ---------------------------------------------------------------------------
// REQ-261005105032-3b02 t14（serve FR-4, FR-5, FR-6, FR-7, FR-8, FR-10）：**模板与门禁同源**
//
// ① 修同族缺陷 D-5：模板给必填节标题追加 `<!-- serves: FR-1 -->`，而 `hasRootSection` 原先只认
//    `（…）` 起的注解 ⇒ 照模板写出来的 requirement.md 被判「缺必填节」而**双方都不报错**。
//    本组含**逆验证**：把必填节标题改坏 → 必红（证明断言真的在测模板，不是恒真）。
// ② D-12：「讨论与裁定记录（D-x）」节**只在 feature 模板**里，同族另外五份不许有。
// ③ 原型锚点 / 关联 D-x 两列、两个对照项、两个占位符就位；占位符名与落库键同名同义。
// ---------------------------------------------------------------------------

const TPL_DIR = new URL('../templates/', import.meta.url)
const tpl = (rel: string): string => readFileSync(new URL(rel, TPL_DIR), 'utf8')
/** 模板 → 文档：占位符一律换成非空值（本节只判"节在不在"，不判占位符取值）。 */
const rendered = (rel: string): string => tpl(rel).replace(/\{\{[A-Z_0-9]+\}\}/g, 'X')
/** H2 原文集合（剥掉模板惯例的行尾 HTML 注释装饰后再比）。 */
const h2Set = (md: string): string[] =>
  parseDocument(md).headings.filter(h => h.level === 2).map(h => h.text.replace(/(?:\s*<!--[\s\S]*?-->)+$/g, '').trim())

describe('模板必过必填节门禁（REQ-261005105032-3b02 t14 · D-5 逆验证）', () => {
  it('feature.md 渲染后喂 missingCategoryDocs → 0 缺口（模板教的标题写法必须被门禁认）', () => {
    const text = rendered('brainstorming/feature.md')
    // 逐条：四个必填节都在（含带 `<!-- serves: FR-1 -->` 尾巴的那两个）
    for (const sec of requiredRootSectionsFor('feature')) {
      expect(hasRootSection(text, sec), '照模板写的标题没有被 hasRootSection 认出：' + sec).toBe(true)
    }
    // 端侧声明与设计文档清单同源取自模板自身的 front-matter（括号写法也要能被解析）
    const policy = designDocPolicyFrom(parseDocument(text).frontmatter)
    expect([...policy.sides].sort()).toEqual(['backend', 'frontend'])
    const gaps = missingCategoryDocs({
      category: 'feature', rootExists: true, rootText: text,
      designNames: [...FEATURE_DESIGN, 'frontend.md', 'backend.md'],
      sides: policy.sides, exempt: policy.exempt,
    })
    expect(gaps, '模板产物过不了必填节门禁：' + gaps.join('；')).toEqual([])
  })

  it('**逆验证**：把 feature.md 的必填节标题改坏 → 必红（断言真的在测模板）', () => {
    const broken = rendered('brainstorming/feature.md').replace('## 产品定义 ', '## 产品定位 ')
    expect(broken).not.toContain('## 产品定义')
    const gaps = missingCategoryDocs({
      category: 'feature', rootExists: true, rootText: broken,
      designNames: [...FEATURE_DESIGN, 'frontend.md', 'backend.md'], sides: ['frontend', 'backend'],
    })
    expect(gaps.join(' ')).toContain('产品定义')
    expect(hasRootSection(broken, '产品定义')).toBe(false)
  })

  it('frontend.md 的「原型页面」节带行尾 serves 注释也认得（同一处容忍，非特例）', () => {
    const text = rendered('design/frontend.md')
    expect(text).toContain('## 原型页面 <!-- serves: FR-1 -->')
    expect(hasRootSection(text, '原型页面')).toBe(true)
    // 逆验证：节名被改掉 → 认不出（容忍的是装饰，不是"随便什么都算"）
    expect(hasRootSection(text.replace('## 原型页面 ', '## 原型稿 '), '原型页面')).toBe(false)
  })

  it('8 份设计模板渲染后喂 checkDesignSectionsHaveServes → 0 缺口（照模板写出的设计文档过线上门禁）', () => {
    const names = readdirSync(new URL('../templates/design/', import.meta.url))
      .filter(n => n.endsWith('.md')).sort()
    // 防空断言：目录改名 / 清空时这条要红，而不是变成空转
    expect(names.length, '设计模板目录里没有 .md（断言会变成空转）').toBeGreaterThanOrEqual(8)
    for (const name of names) {
      const missing = checkDesignSectionsHaveServes(parseDocument(rendered('design/' + name))).missing
      expect(missing, 'design/' + name + ' 有章节缺 serves：' + missing.join('、')).toEqual([])
    }
  })
})

describe('模板与门禁同源（REQ-261005105032-3b02 t14 · D-x / 锚点 / 对照项 / 占位符）', () => {
  it('D-12：D-x 节只在 feature 模板；且含逐字真空态「本节无裁定」', () => {
    const feature = tpl('brainstorming/feature.md')
    expect(h2Set(feature)).toContain('讨论与裁定记录（D-x）')
    expect(feature, '没有真空态写法 ⇒ 真无裁定的 feature 需求会被自己的裁定门拦死').toContain('本节无裁定')
    // 五列逐字（裁定门的表头判据）
    for (const col of ['编号', '原话来源', '裁定', '影响 FR', '判据']) expect(feature).toContain(col)

    for (const other of ['bug', 'chore', 'doc', 'refactor', 'spike']) {
      const md = tpl('brainstorming/' + other + '.md')
      expect(h2Set(md), other + '.md 不该有 D-x 节（D-12：仅 feature）').not.toContain('讨论与裁定记录（D-x）')
      expect(md).not.toContain('本节无裁定')
    }
  })

  it('decomposition.md 任务表表头含「原型锚点」与「关联 D-x」，且 UI 卡验收含可失败的原型对照判据', () => {
    const md = tpl('decomposing/decomposition.md')
    const taskTable = parseDocument(md).tables.find(t => t.header.some(h => h.includes('计划 key')))
    expect(taskTable, '找不到任务表').toBeDefined()
    const header = taskTable!.header.join(' | ')
    expect(header).toContain('原型锚点')
    expect(header).toContain('关联 D-x')
    // UI 卡验收模板不许只写"与原型一致"：要有结构断言 + 几何量硬判据 + 对照截图
    expect(md).toContain('data-detail-tabs')
    expect(md).toContain('tabsTop')
    expect(md).toContain('与权威原型')
    expect(md).toContain('几何量硬判据')
  })

  it('verification.md 含「与原型对照截图」「D-x 对照」两项（判据逐字对齐验收单）', () => {
    const md = tpl('accepting/verification.md')
    expect(md).toContain('与原型对照截图')
    expect(md).toContain('D-x 对照')
    expect(md).toContain('与裁定对照（逐条说明如何落实）')
  })

  it('task-card.md 的两个新占位符与落库键同名同义，且渲染后不留字面量（禁"模板有、落库无"）', async () => {
    const template = tpl('implementing/task-card.md')
    expect(template).toContain('- 原型锚点：{{PROTOTYPE_REFS}}')
    expect(template).toContain('- 关联 D-x：{{DECISION_REFS}}')

    // 值源用**台账键名**（TaskRecord.prototypeRefs / decisionRefs，决议 #36）——名字对不上就取不到值。
    const planTask: CardPlanTask = {
      key: 't1', title: '按原型实现详情页', requirement_refs: ['FR-4'],
      prototypeRefs: ['prototypes/detail.html#FR-4'], decisionRefs: ['D-1'],
    }
    const placeholders = await generateTaskCardPlaceholders(
      planTask, 't-000000',
      { exists: () => false, read: async () => '' } as never,
      { id: 'REQ-000000' } as never,
    )
    const card = renderTaskCard(template, placeholders)
    expect(card).toContain('prototypes/detail.html#FR-4')
    expect(card).toContain('D-1')
    // 模板里出现的**任何**占位符都必须被生成器填掉：留 `{{…}}` 字面量 = 又一处"模板有、落库无"
    expect(card, '模板里有生成器不认识的占位符').not.toMatch(/\{\{[A-Z_0-9]+\}\}/)
  })
})
