/**
 * L2 单测 · 写放大与热记录上界（REQ-261002161439-277d · t5 / FR-2、FR-3）。
 *
 * 卡上点名的两条断言：
 * - **A1** 夹具 100 条与 1000 条需求，各追加 1 条评论：**落盘字节相等**（与库容无关），
 *   且远小于全库（< 5%）；
 * - **A4** 同一需求 100 条与 500 条评论时，`record.json` 字节**相同**（容差 ±2）且 ≤ 8KB
 *   ——即热记录体积与评论条数**无关**（大字段已外置）。
 *
 * 为什么这两条是本次改造的核心判据：现状每次变更整册重写（revision 2524 ⇒ 累计约 6.7GB）、
 * 且单册体积随历史无界增长。这两条断言一旦绿，"写放大与库容解耦""热记录有界"就从口号变成事实。
 */
import { describe, it, expect } from 'vitest'
import { FakeShardFs, seedShard } from './fake-shard-fs.js'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import { recordPath, requirementsDir } from '../../src/domain/requirement/ReqboardPaths.js'
import type { CommentRecord, RequirementRecord } from '../../src/shared/protocol.js'

const ROOT = '/data/reqboard'

/** 第 i 条需求的 id（合法形态：12 位时间戳 + 4 位 hex）。 */
function reqId(i: number): string {
  return `REQ-261002${String(100000 + i).padStart(6, '0')}-${(i % 65536).toString(16).padStart(4, '0')}`
}

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

interface Library {
  fs: FakeShardFs
  repo: RequirementShardRepository
  store: ShardedRequirementStore
}

/** 造一个规模为 n 的需求库（热侧）。 */
async function library(n: number): Promise<Library> {
  const fs = new FakeShardFs()
  const repo = new RequirementShardRepository({ fs, now: () => 1, onWarn: () => { /* 本文件断言字节，不关心告警 */ } })
  const store = new ShardedRequirementStore({ root: ROOT, repository: repo, onWarn: () => { /* 同上 */ }, now: () => 500 })
  for (let i = 0; i < n; i++) {
    await seedShard(repo, ROOT, { record: record(reqId(i), { updatedAt: 100 + i }) })
  }
  await repo.writeMeta(ROOT, { schemaVersion: 10, revision: 1 })
  return { fs, repo, store }
}

/** 给第 0 条追加一条评论，返回本次落盘字节。 */
async function commentWriteBytes(lib: Library): Promise<number> {
  lib.fs.resetProbes()
  await lib.store.appendComment(reqId(0), { id: 'c-new', body: '新评论', createdAt: 900 })
  return lib.fs.writeBytes
}

function totalBytes(fs: FakeShardFs): number {
  let sum = 0
  for (const content of fs.files.values()) sum += content.length
  return sum
}

describe('A1 写放大与库容解耦', () => {
  it('100 条与 1000 条需求各追加 1 条评论：落盘字节**相等**，且 < 全库 5%', async () => {
    const small = await library(100)
    const large = await library(1000)

    const bytesSmall = await commentWriteBytes(small)
    const bytesLarge = await commentWriteBytes(large)

    expect(bytesSmall).toBeGreaterThan(0) // 探针确实工作（防"没测到"的假绿）
    expect(bytesLarge).toBe(bytesSmall) // 与库容无关 —— A1 的核心
    expect(bytesLarge).toBeLessThan(totalBytes(large.fs) * 0.05) // 远小于全库
  })

  it('库容增长 10 倍，全库字节涨、单次写入不涨（对照，证明探针真的在量东西）', async () => {
    const small = await library(100)
    const large = await library(1000)
    expect(totalBytes(large.fs)).toBeGreaterThan(totalBytes(small.fs) * 5)
    expect(await commentWriteBytes(large)).toBe(await commentWriteBytes(small))
  })

  it('单次写入只碰"自己那一条"分片 + meta（不动别人的分片）', async () => {
    const lib = await library(50)
    const victim = reqId(0)
    const untouched = reqId(7)
    const before = lib.fs.files.get(recordPath(ROOT, untouched))!
    lib.fs.resetProbes()
    await lib.store.appendComment(victim, { id: 'c-1', body: '一', createdAt: 1 })
    expect(lib.fs.files.get(recordPath(ROOT, untouched))).toBe(before) // 逐字节未变
    // 写入次数：评论日志追加 1 + record.json 1 + meta.json 1 = 3（假 fs 的 open 记一次）
    expect(lib.fs.writes).toBeLessThanOrEqual(5)
  })
})

describe('A4 热记录有界：与评论条数无关', () => {
  async function withComments(count: number): Promise<FakeShardFs> {
    const fs = new FakeShardFs()
    const repo = new RequirementShardRepository({ fs, now: () => 1, onWarn: () => { /* 见上 */ } })
    const comments: CommentRecord[] = Array.from({ length: count }, (_, i) => ({
      id: `c-${i}`,
      body: `第 ${i} 条评论的正文（长度相近，避免用内容差异掩盖体积结论）`,
      createdAt: i,
    }))
    await seedShard(repo, ROOT, { record: record(reqId(0), { comments }) })
    await repo.writeMeta(ROOT, { schemaVersion: 10, revision: 1 })
    return fs
  }

  it('100 条与 500 条评论时 record.json 字节相同（±2）且 ≤ 8KB', async () => {
    const small = await withComments(100)
    const large = await withComments(500)
    const smallRecord = small.files.get(recordPath(ROOT, reqId(0)))!
    const largeRecord = large.files.get(recordPath(ROOT, reqId(0)))!
    expect(smallRecord.length).toBeGreaterThan(0)
    expect(Math.abs(smallRecord.length - largeRecord.length)).toBeLessThanOrEqual(2)
    expect(smallRecord.length).toBeLessThanOrEqual(8192) // 设计上界 8KB
    // 评论本体在日志里、不在热记录里
    expect(smallRecord).not.toContain('第 0 条评论的正文')
    expect(small.files.get(`${requirementsDir(ROOT)}/${reqId(0)}/comments.jsonl`)!.split('\n').filter(Boolean)).toHaveLength(100)
  })

  it('评论从 100 涨到 500：热记录不变，日志线性增长（体积被搬到了对的地方）', async () => {
    const small = await withComments(100)
    const large = await withComments(500)
    const commentBytes = (fs: FakeShardFs): number => fs.files.get(`${requirementsDir(ROOT)}/${reqId(0)}/comments.jsonl`)!.length
    expect(commentBytes(large)).toBeGreaterThan(commentBytes(small) * 3)
    expect(large.files.get(recordPath(ROOT, reqId(0)))!.length)
      .toBe(small.files.get(recordPath(ROOT, reqId(0)))!.length)
  })
})
