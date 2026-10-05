/**
 * 「对话」Tab 面板单测（REQ-261004222448-292a · FR-6 / t-2be0cd）。
 *
 * 本包**没有 jsdom**：渲染是纯函数返回 HTML 字符串，所以这里全部对字符串断言。
 * 三组断言对应 FR-6 的三条机械判据：
 *  ① 三类消息（人 / agent / 系统）在**同一容器**内按时间排序；
 *  ② 产物里**不出现**工具调用 / 推理类字样（哪怕载荷里带着它们）；
 *  ③ 分页入口、检索入口、回复框选择器逐字存在，且**不做内层滚动**。
 */
import { describe, it, expect } from 'vitest'
import {
  applyDialogueSearch, dialoguePanel, filterDialogueItems, highlightDialogueText,
  orderDialogue, readDialogue, renderDialogue, type DialogueMessage,
} from '../src/client/views/panels/dialogue.ts'
import type { ReportTabCtx } from '../src/client/views/report-tabs.ts'

const ctx = (requirementId = 'REQ-1'): ReportTabCtx => ({
  requirementId,
  load: () => Promise.resolve({}),
  openDoc: () => { /* 纯渲染不开正文 */ },
})

const human = (at: number, text: string, windowKey?: string): DialogueMessage =>
  ({ kind: 'human', at, text, ...(windowKey === undefined ? {} : { windowKey }) })
const agent = (at: number, text: string, windowKey?: string): DialogueMessage =>
  ({ kind: 'agent', at, text, ...(windowKey === undefined ? {} : { windowKey }) })
const system = (at: number, text: string, extra: Partial<{ evt: string; inferred: boolean }> = {}): DialogueMessage =>
  ({ kind: 'system', at, text, ...extra }) as DialogueMessage

/** 产物里 `data-msg` 的出现次序 = 视觉上的消息次序。 */
const kindsOf = (html: string): string[] => [...html.matchAll(/data-msg="([a-z]+)"/g)].map(m => m[1])
/** 产物里 `data-at` 的数值序列（时间序断言的原始输入）。 */
const atsOf = (html: string): number[] => [...html.matchAll(/data-at="(\d+)"/g)].map(m => Number(m[1]))

describe('FR-6 · 一条流：三类消息同容器 + 时间序', () => {
  it('人 / agent / 系统按时间排在同一条流里（喂乱序也要排好）', () => {
    const html = renderDialogue({
      items: [system(300, '阶段推进：设计 → 拆分', { evt: 'stage-advance' }), human(100, '先看接口'), agent(200, '收到，我来拆')],
      page: { hasMore: false, total: 3 },
    }, ctx())
    expect(kindsOf(html)).toEqual(['human', 'agent', 'system'])
    expect(atsOf(html)).toEqual([100, 200, 300])
  })

  it('三类消息都在 data-dialogue-list 这**一个**容器里（不分组、不另起块）', () => {
    const html = renderDialogue({
      items: [human(1, '甲'), agent(2, '乙'), system(3, '丙', { evt: 'handoff' })],
      page: { hasMore: false, total: 3 },
    }, ctx())
    const list = html.slice(html.indexOf('data-dialogue-list="1"'), html.indexOf('<div class="dsh-pm-dialogue-more">'))
    expect(kindsOf(list)).toEqual(['human', 'agent', 'system'])
    // 容器外一条消息都不该有（否则就是"又分了一块"）
    expect(kindsOf(html)).toHaveLength(3)
  })

  it('消息条数 = 载荷条数；每条都带时间与 actor（agent 带可读窗口码）', () => {
    const html = renderDialogue({
      items: [human(1, '甲', 'session-1f2d438d-7a94'), agent(2, '乙', 'session-1f2d438d-7a94')],
      page: { hasMore: false, total: 2 },
    }, ctx())
    expect(html).toContain('data-msg="human"')
    expect(html).toContain('data-msg="agent"')
    expect(html).toContain('data-window="session-1f2d438d-7a94"')
    expect(html).toContain('窗口 w-1f2d438d')
    expect(html).toContain('>人</span>')
    expect(html).toContain('>agent</span>')
    // 无窗口码的人消息不渲染 data-window（不编一个空窗口）
    const bare = renderDialogue({ items: [human(1, '甲')], page: { hasMore: false, total: 1 } }, ctx())
    expect(bare).not.toContain('data-window=')
  })

  it('orderDialogue 稳定且不改原数组', () => {
    const items = [human(2, 'b'), human(1, 'a')]
    expect(orderDialogue(items).map(i => i.at)).toEqual([1, 2])
    expect(items.map(i => i.at)).toEqual([2, 1])
  })
})

