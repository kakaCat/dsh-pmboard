// serves: FR-1, FR-2, FR-6, FR-7, FR-10, FR-11, FR-12, FR-14, FR-15
/**
 * 「汇报 / 文档 / 对话 / Token」四个 Tab 的**内容口径与留痕诚实性**渲染断言
 * （REQ-261004222448-292a · 任务卡 t-5d795a · 设计 test-cases.md 的 T-5、T-9~T-14、T-16）。
 *
 * 这份文件只钉一件事：**页面上的每个字要么来自真数据，要么是一句说辞**——
 * 不许编、不许拿 0 冒充"未知"、不许把没证据的亮点混进正常亮点里。
 *
 * 与既有面板用例（trunk-panel / docs-panel / token-panel）的分工：那些用例喂**手写的
 * TrunkResponse / DocsResponse 载荷**测排版；这里从**文档原文出发走真抽取**
 * （`assembleTrunk`）再交给真面板渲染，断言的是"抽取 → 渲染"整条链的口径——
 * 手写载荷测不出「摘要必须是原文子串」与「缺节不回退描述」。
 *
 * 三次反例断言（本卡的硬要求）：
 *   ① T-11：无证据的亮点打 `data-evid="no"` 且**不落在** `data-hl-list="with-evidence"` 里；
 *   ② T-12：结构性标本里的 `tool/call` / `tool/result` / `reasoning` / `run_code` 不进产物
 *      （且标本本身确实含这些字样，防空断言）；
 *   ③ T-14：`availability='none'` 时不出现 0 值表（禁 `/0/` 整块断言——口径说明里带 "0" 字符）。
 *
 * @module dsh-pmboard/tests/report-content
 */
import { describe, it, expect } from 'vitest'
import { assembleTrunk } from '../src/application/query/QueryTrunk.js'
import { renderTrunkPanel } from '../src/client/views/panels/trunk.js'
import { docsPanel } from '../src/client/views/panels/docs.js'
import { renderDialogue } from '../src/client/views/panels/dialogue.js'
import { renderTokenPanel } from '../src/client/token-info.js'
import { esc } from '../src/client/html.js'
import { mdInline } from '../src/client/render/md-inline.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'
import type {
  DialogueResponse,
  DocPanelEntry,
  DocsResponse,
  GateVerdict,
  TrunkResponse,
  VerificationItem,
} from '../src/shared/protocol.js'

const REQ = 'REQ-261004222448-292a'
const REQ_DOC = 'docs/requirements/' + REQ + '/requirement.md'
const DESIGN_DIR = 'docs/requirements/' + REQ + '/design'
const DESIGN_DOC = DESIGN_DIR + '/architecture.md'

/** 渲染用 ctx：渲染路径**不该**取数、也**不该**开正文（掉了就是副作用混进纯函数）。 */
const ctx: ReportTabCtx = {
  requirementId: REQ,
  load: () => Promise.reject(new Error('渲染路径不该取数')),
  openDoc: () => { throw new Error('渲染路径不该开正文') },
}

const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

/** 取某个 `data-*` 到 `endNeedle` 之间的片段（容器级断言用）。 */
function sliceBetween(html: string, from: string, endNeedle: string): string {
  const start = html.indexOf(from)
  expect(start, '产物里找不到 ' + from).toBeGreaterThan(-1)
  const end = html.indexOf(endNeedle, start)
  expect(end, from + ' 之后找不到 ' + endNeedle).toBeGreaterThan(-1)
  return html.slice(start, end)
}

/** 汇报面板里某一条（`<section data-trunk-item="key">` … `</section>`）。 */
function trunkItemOf(html: string, key: string): string {
  const start = html.indexOf('data-trunk-item="' + key + '"')
  expect(start, '产物里找不到主干条 ' + key).toBeGreaterThan(-1)
  const end = html.indexOf('</section>', start)
  return html.slice(start, end < 0 ? html.length : end)
}

/* ────────────────────────────────────────────────── 主干标本（文档原文） */

/**
 * 有节标本：**文档自己带结构**（领句 + 痛点表 + 列表 + 带标签的亮点条目）——
 * 抽取只认文档既有节名与标签，夹具一旦"帮它总结"，就测不到"只截原文"这条纪律了。
 */
