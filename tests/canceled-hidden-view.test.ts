/**
 * 客户端展示面「已取消卡不出现」收编守卫（REQ-261005193546-1b1a **t8** / FR-1、FR-2、FR-4、FR-5）。
 *
 * ## 这张卡守的是**客户端**那几处（服务端投影由 t6 的 `canceled-projection-single-source.test.ts` 守）
 * 1. **卡面计数兜底**：`views/board.ts` 的 `toCard` 是**独立漏点**——只要它拿到未过滤数组，
 *    读数立刻退回 132。故本文件把**未过滤的 132 张**直接喂进 `toReqCards`，断言 `totalCount === 106`。
 * 2. **分层剪边落进 `topoLevels` 内部**：真正当场算层的地方是客户端；服务端投影剔边只算第一道。
 *    本文件用「**只删节点、没剔边**」的半成品输入（活卡的 `dependsOn` 里仍留着已取消卡 id）
 *    直接调 `stage-panel.topoLevels`，断言活卡 A 落在**第 0 层**（不是第 1 层）——
 *    把剪边删掉即必红（逆验证见文末「逆验证锚点」用例）。
 * 3. **本地 `live` 辅助收编**：`render/subtask-view.ts` 的子卡进度分母改走 domain 单点。
 * 4. **服务端产物投影的追溯链**（t8 实测的**真泄漏**，文案扫描抓不到）：`QueryStageDetail.assemble()`
 *    的 `artifacts` 必须走 `live-artifacts.ts` 单点——见 ⑦。
 *
 * ## 原型对照（可失败）
 * 权威原型（`prototypes/INDEX.md` 里唯一那条 authoritative）`prototypes/dag-canceled-hidden.html`
 * 文末的 `proto-geometry` 观测量块声明的数，必须与本用例**实测**出来的同名观测量逐字相等：
 * `canceledRowsShown=0`、`liveCardCount=106`、`dagRowsShown=106`、`ganttBarsShown=106`、
 * `traceRowsShown=106`、`canceledLedgerRows=26`、`progressRatio=0.94`。
 * 原型改数、或某一面读数偏移，本用例即红。
 *
 * ## 「界面 0 条」与「台账 26 条」必须一起断言
 * 只断界面 0 条时，把台账里的取消卡一起删掉也能过（design/frontend.md §严格不可见 第 3 条）。
 * 故本文件每组断言都把 `canceledLedgerRows === 26` 摆在同一处，并额外做**正对照**：
 * 甘特 / 追溯两条面的选择器在**未过滤**载荷上确实能命中 26 条（证明「0」不是选择器写错导致的假绿）。
 *
 * ## 范围边界（如实声明，不越界断言）
 * - 判据一律用 `status === 'canceled'` **字面量**数取消卡（用被测单点验被测单点 = 自证）。
 * - 「需求级」终态条（`renderArchivedBar` 的 `data-status="canceled"`）是**需求状态**、不在本需求口径内
 *   （`tests/archived-entry.test.ts` 明确要求它存在）⇒ 本文件的扫描只覆盖**任务卡**的四个展示面。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { req, task } from './application/harness.js'
import { assembleStageDetail } from '../src/application/query/index.js'
import type {
  DagGraphNode,
  RequirementRecord,
  StageArtifact,
  StageDetail,
  TaskRecord,
} from '../src/shared/protocol.js'
import { liveCountOf, liveTasksOf } from '../src/domain/status/Predicates.js'
import { renderStagePanel, topoLevels } from '../src/client/stage-panel.js'
import { renderDag } from '../src/client/node-panel.js'
import { toReqCards } from '../src/client/views/board.js'
import { buildBoard } from '../src/client/views/board.js'
import { buildGantt } from '../src/client/views/timeline.js'
import { renderTraceabilityView, type TraceabilityData } from '../src/client/views/traceability-view.js'
import { dagPanel } from '../src/client/views/panels/dag.js'
import { subtaskProgress } from '../src/client/render/subtask-view.js'
import type { BoardState, RequirementRecord as ClientRequirementRecord } from '../src/client/types.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'

/* ───────────────────────────────────────────────────────── 标本 S-1（132 = 106 + 26） */

const REQ_ID = 'REQ-000106'
const WINDOW = 'session-w-106'
const LIVE = 106
const CANCELED = 26
const DONE = 100
const NOW = 5_000_000
const HUMAN = { kind: 'human' as const }
/** 6 张在途（106 − 100）：t-l000 是「唯一前置已取消」的那张活卡 A。 */
const NON_DONE: ReadonlyArray<TaskRecord['status']> = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'in_progress',
]

const pad3 = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-l' + pad3(i)
const goneId = (i: number): string => 't-g' + pad3(i)
const dir = (): string => 'docs/requirements/' + REQ_ID

/**
 * 106 活卡 + 26 已取消卡（与真标本 `REQ-261005105032-3b02` 同形）。
 *
 * - 依赖链 `t-l{i} → t-l{i-1}`，链首 `t-l000` 的**唯一前置是被取消的 `t-g000`**
 *   —— 这正是「只删节点不剔边会让活卡凭空多一层」的那张卡；
 * - 每张卡一条与自身状态同值的 `statusHistory` ⇒ 甘特**一卡一条**（不靠时间线回填出两条）；
 * - 取消卡标题刻意含「已取消」三字：若它从任何一面漏出来，文案扫描当场红。
 */
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

