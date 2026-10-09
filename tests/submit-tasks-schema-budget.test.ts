/**
 * reqboard_submit tasks[] 子 schema 描述预算与「细则下沉不丢」的断言（REQ-261008020552-4aa0 · U4 · FR-4）。
 *
 * ## 为什么需要它
 *
 * FR-4 做的是**减法**：tasks[] 21 个属性的逐字段长描述（基线 1717 字符）压成一句话，
 * 撤下的细则挪进 plan 各门禁的拒绝回执（G3 已验证模式，submit-prompt-budget 的姐妹篇）。
 * 两种事故各用判据兜住：
 *
 * ① **没减够**：tasks[] 子树描述 ≤ 860（减半档；SUBMIT_PROMPT ≤ 1300 既有预算不破）。
 * ② **减过头**：每条撤下的细则必须能在对应回执里读到——逐条调**真实函数**拿 message 断言
 *    （dep_reasons 写法 / granularity_exempt 条件 / footprint 口径 / skipIntegration 联动 /
 *    prototypeRefs 条件 / template 键清单 / stageKind 枚举）。
 * ③ **形状不变式**：键集、双拼对、封闭形状逐字保持（FR 铁律：只动描述字符串）。
 *
 * @module tests/submit-tasks-schema-budget
 */

import { describe, expect, it } from 'vitest'
import { defineSubmitTool } from '../src/tools/SubmitTool/SubmitTool.js'
import { SUBMIT_PROMPT } from '../src/tools/SubmitTool/prompt.js'
import { zeroOverlapDependencyWarnings } from '../src/application/internal/plan-deps-check.js'
import { assertGranularityGates } from '../src/application/internal/plan-granularity.js'
import { normalizeFootprint, assertFootprintFloor } from '../src/domain/task/Footprint.js'
import { normalizePlanTasks } from '../src/shared/protocol.js'
import { assertClauseCoverageGate } from '../src/application/internal/content-gate-wiring.js'
import { validateTemplateRef, validateExplicitStages } from '../src/domain/task/SubtaskTemplate.js'
import { DOC_QUALITY_RULES_SINCE } from '../src/domain/workflow/DocQualityRules.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

/** 递归求和 description（与需求文档「实测基线」同口径）。 */
function sumDescriptions(node: unknown): number {
  if (node === null || typeof node !== 'object') return 0
  let sum = 0
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'description' && typeof v === 'string') sum += v.length
    else sum += sumDescriptions(v)
  }
  return sum
}

const stubDeps = new Proxy({}, { get: () => () => { throw new Error('stub') } }) as never

type TaskItems = { properties: Record<string, unknown>; additionalProperties?: boolean }
const tasksSchemaOf = () => {
  const tool = defineSubmitTool(stubDeps) as unknown as {
    parameters: { properties: { tasks: { description?: string; items: TaskItems } } }
  }
  return tool.parameters.properties.tasks
}

// ── 夹具（与 plan-prototype-anchor-gate / plan-granularity 既有测试同款）──────────────
const fakeDocs = (files: Record<string, string>) => ({
  exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
  read: async (p: string) => files[p] ?? '',
})
const UI_REQ_PATH = 'docs/requirements/REQ-t/requirement.md'
const UI_REQ_DOC = [
  '---', 'req_id: REQ-t', 'sides: [frontend, backend]', '---',
  '# 需求', '', '## 6. 功能点', '', '**FR-1 详情页**：按原型实现。',
].join('\n')
const uiReqRecord = () => ({
  id: 'REQ-t', category: 'feature', createdAt: DOC_QUALITY_RULES_SINCE + 1000,
  artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: UI_REQ_PATH }],
} as unknown as RequirementRecord)
const uiCard = (over: Record<string, unknown> = {}) => ({
  key: 't3', side: 'frontend', requirement_refs: ['FR-1'],
  title: '按原型实现详情页', implementation: '改 src/client/views/detail.ts',
  acceptance: '跑 npx vitest run tests/detail.test.ts 全绿',
  ...over,
})

