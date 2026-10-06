/**
 * TC-10：文档面板 —— 不列取消卡的任务卡文档，不变量按**活卡口径**成立
 * （REQ-261005193546-1b1a t12 / FR-5 / A3）。
 *
 * ## 标本 S-7（S-1 的产物登记原样，**一条都不删**）+ 三条 fail-open 边界
 * | 产物 | 路径形状 | 期望 |
 * |---|---|---|
 * | 活卡任务卡 ×106 | `<REQ>/tasks/t-l###.md` | `documents`（活卡口径的台账来源行） |
 * | **取消卡任务卡 ×26** | `<REQ>/tasks/t-g###.md` | **`documents` 与 `discovered` 两侧都不出现**（不补偿性塞回 `discovered`） |
 * | 取消卡名下的**非任务卡**产物 ×2 | `<REQ>/rtm-implementing/t-g###.yml` | **保留**（A3 只认 `/tasks/<id>.md` 这一种形状） |
 * | **台账没有这张卡**的产物 ×1 | `<REQ>/tasks/t-unknown.md` | **保留**（读不到队列 ≠ 已取消；不猜） |
 * | 任务改动文件 ×1 | `src/foo.ts` | 保留（`discovered` 的 `ts` 组） |
 *
 * ## 三条判据（缺一条就会假绿）
 * ① `documents` / `discovered` 两侧取消卡任务卡 `=== 0`（计数与样例两侧都查——"塞回去"最爱藏在样例里）；
 * ② 恒等式按**活卡口径**：`documents 台账来源行数 + Σ discovered[].count === artifacts.length − 取消卡名下产物条数`
 *    （按全量产物对账永远对不上：那是设计缺陷，不是用例失败——假红防线 2）；
 * ③ `data-doc-row` 条数 `=== documents.length`（既有锚点不许破），磁盘 26 份卡文档仍在。
 *
 * 标本一律走**临时工作区**：真磁盘那份用 `FileDocRepository` 指到 `mkdtempSync` 的根，
 * 生产 `docs/requirements/**` 一个字节都不写。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeHarness, req, task, type Harness } from './application/harness.js'
import { isDegrade, type DocsResponse, type PanelResult, type RequirementRecord, type StageArtifact, type TaskRecord } from '../src/shared/protocol.js'
import { queryDocs } from '../src/application/query/QueryDocs.js'
import {
  canceledIdsOf,
  isArtifactOfCanceledTask,
  liveArtifactsOf,
} from '../src/application/query/live-artifacts.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { liveTasksOf } from '../src/domain/status/Predicates.js'
import { docsPanel } from '../src/client/views/panels/docs.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'
import type { DocRepository } from '../src/application/ports.js'

const REQ_ID = 'REQ-000106'
const WINDOW = 'session-w-106'
const HUMAN = { kind: 'human' as const }
const NOW = 5_000_000
const LIVE = 106
const CANCELED = 26
const DONE = 100
const NON_DONE: ReadonlyArray<TaskRecord['status']> = [
  'todo', 'in_progress', 'integrating', 'testing', 'in_review', 'in_progress',
]
const DIR = 'docs/requirements/' + REQ_ID
/** 认不出的卡（台账里没有这张卡）：fail-open 必须保留。 */
const UNKNOWN_ID = 't-unknown'
const ACCEPTANCE = 'npx vitest run tests/canceled-docs-panel.test.ts 全绿'

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

/**
 * S-7 产物登记（**原样**，一份都不删）+ 三条 fail-open 边界。
 *
 * `t-unknown`（台账无此卡）与两条 `rtm-implementing/t-g###.yml`（非任务卡形状）**必须留下**：
 * A3 的剔除形状只有 `/tasks/<已知取消卡>.md` 一种；把剔除悄悄扩成"取消卡名下的一切产物"
 * 会误删真东西（本仓纪律：**认不出 → 保留**，不猜）。
 */
