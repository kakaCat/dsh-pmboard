/**
 * 三窗口端到端（REQ-261005141830-7a3b t5 · serves: FR-4, FR-6, FR-8, FR-9, FR-10）。
 *
 * 场景出处 `design/test-cases.md` E-01 / E-02；本文件**只承载这两条**——
 * E-03（同项目两窗口不重复起轮）/ E-04（跨项目派席被拒）依赖 t6（Dive 归属与派席校验），
 * 由 t9（t-dab64c）在同一文件上补齐（见 `decomposition.md` t9）。
 *
 * 两条各自钉住的事：
 *   - **E-01**：窗口 x / y 同属 P1、窗口 z 属 P2，两项目各一条需求 → 三方请求各看各的；
 *     并在 P1 下**故意放一个与 P2 需求同名的目录**，证明扫描不拿本项目根去扫别人家。
 *   - **E-02**：x 写入期间 z 触发一次状态读取（把**共享单例根**改走 P2）→ x 的写入仍落 P1，
 *     P2 目录零新增。这条是 FR-5 的判别例；把 `rootOf` 的 `projectId` 分支停用即变红。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'
import { harness as diveLoopHarness, makeReq as makeDiveReq } from './support/dive-loop-harness.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { toProjectEntries } from '../src/adapters/workspaceRegistryRows.js'
import { projectIdOfWindow, rootOfProject } from '../src/application/internal/project-identity.js'
import { applyRequirementWorkspaceRoot, ensureWritableProjectRoot } from '../src/application/internal/support.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const SESSION_X = 'session-x'
const SESSION_Y = 'session-y'
const SESSION_Z = 'session-z'

const P1 = 'w-1'
const P2 = 'w-2'

const REQ_X = 'REQ-261005000001-aaaa'
const REQ_Z = 'REQ-261005000002-bbbb'
const REQ_OLD = 'REQ-261005000003-cccc'

let dirP1: string
let dirP2: string
let dirHost: string
let dirQueue: string
/** 记录里那份**过期**的路径（项目已改根 / 记录是搬家前写的）：身份优先时它必须不作数。 */
let dirStale: string

beforeEach(() => {
  dirP1 = mkdtempSync(join(tmpdir(), 'pmboard-e2e-P1-'))
  dirP2 = mkdtempSync(join(tmpdir(), 'pmboard-e2e-P2-'))
  dirHost = mkdtempSync(join(tmpdir(), 'pmboard-e2e-host-'))
  dirQueue = mkdtempSync(join(tmpdir(), 'pmboard-e2e-queue-'))
  dirStale = mkdtempSync(join(tmpdir(), 'pmboard-e2e-stale-'))
})
afterEach(() => {
  for (const d of [dirP1, dirP2, dirHost, dirQueue, dirStale]) rmSync(d, { recursive: true, force: true })
})

/** 假项目注册表：窗口 x / y 同属 P1，窗口 z 属 P2（N:1 与跨项目各一）。 */
function projectRows() {
  return toProjectEntries([
    { id: P1, path: dirP1, sessionIds: [SESSION_X, SESSION_Y] },
    { id: P2, path: dirP2, sessionIds: [SESSION_Z] },
  ])
}

/** 与组合根同款：会话 → 项目身份 + 根（同一次查表拿两值）。 */
function sessionProjectOf(sid: string | undefined): { projectId?: string; root?: string } | undefined {
  if (sid === undefined) return undefined
  const rows = projectRows()
  const projectId = projectIdOfWindow(rows, sid)
  if (projectId === undefined) return undefined
  const root = rootOfProject(rows, projectId)
  return { projectId, ...(root !== undefined ? { root } : {}) }
}

function rec(id: string, opts: { projectId?: string; workspaceRoot?: string } = {}): RequirementRecord {
  return {
    id,
    title: id,
    description: '',
    category: 'feature',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    ...opts,
  } as unknown as RequirementRecord
}

function seedReqDir(root: string, id: string): void {
  mkdirSync(join(root, 'docs/requirements', id), { recursive: true })
  writeFileSync(join(root, 'docs/requirements', id, 'requirement.md'), '# ' + id + '\n')
}

/** 目录树的相对快照（用来断言「另一个项目零新增」）。 */
function treeOf(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string, rel: string): void => {
    for (const name of readdirSync(dir)) {
      const child = rel.length === 0 ? name : rel + '/' + name
      const p = join(dir, name)
      out.push(child)
      if (readdirSync(p, { withFileTypes: true }).some((e) => e.isDirectory())) walk(p, child)
    }
  }
  if (existsSync(root)) walk(root, '')
  return out.sort()
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

async function call(
  handler: (req: unknown, res: unknown) => Promise<void>,
  method: 'GET' | 'POST',
  url: string,
  body?: unknown,
): Promise<any> {
  const req = new EventEmitter() as any
  req.url = '/dashboard/api/reqboard' + url
  req.method = method
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  const res = fakeRes()
  await handler(req, res)
  return res.payload
}

