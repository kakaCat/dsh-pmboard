// serves: FR-8
/**
 * 「验收」Tab 面板渲染单测（REQ-261006130057-7a43 · FR-8 / t3；设计 test-cases.md T-1~T-6）。
 *
 * 面板 render 是**纯字符串函数**（本包没有 jsdom），断言全部落在字符串 / DOM 结构上——
 * 机械判据（可数、可 grep；非快照，每条都能真失败）：
 *   T-1 Tab 顺序：buildTabBar 产物中 `data-tab="verify"` 存在，次序 = trunk < docs < dag <
 *        dialogue < verify < token < prompts（7 枚）；
 *   T-2 RTM 主表：有 sheet + tracking → `data-rtm-table="1"`，每 FR 一行 `tr[data-fr]`；
 *        覆盖链 chip 含真实文本 ✓/✗（`data-cov` + `data-cov-ok`）；无 tracking → 降级逐项平铺，
 *        覆盖链列整列不渲染（无 `data-cov`、无该列表头）；
 *   T-2b **frMap 模式（D-10 返工）**：`frMap` 有值 → 行键 = **FR 号**（`fr_to_design ∪
 *        fr_to_tasks ∪ fr_to_tests` 的键，按 FR 编号**数值**升序：FR-2 在 FR-10 前）；
 *        覆盖链 chip = 该 FR 在不在三张映射里；多子项取**最严重**状态 + 「N 项」计数；
 *        归不进任何 FR 的项（需求级 REQ-LEVEL / prototype-decision 对照项 / 孤立追溯键）
 *        另起一组「需求级 / 对照项」行（`data-fr-group="aux"`）排在 FR 行之后，**不丢**；
 *        无 `frMap` → 退回逐项平铺（行键 = 追溯 id，`data-fr-mode="trace"`）；
 *   T-3 空态两分支：无 sheet → `data-verify-empty="1"` 含「尚未提交」；items 空 → 含「没有逐项」；
 *        两态产物里都没有 `<table>`；
 *   T-4 行展开：`data-fr-detail="<fr>"` 内含实际结果 / needsHuman+humanReason / 证据；
 *        not_verifiable 不算「待裁决」（与 isFullyDecided 同口径：只有 pending + unverified）；
 *   T-5 徽标口径：badge 只读 `tabCounts.verify`（缺省 / '0' 都不渲染 `data-badge-verify`）；
 *        面板「待裁决 N 项」直接铺服务端 `pendingCount`（前端不另数）；
 *   T-6 迁移指引：docs 面板无 `data-verify-table` / `data-doc-section="verification"`，
 *        原位是迁移指引条（`data-verify-moved="1"`）且 `data-tab="verify"` 可切。
 *
 * @module dsh-pmboard/tests/verify-panel
 */
import { describe, it, expect } from 'vitest'
import { verifyPanel, renderRtmTable, readVerify, rowsOf } from '../src/client/views/panels/verify.js'
import { docsPanel } from '../src/client/views/panels/docs.js'
import { buildTabBar, type ReportTabCtx } from '../src/client/views/report-tabs.js'
import type {
  DocsResponse,
  ReportResponse,
  VerificationItem,
  VerificationSheet,
  VerifyPanelResponse,
} from '../src/shared/protocol.js'
import type { AcceptanceTracking } from '../vendor/reqboard/src/types/rtm.js'

const REQ = 'REQ-261006130057-7a43'
const T0 = Date.UTC(2026, 9, 5, 22, 40) // 2026-10-05 22:40

/** 渲染上下文：纯渲染不该取数、不该开正文（掉了就是副作用混进纯函数）。 */
const CTX: ReportTabCtx = {
  requirementId: REQ,
  load: () => Promise.reject(new Error('渲染路径不该取数')),
  openDoc: () => { throw new Error('渲染路径不该开正文') },
}

const countOf = (html: string, needle: string): number => html.split(needle).length - 1

const renderVerify = (data: unknown): string => verifyPanel.render(data, CTX)

/* --------------------------------------------------------------- 标本 */

/**
 * 五个逐项覆盖全部五态：passed / pending / unverified(needsHuman) / failed / not_verifiable。
 * 对齐键（rtmTraceIdOf 单点）：task 项 → taskId；requirement 项 → 'REQ-LEVEL'——
 * 与下方 TRACKING 的 fr_id 一一对上（不发明第二套对齐键）。
 */
const ITEMS: VerificationItem[] = [
  {
    id: 'v-1',
    source: { kind: 'task', taskId: 't-1' },
    criterion: '头部三层结构断言',
    howToVerify: 'pnpm test tests/head-layers',
    evidence: ['verification/shot-head.png'],
    status: 'passed',
    result: '三层结构断言 9 项通过',
    resultSource: 'agent',
    opinion: '三层结构与设计一致',
    decidedAt: T0 + 720_000,
    decidedBy: { kind: 'human', sessionId: 'session-1a2b3c4d-0000' },
  },
  {
    id: 'v-2',
    source: { kind: 'task', taskId: 't-1' },
    criterion: '操作区聚类断言',
    howToVerify: 'pnpm test tests/action-cluster',
    evidence: [],
    status: 'pending',
    result: '聚类断言 4 项通过',
    resultSource: 'agent',
  },
  {
    id: 'v-3',
    source: { kind: 'requirement' },
    criterion: '首屏视觉层级权重',
    evidence: [],
    status: 'unverified',
    needsHuman: true,
    humanReason: '界面视觉判断 agent 跑不了',
  },
  {
    id: 'v-4',
    source: { kind: 'task', taskId: 't-2' },
    criterion: '长日志默认收纳一行',
    howToVerify: 'pnpm test tests/comments-fold',
    evidence: ['verification/probe-report.md'],
    status: 'failed',
    result: '600 条明细未收纳',
    resultSource: 'agent',
    opinion: '退回 t-2 返工',
    decidedAt: T0 + 800_000,
    decidedBy: { kind: 'human' },
  },
  {
    id: 'v-5',
    source: { kind: 'task', taskId: 't-3' },
    criterion: '依赖服务在线时端到端可验',
    evidence: [],
    status: 'not_verifiable',
    opinion: '依赖服务未上线，无法按要求验',
    decidedAt: T0 + 810_000,
    decidedBy: { kind: 'agent', sessionId: 'session-9f8e7d6c-1111' },
  },
]

