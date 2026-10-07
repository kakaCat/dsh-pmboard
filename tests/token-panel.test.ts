/**
 * 「🪙 Token」面板（REQ-261006130057-7a43 · D-10/D-11 对齐权威原型）——纯函数渲染断言。
 *
 * 权威原型：`docs/requirements/REQ-261006130057-7a43/prototypes/detail.html#tab-token`
 *   · 四张汇总卡（累计 / 输入 / 输出 / 缓存命中）；
 *   · 一张「按节点」表：列 = 节点 / 阶段 / 输入 / 输出 / 缓存命中 / 合计 / 时长，
 *     数字等宽右对齐，**无快照的节点写「未采集」不写 0**，末行「合计」；
 *   · 页面没有其它大段内容——实现多出来的能力（口径说明 / 可优化点 / 注入提示词成本 /
 *     上卷费用估算）按 D-11 **压成默认收起的折叠或一行小字**，内容一字不删。
 *
 * 覆盖判定：
 *   ① 列序与原型逐列同序（七列），旧两列（每次调用均 / 缓存命中率）改为「表头口径 + 口径折叠」；
 *   ② 行按节点铺、末行合计，占比合计 == 总计（`data-share-pct` 之和 == `data-share-sum`）；
 *   ③ 「未采集」纪律：无快照节点/缺列一律不写 0（表尾同一条规则：有一行缺就不求和）；
 *   ④ 四个折叠默认收起（`<details>` 没有 open），展开后内容与依据数字仍在；
 *   ⑤ 可得性三态各一条渲染断言，「不可得」态下产物**不出现 0**。
 * 另加：任务执行明细下钻、上卷（墙钟/窗口数/轮次/零产出只在响应里有才渲染）、
 * 不含提示词块、不做内层滚动、形状不识别时不画空表。
 */
import { describe, it, expect } from 'vitest'
import { renderTokenPanel, renderTokenTab } from '../src/client/token-info.ts'
import { REPORT_TABS, type ReportTabCtx } from '../src/client/views/report-tabs.ts'

const REQ = 'REQ-261006130057-7a43'

const buckets = (uncached: number, output: number, cacheRead: number, cacheWrite = 0) =>
  ({ uncachedInputTokens: uncached, outputTokens: output, cacheReadTokens: cacheRead, cacheWriteTokens: cacheWrite })

