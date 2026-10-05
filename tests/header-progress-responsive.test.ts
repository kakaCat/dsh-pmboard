/**
 * 会话头部流程图模型与自适应契约单测（REQ-260930230225-71be）。
 *
 * 分工：TC-5（模型映射）由 t1 落地；TC-1/TC-2/TC-3/TC-4/TC-6 由 t5 追加。
 * 覆盖设计 data-model.md D-2 的映射规则表。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FLOW, FLOW_TIERS, buildFlowChartModel } from '../src/client/flow-chart-model.ts'
import { BOARD_CSS } from '../src/client/styles/board.ts'
import { NODE_PANEL_CSS } from '../src/client/styles/node-panel.ts'
import { TOKEN_CSS } from '../src/client/styles/token.ts'

/** 读仓库里的客户端源文件（相对本测试文件定位，避免依赖 cwd）。 */
function clientSrc(rel: string): string {
  return readFileSync(new URL('../src/client/' + rel, import.meta.url), 'utf8')
}

describe('TC-5 模型映射（进度 payload → 节点四态 / 跳过 / token / 计数）', () => {
  it('TC-5a 七种主状态各自命中当前节点，前后分别为 done / pending', () => {
    for (let i = 0; i < FLOW.length; i++) {
      const model = buildFlowChartModel({ status: FLOW[i].key, category: 'feature' })
      expect(model.nodes).toHaveLength(7)
      expect(model.currentKey).toBe(FLOW[i].key)
      expect(model.nodes.map(n => n.state)).toEqual(
        FLOW.map((_, j) => (j < i ? 'done' : j === i ? 'current' : 'pending')),
      )
    }
  })

  it('TC-5b 状态不在 FLOW（canceled）时无当前节点、全部 pending', () => {
    const model = buildFlowChartModel({ status: 'canceled', category: 'feature' })
    expect(model.currentKey).toBeNull()
    expect(model.nodes.every(n => n.state === 'pending')).toBe(true)
  })

  it('TC-5c 分类流程跳过的节点标 skipped（与 host 同源），feature 不跳', () => {
    const bug = buildFlowChartModel({ status: 'design', category: 'bug' })
    expect(bug.nodes.find(n => n.key === 'brainstorming')?.skipped).toBe(true)
    expect(bug.nodes.find(n => n.key === 'design')?.skipped).toBe(false)
    const feature = buildFlowChartModel({ status: 'design', category: 'feature' })
    expect(feature.nodes.some(n => n.skipped)).toBe(false)
  })

  it('TC-5d 只有给了 token 快照的节点才带 token 字段', () => {
    const model = buildFlowChartModel({
      status: 'implementing',
      category: 'feature',
      nodes: [{ key: 'design', tokens: { total: 1234 } }, { key: 'implementing', tokens: { total: 0 } }],
    })
    expect(model.nodes.find(n => n.key === 'design')?.token).toBe(1234)
    expect(model.nodes.find(n => n.key === 'implementing')?.token).toBe(0)
    expect('token' in (model.nodes.find(n => n.key === 'draft') as object)).toBe(false)
  })

  it('TC-5e 计数文案：有任务总量时 done/total，否则回落状态中文', () => {
    expect(buildFlowChartModel({ status: 'implementing', progress: { done: 3, total: 12 } }).countText).toBe('3/12')
    expect(buildFlowChartModel({ status: 'implementing', progress: { done: 0, total: 0 } }).countText).toBe('实施中')
    expect(buildFlowChartModel({ status: 'accepting' }).countText).toBe('待验收')
  })

  it('TC-5f 缺省容错：无 status/category 时按 draft + feature，closed 透传', () => {
    const model = buildFlowChartModel({})
    expect(model.statusKey).toBe('draft')
    expect(model.category).toBe('feature')
    expect(model.nodes.every(n => n.skipped)).toBe(false)
    expect(buildFlowChartModel({ closed: true }).closed).toBe(true)
  })

  it('TC-5g 档位常量 = 600 / 780 / 600（REQ-261004151652-d535：token 与 label 同值，等式刻意）', () => {
    expect(FLOW_TIERS).toEqual({ token: 600, link: 780, label: 600 })
  })
})

