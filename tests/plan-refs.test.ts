/**
 * FR-7 第二通道：从计划文档覆盖表读「计划 key → FR 引用」（REQ-261001154450-b918 t4）。
 *
 * 为什么锁这条：8475 的计划文档写了覆盖表、32/32 张卡的引用却是空的——文档说覆盖了、
 * 卡片上没引用，两边同时成立而无人发现。本用例证明文档表格**确实能被解析**，
 * 落库前的合并与拒绝判定才有依据。
 */
import { describe, it, expect } from 'vitest'
import { planRefsFromDoc, planRefsMissing } from '../src/application/internal/content-gate-wiring.js'

const doc = [
  '# 计划',
  '',
  '## 条款覆盖对照表',
  '',
  '| 需求条款 | 接收任务 | 覆盖说明 |',
  '|---|---|---|',
  '| FR-1 | t1、t2 | 契约与实现 |',
  '| FR-2 | t2 | 拒绝路径 |',
  '',
].join('\n')

function reader(files: Record<string, string>) {
  return {
    exists: (p: string) => p in files,
    read: async (p: string) => files[p] ?? '',
    stat: () => undefined,
  }
}

describe('planRefsFromDoc（FR-7 第二通道）', () => {
  it('覆盖表能被解析成 计划键 → FR 引用（文档通道不会静默失效）', async () => {
    const map = await planRefsFromDoc(
      reader({ 'docs/requirements/REQ-x/decomposition.md': doc }) as never,
      { id: 'REQ-x' } as never,
    )
    expect([...map.keys()].sort()).toEqual(['t1', 't2'])
    expect(map.get('t2')).toContain('FR-1')
    expect(map.get('t2')).toContain('FR-2')
  })

  it('文档不存在 → 空表（不抛；交给"两通道都空"的拒绝判定）', async () => {
    const map = await planRefsFromDoc(reader({}) as never, { id: 'REQ-x' } as never)
    expect(map.size).toBe(0)
  })
})

describe('planRefsMissing（FR-7 拒绝判定）', () => {
  it('两通道合并后仍为空的卡被点名 → 门禁据此拒绝落库', () => {
    const refs = new Map<string, string[]>([['t2', ['FR-1']]])
    expect(planRefsMissing(['t1', 't2', 't3'], refs)).toEqual(['t1', 't3'])
  })

  it('引用齐备 → 空数组（放行）', () => {
    const refs = new Map<string, string[]>([['t1', ['FR-1']], ['t2', ['FR-2']]])
    expect(planRefsMissing(['t1', 't2'], refs)).toEqual([])
  })
})