const SHEET: VerificationSheet = {
  version: 2,
  reworkOnly: true,
  generatedAt: T0,
  generatedBy: { kind: 'agent', sessionId: 'session-b262610a-2222' },
  items: ITEMS,
}

/** RTM 追踪（fr_id 与逐项的对齐键同值；status 分布与逐项一致）。 */
const TRACKING: AcceptanceTracking[] = [
  { acceptance_id: 'a-1', fr_id: 't-1', verification: 'headless 实测头部三层', status: 'passed' },
  { acceptance_id: 'a-2', fr_id: 'REQ-LEVEL', verification: '首屏视觉只能人看', status: 'unverified' },
  { acceptance_id: 'a-3', fr_id: 't-2', verification: 'pnpm test tests/comments-fold', status: 'failed' },
  { acceptance_id: 'a-4', fr_id: 't-3', verification: '依赖服务在线才验得了', status: 'not_verifiable' },
]

const COVERAGE: NonNullable<VerifyPanelResponse['coverage']> = {
  't-1': { design: true, tasks: true, tests: true },
  'REQ-LEVEL': { design: true, tasks: true, tests: false },
  't-2': { design: true, tasks: false, tests: false },
  't-3': { design: true, tasks: true, tests: true },
}

const MATERIALS: NonNullable<VerifyPanelResponse['materials']> = {
  summary: '首屏四区 + 七个 Tab 全部落地；FR-2 待人裁决',
  evidence: ['pnpm test → 42 passed', 'verification/probe-report.md'],
}

const HISTORY: NonNullable<VerifyPanelResponse['history']> = [
  {
    version: 1,
    reworkOnly: false,
    generatedAt: T0 - 5_400_000,
    generatedBy: { kind: 'agent' },
    items: [
      { id: 'v-1', source: { kind: 'task', taskId: 't-1' }, criterion: '头部三层', evidence: [], status: 'failed' },
      { id: 'v-4', source: { kind: 'task', taskId: 't-2' }, criterion: '长日志收纳', evidence: [], status: 'passed' },
    ],
  },
]

/** 待裁决 = pending + unverified = v-2 + v-3 = 2（not_verifiable 的 v-5 不算，isFullyDecided 同口径）。 */
const PENDING = 2

function fullPayload(over: Partial<VerifyPanelResponse> = {}): VerifyPanelResponse {
  return {
    sheet: SHEET,
    history: HISTORY,
    tracking: TRACKING,
    coverage: COVERAGE,
    materials: MATERIALS,
    pendingCount: PENDING,
    ...over,
  }
}

/** 主表行（`<tr data-fr="…">` 到 `</tr>`）；行展开行用 detailOf 取。 */
function mainRowOf(html: string, fr: string): string {
  const needle = '<tr data-fr="' + fr + '"'
  const at = html.indexOf(needle)
  expect(at, '主表里找不到 FR 行 ' + fr).toBeGreaterThan(-1)
  return html.slice(at, html.indexOf('</tr>', at))
}

/** 行展开（`<details data-fr-detail="…">` 到 `</details>`）。 */
function detailOf(html: string, fr: string): string {
  const needle = 'data-fr-detail="' + fr + '"'
  const at = html.indexOf(needle)
  expect(at, '找不到行展开 ' + fr).toBeGreaterThan(-1)
  return html.slice(at, html.indexOf('</details>', at))
}

/* --------------------------------------------------------------- T-1 Tab 顺序 */

describe('T-1 · Tab 顺序（7 枚，verify 在 dialogue 与 token 之间）', () => {
  it('buildTabBar 产物含 data-tab="verify"，次序 = trunk<docs<dag<dialogue<verify<token<prompts', () => {
    const bar = buildTabBar(undefined, 'verify')
    const order = ['trunk', 'docs', 'dag', 'dialogue', 'verify', 'token', 'prompts']
    expect(countOf(bar, 'data-tab="')).toBe(7)
    const positions = order.map(k => bar.indexOf('data-tab="' + k + '"'))
    for (const [i, p] of positions.entries()) expect(p, order[i]).toBeGreaterThan(-1)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    // 激活态落在 verify 上（壳渲染时 active 标记不漂）
    expect(bar).toContain('class="dsh-pm-tab active" data-action="switch-tab" data-tab="verify"')
  })
})

/* --------------------------------------------------------------- T-2 RTM 主表 */

