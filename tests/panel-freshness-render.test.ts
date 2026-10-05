/**
 * 面板新鲜度渲染单测（REQ-261001124111-5d36 t2 · 覆盖设计 TC-I…TC-M）。
 *
 * 本文件的两个不可退让的断言：
 *   ① 有 19 张卡就**不许**出现「暂无任务」（本次事故的假空态）；
 *   ② 不传 `freshness`/`buildNotice` 时输出里**一个新元素都不出现**（既有面板断言与视觉零变化）。
 *
 * serves: FR-2, FR-3, FR-5
 */
import { describe, it, expect } from 'vitest'
import { renderNodePanel, type NodePanelFreshness } from '../src/client/node-panel.js'
import type { StageDetail, StageOverview, StageKey, StageTaskExecution } from '../src/shared/protocol.js'
import { ALL_STAGE_KEYS } from '../src/shared/protocol.js'

const T0 = 1693000000000

function makeTask(over: Partial<StageTaskExecution> = {}): StageTaskExecution {
  return { id: 't-a1', title: '卡', status: 'todo', phase: 'implement', side: 'frontend', dependsOn: [], acceptance: 'x', executions: [], ...over } as StageTaskExecution
}

/** 19 张卡 = 12 张父卡（带依赖链）+ 7 张子卡 —— 与实测现场同量级。 */
function nineteen(): StageTaskExecution[] {
  const parents = Array.from({ length: 12 }, (_, i) => makeTask({
    id: 't-p' + i,
    title: '父卡 ' + i,
    ...(i > 0 ? { dependsOn: ['t-p' + (i - 1)] } : {}),
  }))
  const kids = Array.from({ length: 7 }, (_, i) => makeTask({
    id: 't-k' + i,
    title: '父卡 ' + i + '·研发',
    parentId: 't-p' + i,
    stageKind: 'dev',
  }))
  return [...parents, ...kids]
}

function makeOverview(currentStage: StageKey): StageOverview {
  const bodies: Record<string, unknown> = {
    draft: { title: '面板自刷新', category: 'feature', description: 'd', sourceWindow: 'w-abc123', createdAt: T0 },
    brainstorming: { requirementDoc: 'docs/requirements/REQ-test/requirement.md', comments: [] },
    design: { category: 'feature', designDocs: [] },
    decomposing: { decompositionDoc: 'docs/requirements/REQ-test/decomposition.md', tasks: nineteen(), planTasks: [] },
    implementing: { tasks: nineteen(), byWindow: {} },
    accepting: {},
    archived: {},
  }
  return {
    requirementId: 'REQ-test', category: 'feature', currentStage,
    stages: ALL_STAGE_KEYS.map(stage => ({
      stage, enabled: true, artifacts: [], pendingConfirmation: false,
      timeline: [{ status: stage, at: T0 - 3600000, by: { kind: 'human' } }],
      body: bodies[stage],
    } as unknown as StageDetail)),
  }
}

const REQ = { id: 'REQ-test', title: '面板测试', category: 'feature' }

function panel(stage: StageKey, extra: Record<string, unknown> = {}): string {
  return renderNodePanel({ overview: makeOverview(stage), stage, requirement: REQ, ...extra })
}

