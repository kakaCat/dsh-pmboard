/**
 * 服务端投影「活卡判据单点」收编守卫（REQ-261005193546-1b1a t6 / FR-1、FR-2、FR-4、FR-5）。
 *
 * ## 标本
 * 与本仓真标本同形：**132 张 = 106 活卡 + 26 已取消卡**
 * （`docs/requirements/REQ-261005105032-3b02/queue.json` 实测 `done=106` + `canceled=26`）。
 * 所有分母都落在 **106** 上——这正是本需求要钉死的那个数。
 *
 * 分层刻意做成**一条 106 长的链**，且链首 `t-l000` 的**唯一前置是被取消的 `t-g000`**：
 *   · 落盘 `layer`（全量口径，写路径照旧、本需求守零写回）⇒ `t-l000` = **1**、其余逐张 +1；
 *   · 读路径现算（剪边后，INV-5）⇒ `t-l000` = **0**、`t-l{i}` = **i**。
 * 于是「层号是转发落盘值还是现算」在数值上可分——这是 `buildDagNodes` 退回全量必红的判据。
 *
 * ## 断言分四层（少一层即假绿）
 * 1. **阶段详情（拆分了/实施两个 body）**：`assembleStageDetail(...).body.tasks.length === 106`
 *    且取消卡条数 `=== 0`；出参 `dependsOn` 写**剪边后**的边（指向取消卡的边被剔）。
 *    另做「基类出口全节点巡检」：任何带 `tasks` 的 body 里取消卡条数都 `=== 0`。
 * 2. **DAG**：节点数组 `=== 106`、每张活卡 `layer` 与 `liveLayers(台账)` 相等、且**与手算链号相等**
 *    （`t-l000 === 0`，不是 1）；`steps` 不含取消卡的执行记录；关键路径 = 106。
 * 3. **文档面板恒等式**：`documents 台账来源行数 + Σ discovered[].count === artifacts.length − 取消卡名下产物条数`，
 *    且取消卡名下 `task_detail` 在 `documents` 与 `discovered` **两侧都 === 0**（不补偿性塞回去）。
 * 4. **统计面**：`queryReport.progress`（分母）与 `queryState`（阶段遥测 / 追溯投影）里取消卡条数 `=== 0`。
 *
 * ## 源码锚点（逆验证的可执行化）
 * 末条用例把两条逆验证钉成源码断言：把基类 `assemble()` 的收敛改回手写 filter、
 * 或把 `queryDag` 的活卡收敛/现算层号删掉 ⇒ 立即变红（不必依赖人工演练）。
 *
 * 断言里一律用 `status === 'canceled'` **字面量**数取消卡：用被测的单点去验被测的单点等于自证。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { makeHarness, req, task, type Harness } from './application/harness.js'
import {
  ALL_STAGE_KEYS,
  isDegrade,
  type PanelResult,
  type RequirementRecord,
  type StageArtifact,
  type TaskRecord,
} from '../src/shared/protocol.js'
import { assembleStageDetail, assembleStageOverview } from '../src/application/query/index.js'
import { queryDag } from '../src/application/query/QueryDag.js'
import { buildGateVerdicts, queryDocs } from '../src/application/query/QueryDocs.js'
import { queryReport } from '../src/application/query/QueryReport.js'
import { queryState } from '../src/application/query/QueryState.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import { liveLayers } from '../src/domain/status/Predicates.js'

const REQ_ID = 'REQ-000106'
const WINDOW = 'session-w-106'
/** 标本规模（= 真标本的两个数：改前 132 / 改后 106）。 */
const LIVE = 106
const CANCELED = 26
const NOW = 5_000_000
const HUMAN = { kind: 'human' as const }

const pad3 = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-l' + pad3(i)
const goneId = (i: number): string => 't-g' + pad3(i)
const dir = (): string => 'docs/requirements/' + REQ_ID

/* ───────────────────────────────────────────────────────── 标本构造 */

