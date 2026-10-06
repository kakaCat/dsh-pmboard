/**
 * 「对话」Tab 面板单测（REQ-261004222448-292a · FR-6 / t-2be0cd；
 * REQ-261006130057-7a43 · FR-6 / t7 聊天 App 形态改造）。
 *
 * 本包**没有 jsdom**：渲染是纯函数返回 HTML 字符串，所以这里全部对字符串断言。
 * 断言组对应 FR-6 的机械判据（t7 口径 T-7 ~ T-11）：
 *  T-7  气泡三态类名（人靠右蓝 + 右头像 / agent 靠左浅紫 + 左头像 w/a / 系统居中灰丸 + 回填标）；
 *  T-8  产物**不含** comment-input 与 dialogue-search（回复框、检索框已删），**含**只读说明行；
 *  T-9  吸顶分页条 = `.chat-scroll` 第一个子元素；`pageKnown=false` 降级不可用态（不猜「没有更早」）；
 *  T-10 正序（items at 升序渲染，旧上新下）；
 *  T-11 服务端过滤不变量保留（产物里不出现工具调用 / 推理字样）。
 */
import { describe, it, expect } from 'vitest'
import {
  DIALOGUE_PAGE_SIZE, dialoguePanel, isLongDialogueText,
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

describe('T-10 · 一条流：三类消息同容器 + 正序（旧上新下）', () => {
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
    const list = html.slice(html.indexOf('data-dialogue-list="1"'), html.indexOf('data-dialogue-readonly="1"'))
    expect(kindsOf(list)).toEqual(['human', 'agent', 'system'])
    // 容器外一条消息都不该有（否则就是"又分了一块"）
    expect(kindsOf(html)).toHaveLength(3)
  })

  it('orderDialogue 稳定且不改原数组', () => {
    const items = [human(2, 'b'), human(1, 'a')]
    expect(orderDialogue(items).map(i => i.at)).toEqual([1, 2])
    expect(items.map(i => i.at)).toEqual([2, 1])
  })
})

