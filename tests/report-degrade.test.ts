// serves: FR-3, FR-4, FR-11, FR-12
/**
 * 渲染断言 · **架构与降级**（REQ-261004222448-292a · 任务卡 t-cbc2f6）。
 *
 * 与 `tests/report-shell.test.ts`（壳卡 t-ab048e，覆盖壳的六条验收）**分工不同**：
 * 那边钉的是"壳自己怎么取数/怎么分段"，这边钉的是**跨模块的架构级不变量**与**降级诚实性**
 * ——判据全部落在"产物字符串里有没有某样东西"与"请求计数是多少"，一条都不能靠读代码领悟。
 *
 * 环境：vitest node（本包**不含 jsdom**）。client 一律「纯函数 → HTML 字符串」，
 * 所以断言 = 字符串断言 + 注入桩的请求计数；**不起 HTTP 服务、不引新依赖**
 * （同 `report-shell.test.ts` / `tests/docs-panel.test.ts` 的纪律）。
 *
 * T- 编号对应（逐条见 `design/test-cases.md`）：
 *   T-1 首屏 2 个请求且不含正文 · T-2 切到才请求 · T-3 未激活面板不在产物里 · T-4 无内层滚动
 *   T-5 列表铺开（不截断） · T-7 分页条与游标 · T-8 角标来自服务端计数
 *   T-15 端口未装配 · T-16 文件缺失 · T-17 token 三态 · T-18 旧留痕不默认投递 · T-19 禁 0 冒充
 * （T-6 局部更新保态与 T-7 的"取更早"合并属壳卡，已由 `report-shell.test.ts` 覆盖，见交付答复的对应表。）
 *
 * 反例纪律：凡"不许出现"的东西，本文件都**真喂进去**再断言它不出现，并配一条阳性对照
 * （证明探测器是活的），避免"因为根本没有所以通过"的假绿。
 *
 * @module dsh-pmboard/tests/report-degrade
 */
import { describe, it, expect } from 'vitest'
import type {
  Degrade, ReportAction, ReportGap, ReportResponse, RequirementStatus,
} from '../src/shared/protocol.ts'
import {
  REPORT_TAB_KEYS, buildReportCompact, buildReportShell, createReportShell,
  type ReportTabKey,
} from '../src/client/views/report-tabs.ts'

const REQ_ID = 'REQ-261004222448-292a'
const T0 = 1_700_000_000_000

/** 七个同级 Tab（顺序即壳的注册序；不手抄一份，避免哪天注册表改了这里悄悄脱节）。 */
const TABS: readonly ReportTabKey[] = REPORT_TAB_KEYS

