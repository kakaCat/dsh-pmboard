/**
 * 归档清单对账 · 端到端用例（REQ-261004183621-de3f 返工 t-254554 / 验收单 v1-9 的 E2E 缺口）。
 *
 * 与既有单测的分工：`archive-reconcile/amend/compat` 各测一个用例的边界；
 * **本文件串起整条链**，断言**可观察终态**（台账记录 + 评论留痕 + 看板渲染），
 * 而不是只看某个函数的返回值：
 *
 *   工具壳（reqboard_submit kind=archive）→ 用例（对账/闸门）→ 台账（archive.reconcile）
 *     → 评论（留痕）→ 看板渲染（archiveReconcileLine / renderArchiveSection）
 *   工具壳（reqboard_archive_amend）→ 用例（补录）→ 台账（docs/amendments）→ 幂等
 *
 * 六步：
 *   ① 漏列提交 → 拒绝，且**台账零改动**
 *   ② 声明豁免 → 通过，台账出现对账结果、评论出现摘要
 *   ③ 看板渲染 → 出现「清单对账：已列 4 · 豁免 1 · 未列 1（闸门=enforce）」与「已声明不收：…」
 *      （已列 4 = 调用方 3 份 + REQ-261006201841-944d t4 自动补登的结论文件 `archive.md`）
 *   ④ 补录 1 条 → 台账 docs +1、amendments +1、评论 +1
 *   ⑤ 同批再补 → 幂等（全 skipped、修订号不变）
 *   ⑥ 换 warn 闸门重跑① → 不拒，且 warning 老字段仍在
 */
import { makeTestStore } from './application/harness.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineArchiveAmendTool, defineSubmitTool } from '../src/tools/index.js'
import { toUseCaseDeps, stubDocFile, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { listHeadingAnchors } from '../src/domain/knowledge/slug.js'
import { renderArchiveSection } from '../src/client/views/verification.ts'
import type { RequirementRecord } from '../src/shared/protocol.js'
import type { ToolDefinition } from '@deepseek-ai/dsh-tools'

const W = 'session-e2e'
const DIR = 'docs/requirements/REQ-abc123'
/**
 * 合并去向 + 说明书更新点目标（REQ-261006201841-944d FR-1/FR-2）：目标文档必须**真实落盘且非空**，
 * 锚点必须命中该文档真实标题。锚点由 `listHeadingAnchors`（写入端/读侧同一实现）算出，不手写 slug。
 */
const MANUAL_DOC = 'docs/architecture/project-manual.md'
const MANUAL_MD = '# 项目说明书\n\n## 收尾门\n\n收尾门三条硬约束：对账三分类与闸门。\n'
const MANUAL_ANCHOR = listHeadingAnchors(MANUAL_MD).map(h => h.anchor)[listHeadingAnchors(MANUAL_MD).length - 1]!
let root: string
let store: ReturnType<typeof makeTestStore>

/** 真工具壳（与生产同款：defineSubmitTool 经 kind 分发到 submitArchive）。 */
function toolDeps(gate?: 'enforce' | 'warn'): ReqboardToolDeps {
  return {
    store, now: () => Date.now(), workspaceRoot: root,
    ...(gate !== undefined ? { archiveUnlistedGate: gate } : {}),
  } as never
}

// 工具壳签名收窄为真实 `ToolDefinition`（`execute` 的第二个参数是 `ToolRunContext`，
// 用 `(a: unknown, e: unknown)` 描述会因参数逆变而不兼容）；返回值仍按 `any` 读，断言各自负责。
const run = (tool: ToolDefinition, args: unknown): Promise<any> =>
  tool.execute(args, { agent: { id: W } } as never)

/** 造 fixture：3 份必列 + 1 份豁免（rtm-design.yml）+ 1 份未列（tasks/t-1.md）+ 归档目标文档。 */
function plantFixture(): void {
  for (const p of ['requirement.md', 'decomposition.md', 'verification.md', 'rtm-design.yml', 'tasks/t-1.md']) {
    stubDocFile(DIR + '/' + p, root)
  }
  // FR-1/FR-2：合并去向与说明书更新点的目标必须存在且非空，锚点必须真实存在
  stubDocFile(MANUAL_DOC, root, MANUAL_MD)
}

async function seed(): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '端到端需求', description: '', status: 'archived', blocked: false, category: 'feature',
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'archived', at: 1, by: { kind: 'human' } }],
  } as unknown as RequirementRecord
  await store.replaceAll('e2e-seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const ARCHIVE = {
  kind: 'archive',
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  merged_into: [MANUAL_DOC],
  index_entry: '端到端：归档清单对账',
  manual_updates: [{ path: MANUAL_DOC + '#' + MANUAL_ANCHOR, summary: '对账三分类' }],
}

