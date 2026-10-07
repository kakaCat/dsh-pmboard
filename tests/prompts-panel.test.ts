/**
 * 「🧱 提示词」面板（REQ-261004222448-292a · t-702b00 / FR-9、FR-12；
 * 验收期返工 D-10/D-11：默认视图与权威原型 `#tab-prompts` 对齐）——纯函数渲染断言。
 *
 * 覆盖（FR-9 判定 + FR-12 诚实空态 + D-10/D-11 原型对齐）：
 *   · A 段：每段带 `data-prompt-section`、行内一行摘要（段名/类型标/字符数/首行），
 *     **默认收起**（无 `open`）且正文 `<pre>` 非空（点开就地铺开 = 能力没删）；
 *     被裁片段 `data-prompt-trimmed` 带「已截断」标**同样给正文**；
 *     装配不可得时是「装配服务不可得」而非「零段」，且**不出现**「装配服务可得」这句副题。
 *   · 「本次完整系统提示词」合并段压成折叠（默认收起，说明留在折叠体内，D-11）。
 *   · 「口径说明」压成折叠（默认收起，标题一行；口径数字与「不是留痕」一字不删，D-11）。
 *   · B 段：`origin=unknown` → 「来源未知」；`delivered=null` → 「投递不可知」且**不得**出现「已投递」；
 *     true/false 各有后果文案；`truncated` → 「已截断」+ `data-truncated="1"`。
 *   · C 段：`available=false` → 「未采集」+ `data-context-unavailable="1"`，**不显示 0 次**。
 *   · 规定 vs 实际并排对照；不出现内层滚动。
 *   · chips 行：routeKey / 命中 / 片段 / 字符 / 估算 + **「已投递进会话」**（只有最近一条留痕
 *     明确 delivered=true 才出；只留痕 / 不可知 / 无留痕都不出——不编）。
 */
import { describe, it, expect } from 'vitest'
import { renderPromptsPanel } from '../src/client/views/panels/prompts.ts'
import { REPORT_TABS, type ReportTabCtx } from '../src/client/views/report-tabs.ts'

const REQ = 'REQ-261004222448-292a'

/** 截取某个 `data-*` 起、到该块 `</details>` 为止的片段（正文断言用）。 */
function detailsBlockOf(html: string, attr: string): string {
  const start = html.indexOf(attr)
  if (start < 0) return ''
  const end = html.indexOf('</details>', start)
  return html.slice(start, end < 0 ? html.length : end + '</details>'.length)
}

/** 某个 `data-*` 所属 `<details>` 的开标签（判「默认收起 / 默认展开」用）。 */
function detailsTagOf(html: string, attr: string): string {
  const i = html.indexOf(attr)
  if (i < 0) return ''
  const start = html.lastIndexOf('<details', i)
  const end = html.indexOf('>', i)
  return start < 0 || end < 0 ? '' : html.slice(start, end + 1)
}

/** chips 行（`data-prompt-chips` 那个 div 的整段内容）——chip 之间的断言都在这条带上做。 */
function chipsStripOf(html: string): string {
  const start = html.indexOf('data-prompt-chips="1"')
  if (start < 0) return ''
  const end = html.indexOf('</div>', start)
  return html.slice(start, end < 0 ? html.length : end)
}

/** `<details data-...>` 块里的 `<pre>` 正文（没有 pre 时返回 undefined）。 */
function preTextOf(block: string): string | undefined {
  const m = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(block)
  return m === null ? undefined : m[1]
}

function fullPayload(): Record<string, unknown> {
  return {
    system: {
      routeKey: 'implementing/expert/v3',
      hitLevel: 'exact',
      perTurnChars: 6240,
      perTurnEstTokens: 1560,
      sections: [
        { id: 'implementing/light', kind: 'file', chars: 2180, text: '## 实施阶段纪律\n- 照卡开工：reqboard_task_move(to=in_progress)' },
        { id: 'common/iron-rules', kind: 'file', chars: 1460, text: '## 本仓铁律\n- 批准闸门永不伸缩' },
        { id: 'capture-section', kind: 'shell', chars: 2080, text: '## 本条需求\n标题：详情页重构' },
      ],
      trimmed: [
        { id: 'common/glossary', chars: 1200, text: '## 术语表（本次未注入）\n- 父卡 / 子卡：dev → review → test' },
      ],
    },
    injections: [
      {
        at: 1700000000000, windowKey: 'session-injection-0001', origin: 'gate-h3', delivered: true,
        routeKey: 'implementing/expert/v3', fragmentIds: ['implementing/light', 'common/iron-rules', 'common/glossary'],
        charCount: 6240, trimmed: ['common/glossary'], text: '照卡开工 · 完工汇报', truncated: false,
      },
    ],
    context: {
      medianUsagePct: 62, compressions: 3, policy: ['replaced', 'skipped'],
      isolations: [
        { at: 1700000000000, stage: 'implementing', status: 'replaced', packageChars: 4200, reason: '上一节点上下文整段替换为输入包' },
        { at: 1700000100000, stage: 'accepting', status: 'skipped', packageChars: 1800, reason: '无需隔离（上下文短）' },
      ],
      available: true,
    },
  }
}