function clockText(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

describe('TC-I 拆分节点：19 张卡就画 DAG，不许出现「暂无任务」', () => {
  it('真实形状 payload 渲染出画布容器 + 新鲜度**稳定占位**（值由补丁填，不进字符串）', () => {
    const f: NodePanelFreshness = { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000, now: T0 + 1000 }
    const html = panel('decomposing', { freshness: f })
    expect(html).not.toContain('暂无任务')
    expect(html).toContain('np-dag-canvas')
    // REQ-261001210304-0dfb FR-3：字符串里只留钩子——不再含时间戳/陈旧标记（否则每轮轮询都重建整段 DOM）
    expect(html).toContain('data-dsh-pm-fresh-slot')
    expect(html).not.toContain('数据时间')
    expect(html).not.toContain('data-fetched-at')
    expect(html).not.toContain('data-refresh-ms')
  })
})

describe('TC-J 实施节点：泳道里出现父卡（不是空列）', () => {
  it('泳道 pane 内卡片元素 ≥12（12 张父卡），子卡不单独占卡', () => {
    const html = panel('implementing', { freshness: { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000, now: T0 } })
    const swim = html.slice(html.indexOf('data-pane="list"'))
    const cards = swim.match(/dsh-pm-np-card(?![-\w])/g) ?? []
    expect(cards.length).toBeGreaterThanOrEqual(12)
    expect(swim).not.toContain('暂无任务')
  })
})

describe('TC-K 陈旧与失败必须可见', () => {
  it('陈旧判据在**补丁**里生效（渲染串不再携带 data-stale）', () => {
    const html = panel('decomposing', { freshness: { fetchedAt: T0, intervalMs: 5000, staleAfterMs: 30000, now: T0 + 31000 } })
    expect(html).toContain('data-dsh-pm-fresh-slot')
    expect(html).not.toContain('data-stale')
    // 补值后的 is-stale / data-stale 行为由 tests/panel-hydrate.test.ts 覆盖（A3-1）
  })
  it('有旧快照 + 刷新失败 → 出红条（旧数据必须被点名）', () => {
    const f: NodePanelFreshness = { fetchedAt: T0, lastError: 'timeout', intervalMs: 5000, staleAfterMs: 30000, now: T0 + 60000 }
    const html = panel('decomposing', { freshness: f })
    expect(html).toContain('dsh-pm-np-fresh-err')
    expect(html).toContain('role="alert"')
    expect(html).toContain('刷新失败：timeout')
    expect(html).toContain('显示的是 ' + clockText(T0) + ' 的旧数据')
    expect(html).toContain('data-last-ok="' + T0 + '"')
  })
  it('从未成功过 → 失败文案不说"旧数据"（「数据时间 —」改由补丁填）', () => {
    const html = panel('decomposing', { freshness: { lastError: 'ECONNREFUSED', intervalMs: 5000, staleAfterMs: 30000, now: T0 } })
    expect(html).toContain('data-dsh-pm-fresh-slot')
    expect(html).not.toContain('数据时间')
    expect(html).toContain('暂无可用数据')
    expect(html).not.toContain('的旧数据')
  })
})

describe('TC-L 版本提示只在两戳不等时出现', () => {
  it('戳不同 → 可点的「插件已更新」提示', () => {
    const html = panel('decomposing', { buildNotice: { clientStamp: 'aaaa11112222', serverStamp: 'bbbb33334444' } })
    expect(html).toContain('dsh-pm-np-build-notice')
    expect(html).toContain('data-action="np-reload"')
    expect(html).toContain('插件已更新（aaaa11112222 → bbbb33334444），点此刷新')
    expect(html).toContain('data-client-build="aaaa11112222"')
  })
  it('戳相同或缺一 → 不出现提示', () => {
    expect(panel('decomposing', { buildNotice: { clientStamp: 'same', serverStamp: 'same' } })).not.toContain('dsh-pm-np-build-notice')
    expect(panel('decomposing', { buildNotice: { clientStamp: '', serverStamp: 'x' } })).not.toContain('dsh-pm-np-build-notice')
  })
})

describe('TC-K′ 渲染顺序：头 → 版本提示 → 失败红条 → 既有内容', () => {
  it('提示条不藏进折叠块，也不插到内容之后', () => {
    const html = panel('decomposing', {
      freshness: { fetchedAt: T0, lastError: 'timeout', intervalMs: 5000, staleAfterMs: 30000, now: T0 + 60000 },
      buildNotice: { clientStamp: 'aaaa11112222', serverStamp: 'bbbb33334444' },
    })
    const iHead = html.indexOf('class="dsh-pm-np-head"')
    const iNotice = html.indexOf('dsh-pm-np-build-notice')
    const iErr = html.indexOf('dsh-pm-np-fresh-err')
    const iBody = html.indexOf('dsh-pm-np-fold')
    expect(iHead).toBeGreaterThanOrEqual(0)
    expect(iNotice).toBeGreaterThan(iHead)
    expect(iErr).toBeGreaterThan(iNotice)
    expect(iBody).toBeGreaterThan(iErr)
  })
})

describe('TC-M 兼容：不传新入参 = 一个新元素都不出现', () => {  it('三个节点 × 缺省入参：无新鲜度/版本相关标记', () => {
    for (const stage of ['draft', 'decomposing', 'implementing'] as StageKey[]) {
      const html = panel(stage)
      expect(html, stage).not.toContain('dsh-pm-np-fresh')
      expect(html, stage).not.toContain('is-stale')
      expect(html, stage).not.toContain('np-reload')
      expect(html, stage).not.toContain('数据时间')
    }
  })
  it('显式传 undefined 与不传等价（可选参数不改变既有输出形状）', () => {
    expect(panel('implementing', { freshness: undefined, buildNotice: undefined })).toBe(panel('implementing'))
  })
})

// REQ-261001210304-0dfb · A2-1/A2-2（修前必红）：面板字符串必须对"只是时间往前走了"免疫
describe('A2 面板字符串稳定性：仅时间戳变化不得改变 __html', () => {
  const f = (fetchedAt: number): NodePanelFreshness => ({ fetchedAt, intervalMs: 5000, staleAfterMs: 30000, now: fetchedAt + 1000 })

  function dagSegment(html: string): string {
    const i = html.indexOf('data-dsh-pm-dag-panel') >= 0 ? html.indexOf('data-dsh-pm-dag-panel') : html.indexOf('dsh-pm-dag-panel')
    return i < 0 ? '' : html.slice(i)
  }

  it('A2-1：两轮（仅 fetchedAt 差 5000）renderNodePanel 输出逐字节相同', () => {
    for (const stage of ['decomposing', 'implementing'] as StageKey[]) {
      const a = panel(stage, { freshness: f(T0) })
      const b = panel(stage, { freshness: f(T0 + 5000) })
      expect(b, stage).toBe(a)
    }
  })

  it('A2-2：承载 DAG 的片段逐字节相同，且串里没有任何时间戳文本', () => {
    const a = panel('implementing', { freshness: f(T0) })
    const b = panel('implementing', { freshness: f(T0 + 5000) })
    expect(dagSegment(b)).toBe(dagSegment(a))
    expect(dagSegment(a).length).toBeGreaterThan(0)
    expect(a).not.toContain('刚刚')
    expect(a).not.toContain('分钟前')
    expect(a).not.toContain(String(T0))
  })
})
