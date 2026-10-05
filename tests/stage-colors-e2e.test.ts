/**
 * 端到端场景用例（REQ-260930182521-4fee · 覆盖 v1-8 E2E 缺口）
 *
 * 场景（多组件串联，断言可观察终态）：
 *   队列数据（真实写路径 QueueTaskStore.createMany → queue.json）
 *     → 看板读路径（JsonQueueRepository + QueueTaskStore.listByRequirement）
 *       → 两个视图渲染（renderNodePanel 泳道 HTML、buildDagData + resolveTasks + cardHtml 画布数据）
 *         → 终态：同一张卡在两视图的着色阶段一致，且等于它所在列的列头色，颜色取自唯一色板。
 *
 * 与单元测试的差别：本用例不构造渲染入参，而是走**生产的写/读存储与渲染入口**，
 * 断言"用户实际看到的终态"（卡片颜色 = 所处阶段）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { renderNodePanel } from '../src/client/node-panel.js'
import { buildDagData } from '../src/client/views/dag-view.js'
import { resolveTasks } from '../src/client/dag/integration.js'
import { cardHtml } from '../src/client/dag/card-renderer.js'
import { STAGE_COLORS, getStatusBackgroundColor } from '../src/client/dag/card-types.js'
import { NODE_PANEL_CSS } from '../src/client/styles/node-panel.js'
import { ALL_STAGE_KEYS } from '../src/shared/protocol.js'

const REQ = 'REQ-e2e-colors'
let root = ''
let tasks: any[] = []

const agent = { kind: 'agent' as const, sessionId: 'e2e' }
const card = (over: Record<string, unknown> = {}) => ({
  requirementId: REQ, description: 'e2e 场景卡', phase: 'implement', side: 'frontend',
  dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'e2e',
  context: '端到端场景', status: 'in_progress', blocked: false, executions: [], comments: [],
  version: 1, createdAt: 1, updatedAt: 1, createdBy: agent, updatedBy: agent, ...over,
})

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'req-e2e-'))
  const store = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: root }), now: () => 1000 })
  // 父卡 P：子卡链走到「测试」；父卡 Q：子卡链走到「复核」
  await store.createMany(REQ, [
    card({ id: 't-p', title: '父卡 P' }),
    card({ id: 't-p-dev', title: 'P·研发', parentId: 't-p', stageKind: 'dev', status: 'done' }),
    card({ id: 't-p-int', title: 'P·联调', parentId: 't-p', stageKind: 'integrate', status: 'done' }),
    card({ id: 't-p-rev', title: 'P·复核', parentId: 't-p', stageKind: 'review', status: 'done' }),
    card({ id: 't-p-tst', title: 'P·测试', parentId: 't-p', stageKind: 'test' }),
    card({ id: 't-q', title: '父卡 Q' }),
    card({ id: 't-q-dev', title: 'Q·研发', parentId: 't-q', stageKind: 'dev', status: 'done' }),
    card({ id: 't-q-int', title: 'Q·联调', parentId: 't-q', stageKind: 'integrate', status: 'done' }),
    card({ id: 't-q-rev', title: 'Q·复核', parentId: 't-q', stageKind: 'review' }),
  ] as never[])
  const readStore = new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: root }), now: () => 2000 })
  tasks = [...(await readStore.listByRequirement(REQ))]
})

afterAll(() => { if (root.length > 0) rmSync(root, { recursive: true, force: true }) })

/** 截取某一列 HTML。 */
function col(html: string, key: string): string {
  const start = html.indexOf('data-col="' + key + '"')
  if (start < 0) return ''
  const rest = html.slice(start)
  const next = rest.indexOf('data-col="', 10)
  return next < 0 ? rest : rest.slice(0, next)
}

describe('E2E 场景：队列 → 双视图 → 同色终态', () => {
  it('走到「测试」的父卡：泳道/列头/画布三处同为 testing 色', () => {
    // ① 泳道视图（生产渲染入口）
    const overview = {
      requirementId: REQ, category: 'feature', currentStage: 'implementing',
      stages: ALL_STAGE_KEYS.map((stage) => ({
        stage, enabled: true, artifacts: [], pendingConfirmation: false,
        timeline: [{ status: stage, at: 1, by: { kind: 'human' } }],
        body: stage === 'implementing' ? { tasks, byWindow: {} } : {},
      })),
    }
    const panelHtml = renderNodePanel({ overview, stage: 'implementing', requirement: { id: REQ, title: 'e2e', category: 'feature' } } as never)
    const testingCol = col(panelHtml, 'testing')
    expect(testingCol).toContain('t-p')
    expect(testingCol).toContain('data-status="testing"')

    // ② 画布数据（同一份任务走生产构建入口）
    const data = buildDagData(tasks as never[], undefined)
    const resolved = resolveTasks(data.cards as never[], data.pool as never[])
    const parent = resolved.find((x: any) => x.id === 't-p')!
    expect(parent.stageKey).toBe('testing')
    expect(cardHtml(parent)).toContain('data-status="testing"')

    // ③ 终态：两视图着色 key 相同，且颜色取自唯一色板
    expect(getStatusBackgroundColor(parent.stageKey!)).toBe(STAGE_COLORS.testing.bg)
    // ④ 列头色点同色（CSS 由同一色板插值）
    expect(NODE_PANEL_CSS).toContain('.dsh-pm-np-col[data-col="testing"] .dsh-pm-np-col-head::before { background: ' + STAGE_COLORS.testing.fg)
  })

  it('走到「复核」的父卡：泳道/画布两处同为 in_review 色', () => {
    const overview = {
      requirementId: REQ, category: 'feature', currentStage: 'implementing',
      stages: ALL_STAGE_KEYS.map((stage) => ({
        stage, enabled: true, artifacts: [], pendingConfirmation: false,
        timeline: [{ status: stage, at: 1, by: { kind: 'human' } }],
        body: stage === 'implementing' ? { tasks, byWindow: {} } : {},
      })),
    }
    const panelHtml = renderNodePanel({ overview, stage: 'implementing', requirement: { id: REQ, title: 'e2e', category: 'feature' } } as never)
    expect(col(panelHtml, 'in_review')).toContain('data-status="in_review"')

    const data = buildDagData(tasks as never[], undefined)
    const parent = resolveTasks(data.cards as never[], data.pool as never[]).find((x: any) => x.id === 't-q')!
    expect(parent.stageKey).toBe('in_review')
    expect(getStatusBackgroundColor(parent.stageKey!)).toBe(STAGE_COLORS.in_review.bg)
  })

  it('存量卡（无子卡）在两视图保持自身状态色（回溯兼容）', () => {
    const legacy = tasks.find((t: any) => t.id === 't-p-dev')!
    const data = buildDagData(tasks as never[], undefined)
    const resolved = resolveTasks(data.pool as never[])
    const poolLegacy = resolved.find((x: any) => x.id === 't-p-dev')!
    expect(poolLegacy.stageKey).toBe('done')
    expect(legacy.status).toBe('done')
  })
})
