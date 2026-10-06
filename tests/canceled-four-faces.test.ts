/**
 * TC-4：四个展示面同一个数（DAG 层级 / 进度计数 / 甘特 / 追溯）（REQ-261005193546-1b1a **t-74a5bd** / FR-2、FR-5）。
 *
 * ## 这张卡守的是什么
 * 设计 `design/test-cases.md` TC-4：四个展示面的读数**全部 `=== 106`** 且 `=== liveCountOf(S-1)`；
 * `doneCount === 100` / `totalCount === 106` / 比率 `=== 0.94`；任一展示面内取消卡行 `=== 0`；
 * 对照改动前口径（S-2：同一份标本**不过滤**）四个读数 `=== 132`、比率 `=== 0.76`、
 * **差值 `=== 26` == 台账取消卡数**。
 *
 * 「四数相等」是**等式判据**而不是把 106 写死：每个面都同时断言 `=== liveCountOf(台账)`。
 *
 * ## 四个面各自的取数边界（口径分叉就发生在这些地方）
 * ① **DAG 层级行数**：`assembleStageDetail`（服务端）→ `renderStagePanel`。喂**未过滤的 132 张**，
 *    过滤发生在装配基类里 ⇒ 这一面是「上游收敛」型。
 * ② **需求卡读数** `toCard`：喂**未过滤**数组，`toCard` 当场兜底（**独立漏点**，不靠上游）。
 * ③ **甘特条数**：`buildGantt` 不做过滤 —— 生产调用点（`board-mount` → `buildReqDetail`）拿到的是
 *    `/state` 已收敛的载荷 ⇒ 本文件按 **1:1 形态**喂 `liveTasksOf(台账)`。
 *    对照（S-2）喂全量 = 改前 `/state` 下发全量时的读数。
 * ④ **追溯行数**：`task_to_tests` 由 **RTM 写入入口**产生（`syncRTMYamlWithSnapshot`，函数体顶部收敛活卡）
 *    ⇒ 这一面喂**未过滤的 132 张**给入口，再走读路径 `assembleTraceability` + `renderTraceabilityView`。
 *
 * ## 追溯那一面：只对「新触发过 RTM」的标本断言数值（设计 §陈旧快照 / 边界）
 * - **新触发的**（本文件主标本）：RTM 是这次跑出来的 ⇒ 数值断言成立（106）。
 * - **存量标本**（取消动作发生在最后一次 RTM 触发之后；`rtm-*.yml` 里仍含取消卡行）：
 *   读路径**逐字不改写**那份快照 ⇒ 本文件**不**断言「追溯行数 == 活卡数」；只断言
 *   ① 从没触发过 RTM 的存量需求：追溯面不出现任何任务行（更不出现取消卡行）；
 *   ② 陈旧快照形态：快照里的 26 张取消卡**不会**泄漏进其余三个面（取消动作不追溯改写历史证据）。
 *   为了凑等式去裁剪 / 重算 RTM 是设计明令禁止的。
 *
 * ## 逆验证（可执行）
 * 只把 `/state`（API 边界）修好、而让 `toCard` 留旧口径（`totalCount: reqTasks.length`）
 * ⇒ 本文件第 ② 组必红（卡面读数退回 132）。已实跑并逐字节还原（见任务汇报）。
 */