/** 一份「快照齐」的完整载荷：四段有记录（占比合计 = 100）+ 一段无记录 + 一条执行下钻。 */
// 注意：平铺列（calls/inputTokens/totalTokens/…）与 buckets 是**各自独立**编的
// ——本用例测的是「面板照服务端给的列渲染」，buckets 只在「缺平铺列」的用例里当兜底口径用
// （缓存命中卡走 buckets 的加权口径，所以它是 64.71%，不是任何一行的 77%）。
function fullPayload(): Record<string, unknown> {
  return {
    requirementId: REQ,
    availability: 'full',
    costEstimateCny: 12.5,
    degraded: false,
    byStage: [
      {
        stage: 'brainstorming', calls: 6, inputTokens: 90000, outputTokens: 20000, cacheReadTokens: 620000,
        totalTokens: 120000, sharePct: 12, perCallTokens: 20000, cacheHitPct: 77,
        buckets: buckets(200000, 20000, 620000), executions: [],
      },
      {
        stage: 'design', calls: 9, inputTokens: 150000, outputTokens: 28000, cacheReadTokens: 480000,
        totalTokens: 190000, sharePct: 19, perCallTokens: 21111, cacheHitPct: 68,
        buckets: buckets(240000, 28000, 480000), executions: [],
      },
      {
        stage: 'implementing', calls: 14, inputTokens: 420000, outputTokens: 90000, cacheReadTokens: 900000,
        totalTokens: 540000, sharePct: 54, perCallTokens: 38571, cacheHitPct: 59,
        // 时长：契约里没有这一列，服务端给了 durationMs 就照实显示（没给就写「未采集」）
        durationMs: 4500000,
        buckets: buckets(700000, 90000, 900000),
        executions: [{
          taskId: 't-abc123', title: '实施卡', status: 'done',
          delta: buckets(30000, 5000, 40000), start: { at: 1, totals: buckets(0, 0, 0), source: 'projection' },
          end: { at: 2, totals: buckets(0, 0, 0), source: 'projection' },
        }],
      },
      {
        stage: 'accepting', calls: 5, inputTokens: 120000, outputTokens: 22000, cacheReadTokens: 420000,
        totalTokens: 150000, sharePct: 15, perCallTokens: 30000, cacheHitPct: 70,
        buckets: buckets(180000, 22000, 420000), executions: [],
      },
      // 无任何记录：**不产 0 行**，如实标「无快照」（表内写「未采集」）
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

/** 取包含某记号的**行**（`<tr` 切片；表头/折叠体也在切片里——调用方自己选准记号）。 */
function rowOf(html: string, marker: string): string {
  return html.split('<tr').find(r => r.includes(marker)) ?? ''
}

describe('Token 面板 · 按节点表（D-10 对齐原型 #tab-token）', () => {
  it('根容器带 data-panel="token"；列序 = 节点 / 阶段 / 输入 / 输出 / 缓存命中 / 合计 / 时长', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('data-panel="token"')
    expect(html).toContain('data-availability="full"')
    const head = html.slice(html.indexOf('data-stage-table="1"'), html.indexOf('</thead>'))
    const titles = [...head.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map(m => m[1])
    expect(titles).toEqual(['节点', '阶段', '输入', '输出', '缓存命中', '合计', '时长'])
    // 旧列不再各占一列——但**能力没删**：表头 title 里钉着口径（旧契约 T-14 也钉这两个词）
    expect(head).toContain('每次调用均')
    expect(head).toContain('缓存命中率')
    expect(head).not.toContain('>调用<')
    expect(head).not.toContain('>占比<')
    // 五个数字列（输入/输出/缓存命中/合计/时长）都带等宽右对齐标记
    expect((head.match(/<th class="dsh-pm-tok-num"/g) ?? []).length).toBe(5)
  })

  it('行按节点铺（节点名 n-xx + 阶段键），每个节点一行，末行「合计」', () => {
    const html = renderTokenPanel(fullPayload())
    // 五个节点各一行（含无记录的那个：它也必须有行，否则「缺哪个节点」看不见）
    expect(attrValues(html, 'data-stage-row')).toHaveLength(5)
    for (const stage of ['brainstorming', 'design', 'implementing', 'accepting', 'archived']) {
      expect(html, stage).toContain('data-stage="' + stage + '"')
    }
    expect(html).toContain('<td>n-需求分析</td><td class="dsh-pm-tok-stage">brainstorming</td>')
    expect(html).toContain('<td>n-实施</td><td class="dsh-pm-tok-stage">implementing</td>')
    const total = rowOf(html, 'data-total-row')
    expect(total).toContain('<td>合计</td>')
    expect(total).toContain('data-total-tokens="1000000"')
    expect(total).toContain('data-share-sum="100"')
  })

  it('数字等宽右对齐：有记录行五个数字格带 dsh-pm-tok-num，无快照行同列同标', () => {
    const html = renderTokenPanel(fullPayload())
    const row = rowOf(html, 'data-stage="implementing"')
    expect((row.match(/dsh-pm-tok-num/g) ?? []).length).toBe(5) // 输入/输出/缓存命中/合计/时长
    expect(row).toContain('<td class="dsh-pm-tok-num">420.0k</td>')  // 输入
    expect(row).toContain('<td class="dsh-pm-tok-num">540.0k</td>')  // 合计
    const nosnap = rowOf(html, 'data-stage="archived"')
    expect(nosnap).toContain('dsh-pm-nosnap dsh-pm-tok-num')
  })

  it('无快照的节点写「未采集」不写 0（节点行如实标「无快照」给原因）', () => {
    const html = renderTokenPanel(fullPayload())
    const nosnap = rowOf(html, 'data-stage="archived"')
    // 输入 / 输出 / 缓存命中 / 合计 / 时长 五格全是「未采集」
    expect((nosnap.match(/未采集/g) ?? []).length).toBe(5)
    expect(nosnap).toContain('无快照')
    expect(nosnap).not.toMatch(/>\s*0\s*</)
    expect(nosnap).not.toMatch(/(?<![\d])0\s*(条|次|个)/)
    // 表注与原型逐字同口径
    expect(html).toContain('无快照的节点写「未采集」不写 0')
  })

  it('时长列：服务端给了 durationMs 就照实显示，没给就写「未采集」（不编）', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('<td class="dsh-pm-tok-num">1 小时 15 分</td>') // implementing 的 4500000ms
    // 同一列上没给时长的节点：写「未采集」，不是 0、不是"0 分"
    const design = rowOf(html, 'data-stage="design"')
    expect(design).toContain('未采集')
    expect(design).not.toContain('0 分')
    // 表尾时长 = 原型写法的「—」（合计时长无意义，不是"没读到"）
    expect(rowOf(html, 'data-total-row')).toContain('<td class="dsh-pm-nosnap dsh-pm-tok-num">—</td>')
  })
})

describe('Token 面板 · 汇总卡（原型 .stat-grid：大数字 + 小注）', () => {
  it('四张卡在场，副题与原型同口径（N 个节点合计 / 占 X% / 命中 X · 省费口径同服务端）', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('data-tok-stats="1"')
    for (const key of ['total', 'input', 'output', 'cache-hit']) {
      expect(html).toContain('data-tok-stat="' + key + '"')
    }
    // 累计 = 四段有记录节点合计（120000+190000+540000+150000 = 1000000），与表尾同一来源
    expect(html).toContain('data-tok-stat-value="1000000"')
    expect(html).toContain('4 个节点合计')
    expect(html).toContain('data-tok-stat-value="780000"') // 输入 90000+150000+420000+120000
    expect(html).toContain('占 78%')
    expect(html).toContain('data-tok-stat-value="160000"') // 输出 20000+28000+90000+22000
    expect(html).toContain('占 16%')
    // 缓存命中 = 加权（Σ缓存读 2420000 ÷（Σ缓存读 + Σ未缓存输入 1320000）≈ 64.71%）
    expect(html).toContain('data-tok-stat-value="64.71"')
    expect(html).toContain('命中 2.4M · 省费口径同服务端')
  })

  it('某列不是每个有记录节点都有 → 该卡写「—」并说清未采集（不补 0）', () => {
    const html = renderTokenPanel({
      availability: 'partial',
      byStage: [
        { stage: 'design', totalTokens: 100, buckets: buckets(80, 20, 0) }, // 缺平铺 input/output 列但有 buckets
        { stage: 'draft', calls: 1, totalTokens: 50 }, // 连 buckets 都没有
      ],
    })
    // input/output 可由 buckets 现算的行有、另一行没有 → 输入/输出卡「—」+ 不补 0 说辞
    const inputCard = html.slice(html.indexOf('data-tok-stat="input"'), html.indexOf('data-tok-stat="output"'))
    expect(inputCard).toContain('—')
    expect(inputCard).toContain('不补 0')
    expect(inputCard).not.toContain('data-tok-stat-value')
    // 缓存命中同理（draft 行无 buckets）
    const hitCard = html.slice(html.indexOf('data-tok-stat="cache-hit"'))
    expect(hitCard).toContain('—')
    expect(hitCard).not.toContain('data-tok-stat-value')
    // 累计卡仍可算（totalTokens 都有）→ 照常给数
    expect(html).toContain('data-tok-stat-value="150"')
  })

  it('没有一个有记录的节点 → 汇总卡整块不渲染（一排「—」是噪声）', () => {
    const html = renderTokenPanel({ availability: 'partial', byStage: [{ stage: 'design', executions: [] }] })
    expect(html).not.toContain('data-tok-stats')
  })
})

describe('Token 面板 · 表尾合计（占比合计 == 总计）', () => {
  it('占比合计与总计一致：行占比和 = 100，表尾合计 = 各行合计之和', () => {
    const html = renderTokenPanel(fullPayload())
    const shares = attrValues(html, 'data-share-pct').filter(s => s.length > 0).map(Number)
    expect(shares).toEqual([12, 19, 54, 15])
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6)
    const rowTotals = attrValues(html, 'data-total-tokens').map(Number)
    const footer = rowTotals[rowTotals.length - 1] // 表尾是最后一个 data-total-tokens
    expect(footer).toBe(rowTotals.slice(0, -1).reduce((a, b) => a + b, 0))
    expect(Number(attrValues(html, 'data-share-sum')[0])).toBeCloseTo(100, 6)
  })

  it('表尾逐列只在每行都给了该数时才求和：有一行缺就写「未采集」，不拿 0 补齐', () => {
    const html = renderTokenPanel({
      availability: 'full',
      byStage: [
        { stage: 'design', totalTokens: 100, inputTokens: 80, outputTokens: 20, buckets: buckets(80, 20, 300), executions: [] },
        { stage: 'draft', calls: 1, totalTokens: 50 }, // 缺 input/output/缓存桶
      ],
    })
    const total = rowOf(html, 'data-total-row')
    expect(total).toContain('未采集')            // 输入 / 输出 / 缓存命中 三列
    expect(total).not.toContain('80')            // 不把缺的那行当 0 加进去（80 是"只算一行"的假合计）
    expect(total).toContain('150')               // 合计列仍可算（两行都有 totalTokens）
  })

  it('一行记录都没有：不写「合计 0」（合计未知 ≠ 合计为零）', () => {
    const html = renderTokenPanel({ availability: 'full', byStage: [], optimizations: [] })
    expect(html).toContain('<td>合计</td>')
    expect(rowOf(html, 'data-total-row')).toContain('未采集')
    expect(html).not.toMatch(/>\s*0\s*</)
    expect(html).not.toMatch(/(?<![\d])0\s*(条|次|个|行)/)
    expect(html).toContain('合计（本条） <b>—</b> tokens')
  })
})