describe('T-7 · 气泡三态：人靠右蓝 + 右头像 / agent 靠左浅紫 + 左头像 / 系统居中灰丸', () => {
  it('人消息：右侧气泡（cmsg--right + bubble--human）+ 右头像「人」，名字签行含等宽时间戳', () => {
    const html = renderDialogue({ items: [human(1, '甲')], page: { hasMore: false, total: 1 } }, ctx())
    expect(html).toContain('dsh-pm-cmsg--right')
    expect(html).toContain('dsh-pm-bubble--human')
    expect(html).toContain('dsh-pm-avatar--human')
    expect(html).toContain('>人</span>')
    // 头像在列**之后**（右侧）：产物里 avatar 出现在 bubble 之后
    expect(html.indexOf('dsh-pm-bubble--human')).toBeLessThan(html.indexOf('dsh-pm-avatar--human'))
    expect(html).toContain('dsh-pm-msg-time')
    expect(html).toContain('<b class="dsh-pm-who">人</b>')
  })

  it('窗口 agent：左侧气泡（cmsg--left + bubble--agent）+ 左头像「w」，名字签写全「窗口 w-xxxxxxxx」', () => {
    const html = renderDialogue({
      items: [agent(2, '乙', 'session-1f2d438d-7a94')],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).toContain('dsh-pm-cmsg--left')
    expect(html).toContain('dsh-pm-bubble--agent')
    expect(html).toContain('dsh-pm-avatar--agent')
    expect(html).toContain('title="窗口 agent（session-1f2d438d-7a94）">w</span>')
    expect(html).toContain('<b class="dsh-pm-who">窗口 w-1f2d438d</b>')
    expect(html).toContain('data-window="session-1f2d438d-7a94"')
    // 头像在列**之前**（左侧）
    expect(html.indexOf('dsh-pm-avatar--agent')).toBeLessThan(html.indexOf('dsh-pm-bubble--agent'))
  })

  it('任务 agent（无窗口码）：左头像「a」，名字签「agent」——不编一个任务 id 冒充', () => {
    const html = renderDialogue({ items: [agent(1, '乙')], page: { hasMore: false, total: 1 } }, ctx())
    expect(html).toContain('title="任务 agent">a</span>')
    expect(html).toContain('<b class="dsh-pm-who">agent</b>')
    expect(html).not.toContain('data-window=')
  })

  it('系统消息：居中灰丸（不占气泡、没有头像），inferred 带 data-inferred="1" 琥珀「回填」标', () => {
    const html = renderDialogue({
      items: [system(1, '计划已退回（台账原文）', { evt: 'plan-rejected', inferred: true })],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).toContain('dsh-pm-msg--system')
    expect(html).toContain('dsh-pm-msg-system-pill')
    expect(html).toContain('data-inferred="1"')
    expect(html).toContain('回填')
    expect(html).toContain('不是当时实时发生的')
    const sys = html.slice(html.indexOf('dsh-pm-msg--system'), html.indexOf('data-dialogue-readonly="1"'))
    expect(sys).not.toContain('dsh-pm-bubble')
    expect(sys).not.toContain('dsh-pm-avatar')
  })

  it('非回填的系统消息不带回填标（标错了比不标更糟）', () => {
    const html = renderDialogue({
      items: [system(1, '窗口已交接', { evt: 'handoff' })],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).not.toContain('data-inferred')
    // 只读说明行固定文案里有「正序回填」四字，故这里钉的是**回填标本身**不出现
    expect(html).not.toContain('>回填</span>')
  })

  it('evt 缺字段时不编枚举值冒充（只是不渲染 data-evt）', () => {
    const html = renderDialogue({
      items: [{ kind: 'system', at: 1, text: '措辞取台账原文' } as DialogueMessage],
      page: { hasMore: false, total: 1 },
    }, ctx())
    expect(html).toContain('data-msg="system"')
    expect(html).not.toContain('data-evt=')
  })

  it('长日志气泡：默认折叠一行（details + bubble--long）+ 「长日志已收纳」琥珀标 + 「展开」', () => {
    const longText = '扫描需求目录：' + '补登过程产物、'.repeat(20)
    const html = renderDialogue({
      items: [agent(1, longText, 'session-1f2d438d-7a94'), human(2, '短消息')],
      page: { hasMore: false, total: 2 },
    }, ctx())
    expect(html).toContain('data-msg-long="1"')
    expect(html).toContain('dsh-pm-bubble--long')
    expect(html).toContain('长日志已收纳')
    expect(html).toContain('>展开</span>')
    expect(html).toContain('>收起</span>')
    // 短消息不折叠
    expect(isLongDialogueText('短消息')).toBe(false)
    expect(isLongDialogueText(longText)).toBe(true)
    expect(isLongDialogueText('第一行\n第二行')).toBe(true)
  })
})

describe('T-8 · 只读（D-6）：产物不含回复框与检索框，原位是只读说明行', () => {
  it('产物不含 comment-input / add-comment / dialogue-search / dialogue-hits（删干净）', () => {
    const html = renderDialogue({
      items: [human(1, '甲'), system(2, '中断已恢复', { evt: 'interrupt' })],
      page: { hasMore: false, total: 2 },
    }, ctx('REQ-261004222448-292a'))
    expect(html).not.toContain('data-role="comment-input"')
    expect(html).not.toContain('add-comment')
    expect(html).not.toContain('dialogue-search')
    expect(html).not.toContain('dialogue-hits')
    expect(html).not.toContain('dsh-pm-comment-form')
    // 检索就地重绘用的原文属性一并移除（没有检索就没有它的存根）
    expect(html).not.toContain('data-msg-text-raw')
  })

  it('原位放只读说明行（居中灰）：「历史聊天记录 · 只读 —— 共 N 条，本页 M 条」', () => {
    const html = renderDialogue({
      items: [human(1, '甲'), agent(2, '乙')],
      page: { hasMore: true, total: 90 },
    }, ctx())
    expect(html).toContain('data-dialogue-readonly="1"')
    expect(html).toContain('历史聊天记录 · 只读')
    expect(html).toContain('共 90 条，本页 2 条')
    // 只读行在滚动容器**之外**（面板原位底部）
    expect(html.indexOf('data-dialogue-readonly="1"')).toBeGreaterThan(html.indexOf('data-chat-scroll="1"'))
  })

  it('空态也给只读行（空的时候也要说清这是只读历史）', () => {
    const empty = renderDialogue({ items: [], page: { hasMore: false, total: 0 } }, ctx())
    expect(empty).toContain('data-dialogue-empty="1"')
    expect(empty).toContain('还没有对话记录')
    expect(empty).toContain('data-dialogue-readonly="1"')
    expect(empty).toContain('共 0 条，本页 0 条')
    expect(empty).not.toContain('data-role="comment-input"')
  })
})

describe('T-9 · 吸顶分页条：chat-scroll 第一个子元素 + pageKnown=false 降级', () => {
  it('分页条是 .chat-scroll 内部第一个子元素（sticky top:0；在消息列表之前）', () => {
    const html = renderDialogue({
      items: [human(100, '甲')], page: { before: 50, hasMore: true, total: 90 },
    }, ctx())
    expect(html).toMatch(/data-chat-scroll="1">\s*<div class="dsh-pm-chat-pager" data-chat-pager="1"/)
    expect(html.indexOf('data-chat-pager="1"')).toBeLessThan(html.indexOf('data-dialogue-list="1"'))
    // 浅蓝底工具条三件套：实心小按钮 + 加粗页码 + 次级灰计数
    expect(html).toContain('↑ 加载更早消息')
    expect(html).toContain('data-load-earlier="1"')
    expect(html).toContain('data-before="50"')
    expect(html).not.toMatch(/data-load-earlier="1"[^>]*disabled/)
    // 页码口径：页 = 已加载批次（40/页），M = ceil(90/40) = 3；已加载 1 条 = 还有 2 页更早 → 第 1/3 页
    expect(html).toContain('<b class="dsh-pm-chat-page">第 1/3 页</b>')
    expect(html).toContain('已加载 1/90 条')
    expect(html).toContain('还有更早的消息未加载')
  })

  it('页码随「向上加载更早」前进：已加载 80/90（两个批次）→ 第 2/3 页', () => {
    const items = Array.from({ length: 80 }, (_v, i) => human(i + 1, '第 ' + String(i + 1) + ' 条'))
    const html = renderDialogue({ items, page: { before: 1, hasMore: true, total: 90 } }, ctx())
    expect(html).toContain('<b class="dsh-pm-chat-page">第 2/3 页</b>')
    expect(html).toContain('已加载 80/90 条')
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
    // 到底 = 最后一页
    expect(html).toContain('<b class="dsh-pm-chat-page">第 1/1 页</b>')
  })

  it('pageKnown=false：分页条降级不可用态 + 说明（不猜「没有更早」），页码不编', () => {
    const html = renderDialogue({ items: [human(1, '甲')] }, ctx())
    expect(html).toContain('data-pager-state="degraded"')
    expect(html).toMatch(/data-load-earlier="1"[^>]*disabled/)
    expect(html).toContain('分页信息不可得')
    // 页码不编（注意断言带 `<b` 前缀：容器类名 dsh-pm-chat-pg 是 dsh-pm-chat-page 的前缀）
    expect(html).not.toContain('<b class="dsh-pm-chat-page"')
    expect(html).toContain('已加载 1 条')
    // 有 hasMore 但拿不到游标：同样禁用并写明原因（不猜）
    const noCursor = renderDialogue({ items: [], page: { hasMore: true, total: 5 } }, ctx())
    expect(noCursor).toMatch(/data-load-earlier="1"[^>]*disabled/)
    expect(noCursor).toContain('没给游标')
  })

  it('页码口径常数 = 服务端 DEFAULT_LIMIT（40 条/页）', () => {
    expect(DIALOGUE_PAGE_SIZE).toBe(40)
  })
})

describe('T-11 · 过滤不变量保留：产物里不得出现工具调用 / 推理字样', () => {
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

describe('渲染纪律与注册', () => {
  it('根容器 data-panel="dialogue"；除 .chat-scroll 豁免外产物里没有 overflow: auto|scroll', () => {
    const html = renderDialogue({
      items: Array.from({ length: 40 }, (_v, i) => human(i + 1, '第 ' + String(i + 1) + ' 条')),
      page: { hasMore: true, total: 90 },
    }, ctx())
    expect(html).toContain('data-panel="dialogue"')
    expect(html).toContain('data-dialogue-loaded="40"')
    expect(html).toContain('data-dialogue-total="90"')
    expect(html).toContain('data-chat-scroll="1"')
    expect(html).not.toMatch(/overflow:\s*(auto|scroll)/)
  })

  it('注册项不变：key / label / badge', () => {
    expect(dialoguePanel.key).toBe('dialogue')
    expect(dialoguePanel.label).toBe('对话')
    expect(dialoguePanel.badge({} as never)).toBeUndefined()
    expect(dialoguePanel.render({ items: [], page: { hasMore: false, total: 0 } }, ctx()))
      .toContain('data-panel="dialogue"')
  })
})