import { describe, expect, it, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { req, task } from './application/harness.js'
import { assembleStageDetail } from '../src/application/query/index.js'
import { computeLayers } from '../src/domain/queue/topology.js'
import type { QueueTask } from '../src/domain/queue/QueueTypes.js'
import { liveCountOf, liveTasksOf } from '../src/domain/status/Predicates.js'
import { syncRTMYamlWithSnapshot, type RTMLedgerSnapshot } from '../src/application/internal/rtm-yaml.js'
import { assembleTraceability } from '../src/stage-overview/assembler.js'
import { RTMGenerator, runRTMTrigger } from '../vendor/reqboard/src/rtm/generator.js'
import type { LedgerReader } from '../vendor/reqboard/src/rtm/context.js'
import type { RTMTaskLike } from '../vendor/reqboard/src/rtm/types.js'
import { renderStagePanel } from '../src/client/stage-panel.js'
import { buildGantt } from '../src/client/views/timeline.js'
import { renderTraceabilityView, type TraceabilityData } from '../src/client/views/traceability-view.js'
import { toReqCards } from '../src/client/views/board.js'
import type { BoardState, RequirementRecord as ClientRequirementRecord } from '../src/client/types.js'
import type { RequirementRecord, StageArtifact, TaskRecord } from '../src/shared/protocol.js'

/* ───────────────────────────────────────────────────────── 标本 S-1（132 = 106 + 26） */

const REQ_ID = 'REQ-000106'
const LIVE = 106
const CANCELED = 26
const DONE = 100
const NOW = 5_000_000
const HUMAN = { kind: 'human' as const }
const NON_DONE: ReadonlyArray<TaskRecord['status']> = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'in_progress',
]
const pad3 = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-l' + pad3(i)
const goneId = (i: number): string => 't-c' + pad3(i)
/** 活卡 A：唯一前置 = 已取消的 `t-c000`（TC-2 / TC-3 的主角，本文件用它钉「不成孤岛」）。 */
const A = liveId(0)
const dir = (): string => 'docs/requirements/' + REQ_ID

