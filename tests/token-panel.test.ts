/**
 * 「🪙 Token」面板（REQ-261004222448-292a · t-f62af2 / FR-10、FR-12）——纯函数渲染断言。
 *
 * 覆盖判定（FR-10）：
 *   ① 阶段视图的「占比合计」与总计一致；
 *   ② **每次调用均**与**缓存命中率**两列在场（缺一即不满足「可优化数据」）；
 *   ③ 三态各一条渲染断言，且「不可得」态下产物**不出现 0**；
 *   ④ 优化点条目均含可核对的数字。
 * 另加：阶段→任务执行下钻、上卷（墙钟/窗口数/轮次/零产出只在响应里有才渲染）、
 * 不含提示词块、不做内层滚动、形状不识别时不画空表。
 */
import { describe, it, expect } from 'vitest'
import { renderTokenPanel, renderTokenTab } from '../src/client/token-info.ts'
import { REPORT_TABS, type ReportTabCtx } from '../src/client/views/report-tabs.ts'

const REQ = 'REQ-261004222448-292a'

const buckets = (uncached: number, output: number, cacheRead: number, cacheWrite = 0) =>
  ({ uncachedInputTokens: uncached, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite })

/** 一份「快照齐」的完整载荷：四段有记录（占比合计 = 100）+ 一段无记录 + 一条执行下钻。 */
// 注意：平铺列（calls/totalTokens/perCallTokens/cacheHitPct…）与 buckets 是**各自独立**编的
// ——本用例测的是「面板照服务端给的列渲染」，buckets 只在「缺平铺列」的用例里当兜底口径用。
function fullPayload(): Record<string, unknown> {
  return {
    requirementId: REQ,
    availability: 'full',
    costEstimateCny: 12.5,
    degraded: false,
    byStage: [
      {
        stage: 'brainstorming', calls: 6, inputTokens: 200000, outputTokens: 20000, cacheReadTokens: 620000,
        totalTokens: 120000, sharePct: 12, perCallTokens: 20000, cacheHitPct: 77,
        buckets: buckets(200000, 20000, 620000), executions: [],
      },
      {
        stage: 'design', calls: 9, inputTokens: 240000, outputTokens: 28000, cacheReadTokens: 480000,
        totalTokens: 190000, sharePct: 19, perCallTokens: 21111, cacheHitPct: 68,
        buckets: buckets(240000, 28000, 480000), executions: [],
      },
      {
        stage: 'implementing', calls: 14, inputTokens: 700000, outputTokens: 90000, cacheReadTokens: 900000,
        totalTokens: 540000, sharePct: 54, perCallTokens: 38571, cacheHitPct: 59,
        buckets: buckets(700000, 90000, 900000),
        executions: [{
          taskId: 't-abc123', title: '实施卡', status: 'done',
          delta: buckets(30000, 5000, 40000), start: { at: 1, totals: buckets(0, 0, 0), source: 'projection' },
          end: { at: 2, totals: buckets(0, 0, 0), source: 'projection' },
        }],
      },
      {
        stage: 'accepting', calls: 5, inputTokens: 180000, outputTokens: 22000, cacheReadTokens: 420000,
        totalTokens: 150000, sharePct: 15, perCallTokens: 30000, cacheHitPct: 70,
        buckets: buckets(180000, 22000, 420000), executions: [],
      },
      // 无任何记录：**不产 0 行**，如实标「无快照」
      { stage: 'archived', executions: [] },
    ],
    optimizations: [
      {
        title: '阶段占比最高',
        basis: 'implementing 占 54%（540000 tokens ÷ 14 次调用，每次 38571）',
        suggestion: '对该阶段做节点隔离 + 输入包裁剪：它单独吃掉 54% 的消耗',
      },
      {
        title: '缓存命中最低',
        basis: 'implementing 缓存命中 59%（缓存读 900000，未缓存输入 700000）',
        suggestion: '把稳定前缀固定成同一段输入包',
      },
      {
        title: '零产出执行',
        basis: '1 次零产出执行（阶段：review；已完成 3 次）',
        suggestion: '给这些阶段加「无产出即停」',
      },
    ],
    wallClockMs: 3 * 3600000 + 25 * 60000,
    windowCount: 4,
    turns: 42,
    zeroOutputRuns: 1,
    injections: {
      count: 2, chars: 1000, estTokens: 250, sharePct: 12.5,
      byStage: [{ name: 'brainstorming', chars: 400, estTokens: 100 }],
      items: [{ at: 1700000000000, routeKey: 'brainstorming/light/feature', fragmentIds: ['f1'], chars: 400, estTokens: 100 }],
    },
  }
}