function specimenArtifacts(): StageArtifact[] {
  const out: StageArtifact[] = []
  for (let i = 0; i < LIVE; i += 1) {
    out.push({
      stage: 'implementing', kind: 'task_detail',
      path: DIR + '/tasks/' + liveId(i) + '.md', registeredAt: 100 + i, registeredBy: HUMAN,
    })
  }
  for (let i = 0; i < CANCELED; i += 1) {
    out.push({
      stage: 'implementing', kind: 'task_detail',
      path: DIR + '/tasks/' + goneId(i) + '.md', registeredAt: 200 + i, registeredBy: HUMAN,
    })
  }
  // fail-open ①：取消卡名下的**非**任务卡产物（形状不匹配 ⇒ 保留，进 discovered）
  out.push({
    stage: 'implementing', kind: 'task_output',
    path: DIR + '/rtm-implementing/' + goneId(0) + '.yml', registeredAt: 300, registeredBy: HUMAN,
  })
  out.push({
    stage: 'implementing', kind: 'task_output',
    path: DIR + '/rtm-implementing/' + goneId(1) + '.yml', registeredAt: 301, registeredBy: HUMAN,
  })
  // fail-open ②：**台账没有这张卡**的任务卡文档（认不出 ⇒ 保留，进 documents）
  out.push({
    stage: 'implementing', kind: 'task_detail',
    path: DIR + '/tasks/' + UNKNOWN_ID + '.md', registeredAt: 302, registeredBy: HUMAN,
  })
  // 非交付物（任务改动文件）⇒ discovered 的 ts 组
  out.push({
    stage: 'implementing', kind: 'task_output',
    path: 'src/foo.ts', registeredAt: 303, registeredBy: HUMAN,
  })
  return out
}

function specimenRequirement(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_ID,
    title: '文档面板标本（S-7：132 = 106 活卡 + 26 已取消）',
    category: 'feature',
    status: 'implementing',
    sourceSessionId: WINDOW,
    artifacts: specimenArtifacts(),
    ...over,
  })
}

function depsOf(h: Harness, docs: DocRepository = h.docs): PanelQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session,
    docs,
    now: () => NOW,
  }
}

/** 非降级断言（降级信封当场失败，否则后面全是 undefined 噪声）。 */
function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason + ' / ' + value.note)
  return value
}

/** `documents` 里**来自台账产物**的那些行（排除 `unregistered` 的设计文档行：它们台账里没有记录）。 */
function ledgerRows<T extends { path: string }>(documents: readonly T[], artifacts: readonly StageArtifact[]): T[] {
  return documents.filter(d => artifacts.some(a => a.path === d.path))
}

const TASK_CARD_OF_CANCELED = /\/tasks\/(t-g\d+)\.md$/

const ctx: ReportTabCtx = {
  requirementId: REQ_ID,
  load: () => Promise.reject(new Error('渲染路径不该取数')),
  openDoc: () => { throw new Error('渲染路径不该开正文') },
}

async function seed(): Promise<Harness> {
  const h = makeHarness({ requirements: [specimenRequirement()], tasks: [] })
  await h.addTasks(REQ_ID, specimenTasks())
  for (const a of specimenArtifacts()) h.docs.put(a.path, '# ' + a.path)
  return h
}

/* ───────────────────────────────────────────────── 临时工作区（真磁盘） */

const roots: string[] = []
afterEach(() => { for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true }) })

function newRoot(tag: string): string {
  const root = mkdtempSync(join(tmpdir(), 'pmboard-docs-' + tag + '-'))
  roots.push(root)
  return root
}

/** 真落盘：`requirement.md` + 132 份任务卡 + 两条取消卡名下的 yml + 认不出的那份卡。 */
function seedWorkspace(root: string): void {
  const dir = join(root, DIR)
  mkdirSync(join(dir, 'tasks'), { recursive: true })
  mkdirSync(join(dir, 'rtm-implementing'), { recursive: true })
  writeFileSync(join(dir, 'requirement.md'), ['# 需求说明', '', '**FR-1: 文档面板**', ''].join('\n'))
  writeFileSync(join(dir, 'verification.md'), ['## 测试证据', '', '- covers: ' + liveIds().join(' '), ''].join('\n'))
  for (const id of [...liveIds(), ...goneIds(), UNKNOWN_ID]) {
    writeFileSync(join(dir, 'tasks', id + '.md'), '# 任务卡 ' + id + '\n')
  }
  for (const id of [goneId(0), goneId(1)]) {
    writeFileSync(join(dir, 'rtm-implementing', id + '.yml'), 'metadata:\n  task: ' + id + '\n')
  }
}

const sha256Of = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

/* ═══════════════════════════════ ① 两侧都不含取消卡，恒等式按活卡口径 ═══════════════════════ */