describe('T-2 · RTM 验收追踪列表（每 FR 一行；覆盖链 chip 真实文本）', () => {
  it('有 sheet + tracking → data-rtm-table="1"，每 FR 一行 tr[data-fr]，五列带覆盖链表头', () => {
    const html = renderVerify(fullPayload())
    expect(html).toContain('data-panel="verify"')
    expect(html).toContain('data-rtm-table="1"')
    expect(html).toContain('data-rtm-cols="5"')
    expect(html).not.toContain('data-rtm-fallback')
    expect(html).toContain('<th>覆盖链（设计→任务→测试）</th>')
    // 每 FR 一行主行（tr[data-fr]）+ 一行展开行（data-fr-detail）：四个 FR 各恰好一行主行
    for (const fr of ['t-1', 'REQ-LEVEL', 't-2', 't-3']) {
      expect(countOf(html, '<tr data-fr="' + fr + '"'), fr).toBe(1)
      expect(countOf(html, 'data-fr-detail="' + fr + '"'), fr).toBe(1)
    }
    expect(countOf(html, '<tr data-fr="')).toBe(4)
    // 汇总行：a/b 通过 · c 待裁决 · d 不通过（t-2 不通过；t-1/REQ-LEVEL 待裁决；t-3 全不可验收归入通过侧）
    expect(html).toContain('data-rtm-progress="1"')
    expect(html).toContain('<b>1/4</b> 通过')
    expect(html).toContain('<b>2</b> 待裁决')
    expect(html).toContain('<b>1</b> 不通过')
  })

  it('覆盖链 chip：✓/✗ 是真实文本，命中/缺失分带 data-cov-ok=yes/no', () => {
    const html = renderVerify(fullPayload())
    const t1 = mainRowOf(html, 't-1')
    for (const label of ['设计 ✓', '任务 ✓', '测试 ✓']) expect(t1).toContain(label)
    expect(countOf(t1, 'data-cov-ok="yes"')).toBe(3)
    expect(t1).toContain('data-cov="design"')
    expect(t1).toContain('data-cov="tasks"')
    expect(t1).toContain('data-cov="tests"')
    const reqLevel = mainRowOf(html, 'REQ-LEVEL')
    expect(reqLevel).toContain('设计 ✓')
    expect(reqLevel).toContain('任务 ✓')
    expect(reqLevel).toContain('测试 ✗') // 缺 = 灰底描边 ✗（真实文本，不靠颜色单一表达）
    expect(countOf(reqLevel, 'data-cov-ok="yes"')).toBe(2)
    expect(countOf(reqLevel, 'data-cov-ok="no"')).toBe(1)
    const t2 = mainRowOf(html, 't-2')
    expect(t2).toContain('任务 ✗')
    expect(t2).toContain('测试 ✗')
    expect(countOf(t2, 'data-cov-ok="no"')).toBe(2)
  })

  it('行状态 chip 五值齐备：pending / unverified(未复核) / fail / nv / pass 文案各归各行', () => {
    const html = renderVerify(fullPayload())
    expect(mainRowOf(html, 't-1')).toContain('data-v="pending"')
    expect(mainRowOf(html, 't-1')).toContain('⏳ 待裁决')
    const reqLevel = mainRowOf(html, 'REQ-LEVEL')
    expect(reqLevel).toContain('data-v="unverified"')
    expect(reqLevel).toContain('未复核') // 与逐项徽标同一字面量（单点 UNVERIFIED_TEXT）
    expect(reqLevel).toContain('无法自验·需人工') // needsHuman 行级旗标
    expect(mainRowOf(html, 't-2')).toContain('data-v="fail"')
    expect(mainRowOf(html, 't-2')).toContain('✖ 不通过')
    expect(mainRowOf(html, 't-3')).toContain('data-v="nv"')
    expect(mainRowOf(html, 't-3')).toContain('不可验收')
  })

  it('无 tracking / coverage → 降级逐项平铺：表还在，但覆盖链列整列不渲染', () => {
    const html = renderVerify(fullPayload({ tracking: undefined, coverage: undefined }))
    expect(html).toContain('data-rtm-table="1"') // 逐项平铺不消失（RTM 是增强层）
    expect(html).toContain('data-rtm-fallback="1"')
    expect(html).toContain('data-rtm-cols="4"')
    expect(html).not.toContain('<th>覆盖链（设计→任务→测试）</th>')
    expect(html).not.toContain('data-cov=') // 一个假覆盖 chip 都不许画
    expect(html).toContain('RTM 追踪缺失：覆盖链不显示') // 降级要明说，不静默
    // 逐项仍按对齐键归行（t-1 两项同组），每 FR 一行不变
    expect(countOf(html, '<tr data-fr="')).toBe(4)
    expect(mainRowOf(html, 't-1')).toContain('2 项')
  })

  it('有 tracking 但 coverage 缺失 → 覆盖链列同样不渲染，说明文案区分两种降级', () => {
    const html = renderVerify(fullPayload({ coverage: undefined }))
    expect(html).toContain('data-rtm-cols="4"')
    expect(html).not.toContain('data-cov=')
    expect(html).toContain('覆盖链数据缺失：该列不显示')
    expect(html).not.toContain('RTM 追踪缺失')
  })

  it('同一项命中多个 FR（共享任务）：各 FR 行都算它，裁决控件只在首个 FR 行铺一份', () => {
    const html = renderVerify({
      sheet: {
        version: 1,
        reworkOnly: false,
        generatedAt: T0,
        generatedBy: { kind: 'agent' },
        items: [{
          id: 'v-s1',
          source: { kind: 'task', taskId: 't-share' },
          criterion: '共享任务项（一卡服务两条 FR）',
          howToVerify: 'pnpm test tests/shared',
          evidence: [],
          status: 'pending',
        }],
      },
      // t-share 同时挂在 FR-1 与 FR-2 名下（原型里同一 task 出现在多行即此形态）
      frMap: { fr_to_tasks: { 'FR-1': ['t-share'], 'FR-2': ['t-share'] } },
    })
    // 成员语义：两行都算它（怎么验 / 状态各算一份）
    expect(mainRowOf(html, 'FR-1')).toContain('pnpm test tests/shared')
    expect(mainRowOf(html, 'FR-2')).toContain('pnpm test tests/shared')
    expect(mainRowOf(html, 'FR-1')).toContain('data-v="pending"')
    expect(mainRowOf(html, 'FR-2')).toContain('data-v="pending"')
    // 控件只铺一份（同名 radio 是一组：两行各铺一份会让人把意见写进没勾中的那行，
    // 提交收集链读勾中那一行的意见框 → 被判「没写」）；行展开里两行各留一份原始项
    expect(countOf(html, 'class="dsh-pm-vitem dsh-pm-rtm-vitem" data-item-id="v-s1"')).toBe(1)
    expect(countOf(html, 'class="dsh-pm-rtm-item" data-item-id="v-s1"')).toBe(2)
    expect(countOf(html, 'name="verdict-v-s1"')).toBe(2) // 一份控件的两枚 radio
    expect(mainRowOf(html, 'FR-1')).toContain('data-item-id="v-s1"')
    expect(mainRowOf(html, 'FR-2')).toContain('该待裁决项的裁决控件在 FR-1 行')
    expect(countOf(html, 'data-action="submit-verdicts"')).toBe(1)
  })

  it('readVerify 脏载荷不炸：null / 裸数组 / 半截对象都归一到可渲染视图', () => {
    for (const dirty of [null, undefined, [], { sheet: 'x', items: {} }, { sheet: { items: [1, 'a', null] } }]) {
      const html = renderVerify(dirty)
      expect(html).toContain('data-panel="verify"')
    }
    // 半截逐项（非对象元素）被守卫滤掉，不抛
    const view = readVerify({ sheet: { version: 1, items: [1, 'a', null, ITEMS[0]] } })
    expect(view.sheet?.items).toHaveLength(1)
  })
})

