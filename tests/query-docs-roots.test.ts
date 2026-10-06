/**
 * 多候选读根判定单测（REQ-261005143615-5ab1 · t-ac64a2 / serves: FR-1, FR-2, FR-3, FR-4）。
 *
 * 这一卡要钉住的就是**四句话**（对应 design/test-cases.md 的 TC-1…TC-4）：
 *   ① 需求根命中（会话根为空目录）→ 状态如实、`absPath` 以**需求根**开头、没有一条 file-missing；
 *   ② 需求根缺、会话根有 → 命中会话根，`absPath` 以会话根开头（不硬认需求根）；
 *   ③ 根可用而文件确实不在 → 仍是 `file-missing`（诚实缺失，不许被 unknown 掩盖）；
 *   ④ 一个可用根都没有 → 全部 `unknown`，且**不注入** `absPath`。
 *
 * 全部用假根 + 假仓储：不碰真盘、不依赖运行环境的工作区。
 *
 * @module dsh-pmboard/tests/query-docs-roots
 */
import { describe, it, expect } from 'vitest'
import { FakeDocs, makeHarness, type Harness } from './application/harness.js'
import { queryDocs } from '../src/application/query/QueryDocs.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import {
  isDegrade,
  type ActorRef,
  type PanelResult,
  type RequirementRecord,
  type StageArtifact,
} from '../src/shared/protocol.js'
import type { DocRepository } from '../src/application/ports.js'

const REQ_ID = 'REQ-5ab1aa'
const DIR = 'docs/requirements/' + REQ_ID
const REQ_ROOT = '/work/需求仓'
const SESSION_ROOT = '/work/看板会话的工作区'
const HUMAN: ActorRef = { kind: 'human' }

/* --------------------------------------------------------------- 夹具 */

/** 带可辨识根的文档仓储：`resolve` 把根拼在相对路径前（真实现就是 `join(root, rel)`）。 */
class RootDocs extends FakeDocs {
  private readonly root: string
  constructor(root: string) {
    super()
    this.root = root
  }
  override resolve(relPath: string): string {
    return this.root + '/' + relPath
  }
  override workspaceRoot(): string {
    return this.root
  }
}

/** 最小需求：`category` 缺省 → 不出「分类要求但未登记」的设计行，用例只盯台账产物那一侧。 */
function makeReq(artifacts: StageArtifact[], category?: RequirementRecord['category']): RequirementRecord {
  return {
    id: REQ_ID,
    title: '详情页判文件在不在：按需求自己的根',
    description: 'd',
    ...(category === undefined ? {} : { category }),
    status: 'archived',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1_000,
    updatedAt: 2_000,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    statusHistory: [{ status: 'archived', at: 2_000, by: HUMAN }],
    artifacts,
  }
}

function artifact(kind: StageArtifact['kind'], path: string, confirmed = false): StageArtifact {
  return {
    stage: kind === 'design' ? 'design' : 'brainstorming',
    kind,
    path,
    registeredAt: 1_100,
    registeredBy: HUMAN,
    ...(confirmed ? { confirmedAt: 1_200, confirmedBy: HUMAN } : {}),
  }
}

/** 三条台账产物：需求文档（已落章）+ 设计文档（待确认）+ 计划。 */
function threeArtifacts(): StageArtifact[] {
  return [
    artifact('requirement', DIR + '/requirement.md', true),
    artifact('design', DIR + '/design/architecture.md'),
    artifact('plan', DIR + '/decomposition.md'),
  ]
}

/**
 * 组装依赖：`docs` 仍是会话根那一份（旧口径），另加本轮新装配的两口。
 * `roots` 就是 `docRootsOf` 的返回（调用方已按序、去重、滤掉不存在的根）。
 */
function depsWithRoots(
  h: Harness,
  roots: readonly string[],
  repos: ReadonlyMap<string, DocRepository>,
): PanelQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session,
    docs: repos.get(SESSION_ROOT) ?? new RootDocs(SESSION_ROOT),
    docRootsOf: () => [...roots],
    docsAt: (root) => repos.get(root) ?? new RootDocs(root),
  }
}

function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason + ' / ' + value.note)
  return value
}

/** 跑一次查询，返回文档行（`documents` 里只留台账产物那些行）。 */
async function rowsOf(roots: readonly string[], repos: ReadonlyMap<string, DocRepository>, category?: RequirementRecord['category']) {
  const h = makeHarness({ requirements: [makeReq(threeArtifacts(), category)] })
  const res = ok(await queryDocs(depsWithRoots(h, roots, repos), { requirementId: REQ_ID }))
  return res.documents
}

