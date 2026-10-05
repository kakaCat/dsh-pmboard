/**
 * 验收单数据模型单测（REQ-2e9473 t13/W6）：verify_submit 生成逐项验收单
 * （每任务验收标准 + 需求级标准）、版本化、返工只含未过项。
 * REQ-260930094139-2d65 FR-2（子卡去重，TC-2.1~2.4）与 FR-5（追溯断链，TC-4.1~4.4）同文件。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineVerifySubmitTool, seedQueueTasks, type ReqboardToolDeps } from './helpers/tool-deps.js'
import type { RequirementRecord, TaskRecord, VerificationItem } from '../src/shared/protocol.js'

const W = 'session-abc-123'
const REQ_ID = 'REQ-abc123'
let dir: string
let store: ReturnType<typeof makeTestStore>
let verify: { execute: (a: unknown, e: unknown) => Promise<any> }
/**
 * **同一个 deps 对象**贯穿"播种 / 工具 / 断言"：tool-deps 按 deps 对象记忆化 TaskStore，
 * 每换一次 deps 就换一个队列 —— 三处不共用同一个对象就会出现"工具读 A、断言读 B"的假红。
 */
let deps: ReqboardToolDeps

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-sheet-'))
  store = makeTestStore()
  deps = { store, now: () => Date.now() }
  verify = defineVerifySubmitTool(deps) as never
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function seedWithTasks(): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '看板需求', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  // v9：任务唯一存储 = 队列（台账不再有 tasks 通道）。同一个 deps → 同一 store，工具才看得见。
  const mk = (id: string, title: string, acceptance: string): TaskRecord => ({
    id, requirementId: REQ_ID, title, description: '', phase: 'implement' as const, side: 'backend' as const,
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance, context: '',
    status: 'done' as const, blocked: false, executions: [], comments: [], version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  })
  // 迁移（REQ-d3e61a T-9）：本文件不引用这两段文本，只求能满足"验收项可照着验"的门禁。
  await seedQueueTasks(deps, REQ_ID, [
    mk('t-aaaaaa', '任务一', 'npx vitest run tests/reqboard.test.ts 全绿'),
    mk('t-bbbbbb', '任务二', 'npx vitest run tests/client-view.test.ts 全绿'),
  ])
}
const run = (args: unknown) => verify.execute(args, { agent: { id: W } })

describe('验收单生成（t13）', () => {
  it('v1 含每任务验收标准 + 一条需求级标准，逐项带证据且 pending', async () => {
    await seedWithTasks()
    const out = await run({ summary: '交付完成', evidence: ['npx vitest run 全绿'] })
    expect(out.sheet_version).toBe(1)
    expect(out.sheet_items).toBe(3) // 2 任务 + 1 需求级
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(sheet.version).toBe(1)
    // v5（REQ-47939a t4）：source 由字符串改为判别联合
    expect(sheet.items.map(i => i.source)).toEqual([
      { kind: 'task', taskId: 't-aaaaaa' },
      { kind: 'task', taskId: 't-bbbbbb' },
      { kind: 'requirement' },
    ])
    // 迁移（REQ-d3e61a T-11）：同 domain/acceptance-sheet.test.ts——验的是顺序与来源，文案随格式升级。
    expect(sheet.items.map(i => i.criterion)).toEqual(['【任务一】验收：npx vitest run tests/reqboard.test.ts 全绿', '【任务二】验收：npx vitest run tests/client-view.test.ts 全绿', expect.stringMatching(/需求级/)])
    expect(sheet.items.every(i => i.status === 'pending')).toBe(true)
    expect(sheet.items.every(i => i.evidence.length === 1)).toBe(true)
    expect(sheet.items.every(i => /^v1-\d+$/.test(i.id))).toBe(true)
  })

  it('返工续验：上一版有未过项 → v2 带过「未过项 + 未裁决项」且 rework_only=true', async () => {
    await seedWithTasks()
    await run({ summary: '交付完成', evidence: ['npx vitest run 全绿'] })
    // 模拟用户裁决：第 2 项不通过
    const __id = (await store.listSummaries({ scope: 'all' })).items[0]!.id
    await store.mutate(__id, (req) => {
      const items: VerificationItem[] = req.verification!.sheet!.items
      items[1].status = 'failed'
      items[1].opinion = '截图不清晰'
      items[0].status = 'passed'
      return { changed: true }
    })
    const out2 = await run({ summary: '修复后重交', evidence: ['新截图路径'] })
    expect(out2.sheet_version).toBe(2)
    expect(out2.rework_only).toBe(true)
    // D-7 修复后：v2 = 未过项（t-bbbbbb）+ 未裁决的需求级项 —— 未验项不许被静默丢弃
    expect(out2.sheet_items).toBe(2)
    const v2 = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(v2.items).toHaveLength(2)
    expect(v2.items.map(i => i.source)).toEqual([
      { kind: 'task', taskId: 't-bbbbbb' },
      { kind: 'requirement' },
    ])
    expect(v2.items.every(i => i.status === 'pending')).toBe(true)
    expect(v2.items[0].opinion).toBeUndefined()
    // 历史留痕：v1 进 sheetHistory
    const hist = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheetHistory!
    expect(hist).toHaveLength(1)
    expect(hist[0].version).toBe(1)
    expect(hist[0].items[1].status).toBe('failed')
  })
})

