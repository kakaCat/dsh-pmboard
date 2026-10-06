/**
 * TC-9：审计面 —— **界面 0 条、台账仍有 26 条**（REQ-261005193546-1b1a t12 / FR-5 / INV-3）。
 *
 * ## 这条用例在防什么
 * FR-5 的形状是「界面上一条都不出现，台账里一条都不消失」。只断言前者时，**把取消卡从台账里
 * 一并删掉**也能过——那时界面上确实 0 条，但历史证据没了（回退/取消的正当动作变成不可审计）。
 * 故本文件把两件事**放在同一处一起断言**（design/test-cases.md 假红防线 + TC-9 步骤 ①②）：
 *   · 全部界面投影里取消卡条数 `=== 0`；
 *   · 台账原始记录里 `status === 'canceled'` 条数 `=== 26`，且磁盘 26 份卡文档**内容哈希一字不变**。
 *
 * ## 标本（S-1，与真标本 `REQ-261005105032-3b02` 同形）
 * 132 张卡 = 106 活卡 + 26 已取消；26 张取消卡名下各登记 1 份 `task_detail` 产物。
 * **全部标本走临时工作区**（`mkdtempSync`）：生产 `docs/requirements/**` 一个字节都不写。
 *
 * ## 判据的四个通道（少一个都会假绿）
 * ① 界面投影：阶段详情（拆分了/实施两个 body）+ 阶段面板 HTML + 需求卡 + 甘特 + DAG + 文档面板 +
 *    报表 + `/state` 投影 + 追溯视图 —— 取消卡 id 命中数逐面 `=== 0`；
 * ② 台账原始记录（`queue.json` 的**原文**，不是投影）：`"status": "canceled"` 出现 26 次；
 * ③ 磁盘：26 份 `tasks/<取消卡>.md` 读路径跑完前后 **sha256 逐份不变**；
 * ④ 归档材料：`canceled_count` 可从台账**现算**得 26（只进归档材料，不进任何界面）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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
import { queryDocs } from '../src/application/query/QueryDocs.js'
import { queryReport } from '../src/application/query/QueryReport.js'
import { queryState } from '../src/application/query/QueryState.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import { syncRTMYamlWithSnapshot, type RTMLedgerSnapshot } from '../src/application/internal/rtm-yaml.js'
import { liveTasksOf } from '../src/domain/status/Predicates.js'
import { assembleTraceability } from '../src/stage-overview/assembler.js'
import { renderStagePanel } from '../src/client/stage-panel.js'
import { buildGantt } from '../src/client/views/timeline.js'
import { toReqCards } from '../src/client/views/board.js'
import { renderTraceabilityView } from '../src/client/views/traceability-view.js'
import type { BoardState, RequirementRecord as ClientRequirementRecord } from '../src/client/types.js'

const REQ_ID = 'REQ-000106'
const WINDOW = 'session-w-106'
const EXEC = { agent: { id: WINDOW } }
const HUMAN = { kind: 'human' as const }
const NOW = 5_000_000
/** 标本规模（= 真标本的两个数：改前 132 / 改后 106）。 */
const LIVE = 106
const CANCELED = 26
const DONE = 100
const NON_DONE: ReadonlyArray<TaskRecord['status']> = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'in_progress',
]
const DIR = 'docs/requirements/' + REQ_ID
const ACCEPTANCE = 'npx vitest run tests/canceled-audit-holds.test.ts 全绿'

const pad3 = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-l' + pad3(i)
const goneId = (i: number): string => 't-g' + pad3(i)
const liveIds = (): string[] => Array.from({ length: LIVE }, (_, i) => liveId(i))
const goneIds = (): string[] => Array.from({ length: CANCELED }, (_, i) => goneId(i))

/* ───────────────────────────────────────────────────────── 标本 */

function specimenTasks(): TaskRecord[] {
  const live: TaskRecord[] = []
  for (let i = 0; i < LIVE; i += 1) {
    live.push(task({
      id: liveId(i),
      requirementId: REQ_ID,
      title: '活卡 ' + liveId(i),
      status: i < DONE ? 'done' : NON_DONE[i - DONE]!,
      acceptance: ACCEPTANCE,
      requirementRefs: ['FR-1'],
    }))
  }
  const canceled: TaskRecord[] = []
  for (let i = 0; i < CANCELED; i += 1) {
    canceled.push(task({
      id: goneId(i),
      requirementId: REQ_ID,
      title: '已取消卡 ' + goneId(i),
      status: 'canceled',
      acceptance: ACCEPTANCE,
      requirementRefs: ['FR-1'],
    }))
  }
  return [...live, ...canceled]
}

