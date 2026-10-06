/**
 * TC-3：被取消前置挡住的活卡**真的能开工**——五处就绪判定同源（REQ-261005193546-1b1a **t-74a5bd** / FR-1、FR-4）。
 *
 * ## 为什么这条不能并进 TC-2
 * TC-2 只证明**层号**正确（不掉层）；本用例证明那张卡不再被**永久卡死**——设计 §「假红防线 5」：
 * 「不漏行但不能开工」时 TC-1 / TC-4 仍绿，**只有 TC-3 会红**。两半各自可失败，故独立成文件。
 *
 * ## 标本 S-1（132 = 106 活卡 + 26 已取消）
 * 106 张活卡 = 100 `done` + 6 在途；其中**两张 `todo`**：
 *   · `t-l000` —— 唯一前置是**已取消**的 `t-c000`（本用例的主角：改前永远不进 ready）；
 *   · `t-l105` —— 前置 `t-l104` 是 `done`（普通就绪，用来证明 ready 集合不是「单元素恒等」）。
 * ⇒ 四处的 ready 集合必须**逐元素相等**且都含这两张；取消卡一张都不许出现。
 *
 * ## 五处（设计 TC-3 逐条）
 * ① `readyTasks`（`shared/protocol.ts`，串行调度器选择器）
 * ② `computeReady`（`domain/queue/topology.ts`，**写路径**唯一实现）
 * ③ `readyTasksOf`（`application/use-cases/queue-access.ts`，用例面）
 * ④ `isReadyTask`（`domain/status/Predicates.ts`，判据单点——单卡布尔）
 * ⑤ `GET /state` 的 `ready[reqId]`（走**生产 HTTP 装配**，不是复述函数）
 * 前四处里 ①②③⑤ 是集合、④ 是单点；本文件断言「①②③⑤ 四处集合逐元素相等 + ④ 对主角为真」。
 * 另外把「能开工」在**展示面**上验一遍：DAG 画布数据 `buildDagData(..., ready).ready` 含主角、
 * 卡面 `N ready` 徽标按 ready 数渲染（无 DOM 环境下画布绿点的可断言替身）。
 *
 * ## 刻意声明的边界（不算缺陷，但必须写清楚）
 * `buildDagData` 的**推导回落**（不传 ready 时前端按 `依赖全 done` 自己推）仍是旧口径；
 * 生产调用点 `board-mount.ts` 一律传 `/state` 的 `ready[reqId]`，故本文件只断言**队列来源**这条
 * （`readySource === 'queue'`）。推导回落不在本卡判据面内（设计 TC-3 的五处不含它）。
 *
 * ## 逆验证（可执行）
 * 把任一处就绪判据改回「只认 done」（如 `Predicates.isDependencySatisfied` 去掉 `isCanceled(dep)`）
 * ⇒ 本文件第 ①②③⑤ 组必红。已实跑并逐字节还原（见任务汇报）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeHarness, req, task } from './application/harness.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { readyTasks } from '../src/shared/protocol.js'
import { computeReady } from '../src/domain/queue/topology.js'
import type { QueueTask } from '../src/domain/queue/QueueTypes.js'
import { readyTasksOf } from '../src/application/use-cases/queue-access.js'
import {
  isReadyTask,
  liveReadyTasks,
  liveTasksOf,
} from '../src/domain/status/Predicates.js'
import { assembleStageDetail } from '../src/application/query/index.js'
import { renderStagePanel } from '../src/client/stage-panel.js'
import { buildDagData } from '../src/client/views/dag-view.js'
import { toReqCards, buildBoard } from '../src/client/views/board.js'
import { renderReqCard } from '../src/client/views/artifacts.js'
import type { BoardState, RequirementRecord as ClientRequirementRecord } from '../src/client/types.js'
import type { RequirementRecord, StageArtifact, TaskRecord } from '../src/shared/protocol.js'

/* ───────────────────────────────────────────────────────── 标本 S-1（132 = 106 + 26） */

const REQ_ID = 'REQ-000106'
const LIVE = 106
const CANCELED = 26
const NOW = 5_000_000
const HUMAN = { kind: 'human' as const }
/**
 * 6 张在途（106 − 100）：`t-l000` = 主角（唯一前置已取消）、`t-l105` = 普通就绪的 todo，
 * 其余 4 张在途填满「非 done」的 6 张，使 `doneCount === 100` 与真标本一致。
 */
