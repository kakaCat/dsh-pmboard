/**
 * 阶段门时序逾期判据（REQ-261005105032-3b02 FR-11 / t13 · serves: FR-11）
 *
 * 验收口径（任务卡 acceptance 逐条照做）：
 *  · 三标本各自被对应转移拒绝，且 `code` 为 `stage_gate_overdue`、`gaps` **点名逾期门**：
 *    ① 设计已交完而 dangling 未绿；② 拆分已落库而 UI 卡无锚点；③ 实施已收尾而 E2E 覆盖 false；
 *  · **防假红**：brainstorming 期编号链全 orphan 且 E2E 覆盖为 false 的标本走同一判据 → 放行
 *    （orphan 是过程状态、E2E 读数那时不该判）；
 *  · 会话侧传输码为 `REQBOARD_STAGE_GATE_OVERDUE`（实测走真 `reqboard_move`，不是只断言映射表）；
 *  · 时点表与 `design/architecture.md` §⑥ / `interfaces.md` 的时序表逐字一致（三档与门名）。
 *
 * **逆验证（本卡交付的机械保证）**：把 `contentGatesForMove` 里的阶段门分支整体停用后重跑全量，
 * 失败集合的差集 = 本文件里**行为断言**的那 9 条（放行/未到期/投影/时点表这类纯判据不受影响）——
 * 即"门真的挂在转移上"，不是只在夹具上绿。
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeTestStore } from './application/harness.js'
import { defineMoveTool } from './helpers/tool-deps.js'
import {
  assertClauseCoverageGate,
  checkDesignServesGate,
  checkNumberChainGate,
  checkRequirementDocFormatGate,
  contentGatesForMove,
  e2eCoverageOf,
} from '../src/application/internal/content-gate-wiring.js'
import { assertStageGateTimelineGate, type StageGateProbes } from '../src/application/internal/stage-gate-timeline.js'
import { planTaskProjections } from '../src/application/internal/plan-task-projections.js'
import { StageGateTimeline, stageGateMomentFor } from '../src/domain/gate/GateCatalog.js'
import { transportCodeOf } from '../src/application/use-cases/MoveRequirement.js'
import { parseDocument, type DocsReader } from '../src/application/internal/content-gates.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-t13-001'
const REQ = 'REQ-t13gate'
const RDIR = 'docs/requirements/' + REQ
const REQP = RDIR + '/requirement.md'
const PLANP = RDIR + '/decomposition.md'

// ── 夹具：内存文档树（list 支持设计目录枚举，与 FileDocRepository 口径一致） ─────────────

function memDocs(files: Readonly<Record<string, string>>): DocsReader {
  return {
    exists: p => Object.prototype.hasOwnProperty.call(files, p),
    read: async p => files[p] ?? '',
    list: (dir: string) => Object.keys(files)
      .filter(f => f.startsWith(dir + '/'))
      .map(f => f.slice(dir.length + 1))
      .filter(name => !name.includes('/'))
      .map(name => ({ name, isFile: true })),
  }
}

/** 需求文档：feature 四个必填节 + FR-1（+ 可选测试策略表，用来控制 E2E 读数）。 */
function reqDoc(opts: { e2e?: boolean; fr2?: boolean; dSection?: boolean; sides?: readonly string[]; noStrategyTable?: boolean } = {}): string {
  const lines = [
    '---', 'req: ' + REQ,
    ...(opts.sides === undefined ? [] : ['sides: [' + opts.sides.join(', ') + ']']),
    '---', '',
    '# 需求', '',
    '## 边界', '不做范围外的事。', '',
    '## 产品定义', 'x', '',
    '## 用户与角色', 'x', '',
    '## 功能点', '', '### FR-1: 甲', 'x', '',
  ]
  if (opts.fr2 === true) lines.push('### FR-2: 乙', 'x', '')
  if (opts.dSection === true) lines.push('## 讨论与裁定记录（D-x）', '', '本节无裁定', '')
  if (opts.noStrategyTable !== true) {
    lines.push('## 测试策略', '', '| 层级 | 范围 |', '|---|---|')
    lines.push(opts.e2e === true ? '| E2E | 全链路 |' : '| 单测 | 模块内 |')
  }
  return lines.join('\n') + '\n'
}

