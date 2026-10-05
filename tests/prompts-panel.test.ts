/**
 * 「🧱 提示词」面板（REQ-261004222448-292a · t-702b00 / FR-9、FR-12）——纯函数渲染断言。
 *
 * 覆盖（FR-9 判定 + FR-12 诚实空态）：
 *   · A 段：每段带 `data-prompt-section` 且**正文 `<pre>` 非空**（回答「它到底被告知了什么」）；
 *     被裁片段 `data-prompt-trimmed` **同样给正文**；装配不可得时是「装配服务不可得」而非「零段」。
 *   · B 段：`origin=unknown` → 「来源未知」；`delivered=null` → 「投递不可知」且**不得**出现「已投递」；
 *     true/false 各有后果文案；`truncated` → 「已截断」+ `data-truncated="1"`。
 *   · C 段：`available=false` → 「未采集」+ `data-context-unavailable="1"`，**不显示 0 次**。
 *   · 规定 vs 实际并排对照；不出现内层滚动。
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

describe('提示词面板 · A 段：固定系统提示词（FR-9）', () => {
  it('根容器带 data-panel="prompts"；三段各有 data-prompt-section 且正文 <pre> 非空', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-panel="prompts"')
    for (const id of ['implementing/light', 'common/iron-rules', 'capture-section']) {
      const block = detailsBlockOf(html, 'data-prompt-section="' + id + '"')
      expect(block, id).not.toBe('')
      const text = preTextOf(block)
      expect(text, id + ' 正文').toBeDefined()
      expect(text!.trim().length, id + ' 正文非空').toBeGreaterThan(0)
      expect(block).toContain('open>') // 默认展开 = 可见
    }
    expect(html).toContain('照卡开工')
  })

  it('被裁片段同样给正文（回答「它为什么不知道某个术语」）', () => {
    const html = renderPromptsPanel(fullPayload())
    const block = detailsBlockOf(html, 'data-prompt-trimmed="common/glossary"')
    expect(block).not.toBe('')
    const text = preTextOf(block)
    expect(text).toBeDefined()
    expect(text!).toContain('术语表')
    expect(block).toContain('未进本次装配')
  })

  it('完整系统提示词合并视图在场（并在文末说明分隔行是本页加的）', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).toContain('data-prompt-merged="1"')
    expect(html).toContain('本次完整系统提示词')
    expect(html).toContain('不在提示词正文里')
  })

  it('装配服务不可得 → 「装配服务不可得」，不是「零段」', () => {
    const payload = fullPayload()
    payload.system = { unavailable: true, sections: [], trimmed: [] }
    const html = renderPromptsPanel(payload)
    expect(html).toContain('data-system-unavailable="1"')
    expect(html).toContain('装配服务不可得')
    expect(html).toContain('不是「零段」')
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

describe('提示词面板 · 形状守卫与滚动纪律', () => {
  it('三段都没有（需求页壳的桩载荷）→ data-panel-placeholder，不把空说成「零条留痕」', () => {
    const html = renderPromptsPanel({ available: true, marker: 'prompts' })
    expect(html).toContain('data-panel="prompts"')
    expect(html).toContain('data-panel-placeholder="prompts"')
    expect(html).not.toContain('data-injection="1"')
  })

  it('一律铺开：产物里没有 overflow: auto|scroll（含提示词正文块）', () => {
    const html = renderPromptsPanel(fullPayload())
    expect(html).not.toMatch(/overflow:\s*(auto|scroll)/)
    expect(html).not.toMatch(/max-height/)
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
