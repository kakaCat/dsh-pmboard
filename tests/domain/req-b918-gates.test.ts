/**
 * L1 领域单测 · 收尾门四组判据（REQ-261001154450-b918 t1 / serves: FR-1, FR-2, FR-4, FR-5, FR-6）。
 *
 * 锁四件事（这四条都是"记账环节"的判据，改动前没有机器可查的实现）：
 *  ① unverified 第三态：通过但没留实际结果 → 不算通过（FR-1）；
 *  ② 系统项通过必须带书面处置，否则点名（FR-2）；
 *  ③ 节流剩余时间可算，供拒绝文案引用（FR-4）；
 *  ④ 挂起 TTL 与收尾闭环缺口（FR-5 / FR-6）。
 *
 * 修前必红：①②④ 所依赖的判定函数此前不存在（unverified 态、disposition、closingGap）。
 */
import { describe, it, expect } from 'vitest'
import {
  applyVerdicts,
  isAllPassed,
  isSystemItem,
  sheetGateStatus,
  unverifiedItemsOf,
  dispositionMissingItems,
  type SheetLike,
} from '../../src/domain/workflow/AcceptanceSheetSpec.js'
import { findRecentAgentDoneTask, doneThrottleRemainingMs } from '../../src/domain/workflow/DoneEvidenceSpec.js'
import { closingGapOf, isClosed, isUnverifiedItem } from '../../src/domain/status/Predicates.js'
import { LIMITS } from '../../src/domain/limits.js'

const base = { version: 1, generatedAt: 0, generatedBy: { kind: 'agent' as const } }
const item = (over: Record<string, unknown>) => ({
  id: 'v1-1',
  source: { kind: 'requirement' as const },
  criterion: '某验收项',
  evidence: [],
  status: 'passed',
  ...over,
}) as never
const sheet = (items: unknown[]): SheetLike => ({ ...base, items: items as never })

describe('① unverified 第三态（FR-1）', () => {
  it('通过但没留实际结果 → 不通过、门状态 pending、被点名', () => {
    const s = sheet([item({ id: 'v1-1', status: 'unverified' })])
    expect(isAllPassed(s)).toBe(false)
    expect(sheetGateStatus(s)).toBe('pending')
    expect(unverifiedItemsOf(s)).toEqual(['v1-1'])
    expect(isUnverifiedItem({ status: 'unverified' })).toBe(true)
    expect(isUnverifiedItem({ status: 'passed' })).toBe(false)
  })

  it('全部 passed（无 unverified）才放行', () => {
    const s = sheet([item({ id: 'v1-1' }), item({ id: 'v1-2', source: { kind: 'task', taskId: 't-1' } })])
    expect(isAllPassed(s)).toBe(true)
    expect(sheetGateStatus(s)).toBe('passed')
    expect(unverifiedItemsOf(s)).toEqual([])
  })

  it('有 failed → blocked（优先级高于 pending）', () => {
    const s = sheet([item({ id: 'v1-1', status: 'failed' }), item({ id: 'v1-2', status: 'unverified' })])
    expect(sheetGateStatus(s)).toBe('blocked')
  })
})

describe('② 系统项必须带书面处置（FR-2）', () => {
  it('系统项（gapKind）通过且处置为空 → 点名', () => {
    const s = sheet([item({ id: 'v1-3', gapKind: 'traceability', opinion: '' })])
    expect(isSystemItem({ gapKind: 'traceability', criterion: 'x' })).toBe(true)
    expect(dispositionMissingItems(s)).toEqual(['v1-3'])
  })

  it('旧类「不可照着验」前缀项同样算系统项', () => {
    const s = sheet([item({ id: 'v1-4', criterion: '验收项不可照着验（历史数据）：以下…', opinion: '  ' })])
    expect(isSystemItem({ criterion: '验收项不可照着验（历史数据）：以下…' })).toBe(true)
    expect(dispositionMissingItems(s)).toEqual(['v1-4'])
  })

  it('写了处置的系统项与普通项都不被点名', () => {
    const s = sheet([
      item({ id: 'v1-3', gapKind: 'e2e', opinion: '确认无需 E2E：纯函数模块，无外部接口' }),
      item({ id: 'v1-4', criterion: '普通项', opinion: '' }),
    ])
    expect(dispositionMissingItems(s)).toEqual([])
  })
})