const ctx: ReportTabCtx = { requirementId: REQ, load: () => Promise.resolve({ available: true }), openDoc: () => {} }

/** 取某属性值（`data-x="..."`）的全部出现，用于机械核对。 */
function attrValues(html: string, attr: string): string[] {
  const re = new RegExp(attr + '="([^"]*)"', 'g')
  const out: string[] = []
  for (let m = re.exec(html); m !== null; m = re.exec(html)) out.push(m[1])
  return out
}

describe('Token 面板 · 按阶段八列（t-f62af2 / FR-10）', () => {
  it('根容器带 data-panel="token"，行是 data-stage-row，八列列头齐', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('data-panel="token"')
    expect(html).toContain('data-availability="full"')
    for (const th of ['阶段', '调用', '输入', '输出', '合计', '占比', '每次调用均', '缓存命中率']) {
      expect(html, th).toContain('<th>' + th + '</th>')
    }
    // 五个阶段各一行（含无记录的那行：它也必须有行，否则「缺哪个阶段」看不见）
    expect(attrValues(html, 'data-stage-row')).toHaveLength(5)
    expect(html).toContain('data-stage="implementing"')
    expect(html).toContain('data-stage="archived"')
  })

  it('每次调用均 / 缓存命中率两列有值（服务端列直读）', () => {
    const html = renderTokenPanel(fullPayload())
    const perCall = attrValues(html, 'data-per-call')
    const hit = attrValues(html, 'data-cache-hit')
    expect(perCall).toContain('20000')
    expect(perCall).toContain('38571')
    expect(hit).toContain('77')
    expect(hit).toContain('59')
  })

  it('缺平铺列时按同一口径从快照桶现算（缓存命中 = 缓存读 ÷（缓存读 + 未缓存输入））', () => {
    const html = renderTokenPanel({
      availability: 'full',
      byStage: [{
        stage: 'design',
        buckets: buckets(100000, 20000, 300000),
        executions: [{ taskId: 't-1', title: '甲', status: 'done' }, { taskId: 't-2', title: '乙', status: 'done' }],
      }],
    })
    // 合计 420000 ÷ 2 次执行 = 210000；缓存命中 300000 / (300000 + 100000) = 75%
    expect(attrValues(html, 'data-per-call')).toEqual(['210000'])
    expect(attrValues(html, 'data-cache-hit')).toEqual(['75'])
    expect(attrValues(html, 'data-calls')).toEqual(['2'])
  })

  it('占比合计与总计一致：行占比和 = 100，表尾合计 = 各行合计之和', () => {
    const html = renderTokenPanel(fullPayload())
    const shares = attrValues(html, 'data-share-pct').filter(s => s.length > 0).map(Number)
    expect(shares).toHaveLength(4)
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    const rowTotals = attrValues(html, 'data-total-tokens').map(Number)
    const footer = rowTotals[rowTotals.length - 1] // 表尾是最后一个 data-total-tokens
    expect(footer).toBe(rowTotals.slice(0, -1).reduce((a, b) => a + b, 0))
    expect(Number(attrValues(html, 'data-share-sum')[0])).toBeCloseTo(100, 6)
  })

  it('优化点逐条带依据数字，且逐字来自服务端（面板不自己编建议）', () => {
    const html = renderTokenPanel(fullPayload())
    const optBlocks = html.split('data-opt="1"').slice(1)
    expect(optBlocks).toHaveLength(3)
    for (const block of optBlocks) expect(block, block.slice(0, 40)).toMatch(/\d/)
    expect(html).toContain('阶段占比最高')
    expect(html).toContain('对该阶段做节点隔离 + 输入包裁剪：它单独吃掉 54% 的消耗')
  })

  it('服务端漏了依据数字时如实标出（不替它编一个数字）', () => {
    const html = renderTokenPanel({
      availability: 'full',
      byStage: [{ stage: 'design', calls: 1, totalTokens: 10, buckets: buckets(10, 0, 0) }],
      optimizations: [{ title: '无依据建议', basis: '这条没有数字', suggestion: '去做点什么' }],
    })
    expect(html).toContain('data-opt-nodigit="1"')
  })

  it('阶段 → 任务执行下钻直接铺开（不经折叠开关）', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('data-stage-exec="1"')
    expect(html).toContain('data-parent-stage="implementing"')
    expect(html).toContain('t-abc123')
    expect(html).toContain('实施卡')
  })

  it('上卷：本条合计 + 墙钟/窗口数/轮次/零产出（响应里有才渲染）', () => {
    const withExtras = renderTokenPanel(fullPayload())
    expect(withExtras).toContain('data-rollup="1"')
    for (const label of ['本条合计', '墙钟', '窗口数', '轮次', '零产出执行']) {
      expect(withExtras, label).toContain(label)
    }
    const bare = renderTokenPanel({
      availability: 'full',
      byStage: [{ stage: 'design', calls: 1, totalTokens: 10, buckets: buckets(10, 0, 0) }],
    })
    expect(bare).toContain('data-rollup="1"')
    // 响应里没有的项**不渲染成数字**（只在一句「未给出的项」里点名，不上数字）
    expect(bare).not.toContain('墙钟 <b>')
    expect(bare).not.toContain('窗口数 <b>')
    expect(bare).toContain('未给出的项')
  })
})

