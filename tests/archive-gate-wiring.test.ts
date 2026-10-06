/**
 * 联调：**服务端归档门读数 → 客户端归档块渲染**（同一条载荷，两侧契约对齐）。
 *
 * REQ-261006123819-3af3 FR-3（D-2）。为什么必须单开这个文件：
 * 服务端判据（`QueryDocs` 的 `case 'archive'`）与客户端渲染（`views/panels/docs.ts` 的
 * `archiveSection`）各有一份单元测试，但两份单元测试**各用各的夹具**——把载荷字段名写错、
 * 或者客户端从错的键上取读数，两边可以同时全绿。本文件让服务端**真跑一遍** `queryDocs`，
 * 把它的返回体原样喂给客户端渲染函数，钉住"接得上"。
 *
 * 另一条纪律也钉在这里：**「已归档」只在服务端判一次**。归档时间字段已删（无写入者），
 * 客户端不再持有任何自己的判据——它只消费 `gates` 里 `gate === 'archive'` 的那条读数。
 */
import { describe, it, expect } from 'vitest'
import { makeHarness } from './application/harness.js'
import type { ActorRef, RequirementRecord, StatusEvent } from '../src/shared/protocol.js'
import { isDegrade, type PanelResult } from '../src/shared/protocol.js'
import { queryDocs } from '../src/application/query/QueryDocs.js'
import type { ReportQueryDeps } from '../src/application/query/QueryReport.js'
import { docsPanel } from '../src/client/views/panels/docs.js'
import type { ReportTabCtx } from '../src/client/views/report-tabs.js'
import { fmtTime } from '../src/client/render/dom-utils.js'

const REQ_ID = 'REQ-arch-wire'
const HUMAN: ActorRef = { kind: 'human' }
/** 材料提交时刻与**归档时刻**故意不同：两者若被混用，断言能当场抓住（D-2 修的就是这类谎报）。 */
const SUBMITTED_AT = 1_700_000_000_000
const ARCHIVED_AT = 1_700_000_900_000

const event = (status: string, at: number): StatusEvent => ({ status, at, by: HUMAN })

/** 归档材料（含目录/清单/合并去向/索引条目——载荷形状照真实归档记录）。 */
const ARCHIVE = {
  dir: 'docs/requirements/' + REQ_ID,
  docs: [{ kind: 'requirement' as const, path: 'docs/requirements/' + REQ_ID + '/requirement.md' }],
  mergedInto: ['docs/architecture/project-manual.md'],
  indexEntry: '联调样例：归档门读数直通客户端',
  submittedAt: SUBMITTED_AT,
  submittedBy: { kind: 'agent' as const },
}

function record(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id: REQ_ID, title: '联调样例', description: '', category: 'feature',
    status: 'archived', blocked: false, sourceSessionId: 'session-w-001',
    comments: [], version: 1, createdAt: 1, updatedAt: 2,
    createdBy: HUMAN, updatedBy: HUMAN,
    statusHistory: [event('draft', 1), event('archived', ARCHIVED_AT)],
    archive: ARCHIVE,
    ...over,
  } as RequirementRecord
}

function deps(h: ReturnType<typeof makeHarness>): ReportQueryDeps {
  return {
    store: h.store, tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: h.session, docs: h.docs, now: () => 2,
  }
}

const CTX: ReportTabCtx = {
  requirementId: REQ_ID,
  load: () => Promise.reject(new Error('渲染路径不该取数')),
  openDoc: () => { throw new Error('渲染路径不该开正文') },
}

function ok<T>(value: PanelResult<T>): T {
  if (isDegrade(value)) throw new Error('期望正常响应，实际降级：' + value.reason)
  return value
}

describe('联调：服务端归档门读数 → 客户端归档块（FR-3）', () => {
  it('archived 需求：服务端 passed + 真实时刻，客户端原样渲染为「已归档」', async () => {
    const h = makeHarness({ requirements: [record()] })
    const payload = ok(await queryDocs(deps(h), { requirementId: REQ_ID }))

    // 服务端侧：判据来自 status，时刻来自 statusHistory 的 archived 事件
    const gate = payload.gates.find(g => g.gate === 'archive')
    expect(gate).toMatchObject({ verdict: 'passed', at: ARCHIVED_AT })

    // 客户端侧：只消费上面这条读数（不自己判）
    const html = docsPanel.render(payload, CTX)
    const section = html.slice(html.indexOf('data-doc-section="archive"'))
    expect(section).toContain('已归档 ' + fmtTime(ARCHIVED_AT))
    expect(section).toContain('data-archived="yes"')
    // 归档时刻 ≠ 材料提交时刻：两者混用会被这一条抓住
    expect(section).not.toContain('已归档 ' + fmtTime(SUBMITTED_AT))
    // 同一条读数也出现在门禁表里（同一载荷、同一事实）
    expect(html).toContain('data-gate="archive" data-verdict="passed"')
  })

  it('材料已备但需求未到 archived：服务端 pending，客户端显示「待归档（材料已备）」', async () => {
    const h = makeHarness({
      requirements: [record({ status: 'accepting', statusHistory: [event('draft', 1), event('accepting', 2)] })],
    })
    const payload = ok(await queryDocs(deps(h), { requirementId: REQ_ID }))
    expect(payload.gates.find(g => g.gate === 'archive')).toMatchObject({
      verdict: 'pending', at: SUBMITTED_AT, reason: '归档材料已提交，待归档确认',
    })
    const html = docsPanel.render(payload, CTX)
    const section = html.slice(html.indexOf('data-doc-section="archive"'))
    expect(section).toContain('待归档（材料已备）')
    expect(section).toContain('data-archived="no"')
  })

  it('端侧契约反证：把载荷里归档门读数抹掉 → 客户端不再显示「已归档」（读不到不猜）', async () => {
    const h = makeHarness({ requirements: [record()] })
    const payload = ok(await queryDocs(deps(h), { requirementId: REQ_ID }))
    // 模拟「旧服务端 / 端点未接线」：同一条载荷，只是缺了归档门那条读数
    const degraded = { ...payload, gates: payload.gates.filter(g => g.gate !== 'archive') }
    const html = docsPanel.render(degraded, CTX)
    const section = html.slice(html.indexOf('data-doc-section="archive"'))
    expect(section).toContain('待归档（材料已备）')
    expect(section).toContain('data-archived="no"')
    expect(section).not.toContain('已归档')
  })
})