describe('FR-6 · 系统消息：回填标 + 不可回复', () => {
  it('inferred=true 显眼标「回填」并带 data-inferred="1"', () => {
    const html = renderDialogue({
      items: [system(1, '计划已退回（台账原文）', { evt: 'plan-rejected', inferred: true })],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).toContain('data-inferred="1"')
    expect(html).toContain('回填')
    expect(html).toContain('不是当时实时发生的')
  })

  it('非回填的系统消息不带回填标（标错了比不标更糟）', () => {
    const html = renderDialogue({
      items: [system(1, '窗口已交接', { evt: 'handoff' })],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).not.toContain('data-inferred')
    expect(html).not.toContain('回填')
  })

  it('系统消息里没有任何回复控件（只有底部那一个回复框）', () => {
    const html = renderDialogue({
      items: [system(1, '中断已恢复', { evt: 'interrupt' })],
      page: { hasMore: false, total: 1 },
    }, ctx())
    const list = html.slice(html.indexOf('data-dialogue-list="1"'), html.indexOf('<div class="dsh-pm-dialogue-more">'))
    expect(list).not.toContain('data-role="comment-input"')
    expect(list).not.toContain('data-action="add-comment"')
  })

  it('evt 缺字段时不编枚举值冒充（只是不渲染 data-evt）', () => {
    const html = renderDialogue({
      items: [{ kind: 'system', at: 1, text: '措辞取台账原文' } as DialogueMessage],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).toContain('data-msg="system"')
    expect(html).not.toContain('data-evt=')
  })
})

describe('FR-6 · 反例：产物里不得出现工具调用 / 推理字样', () => {
  /**
   * 服务端已过滤干净，但本断言防的是**将来有人在渲染层把它们加回来**：
   * 喂一份"过滤没生效"的标本（工具块字段 + 非对话 kind + 整份原始事件），产物里必须没有那些字样。
   */
  it('工具块字段 / 非对话 kind / 原始工具事件都不进产物', () => {
    const contaminated = {
      items: [
        {
          kind: 'human', at: 1, text: '先看接口',
          blocks: [{ type: 'tool/call', name: 'run_code', input: 'run_code x' }],
          reasoning: '推理：我该先读文件',
        },
        { kind: 'tool', at: 2, text: 'tool/call run_code 输出…' },
        { kind: 'reasoning', at: 3, text: 'reasoning: 分析中' },
        { kind: 'agent', at: 4, text: '结论：可以开工' },
      ],
      page: { hasMore: false, total: 4 },
    }
    const html = renderDialogue(contaminated, ctx())
    for (const bad of ['tool/call', 'tool/result', 'reasoning', 'run_code']) {
      expect(html).not.toContain(bad)
    }
    // 正常文本照常渲染，且被丢掉的条数如实写出来（不静默吞掉）
    expect(html).toContain('结论：可以开工')
    expect(html).toContain('先看接口')
    expect(html).toContain('data-dialogue-dropped="2"')
  })

  it('整份载荷不是对话形状时：给空态说辞，且**不回显原文**', () => {
    const html = renderDialogue({ type: 'tool/call', name: 'run_code', payload: 'reasoning' }, ctx())
    expect(html).toContain('data-dialogue-shape="unknown"')
    expect(html).not.toContain('tool/call')
    expect(html).not.toContain('run_code')
    expect(html).not.toContain('reasoning')
    expect(readDialogue({ type: 'tool/call' })).toBeUndefined()
    expect(readDialogue(null)).toBeUndefined()
    expect(readDialogue({ items: 'nope' })).toBeUndefined()
  })

  it('HTML 特殊字符一律转义（文本进页面，标签不进）', () => {
    const html = renderDialogue({
      items: [human(1, '<script>alert(1)</script> & "x"')],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('FR-6 · 分页：默认最近 N 条 + 加载更早', () => {
  it('hasMore=true：按钮可点，游标取服务端 page.before', () => {
    const html = renderDialogue({
      items: [human(100, '甲')], page: { before: 50, hasMore: true, total: 9 },
    }, ctx())
    expect(html).toContain('data-load-earlier="1"')
    expect(html).toContain('data-before="50"')
    expect(html).not.toMatch(/data-load-earlier="1"[^>]*disabled/)
    expect(html).toContain('还有更早的消息未加载')
  })

  it('服务端省略 before 时用已加载最旧一条的 at 作游标（语义相同的同一个时间游标）', () => {
    const html = renderDialogue({
      items: [agent(200, '乙'), human(100, '甲')], page: { hasMore: true, total: 9 },
    }, ctx())
    expect(html).toContain('data-before="100"')
  })

  it('没有更早的：按钮在但禁用 + 写明「已到最早一条」（不留假出口）', () => {
    const html = renderDialogue({
      items: [human(100, '甲')], page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).toContain('data-load-earlier="1"')
    expect(html).toMatch(/data-load-earlier="1"[^>]*disabled/)
    expect(html).toContain('已到最早一条')
    expect(html).not.toContain('data-before=')
  })

  it('有 hasMore 但拿不到游标 / 没有 page：禁用并写明原因（不猜）', () => {
    const noCursor = renderDialogue({ items: [], page: { hasMore: true, total: 5 } }, ctx())
    expect(noCursor).toMatch(/data-load-earlier="1"[^>]*disabled/)
    expect(noCursor).toContain('没给游标')
    const noPage = renderDialogue({ items: [human(1, '甲')] }, ctx())
    expect(noPage).toMatch(/data-load-earlier="1"[^>]*disabled/)
    expect(noPage).toContain('分页信息不可得')
  })
})

describe('FR-6 · 页内关键词检索（只过滤已加载的部分）', () => {
  it('检索框存在，且说明书写清「只过滤已加载的 N 条 / 还有多少未加载」', () => {
    const html = renderDialogue({
      items: [human(1, '甲'), agent(2, '乙')], page: { hasMore: true, total: 5 },
    }, ctx())
    expect(html).toContain('data-dialogue-search="1"')
    expect(html).toContain('只过滤已加载的 2 条')
    expect(html).toContain('还有 3 条更早的未加载')
    expect(html).toContain('data-dialogue-hits="1"')
    expect(html).toContain('命中 2 / 已加载 2')
  })

  it('filterDialogueItems：大小写无关的子串匹配；空词 = 全都要', () => {
    const items = [human(1, '窗口 A 已接手'), agent(2, 'OK')]
    expect(filterDialogueItems(items, '窗口').map(i => i.at)).toEqual([1])
    expect(filterDialogueItems(items, 'ok').map(i => i.at)).toEqual([2])
    expect(filterDialogueItems(items, '  ').map(i => i.at)).toEqual([1, 2])
    expect(filterDialogueItems(items, '不存在').length).toBe(0)
  })

  it('highlightDialogueText：命中包 mark，且先转义（标签不复活）', () => {
    const html = highlightDialogueText('买 <b>入</b> 前确认', '入')
    expect(html).toContain('data-dialogue-hit="1"')
    expect(html).toContain('<mark')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<b>')
    // 正则元字符按字面处理（`.` 不该匹配任意字符）
    expect(highlightDialogueText('a.b', '.')).toContain('<mark class="dsh-pm-dialogue-hit"')
    expect(highlightDialogueText('axb', '.')).not.toContain('<mark')
    // 空词 = 不高亮、只转义
    expect(highlightDialogueText('<i>', '')).toBe('&lt;i&gt;')
  })

  it('applyDialogueSearch：就地过滤 + 高亮 + 更新命中计数', () => {
    const textElA = { innerHTML: '' }
    const textElB = { innerHTML: '' }
    const nodeA = {
      hidden: false, attrs: {} as Record<string, string>, textEl: textElA,
      getAttribute(name: string): string | null {
        return name === 'data-msg-text-raw' ? '窗口 A 已接手' : (this.attrs[name] ?? null)
      },
      setAttribute(name: string, value: string): void { this.attrs[name] = value },
      querySelector(sel: string): { innerHTML: string } | null {
        return sel === '[data-msg-text]' ? this.textEl : null
      },
    }
    const nodeB = {
      hidden: false, attrs: {} as Record<string, string>, textEl: textElB,
      getAttribute(name: string): string | null {
        return name === 'data-msg-text-raw' ? 'OK' : (this.attrs[name] ?? null)
      },
      setAttribute(name: string, value: string): void { this.attrs[name] = value },
      querySelector(sel: string): { innerHTML: string } | null {
        return sel === '[data-msg-text]' ? this.textEl : null
      },
    }
    const counter = { textContent: '' }
    const root = {
      querySelectorAll: (_sel: string) => [nodeA, nodeB],
      querySelector: (sel: string) => (sel === '[data-dialogue-hits]' ? counter : null),
    }
    const hits = applyDialogueSearch(root as unknown as HTMLElement, '窗口')
    expect(hits).toBe(1)
    expect(nodeA.hidden).toBe(false)
    expect(nodeA.attrs['data-msg-hit']).toBe('1')
    expect(textElA.innerHTML).toContain('<mark')
    expect(nodeB.hidden).toBe(true)
    expect(nodeB.attrs['data-msg-hit']).toBe('0')
    expect(counter.textContent).toBe('命中 1 / 已加载 2')
    // 清空检索词 = 全部复原（不许留下上一次的高亮）
    expect(applyDialogueSearch(root as unknown as HTMLElement, '')).toBe(2)
    expect(nodeB.hidden).toBe(false)
    expect(textElA.innerHTML).toBe('窗口 A 已接手')
    // 宿主桩（没有查询能力）不炸
    expect(applyDialogueSearch({} as unknown as HTMLElement, 'x')).toBe(0)
  })
})

describe('FR-6 · 回复框与渲染纪律', () => {
  it('底部回复框沿用既有评论提交链路（选择器逐字在）', () => {
    const html = renderDialogue({ items: [human(1, '甲')], page: { hasMore: false, total: 1 } }, ctx('REQ-261004222448-292a'))
    expect(html).toContain('data-role="comment-input"')
    expect(html).toContain('data-action="add-comment"')
    expect(html).toContain('data-target="req"')
    expect(html).toContain('data-id="REQ-261004222448-292a"')
  })

  it('根容器 data-panel="dialogue"；列表长了靠页面滚动（产物里没有 overflow: auto|scroll）', () => {
    const html = renderDialogue({
      items: Array.from({ length: 40 }, (_v, i) => human(i + 1, '第 ' + String(i + 1) + ' 条')),
      page: { hasMore: true, total: 90 },
    }, ctx())
    expect(html).toContain('data-panel="dialogue"')
    expect(html).toContain('data-dialogue-loaded="40"')
    expect(html).toContain('data-dialogue-total="90"')
    expect(html).not.toMatch(/overflow:\s*(auto|scroll)/)
  })

  it('空载荷给说辞（不是白板），且与「形状不对」是两种文案', () => {
    const empty = renderDialogue({ items: [], page: { hasMore: false, total: 0 } }, ctx())
    expect(empty).toContain('data-dialogue-empty="1"')
    expect(empty).toContain('还没有对话记录')
    expect(empty).toContain('系统消息混排')
    expect(empty).not.toContain('data-dialogue-shape')
    // 空态下回复框仍在（本来就是空的时候最需要说话）
    expect(empty).toContain('data-role="comment-input"')
  })

  it('注册项不变：key / label / badge', () => {
    expect(dialoguePanel.key).toBe('dialogue')
    expect(dialoguePanel.label).toBe('对话')
    expect(dialoguePanel.badge({} as never)).toBeUndefined()
    expect(dialoguePanel.render({ items: [], page: { hasMore: false, total: 0 } }, ctx()))
      .toContain('data-panel="dialogue"')
  })
})