/**
 * 106 活卡 + 26 取消卡。
 *
 * - 依赖链：`t-l000 → t-g000`（取消卡）、`t-l{i} → t-l{i-1}`；
 * - `t-l105` 是 `t-l104` 的子卡（`stageKind=dev`）且有一条已完成执行 → 阶段遥测该有 dev 行；
 * - `t-g000` 同样是子卡（`stageKind=review`）且有一条已完成执行 → **改前**会多出一行 review。
 */
function specimenTasks(): TaskRecord[] {
  const live: TaskRecord[] = []
  for (let i = 0; i < LIVE; i += 1) {
    live.push(task({
      id: liveId(i),
      requirementId: REQ_ID,
      title: '活卡 ' + pad3(i),
      dependsOn: i === 0 ? [goneId(0)] : [liveId(i - 1)],
      status: i === 0 ? 'todo' : 'done',
      ...(i === LIVE - 1
        ? {
            parentId: liveId(i - 1),
            stageKind: 'dev' as const,
            executions: [{
              id: 'e-live', trigger: 'auto' as const, startedAt: 10, endedAt: 20, outcome: 'succeeded' as const,
            }],
          }
        : {}),
    }))
  }
  const canceled: TaskRecord[] = []
  for (let i = 0; i < CANCELED; i += 1) {
    canceled.push(task({
      id: goneId(i),
      requirementId: REQ_ID,
      title: '已取消卡 ' + pad3(i),
      status: 'canceled',
      ...(i === 0
        ? {
            parentId: liveId(0),
            stageKind: 'review' as const,
            executions: [{
              id: 'e-gone', trigger: 'auto' as const, startedAt: 30, endedAt: 40, outcome: 'succeeded' as const,
            }],
          }
        : {}),
    }))
  }
  return [...live, ...canceled]
}

/**
 * 台账产物：132 条任务卡文档（活卡 106 + 取消卡 26）+ 2 条**取消卡名下的非任务卡产物**。
 *
 * 后两条是 A3 判据的**边界样本**：`/tasks/<id>.md` 是唯一剔除形状，`rtm-implementing/t-g000.yml`
 * 不属该形状 ⇒ **必须留下**（留在 `discovered` 里）——否则「剔卡」会悄悄扩成「把取消卡的
 * 所有产物都抹掉」，那是超出 A3 的另一条口径。
 */
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
  out.push({
    stage: 'implementing', kind: 'notes',
    path: dir() + '/rtm-implementing/' + goneId(0) + '.yml', registeredAt: 300, registeredBy: HUMAN,
  })
  out.push({
    stage: 'implementing', kind: 'notes',
    path: dir() + '/rtm-implementing/' + goneId(1) + '.yml', registeredAt: 301, registeredBy: HUMAN,
  })
  return out
}

/** 一条 implementing 的在途需求（挂在本窗口上，`queryState` 能认领）。 */
function specimenRequirement(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_ID,
    title: '服务端投影收敛标本（132 = 106 + 26）',
    category: 'feature',
    status: 'implementing',
    sourceSessionId: WINDOW,
    statusHistory: [
      { status: 'draft', at: 1, by: HUMAN },
      { status: 'brainstorming', at: 2, by: HUMAN },
      { status: 'design', at: 3, by: HUMAN },
      { status: 'decomposing', at: 4, by: HUMAN },
      { status: 'implementing', at: 5, by: HUMAN },
    ],
    artifacts: specimenArtifacts(),
    ...over,
  })
}

/** 播种：需求 + 132 张任务（走真实 `QueueTaskStore`，队列文件由 `buildQueueFile` 派生成形）。 */
async function seed(): Promise<Harness> {
  const h = makeHarness()
  h.seedRequirementSync(specimenRequirement())
  h.seedTasks(REQ_ID, specimenTasks())
  await h.seedSettled()
  return h
}

/** 六查询共用依赖（四口 + docs + 固定时钟）。 */
function depsOf(h: Harness): PanelQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session,
    docs: h.docs,
    now: () => NOW,
  }
}

/** 非降级断言（降级信封当场失败，否则后面全是 undefined 噪声）。 */
function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason + ' / ' + value.note)
  return value
}

const canceledIn = (tasks: readonly { status: string }[]): { status: string }[] =>
  tasks.filter(t => t.status === 'canceled')

