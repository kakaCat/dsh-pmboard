/**
 * 详情页壳（头部三块 + Tab 容器 + 懒加载 + 局部更新）· 渲染与接线用例
 * （REQ-261004222448-292a · FR-3 / FR-4 / FR-5 / FR-11 / FR-12，任务卡 t-ab048e）
 *
 * 环境：vitest 默认 node（本包**不含 jsdom**）——渲染断言一律对**字符串**做（本包 client 是
 * `buildXxx(data) => string` 的纯函数），取数编排走**注入桩**，DOM 交互走最小 duck-typed 桩
 * （与 tests/req-detail-ondemand.test.ts · tests/board-lane-scroll.test.ts 同款纪律，不引新依赖）。
 *
 * 卡验收逐条对应（用例名即判据）：
 *   ① 首屏请求数 ≤ 2（report + 默认 Tab trunk）且不含正文；② 未点过的 Tab 请求数 = 0；
 *   ③ 未激活面板不在渲染产物里；④ revision 变更只重取头部 + 当前 Tab，且当前 Tab 与草稿不变；
 *   ⑤ 终态动作按钮数为 0；⑥ 档二不含文档表 / 成本 / 提示词正文选择器。
 */
import { describe, it, expect, vi } from 'vitest'
import type { ReportAction, ReportGap, ReportHead, ReportResponse, RequirementStatus } from '../src/shared/protocol.ts'
import {
  REPORT_TABS, REPORT_TAB_KEYS, buildReportCompact, buildReportShell, buildTabBar, createReportShell,
  createReportTabs, isReportTabKey, type ReportTabCtx, type ReportTabKey,
} from '../src/client/views/report-tabs.ts'
import { GAP_DOT_SVG, ICON_STROKE_WIDTH, ICON_VIEW_BOX, TAB_ICON_SVG } from '../src/client/icons.ts'
import { buildReportBand } from '../src/client/views/report-band.ts'
import { buildReportHead } from '../src/client/views/report-head.ts'
import { applyReportSegments, captureDetailDraft, commentInputOf, draftKeyOf, panelIntentOf, restoreDetailDraft } from '../src/client/board-mount.ts'

const REQ_ID = 'REQ-261004222448-292a'
const T0 = 1_700_000_000_000

/** 计数出现次数（断言"恰好一条"比 `toContain` 更能抓到重复渲染）。 */
const countOf = (hay: string, needle: string): number => hay.split(needle).length - 1

/** 空转几拍微任务（比 setTimeout(0) 更贴合取数链的成交时机，同 req-detail-ondemand 的做法）。 */
async function tick(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve()
}

/** 手动控制结算的 promise（测"在途/迟到"必须自己决定什么时候结算）。 */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

/* --------------------------------------------------------------- 标本 */

/** 在途态标本（实施中：有操作条、有窗口跳转、有缺口）。 */
function makeReport(opts: {
  id?: string
  status?: RequirementStatus
  actions?: ReportAction[]
  gaps?: ReportGap[]
  seats?: ReportHead['seats']
  sessionJump?: ReportHead['sessionJump']
} = {}): ReportResponse {
  const id = opts.id ?? REQ_ID
  return {
    head: {
      id,
      title: '需求详情页重构：从证据面改为工作汇报',
      category: 'feature',
      promptDifficulty: 'standard',
      status: opts.status ?? 'implementing',
      blocked: false,
      createdAt: T0 - 86_400_000,
      updatedAt: T0,
      seats: opts.seats ?? [{ windowKey: 'session-owner-1', role: 'owner', joinedAt: T0 - 86_400_000 }],
      sessionJump: opts.sessionJump ?? [{ windowKey: 'session-owner-1', archived: false }],
    },
    progress: {
      stageEnteredAt: T0 - 28 * 60_000,
      stageStayedMs: 28 * 60_000,
      sinceUpdateMs: 2 * 60_000,
      tasks: { total: 11, done: 4, running: 1, todo: 6, subChainDone: 5, subChainTotal: 8 },
    },
    verdictLine: '实施段在跑 w-owner1；2 件事等人（确认设计 v2 / 接收 FR-5）',
    waitingHuman: 2,
    gaps: opts.gaps ?? [
      { severity: 'red', what: 'FR-5 未被任何任务接收', why: '没有任何任务卡引用它，实施完也不会有人发现', ref: { kind: 'clause', id: 'FR-5' } },
      { severity: 'red', what: '设计 v2 待人工确认', why: '挂起确认未作答，写路径被 REQBOARD_CONFIRM_PENDING 拦住', ref: { kind: 'confirm', id: 'design' } },
    ],
    actions: opts.actions ?? [
      { key: 'move', label: '→ 验收', to: 'accepting', consequence: '提交验收；任务全部完成时系统会自动推进', humanOnly: false },
      { key: 'cancel', label: '立项取消', consequence: '取消该需求立项（仅人可操作）', humanOnly: true },
    ],
    nextStepForAgent: '批准拆分计划后落库任务卡',
  }
}

/** 六条 Tab 载荷桩：`{available:true}` 让形状落在 `PanelResult` 的正常分支上。 */
const panelStub = (key: ReportTabKey): { available: true; marker: string } => ({ available: true, marker: key })

/**
 * 真 `TrunkResponse` 夹具（trunk 面板已于 t-9eb784 落地：喂面板桩载荷只会渲染
 * "载荷不是主干形状"的空态，接线断言就测不到"数据真的流进了面板"）。
 */
const TRUNK_SUMMARY_LINE = '接线断言用的主干摘要：由来与触发场景。'
const TRUNK_FIXTURE = {
  items: [{
    key: 'why' as const,
    source: ['doc' as const],
    summary: [TRUNK_SUMMARY_LINE],
    openRefs: [],
  }],
}

/* --------------------------------------------------------------- ① A · 纯渲染 */