/**
 * 台账产物：132 份任务卡文档（活卡 106 + 取消卡 26，**一份都不删**）。
 * 取消卡名下这 26 份是「界面 0 条、台账 26 条」里的那 26 条——审计链的实物。
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
  return out
}

function specimenRequirement(): RequirementRecord {
  return req({
    id: REQ_ID,
    title: '客户端展示面标本（132 = 106 + 26）',
    category: 'feature',
    status: 'implementing',
    sourceSessionId: WINDOW,
    createdAt: 1000,
    updatedAt: 5000,
    statusHistory: [
      { status: 'draft', at: 1, by: HUMAN },
      { status: 'implementing', at: 5, by: HUMAN },
    ],
    artifacts: specimenArtifacts(),
  })
}

/**
 * 客户端渲染入口（`views/timeline.ts` / `views/board.ts`）吃的是 `client/types` 的需求投影，
 * 而该投影尚未跟进 `VerificationItemSource` 的 `prototype-compare` 一支（本仓「列表/详情类型分层」
 * 的既有收尾项）⇒ 这里显式桥接一次。本用例只读 id / 标题 / 计数 / 时间线，不碰 verification。
 */
const clientReq = (): ClientRequirementRecord =>
  specimenRequirement() as unknown as ClientRequirementRecord

function boardStateOf(all: readonly TaskRecord[]): BoardState {
  return { revision: 1, requirements: [clientReq()], tasks: [...all], ready: {} }
}

/* ───────────────────────────────────────────────────────── 量具 */

/** 计数（每次新建正则，避免 `/g` 的 lastIndex 串味）。 */
const countOf = (html: string, re: RegExp): number => (html.match(new RegExp(re.source, 'g')) ?? []).length

/** 取消卡 id 集合（字面量口径，不用被测单点自证）。 */
const canceledIds = (tasks: readonly TaskRecord[]): Set<string> =>
  new Set(tasks.filter(t => t.status === 'canceled').map(t => t.id))

/** 从渲染文本里抽出所有 `data-id="..."`（追溯节点用）。 */
const dataIdsOf = (html: string): string[] =>
  [...html.matchAll(/data-id="([^"]*)"/g)].map(m => m[1]!)

/**
 * 任务卡文档路径 → 卡 id。
 * **判据只认** `/tasks/<id>.md` 这一种形状（与生产单点同形）；形状不符返回 undefined
 * ⇒ 调用方据此把「认不出」与「已取消」分开，不做「不匹配即剔」的猜测。
 */
const taskCardIdOf = (path: string): string | undefined => /\/tasks\/([^/]+)\.md$/.exec(path)?.[1]

/** 一组产物里「任务卡文档」承载的卡 id（形状不符的产物被忽略，不计入）。 */
const cardIdsIn = (artifacts: readonly StageArtifact[]): string[] =>
  artifacts.map(a => taskCardIdOf(a.path)).filter((id): id is string => id !== undefined)

/**
 * 取阶段面板的**追溯链区块**。
 * 为什么必须先切块再扫：`data-path` 在实施面板的**任务行**（`cardDoc` 按钮）里也出现，
 * 直接在整段 HTML 上扫会把任务行误算成追溯节点（实测该面板任务行 106 个 + 追溯链）。
 */
const traceChainOf = (html: string): string =>
  /<div class="dsh-pm-trace-chain">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''

/** 追溯链里的逐节点文档路径（每节点一个 `data-path`）。 */
const tracePathsOf = (html: string): string[] =>
  [...traceChainOf(html).matchAll(/data-path="([^"]*)"/g)].map(m => m[1]!)

/** 整段渲染文本里的全部 `data-path`（含任务行按钮；用于「整面板口径」的对照）。 */
const allDataPathsOf = (html: string): string[] =>
  [...html.matchAll(/data-path="([^"]*)"/g)].map(m => m[1]!)

/** 比率取两位（原型 `progressRatio` 的 unit=ratio）。 */
const ratio2 = (done: number, total: number): number =>
  total === 0 ? 0 : Math.round((done / total) * 100) / 100

/* ───────────────────────────────────────────────────────── 原型（authoritative） */

const PROTO_DIR = new URL('../docs/requirements/REQ-261005193546-1b1a/prototypes/', import.meta.url)
const PROTO_FILE = 'dag-canceled-hidden.html'
const protoHtml = readFileSync(new URL(PROTO_FILE, PROTO_DIR), 'utf8')

/**
 * 解析原型文末**唯一**那块 `proto-geometry` 观测量（name → value）。
 * 观测量块缺失或改了名字 ⇒ 本文件当场红（这就是「原型对照要可失败」的落点）。
 */
function protoObservables(): Map<string, number> {
  const m = /<!--\s*proto-geometry\s+(\{[\s\S]*?\})\s*-->/.exec(protoHtml)
  if (m === null) throw new Error('权威原型里找不到 proto-geometry 观测量块')
  const parsed = JSON.parse(m[1]!) as { observations: { name: string; value: number }[] }
  return new Map(parsed.observations.map(o => [o.name, o.value]))
}

/* ═════════════════════════════════════════════════════ ① 卡面计数兜底（独立漏点） */

