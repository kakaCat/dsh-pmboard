/**
 * TC-2：活卡的唯一前置已取消 ⇒ **三处层号同台比对**、层号按活卡压实（REQ-261005193546-1b1a **t-74a5bd** / FR-1、FR-4）。
 *
 * ## 这张卡守的是什么
 * 设计 `design/test-cases.md` TC-2：三处层号（服务端 `liveLayers` / 「把指向取消卡的边删掉后
 * 手工重算」/ 客户端真正算层的 `stage-panel.topoLevels`）**逐卡相等**；活卡 A 的层号 `=== 0`
 * （**不是 1**——只删节点不剔边会得到 1）；A 仍在活卡集合里（不成孤岛）；层号按活卡压实、
 * 无「第 N 层 · 0 张」空层。
 *
 * ## 标本 S-1（132 = 106 活卡 + 26 已取消）
 * 依赖链刻意做成一条 106 长的链：`t-l000` 的**唯一前置是被取消的 `t-c000`**，`t-l{i} → t-l{i-1}`。
 * 于是同一份数据上同时存在两个可分辨的数：
 *   · **全量口径**（改前 / 旧 `topoLevels`）⇒ `t-l000` 落在第 1 层（前置在台账里、且被算了层号）；
 *   · **活卡口径**（改后）⇒ `t-l000` 落在第 **0** 层（指向取消卡的边被剪掉）。
 * 本用例把这**一对**数都断言出来（`=== 0` 与「全量口径 `=== 1`」），所以断言不是恒真：
 * 一旦剪边退化（只删节点不剔边、或 `topoLevels` 不再剪边），`=== 0` 那条当场变红。
 *
 * ## 逆验证（可执行，见末节源码锚点）
 * 实跑用的改坏方式（两处最小替换，恢复旧口径）：
 *   ① `const live = layerInputOf(tasks)` → `const live = tasks`；
 *   ② `const split = splitDependencyEdges(t, byId)` + `satisfied.concat(pending)` →
 *      `const present = Array.isArray(t.dependsOn) ? t.dependsOn : []`（不在场的前置按 `lv = 0` 计入 max）。
 * 结果：本文件 **5/7 条红**（含「A === 0」「三处逐卡相等」「压实」「源码锚点」），TC-3 / TC-4 保持全绿。
 * 已实跑并逐字节还原（md5 见任务汇报）。
 *
 * ## 口径声明
 * - 取消卡一律用 `status === 'canceled'` **字面量**数（用被测单点验被测单点 = 自证）。
 * - `computeLayers`（写路径的分层实现）在本文件里当「手工重算」的算法用；它与 `liveLayers`
 *   的**唯一**差别在输入：本文件**手工**剔边（不经 `layerInputOf`），故两侧不是同一份代码路径。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { req, task } from './application/harness.js'
import { assembleStageDetail } from '../src/application/query/index.js'
import { computeLayers } from '../src/domain/queue/topology.js'
import type { QueueTask } from '../src/domain/queue/QueueTypes.js'
import { liveLayers, liveTasksOf } from '../src/domain/status/Predicates.js'
import { renderStagePanel, topoLevels } from '../src/client/stage-panel.js'
import { dagPanel } from '../src/client/views/panels/dag.js'
import type { DagGraphNode, RequirementRecord, StageArtifact, TaskRecord } from '../src/shared/protocol.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'

/* ───────────────────────────────────────────────────────── 标本 S-1（132 = 106 + 26） */

const REQ_ID = 'REQ-000106'
const LIVE = 106
const CANCELED = 26
const HUMAN = { kind: 'human' as const }
/**
 * 6 张在途（106 − 100）：`t-l000` 是「唯一前置已取消」的活卡 A，其余 5 张只是填充
 * ——让 `doneCount === 100` 与真标本一致。
 */
const NON_DONE: ReadonlyArray<TaskRecord['status']> = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'in_progress',
]

const pad3 = (n: number): string => String(n).padStart(3, '0')
const liveId = (i: number): string => 't-l' + pad3(i)
const goneId = (i: number): string => 't-c' + pad3(i)
/** 活卡 A：`todo`，唯一前置 = 已取消的 `t-c000`。 */
const A = liveId(0)
const X = goneId(0)
const dir = (): string => 'docs/requirements/' + REQ_ID