/* ───────────────────────────────────────── ① 阶段详情：两个 body + 基类出口 */

describe('① 阶段详情：取消卡不进任何 body（基类一次收敛）', () => {
  it('拆分 body：tasks === 106 且取消卡条数 === 0', () => {
    const all = specimenTasks()
    const detail = assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing')
    if (detail.stage !== 'decomposing') throw new Error('narrow')
    expect(detail.body.tasks).toHaveLength(LIVE)
    expect(canceledIn(detail.body.tasks)).toHaveLength(0)
    // 只读：基类收敛不写回入参（判据不改元素、也不改数组本身）
    expect(all).toHaveLength(LIVE + CANCELED)
  })

  it('实施 body：tasks === 106、取消卡条数 === 0，且 byWindow 里没有取消卡', () => {
    const detail = assembleStageDetail(specimenRequirement(), { tasks: specimenTasks() }, 'implementing')
    if (detail.stage !== 'implementing') throw new Error('narrow')
    expect(detail.body.tasks).toHaveLength(LIVE)
    expect(canceledIn(detail.body.tasks)).toHaveLength(0)
    const grouped = Object.values(detail.body.byWindow).flat()
    expect(grouped).not.toContain(goneId(0))
    expect(grouped).not.toContain(goneId(1))
  })

  it('基类出口全节点巡检：任何带 tasks 的 body 里取消卡条数 === 0', () => {
    const overview = assembleStageOverview(specimenRequirement(), { tasks: specimenTasks() })
    const withTasks = overview.stages.filter(s => Array.isArray((s.body as { tasks?: unknown }).tasks))
    // 巡检必须真的扫到东西（否则是本用例自己假绿）
    expect(withTasks.length).toBeGreaterThanOrEqual(2)
    for (const stage of withTasks) {
      const tasks = (stage.body as { tasks: { status: string }[] }).tasks
      expect(tasks).toHaveLength(LIVE)
      expect(canceledIn(tasks)).toHaveLength(0)
    }
    // 出口节点表按 ALL_STAGE_KEYS 给全（分类跳过的也在，body 为空对象）
    expect(overview.stages.map(s => s.stage)).toEqual([...ALL_STAGE_KEYS])
  })

  it('出参 dependsOn 剪边：指向取消卡的边被剔、指向活卡的边保留', () => {
    const detail = assembleStageDetail(specimenRequirement(), { tasks: specimenTasks() }, 'decomposing')
    if (detail.stage !== 'decomposing') throw new Error('narrow')
    const byId = new Map(detail.body.tasks.map(t => [t.id, t]))
    // t-l000 的唯一前置是已取消卡 ⇒ 出参里那条边必须没了（否则客户端 topoLevels 会长出幽灵前置）
    expect(byId.get(liveId(0))?.dependsOn).toEqual([])
    // 指向活卡的边照旧（逐字保留，顺序 = satisfied ∪ pending）
    expect(byId.get(liveId(1))?.dependsOn).toEqual([liveId(0)])
    expect(byId.get(liveId(LIVE - 1))?.dependsOn).toEqual([liveId(LIVE - 2)])
  })
})

/* ───────────────────────────────────────────────── ② DAG：节点 / 层号 / 步骤 */

