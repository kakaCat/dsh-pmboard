// serves: FR-5
/**
 * 兼容与回滚单测（REQ-261005143615-5ab1 · t-1b4e66）。
 *
 * 本卡只钉**一条不变量**：新能力（多候选读根 / `unknown` / `absPath`）**只在两口都装配时生效**；
 * 任一未装配 → 逐字段回到改造前的单根行为。回滚路径因此是「不注入两口」，台账零迁移。
 *
 * 三个用例：
 *   ① 只有 `docs`（旧接线）→ 在盘态照旧、缺失照旧 `file-missing`（**不是** `unknown`）、无 `absPath`；
 *   ② 只装配一半（有 `docRootsOf` 没 `docsAt`）→ 与①逐字段相同（半个端口不算装配）；
 *   ③ 老形状读侧（客户端）拿到 `unknown` 不抛错，且文案说得清「未判定」。
 *
 * @module dsh-pmboard/tests/query-docs-compat
 */
import { describe, it, expect } from 'vitest'
import { FakeDocs, makeHarness } from './application/harness.js'
import { queryDocs } from '../src/application/query/QueryDocs.js'
import { docsPanel } from '../src/client/views/panels/docs.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'
import {
  isDegrade,
  type ActorRef,
  type DocPanelEntry,
  type DocsResponse,
  type PanelResult,
  type RequirementRecord,
  type StageArtifact,
} from '../src/shared/protocol.js'

const REQ_ID = 'REQ-5ab1cc'
const DIR = 'docs/requirements/' + REQ_ID
const HUMAN: ActorRef = { kind: 'human' }

function makeReq(artifacts: StageArtifact[]): RequirementRecord {
  return {
    id: REQ_ID,
    title: '两口缺省即回旧行为',
    description: 'd',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1_000,
    updatedAt: 2_000,
    createdBy: HUMAN,
    updatedBy: HUMAN,
    artifacts,
  }
}

function art(kind: StageArtifact['kind'], path: string): StageArtifact {
  return { stage: 'implementing', kind, path, registeredAt: 1_100, registeredBy: HUMAN }
}

/** 三份产物：两份在盘、一份不在（用它钉住 "缺失仍缺失"）。 */
function artifacts(): StageArtifact[] {
  return [
    art('requirement', DIR + '/requirement.md'),
    art('design', DIR + '/design/architecture.md'),
    art('plan', DIR + '/decomposition.md'),
  ]
}

function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason + ' / ' + value.note)
  return value
}

/** 造一份「只有 docs 端口」的旧接线依赖（`extra` 用来试"只装配一半"）。 */
function legacyDeps(docs: FakeDocs, extra: Partial<PanelQueryDeps> = {}): PanelQueryDeps {
  const h = makeHarness({ requirements: [makeReq(artifacts())] })
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session,
    docs,
    ...extra,
  }
}

/** 旧接线下的文档端口：两份在盘、plan 不在。 */
function legacyDocs(): FakeDocs {
  const docs = new FakeDocs()
  for (const a of artifacts()) {
    if (a.kind !== 'plan') docs.put(a.path)
  }
  docs.put(DIR + '/queue.json')
  return docs
}

/** 只留 `documents` 里来自台账的那些行（`unregistered` 设计行受分类策略影响，本卡不关心）。 */
function ledgerRows(res: DocsResponse): DocPanelEntry[] {
  const paths = new Set(artifacts().map(a => a.path))
  return res.documents.filter(d => paths.has(d.path))
}

describe('① 旧接线（只有 docs）：逐字段回改造前行为', () => {
  it('在盘 → 在盘态；不在 → file-missing（不是 unknown）；处处无 absPath', async () => {
    const res = ok(await queryDocs(legacyDeps(legacyDocs()), { requirementId: REQ_ID }))
    const rows = ledgerRows(res)
    expect(rows).toHaveLength(3)
    expect(rows.find(r => r.path.endsWith('requirement.md'))?.state).toBe('pending')
    expect(rows.find(r => r.path.endsWith('decomposition.md'))?.state).toBe('file-missing')
    for (const r of rows) {
      expect(r.state).not.toBe('unknown')
      expect('absPath' in r).toBe(false)
    }
    // 生成物在旧接线里也**不带** absPath（新增字段只在多根装配时注入）
    expect(res.generated.length).toBeGreaterThan(0)
    for (const g of res.generated) expect('absPath' in g).toBe(false)
  })
})

describe('② 只装配一半：与旧接线逐字段相同（半个端口不算装配）', () => {
  it('有 docRootsOf 没 docsAt → 仍走单根：无 unknown、无 absPath', async () => {
    const res = ok(await queryDocs(
      legacyDeps(legacyDocs(), { docRootsOf: () => ['/work/需求仓'] }),
      { requirementId: REQ_ID },
    ))
    const rows = ledgerRows(res)
    expect(rows.find(r => r.path.endsWith('decomposition.md'))?.state).toBe('file-missing')
    for (const r of rows) {
      expect(r.state).not.toBe('unknown')
      expect('absPath' in r).toBe(false)
    }
  })
})

describe('③ 老形状读侧：拿到 unknown 不抛错，文案说「未判定」', () => {
  it('渲染含 unknown 的载荷不抛，且不把它画成「文件缺失」', () => {
    const ctx: ReportTabCtx = {
      requirementId: REQ_ID,
      load: () => Promise.reject(new Error('纯渲染不该取数')),
      openDoc: () => { /* 不开正文 */ },
    }
    const data: DocsResponse = {
      documents: [{ kind: 'design', path: DIR + '/design/architecture.md', state: 'unknown' }],
      generated: [],
      gates: [],
    }
    const html = docsPanel.render(data, ctx)
    expect(html).toContain('未判定')
    expect(html).not.toContain('文件缺失（登记在案')
    expect(html).not.toContain('dsh-pm-doc-missing')
  })
})