describe('REQ-260930094139-2d65 FR-2：验收单只收顶层父卡（TC-2.1~2.4）', () => {
  async function seedWithParentAndSubs(): Promise<void> {
    const r = {
      id: REQ_ID, title: '子卡去重', description: '', status: 'implementing', category: 'feature',
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
    const mk = (id: string, title: string, parentId?: string): TaskRecord => ({
      id, requirementId: REQ_ID, title, description: '', phase: 'implement' as const, side: 'backend' as const,
      dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run 全绿', context: '',
      status: 'done' as const, blocked: false, executions: [], comments: [], version: 1,
      createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
      ...(parentId !== undefined ? { parentId } : {}),
    })
    await seedQueueTasks(deps, REQ_ID, [
      mk('t-parent1', '父卡一'),
      mk('t-sub1', '父卡一·研发', 't-parent1'),
      mk('t-sub2', '父卡一·联调', 't-parent1'),
      mk('t-sub3', '父卡一·测试', 't-parent1'),
    ])
  }

  it('TC-2.1 1 父卡 + 3 子卡提交 → 任务验收项只有父卡 1 项（+1 需求级）', async () => {
    await seedWithParentAndSubs()
    const out = await run({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    expect(out.sheet_items).toBe(2) // 1 父卡 + 1 需求级
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(sheet.items.filter(i => i.source.kind === 'task')).toHaveLength(1)
    expect(sheet.items[0].source).toEqual({ kind: 'task', taskId: 't-parent1' })
  })

  it('TC-2.2 domain 二次过滤：调用方把子卡传进 buildSheet 也只出父卡项', async () => {
    // 直接打 domain——模拟未来新调用方漏过滤的场景（双保险验证）。
    const { buildSheet } = await import('../src/domain/workflow/AcceptanceSheetSpec.js')
    const built = buildSheet({
      sheetHistoryLength: 0,
      tasks: [
        { id: 't-parent9', title: '父卡九', acceptance: '验收标准' },
        { id: 't-sub9', title: '子卡九', acceptance: '验收标准', parentId: 't-parent9' },
      ],
      evidence: ['e'],
      generatedAt: 1,
      generatedBy: { kind: 'human' },
    })
    const taskItems = built.sheet.items.filter(i => i.source.kind === 'task')
    expect(taskItems).toHaveLength(1)
    expect(taskItems[0].source).toEqual({ kind: 'task', taskId: 't-parent9' })
  })

  it('TC-2.3 canceled 父卡不出现；其子卡也不顶替出现', async () => {
    const r = {
      id: REQ_ID, title: '取消父卡', description: '', status: 'implementing', category: 'feature',
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
    const mk = (id: string, title: string, status: 'done' | 'canceled', parentId?: string): TaskRecord => ({
      id, requirementId: REQ_ID, title, description: '', phase: 'implement' as const, side: 'backend' as const,
      dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run 全绿', context: '',
      status, blocked: false, executions: [], comments: [], version: 1,
      createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
      ...(parentId !== undefined ? { parentId } : {}),
    })
    await seedQueueTasks(deps, REQ_ID, [
      mk('t-canceled-parent', '被取消的父卡', 'canceled'),
      mk('t-live-parent', '在册父卡', 'done'),
      mk('t-canceled-sub', '被取消父卡的子卡', 'done', 't-canceled-parent'),
    ])
    await run({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    const taskIds = sheet.items.filter(i => i.source.kind === 'task').map(i => (i.source as { taskId: string }).taskId)
    expect(taskIds).toEqual(['t-live-parent'])
  })

  it('TC-2.4 无子卡需求（全部顶层）行为与旧版逐字节一致', async () => {
    await seedWithTasks() // 2 张顶层卡，无 parentId
    const out = await run({ summary: '交付完成', evidence: ['npx vitest run 全绿'] })
    expect(out.sheet_items).toBe(3) // 2 任务 + 1 需求级
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(sheet.items.map(i => i.source)).toEqual([
      { kind: 'task', taskId: 't-aaaaaa' },
      { kind: 'task', taskId: 't-bbbbbb' },
      { kind: 'requirement' },
    ])
  })
})

describe('REQ-260930094139-2d65 FR-5：追溯断链提示项（TC-4.1~4.4）', () => {
  /**
   * 非 legacy 工作区：9 类验收文档 + FR 声明 + 覆盖标注（过文档门禁与覆盖度门禁），
   * 使 verifyGateProbe 真正跑 RTM 同步并写出 rtm-accepting.yml。
   */
  function seedNonLegacyWorkspace(frLines: string[]): void {
    const reqDir = join(dir, 'docs', 'requirements', REQ_ID)
    const frDir = join(reqDir, 'functional-requirements')
    mkdirSync(frDir, { recursive: true })
    writeFileSync(join(reqDir, 'requirement.md'), '# 需求\n\n' + frLines.map(l => `**${l}**`).join('\n\n') + '\n')
    mkdirSync(join(reqDir, 'design'), { recursive: true })
    writeFileSync(join(reqDir, 'design', 'architecture.md'), '## 架构 serves: FR-1\n\n内容')
    for (const d of ['data-model', 'interfaces', 'test-cases']) writeFileSync(join(reqDir, 'design', d + '.md'), '# ' + d)
    writeFileSync(join(reqDir, 'decomposition.md'), '# 拆分计划\n\n## 覆盖对照表\n\n| 需求条款 | 接收任务 |\n| --- | --- |\n| FR-1 | t-aaaaaa |')
    mkdirSync(join(reqDir, 'reviews'), { recursive: true }); writeFileSync(join(reqDir, 'reviews', 'r1.md'), '# review')
    mkdirSync(join(reqDir, 'tests'), { recursive: true }); writeFileSync(join(reqDir, 'tests', 't1.md'), '# test\n\ncovers: t-aaaaaa')
    mkdirSync(join(reqDir, 'tasks'), { recursive: true }); writeFileSync(join(reqDir, 'tasks', 't-aaaaaa.md'), '# task')
  }

  /** 预置 rtm-decomposing.yml：fr_to_tasks 映射（模拟拆分阶段已生成的追溯链）。 */
  function seedDecomposingYml(frToTasks: Record<string, string[]>): void {
    const reqDir = join(dir, 'docs', 'requirements', REQ_ID)
    const body = [
      'metadata:',
      '  generated_at: "2026-09-30T00:00:00.000Z"',
      '  generated_by: test',
      '  requirement_id: ' + REQ_ID,
      '  stage: decomposing',
      'inputs:',
      '  requirements: []',
      '  design_sections: []',
      'outputs:',
      '  tasks: []',
      'traceability:',
      '  design_to_tasks: {}',
      '  fr_to_tasks:',
      ...Object.entries(frToTasks).map(([fr, ts]) => `    ${fr}:\n${ts.map(t => `      - ${t}`).join('\n')}`),
      'coverage:',
      '  implementation:',
      '    total: 1',
      '    covered: 1',
      '    uncovered: []',
      '    rate: 100',
    ].join('\n') + '\n'
    writeFileSync(join(reqDir, 'rtm-decomposing.yml'), body)
  }

  /** workspaceRoot 必须在工具定义前设定（FileDocRepository 在 define 时固化根）。 */
  function useWorkspaceRoot(): void {
    deps.workspaceRoot = dir
    verify = defineVerifySubmitTool(deps) as never
  }

  async function seedNonLegacyReq(): Promise<void> {
    const r = {
      id: REQ_ID, title: '断链告警', description: '', status: 'implementing', category: 'feature',
      blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
      artifacts: [
        { stage: 'brainstorming', kind: 'requirement', path: `docs/requirements/${REQ_ID}/requirement.md`, registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W } },
      ],
    } as unknown as RequirementRecord
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
    const mk = (id: string, title: string): TaskRecord => ({
      id, requirementId: REQ_ID, title, description: '', phase: 'implement' as const, side: 'backend' as const,
      dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run 全绿', context: '',
      status: 'done' as const, blocked: false, executions: [], comments: [], version: 1,
      createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
    })
    await seedQueueTasks(deps, REQ_ID, [mk('t-aaaaaa', '任务一')])
  }

  it('TC-4.1 存在 fr_to_tests 为空的 FR → 验收单出现追溯断链提示项（gapKind=traceability，不阻断提交）', async () => {
    useWorkspaceRoot()
    seedNonLegacyWorkspace(['FR-1: 已覆盖', 'FR-2: 断链点'])
    seedDecomposingYml({ 'FR-1': ['t-aaaaaa'] }) // FR-2 无任务映射 → 断链
    await seedNonLegacyReq()
    const out = await run({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    const gapItem = sheet.items.find(i => i.gapKind === 'traceability')
    expect(gapItem).toBeDefined()
    expect(gapItem!.source).toEqual({ kind: 'requirement' })
    expect(gapItem!.criterion).toContain('FR-2')
    expect(gapItem!.criterion).toContain('追溯断链')
    expect(gapItem!.status).toBe('pending')
    expect(out.sheet_version).toBe(1) // 提示项不阻断
  })

  it('TC-4.2 全部 FR 有测试映射 → 不出现追溯断链提示项', async () => {
    useWorkspaceRoot()
    seedNonLegacyWorkspace(['FR-1: 已覆盖'])
    seedDecomposingYml({ 'FR-1': ['t-aaaaaa'] })
    await seedNonLegacyReq()
    await run({ summary: '交付', evidence: ['npx vitest run 全绿'] })
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(sheet.items.find(i => i.gapKind === 'traceability')).toBeUndefined()
  })

  it('TC-4.3 RTM 探针失败（legacy 需求，无 docs 体系）→ 跳过读回，不报错也不出提示项', async () => {
    await seedWithTasks() // legacy：无 artifacts → verifyGateProbe = undefined
    const out = await run({ summary: '交付完成', evidence: ['npx vitest run 全绿'] })
    expect(out.sheet_version).toBe(1)
    const sheet = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(sheet.items.find(i => i.gapKind === 'traceability')).toBeUndefined()
  })

  it('TC-4.4 补映射后断链消失：预置断链 → 提交出提示项；补 rtm-decomposing 映射重交 → 提示项消失', async () => {
    useWorkspaceRoot()
    seedNonLegacyWorkspace(['FR-1: 已覆盖', 'FR-2: 断链点'])
    seedDecomposingYml({ 'FR-1': ['t-aaaaaa'] })
    await seedNonLegacyReq()
    await run({ summary: '交付', evidence: ['e'] })
    const v1 = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(v1.items.find(i => i.gapKind === 'traceability')).toBeDefined()
    // 补标注：FR-2 也映射到任务（模拟补 serves/covers 后 RTM 重算）
    seedDecomposingYml({ 'FR-1': ['t-aaaaaa'], 'FR-2': ['t-aaaaaa'] })
    const out2 = await run({ summary: '补标注后重交', evidence: ['e2'] })
    const v2 = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!
    expect(v2.items.find(i => i.gapKind === 'traceability')).toBeUndefined()
    expect(out2.sheet_version).toBe(2)
  })
})