describe('report-shell · 渲染产物（未激活面板不入 DOM）', () => {
  it('③ 只渲染当前面板：active=trunk 时产物里没有任何其它面板', () => {
    const html = buildReportShell(makeReport(), 'trunk')
    expect(html).toContain('data-report-shell="1"')
    expect(html).toContain('data-detail-req="' + REQ_ID + '"') // 详情容器根（草稿 capture/restore 依赖它）
    // 壳的面板包装器用 `data-tab-host`（`data-panel` 归**面板根**，见 report-tabs.ts 的 panelWrapper 注释）
    expect(countOf(html, 'data-tab-host="trunk"')).toBe(1)
    for (const key of ['docs', 'dag', 'dialogue', 'verify', 'token', 'prompts'] as const) {
      expect(html, key).not.toContain('data-tab-host="' + key + '"')
      expect(html, key).not.toContain('data-panel="' + key + '"')
    }
    // 切到 token 后反过来：trunk 的面板不在产物里（**不是**"渲染全部再 CSS 隐藏"）
    const tokenHtml = buildReportShell(makeReport(), 'token', { data: panelStub('token') })
    expect(tokenHtml).toContain('data-tab-host="token"')
    expect(tokenHtml).not.toContain('data-tab-host="trunk"')
    expect(tokenHtml).not.toContain('data-panel="trunk"')
    expect(tokenHtml).toContain('data-panel-placeholder="token"') // 桩面板的内容（t14 替换）
  })

  it('四条不变量之④：产物里不出现内层滚动容器（overflow: auto|scroll）', () => {
    for (const key of ['trunk', 'docs', 'dag', 'dialogue', 'verify', 'token', 'prompts'] as const) {
      const html = buildReportShell(makeReport(), key, { data: panelStub(key) })
      expect(html, key).not.toMatch(/overflow:\s*(auto|scroll)/)
    }
  })

  it('Tab 栏：七个同级 Tab、顺序正确（验收插在「对话」与「Token」之间）、默认选中 trunk', () => {
    expect(REPORT_TABS.map(d => d.key)).toEqual(['trunk', 'docs', 'dag', 'dialogue', 'verify', 'token', 'prompts'])
    const html = buildTabBar(makeReport(), 'trunk')
    for (const key of ['trunk', 'docs', 'dag', 'dialogue', 'verify', 'token', 'prompts'] as const) {
      expect(html).toContain('data-tab="' + key + '"')
    }
    // 次序锚（REQ-261006130057-7a43 FR-8；原型 proto-geometry verifyTabIndex1Based=5）
    expect(html.indexOf('data-tab="dialogue"')).toBeLessThan(html.indexOf('data-tab="verify"'))
    expect(html.indexOf('data-tab="verify"')).toBeLessThan(html.indexOf('data-tab="token"'))
    expect(html).toContain('class="dsh-pm-tab active" data-action="switch-tab" data-tab="trunk"')
  })

  /**
   * FR-3（TC-5）：Tab 语义四件套 + 选中恰 1 个。
   *
   * 逐项读**开标签**（而不是对整串 `toContain`）：这样"哪个属性落在哪一项上"是真被断言的——
   * 只断言整串含 `aria-selected="true"` 的话，把 `true` 挂到错误的那一项上也会绿。
   */
  it('Tab 栏语义：1 个 tablist（带 aria-label）、七项 role=tab + aria-selected + aria-controls + roving tabindex', () => {
    for (const active of REPORT_TAB_KEYS) {
      const html = buildTabBar(makeReport(), active)
      expect(countOf(html, 'role="tablist"'), active).toBe(1)
      expect(html, active).toContain('aria-label="需求详情分区"')
      // 选中恰 1 个，且等于当前键
      expect(countOf(html, 'aria-selected="true"'), active).toBe(1)
      expect(countOf(html, 'aria-selected="false"'), active).toBe(6)
      const tags = [...html.matchAll(/<button[^>]*>/g)].map(m => m[0])
      expect(tags, active).toHaveLength(REPORT_TAB_KEYS.length)
      tags.forEach((tag, i) => {
        const key = REPORT_TAB_KEYS[i]
        const on = key === active
        expect(tag, key).toContain('role="tab"')
        expect(tag, key).toContain('id="tab-' + key + '"')
        expect(tag, key).toContain('aria-controls="panel-' + key + '"')
        expect(tag, key).toContain('aria-selected="' + (on ? 'true' : 'false') + '"')
        // roving tabindex：选中 0、其余 -1
        expect(tag, key).toContain('tabindex="' + (on ? '0' : '-1') + '"')
        // 追加式（硬耦合：既有断言按属性顺序做子串匹配）：新属性一律在既有三个属性之后
        expect(tag.indexOf('data-action="switch-tab"'), key).toBeLessThan(tag.indexOf(' role="tab"'))
        expect(tag.indexOf('data-tab="'), key).toBeLessThan(tag.indexOf(' id="tab-'))
      })
      // id 形态只允许 tab-<key>（不许自增 id）
      expect([...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]), active).toEqual(REPORT_TAB_KEYS.map(k => 'tab-' + k))
    }
  })

  /** FR-1（TC-1/TC-2）：图标取唯一来源 `icons.ts`；emoji 只作为 `data-proto-icon-before` 的属性值留存。 */
  it('Tab 栏图标：七项各恰 1 个内联 SVG（逐字取 icons.ts），emoji 只活在 data-proto-icon-before', () => {
    const html = buildTabBar(makeReport(), 'trunk')
    const icons = [...html.matchAll(/<span class="dsh-pm-tab-icon"([^>]*)>([\s\S]*?)<\/span>/g)]
    expect(icons).toHaveLength(REPORT_TAB_KEYS.length)
    icons.forEach((m, i) => {
      const key = REPORT_TAB_KEYS[i]
      expect(m[2], key).toBe(TAB_ICON_SVG[key])
      expect(countOf(m[2], '<svg'), key).toBe(1)
      expect(m[2], key).toContain('aria-hidden="true"')
      expect(m[1], key).toMatch(/^ data-proto-icon-before="[^"]+"$/)
    })
    // 结构位无 emoji 文本：把属性值抹掉后，七个 emoji 一个都不该剩下
    expect(html.replace(/data-proto-icon-before="[^"]*"/g, '')).not.toMatch(/[📋📄🕸💬✅🪙🧱]/u)
  })

  /** FR-3（TC-8）：面板包装器带 tabpanel 语义，但未激活面板**仍不入 DOM**（`aria-controls` 只是稳定声明）。 */
  it('面板段：包装器 role=tabpanel + id=panel-<key> + aria-labelledby=tab-<key>；未激活面板仍不在产物里', () => {
    const html = buildReportShell(makeReport(), 'docs', { data: panelStub('docs') })
    expect(countOf(html, 'role="tabpanel"')).toBe(1)
    expect(html).toContain('role="tabpanel" id="panel-docs" aria-labelledby="tab-docs"')
    expect(html).toContain('id="tab-docs"') // labelledby 指向的那一项一定在场（Tab 栏恒常渲染）
    // 反向：aria-controls 指向未激活面板的 id，但那个面板并不在 DOM 里
    expect(html).toContain('aria-controls="panel-token"')
    expect(html).not.toContain('id="panel-token"')
    expect(html).not.toContain('data-panel="token"')
    expect(countOf(html, 'data-tab-host=')).toBe(1)
  })

  it('面板注册契约：七个键各就位，render 恒返回非空字符串（仍是桩的自证"待实现"，已落地的渲染真内容）', () => {
    const ctx: ReportTabCtx = { requirementId: REQ_ID, load: () => Promise.resolve(panelStub('trunk')), openDoc: () => {} }
    for (const def of REPORT_TABS) {
      const html = def.render({}, ctx)
      expect(typeof html, def.key).toBe('string')
      // 空串会被读成"这块没有内容"，而实际可能是"还没做"或"读不到"——两种"没有"必须分开
      expect(html.length, def.key).toBeGreaterThan(0)
      // 仍是桩的：占位符必须自报家门（且是自己的 key，不是别人的）
      if (html.includes('data-panel-placeholder')) {
        expect(html, def.key).toContain('data-panel-placeholder="' + def.key + '"')
      } else {
        // 已被 t9~t14 落地：根容器必须带自己的 data-panel（壳的包装器不再重复输出这份属性）
        expect(html, def.key).toContain('data-panel="' + def.key + '"')
      }
    }
  })

  it('角标机制：badge 有值才渲染；七个内置 def 只读服务端计数（ReportResponse 无按 Tab 计数时不编）', () => {
    const token = REPORT_TABS.find(d => d.key === 'token')
    expect(token).toBeDefined()
    const before = token!.badge
    try {
      token!.badge = () => '1.84M'
      const html = buildTabBar(makeReport(), 'trunk')
      expect(html).toContain('data-badge="token"')
      expect(html).toContain('1.84M')
    } finally {
      token!.badge = before
    }
    expect(buildTabBar(makeReport(), 'trunk')).not.toContain('data-badge=')
  })

  it('tab 键守卫：脏值不会被静默当成 trunk', () => {
    expect(isReportTabKey('token')).toBe(true)
    expect(isReportTabKey('traceability')).toBe(false)
    expect(isReportTabKey(undefined)).toBe(false)
  })
})

describe('report-head · 结论头与操作条（FR-3）', () => {
  it('身份 + 8 态阶段条 + 停留/距今 + 一句话结论 + 几件事等人', () => {
    const html = buildReportHead(makeReport())
    expect(html).toContain(REQ_ID)
    expect(html).toContain('需求详情页重构：从证据面改为工作汇报')
    expect(html).toContain('data-category="feature"')
    expect(html).toContain('分类 功能')
    expect(html).toContain('data-difficulty="standard"')
    expect(html).toContain('难度 标准')
    // 8 态阶段条（复用既有 buildProgressDots）
    expect(countOf(html, 'dsh-pm-dot-wrapper')).toBe(8)
    expect(html).toContain('停留 28 分')
    expect(html).toContain('距上次更新 2 分')
    expect(html).toContain('data-report-verdict="1"')
    expect(html).toContain('data-waiting-human="2"')
    expect(html).toContain('实施段在跑 w-owner1')
    expect(html).toContain('实施窗口下一步：批准拆分计划后落库任务卡')
  })

  it('操作条：按钮只写动作（后果进 title）、分级 + 危险动作带确认、走既有事件通道', () => {
    const html = buildReportHead(makeReport())
    expect(html).toContain('data-report-actions="1"')
    // 既有通道（不新造写路径）
    expect(html).toContain('data-action="move-req"')
    expect(html).toContain('data-to="accepting"')
    expect(html).toContain('data-action="move-req"')
    expect(html).toContain('data-to="canceled"') // cancel → move-req + to=canceled
    expect(html).toContain('data-action-key="cancel"')
    // 2026-10-05 人类验收：**说明绝不挨着按钮**（VA/Octopus 按钮内容规范）——
    // 后果进按钮 title（悬停可读全文）+ 点开后的确认框正文；常驻区只留主操作下方那一句短提示
    expect(countOf(html, '后果：')).toBe(0)
    expect(html).toContain('title="提交验收；任务全部完成时系统会自动推进"')
    expect(countOf(html, 'dsh-pm-action-consequence')).toBe(1)
    // 分级：1 个 primary（实心）+ 危险动作排最后且带 data-confirm（壳在点击那一跳弹确认）
    expect(countOf(html, 'data-action-rank="primary"')).toBe(1)
    expect(html.indexOf('data-action-rank="danger"')).toBeGreaterThan(html.indexOf('data-action-rank="primary"'))
    expect(html).toContain('data-confirm="')
    // 人工门整条只标一次（不再是逐按钮的粉色实心块）；文案按 FR-11 #3 收短
    expect(countOf(html, 'dsh-pm-human-only')).toBe(1)
    expect(html).toContain('需人工确认')
    expect(html).not.toContain('均需人工确认')
  })

  /** FR-11 #2（t-bce26d 新增断言①）：后果的**第二披露通道**必须真在，且一字不省。 */
  it('主操作的后果走 aria-describedby 指向的视觉隐藏节点（不是 hover-only）', () => {
    const html = buildReportHead(makeReport())
    const m = /aria-describedby="([^"]+)"/.exec(html)
    expect(m).not.toBeNull()
    const id = m![1]!
    expect(html).toContain('id="' + id + '"')
    const node = new RegExp('<span class="dsh-pm-action-consequence dsh-pm-sr-only" id="' + id + '">([^<]*)</span>').exec(html)
    expect(node).not.toBeNull()
    // 文本 === 服务端 consequence（不是截断过的短提示）
    expect(node![1]).toBe('提交验收；任务全部完成时系统会自动推进')
    // 视觉隐藏但**可访问**：不许用 display:none / visibility:hidden 把节点摘出可访问树
    expect(html).not.toContain('display:none')
    expect(html).not.toContain('visibility:hidden')
  })

  /** FR-13（t-bce26d 新增断言②）：详情页头部**不再有**评论输入框——删过头与没删都判红。 */
  it('详情页头部不渲染评论输入框（FR-13）；只读的最近评论入口仍在', () => {
    const base = makeReport()
    const html = buildReportHead({
      ...base,
      head: { ...base.head, comments: [{ at: T0, body: '人写过一句', by: { kind: 'human' } }] },
    })
    expect(html).not.toContain('dsh-pm-comment-form')
    expect(html).not.toContain('data-role="comment-input"')
    expect(html).not.toContain('data-action="add-comment"')
    // 删过头同样判红：只读的「最近评论」列表仍渲染
    expect(html).toContain('data-comment-list="1"')
    expect(html).toContain('人写过一句')
  })

  it('窗口跳转：每个席位一个按钮（data-jump-session + 角色标注），已归档仍可点', () => {
    const html = buildReportHead(makeReport({
      seats: [
        { windowKey: 'session-owner-1', role: 'owner', joinedAt: T0 },
        { windowKey: 'session-worker-2', role: 'worker', joinedAt: T0 },
        { windowKey: 'session-old-3', role: 'observer', joinedAt: T0 },
      ],
      sessionJump: [
        { windowKey: 'session-owner-1', archived: false },
        { windowKey: 'session-worker-2', archived: false },
        { windowKey: 'session-old-3', archived: true },
      ],
    }))
    expect(countOf(html, 'data-jump-session=')).toBe(3)
    expect(html).toContain('data-role="owner"')
    expect(html).toContain('data-role="worker"')
    expect(html).toContain('data-role="observer"')
    // 已归档**仍是可点按钮**（先恢复再打开），不是灰死按钮
    expect(html).toContain('data-jump-session="session-old-3"')
    expect(html).toContain('data-archived="true"')
    expect(html).toContain('is-archived')
  })

  it('席位表查不到角色 → 如实写「角色未知」，不猜 owner', () => {
    const html = buildReportHead(makeReport({
      seats: [],
      sessionJump: [{ windowKey: 'session-x', archived: false }],
    }))
    expect(html).toContain('data-role="unknown"')
    expect(html).toContain('角色未知')
  })

  it('⑤ 终态（archived / canceled / done）**动作按钮数为 0**：只留 ← 看板', () => {
    for (const status of ['archived', 'canceled', 'done'] as const) {
      const report = makeReport({ status, actions: [] })
      const head = buildReportHead(report)
      // 结论头里只剩一个 data-action（返回按钮）——写动作 / 窗口跳转 / 评论一个都不留
      expect(countOf(head, 'data-action="'), status).toBe(1)
      expect(head, status).toContain('data-action="back"')
      expect(head, status).not.toContain('data-action="move-req"')
      expect(head, status).not.toContain('data-action="plan-approve"')
      expect(head, status).not.toContain('data-action="verify-pass"')
      expect(head, status).not.toContain('data-action="add-comment"')
      expect(head, status).not.toContain('data-action="jump-session"')
      expect(head, status).not.toContain('data-report-actions="1"')
      expect(head, status).not.toContain('data-report-windows="1"')
      expect(head, status).toContain('终态只读')

      // 整壳里除返回与 7 个 Tab 切换（**导航**，不是动作）之外不再有别的 data-action
      const shell = buildReportShell(report, 'trunk')
      expect(countOf(shell, 'data-action="'), status).toBe(8)
      expect(shell, status).not.toContain('data-action="move-req"')
      expect(shell, status).not.toContain('data-action="add-comment"')
      expect(shell, status).not.toContain('data-report-actions="1"')
    }
  })

  it('终态仍渲染身份与结论（只读不等于空白）', () => {
    const html = buildReportHead(makeReport({ status: 'archived' }))
    expect(html).toContain(REQ_ID)
    expect(html).toContain('data-head-state="terminal"')
    expect(html).toContain('归档')
  })
})