describe('① 卡面计数兜底：未过滤数组直接喂 toCard 也不退回 132（FR-2）', () => {
  it('toReqCards：totalCount === liveCountOf(台账) === 106、doneCount === 100（不靠上游 /state）', () => {
    const all = specimenTasks()
    // 台账侧（一起断言的那一半）：取消卡 26 条仍在
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)

    // 故意喂**未过滤**数组：只删节点不剔边的半成品口径也兜得住
    const cards = toReqCards(boardStateOf(all))
    expect(cards).toHaveLength(1)
    const card = cards[0]!
    expect(card.totalCount).toBe(LIVE)
    expect(card.totalCount).toBe(liveCountOf(all))
    expect(card.totalCount).not.toBe(all.length)
    expect(card.doneCount).toBe(DONE)
    // 卡片自己的任务数组同样是活卡（不给下游留第二条口径）
    expect(card.tasks).toHaveLength(LIVE)
    expect(card.tasks.filter(t => t.status === 'canceled')).toHaveLength(0)
    // 进度分母 = 活卡
    expect(ratio2(card.doneCount, card.totalCount)).toBe(0.94)
  })

  it('看板渲染：进度读数用活卡分母；实体卡面上不出现取消卡与「已取消」文案', () => {
    const all = specimenTasks()
    const html = buildBoard(boardStateOf(all))
    // 注意扫描范围：需求级操作按钮带 `data-to="canceled"`（「取消该需求」）属**需求状态**，不在本需求口径内
    // （tests/archived-entry.test.ts 明确要求它存在）⇒ 这里只扫任务卡面与文案。
    expect(countOf(html, /已取消/g)).toBe(0)
    expect(html).not.toContain('t-g')                   // 取消卡 id 一处都不出现
    // 分母 106（100/106 = 94%），不是 132（76%）
    expect(html).toContain('94%')
    expect(html).not.toContain('76%')
    // 台账侧 26 条仍在（一起断言）
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)
  })
})

/* ═════════════════════════════════════════════════════ ② 分层剪边（落进 topoLevels 内部） */

describe('② 分层剪边落进 topoLevels 内部：活卡的唯一前置已取消 ⇒ 第 0 层（FR-1 / D-8）', () => {
  it('喂「只删节点、没剔边」的半成品：A 的层号 === 0（不是 1），且不丢卡不成孤岛', () => {
    const all = specimenTasks()
    // 半成品输入 = 只剩活卡（去掉节点），但 A 的 dependsOn 里**仍留着**已取消卡的 id
    const liveOnly = liveTasksOf(all)
    expect(liveOnly).toHaveLength(LIVE)
    expect(liveOnly.find(t => t.id === liveId(0))?.dependsOn).toEqual([goneId(0)])

    const layers = topoLevels(liveOnly)
    const flat = [...layers.values()].flat()
    expect(flat).toHaveLength(LIVE)
    expect(flat.map(t => t.id)).toContain(liveId(0))          // 不成孤岛
    expect(layers.get(0)?.map(t => t.id)).toEqual([liveId(0)]) // A 在第 0 层
    expect(layers.get(1)?.map(t => t.id)).toEqual([liveId(1)])
    // 只删节点不剔边会得到 1：那一层里不许有 A
    expect(layers.get(1)?.some(t => t.id === liveId(0))).toBe(false)
  })

  it('喂**完全未过滤**的 132 张：取消卡不进层、层号按活卡压实、不留「第 N 层 · 0 张」空层', () => {
    const all = specimenTasks()
    const layers = topoLevels(all)
    const flat = [...layers.values()].flat()
    expect(flat).toHaveLength(LIVE)
    expect(flat.filter(t => t.status === 'canceled')).toHaveLength(0)
    expect([...layers.keys()].sort((a, b) => a - b)).toEqual(
      Array.from({ length: LIVE }, (_, i) => i),
    )
    for (const [, group] of layers) expect(group.length).toBeGreaterThan(0)
  })

  it('两块面板同一口径：stage-panel 与 node-panel 的 DAG 层级读数一致（都是 106 张、A 都在第 1 层）', () => {
    const all = specimenTasks()
    /** 拆出「层标签 + 该层卡 id」；两块面板的卡 id 写法不同，故各自给提取器。 */
    const layersOf = (html: string, block: RegExp, ids: RegExp): { label: string; ids: string[] }[] =>
      [...html.matchAll(block)].map(m => ({ label: m[1]!, ids: [...m[2]!.matchAll(ids)].map(x => x[1]!) }))

    // 看板「DAG 层级」（真正算层的地方是 stage-panel.topoLevels）
    const panel = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing'))
    const stageLayers = layersOf(
      panel,
      /<div class="dsh-pm-sn-dag-layer"><div class="dsh-pm-sn-dag-label">([^<]*)<\/div>([\s\S]*?)<\/div><\/div>/g,
      /class="dsh-pm-sn-task-id">([^<]*)</g,
    )
    // 会话框节点面板：刻意喂**未过滤**的 132 张（折叠到卡片层后，取消卡仍是 tops ⇒ 边也还在）
    const nodeDag = renderDag(all.filter(t => t.parentId === undefined))
    const nodeLayers = layersOf(
      nodeDag,
      /<div class="dsh-pm-np-dag-layer"><div class="dsh-pm-np-dag-label">([^<]*)<\/div>([\s\S]*?)<\/div><\/div>/g,
      /class="dsh-pm-np-card-id">([^<]*)</g,
    )

    expect(stageLayers.length).toBe(LIVE)
    expect(nodeLayers.length).toBe(LIVE)
    // 逐层同构：层号文案与每层张数两块面板一致
    expect(nodeLayers.map(l => l.label)).toEqual(stageLayers.map(l => l.label))
    expect(nodeLayers.map(l => l.ids.length)).toEqual(stageLayers.map(l => l.ids.length))
    expect(stageLayers[0]!.label).toBe('第 1 层 · 无依赖')
    expect(stageLayers[0]!.ids).toContain(liveId(0))
    expect(nodeLayers[0]!.ids).toContain(liveId(0))
    expect(nodeLayers[1]!.ids).toContain(liveId(1))
    // 无空层（不出现「第 N 层 · 0 张」）
    for (const l of stageLayers) expect(l.ids.length).toBeGreaterThan(0)
    // 取消卡一条都不进任何一层，且台账 26 条仍在
    expect([...stageLayers, ...nodeLayers].flatMap(l => l.ids).filter(id => canceledIds(all).has(id) || id === '')).toEqual([])
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)
  })
})