/** 计数出现次数（"恰好一条"比 `toContain` 更能抓住重复渲染）。 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

/** 空转几拍微任务（取数链在微任务里成交；同 report-shell 的做法）。 */
async function tick(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

/**
 * 「把未知说成 0」的机械判据（T-19）。
 *
 * 为什么不是"产物里不准出现 0"：页面本来就该显示**真数**（`10 条`、`REQ-261004154937-2ca3`
 * 这类编号），一刀切会得到一条天天误报的断言。这里只抓**把不可得说成计数**的写法：
 *  - `>0<`：零值单元格（"库存 0"式表格）；
 *  - `0 条 / 0 份 / 0 项 / 0 次 / 0 个`：带量词的零计数。
 * 前置 `(?<![\d])` 防 `10 条` 被误判（那 0 是十位上的）。
 */
function zeroLies(html: string): string[] {
  const hits: string[] = []
  const patterns: readonly RegExp[] = [/>\s*0\s*</g, /(?<![\d])0\s*(?:条|份|项|次|个)/g]
  for (const p of patterns) for (const m of html.matchAll(p)) hits.push(m[0])
  return hits
}

/* --------------------------------------------------------------- 标本 */

/** 在途标本（实施中：有操作条、有窗口跳转、有缺口）。 */
function makeReport(opts: {
  status?: RequirementStatus
  actions?: ReportAction[]
  gaps?: ReportGap[]
  waitingHuman?: number
  tabCounts?: ReportResponse['tabCounts']
} = {}): ReportResponse {
  const gaps = opts.gaps ?? [
    { severity: 'red', what: 'FR-5 未被任何任务接收', why: '没有任务卡引用它', ref: { kind: 'clause', id: 'FR-5' } },
    { severity: 'yellow', what: '设计 v2 待人工确认', why: '挂起确认未作答', ref: { kind: 'confirm', id: 'design' } },
  ]
  return {
    head: {
      id: REQ_ID,
      title: '需求详情页重构：从证据面改为工作汇报',
      category: 'feature',
      promptDifficulty: 'standard',
      status: opts.status ?? 'implementing',
      blocked: false,
      createdAt: T0 - 86_400_000,
      updatedAt: T0,
      seats: [{ windowKey: 'session-owner-1', role: 'owner', joinedAt: T0 - 86_400_000 }],
      sessionJump: [{ windowKey: 'session-owner-1', archived: false }],
    },
    progress: {
      stageEnteredAt: T0 - 28 * 60_000,
      stageStayedMs: 28 * 60_000,
      sinceUpdateMs: 2 * 60_000,
      tasks: { total: 11, done: 4, running: 1, todo: 6, subChainDone: 5, subChainTotal: 8 },
    },
    verdictLine: '实施段在跑 w-owner1；' + String(gaps.length) + ' 件事等人',
    waitingHuman: opts.waitingHuman ?? gaps.length,
    gaps,
    actions: opts.actions ?? [
      { key: 'move', label: '→ 验收', to: 'accepting', consequence: '提交验收', humanOnly: false },
      { key: 'cancel', label: '立项取消', consequence: '仅人可操作', humanOnly: true },
    ],
    nextStepForAgent: '批准拆分计划后落库任务卡',
    ...(opts.tabCounts === undefined ? {} : { tabCounts: opts.tabCounts }),
  }
}

/** 写动作通道（`report-head.ts` 的 `ACTION_CHANNEL` 六条 + 评论 + 窗口跳转）——终态一个都不许在。 */
const WRITE_ACTIONS = [
  'move-req', 'plan-approve', 'plan-reject', 'verify-pass', 'verify-rework', 'add-comment', 'jump-session',
] as const

/* ── 正文标记：用来证明"首屏不含正文"这条否定断言不是空转（切过去就能看见它们） ── */
const DOC_BODY = 'DOC-BODY-需求文档全文（只该在点开文档 Tab 时取）'
const PROMPT_BODY = 'PROMPT-BODY-系统提示词正文（只该在切到提示词 Tab 时取）'

const docEntry = (path: string, state: string): Record<string, unknown> =>
  ({ kind: 'requirement', path, registeredAt: T0, state })

/**
 * 面板载荷的宽形状：面板入口收的虽是 `unknown`，但壳的 `data` 参数类型是 `PanelResult<unknown>`
 * ——只有"任意对象"过得了这一关（`unknown` 本身反而不可赋值）。写成窄类型则会挡住
 * "形状不认识"这类反例，所以这里只声明"是个对象"，不声明字段。
 */
type Payload = Record<string, unknown>
const docsPayload = (documents: Array<Record<string, unknown>>): Payload =>
  ({ documents, generated: [], gates: [] })

/** 文档 + 逐项验收单（T-5 与档二阳性对照共用）。 */
const docsWithVerification = (
  documents: Array<Record<string, unknown>>,
  items: Array<Record<string, unknown>>,
): Payload => ({ documents, generated: [], gates: [], verification: { version: 1, items } })

/** 宽形状透传：用于"服务端少给了一段"这类反例载荷（内联字面量直接喂会被 TS 的额外属性检查拦下）。 */
const rawPayload = (v: Record<string, unknown>): Payload => v

const trunkPayload = (): Payload =>
  ({ items: [{ key: 'why', source: ['doc'], summary: ['主干摘要一行'], openRefs: [] }] })

const dagPayload = (): Payload => ({ tasks: [], steps: [] })

const dialoguePayload = (texts: string[], page: Record<string, unknown> = { hasMore: false, total: texts.length }): Payload =>
  ({ items: texts.map((text, i) => ({ kind: 'human', at: T0 + i, text })), page })

const tokenPayload = (over: Record<string, unknown> = {}): Payload =>
  ({ availability: 'full', byStage: [], optimizations: [], ...over })

const promptsPayload = (over: Record<string, unknown> = {}): Payload =>
  ({ system: { sections: [] }, injections: [], context: { available: true, compressions: 0, policy: [], isolations: [] }, ...over })

/** 每个 Tab 一份最小可用载荷（`data-panel` 由面板根无条件输出，故形状不必完美）。 */
function panelPayload(key: ReportTabKey): Payload {
  switch (key) {
    case 'trunk': return trunkPayload()
    case 'docs': return docsPayload([docEntry('docs/requirements/' + REQ_ID + '/requirement.md', 'confirmed')])
    case 'dag': return dagPayload()
    case 'dialogue': return dialoguePayload(['一条人消息'])
    case 'verify': return {}
    case 'token': return tokenPayload()
    case 'prompts': return promptsPayload()
  }
}

/** 取数桩：`calls` 里就是"请求数"（键序 = 发请求的先后）。 */
function harness(opts: { panels?: Partial<Record<ReportTabKey, unknown>> } = {}) {
  const calls: string[] = []
  const shell = createReportShell({
    requirementId: REQ_ID,
    loadReport: () => { calls.push('report'); return Promise.resolve(makeReport()) },
    load: (key) => {
      calls.push(key)
      return Promise.resolve((opts.panels?.[key] ?? panelPayload(key)) as never)
    },
    openDoc: () => { /* 首屏不开正文 */ },
    revision: 1,
  })
  return { calls, shell }
}

/* --------------------------------------------------------------- T-1 / T-2 / T-3 / T-4 */

describe('取数架构 · 首屏与懒加载（FR-11 · T-1 / T-2 / T-3）', () => {
  it('T-1 首屏恰 2 个请求（report + 默认 Tab trunk）：反复 ensure 不放大，且不取正文', async () => {
    const h = harness()
    h.shell.ensure()
    await tick()
    // 视图每次重绘都会无脑调 ensure（幂等）：不得因此多打请求
    h.shell.ensure()
    h.shell.ensure()
    await tick()
    expect(h.calls).toEqual(['report', 'trunk'])
    expect(h.calls.length).toBeLessThanOrEqual(2) // 判据是"≤ 2"
    expect(h.shell.headLoadCount()).toBe(1)
    expect(h.shell.loadCount('trunk')).toBe(1)
    // 首屏不取正文：没有 /file、没有文档正文、没有提示词正文（`<pre>` 是正文块的落点）
    expect(h.calls).not.toContain('file')
    expect(h.shell.html()).not.toContain('<pre')
    expect(h.shell.active()).toBe('trunk')
  })

  it('T-1 反例：把文档正文与提示词正文喂进桩，首屏产物里一个字都不出现（切过去才出现）', async () => {
    const h = harness({
      panels: {
        docs: docsPayload([docEntry(DOC_BODY, 'confirmed')]),
        prompts: promptsPayload({
          system: { sections: [{ id: 's1', kind: 'file', chars: 10, text: PROMPT_BODY }] },
        }),
      },
    })
    h.shell.ensure()
    await tick()
    const first = h.shell.html()
    expect(first).not.toContain(DOC_BODY)
    expect(first).not.toContain(PROMPT_BODY)
    expect(first).not.toContain('<pre')
    expect(h.calls).toEqual(['report', 'trunk'])
    // 阳性对照：这两段正文确实在桩里、切到那个 Tab 就能看见 → 上面的"不出现"不是空转
    h.shell.select('docs')
    await tick()
    expect(h.shell.html()).toContain(DOC_BODY)
    h.shell.select('prompts')
    await tick()
    expect(h.shell.html()).toContain(PROMPT_BODY)
    expect(h.shell.html()).toContain('<pre')
  })

  it('T-2 切 Tab 才请求：未点过的 Tab 请求数 = 0；点到恰好 1 次；同 revision 内切回不新增', async () => {
    const h = harness()
    h.shell.ensure()
    await tick()
    for (const key of ['docs', 'dag', 'dialogue', 'token', 'prompts'] as const) {
      expect(h.shell.loadCount(key), key).toBe(0)
    }
    h.shell.select('dialogue')
    await tick()
    expect(h.shell.loadCount('dialogue')).toBe(1)
    // 反例：切一个 Tab **不许顺手预取**别的 Tab（那正是本需求要修的"一次全取"）
    expect(h.calls).toEqual(['report', 'trunk', 'dialogue'])
    for (const key of ['docs', 'dag', 'token', 'prompts'] as const) {
      expect(h.shell.loadCount(key), key).toBe(0)
    }
    // 同一 revision 内切回：命中内存缓存，一个请求都不多发
    h.shell.select('trunk')
    h.shell.select('dialogue')
    await tick()
    expect(h.calls).toEqual(['report', 'trunk', 'dialogue'])
    expect(h.shell.loadCount('dialogue')).toBe(1)
  })

  it('T-3 未激活面板不在产物里：七个 Tab 轮转，产物里只有当前那一个面板 host', () => {
    for (const active of TABS) {
      const html = buildReportShell(makeReport(), active, { data: panelPayload(active) })
      expect(html, active).toContain('data-tab-host="' + active + '"')
      // `data-panel` 只在**面板根**上（壳的包装器用 `data-tab-host`，不重复输出）
      expect(html, active).toContain('data-panel="' + active + '"')
      for (const other of TABS) {
        if (other === active) continue
        expect(html, active + ' 不应含 ' + other).not.toContain('data-tab-host="' + other + '"')
        expect(html, active + ' 不应含 ' + other).not.toContain('data-panel="' + other + '"')
      }
    }
  })
})

describe('渲染纪律 · 无内层滚动（FR-11 #7 · T-4）', () => {
  it('T-4 整壳产物不出现 overflow: auto|scroll，也不出现 max-height（七个 Tab 全扫）', () => {
    for (const active of TABS) {
      const html = buildReportShell(makeReport(), active, { data: panelPayload(active) })
      expect(html, active).not.toMatch(/overflow:\s*(auto|scroll)/i)
      expect(html, active).not.toContain('max-height')
    }
  })

  it('T-4 探测器自检：内层滚动正则认得出 auto / scroll，且不误伤 hidden（防断言假绿）', () => {
    const hasInnerScroll = (s: string): boolean => /overflow:\s*(auto|scroll)/i.test(s)
    expect(hasInnerScroll('<div style="overflow: auto">')).toBe(true)
    expect(hasInnerScroll('<div style="overflow:scroll">')).toBe(true)
    expect(hasInnerScroll('<div style="overflow: hidden">')).toBe(false)
  })

  it('T-4 / T-5 反例：30 份文档全部铺开（行数不缩水），且仍无内层滚动', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      docEntry('docs/requirements/' + REQ_ID + '/tasks/t-' + String(i).padStart(3, '0') + '.md', 'confirmed'))
    const html = buildReportShell(makeReport(), 'docs', { data: docsPayload(many) })
    // 计数恒等于台账条数：既不截断，也不"折叠成一行"
    expect(countOf(html, 'data-doc-row="1"')).toBe(30)
    // 这条是反例的本体：内容足够长，任何"限高 + 滚动"的实现都会在这里露出来
    expect(html).not.toMatch(/overflow:\s*(auto|scroll)/i)
    expect(html).not.toContain('max-height')
    expect(html).not.toContain('data-doc-truncated')
  })

  it('T-5 列表铺开：文档行数 == 台账文档数（15）；核验逐项已迁「验收」Tab（T-6，REQ-261006130057-7a43 FR-8）', () => {
    const documents = Array.from({ length: 15 }, (_, i) =>
      docEntry('docs/requirements/' + REQ_ID + '/design/d' + String(i) + '.md', i === 14 ? 'file-missing' : 'confirmed'))
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: 'v1-' + String(i + 1), source: { kind: 'requirement' }, criterion: '标准 ' + String(i + 1),
      evidence: [], status: 'pending',
    }))
    const html = buildReportShell(makeReport(), 'docs', { data: docsWithVerification(documents, items) })
    expect(countOf(html, 'data-doc-row="1"')).toBe(15)
    // 核验节独立为「验收」Tab：docs 面板带验收单载荷也不渲染逐项，原位是迁移指引条
    expect(countOf(html, 'data-verify-row="1"')).toBe(0)
    expect(html).toContain('data-verify-moved="1"')
    expect(html).toContain('data-action="switch-tab" data-tab="verify"')
    // 阳性对照（防"因为根本没有所以通过"的假绿）：同一份逐项在「验收」Tab 的 RTM 表里全铺
    const verify = buildReportShell(makeReport(), 'verify', { data: rawPayload({ sheet: { version: 1, items } }) })
    expect(verify).toContain('data-rtm-table="1"')
    for (const id of ['v1-1', 'v1-6', 'v1-12']) expect(verify, id).toContain('data-item-id="' + id + '"')
  })
})