function specimenTasks(): TaskRecord[] {
  const live: TaskRecord[] = []
  for (let i = 0; i < LIVE; i += 1) {
    const status = i < NON_DONE.length ? NON_DONE[i]! : 'done'
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
    title: '分层标本（132 = 106 + 26）',
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

/* ───────────────────────────────────────────────────────── 量具 */

/** 取消卡 id 集合（字面量口径）。 */
const canceledIdsOf = (tasks: readonly TaskRecord[]): Set<string> =>
  new Set(tasks.filter(t => t.status === 'canceled').map(t => t.id))

/** `computeLayers` 要 `QueueTask`（多一个派生字段 `layer`）；本用例只读拓扑，`layer` 填占位值。 */
const queueShape = (tasks: readonly TaskRecord[]): QueueTask[] =>
  tasks.map(t => ({ ...t, layer: 0 }))

/** id → 层号（从 `computeLayers` 的层分组索引出来）。 */
function layerIndexOf(tasks: readonly TaskRecord[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const group of computeLayers(queueShape(tasks))) {
    for (const id of group.tasks) out.set(id, group.layer)
  }
  return out
}

/**
 * **手工「删边重算」**：自己把指向取消卡的边从 `dependsOn` 里删掉（不经 `layerInputOf`），
 * 再交给写路径同一套分层实现 `computeLayers` 重算。节点一个不删（26 张取消卡仍在图里）。
 */
function manualRecompute(tasks: readonly TaskRecord[]): Map<string, number> {
  const canceled = canceledIdsOf(tasks)
  return layerIndexOf(tasks.map(t => ({ ...t, dependsOn: (t.dependsOn ?? []).filter(d => !canceled.has(d)) })))
}

/** 客户端 `topoLevels` → id → 层号。 */
function clientLayerIndexOf(tasks: readonly TaskRecord[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const [lv, group] of topoLevels([...tasks])) {
    for (const t of group) out.set(t.id, lv)
  }
  return out
}

/** 拆「层标签 + 该层卡 id」（stage-panel 的 DAG 层级行）。 */
function stageLayersOf(html: string): { label: string; ids: string[] }[] {
  return [...html.matchAll(
    /<div class="dsh-pm-sn-dag-layer"><div class="dsh-pm-sn-dag-label">([^<]*)<\/div>([\s\S]*?)<\/div><\/div>/g,
  )].map(m => ({ label: m[1]!, ids: [...m[2]!.matchAll(/class="dsh-pm-sn-task-id">([^<]*)</g)].map(x => x[1]!) }))
}

/** 报告 Tab 的 DAG 摘要里的分层明细 `L{层} {n} 张`。 */
function layerEntriesOf(html: string): { layer: number; count: number }[] {
  const line = /data-dag-layers="1">分层：([^<]*)</.exec(html)?.[1]
  if (line === undefined) throw new Error('DAG 摘要里找不到 data-dag-layers')
  return [...line.matchAll(/L(\d+)\s+(\d+)\s*张/g)].map(m => ({ layer: Number(m[1]), count: Number(m[2]) }))
}

/** 「第 N 层 · 0 张」空层的探针（正对照用：喂一个手工造的坏字符串，它必须响）。 */
const hasEmptyLayer = (text: string): boolean => /L\d+\s+0\s*张|第 \d+ 层 · 0 张/.test(text)

describe('REQ-261005193546-1b1a TC-2：三处层号同台比对（服务端 / 手工删边重算 / 客户端 topoLevels）', () => {
  it('① 三处逐卡相等；A（唯一前置已取消）的层号 === 0，不是 1；A 仍在活卡集合里', () => {
    const all = specimenTasks()
    // 标本自检：132 张 = 106 活 + 26 取消，且 A 的唯一前置确实是被取消的那张
    expect(all).toHaveLength(LIVE + CANCELED)
    expect(all.filter(t => t.status === 'canceled')).toHaveLength(CANCELED)
    expect(all.find(t => t.id === A)?.dependsOn).toEqual([X])
    expect(canceledIdsOf(all).has(X)).toBe(true)

    const server = liveLayers(all)
    const manual = manualRecompute(all)
    const client = clientLayerIndexOf(all)

    // 三处都只见活卡（取消卡一个都不进层号表）
    expect(server.size).toBe(LIVE)
    expect(client.size).toBe(LIVE)
    for (const id of canceledIdsOf(all)) {
      expect(server.has(id), `取消卡 ${id} 进了服务端层号表`).toBe(false)
      expect(client.has(id), `取消卡 ${id} 进了客户端层号表`).toBe(false)
    }
    // 手工那份**没删节点**（132 个都在图里）——这正是「只删节点」与「只剔边」的分水岭
    expect(manual.size).toBe(LIVE + CANCELED)

    // 逐卡相等（活卡口径：手工那份只比活卡）
    for (const t of liveTasksOf(all)) {
      const s = server.get(t.id)
      const m = manual.get(t.id)
      const c = client.get(t.id)
      expect(s, `活卡 ${t.id} 在服务端层号表里缺席`).toBeDefined()
      expect(m, `活卡 ${t.id} 在手工重算表里缺席`).toBeDefined()
      expect(c, `活卡 ${t.id} 在客户端层号表里缺席`).toBeDefined()
      expect(m, `手工删边重算与服务端 liveLayers 不一致：${t.id}`).toBe(s)
      expect(c, `客户端 topoLevels 与服务端 liveLayers 不一致：${t.id}`).toBe(s)
    }

    // A：0（剪边成立），而不是 1（只删节点不剔边）
    expect(server.get(A)).toBe(0)
    expect(manual.get(A)).toBe(0)
    expect(client.get(A)).toBe(0)
    // A 仍在活卡集合里 ⇒ 不成孤岛
    expect(liveTasksOf(all).map(t => t.id)).toContain(A)
  })

  it('② 全量口径是可分辨的另一组数：同一份台账上 t-l000 === 1（证明 ① 的 === 0 不是恒真）', () => {
    const all = specimenTasks()
    const legacy = layerIndexOf(all) // 改前口径：不剔边、不剔节点
    expect(legacy.get(A), '全量口径下 A 应当被前置抬到第 1 层').toBe(1)
    expect(legacy.size).toBe(LIVE + CANCELED)
    // 改前/改后逐卡差：全量口径多出来的 26 张取消卡**占住了第 0 层**，整条活卡链被整体抬升 1 层
    //（唯一「凭空多一层」的病根形态）；A 由 1 变 0，其余 105 张各 +1
    const now = clientLayerIndexOf(all)
    for (const t of liveTasksOf(all)) {
      expect(legacy.get(t.id), `活卡 ${t.id} 的全量口径层号应当比活卡口径大 1`).toBe(now.get(t.id)! + 1)
    }
    expect(legacy.get(A)).toBe(1)
    expect(now.get(A)).toBe(0)
  })

  it('③ 「只删节点、没剔边」的半成品输入：topoLevels 自己剪边，A 仍在第 0 层', () => {
    const all = specimenTasks()
    const liveOnly = liveTasksOf(all)
    expect(liveOnly).toHaveLength(LIVE)
    // 半成品：节点已删（只剩活卡），但 A 的 dependsOn 里**仍留着**取消卡 id
    expect(liveOnly.find(t => t.id === A)?.dependsOn).toEqual([X])

    const layers = topoLevels(liveOnly)
    const flat = [...layers.values()].flat()
    expect(flat).toHaveLength(LIVE)
    expect(flat.map(t => t.id)).toContain(A)
    expect(layers.get(0)?.map(t => t.id)).toEqual([A])
    expect(layers.get(1)?.map(t => t.id)).toEqual([liveId(1)])
    expect(layers.get(1)?.some(t => t.id === A)).toBe(false)
  })

  it('④ 层号按活卡压实：0..105 连续、每层非空、层数与活卡数一致（无「第 N 层 · 0 张」空层）', () => {
    const all = specimenTasks()
    const layers = topoLevels(all)

    // 取消卡一条都不进任何一层；每层都非空；层号连续 0..105
    expect([...layers.values()].flat()).toHaveLength(LIVE)
    expect([...layers.values()].flat().filter(t => t.status === 'canceled')).toHaveLength(0)
    const indices = [...layers.keys()].sort((a, b) => a - b)
    expect(indices).toEqual(Array.from({ length: LIVE }, (_, i) => i))
    for (const [lv, group] of layers) expect(group.length, `第 ${lv} 层是空层`).toBeGreaterThan(0)

    // 服务端层号表同样压实（取值集合 == 客户端键集合）
    expect([...new Set(liveLayers(all).values())].sort((a, b) => a - b)).toEqual(indices)

    // 渲染出来的层标签：第 1 层 · 无依赖 / 第 2 层 / …（106 个标签、每个 1 张、逐层对齐链序）
    const panel = renderStagePanel(assembleStageDetail(specimenRequirement(), { tasks: all }, 'decomposing'))
    const rows = stageLayersOf(panel)
    expect(rows).toHaveLength(LIVE)
    expect(rows[0]!.label).toBe('第 1 层 · 无依赖')
    expect(rows[0]!.ids).toEqual([A])
    for (let i = 0; i < LIVE; i += 1) {
      // 第 0 层带「无依赖」后缀，其余层只报层号（本链每层恰好 1 张 ⇒ 不带「N 个可并行」）
      expect(rows[i]!.label).toBe(i === 0 ? '第 1 层 · 无依赖' : '第 ' + (i + 1) + ' 层')
      expect(rows[i]!.ids).toEqual([liveId(i)])
    }
    expect(hasEmptyLayer(panel)).toBe(false)
  })

  it('⑤ 报告 Tab 的 DAG 摘要：分层明细连续、无 0 张层；「0 张」探针本身可失败（正对照）', () => {
    const all = specimenTasks()
    const ctx: ReportTabCtx = {
      requirementId: REQ_ID,
      load: () => Promise.reject(new Error('渲染路径不该取数（取数归壳）')),
      openDoc: () => { /* 渲染不开正文 */ },
    }
    const nodesOf = (tasks: readonly TaskRecord[]): DagGraphNode[] =>
      tasks.map(t => ({ id: t.id, title: t.title, status: t.status, dependsOn: [...(t.dependsOn ?? [])] }))

    // 生产调用形态：客户端拿到的是 /state 的活卡载荷
    const liveHtml = dagPanel.render({ tasks: nodesOf(liveTasksOf(all)), steps: [] }, ctx)
    expect(liveHtml).toContain('data-dag-task-count="106"')
    expect(liveHtml).toContain('data-dag-layer-count="106"')
    const entries = layerEntriesOf(liveHtml)
    expect(entries).toHaveLength(LIVE)
    expect(entries.map(e => e.layer)).toEqual(Array.from({ length: LIVE }, (_, i) => i))
    for (const e of entries) expect(e.count, `L${e.layer} 是空层`).toBe(1)
    expect(hasEmptyLayer(liveHtml)).toBe(false)

    // 正对照 1：喂**未过滤**的 132 张节点 ⇒ 取消卡进层（L0 26 张）、层号被抬到 107 层
    //（A 的前置 t-c000 在场 ⇒ A 落在第 2 层）——证明这一面对输入口径敏感，不是恒等于 106
    const rawHtml = dagPanel.render({ tasks: nodesOf(all), steps: [] }, ctx)
    expect(rawHtml).toContain('data-dag-task-count="132"')
    expect(rawHtml).toContain('data-dag-layer-count="107"')
    expect(layerEntriesOf(rawHtml)[0]).toEqual({ layer: 0, count: CANCELED })

    // 正对照 2：探针自己会响（喂一句手工造的「L3 0 张」必须被 hasEmptyLayer 抓到）
    expect(hasEmptyLayer('分层：L0 26 张 / L1 1 张 / L3 0 张')).toBe(true)
    expect(hasEmptyLayer('分层：L0 26 张 / L1 1 张')).toBe(false)
  })
})

/* ───────────────────────────────────────────────────────── 逆验证锚点（可执行化） */

describe('REQ-261005193546-1b1a TC-2：剪边必须真的落在「算层的两处」里（删掉即红）', () => {
  /** 与本仓既有面板用例同款：直接读源文本做机械锚点（行为断言在上一组）。 */
  const srcOf = (rel: string): string => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')

  it('stage-panel.topoLevels：输入先过 layerInputOf、逐条依赖走 splitDependencyEdges；旧写法（不在场前置当 0 计入 max）已不存在', () => {
    const src = srcOf('src/client/stage-panel.ts')
    expect(src).toContain('const live = layerInputOf(tasks)')
    expect(src).toContain('const split = splitDependencyEdges(t, byId)')
    expect(src).not.toContain('Math.max(...t.dependsOn.map(d => lv(d)))')
  })

  it('domain 单点：liveLayers 的分层输入是 layerInputOf（剔边后再 computeLayers）', () => {
    const src = srcOf('src/domain/status/Predicates.ts')
    expect(src).toContain('computeLayers(layerInputOf(tasks)')
  })
})