/** T-12（REQ-261006130057-7a43 · FR-1）：头部三层 + 闸门提示条（视觉基准 = 原型 v1.5 #FR-1）。 */
describe('report-head · 头部三层 + 闸门提示条（REQ-261006130057-7a43 · T-12）', () => {
  it('三层结构：标识行 → 标题行 → 闸门提示条，按序各一', () => {
    const html = buildReportHead(makeReport())
    const ident = html.indexOf('data-head-row="ident"')
    const title = html.indexOf('data-head-row="title"')
    const gate = html.indexOf('data-gate-banner="1"')
    expect(ident).toBeGreaterThan(-1)
    expect(title).toBeGreaterThan(ident)
    expect(gate).toBeGreaterThan(title)
    // 一句话结论 / 阶段条 / 评论列表仍在三层之后（后段不在 FR-1 射程内）
    expect(html.indexOf('data-report-verdict="1"')).toBeGreaterThan(gate)
  })

  it('标识行：← 看板行首 + REQ-id + 状态/分类/难度 + 内联时间（含创建于）；席位组在其后（右置）', () => {
    const html = buildReportHead(makeReport())
    const row = html.slice(html.indexOf('data-head-row="ident"'), html.indexOf('data-head-row="title"'))
    // ← 看板在标识行内、且排在 REQ-id 之前（FR-1 把导航从旧动作行移进标识行行首）
    expect(row).toContain('data-action="back"')
    expect(row.indexOf('data-action="back"')).toBeLessThan(row.indexOf('dsh-pm-card-id'))
    expect(row).toContain('dsh-pm-card-id')
    expect(row).toContain('dsh-pm-status')
    expect(row).toContain('data-category="feature"')
    expect(row).toContain('data-difficulty="standard"')
    // 内联时间：停留/更新/创建于 同行（创建于从 D-8 的行尾右推归回时间组）
    expect(row).toContain('停留 28 分')
    expect(row).toContain('距上次更新 2 分')
    expect(row).toContain('data-created-at')
    // 席位组（窗口跳转 chips）在标识行内、落在「创建于 …」之后（行尾右置，样式层 margin-left:auto）
    expect(row).toContain('data-report-windows="1"')
    expect(row.indexOf('data-report-windows="1"')).toBeGreaterThan(row.indexOf('data-created-at'))
  })

  it('标题行：标题在前、操作按钮聚合其后（固定右侧）；按钮集合 = 现行操作条输出（不增不减）', () => {
    const html = buildReportHead(makeReport())
    const gateAt = html.indexOf('data-gate-banner="1"')
    const row = html.slice(html.indexOf('data-head-row="title"'), gateAt)
    expect(row).toContain('dsh-pm-detail-title')
    expect(row).toContain('需求详情页重构：从证据面改为工作汇报')
    // 操作区在标题节点之后（DOM 序 = 读屏序：先标题后动作）
    expect(row.indexOf('dsh-pm-detail-title')).toBeLessThan(row.indexOf('data-report-actions="1"'))
    // 按钮集合不增不减：fixture 两个动作（move + cancel），一格不多一格不少
    expect(countOf(row, 'data-action-key=')).toBe(2)
    expect(row).toContain('data-action="move-req"')
    expect(row).toContain('data-action-key="cancel"')
  })

  it('闸门提示条：waitingHuman>0 → 琥珀条含 N 与锚链「查看缺口 ↓」；锚链落点 id 在状态带缺口格', () => {
    const head = buildReportHead(makeReport()) // fixture waitingHuman = 2
    expect(head).toContain('data-gate-banner="1"')
    expect(head).toContain('需人工确认 · <b>2</b> 件缺口等人裁决，裁决前无法提交验收。')
    expect(head).toContain('data-gap-anchor="1"')
    expect(head).toContain('查看缺口 ↓')
    // 锚链 = 只读导航动作（data-action 委派 scrollIntoView；**不用 hash**——宿主 hash 信道
    // 是深链路由，同信道点 hash 有被重路由的风险，复核 P1-1）
    expect(head).toContain('data-action="scroll-gap-focus"')
    expect(head).not.toContain('href="#dsh-pm-gap-focus"')
    // 整壳里锚链两端同时成立：提示条（头部）↔ 落点 id（状态带缺口格，data-gap-focus 同格）
    const shell = buildReportShell(makeReport(), 'trunk')
    expect(shell).toContain('data-gap-anchor="1"')
    expect(shell).toContain('data-band-cell="gaps" data-gap-focus="1" id="dsh-pm-gap-focus"')
  })

  it('无缺口（waitingHuman=0 / 缺省）→ 闸门提示条整条不渲染（不留空壳）', () => {
    const zero = buildReportHead({ ...makeReport(), waitingHuman: 0, gaps: [] })
    expect(zero).not.toContain('data-gate-banner')
    expect(zero).not.toContain('查看缺口')
    const missing = buildReportHead({ ...makeReport(), waitingHuman: undefined as unknown as number })
    expect(missing).not.toContain('data-gate-banner')
  })

  it('终态：三层仍在（标识行只读化）；右端是「终态只读」说明而非动作；闸门提示条终态豁免（复核 P2-1）', () => {
    const html = buildReportHead(makeReport({ status: 'archived', actions: [] }))
    expect(html).toContain('data-head-row="ident"')
    expect(html).toContain('data-head-row="title"')
    const row = html.slice(html.indexOf('data-head-row="title"'))
    expect(row).toContain('终态只读')
    expect(row).not.toContain('data-report-actions="1"')
    // 终态无「待裁决」语义：fixture waitingHuman=2 也不渲染提示条（组件不对不自洽输入说假话）
    expect(html).not.toContain('data-gate-banner')
    // 终态「只剩 ← 看板一个 data-action」的旧判据成立（提示条不渲染，锚链按钮随之不在）
    expect(countOf(html, 'data-action="')).toBe(1)
  })
})