const REQUIREMENT_MD = [
  '# ' + REQ + ' 详情页改工作汇报',
  '',
  '## 产品定义',
  '',
  '**一句话**：把需求详情页改成工作汇报，主干常驻、附件进 Tab。',
  '',
  '| 痛点（实测） | 本次解决 |',
  '|---|---|',
  '| 打开一屏读不出现在怎么样 | 首屏结论头 + 操作条 |',
  '| 数字不可得时显示 0 | 诚实空态（未采集 / 不可得分开说） |',
  '',
  '## 边界（不做什么）',
  '',
  '1. **不做成一份报告**：不做导出、不加封面。',
  '2. **不搬会话全文**：工具调用与推理不进页面。',
  '',
].join('\n')

/** 亮点无证据的那一条：它的差异文案在正常亮点容器里**一次都不许出现**（反例①的抓手）。 */
const NO_EVIDENCE_DIFF = '无证据的亮点不上桌'
const EVIDENCE_POINTER = 'tests/report-content.test.ts'

const DESIGN_MD = [
  '# 架构设计（' + REQ + '）',
  '',
  '## 目标与总体方案 `serves: FR-1`',
  '',
  '主线：只读聚合 + 读时抽取，前端不做遍历。',
  '',
  '## 模块改动地图 `serves: FR-1`',
  '',
  '| 文件 | 改动 |',
  '|---|---|',
  '| trunk.ts | 新增汇报面板 |',
  '',
  '## 关键决策与取舍',
  '',
  '| 决策 | 理由 |',
  '|---|---|',
  '| 不缓存抽取结果 | 文档一改即生效 |',
  '| 缺节不回退需求描述 | 否则"少了一半"永远不可见 |',
  '',
  '## 技术方案与亮点 <!-- serves: FR-14 -->',
  '',
  '- 设计模式：未使用（本需求没有引入新的模式，不硬凑）',
  '- 差异：' + NO_EVIDENCE_DIFF,
  '  为什么：这是反应付的机制保证——没证据的亮点不许混进正常亮点',
  '- 差异：缺证据也照实展示，供读者自己判断是不是应付',
  '  证据：src/client/views/panels/trunk.ts、' + EVIDENCE_POINTER,
  '',
].join('\n')

/** 缺节标本：两份文档都没有那五个写死的节名。 */
const MINIMAL_REQUIREMENT_MD = ['# 缺节样例', '', '## TL;DR', '', '一句话说明。', ''].join('\n')
const MINIMAL_DESIGN_MD = ['# 设计（缺节样例）', '', '## 模块改动地图', '', '| 文件 | 改动 |', '|---|---|', '| a.ts | 改 |', ''].join('\n')

interface AssembleOptions {
  reqText?: string
  design?: readonly { path: string; text: string }[]
  comments?: readonly { body: string }[]
  tasks?: readonly { id: string; requirementRefs?: readonly string[]; lastReport?: { filesChanged: readonly string[]; completed: readonly string[] } }[]
  planSummary?: string
}

/** 走**真抽取**（纯函数，不碰 IO）拿到 TrunkResponse。 */
function assemble(o: AssembleOptions = {}): TrunkResponse {
  return assembleTrunk({
    requirementId: REQ,
    docs: {
      requirementPath: REQ_DOC,
      ...(o.reqText === undefined ? {} : { requirementText: o.reqText }),
      designDir: DESIGN_DIR,
      designDocs: o.design ?? [],
    },
    ledger: {
      comments: o.comments ?? [],
      tasks: o.tasks ?? [],
      ...(o.planSummary === undefined ? {} : { planSummary: o.planSummary }),
    },
  })
}

const FULL_DESIGN = [{ path: DESIGN_DOC, text: DESIGN_MD }]
const FULL_ASM = (): TrunkResponse => assemble({ reqText: REQUIREMENT_MD, design: FULL_DESIGN })

/** 文档原文的合集（"摘要必须是原文子串"的比对底本）。 */
const ALL_DOC_TEXT = REQUIREMENT_MD + '\n' + DESIGN_MD

/* ══════════════════════════════════════════════ T-9 主干抽取：缺节 / 只截原文 */

