/**
 * L2 路由级单测 · 看板「批准计划」也落库并推进（REQ-261002164800-d8f2 · t4 / serves: FR-1, FR-6）。
 *
 * 修前形态：看板这条通道只盖 `approvedAt`（响应注释还写着「窗口可拆分落库」），
 * 而同一个 `POST /req/plan/approve` 的弹框孪生路径（reqboard_ask_confirm）**同一次调用内就落库并进实施**。
 * 两条通道行为不一致，文案却声称等价——本文件把「两条通道落出同样结果」钉住。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createReqboardHandler } from '../../src/http/routes.js'
import { makeHarness, req, task } from '../application/harness.js'

const REQ_ID = 'REQ-0000e1'
const WINDOW = 'session-w-001'

const REQUIREMENT_MD = ['# 需求', '', '- **FR-1: 甲条**：第一件事', ''].join('\n')
/**
 * 覆盖对照表：FR-1 由 t1、t2 接收。
 *
 * 2026-10-06 收敛后它**不再是覆盖门禁的依据**（门禁只认卡上 requirement_refs），保留它是为了
 * 钉住「人读的汇总仍在」——真正的落库引用见下面 plan.tasks 里的 requirement_refs。
 */
const DECOMPOSITION_MD = [
  '| 需求条款 | 条款内容 | 接收任务 |',
  '|---------|---------|---------|',
  '| FR-1 | 甲条 | t1、t2 |',
  '',
].join('\n')