describe('TC-1 挂载契约（流程图挂在模式标签之后的 actions 槽位）', () => {
  it('TC-1a 注册在 conversation.session.header.utilities（右侧工具组）', () => {
    const src = clientSrc('index.ts')
    expect(src).toContain("'conversation.session.header.utilities'")
    expect(src).not.toContain("'conversation.session.header.actions'")
  })

  it('TC-1b order: -20（小于「在应用中打开」的 -10，故落在右侧工具组最左）', () => {
    const src = clientSrc('index.ts')
    const block = src.slice(src.indexOf("id: PANEL_NAME + ':progress'"), src.indexOf("id: PANEL_NAME + ':progress'") + 120)
    expect(block).toContain('order: -20')
  })
})

describe('TC-2/TC-3/TC-4 样式契约（档位阈值单一源 / 收缩兜底 / 面板双模）', () => {
  it('TC-2 三段 @container 的阈值与 FLOW_TIERS 逐一相等', () => {
    for (const value of Object.values(FLOW_TIERS)) {
      expect(BOARD_CSS).toContain('max-width: ' + value + 'px')
    }
  })

  it('TC-3 收缩与兜底：容器可压缩 + 内层横向滚动兜底', () => {
    expect(BOARD_CSS).toContain('.dsh-pm-cprog {')
    expect(BOARD_CSS).toContain('min-width: 0')
    expect(BOARD_CSS).toContain('max-width: min(64vw, calc(100vw - 320px))') // 降级路径安全网
    expect(BOARD_CSS).toContain('max-width: none') // 容器查询可用时交还行布局
    expect(BOARD_CSS).toContain('overflow-x: auto')
  })

  it('TC-4 详情面板：与会话框最左边对齐（宽档锚会话框根，窄档 fixed 贴左）', () => {
    expect(BOARD_CSS).toContain('position: absolute; top: 84px; left: 0; right: auto')
    // 单模即够：容器查询的 layout containment 让面板始终相对会话框定位（不需要窄档切 fixed）
    expect(BOARD_CSS).not.toContain('position: fixed; top: 78px')
    expect(NODE_PANEL_CSS).toContain('box-sizing: border-box')
    // 关键：容器不再定位，面板才能锚到会话框根（否则会被拉回芯片右下角）
    expect(BOARD_CSS).not.toContain('.dsh-pm-cprog { position: relative;')
    // 实际生效的宽度在 node-panel.ts 外壳里，按会话框收敛
    expect(NODE_PANEL_CSS).toContain('width: min(720px, calc(100% - 32px))')
  })
})

describe('TC-6 无绑定需求时的零噪音早退仍在', () => {
  it('TC-6 hasRequirement 非 true 时返回 null（槽位不占位）', () => {
    const src = clientSrc('conversation-progress.ts')
    expect(src).toContain('data.hasRequirement !== true')
    expect(src).toContain('return null')
    expect(src).toContain('buildFlowChartModel')
  })
})

/**
 * REQ-261004143941-b2ca FR-2/FR-3：需求累计 token 的落模型规则与「它不在档位降级范围内」的结构保证。
 *
 * 为什么结构也要断言：本需求的原发病就是「CSS 档位把 token 藏了」。若后人把徽章挪进 `.dsh-pm-flow`
 * 的渲染分支里，模型层用例仍会全绿，而用户又会看不到数——TC-2e/TC-2f 就是拦这一手。
 */