describe('T-9 · 主干抽取：缺节照实说、有节只截原文（FR-1 / FR-12）', () => {
  it('T-9 · 缺节标本：七条各自带 source，summary 为空数组且 missing=doc-section-missing（不含编造文案）', () => {
    const resp = assemble({ reqText: MINIMAL_REQUIREMENT_MD, design: [{ path: DESIGN_DOC, text: MINIMAL_DESIGN_MD }] })
    expect(resp.items).toHaveLength(7)
    for (const item of resp.items) {
      // 协议要求"每一项都必须带 source"——缺了页面只能标「来源未知」，那是降级不是常态。
      expect(item.source.length, item.key + ' 缺 source').toBeGreaterThan(0)
      expect(item.summary, item.key + ' 缺节却有摘要 = 编造').toEqual([])
      expect(item.missing, item.key + ' 缺节却没标 missing').toBe('doc-section-missing')
    }
  })

  it('T-9 · 缺节渲染：每条给「文档未提供该节」，且该条**没有任何摘要行**（不空白、不编）', () => {
    const html = renderTrunkPanel(assemble({ reqText: MINIMAL_REQUIREMENT_MD, design: [{ path: DESIGN_DOC, text: MINIMAL_DESIGN_MD }] }))
    expect(countOf(html, 'data-missing="doc-section-missing"')).toBe(7)
    for (const key of ['why', 'problem', 'approach', 'scope', 'decision', 'tech', 'highlight']) {
      const block = trunkItemOf(html, key)
      expect(block, key + ' 未写「文档未提供该节」').toContain('文档未提供该节')
      // 缺节的机械判据：这一条里**一条摘要行都没有**（有摘要行就说明有人替它补了内容）
      expect(countOf(block, 'data-summary-line="1"'), key + ' 缺节却渲染了摘要行').toBe(0)
      expect(block).not.toContain('data-summary-none')
    }
  })

  it('T-9 · 有节标本：摘要行逐条是文档原文子串，且渲染时一字不改写', () => {
    const resp = FULL_ASM()
    const html = renderTrunkPanel(resp)
    let checked = 0
    for (const item of resp.items) {
      expect(item.missing, item.key + ' 有节却被标缺节').toBeUndefined()
      expect(item.summary.length, item.key + ' 有节却没有摘要').toBeGreaterThan(0)
      const block = trunkItemOf(html, item.key)
      for (const line of item.summary) {
        expect(ALL_DOC_TEXT, item.key + ' 的摘要不是原文子串：' + line).toContain(line)
        // 渲染层只做**显示转换**（「**x**」→「<b>x</b>」等，见 render/md-inline.ts），
        // 字一个不改：所以断言的是"这一行经同一个转换函数出现在这一条里"，
        // 而不是"原样字符串出现"（那会把 Markdown 标记重新露到页面上——2026-10-05 验收的变形①）。
        expect(block, item.key + ' 渲染时改写了原文：' + line).toContain(mdInline(line))
        checked += 1
      }
    }
    // 防空断言：真的比过若干行（夹具空了这条用例就失去意义）
    expect(checked).toBeGreaterThanOrEqual(7)
  })

  it('T-9 · 缺节不回退需求描述：台账 planSummary 只进 approach 条，why/problem/scope 仍是缺节', () => {
    const plan = '台账计划摘要（原文）：先接六个只读端点，再落六个 Tab'
    const resp = assemble({ reqText: MINIMAL_REQUIREMENT_MD, design: [{ path: DESIGN_DOC, text: MINIMAL_DESIGN_MD }], planSummary: plan })
    const byKey = new Map(resp.items.map(i => [i.key, i]))
    expect(byKey.get('approach')?.summary).toEqual([plan]) // 台账来源是设计稿允许的（FR-1 实现思路）
    for (const key of ['why', 'problem', 'scope'] as const) {
      expect(byKey.get(key)?.summary, key + ' 拿计划摘要填了文档缺节').toEqual([])
      expect(byKey.get(key)?.missing).toBe('doc-section-missing')
    }
    // 渲染层面同样不许把 planSummary 塞进那三条
    const html = renderTrunkPanel(resp)
    expect(countOf(html, esc(plan))).toBe(1)
    expect(html.indexOf(esc(plan))).toBeGreaterThan(html.indexOf('data-trunk-item="approach"'))
    expect(html.indexOf(esc(plan))).toBeLessThan(html.indexOf('</section>', html.indexOf('data-trunk-item="approach"')))
  })
})

/* ══════════════════════════════════════════════ T-10 / T-11 亮点与反应付 */