/** 计划文档：任务表（t1 = UI 卡，端侧 frontend）+ 覆盖对照表（FR-1 有人接）。 */
function planDoc(anchorCell: string): string {
  return [
    '# 拆分计划（' + REQ + '）', '',
    '## 任务表', '',
    '| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    '| t1 | （落库后回填） | 按原型做详情页 | FR-1 | P-1 + src/page.tsx | ' + anchorCell + ' | — | ui | frontend | — | M | 跑 npx vitest run tests/x.test.ts 看 1 passed | dev,review |',
    '',
    '## 覆盖对照', '',
    '| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |',
    '|---|---|---|---|---|---|',
    '| FR-1 | I-1（1） | P-1（1） | TC-1（1） | t1（1） | ✅ |',
    '',
  ].join('\n')
}

const reqOf = (over: Partial<RequirementRecord> = {}): RequirementRecord => ({
  id: REQ, title: '阶段门时序', description: '', category: 'feature', status: 'design',
  blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
  createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1 }],
  ...over,
} as unknown as RequirementRecord)

const PROBES: StageGateProbes = {
  requirementDocFormat: (docs, req) => checkRequirementDocFormatGate(docs, req),
  designServes: (docs, req) => checkDesignServesGate(docs, req),
  numberChain: (docs, req) => checkNumberChainGate(docs, req),
  clauseCoverage: (docs, req, rawTasks) => assertClauseCoverageGate(docs, req, rawTasks),
  e2eCoverage: (docs, req) => e2eCoverageOf(docs, req),
}

// ── 标本 ①：设计已交完而 dangling 未绿 ───────────────────────────────────────

describe('标本①：设计已交完而编号链 dangling 未绿 → design → decomposing 拒', () => {
  /** 设计章节自己带 id（BE-2），serves 指向**不存在**的 FR-9 = 悬空。 */
  const DESIGN = [
    '# 架构', '',
    '## 1.1 甲的设计 `serves: FR-1`', 'x', '',
    '## 1.2 BE-2 服务层 `serves: FR-9`', 'y', '',
  ].join('\n')

  const files = (): Record<string, string> => ({ [REQP]: reqDoc(), [RDIR + '/design/architecture.md']: DESIGN })

  it('code = stage_gate_overdue，gaps 点名「设计交完：门「无 dangling」未转绿」与悬空编号', async () => {
    const failure = await contentGatesForMove(memDocs(files()), reqOf(), 'design', 'decomposing')
    expect(failure?.code).toBe('stage_gate_overdue')
    const gaps = (failure?.gaps ?? []).join('\n')
    expect(gaps).toContain('设计交完：门「无 dangling」未转绿')
    expect(gaps).toContain('BE-2→FR-9')
    // 门消息给得出可执行补齐路径（GATE_HOW_ANCHOR 认 reqboard_*）
    expect(failure?.message).toContain('reqboard_move')
    expect(failure?.message).toContain('scripts/req-doc-validate.mts')
  })

  it('只有 dangling 这一门红：格式门 / serves / 必填节都没被误报', async () => {
    const failure = await contentGatesForMove(memDocs(files()), reqOf(), 'design', 'decomposing')
    const names = (failure?.gaps ?? []).filter(g => g.includes('未转绿')).join(' ')
    expect(names).toContain('无 dangling')
    expect(names).not.toContain('格式门')
    expect(names).not.toContain('serves')
    expect(names).not.toContain('必填节')
  })
})

// ── 标本 ②：拆分已落库而 UI 卡无锚点 ─────────────────────────────────────────