describe('report-band · 状态带三格（FR-3 / FR-4 / FR-5）', () => {
  it('做到哪了：阶段 + 停留 + 任务计数 + 子卡链', () => {
    const html = buildReportBand(makeReport())
    expect(html).toContain('data-band-cell="progress"')
    expect(html).toContain('实施')
    expect(html).toContain('停留 28 分')
    expect(html).toContain('4/11')
    expect(html).toContain('在跑 1')
    expect(html).toContain('子卡链 5/8')
  })

  it('缺口清单：严重度标记（SVG 圆 + 真实文本 !! / ! / ·）按严重度 + what/why + 只列前 5 条且如实说还有几条', () => {
    const gaps: ReportGap[] = [
      { severity: 'gray', what: '灰-观察项', why: '只是观察' },
      { severity: 'yellow', what: '黄-待处理项', why: '待处理' },
      { severity: 'red', what: '红-阻塞项', why: '阻塞了', ref: { kind: 'clause', id: 'FR-5' } },
      { severity: 'yellow', what: '黄-2', why: '待处理' },
      { severity: 'yellow', what: '黄-3', why: '待处理' },
      { severity: 'gray', what: '灰-2', why: '观察' },
    ]
    const html = buildReportBand(makeReport({ gaps }))
    // FR-2（REQ-261006130057-7a43 · T-13）：缺口格 = 视觉焦点——data-gap-focus 挂钩 +
    // 标题里的红色计数徽标；徽标值 = waitingHuman（fixture = 2，与 verdictLine「2 件事等人」
    // 同口径，**不是** gaps 总条数 6；总条数由「共 6 条」真文本交代）
    expect(html).toContain('data-band-cell="gaps" data-gap-focus="1"')
    expect(html).toContain('缺口（该有而没有）')
    expect(html).toContain('data-gap-count-badge="2"')
    expect(html).toContain('共 6 条')
    // FR-8 #2：严重度不再用 emoji（字形/明度由系统字型决定）——内联 SVG 圆 + **真实文本**标记
    expect(html).not.toContain('🔴')
    expect(html).not.toContain('🟡')
    expect(html).not.toContain('⚪')
    expect(countOf(html, 'dsh-pm-gap-sev')).toBe(5)
    expect(countOf(html, 'data-gap-mark=')).toBe(5)
    expect(html).toContain('data-gap-mark="red">!!<')
    expect(html).toContain('data-gap-mark="yellow">!<')
    expect(html).toContain('data-gap-mark="gray">·<')
    expect(html).toContain('红-阻塞项')
    expect(countOf(html, 'dsh-pm-gap-line')).toBe(5) // 前 5 条
    expect(html).toContain('还有 1 条未列')
    // 严重度排序：red 必须在 yellow 之前（顺序错了最该看的会掉出前 5 条）
    expect(html.indexOf('data-severity="red"')).toBeLessThan(html.indexOf('data-severity="yellow"'))
    expect(html).toContain('data-ref-kind="clause"')
  })

  it('无缺口：显式写「无缺口」，且不画空表格', () => {
    const html = buildReportBand(makeReport({ gaps: [] }))
    expect(html).toContain('无缺口')
    expect(html).toContain('data-gaps="none"')
    expect(html).not.toContain('dsh-pm-gap-line')
    expect(html).not.toContain('<table')
  })

  it('结果与成效：outcome 缺省 → 折叠一行 + 「展开说明」（T-13）；终态指向验收单而不编结论', () => {
    const inflight = buildReportBand(makeReport({ status: 'implementing' }))
    expect(inflight).toContain('尚未到验收段')
    expect(inflight).toContain('到验收段后此处给出结论')
    // T-13：未到验收段（outcome===undefined）结果格折叠为一行，不出现逐项计数
    expect(inflight).toContain('data-outcome-fold="1"')
    expect(inflight).toContain('展开说明')
    expect(inflight).toContain('收起说明')
    expect(inflight).not.toContain('data-outcome-passed')
    expect(inflight).not.toContain('data-outcome-failed')
    const accepting = buildReportBand(makeReport({ status: 'accepting' }))
    expect(accepting).toContain('验收中')
    expect(accepting).toContain('data-outcome-fold="1"')
    const archived = buildReportBand(makeReport({ status: 'archived' }))
    expect(archived).toContain('已归档')
    expect(archived).toContain('验收单')
    expect(archived).toContain('data-outcome-fold="1"')
    expect(archived).not.toContain('尚未到验收段')
    // 取消态：没有验收结论可给，也没有更多说明可展开——不渲染折叠
    const canceled = buildReportBand(makeReport({ status: 'canceled' }))
    expect(canceled).toContain('已取消：无验收结论')
    expect(canceled).not.toContain('data-outcome-fold')
  })
})

describe('report-shell · 降级三态（FR-12）', () => {
  const cases: Array<[string, string]> = [
    ['port-unavailable', '不可用（端口未装配）'],
    ['file-missing', '文件缺失'],
    ['ledger-unreadable', '不可用（台账读不到）'],
    ['no-snapshot', '无 token 快照'],
  ]
  for (const [reason, text] of cases) {
    it('降级（' + reason + '）→ 「' + text + '」而不是 0 / 留白', () => {
      const html = buildReportShell(makeReport(), 'docs', {
        data: { available: false, reason: reason as 'port-unavailable', note: '端口没接上' },
      })
      expect(html).toContain(text)
      expect(html).toContain('端口没接上')
      expect(html).toContain('data-panel-degraded="' + reason + '"')
      // 反例：不得拿 0 冒充"未知/未采集"
      expect(html).not.toMatch(/>0</)
    })
  }

  it('面板失败态：给原因 + 重试出口（不留在没有出路的 loading）', () => {
    const html = buildReportShell(makeReport(), 'dag', { data: undefined })
    expect(html).toContain('DAG加载中…')
  })
})

describe('档二（会话内面板）· ⑥ 不含文档表 / 成本 / 提示词正文选择器', () => {
  it('档二 = 头部 + 状态带：结构性不含任何 Tab 面板与禁用选择器', () => {
    const html = buildReportCompact(makeReport())
    expect(html).toContain('data-report-compact="1"')
    expect(html).toContain('data-report-head="1"')
    expect(html).toContain('data-report-band="1"')
    expect(html).not.toContain('data-report-tabs="1"')
    expect(html).not.toContain('data-panel=')
    expect(html).not.toContain('data-panel-placeholder=')
    // 文档表 / 成本 / DAG 明细 / 提示词正文 的选择器一概不出现
    expect(html).not.toContain('dsh-pm-doc-list')
    expect(html).not.toContain('dsh-pm-tok-table')
    expect(html).not.toContain('dsh-pm-dag')
    expect(html).not.toContain('<pre')
    // 评论框：会话里已有输入框，档二不再放一个（避免"评论"与"发消息"混淆）
    expect(html).not.toContain('data-role="comment-input"')
    // 但操作条与窗口跳转保留（"我该做什么"是档二的核心）
    expect(html).toContain('data-report-actions="1"')
    expect(html).toContain('data-report-windows="1"')
  })
})

/* --------------------------------------------------------------- B · 控制器（注入桩） */

/** 取数桩：记录调用次序（`calls` 里就是"请求数"）。 */
function harness(opts: {
  reportResult?: unknown
  reportError?: unknown
  panels?: Partial<Record<ReportTabKey, unknown>>
  tokenPromise?: Promise<unknown>
} = {}) {
  const calls: string[] = []
  const shell = createReportShell({
    requirementId: REQ_ID,
    loadReport: () => {
      calls.push('report')
      if (opts.reportError !== undefined) return Promise.reject(opts.reportError)
      return Promise.resolve((opts.reportResult ?? makeReport()) as ReportResponse)
    },
    load: (key) => {
      calls.push(key)
      if (key === 'token' && opts.tokenPromise !== undefined) return opts.tokenPromise as Promise<never>
      const preset = opts.panels?.[key]
      return Promise.resolve((preset ?? panelStub(key)) as never)
    },
    openDoc: () => {},
    revision: 1,
  })
  return { calls, shell }
}

describe('report-shell 控制器 · 首屏与懒加载（①②）', () => {
  it('① 首屏恰 2 个请求（report + 默认 Tab trunk），响应不含正文，反复 ensure 不放大', async () => {
    const h = harness()
    h.shell.ensure()
    await tick()
    // 视图每次重绘都会无脑调 ensure（幂等）：不得因此多打请求
    h.shell.ensure()
    h.shell.ensure()
    await tick()
    expect(h.calls).toEqual(['report', 'trunk'])
    expect(h.shell.headLoadCount()).toBe(1)
    expect(h.shell.loadCount('trunk')).toBe(1)
    // 首屏不取正文：没有 /file、没有文档正文、没有提示词正文
    expect(h.calls).not.toContain('file')
    expect(h.shell.html()).not.toContain('<pre')
    expect(h.shell.active()).toBe('trunk')
  })

  it('② 未点过的 Tab 请求数 = 0；切过去才请求（且只请求那一个）', async () => {
    const h = harness()
    h.shell.ensure()
    await tick()
    for (const key of ['docs', 'dag', 'dialogue', 'verify', 'token', 'prompts'] as const) {
      expect(h.shell.loadCount(key), key).toBe(0)
    }
    h.shell.select('token')
    await tick()
    expect(h.shell.loadCount('token')).toBe(1)
    for (const key of ['docs', 'dag', 'dialogue', 'verify', 'prompts'] as const) {
      expect(h.shell.loadCount(key), key).toBe(0)
    }
    expect(h.shell.html()).toContain('data-tab-host="token"')
    expect(h.shell.html()).not.toContain('data-tab-host="docs"')
  })

  it('③ 切 Tab 同一 revision 内命中缓存：切回不重复请求', async () => {
    const h = harness()
    h.shell.ensure()
    await tick()
    h.shell.select('token')
    await tick()
    h.shell.select('trunk') // 切回默认 Tab（revision 未变）
    h.shell.select('token') // 再切回来
    await tick()
    expect(h.shell.loadCount('token')).toBe(1)
    expect(h.shell.loadCount('trunk')).toBe(1)
    expect(h.calls).toEqual(['report', 'trunk', 'token'])
    expect(h.shell.active()).toBe('token')
  })

  it('④ revision 变更：只重取「头部 + 当前 Tab」，其它 Tab 请求数不变', async () => {
    const h = harness()
    h.shell.ensure()
    await tick()
    h.shell.select('token')
    await tick()
    expect(h.calls).toEqual(['report', 'trunk', 'token'])

    h.shell.setRevision(2)
    await tick()
    expect(h.shell.headLoadCount()).toBe(2)          // 头部重取
    expect(h.shell.loadCount('token')).toBe(2)       // 当前 Tab 重取
    expect(h.shell.loadCount('trunk')).toBe(1)       // 其它 Tab：一次都不多发
    expect(h.shell.loadCount('docs')).toBe(0)
    expect(h.shell.active()).toBe('token')           // 当前 Tab 不变
    // 变更后再点别的 Tab：按新 revision 取（不是拿旧 revision 的缓存顶）
    h.shell.select('docs')
    await tick()
    expect(h.shell.loadCount('docs')).toBe(1)
  })
})

