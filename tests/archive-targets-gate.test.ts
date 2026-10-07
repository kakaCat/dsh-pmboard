/**
 * 归档目标**事实判定**测试（REQ-261006201841-944d t2 / FR-1、FR-2）。
 *
 * 锁死四件事：
 *   ① 合并去向**不存在** → 拒，且消息带三要素（路径 + 生效根 + 判据来源 by）；
 *   ② 合并去向**存在但 0 字节** → 拒，且与 ① 的原因**可区分**（缺失 ≠ 0）；
 *   ③ **按这条需求自己的根**判：文档只在「另一个项目根」里时也能通过（证明不是在本仓找的）；
 *   ④ 说明书更新点的**锚点不存在** → 拒（形态合法但事实不成立）。
 *
 * 另有一条 F-1 兜底读数：记录既无 projectId 也无 workspaceRoot → `by='unknown'`，
 * 并按当前工作区兜底（**不冒充**权威根）。
 */
import { makeTestStore } from './application/harness.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineArchiveSubmitTool, stubDocFile } from './helpers/tool-deps.js'
import { listHeadingAnchors } from '../src/domain/knowledge/slug.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-abc-123'
const DIR = 'docs/requirements/REQ-abc123'
const MANUAL = 'docs/architecture/project-manual.md'
/** 夹具文档正文：锚点**由同一实现算出**（`listHeadingAnchors`），不硬编码 slug 规则。 */
const MANUAL_MD = '# 项目说明书\n\n## 收尾门\n\n收尾门三条硬约束。\n'
const ANCHOR = listHeadingAnchors(MANUAL_MD).map(h => h.anchor)[listHeadingAnchors(MANUAL_MD).length - 1]!

let root: string
/** 「另一个项目」的根：跨项目判据的证据面。 */
let otherRoot: string
let store: ReturnType<typeof makeTestStore>

function makeTool(): { execute: (a: unknown, e: unknown) => Promise<any> } {
  const deps = { store, now: () => Date.now(), workspaceRoot: root } as never
  return defineArchiveSubmitTool(deps) as { execute: (a: unknown, e: unknown) => Promise<any> }
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

async function seed(over: Partial<RequirementRecord> = {}): Promise<void> {
  const r = {
    id: 'REQ-abc123', title: '需求', description: '', status: 'archived' as RequirementStatus, blocked: false,
    category: 'feature', sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'archived' as RequirementStatus, at: 1, by: { kind: 'human' } }],
    ...over,
  } as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/** 需求目录三份必列文档（feature 必填）。 */
function plantReqDir(at: string = root): void {
  for (const p of ['requirement.md', 'decomposition.md', 'verification.md']) stubDocFile(DIR + '/' + p, at)
}

const baseArchive = (mergedInto: string[], manualPath: string): Record<string, unknown> => ({
  dir: DIR,
  docs: [
    { kind: 'requirement', path: DIR + '/requirement.md' },
    { kind: 'plan', path: DIR + '/decomposition.md' },
    { kind: 'verification', path: DIR + '/verification.md' },
  ],
  merged_into: mergedInto,
  index_entry: '把归档声明的落地变成可证伪',
  manual_updates: [{ path: manualPath, summary: '新增收尾门三条硬约束' }],
})

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pm-archive-targets-'))
  otherRoot = mkdtempSync(join(tmpdir(), 'pm-archive-targets-other-'))
  store = makeTestStore()
  plantReqDir()
  stubDocFile(MANUAL, root, MANUAL_MD)
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(otherRoot, { recursive: true, force: true })
})

describe('闸 1：合并去向存在且非空（FR-1）', () => {
  it('① 目标不存在 → 拒，消息含路径、生效根与判据来源三要素', async () => {
    await seed({ workspaceRoot: root })
    const missing = 'docs/architecture/__no_such_doc__.md'
    let message = ''
    try {
      await run(makeTool(), baseArchive([missing], MANUAL + '#' + ANCHOR))
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain(missing)
    expect(message).toContain(root)
    expect(message).toContain('by=path-fallback')
    expect(message).toMatch(/REQBOARD_FILE_MISSING/)
  })

  it('② 目标存在但 0 字节 → 拒，原因与「不存在」可区分（缺失 ≠ 0）', async () => {
    await seed()
    const empty = 'docs/architecture/empty-doc.md'
    stubDocFile(empty, root, '')
    let message = ''
    try {
      await run(makeTool(), baseArchive([empty], MANUAL + '#' + ANCHOR))
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain(empty)
    expect(message).toContain('空文件')
    expect(message).toMatch(/REQBOARD_INVALID_INPUT/)
    expect(message).not.toMatch(/REQBOARD_FILE_MISSING/)
  })

  it('③ 按需求自己的根判：文档只在另一个项目根里时也通过（不是在本仓找的）', async () => {
    await seed({ workspaceRoot: otherRoot })
    // 需求目录与说明书**都只种在另一个项目根**里：若判据退回本仓，这两处都会找不到。
    plantReqDir(otherRoot)
    stubDocFile(MANUAL, otherRoot, MANUAL_MD)
    const out = await run(makeTool(), baseArchive([MANUAL], MANUAL + '#' + ANCHOR))
    expect(out.success).toBe(true)
    expect(out.resolved_targets.root).toBe(otherRoot)
    expect(out.resolved_targets.by).toBe('path-fallback')
    expect(out.resolved_targets.attributed).toBe(false)
    expect(out.resolved_targets.merged_into).toEqual([{ path: MANUAL, ok: true, bytes: Buffer.byteLength(MANUAL_MD, 'utf8') }])
  })

  it('④ F-1 兜底：记录无 projectId 也无 workspaceRoot → by=unknown，按当前工作区判且如实标注', async () => {
    await seed()
    const out = await run(makeTool(), baseArchive([MANUAL], MANUAL + '#' + ANCHOR))
    expect(out.resolved_targets.by).toBe('unknown')
    expect(out.resolved_targets.attributed).toBe(false)
  })
})

describe('闸 2：说明书更新点锚点可达（FR-2）', () => {
  it('锚点不存在（形态合法但事实不成立）→ 拒，消息含「锚点」与「不存在」并给出可用样例', async () => {
    await seed()
    let message = ''
    try {
      await run(makeTool(), baseArchive([MANUAL], MANUAL + '#__no_such_anchor__'))
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('__no_such_anchor__')
    expect(message).toContain('不存在')
    expect(message).toMatch(/REQBOARD_INVALID_INPUT/)
  })

  it('锚点可达 → 通过，且回执逐条给出 manual_anchors 读数', async () => {
    await seed()
    const out = await run(makeTool(), baseArchive([MANUAL], MANUAL + '#' + ANCHOR))
    expect(out.resolved_targets.manual_anchors).toEqual([{ path: MANUAL, anchor: ANCHOR, ok: true }])
  })

  it('说明书更新点的文档不存在 → 拒（路径检查与锚点检查分开报因）', async () => {
    await seed()
    let message = ''
    try {
      await run(makeTool(), baseArchive([MANUAL], 'docs/architecture/__missing__.md#x'))
    } catch (err) {
      message = (err as Error).message
    }
    expect(message).toContain('__missing__.md')
    expect(message).toMatch(/REQBOARD_FILE_MISSING/)
  })
})
