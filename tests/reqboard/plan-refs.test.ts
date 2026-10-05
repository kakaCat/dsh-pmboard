/**
 * L2 用例级单测 · 计划落库的 refs 取数单点（REQ-261002164800-d8f2 · t2 / serves: FR-1, FR-3）。
 *
 * 修前形态（实测 REQ-261002161439-277d）：同一份已批准计划——
 *   批准路径读计划文档的「覆盖对照表」→ 卡上有引用；
 *   手动 reqboard_decompose 路径**不读**文档表 → 11 张卡 refs 全空、RTM serves 全空。
 * 本组用例守的就是"两条入口取数一致"：显式优先 → 文档兜底 → 两处皆无只点名。
 */
import { describe, it, expect } from 'vitest'
import { refsForLanding, unrefedKeys } from '../../src/application/internal/plan-refs.js'
import { RequirementRefError, REQUIREMENT_REF_ERROR } from '../../src/domain/task/RequirementRefs.js'
import type { DocsReader } from '../../src/application/internal/content-gates.js'

/** 计划文档的覆盖对照表（门禁读取的第二数据源）：t2 接 FR-1、t1 接 FR-9。 */
const DECOMPOSITION = [
  '# 拆分计划',
  '',
  '| 需求条款 | 条款内容 | 接收任务 |',
  '|---------|---------|---------|',
  '| FR-1 | 甲条 | t2 |',
  '| FR-9 | 乙条 | t1 |',
  '',
].join('\n')

/** 最小 DocsReader 假实现：只认 decomposition.md。 */
function docsWith(text: string): DocsReader {
  return {
    exists: (p: string) => p.endsWith('/decomposition.md'),
    read: async () => text,
  }
}

const REQ = { id: 'REQ-0000a2' }

describe('refsForLanding · 显式优先', () => {
  it('显式 requirement_refs 存在时，文档表不覆盖它（t1 显式 FR-2 vs 文档 FR-9）', async () => {
    const { refsByKey, sources } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ key: 't1', requirement_refs: ['FR-2'] }] },
      docs: docsWith(DECOMPOSITION),
    })
    expect(refsByKey.get('t1')).toEqual(['FR-2'])
    expect(sources.get('t1')).toBe('explicit')
  })

  it('显式表与计划表对同一 key 取并集（后写不覆盖前写）', async () => {
    const { refsByKey } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ key: 't7', requirement_refs: ['FR-2'] }] },
      explicitTasks: [{ key: 't7', requirement_refs: ['FR-1'] }],
      docs: docsWith(''),
    })
    expect(refsByKey.get('t7')).toEqual(['FR-1', 'FR-2'])
  })
})

describe('refsForLanding · 文档覆盖表兜底（修前手动路径不读它）', () => {
  it('卡上没有显式引用时，从文档表补齐（t2 → FR-1，来源 doc）', async () => {
    const { refsByKey, sources } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ key: 't2', title: '无显式引用' }] },
      docs: docsWith(DECOMPOSITION),
    })
    expect(refsByKey.get('t2')).toEqual(['FR-1'])
    expect(sources.get('t2')).toBe('doc')
  })

  it('文档里提到、但不在本次计划里的 key 不进结果（不制造噪声键）', async () => {
    const { refsByKey } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ key: 't3' }] },
      docs: docsWith(DECOMPOSITION),
    })
    expect([...refsByKey.keys()]).toEqual(['t3'])
  })
})

describe('refsForLanding · 两处皆无 → 不拒绝，只点名', () => {
  it('既无显式也无文档 ⇒ refs 空、来源 none、unrefedKeys 点名', async () => {
    const { refsByKey, sources } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ key: 't1', requirement_refs: ['FR-2'] }, { key: 't3' }] },
      docs: docsWith(DECOMPOSITION),
    })
    expect(refsByKey.get('t3')).toEqual([])
    expect(sources.get('t3')).toBe('none')
    expect(unrefedKeys(['t1', 't3'], refsByKey)).toEqual(['t3'])
  })

  it('文档缺失（生产里的存量需求）⇒ 全卡来源 none，仍不抛错', async () => {
    const noDoc: DocsReader = { exists: () => false, read: async () => '' }
    const { refsByKey, sources } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ key: 't1' }, { key: 't2' }] },
      docs: noDoc,
    })
    expect(unrefedKeys(['t1', 't2'], refsByKey)).toEqual(['t1', 't2'])
    expect(sources.get('t1')).toBe('none')
  })
})

describe('refsForLanding · 脏值不带进落库', () => {
  it('显式通道里的非法编号当场被拒（点名片 key 与非法值）', async () => {
    try {
      await refsForLanding({
        req: REQ,
        plan: { tasks: [{ key: 't5', requirement_refs: ['FR-99x'] }] },
        docs: docsWith(DECOMPOSITION),
      })
      throw new Error('应当抛错但没有')
    } catch (err) {
      expect(err).toBeInstanceOf(RequirementRefError)
      expect((err as RequirementRefError).code).toBe(REQUIREMENT_REF_ERROR)
      expect((err as Error).message).toContain('t5')
      expect((err as Error).message).toContain('FR-99x')
    }
  })

  it('自然序：FR-2 排在 FR-10 之前（不是字典序）', async () => {
    const { refsByKey } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ key: 't1', requirement_refs: ['FR-10', 'FR-2'] }] },
      docs: docsWith(''),
    })
    expect(refsByKey.get('t1')).toEqual(['FR-2', 'FR-10'])
  })

  it('缺 key 的对象被跳过（不是卡）', async () => {
    const { refsByKey } = await refsForLanding({
      req: REQ,
      plan: { tasks: [{ title: '没有 key' }, { key: 't1' }] },
      docs: docsWith(''),
    })
    expect([...refsByKey.keys()]).toEqual(['t1'])
  })
})