describe('report-shell 控制器 · 降级 / 失败 / 重试 / 卸载', () => {
  it('降级响应按 reason 说人话；不自动重试，retry 才重取', async () => {
    const h = harness({ panels: { docs: { available: false, reason: 'ledger-unreadable', note: '台账分片读不到' } } })
    h.shell.ensure()
    await tick()
    h.shell.select('docs')
    await tick()
    expect(h.shell.html()).toContain('不可用（台账读不到）')
    expect(h.shell.html()).toContain('台账分片读不到')
    expect(h.shell.loadCount('docs')).toBe(1)
    // 反复 select / ensure 不得自动重试
    h.shell.select('docs')
    h.shell.select('trunk')
    h.shell.select('docs')
    await tick()
    expect(h.shell.loadCount('docs')).toBe(1)
    h.shell.retry()
    await tick()
    expect(h.shell.loadCount('docs')).toBe(2)
  })

  it('失败态：给原因与重试出口，不自动重试', async () => {
    const calls: string[] = []
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => { calls.push('report'); return Promise.resolve(makeReport()) },
      load: (key) => { calls.push(key); return key === 'dag' ? Promise.reject(new Error('HTTP 500')) : Promise.resolve(panelStub(key)) },
      openDoc: () => {},
      revision: 1,
    })
    shell.ensure()
    await tick()
    shell.select('dag')
    await tick()
    expect(shell.html()).toContain('HTTP 500')
    expect(shell.html()).toContain('data-action="report-panel-retry"')
    shell.ensure()
    await tick()
    expect(shell.loadCount('dag')).toBe(1)
    shell.retry()
    await tick()
    expect(shell.loadCount('dag')).toBe(2)
  })

  it('端点未接线（形状不符）：判 unsupported 且**不再发默认 Tab 请求**（旧服务端零额外请求）', async () => {
    const h = harness({ reportResult: { revision: 9, requirements: [], tasks: [] } })
    h.shell.ensure()
    await tick()
    expect(h.shell.head().phase).toBe('unsupported')
    h.shell.ensure()
    await tick()
    expect(h.shell.loadCount('trunk')).toBe(0)
    expect(h.calls).toEqual(['report'])
  })

  it('report 404 → notFound（交给旧详情页兜底），且不自动重试', async () => {
    const h = harness({ reportError: Object.assign(new Error('HTTP 404'), { status: 404 }) })
    h.shell.ensure()
    await tick()
    expect(h.shell.head().phase).toBe('error')
    expect(h.shell.head().notFound).toBe(true)
    h.shell.ensure()
    await tick()
    expect(h.shell.headLoadCount()).toBe(1)
    h.shell.retryHead()
    await tick()
    expect(h.shell.headLoadCount()).toBe(2)
  })

  it('report 降级（台账读不到）：头部与状态带如实说，且不回落旧页（不是"未接线"）', async () => {
    const h = harness({ reportResult: { available: false, reason: 'ledger-unreadable', note: '台账读不到' } })
    h.shell.ensure()
    await tick()
    expect(h.shell.head().phase).toBe('degraded')
    expect(h.shell.html()).toContain('不可用（台账读不到）')
    // 降级**不是**"端点未接线"：页壳照常在（board-mount 不会回落旧页），缺口/进度三格各有说辞
    expect(h.shell.html()).toContain('data-report-shell="1"')
    expect(h.shell.html()).toContain('data-head-state="degraded"')
    expect(h.shell.html()).toContain('data-report-band="placeholder"')
  })

  it('detach 后迟到的面板响应不得写回', async () => {
    const d = deferred<{ available: true; marker: string }>()
    const h = harness({ tokenPromise: d.promise })
    h.shell.ensure()
    await tick()
    h.shell.select('token')
    expect(h.shell.html()).toContain('Token加载中…')
    h.shell.detach()
    d.resolve({ available: true, marker: 'token' })
    await tick()
    expect(h.shell.html()).not.toContain('data-panel-placeholder="token"')
  })
})

describe('report-shell 控制器 · 「加载更早」分页合并（FR-11 #6）', () => {
  /** 分页载荷：items 按时间升序；page.before = 再往前取的游标。 */
  const page = (items: string[], before: number, hasMore = true) => ({
    available: true as const,
    items: items.map((t, i) => ({ kind: 'human' as const, at: before - i, text: t })),
    page: { before, hasMore, total: 99 },
  })

  it('合并：更早的一页**前插**、page 用更早那页的、缓存被更新成合并后的数据（切走再切回不丢）', async () => {
    const current = page(['新-2', '新-1'], 300)
    const older = page(['旧-2', '旧-1'], 100)
    const calls: Array<{ key: string; before?: number }> = []
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => Promise.resolve(makeReport()),
      load: (key, params) => {
        calls.push({ key, ...(params?.before === undefined ? {} : { before: params.before }) })
        return Promise.resolve(key === 'dialogue' && params?.before !== undefined ? older : current)
      },
      openDoc: () => {},
      revision: 1,
    })
    shell.ensure()
    await tick()
    shell.select('dialogue')
    await tick()
    expect(shell.html()).toContain('新-2')

    shell.loadEarlier(300)
    await tick()
    expect(calls).toEqual([{ key: 'trunk' }, { key: 'dialogue' }, { key: 'dialogue', before: 300 }])
    const merged = shell.html()
    // 前插：更早的在前（同一条时间线）
    expect(merged.indexOf('旧-1')).toBeLessThan(merged.indexOf('新-1'))
    expect(merged.indexOf('新-1')).toBeLessThan(merged.indexOf('新-2'))
    // 切走再切回：命中缓存（不再请求），且合并结果还在
    shell.select('trunk')
    shell.select('dialogue')
    await tick()
    expect(shell.loadCount('dialogue')).toBe(2)
    expect(shell.html()).toContain('旧-1')
  })

  it('游标缺省取当前载荷的 page.before；服务端没给游标时**不猜**，只留一行说明', async () => {
    const noCursor = { available: true as const, items: [{ kind: 'human' as const, at: 1, text: 'X' }], page: { hasMore: true, total: 9 } }
    const calls: Array<number | undefined> = []
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => Promise.resolve(makeReport()),
      load: (key, params) => { calls.push(params?.before); return Promise.resolve(key === 'dialogue' ? noCursor : panelStub(key)) },
      openDoc: () => {},
      revision: 1,
    })
    shell.ensure()
    await tick()
    shell.select('dialogue')
    await tick()
    shell.loadEarlier() // 不给游标 → 应回落到载荷的 page.before（这里没有）
    await tick()
    expect(shell.loadCount('dialogue')).toBe(1) // 没发第二次请求
    expect(shell.html()).toContain('加载更早不可用：服务端未给游标（page.before）')
    expect(calls.filter(c => c !== undefined)).toEqual([])
  })

  it('合并去重：同一 (at, kind, text) 只留一条；加载失败保留已读内容 + 一行原因', async () => {
    const dup = { at: 5, kind: 'human' as const, text: '重复条目' }
    const current = { available: true as const, items: [dup, { at: 6, kind: 'human' as const, text: '新' }], page: { before: 10, hasMore: true, total: 3 } }
    let fail = false
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => Promise.resolve(makeReport()),
      load: (key, params) => {
        if (key !== 'dialogue') return Promise.resolve(panelStub(key))
        if (params?.before === undefined) return Promise.resolve(current)
        if (fail) return Promise.reject(new Error('HTTP 500'))
        return Promise.resolve({ available: true, items: [dup, { at: 1, kind: 'human' as const, text: '更早' }], page: { before: 1, hasMore: false, total: 3 } })
      },
      openDoc: () => {},
      revision: 1,
    })
    shell.ensure()
    await tick()
    shell.select('dialogue')
    await tick()
    shell.loadEarlier(10)
    await tick()
    // 去重按 (at, kind, text)：同一条消息只渲染一份（「重复条目」正文只出现一次）
    expect(countOf(shell.html(), '重复条目')).toBe(1)
    expect(shell.html()).toContain('更早')

    // 再取一次失败：内容**不清空**，只在上面留一行原因
    fail = true
    const before = shell.html()
    const cursor = 1 // 合并后 page.before = 更早那页的 1
    shell.loadEarlier(cursor)
    await tick()
    expect(shell.html()).toContain('加载更早失败：HTTP 500')
    expect(shell.html()).toContain('重复条目') // 已读内容还在
    expect(shell.html().length).toBeGreaterThan(before.length)
  })
})