describe('T-10 / T-11 · 亮点与反应付（FR-14 / FR-15）', () => {
  it('T-10 · 文档写「未使用」时按原文照实渲染（不硬凑设计模式）', () => {
    const resp = FULL_ASM()
    const tech = resp.items.find(i => i.key === 'tech')
    const used = (tech?.summary ?? []).find(l => l.includes('未使用'))
    expect(used, 'tech 摘要里没有文档写的「未使用」').toBeDefined()
    expect(ALL_DOC_TEXT).toContain(used as string) // 原文，不是页面编的
    const block = trunkItemOf(renderTrunkPanel(resp), 'tech')
    expect(block).toContain('未使用')
    // 页面不得凭空造一个模式名（硬凑的典型形态）
    expect(block).not.toContain('工厂模式')
    expect(block).not.toContain('观察者模式')
  })

  it('T-11 · 有证据的亮点进 data-hl-list="with-evidence"（差异 + 为什么 + 证据三件齐全）', () => {
    const resp = FULL_ASM()
    const highlight = resp.items.find(i => i.key === 'highlight')
    expect(highlight?.highlights).toHaveLength(2)
    expect(highlight?.highlights?.filter(h => h.evidence.length > 0)).toHaveLength(1)
    expect(highlight?.highlights?.filter(h => h.evidence.length === 0)).toHaveLength(1)

    const html = renderTrunkPanel(resp)
    const withList = sliceBetween(html, 'data-hl-list="with-evidence"', 'data-hl-group="no-evidence"')
    expect(withList).toContain(EVIDENCE_POINTER) // 证据指针
    expect(withList).toContain('data-evidence="' + EVIDENCE_POINTER + '"')
    expect(withList).toContain('data-hl="with-evidence"')
    expect(countOf(withList, 'data-hl="with-evidence"')).toBe(1) // 正常亮点里恰好一条（无证据那条不许混进来）
  })

  it('反例① T-11 · 无证据亮点打 data-evid="no"，且**不落在**正常亮点的容器/类名里', () => {
    const html = renderTrunkPanel(FULL_ASM())
    // 它确实被渲染出来了（不是被静默丢掉——丢掉人就看不到"反应付"这个信号）
    expect(countOf(html, 'data-evid="no"')).toBe(1)
    expect(html).toContain('未提供证据（不计入亮点）')
    expect(html).toContain(NO_EVIDENCE_DIFF)
    // 机械反例：正常亮点容器里既没有它的人，也没有它的文
    const withList = sliceBetween(html, 'data-hl-list="with-evidence"', 'data-hl-group="no-evidence"')
    expect(withList).not.toContain('data-evid="no"')
    expect(withList).not.toContain('data-hl="no-evidence"')
    expect(withList).not.toContain(NO_EVIDENCE_DIFF)
    // 反向控制：无证据条目确实在**另一个**容器里（两堆不共容器，断言才有意义）
    const noGroup = html.slice(html.indexOf('data-hl-group="no-evidence"'))
    expect(noGroup).toContain('data-evid="no"')
    expect(noGroup).toContain(NO_EVIDENCE_DIFF)
    expect(noGroup).toContain('反应付机制')
  })
})

/* ══════════════════════════════════════════════ T-5 / T-13 / T-16 文档 · 核验 · 门禁 */

/** 15 份文档（原型口径：全部逐行铺开），四种登记态各至少一份。 */
const DOCS: DocPanelEntry[] = [
  { kind: 'requirement', path: REQ_DOC, registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'design', path: DESIGN_DOC, registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'design', path: DESIGN_DIR + '/interfaces.md', registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'design', path: DESIGN_DIR + '/frontend.md', registeredAt: 1700000000000, state: 'pending' },
  { kind: 'design', path: DESIGN_DIR + '/data-model.md', registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'design', path: DESIGN_DIR + '/test-cases.md', registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'design', path: DESIGN_DIR + '/migration.md', registeredAt: 1700000000000, state: 'pending' },
  { kind: 'design', path: DESIGN_DIR + '/backend.md', state: 'unregistered' },
  { kind: 'plan', path: 'docs/requirements/' + REQ + '/decomposition.md', registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'task-detail', path: 'docs/requirements/' + REQ + '/tasks/t-1.md', registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'task-detail', path: 'docs/requirements/' + REQ + '/tasks/t-2.md', registeredAt: 1700000000000, state: 'pending' },
  // 登记在案、文件不在：划线 + 「文件缺失」
  { kind: 'task-detail', path: 'docs/requirements/' + REQ + '/tasks/t-3.md', registeredAt: 1700000000000, state: 'file-missing' },
  { kind: 'verification', path: 'docs/requirements/' + REQ + '/verification.md', registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'retro', path: 'docs/requirements/' + REQ + '/retro.md', registeredAt: 1700000000000, state: 'confirmed' },
  { kind: 'notes', path: 'docs/requirements/' + REQ + '/notes.md', registeredAt: 1700000000000, state: 'confirmed' },
]