describe('Token 面板 · 折叠段落（D-11：默认收起，内容一字不删）', () => {
  it('口径说明压成默认收起的折叠：三要素 + 两条旧列口径都还在', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('data-token-caliber="1"')
    expect(html).toContain('口径说明')
    expect(html).not.toContain('data-token-caliber="1" open')
    const at = html.indexOf('data-token-caliber="1"')
    const fold = html.slice(at, html.indexOf('</details>', at))
    for (const phrase of ['含子代理', '起链预算闸不含子代理', '上线前的历史数字不含子代理', '不补 0']) {
      expect(fold, phrase).toContain(phrase)
    }
    // 旧两列的口径逐字给出（列让位给原型列序，口径不能跟着消失）
    expect(fold).toContain('每次调用均 = 该节点合计 ÷ 调用数')
    expect(fold).toContain('缓存命中率 = 缓存读 ÷（缓存读 + 未缓存输入）')
  })

  it('可优化点压成默认收起的折叠：标题一行给条数，条目与依据数字逐字保留', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('data-token-opts="1"')
    expect(html).not.toContain('data-token-opts="1" open')
    expect(html).toContain('可优化点')
    expect(html).toContain('3 条 · 展开')
    const optBlocks = html.split('data-opt="1"').slice(1)
    expect(optBlocks).toHaveLength(3)
    for (const block of optBlocks) expect(block, block.slice(0, 40)).toMatch(/\d/)
    expect(html).toContain('阶段占比最高')
    expect(html).toContain('对该阶段做节点隔离 + 输入包裁剪：它单独吃掉 54% 的消耗')
  })

  it('可优化点为空/未提供时不写「0 条」（读不到 ≠ 量出来是零）', () => {
    const empty = renderTokenPanel({ availability: 'full', byStage: [], optimizations: [] })
    expect(empty).toContain('可优化点')
    expect(empty).not.toContain('0 条')
    expect(empty).toContain('没有可行动的优化点')
    const missing = renderTokenPanel({ availability: 'full', byStage: [] })
    expect(missing).toContain('未提供')
    expect(missing).not.toContain('0 条')
  })

  it('服务端漏了依据数字时如实标出（不替它编一个数字）', () => {
    const html = renderTokenPanel({
      availability: 'full',
      byStage: [{ stage: 'design', calls: 1, totalTokens: 10, buckets: buckets(10, 0, 0) }],
      optimizations: [{ title: '无依据建议', basis: '这条没有数字', suggestion: '去做点什么' }],
    })
    expect(html).toContain('data-opt-nodigit="1"')
  })

  it('任务执行明细收进默认收起的折叠（一行一个节点的节奏不被明细冲散）', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('data-stage-exec-fold="implementing"')
    expect(html).not.toContain('data-stage-exec-fold="implementing" open')
    expect(html).toContain('任务执行明细')
    expect(html).toContain('data-stage-exec="1"')
    expect(html).toContain('data-parent-stage="implementing"')
    expect(html).toContain('t-abc123')
    expect(html).toContain('实施卡')
  })

  it('注入提示词成本折叠默认收起：聚合与明细保留', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).toContain('💉 注入提示词成本')
    expect(html).toContain('2 次')
    expect(html).toContain('brainstorming/light/feature')
    expect(html).toContain('占本需求 12.5%')
    const empty = renderTokenPanel({ ...fullPayload(), injections: { count: 0, chars: 0, estTokens: 0, byStage: [], items: [] } })
    expect(empty).toContain('无记录')
    expect(empty).toContain('不做张冠李戴')
  })

  it('默认视图里没有任何折叠是展开的（D-11：默认与原型一致）', () => {
    const html = renderTokenPanel(fullPayload())
    expect(html).not.toMatch(/<details[^>]*\sopen/)
  })
})