const IN_FLIGHT: ReadonlyArray<TaskRecord['status']> = ['in_progress', 'integrating', 'testing', 'in_review']
const pad3 = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-l' + pad3(i)
const goneId = (i: number): string => 't-c' + pad3(i)
/** 主角 A：`todo`，唯一前置 = 已取消的 `t-c000`。 */
const A = liveId(0)
/** 普通就绪的 todo（前置已 done）——让「四个集合相等」不是单元素恒等。 */
const PLAIN = liveId(105)
const X = goneId(0)
const dir = (): string => 'docs/requirements/' + REQ_ID

/** 106 张活卡的状态：两张 `todo`（i=0 主角 / i=105 普通就绪）+ 4 张在途 + 100 张 done。 */
const statusOf = (i: number): TaskRecord['status'] => {
  if (i === 0 || i === LIVE - 1) return 'todo'
  if (i <= IN_FLIGHT.length) return IN_FLIGHT[i - 1]!
  return 'done'
}

function specimenTasks(): TaskRecord[] {
  const live: TaskRecord[] = []
  for (let i = 0; i < LIVE; i += 1) {
    const status = statusOf(i)
    live.push(task({
      id: liveId(i),
      requirementId: REQ_ID,
      title: '活卡 ' + pad3(i),
      dependsOn: i === 0 ? [X] : [liveId(i - 1)],
      status,
      createdAt: 1000 + i,
      updatedAt: 2000 + i,
      statusHistory: [{ status, at: 1500 + i, by: HUMAN }],
    }))
  }
  const canceled: TaskRecord[] = []
  for (let i = 0; i < CANCELED; i += 1) {
    canceled.push(task({
      id: goneId(i),
      requirementId: REQ_ID,
      title: '已取消卡 ' + pad3(i),
      status: 'canceled',
      dependsOn: [],
      createdAt: 3000 + i,
      updatedAt: 4000 + i,
      statusHistory: [{ status: 'canceled', at: 3500 + i, by: HUMAN }],
    }))
  }
  return [...live, ...canceled]
}

function specimenArtifacts(): StageArtifact[] {
  const out: StageArtifact[] = []
  for (let i = 0; i < LIVE; i += 1) {
    out.push({
      stage: 'implementing', kind: 'task_detail',
      path: dir() + '/tasks/' + liveId(i) + '.md', registeredAt: 100 + i, registeredBy: HUMAN,
    })
  }
  for (let i = 0; i < CANCELED; i += 1) {
    out.push({
      stage: 'implementing', kind: 'task_detail',
      path: dir() + '/tasks/' + goneId(i) + '.md', registeredAt: 200 + i, registeredBy: HUMAN,
    })
  }
  return out
}

function specimenRequirement(): RequirementRecord {
  return req({
    id: REQ_ID,
    title: '就绪判定标本（132 = 106 + 26）',
    category: 'feature',
    status: 'implementing',
    sourceSessionId: 'session-w-106',
    createdAt: 1000,
    updatedAt: 5000,
    statusHistory: [
      { status: 'draft', at: 1, by: HUMAN },
      { status: 'implementing', at: 5, by: HUMAN },
    ],
    artifacts: specimenArtifacts(),
  })
}

/** `computeReady` 要 `QueueTask`（多一个派生字段 `layer`）；就绪判定不读 `layer`，填占位值。 */
const queueShape = (tasks: readonly TaskRecord[]): QueueTask[] => tasks.map(t => ({ ...t, layer: 0 }))

/** 卡面投影桥（`client/types` 的需求投影尚未跟进 `VerificationItemSource` 的一支，见 t8 同款说明）。 */
const clientReq = (): ClientRequirementRecord => specimenRequirement() as unknown as ClientRequirementRecord

/** 四处就绪判定的「同一份标本、同一次比对」。 */
function readySets(all: readonly TaskRecord[], stateReady: readonly string[]) {
  return {
    '①shared': readyTasks(all, REQ_ID).map(t => t.id),
    '②write': computeReady(queueShape(all)),
    '③app': readyTasksOf(all).map(t => t.id),
    '⑤state': [...stateReady],
  }
}

/* ───────────────────────────────────────────────────────── 生产 HTTP 装配（GET /state） */

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