const VERIFY_ITEMS: VerificationItem[] = [
  {
    id: 'v1-1',
    source: { kind: 'requirement' },
    criterion: '文档行数 == 台账文档数（铺开，不截断）',
    evidence: ['npx vitest run tests/report-content.test.ts → 15 rows'],
    status: 'passed',
    result: '15 行，与台账一致',
    resultSource: 'agent',
  },
  {
    id: 'v1-2',
    source: { kind: 'requirement' },
    criterion: '缺失行划线标灰',
    evidence: [],
    status: 'failed',
    result: '首轮未标灰',
    resultSource: 'human',
    needsHuman: true,
    humanReason: '界面视觉无独立证据',
    opinion: '首轮未通过：意见已挂回原卡',
    decidedAt: 1700000005000,
    decidedBy: { kind: 'human' },
  },
  { id: 'v1-3', source: { kind: 'requirement' }, criterion: '归档清单完整', evidence: ['archive-reconcile 输出'], status: 'pending' },
]

/** 台账只给了三道门：另外三道必须**照实补齐**（少列一道 = "这道门过了没有"不可回答）。 */
const GATES: GateVerdict[] = [
  { gate: 'requirement', verdict: 'passed', via: 'dialog', at: 1700000000000, by: { kind: 'human', sessionId: 'session-1a2b3c4d-0000' } },
  { gate: 'plan', verdict: 'rejected', via: 'evidence-text', at: 1700000002000, by: { kind: 'human' }, reason: '粒度太细，请按子卡链模板重拆' },
  { gate: 'implementation', verdict: 'pending' },
]

function makeDocsResponse(over: Partial<DocsResponse> = {}): DocsResponse {
  return {
    documents: DOCS,
    generated: [{ label: '任务队列（DAG 派生视图）', path: 'docs/requirements/' + REQ + '/queue.json' }],
    verification: {
      version: 2,
      items: VERIFY_ITEMS,
      generatedAt: 1700000000000,
      generatedBy: { kind: 'agent', sessionId: 'session-1a2b3c4d-0000' },
    },
    gates: GATES,
    ...over,
  }
}

const renderDocs = (data: unknown): string => docsPanel.render(data, ctx)

