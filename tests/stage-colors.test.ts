/**
 * 阶段色一致性测试（REQ-260930182521-4fee · t-754c40 · serves FR-1 / FR-2 / FR-3）
 *
 * 钉住两件事：
 *   ① 六阶段色值只有一个来源（STAGE_COLORS），Canvas 取色与泳道 CSS 都从它派生；
 *   ② 卡片着色阶段与泳道列归属同源（都走 laneOf）——不再出现「站在测试中列、显示开发中色」。
 */
import { describe, it, expect } from 'vitest'
import {
  STAGE_COLORS,
  getStatusBackgroundColor,
  getStatusTextColor,
  type TaskLaneKey,
} from '../src/client/dag/card-types.js'
import { cardHtml } from '../src/client/dag/card-renderer.js'
import { resolveTasks } from '../src/client/dag/integration.js'
import { laneOf } from '../src/client/dag/progress-bar.js'
import { NODE_PANEL_CSS } from '../src/client/styles/node-panel.js'
import { renderNodePanel } from '../src/client/node-panel.js'
import { ALL_STAGE_KEYS } from '../src/shared/protocol.js'

const LANE_KEYS: TaskLaneKey[] = ['todo', 'in_progress', 'integrating', 'testing', 'in_review', 'done']

/** 队列卡片最小形状（resolveTasks / cardHtml 的输入）。 */
const card = (over: Record<string, unknown> = {}) => ({
  id: 't-p1', title: '父卡', phase: 'implement', side: 'backend',
  status: 'in_progress', role: 'solo', dependsOn: [], ...over,
})

/** 组 A：子卡链走到「测试」（dev/integrate/review 全绿、test 在跑）。 */
const GROUP_A = [
  card({ id: 't-a', title: '父卡 A', status: 'in_progress' }),
  card({ id: 't-a-dev', parentId: 't-a', stageKind: 'dev', status: 'done' }),
  card({ id: 't-a-int', parentId: 't-a', stageKind: 'integrate', status: 'done' }),
  card({ id: 't-a-rev', parentId: 't-a', stageKind: 'review', status: 'done' }),
  card({ id: 't-a-tst', parentId: 't-a', stageKind: 'test', status: 'in_progress' }),
]
/** 组 B：子卡链走到「复核」（review 待开始）。 */
const GROUP_B = [
  card({ id: 't-b', title: '父卡 B', status: 'in_progress' }),
  card({ id: 't-b-dev', parentId: 't-b', stageKind: 'dev', status: 'done' }),
  card({ id: 't-b-int', parentId: 't-b', stageKind: 'integrate', status: 'done' }),
  card({ id: 't-b-rev', parentId: 't-b', stageKind: 'review', status: 'todo' }),
  card({ id: 't-b-tst', parentId: 't-b', stageKind: 'test', status: 'todo' }),
]

function makeOverview(tasks: unknown[]) {
  const bodies: Record<string, unknown> = {
    draft: {}, brainstorming: {}, design: {},
    decomposing: { decompositionDoc: undefined, tasks: [], planTasks: [] },
    implementing: { tasks, byWindow: {} },
    accepting: {}, archived: {},
  }
  return {
    requirementId: 'REQ-test', category: 'feature', currentStage: 'implementing',
    stages: ALL_STAGE_KEYS.map((stage) => ({
      stage, enabled: true, artifacts: [], pendingConfirmation: false,
      timeline: [{ status: stage, at: Date.now(), by: { kind: 'human' } }],
      body: bodies[stage],
    })),
  }
}
const REQ = { id: 'REQ-test', title: '阶段色测试', category: 'feature' }
const panel = (tasks: unknown[]) =>
  renderNodePanel({ overview: makeOverview(tasks), stage: 'implementing', requirement: REQ } as never)
