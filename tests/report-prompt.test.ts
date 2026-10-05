// serves: FR-9, FR-12
/**
 * 「提示词」Tab 的**留痕诚实性**渲染断言（REQ-261004222448-292a · 任务卡 t-5d795a ·
 * 设计 test-cases.md 的 T-18、T-20、T-21）。
 *
 * 这一块回答的是用户最容易被糊弄的问题：**"这些话真的进了会话吗？"**
 * 页面只有三种合法回答——「已投递进会话」/「只留痕，未投递」/「投递不可知」。第三种是
 * `delivered === null`（旧条目缺字段）的**唯一**正确答法；把它读成"已投递"就是撒谎。
 *
 * 三次断言的口径（本卡）：① 每段正文 `<pre>` 非空（不许拿"点开是空的"当展开）；
 * ② **反例③**：`delivered=null` → 「投递不可知」且全页不得出现「已投递」（并给正向控制，
 * 证明那四个字确实会出现在这个位置，否则否定断言是空的）；③ `truncated` 超限正文被截断且显式标出。
 *
 * 夹具**不手搓留痕对象**：走 `injectionLogInputForRound` / `capInjectionText` /
 * `toInjectionLogView` 三个真函数（`AgentDeliverer.createRoundMessage → deliverMessage`
 * 那条路径就是它们组出来的）——手搓夹具会把"留痕怎么写的"漂移藏起来。
 * （T-20 的投递侧半张：`createRoundMessage` 后留痕 +1、失败原因随投递结果返回，
 * 由既有 `tests/injection-log.test.ts` 的 ①② 两节机械断言；本文件钉的是**页面怎么读它**。）
 *
 * @module dsh-pmboard/tests/report-prompt
 */
import { describe, it, expect } from 'vitest'
import { renderPromptsPanel } from '../src/client/views/panels/prompts.js'
import {
  INJECTION_LOG_TEXT_MAX,
  capInjectionText,
  injectionLogInputForRound,
  toInjectionLogView,
  type InjectionLogEntry,
  type InjectionLogInput,
} from '../src/application/internal/injection-log.js'
import type { PromptInjectionRecord, PromptsResponse } from '../src/shared/protocol.js'

const W = 'session-1f2d438d-7a94'
const T0 = 1_700_000_000_000

const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

/** 轮次投递留痕 → 读端视图 → 协议记录（**三层真函数**，与运行时同一条链）。 */
function roundRecord(params: { at: number; text: string; delivered: boolean }): PromptInjectionRecord {
  const input: InjectionLogInput = injectionLogInputForRound({ windowKey: W, text: params.text, delivered: params.delivered })
  const view = toInjectionLogView({ ...input, at: params.at })
  return view
}

/** 旧条目（v2 之前落盘）：没有 origin / delivered / text —— 读端必须降级。 */
const LEGACY_ENTRY: InjectionLogEntry = {
  at: T0 - 60_000,
  windowKey: W,
  stage: 'implementing',
  difficulty: 'standard',
  category: 'feature',
  routeKey: 'implementing/standard/feature',
  hitLevel: 'exact',
  fragmentIds: ['implementing/light'],
  charCount: 2180,
  trimmed: [],
}

const SECTIONS = [
  { id: 'implementing/light', kind: 'file' as const, chars: 2180, text: '## 实施阶段纪律\n- 照卡开工：reqboard_task_move(to=in_progress)' },
  { id: 'common/iron-rules', kind: 'file' as const, chars: 1460, text: '## 本仓铁律\n- 批准闸门永不伸缩' },
  { id: 'capture-section', kind: 'shell' as const, chars: 2080, text: '## 本条需求\n标题：详情页重构' },
]
const TRIMMED = [{ id: 'common/glossary', chars: 1200, text: '## 术语表（本次未注入）\n- 父卡 / 子卡：dev → review → test' }]

const SYSTEM = { routeKey: 'implementing/standard/v3', hitLevel: 'exact', perTurnChars: 6240, perTurnEstTokens: 1560, sections: SECTIONS, trimmed: TRIMMED }

const CONTEXT = {
  medianUsagePct: 62,
  compressions: 3,
  policy: ['replaced', 'skipped'],
  isolations: [{ at: T0, stage: 'implementing', status: 'replaced', packageChars: 4200, reason: '上一节点上下文整段替换为输入包' }],
  available: true,
}

function payload(injections: readonly PromptInjectionRecord[], over: Partial<PromptsResponse> = {}): PromptsResponse {
  return { system: SYSTEM, injections: [...injections], context: CONTEXT, ...over }
}