describe('② DAG：节点数组过活卡、层号现算（INV-1 / INV-5 ③）', () => {
  it('节点数组 === 106，每张活卡 layer === liveLayers(台账) 且 === 手算链号', async () => {
    const h = await seed()
    const all = await h.tasksOf(REQ_ID)
    const res = ok(await queryDag(depsOf(h), { requirementId: REQ_ID }))
    expect(res.tasks).toHaveLength(LIVE)
    expect(res.tasks.filter(n => n.status === 'canceled')).toHaveLength(0)

    const layers = liveLayers(all)
    for (const [i, node] of res.tasks.entries()) {
      // 手算期望（不经过被测单点）：剪掉指向取消卡的边后，链号就是下标
      expect(node.layer).toBe(i)
      // 与单点逐卡相等（= 设计 §依赖边语义 ③ 的最长路径口径）
      expect(node.layer).toBe(layers.get(node.id))
    }
    // 链首的关键一条：它的唯一前置已取消 ⇒ 层号 0，**不是 1**
    expect(res.tasks[0]?.id).toBe(liveId(0))
    expect(res.tasks[0]?.layer).toBe(0)
    expect(res.tasks[0]?.dependsOn).toEqual([])
  })

  it('队列落盘的 layer 仍是全量口径（1）⇒ 现算值不等于转发值（INV-5 边界：落盘仅历史派生值）', async () => {
    const h = await seed()
    const queue = await h.queueOf(REQ_ID)
    const t0 = queue?.tasks.find(t => t.id === liveId(0))
    // 写路径照旧按全量节点分层（本需求守零写回：不重写存量队列文件）
    expect(t0?.layer).toBe(1)
    const res = ok(await queryDag(depsOf(h), { requirementId: REQ_ID }))
    // 读路径现算 = 0 ⇒ 两处不相等，且相等的那一边必须是"删掉指向取消卡的边后重算"
    expect(res.tasks.find(n => n.id === liveId(0))?.layer).toBe(0)
    expect(res.tasks.find(n => n.id === liveId(0))?.layer).not.toBe(t0?.layer)
  })

  it('steps 与 criticalPath 同源喂活卡：取消卡的执行记录不进 steps', async () => {
    const h = await seed()
    const res = ok(await queryDag(depsOf(h), { requirementId: REQ_ID }))
    // 取消卡 t-g000 有一条已完成执行（改前会在 steps 里出现）
    expect(res.steps).toHaveLength(1)
    expect(res.steps.map(s => s.taskId)).toEqual([liveId(LIVE - 1)])
    expect(res.steps.some(s => s.taskId === goneId(0))).toBe(false)
    // 关键路径 = 活卡链全长（含链首：它没有活卡前置，但自己是链的一部分）
    expect(res.criticalPath).toHaveLength(LIVE)
    expect(res.criticalPath?.[0]).toBe(liveId(0))
  })
})

/* ─────────────────────────────────────── ③ 文档面板：恒等式（活卡口径） */

describe('③ 文档面板：documents / discovered 两侧同源同改（A3 + INV-F）', () => {
  it('恒等式成立：documents 台账来源行数 + Σ discovered.count === artifacts.length − 取消卡名下产物条数', async () => {
    const h = await seed()
    const artifacts = specimenArtifacts()
    const res = ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))

    // 「取消卡名下产物条数」= A3 的剔除量：只有 `/tasks/<已取消卡>.md` 这一种形状
    const canceledOwned = artifacts.filter(a => /\/tasks\/t-g\d+\.md$/.test(a.path))
    expect(canceledOwned).toHaveLength(CANCELED)

    const discovered = res.discovered ?? []
    const fromLedger = res.documents.filter(d => artifacts.some(a => a.path === d.path))
    expect(fromLedger).toHaveLength(LIVE)
    expect(fromLedger.length + discovered.reduce((n, g) => n + g.count, 0))
      .toBe(artifacts.length - canceledOwned.length)
  })

  it('取消卡名下 task_detail 在 documents 与 discovered 两侧都 === 0（不补偿性塞回去）', async () => {
    const h = await seed()
    const res = ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))
    const discovered = res.discovered ?? []
    // documents 侧
    expect(res.documents.filter(d => /\/tasks\/t-g\d+\.md$/.test(d.path))).toHaveLength(0)
    // discovered 侧（样例与计数两侧都要干净——"塞回去"最容易藏在样例里）
    expect(discovered.flatMap(g => g.samples).filter(p => /\/tasks\/t-g\d+\.md$/.test(p))).toHaveLength(0)
    expect(discovered.filter(g => g.kind === 'md')).toHaveLength(0)
  })

  it('A3 判据只认 `/tasks/<id>.md`：取消卡名下的非任务卡产物照旧留在 discovered', async () => {
    const h = await seed()
    const res = ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))
    const yml = (res.discovered ?? []).find(g => g.kind === 'yml')
    expect(yml?.count).toBe(2)
  })
})