const ctx: ReportTabCtx = { requirementId: REQ, load: () => Promise.resolve({ available: true }), openDoc: () => {} }

describe('提示词面板 · A 段：它被告知了什么 · 本次注入（FR-9 · D-10/D-11）', () => {
  it('根容器带 data-panel="prompts"；三段各有 data-prompt-section，正文 <pre> 非空且**默认收起**', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-panel="prompts"')
    for (const id of ['implementing/light', 'common/iron-rules', 'capture-section']) {
      const block = detailsBlockOf(html, 'data-prompt-section="' + id + '"')
      expect(block, id).not.toBe('')
      const text = preTextOf(block)
      expect(text, id + ' 正文').toBeDefined()
      expect(text!.trim().length, id + ' 正文非空').toBeGreaterThan(0)
      // D-10/D-11：默认视图 = 原型那一行（收起），不是整段 code block 铺开
      expect(detailsTagOf(html, 'data-prompt-section="' + id + '"'), id + ' 默认收起').not.toContain(' open')
      // 能力不删：同一 details 里带「展开 / 收起」双态词，点开就地铺开正文
      expect(block, id + ' 展开词').toContain('data-prompt-expand-toggle="1"')
      expect(block).toContain('展开')
      expect(block).toContain('收起')
    }
    expect(html).toContain('照卡开工')
  })

  it('片段行按原型 .frag 排版：段名（等宽）+ 类型标 + 字符数 + 首行摘要，正文只在展开里', () => {
    const html = renderPromptsPanel(fullPayload())
    const block = detailsBlockOf(html, 'data-prompt-section="implementing/light"')
    expect(block).toContain('<span class="dsh-pm-frag-id">implementing/light</span>')
    expect(block).toContain('<span class="dsh-pm-frag-kind"')
    expect(block).toContain('>文件<')
    expect(block).toContain('>2180 字符<') // 字符数就在行内
    expect(block).toContain('>## 实施阶段纪律<') // 首行摘要（正文第一行）
    // 摘要不是"把正文删了"：整段正文仍在 <pre> 里等展开
    expect(preTextOf(block)).toContain('照卡开工')
    // 路由壳段按原型标 `shell`（不写成"路由壳（多片合成）"那种长说明）
    const shell = detailsBlockOf(html, 'data-prompt-section="capture-section"')
    expect(shell).toContain('<span class="dsh-pm-frag-kind" title="路由壳')
    expect(shell).toContain('>shell<')
  })

  it('副题与底部小字按原型：装配服务可得 · GET …；共 N 个片段同形铺列', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('它被告知了什么 · 本次注入')
    expect(html).toContain('装配服务可得 · 数据来自 GET /requirements/:id/prompts')
    expect(html).toContain('data-prompt-frag-foot="1"')
    expect(html).toContain('共 4 个片段同形铺列') // 3 段 + 1 被裁，一个不省 → 照实说"共"
    expect(html).toContain('被截片段也给正文入口')
  })

  it('被裁片段同样给正文（回答「它为什么不知道某个术语」）且默认收起', () => {
    const html = renderPromptsPanel(fullPayload())
    const block = detailsBlockOf(html, 'data-prompt-trimmed="common/glossary"')
    expect(block).not.toBe('')
    const text = preTextOf(block)
    expect(text).toBeDefined()
    expect(text!).toContain('术语表')
    expect(detailsTagOf(html, 'data-prompt-trimmed="common/glossary"')).not.toContain(' open')
    // 「超预算，未进本次装配」这句说辞收在展开体里；默认视图只留原型那枚「已截断」标
    expect(block).toContain('未进本次装配')
  })

  it('完整系统提示词合并视图在场，且**压成折叠**（默认收起；分隔行说明留在折叠体内）', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-prompt-merged="1"')
    expect(html).toContain('本次完整系统提示词')
    expect(detailsTagOf(html, 'data-prompt-merged="1"')).not.toContain(' open')
    const block = detailsBlockOf(html, 'data-prompt-merged="1"')
    expect(block).toContain('点开看全文')
    expect(block).toContain('── implementing/light ──') // 合并正文仍在（能力不删）
    expect(block).toContain('不在提示词正文里') // 「── 段名 ──」这句说明跟着折叠，不进默认视图
    expect(block).toContain('展开')
  })

  it('口径说明压成默认收起的折叠（D-11）：标题一行、口径与「不是留痕」一字不删', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-prompt-caliber="1"')
    expect(html).toContain('口径说明 · 展开') // 收起态的一行标题
    expect(detailsTagOf(html, 'data-prompt-caliber="1"')).not.toContain(' open')
    // 内容一字不删：装配/裁切/合计/估算/routeKey/命中层级 + 「读时装配、不是留痕」的口径
    const block = detailsBlockOf(html, 'data-prompt-caliber="1"')
    for (const phrase of [
      '本次装配 3 段', '被裁 1 段', '合计 6240 字符', '≈ 1560 tokens（估算）',
      'routeKey implementing/expert/v3', '命中层级 exact',
      '字符数与 token 数是读时装配/估算，不是留痕',
    ]) {
      expect(block, phrase).toContain(phrase)
    }
    // 折叠体走房子的 `.dsh-pm-fold-body`（与 Token 面板的口径说明同一个壳）——
    // 少了它，展开后的说明会贴着折叠框左边框（实测截图 /tmp/prompts-caliber-open.png）
    expect(block).toContain('dsh-pm-fold-body')
  })

  it('装配服务不可得 → 「装配服务不可得」，不是「零段」；且不许出现「装配服务可得」', () => {
    const payload = fullPayload()
    payload.system = { unavailable: true, sections: [], trimmed: [] }
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-system-unavailable="1"')
    expect(html).toContain('装配服务不可得')
    expect(html).toContain('不是「零段」')
    expect(html).not.toContain('装配服务可得') // 副题那半句只在真可得时说
    expect(html).not.toContain('data-prompt-section=')
  })
})

