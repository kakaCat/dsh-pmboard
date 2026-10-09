/**
 * L2 用例级单测 · 落库失败与降级必须响亮（REQ-261002164800-d8f2 · t7 / serves: FR-6）。
 *
 * 三种形态各锁一条：
 *   ① 落库被门禁拒 → **不推进** + 系统评论（含可执行恢复入口）+ advance.pausedReason + 告警；
 *   ② 落库成功但收尾失败 → **照常推进**并留痕（不制造"卡已落、状态卡在拆分"的半迁移态）；
 *   ③ 卡级无落点 → **不拒批**，但回执与需求评论**各出现一次**警告（不然就是静默降级）。
 *
 * 另锁一条文案纪律：源码里不得再有"指向做不到的动作"的指引（如已废弃的 REQBOARD_PLAN_REFS_MISSING 拒绝分支）。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { askConfirm } from '../../src/application/use-cases/AskConfirm.js'
import { DEFAULT_CONFIRM_OPTIONS } from '../../src/domain/text/labels.js'
import { makeHarness, req } from '../application/harness.js'

const REQ_ID = 'REQ-0000d1'
const WINDOW = 'session-w-001'
const exec = { agent: { id: WINDOW } }

const tempDirs: string[] = []
afterEach(() => { for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

/**
 * FR-1 有落点、FR-2 无人接 —— 用来触发覆盖门禁拒绝；也用来造「无落点卡」。
 *
 * 2026-10-06 收敛：refs 的**唯一取数 = 卡上 requirement_refs**（文档覆盖对照表不再是门禁依据），
 * 故「谁接了哪条」由 `t1Refs` / `refsForT2` 直接写在计划卡上；文档覆盖表仍写（人读汇总）。
 */
function seed(opts: { refsForT2?: boolean; t1Refs?: string[] } = {}) {
  const h = makeHarness()
  const root = mkdtempSync(join(tmpdir(), 'pmboard-loud-'))
  tempDirs.push(root)
  h.docs.workspaceRoot = () => root
  const t1Refs = opts.t1Refs ?? ['FR-1']
  h.seedRequirementSync(req({
    id: REQ_ID, status: 'decomposing', category: 'feature', sourceSessionId: WINDOW,
    artifacts: [{ stage: 'decomposing', kind: 'decomposition', path: 'docs/requirements/' + REQ_ID + '/decomposition.md', registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW } } as never],
    plan: {
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md', summary: '两张卡',
      tasks: [
        { key: 't1', title: '甲卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: [], acceptance: 'npx vitest run 全绿', implementation: '改 src/a.ts', requirement_refs: t1Refs },
        { key: 't2', title: '乙卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: ['t1'], acceptance: 'npx vitest run 全绿', implementation: '改 src/b.ts', ...(opts.refsForT2 === true ? { requirement_refs: ['FR-2'] } : {}) },
      ],
      submittedAt: h.clock.t, submittedBy: { kind: 'agent', sessionId: WINDOW },
    },
  }))
  h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', ['- **FR-1: 甲条**：A', '- **FR-2: 乙条**：B', ''].join('\n'))
  // 覆盖表（人读汇总）：FR-1 → t1（FR-2 没人接 = 覆盖缺口；t2 缺引用 = 无落点卡）
  h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', [
    '| 需求条款 | 条款内容 | 接收任务 |',
    '|---------|---------|---------|',
    '| FR-1 | 甲条 | t1 |',
    opts.refsForT2 ? '| FR-2 | 乙条 | t2 |' : '',
    '',
  ].join('\n'))
  h.questions.answers = [{ selected: [DEFAULT_CONFIRM_OPTIONS[0] as string] }]
  return h
}

const approve = (h: ReturnType<typeof seed>) =>
  askConfirm(h.deps, { requirement_id: REQ_ID, target: 'plan', question: '批准？' }, exec) as Promise<{ confirmed?: boolean; note?: string }>

describe('① 落库被拒 → 不推进、评论有可执行恢复入口、pausedReason 与告警齐备', () => {
  it('FR-2 无人接：状态停在 decomposing，恢复路径指向真能跑的入口', async () => {
    const h = seed()
    await h.seedSettled()
    const alerts: unknown[] = []
    h.deps.alert = { alert: (a: unknown) => { alerts.push(a) } } as never

    const out = await approve(h)
    expect(out.confirmed).toBe(true) // 落章有效（人确实批了）
    const r = (await h.store.get(REQ_ID))!
    expect(r.status).toBe('decomposing')          // 但**不推进**
    expect(r.autoRun).toBeUndefined()
    expect(await h.tasksOf(REQ_ID)).toHaveLength(0)
    expect(String(r.advance?.pausedReason ?? '')).toContain('auto_decompose_failed')
    const failComment = r.comments.find(c => c.body.includes('自动开跑失败'))
    expect(failComment).toBeDefined()
    expect(String(failComment?.body)).toContain('reqboard_decompose')
    expect(String(failComment?.body)).toContain('看板')
    expect(alerts).toHaveLength(1)
  })
})