function specimenTasks(): TaskRecord[] {
  const live: TaskRecord[] = []
  for (let i = 0; i < LIVE; i += 1) {
    const status = i < NON_DONE.length ? NON_DONE[i]! : 'done'
    live.push(task({
      id: liveId(i),
      requirementId: REQ_ID,
      title: '活卡 ' + pad3(i),
      dependsOn: i === 0 ? [goneId(0)] : [liveId(i - 1)],
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

function specimenRequirement(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_ID,
    title: '四面同数标本（132 = 106 + 26）',
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
    ...over,
  })
}

const clientReq = (): ClientRequirementRecord => specimenRequirement() as unknown as ClientRequirementRecord
const boardStateOf = (all: readonly TaskRecord[]): BoardState =>
  ({ revision: 1, requirements: [clientReq()], tasks: [...all], ready: {} })

/* ───────────────────────────────────────────────────────── 量具 */

const countOf = (html: string, re: RegExp): number => (html.match(new RegExp(re.source, 'g')) ?? []).length
const ratio2 = (done: number, total: number): number =>
  total === 0 ? 0 : Math.round((done / total) * 100) / 100
const canceledIdsOf = (tasks: readonly TaskRecord[]): Set<string> =>
  new Set(tasks.filter(t => t.status === 'canceled').map(t => t.id))
const queueShape = (tasks: readonly TaskRecord[]): QueueTask[] => tasks.map(t => ({ ...t, layer: 0 }))

/* ───────────────────────────────────────────────────────── 追溯面：真写盘、走生产入口 */

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

function newRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pmboard-four-faces-' + tag + '-'))
  roots.push(root)
  return root
}

/** 真落盘：`requirement.md`（一条 FR）+ `verification.md`（**只给活卡**写 covers，26 张取消卡无测试）。 */
function seedWorkspace(root: string, covers: readonly string[]): void {
  const reqDir = join(root, 'docs', 'requirements', REQ_ID)
  mkdirSync(reqDir, { recursive: true })
  writeFileSync(join(reqDir, 'requirement.md'), ['# 需求说明', '', '**FR-1: 四面同数**', ''].join('\n'))
  writeFileSync(
    join(reqDir, 'verification.md'),
    ['## 测试证据（TC-4）', '', ...covers.map(id => '- covers: ' + id), ''].join('\n'),
  )
}

/** 台账任务 → RTM 投影（与 `rtm-yaml.ts` 的私有 `toTaskLike` 同形；本用例不改那个私有函数）。 */
function toTaskLike(t: TaskRecord): RTMTaskLike {
  return {
    id: t.id, title: t.title, status: t.status, phase: t.phase, side: t.side,
    depends_on: [...(t.dependsOn ?? [])], implements: t.implementation, serves: t.requirementRefs,
  }
}

/**
 * **新触发过一次 RTM**（生产入口：`syncRTMYamlWithSnapshot`，函数体顶部收敛活卡）写出的追溯面。
 * 喂**未过滤的 132 张**给入口 —— 过滤必须发生在入口内部，否则这一面会退回 132。
 */
function freshTraceData(all: readonly TaskRecord[]): TraceabilityData {
  const root = newRoot('fresh')
  seedWorkspace(root, liveTasksOf(all).map(t => t.id))
  const snapshot: RTMLedgerSnapshot = {
    requirements: [specimenRequirement({ status: 'accepting' })],
  }
  const result = syncRTMYamlWithSnapshot(root, snapshot, all, REQ_ID, 'submit:verification')
  expect(result?.ok, 'RTM 入口本次没有成功产出（追溯面数值断言将失去意义）').toBe(true)

  const bundle = assembleTraceability(root, REQ_ID)
  const taskToTests = bundle.traceability?.task_to_tests
  expect(taskToTests, 'rtm-accepting.yml 里读不到 task_to_tests').toBeDefined()
  expect(taskToTests!).toHaveProperty(liveId(0))
  return { task_to_tests: taskToTests! }
}

/**
 * **对照改前口径**（S-2 的追溯面）：同一份台账、同一条 vendor 生成链，只在入口少那行剔卡
 * ——直接拿全量 132 张喂 `RTMGenerator`（改前入口内部的真实形态）。
 */
function unfilteredTraceData(all: readonly TaskRecord[]): TraceabilityData {
  const root = newRoot('legacy')
  seedWorkspace(root, liveTasksOf(all).map(t => t.id))
  const record = specimenRequirement({ status: 'accepting' })
  const ledger: LedgerReader = {
    requirement: id => (id === record.id
      ? { id: record.id, title: record.title, category: record.category ?? '', status: record.status }
      : undefined),
    tasksOf: id => (id === record.id ? all.map(toTaskLike) : []),
  }
  const result = runRTMTrigger(new RTMGenerator({ workspaceRoot: root, ledger, generatedBy: 'control' }), 'submit:verification', REQ_ID)
  expect(result.ok).toBe(true)
  const bundle = assembleTraceability(root, REQ_ID)
  const taskToTests = bundle.traceability?.task_to_tests
  expect(taskToTests, '对照标本没有产出 task_to_tests').toBeDefined()
  return { task_to_tests: taskToTests! }
}

/** 「存量需求、从没触发过 RTM」：工作区里一份 RTM 都没有。 */
function noTraceData(): TraceabilityData | undefined {
  return assembleTraceability(newRoot('none'), REQ_ID).traceability
}

/* ───────────────────────────────────────────────────────── 四个展示面 */

interface FaceReadings {
  /** ① DAG 层级行数（stage-panel，服务端装配 → 客户端渲染） */
  dagRows: number
  /** ② 需求卡读数（`toCard` / `totalCount`） */
  cardTotal: number
  cardDone: number
  /** ③ 甘特条数 */
  ganttBars: number
  /** ④ 追溯任务节点数 */
  traceRows: number
}

/**
 * 四个面各自的取消卡行数（每一面都必须 `=== 0`）——**按各面的生产输入形态喂**：
 * DAG / 卡面喂未过滤台账（这两面自己过滤），甘特按 `/state` 已收敛的活卡载荷喂（它不过滤）。
 */
function canceledRowsInFaces(all: readonly TaskRecord[], trace: TraceabilityData | undefined): Record<string, number> {
  const gone = canceledIdsOf(all)
  const dag = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing'))
  const impl = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'implementing'))
  const gantt = buildGantt(clientReq(), liveTasksOf(all), NOW)
  const traceHtml = renderTraceabilityView(trace)
  return {
    dag: countOf(dag, /data-status="canceled"/g),
    impl: countOf(impl, /data-status="canceled"/g),
    gantt: countOf(gantt, /class="dsh-pm-gantt-bar" data-status="canceled"/g),
    trace: [...traceHtml.matchAll(/data-id="([^"]*)"/g)].filter(m => gone.has(m[1]!)).length,
  }
}