describe('提示词面板 · 规定 vs 实际对照', () => {
  it('并排给出「装配段清单」与「实际留痕片段」+ 差集', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-prompt-spec-vs="1"')
    expect(html).toContain('data-sv="spec"')
    expect(html).toContain('data-sv="actual"')
    expect(html).toContain('data-sv-diff="1"')
    expect(html).toContain('data-spec-section="implementing/light"')
    expect(html).toContain('data-spec-trimmed="common/glossary"')
    // 留痕有 · 规定清单未见：glossary 只在留痕里（装配侧它是「被裁」）
    expect(html).toContain('留痕有 · 规定清单未见')
  })

  it('没有注入留痕时如实说「无法说明规定的有没有真的进会话」', () => {
    const payload = fullPayload()
    payload.injections = []
    const html = renderPromptsPanel(payload)
    expect(html).toContain('没有注入留痕可比')
    expect(html).toContain('data-sv-diff="1"')
  })
})

describe('提示词面板 · B 段：注入留痕的来源与后果（FR-9 / T-18）', () => {
  it('每条留痕带 data-injection / data-origin / data-delivered', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-injection="1"')
    expect(html).toContain('data-origin="gate-h3"')
    expect(html).toContain('data-delivered="true"')
    expect(html).toContain('来源：闸门 H3')
    expect(html).toContain('后果：已投递进会话')
    expect(html).toContain('命中片段')
    expect(html).toContain('字符数：6240')
    expect(html).toContain('被裁片段：common/glossary')
  })

  it('origin=unknown → 「来源未知」（不猜一个来源）', () => {
    const payload = fullPayload()
    payload.injections = [
      { at: 1700000000000, windowKey: 'w1', origin: 'unknown', delivered: null, fragmentIds: [], trimmed: [] },
    ]
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-origin="unknown"')
    expect(html).toContain('来源未知')
  })

  it('delivered=null → 「投递不可知」，且**不得**渲染成「已投递」', () => {
    const payload = fullPayload()
    payload.injections = [
      { at: 1700000000000, windowKey: 'w1', origin: 'dive-node', delivered: null, fragmentIds: ['a/b'], trimmed: [], charCount: 10 },
    ]
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-delivered="unknown"')
    expect(html).toContain('投递不可知')
    expect(html).not.toContain('已投递')
  })

  it('delivered=false → 「只留痕，未投递」（不把只留痕当成已投递）', () => {
    const payload = fullPayload()
    payload.injections = [
      { at: 1700000000000, windowKey: 'w1', origin: 'dive-round', delivered: false, fragmentIds: ['a/b'], trimmed: [], charCount: 10 },
    ]
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-delivered="false"')
    expect(html).toContain('只留痕，未投递')
    expect(html).not.toContain('已投递')
  })

  it('truncated=true → 正文标「已截断」+ data-truncated="1"', () => {
    const payload = fullPayload()
    payload.injections = [
      {
        at: 1700000000000, windowKey: 'w1', origin: 'system-prompt', delivered: true,
        fragmentIds: ['x/y'], trimmed: [], charCount: 9000, text: '很长的正文'.repeat(50), truncated: true,
      },
    ]
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-truncated="1"')
    expect(html).toContain('已截断')
    expect(html).toContain('来源：系统提示词装配')
  })

  it('origin=system-notice → 「来源：尾部注入」（REQ-261007100513-6749 t3；不许回落成「来源未知」）', () => {
    const payload = fullPayload()
    payload.injections = [
      {
        at: 1700000000000, windowKey: 'w1', origin: 'system-notice', delivered: true,
        fragmentIds: [], trimmed: [], charCount: 12, text: '状态行 v1',
      },
    ]
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-origin="system-notice"')
    expect(html).toContain('来源：尾部注入')
    // 容忍性不退化：认不出的取值仍回落「来源未知」（本用例只加这一条新取值，不收紧未知分支）。
    expect(html).not.toContain('来源：unknown')
  })

  it('留痕段缺失（不是空数组）→ 「服务端未给」，不写成「零条」', () => {
    const payload = fullPayload()
    delete payload.injections
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-injections-unavailable="1"')
    expect(html).toContain('不写成「零条」')
  })

  it('留痕段给了但是空数组 → 说「没有记录」且不冒充成因（不写「0 次注入」）', () => {
    const payload = fullPayload()
    payload.injections = []
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-injections-empty="1"')
    expect(html).toContain('没有注入留痕记录')
    expect(html).toContain('本条数据分不出来')
    expect(html).not.toMatch(/0\s*次/)
  })
})