describe('report-shell · 点开正文的委派（只由壳接一处）', () => {
  it('壳的 attach：命中 [data-open-doc] → ctx.openDoc(path)；无 DOM 能力的根静默跳过', () => {
    const opened: string[] = []
    const handlers = new Map<string, (ev: Event) => void>()
    const removed: string[] = []
    const root = {
      addEventListener: (t: string, h: (ev: Event) => void) => { handlers.set(t, h) },
      removeEventListener: (t: string) => { removed.push(t) },
    } as unknown as HTMLElement
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => Promise.resolve(makeReport()),
      load: (key) => Promise.resolve(panelStub(key)),
      openDoc: (path) => { opened.push(path) },
      revision: 1,
    })
    expect(() => shell.attach({} as unknown as HTMLElement)).not.toThrow() // 无 addEventListener：静默
    const detach = shell.attach(root)
    // 两个委派：点开正文（click）+ Tab 组方向键（keydown，FR-3 #3/#4）；
    // input 委派已随对话检索框一并删除（REQ-261006130057-7a43 · D-6 只读）
    expect([...handlers.keys()].sort()).toEqual(['click', 'keydown'])
    const click = handlers.get('click')!
    const openBtn = { dataset: { openDoc: 'docs/requirements/REQ-x/requirement.md' }, getAttribute: () => null }
    click({ target: { closest: (sel: string) => (sel === '[data-open-doc]' ? openBtn : null) } } as unknown as Event)
    expect(opened).toEqual(['docs/requirements/REQ-x/requirement.md'])
    // 不是本链的元素一律不碰：特别是旧通道 `data-action="open-doc"`（板面上由 board-mount 处理），
    // 属性名不同 → 天然不撞；这条断言把它钉住（否则点一下会开两次）
    const legacyOpenBtn = { dataset: { action: 'open-doc', path: 'docs/legacy.md' } }
    click({ target: { closest: (sel: string) => (sel === '[data-open-doc]' ? null : null), dataset: legacyOpenBtn.dataset } } as unknown as Event)
    expect(opened).toHaveLength(1)
    click({ target: { closest: () => null, dataset: legacyOpenBtn.dataset } } as unknown as Event)
    expect(opened).toHaveLength(1)
    detach()
    expect(removed.sort()).toEqual(['click', 'keydown'])
  })

  /**
   * FR-3 #3/#4（TC-6）：roving tabindex 的另一半——组内方向键。
   *
   * 桩刻意只实现 `addEventListener` / `querySelector`：键盘分支必须能在**没有真 DOM** 的环境里
   * 断言，且它只能按既有 `data-action="switch-tab"` + `data-tab` 定位（新增的 `aria-*` 不许驱动行为）。
   */
  it('Tab 组方向键：←/→ 相邻、Home/End 首尾、端点不回绕；切换点的是既有 switch-tab 那一项', async () => {
    const handlers = new Map<string, (ev: Event) => void>()
    const clicked: string[] = []
    const focused: string[] = []
    const selectors: string[] = []
    type Stub = { click: () => void; focus: () => void }
    const stubOf = (k: ReportTabKey): Stub => ({ click: () => { clicked.push(k) }, focus: () => { focused.push(k) } })
    const root = {
      addEventListener: (t: string, h: (ev: Event) => void) => { handlers.set(t, h) },
      removeEventListener: () => {},
      querySelector: (sel: string) => {
        selectors.push(sel)
        const m = /data-tab="([^"]+)"/.exec(sel)
        return m === null || !isReportTabKey(m[1]) ? null : stubOf(m[1])
      },
    } as unknown as HTMLElement
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => Promise.resolve(makeReport()),
      load: (key) => Promise.resolve(panelStub(key)),
      openDoc: () => {},
      revision: 1,
    })
    shell.attach(root)
    const keydown = handlers.get('keydown')!
    expect(typeof keydown).toBe('function')
    let prevented = 0
    const press = (key: string, from: ReportTabKey, onTab = true): Event => ({
      key,
      target: onTab ? { closest: (sel: string) => (sel === '[data-action="switch-tab"][data-tab]' ? { dataset: { tab: from }, getAttribute: () => null } : null) } : { closest: () => null },
      preventDefault: () => { prevented += 1 },
    } as unknown as Event)

    keydown(press('ArrowRight', 'trunk'))
    expect(clicked).toEqual(['docs'])
    expect(focused).toEqual(['docs']) // 切完立刻把焦点交给新项（roving tabindex）
    await tick()
    expect(focused).toEqual(['docs', 'docs']) // 段重绘是微任务：再补一拍，焦点不丢

    keydown(press('End', 'trunk'))
    expect(clicked).toEqual(['docs', 'prompts'])
    keydown(press('Home', 'prompts'))
    expect(clicked).toEqual(['docs', 'prompts', 'trunk'])

    // 端点不回绕：首项按 ← / 末项按 → 不动（但仍吃掉默认行为，免得页面跟着滚）
    const before = clicked.length
    const p0 = prevented
    keydown(press('ArrowLeft', 'trunk'))
    keydown(press('ArrowRight', 'prompts'))
    expect(clicked).toHaveLength(before)
    expect(prevented).toBe(p0 + 2)
    // 与"原地不动"同款：Home 已在首项时不重绘
    keydown(press('Home', 'trunk'))
    expect(clicked).toHaveLength(before)

    // 与本组无关的按键 / 不在 Tab 上的按键：一律不碰
    keydown(press('ArrowDown', 'trunk'))
    keydown(press('a', 'trunk'))
    keydown(press('ArrowRight', 'trunk', false))
    expect(clicked).toHaveLength(before)
    // 写路径没新造：定位只用既有两个属性（data-action + data-tab），不看任何新增 aria-*
    expect(selectors.length).toBeGreaterThan(0)
    expect(selectors.every(s => /^\[data-action="switch-tab"\]\[data-tab="[a-z]+"\]$/.test(s))).toBe(true)
  })

  /**
   * 方向键 × 段重绘：真实链路里最容易悄悄坏掉的一跳。
   *
   * 切 Tab 会让控制器 `notify()` → `board-mount` 排一个**微任务**重绘，Tab 栏整段 innerHTML 被换掉
   * （旧节点连焦点一起丢，`document.activeElement` 掉回 body）。桩因此按"节点会被整代换掉"来建：
   * `querySelector` 每次取**当前一代**的节点，并对每代记名（`docs#1` / `docs#2`）。
   * 判据 = 最后一次焦点落在**重绘后**那一代上——这正是"按键后焦点与 selected 同时前移"的前提。
   */
  it('Tab 组方向键 × 段重绘：节点被换掉后焦点仍落在新一代选中项上（微任务补焦）', async () => {
    const handlers = new Map<string, (ev: Event) => void>()
    const clicked: string[] = []
    const focused: string[] = []
    let ctl: { select: (k: ReportTabKey) => void } | undefined
    let gen = 0
    let live: Array<{ key: ReportTabKey; click: () => void; focus: () => void }> = []
    const render = (): void => {
      gen += 1
      const at = gen
      live = REPORT_TAB_KEYS.map(k => ({
        key: k,
        // 等价于 board-mount 的 `case 'switch-tab'`：读 data-tab → 交给控制器（既有唯一写路径）
        click: () => { clicked.push(k); ctl?.select(k) },
        focus: () => { focused.push(k + '#' + String(at)) },
      }))
    }
    render()
    const root = {
      addEventListener: (t: string, h: (ev: Event) => void) => { handlers.set(t, h) },
      removeEventListener: () => {},
      querySelector: (sel: string) => live.find(t => sel.includes('data-tab="' + t.key + '"')) ?? null,
    } as unknown as HTMLElement
    const tabs = createReportTabs({
      requirementId: REQ_ID,
      load: (key) => Promise.resolve(panelStub(key)),
      openDoc: () => {},
      // 真宿主是 `scheduleRender()`（微任务）；这里同款，才能复现"重绘排在按键处理之后"
      onChange: () => { void Promise.resolve().then(render) },
    })
    ctl = tabs
    tabs.attach(root)
    const keydown = handlers.get('keydown')!
    keydown({
      key: 'ArrowRight',
      target: { closest: (sel: string) => (sel === '[data-action="switch-tab"][data-tab]' ? { dataset: { tab: 'trunk' }, getAttribute: () => null } : null) },
      preventDefault: () => {},
    } as unknown as Event)
    expect(clicked).toEqual(['docs']) // 一次按键 = 一次既有通道调用（不额外造第二条写路径）
    expect(focused).toEqual(['docs#1']) // 当场给焦点（旧节点还在）
    await tick()
    // 重绘后**再补一拍**：最后一次焦点必须落在重绘后那一代节点上（第几代由宿主的 scheduleRender 决定，
    // 这里只钉"不是第 1 代"——钉死代数会把"宿主合并了几拍重绘"变成断言，那是实现细节不是判据）
    const last = focused[focused.length - 1] ?? ''
    expect(last).toMatch(/^docs#[2-9]\d*$/)
    expect(focused.filter(f => f === 'docs#1')).toHaveLength(1)
    expect(tabs.active()).toBe('docs')
  })

  it('壳的 attach：危险动作（data-confirm）先弹确认；拒绝就拦下点击（preventDefault + stopPropagation）', () => {
    const handlers = new Map<string, (ev: Event) => void>()
    const root = {
      addEventListener: (t: string, h: (ev: Event) => void) => { handlers.set(t, h) },
      removeEventListener: () => {},
    } as unknown as HTMLElement
    let opened = 0
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => Promise.resolve(makeReport()),
      load: (key) => Promise.resolve(panelStub(key)),
      openDoc: () => { opened += 1 },
      revision: 1,
    })
    shell.attach(root)
    const click = handlers.get('click')!
    let prevented = 0
    let stopped = 0
    const mkEvent = (el: unknown): Event => ({
      target: {
        closest: (sel: string) => (sel === '[data-confirm]' ? el : null),
      },
      preventDefault: () => { prevented += 1 },
      stopPropagation: () => { stopped += 1 },
    } as unknown as Event)
    const danger = { dataset: { confirm: '「取消需求」：取消后需求移出在途泳道。确定执行吗？' }, getAttribute: () => null }

    // 宿主（node 环境）没有 window.confirm → **放行**（点了没反应比没有确认更坏）
    click(mkEvent(danger))
    expect(prevented).toBe(0)

    const g = globalThis as unknown as { window?: unknown }
    const prev = g.window
    try {
      g.window = { confirm: () => false }
      click(mkEvent(danger))
      expect(prevented).toBe(1)
      expect(stopped).toBe(1)
      g.window = { confirm: () => true }
      click(mkEvent(danger))
      expect(prevented).toBe(1) // 确认通过：原样冒泡，交给既有通道
    } finally {
      g.window = prev
    }
    expect(opened).toBe(0) // 这条链子只管确认，不替通道开正文
  })

  it('壳的 attach：对话检索已删（REQ-261006130057-7a43 · D-6 只读），不再挂 input 监听', () => {
    const handlers = new Map<string, (ev: Event) => void>()
    const root = {
      addEventListener: (t: string, h: (ev: Event) => void) => { handlers.set(t, h) },
      removeEventListener: () => {},
    } as unknown as HTMLElement
    const shell = createReportShell({
      requirementId: REQ_ID,
      loadReport: () => Promise.resolve(makeReport()),
      load: (key) => Promise.resolve(panelStub(key)),
      openDoc: () => {},
      revision: 1,
    })
    shell.attach(root)
    // 只读历史记录：面板内没有输入控件，壳不再接 input 就地过滤（不留死代码）
    expect(handlers.has('input')).toBe(false)
    expect(handlers.has('click')).toBe(true) // data-open-doc 委派仍在
    expect(handlers.has('keydown')).toBe(true) // Tab 方向键仍在
  })

  it('board-mount 不再接 [data-open-doc]（否则点一下开两次）', () => {
    const button = {
      dataset: { openDoc: 'docs/x.md' },
      closest: (sel: string) => (sel === '[data-open-doc]' ? button : null),
    }
    expect(panelIntentOf(button as unknown as Element)).toBeUndefined()
  })

  it('「加载更早」意图：读 data-before；缺了/非法就不带游标（由壳回落到 page.before）', () => {
    const mk = (before?: string): Element => {
      const el = {
        dataset: before === undefined ? {} : { before },
        closest: (sel: string) => (sel === '[data-load-earlier]' ? el : null),
      }
      return el as unknown as Element
    }
    expect(panelIntentOf(mk('120'))).toEqual({ kind: 'load-earlier', cursor: 120 })
    expect(panelIntentOf(mk())).toEqual({ kind: 'load-earlier' })
    expect(panelIntentOf(mk('abc'))).toEqual({ kind: 'load-earlier' })
    // 跟它无关的元素：不给意图（不给"点了没反应"埋雷）
    expect(panelIntentOf({ closest: () => null } as unknown as Element)).toBeUndefined()
  })
})