describe('REQ-261004143941-b2ca · TC-2 累计 token 落模型与档位无关性', () => {
  it('TC-2a 有值时落模型', () => {
    expect(buildFlowChartModel({ tokenTotal: 1234 }).tokenTotal).toBe(1234)
  })

  it('TC-2b 不传 → 键不存在（不是 undefined 值键）', () => {
    expect('tokenTotal' in buildFlowChartModel({})).toBe(false)
  })

  it('TC-2c 0 视为「无」（不渲染「🪙 0」）', () => {
    expect('tokenTotal' in buildFlowChartModel({ tokenTotal: 0 })).toBe(false)
  })

  it('TC-2d NaN / Infinity / 负数视为「无」', () => {
    expect('tokenTotal' in buildFlowChartModel({ tokenTotal: Number.NaN })).toBe(false)
    expect('tokenTotal' in buildFlowChartModel({ tokenTotal: Number.POSITIVE_INFINITY })).toBe(false)
    expect('tokenTotal' in buildFlowChartModel({ tokenTotal: -1 })).toBe(false)
  })

  it('TC-2e 徽章在 .dsh-pm-flow 之外、计数之后（否则又会被档位藏掉）', () => {
    const src = clientSrc('conversation-progress.ts')
    expect(src).toContain('dsh-pm-cprog-token-total')
    const countAt = src.indexOf("className: 'dsh-pm-cprog-inline-count'")
    expect(countAt).toBeGreaterThan(-1)
    // DOM 次序：同一个 children 数组里，徽章挂在计数 span **之后**（源码里徽章先算好、后插入）
    expect(src.indexOf('[tokenTotalBadge] : [])')).toBeGreaterThan(countAt)
    // 节点渲染循环里不得出现徽章类名（即徽章不属于 flow 内部——档位规则只作用于 flow 内部）
    const loop = src.slice(src.indexOf('model.nodes.forEach'), src.indexOf('if (idx < model.nodes.length - 1)'))
    expect(loop).not.toContain('dsh-pm-cprog-token-total')
  })

  it('TC-2f 样式侧：徽章显隐策略 = 默认隐藏 + 明细全隐的窄档让位（REQ-261004151652-d535 FR-3 改版）', () => {
    // 旧版断言「没有任何规则把徽章藏掉」是上一需求（窄档常显总数）的口径；
    // 本需求改成「宽档不重复、窄档让位」，故断言随之改为**成对**出现：
    // ① 默认隐藏（宽档不显）② label 档块内显示（明细全隐时交出总数）。
    expect(TOKEN_CSS).toContain('.dsh-pm-cprog-token-total { display: none;')
    // 显示规则必须**带 .dsh-pm-cprog-inline 前缀**：分片拼接顺序是 BASE → BOARD → TOKEN，
    // 同特异性时「后被追加者胜」——不带前缀会被 TOKEN_CSS 的默认 display:none 压住，
    // 窄档反而没有总数（实测踩过：探针报 TOTAL_MISSING）。
    expect(BOARD_CSS).toContain('.dsh-pm-cprog-inline .dsh-pm-cprog-token-total { display: inline-flex; }')
    // 极窄档仍收掉图标、只留数字
    expect(BOARD_CSS).toContain('.dsh-pm-cprog-token-ico { display: none; }')
    // 显示规则必须落在 @container 块里（否则等于常显，宽档会与明细重复）
    const at = BOARD_CSS.indexOf('.dsh-pm-cprog-token-total { display: inline-flex; }')
    const blockStart = BOARD_CSS.lastIndexOf('@container', at)
    expect(blockStart).toBeGreaterThan(-1)
    expect(BOARD_CSS.slice(blockStart, at)).toContain('max-width:')
  })

  // REQ-261004151652-d535：阈值等式、纵排排版与「不许拆档」的结构守卫
  it('TC-2g 阈值等式：token === label，且三段阈值与常量逐一相等', () => {
    expect(FLOW_TIERS.token).toBe(FLOW_TIERS.label)
    expect(FLOW_TIERS).toEqual({ token: 600, link: 780, label: 600 })
    for (const value of Object.values(FLOW_TIERS)) {
      expect(BOARD_CSS).toContain('max-width: ' + value + 'px')
    }
  })

  it('TC-2h 节点内纵排（名字在上、数字在下）', () => {
    expect(TOKEN_CSS).toMatch(/\.dsh-pm-flow-meta\s*\{[^}]*flex-direction:\s*column/)
  })

  it('TC-2i 节点级 token 与 label 不许被拆到两个断点（等式是刻意的）', () => {
    // 判据：全 CSS 里「藏节点 token」的规则**有且只有一处**，且它所在的那一段 @container
    // 里同时藏着 `.dsh-pm-flow-node .dsh-pm-flow-meta`——即名字与数在同一断点让位。
    // 分开就意味着「有名字没数」又回来了（本需求的原病）。
    const tokenHide = '.dsh-pm-flow-token { display: none; }'
    const metaHide = '.dsh-pm-flow-node .dsh-pm-flow-meta { display: none; }'
    // split('@container') 的每段 = 一个档位块（含其规则体，直到下一个 @container）
    const blocks = BOARD_CSS.split('@container').slice(1)
    const holders = blocks.filter(b => b.includes(tokenHide))
    expect(holders).toHaveLength(1)
    expect(holders[0]).toContain(metaHide)
  })
})
