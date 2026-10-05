/**
 * L2 单测 · 写侧冲突与幂等（REQ-261002161439-277d · t5 / FR-2、FR-5、FR-3）。
 *
 * 卡上点名的断言：
 * - **A6** 两写者持同一 `expectedVersion`，第二个抛 `REQBOARD_CONFLICT` 且带 `currentVersion`，
 *   磁盘内容仍是前者（**不静默覆盖**）；
 * - **A7** 同一写操作连调两次，第二次**不写盘**（本文件用"写入次数 + 全盘字节快照"判定，
 *   假 fs 没有 mtime——快照逐字节相等比 mtime 更强）；
 * - 变更器不碰 `version`，落盘仍 `+1`（version 由存储自增，是 CAS 成立的前提）；
 * - 冷侧写 → `COLD_IMMUTABLE` 且文件一个字节没动；
 * - 删改已有评论 → **整份重写 + 告警**（只追加纪律被违反，不静默）。
 */
import { describe, it, expect } from 'vitest'
import { FakeShardFs, seedShard } from './fake-shard-fs.js'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import { REQUIREMENT_STORE_ERROR } from '../../src/application/ports.js'
import { recordPath, journalPath } from '../../src/domain/requirement/ReqboardPaths.js'
import { encodeJournalLine, toCommentLine } from '../../src/domain/requirement/Journal.js'
import type { RequirementRecord } from '../../src/shared/protocol.js'

const ROOT = '/data/reqboard'
const ID = 'REQ-261002161439-277d'
const COLD_ID = 'REQ-260930094139-2d65'

function record(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
  return {
    id,
    title: `需求 ${id}`,
    description: '描述',
    status: 'implementing',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 100,
    updatedAt: 100,
    createdBy: { kind: 'agent' },
    updatedBy: { kind: 'agent' },
    ...over,
  }
}

async function fixture(seed: readonly RequirementRecord[] = [record(ID)]): Promise<{
  fs: FakeShardFs
  repo: RequirementShardRepository
  store: ShardedRequirementStore
  warns: string[]
}> {
  const fs = new FakeShardFs()
  const warns: string[] = []
  const repo = new RequirementShardRepository({ fs, now: () => 1, onWarn: (m) => warns.push(m) })
  const store = new ShardedRequirementStore({ root: ROOT, repository: repo, onWarn: (m) => warns.push(m), now: () => 500 })
  for (const r of seed) await seedShard(repo, ROOT, { record: r })
  await repo.writeMeta(ROOT, { schemaVersion: 10, revision: 7 })
  return { fs, repo, store, warns }
}

/** 全盘快照（路径 → 内容），用于"一个字节都没动"与"幂等"的判定。 */
function snapshot(fs: FakeShardFs): string {
  return [...fs.files.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([p, c]) => p + '=' + c).join('\n')
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p
    return undefined
  } catch (err) {
    return (err as { code?: string }).code
  }
}

describe('A6 乐观锁：并发写不静默覆盖', () => {
  it('两写者持同一 expectedVersion → 第二个 CONFLICT（带 currentVersion），磁盘仍是前者', async () => {
    const { store } = await fixture([record(ID, { version: 3 })])
    const first = await store.mutateIf(ID, 3, (d) => { d.title = '第一个写者'; return { changed: true } })
    expect(first.version).toBe(4)

    let code: string | undefined
    let currentVersion: number | undefined
    try {
      await store.mutateIf(ID, 3, (d) => { d.title = '第二个写者'; return { changed: true } })
    } catch (err) {
      code = (err as { code?: string }).code
      currentVersion = (err as { currentVersion?: number }).currentVersion
    }
    expect(code).toBe(REQUIREMENT_STORE_ERROR.CONFLICT)
    expect(currentVersion).toBe(4)
    expect((await store.get(ID))!.title).toBe('第一个写者') // 后者没有覆盖前者
  })

  it('mutate()（无 CAS）走临界区 RMW：串行队列保证读到的是前一次的结果', async () => {
    const { store } = await fixture([record(ID, { version: 1 })])
    // 并发投三次自增（不等待）——串行队列应让它们依次基于彼此的结果
    await Promise.all([
      store.mutate(ID, (d) => { d.title = d.title + '+a'; return { changed: true } }),
      store.mutate(ID, (d) => { d.title = d.title + '+b'; return { changed: true } }),
      store.mutate(ID, (d) => { d.title = d.title + '+c'; return { changed: true } }),
    ])
    const after = (await store.get(ID))!
    expect(after.title).toBe(`需求 ${ID}+a+b+c`) // 顺序固定（入队序），不是互相覆盖
    expect(after.version).toBe(4)
  })

  it('目标不存在 → NOT_FOUND（不隐式建档）', async () => {
    const { store } = await fixture([])
    expect(await codeOf(store.mutate(ID, () => ({ changed: true })))).toBe(REQUIREMENT_STORE_ERROR.NOT_FOUND)
  })
})

