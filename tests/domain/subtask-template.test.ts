/**
 * 子卡模板映射表测试（REQ-4842fe t1）——对应 design/test-cases.md §1。
 *
 * 口径：映射表是数据化契约（加一行即扩类型）；逃生舱口必须受控枚举、非空、去重。
 */
import { describe, it, expect } from 'vitest'
import {
  STAGE_KINDS,
  STAGE_LABELS,
  STAGE_ACCEPTANCE,
  STAGE_EVIDENCE_KIND,
  SUBTASK_TEMPLATES,
  DEFAULT_FALLBACK_STAGES,
  stagesForCardType,
  validateExplicitStages,
  validateTemplateRef,
  resolvePlanStages,
  buildSubtaskSpecs,
  stageLabel,
} from '../../src/domain/task/SubtaskTemplate.js'
import { STAGE_TO_PHASE_COLOR } from '../../src/domain/card-types.js'

describe('子卡映射表（FR-1）', () => {
  it('1.1 各类型映射正确（顺序即链序）', () => {
    expect(stagesForCardType('feature')).toEqual(['dev', 'integrate', 'review', 'test'])
    expect(stagesForCardType('refactor')).toEqual(['dev', 'integrate', 'review', 'test'])
    expect(stagesForCardType('bug')).toEqual(['repro', 'fix', 'review', 'regress'])
    expect(stagesForCardType('doc')).toEqual(['dev', 'review'])
    expect(stagesForCardType('chore')).toEqual(['dev', 'review'])
    expect(stagesForCardType('spike')).toEqual(['probe', 'review'])
    expect(stagesForCardType('research')).toEqual(['collect', 'analyze', 'review'])
    expect(stagesForCardType('data')).toEqual(['prepare', 'run', 'verify', 'review'])
    expect(stagesForCardType('ops')).toEqual(['change', 'dryrun', 'apply', 'verify', 'review'])
    expect(stagesForCardType('review-only')).toEqual(['review'])
    // REQ-261003203909-55f2 FR-5：高频逃生舱组合固化为一等模板键
    expect(stagesForCardType('change-only')).toEqual(['dev', 'review'])
    expect(stagesForCardType('acceptance')).toEqual(['verify'])
  })

  // 不变量豁免清单（REQ-261003203909-55f2）：review-only 产出即复核；acceptance 是
  // 全链收口后的总校验卡，复核已分散在各卡链尾、不再重复。其余模板一律「含 review；
  // 有测试段则 review 在前」。
  const REVIEW_RULE_EXEMPT = new Set(['review-only', 'acceptance'])

  it('1.1b review 必在测试段之前；无测试段的以 review 收尾（豁免：review-only/acceptance）', () => {
    for (const [key, stages] of Object.entries(SUBTASK_TEMPLATES)) {
      if (REVIEW_RULE_EXEMPT.has(key)) continue
      const ri = stages.indexOf('review')
      expect(ri, `模板 ${key} 缺少 review 段`).toBeGreaterThanOrEqual(0)
      const ti = stages.findIndex(s => s === 'test' || s === 'regress')
      if (ti >= 0) expect(ri).toBeLessThan(ti) // 先复核、后测试（2026-09-20 用户裁定）
      else expect(stages[stages.length - 1]).toBe('review')
    }
  })

  it('1.2 未映射/未知类型回退 dev→review', () => {
    expect(stagesForCardType('unknown-type')).toEqual(['dev', 'review'])
    expect(stagesForCardType(undefined)).toEqual(DEFAULT_FALLBACK_STAGES)
    expect(stagesForCardType('')).toEqual(['dev', 'review'])
  })

  it('映射表只含受控 stageKind 且无重复', () => {
    const allowed = new Set<string>(STAGE_KINDS)
    for (const stages of Object.values(SUBTASK_TEMPLATES)) {
      for (const s of stages) expect(allowed.has(s)).toBe(true)
      expect(new Set(stages).size).toBe(stages.length)
    }
  })
})