describe('TC-10 · 文档面板：取消卡任务卡两侧都不出现（A3）', () => {
  it('① documents / discovered 两侧取消卡任务卡 === 0（计数与样例都查）', async () => {
    const h = await seed()
    const res: DocsResponse = ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))

    // documents 侧
    expect(res.documents.filter(d => TASK_CARD_OF_CANCELED.test(d.path))).toHaveLength(0)
    expect(goneIds().filter(id => res.documents.some(d => d.path.includes(id)))).toEqual([])
    // discovered 侧（**不补偿性塞回去**：样例里塞一条也会被抓到）
    const discovered = res.discovered ?? []
    expect(discovered.flatMap(g => g.samples).filter(p => TASK_CARD_OF_CANCELED.test(p))).toHaveLength(0)
    expect(discovered.filter(g => g.kind === 'md')).toHaveLength(0)

    // 活卡侧该在的都在（否则上面的"0 条"可能只是整块空了）
    expect(ledgerRows(res.documents, specimenArtifacts())).toHaveLength(LIVE + 1) // 106 活卡 + t-unknown
  })

  it('② 恒等式（活卡口径）：documents 台账来源行数 + Σ discovered.count === artifacts.length − 取消卡名下产物条数', async () => {
    const h = await seed()
    const artifacts = specimenArtifacts()
    const res: DocsResponse = ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))

    // 「取消卡名下产物条数」= A3 的剔除量：**只有** `/tasks/<已知取消卡>.md` 这一种形状
    const canceledOwned = artifacts.filter(a => TASK_CARD_OF_CANCELED.test(a.path))
    expect(canceledOwned).toHaveLength(CANCELED)

    const discovered = res.discovered ?? []
    const fromLedger = ledgerRows(res.documents, artifacts)
    expect(fromLedger.length + discovered.reduce((n, g) => n + g.count, 0))
      .toBe(artifacts.length - canceledOwned.length)

    // 两侧同源同改的量化形式：discovered 覆盖「活卡口径清单 − 确定文档」
    const deliverable = fromLedger.length
    expect(discovered.reduce((n, g) => n + g.count, 0))
      .toBe(artifacts.length - canceledOwned.length - deliverable)
  })

  it('③ fail-open（面板级）：取消卡名下的非任务卡产物与「台账没有这张卡」的产物都保留', async () => {
    const h = await seed()
    const res: DocsResponse = ok(await queryDocs(depsOf(h), { requirementId: REQ_ID }))

    // ①② 非任务卡形状 ⇒ 进 discovered（yml 组 2 条，一条都没被"顺手删掉"）
    const yml = (res.discovered ?? []).find(g => g.kind === 'yml')
    expect(yml?.count).toBe(2)
    expect(yml?.samples).toContain(DIR + '/rtm-implementing/' + goneId(0) + '.yml')
    // ③ 台账无此卡 ⇒ 保留在 documents（**认不出 → 保留**，不猜"它是不是已取消"）
    expect(res.documents.some(d => d.path === DIR + '/tasks/' + UNKNOWN_ID + '.md')).toBe(true)
    // ts 组照旧（任务改动文件不是交付物，但也不许消失）
    expect((res.discovered ?? []).find(g => g.kind === 'ts')?.count).toBe(1)
  })

  it('④ fail-open（纯函数级）：`liveArtifactsOf` 只剔「已知取消卡 × /tasks/<id>.md」这一种', () => {
    const tasks = specimenTasks()
    const canceledIds = canceledIdsOf(tasks)
    expect([...canceledIds].sort()).toEqual([...goneIds()].sort())

    const paths = [
      DIR + '/tasks/' + goneId(0) + '.md', // 已知取消卡的任务卡 ⇒ **剔**
      DIR + '/tasks/' + liveId(0) + '.md', // 活卡 ⇒ 留
      DIR + '/tasks/' + UNKNOWN_ID + '.md', // 台账无此卡 ⇒ 留（认不出）
      DIR + '/rtm-implementing/' + goneId(0) + '.yml', // 非任务卡形状 ⇒ 留
      DIR + '/tasks/' + goneId(0) + '.md.bak', // 尾部不是 .md ⇒ 留
      DIR + '/tasks/.md', // 卡 id 为空 ⇒ 留
      DIR + '/tasks', // 不是文件 ⇒ 留
    ]
    const kept = liveArtifactsOf(paths.map(p => ({ path: p })), tasks).map(a => a.path)
    expect(kept).toEqual(paths.filter(p => p !== DIR + '/tasks/' + goneId(0) + '.md'))

    // 单条判据同源（两个入口共用一份定义）
    expect(isArtifactOfCanceledTask(DIR + '/tasks/' + goneId(0) + '.md', canceledIds)).toBe(true)
    expect(isArtifactOfCanceledTask(DIR + '/tasks/' + liveId(0) + '.md', canceledIds)).toBe(false)
    expect(isArtifactOfCanceledTask(DIR + '/tasks/' + UNKNOWN_ID + '.md', canceledIds)).toBe(false)
    expect(isArtifactOfCanceledTask(DIR + '/rtm-implementing/' + goneId(0) + '.yml', canceledIds)).toBe(false)
    // 全量取消（活卡 0 张）时，判据仍只认"命中已知取消集"，不把未知 id 当取消
    const allCanceled: TaskRecord[] = tasks.map(t => ({ ...t, status: 'canceled' as const }))
    const allIds = canceledIdsOf(allCanceled)
    expect(isArtifactOfCanceledTask(DIR + '/tasks/' + UNKNOWN_ID + '.md', allIds)).toBe(false)
    expect(liveArtifactsOf([{ path: DIR + '/tasks/' + UNKNOWN_ID + '.md' }], allCanceled)).toHaveLength(1)
  })
})