describe('分页与角标（FR-11 #4 / #6 · T-7 / T-8）', () => {
  it('T-7 对话分页：默认一页 20 条全部铺开，游标写进「加载更早」', () => {
    const texts = Array.from({ length: 20 }, (_, i) => '第 ' + String(i + 1) + ' 条')
    const html = buildReportShell(makeReport(), 'dialogue', {
      data: dialoguePayload(texts, { before: 1234, hasMore: true, total: 42 }),
    })
    expect(countOf(html, 'data-msg=')).toBe(20) // 不截断成一行、不折成 N 条
    expect(html).toContain('data-dialogue-loaded="20"')
    expect(html).toContain('data-load-earlier="1"')
    expect(html).toContain('data-before="1234"')
    expect(html).toContain('还有更早的消息未加载') // 服务端说有更早的，页面照说
    expect(html).toContain('已加载 20/42 条') // 服务端总数与服务端计数同源，页面照说
  })

  it('T-8 角标 == 响应里的服务端计数；反例：不拿面板数据条数冒充（也不给 0 角标）', () => {
    const report = makeReport({ tabCounts: { trunk: '7', docs: '15', dag: '12', dialogue: '42' } })
    // 面板里只有 1 份文档：角标若显示 1 就说明是前端遍历算的
    const html = buildReportShell(report, 'docs', { data: docsPayload([docEntry('docs/x.md', 'confirmed')]) })
    expect(html).toContain('data-badge="docs">15<')
    expect(html).not.toContain('data-badge="docs">1<')
    expect(html).toContain('data-badge="trunk">7<')
    expect(html).toContain('data-badge="dag">12<')
    expect(html).toContain('data-badge="dialogue">42<')
    // 服务端没给计数的 Tab：**不渲染角标**（不是渲染 0）
    expect(html).not.toContain('data-badge="token"')
    expect(html).not.toContain('data-badge="prompts"')
    // 整字段缺失（旧服务端）→ 六个角标一个都没有，绝不写 '0'
    const none = buildReportShell(makeReport(), 'trunk', { data: trunkPayload() })
    expect(none).not.toContain('data-badge=')
    expect(zeroLies(none)).toEqual([])
    // 服务端**给了**计数但数出来是 0（空需求的 DAG / Token）：也不渲染角标。
    // 线上实测过这一支：渲染成「DAG 0」「Token 0」，与权威原型不一致（原型标本是非零值，
    // 从来不出现 0 角标）——这正是本模块注释里那句「更不显示 0」。
    const zeros = buildReportShell(
      makeReport({ tabCounts: { docs: '1', dag: '0', token: '0', trunk: '0.0M' } }),
      'trunk', { data: trunkPayload() },
    )
    expect(zeros).toContain('data-badge="docs">1<')   // 非零照常显示
    expect(zeros).not.toContain('data-badge="dag"')
    expect(zeros).not.toContain('data-badge="token"')
    expect(zeros).not.toContain('data-badge="trunk"')
    expect(zeroLies(zeros)).toEqual([])
    // 非数字串（读不到 / 未知）**不当作零**：照常显示，不用 0 冒充未知。
    const unknown = buildReportShell(makeReport({ tabCounts: { dag: '—' } }), 'trunk', { data: trunkPayload() })
    expect(unknown).toContain('data-badge="dag">—<')
  })
})