describe('Token 面板 · 可得性三态（FR-10 判定③ / FR-12）', () => {
  it('partial：显眼标「部分数据（下界）」并列出缺哪段', () => {
    const payload = fullPayload()
    payload.availability = 'partial'
    payload.missingStages = ['archived', 'accepting']
    payload.boundsAreLowerBound = true
    const html = renderTokenPanel(payload)
    expect(html).toContain('data-availability="partial"')
    expect(html).toContain('部分数据（下界）')
    expect(html).toContain('归档')
    expect(html).toContain('验收')
  })

  it('none：说「无 token 快照」，且**没有任何 0 值表格行**（不画表、不写汇总）', () => {
    const html = renderTokenPanel({
      availability: 'none', byStage: [], optimizations: [], unavailableNote: 'token 扩展查询未装配',
    })
    expect(html).toContain('data-availability="none"')
    expect(html).toContain('无 token 快照')
    expect(html).toContain('token 扩展查询未装配')
    // 机械断言：不可得态下不得用 0 冒充——没有表、没有阶段行、没有任何值为 0 的单元格
    expect(html).not.toContain('data-stage-row')
    expect(html).not.toContain('data-stage-table')
    expect(html).not.toContain('<table')
    expect(html).not.toMatch(/>\s*0\s*</)
    expect(html).not.toMatch(/0\s*(条|次|个)/)
    expect(html).not.toContain('data-rollup')
  })

  it('载荷没给 availability（旧端点/桩）时不假装齐全 → 按「下界」说', () => {
    const html = renderTokenPanel({
      byStage: [{ stage: 'design', calls: 1, totalTokens: 10, buckets: buckets(10, 0, 0) }],
    })
    expect(html).toContain('data-availability="partial"')
    expect(html).toContain('部分数据（下界）')
  })

  it('载荷形状不识别时不画空表（与需求页壳的桩契约同名同义）', () => {
    const html = renderTokenPanel({ available: true, marker: 'token' })
    expect(html).toContain('data-panel="token"')
    expect(html).toContain('data-panel-placeholder="token"')
    expect(html).not.toContain('data-stage-table')
  })
})

describe('Token 面板 · 与提示词 Tab 的分工与滚动纪律', () => {
  it('提示词块不得出现在本面板（正文归提示词 Tab）', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).not.toContain('data-prompt-section')
    expect(html).not.toContain('data-prompt-trimmed')
    expect(html).not.toContain('固定系统提示词')
  })

  it('不做内层滚动：三态产物里都没有 overflow: auto|scroll', () => {
    const none = renderTokenPanel({ availability: 'none', byStage: [], optimizations: [] })
    const partial = renderTokenPanel({ availability: 'partial', byStage: [], optimizations: [], missingStages: ['archived'] })
    for (const html of [renderTokenPanel(fullPayload()), none, partial]) {
      expect(html).not.toMatch(/overflow:\s*(auto|scroll)/)
    }
  })

  it('面板注册项已接线：REPORT_TABS 里的 token.render 就是本面板', () => {
    const def = REPORT_TABS.find(d => d.key === 'token')
    expect(def).toBeDefined()
    const html = def!.render(fullPayload(), ctx)
    expect(html).toContain('data-panel="token"')
    expect(html).toContain('data-stage-row="1"')
  })
})

describe('Token 面板 · 旧详情页入口（renderTokenTab 共用同一实现）', () => {
  it('吃 RequirementTokenView 形状（无扩展段）也不崩：按阶段表 + 下界提示', () => {
    const html = renderTokenTab({
      requirementId: REQ,
      totals: buckets(10, 20, 30),
      degraded: true,
      byStage: [
        { stage: 'design', buckets: buckets(100, 20, 300), executions: [] },
        { stage: 'implementing', executions: [{ taskId: 't-zzz', title: '返工卡', status: 'done', delta: buckets(30, 5, 4) }] },
      ],
    })
    expect(html).toContain('data-stage-row="1"')
    expect(html).toContain('t-zzz')
    expect(html).toContain('返工卡')
    expect(html).toContain('部分数据（下界）')
  })
})
