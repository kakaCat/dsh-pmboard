/**
 * 读放大上界：`/state` 每请求**不得**新增大字段对象读取（REQ-261006175040-12d4 · t8 / FR-2、FR-7）。
 *
 * ## 为什么这条断言必须有
 *
 * 本次修复让摘要带上门读数，代价是**索引构建**要补读 `artifacts` / `plan` / `archive` 三件外置对象
 * （实测 2.19 MiB / 60 条，见 `evidence/payload-baseline.md`）。这本身可接受——它只发生一次、
 * 结果进内存索引。**不可接受**的是它变成"每次 `/state` 都读一遍"：看板 20s 轮询，那会把首屏读放大
 * 拉回 B12 之前的水位，正是本需求要防的回归。
 *
 * 本用例用 `readObject` 计数替身把这条边界钉死：
 *   · 预热（索引构建）后，连续 3 次取摘要 ⇒ 四件对象的读取增量 **0**；
 *   · `verification.json` **从不被读**（验收 chip 由 gates 里的门读数表达）；
 *   · 新建一个 Store（等价于索引重建）⇒ 增量如实为"每条 3 件"，**不伪造成 0**。
 *
 * serves: FR-2, FR-7
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RequirementShardRepository } from '../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'

const REQ = 'REQ-261006000001-aaaa'

let root = ''

/** 写一条最小可读的分片需求（热记录 + 三件外置对象；刻意不写 verification.json）。 */
function seedLedger(dir: string, id: string): void {
  const reqDir = join(dir, 'requirements', id)
  mkdirSync(reqDir, { recursive: true })
  writeFileSync(join(reqDir, 'record.json'), JSON.stringify({
    id, title: '读放大上界标本', status: 'implementing', blocked: false, version: 3,
    createdAt: 1_700_000_000_000, updatedAt: 1_700_000_001_000,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    category: 'feature',
    commentCount: 0, historyCount: 0, artifactCount: 2,
  }))
  writeFileSync(join(reqDir, 'artifacts.json'), JSON.stringify([
    { stage: 'brainstorming', kind: 'requirement', path: 'docs/requirements/' + id + '/requirement.md', registeredAt: 1, confirmedAt: 2 },
    { stage: 'design', kind: 'design', path: 'docs/requirements/' + id + '/design/architecture.md', registeredAt: 3 },
  ]))
  writeFileSync(join(reqDir, 'plan.json'), JSON.stringify({ path: 'p', summary: 's', tasks: [], submittedAt: 4, submittedBy: { kind: 'agent' } }))
  mkdirSync(join(dir, 'requirements'), { recursive: true })
}

/** 计数替身：只数 `readObject` 被调用的 kind（其余方法原样转发）。 */
function countingRepo(counts: string[]): RequirementShardRepository {
  const repo = new RequirementShardRepository()
  return new Proxy(repo, {
    get(target, prop, receiver) {
      if (prop === 'readObject') {
        return async (root: string, id: string, kind: string, opts?: { cold?: boolean }) => {
          counts.push(kind)
          return (target.readObject as unknown as (r: string, i: string, k: string, o?: object) => Promise<unknown>)(root, id, kind, opts)
        }
      }
      return Reflect.get(target, prop, receiver)
    },
  }) as RequirementShardRepository
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'dsh-pm-gate-read-'))
  seedLedger(root, REQ)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('读放大上界（/state 每请求 0 新增大字段读）', () => {
  it('预热后连续 3 次取摘要：readObject 增量为 0，且从不读 verification', async () => {
    const counts: string[] = []
    const store = new ShardedRequirementStore({ root, repository: countingRepo(counts), onWarn: () => {} })

    const first = await store.listSummaries()
    expect(first.items.map(i => i.id)).toEqual([REQ])
    const afterWarm = counts.length
    expect(afterWarm).toBeGreaterThan(0) // 索引构建确实补读了对象（不是"什么都没读"的假绿）
    expect(counts).not.toContain('verification') // 刻意不读那 1.95 MiB
    // 门读数确实来自刚读的三件对象（不是空壳）
    const gates = first.items[0]?.gates ?? []
    expect(gates.map(g => [g.kind, g.status])).toEqual([
      ['requirement', 'confirmed'],
      ['design', 'pending'], // 一份未落章 ⇒ 成组确认待确认
      ['decomposition', 'missing'],
      ['verification', 'missing'],
    ])
    expect(first.items[0]?.planState).toBe('pending')

    for (let i = 0; i < 3; i++) await store.listSummaries()
    expect(counts.length).toBe(afterWarm) // 连续 3 次：增量 0
    expect(counts).not.toContain('verification')
  })

  it('索引重建（新 Store 实例）⇒ 增量如实为「每条 3 件」，不伪造成 0', async () => {
    const counts1: string[] = []
    const store1 = new ShardedRequirementStore({ root, repository: countingRepo(counts1), onWarn: () => {} })
    await store1.listSummaries()
    const warm = counts1.length
    expect(warm).toBe(3) // artifacts / plan / archive 各一次

    const counts2: string[] = []
    const store2 = new ShardedRequirementStore({ root, repository: countingRepo(counts2), onWarn: () => {} })
    await store2.listSummaries()
    expect(counts2.length).toBe(3)
    expect([...counts2].sort()).toEqual(['archive', 'artifacts', 'plan'])
  })

  it('索引命中后不重复读：第二次 getSummary 同样零增量', async () => {
    const counts: string[] = []
    const store = new ShardedRequirementStore({ root, repository: countingRepo(counts), onWarn: () => {} })
    await store.getSummary(REQ)
    const afterWarm = counts.length
    await store.getSummary(REQ)
    await store.getSummary(REQ)
    expect(counts.length).toBe(afterWarm)
  })
})