describe('标本②：拆分已落库而 UI 卡无原型锚点 → decomposing → implementing 拒', () => {
  // 声明了 frontend 端侧才是「UI 需求」——UI 卡锚点维的适用面与三个原型门同吃这一份判据。
  const files = (anchorCell: string): Record<string, string> => ({
    [REQP]: reqDoc({ sides: ['frontend'] }),
    [PLANP]: planDoc(anchorCell),
  })

  it('code = stage_gate_overdue，gaps 点名「UI 卡原型锚点」与那张卡', async () => {
    const failure = await contentGatesForMove(memDocs(files('—')), reqOf({ status: 'decomposing' }), 'decomposing', 'implementing')
    expect(failure?.code).toBe('stage_gate_overdue')
    const gaps = (failure?.gaps ?? []).join('\n')
    expect(gaps).toContain('拆分落库：门「UI 卡原型锚点」未转绿')
    expect(gaps).toContain('UI 卡原型锚点 → t1（UI 卡）')
    // 回归锁（实测踩过）：卡投影只写 `id` 不写 `key` 时，锚点维读不到 key 会回落成**按行号编的 k1**，
    // 拒绝消息就会点名一张不存在的卡——那种"看着有点名、其实指错人"的门比不点名更难查。
    expect(gaps).not.toContain('k1')
  })

  // t8 交付的两维覆盖度（CoverageChecker.checkPrototypeTraceability，blocking:false）：
  // 它的 gaps **并入点名**，但**不参与判定**——本条的判定仍只由「该时点的门未到位」触发。
  it('两维覆盖度读数并入点名：gaps 含「覆盖度点名（本项不阻断转移）」且带 UI 卡编号（t8 消费）', async () => {
    const failure = await contentGatesForMove(memDocs(files('—')), reqOf({ status: 'decomposing' }), 'decomposing', 'implementing')
    const gaps = (failure?.gaps ?? []).join('\n')
    expect(gaps).toContain('覆盖度点名（本项不阻断转移）')
    expect(gaps).toContain('原型锚点覆盖度不足')
    expect(gaps).toContain('t1')
  })

  it('UI 卡写了锚点 → 这一档放行（不因"没写锚点之外的事"乱拒）', async () => {
    const failure = await contentGatesForMove(
      memDocs(files('P-1 ↔ prototypes/detail.html#FR-1')),
      reqOf({ status: 'decomposing' }),
      'decomposing',
      'implementing',
    )
    expect(failure).toBeUndefined()
  })

  it('拆分未落库（decomposition.md 不在盘上）→ 未到期，不判（防假红）', async () => {
    const failure = await contentGatesForMove(memDocs({ [REQP]: reqDoc() }), reqOf({ status: 'decomposing' }), 'decomposing', 'implementing')
    expect(failure).toBeUndefined()
  })

  it('计划任务表被读成卡投影（只取数、不判定）：key / 端侧 / 覆盖条款 / 锚点四处都能读到', () => {
    const rows = planTaskProjections(parseDocument(planDoc('P-1 ↔ prototypes/detail.html#FR-1')))
    expect(rows).toEqual([{
      id: 't1',
      // 两个键同值：`id` 供两维覆盖度、`key` 供 UI 卡锚点维点名（见 plan-task-projections 的注释）
      key: 't1',
      side: 'frontend',
      requirementRefs: ['FR-1'],
      prototypeRefs: ['P-1 ↔ prototypes/detail.html#FR-1'],
    }])
  })
})

// ── 标本 ③：实施已收尾而 E2E 覆盖 false ─────────────────────────────────────