describe('③ 节流剩余时间可算（FR-4）', () => {
  const tasks = [{
    id: 't-other', title: '别的卡', requirementId: 'REQ-X',
    statusHistory: [{ status: 'done', by: { kind: 'agent' }, at: 1_000 }],
  }]

  it('60s 窗口内返回剩余毫秒（供文案写"还要等 N 秒"）', () => {
    // done 发生在 t=1000，窗口 60s → t=30000 时还剩 31s
    expect(doneThrottleRemainingMs(tasks, 't-me', 'REQ-X', 30_000, LIMITS.doneThrottleMs)).toBe(31_000)
    expect(findRecentAgentDoneTask(tasks, 't-me', 'REQ-X', 30_000, LIMITS.doneThrottleMs)?.id).toBe('t-other')
  })

  it('窗口外返回 0；他人关闭 / 别的需求不节流', () => {
    expect(doneThrottleRemainingMs(tasks, 't-me', 'REQ-X', 70_000, LIMITS.doneThrottleMs)).toBe(0)
    expect(doneThrottleRemainingMs(tasks, 't-other', 'REQ-X', 30_000, LIMITS.doneThrottleMs)).toBe(0)
    expect(doneThrottleRemainingMs(tasks, 't-me', 'REQ-Y', 30_000, LIMITS.doneThrottleMs)).toBe(0)
  })
})

describe('④ 挂起 TTL 与收尾闭环（FR-5 / FR-6）', () => {
  it('TTL 具名常量存在且为 30 分钟（与 capture 拒绝同口径）', () => {
    expect(LIMITS.pendingConfirmTtlMs).toBe(30 * 60_000)
  })

  it('archived 且无 archive 产物 → 收尾未闭环；补上即闭环', () => {
    expect(closingGapOf({ status: 'archived', artifacts: [] })).toBe('archive_missing')
    expect(closingGapOf({ status: 'archived', artifacts: [{ kind: 'requirement' }] })).toBe('archive_missing')
    expect(closingGapOf({ status: 'archived', artifacts: [{ kind: 'archive' }] })).toBeUndefined()
    expect(isClosed({ status: 'archived', artifacts: [{ kind: 'archive' }] })).toBe(true)
  })

  it('未归档的需求不谈闭环（不误报）', () => {
    expect(closingGapOf({ status: 'accepting', artifacts: [] })).toBeUndefined()
    expect(isClosed({ status: 'implementing', artifacts: [] })).toBe(false)
  })
})

describe('⑤ 系统项通过必须带处置（FR-2：整批硬拒，且先验后改）', () => {
  it('系统项通过但处置为空 → 抛 system_item_disposition_required，且不留下半批已改的记录', () => {
    const s1 = sheet([item({ id: 'v1-1', status: 'pending', gapKind: 'traceability' })])
    expect(() => applyVerdicts(s1, [{ itemId: 'v1-1', status: 'passed' }], { kind: 'human' }, 1, []))
      .toThrowError(/系统项通过必须写明处置/)
    expect(s1.items[0]!.status).toBe('pending')
  })

  it('写了处置即放行；普通项通过但缺实际结果仍被拒（两种拒绝互不替代）', () => {
    const s1 = sheet([item({ id: 'v1-1', status: 'pending', gapKind: 'e2e' })])
    expect(() => applyVerdicts(s1, [{ itemId: 'v1-1', status: 'passed', opinion: '确认无需 E2E：纯函数模块，无外部接口' }], { kind: 'human' }, 1, []))
      .not.toThrow()
    const s2 = sheet([item({ id: 'v1-2', status: 'pending', criterion: '普通项' })])
    expect(() => applyVerdicts(s2, [{ itemId: 'v1-2', status: 'passed' }], { kind: 'human' }, 1, []))
      .toThrowError(/必须填写实际结果/)
  })

  it('unverified 不需要意见（未复核本身就是它的语义）', () => {
    const s1 = sheet([item({ id: 'v1-1', status: 'pending' })])
    expect(() => applyVerdicts(s1, [{ itemId: 'v1-1', status: 'unverified' }], { kind: 'human' }, 1, [])).not.toThrow()
    expect(s1.items[0]!.status).toBe('unverified')
  })
})