/** 26 张取消卡名下各 1 份 `task_detail` 产物（S-1 的产物登记原样，**一份都不删**）。 */
function specimenArtifacts(): StageArtifact[] {
  return goneIds().map((id, i) => ({
    stage: 'implementing' as const,
    kind: 'task_detail' as const,
    path: DIR + '/tasks/' + id + '.md',
    registeredAt: 200 + i,
    registeredBy: HUMAN,
  }))
}

function specimenRequirement(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_ID,
    title: '审计面标本（132 = 106 活卡 + 26 已取消）',
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

const clientReq = (): ClientRequirementRecord =>
  specimenRequirement() as unknown as ClientRequirementRecord
const boardStateOf = (all: readonly TaskRecord[]): BoardState =>
  ({ revision: 1, requirements: [clientReq()], tasks: [...all], ready: {} })

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

function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason + ' / ' + value.note)
  return value
}

/* ───────────────────────────────────────── 临时工作区（真磁盘，不碰生产目录） */

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

function newRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pmboard-audit-' + tag + '-'))
  roots.push(root)
  return root
}

/** 真落盘：需求文档 + 覆盖标注 + **132 份任务卡文档**（26 份取消卡的一份不少）。 */
function seedWorkspace(root: string): void {
  const dir = join(root, DIR)
  mkdirSync(join(dir, 'tasks'), { recursive: true })
  writeFileSync(join(dir, 'requirement.md'), ['# 需求说明', '', '**FR-1: 审计面**', ''].join('\n'))
  writeFileSync(join(dir, 'verification.md'), ['## 测试证据', '', '- covers: ' + liveIds().join(' '), ''].join('\n'))
  for (const id of [...liveIds(), ...goneIds()]) {
    writeFileSync(join(dir, 'tasks', id + '.md'), '# 任务卡 ' + id + '\n\n正文一字不改。\n')
  }
}

const absOf = (root: string, rel: string): string => join(root, rel)
const sha256Of = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

/* ───────────────────────────────────────────────── 界面投影：取消卡命中数 */

/**
 * 逐面数"取消卡出现了几次"：**按 id 命中**（比只看 `data-status` 强——文案通道也覆盖到）。
 * 每一面都走它自己的生产输入形态（阶段详情/卡面喂未过滤台账；甘特按 `/state` 的活卡载荷喂）。
 */
interface FaceHits {
  'stage-detail-decomposing': number
  'stage-detail-implementing': number
  'stage-overview': number
  'stage-panel-html': number
  'board-card': number
  'gantt': number
  'dag': number
  'docs': number
  'report': number
  'state': number
  'trace': number
}

function canceledHitsIn(text: string): number {
  const byId = goneIds().filter(id => text.includes(id)).length
  const byStatus = text.split('data-status="canceled"').length - 1
  return byId + byStatus
}

async function faceHits(h: Harness, all: readonly TaskRecord[], traceHtml: string): Promise<FaceHits> {
  const detailDecomposing = assembleStageDetail(specimenRequirement(), { tasks: [...all] }, 'decomposing')
  const detailImplementing = assembleStageDetail(specimenRequirement(), { tasks: [...all] }, 'implementing')
  const overview = assembleStageOverview(specimenRequirement(), { tasks: [...all] })
  const card = toReqCards(boardStateOf(all))[0]!
  const dag = ok(await queryDag(depsOf(h), { requirementId: REQ_ID }))
  const docs = ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))
  const report = ok(await queryReport(depsOf(h), { requirementId: REQ_ID }))
  const state = await queryState(h.deps, {}, EXEC)

  return {
    'stage-detail-decomposing': canceledHitsIn(JSON.stringify(detailDecomposing)),
    'stage-detail-implementing': canceledHitsIn(JSON.stringify(detailImplementing)),
    'stage-overview': canceledHitsIn(JSON.stringify(overview)),
    'stage-panel-html': canceledHitsIn(
      renderStagePanel(detailDecomposing) + renderStagePanel(detailImplementing),
    ),
    // 卡面只数**投影出来的任务行**（`card.req` 是台账记录本身，它带着历史产物清单，不是界面行）
    'board-card': canceledHitsIn(JSON.stringify(card.tasks.map(t => ({ id: t.id, status: t.status })))),
    'gantt': canceledHitsIn(buildGantt(clientReq(), liveTasksOf(all), NOW)),
    'dag': canceledHitsIn(JSON.stringify(dag)),
    'docs': canceledHitsIn(JSON.stringify(docs)),
    'report': canceledHitsIn(JSON.stringify(report)),
    'state': canceledHitsIn(JSON.stringify(state)),
    'trace': canceledHitsIn(traceHtml),
  }
}