function makeHandler(store: ReturnType<typeof makeTestStore>) {
  // applicationDeps 里带上项目表：改绑守卫（FR-11）与用例侧同一口径、同一份注册表。
  const deps = { store, projectRegistry: { list: () => projectRows() } }
  return createReqboardHandler({
    requirementStore: store,
    applicationDeps: deps as never,
    taskStore: taskStoreAt(dirQueue),
    now: () => 1000,
    cwd: dirHost,
    sessionProject: sessionProjectOf,
    // 改绑路由要求目标窗口在线（人点按钮那条路径的既有前置）：只认 z。
    agents: () => ({ get: (id: string) => (id === SESSION_Z ? { id } : undefined) }),
  } as never) as (req: unknown, res: unknown) => Promise<void>
}

const idsOf = (payload: any): string[] => payload.data.requirements.map((r: { id: string }) => r.id).sort()

describe('E-01 三窗口（x/y 属 P1、z 属 P2）：各看各的，产物互不越界', () => {
  it('x / y 只看到 P1 的需求，z 只看到 P2 的需求，且判据来源如实标注', async () => {
    seedReqDir(dirP1, REQ_X)
    seedReqDir(dirP2, REQ_Z)
    const store = makeTestStore({ requirements: [rec(REQ_X, { projectId: P1, workspaceRoot: dirP1 }), rec(REQ_Z, { projectId: P2, workspaceRoot: dirP2 })] })
    const handler = makeHandler(store)

    const fromX = await call(handler, 'GET', '/state?session=' + SESSION_X)
    const fromY = await call(handler, 'GET', '/state?session=' + SESSION_Y)
    const fromZ = await call(handler, 'GET', '/state?session=' + SESSION_Z)

    // x / y 同属 P1（N:1）：两个窗口看到的是同一份 P1 需求集
    expect(idsOf(fromX)).toEqual([REQ_X])
    expect(idsOf(fromY)).toEqual([REQ_X])
    // z 是另一个项目：只看得到 P2 的需求（P1 的需求不出现）
    expect(idsOf(fromZ)).toEqual([REQ_Z])

    // 判据可观测（FR-9）：身份来自项目表，根就是项目条目上的路径，不是宿主 cwd
    expect(fromX.data.projectId).toBe(P1)
    expect(fromX.data.projectSource).toBe('project-id')
    expect(fromX.data.workspaceRoot).toBe(dirP1)
    expect(fromZ.data.projectId).toBe(P2)
    expect(fromZ.data.workspaceRoot).toBe(dirP2)
    expect(fromX.data.workspaceRoot).not.toBe(dirHost)
  })

  it('产物互不越界：P1 下的同名需求目录不会被算成 P2 的产物，P2 目录零访问零新增', async () => {
    seedReqDir(dirP1, REQ_X)
    seedReqDir(dirP2, REQ_Z)
    // **污染形态**：P1 下放一个与 P2 需求同名的目录（旧实现会拿 P1 的根把它登记成 P2 的产物）
    seedReqDir(dirP1, REQ_Z)
    const store = makeTestStore({ requirements: [rec(REQ_X, { projectId: P1, workspaceRoot: dirP1 }), rec(REQ_Z, { projectId: P2, workspaceRoot: dirP2 })] })
    const handler = makeHandler(store)

    const before2 = treeOf(dirP2)
    const scan = await call(handler, 'POST', '/artifacts/scan?session=' + SESSION_X)

    // P2 的记录按项目身份被跳过（不是"扫了但没匹配上"）
    expect(scan.data.skipped).toBe(1)
    expect(scan.data.scanned).toBeGreaterThanOrEqual(1)
    // P2 的记录里不得出现 P1 目录下的同名目录产物
    const recZ = store.peek(REQ_Z)
    expect((recZ?.artifacts ?? []).filter((a) => a.path.includes(REQ_Z)), 'P2 的产物被 P1 的同名目录污染了').toEqual([])
    // 关键判别：P2 的目录树**零新增**（扫描根本没碰它）
    expect(treeOf(dirP2)).toEqual(before2)
  })

  it('E-01b 存量未归属：本项目窗口仍看得到并如实带出「没有项目身份」', async () => {
    seedReqDir(dirP1, REQ_X)
    seedReqDir(dirP1, REQ_OLD)
    const store = makeTestStore({
      requirements: [
        rec(REQ_X, { projectId: P1, workspaceRoot: dirP1 }),
        rec(REQ_OLD, { workspaceRoot: dirP1 }), // 无 projectId = 存量未归属
      ],
    })
    const handler = makeHandler(store)

    const fromX = await call(handler, 'GET', '/state?session=' + SESSION_X)
    // 老记录不因缺身份而从看板消失（FR-8）；本项目记录 + 未归属记录都在
    expect(idsOf(fromX)).toEqual([REQ_OLD, REQ_X].sort())
    // 未归属如实带出：该条摘要里**没有** projectId（"缺失 ≠ 当前项目"）
    const oldRow = fromX.data.requirements.find((r: { id: string }) => r.id === REQ_OLD)
    expect(oldRow.projectId).toBeUndefined()
    const ownRow = fromX.data.requirements.find((r: { id: string }) => r.id === REQ_X)
    expect(ownRow.projectId).toBe(P1)
  })
})