function fakeReq(body: unknown, url: string): never {
  const r = new EventEmitter() as never as { url: string; method: string; [Symbol.asyncIterator]: unknown }
  r.url = url
  r.method = 'POST'
  ;(r as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return r as never
}

function fakeRes(): { statusCode: number; payload?: { success: boolean; data?: Record<string, unknown>; error?: string; code?: string } } {
  const res = new EventEmitter() as unknown as Record<string, unknown>
  res['statusCode'] = 0
  res['writeHead'] = (code: number) => { res['statusCode'] = code; return res }
  res['end'] = (text?: string) => { res['payload'] = text === undefined ? undefined : JSON.parse(text); return res }
  return res as never
}

/**
 * RTM 同步会按 `docs.workspaceRoot()` 落盘——把它指向临时目录，
 * 否则夹具需求会在**真实仓库**里写出 `docs/requirements/REQ-test-…/rtm-*.yml`（实测踩过）。
 */
const tempDirs: string[] = []
afterEach(() => { for (const d of tempDirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

/** 造一个「计划已提交待批准」的需求 + 真路由（applicationDeps 决定看板通道能不能落库）。 */
async function seed(withAppDeps = true, rollback?: Record<string, unknown>) {
  const h = makeHarness()
  const root = mkdtempSync(join(tmpdir(), 'pmboard-board-'))
  tempDirs.push(root)
  h.docs.workspaceRoot = () => root
  // B12 阶段⑤族 B：播种进新端口（两源同写，等排空后再走路由）
  const seedReq = req({
    id: REQ_ID,
    status: 'decomposing',
    category: 'feature',
    sourceSessionId: WINDOW,
    ...(rollback === undefined ? {} : { rollback: rollback as never }),
    artifacts: [{
      stage: 'decomposing', kind: 'decomposition',
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW },
    } as never],
    plan: {
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      summary: '把活拆成 2 张卡',
      tasks: [
        // requirement_refs 写在卡上（2026-10-06 收敛：覆盖门禁的唯一依据是卡上 refs，
        // 计划文档的覆盖对照表只作人读汇总——「门禁绿、卡上全空」的静默缺口正是它堵的）
        { key: 't1', title: '甲卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: [], acceptance: 'npx vitest run 全绿', implementation: '改 src/domain/x.ts', requirement_refs: ['FR-1'] },
        { key: 't2', title: '乙卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: ['t1'], acceptance: 'npx vitest run 全绿', implementation: '改 src/index.ts', requirement_refs: ['FR-1'] },
      ],
      submittedAt: h.clock.t,
      submittedBy: { kind: 'agent', sessionId: WINDOW },
    },
  })
  h.seedRequirementSync(seedReq)
  await h.seedSettled()
  h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', REQUIREMENT_MD)
  h.docs.put('docs/requirements/' + REQ_ID + '/decomposition.md', DECOMPOSITION_MD)
  const handler = createReqboardHandler({ requirementStore: h.store,

    taskStore: h.taskStore,
    now: () => h.clock.t,
    docs: h.docs as never,
    ...(withAppDeps ? { applicationDeps: h.deps } : {}),
  })
  const post = async (url: string, body: unknown) => {
    const res = fakeRes()
    await handler(fakeReq(body, '/dashboard/api/reqboard' + url), res as never)
    return res
  }
  return { h, post }
}

describe('看板「批准计划」· 批准即落库并推进（FR-1）', () => {
  it('批准后任务数 = 计划卡数，需求进 implementing', async () => {
    const { h, post } = await seed()
    const res = await post('/req/plan/approve', { id: REQ_ID })
    expect(res.statusCode).toBe(200)
    const data = res.payload?.data as Record<string, unknown>
    expect(data['status']).toBe('implementing') // 修前：状态原地不动
    expect(await h.tasksOf(REQ_ID)).toHaveLength(2) // 修前：0 张卡
    const landing = data['landing'] as Record<string, unknown>
    expect(landing['performed']).toBe(true)
    expect(landing['landed']).toBe(2)
    expect(landing['unrefed_cards']).toEqual([])
  })

  it('卡上的引用落到卡上（唯一取数 = 卡上 requirement_refs；文档覆盖表只作人读汇总）', async () => {
    const { h, post } = await seed()
    await post('/req/plan/approve', { id: REQ_ID })
    for (const t of await h.tasksOf(REQ_ID)) expect(t.requirementRefs).toEqual(['FR-1'])
  })

  it('幂等：重复批准不新增卡，如实报 already_landed', async () => {
    const { h, post } = await seed()
    await post('/req/plan/approve', { id: REQ_ID })
    const again = await post('/req/plan/approve', { id: REQ_ID })
    expect(await h.tasksOf(REQ_ID)).toHaveLength(2)
    const landing = (again.payload?.data as Record<string, unknown>)['landing'] as Record<string, unknown>
    expect(landing['landed']).toBe(0)
    expect(landing['already_landed']).toBe(2)
  })
})

describe('看板「批准计划」· 装配缺失与门禁拒绝都如实回话（FR-6）', () => {
  it('未装配 applicationDeps → 只落章 + 明说没落库（保护既有嵌入调用）', async () => {
    const { h, post } = await seed(false)
    const res = await post('/req/plan/approve', { id: REQ_ID })
    const data = res.payload?.data as Record<string, unknown>
    const landing = data['landing'] as Record<string, unknown>
    expect(landing['performed']).toBe(false)
    expect(String(landing['reason'])).toContain('applicationDeps')
    expect(await h.tasksOf(REQ_ID)).toHaveLength(0)
    expect(data['status']).toBe('decomposing')
  })

  it('FR 无人接（覆盖缺口）→ 计划已批准但不推进，结果带失败原因与错误码', async () => {
    const { h, post } = await seed()
    // 覆盖表只写 FR-1 → 需求里的 FR-2 没人接（硬门仍在）
    h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', ['- **FR-1: 甲条**：A', '- **FR-2: 乙条**：B', ''].join('\n'))
    const res = await post('/req/plan/approve', { id: REQ_ID })
    const data = res.payload?.data as Record<string, unknown>
    const landing = data['landing'] as Record<string, unknown>
    expect(landing['failed']).toBe(true)
    expect(String(landing['reason'])).toContain('FR-2')
    expect(await h.tasksOf(REQ_ID)).toHaveLength(0)
    expect(data['status']).toBe('decomposing')
  })
})

/**
 * REQ-261005122915-9f90 t4 / FR-3：看板批准路径的推进判据。
 *
 * 现场形态（REQ-261005105032-3b02）：队列里只剩回退物化的**占位重做卡**。
 * 修前 `landing.performed` 用「alreadyLanded === 0」算，而占位卡会把 alreadyLanded 撑大；
 * 更糟的是无论落没落库都照样推进到 implementing —— 需求因此带着「0 张新卡」进实施。
 */
describe('看板「批准计划」· 落库没真发生就不推进（REQ-261005122915-9f90 t4 / FR-3）', () => {
  /** 把队列换成「只剩上一轮回退的占位卡」。 */
  async function seedPlaceholders(h: Awaited<ReturnType<typeof seed>>['h'], n: number) {
    const list = Array.from({ length: n }, (_, i) => task({
      id: 't-ph' + (i + 1), requirementId: REQ_ID, title: '[重做] 占位' + (i + 1),
      status: 'todo', reworkOf: 't-old' + (i + 1),
    }))
    await h.setTasks(REQ_ID, list)
    return list
  }

  it('只剩占位卡：先收占位卡再真的落库，然后才推进', async () => {
    // 回退态（`rollback.to === 当前阶段`）是「回退后重新批准」的判据，缺它就不是本场景。
    const { h, post } = await seed(true, {
      from: 'implementing', to: 'decomposing', at: 1, by: { kind: 'human' },
      reason: '回退重修', seq: 1, lastMaterialized: ['t-ph1', 't-ph2', 't-ph3'],
    })
    await seedPlaceholders(h, 3)

    const res = await post('/req/plan/approve', { id: REQ_ID })
    const data = res.payload?.data as Record<string, unknown>
    const landing = data['landing'] as Record<string, unknown>

    expect(landing['performed']).toBe(true)
    expect(landing['landed'], '修复前这里是 0（占位卡冒充已落库）').toBe(2)
    expect(landing['stale_rework_canceled']).toBe(3)
    expect(data['status']).toBe('implementing')
    const tasks = await h.tasksOf(REQ_ID)
    expect(tasks).toHaveLength(5)
    for (const p of tasks.filter(t => (t.reworkOf ?? '') !== '')) expect(p.status).toBe('canceled')
  })

  it('只剩占位卡 + 覆盖缺口：落库真没发生 → 不推进、不落卡、占位卡不被误收', async () => {
    const { h, post } = await seed()
    await seedPlaceholders(h, 3)
    h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', ['- **FR-1: 甲条**：A', '- **FR-2: 乙条**：B', ''].join('\n'))

    const res = await post('/req/plan/approve', { id: REQ_ID })
    const data = res.payload?.data as Record<string, unknown>
    const landing = data['landing'] as Record<string, unknown>

    expect(landing['performed']).toBe(false)
    expect(landing['failed']).toBe(true)
    expect(data['status'], '落库没发生就绝不能推进').toBe('decomposing')
    const tasks = await h.tasksOf(REQ_ID)
    expect(tasks, '队列未被改动（占位卡仍是 todo）').toHaveLength(3)
    expect(tasks.every(t => t.status === 'todo')).toBe(true)
  })

  it('空计划（本次新落 0 张）→ 拒绝推进，并把原因如实回给看板', async () => {
    const { h, post } = await seed()
    // 本用例锁的是**落库判据**（本次新落 0 张 ≠ 成功），不是覆盖维——故把需求文档换成无编号条款，
    // 让覆盖门禁按其放行条件（文档里没有编号条款 → 不拦）让路，否则报的会是覆盖缺口而不是本条判据。
    h.docs.put('docs/requirements/' + REQ_ID + '/requirement.md', ['# 需求', '', '（本需求无编号条款）', ''].join('\n'))
    const before = h.store.peek(REQ_ID)!.plan!
    await h.setRequirementFields(REQ_ID, { plan: { ...before, tasks: [] } })

    const res = await post('/req/plan/approve', { id: REQ_ID })
    const data = res.payload?.data as Record<string, unknown>
    const landing = data['landing'] as Record<string, unknown>

    expect(landing['landed']).toBe(0)
    expect(landing['already_landed']).toBe(0)
    expect(landing['performed'], '一张都没落 → performed 必须是 false').toBe(false)
    expect(String(landing['reason'])).toContain('未落任何任务卡')
    expect(data['status'], '「本次新落 0 张」不得被说成成功并推进').toBe('decomposing')
    expect(await h.tasksOf(REQ_ID)).toHaveLength(0)
  })
})