/* --------------------------------------------------------------- T-15 ~ T-19 */

/** 四种降级各配一句**各不相同**的 note：文案若被混成一句通用话，这里就会露馅。 */
const REASON_NOTE: Record<Degrade['reason'], string> = {
  'port-unavailable': '端口没接上（服务端未装配该端口）',
  'file-missing': '登记的那份文件在磁盘上找不到',
  'ledger-unreadable': '台账分片读不到',
  'no-snapshot': '那次执行没留下 token 快照',
}

const DEGRADE_CASES: ReadonlyArray<{ reason: Degrade['reason']; keyword: string }> = [
  { reason: 'port-unavailable', keyword: '端口未装配' },
  { reason: 'file-missing', keyword: '文件缺失' },
  { reason: 'ledger-unreadable', keyword: '台账读不到' },
  { reason: 'no-snapshot', keyword: '无 token 快照' },
]

const degradeOf = (reason: Degrade['reason']): Degrade =>
  ({ available: false, reason, note: REASON_NOTE[reason] })

/** 从产物里抠出降级条那句话（`data-panel-degraded="<reason>">文案</div>`）。 */
function degradeTextOf(html: string): string {
  const m = /data-panel-degraded="[^"]*">([^<]*)</.exec(html)
  return m === null ? '' : m[1]
}