/* ═════════════════════════════ ② data-doc-row 恒等式 + 磁盘 26 份仍在 ═══════════════════════ */

describe('TC-10 · 面板渲染与磁盘（真文件系统，临时根）', () => {
  it('`data-doc-row` 条数 === documents.length；磁盘 26 份卡文档仍在且内容哈希不变', async () => {
    const h = await seed()
    const root = newRoot('disk')
    seedWorkspace(root)
    const docs = new FileDocRepository({ workspaceRoot: root })
    const deps = depsOf(h, docs)

    const res: DocsResponse = ok(await queryDocs(deps, { requirementId: REQ_ID }))

    // ① 既有锚点不破：一行一 `data-doc-row`，条数恒等于 documents.length（文档行不折叠、不省略）
    const html = docsPanel.render(res, ctx)
    expect((html.match(/data-doc-row="1"/g) ?? [])).toHaveLength(res.documents.length)
    expect(res.documents.length).toBeGreaterThan(0)
    // 面板文本里不该出现取消卡的**任务卡文档**（`rtm-implementing/t-g###.yml` 属 fail-open 保留，
    // 它的路径里带取消卡 id 是**对的**——A3 只剔 `/tasks/<id>.md` 这一种形状）
    expect(html.match(/tasks\/t-g\d+\.md/g) ?? []).toEqual([])

    // ② 磁盘：26 份取消卡文档一份不删、一字不改（INV-3：审计靠磁盘与台账，不靠面板）
    const canceledPaths = goneIds().map(id => join(root, DIR, 'tasks', id + '.md'))
    canceledPaths.forEach(p => expect(existsSync(p), p + ' 不该消失').toBe(true))
    const hashes = canceledPaths.map(sha256Of)
    expect(hashes).toHaveLength(CANCELED)
    // 自检：26 份内容各不相同，哈希比对不是恒真
    expect(new Set(hashes).size).toBe(CANCELED)
    // 读路径再跑一遍（面板 + 真文件系统），哈希仍不变
    docsPanel.render(ok(await queryDocs(deps, { requirementId: REQ_ID })), ctx)
    expect(canceledPaths.map(sha256Of)).toEqual(hashes)
    // 活卡那 106 份也在（磁盘不是"整目录被清"）
    expect(liveIds().every(id => existsSync(join(root, DIR, 'tasks', id + '.md')))).toBe(true)
    expect(liveTasksOf(await h.tasksOf(REQ_ID))).toHaveLength(LIVE)
  })
})

/* ═══════════════════════════════ ③ 源码锚点（逆验证可执行化） ═══════════════════════════════ */

describe('TC-10 · 逆验证锚点：两侧同源同改（面板不过滤 ⇒ 本文件红）', () => {
  it('`QueryDocs` 的产物清单只过单点一次，`documents` 与 `discovered` 共用同一份', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/application/query/QueryDocs.ts', import.meta.url)), 'utf8',
    )
    // 改回 `req.artifacts ?? []`（不过滤）⇒ 本文件 ①②③ 同时红
    expect(src).toContain('const artifacts = liveArtifactsOf(req.artifacts ?? [], tasks)')
    // 两侧从**同一份** artifacts 分岔（补偿性塞回 discovered 会让恒等式对不上）
    expect(src).toContain('const discovered = discoveredOf(artifacts, reqId)')
    expect(src).toContain('const deliverables = artifacts.filter(a => isDeliverableDocPath(reqId, a.path))')
    // 剔除形状只有一处定义（不在本文件里再写一份 /\\/tasks\\//）
    expect(src).not.toContain('TASK_CARD_DOC_RE =')
  })
})