describe('A7 幂等：无变更不写盘', () => {
  it('连调两次同一写操作，第二次零写入且全盘逐字节不变', async () => {
    const { fs, store } = await fixture([record(ID)])
    await store.mutate(ID, (d) => { d.title = '改一次'; return { changed: true } })
    const before = snapshot(fs)
    fs.resetProbes()
    const second = await store.mutate(ID, () => undefined)
    expect(second.changed).toBe(false)
    expect(fs.writes).toBe(0) // 一次都没写
    expect(fs.writeBytes).toBe(0)
    expect(snapshot(fs)).toBe(before) // 比 mtime 更强的判据
  })

  it('{changed:false} 与 undefined 等价：都不写盘', async () => {
    const { fs, store } = await fixture([record(ID)])
    fs.resetProbes()
    await store.mutate(ID, () => ({ changed: false }))
    expect(fs.writes).toBe(0)
  })
})

describe('version 由存储自增（CAS 令牌的前提）', () => {
  it('变更器把 version 改成 999 也会被覆盖成 旧值+1', async () => {
    const { store } = await fixture([record(ID, { version: 5 })])
    const res = await store.mutate(ID, (d) => { d.version = 999; d.title = 'x'; return { changed: true } })
    expect(res.version).toBe(6)
    expect((await store.get(ID))!.version).toBe(6)
  })

  it('appendComment 也让 version +1（评论不是"免版本"的旁路）', async () => {
    const { store } = await fixture([record(ID, { version: 2 })])
    const r = await store.appendComment(ID, { id: 'c-1', body: '一', createdAt: 1 })
    expect(r.version).toBe(3)
    expect(r.commentCount).toBe(1)
  })
})

describe('冷侧只读', () => {
  it('归档需求 mutate → COLD_IMMUTABLE，且全盘逐字节不变', async () => {
    const { fs, store } = await fixture([record(COLD_ID, { status: 'archived' })])
    const before = snapshot(fs)
    expect(await codeOf(store.mutate(COLD_ID, (d) => { d.title = '偷改'; return { changed: true } }))).toBe(REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE)
    expect(await codeOf(store.appendComment(COLD_ID, { id: 'c', body: 'b', createdAt: 1 }))).toBe(REQUIREMENT_STORE_ERROR.COLD_IMMUTABLE)
    expect(snapshot(fs)).toBe(before)
  })
})

describe('只追加纪律：前缀被改写 → 整份重写 + 告警', () => {
  it('删掉一条已有评论 → 重写后只剩有效行 + onWarn 点名', async () => {
    const { fs, store, warns } = await fixture([record(ID, {
      comments: [
        { id: 'c-1', body: '一', createdAt: 1 },
        { id: 'c-2', body: '二', createdAt: 2 },
      ],
    })])
    await store.mutate(ID, (d) => { d.comments = [d.comments[0]!]; return { changed: true } })
    expect(warns.some((w) => w.includes('只允许追加'))).toBe(true)
    expect((await store.get(ID))!.comments.map((c) => c.id)).toEqual(['c-1'])
    // 提交点计数与磁盘一致（否则下次读会被判数据丢失）
    const hot = JSON.parse(fs.files.get(recordPath(ROOT, ID))!) as { commentCount: number }
    expect(hot.commentCount).toBe(1)
  })

  it('改掉一条已有评论的内容（长度不变）→ 也必须被发现（不能只看长度）', async () => {
    const { store, warns } = await fixture([record(ID, {
      comments: [
        { id: 'c-1', body: '原文', createdAt: 1 },
        { id: 'c-2', body: '二', createdAt: 2 },
      ],
    })])
    await store.mutate(ID, (d) => { d.comments[0]!.body = '被改了'; return { changed: true } })
    expect(warns.some((w) => w.includes('只允许追加'))).toBe(true)
    expect((await store.get(ID))!.comments[0]!.body).toBe('被改了')
  })

  it('正常追加（尾部增长）走追加路径：只多一行，不重写整个日志', async () => {
    const { fs, store } = await fixture([record(ID, {
      comments: [{ id: 'c-1', body: '一', createdAt: 1 }],
    })])
    const journalBefore = fs.files.get(journalPath(ROOT, ID, 'comments'))!.length
    fs.resetProbes()
    await store.appendComment(ID, { id: 'c-2', body: '二', createdAt: 2 })
    const journalAfter = fs.files.get(journalPath(ROOT, ID, 'comments'))!
    expect(journalAfter.length).toBeGreaterThan(journalBefore)
    expect(journalAfter.split('\n').filter(Boolean)).toHaveLength(2)
    // 追加一行 + record.json + meta.json = 3 次写入（不是"重写整份日志再加两次"）
    expect(fs.writes).toBeLessThanOrEqual(4)
    expect(journalAfter.startsWith(encodeJournalLine(toCommentLine(0, { id: 'c-1', body: '一', createdAt: 1 })))).toBe(true)
  })
})