describe('显式 stages 逃生舱口（FR-1b）', () => {
  it('1.3 合法声明：保留顺序、原样返回', () => {
    const r = validateExplicitStages(['collect', 'analyze', 'review'])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(['collect', 'analyze', 'review'])
  })

  it('1.4a 自由文本被拒', () => {
    const r = validateExplicitStages(['collect', '写代码'])
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('写代码')
  })

  // 2026-09-28 卡片层契约：空数组从「非法」改为「显式声明本卡不落链（solo）」——
  // undefined=未指定（走映射）/ []=明确无链，两者必须可区分，否则"不需子卡"与"未生成"永远分不清。
  it('1.4b 空数组 = 显式无链（solo），合法', () => {
    const r = validateExplicitStages([])
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual([])
  })

  it('1.4c 重复项被拒', () => {
    const r = validateExplicitStages(['dev', 'dev', 'review'])
    expect(r.ok).toBe(false)
  })

  it('1.4d 非法输入类型被拒（非数组）', () => {
    const r = validateExplicitStages('dev' as unknown as string[])
    expect(r.ok).toBe(false)
  })
})

describe('子卡规格生成（FR-1/FR-3 契约）', () => {
  it('链依赖：首卡无链内前置，其后每卡依赖前一张', () => {
    const specs = buildSubtaskSpecs(['dev', 'integrate', 'review', 'test'])
    expect(specs.map(s => s.chainIndex)).toEqual([0, 1, 2, 3])
    expect(specs.map(s => s.dependsOnIndex)).toEqual([null, 0, 1, 2])
    expect(specs.map(s => s.stageKind)).toEqual(['dev', 'integrate', 'review', 'test'])
  })

  it('每张子卡都有非空标题与可证伪验收模板', () => {
    for (const kind of STAGE_KINDS) {
      const [spec] = buildSubtaskSpecs([kind])
      expect(spec.title.length).toBeGreaterThan(0)
      expect(/命令|跑通|输出|结论|证据|校验|通过|全绿|落库|标注/.test(spec.acceptance)).toBe(true)
      expect(stageLabel(kind).length).toBeGreaterThan(0)
    }
  })

  it('空集合不产出子卡', () => {
    expect(buildSubtaskSpecs([])).toEqual([])
  })
})

// ── REQ-261003203909-55f2：template 一等字段与四段登记 ──────────────────────

describe('template 引用键校验（TC-1 · FR-4/FR-5）', () => {
  it('合法键 → 该键的链', () => {
    for (const key of ['change-only', 'acceptance', 'ops', 'feature']) {
      const r = validateTemplateRef(key)
      expect(r.ok, `键 ${key} 应命中`).toBe(true)
      if (r.ok) expect(r.value).toEqual(SUBTASK_TEMPLATES[key])
    }
  })

  it('非法键 → 结构化原因，且列出全部合法键（响亮失败不让人猜）', () => {
    const r = validateTemplateRef('chnage-only')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('chnage-only')
      expect(r.error).toContain('change-only') // 合法键清单
      expect(r.error).toContain('acceptance')
    }
  })

  it('非字符串/空串 → 结构化原因', () => {
    expect(validateTemplateRef(42).ok).toBe(false)
    expect(validateTemplateRef('').ok).toBe(false)
    expect(validateTemplateRef('  ').ok).toBe(false)
  })

  it('键大小写/空白容忍（trim + lowerCase）', () => {
    const r = validateTemplateRef(' Change-Only ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual(['dev', 'review'])
  })
})

describe('计划卡 stages 统一解析（TC-2 · FR-4 优先级唯一实现点）', () => {
  it('五组矩阵：stages 优先 / template 次之 / 都没有 → undefined / 同给 → CONFLICT / 非法值透传原因', () => {
    // ① 只给 stages → 用 stages
    const a = resolvePlanStages({ stages: ['dev', 'test'], template: undefined })
    expect(a.ok).toBe(true); if (a.ok) expect(a.value).toEqual(['dev', 'test'])
    // ② 只给 template → 解析为该键的链
    const b = resolvePlanStages({ template: 'change-only' })
    expect(b.ok).toBe(true); if (b.ok) expect(b.value).toEqual(['dev', 'review'])
    // ③ 都不给 → undefined（交回 phase/side/分类兜底）
    const c = resolvePlanStages({})
    expect(c.ok).toBe(true); if (c.ok) expect(c.value).toBeUndefined()
    // ④ 同给 → 冲突拒绝（二选一，禁止双口径）
    const d = resolvePlanStages({ stages: ['dev'], template: 'change-only' })
    expect(d.ok).toBe(false); if (!d.ok) expect(d.error).toContain('二选一')
    // ⑤ 非法 stages / 非法 template → 原因透传
    const e = resolvePlanStages({ stages: ['写代码'] })
    expect(e.ok).toBe(false)
    const f = resolvePlanStages({ template: 'nope' })
    expect(f.ok).toBe(false); if (!f.ok) expect(f.error).toContain('nope')
  })

  it('显式空链（solo）优先于 template 语义不冲突：stages:[] 单独给出仍合法', () => {
    const r = resolvePlanStages({ stages: [] })
    expect(r.ok).toBe(true); if (r.ok) expect(r.value).toEqual([])
  })
})