describe('T-5 / T-13 / T-16 · 文档铺开、核验七列、门禁六道（FR-7 / FR-11 #7）', () => {
  it('T-5 · 文档行数 == 台账文档数（15 == 15；不截断、不折叠成一行）', () => {
    const html = renderDocs(makeDocsResponse())
    expect(DOCS).toHaveLength(15)
    const rows = countOf(html, 'data-doc-row="1"')
    expect(rows).toBe(DOCS.length)
    // 块头的"共 N 份"必须与行数同源（数字不可数 = 本设计要消灭的老路）
    const hint = /共 (\d+) 份/.exec(html)
    expect(hint, '文档块头没有给出份数').not.toBeNull()
    expect(Number((hint as RegExpExecArray)[1])).toBe(rows)
    // 「铺开」的第二半：每份的路径都在产物里（压成"tasks/ 4 份 + 滚动"就会漏）
    for (const d of DOCS) expect(html).toContain('data-open-doc="' + d.path + '"')
  })

  it('T-13 · 核验表七列在场：标准 / 实际结果 / 来源 / 需人工 / 证据 / 意见 / 裁决', () => {
    const html = renderDocs(makeDocsResponse())
    const head = sliceBetween(html, 'data-verify-table="1"', '</thead>')
    const cols = [...head.matchAll(/<th>([^<]*)<\/th>/g)].map(m => m[1])
    expect(cols).toEqual(['标准', '实际结果', '来源', '需人工', '证据', '意见', '裁决'])
    // 列头在场还不够：逐项铺开（行数 == 验收项数），否则"七列"只是空壳
    expect(countOf(html, 'data-verify-row="1"')).toBe(VERIFY_ITEMS.length)
  })

  it('T-13 · 来源格给原始枚举（agent|human）；需人工格带原因；未给结果/意见各有说辞', () => {
    const html = renderDocs(makeDocsResponse())
    expect(html).toContain('data-source="agent"')
    expect(html).toContain('data-source="human"')
    expect(html).toContain('data-needs-human="1"')
    expect(html).toContain('需人工确认：界面视觉无独立证据')
    // 第三项没给 result/opinion：不许留白
    const lastRow = html.slice(html.lastIndexOf('data-verify-row="1"'))
    expect(lastRow).toContain('未提供实际结果')
    expect(lastRow).toContain('无意见（裁决时未写）')
  })

  it('T-16 · file-missing 行：可见划线 + 「文件缺失」+ 不给可点的假出口', () => {
    const html = renderDocs(makeDocsResponse())
    const start = html.indexOf('data-file-missing="1"')
    expect(start, 'file-missing 行没有专门标记').toBeGreaterThan(-1)
    const row = html.slice(html.lastIndexOf('<tr', start), html.indexOf('</tr>', start))
    expect(row).toContain('dsh-pm-doc-missing')
    expect(row).toContain('text-decoration: line-through') // 字符串级可见的划线（不依赖样式表加载）
    expect(row).toContain('文件缺失')
    expect(row).toContain('disabled')
    expect(row).toContain('aria-disabled="true"')
    // 其余行照常可点（划线只该落在那一条上）
    expect(countOf(html, 'text-decoration: line-through')).toBe(1)
    expect(countOf(html, 'data-doc-row="1"')).toBe(15)
  })

  it('T-16 · 门禁六道门各一行；not-reached 有说辞（台账漏给的门也列全，不编结论）', () => {
    const html = renderDocs(makeDocsResponse())
    expect(html).toContain('data-gate-table="1"')
    const gates = [...html.matchAll(/data-gate="([a-z]+)" data-verdict="([a-z-]+)"/g)]
    expect(gates.map(g => g[1])).toEqual(['requirement', 'design', 'plan', 'implementation', 'verification', 'archive'])
    expect(gates).toHaveLength(6)
    // 台账没给的三道门 → not-reached，且必须说清"还没走到 / 台账没有留痕"
    const notReached = gates.filter(g => g[2] === 'not-reached')
    expect(notReached.map(g => g[1])).toEqual(['design', 'verification', 'archive'])
    for (const g of notReached) {
      const gate = g[1]
      const start = html.indexOf('data-gate="' + gate + '"')
      const row = html.slice(start, html.indexOf('</tr>', start))
      expect(row, gate + ' 的 not-reached 没有说辞').toContain('尚未走到该门')
      expect(row).toContain('台账没有这道门的留痕')
    }
    // 退回理由取原文（不许改述）；pending 说清在等人
    expect(html).toContain('粒度太细，请按子卡链模板重拆')
    expect(html).toContain('这道门在等人')
  })
})

/* ══════════════════════════════════════════════ T-12 对话过滤（反例②） */

const BAD_TOKENS = ['tool/call', 'tool/result', 'reasoning', 'run_code'] as const

/**
 * **结构性标本**：把工具 / 推理字样放在"服务端漏过滤"的真实形态上——
 * ① 非法 `kind`（`tool/call` / `tool/result` / `reasoning` 直接被当成消息类型）；
 * ② 合法消息的 `blocks[].type` 与 `reasoning` 字段里（会话事件的原文形状）。
 *
 * 刻意**不**把这些字样写进合法消息的 `text`：那属于"人自己打的字"，
 * 面板照实渲染是对的；本反例要挡的是"渲染层把工具块拼回页面"。
 */
const CONTAMINATED = {
  items: [
    {
      kind: 'human', at: 100, text: '先看接口，再动壳',
      blocks: [
        { type: 'tool/call', name: 'run_code', input: 'run_code 输出…' },
        { type: 'tool/result', name: 'run_code', output: 'tool/result 回填' },
      ],
      reasoning: 'reasoning: 我该先读渲染路径',
    },
    { kind: 'tool/call', at: 200, text: 'tool/call run_code 的原始事件' },
    { kind: 'tool/result', at: 300, text: 'tool/result run_code 的返回值' },
    { kind: 'reasoning', at: 400, text: 'reasoning: 分析中' },
    { kind: 'system', at: 500, text: '阶段推进：设计 → 拆分（台账原文）', evt: 'stage-advance', inferred: true },
    { kind: 'agent', at: 600, text: '收到，我来拆', windowKey: 'session-1f2d438d-7a94' },
  ],
  page: { hasMore: false, total: 6 },
}

const contaminatedPayload = (): DialogueResponse => CONTAMINATED as unknown as DialogueResponse