/* --------------------------------------------------------------- T-2b frMap 模式（D-10 返工） */

/**
 * frMap 模式标本（D-10 返工）：**行键 = FR 号**。
 *   · FR-1 → `t-1`：v-1（通过）+ v-2（待裁决）→ 多子项取最严重「待裁决」+「2 项」计数；
 *   · FR-2 → `t-2`：v-4（不通过）；
 *   · FR-3 → `t-3`：v-5（不可验收 = nv）；
 *   · FR-10 → **只出现在 `fr_to_design`**（设计 ✓ / 任务 ✗ / 测试 ✗）：名下没有逐项 →
 *     「未复核」（禁拿「✅ 通过」冒充）；三张映射键序刻意把 FR-10 写在 FR-1 前，
 *     用来钉「按编号数值升序」而不是字典序（字典序会给 FR-1 < FR-10 < FR-2）。
 * 归不进任何 FR 的：v-3（requirement → REQ-LEVEL 行）、v-6（prototype-compare）、
 * v-7（decision-compare）、以及只有 tracking 没有逐项的 t-999 → 四条「需求级 / 对照项」行。
 */
const FR_MAP: NonNullable<VerifyPanelResponse['frMap']> = {
  fr_to_design: {
    'FR-10': ['design/frontend.md#收尾'],
    'FR-1': ['design/frontend.md#头部三层'],
    'FR-2': ['design/frontend.md#状态带'],
    'FR-3': ['design/frontend.md#评论区'],
  },
  fr_to_tasks: { 'FR-1': ['t-1'], 'FR-2': ['t-2'], 'FR-3': ['t-3'] },
  fr_to_tests: { 'FR-1': ['TC-1'], 'FR-2': ['TC-2'] },
}

const FR_ITEMS: VerificationItem[] = [
  ...ITEMS,
  {
    id: 'v-6',
    source: { kind: 'prototype-compare', prototypePath: 'prototypes/detail.html' },
    criterion: '原型锚点对照',
    evidence: [],
    status: 'passed',
    result: '锚点 8/8 命中',
    resultSource: 'agent',
  },
  {
    id: 'v-7',
    source: { kind: 'decision-compare', decisionIds: ['D-10'] },
    criterion: '裁定对照 D-10',
    evidence: [],
    status: 'failed',
    result: '主视图仍是追溯 id 行',
    resultSource: 'agent',
    opinion: '按 D-10 改为每 FR 一行',
  },
]

const FR_TRACKING: AcceptanceTracking[] = [
  ...TRACKING,
  { acceptance_id: 'a-5', fr_id: 'PROTOTYPE', verification: '锚点对照只能人看', status: 'passed' },
  { acceptance_id: 'a-6', fr_id: 't-999', verification: '孤立追踪行（没有逐项）', status: 'pending' },
]

function frPayload(over: Partial<VerifyPanelResponse> = {}): VerifyPanelResponse {
  return {
    sheet: { ...SHEET, items: FR_ITEMS },
    tracking: FR_TRACKING,
    frMap: FR_MAP,
    ...over,
  }
}

/** 行序（`tr[data-fr="…"]` 在产物里的出现次序）。 */
function rowKeysOf(html: string): string[] {
  return [...html.matchAll(/<tr data-fr="([^"]+)"/g)].map(m => m[1])
}

