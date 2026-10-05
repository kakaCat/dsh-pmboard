/**
 * 会话运行态读数与需求→会话映射单测（REQ-261004210128-283d t1/t4 · TC-01～TC-07）。
 *
 * 覆盖（每条断言对应设计 `design/test-cases.md` 的一个编号）：
 *  - TC-01 byId 真假值与未知会话：`running === true` 才算在跑；
 *  - TC-02 服务缺失：三个导出函数都不抛，分别返回 false / 空集 / no-op 退订；
 *  - TC-03 旧客户端（无 `subscribe` 能力）：退订仍可安全调用，回调不被触发；
 *  - TC-04～TC-06 需求映射真值表：席位权威（任一在跑即算） / 无 seats 折算单 owner / 人工建卡 false；
 *  - TC-07 订阅与退订：回调触发一次，退订后不再触发，且退订幂等。
 *
 * 环境：node（本模块纯逻辑，零 DOM、零 IO）；服务以假投影注入，不触碰真实 DSH 服务。
 *
 * serves: FR-1, FR-2, FR-5, FR-6
 */
import { describe, it, expect } from 'vitest'
import {
  NO_RUNNING,
  isSessionRunning,
  relevantSessionIds,
  requirementRunning,
  runningAmong,
  runningSessionIds,
  sameRunningSet,
  subscribeSessionRunning,
  type SessionRunningAccess,
} from '../src/client/session-running.ts'

/** 假服务投影：`byId === undefined` 表示「服务在，但列表还没到」。 */
function fakeAccess(byId: Record<string, unknown> | undefined, opts: { subscribe?: boolean } = {}): {
  access: SessionRunningAccess
  fire: () => void
  listeners: Array<() => void>
  unsubscribed: number
} {
  const listeners: Array<() => void> = []
  let unsubscribed = 0
  const withSubscribe = opts.subscribe !== false
  const access: SessionRunningAccess = {
    getSessions: () => ({
      list: {
        getSnapshot: () => (byId === undefined ? undefined : { byId }),
        ...(withSubscribe
          ? {
              subscribe: (fn: () => void): (() => void) => {
                listeners.push(fn)
                return () => {
                  unsubscribed += 1
                  const i = listeners.indexOf(fn)
                  if (i >= 0) listeners.splice(i, 1)
                }
              },
            }
          : {}),
      },
    }) as never,
  }
  return { access, fire: () => { for (const fn of [...listeners]) fn() }, listeners, unsubscribed }
}

/** 服务不可得（旧客户端 / 未注入）。 */
const noService: SessionRunningAccess = { getSessions: () => undefined }

describe('TC-01 单会话运行态读数', () => {
  it('running === true 才算在跑；false / 未知会话 / 空 id 一律不在跑', () => {
    const { access } = fakeAccess({ a: { running: true }, b: { running: false } })
    expect(isSessionRunning('a', access)).toBe(true)
    expect(isSessionRunning('b', access)).toBe(false)
    expect(isSessionRunning('zzz', access)).toBe(false)
    expect(isSessionRunning('', access)).toBe(false)
    expect(isSessionRunning(undefined, access)).toBe(false)
  })

  it('running 字段形状异常（缺失 / 非布尔 / 行非对象）一律判不在跑，不猜', () => {
    const { access } = fakeAccess({ a: {}, b: { running: 'yes' }, c: null, d: 1 })
    expect(isSessionRunning('a', access)).toBe(false)
    expect(isSessionRunning('b', access)).toBe(false)
    expect(isSessionRunning('c', access)).toBe(false)
    expect(isSessionRunning('d', access)).toBe(false)
  })

  it('runningSessionIds 只收 running === true 的会话', () => {
    const { access } = fakeAccess({ a: { running: true }, b: { running: false }, c: { running: true } })
    expect([...runningSessionIds(access)].sort()).toEqual(['a', 'c'])
  })

  it('列表还没到（getSnapshot → undefined）→ 空集，不抛', () => {
    const { access } = fakeAccess(undefined)
    expect(runningSessionIds(access)).toBe(NO_RUNNING)
    expect(isSessionRunning('a', access)).toBe(false)
  })
})

