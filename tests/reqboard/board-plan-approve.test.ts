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
import { makeHarness, req } from '../application/harness.js'

const REQ_ID = 'REQ-0000e1'
const WINDOW = 'session-w-001'

const REQUIREMENT_MD = ['# 需求', '', '- **FR-1: 甲条**：第一件事', ''].join('\n')
/** 覆盖对照表：FR-1 由 t1、t2 接收（两条都被覆盖 → 不应有 unrefed）。 */
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
async function seed(withAppDeps = true) {
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
    artifacts: [{
      stage: 'decomposing', kind: 'decomposition',
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      registeredAt: 1, registeredBy: { kind: 'agent', sessionId: WINDOW },
    } as never],
    plan: {
      path: 'docs/requirements/' + REQ_ID + '/decomposition.md',
      summary: '把活拆成 2 张卡',
      tasks: [
        { key: 't1', title: '甲卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: [], acceptance: 'npx vitest run 全绿', implementation: '改 src/domain/x.ts' },
        { key: 't2', title: '乙卡', phase: 'implement' as const, side: 'backend' as const, dependsOn: ['t1'], acceptance: 'npx vitest run 全绿', implementation: '改 src/index.ts' },
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

  it('卡上的引用来自覆盖对照表（与弹框路径同一取数）', async () => {
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