describe('board-mount · 评论草稿按表单分槽（两个评论框不互相踩）', () => {
  it('commentInputOf 取**被点按钮所在表单**里的输入框，而不是页面第一个', () => {
    const panelInput = { value: '对话 Tab 里写的' }
    const headInput = { value: '' }
    const panelForm = { querySelector: (sel: string) => (sel === '[data-role="comment-input"]' ? panelInput : null) }
    const button = { closest: (sel: string) => (sel === '.dsh-pm-comment-form' ? panelForm : null) }
    const root = { querySelector: () => headInput } as unknown as HTMLElement
    expect(commentInputOf(button as unknown as Element, root)).toBe(panelInput)
    // 按钮不在任何表单里（旧结构）→ 回落整页第一个，行为与改造前一致
    const orphan = { closest: () => null }
    expect(commentInputOf(orphan as unknown as Element, root)).toBe(headInput)
  })

  it('draftKeyOf：显式 data-draft-key 优先；否则按**所在面板**分槽（切 Tab 不换槽、不互相踩）', () => {
    const head = { dataset: { draftKey: 'head' }, closest: () => null }
    expect(draftKeyOf(head as unknown as Element, 0)).toBe('head')
    const inDialogue = {
      dataset: {},
      closest: (sel: string) => (sel === '[data-panel]' ? { getAttribute: () => 'dialogue' } : null),
    }
    expect(draftKeyOf(inDialogue as unknown as Element, 1)).toBe('panel:dialogue')
    const inHead = { dataset: {}, closest: (sel: string) => (sel === '[data-report-head]' ? {} : null) }
    expect(draftKeyOf(inHead as unknown as Element, 0)).toBe('head')
    expect(draftKeyOf({ dataset: {}, closest: () => null } as unknown as Element, 3)).toBe('draft-3')
  })

  it('capture/restore：两个表单各存各的，切走再切回能把面板里的草稿取回来', () => {
    const headInput = { value: '头部的字' }
    const panelInput = { value: '' }
    const headForm = {
      dataset: { draftKey: 'head' },
      querySelector: (sel: string) => (sel === '[data-role="comment-input"]' ? headInput : null),
    }
    const panelForm = {
      dataset: {},
      closest: (sel: string) => (sel === '[data-panel]' ? { getAttribute: () => 'dialogue' } : null),
      querySelector: (sel: string) => (sel === '[data-role="comment-input"]' ? panelInput : null),
    }
    const detail: {
      dataset: { detailReq: string }
      querySelector: (sel: string) => unknown
      querySelectorAll: (sel: string) => unknown[]
    } = {
      dataset: { detailReq: REQ_ID },
      querySelector: (sel: string) => (sel === '.dsh-pm-tab.active' ? { dataset: { tab: 'dialogue' } } : null),
      querySelectorAll: (sel: string) => (sel === '.dsh-pm-comment-form' ? [headForm, panelForm] : []),
    }
    const root = { querySelector: (sel: string) => (sel.startsWith('.dsh-pm-detail[data-detail-req') ? detail : null) }

    const draft = captureDetailDraft(root as unknown as HTMLElement)
    expect(draft?.comment).toBe('头部的字')
    expect(draft?.comments['panel:dialogue']).toBe('')
    if (draft === undefined) throw new Error('captureDetailDraft 应返回草稿')

    // 模拟"切到别的 Tab"：对话表单暂时不在 DOM 里，只有头部那个
    panelInput.value = '对话 Tab 里写的'
    captureDetailDraft(root as unknown as HTMLElement)
    const forms = { value: [] as unknown[] }
    forms.value = [headForm]
    detail.querySelectorAll = (sel: string) => (sel === '.dsh-pm-comment-form' ? forms.value : [])
    headInput.value = ''
    restoreDetailDraft(root as unknown as HTMLElement, draft)
    expect(headInput.value).toBe('头部的字') // 头部槽位独立，不被面板草稿覆盖

    // 切回对话 Tab：表单是新节点、值为空 → 从记忆里取回
    const freshPanelInput = { value: '' }
    const freshPanelForm = {
      dataset: {},
      closest: (sel: string) => (sel === '[data-panel]' ? { getAttribute: () => 'dialogue' } : null),
      querySelector: () => freshPanelInput,
    }
    // 模拟"切走再切回"：本次快照里**没有**对话那个槽位（切走时表单不在 DOM 里），
    // 回填只能来自模块级记忆——这正是"两个框各有各的槽、且切走再切回不丢字"的判据
    forms.value = [headForm, freshPanelForm]
    restoreDetailDraft(root as unknown as HTMLElement, { ...draft, comments: { head: '头部的字' } })
    expect(freshPanelInput.value).toBe('对话 Tab 里写的')
    expect(headInput.value).toBe('头部的字') // 头部槽位照旧回填，两边互不覆盖
  })
})

/* --------------------------------------------------------------- C · 分段局部更新 + 接线 */

/** 段桩：记录写入次数（"没变的段连 DOM 都不碰"靠它断言）。 */
interface SegStub { innerHTML: string; writes: number }

function segStub(): SegStub {
  const s = { innerHTML: '', writes: 0 } as SegStub
  let v = ''
  Object.defineProperty(s, 'innerHTML', {
    get: () => v,
    set: (next: string) => { v = next; s.writes += 1 },
  })
  return s
}

/**
 * 分段替换用最小 DOM 桩：只认 `applyReportSegments` / `captureDetailDraft` /
 * `restoreDetailDraft` 真正查的那几个选择器（本包无 jsdom，同 board-lane-scroll 的桩法）。
 */
function stubDetailDom() {
  const segs = { head: segStub(), band: segStub(), tabs: segStub(), panel: segStub() }
  const input = { value: '' }
  const toggles: string[] = []
  const activeTab = { dataset: { tab: 'token' } }
  const tabs = [{ dataset: { tab: 'trunk' } }, { dataset: { tab: 'token' } }]
    .map(t => ({ ...t, classList: { toggle: (name: string, on?: boolean) => { toggles.push(t.dataset.tab + ':' + name + ':' + String(on)) } } }))
  const detail = {
    dataset: { detailReq: REQ_ID },
    querySelector: (sel: string): unknown =>
      sel === '[data-role="comment-input"]' ? input
        : sel === '.dsh-pm-tab.active' ? activeTab
          : null,
    querySelectorAll: (sel: string): unknown[] => (sel === '.dsh-pm-tab' ? tabs : []),
  }
  const container = {
    innerHTML: '',
    querySelector: (sel: string): unknown => {
      const m = /^\[data-report-seg="(\w+)"\]$/.exec(sel)
      if (m !== null) return segs[m[1] as keyof typeof segs]
      if (sel.startsWith('.dsh-pm-detail[data-detail-req')) return detail
      return null
    },
  }
  return { container, segs, input, toggles }
}

describe('board-mount · 分段局部更新（④）', () => {
  it('只替换内容变化的段：没变的段不写 DOM，草稿保留，当前 Tab 不被回填改写', () => {
    const dom = stubDetailDom()
    dom.segs.head.innerHTML = 'HEAD-1'
    dom.segs.band.innerHTML = 'BAND-1'
    dom.segs.tabs.innerHTML = 'TABS-1'
    dom.segs.panel.innerHTML = 'PANEL-1'
    // 评论框里人打了一半的字（草稿只活在 DOM 上）
    dom.input.value = '打了一半的评论'

    applyReportSegments(dom.container as unknown as HTMLElement, {
      head: 'HEAD-2', // 变了 → 换
      band: 'BAND-1', // 没变 → 不碰
      tabs: 'TABS-2', // 变了 → 换（当前 Tab 高亮跟着 Tab 栏走）
      panel: 'PANEL-1', // 没变 → 不碰
    })

    expect(dom.segs.head.innerHTML).toBe('HEAD-2')
    expect(dom.segs.tabs.innerHTML).toBe('TABS-2')
    expect(dom.segs.head.writes).toBe(2) // 1 次初始化 + 1 次替换
    expect(dom.segs.band.writes).toBe(1)
    expect(dom.segs.panel.writes).toBe(1)
    // 草稿原样还在
    expect(dom.input.value).toBe('打了一半的评论')
    // 当前 Tab 不回填（DOM 上的 active 由 Tab 栏段给出，回填旧值会与面板内容打架）
    expect(dom.toggles).toEqual([])
  })

  it('容器没有查询能力（宿主桩）时静默跳过，不把渲染带崩', () => {
    const bare = { innerHTML: '', querySelector: undefined } as unknown as HTMLElement
    expect(() => applyReportSegments(bare, { head: 'h', band: 'b', tabs: 't', panel: 'p' })).not.toThrow()
  })
})