describe('四段登记完整性（TC-3/TC-4 · FR-1/FR-2/FR-3/FR-6/FR-7）', () => {
  const NEW_STAGES = ['e2e', 'manual', 'release', 'capture'] as const

  it('TC-3 五表同 key 集合：KINDS/LABELS/ACCEPTANCE/EVIDENCE_KIND/PHASE_COLOR（缺一即红并点名）', () => {
    const kinds = [...STAGE_KINDS].sort()
    const tables: Record<string, string[]> = {
      STAGE_LABELS: Object.keys(STAGE_LABELS).sort(),
      STAGE_ACCEPTANCE: Object.keys(STAGE_ACCEPTANCE).sort(),
      STAGE_EVIDENCE_KIND: Object.keys(STAGE_EVIDENCE_KIND).sort(),
      STAGE_TO_PHASE_COLOR: Object.keys(STAGE_TO_PHASE_COLOR).sort(),
    }
    for (const [name, keys] of Object.entries(tables)) {
      expect(keys, `${name} 与 STAGE_KINDS key 集合不一致`).toEqual(kinds)
    }
    // 第六表 STAGE_SCOPE_RULE 的集合断言随 t4（Record 类型强制改造）落地于 execute-task 用例。
  })

  it('四段进入受控枚举且语义分组位置正确（测试族/运维族/调研族）', () => {
    for (const s of NEW_STAGES) expect(STAGE_KINDS).toContain(s)
    expect(STAGE_KINDS.indexOf('e2e')).toBeGreaterThan(STAGE_KINDS.indexOf('regress'))
    expect(STAGE_KINDS.indexOf('release')).toBeGreaterThan(STAGE_KINDS.indexOf('apply'))
    expect(STAGE_KINDS.indexOf('capture')).toBeGreaterThan(STAGE_KINDS.indexOf('analyze'))
  })

  it('四段证据族与设计一致：e2e=verdict，manual/release/capture=file', () => {
    expect(STAGE_EVIDENCE_KIND.e2e).toBe('verdict')
    expect(STAGE_EVIDENCE_KIND.manual).toBe('file')
    expect(STAGE_EVIDENCE_KIND.release).toBe('file')
    expect(STAGE_EVIDENCE_KIND.capture).toBe('file')
  })

  it('TC-4 四段验收模板可证伪且语义区分（命令/路径锚点，禁空话）', () => {
    // e2e：场景断言锚点，且与 test 段语义区分（场景清单 vs 基线）
    expect(STAGE_ACCEPTANCE.e2e).toMatch(/场景/)
    expect(STAGE_ACCEPTANCE.e2e).toMatch(/`[^`]+`/) // 含命令锚点
    expect(STAGE_ACCEPTANCE.e2e).not.toEqual(STAGE_ACCEPTANCE.test)
    // manual：清单落盘 + 防伪造（晚于骨架）
    expect(STAGE_ACCEPTANCE.manual).toMatch(/manual\/<taskId>\.md/)
    expect(STAGE_ACCEPTANCE.manual).toMatch(/晚于.*骨架/)
    // release：构建戳/版本断言 + 回滚方式
    expect(STAGE_ACCEPTANCE.release).toMatch(/构建戳|版本号/)
    expect(STAGE_ACCEPTANCE.release).toMatch(/回滚/)
    // capture：evidence/ 落盘 + 可复核命令
    expect(STAGE_ACCEPTANCE.capture).toMatch(/evidence\//)
    expect(STAGE_ACCEPTANCE.capture).toMatch(/可复核命令/)
    // 中文标签齐全
    for (const s of NEW_STAGES) expect(STAGE_LABELS[s].length).toBeGreaterThan(0)
  })
})