describe('降级与诚实空态（FR-12 · T-15 / T-16 / T-17 / T-18 / T-19）', () => {
  it('T-15 四种 reason 各喂一次：文案互不相同、各含自己的关键词，且 reason 原样带出', () => {
    const texts = DEGRADE_CASES.map(({ reason, keyword }) => {
      const html = buildReportShell(makeReport(), 'docs', { data: degradeOf(reason) })
      expect(html, reason).toContain('data-panel-degraded="' + reason + '"') // reason 不被吞掉/改写
      expect(html, reason).toContain(REASON_NOTE[reason])                    // 服务端的 note 原样展示
      const text = degradeTextOf(html)
      expect(text, reason).toContain(keyword)
      return text
    })
    // 四句必须互不相同：否则"各有独立文案"就是一句通用话换了四个壳
    expect(new Set(texts).size).toBe(4)
  })

  it('T-16 文档登记但文件不在：路径划线 + 「文件缺失」+ 不给可点假出口（反例：正常行不划线）', () => {
    const missing = 'docs/requirements/' + REQ_ID + '/tasks/t-003.md'
    const ok = 'docs/requirements/' + REQ_ID + '/requirement.md'
    const html = buildReportShell(makeReport(), 'docs', {
      data: docsPayload([docEntry(ok, 'confirmed'), docEntry(missing, 'file-missing')]),
    })
    const missingRow = rowOf(html, 'file-missing')
    expect(missingRow).not.toBe('')
    expect(missingRow).toContain('data-file-missing="1"')
    expect(missingRow).toContain('is-missing')
    expect(missingRow).toContain('text-decoration: line-through') // 划线是字符串级判据，不靠样式表
    expect(missingRow).toContain('文件缺失')
    expect(missingRow).toContain('disabled')
    expect(missingRow).not.toContain('点开正文') // 没有正文可读 → 不留"点了没反应"的假出口
    // 反例（阳性对照）：正常行**不许**被连坐划线/禁用，否则"缺失"这层信息就没有区分度
    const okRow = rowOf(html, 'confirmed')
    expect(okRow).toContain('data-open-doc="' + ok + '"')
    expect(okRow).not.toContain('line-through')
    expect(okRow).not.toContain('disabled')
    expect(okRow).toContain('已确认')
  })

  it('T-17 无 token 快照 → 「无 token 快照」且不画零值表；partial → 「部分数据（下界）」并列出缺哪段', () => {
    const none = buildReportShell(makeReport(), 'token', { data: tokenPayload({ availability: 'none' }) })
    expect(none).toContain('无 token 快照')
    expect(none).toContain('data-availability-badge="none"')
    expect(none).toContain('data-token-none="1"')
    expect(none).not.toContain('data-stage-table="1"') // 不画表 = 没有一堆 0
    expect(zeroLies(none)).toEqual([])

    const partial = buildReportShell(makeReport(), 'token', {
      data: tokenPayload({ availability: 'partial', missingStages: ['implementing'], boundsAreLowerBound: true }),
    })
    expect(partial).toContain('data-availability-badge="partial"')
    const badge = /data-availability-badge="partial">([^<]*)</.exec(partial)
    expect(badge).not.toBeNull()
    expect(badge![1]).toContain('部分数据（下界）')
    expect(badge![1]).toContain('实施') // 缺的那一段必须列出来，否则"下界"说不清缺在哪
  })

  it('T-18 旧留痕缺新字段：来源未知 / 投递不可知；反例：同页在 delivered=true 时才出现「已投递」', () => {
    const legacy = {
      at: T0, windowKey: 'session-legacy-1', origin: 'unknown', delivered: null,
      fragmentIds: ['legacy/frag'], charCount: 12, trimmed: [], text: '旧条目正文',
    }
    const legacyHtml = buildReportShell(makeReport(), 'prompts', {
      data: promptsPayload({ injections: [legacy] }),
    })
    expect(legacyHtml).toContain('data-origin="unknown"')
    expect(legacyHtml).toContain('data-delivered="unknown"')
    expect(legacyHtml).toContain('来源未知')
    // 后果文案必须**自己说明不可知**（"不当作投递成功"是这句里的否定，不是页面的结论）
    expect(legacyHtml).toContain('投递不可知（旧条目缺该字段，不当作投递成功）')
    expect(legacyHtml).not.toContain('已投递') // 不许把"不可知"读成"投递成功"

    // 阳性对照：同一位置在 delivered=true 时**确实**会写「已投递」→ 上面的"不出现"不是空转
    const deliveredHtml = buildReportShell(makeReport(), 'prompts', {
      data: promptsPayload({ injections: [{ ...legacy, origin: 'gate-h3', delivered: true }] }),
    })
    expect(deliveredHtml).toContain('已投递进会话')
    expect(deliveredHtml).toContain('闸门 H3')
    expect(deliveredHtml).not.toContain('投递不可知')
  })

  it('T-19 反例总断言：读不到 = 说读不到，任何位置都不用 0 冒充「未知 / 未采集」', () => {
    // 先自检探测器（否则"没抓到 0"可能只是正则写错了）
    expect(zeroLies('<td class="x">0 条</td>')).toContain('0 条')
    expect(zeroLies('合计 10 条')).toEqual([]) // 十位上的 0 不算

    const cases: ReadonlyArray<[string, string]> = [
      ...DEGRADE_CASES.map(({ reason }) =>
        [reason, buildReportShell(makeReport(), 'docs', { data: degradeOf(reason) })] as [string, string]),
      ['token-no-snapshot', buildReportShell(makeReport(), 'token', { data: tokenPayload({ availability: 'none' }) })],
      ['prompts-context-unavailable', buildReportShell(makeReport(), 'prompts', {
        data: promptsPayload({ context: { available: false, compressions: 0, policy: [], isolations: [] } }),
      })],
      ['prompts-injections-missing', buildReportShell(makeReport(), 'prompts', {
        // 注入留痕段与上下文段**都没给**（服务端未下发）= 读不到，不是"零次"
        data: rawPayload({ system: { sections: [] } }),
      })],
      ['docs-empty', buildReportShell(makeReport(), 'docs', { data: docsPayload([]) })],
      ['dialogue-shape-unknown', buildReportShell(makeReport(), 'dialogue', { data: rawPayload({ nope: true }) })],
    ]
    for (const [label, html] of cases) {
      expect(zeroLies(html), label).toEqual([])
    }
    // 「未采集」与「确实没有」必须分开说：上下文段不可得时写的是"未采集"，不是"压缩 0 次"
    const ctx = cases.find(([label]) => label === 'prompts-context-unavailable')![1]
    expect(ctx).toContain('未采集')
    expect(ctx).toContain('data-context-unavailable="1"')
  })
})

