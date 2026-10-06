/**
 * RTM 新两维覆盖度 + 验收「原型对照」项的用例（REQ-261005105032-3b02 t8 / FR-5 / FR-7 / FR-9）。
 *
 * 分两段：
 *  - **纯函数段**：`CoverageChecker.checkPrototypeTraceability` 两维——UI 卡缺锚点 / D-x 无人引用
 *    → 覆盖度 < 100% 且**点名**（卡编号 / D-x 编号），且 `blocking === false`（只降覆盖度，
 *    不拒阶段转移）。
 *  - **真生成器段**：临时工作区跑 `RTMGenerator`，读回盘上的 `rtm-accepting.yml`，断言
 *    `outputs.acceptance_items` 含逐字判据的对照项（含"无原型 / 已豁免 / 非 UI 分类不产项"三条反向）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse } from 'yaml'
import { CoverageChecker } from '../vendor/reqboard/src/rtm/coverage-checker.js'
import {
  calculateDecisionReferenceCoverage,
  calculatePrototypeAnchorCoverage,
} from '../vendor/reqboard/src/rtm/coverage-calculator.js'
import { RTMGenerator } from '../vendor/reqboard/src/rtm/generator.js'
import type { LedgerArtifactLike, LedgerReader } from '../vendor/reqboard/src/rtm/context.js'
import type { RTMAccepting, RTMTaskLike } from '../vendor/reqboard/src/rtm/types.js'

describe('新两维覆盖度①：UI 卡必须有原型锚点（FR-5）', () => {
  it('UI 卡锚点为空 → 覆盖度 < 100% 且点名该卡编号；blocking 恒 false', () => {
    const result = CoverageChecker.checkPrototypeTraceability({
      category: 'feature',
      tasks: [
        // 台账口径（prototypeRefs）
        { id: 't-aaaaaa', side: 'frontend', prototypeRefs: ['prototypes/detail.html#FR-4'] },
        { id: 't-bbbbbb', side: 'frontend', prototypeRefs: [] },
      ],
    })

    expect(result.prototype_anchors.dimension).toBe('prototype_anchors')
    expect(result.prototype_anchors.coverage.rate).toBe(50)
    expect(result.prototype_anchors.coverage.uncovered).toEqual(['t-bbbbbb'])
    expect(result.prototype_anchors.gaps).toEqual(['t-bbbbbb']) // 点名卡编号
    expect(result.prototype_anchors.message).toContain('t-bbbbbb')
    expect(result.gaps).toContain('t-bbbbbb')
    // 只降覆盖度并点名，不拒阶段转移（data-model §6.4 / 验收标准 13）
    expect(result.blocking).toBe(false)
  })

  it('RTM task_coverage 口径（task_id + covers_prototypes）同样能判；backend 卡不进分母', () => {
    const result = CoverageChecker.checkPrototypeTraceability({
      category: 'refactor',
      tasks: [
        { task_id: 't-aaaaaa', side: 'frontend', covers_prototypes: ['prototypes/x.html#FR-1'] },
        { task_id: 't-bbbbbb', side: 'frontend', covers_prototypes: [] },
        { task_id: 't-cccccc', side: 'backend', covers_prototypes: [] }, // 非 UI 卡无此要求
      ],
    })

    expect(result.prototype_anchors.coverage.total).toBe(2) // 分母只有 UI 卡
    expect(result.prototype_anchors.coverage.rate).toBe(50)
    expect(result.prototype_anchors.gaps).toEqual(['t-bbbbbb'])
    expect(result.prototype_anchors.gaps).not.toContain('t-cccccc')
  })

  it('非 feature/refactor 分类不适用该维（空集合 = 100%，不给非 UI 需求加仪式）', () => {
    const coverage = calculatePrototypeAnchorCoverage('bug', [
      { id: 't-aaaaaa', side: 'frontend', anchors: [] },
    ])
    expect(coverage).toEqual({ total: 0, covered: 0, uncovered: [], rate: 100 })
  })
})

describe('新两维覆盖度②：每条 D-x 必须被引用（FR-9）', () => {
  it('D-7 无人引用 → 点名 D-7 且该维覆盖度下降', () => {
    const result = CoverageChecker.checkPrototypeTraceability({
      category: 'feature',
      tasks: [
        {
          id: 't-aaaaaa', side: 'frontend', prototypeRefs: ['prototypes/detail.html#FR-4'],
          decisionRefs: ['D-1'],
        },
      ],
      decisions: ['D-1', 'D-7'],
    })

    expect(result.decision_refs.dimension).toBe('decision_refs')
    expect(result.decision_refs.coverage.rate).toBe(50)
    expect(result.decision_refs.coverage.uncovered).toEqual(['D-7'])
    expect(result.decision_refs.gaps).toEqual(['D-7']) // 点名 D-x
    expect(result.decision_refs.message).toContain('D-7')
    expect(result.gaps).toContain('D-7')
    expect(result.blocking).toBe(false)
  })

  it('卡的 requirementRefs / FR 明细（设计章节 serves）两侧引用都算被引用', () => {
    const byCard = calculateDecisionReferenceCoverage({
      decisions: ['D-3', 'D-5'],
      tasks: [{ id: 't-aaaaaa', requirementRefs: ['D-3'], decisionRefs: ['D-5'] }],
    })
    expect(byCard).toEqual({ total: 2, covered: 2, uncovered: [], rate: 100 })

    const byClause = calculateDecisionReferenceCoverage({
      decisions: ['D-3'],
      clauseRefs: ['FR-1', 'D-3'],
    })
    expect(byClause.rate).toBe(100)

    // 便捷问法：单条判定与整套口径同源
    expect(CoverageChecker.decisionReferenced('D-3', { clauseRefs: ['D-3'] })).toBe(true)
    expect(CoverageChecker.decisionReferenced('D-9', { clauseRefs: ['D-3'] })).toBe(false)
  })

  it('没有 D-x 时该维真空 100%（不制造假红）', () => {
    const result = CoverageChecker.checkPrototypeTraceability({ category: 'feature', tasks: [] })
    expect(result.decision_refs.coverage).toEqual({ total: 0, covered: 0, uncovered: [], rate: 100 })
    expect(result.gaps).toEqual([])
  })
})

describe('验收「原型对照」证据条目（FR-7）', () => {
  const REQ_ID = 'REQ-ACCEPT-1'

  /** requirement.md 标本：FR 明细 + （feature 需要的）D-x 节。 */
  const REQ_MD = [
    '# 需求说明',
    '',
    '**FR-1: 权威原型**',
    '',
    '**FR-4: 锚点区块**',
    '',
    '## 讨论与裁定记录（D-x）',
    '',
    '| 编号 | 原话来源（引用） | 裁定 | 影响 FR | 判据 |',
    '|---|---|---|---|---|',
    '| D-1 | 用户：「原型要单列」 | 原型必须有唯一权威版本 | FR-1 | 验收标准 1 |',
    '',
  ].join('\n')

  /** 权威原型：一个 FR 锚点 + 单块 proto-geometry。 */
  const DETAIL_HTML = [
    '<!doctype html>',
    '<html><body>',
    '<section id="FR-1">标题区</section>',
    '<!-- proto-geometry {"observations":[{"name":"headerTop","value":12,"unit":"px",'
      + '"at":{"width":1280,"state":"terminal"}}]} -->',
    '</body></html>',
    '',
  ].join('\n')

  const INDEX_MD = [
    '# 原型权威清单',
    '',
    '| 路径 | 状态 | 服务条款 | 被取代于 |',
    '|---|---|---|---|',
    '| prototypes/detail.html | authoritative | FR-1 | — |',
    '',
  ].join('\n')

  let root: string
  let reqDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'rtm-accepting-compare-'))
    reqDir = join(root, 'docs', 'requirements', REQ_ID)
    mkdirSync(join(reqDir, 'design'), { recursive: true })
    mkdirSync(join(reqDir, 'prototypes'), { recursive: true })
    writeFileSync(join(reqDir, 'requirement.md'), REQ_MD)
    writeFileSync(join(reqDir, 'prototypes', 'detail.html'), DETAIL_HTML)
    writeFileSync(join(reqDir, 'prototypes', 'INDEX.md'), INDEX_MD)
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** 造生成器：category 可换；withPrototype=false 时台账里没有原型产物。 */
  function generatorOf(
    category: string,
    options: { withPrototype?: boolean; requirementMd?: string } = {},
  ): RTMGenerator {
    if (options.requirementMd !== undefined) {
      writeFileSync(join(reqDir, 'requirement.md'), options.requirementMd)
    }
    const artifacts: LedgerArtifactLike[] = [
      { kind: 'requirement', path: 'requirement.md', stage: 'brainstorming', confirmedAt: 1_700_000_000_000 },
      ...(options.withPrototype === false
        ? []
        : [{ kind: 'prototype', path: 'prototypes/detail.html', stage: 'brainstorming', registeredAt: 1 }]),
    ]
    const tasks: RTMTaskLike[] = [
      {
        id: 't-aaaaaa', title: 'UI 卡', status: 'in_progress', phase: 'implement', side: 'frontend',
        depends_on: [], implements: 'design/backend.md#1', serves: ['FR-1'],
        prototypeRefs: ['prototypes/detail.html#FR-1'], decisionRefs: ['D-1'],
      },
    ]
    const ledger: LedgerReader = {
      requirement: id => (id === REQ_ID
        ? { id: REQ_ID, title: '验收对照项标本', category, status: 'implementing', artifacts }
        : undefined),
      tasksOf: id => (id === REQ_ID ? tasks : []),
    }
    return new RTMGenerator({ workspaceRoot: root, ledger })
  }

  const readAccepting = (): RTMAccepting =>
    parse(readFileSync(join(reqDir, 'rtm-accepting.yml'), 'utf-8')) as RTMAccepting

  it('契约面：`acceptance_items` 挂在 types.ts 的 `RTMAccepting.outputs` 上（缺省 = 未采集）', () => {
    // 字面量**不经任何断言/交叉类型**即可赋给 RTMAccepting —— 字段若还躺在生成器里，这行编译不过。
    const data: RTMAccepting = {
      metadata: { stage: 'accepting', version: 1 },
      inputs: { tasks: [] },
      outputs: {
        test_cases: [],
        acceptance_items: [{
          id: 'prototype-compare',
          source: { kind: 'prototype-compare', prototypePath: 'prototypes/detail.html' },
          criterion: '与原型对照截图（含差异说明）',
          needsHuman: true,
          humanReason: '界面视觉需人对照权威原型',
        }],
      },
      traceability: { task_to_tests: {}, fr_to_tests: {} },
      coverage: {
        testing: { total: 0, covered: 0, uncovered: [], rate: 100, total_tasks: 0, tested_tasks: 0, untested: [] },
      },
    }
    const items = data.outputs.acceptance_items ?? []
    expect(items).toHaveLength(1)
    expect(items[0]?.source.prototypePath).toBe('prototypes/detail.html')
    expect(items[0]?.criterion).toBe('与原型对照截图（含差异说明）')

    // 加性可选：旧文件（无该键）读出来是 undefined，不炸、不当"必在"用
    const legacy: RTMAccepting = { ...data, outputs: { test_cases: [] } }
    expect(legacy.outputs.acceptance_items).toBeUndefined()
  })

  it('UI（feature）需求：验收项含「原型对照」证据条目（判据逐字 + 载荷 + needsHuman）', () => {
    const gen = generatorOf('feature')
    gen.generateBrainstorming(REQ_ID) // 权威原型路径来自 brainstorming 的 prototypes 节
    gen.generateAccepting(REQ_ID)

    const items = readAccepting().outputs.acceptance_items ?? []
    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      id: 'prototype-compare',
      source: { kind: 'prototype-compare', prototypePath: 'prototypes/detail.html' },
      criterion: '与原型对照截图（含差异说明）',
      needsHuman: true,
      humanReason: '界面视觉需人对照权威原型',
    })

    // 既有 outputs.test_cases 形状不变（加性，不顺手改旧字段）
    expect(Object.keys(readAccepting().outputs)).toContain('test_cases')
  })

  it('回落：brainstorming RTM 未生成时，仍从台账 prototype 产物产出对照项', () => {
    generatorOf('refactor').generateAccepting(REQ_ID)
    const items = readAccepting().outputs.acceptance_items ?? []
    expect(items.map(i => i.source.prototypePath)).toEqual(['prototypes/detail.html'])
  })

  it('无原型 / 已声明豁免 / 非 UI 分类 → 不写对照项（缺键 = 未采集，与两节同口径）', () => {
    generatorOf('feature', { withPrototype: false }).generateAccepting(REQ_ID)
    expect(readAccepting().outputs.acceptance_items).toBeUndefined()

    const exemptMd = REQ_MD.replace(/^# 需求说明/, '---\nprototype_exempt: 本需求无独立原型资产\n---\n\n# 需求说明')
    generatorOf('feature', { requirementMd: exemptMd }).generateAccepting(REQ_ID)
    expect(readAccepting().outputs.acceptance_items).toBeUndefined()

    generatorOf('bug').generateAccepting(REQ_ID)
    expect(readAccepting().outputs.acceptance_items).toBeUndefined()
  })
})
