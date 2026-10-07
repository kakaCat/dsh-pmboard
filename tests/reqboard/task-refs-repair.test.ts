/**
 * L2 用例级单测 · 已落库卡的条款引用补写入口（REQ-261002164800-d8f2 · t5 / serves: FR-4）。
 *
 * 修前形态：卡一旦落库，`requirementRefs` **没有任何写入口**——重交计划撞「已落库」幂等、
 * 重跑拆分撞幂等守卫、看板改卡路由不收这个字段。实测代价：531 张空引用卡补不回来。
 *
 * 本文件锁四条口径：全量替换、值同不写盘、跨需求拒绝、写完同步 RTM + 留痕。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { landApprovedPlan } from '../../src/application/internal/approved-plan-landing.js'
import { executeTaskRefs } from '../../src/application/use-cases/AmendTaskRefs.js'
import { makeHarness, req } from '../application/harness.js'

const REQ_ID = 'REQ-0000b1'
const OTHER_REQ = 'REQ-0000b2'
const WINDOW = 'session-w-001'

const REQUIREMENT_MD = ['# 需求', '', '- **FR-1: 甲条**：第一件事', ''].join('\n')
/**
 * 覆盖表只把 FR-1 给 t1（人读汇总）。
 *
 * 2026-10-06 收敛后它**不再是覆盖门禁的依据**——「t1 有引用、t2 空」这个形态由**卡上**
 * requirement_refs 造（见下面 plan.tasks），正好用来演示"补写"。
 */
const DECOMPOSITION_MD = [
  '| 需求条款 | 条款内容 | 接收任务 |',
  '|---------|---------|---------|',
  '| FR-1 | 甲条 | t1 |',
  '',
].join('\n')

