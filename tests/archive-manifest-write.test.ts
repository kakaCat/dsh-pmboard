/**
 * `archive.md` 写盘、幂等与清单补登测试（REQ-261006201841-944d t4 / FR-5、FR-6 / TC-25～TC-28）。
 *
 * 锁死四件事：
 *   ① 首次提交后 `<dir>/archive.md` 落盘、含 `indexEntry` 与每条合并去向，且进 `docs` 清单（kind=notes）；
 *   ② 二次同材料提交 → `written=false`：盘上文本 sha256 与 mtime 逐字不变（保留首次「渲染时刻」）；
 *   ③ `archive.md` 进「已列」而非「未列」——它**不触发** `REQBOARD_UNLISTED_ACK_REQUIRED`
 *      （自己渲染的文件不得把自己挡住）；
 *   ④ 写盘失败（桩 `docs.write` 抛错）→ 提交整体失败、**台账零写入**（archive 字段为空、
 *      评论 0 条、revision 不变、盘上不留 archive.md）。
 *
 * 另有一条次序判据：`resolved_targets` 的 root / by 与桩记录一致（生效根 = 本需求自己的根）。
 */
import { makeTestStore } from './application/harness.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineArchiveSubmitTool, stubDocFile, toUseCaseDeps, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { submitArchive } from '../src/application/use-cases/SubmitArchive.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import { listHeadingAnchors } from '../src/domain/knowledge/slug.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-abc-123'
const DIR = 'docs/requirements/REQ-abc123'
const MANUAL_DOC = 'docs/architecture/project-manual.md'
const MANUAL_MD = '# 项目说明书\n\n## 收尾门\n\n收尾门三条硬约束。\n'
const MANUAL_ANCHOR = listHeadingAnchors(MANUAL_MD).map(h => h.anchor)[listHeadingAnchors(MANUAL_MD).length - 1]!
const INDEX_ENTRY = '归档时渲染 archive.md：结论与合并去向进需求目录'

/** `queue.json` 夹具（摘要四格 + 字节数都要对得上）。 */
const QUEUE_JSON = JSON.stringify({
  generated_at: '2026-10-06T10:30:00.000Z',
  tasks: [{ id: 't1' }, { id: 't2' }, { id: 't3' }],
  edges: [{ from: 't1', to: 't2' }, { from: 't2', to: 't3' }],
  ready: [{ id: 't1' }],
})

/** 首次提交的注入时刻（第二次会往前拨一小时——用来证明"保留盘上首次时刻"）。 */
const T0 = Date.UTC(2026, 9, 6, 12, 0, 0)
const T1 = T0 + 3_600_000

let root: string
let store: ReturnType<typeof makeTestStore>
let clockMs: number

const ARCHIVE = {
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  merged_into: [MANUAL_DOC],
  index_entry: INDEX_ENTRY,
  manual_updates: [{ path: MANUAL_DOC + '#' + MANUAL_ANCHOR, summary: '新增收尾门三条硬约束' }],
}

function toolDeps(): ReqboardToolDeps {
  return { store, now: () => clockMs, workspaceRoot: root } as never
}

const run = (tool: { execute: (a: unknown, e: unknown) => unknown }, args: unknown): Promise<any> =>
  tool.execute(args, { agent: { id: W } }) as Promise<any>

async function seed(status: RequirementStatus = 'archived'): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '归档渲染物', description: '', status, blocked: false, category: 'feature',
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    workspaceRoot: root,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status, at: 1, by: { kind: 'human' } }],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/**
 * 夹具目录：3 份必列 + 2 份豁免（`queue.json` / `rtm-implementing/*.yml`）。
 *
 * **故意不放任何"未列"文件**：这样"提交成功"本身就证明 `archive.md` 没有落进未列集合
 * （否则 enforce 闸门会当场拒），不必依赖 unlisted_ack 掩掉信号。
 */
function plantFixture(): void {
  for (const p of ['requirement.md', 'decomposition.md', 'verification.md']) stubDocFile(DIR + '/' + p, root)
  stubDocFile(DIR + '/queue.json', root, QUEUE_JSON)
  stubDocFile(DIR + '/rtm-implementing/t-1.yml', root, 'task: t-1\n')
  stubDocFile(MANUAL_DOC, root, MANUAL_MD)
}