/** 抠出一行（从该行 `<tr` 起，到它 `</tr>` 为止）——`is-missing` 类名在 `data-doc-state` **之前**，别从属性处切。 */
function rowOf(html: string, state: string): string {
  const at = html.indexOf('data-doc-state="' + state + '"')
  if (at < 0) return ''
  const trStart = html.lastIndexOf('<tr', at)
  const end = html.indexOf('</tr>', at)
  return html.slice(trStart < 0 ? at : trStart, end < 0 ? html.length : end)
}

/* --------------------------------------------------------------- FR-3 / FR-4 / 档二 */

describe('终态只读与缺口口径（FR-3 / FR-4）', () => {
  /**
   * 终态判据（**别照"所有按钮为零"改**）：需求 FR-3 原文是「只留 `← 看板`」，
   * 而 Tab 栏的六个 `data-action="switch-tab"` 是**导航**不是动作。
   * 所以判据是"**写动作**数为零"（`WRITE_ACTIONS` 一个都不在），而不是 `data-action` 总数为零。
   */
  it('FR-3 终态三态（archived / canceled / done）：写动作按钮数 = 0，且 ← 看板仍然保留', () => {
    // 关键：标本里**故意塞满** actions / 席位跳转（服务端若发错，页面也必须拦住）——
    // 判据在渲染侧，不在"上游不发"。
    for (const status of ['archived', 'canceled', 'done'] as const) {
      const html = buildReportShell(makeReport({ status }), 'trunk', { data: trunkPayload() })
      for (const action of WRITE_ACTIONS) {
        expect(html, status + ' 不应有写动作 ' + action).not.toContain('data-action="' + action + '"')
      }
      expect(html, status).not.toContain('data-report-actions="1"')
      expect(html, status).not.toContain('data-report-windows="1"')
      expect(html, status).toContain('data-action="back"')
      expect(html, status).toContain('← 看板')
      // 剩下的 `data-action` 只有「返回 1 + 七个 Tab 切换」= 8（导航，不是动作）
      expect(countOf(html, 'data-action="'), status).toBe(8)
    }
    // 阳性对照：在途态**有**写动作 → 上面的"零"是终态判出来的，不是全局都没有
    // （FR-13 之后头部的评论输入框已真删，故这条对照改用同属在途写通道的窗口跳转）
    const inflight = buildReportShell(makeReport({ status: 'implementing' }), 'trunk', { data: trunkPayload() })
    expect(inflight).toContain('data-action="move-req"')
    expect(inflight).toContain('data-action="jump-session"')
    expect(inflight).not.toContain('data-action="add-comment"')
  })

  it('FR-4 「几件事等人」与缺口条数口径一致：计数徽标 == waitingHuman；「共 N 条」 == gaps.length', () => {
    const gaps: ReportGap[] = [
      { severity: 'red', what: 'A', why: 'a' },
      { severity: 'red', what: 'B', why: 'b' },
      { severity: 'yellow', what: 'C', why: 'c' },
      { severity: 'gray', what: 'D', why: 'd' },
    ]
    const gapCount = 4
    const report = makeReport({ gaps, waitingHuman: gapCount })
    expect(report.gaps.length).toBe(gapCount)
    const html = buildReportShell(report, 'trunk', { data: trunkPayload() })
    const waiting = /data-waiting-human="(\d+)"/.exec(html)
    // REQ-261006130057-7a43 FR-2 / T-13：状态带缺口格的计数徽标**直接渲染 waitingHuman**
    // （与头部一句话结论同一字段，不再据 gaps 另数一遍）——两个数同源，口径不可能漂；
    // gaps 总条数另由「共 N 条」真文本交代。
    const badge = /data-gap-count-badge="(\d+)"/.exec(html)
    const total = /共 (\d+) 条/.exec(html)
    expect(waiting).not.toBeNull()
    expect(badge).not.toBeNull()
    expect(total).not.toBeNull()
    expect(Number(waiting![1])).toBe(gapCount)
    expect(Number(badge![1])).toBe(Number(waiting![1]))
    expect(Number(total![1])).toBe(gapCount)
    expect(zeroLies(html)).toEqual([])
  })
})