describe('T-12 · 对话过滤：工具与推理不进页面（反例②）', () => {
  it('反例②（防空断言）· 标本本身确实含这些字样（否则下面那条断言等于没测）', () => {
    const raw = JSON.stringify(CONTAMINATED)
    for (const bad of BAD_TOKENS) expect(raw, '标本里本来就没有 ' + bad).toContain(bad)
    // 两种真实泄漏形态都得在标本里：非法 kind 与 blocks/reasoning 字段
    const first = CONTAMINATED.items[0] as { blocks?: { type: string }[]; reasoning?: string }
    expect(CONTAMINATED.items.some(i => String(i.kind).includes('/') || i.kind === 'reasoning')).toBe(true)
    expect(first.blocks?.length ?? 0).toBeGreaterThan(0)
    expect(first.reasoning ?? '').toContain('reasoning')
  })

  it('反例② · 渲染产物里**不含** tool/call、tool/result、reasoning、run_code 字样', () => {
    const html = renderDialogue(contaminatedPayload(), ctx)
    for (const bad of BAD_TOKENS) expect(html, '产物里出现了 ' + bad).not.toContain(bad)
    // 合法文本照常渲染（过滤不等于整块丢掉），且被丢掉的条数如实写出来（不静默）
    expect(html).toContain('先看接口，再动壳')
    expect(html).toContain('收到，我来拆')
    // 三条非法 kind（tool/call、tool/result、reasoning）被丢，且条数如实写出来（不静默吞掉）
    expect(html).toContain('data-dialogue-dropped="3"')
  })

  it('T-12 · 系统消息与人类消息**同一个容器**、时间序单调、回填标在场', () => {
    const html = renderDialogue(contaminatedPayload(), ctx)
    const list = sliceBetween(html, 'data-dialogue-list="1"', 'data-dialogue-readonly="1"')
    expect(countOf(list, 'data-msg="')).toBe(3) // human + system + agent，工具条一律不进
    expect(countOf(html, 'data-msg="')).toBe(3) // 容器外一条都没有（不另起一块）
    const ats = [...list.matchAll(/data-at="(\d+)"/g)].map(m => Number(m[1]))
    expect(ats).toEqual([...ats].sort((a, b) => a - b)) // 时间序单调
    expect(list).toContain('data-msg="system"')
    expect(list).toContain('data-msg="human"')
    expect(list).toContain('data-inferred="1"') // 回填标：反推的事件不能读成"刚刚发生"
    expect(list).toContain('回填')
  })
})

/* ══════════════════════════════════════════════ T-14 / T-17 Token */

/** 四段有记录（占比合计 = 100）+ 一段无记录：`data-share-pct` 之和必须等于 `data-share-sum`。 */
function tokenPayload(): Record<string, unknown> {
  return {
    availability: 'full',
    byStage: [
      { stage: 'brainstorming', calls: 6, inputTokens: 200000, outputTokens: 20000, cacheReadTokens: 620000, totalTokens: 120000, sharePct: 12, perCallTokens: 20000, cacheHitPct: 77, executions: [] },
      { stage: 'design', calls: 9, inputTokens: 240000, outputTokens: 28000, cacheReadTokens: 480000, totalTokens: 190000, sharePct: 19, perCallTokens: 21111, cacheHitPct: 68, executions: [] },
      { stage: 'implementing', calls: 14, inputTokens: 700000, outputTokens: 90000, cacheReadTokens: 900000, totalTokens: 540000, sharePct: 54, perCallTokens: 38571, cacheHitPct: 59, executions: [] },
      { stage: 'accepting', calls: 5, inputTokens: 180000, outputTokens: 22000, cacheReadTokens: 420000, totalTokens: 150000, sharePct: 15, perCallTokens: 30000, cacheHitPct: 70, executions: [] },
      { stage: 'archived', executions: [] },
    ],
    optimizations: [
      { title: '实施段是最大头', basis: 'implementing 占 54%（540000 tokens ÷ 14 次调用）', suggestion: '对该段做节点隔离 + 输入包裁剪' },
      { title: '缓存命中最低', basis: 'implementing 缓存命中 59%（缓存读 900000 / 未缓存输入 700000）', suggestion: '把稳定前缀固定成同一段输入包' },
      { title: '零产出执行', basis: '零产出执行 1 次（review 段，10m）', suggestion: '给 review 段加「无产出即停」' },
    ],
  }
}

const attrValues = (html: string, attr: string): string[] =>
  [...html.matchAll(new RegExp(attr + '="([^"]*)"', 'g'))].map(m => m[1])