/** S-1 活卡口径的四个面（①②④ 喂**未过滤**台账；③ 喂 `/state` 形态的活卡载荷）。 */
function liveFaceReadings(all: readonly TaskRecord[], trace: TraceabilityData | undefined): FaceReadings {
  const card = toReqCards(boardStateOf(all))[0]!
  return {
    dagRows: countOf(
      renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing')),
      /class="dsh-pm-sn-dag-task"/g,
    ),
    cardTotal: card.totalCount,
    cardDone: card.doneCount,
    ganttBars: countOf(buildGantt(clientReq(), liveTasksOf(all), NOW), /class="dsh-pm-gantt-bar"/g),
    traceRows: countOf(renderTraceabilityView(trace), /class="dsh-pm-trace-node" data-type="task"/g),
  }
}

/** S-2 改前口径的四个面（同一份台账、不剔卡；对照只用于证明「差值 == 26」）。 */
function legacyFaceReadings(all: readonly TaskRecord[], trace: TraceabilityData | undefined): FaceReadings {
  // 改前 DAG 层级是「一张台账卡一行」：用写路径的分层实现独立算一遍层分组总张数（= 132）
  const legacyDagRows = computeLayers(queueShape(all)).reduce((n, g) => n + g.tasks.length, 0)
  return {
    dagRows: legacyDagRows,
    cardTotal: all.length, // 改前 `toCard` 的 `totalCount: reqTasks.length`
    cardDone: all.filter(t => t.status === 'done').length,
    ganttBars: countOf(buildGantt(clientReq(), [...all], NOW), /class="dsh-pm-gantt-bar"/g),
    traceRows: countOf(renderTraceabilityView(trace), /class="dsh-pm-trace-node" data-type="task"/g),
  }
}

/* ───────────────────────────────────────────────────────── 断言 */

describe('REQ-261005193546-1b1a TC-4：四个展示面同一个数（S-1 活卡口径）', () => {
  it('① 四数全 === 106 且 === liveCountOf(台账)；四面的面内取消卡行 === 0', () => {
    const all = specimenTasks()
    const trace = freshTraceData(all)
    const live = liveFaceReadings(all, trace)
    const liveCount = liveCountOf(all)

    expect(all).toHaveLength(LIVE + CANCELED)
    expect(liveCount).toBe(LIVE) // 标本自检：132 张里 26 张取消

    for (const [face, n] of Object.entries(live)) {
      if (face === 'cardDone') continue
      expect(n, face + ' 的读数与活卡数不一致').toBe(LIVE)
      expect(n, face + ' 的读数与 liveCountOf 不一致').toBe(liveCount)
    }
    // 四个面同台比较（等式，而不是各自对着常量）
    expect(new Set([live.dagRows, live.cardTotal, live.ganttBars, live.traceRows]).size).toBe(1)

    // 「主角不成孤岛」：唯一前置已取消的 A 在四个面上都还在（不是靠漏掉它凑出的 106）
    expect(liveTasksOf(all).map(t => t.id)).toContain(A)
    expect(toReqCards(boardStateOf(all))[0]!.tasks.map(t => t.id)).toContain(A)
    expect(Object.keys(trace.task_to_tests!)).toContain(A)
    expect(
      renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing')),
    ).toContain(A)
    expect(buildGantt(clientReq(), liveTasksOf(all), NOW)).toContain(A)

    // 进度读数：100 / 106 = 0.94（改前 100/132 = 0.76）
    expect(live.cardDone).toBe(DONE)
    expect(live.cardTotal).toBe(LIVE)
    expect(ratio2(live.cardDone, live.cardTotal)).toBe(0.94)

    // 每一面内部：取消卡行 === 0（与「台账 26 条仍在」一起断言）
    const canceledRows = canceledRowsInFaces(all, trace)
    expect(canceledRows).toEqual({ dag: 0, impl: 0, gantt: 0, trace: 0 })
    // 正对照：同一个甘特选择器喂**未过滤**载荷时确实能命中 26 条（「0」不是选择器写错导致的假绿）
    expect(countOf(buildGantt(clientReq(), [...all], NOW), /class="dsh-pm-gantt-bar" data-status="canceled"/g))
      .toBe(CANCELED)
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)
  })

  it('② 卡面是**独立漏点**：喂未过滤数组时 doneCount/totalCount 仍按活卡算（不靠上游 /state）', () => {
    const all = specimenTasks()
    const card = toReqCards(boardStateOf(all))[0]!
    expect(card.totalCount).toBe(LIVE)
    expect(card.totalCount).not.toBe(all.length) // 132 是改前口径
    expect(card.doneCount).toBe(DONE)
    expect(ratio2(card.doneCount, card.totalCount)).toBe(0.94)
    expect(card.tasks).toHaveLength(LIVE)
    expect(card.tasks.filter(t => t.status === 'canceled')).toHaveLength(0)
  })

  it('③ 对照改前口径（S-2，同一份标本不过滤）：四数 === 132、比率 === 0.76，与 S-1 的差值 === 26', () => {
    const all = specimenTasks()
    const legacyTrace = unfilteredTraceData(all)
    const legacy = legacyFaceReadings(all, legacyTrace)
    const live = liveFaceReadings(all, freshTraceData(all))

    for (const [face, n] of Object.entries(legacy)) {
      if (face === 'cardDone') continue
      expect(n, face + ' 的改前读数应当是 132（全量口径）').toBe(LIVE + CANCELED)
    }
    expect(legacy.cardDone).toBe(DONE)
    expect(ratio2(legacy.cardDone, legacy.cardTotal)).toBe(0.76)

    // 差值 == 台账取消卡数（结构性质：换个标本数就跟着变，不是写死的 26）
    for (const face of ['dagRows', 'cardTotal', 'ganttBars', 'traceRows'] as const) {
      expect(legacy[face] - live[face], face + ' 的改前/改后差值应当等于取消卡数').toBe(CANCELED)
    }
  })
})