/** 从台账取当前需求（读端终态断言用）。 */
const rec = (): RequirementRecord => store.peekAll()[0]!

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pm-archive-e2e-'))
  store = makeTestStore()
  plantFixture()
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('E2E：提交 → 对账闸门 → 看板 → 补录 → 回退', () => {
  it('六步串起来：终态可观察（台账 + 评论 + 看板）', async () => {
    await seed()
    const submit = defineSubmitTool(toUseCaseDeps(toolDeps()))
    const amend = defineArchiveAmendTool(toUseCaseDeps(toolDeps()))

    // ① 漏列 → 拒，且台账零改动
    await expect(run(submit, { ...ARCHIVE })).rejects.toMatchObject({ code: 'REQBOARD_UNLISTED_ACK_REQUIRED' })
    expect(rec().archive).toBeUndefined()
    expect(rec().comments).toEqual([])

    // ② 声明豁免 → 通过；台账与评论出现可观察终态
    const out = await run(submit, {
      ...ARCHIVE,
      unlisted_ack: [{ path: DIR + '/tasks/t-1.md', reason: 'E2E：任务卡由台账渲染，不入清单' }],
    })
    expect(out.success).toBe(true)
    const afterSubmit = rec()
    expect(afterSubmit.archive?.reconcile?.gate).toBe('enforce')
    // REQ-261006201841-944d t4：结论文件 `archive.md` 由用例补登进清单 → 已列 = 调用方 3 份 + 1
    expect(afterSubmit.archive?.reconcile?.listed.length).toBe(4)
    expect(afterSubmit.archive?.reconcile?.exempted.map((e: { rule: string }) => e.rule)).toEqual(['rtm-reports'])
    expect(afterSubmit.archive?.reconcile?.unlisted).toEqual([DIR + '/tasks/t-1.md'])
    expect(afterSubmit.archive?.reconcile?.acknowledged[0]?.reason).toContain('任务卡由台账渲染')
    expect(afterSubmit.comments.some(c => c.body.includes('清单对账：已列 4 · 豁免 1 · 未列 1（闸门=enforce）'))).toBe(true)

    // ③ 看板渲染（客户端视角的终态）
    const html = renderArchiveSection(afterSubmit as never)
    expect(html).toContain('清单对账：已列 4 · 豁免 1 · 未列 1')
    expect(html).toContain('已声明不收：E2E：任务卡由台账渲染，不入清单')

    // ④ 补录 1 条
    const amended = await run(amend, {
      requirement_id: 'REQ-abc123',
      docs: [{ kind: 'notes', path: DIR + '/evidence/gates.txt' }],
      reason: 'E2E：归档后发现证据没进清单',
    })
    expect(amended.appended.length).toBe(1)
    const afterAmend = rec()
    // 4 份 = 调用方 3 份 + t4 补登的结论文件 archive.md；补录后再 +1
    expect(afterAmend.archive?.docs.length).toBe(5)
    expect(afterAmend.archive?.amendments?.length).toBe(1)
    expect(afterAmend.archive?.reconcile?.listed.length).toBe(5) // 对账字段随补录同步
    expect(afterAmend.comments.some(c => c.body.includes('[归档·补录]'))).toBe(true)
    // 看板也随补录变化（列数 +1、补录次数可见）
    expect(renderArchiveSection(afterAmend as never)).toContain('补录 1 次')

    // ⑤ 幂等：同批再补不写盘
    const revisionBefore = (await store.head()).revision
    const again = await run(amend, {
      requirement_id: 'REQ-abc123',
      docs: [{ kind: 'notes', path: DIR + '/evidence/gates.txt' }],
      reason: 'E2E：重复补录',
    })
    expect(again.appended).toEqual([])
    expect(again.skipped).toEqual([{ path: DIR + '/evidence/gates.txt', reason: 'already-listed' }])
    expect((await store.head()).revision).toBe(revisionBefore)
    expect(rec().archive?.amendments?.length).toBe(1)
  })

  it('⑥ 回退：warn 闸门重跑漏列提交 → 不拒，老字段 warning 保留', async () => {
    await seed()
    const submitWarn = defineSubmitTool(toUseCaseDeps(toolDeps('warn')))
    const out = await run(submitWarn, { ...ARCHIVE })
    expect(out.success).toBe(true)
    expect(out.reconcile.gate).toBe('warn')
    expect(out.unlisted_files).toEqual([DIR + '/tasks/t-1.md'])
    expect(String(out.warning)).toContain('未列入归档清单')
    expect(rec().archive?.reconcile?.gate).toBe('warn')
  })
})