describe('TC-02 服务缺失时诚实降级（不抛、不伪造）', () => {
  it('三个导出函数都不抛，返回 false / 空集 / 可安全调用的 no-op 退订', () => {
    expect(isSessionRunning('a', noService)).toBe(false)
    expect(runningSessionIds(noService)).toBe(NO_RUNNING)
    let called = 0
    const off = subscribeSessionRunning(() => { called += 1 }, noService)
    expect(typeof off).toBe('function')
    off()
    off() // 幂等：重复调用不抛
    expect(called).toBe(0)
  })

  it('getSessions 本身抛错 → 同样降级（读数不该把看板拖成错误页）', () => {
    const access: SessionRunningAccess = {
      getSessions: () => { throw new Error('service exploded') },
    }
    expect(isSessionRunning('a', access)).toBe(false)
    expect(runningSessionIds(access)).toBe(NO_RUNNING)
    expect(() => subscribeSessionRunning(() => {}, access)).not.toThrow()
  })
})

describe('TC-03 旧客户端（无 subscribe 能力）', () => {
  it('退订仍可安全调用，回调永远不被触发', () => {
    const { access, fire, listeners } = fakeAccess({ a: { running: true } }, { subscribe: false })
    let called = 0
    const off = subscribeSessionRunning(() => { called += 1 }, access)
    expect(listeners).toHaveLength(0)
    fire()
    off()
    expect(called).toBe(0)
  })
})

describe('TC-04～TC-06 需求→会话映射真值表（席位权威）', () => {
  const only = (sid: string) => (s: string): boolean => s === sid

  it('TC-04 seats 有值：任一在跑即算在跑（worker 在跑也算）', () => {
    const req = { seats: [{ windowKey: 'a' }, { windowKey: 'b' }], sourceSessionId: 'a' }
    expect(requirementRunning(req, only('b'))).toBe(true)
    expect(requirementRunning(req, only('a'))).toBe(true)
    expect(requirementRunning(req, only('zzz'))).toBe(false)
  })

  it('TC-04b seats 为权威：显式空 seats 不回落 sourceSessionId', () => {
    expect(requirementRunning({ seats: [], sourceSessionId: 'a' }, only('a'))).toBe(false)
  })

  it('TC-05 无 seats → 折算单 owner sourceSessionId', () => {
    expect(requirementRunning({ sourceSessionId: 'a' }, only('a'))).toBe(true)
    expect(requirementRunning({ sourceSessionId: 'a' }, only('b'))).toBe(false)
  })

  it('TC-06 人工建卡（两者皆无）→ 不在跑', () => {
    expect(requirementRunning({}, () => true)).toBe(false)
  })

  it('幂等：同输入两次调用结果一致', () => {
    const req = { seats: [{ windowKey: 'a' }] }
    expect(requirementRunning(req, only('a'))).toBe(requirementRunning(req, only('a')))
  })
})

describe('TC-07 订阅与退订', () => {
  it('通知触发回调一次；退订后再通知不再触发', () => {
    const { access, fire } = fakeAccess({ a: { running: true } })
    let called = 0
    const off = subscribeSessionRunning(() => { called += 1 }, access)
    fire()
    expect(called).toBe(1)
    off()
    fire()
    expect(called).toBe(1)
  })

  it('订阅能力在但未给退订句柄 → 退订函数仍可安全调用', () => {
    const access: SessionRunningAccess = {
      getSessions: () => ({ list: { getSnapshot: () => ({ byId: {} }), subscribe: () => undefined } }) as never,
    }
    const off = subscribeSessionRunning(() => {}, access)
    expect(typeof off).toBe('function')
    expect(() => off()).not.toThrow()
  })
})

describe('重绘门控辅助（FR-5）', () => {
  it('relevantSessionIds：席位 ∪ 来源窗口，去重且忽略空值', () => {
    const ids = relevantSessionIds([
      { seats: [{ windowKey: 'a' }, { windowKey: 'b' }] },
      { sourceSessionId: 'c' },
      { seats: [{ windowKey: 'a' }] },
      {},
      { seats: [{ windowKey: '' }] },
    ])
    expect([...ids].sort()).toEqual(['a', 'b', 'c'])
  })

  it('sameRunningSet：空集与 NO_RUNNING 视为相同', () => {
    expect(sameRunningSet(new Set(['a']), new Set(['a']))).toBe(true)
    expect(sameRunningSet(new Set(['a']), new Set(['b']))).toBe(false)
    expect(sameRunningSet(new Set(['a', 'b']), new Set(['a']))).toBe(false)
    expect(sameRunningSet(new Set(), NO_RUNNING)).toBe(true)
  })

  it('runningAmong：只保留相关会话；交集为空返回 NO_RUNNING', () => {
    expect([...runningAmong(new Set(['a', 'b']), new Set(['a', 'b', 'q']))].sort()).toEqual(['a', 'b'])
    expect(runningAmong(new Set(['q']), new Set(['a']))).toBe(NO_RUNNING)
    expect(runningAmong(new Set(), new Set(['a']))).toBe(NO_RUNNING)
  })
})
