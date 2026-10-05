/**
 * 冷侧写豁免（REQ-261002161439-277d t8 · 人工裁定 2026-10-02）。
 *
 * 判据三条，两个实现（分片 + 内存替身）都必须一致——它们共用 `domain/requirement/ColdWrite`：
 *   1. 冷侧需求 + **只改 `archive`** → 放行（否则 `reqboard_submit(kind=archive)` 切换后失效）；
 *   2. 冷侧需求 + 改**别的字段**（标题）→ 仍 `COLD_IMMUTABLE`；
 *   3. 冷侧需求 + 改 **`comments`**（appendComment 那条路）→ 仍 `COLD_IMMUTABLE`
 *      （人工裁定是"只放开 archive.json 这一类"，故契约测试那条断言不许被放宽）。
 */
import { describe, it, expect } from 'vitest'
import { InMemoryRequirementStore } from '../application/harness.js'
import { FakeShardFs, seedShard } from './fake-shard-fs.js'
import { RequirementShardRepository } from '../../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../../src/repositories/ShardedRequirementStore.js'
import type { RequirementStore } from '../../src/application/ports.js'
import type { RequirementRecord } from '../../src/shared/protocol.js'

const ROOT = '/data/reqboard-cold-archive'
const COLD_ID = 'REQ-261002161439-277d'

function archived(id: string): RequirementRecord {
  return {
    id,
    title: '已归档的需求',
    description: 'd',
    status: 'archived',
    blocked: false,
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'agent' },
    updatedBy: { kind: 'agent' },
  }
}

async function rejectedCode(fn: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await fn()
    return undefined
  } catch (err) {
    return (err as { code?: string }).code
  }
}

const IMPLS: readonly { name: string; make: () => Promise<RequirementStore> }[] = [
  {
    name: 'InMemoryRequirementStore',
    make: async () => new InMemoryRequirementStore({ requirements: [archived(COLD_ID)] }),
  },
  {
    name: 'ShardedRequirementStore',
    make: async () => {
      const fs = new FakeShardFs()
      const repo = new RequirementShardRepository({ fs, now: () => 1, onWarn: () => { /* 本测试不关心告警 */ } })
      await seedShard(repo, ROOT, { record: archived(COLD_ID) })
      await repo.writeMeta(ROOT, { schemaVersion: 10, revision: 1 })
      return new ShardedRequirementStore({ root: ROOT, repository: repo, onWarn: () => { /* 同上 */ }, now: () => 1000 })
    },
  },
]

for (const impl of IMPLS) {
  describe(`冷侧写豁免 · ${impl.name}`, () => {
    it('只改 archive（归档材料）→ 放行', async () => {
      const store = await impl.make()
      const res = await store.mutate(COLD_ID, (draft) => {
        draft.archive = {
          dir: 'docs/requirements/' + COLD_ID,
          docs: [],
          mergedInto: [],
          indexEntry: 'x',
          manualNote: 'm',
          submittedAt: 2,
          submittedBy: { kind: 'agent' },
        }
        return { changed: true }
      })
      expect(res.changed).toBe(true)
      expect((await store.get(COLD_ID))?.archive).toBeDefined()
    })

    it('改标题 → 仍 COLD_IMMUTABLE（豁免不等于"冷侧可写"）', async () => {
      const store = await impl.make()
      const code = await rejectedCode(() => store.mutate(COLD_ID, (draft) => {
        draft.title = '偷改标题'
        return { changed: true }
      }))
      expect(code).toBe('REQBOARD_COLD_IMMUTABLE')
    })

    it('改 comments（appendComment 那条路）→ 仍 COLD_IMMUTABLE', async () => {
      const store = await impl.make()
      const code = await rejectedCode(() => store.appendComment(COLD_ID, {
        id: 'c-1', body: '冷侧不该能追加评论', createdAt: 2,
      }))
      expect(code).toBe('REQBOARD_COLD_IMMUTABLE')
    })

    it('改状态（archived → done）→ 仍 COLD_IMMUTABLE（状态变更不是"备材料"）', async () => {
      const store = await impl.make()
      const code = await rejectedCode(() => store.mutate(COLD_ID, (draft) => {
        draft.status = 'done'
        return { changed: true }
      }))
      expect(code).toBe('REQBOARD_COLD_IMMUTABLE')
    })

    it('archive + **同一次 mutate 里的随行留痕评论** → 放行（人工裁定 2026-10-02 第二条）', async () => {
      const store = await impl.make()
      const res = await store.mutate(COLD_ID, (draft) => {
        draft.archive = {
          dir: 'docs/requirements/' + COLD_ID,
          docs: [],
          mergedInto: [],
          indexEntry: 'x',
          manualNote: 'm',
          submittedAt: 2,
          submittedBy: { kind: 'agent' },
        }
        draft.comments.push({ id: 'c-1', body: '[归档] 提交材料', createdAt: 2 } as never)
        return { changed: true }
      })
      expect(res.changed).toBe(true)
      const after = await store.get(COLD_ID)
      expect(after?.archive).toBeDefined()
      expect(after?.comments.map((c) => c.id)).toEqual(['c-1'])
    })

    it('只改 comments、**不动 archive** → 仍 COLD_IMMUTABLE（豁免必须由 archive 触发）', async () => {
      const store = await impl.make()
      const code = await rejectedCode(() => store.mutate(COLD_ID, (draft) => {
        draft.comments.push({ id: 'c-9', body: '借材料之名偷偷留痕', createdAt: 3 } as never)
        return { changed: true }
      }))
      expect(code).toBe('REQBOARD_COLD_IMMUTABLE')
    })
  })
}
