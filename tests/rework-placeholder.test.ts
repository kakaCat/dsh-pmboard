/**
 * 占位卡判据单测（REQ-261005122915-9f90 t1 / FR-1, FR-2）。
 *
 * 三条判据（对齐 t1 卡）：
 *  ① 占位卡（`reworkOf` 非空）不进 `liveRealCards`；
 *  ② `canceled` 卡不进；
 *  ③ 普通真卡进。
 *
 * 另测边界：`reworkOf: ''`（空串）与缺键都算「非占位」——落库时缺省不带键，
 * 只有物化才写值；空串是等价写法，不得被判成占位。
 */
import { describe, expect, it } from 'vitest'
import { isReworkPlaceholder, liveRealCards } from '../src/domain/task/ReworkPlaceholder.js'

describe('isReworkPlaceholder · 判据只看 reworkOf', () => {
  it('reworkOf 非空 → 占位', () => {
    expect(isReworkPlaceholder({ reworkOf: 't-old' })).toBe(true)
  })

  it('缺键 / 空串 → 非占位（普通卡落库不带该键）', () => {
    expect(isReworkPlaceholder({})).toBe(false)
    expect(isReworkPlaceholder({ reworkOf: '' })).toBe(false)
  })

  it('标题前缀不参与判定（改名不影响）', () => {
    expect(isReworkPlaceholder({ reworkOf: 't-old' })).toBe(true)
  })
})

describe('liveRealCards · 活卡里的真卡', () => {
  const tasks = [
    { id: 't-real', status: 'todo' },
    { id: 't-done', status: 'done' },
    { id: 't-placeholder', status: 'todo', reworkOf: 't-real' },
    { id: 't-canceled', status: 'canceled' },
    { id: 't-canceled-placeholder', status: 'canceled', reworkOf: 't-real' },
  ]

  it('占位卡不进（FR-1：占位不得冒充已落库）', () => {
    expect(liveRealCards(tasks).map(t => t.id)).toEqual(['t-real', 't-done'])
  })

  it('canceled 卡不进', () => {
    expect(liveRealCards(tasks).some(t => t.status === 'canceled')).toBe(false)
  })

  it('普通真卡进（含 done —— 已完成的活同样是真活）', () => {
    expect(liveRealCards(tasks).map(t => t.id)).toContain('t-done')
  })

  it('不改传入数组（纯函数）+ 空数组安全', () => {
    const input = [...tasks]
    liveRealCards(input)
    expect(input.length).toBe(tasks.length)
    expect(liveRealCards([])).toEqual([])
  })

  it('只有占位卡时结果为空（本需求的现场形态）', () => {
    const onlyPlaceholders = [
      { id: 'p1', status: 'todo', reworkOf: 't-a' },
      { id: 'p2', status: 'todo', reworkOf: 't-b' },
    ]
    expect(liveRealCards(onlyPlaceholders)).toEqual([])
  })
})
