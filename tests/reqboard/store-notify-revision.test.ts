/**
 * 订阅帧必须带**真 revision**（REQ-261002161439-277d t8 / B0b）。
 *
 * ## 为什么单独一个文件
 *
 * `known-defects.md` §7.2 登记：`ShardedRequirementStore.notify` 把订阅帧的 `revision` 写成
 * **占位 0**，复核原文写着「t8 接线时一并修」。t8 的 B0 正是接 `store.subscribe()` 的那一批，
 * 所以这个修复属于 B0 的交付面，必须有**自己的判据**——否则它会再次悄悄退化成 0
 * （占位值没有任何编译期或运行期症状：SSE 帧照发，只是版本号恒 0，"revision 短路"判据失效）。
 *
 * 判据取"帧里的 revision 必须等于写完之后的 `head().revision`"，对三条写路径各断言一次：
 * `create` / `mutate` / `replaceAll`。
 */
import { describe, it, expect } from 'vitest'
import { FakeShardFs, seedShard } from './fake-shard-fs.js'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import type { RequirementChange } from '../../src/application/ports.js'
import type { RequirementRecord } from '../../src/shared/protocol.js'

const ROOT = '/data/reqboard-notify'
const SEED_REVISION = 5
const EXISTING = 'REQ-261002161439-277d'
const CREATED = 'REQ-261002180227-5d4e'

function rec(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
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

async function makeStore() {
  const fs = new FakeShardFs()
  const repo = new RequirementShardRepository({ fs, now: () => 1, onWarn: () => { /* 本测试不关心告警 */ } })
  await seedShard(repo, ROOT, { record: rec(EXISTING) })
  await repo.writeMeta(ROOT, { schemaVersion: 10, revision: SEED_REVISION })
  const store = new ShardedRequirementStore({
    root: ROOT,
    repository: repo,
    onWarn: () => { /* 同上 */ },
    now: () => 1000,
  })
  const frames: RequirementChange[] = []
  const off = store.subscribe((change) => { frames.push(change) })
  return { store, repo, frames, off }
}

describe('分片存储的订阅帧 · revision 必须是真值（§7.2 修复）', () => {
  it('create：帧 revision = 写完后的 head().revision（不是占位 0）', async () => {
    const { store, frames } = await makeStore()

    await store.create({ id: CREATED, title: '新需求' }, { kind: 'agent' })

    const head = await store.head()
    expect(frames).toHaveLength(1)
    expect(frames[0]?.kind).toBe('requirement-created')
    expect(frames[0]?.requirementId).toBe(CREATED)
    expect(frames[0]?.revision).toBe(head.revision)
    expect(frames[0]?.revision).toBeGreaterThan(SEED_REVISION)
  })

  it('mutate：帧 revision 随写入递增，且与 head() 一致', async () => {
    const { store, frames } = await makeStore()
    const before = (await store.head()).revision

    await store.mutate(EXISTING, (draft) => {
      draft.title = '改过标题'
      return { changed: true }
    })

    const head = await store.head()
    expect(frames).toHaveLength(1)
    expect(frames[0]?.requirementId).toBe(EXISTING)
    expect(frames[0]?.revision).toBe(head.revision)
    expect(frames[0]?.revision).toBeGreaterThan(before)
  })

  it('replaceAll：帧 revision = 导入结构自带的 revision', async () => {
    const { store, frames } = await makeStore()
    const imported = 42

    await store.replaceAll('迁移', {
      schemaVersion: 10,
      revision: imported,
      requirements: [rec(EXISTING, { title: '整册换过' })],
      triages: [],
    } as never)

    expect(frames.length).toBeGreaterThan(0)
    for (const frame of frames) {
      expect(frame.kind).toBe('ledger-replaced')
      expect(frame.revision).toBe(imported)
    }
    expect((await store.head()).revision).toBe(imported)
  })
})