describe('E-02 写入期间邻居改走共享单例根：本次写入仍落本项目的根', () => {
  it('z 的状态读取把共享根改到 P2 后，x 的写侧守卫仍把根校正回 P1 并把产物写进 P1', async () => {
    seedReqDir(dirP1, REQ_X)
    // 记录自带的路径是**过期值**（dirStale），项目条目上的当前路径才是 dirP1 ——
    // 只有这样，"按项目身份取根"这条分支才真的被判据需要（停用它就写进 stale/邻居目录，用例即红）。
    const recX = rec(REQ_X, { projectId: P1, workspaceRoot: dirStale })
    const recZ = rec(REQ_Z, { projectId: P2, workspaceRoot: dirP2 })
    // **共享单例**：宿主级、跨窗口同一个实例（生产上就是 deps.docs）
    const shared = new FileDocRepository({ workspaceRoot: dirP1 })
    const deps = {
      docs: shared,
      projectRegistry: { list: () => projectRows() },
    } as never

    // 邻居窗口 z 的一次读盘/状态读取：按 z 的记录把共享根校正到 P2
    applyRequirementWorkspaceRoot(deps, recZ)
    expect(shared.workspaceRoot()).toBe(dirP2)

    // x 的写入：守卫按**记录的项目身份**校正共享根（项目条目 path = dirP1），而不是信记录的过期路径、也不信"当前值"
    const before2 = treeOf(dirP2)
    const beforeStale = treeOf(dirStale)
    const root = ensureWritableProjectRoot(deps, recX)
    expect(root).toBe(dirP1)
    expect(shared.workspaceRoot()).toBe(dirP1)

    await shared.write('docs/requirements/' + REQ_X + '/verification.md', '# x 的产物\n')
    expect(existsSync(join(dirP1, 'docs/requirements', REQ_X, 'verification.md'))).toBe(true)
    // 既没落到邻居项目（P2），也没落到记录里那份过期路径
    expect(treeOf(dirP2)).toEqual(before2)
    expect(treeOf(dirStale)).toEqual(beforeStale)
  })
})

describe('E-03 同项目两窗口先后 idle：归属都通过，但起轮仍是窗口级（只发生一次）', () => {
  it('需求绑在 x（两窗口同属 P1）→ 两次 idle 后只投递一次，且不出现「归属不符」留痕', async () => {
    const rec = { ...makeDiveReq(REQ_X, SESSION_X), projectId: P1 } as RequirementRecord
    const h = diveLoopHarness({
      reqs: [rec],
      withLatch: false,
      // 与组合根同款：会话 → 项目身份，用同一份假注册表
      projectIdOfWindow: (id: string) => projectIdOfWindow(projectRows(), id),
    })

    await h.idle(SESSION_X)
    expect(h.deliveredFor(REQ_X)).toBe(1)

    // 第二个窗口（同项目、不是这条需求的绑定窗口）也 idle：不得再投一次
    ;(h.agents as Record<string, unknown>)[SESSION_Y] = {
      id: SESSION_Y,
      status: 'idle',
      session: { id: SESSION_Y },
      inbox: { nextTurn: [], nextStep: [], prepend() { /* noop */ } },
    }
    await h.idle(SESSION_Y)

    expect(h.deliveredFor(REQ_X), '同项目多窗口不得重复起轮（归属是项目级、起轮是窗口级）').toBe(1)
    // 归属没被误判成「另一个项目」——两个窗口都属 P1
    expect(h.warns.some((w) => w.includes('跳过归属不符'))).toBe(false)
  })
})

describe('E-04 跨项目改绑：HTTP 层返回跨项目码，台账席位表不变', () => {
  it('把 P1 的需求改绑到 P2 的窗口 → 400 + REQBOARD_CROSS_PROJECT_SEAT，sourceSessionId 未改', async () => {
    seedReqDir(dirP1, REQ_X)
    const store = makeTestStore({
      requirements: [rec(REQ_X, { projectId: P1, workspaceRoot: dirP1, sourceSessionId: SESSION_X } as never)],
    })
    const handler = makeHandler(store)
    const before = JSON.stringify(store.peek(REQ_X))

    const res = await call(handler, 'POST', '/req/rebind', { id: REQ_X, windowKey: SESSION_Z, reason: '跨项目用例' })

    expect(res.success).toBe(false)
    expect(res.code).toBe('REQBOARD_CROSS_PROJECT_SEAT')
    // 台账零改动：sourceSessionId 与席位表都没被写出半份
    expect(JSON.stringify(store.peek(REQ_X))).toBe(before)
    expect(store.peek(REQ_X)?.sourceSessionId).toBe(SESSION_X)
  })
})