const manifestAbs = (): string => join(root, DIR, 'archive.md')
const sha256 = (s: string | Buffer): string => createHash('sha256').update(s).digest('hex')

/** 目录内文件 → 字节数（递归；用于"不搬迁、不删除"的前后比对）。 */
function snapshotDir(absDir: string, rel = ''): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of readdirSync(absDir, { withFileTypes: true })) {
    const relPath = rel.length > 0 ? rel + '/' + e.name : e.name
    if (e.isDirectory()) {
      for (const [k, v] of snapshotDir(join(absDir, e.name), relPath)) out.set(k, v)
      continue
    }
    out.set(relPath, statSync(join(absDir, e.name)).size)
  }
  return out
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pm-archive-manifest-'))
  store = makeTestStore()
  clockMs = T0
  plantFixture()
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('TC-25 一次成功归档落盘（FR-5 验收标准 1）', () => {
  it('archive.md 落盘、written=true、进 docs 清单（kind=notes）、且不落未列集合', async () => {
    await seed()
    const out = await run(defineArchiveSubmitTool(toolDeps()), ARCHIVE)
    expect(out.success).toBe(true)
    expect(out.archive_manifest.path).toBe(DIR + '/archive.md')
    expect(out.archive_manifest.written).toBe(true)
    expect(out.archive_manifest.bytes).toBeGreaterThan(0)
    expect(existsSync(manifestAbs())).toBe(true)

    const text = readFileSync(manifestAbs(), 'utf8')
    // 结论原文 + 每条合并去向（FR-5 验收标准 1 的两项）
    expect(text).toContain(INDEX_ENTRY)
    expect(text).toContain('- `' + MANUAL_DOC + '` — ✅ 存在 ' + Buffer.byteLength(MANUAL_MD, 'utf8') + ' 字节')
    // 机器产物折叠 + queue.json 摘要（FR-6：真实接线，不是渲染器单测）
    expect(text).toContain('- 追溯报告目录（rtm-*/） · 1 个 · ')
    expect(text).toContain('- 台账镜像（queue.json） · 1 个 · ')
    expect(text).toContain('摘要：任务 3 · 依赖边 2 · 就绪 1 · 生成时间 2026-10-06T10:30:00.000Z · ' + Buffer.byteLength(QUEUE_JSON, 'utf8') + ' 字节')
    expect(text).not.toContain('rtm-implementing/t-1.yml') // 逐文件不铺开

    // 台账：archive.md 进清单（kind=notes），且对账把它算进「已列」
    const rec = store.peekAll()[0]!
    expect(rec.archive?.docs.filter(d => d.path === DIR + '/archive.md'))
      .toEqual([{ kind: 'notes', path: DIR + '/archive.md' }])
    expect(rec.archive?.reconcile?.listed).toContain(DIR + '/archive.md')
    expect(rec.archive?.reconcile?.unlisted).toEqual([])
    expect(out.reconcile.unlisted).toEqual([])
  })

  it('resolved_targets 的 root / by 与桩记录一致（生效根 = 本需求自己的根）', async () => {
    await seed()
    const out = await run(defineArchiveSubmitTool(toolDeps()), ARCHIVE)
    expect(out.resolved_targets.root).toBe(root)
    expect(out.resolved_targets.by).toBe('path-fallback')
    expect(out.resolved_targets.attributed).toBe(false)
    expect(out.resolved_targets.merged_into).toEqual([
      { path: MANUAL_DOC, ok: true, bytes: Buffer.byteLength(MANUAL_MD, 'utf8') },
    ])
  })
})