/* ───────────────────────────────────────────────────────── 断言 */

describe('TC-9 · 审计：界面 0 条与台账 26 条**一起**成立', () => {
  it('全部界面投影取消卡命中 === 0，同时台账原始记录仍是 132 张（其中 26 张 canceled）', async () => {
    const h = makeHarness({ requirements: [specimenRequirement()], tasks: [] })
    await h.addTasks(REQ_ID, specimenTasks())

    // 取消卡名下的卡文档挂进 FakeDocs（文档面板读它判"文件在不在"），磁盘部分另有真标本
    for (const id of goneIds()) h.docs.put(DIR + '/tasks/' + id + '.md', '# 任务卡 ' + id)

    // 追溯面：**新触发过一次 RTM**（走生产入口写盘）后读回，界面同样 0 条
    const root = newRoot('faces')
    seedWorkspace(root)
    const snapshot: RTMLedgerSnapshot = { requirements: [specimenRequirement({ status: 'accepting' })] }
    const sync = syncRTMYamlWithSnapshot(root, snapshot, specimenTasks(), REQ_ID, 'submit:verification')
    expect(sync?.ok, 'RTM 入口本次没有成功产出（追溯面读数将失去意义）').toBe(true)
    const bundle = assembleTraceability(root, REQ_ID)
    const traceHtml = renderTraceabilityView({ task_to_tests: bundle.traceability?.task_to_tests })

    const all = await h.tasksOf(REQ_ID)
    const hits = await faceHits(h, all, traceHtml)

    // ── 界面侧（这一半）──
    for (const [face, n] of Object.entries(hits)) {
      expect(n, face + ' 里出现了取消卡').toBe(0)
    }
    // 有效载荷自检：这些面真的扫到了东西（否则"0 条"是本用例自己空转）
    expect(ALL_STAGE_KEYS.length).toBeGreaterThan(0)
    expect(liveTasksOf(all)).toHaveLength(LIVE)
    // 卡面读数：分母 106（不是 132），且投影出来的任务行数就是 106
    const card = toReqCards(boardStateOf(all))[0]!
    expect(card.totalCount).toBe(LIVE)
    expect(card.tasks).toHaveLength(LIVE)

    // ── 台账侧（另一半，**必须与上面一起断言**）──
    // 「台账原始记录」= 队列文件**原文**（v9 起任务住在 queue.json，不在台账分片里）
    const raw = h.queueRepo.rawOf(REQ_ID)
    expect(raw, '队列文件不存在：台账证据无从谈起').toBeDefined()
    const parsed = JSON.parse(raw!) as { tasks: { id: string; status: string }[] }
    expect(parsed.tasks.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)
    expect((raw!.match(/"status": "canceled"/g) ?? [])).toHaveLength(CANCELED)
    expect(parsed.tasks).toHaveLength(LIVE + CANCELED)
    expect(goneIds().every(id => parsed.tasks.some(t => t.id === id))).toBe(true)
    // 只断言界面 0 条时"把台账一起删掉"也能过；上面两条把这条路堵死
    expect(all).toHaveLength(LIVE + CANCELED)
  })

  it('磁盘 26 份卡文档：读路径（含 RTM 写盘）跑完前后 sha256 逐份不变', async () => {
    const h = makeHarness({ requirements: [specimenRequirement()], tasks: [] })
    await h.addTasks(REQ_ID, specimenTasks())
    const root = newRoot('hashes')
    seedWorkspace(root)

    const paths = goneIds().map(id => absOf(root, DIR + '/tasks/' + id + '.md'))
    const before = paths.map(sha256Of)
    expect(before).toHaveLength(CANCELED)

    // 读路径全跑一遍：阶段详情 / DAG / 文档面板 / 报表 / state / 追溯；外加 RTM 入口写盘
    const all = await h.tasksOf(REQ_ID)
    const snapshot: RTMLedgerSnapshot = { requirements: [specimenRequirement({ status: 'accepting' })] }
    expect(syncRTMYamlWithSnapshot(root, snapshot, all, REQ_ID, 'submit:verification')?.ok).toBe(true)
    assembleStageDetail(specimenRequirement(), { tasks: [...all] }, 'implementing')
    ok(await queryDag(depsOf(h), { requirementId: REQ_ID }))
    ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))
    ok(await queryReport(depsOf(h), { requirementId: REQ_ID }))
    await queryState(h.deps, {}, EXEC)
    assembleTraceability(root, REQ_ID)

    // 26 份卡文档仍在、内容一字不改（INV-3：审计靠磁盘与台账，不靠面板）
    const after = paths.map(sha256Of)
    expect(after).toEqual(before)
    expect(new Set(before).size).toBe(CANCELED) // 自检：26 份是**不同**内容，比对不是恒真
  })

  it('归档材料可引用 canceled_count: 26（只进归档材料，不进任何界面）', async () => {
    const h = makeHarness({ requirements: [specimenRequirement()], tasks: [] })
    await h.addTasks(REQ_ID, specimenTasks())
    const raw = h.queueRepo.rawOf(REQ_ID)!
    const canceledCount = (JSON.parse(raw) as { tasks: { status: string }[] })
      .tasks.filter(t => t.status === 'canceled').length

    // 归档材料（审计路径）能现算这个数：不落新字段、无迁移（architecture.md §归档材料引用 canceled_count）
    const archiveMaterial = { canceled_count: canceledCount }
    expect(archiveMaterial.canceled_count).toBe(CANCELED)

    // 同一个数**不进界面**：任何界面投影里都没有这个键、也没有「已取消 N 张」这类解释性计数
    const all = await h.tasksOf(REQ_ID)
    const html = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: [...all] }, 'implementing'))
      + buildGantt(clientReq(), liveTasksOf(all), NOW)
      + JSON.stringify(ok(await queryDocs(depsOf(h), { requirementId: REQ_ID })))
    expect(html).not.toContain('canceled_count')
    expect(html).not.toContain('另有 ' + CANCELED)
  })
})