describe('提示词面板 · C 段：上下文（FR-9 / FR-12）', () => {
  it('有数据时给压缩次数、策略与逐条隔离留痕', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-context-available="1"')
    expect(html).toContain('压缩 3 次')
    expect(html).toContain('上文中位 62%')
    expect(html).toContain('替换 1')
    expect(html).toContain('跳过 1')
    expect(html).toContain('data-isolation="1"')
    expect(html).toContain('data-status="replaced"')
    expect(html).toContain('上一节点上下文整段替换为输入包')
  })

  it('available=false → 「未采集」+ data-context-unavailable，**不显示 0 次**', () => {
    const payload = fullPayload()
    payload.context = { compressions: 0, policy: [], isolations: [], available: false }
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-context-unavailable="1"')
    expect(html).toContain('未采集')
    expect(html).not.toMatch(/压缩\s*0\s*次/)
    expect(html).not.toMatch(/节点隔离\s*0\s*次/)
    // C 段整块（从标题到产物末尾）里连一个 0 字符都没有：未知不用 0 表示
    expect(html.slice(html.indexOf('C · 上下文'))).not.toContain('0')
  })
})

describe('提示词面板 · 注入信息 chips 与已截断标（FR-6 · REQ-261006130057-7a43 t8 · D-10）', () => {
  it('注入信息 chips：routeKey / 命中 / 片段数 / 字符数 / 本轮估算 / 已投递进会话', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-prompt-chips="1"')
    const strip = chipsStripOf(html)
    expect(strip).toContain('data-prompt-chip="routeKey"')
    expect(strip).toContain('routeKey <b>implementing/expert/v3</b>')
    expect(strip).toContain('data-prompt-chip="hit"')
    expect(strip).toContain('精确命中（exact）')
    expect(strip).toContain('data-prompt-chip="sections"')
    expect(strip).toContain('片段 <b>3</b>')
    expect(strip).toContain('data-prompt-chip="chars"')
    expect(strip).toContain('字符 <b>6240</b>') // perTurnChars 优先
    expect(strip).toContain('data-prompt-chip="est"')
    expect(strip).toContain('≈ 1560 tok')
    // D-10 补的缺口：装配侧 chips 原来没有投递后果这一项（原型 .info-strip 末枚）
    expect(strip).toContain('data-prompt-chip="delivered"')
    expect(strip).toContain('已投递进会话')
  })

  it('「已投递进会话」只在最近一条留痕明确 delivered=true 时出（只留痕 / 不可知 / 无留痕都不编）', () => {
    for (const delivered of [false, null]) {
      const payload = fullPayload()
      const injections = payload.injections as Array<Record<string, unknown>>
      injections[0].delivered = delivered
      const strip = chipsStripOf(renderPromptsPanel(payload))
      expect(strip, 'delivered=' + String(delivered)).not.toContain('data-prompt-chip="delivered"')
      expect(strip, 'delivered=' + String(delivered)).not.toContain('已投递')
    }
    // 留痕段整个读不到（服务端未给）：chips 行同样不写投递——不把"不可知"读成"投递成功"
    const payload = fullPayload()
    delete payload.injections
    const strip = chipsStripOf(renderPromptsPanel(payload))
    expect(strip).not.toContain('data-prompt-chip="delivered"')
    expect(strip).not.toContain('已投递')
  })

  it('routeKey / hitLevel / 估算缺省时对应 chip 不出现（不留白、不编值）', () => {
    const payload = fullPayload()
    const sys = payload.system as Record<string, unknown>
    delete sys.routeKey
    delete sys.hitLevel
    delete sys.perTurnEstTokens
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-prompt-chips="1"') // 片段数/字符数 chips 仍在
    expect(html).toContain('data-prompt-chip="sections"')
    expect(html).not.toContain('data-prompt-chip="routeKey"')
    expect(html).not.toContain('data-prompt-chip="hit"')
    expect(html).not.toContain('data-prompt-chip="est"')
  })

  it('被裁片段标「已截断」（默认收起，展开里照常给正文）', () => {
    const html = renderPromptsPanel(fullPayload())
    const block = detailsBlockOf(html, 'data-prompt-trimmed="common/glossary"')
    expect(block).toContain('data-prompt-trim-mark="1"')
    expect(block).toContain('已截断')
    expect(detailsTagOf(html, 'data-prompt-trimmed="common/glossary"')).not.toContain(' open')
    // 正文仍在（标的是"没进装配"，不是"没有内容"）
    expect(preTextOf(block)).toContain('术语表')
  })

  it('未见过的命中层级原样显示（不编层级名）', () => {
    const payload = fullPayload()
    ;(payload.system as Record<string, unknown>).hitLevel = '③'
    const html = renderPromptsPanel(payload)
    expect(html).toContain('命中 <b>③</b>')
  })
})