describe('T-2b · frMap 模式：主表按 FR 成行（D-10 返工口径）', () => {
  it('行键 = FR 号，按 FR 编号数值升序；FR 行之后才是「需求级 / 对照项」行', () => {
    const html = renderVerify(frPayload())
    expect(html).toContain('data-rtm-table="1"')
    expect(html).toContain('data-rtm-cols="5"')
    expect(html).toContain('data-fr-mode="map"')
    // 对照项行的次序 = 首次出现序（tracking 先、逐项后）——不另造排序，审计能对着数据复核
    const expected = ['FR-1', 'FR-2', 'FR-3', 'FR-10', 'REQ-LEVEL', 'PROTOTYPE', 't-999', 'DECISION']
    expect(rowKeysOf(html)).toEqual(expected)
    // 成行的**单点**（列/行两处都从它来）：直接断言 rowsOf 的行键与序，不靠 DOM 反推
    expect(rowsOf(readVerify(frPayload())).map(r => r.key)).toEqual(expected)
    expect(rowsOf(readVerify(frPayload())).map(r => r.kind)).toEqual(['fr', 'fr', 'fr', 'fr', 'aux', 'aux', 'aux', 'aux'])
    // 每行都有主行 + 行展开（数据不丢：一条逐项也没被吞）
    expect(countOf(html, '<tr data-fr="')).toBe(8)
    expect(countOf(html, 'data-fr-detail="')).toBe(8)
    // FR 行：无 data-fr-group（aux 才是对照项）
    expect(mainRowOf(html, 'FR-1')).not.toContain('data-fr-group')
    for (const aux of ['REQ-LEVEL', 'PROTOTYPE', 'DECISION', 't-999']) {
      expect(mainRowOf(html, aux), aux).toContain('data-fr-group="aux"')
    }
  })

  it('覆盖链 chip = 该 FR 在不在三张映射里（三张独立判定，不互相补位）', () => {
    const html = renderVerify(frPayload())
    const fr1 = mainRowOf(html, 'FR-1')
    expect(fr1).toContain('设计 ✓')
    expect(fr1).toContain('任务 ✓')
    expect(fr1).toContain('测试 ✓')
    expect(countOf(fr1, 'data-cov-ok="yes"')).toBe(3)
    // FR-2：设计 ✓ / 任务 ✓ / 测试 ✓（TC-2 在 fr_to_tests 里）
    expect(countOf(mainRowOf(html, 'FR-2'), 'data-cov-ok="no"')).toBe(0)
    // FR-3：只在 fr_to_design / fr_to_tasks → 测试 ✗ 一枚
    const fr3 = mainRowOf(html, 'FR-3')
    expect(fr3).toContain('测试 ✗')
    expect(countOf(fr3, 'data-cov-ok="no"')).toBe(1)
    // FR-10：只在 fr_to_design → 任务 ✗ / 测试 ✗ 两枚
    const fr10 = mainRowOf(html, 'FR-10')
    expect(fr10).toContain('设计 ✓')
    expect(fr10).toContain('任务 ✗')
    expect(fr10).toContain('测试 ✗')
    expect(countOf(fr10, 'data-cov-ok="no"')).toBe(2)
  })

  it('多子项取最严重状态（不通过 > 待裁决 > 未复核 > 通过）+ 状态 chip 后给「N 项」计数', () => {
    const html = renderVerify(frPayload())
    // FR-1 两项（通过 + 待裁决）→ 取最严重「待裁决」，计数 2 项
    const fr1 = mainRowOf(html, 'FR-1')
    expect(fr1).toContain('data-v="pending"')
    expect(fr1).toContain('⏳ 待裁决')
    expect(fr1).toContain('data-item-count="2"')
    expect(fr1).toContain('2 项')
    // FR-2 单项：不通过（失败优先级最高，没被别的项冲淡）
    expect(mainRowOf(html, 'FR-2')).toContain('data-v="fail"')
    expect(mainRowOf(html, 'FR-2')).not.toContain('data-item-count')
    // FR-3 单项全不可验收：nv 单列一态（是否决不是「待裁决」）
    expect(mainRowOf(html, 'FR-3')).toContain('data-v="nv"')
    // FR-10 名下没有逐项 → 「未复核」，不给「✅ 通过」的假读数
    const fr10 = mainRowOf(html, 'FR-10')
    expect(fr10).toContain('data-v="unverified"')
    expect(fr10).toContain('未复核')
    expect(fr10).not.toContain('✅ 通过')
  })

  it('归不进任何 FR 的项另起一组「需求级 / 对照项」行，标注来源且逐项不丢', () => {
    const html = renderVerify(frPayload())
    // 需求级行：来源枚举进 data-source-kind，可读短标签「需求级」
    const reqLevel = mainRowOf(html, 'REQ-LEVEL')
    expect(reqLevel).toContain('data-source-kind="requirement"')
    expect(reqLevel).toContain('需求级')
    expect(reqLevel).toContain('data-v="unverified"') // v-3 unverified
    expect(reqLevel).toContain('无法自验·需人工') // v-3 needsHuman 的琥珀旗
    // 原型对照项 / 裁定对照项：各按 source.kind 标注（对照项没有「FR 链」，覆盖链格如实说）
    expect(mainRowOf(html, 'PROTOTYPE')).toContain('data-source-kind="prototype-compare"')
    expect(mainRowOf(html, 'PROTOTYPE')).toContain('原型对照项')
    expect(mainRowOf(html, 'DECISION')).toContain('data-source-kind="decision-compare"')
    expect(mainRowOf(html, 'DECISION')).toContain('裁定对照项')
    expect(mainRowOf(html, 'REQ-LEVEL')).toContain('不在任何 FR 追溯链里')
    // 逐项进各自组的行展开（requirement 的 humanReason、对照项的实测与证据）
    const aux = detailOf(html, 'REQ-LEVEL')
    expect(aux).toContain('data-item-id="v-3"')
    expect(aux).toContain('data-needs-human="1"')
    expect(aux).toContain('界面视觉判断 agent 跑不了')
    expect(detailOf(html, 'PROTOTYPE')).toContain('data-item-id="v-6"')
    const dec = detailOf(html, 'DECISION')
    expect(dec).toContain('data-item-id="v-7"')
    expect(dec).toContain('主视图仍是追溯 id 行') // 实际结果原文
    expect(dec).toContain('按 D-10 改为每 FR 一行') // 意见原文
    // 只有 tracking、没有逐项的孤立追溯键也保留一行（不丢），并如实说没有逐项
    const orphan = mainRowOf(html, 't-999')
    expect(orphan).toContain('data-v="pending"')
    expect(detailOf(html, 't-999')).toContain('没有逐项可铺')
  })

  it('汇总行口径与行集合一致（FR 行 + 对照项行逐行计入）', () => {
    const html = renderVerify(frPayload())
    // 8 行：FR-2 不通过 + DECISION 不通过 = 2；FR-1/FR-10/REQ-LEVEL/t-999 = 4 待裁决；
    // 余下 2 行（FR-3 全不可验收 + PROTOTYPE 通过）不在这两类里 → 2/8
    expect(html).toContain('data-rtm-progress="1"')
    expect(html).toContain('<b>2/8</b> 通过')
    expect(html).toContain('<b>4</b> 待裁决')
    expect(html).toContain('<b>2</b> 不通过')
    expect(html).toContain('其中需求级 / 对照项 <b>4</b> 行')
    // 行集合 = 主行数（tr[data-fr]）——三数不重不漏地覆盖它
    expect(countOf(html, '<tr data-fr="')).toBe(8)
  })

  it('无 frMap → 退回逐项平铺（行键 = 追溯 id，覆盖链列取 coverage）：降级路径零变化', () => {
    const html = renderVerify({ sheet: { ...SHEET, items: FR_ITEMS }, tracking: FR_TRACKING, coverage: COVERAGE })
    expect(html).toContain('data-fr-mode="trace"')
    expect(html).not.toContain('data-fr="FR-1"')
    expect(rowKeysOf(html)).toEqual(['t-1', 'REQ-LEVEL', 't-2', 't-3', 'PROTOTYPE', 't-999', 'DECISION'])
    expect(mainRowOf(html, 't-1')).toContain('设计 ✓') // 覆盖链走 coverage（老口径）
  })

  it('frMap 脏载荷归一：非数组值 / 全空三张映射都当「无 frMap」（不炸、不画空 FR 表）', () => {
    const dirty = renderVerify(frPayload({ frMap: { fr_to_design: 'x', fr_to_tasks: { 'FR-1': 1 }, fr_to_tests: {} } as never }))
    expect(dirty).toContain('data-fr-mode="trace"') // 三张都没留下可用映射 → 降级
    const view = readVerify({ sheet: { version: 1, items: ITEMS }, frMap: { fr_to_tasks: { 'FR-1': ['t-1', 7, null] } } })
    expect(view.frMap).toEqual({ fr_to_tasks: { 'FR-1': ['t-1'] } })
    // 键在、值为空数组 = 「该 FR 在这张映射里挂了零个成员」的如实读数（保留，chip 给 ✓）
    const kept = readVerify({ sheet: { version: 1, items: ITEMS }, frMap: { fr_to_tests: { 'FR-1': [] } } })
    expect(kept.frMap).toEqual({ fr_to_tests: { 'FR-1': [] } })
  })
})