/** 第 n 条留痕块（B 段按时间倒序逐条铺开，块与块相邻；末块到本 section 结束）。 */
function injectionBlock(html: string, index = 0): string {
  let i = html.indexOf('data-injection="1"')
  for (let k = 0; k < index; k += 1) i = html.indexOf('data-injection="1"', i + 1)
  expect(i, '产物里找不到第 ' + String(index) + ' 条留痕').toBeGreaterThan(-1)
  const start = html.lastIndexOf('<div class="dsh-pm-inj', i)
  const next = html.indexOf('data-injection="1"', i + 1)
  const end = next >= 0 ? next : html.indexOf('</section>', i)
  return html.slice(start, end)
}

/** `<details data-prompt-section="id">` / `data-prompt-trimmed="id"` 那一块。 */
function sectionBlock(html: string, id: string, attr = 'data-prompt-section'): string {
  const start = html.indexOf(attr + '="' + id + '"')
  expect(start, '产物里找不到段 ' + id).toBeGreaterThan(-1)
  const end = html.indexOf('</details>', start)
  return html.slice(start, end < 0 ? html.length : end)
}

/* ══════════════════════════════════════════════ T-18 / T-20 来源与后果 */

describe('T-18 / T-20 · 留痕的来源与后果（FR-9：留了痕 ≠ 进了会话）', () => {
  it('T-20 · 轮次投递留痕（真组装函数）：origin=dive-round、text 非空；投递失败 → delivered=false', () => {
    const input = injectionLogInputForRound({ windowKey: W, text: '照卡开工 · 完工汇报', delivered: false })
    // 留痕本身的口径：这是"真进会话"的那条路径，正文必须可读、后果必须如实
    expect(input.origin).toBe('dive-round')
    expect(input.delivered).toBe(false)
    expect(typeof input.text).toBe('string')
    expect((input.text ?? '').length).toBeGreaterThan(0)
    expect(input.charCount).toBe('照卡开工 · 完工汇报'.length)

    const html = renderPromptsPanel(payload([roundRecord({ at: T0, text: '照卡开工 · 完工汇报', delivered: false })]))
    const block = injectionBlock(html)
    expect(block).toContain('data-origin="dive-round"')
    expect(block).toContain('data-delivered="false"')
    expect(block).toContain('只留痕，未投递') // 失败不许被读成投递成功
    expect(block).not.toContain('已投递')
    expect(block).toContain('照卡开工 · 完工汇报') // 正文铺开（点开能读到"到底说了什么"）
  })

  it('反例③ T-18 · delivered=null（旧条目）→ 「投递不可知」，全页**不得**出现「已投递」', () => {
    const legacy = toInjectionLogView(LEGACY_ENTRY)
    // 降级口径先钉住：旧条目不许默认成 delivered=true
    expect(legacy.origin).toBe('unknown')
    expect(legacy.delivered).toBeNull()

    const html = renderPromptsPanel(payload([legacy]))
    const block = injectionBlock(html)
    expect(block).toContain('data-delivered="unknown"')
    expect(block).toContain('投递不可知')
    expect(block).toContain('不当作投递成功')
    expect(html).not.toContain('已投递')

    // 正向控制（防空断言）：换一条真投递的留痕，「已投递进会话」确实出现在同一位置——
    // 证明上面的 not.toContain 挡的是"旧条目被读成投递成功"，而不是"文案里根本没这四个字"
    const good = renderPromptsPanel(payload([roundRecord({ at: T0, text: '照卡开工 · 完工汇报', delivered: true })]))
    expect(good).toContain('data-delivered="true"')
    expect(injectionBlock(good)).toContain('已投递进会话')
  })

  it('T-18 · origin=unknown → 「来源未知」（不替旧条目猜一个来源）', () => {
    const html = renderPromptsPanel(payload([toInjectionLogView(LEGACY_ENTRY)]))
    const block = injectionBlock(html)
    expect(block).toContain('data-origin="unknown"')
    expect(block).toContain('来源未知')
    for (const guessed of ['闸门 H3', 'Dive 节点结算', 'Dive 轮次投递', '系统提示词装配']) {
      expect(block, '替旧条目猜了来源：' + guessed).not.toContain(guessed)
    }
  })

  it('T-18 · 每段正文 `<pre>` 非空（回答"它被告知了什么"，展开不是空壳）', () => {
    const html = renderPromptsPanel(payload([roundRecord({ at: T0, text: '照卡开工 · 完工汇报', delivered: true })]))

    const pres = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/g)].map(m => m[1])
    // 三段 + 一段被裁 + 合并视图 + 留痕正文
    expect(pres).toHaveLength(SECTIONS.length + TRIMMED.length + 1 + 1)
    for (const p of pres) expect(p.trim().length, '有空的 <pre> 正文').toBeGreaterThan(0)

    for (const s of SECTIONS) {
      const block = sectionBlock(html, s.id)
      const m = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(block)
      expect(m, s.id + ' 段没有正文 <pre>').not.toBeNull()
      expect((m as RegExpExecArray)[1].trim().length).toBeGreaterThan(0)
      expect((m as RegExpExecArray)[1]).toContain(s.text.split('\n')[0])
    }
    // 被裁片段同样给正文（回答"它为什么不知道某个术语"）
    const trimmedBlock = sectionBlock(html, 'common/glossary', 'data-prompt-trimmed')
    expect(trimmedBlock).toContain('未注入')
    expect(countOf(html, 'data-prompt-empty-body="1"')).toBe(0) // 一段都没缺正文
  })
})