interface FakeReq { url: string; method: string; [Symbol.asyncIterator]: () => AsyncGenerator<never> }
function fakeReq(url: string): unknown {
  const r = new EventEmitter() as unknown as FakeReq
  r.url = '/dashboard/api/reqboard' + url
  r.method = 'GET'
  r[Symbol.asyncIterator] = async function* () { /* GET 无 body */ }
  return r
}
interface FakeRes {
  statusCode: number
  payload: { success: boolean; data: Record<string, unknown> } | undefined
}
function fakeRes(): unknown {
  const res = new EventEmitter() as unknown as FakeRes
  res.statusCode = 0
  res.payload = undefined
  const anyRes = res as unknown as Record<string, unknown>
  anyRes.writeHead = (code: number) => { res.statusCode = code; return res }
  anyRes.end = (text?: string) => {
    res.payload = text === undefined ? undefined : JSON.parse(text)
    return res
  }
  return res
}

/** 走**生产装配**取 `/state`（不是手调 handleState：路由/端口/序列化整条链一起过）。 */
async function fetchStatePayload(all: readonly TaskRecord[]): Promise<{ tasks: TaskRecord[]; ready: Record<string, string[]> }> {
  const h = makeHarness({ requirements: [specimenRequirement()], tasks: all })
  const root = mkdtempSync(join(tmpdir(), 'pmboard-ready-unlock-'))
  roots.push(root)
  const handler = createReqboardHandler({
    requirementStore: h.store,
    taskStore: h.taskStore,
    now: () => NOW,
    cwd: root,
  })
  const res = fakeRes() as FakeRes
  await handler(fakeReq('/state') as never, res as never)
  expect(res.statusCode, JSON.stringify(res.payload)).toBe(200)
  const data = res.payload!.data as { tasks: TaskRecord[]; ready: Record<string, string[]> }
  return { tasks: data.tasks, ready: data.ready }
}

/* ───────────────────────────────────────────────────────── 断言 */