describe('标本③：实施已收尾而 E2E 覆盖 false → implementing → accepting 拒', () => {
  const files = (e2e: boolean): Record<string, string> => ({
    [REQP]: reqDoc({ e2e }),
    [RDIR + '/design/architecture.md']: '# 架构\n\n## 1.1 甲的设计 `serves: FR-1`\nx\n',
  })

  it('code = stage_gate_overdue，gaps 点名「E2E 覆盖」', async () => {
    const failure = await contentGatesForMove(memDocs(files(false)), reqOf({ status: 'implementing' }), 'implementing', 'accepting')
    expect(failure?.code).toBe('stage_gate_overdue')
    const gaps = (failure?.gaps ?? []).join('\n')
    expect(gaps).toContain('实施收尾：门「E2E 覆盖」未转绿')
    expect(gaps).toContain('层级 = E2E')
    // 三级追溯这一级是齐的（FR-1 有设计章节服务它）→ 不该被点名
    expect(gaps).not.toContain('三级追溯')
  })

  it('E2E 有行 → 放行', async () => {
    const failure = await contentGatesForMove(memDocs(files(true)), reqOf({ status: 'implementing' }), 'implementing', 'accepting')
    expect(failure).toBeUndefined()
  })

  // REQ-261005105032-3b02（实施期裁定 · 本需求被自己拦住的实证）：
  // 「没有测试策略表」= **读数未知**，不是「没有 E2E 行」。压成 false 会把「还没写测试策略」
  // 升级成「E2E 未覆盖」，进而在实施收尾判逾期——而本仓存量需求与现有模板产物都没有这张表，
  // 那等于新门追溯拦住所有老需求（含本需求自己：实测 implementing→accepting 曾被判 overdue）。
  it('没有测试策略表 → 读数未知（不判）→ 放行，不追溯拦老需求', async () => {
    const f: Record<string, string> = {
      [REQP]: reqDoc({ noStrategyTable: true }),
      [RDIR + '/design/architecture.md']: '# 架构\n\n## 1.1 甲的设计 `serves: FR-1`\nx\n',
    }
    const failure = await contentGatesForMove(memDocs(f), reqOf({ status: 'implementing' }), 'implementing', 'accepting')
    expect(failure).toBeUndefined()
  })

  it('三级追溯第一级断（FR-2 没有设计章节服务它）→ 点名「三级追溯」', async () => {
    const f: Record<string, string> = {
      [REQP]: reqDoc({ e2e: true, fr2: true }),
      [RDIR + '/design/architecture.md']: '# 架构\n\n## 1.1 甲的设计 `serves: FR-1`\nx\n',
    }
    const failure = await contentGatesForMove(memDocs(f), reqOf({ status: 'implementing' }), 'implementing', 'accepting')
    expect(failure?.code).toBe('stage_gate_overdue')
    const gaps = (failure?.gaps ?? []).join('\n')
    expect(gaps).toContain('实施收尾：门「三级追溯」未转绿')
    expect(gaps).toContain('FR-2')
  })
})

// ── 防假红：时点未到一律不判 ────────────────────────────────────────────────

describe('防假红：brainstorming 期编号链全 orphan 且 E2E false → 同一判据放行', () => {
  /** FR-2 没人接（orphan）、测试策略表没有 E2E 行、设计章节只有 FR-1 一侧。 */
  const files = (): Record<string, string> => ({
    [REQP]: reqDoc({ e2e: false, fr2: true }),
    [RDIR + '/design/architecture.md']: '# 架构\n\n## 1.1 甲的设计 `serves: FR-1`\nx\n',
  })

  it('brainstorming 期（时点未到）→ 不判：连"全 orphan + E2E false"都不算逾期', async () => {
    const failure = await assertStageGateTimelineGate(memDocs(files()), reqOf({ status: 'brainstorming' }), 'brainstorming', 'design', PROBES)
    expect(failure).toBeUndefined()
  })

  it('orphan（根编号无人接）不算逾期：设计交完这一档只判 dangling，不判 orphan', async () => {
    const failure = await contentGatesForMove(memDocs(files()), reqOf({ status: 'design' }), 'design', 'decomposing')
    expect(failure).toBeUndefined()
  })

  it('同标本到「实施收尾」才红（证明放行不是因为读数空转）', async () => {
    const failure = await contentGatesForMove(memDocs(files()), reqOf({ status: 'implementing' }), 'implementing', 'accepting')
    expect(failure?.code).toBe('stage_gate_overdue')
    expect((failure?.gaps ?? []).join('\n')).toContain('E2E 覆盖')
  })

  it('其余转移（回退 / canceled）无时点 → 一律不判', async () => {
    const docs = memDocs(files())
    expect(await assertStageGateTimelineGate(docs, reqOf({ status: 'design' }), 'design', 'brainstorming', PROBES)).toBeUndefined()
    expect(await assertStageGateTimelineGate(docs, reqOf({ status: 'design' }), 'design', 'canceled', PROBES)).toBeUndefined()
  })

  it('存量需求（artifacts 空）→ 不追溯（与既有各门同口径）', async () => {
    const failure = await assertStageGateTimelineGate(memDocs(files()), reqOf({ artifacts: undefined }), 'design', 'decomposing', PROBES)
    expect(failure).toBeUndefined()
  })
})