describe('reqboard_submit tasks[] 描述预算（FR-4）', () => {
  it('没减够：tasks[] 子树描述 ≤ 860（基线 1717），SUBMIT_PROMPT ≤ 1300 既有预算不破', () => {
    const total = sumDescriptions(tasksSchemaOf())
    expect(total, 'tasks[] 子树描述 ' + String(total) + ' 字符，超预算 860').toBeLessThanOrEqual(860)
    expect(SUBMIT_PROMPT.length, 'SUBMIT_PROMPT ' + String(SUBMIT_PROMPT.length) + ' 字符，超既有预算 1300')
      .toBeLessThanOrEqual(1300)
  })

  it('细则之家①：dep_reasons 写法 —— 伪依赖回执带 key=理由 写法与双拼说明', () => {
    const warnings = zeroOverlapDependencyWarnings([
      { key: 't1', implementation: '改 src/alpha.ts', dependsOn: ['t2'] },
      { key: 't2', implementation: '改 src/beta.ts' },
    ] as never)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('dep_reasons')
    expect(warnings[0]).toContain('key=理由')
    expect(warnings[0]).toContain('depReasons')
  })

  it('细则之家②：granularity_exempt 条件 —— 一卡多接口回执带豁免写法', async () => {
    const fat = [{ key: 't1', title: '登录全做', implementation: '新增 POST /api/login 与 GET /api/me', acceptance: 'npx vitest run x 全绿' }]
    const report = await assertGranularityGates(
      fakeDocs({ [UI_REQ_PATH]: UI_REQ_DOC }), uiReqRecord(), fat, 'docs/requirements/REQ-t/decomposition.md',
    )
    expect(report.failure?.code).toBe('plan_card_multi_interface')
    expect(report.failure?.message).toContain('granularity_exempt')
    expect(report.failure?.message).toContain('显式豁免')
  })

  it('细则之家③：footprint 口径 —— 形状回执带三量语义、floor 回执带余量口径', () => {
    expect(() => normalizeFootprint({ files: 'x' }, 'footprint')).toThrowError(/files=要改\/新建的文件数/)
    expect(() => normalizeFootprint({ files: 1, anchors: 1, chars: 1, bogus: 1 }, 'footprint'))
      .toThrowError(/anchors=验收锚点数/)
    expect(() => assertFootprintFloor({ files: 1, anchors: 1, chars: 10 }, '改 src/a.ts 与 src/b.ts', 'footprint'))
      .toThrowError(/允许留余量，不允许缩水/)
  })

  it('细则之家④：skipIntegration 联动 —— 缺理由回执带「必须同时给」', () => {
    expect(() => normalizePlanTasks([{
      key: 't1', title: '纯文档卡', implementation: '改 docs/a.md', acceptance: '跑 x 全绿', skipIntegration: true,
    }])).toThrowError(/skipIntegration=true 必须同时给/)
  })

  it('细则之家⑤：prototypeRefs 条件 —— 锚点门禁回执带 feature/refactor 且 sides 含 frontend', async () => {
    const failure = await assertClauseCoverageGate(fakeDocs({ [UI_REQ_PATH]: UI_REQ_DOC }), uiReqRecord(), [uiCard()])
    expect(failure?.code).toBe('prototype_anchor_missing')
    expect(failure?.message).toContain('feature/refactor 且 sides 含 frontend')
    expect(failure?.message).toContain('prototypeRefs')
  })

  it('细则之家⑥：template / stageKind —— 非法值回执列全部合法值', () => {
    const bad = validateTemplateRef('nope')
    expect(bad.ok).toBe(false)
    if (bad.ok) return
    expect(bad.error).toContain('合法键')
    expect(bad.error).toContain('change-only')
    const badStages = validateExplicitStages(['bogus'])
    expect(badStages.ok).toBe(false)
    if (badStages.ok) return
    expect(badStages.error).toContain('受控枚举')
    expect(badStages.error).toContain('dev')
  })

  it('形状不变式：21 键集 / 三对双拼 / 封闭形状 / footprint 三键逐字保持', () => {
    const items = tasksSchemaOf().items
    expect(Object.keys(items.properties).sort()).toEqual([
      'acceptance', 'decisionRefs', 'depReasons', 'dep_reasons', 'depends_on', 'description',
      'footprint', 'granularityExempt', 'granularity_exempt', 'implementation', 'key', 'phase',
      'prototypeRefs', 'requirement_refs', 'side', 'skipIntegration', 'skipIntegrationReason',
      'skip_integration_reason', 'stages', 'template', 'title',
    ].sort())
    expect(items.additionalProperties).toBe(false)
    const footprint = items.properties.footprint as { additionalProperties?: boolean; properties: Record<string, unknown> }
    expect(footprint.additionalProperties).toBe(false)
    expect(Object.keys(footprint.properties).sort()).toEqual(['anchors', 'chars', 'files'])
  })
})