describe('T-14 · Token 按阶段：占比合计 == 总计、两列在场、优化点带数字（FR-10）', () => {
  it('T-14 · 占比合计 == 总计（data-share-pct 之和 == data-share-sum == 100）', () => {
    const html = renderTokenPanel(tokenPayload())
    const rowShares = attrValues(html, 'data-share-pct').map(Number)
    expect(rowShares).toEqual([12, 19, 54, 15])
    const shareSum = Number(attrValues(html, 'data-share-sum')[0])
    const sum = rowShares.reduce((a, b) => a + b, 0)
    expect(sum).toBe(100)
    expect(shareSum, '表尾占比合计与逐行占比之和对不上').toBe(sum)
    // 总计同理：表尾合计 == 各阶段合计之和
    const stageTotals = attrValues(html, 'data-total-tokens').map(Number)
    const totalRow = Number(stageTotals[stageTotals.length - 1])
    expect(totalRow).toBe(stageTotals.slice(0, -1).reduce((a, b) => a + b, 0))
    expect(totalRow).toBe(120000 + 190000 + 540000 + 150000)
    // 无记录的那一段不产 0 行（"还没进"≠"花了 0"）
    expect(html).toContain('无快照')
    expect(attrValues(html, 'data-has-data')).toContain('0')
  })

  it('T-14 · 「每次调用均」与「缓存命中率」两列在场（表头 + 逐行有值；缺一即不满足"可优化数据"）', () => {
    const html = renderTokenPanel(tokenPayload())
    const head = sliceBetween(html, 'data-stage-table="1"', '</thead>')
    expect(head).toContain('每次调用均')
    expect(head).toContain('缓存命中率')
    const perCall = attrValues(html, 'data-per-call').filter(v => v.length > 0)
    const cacheHit = attrValues(html, 'data-cache-hit').filter(v => v.length > 0)
    expect(perCall).toEqual(['20000', '21111', '38571', '30000'])
    expect(cacheHit).toEqual(['77', '68', '59', '70'])
  })

  it('T-14 · optimizations 每条含数字（渲染出的「依据」逐条正则 \\d；不编无凭据的建议）', () => {
    const payload = tokenPayload()
    const opts = payload.optimizations as { basis: string }[]
    for (const o of opts) expect(o.basis, '标本依据本身没数字：' + o.basis).toMatch(/\d/)

    const html = renderTokenPanel(payload)
    expect(countOf(html, 'data-opt="1"')).toBe(opts.length)
    const basisLines = [...html.matchAll(/依据：([^<]*)</g)].map(m => m[1])
    expect(basisLines).toHaveLength(opts.length)
    for (const line of basisLines) expect(line, '渲染出的依据没有数字：' + line).toMatch(/\d/)
    expect(html).not.toContain('data-opt-nodigit') // 面板没有替服务端编数字
  })
})

describe('T-17 · Token 降级：不可得态不出现 0 值表（FR-12）', () => {
  it('T-17 · availability=none：无 <table> / 无 data-stage-row / 无 >0< 值单元格（不用 /0/ 整块断言）', () => {
    const html = renderTokenPanel({ availability: 'none', byStage: [{ stage: 'implementing', executions: [] }] })
    expect(html).toContain('无 token 快照')
    expect(html).toContain('data-availability-badge="none"')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('data-stage-row')
    expect(html).not.toContain('data-total-row')
    expect(html).not.toContain('>0<')
    // 口径说明仍在（它说的是"这些数怎么来的"），但不含任何 0 值单元格
    expect(html).toContain('不补 0')
  })

  it('T-17 · availability=partial：标「部分数据（下界）」并逐段列出 missingStages', () => {
    const html = renderTokenPanel({
      availability: 'partial',
      missingStages: ['implementing', 'accepting'],
      byStage: [{ stage: 'design', calls: 9, totalTokens: 190000, sharePct: 100, perCallTokens: 21111, cacheHitPct: 68, executions: [] }],
    })
    expect(html).toContain('data-availability-badge="partial"')
    expect(html).toContain('部分数据（下界）')
    expect(html).toContain('实施')
    expect(html).toContain('验收')
    expect(html).toContain('token 快照不可得')
    // 下界不是 0：既有行照常渲染，缺的那两段不产 0 行
    expect(attrValues(html, 'data-stage-row')).toHaveLength(1)
    expect(html).not.toContain('data-stage="implementing"')
  })
})