/* ══════════════════════════════════════════════ T-21 超限正文截断 */

describe('T-21 · 超限正文截断（FR-9）', () => {
  it('T-21 · capInjectionText：不超限原样、超限截断并置 truncated（写入侧口径）', () => {
    const short = capInjectionText('x'.repeat(INJECTION_LOG_TEXT_MAX))
    expect(short.truncated).toBe(false)
    expect(short.text).toHaveLength(INJECTION_LOG_TEXT_MAX)

    const long = 'x'.repeat(INJECTION_LOG_TEXT_MAX + 1000)
    const capped = capInjectionText(long)
    expect(capped.truncated).toBe(true)
    expect(capped.text).toHaveLength(INJECTION_LOG_TEXT_MAX)
    expect(capped.text).toBe(long.slice(0, INJECTION_LOG_TEXT_MAX))
  })

  it('T-21 · truncated 留痕：页面显「已截断」+ data-truncated，且显示的就是被截断后的正文', () => {
    const long = 'y'.repeat(INJECTION_LOG_TEXT_MAX + 1000)
    const rec = roundRecord({ at: T0, text: long, delivered: true })
    expect(rec.truncated).toBe(true)
    expect(rec.charCount).toBe(INJECTION_LOG_TEXT_MAX + 1000) // 原文字符数照实记

    const html = renderPromptsPanel(payload([rec]))
    const block = injectionBlock(html)
    expect(block).toContain('data-truncated="1"')
    expect(block).toContain('已截断')
    expect(block).toContain('不是完整正文')
    const m = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(block)
    expect(m, '截断留痕没有正文 <pre>').not.toBeNull()
    expect((m as RegExpExecArray)[1]).toHaveLength(INJECTION_LOG_TEXT_MAX) // 铺开的是截断后的那一段
  })

  it('T-21 · 未超限的留痕不带截断标（标错了比不标更糟）', () => {
    const html = renderPromptsPanel(payload([roundRecord({ at: T0, text: '照卡开工 · 完工汇报', delivered: true })]))
    const block = injectionBlock(html)
    expect(block).not.toContain('data-truncated')
    expect(block).not.toContain('已截断')
  })
})

/* ══════════════════════════════════════════════ 上下文：不可得 ≠ 0 次 */

describe('T-18 同族 · 上下文不可得时说「未采集」，不写「压缩 0 次」（FR-12）', () => {
  it('上下文 available=false → data-context-unavailable + 「未采集」，C 段里不出现 0 次口径', () => {
    const html = renderPromptsPanel(payload([], {
      context: { compressions: 0, policy: [], isolations: [], available: false },
    }))
    expect(html).toContain('data-panel="prompts"')
    const cSection = html.slice(html.indexOf('C · 上下文'))
    expect(cSection).toContain('data-context-unavailable="1"')
    expect(cSection).toContain('未采集')
    expect(cSection).toContain('不是「压缩零次」')
    expect(cSection).not.toContain('压缩 0 次')
    expect(cSection).not.toContain('0 次')
    expect(cSection).not.toContain('data-context-available="1"')
  })

  it('上下文可得时给压缩次数与逐条隔离留痕（对照组：有数据不许也说「未采集」）', () => {
    const html = renderPromptsPanel(payload([]))
    expect(html).toContain('data-context-available="1"')
    expect(html).toContain('压缩 3 次')
    expect(html).toContain('data-isolation="1"')
    expect(html).not.toContain('data-context-unavailable')
  })
})