/* ------------------------------------------------- T-2c FR 名称（D-10 返工） */

/**
 * FR 列 = `FR-N`（等宽）+ **名称**（原型 `#tab-verify` 同态；D-10 返工补名称那一半）。
 *
 * 判据三条：
 *  ① 载荷有 `frNames` → FR 行里名称**可见**（且带 `data-fr-name` 机器锚 + `title`）；
 *  ② 载荷没有 / 该 FR 不在表里 → **只留编号**（一个名称都不许编出来）；
 *  ③ 名称只挂 FR 行（对照项行的行键是追溯 id，不是 FR 号）。
 */
describe('T-2c · FR 名称（D-10 返工）：有 frNames 才渲染名称，缺省只留编号', () => {
  const FR_NAMES: NonNullable<VerifyPanelResponse['frNames']> = {
    'FR-1': '头部信息分层与操作区聚类',
    'FR-2': '状态带三格视觉权重',
  }

  it('有 frNames → FR 格 = 编号 + 名称（名称可见、带 data-fr-name 与 title）', () => {
    const html = renderVerify(frPayload({ frNames: FR_NAMES }))
    const fr1 = mainRowOf(html, 'FR-1')
    expect(fr1).toContain('<span class="dsh-pm-rtm-fr-id">FR-1</span>') // 编号仍在（等宽主标识）
    expect(fr1).toContain('data-fr-name="头部信息分层与操作区聚类"')
    expect(fr1).toContain('>头部信息分层与操作区聚类</span>') // 可见文本，不只塞进属性
    expect(fr1).toContain('title="头部信息分层与操作区聚类"')
    // 表里只给有名称的两条挂名称（FR-3 / FR-10 没有 → 只有编号）
    expect(mainRowOf(html, 'FR-2')).toContain('data-fr-name="状态带三格视觉权重"')
    const fr3 = mainRowOf(html, 'FR-3')
    expect(fr3).toContain('<span class="dsh-pm-rtm-fr-id">FR-3</span>')
    expect(fr3).not.toContain('data-fr-name')
    expect(mainRowOf(html, 'FR-10')).not.toContain('data-fr-name')
  })

  it('无 frNames（服务端没解析出）→ FR 格只留编号：不编名称、行/列结构不变', () => {
    const html = renderVerify(frPayload())
    expect(html).not.toContain('data-fr-name')
    for (const fr of ['FR-1', 'FR-2', 'FR-3', 'FR-10']) {
      const row = mainRowOf(html, fr)
      expect(row, fr).toContain('<span class="dsh-pm-rtm-fr-id">' + fr + '</span>')
      expect(row, fr).toContain('dsh-pm-rtm-toggle')
    }
    // 行数 / 列数 / 面板结构零变化（只多了一个"没有名称"的缺省）
    expect(countOf(html, '<tr data-fr="')).toBe(8)
    expect(html).toContain('data-rtm-cols="5"')
  })

  it('名称只挂 FR 行：对照项行的行键是追溯 id，不挂名称（frNames 里塞了也不上）', () => {
    const html = renderVerify(frPayload({
      frNames: { ...FR_NAMES, 'REQ-LEVEL': '不该出现的名称' },
    }))
    const aux = mainRowOf(html, 'REQ-LEVEL')
    expect(aux).toContain('data-fr-group="aux"')
    expect(aux).not.toContain('data-fr-name')
    expect(html).not.toContain('不该出现的名称')
  })

  it('frNames 脏载荷归一：非字符串 / 空串丢掉，全丢 → 缺省；名称 HTML 转义', () => {
    const view = readVerify({ sheet: { version: 1, items: ITEMS }, frNames: { 'FR-1': ' 甲 ', 'FR-2': '', 'FR-3': 42, 'FR-4': null } })
    expect(view.frNames).toEqual({ 'FR-1': '甲' }) // 两侧空白剪掉，脏值不放大
    expect(readVerify({ sheet: { version: 1, items: ITEMS }, frNames: { 'FR-1': '  ' } }).frNames).toBeUndefined()
    expect(readVerify({ sheet: { version: 1, items: ITEMS }, frNames: 'x' }).frNames).toBeUndefined()
    // 名称是**文本**，不是 HTML（脏名称里的标签被转义，不变成真元素）
    const html = renderVerify(frPayload({ frNames: { 'FR-1': '<b>注入</b>' } }))
    expect(mainRowOf(html, 'FR-1')).toContain('&lt;b&gt;注入&lt;/b&gt;')
  })
})