/* ─────────────────────────────────── ④ 统计面：实施门 / 进度分母 / 状态投影 */

describe('④ 统计面收编：分母与过滤同源（数值不变）', () => {
  it('实施门判据：活卡 > 0 → passed；全取消 → 仍是「任务卡尚未落库」', () => {
    const liveAndCanceled = specimenRequirement()
    const passed = buildGateVerdicts(liveAndCanceled, specimenTasks())
    expect(passed.find(g => g.gate === 'implementation')?.verdict).toBe('passed')

    // 全取消标本：活卡 0 张 ⇒ 门不得凭"有 26 条记录"就判 passed（分母 = 活卡数）
    const canceledOnly = specimenTasks().filter(t => t.status === 'canceled')
    const pending = buildGateVerdicts(liveAndCanceled, canceledOnly)
    const verdict = pending.find(g => g.gate === 'implementation')
    expect(verdict?.verdict).toBe('pending')
    expect(verdict?.reason).toBe('任务卡尚未落库（decompose 不隐式建档）')
  })

  it('queryReport.progress：分母 === 106（不是 132），各档相加仍等于分母', async () => {
    const h = await seed()
    const all = await h.tasksOf(REQ_ID)
    const report = ok(await queryReport(depsOf(h), { requirementId: REQ_ID }))
    const t = report.progress.tasks
    expect(t.total).toBe(LIVE)
    expect(t.total).not.toBe(LIVE + CANCELED)
    // 「取消卡条数 === 0」的可证伪形式：分母 = 台账卡数 − 已取消卡数
    expect(t.total).toBe(all.length - CANCELED)
    expect(t.done).toBe(LIVE - 1)
    expect(t.todo).toBe(1)
    expect(t.running).toBe(0)
    // 分子在同一份活卡数组上数（过滤一套、分母另抄一套 = 完成度永久说谎）
    expect(t.done + t.todo + t.running).toBe(t.total)
    // 子卡链读数同样只在活卡里数
    expect(t.subChainTotal).toBe(1)
    expect(t.subChainDone).toBe(1)
  })

  it('queryState：阶段遥测与追溯投影里取消卡条数 === 0（两个 filter 都收编）', async () => {
    const h = await seed()
    const all = await h.tasksOf(REQ_ID)
    const out = await queryState(h.deps, {}, { agent: { id: WINDOW } }) as Record<string, unknown>
    // 第一处 filter：阶段遥测（取消子卡 t-g000 有一条已完成 review 执行 ⇒ 改前会多一行 review）
    const rows = out.stage_telemetry as { stageKind: string }[]
    expect(rows.map(r => r.stageKind)).toEqual(['dev'])
    // 第二处 filter：追溯投影的 testing 分母 = 喂进去的任务数
    const chain = out.traceability_chain as { test_coverage: { total: number } }
    expect(chain.test_coverage.total).toBe(LIVE)
    expect(chain.test_coverage.total).not.toBe(LIVE + CANCELED)
    expect(chain.test_coverage.total).toBe(all.length - CANCELED)
  })
})

/* ───────────────────────────────────────────── 源码锚点（逆验证可执行化） */

describe('⑤ 逆验证锚点：收敛必须落在单点上（否则本文件必红）', () => {
  const srcOf = (rel: string): string => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

  it('基类 assemble() 的活卡收敛用的是 liveTasksOf（改回手写 filter ⇒ 本用例红）', () => {
    const src = srcOf('src/application/query/QueryStageDetail.ts')
    expect(src).toContain('tasks: liveTasksOf(ctx.ledger.tasks)')
    // 出参剪边同样走单点（不自己写在场判断）
    expect(src).toContain('splitDependencyEdges(t, liveById)')
  })

  it('queryDag 的活卡收敛与现算层号在位（退回全量 / 转发落盘 layer ⇒ 本文件必红）', () => {
    const src = srcOf('src/application/query/QueryDag.ts')
    expect(src).toContain('const live = liveTasksOf(tasks)')
    expect(src).toContain('buildDagNodes(live, liveLayers(live))')
    expect(src).not.toContain('layerIndexOf')
  })
})