describe('② 落库成功但收尾失败 → 照常推进并留痕（不留半迁移态）', () => {
  it('推进写入第一次失败：卡仍在、状态仍进 implementing，评论写明收尾报错', async () => {
    const h = seed({ refsForT2: true })
    await h.seedSettled()
    // B12 阶段②a：写路径已迁到新端口（`store.mutate(id, fn)`），且新口**没有 reason 参数**，
    // 故不能按 `kind === 'requirement-moved'` 过滤。改为**按效果注入**：把回调在克隆上试跑，
    // 谁改了 status 谁就是那次"推进写入"，让它的第一次失败。
    type Draft = { status?: string } & Record<string, unknown>
    type MutateFn = (draft: Draft) => unknown
    // harness 一定装配了新端口；`deps.store` 在类型上可选，故此处显式取一个非空局部。
    const store = h.deps.store
    if (store === undefined) throw new Error('夹具未装配 deps.store')
    const realMutate = store.mutate.bind(store)
    let moved = 0
    ;(store as unknown as { mutate: unknown }).mutate = async (id: string, fn: MutateFn) => {
      const before = await store.get(id)
      if (before !== undefined) {
        const probe = structuredClone(before) as unknown as Draft
        fn(probe)
        if (probe.status !== (before as unknown as Draft).status) {
          moved += 1
          if (moved === 1) throw new Error('注入：推进写入失败')
        }
      }
      return (realMutate as unknown as (i: string, f: MutateFn) => Promise<unknown>)(id, fn)
    }

    const out = await approve(h)
    expect(out.confirmed).toBe(true)
    const r = (await h.store.get(REQ_ID))!
    const tasks = await h.tasksOf(REQ_ID)
    // 无后台任务端口时同步兼容路径会把父卡展开成子卡，故按"父卡都在"断言（至少两张）
    expect(tasks.length).toBeGreaterThanOrEqual(2)
    for (const title of ['甲卡', '乙卡']) expect(tasks.some(t => t.title === title)).toBe(true)
    expect(r.status).toBe('implementing')             // 仍推进（收尾报错不制造半迁移态）
    expect(r.comments.some(c => c.body.includes('收尾步骤报错'))).toBe(true)
  })
})

describe('③ 卡级无落点 → 不拒批，但回执与需求评论各点名一次', () => {
  it('warning 在回执里出现一次，且需求评论里也有一条', async () => {
    // 让 t2 成为「无落点卡」：FR-1、FR-2 都由 **t1 的 requirement_refs** 接（覆盖门禁放行），
    // t2 不接任何条款 → 这就是"无落点卡"。文档覆盖表已不是门禁依据，改它不再能造出这个形态。
    const h = seed({ t1Refs: ['FR-1', 'FR-2'] })
    await h.seedSettled()

    const out = await approve(h)
    expect(String(out.note)).toContain('没有需求条款落点')
    const r = (await h.store.get(REQ_ID))!
    const warnComments = r.comments.filter(c => c.body.includes('没有需求条款落点'))
    expect(warnComments).toHaveLength(1)               // 评论里也有一条（不是只藏在返回体）
    // 落库照常（同步兼容路径会展开子卡，故按"父卡都在"断言）
    const landed = await h.tasksOf(REQ_ID)
    expect(landed.length).toBeGreaterThanOrEqual(2)
    expect(landed.some(t => t.title === '甲卡')).toBe(true)
  })
})

describe('④ 文案纪律：不得再指向做不到的动作', () => {
  it('src 内已无 REQBOARD_PLAN_REFS_MISSING 拒绝分支', async () => {
    const { execSync } = await import('node:child_process')
    const hits = execSync('grep -rn "REQBOARD_PLAN_REFS_MISSING" src || true', { cwd: process.cwd() }).toString().trim()
    expect(hits).toBe('')
    // 恢复指引只允许指向真能跑的入口（reqboard_decompose / 看板拆分 / reqboard_task_amend）
    const wiring = execSync('grep -rn "恢复路径\|恢复入口" src/application/internal/content-gate-wiring.ts || true', { cwd: process.cwd() }).toString()
    if (wiring.trim().length > 0) expect(wiring).toContain('reqboard_')
  })
})