/* --------------------------------------------------------------- T-3 空态两分支 */

describe('T-3 · 空态两分支（都不画 table）', () => {
  it('无 sheet → 「尚未提交」解释性空态：没交 / 找谁交 / 交了会看到什么', () => {
    const html = renderVerify({})
    expect(html).toContain('data-verify-empty="1"')
    expect(html).toContain('尚未提交验收材料')
    expect(html).toContain('reqboard_submit(kind=verification)')
    expect(html).not.toContain('<table') // 不画空表格
    expect(html).not.toContain('data-rtm-table')
    // 历史节仍在（列表不是表格），材料节在无 sheet 且无 materials 时不渲染
    expect(html).toContain('data-verify-history="1"')
    expect(html).toContain('无历史版本')
    expect(html).not.toContain('data-verify-materials')
  })

  it('sheet 存在但 items 为空 → 「没有逐项」空态，同样不画 table', () => {
    const html = renderVerify({ sheet: { version: 1, reworkOnly: false, generatedAt: T0, items: [] } })
    expect(html).toContain('data-verify-empty="1"')
    expect(html).toContain('没有逐项')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('data-rtm-table')
    // 材料节如实说"服务端未给材料摘要"（不留白、也不编）
    expect(html).toContain('data-verify-materials="1"')
    expect(html).toContain('服务端未给材料摘要')
  })
})

/* --------------------------------------------------------------- T-4 行展开 */

describe('T-4 · 行展开（逐项实际结果 / 需人工+原因 / 证据）', () => {
  it('data-fr-detail 内含逐项：结果（含来源标注）/ needsHuman+humanReason / 证据清单', () => {
    const html = renderVerify(fullPayload())
    const t1 = detailOf(html, 't-1')
    expect(t1).toContain('data-item-id="v-1"')
    expect(t1).toContain('三层结构断言 9 项通过') // 实际结果原文
    expect(t1).toContain('agent 实测') // 结果来源标注
    expect(t1).toContain('verification/shot-head.png') // 证据逐条铺开
    expect(t1).toContain('task t-1') // 来源标可读文本
    expect(t1).toContain('data-source-kind="task"') // 原始枚举（审计认它）
    const reqLevel = detailOf(html, 'REQ-LEVEL')
    expect(reqLevel).toContain('data-item-id="v-3"')
    expect(reqLevel).toContain('data-needs-human="1"')
    expect(reqLevel).toContain('无法自验·需人工')
    expect(reqLevel).toContain('界面视觉判断 agent 跑不了') // humanReason 原文
    expect(reqLevel).toContain('尚无实测结果') // 没结果要明说，不留白
    expect(reqLevel).toContain('未提供证据') // 证据空也明说
  })

  it('待裁决项渲染既有收集链控件（通过/不通过 + 意见输入），已裁决项渲染留痕行', () => {
    const html = renderVerify(fullPayload())
    // pending / unverified 两项：单选 + 意见输入（board-mount submit-verdicts 收集链同构）
    expect(html).toContain('name="verdict-v-2"')
    expect(html).toContain('name="verdict-v-3"')
    expect(countOf(html, 'data-action="submit-verdicts"')).toBe(1)
    expect(html).toContain('data-version="2"')
    // needsHuman 项不预填（判定依据在人眼里）；有 agent 结果的项预填原文
    const v3Control = html.slice(html.indexOf('<div class="dsh-pm-vitem dsh-pm-rtm-vitem" data-item-id="v-3"'))
    expect(v3Control).toContain('未自动验证：请写你看到的界面事实')
    const v2Control = html.slice(html.indexOf('<div class="dsh-pm-vitem dsh-pm-rtm-vitem" data-item-id="v-2"'))
    expect(v2Control).toContain('is-prefilled')
    // 已裁决三项：时间 + 人 + 意见留痕
    expect(html).toContain('三层结构与设计一致')
    expect(html).toContain('退回 t-2 返工')
  })

  it('not_verifiable 不算「待裁决」（isFullyDecided 同口径）：无裁决控件、计数只含 pending+unverified', () => {
    const html = renderVerify(fullPayload())
    expect(html).not.toContain('name="verdict-v-5"') // nv 项不给「通过/不通过」控件
    expect(html).toContain('data-pending-count="2"') // 2 = pending(v-2) + unverified(v-3)，不含 v-5
    expect(html).toContain('待裁决 2 项')
    expect(html).toContain('依赖服务未上线，无法按要求验') // nv 项的处置意见仍在留痕里
  })
})