/* --------------------------------------------------------------- D · 接线端到端 */

describe('board-mount 接线 · 进详情走新壳（①②③④）', () => {
  /** `/state` 下发的摘要 */
  const SUMMARY = {
    id: REQ_ID, title: '接线需求', status: 'implementing', blocked: false,
    createdAt: 1, updatedAt: 2, version: 3, commentCount: 0, artifactCount: 0,
    category: 'feature', sourceSessionId: 'session-owner-1',
  }

  function jsonResponse(data: unknown): Promise<Response> {
    return Promise.resolve(new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
  }

  class FakeEventSource {
    onmessage: ((ev: MessageEvent) => void) | null = null
    addEventListener(): void { /* no-op */ }
    close(): void { /* no-op */ }
  }

  function stubGlobals(): void {
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('EventSource', FakeEventSource)
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { void cb(0 as never); return 0 })
    vi.stubGlobal('document', {
      hidden: false, addEventListener: () => {}, removeEventListener: () => {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {}, addEventListener: () => {} }),
    })
  }

  function renderableContainer(): HTMLElement {
    return {
      innerHTML: '', addEventListener: () => {}, removeEventListener: () => {},
      querySelector: () => null, querySelectorAll: () => [],
    } as unknown as HTMLElement
  }

  it('首屏 2 个请求（report + trunk）、无全文请求；revision 变更只多发头部 + 当前 Tab', async () => {
    vi.useRealTimers()
    const calls: string[] = []
    let revision = 7
    vi.stubGlobal('fetch', vi.fn((input: unknown) => {
      const url = String(input)
      calls.push(url)
      // trunk 端点回**真** TrunkResponse（面板已落地：喂面板桩载荷只会渲染"载荷不是主干形状"的空态）
      if (/\/trunk$/.test(url)) return jsonResponse(TRUNK_FIXTURE)
      if (/\/requirements\/[^/]+\/report$/.test(url)) return jsonResponse(makeReport())
      // 旧详情端点：新壳**不该**再打它（首屏不含正文）
      if (/\/requirements\/[^/]+$/.test(url)) return jsonResponse({ revision, requirement: { ...SUMMARY, comments: [] } })
      return jsonResponse({ revision, requirements: [SUMMARY], tasks: [], ready: {} })
    }))
    stubGlobals()

    const boardFocus = await import('../src/client/board-focus.ts')
    const { createBoardAttachment } = await import('../src/client/board-mount.ts')
    boardFocus.requestBoardFocus(REQ_ID)
    const el = renderableContainer()
    const att = createBoardAttachment(el, { poll: false })

    await vi.waitFor(() => { expect(el.innerHTML).toContain('data-report-shell="1"') })
    // 面板真的拿到了服务端载荷并渲染出来（不只是"有个容器"）
    await vi.waitFor(() => { expect(el.innerHTML).toContain(TRUNK_SUMMARY_LINE) })
    // ③ 未激活面板不在产物里；未点过的 Tab 一个请求都没发
    expect(el.innerHTML).toContain('data-panel="trunk"') // 面板根自己带的（壳包装器用 data-tab-host）
    expect(el.innerHTML).not.toContain('data-panel="token"')
    expect(calls.filter(c => /\/requirements\/[^/]+$/.test(c))).toHaveLength(0) // 无全文请求
    expect(calls.filter(c => /\/report$/.test(c))).toHaveLength(1)
    expect(calls.filter(c => /\/trunk$/.test(c))).toHaveLength(1)
    for (const ep of ['docs', 'dag', 'dialogue', 'prompts']) {
      expect(calls.filter(c => c.endsWith('/' + ep))).toHaveLength(0)
    }
    // head 三块在场
    expect(el.innerHTML).toContain('data-report-head="1"')
    expect(el.innerHTML).toContain('data-report-band="1"')
    expect(el.innerHTML).toContain('data-report-tabs="1"')

    // ④ 台账 revision 变更 → 只重取头部 + 当前 Tab（trunk），其它 Tab 仍为 0
    revision = 8
    att.refresh()
    await vi.waitFor(() => { expect(calls.filter(c => /\/report$/.test(c))).toHaveLength(2) })
    await tick()
    expect(calls.filter(c => /\/trunk$/.test(c))).toHaveLength(2)
    expect(calls.filter(c => c.endsWith('/token'))).toHaveLength(0)
    expect(calls.filter(c => c.endsWith('/docs'))).toHaveLength(0)
    expect(el.innerHTML).toContain('data-report-shell="1"')
    att.dispose()
  })
})

/* --------------------------------------------------------------- 图标族（FR-1 / FR-8） */

/**
 * 图标族断言（任务卡 t-efb505 · 计划 key t2）。
 *
 * 本卡**只建单一图标源**（`src/client/icons.ts`），**不接调用方**——接线在 t3（Tab 栏）与
 * t12（缺口严重度圆点）。故本组一律对**模块导出的字符串**下断言；接线卡落地后，"渲染产物里
 * 每个 Tab 恰 1 个装饰性 SVG"那类断言（TC-1）归 t3，本组不重复、也不依赖任何渲染产物。
 *
 * 为什么这些断言值得写：图标是**结构语义**。一旦谁把尺寸写回字符串（`width="14"`）或塞一个
 * 色值字面量，emoji 时代那套老毛病（跨平台字型不一致、选中态图标不跟着变色）就会原样回来，
 * 而肉眼看图往往看不出来——只有机械判据拦得住。
 */
describe('图标族：单一图标源 src/client/icons.ts（FR-1 / FR-8）', () => {
  /** 十键 = 七个 Tab（键即既有 ReportTabKey）+ 三个缺口严重度；带名字便于失败时定位到具体键。 */
  const allIcons: Array<[string, string]> = [
    ...Object.entries(TAB_ICON_SVG).map(([k, v]): [string, string] => ['TAB_ICON_SVG.' + k, v]),
    ...Object.entries(GAP_DOT_SVG).map(([k, v]): [string, string] => ['GAP_DOT_SVG.' + k, v]),
  ]

  it('十键齐全：七个 Tab 键与注册表同集同序，三个严重度键取自 ReportGap', () => {
    // 与既有 ReportTabKey / REPORT_TABS 同集同序（不另抄一份键表——抄一份就有一份会漂）
    expect(Object.keys(TAB_ICON_SVG)).toEqual([...REPORT_TAB_KEYS])
    expect(Object.keys(GAP_DOT_SVG).sort()).toEqual(['gray', 'red', 'yellow'])
    expect(allIcons).toHaveLength(10)
  })

  it('每个值恰 1 个 <svg>，且全族常量逐字一致（16 网格 / 线宽 1.5 / 描边取文字色 / 面 none / 圆角端点）', () => {
    for (const [name, svg] of allIcons) {
      expect(countOf(svg, '<svg'), name).toBe(1)
      expect(countOf(svg, '</svg>'), name).toBe(1)
      expect(countOf(svg, 'viewBox='), name).toBe(1)
      expect(svg.startsWith('<svg '), name).toBe(true)
      expect(svg.endsWith('</svg>'), name).toBe(true)
      expect(svg, name).toContain(`viewBox="${ICON_VIEW_BOX}"`)
      expect(svg, name).toContain(`stroke-width="${ICON_STROKE_WIDTH}"`)
      expect(svg, name).toContain('fill="none"')
      expect(svg, name).toContain('stroke="currentColor"')
      expect(svg, name).toContain('stroke-linecap="round"')
      expect(svg, name).toContain('stroke-linejoin="round"')
    }
  })

  it('不带尺寸与颜色字面量：尺寸只许来自 --pm-icon / --pm-icon-sm 两档令牌', () => {
    // 按**属性边界**匹配：`stroke-width=` 是线宽（FR-1 #1 点名的全族常量），不是"尺寸属性"
    const SIZE_ATTR = /(?:^|[\s"'<])(?:width|height|style|class)=/
    for (const [name, svg] of allIcons) {
      expect(SIZE_ATTR.test(svg), name).toBe(false)
      expect(svg, name).not.toMatch(/#[0-9a-fA-F]{3,8}/) // 十六进制色值
      expect(svg, name).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\(/) // 函数式色值
      expect(svg, name).not.toMatch(/\d+(?:\.\d+)?px/) // 任何 px 裸值
      expect(svg, name).not.toMatch(/fill="(?!none")/) // 面一律 none，不出现第二种填充
      expect(svg, name).not.toContain('data-proto') // 原型自用的比对标注不得进真实产物
    }
  })

  it('装饰性：值里带 aria-hidden，且不产可访问名（名字由旁边可见文字承担）', () => {
    for (const [name, svg] of allIcons) {
      expect(svg, name).toContain('aria-hidden="true"')
      expect(svg, name).not.toContain('role=')
      expect(svg, name).not.toContain('aria-label')
      expect(svg, name).not.toContain('<title')
    }
  })

  it('七个 Tab 图标互不相同（不是同一形状复制七份）', () => {
    expect(new Set(Object.values(TAB_ICON_SVG)).size).toBe(7)
  })
})