/** 造一个「根里有这些文件」的文档仓储（`RootDocs(root)` + `put`，给用例按需拼装）。 */
function rootWith(root: string, files: readonly string[]): RootDocs {
  const d = new RootDocs(root)
  for (const f of files) d.put(f)
  return d
}

/* --------------------------------------------------------------- TC-1 需求根命中 */

describe('TC-1 需求根命中：会话根为空目录也照样判对（FR-1/FR-4）', () => {
  it('三条产物全在需求根 → 状态如实、absPath 以需求根开头、file-missing 计数 0', async () => {
    const reqDocs = rootWith(REQ_ROOT, threeArtifacts().map(a => a.path))
    const repos = new Map<string, DocRepository>([[REQ_ROOT, reqDocs], [SESSION_ROOT, new RootDocs(SESSION_ROOT)]])

    const rows = await rowsOf([REQ_ROOT, SESSION_ROOT], repos)
    expect(rows).toHaveLength(3)
    expect(rows.filter(r => r.state === 'file-missing')).toHaveLength(0)
    expect(rows.filter(r => r.state === 'unknown')).toHaveLength(0)
    expect(rows.map(r => r.state).sort()).toEqual(['confirmed', 'pending', 'pending'])
    for (const r of rows) expect(r.absPath).toBe(REQ_ROOT + '/' + r.path)
  })
})

/* --------------------------------------------------------------- TC-2 会话根回退 */

describe('TC-2 需求根缺、会话根有：命中会话根（FR-2）', () => {
  it('文件只在会话根 → 状态为在盘态，absPath 以会话根开头（不硬认需求根）', async () => {
    const sessionDocs = rootWith(SESSION_ROOT, threeArtifacts().map(a => a.path))
    const repos = new Map<string, DocRepository>([[REQ_ROOT, new RootDocs(REQ_ROOT)], [SESSION_ROOT, sessionDocs]])

    const rows = await rowsOf([REQ_ROOT, SESSION_ROOT], repos)
    expect(rows.filter(r => r.state === 'file-missing')).toHaveLength(0)
    for (const r of rows) expect(r.absPath).toBe(SESSION_ROOT + '/' + r.path)
  })
})

/* --------------------------------------------------------------- TC-3 诚实缺失 */

describe('TC-3 根可用而文件确实不在：仍是 file-missing（FR-3）', () => {
  it('两个可用根都没有该文件 → file-missing，且不注入 absPath（不许被 unknown 掩盖）', async () => {
    const repos = new Map<string, DocRepository>([[REQ_ROOT, new RootDocs(REQ_ROOT)], [SESSION_ROOT, new RootDocs(SESSION_ROOT)]])

    const rows = await rowsOf([REQ_ROOT, SESSION_ROOT], repos)
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect(r.state).toBe('file-missing')
      expect('absPath' in r).toBe(false)
    }
  })
})

/* --------------------------------------------------------------- TC-4 未判定 */

describe('TC-4 一个可用根都没有：全部 unknown 且无 absPath（FR-3）', () => {
  it('候选根为空 → 台账产物逐行 unknown、不注入 absPath', async () => {
    const repos = new Map<string, DocRepository>()
    const rows = await rowsOf([], repos)
    expect(rows).toHaveLength(3)
    for (const r of rows) {
      expect(r.state).toBe('unknown')
      expect('absPath' in r).toBe(false)
    }
  })

  it('未登记的设计文档行同规则：根全不可用 → unknown（不是 file-missing）', async () => {
    const repos = new Map<string, DocRepository>()
    const rows = await rowsOf([], repos, 'feature')
    const designRows = rows.filter(r => r.kind === 'design' && r.path.includes('/design/'))
    expect(designRows.length).toBeGreaterThan(0)
    for (const r of designRows) expect(r.state).toBe('unknown')
  })
})

/* --------------------------------------------------------------- 旧接线（缺省） */

describe('两口缺省 = 旧单根行为（FR-5 的兼容面）', () => {
  it('不注入 docRootsOf/docsAt → 无 unknown、无 absPath（既有接线逐字不变）', async () => {
    const h = makeHarness({ requirements: [makeReq(threeArtifacts())] })
    const sessionDocs = rootWith(SESSION_ROOT, threeArtifacts().map(a => a.path))
    const res = ok(await queryDocs({
      store: h.store,
      tasks: h.taskStore,
      injections: { readAll: async () => [] },
      sessions: h.session,
      docs: sessionDocs,
    }, { requirementId: REQ_ID }))

    expect(res.documents).toHaveLength(3)
    for (const r of res.documents) {
      expect(r.state).not.toBe('unknown')
      expect('absPath' in r).toBe(false)
    }
  })
})
