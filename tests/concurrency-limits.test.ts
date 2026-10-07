/**
 * 并发上限与冲突两级防线测试（REQ-4842fe t9）——对应 design/test-cases.md §6。
 *
 * 口径：同需求 in_progress 父卡 ≤ LIMITS.advanceMaxParallelParents；互无依赖父卡并行且 rollup 正常；子卡依赖不跨父卡；
 * 拆分期改动面重叠即拒；运行期 mtime 跨卡覆盖判失败。
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { executeMoveTask } from '../src/application/use-cases/MoveTask.js'
import { advanceRequirement } from '../src/application/use-cases/AdvanceChain.js'
import { executeSubtask } from '../src/application/use-cases/ExecuteTask.js'
import { findWorkSurfaceConflicts, declaredFiles } from '../src/application/internal/conflict-check.js'
import { executeDecompose } from '../src/application/use-cases/Decompose.js'
import { detectCrossCardOverwrite } from '../src/application/internal/cross-card.js'
import { checkSubtaskInvariants } from '../src/shared/protocol.js'
import { LIMITS } from '../src/domain/limits.js'
import type { WorkflowRunner, WorkflowRunOutcome } from '../src/application/ports.js'
import { makeHarness, task, req } from './application/harness.js'

const FILE = 'src/domain/x.ts'
const exec = { agent: { id: 'session-w-001' } }

class OkRunner implements WorkflowRunner {
  async start(_i: unknown): Promise<WorkflowRunOutcome> {
    return { ok: true, value: { ok: true, output: JSON.stringify({ filesChanged: [FILE], completed: ['done'] }) } }
  }
}

describe('父卡并发上限（6.1）', () => {
  it('第 N+1 张父卡开工被拒（REQBOARD_PARENT_LIMIT）', async () => {
    // 口径跟随常量：上限改数值时本用例自动跟随，避免"测试把上限钉死"（2026-09-28）。
    const N = LIMITS.advanceMaxParallelParents
    const h = makeHarness()
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
    await h.seedSettled()
    await h.setTasks('REQ-000001', [
      ...Array.from({ length: N }, (_, i) => task({ id: 't-p' + (i + 1), requirementId: 'REQ-000001', status: 'in_progress', title: 'p' + (i + 1) })),
      task({ id: 't-pX', requirementId: 'REQ-000001', status: 'todo', title: 'px' }),
    ])
    let code: string | undefined
    try { await executeMoveTask(h.deps, { task_id: 't-pX', to: 'in_progress' }, exec) } catch (err) { code = (err as { code?: string }).code }
    expect(code).toBe('REQBOARD_PARENT_LIMIT')
    expect((await h.tasksOf('REQ-000001')).find(t => t.id === 't-pX')!.status).toBe('todo')
    expect(LIMITS.advanceMaxParallelParents).toBe(10)
  })
})

describe('父卡层并行（6.2）', () => {
  it('两张互不依赖父卡的子卡链同时推进，都完成后 rollup 进 accepting', async () => {
    const h = makeHarness()
    h.docs.put(FILE, 'x')
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'doc', autoRun: true }))
    await h.seedSettled()
    // **时序保真**（B12 阶段②e）：文档在 t=0 写入，链随后开工。零时钟下"文件 mtime"与
    // "子卡执行窗口"同为 0 ⇒ 跨卡覆盖守卫（cross-card.ts:45）会把产出误判成"落在别人窗口内"。
    // 本用例要验的是**并行父卡都收尾 → rollup**，不是跨卡检测（6.5 专测）⇒ 把时间线拉开区分度。
    h.clock.t = 100
    await h.setTasks('REQ-000001', [
      task({ id: 't-a', requirementId: 'REQ-000001', status: 'todo', title: 'A' }),
      task({ id: 't-b', requirementId: 'REQ-000001', status: 'todo', title: 'B' }),
    ])
    h.deps.workflow = new OkRunner()
    const out = await advanceRequirement(h.deps, 'REQ-000001')
    expect(out.stopped).toBe('rollup')
    const doneTasks = await h.tasksOf('REQ-000001')
    expect(doneTasks.filter(t => t.parentId === undefined)).toHaveLength(2)
    expect(doneTasks.find(t => t.id === 't-a')!.status).toBe('done')
    expect(doneTasks.find(t => t.id === 't-b')!.status).toBe('done')
    expect((await h.store.get((await h.store.listSummaries({ scope: 'all' })).items[0]!.id))!.status).toBe('accepting')
  })
})

describe('子卡依赖不跨父卡（6.3 / INV-4）', () => {
  it('子卡依赖另一父卡的子卡 → INV-4', () => {
    const parentA = task({ id: 't-a', requirementId: 'REQ-000001', title: 'A' })
    const parentB = task({ id: 't-b', requirementId: 'REQ-000001', title: 'B' })
    const sa = task({ id: 't-a1', requirementId: 'REQ-000001', parentId: 't-a', stageKind: 'dev' as never })
    const sb = task({ id: 't-b1', requirementId: 'REQ-000001', parentId: 't-b', stageKind: 'dev' as never, dependsOn: ['t-a1'] })
    const v = checkSubtaskInvariants([parentA, parentB, sa, sb], 'REQ-000001')
    expect(v.map(x => x.inv)).toContain('INV-4')
  })
})

describe('拆分期冲突拦截（6.4）', () => {
  it('抽取 implementation 声明的文件路径', () => {
    expect(declaredFiles('改 packages/pages/dsh-pmboard/src/a.ts 与 src/domain/x.ts')).toContain('packages/pages/dsh-pmboard/src/a.ts')
    expect(declaredFiles('无路径')).toEqual([])
  })

  it('互无依赖且改动面重叠 → 冲突；有依赖（串行）→ 不冲突', () => {
    const a = { key: 't1', implementation: '改 packages/x/src/a.ts', dependsOn: [] }
    const b = { key: 't2', implementation: '改 packages/x/src/a.ts', dependsOn: [] }
    expect(findWorkSurfaceConflicts([a, b])).toEqual([{ file: 'packages/x/src/a.ts', keys: ['t1', 't2'] }])
    const bDep = { key: 't2', implementation: '改 packages/x/src/a.ts', dependsOn: ['t1'] }
    expect(findWorkSurfaceConflicts([a, bDep])).toEqual([])
    const c = { key: 't3', implementation: '改 packages/x/src/c.ts', dependsOn: [] }
    expect(findWorkSurfaceConflicts([a, c])).toEqual([])
  })

  // REQ-261007095750-9f48 FR-2：口径扩根前，`src/**` 落点一条都抽不到 ⇒ 这两条用例恒为空/恒绿。
  // 用例写在这里的意义就是**可证伪**：把 PATH_RE 的 `src` 根去掉，它必须红。
  it('src 落点也在冲突门视线内：互无依赖 + 同一 src 文件 → 冲突；同链串行 → 不冲突', () => {
    const a = { key: 't1', implementation: '改 src/application/internal/conflict-check.ts', dependsOn: [] }
    const b = { key: 't2', implementation: '改 src/application/internal/conflict-check.ts', dependsOn: [] }
    expect(findWorkSurfaceConflicts([a, b])).toEqual([
      { file: 'src/application/internal/conflict-check.ts', keys: ['t1', 't2'] },
    ])
    const bDep = { key: 't2', implementation: '改 src/application/internal/conflict-check.ts', dependsOn: ['t1'] }
    expect(findWorkSurfaceConflicts([a, bDep])).toEqual([])
    // .mts 与深层目录同样认（扩展名表扩根的旁证）
    const c = { key: 't3', implementation: '改 src/tools/local.mts', dependsOn: [] }
    const d = { key: 't4', implementation: '改 src/tools/local.mts', dependsOn: [] }
    expect(findWorkSurfaceConflicts([c, d])).toEqual([{ file: 'src/tools/local.mts', keys: ['t3', 't4'] }])
  })

  it('端到端：两卡声明同一 src 文件且互无依赖 → 拆分被拒 REQBOARD_FILE_CONFLICT（零副作用）', async () => {
    const h = makeHarness()
    const impl = '改 src/application/internal/conflict-check.ts'
    h.seedRequirementSync(req({
      id: 'REQ-000001', status: 'decomposing', category: 'feature', sourceSessionId: 'session-w-c',
      artifacts: [{
        stage: 'design', kind: 'plan', path: 'docs/requirements/REQ-000001/plan.md',
        registeredAt: 1, registeredBy: { kind: 'agent', sessionId: 'session-w-c' },
      }],
      plan: {
        path: 'docs/requirements/REQ-000001/plan.md', summary: '计划', submittedAt: 1,
        submittedBy: { kind: 'agent', sessionId: 'session-w-c' },
        tasks: [
          { key: 't1', title: '改冲突门', phase: 'implement', side: 'backend', dependsOn: [], acceptance: 'npx vitest run tests/a.test.ts 通过', implementation: impl },
          { key: 't2', title: '也改冲突门', phase: 'implement', side: 'backend', dependsOn: [], acceptance: 'npx vitest run tests/b.test.ts 通过', implementation: impl },
        ],
        approvedAt: 2, approvedBy: { kind: 'human' },
      },
    }))
    h.docs.put('docs/requirements/REQ-000001/requirement.md', [
      '# 需求', '', '## 边界', '', '## 成功标准', '', '## 产品定义', '', '## 用户与角色', '', '## 功能点', '',
      '**FR-1 口径扩根**：抽取器要看得见 src。',
    ].join('\n'))
    await h.seedSettled()
    let code: string | undefined
    try {
      await executeDecompose(h.deps, {
        tasks: [
          { key: 't1', title: '改冲突门', acceptance: 'npx vitest run tests/a.test.ts 通过', implementation: impl, requirement_refs: ['FR-1'] },
          { key: 't2', title: '也改冲突门', acceptance: 'npx vitest run tests/b.test.ts 通过', implementation: impl, requirement_refs: ['FR-1'] },
        ],
      }, { agent: { id: 'session-w-c' } })
    } catch (err) { code = (err as { code?: string }).code }
    expect(code).toBe('REQBOARD_FILE_CONFLICT')
    expect(await h.tasksOf('REQ-000001')).toHaveLength(0)
  })
})

describe('运行期跨卡覆盖兜底（6.5）', () => {
  it('detectCrossCardOverwrite：mtime 落在另一在跑父卡窗口内 → 报冲突', () => {
    const tasks = [
      { id: 't-a', status: 'in_progress' },
      { id: 't-a1', parentId: 't-a', status: 'in_progress', executions: [{ startedAt: 100, outcome: 'running' }] },
      { id: 't-b', status: 'in_progress' },
    ]
    const hit = detectCrossCardOverwrite(tasks, 't-b', ['src/domain/x.ts'], () => 150, 200)
    expect(hit?.otherParentId).toBe('t-a')
    expect(detectCrossCardOverwrite(tasks, 't-b', ['src/domain/x.ts'], () => 50, 200)).toBeUndefined()
  })

  it('子卡产出文件落在另一在跑父卡窗口 → 子卡判失败（REQBOARD_CROSS_CARD）', async () => {
    const h = makeHarness()
    h.docs.put(FILE, 'x')
    h.seedRequirementSync(req({ id: 'REQ-000001', status: 'implementing', category: 'feature', autoRun: true }))
    await h.seedSettled()
    await h.setTasks('REQ-000001', [
      task({ id: 't-a', requirementId: 'REQ-000001', status: 'in_progress', title: 'A', claimedAt: h.clock.t }),
      task({ id: 't-a1', requirementId: 'REQ-000001', status: 'in_progress', parentId: 't-a', stageKind: 'dev' as never, executions: [{ id: 'e1', trigger: 'auto', startedAt: h.clock.t, outcome: 'running' }] } as never),
      task({ id: 't-b', requirementId: 'REQ-000001', status: 'in_progress', title: 'B', claimedAt: h.clock.t }),
      task({ id: 't-b1', requirementId: 'REQ-000001', status: 'todo', parentId: 't-b', stageKind: 'dev' as never }),
    ])
    h.deps.workflow = new OkRunner()
    const r = await executeSubtask(h.deps, { subtaskId: 't-b1', windowKey: 'session-w-001' })
    expect(r.ok).toBe(false)
    expect(r.code).toBe('REQBOARD_CROSS_CARD')
  })
})

// ---------------------------------------------------------------------------
// TC-8 超时契约（REQ-260923222557-d3b0 FR-5）
// ---------------------------------------------------------------------------

function walkTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walkTs(p, acc)
    else if (e.name.endsWith('.ts')) acc.push(p)
  }
  return acc
}

describe('TC-8 超时契约：人机回路不再 10 分钟超时（FR-5）', () => {
  it('交互确认与验收单超时均为 1 小时，且全 src 无旧 600s/900s 硬编码残留', () => {
    expect(LIMITS.timeoutInteractiveMs).toBe(3_600_000)
    expect(LIMITS.timeoutSheetMs).toBe(3_600_000)
    const files = walkTs(fileURLToPath(new URL('../src', import.meta.url)))
    // 扫描器自检：目录失效/被裁剪时不能静默假绿
    expect(files.length).toBeGreaterThan(50)
    // \b 保证 3_600_000 不算残留（下划线是词字符，_600_000 前无词边界）
    const offenders = files.filter(f => /\b(600_000|900_000)\b/.test(readFileSync(f, 'utf8')))
    expect(offenders).toEqual([])
  })
})