/* ═════════════════════════════════════════════════════ ③ 子卡进度分母收编 */

describe('③ 子卡进度分母：取消的子卡不进分母（本地 live 辅助已删，走 domain 单点）', () => {
  it('父卡 1 + 子卡 3（其中 1 张已取消）⇒ 子卡分母 2', () => {
    const tasks = [
      task({ id: 't-p1', requirementId: REQ_ID, status: 'in_progress' }),
      task({ id: 't-s1', requirementId: REQ_ID, status: 'done', parentId: 't-p1', stageKind: 'dev' }),
      task({ id: 't-s2', requirementId: REQ_ID, status: 'canceled', parentId: 't-p1', stageKind: 'integrate' }),
      task({ id: 't-s3', requirementId: REQ_ID, status: 'in_progress', parentId: 't-p1', stageKind: 'review' }),
    ]
    const p = subtaskProgress(tasks)
    expect(p.subtasksTotal).toBe(2)
    expect(p.subtasksDone).toBe(1)
    expect(p.parentsTotal).toBe(1)
    // 台账侧取消的子卡仍在（一起断言）
    expect(tasks.filter(t => t.status === 'canceled')).toHaveLength(1)
  })
})

/* ═════════════════════════════════════════════════════ ④ 原型对照（逐条观测量 ↔ 实测） */

describe('④ 原型对照：authoritative 原型声明的观测量与本用例实测逐字相等', () => {
  it('INDEX.md 里权威那一份就是本文件对照的路径（对照作废稿 = 假绿）', () => {
    const index = readFileSync(new URL('INDEX.md', PROTO_DIR), 'utf8')
    expect(index).toMatch(new RegExp('\\|\\s*prototypes/' + PROTO_FILE.replace('.', '\\.') + '\\s*\\|\\s*authoritative\\s*\\|'))
  })

  it('七个观测量（界面 0 条 **且** 台账 26 条）与原型声明逐字相等', () => {
    const all = specimenTasks()
    const proto = protoObservables()
    const goneIds = canceledIds(all)

    // 四类选择器：chip（DAG 层级行）/ node（会话框 DAG 节点）/ bar（甘特条）/ trace（追溯行）
    const dagPanelHtml = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing'))
    const implPanelHtml = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'implementing'))
    const nodeDagHtml = renderDag(liveTasksOf(all).filter(t => t.parentId === undefined) as never)
    const ganttHtml = buildGantt(clientReq(), liveTasksOf(all), NOW)
    const traceData: TraceabilityData = {
      task_to_tests: Object.fromEntries(liveTasksOf(all).map(t => [t.id, ['tests/sample.test.ts']])),
    }
    const traceHtml = renderTraceabilityView(traceData)

    /** 取消卡命中数（总量）：四个展示面各自的选择器/ id 集扫一遍。 */
    const canceledRowsShown =
      countOf(dagPanelHtml, /data-status="canceled"/g)
      + countOf(implPanelHtml, /data-status="canceled"/g)
      + countOf(nodeDagHtml, /data-status="canceled"/g)
      + countOf(ganttHtml, /data-status="canceled"/g)
      + dataIdsOf(traceHtml).filter(id => goneIds.has(id)).length

    const measured: Record<string, number> = {
      canceledRowsShown,
      liveCardCount: toReqCards(boardStateOf(all))[0]!.totalCount,
      dagRowsShown: countOf(dagPanelHtml, /class="dsh-pm-sn-dag-task"/g),
      progressRatio: ratio2(DONE, LIVE),
      ganttBarsShown: countOf(ganttHtml, /class="dsh-pm-gantt-bar"/g),
      traceRowsShown: countOf(traceHtml, /class="dsh-pm-trace-node" data-type="task"/g),
      canceledLedgerRows: all.filter(t => t.status === 'canceled').length,
      legacyDagRowsShown: all.length,
      legacyProgressRatio: ratio2(DONE, all.length),
    }

    // 逐条 ↔ 原型：原型声明了什么就得测出什么（缺项/改名 ⇒ 红）
    for (const [name, value] of Object.entries(measured)) {
      expect(proto.has(name), '权威原型未声明观测量：' + name).toBe(true)
      expect(value, '观测量 ' + name + ' 与原型不一致').toBe(proto.get(name))
    }

    // 界面 0 条 与 台账 26 条 **同时**成立（只断前者 = 把台账删掉也能过）
    expect(measured.canceledRowsShown).toBe(0)
    expect(measured.canceledLedgerRows).toBe(CANCELED)
    // 改前口径的差值 = 台账取消卡数（同一份数据、两种口径）
    expect(measured.legacyDagRowsShown! - measured.dagRowsShown!).toBe(CANCELED)
  })

  it('正对照：同一批选择器喂**未过滤**载荷时确实能命中 26 条（「0」不是选择器写错的假绿）', () => {
    const all = specimenTasks()
    const goneIds = canceledIds(all)

    // 甘特条：未过滤载荷下取消条 26 条（buildGantt 吃已过滤载荷，此处刻意喂改前口径）
    const rawGantt = buildGantt(clientReq(), all, NOW)
    expect(countOf(rawGantt, /class="dsh-pm-gantt-bar" data-status="canceled"/g)).toBe(CANCELED)

    // 追溯行：RTM 里仍含取消卡时（陈旧快照形态），取消卡节点 26 个
    const rawTrace = renderTraceabilityView({
      task_to_tests: Object.fromEntries(all.map(t => [t.id, ['tests/sample.test.ts']])),
    })
    expect(dataIdsOf(rawTrace).filter(id => goneIds.has(id))).toHaveLength(CANCELED)

    // 台账侧：26 条一条不少
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)
  })
})