/** 截取某一列的 HTML（从 data-col 到下一列）。 */
function col(html: string, key: string): string {
  const start = html.indexOf('data-col="' + key + '"')
  if (start < 0) return ''
  const rest = html.slice(start)
  const next = rest.indexOf('data-col="', 10)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('色板：六阶段唯一事实源（色板）', () => {
  it('STAGE_COLORS 含且仅含六个阶段，bg/fg 均非空（色板）', () => {
    expect(Object.keys(STAGE_COLORS).sort()).toEqual([...LANE_KEYS].sort())
    for (const k of LANE_KEYS) {
      expect(STAGE_COLORS[k].bg.length, k + ' bg').toBeGreaterThan(0)
      expect(STAGE_COLORS[k].fg.length, k + ' fg').toBeGreaterThan(0)
    }
  })
  it('取色函数与色板同源（色板）', () => {
    for (const k of LANE_KEYS) {
      expect(getStatusBackgroundColor(k)).toBe(STAGE_COLORS[k].bg)
      expect(getStatusTextColor(k)).toBe(STAGE_COLORS[k].fg)
    }
  })
  it('未知状态回落 todo 色，不再有第二套错位色值（色板）', () => {
    expect(getStatusBackgroundColor('nonsense')).toBe(STAGE_COLORS.todo.bg)
    expect(getStatusTextColor('nonsense')).toBe(STAGE_COLORS.todo.fg)
    // 旧 Canvas 错位色板（联调橙 / 测试绿 / 复核紫）已彻底删除
    expect(NODE_PANEL_CSS).not.toContain('#fff4e5')
    expect(NODE_PANEL_CSS).not.toContain('#e8f9ed')
    expect(NODE_PANEL_CSS).not.toContain('#f3e5ff')
    expect(JSON.stringify(STAGE_COLORS)).not.toContain('#fff4e5')
  })
})

describe('样式：泳道 CSS 由色板插值（样式）', () => {
  it('每个阶段的 bg 与 fg 都出现在 NODE_PANEL_CSS 里（样式）', () => {
    for (const k of LANE_KEYS) {
      expect(NODE_PANEL_CSS, k + ' bg').toContain(STAGE_COLORS[k].bg)
      expect(NODE_PANEL_CSS, k + ' fg').toContain(STAGE_COLORS[k].fg)
    }
  })
})

describe('着色：卡片颜色 = 所在阶段（着色）', () => {
  it('链走到测试的父卡：泳道落在测试中列且卡片着 testing 色（着色）', () => {
    const html = panel(GROUP_A)
    expect(col(html, 'testing')).toContain('t-a')
    expect(col(html, 'testing')).toContain('data-status="testing"')
    expect(col(html, 'in_progress')).not.toContain('t-a')
  })
  it('链走到复核的父卡：泳道落在待复核列且卡片着 in_review 色（着色）', () => {
    const html = panel(GROUP_B)
    expect(col(html, 'in_review')).toContain('data-status="in_review"')
  })
  it('DAG 画布同一张卡：stageKey 与列归属一致，cardHtml 同色（着色）', () => {
    const resolved = resolveTasks(GROUP_A as never[])
    const parent = resolved.find((t) => t.id === 't-a')!
    expect(laneOf(parent as never, (parent.kids ?? []) as never)).toBe('testing')
    expect(parent.stageKey).toBe('testing')
    expect(cardHtml(parent)).toContain('data-status="testing"')
  })
  it('组 B 同款：DAG 着色 = 待复核（着色）', () => {
    const parent = resolveTasks(GROUP_B as never[]).find((t) => t.id === 't-b')!
    expect(parent.stageKey).toBe('in_review')
    expect(cardHtml(parent)).toContain('data-status="in_review"')
  })
})

describe('兼容回落（着色）', () => {
  it('stageKey 缺省 → cardHtml 回落原始 status（着色）', () => {
    expect(cardHtml(card() as never)).toContain('data-status="in_progress"')
  })
  it('todo / 无子卡 done / solo 卡：stageKey = 原始 status（着色）', () => {
    const tasks = [
      card({ id: 't-todo', status: 'todo' }),
      card({ id: 't-done', status: 'done' }),
      card({ id: 't-solo', status: 'in_progress', stages: [] }),
      card({ id: 't-legacy', status: 'testing' }),
    ]
    const resolved = resolveTasks(tasks as never[])
    const byId = new Map(resolved.map((t) => [t.id, t.stageKey]))
    expect(byId.get('t-todo')).toBe('todo')
    expect(byId.get('t-done')).toBe('done')
    expect(byId.get('t-solo')).toBe('in_progress')
    expect(byId.get('t-legacy')).toBe('testing')
  })
})