/* ───────────────────────────────── 源码锚点：收编点不许改回手写（逆验证可执行化） */

describe('TC-9 · 逆验证锚点：界面投影的活卡收敛必须落在单点上', () => {
  const srcOf = (rel: string): string =>
    readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')

  it('阶段详情 / DAG / 文档面板 / 报表 / 看板卡面都走 `domain/status/Predicates.ts` 的单点', () => {
    expect(srcOf('src/application/query/QueryStageDetail.ts')).toContain('tasks: liveTasksOf(ctx.ledger.tasks)')
    expect(srcOf('src/application/query/QueryDag.ts')).toContain('liveTasksOf(tasks)')
    expect(srcOf('src/application/query/QueryDocs.ts')).toContain('liveArtifactsOf(req.artifacts ?? [], tasks)')
    expect(srcOf('src/application/query/QueryReport.ts')).toContain('liveTasksOf')
    expect(srcOf('src/application/query/QueryState.ts')).toContain('liveTasksOf')
    expect(srcOf('src/client/views/board.ts')).toContain('liveCountOf')
  })

  it('这些投影文件里**没有**手写取消比较（改回手写 ⇒ 本用例红）', () => {
    const files = [
      'src/application/query/QueryStageDetail.ts',
      'src/application/query/QueryDag.ts',
      'src/application/query/QueryDocs.ts',
      'src/application/query/QueryState.ts',
      'src/application/query/live-artifacts.ts',
    ]
    // 与 design/backend.md §防漂移 断言 2 同一正则（行内扫描；只扫**代码**，注释里的举例由 t6 的基线清单管）
    const HANDWRITTEN = /filter\([^\n]*status\s*(?:!==|===)\s*['"]canceled['"]/
    for (const rel of files) {
      expect(HANDWRITTEN.test(srcOf(rel)), rel + ' 复活了手写取消过滤').toBe(false)
    }
  })
})