describe('Token 面板 · 上卷行（一行小字）', () => {
  it('合计（本条）+ 墙钟/窗口数/轮次/零产出/费用估算（响应里有才渲染）', () => {
    const withExtras = renderTokenPanel(fullPayload())
    expect(withExtras).toContain('data-rollup="1"')
    for (const label of ['合计（本条）', '费用估算', '墙钟', '窗口数', '轮次', '零产出执行']) {
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
    // 机械断言：不可得态下不得用 0 冒充——没有表、没有节点行、没有任何值为 0 的单元格
    expect(html).not.toContain('data-stage-row')
    expect(html).not.toContain('data-stage-table')
    expect(html).not.toContain('<table')
    expect(html).not.toMatch(/>\s*0\s*</)
    expect(html).not.toMatch(/(?<![\d])0\s*(条|次|个)/)
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
  it('吃 RequirementTokenView 形状（无扩展段）也不崩：按节点表 + 下界提示 + 执行明细', () => {
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
    expect(html).toContain('<td>n-设计</td>')
    expect(html).toContain('t-zzz')
    expect(html).toContain('返工卡')
    expect(html).toContain('部分数据（下界）')
    // 无快照的 implementing 节点：数字列写「未采集」，执行差值仍如实给出（39）
    expect(rowOf(html, 'data-stage="implementing"')).toContain('未采集')
    expect(html).toContain('39')
  })
})