describe('TC-26 幂等（FR-5 验收标准 2）', () => {
  it('同材料再提一次 → written=false，盘上文本 sha256 与 mtime 都不变，且保留首次「渲染时刻」', async () => {
    await seed()
    const tool = defineArchiveSubmitTool(toolDeps())
    await run(tool, ARCHIVE)
    const first = readFileSync(manifestAbs(), 'utf8')
    const mtimeBefore = statSync(manifestAbs()).mtimeMs

    // 第二次：注入时刻往前拨一小时——若判据是"整篇字节相等"，这里必然重写（正是要防的假幂等）。
    clockMs = T1
    const out2 = await run(tool, ARCHIVE)
    expect(out2.archive_manifest.written).toBe(false)
    const second = readFileSync(manifestAbs(), 'utf8')
    expect(sha256(second)).toBe(sha256(first))
    expect(statSync(manifestAbs()).mtimeMs).toBe(mtimeBefore)
    expect(second).toContain('渲染时刻：' + new Date(T0).toISOString()) // 盘上首次时刻
    expect(second).not.toContain(new Date(T1).toISOString())

    // 清单不重复追加（同路径只有一条）
    const rec = store.peekAll()[0]!
    expect(rec.archive?.docs.filter(d => d.path === DIR + '/archive.md').length).toBe(1)
  })

  it('清单里若已显式列了 archive.md（二次提交），补登不重复（幂等口径按 path）', async () => {
    await seed()
    const tool = defineArchiveSubmitTool(toolDeps())
    await run(tool, ARCHIVE) // 首次：archive.md 由本次渲染落盘
    clockMs = T1
    const out = await run(tool, {
      ...ARCHIVE,
      docs: [...ARCHIVE.docs, { kind: 'notes', path: DIR + '/archive.md' }],
    })
    expect(out.success).toBe(true)
    expect(out.archive_manifest.written).toBe(false) // 内容一致 → 不重写
    const rec = store.peekAll()[0]!
    expect(rec.archive?.docs.filter(d => d.path === DIR + '/archive.md').length).toBe(1)
    expect(rec.archive?.docs.length).toBe(4)
  })
})

describe('TC-27 写盘失败（F-4 / R-4）', () => {
  /** `docs.write` 抛错的端口（其余方法原样转发）——模拟只读目录 / 权限失败。 */
  function depsWithWriteFailure(): UseCaseDeps {
    const base = toUseCaseDeps(toolDeps())
    const docs: UseCaseDeps['docs'] = {
      exists: p => base.docs.exists(p),
      read: p => base.docs.read(p),
      write: async () => { throw new Error('EACCES: read-only file system') },
      list: p => base.docs.list(p),
      stat: p => base.docs.stat(p),
      resolve: p => base.docs.resolve(p),
      workspaceRoot: () => base.docs.workspaceRoot(),
    }
    return { ...base, docs }
  }

  it('整体拒绝（消息含落点路径与「台账零写入」），台账零写入且盘上不留 archive.md', async () => {
    await seed()
    const before = (await store.head()).revision
    let message = ''
    let code = ''
    try {
      await submitArchive(depsWithWriteFailure(), { ...ARCHIVE }, { agent: { id: W } })
    } catch (err) {
      message = (err as Error).message
      code = String((err as Error & { code?: string }).code)
    }
    expect(code).toBe('REQBOARD_IO_FAILED')
    expect(message).toContain(DIR + '/archive.md')
    expect(message).toContain('台账零写入')
    expect(message).toContain('EACCES')

    const rec = store.peekAll()[0]!
    expect(rec.archive).toBeUndefined()
    expect(rec.comments).toEqual([])
    expect((await store.head()).revision).toBe(before)
    expect(existsSync(manifestAbs())).toBe(false)
  })
})

describe('TC-28 不搬迁、不删除机器产物（D-2 / FR-6 验收标准 1）', () => {
  it('提交前后目录文件集合相等（只多出 archive.md），既有文件字节数逐项不变', async () => {
    await seed()
    const before = snapshotDir(join(root, DIR))
    await run(defineArchiveSubmitTool(toolDeps()), ARCHIVE)
    const after = snapshotDir(join(root, DIR))

    const added = [...after.keys()].filter(k => !before.has(k))
    expect(added).toEqual(['archive.md'])
    expect(after.size).toBe(before.size + 1)
    for (const [k, v] of before) expect(after.get(k), k + ' 字节数变了').toBe(v)
  })
})