/* ═════════════════════════════════════════════════════ ⑤ TC-11 严格不可见 + 既有锚点 */

describe('⑤ 严格不可见：无开关、无计数交代、既有锚点形状不变（FR-5）', () => {
  const SRC_ROOT = new URL('../src/client/', import.meta.url)

  const walk = (dirUrl: URL): string[] => {
    const out: string[] = []
    for (const name of readdirSync(dirUrl)) {
      const child = new URL(name + (statSync(new URL(name, dirUrl)).isDirectory() ? '/' : ''), dirUrl)
      if (statSync(child).isDirectory()) out.push(...walk(child))
      else if (name.endsWith('.ts')) out.push(fileURLToPath(child))
    }
    return out
  }

  it('源码里没有「显示已取消」开关（includeCanceled / showCanceled 命中 === 0）', () => {
    const files = walk(SRC_ROOT)
    expect(files.length).toBeGreaterThan(20) // 巡检必须真的扫到东西
    const hits = files.filter(f => /includeCanceled|showCanceled/.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })

  it('四个展示面渲染文本里「已取消 / canceled」命中 === 0（含 title / aria-label / data-*）', () => {
    const all = specimenTasks()
    const faces: Record<string, string> = {
      '阶段详情·拆分（DAG 层级）': renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing')),
      '阶段详情·实施（任务行）': renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'implementing')),
      '甘特摘要': buildGantt(clientReq(), liveTasksOf(all), NOW),
      '追溯 / RTM 行': renderTraceabilityView({
        task_to_tests: Object.fromEntries(liveTasksOf(all).map(t => [t.id, ['tests/sample.test.ts']])),
      }),
    }
    for (const [face, html] of Object.entries(faces)) {
      expect(countOf(html, /已取消/g), face + ' 出现「已取消」字样').toBe(0)
      expect(countOf(html, /canceled/g), face + ' 出现 canceled 字样').toBe(0)
      expect(countOf(html, /data-status="canceled"/g), face + ' 出现取消态行').toBe(0)
    }
  })

  it('DAG Tab：data-dag-statuses 不含 canceled 档，摘要七项锚点形状不变', () => {
    const all = specimenTasks()
    const ctx: ReportTabCtx = {
      requirementId: REQ_ID,
      load: () => Promise.reject(new Error('渲染路径不该取数（取数归壳）')),
      openDoc: () => { /* 渲染不开正文 */ },
    }
    const nodes: DagGraphNode[] = liveTasksOf(all).map(t => ({
      id: t.id, title: t.title, status: t.status, dependsOn: [] as string[],
    }))
    const html = dagPanel.render({ tasks: nodes, steps: [] }, ctx)

    const statuses = /data-dag-statuses="1">状态：([^<]*)</.exec(html)?.[1] ?? ''
    expect(statuses.length).toBeGreaterThan(0)          // 读到了
    expect(statuses).not.toContain('canceled')          // 也不含「canceled 0」这种交代
    for (const attr of ['data-dag-layer-count', 'data-dag-task-count', 'data-dag-edge-count', 'data-dag-parallelism', 'data-dag-layers', 'data-dag-statuses']) {
      expect(countOf(html, new RegExp(attr + '=')), attr + ' 锚点缺失').toBe(1)
    }
    expect(html).toContain('data-dag-summary="1"')
    expect(html).toContain('data-dag-task-count="106"')
    // 分层明细里不出现 0 张的空层
    expect(/L\d+ 0 张/.test(html)).toBe(false)
    // 图例不新增「已取消」档（状态图例随活卡）
    expect(html).not.toContain('已取消')
  })

  it('甘特图例不含「已取消」档，且既有图例项一个不少（不靠颜色单独表达状态）', () => {
    const all = specimenTasks()
    const html = buildGantt(clientReq(), liveTasksOf(all), NOW)
    const legend = /<div class="dsh-pm-gantt-legend">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? ''
    expect(countOf(legend, /dsh-pm-gantt-legend-item/g)).toBe(7) // 6 档任务状态 + 需求里程碑
    expect(legend).not.toContain('已取消')
    expect(legend).not.toContain('canceled')
  })
})