const tempDirs: string[] = []
afterEach(() => { for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

function seed() {
  const h = makeHarness()
  const root = mkdtempSync(join(tmpdir(), 'pmboard-refs-'))
  tempDirs.push(root)
  h.docs.workspaceRoot = () => root
  h.seedRequirementSync(
    req({
      id: REQ_ID, status: 'decomposing', category: 'feature', sourceSessionId: WINDOW,
      artifacts: [{ stage: 'decomposing', kind: 'decomposition', path: 'docs/requirements/' + REQ_ID + '/decomposition.md', registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW } } as never],
      plan: {
        path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
        summary: '两张卡', tasks: [
          // t1 在**卡上**声明 FR-1（门禁唯一依据）；t2 故意为空 = 待补写的空引用卡
          { key: 't1', title: '甲卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: [], acceptance: 'npx vitest run 全绿', implementation: '改 src/a.ts', requirement_refs: ['FR-1'] },
          { key: 't2', title: '乙卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: ['t1'], acceptance: 'npx vitest run 全绿', implementation: '改 src/b.ts' },
        ],
        submittedAt: h.clock.t, submittedBy: { kind: 'agent', sessionId: WINDOW },
      },
    }))
    // 别人的需求：用来验证"跨需求卡被拒"
  h.seedRequirementSync(req({ id: OTHER_REQ, status: 'implementing', category: 'feature', sourceSessionId: 'session-other' }))
  h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', REQUIREMENT_MD)
  h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', DECOMPOSITION_MD)
  return { h, root }
}

async function landAndPick(h: ReturnType<typeof seed>['h']) {
  await landApprovedPlan(h.deps, { requirementId: REQ_ID, windowKey: WINDOW, nowTs: h.clock.t, source: 'confirm' })
  const tasks = await h.tasksOf(REQ_ID)
  const t1 = tasks.find(t => t.title === '甲卡')!
  const t2 = tasks.find(t => t.title === '乙卡')!
  return { t1, t2 }
}

const exec = { agent: { id: WINDOW } }

describe('补写入口 · 全量替换与幂等（FR-4）', () => {
  it('空引用卡补上条款：卡上值变更 + RTM serves 同步 + 需求评论留痕', async () => {
    const { h, root } = seed()
    await h.seedSettled()
    const { t2 } = await landAndPick(h)
    expect(t2.requirementRefs ?? []).toEqual([]) // 落库时卡上就没写引用（待补写）

    const out = await executeTaskRefs(h.deps, { task_id: t2.id, requirement_refs: ['FR-1'], reason: '覆盖表漏写，补上' }, exec) as Record<string, unknown>
    expect(out['changed']).toBe(true)
    expect(out['rtm_synced']).toBe(true)

    const after = (await h.tasksOf(REQ_ID)).find(t => t.id === t2.id)!
    expect(after.requirementRefs).toEqual(['FR-1'])

    // RTM：serves 跟着卡上的 refs 走（写在临时根下，不污染仓库）
    const yml = join(root, 'docs/requirements/' + REQ_ID + '/rtm-implementing/' + t2.id + '.yml')
    expect(existsSync(yml)).toBe(true)
    expect(readFileSync(yml, 'utf8')).toContain('FR-1')

    const r = (await h.store.get(REQ_ID))!
    expect(r.comments.some(c => c.body.includes('条款引用补写'))).toBe(true)
  })

  it('值相同 → changed=false 且不写盘（队列写入序号不变）', async () => {
    const { h } = seed()
    await h.seedSettled()
    const { t1 } = await landAndPick(h)
    expect(t1.requirementRefs).toEqual(['FR-1'])
    const seqBefore = h.queueRepo.writeSeqOf(REQ_ID)

    const out = await executeTaskRefs(h.deps, { task_id: t1.id, requirement_refs: ['FR-1'], reason: '重复调用' }, exec) as Record<string, unknown>
    expect(out['changed']).toBe(false)
    expect(h.queueRepo.writeSeqOf(REQ_ID)).toBe(seqBefore)
  })

  it('空数组 = 清空（不是"忽略"）', async () => {
    const { h } = seed()
    await h.seedSettled()
    const { t1 } = await landAndPick(h)
    const out = await executeTaskRefs(h.deps, { task_id: t1.id, requirement_refs: [], reason: '这条本来就不该有' }, exec) as Record<string, unknown>
    expect(out['changed']).toBe(true)
    expect((await h.tasksOf(REQ_ID)).find(t => t.id === t1.id)!.requirementRefs).toEqual([])
  })
})

describe('补写入口 · 拒绝即响亮（FR-4 / FR-6）', () => {
  it('跨需求卡被拒（REQBOARD_TASK_NOT_BOUND）', async () => {
    const { h } = seed()
    await h.seedSettled()
    // 别人的需求上有一张卡（直接借 plan-landing 的落库路径不方便，这里用队列写路径造一张）
    await h.addTasks(OTHER_REQ, [{
      id: 't-other1', requirementId: OTHER_REQ, title: '别人的卡', description: '', phase: 'implement', side: 'backend',
      dependsOn: [], scope: { apis: [], tables: [], files: [] }, acceptance: 'npx vitest run 全绿', implementation: '', context: '',
      status: 'todo', blocked: false, executions: [], statusHistory: [], comments: [], version: 1,
      createdAt: h.clock.t, updatedAt: h.clock.t,
      createdBy: { kind: 'agent', sessionId: 'session-other' }, updatedBy: { kind: 'agent', sessionId: 'session-other' },
    } as never])

    await expect(executeTaskRefs(h.deps, { task_id: 't-other1', requirement_refs: ['FR-1'], reason: '越权试试' }, exec))
      .rejects.toThrow(/REQBOARD_TASK_NOT_BOUND/)
  })

  it('非法编号被拒且点名，非法值不落盘', async () => {
    const { h } = seed()
    await h.seedSettled()
    const { t1 } = await landAndPick(h)
    await expect(executeTaskRefs(h.deps, { task_id: t1.id, requirement_refs: ['FR-99x'], reason: '写错' }, exec))
      .rejects.toThrow(/REQBOARD_BAD_REQUIREMENT_REF/)
    expect((await h.tasksOf(REQ_ID)).find(t => t.id === t1.id)!.requirementRefs).toEqual(['FR-1'])
  })

  it('reason 为空被拒（改动必须留痕）', async () => {
    const { h } = seed()
    await h.seedSettled()
    const { t1 } = await landAndPick(h)
    await expect(executeTaskRefs(h.deps, { task_id: t1.id, requirement_refs: ['FR-1'], reason: '' }, exec))
      .rejects.toThrow(/reason 不能为空/)
  })
})