/* ───────────────────────────────────────────────────────── 追溯面的边界（陈旧快照，设计 §边界） */

describe('REQ-261005193546-1b1a TC-4：追溯那一面的口径边界（存量标本只做「不出现取消卡行」类断言）', () => {
  it('从没触发过 RTM 的存量需求：追溯面零任务行、零取消卡行；其余三面仍是活卡口径', () => {
    const all = specimenTasks()
    const trace = noTraceData()
    expect(trace).toBeUndefined() // 没有 RTM ⇒ 连投影都没有

    const html = renderTraceabilityView(trace)
    expect(countOf(html, /class="dsh-pm-trace-node" data-type="task"/g)).toBe(0)
    expect(countOf(html, /已取消|canceled/g)).toBe(0)

    // 其余三面不因「追溯面缺数据」而漂移
    const live = liveFaceReadings(all, trace)
    expect(live.dagRows).toBe(LIVE)
    expect(live.cardTotal).toBe(LIVE)
    expect(live.ganttBars).toBe(LIVE)
    expect(canceledRowsInFaces(all, trace)).toEqual({ dag: 0, impl: 0, gantt: 0, trace: 0 })
  })

  it('陈旧快照（取消在最后一次 RTM 之后）：**不**断言追溯行数 == 活卡数；断言它不泄漏进其余三面', () => {
    const all = specimenTasks()
    const stale = unfilteredTraceData(all) // 改前入口写出的那份 = 陈旧快照形态
    const keys = Object.keys(stale.task_to_tests!)

    // 前置：这份快照里**确实**含 26 张取消卡（否则下面「不泄漏」是空断言）
    expect(keys).toHaveLength(LIVE + CANCELED)
    for (const id of canceledIdsOf(all)) expect(keys, '陈旧快照里应当留着取消卡行').toContain(id)

    // 读路径逐字不改写 ⇒ 追溯读数 = 快照自身的行数，**不**等于活卡数（设计声明的已知边界）
    const staleRows = countOf(renderTraceabilityView(stale), /class="dsh-pm-trace-node" data-type="task"/g)
    expect(staleRows).toBe(LIVE + CANCELED)
    expect(staleRows).not.toBe(liveCountOf(all))

    // 取消动作不追溯改写历史证据，但也**不得**泄漏进其余三个面
    const live = liveFaceReadings(all, stale)
    expect(live.dagRows).toBe(LIVE)
    expect(live.cardTotal).toBe(LIVE)
    expect(live.ganttBars).toBe(LIVE)
    const canceledRows = canceledRowsInFaces(all, stale)
    expect(canceledRows).toEqual({ dag: 0, impl: 0, gantt: 0, trace: CANCELED })
  })
})