/* ═════════════════════════════════════════════════════ 逆验证锚点（可执行化） */

describe('⑥ 逆验证锚点：剪边与兜底必须真的落在代码里（删掉即本文件必红）', () => {
  const srcOf = (rel: string): string => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

  it('stage-panel.topoLevels 的内部剪边走 layerInputOf / splitDependencyEdges（删掉 ⇒ 用例 ② 必红）', () => {
    const src = srcOf('src/client/stage-panel.ts')
    expect(src).toContain('const live = layerInputOf(tasks)')
    expect(src).toContain('const split = splitDependencyEdges(t, byId)')
    // 旧写法（把不在场的前置当 0 计入 max）必须已不存在
    expect(src).not.toContain('Math.max(...t.dependsOn.map(d => lv(d)))')
  })

  it('node-panel 同款剪边、且**没有**第二份 filter（不从 Predicates 引入 liveTasksOf）', () => {
    const src = srcOf('src/client/node-panel.ts')
    expect(src).toContain('const live = layerInputOf(tasks)')
    expect(src).toContain('const split = splitDependencyEdges(t, byId)')
    expect(src).not.toContain('Math.max(...t.dependsOn.map(d => lv(d)))')
    // 「不加第二份 filter」的可执行判据：本文件根本没有 liveTasksOf 这个 import
    expect(/import\s*\{[^}]*liveTasksOf[^}]*\}\s*from/.test(src)).toBe(false)
    expect(/=\s*liveTasksOf\(/.test(src)).toBe(false)
  })

  it('board.ts 的 toCard 计数走 liveTasksOf / liveCountOf，在途计数不再手写 canceled 字面量', () => {
    const src = srcOf('src/client/views/board.ts')
    expect(src).toContain('const tasks = liveTasksOf(reqTasks)')
    expect(src).toContain('totalCount: liveCountOf(reqTasks)')
    expect(src).toContain('isLiveTask(t)')
    expect(src).not.toContain("t.status !== 'canceled'")
  })

  it('subtask-view.ts 的本地 live 辅助已删（改调 domain 单点）', () => {
    const src = srcOf('src/client/render/subtask-view.ts')
    expect(src).toContain('liveTasksOf(parents)')
    expect(src).not.toContain("x.status !== 'canceled'")
  })
})

/* ═════════════════════════════════════════════════════ ⑦ 追溯链剔卡（服务端产物投影 · FR-5 / A3） */

/**
 * 本 describe 锁的是**文案扫描抓不到**的那条真泄漏（t8 实测）：
 * 阶段面板的追溯链吃服务端 `payload.artifacts`，`QueryStageDetail.assemble()` 当时**没剔卡**
 * ⇒ 26 张取消卡名下的 `tasks/<id>.md` 被渲染成 26 个追溯节点
 * （实测实施面板 238 个 `data-path` 里 26 个来自取消卡），
 * 而节点标签是「任务卡（t-gNNN）」——**没有** `canceled` / `已取消` 字样
 * ⇒ 既有 TC-11 文案断言（上面 describe ⑤）**不会红**。这正是本组断言存在的理由：
 * 它不扫文案，而是**逐条比对追溯链的节点路径集合**。
 *
 * ## 逆验证（改前必红，**已实际执行**）
 * 把 `src/application/query/QueryStageDetail.ts` 出口的
 * `artifacts: liveArtifactsOf(artifactsForStage(req, this.stage), ctx.ledger.tasks)`
 * 换成不过滤的 `artifacts: artifactsForStage(req, this.stage)`：
 * - 用例 1 红在 `expect(ids.filter(id => gone.has(id))).toEqual([])` → 收到 26 个取消卡 id；
 * - 用例 2 红在 `expect(canceledNodesIn(livePaths)).toEqual([])` → 收到 26 个取消卡节点。
 * 跑完逐字节还原（md5 前后一致；证据在 t8 汇报里）。
 * 用例 4 是这条逆验证的**常驻锚点**：出口一旦不是 `liveArtifactsOf(...)`，本文件立刻红。
 *
 * 判据口径：取消卡一律用 `status === 'canceled'` **字面量**数（`canceledIds` 量具），
 * 不用被测单点自证；台账侧（132 份产物 / 26 条取消卡）与界面侧（0 条）**在同一处一起断言**。
 */