/* --------------------------------------------------------------- T-5 徽标口径 */

describe('T-5 · 徽标 = 服务端待裁决计数（禁 0 冒充）', () => {
  it('badge 只读 tabCounts.verify：有值渲染、缺省不渲染、0 不渲染', () => {
    expect(verifyPanel.badge({ tabCounts: { verify: '2' } } as ReportResponse)).toBe('2')
    expect(verifyPanel.badge({ tabCounts: {} } as ReportResponse)).toBeUndefined()
    expect(verifyPanel.badge(undefined)).toBeUndefined()
    const withCount = buildTabBar({ tabCounts: { verify: '2' } } as ReportResponse, 'trunk')
    expect(withCount).toContain('data-badge-verify="1"')
    expect(withCount).toContain('data-badge="verify">2<')
    const withZero = buildTabBar({ tabCounts: { verify: '0' } } as ReportResponse, 'trunk')
    expect(withZero).not.toContain('data-badge-verify')
    expect(withZero).not.toContain('data-badge="verify"')
    expect(buildTabBar(undefined, 'trunk')).not.toContain('data-badge-verify')
  })

  it('面板「待裁决 N 项」直接铺服务端 pendingCount（前端不另数一遍）', () => {
    // 同一份逐项、服务端数成 5：页面照铺 5（口径单点在服务端 tabCounts/pendingCount）
    const html = renderVerify(fullPayload({ pendingCount: 5 }))
    expect(html).toContain('data-pending-count="5"')
    expect(html).toContain('待裁决 5 项')
    // pendingCount 缺省 → 不渲染计数 chip（禁 0/缺省冒充）
    expect(renderVerify(fullPayload({ pendingCount: undefined }))).not.toContain('data-pending-count')
  })
})

/* --------------------------------------------------------------- 材料 / 历史（面板六段的另外两段） */

describe('材料与历史（RTM 表之外的两段）', () => {
  it('材料节：交付结论 + 证据清单逐条；历史节：每版本一行带主导状态与计数', () => {
    const html = renderVerify(fullPayload())
    expect(html).toContain('data-verify-materials="1"')
    expect(html).toContain('首屏四区 + 七个 Tab 全部落地')
    expect(html).toContain('data-verify-evidence="1"')
    expect(html).toContain('pnpm test → 42 passed')
    expect(html).toContain('data-verify-history="1"')
    expect(html).toContain('data-history-version="1"')
    const hist = html.slice(html.indexOf('data-history-version="1"'))
    expect(hist).toContain('1 通过')
    expect(hist).toContain('1 不通过')
    // 验收单版本 chip + 返工续验口径
    expect(html).toContain('data-sheet-version="2"')
    expect(html).toContain('返工续验只含未过项')
  })
})

/* --------------------------------------------------------------- T-6 docs 迁移指引 */

describe('T-6 · docs 面板：核验节已独立为「验收」Tab（迁移指引条可切）', () => {
  const renderDocs = (data: unknown): string => docsPanel.render(data, CTX)
  const DOCS_PAYLOAD: DocsResponse = {
    documents: [],
    generated: [],
    gates: [],
    // 载荷里**带**验收单也要不画表（T-22 兼容：字段保留，面板不消费）
    verification: { version: 2, items: ITEMS, generatedAt: T0, generatedBy: { kind: 'agent' } },
  }

  it('docs 面板无 data-verify-table / data-doc-section="verification" / data-verify-row', () => {
    const html = renderDocs(DOCS_PAYLOAD)
    expect(html).toContain('data-panel="docs"')
    expect(html).not.toContain('data-verify-table')
    expect(html).not.toContain('data-doc-section="verification"')
    expect(countOf(html, 'data-verify-row="1"')).toBe(0)
  })

  it('原位是迁移指引条：文案 + 既有 switch-tab 通道可切「验收」', () => {
    const html = renderDocs(DOCS_PAYLOAD)
    expect(html).toContain('data-verify-moved="1"')
    expect(html).toContain('已独立为「验收」Tab')
    const bar = html.slice(html.indexOf('data-verify-moved="1"'), html.indexOf('data-doc-section="gates"'))
    expect(bar).toContain('data-action="switch-tab" data-tab="verify"')
  })

  it('没有验收单载荷时同样是指引条（不画空表格、不留白）', () => {
    const html = renderDocs({ documents: [], generated: [], gates: [] })
    expect(html).toContain('data-verify-moved="1"')
    expect(html).not.toContain('data-verify-table')
    expect(html).not.toContain('<table class="dsh-pm-docs-table" data-verify-table')
  })
})

/* --------------------------------------------------------------- renderRtmTable 单测（导出函数的边界） */

describe('renderRtmTable 边界（空 sheet / 空逐项 → 空串，由面板走空态）', () => {
  it('sheet 缺省或逐项为空 → 返回空串（不画空表格，纪律⑥）', () => {
    expect(renderRtmTable(readVerify({}), REQ)).toBe('')
    expect(renderRtmTable(readVerify({ sheet: { version: 1, items: [] } }), REQ)).toBe('')
  })

  it('验收单版本号缺失（台账脏数据）→ 不渲染提交按钮、如实说明（纪律④：不给假按钮）', () => {
    const html = renderVerify(fullPayload({
      sheet: { reworkOnly: false, generatedAt: T0, items: ITEMS } as VerifyPanelResponse['sheet'],
    }))
    expect(html).not.toContain('data-action="submit-verdicts"')
    expect(html).toContain('验收单版本号缺失')
    expect(html).toContain('reqboard_accept_sheet') // 给出路，不装死
  })
})