describe('提示词面板 · 形状守卫与滚动纪律', () => {
  it('三段都没有（需求页壳的桩载荷）→ data-panel-placeholder，不把空说成「零条留痕」', () => {
    const html = renderPromptsPanel({ available: true, marker: 'prompts' })
    expect(html).toContain('data-panel="prompts"')
    expect(html).toContain('data-panel-placeholder="prompts"')
    expect(html).not.toContain('data-injection="1"')
  })

  it('无内层滚动：产物里没有 overflow: auto|scroll（正文一律整段铺开，含展开后的正文块）', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).not.toMatch(/overflow:\s*(auto|scroll)/)
    expect(html).not.toMatch(/max-height/)
  })

  it('默认视图一律收起：产物里没有一个带 open 的 details（D-11「多余信息压缩成折叠」）', () => {
    const html = renderPromptsPanel(fullPayload())
    const tags = [...html.matchAll(/<details[^>]*>/g)].map(m => m[0])
    expect(tags.length, '至少要有一个可展开块（片段行 / 合并段 / 留痕正文）').toBeGreaterThan(0)
    for (const tag of tags) expect(tag, tag).not.toContain(' open')
  })

  it('片段源文件只走壳的 data-open-doc 通道（不带 data-action，同一动作只能有一处接）', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-open-doc="packages/web/dsh-pmboard/src/domain/prompt/fragments/implementing/light.md"')
    expect(html).not.toContain('data-action="open-doc"')
    expect(html).not.toContain('data-action=')
  })

  it('面板注册项已接线：REPORT_TABS 里的 prompts.render 就是本面板', () => {
    const def = REPORT_TABS.find(d => d.key === 'prompts')
    expect(def).toBeDefined()
    const html = def!.render(fullPayload(), ctx)
    expect(html).toContain('data-panel="prompts"')
    expect(html).toContain('data-prompt-section="implementing/light"')
  })
})