describe('⑦ 追溯链不出现取消卡：阶段详情产物投影按活卡口径剔卡（FR-5 / A3）', () => {
  /** 未过滤载荷 = **改前口径**：把 `req.artifacts` 按 stage 切一份（不剔卡）。 */
  const rawImplementingArtifacts = (r: RequirementRecord): StageArtifact[] =>
    (r.artifacts ?? []).filter(a => a.stage === 'implementing')

  /** 改后口径：走真正的装配出口。 */
  const filteredDetail = (all: readonly TaskRecord[]): StageDetail =>
    assembleStageDetail(specimenRequirement(), { tasks: all }, 'implementing')

  /** 一组路径里「属已知取消卡」的路径（组内比对，避免与量具自身耦合）。 */
  const canceledPathsIn = (paths: readonly string[], gone: ReadonlySet<string>): string[] =>
    paths.filter(p => { const id = taskCardIdOf(p); return id !== undefined && gone.has(id) })

  it('装配出口：取消卡名下的 tasks/<id>.md === 0 条；活卡 106 条**逐 id**一条不少（防一刀切删空）', () => {
    const all = specimenTasks()
    const gone = canceledIds(all)
    const detail = filteredDetail(all)
    const ids = cardIdsIn(detail.artifacts)

    // 台账侧（一起断言的那一半）：132 份产物一份都没删，其中取消卡名下仍有 26 条
    expect(specimenArtifacts()).toHaveLength(LIVE + CANCELED)
    expect(canceledPathsIn(specimenArtifacts().map(a => a.path), gone)).toHaveLength(CANCELED)
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)

    // 出口侧：取消卡名下 0 条（**不是**断言整个 artifacts 被删空）
    expect(canceledPathsIn(detail.artifacts.map(a => a.path), gone)).toEqual([])
    expect(ids.filter(id => gone.has(id))).toEqual([])

    // 活卡产物不被误删：逐 id 集合相等（一刀切删空、误删任意一张、多出幽灵 id 都会红）
    const liveIds = all.filter(t => t.status !== 'canceled').map(t => t.id)
    expect(ids.filter(id => liveIds.includes(id)).sort()).toEqual([...liveIds].sort())
    expect(ids).toHaveLength(LIVE)
    // 投影仍按 stage 切片，未把别的阶段产物混进来
    expect(detail.artifacts.every(a => a.stage === 'implementing')).toBe(true)
  })

  it('追溯链对照：未过滤载荷 26 个取消卡节点 → 已过滤 0 个；106 个活卡节点逐条不变', () => {
    const all = specimenTasks()
    const gone = canceledIds(all)
    const detail = filteredDetail(all)
    // 唯一差异 = `artifacts` 那一项（body 复用同一份），故两边的差异只能来自产物剔卡
    const rawPayload: StageDetail = { ...detail, artifacts: rawImplementingArtifacts(specimenRequirement()) }

    const rawHtml = renderStagePanel(rawPayload)
    const liveHtml = renderStagePanel(detail)
    const rawPaths = tracePathsOf(rawHtml)
    const livePaths = tracePathsOf(liveHtml)

    // ── 正对照（改前口径）：追溯链确实能命中 26 个取消卡节点 ⇒「0」不是链压根没渲染的假绿
    expect(rawPaths).toHaveLength(LIVE + CANCELED)
    expect(canceledPathsIn(rawPaths, gone)).toHaveLength(CANCELED)
    expect(countOf(traceChainOf(rawHtml), /class="dsh-pm-trace-node"/g)).toBe(LIVE + CANCELED)

    // ── 改后：取消卡节点 0 个，链长 = 活卡数
    expect(canceledPathsIn(livePaths, gone)).toEqual([])
    expect(livePaths).toHaveLength(LIVE)
    expect(countOf(traceChainOf(liveHtml), /class="dsh-pm-trace-node"/g)).toBe(LIVE)

    // ── 活卡节点逐条不变（整条链被删空 / 顺序被打乱同样红）
    expect(livePaths).toEqual(rawPaths.filter(p => canceledPathsIn([p], gone).length === 0))

    // ── 整面板口径（与实测 238/26 同形）：
    //    改前 = 任务行 106 个 cardDoc 按钮 + 追溯链 132 个节点 = 238，其中 26 个来自取消卡；
    //    改后 = 106 + 106 = 212，取消卡 0 个（任务行那 106 个**不动**——它们本就是活卡）
    const rawAll = allDataPathsOf(rawHtml)
    const liveAll = allDataPathsOf(liveHtml)
    expect(rawAll).toHaveLength(238)
    expect(canceledPathsIn(rawAll, gone)).toHaveLength(CANCELED)
    expect(liveAll).toHaveLength(212)
    expect(canceledPathsIn(liveAll, gone)).toEqual([])

    // ── 文案扫描为什么抓不到（描述本 describe 的存在理由，不是重复 describe ⑤）：
    //    取消卡节点的标签里既没有「已取消」也没有 canceled，只有「任务卡（t-gNNN）」
    expect(traceChainOf(rawHtml)).toContain('任务卡（' + goneId(0) + '）')
    expect(countOf(traceChainOf(rawHtml), /已取消/g)).toBe(0)
    expect(countOf(traceChainOf(rawHtml), /canceled/g)).toBe(0)

    // 台账侧：26 份取消卡产物仍全在（界面 0 条 ≠ 台账删条）
    expect(canceledPathsIn(specimenArtifacts().map(a => a.path), gone)).toHaveLength(CANCELED)
  })

  it('fail-open：认不出的产物一律保留（卡不在台账 / 不是任务卡形状 / 形状更深）——该剔的仍剔', () => {
    const all = specimenTasks()
    const gone = canceledIds(all)
    const base = specimenRequirement()
    const unknownTaskDoc = dir() + '/tasks/t-z999.md'      // 台账里根本没有这张卡 ⇒ 认不出
    const notTaskCardDoc = dir() + '/plan.md'              // 不是 `/tasks/<id>.md` 形状 ⇒ 认不出
    const nestedTaskDoc = dir() + '/tasks/sub/t-l000.md'   // `/tasks/` 之后还有一层 ⇒ 认不出
    const withUnknown = req({
      ...base,
      artifacts: [
        ...(base.artifacts ?? []),
        { stage: 'implementing', kind: 'task_detail', path: unknownTaskDoc, registeredAt: 900, registeredBy: HUMAN },
        { stage: 'implementing', kind: 'task_detail', path: notTaskCardDoc, registeredAt: 901, registeredBy: HUMAN },
        { stage: 'implementing', kind: 'task_detail', path: nestedTaskDoc, registeredAt: 902, registeredBy: HUMAN },
      ],
    })

    const detail = assembleStageDetail(withUnknown, { tasks: all }, 'implementing')
    const paths = detail.artifacts.map(a => a.path)

    // 「认不出 → 保留（不猜）」：三种形态一个都不能被误删（误删界面行是比漏删更坏的谎）
    expect(paths).toContain(unknownTaskDoc)
    expect(paths).toContain(notTaskCardDoc)
    expect(paths).toContain(nestedTaskDoc)
    expect(paths).toHaveLength(LIVE + 3)
    // fail-open ≠ 全放行：同一次调用里该剔的取消卡照样 0 条
    expect(canceledPathsIn(paths, gone)).toEqual([])

    // 渲染层同样保留：追溯链里这三份文档都点得到（不是「装配留着、渲染又丢了」）
    const chain = traceChainOf(renderStagePanel(detail))
    expect(chain).toContain(unknownTaskDoc)
    expect(chain).toContain(notTaskCardDoc)
    expect(chain).toContain(nestedTaskDoc)
    expect(tracePathsOf(renderStagePanel(detail))).toHaveLength(LIVE + 3)
    // 台账侧：这三条本来就是台账里的产物（fail-open 不是凭空造行）
    expect(withUnknown.artifacts?.filter(a => paths.includes(a.path))).toHaveLength(LIVE + 3)
  })

  it('逆验证锚点：出口确实走 liveArtifactsOf 单点（换回 artifactsForStage(...) ⇒ 本 describe 必红）', () => {
    const srcOf = (rel: string): string => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')
    const src = srcOf('src/application/query/QueryStageDetail.ts')
    // 出口就是这个表达式：换掉它，用例 1 / 2 立刻红（逆验证见本 describe 头注释）
    expect(src).toContain("import { liveArtifactsOf } from './live-artifacts.js'")
    expect(src).toContain('artifacts: liveArtifactsOf(artifactsForStage(req, this.stage), ctx.ledger.tasks)')
    // 出口处不得存在「不过滤」的旧写法（旧写法回来 = 逆验证的前提已被绕过）
    expect(/artifacts:\s*artifactsForStage\(/.test(src)).toBe(false)
    // INV-4：本文件不重写 `status === 'canceled'` 字面量（判据只在 domain 单点里）
    expect(src).not.toContain("status === 'canceled'")
    // 判据依赖「台账传全量」：上游若先把取消卡滤掉再传，`canceledIdsOf` 得空集
    // ⇒ fail-open 静默放行，26 条取消卡产物原样回来（边界用例实测过）。故此处一并守上游。
    expect(src).toContain('await deps.taskStore.listByRequirement(requirementId)')
    expect(/assembleStageDetail\(req,\s*\{\s*tasks:\s*liveTasksOf/.test(src)).toBe(false)

    // 同一处泄漏的另一个落点（文档面板）也必须 import 同一单点，不得自留第二份判据
    const docsSrc = srcOf('src/application/query/QueryDocs.ts')
    expect(docsSrc).toContain("import { liveArtifactsOf } from './live-artifacts.js'")
    expect(docsSrc).not.toContain("status === 'canceled'")
  })

  it('边界（如实声明）：判据生效有两项前提——台账传**全量**、判据只看**路径形状**（与 kind 无关）', () => {
    const all = specimenTasks()
    const gone = canceledIds(all)

    // 前提一：台账传全量。传「已过滤台账」时，取消卡在判据眼里与「不存在的卡」不可区分
    // ⇒ fail-open 一律保留，26 条取消卡产物全部回来。这不是 bug，是单点刻意的取向
    //（认不出则保留，误删比漏删更坏），代价是**上游必须先传全量**——
    // 这条前提由上一个用例的源码锚点（`await deps.taskStore.listByRequirement(...)`）守住。
    const preFiltered = assembleStageDetail(
      specimenRequirement(), { tasks: liveTasksOf(all) }, 'implementing',
    )
    expect(canceledPathsIn(preFiltered.artifacts.map(a => a.path), gone)).toHaveLength(CANCELED)

    // 前提二：判据只认 `/tasks/<id>.md` 形状，**不看 kind**（比「任务卡文档」更宽的判据
    // 只会漏得更少；若哪天收窄成「仅 kind === 'task_detail'」，形态不符的产物就会回来）。
    const base = specimenRequirement()
    const disguised = req({
      ...base,
      artifacts: [
        ...(base.artifacts ?? []),
        {
          stage: 'implementing', kind: 'design',
          path: dir() + '/tasks/' + goneId(0) + '.md', registeredAt: 950, registeredBy: HUMAN,
        },
      ],
    })
    const detail = assembleStageDetail(disguised, { tasks: all }, 'implementing')
    expect(canceledPathsIn(detail.artifacts.map(a => a.path), gone)).toEqual([])
    // 同形状的活卡产物不受影响（判据是「命中已取消集」，不是「形状像就删」）
    const liveDetail = assembleStageDetail(
      specimenRequirement(), { tasks: all }, 'implementing',
    )
    expect(cardIdsIn(liveDetail.artifacts)).toHaveLength(LIVE)
  })
})
