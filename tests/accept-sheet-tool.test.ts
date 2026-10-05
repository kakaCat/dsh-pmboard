/**
 * reqboard_accept_sheet 单测（REQ-2e9473 W6 补口）：弹框逐项验收 → 直接落库裁决
 * （系统见证，无需 agent 转述）→ 未过项自动返工；分批 + 断点续验；降级。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { makeTestStore } from './application/harness.js'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineVerifySubmitTool, defineAcceptSheetTool, queueTasksOf, seedQueueTasks, type ReqboardToolDeps } from './helpers/tool-deps.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-as-001'
const REQ_ID = 'REQ-as0001'
let dir: string
let store: ReturnType<typeof makeTestStore>
/**
 * **同一个 deps 对象**配所有工具（tool-deps 按 deps 记忆化 TaskStore）：
 * 每个工厂各建一个 deps 就会各得一个队列，"工具读 A、断言读 B"的假红必现。
 * 弹框通道按用例切换 → 直接改 `deps.userQuestions`（工厂内部是惰性读取 `() => deps.userQuestions?.()`）。
 */
let deps: ReqboardToolDeps

/**
 * 假弹框：answers 为批次队列（每次 ask 消费一批）；'delegated'/'abort' 为异常路径。
 * 队列耗尽后返回空答复（模拟用户未作答）。
 */
function sheetTool(answers: any[] | any[][] | 'delegated' | 'abort' | undefined) {
  const queue: any[][] = Array.isArray(answers) && Array.isArray((answers as any[])[0])
    ? [...(answers as any[][])]
    : (Array.isArray(answers) ? [answers as any[]] : [])
  const ask = async () => {
    if (answers === 'delegated') throw Object.assign(new Error('owned child'), { code: 'DELEGATED_CALLER' })
    if (answers === 'abort') throw Object.assign(new Error('aborted'), { code: 'ASK_ABORTED' })
    const batch = queue.shift() ?? []
    return { answers: batch }
  }
  if (answers !== undefined) deps.userQuestions = () => ({ ask })
  else delete deps.userQuestions
  return defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}
const verifyTool = () => defineVerifySubmitTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
const run = (tool: any, args: unknown) => tool.execute(args, { agent: { id: W } })

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-sheettool-'))
  store = makeTestStore()
  deps = { store, now: () => Date.now() }
  const r = {
    id: 'REQ-as0001', title: '验收弹框', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  // v9：任务唯一存储 = 队列（台账不再有 tasks 通道）
  await seedQueueTasks(deps, REQ_ID, Array.from({ length: 3 }, (_, i) => ({
    id: 't-as000' + (i + 1), requirementId: REQ_ID, title: '任务' + (i + 1), description: '', phase: 'implement' as const, side: 'backend' as const,
    dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: '验收标准 ' + (i + 1), implementation: '改 x' + (i + 1),
    context: '', status: 'done' as const, blocked: false, executions: [], comments: [], version: 1,
    createdAt: 1, updatedAt: 1, createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  })))
  await run(verifyTool(), { summary: '交付', evidence: ['npx vitest run 全绿'] })
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

const sheetOf = async () => ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.verification!.sheet!

describe('reqboard_accept_sheet', () => {
  it('分批：batch_size=2 → 本批记 2 项，剩 2 项（3 任务+1 需求级）继续', async () => {
    const sheet = await sheetOf()
    const ids = sheet.items.map(i => i.id)
    const out = await run(sheetTool([
      { id: ids[0], selected: ['✅ 通过'], custom: '实际结果：测试全绿' },
      { id: ids[1], selected: ['✅ 通过'], custom: '实际结果：测试全绿' },
    ]), { batch_size: 2 })
    expect(out.recorded).toBe(2)
    expect(out.pending).toBe(2)
    expect(out.note).toMatch(/断点继续/)
    expect(((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.status).toBe('accepting')
  })

  it('验收项已带 agent 记录的实际结果 → 人只点通过即记 passed（REQ-261001170807-06fd FR-5，推翻 b918 FR-1 的「必须手填」）', async () => {
    // 用户裁定（2026-10-01）：**验证是 agent 的活，人只做裁决**。
    // 验收项已带 agent 提交的实际结果（任务验收标准 / 验收材料证据）时，选"通过"即视为已复核，
    // 不再逼用户把证据重抄一遍——重抄既费人也不产生新信息。
    // 保留的底线：**没有**任何结果的项，选通过仍记 unverified（不冒充通过）。
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([{ id: ids[0], selected: ['✅ 通过'] }]), { batch_size: 3 })
    expect(out.recorded).toBe(1)
    const item = (await sheetOf()).items.find(i => i.id === ids[0])!
    const hasEvidence = item.evidence.length > 0
    expect(item.status).toBe(hasEvidence ? 'passed' : 'unverified')
    if (hasEvidence) expect(String(item.opinion ?? '')).toBe(item.evidence[0])
    // 未作答项仍然保持 pending（挂起点不受影响）
    expect((await sheetOf()).items.filter(i => i.status === 'pending')).toHaveLength(3)
  })

  it('选"改进"+自定义意见 → 记 failed，并**自动回退实施 + 建返工卡**（REQ-308b9a FR-8，推翻 REQ-a8d582 FR-2）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      { id: ids[0], selected: ['✅ 通过'], custom: '实际结果：符合预期' },
      { id: ids[1], selected: ['🛠 改进（需修改）'], custom: '边界没覆盖' },
      { id: ids[2], selected: ['❓ 其他'], custom: '需补充文档' },
    ]), { batch_size: 5 })
    expect(out.failed).toBe(2)
    expect(out.rework_tasks).toHaveLength(2)
    const snapReq = (await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id))!
    expect(snapReq.status).toBe('implementing')
    expect(await queueTasksOf(deps, REQ_ID)).toHaveLength(5) // 原有 3 张 + 2 张返工卡（v9：从队列读）
    expect(out.note).toMatch(/自动回退/)
    // 验收项裁决留痕
    const item = (await sheetOf()).items.find(i => i.id === ids[1])!
    expect(item.status).toBe('failed')
    expect(item.opinion).toBe('边界没覆盖')
    expect(item.decidedBy?.kind).toBe('human')
  })

  it('未作答的项保持 pending（挂起点）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    await run(sheetTool([{ id: ids[0], selected: ['✅ 通过'], custom: '实际结果：符合预期' }]), { batch_size: 3 })
    const s = await sheetOf()
    expect(s.items).toHaveLength(4) // 3 任务 + 1 需求级
    expect(s.items.filter(i => i.status === 'pending')).toHaveLength(3)
    expect(s.items.find(i => i.id === ids[0])!.status).toBe('passed')
    expect(s.items.find(i => i.id === ids[3])!.status).toBe('pending')
  })

  it('闭环返回值字段均在输出 schema 声明内（防 additionalProperties:false 拒收）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      ids.map(id => ({ id, selected: ['✅ 通过'], custom: '实际结果：全部符合' })),
      [{ id: 'final-pass', selected: ['✅ 验收通过并归档'] }],
    ]), { batch_size: 10 })
    const declared = new Set(['success', 'requirement_id', 'sheet_version', 'recorded', 'pending', 'passed', 'failed', 'rework_tasks', 'archived', 'status', 'fallback', 'note'])
    for (const k of Object.keys(out)) expect(declared.has(k), k).toBe(true)
  })

  it('弹框不可用 → fallback=board；subagent → fallback=board', async () => {
    const out1 = await run(sheetTool(undefined), {})
    expect(out1.fallback).toBe('board')
    const out2 = await run(sheetTool('delegated'), {})
    expect(out2.fallback).toBe('board')
  })

  it('用户取消 → 中性返回不记录', async () => {
    const out = await run(sheetTool('abort'), {})
    expect(out.success).toBe(false)
    expect((await sheetOf()).items.every(i => i.status === 'pending')).toBe(true)
  })

  it('全部通过后直接弹「验收通过」确认 → 同意即归档（闭环，用户要求）', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      // 第一批：逐项全过（通过必填实际结果，REQ-260930094139-2d65 FR-1）
      ids.map(id => ({ id, selected: ['✅ 通过'], custom: '实际结果：全部符合' })),
      // 第二批：最终确认
      [{ id: 'final-pass', selected: ['✅ 验收通过并归档'] }],
    ]), { batch_size: 10 })
    expect(out.archived).toBe(true)
    expect(out.status).toBe('archived')
    expect(out.note).toMatch(/已归档/)
    const req = ((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!
    expect(req.status).toBe('archived')
    expect(req.verification!.decision).toBe('pass')
    expect(req.verification!.reviewedBy?.kind).toBe('human')
  })

  it('最终确认选「暂不归档」→ 保持验收态', async () => {
    const ids = (await sheetOf()).items.map(i => i.id)
    const out = await run(sheetTool([
      ids.map(id => ({ id, selected: ['✅ 通过'], custom: '实际结果：全部符合' })),
      [{ id: 'final-pass', selected: ['暂不归档'] }],
    ]), { batch_size: 10 })
    expect(out.archived).toBeUndefined()
    expect(out.note).toMatch(/保持验收态/)
    expect(((await store.get((await store.listSummaries({ scope: 'all' })).items[0]!.id)))!.status).toBe('accepting')
  })
  it('弹框抛非权限异常 → 不得诬告"用户未作答"，须保留真因（REQ-261001170807-06fd FR-4）', async () => {
    deps.userQuestions = () => ({ ask: async () => { throw new Error('render failed: popup mount ENOENT') } })
    const out = await run(defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }, { batch_size: 2 })
    expect(out.success).toBe(false)
    expect(String(out.note)).not.toContain('用户未作答')
    expect(String(out.note)).toContain('render failed')
    expect(String(out.note)).toContain('工具故障')
  })

  it('弹框被中断 → 如实说"被中断"，不栽给用户（FR-4）', async () => {
    deps.userQuestions = () => ({ ask: async () => { throw Object.assign(new Error('aborted by signal'), { code: 'ABORT_ERR' }) } })
    const out = await run(defineAcceptSheetTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }, { batch_size: 2 })
    expect(String(out.note)).toContain('弹框被中断')
    expect(String(out.note)).not.toContain('用户未作答')
  })

})