describe('REQ-261005193546-1b1a TC-3：五处就绪判定都含 A（唯一前置已取消的那张），四处集合两两相等', () => {
  it('①②③⑤ 四处集合逐元素相等，且 === {A, PLAIN}；取消卡一张都不进 ready', async () => {
    const all = specimenTasks()
    // 标本自检：A 是 todo 且唯一前置已取消；PLAIN 是 todo 且前置已 done
    expect(all.find(t => t.id === A)).toMatchObject({ status: 'todo', dependsOn: [X] })
    expect(all.find(t => t.id === PLAIN)).toMatchObject({ status: 'todo', dependsOn: [liveId(LIVE - 2)] })
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)

    const { ready } = await fetchStatePayload(all)
    const sets = readySets(all, ready[REQ_ID] ?? [])

    // 两两相等（逐元素、含顺序：三处生产实现都承诺「输出顺序 = 输入顺序」）
    expect(sets['①shared']).toEqual([A, PLAIN])
    expect(sets['②write']).toEqual(sets['①shared'])
    expect(sets['③app']).toEqual(sets['①shared'])
    expect(sets['⑤state']).toEqual(sets['①shared'])
    // 第五处交叉核对：domain 的集合形态与四处一致
    expect(liveReadyTasks(all)).toEqual(sets['①shared'])

    // 取消卡不得出现在任何一处（取消卡 id 按 `status === 'canceled'` 字面量取，不用 id 前缀猜）
    const goneIds = new Set(all.filter(t => t.status === 'canceled').map(t => t.id))
    for (const [name, ids] of Object.entries(sets)) {
      expect(ids.filter(id => goneIds.has(id)), name + ' 里出现取消卡').toEqual([])
    }
    // 「真的能开工」而不是「不掉层」：A 必须真的在四处判定里
    expect(sets['①shared']).toContain(A)
    expect(sets['②write']).toContain(A)
    expect(sets['③app']).toContain(A)
    expect(sets['⑤state']).toContain(A)
  })

  it('④ 判据单点 `isReadyTask`：A 与 PLAIN 为真；在途 / done / 取消卡为假（含「前置未了结」的负对照）', () => {
    const all = specimenTasks()
    const byId = new Map(all.map(t => [t.id, t]))
    const byIdLiveOnly = new Map(liveTasksOf(all).map(t => [t.id, t]))

    expect(isReadyTask(all.find(t => t.id === A)!, byId)).toBe(true)
    expect(isReadyTask(all.find(t => t.id === PLAIN)!, byId)).toBe(true)
    // 只喂活卡集合（/state 与 liveLayers 的形态）：指向取消卡的边缺席 ⇒ 同样判就绪
    expect(isReadyTask(all.find(t => t.id === A)!, byIdLiveOnly)).toBe(true)

    // 负对照：自身非 todo 一律不就绪（含取消卡）
    expect(isReadyTask(all.find(t => t.id === goneId(0))!, byId)).toBe(false)
    expect(isReadyTask(all.find(t => t.id === liveId(1))!, byId)).toBe(false) // in_progress
    expect(isReadyTask(all.find(t => t.id === liveId(50))!, byId)).toBe(false) // done
    // 负对照：前置是**未了结的活卡** ⇒ 真被挡住（证明 pending 桶真的在约束）
    const blocked = task({
      id: 't-blocked-by-live', requirementId: REQ_ID, status: 'todo', dependsOn: [liveId(1)],
    })
    const withBlocked = new Map([...byId, [blocked.id, blocked]])
    expect(isReadyTask(blocked, withBlocked)).toBe(false)
    // 同一张卡：前置一旦了结（改指已 done 的活卡）⇒ 立刻可开工
    expect(isReadyTask(task({ ...blocked, dependsOn: [liveId(50)] }), withBlocked)).toBe(true)
  })

  it('⑤ /state 载荷本身：tasks 只含活卡、ready[reqId] 含 A，且容器里没有取消态行', async () => {
    const all = specimenTasks()
    const { tasks, ready } = await fetchStatePayload(all)

    expect(tasks.filter(t => t.status === 'canceled')).toHaveLength(0)
    expect(tasks).toHaveLength(LIVE)
    expect(ready[REQ_ID]).toContain(A)
    expect(ready[REQ_ID]).toContain(PLAIN)

    // 展示面：实施节点详情里取消态行 === 0（「能开工」不会靠漏行换来的）
    const impl = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'implementing'))
    expect((impl.match(/data-status="canceled"/g) ?? [])).toHaveLength(0)
    expect(impl).not.toContain(goneId(0))
    // 非空自检（否则「不含取消卡」是空断言）
    expect(impl).toContain(A)
  })

  it('展示面：DAG 画布数据把 A 标成可开工（readySource=queue），卡面按 ready 数出徽标', async () => {
    const all = specimenTasks()
    const { ready } = await fetchStatePayload(all)
    const readyIds = ready[REQ_ID] ?? []

    // 画布（生产调用点 board-mount 传的就是 /state 的 ready[reqId]）
    const data = buildDagData(
      // 折叠到卡片层用的是活卡载荷（/state 收敛后的形态），故这里喂活卡
      liveTasksOf(all).map(t => ({
        id: t.id, title: t.title, status: t.status,
        phase: t.phase, side: t.side, dependsOn: [...(t.dependsOn ?? [])],
      })),
      readyIds,
    )
    expect(data.readySource).toBe('queue')
    expect(data.ready).toContain(A)
    expect(data.ready).toHaveLength(readyIds.length)
    expect(data.cards).toHaveLength(LIVE)
    expect(data.cards.filter(c => (c.status as string) === 'canceled')).toHaveLength(0)

    // 卡面：readyIds 直接来自 /state，徽标文字 = ready 数（无 DOM 环境下的绿点替身）
    const state: BoardState = {
      revision: 1,
      requirements: [clientReq()],
      tasks: all, // 刻意喂**未过滤**的台账：卡面兜底在 toCard 里（TC-4 详细断言）
      ready: { [REQ_ID]: readyIds },
    }
    const card = toReqCards(state)[0]!
    expect(card.readyIds).toContain(A)
    const cardHtml = renderReqCard(card, NOW)
    expect(cardHtml).toContain('dsh-pm-flag ready')
    expect(cardHtml).toContain(String(readyIds.length) + ' ready')
    expect((buildBoard(state).match(/data-status="canceled"/g) ?? [])).toHaveLength(0)
  })

  it('写路径的悬空口径与用例面**刻意不同**（记录边界，不让它变成静默分歧）', () => {
    const all = specimenTasks()
    // 写路径（computeReady）的 byId 覆盖**全量队列** ⇒ 指向取消卡是「在场且已了结」⇒ 放行
    expect(computeReady(queueShape(all))).toContain(A)
    // 若把「只喂活卡」的集合交给写路径，取消卡变成**悬空引用** ⇒ 保守不放行（V-3 负责检出脏引用）
    // 这是两处刻意的边界差异：写路径永远拿全量队列，调用侧不得把 live-only 集合塞给它。
    expect(computeReady(queueShape(liveTasksOf(all)))).not.toContain(A)
    // 而用例面 / domain 集合判据的契约是「缺席 = 已满足」⇒ 同一份 live-only 集合里 A 仍就绪
    expect(readyTasksOf(liveTasksOf(all)).map(t => t.id)).toContain(A)
    expect(liveReadyTasks(liveTasksOf(all))).toContain(A)
  })
})