// ── 时点表与传输码 ──────────────────────────────────────────────────────────

describe('时点表（与设计文档逐字一致）与传输码', () => {
  it('StageGateTimeline 三档门名逐字照 design/architecture.md §⑥', () => {
    expect(StageGateTimeline['设计交完']).toEqual(['必填节', '格式门', 'serves', '无 dangling'])
    expect(StageGateTimeline['拆分落库']).toEqual(['覆盖对照（FR→卡）', 'UI 卡原型锚点'])
    expect(StageGateTimeline['实施收尾']).toEqual(['E2E 覆盖', '三级追溯'])
  })

  it('时点 → 转移映射：三档齐（含没有人工闸门的 implementing→accepting），其余 undefined', () => {
    expect(stageGateMomentFor('design', 'decomposing')).toBe('设计交完')
    expect(stageGateMomentFor('decomposing', 'implementing')).toBe('拆分落库')
    expect(stageGateMomentFor('implementing', 'accepting')).toBe('实施收尾')
    expect(stageGateMomentFor('brainstorming', 'design')).toBeUndefined()
    expect(stageGateMomentFor('accepting', 'archived')).toBeUndefined()
  })

  it('会话侧传输码 = REQBOARD_STAGE_GATE_OVERDUE（§10 #39）', () => {
    expect(transportCodeOf('stage_gate_overdue')).toBe('REQBOARD_STAGE_GATE_OVERDUE')
  })
})

// ── 会话侧实测：真 reqboard_move 走这条门 ────────────────────────────────────

const DESIGN5 = ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md']

describe('会话侧实测：真 reqboard_move 被 stage_gate_overdue 拦下（传输码 REQBOARD_STAGE_GATE_OVERDUE）', () => {
  let dir: string
  let store: ReturnType<typeof makeTestStore>

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pmboard-t13-'))
    store = makeTestStore()
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  function write(rel: string, text: string): void {
    const abs = join(dir, rel)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, text)
  }

  /** 五份设计文档都在盘上（G2 通过），其中架构那份带一条悬空引用（本门要拦的正是它）。 */
  function writeDesignSet(): void {
    write(REQP, reqDoc())
    mkdirSync(join(dir, RDIR, 'design'), { recursive: true })
    for (const n of DESIGN5) {
      write(RDIR + '/design/' + n, n === 'architecture.md'
        ? '# 架构\n\n## 1.1 甲的设计 `serves: FR-1`\nx\n\n## 1.2 BE-2 服务层 `serves: FR-9`\ny\n'
        : '# ' + n + '\n')
    }
  }

  async function seed(): Promise<void> {
    const artifacts: StageArtifact[] = [
      { stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1, confirmedAt: 1 } as StageArtifact,
      ...DESIGN5.map(name => ({
        stage: 'design', kind: 'design', path: RDIR + '/design/' + name,
        registeredAt: 1, confirmedAt: 1,
      }) as StageArtifact),
    ]
    const r = {
      id: REQ, title: '阶段门时序', description: '', category: 'feature', status: 'design',
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [], artifacts,
    } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  }

  it('拒绝消息带 REQBOARD_STAGE_GATE_OVERDUE 与逾期门名，且需求状态零变化', async () => {
    writeDesignSet()
    await seed()
    const tool = defineMoveTool({ store, now: () => 1000, workspaceRoot: dir } as never) as never as {
      execute: (a: unknown, e: unknown) => Promise<unknown>
    }
    const err = await tool.execute({ to: 'decomposing' }, { agent: { id: W } }).then(() => undefined, (e: Error) => e)
    expect(err?.message).toContain('REQBOARD_STAGE_GATE_OVERDUE')
    expect(err?.message).toContain('无 dangling')
    expect(store.peekAll()[0]!.status).toBe('design')
  })
})
