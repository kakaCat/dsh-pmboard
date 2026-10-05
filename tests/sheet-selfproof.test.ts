/**
 * 生产链路自证（REQ-260930183951-eb6c t5）serves: FR-1, FR-2, FR-3, FR-4
 *
 * 为什么要有这个文件：本需求三处修复都落在「验收单生成」这条链上，单测只能证明零件。
 * 这里用**真实用例** `submitVerification` 跑一遍整链（临时工作区 + 1 父卡 + 3 子卡 + 1 个失效锚点），
 * 一次断言四件事：
 *   FR-1 任务项不再被子卡注水（只出顶层卡）
 *   FR-2 失效锚点变成**可见项**并点名路径
 *   FR-3 编号 `v1-1..v1-N` 连续无空洞
 *   FR-4 系统项标题互不相同（不再多行同名）
 *
 * 替代说明：原计划用 2d65 的现成样本自证，但它的需求目录已被并发覆写删除（见 tests/incident-2026-09-30-docs-wipe.md），
 * 故改用「可复现的临时工作区样本」——证据不依赖宿主状态，反而更强。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineVerifySubmitTool, seedQueueTasks, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { ANCHOR_GAP_PREFIX, requirementItemTitle } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

const W = 'session-selfproof'
const REQ_ID = 'REQ-selfproof'

let dir: string
let store: ReturnType<typeof makeTestStore>
let verify: { execute: (a: unknown, e: unknown) => Promise<any> }
let deps: ReqboardToolDeps

const mk = (over: Partial<TaskRecord> & { id: string; acceptance: string }): TaskRecord => ({
  requirementId: REQ_ID,
  title: '任务',
  description: '',
  phase: 'implement' as const,
  side: 'backend' as const,
  dependsOn: [],
  scope: { apis: [], tables: [], files: [] },
  context: '',
  status: 'done' as const,
  blocked: false,
  executions: [],
  comments: [],
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  createdBy: { kind: 'agent', sessionId: W },
  updatedBy: { kind: 'agent', sessionId: W },
  ...over,
} as unknown as TaskRecord)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-selfproof-'))
  // 造出「像本仓」的工作区：tests/ 目录存在 + 一个真实锚点；另一个锚点故意缺失。
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'tests', 'real.test.ts'), '// 真实存在的锚点\n')
  store = makeTestStore()
  deps = { store, now: () => Date.now(), workspaceRoot: dir }
  verify = defineVerifySubmitTool(deps) as never
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('REQ-260930183951-eb6c t5：验收单生成整链自证', () => {
  it('子卡不注水 / 锚点失效可见 / 编号连续 / 标题可区分（一次跑通四件事）', async () => {
    const r = {
      id: REQ_ID, title: '自证需求', description: '', status: 'implementing', category: 'feature',
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
    await seedQueueTasks(deps, REQ_ID, [
      mk({ id: 't-parent', title: '父卡', acceptance: 'npx vitest run tests/real.test.ts 全绿' }),
      mk({ id: 't-sub1', title: '父卡·研发', parentId: 't-parent', acceptance: 'npx vitest run tests/real.test.ts 全绿' }),
      mk({ id: 't-sub2', title: '父卡·复核', parentId: 't-parent', acceptance: 'npx vitest run tests/real.test.ts 全绿' }),
      mk({ id: 't-sub3', title: '父卡·测试', parentId: 't-parent', acceptance: 'npx vitest run tests/real.test.ts 全绿' }),
      mk({ id: 't-broken', title: '锚点已失效的卡', acceptance: 'npx vitest run tests/gone-forever.test.ts 全绿' }),
    ])

    const out = await verify.execute({ summary: '交付', evidence: ['npx vitest run 全绿'] }, { agent: { id: W } })
    expect(out.success).toBe(true)
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(out.sheet_items).toBe(sheet.items.length)

    // FR-1：只有顶层卡进验收单（旧口径会出 5 项：父卡 + 3 子卡 + 失效锚点卡）
    const taskIds = sheet.items
      .filter(i => i.source.kind === 'task')
      .map(i => (i.source as { taskId: string }).taskId)
    expect(taskIds).toEqual(['t-parent', 't-broken'])

    // FR-2：失效锚点是一条可见项，且点名到具体路径
    const anchor = sheet.items.find(i => i.criterion.startsWith(ANCHOR_GAP_PREFIX))
    expect(anchor).toBeDefined()
    expect(anchor!.criterion).toContain('tests/gone-forever.test.ts')
    expect(anchor!.gapKind).toBe('consistency')
    expect(anchor!.status).toBe('pending')

    // FR-3：编号连续无空洞
    expect(sheet.items.map(i => i.id)).toEqual(sheet.items.map((_, idx) => `v1-${idx + 1}`))

    // FR-4：系统项标题互不相同（旧口径多行同名）
    const titles = sheet.items
      .filter(i => i.source.kind === 'requirement')
      .map(i => requirementItemTitle(i.criterion, i.gapKind))
    expect(titles.length).toBeGreaterThan(1)
    expect(new Set(titles).size).toBe(titles.length)
  })
})