describe('档二（会话内面板）· 结构性不含重活（FR-3 密度分档）', () => {
  /** 禁用选择器：文档表 / 验收 RTM 表 / 成本与 Token 表 / 提示词正文。 */
  const HEAVY_SELECTORS = [
    'data-doc-table="1"', 'dsh-pm-docs-table', 'data-rtm-table="1"',
    'data-stage-table="1"', 'dsh-pm-tok-table', 'data-availability-badge', '费用估算',
    'data-prompt-section=', 'data-prompt-merged="1"', '<pre',
  ] as const

  it('档二不含文档表 / 成本 / 提示词正文选择器；反例：同样几块在详情页三档里都在场', () => {
    const compact = buildReportCompact(makeReport())
    expect(compact).toContain('data-report-compact="1"')
    expect(compact).not.toContain('data-report-tabs="1"')
    expect(compact).not.toContain('data-panel')
    for (const sel of HEAVY_SELECTORS) expect(compact, sel).not.toContain(sel)

    // 反例（阳性对照）：这些选择器**不是拼错的死字符串**——同数据在详情页里逐个都能找到，
    // 所以档二的"不含"来自分档结构（档二根本不渲染面板），不是来自写错名字。
    const docs = buildReportShell(makeReport(), 'docs', {
      data: docsWithVerification([docEntry('docs/x.md', 'confirmed')],
        [{ id: 'v1', source: { kind: 'requirement' }, criterion: 'c', evidence: [], status: 'pending' }]),
    })
    expect(docs).toContain('data-doc-table="1"')
    // 核验表已迁「验收」Tab（T-6）：docs 面板只剩迁移指引条；RTM 表的阳性对照在 verify 壳里做
    expect(docs).not.toContain('data-rtm-table="1"')
    expect(docs).toContain('data-verify-moved="1"')
    const verify = buildReportShell(makeReport(), 'verify', {
      data: rawPayload({ sheet: { version: 1, items: [{ id: 'v1', source: { kind: 'requirement' }, criterion: 'c', evidence: [], status: 'pending' }] } }),
    })
    expect(verify).toContain('data-rtm-table="1"')
    const token = buildReportShell(makeReport(), 'token', { data: tokenPayload({ costEstimateCny: 12.5 }) })
    expect(token).toContain('data-stage-table="1"')
    expect(token).toContain('费用估算')
    const prompts = buildReportShell(makeReport(), 'prompts', {
      data: promptsPayload({ system: { sections: [{ id: 's1', kind: 'file', chars: 3, text: '正文' }] } }),
    })
    expect(prompts).toContain('data-prompt-section="s1"')
    expect(prompts).toContain('<pre')
  })
})
