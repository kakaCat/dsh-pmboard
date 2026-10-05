/**
 * 一次性交接持有器语义单测（REQ-260928222643-4d34 · serves: FR-2 · 设计 I-1/T-2/T-3，用例 TC-6）。
 *
 * 可证伪点：① 登记后 take 得值；② take 取走即清（第二次为 undefined）；③ clear 幂等；
 * ④ 空串/纯空白不登记空意图；⑤ peek 只读不消费。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  clearBoardFocus,
  peekBoardFocus,
  requestBoardFocus,
  subscribeBoardFocus,
  takeBoardFocus,
} from '../src/client/board-focus.ts'

describe('board-focus（一次性定位交接）', () => {
  beforeEach(() => { clearBoardFocus() })

  it('TC-6① 登记后 take 得值', () => {
    requestBoardFocus('REQ-a')
    expect(takeBoardFocus()).toBe('REQ-a')
  })

  it('TC-6② 取走即清：第二次 take 必为 undefined', () => {
    requestBoardFocus('REQ-a')
    takeBoardFocus()
    expect(takeBoardFocus()).toBeUndefined()
  })

  it('TC-6③ clear 幂等，peek 为 undefined', () => {
    requestBoardFocus('REQ-a')
    clearBoardFocus()
    clearBoardFocus()
    expect(peekBoardFocus()).toBeUndefined()
  })

  it('TC-6④ 空串/纯空白不登记空意图', () => {
    requestBoardFocus('   ')
    expect(peekBoardFocus()).toBeUndefined()
    expect(takeBoardFocus()).toBeUndefined()
  })

  it('peek 只读不消费', () => {
    requestBoardFocus('REQ-b')
    expect(peekBoardFocus()).toBe('REQ-b')
    expect(peekBoardFocus()).toBe('REQ-b')
    expect(takeBoardFocus()).toBe('REQ-b')
  })
})

/**
 * 订阅通道（REQ-261004111917-f473 FR-2 · serves: FR-2 · 不变量 I-7 · 设计 interfaces.md《board-focus 契约变更》）。
 *
 * 用例编号与 `design/test-cases.md` §TC-7 对齐；「消费/未消费」语义覆盖复核 R2/R3/R5/R6。
 */
describe('board-focus 订阅通道（看板已在屏时的定位）', () => {
  beforeEach(() => { clearBoardFocus() })

  it('TC-7a 有订阅者 → 同步收到 reqId，且 peek 为 undefined（不留 pending，防双跳）', () => {
    const got: string[] = []
    const off = subscribeBoardFocus((id) => { got.push(id) })
    requestBoardFocus('REQ-a')
    expect(got).toEqual(['REQ-a'])
    expect(peekBoardFocus()).toBeUndefined()
    expect(takeBoardFocus()).toBeUndefined()
    off()
  })

  it('TC-7b 多个订阅者都收到；退订其中一个后只通知剩下的', () => {
    const a: string[] = []
    const b: string[] = []
    const offA = subscribeBoardFocus((id) => { a.push(id) })
    const offB = subscribeBoardFocus((id) => { b.push(id) })
    requestBoardFocus('REQ-1')
    expect(a).toEqual(['REQ-1'])
    expect(b).toEqual(['REQ-1'])

    offA()
    offA() // 幂等
    requestBoardFocus('REQ-2')
    expect(a).toEqual(['REQ-1'])
    expect(b).toEqual(['REQ-1', 'REQ-2'])
    offB()
  })

  it('TC-7c 退订后回到一次性语义（peek 得值，等挂载取走）', () => {
    const got: string[] = []
    const off = subscribeBoardFocus((id) => { got.push(id) })
    off()
    requestBoardFocus('REQ-b')
    expect(got).toEqual([])
    expect(peekBoardFocus()).toBe('REQ-b')
    expect(takeBoardFocus()).toBe('REQ-b')
  })

  it('TC-7d 某个订阅者抛错：不影响其他订阅者与调用方，且按「未消费」处理不留丢意图', () => {
    const got: string[] = []
    const offBad = subscribeBoardFocus(() => { throw new Error('订阅者坏了') })
    const offGood = subscribeBoardFocus((id) => { got.push(id); return true })
    expect(() => requestBoardFocus('REQ-c')).not.toThrow()
    expect(got).toEqual(['REQ-c'])
    expect(peekBoardFocus()).toBeUndefined() // 好的那个消费了 → 不留 pending
    offBad()
    offGood()
  })

  it('TC-7e 空白输入：清掉既有 pending、且不通知订阅者（复核 R5 钉死）', () => {
    // 先在没有订阅者时留下一条 pending —— 这才是「空白是否真的清了 pending」的可证伪前置
    requestBoardFocus('REQ-a')
    expect(peekBoardFocus()).toBe('REQ-a')
    requestBoardFocus('   ')
    expect(peekBoardFocus()).toBeUndefined()

    // 有订阅者时：不通知
    const got: string[] = []
    const off = subscribeBoardFocus((id) => { got.push(id) })
    requestBoardFocus('REQ-d')
    requestBoardFocus('   ')
    expect(got).toEqual(['REQ-d'])
    expect(peekBoardFocus()).toBeUndefined()
    off()
  })

  it('TC-7f clearBoardFocus 只清 pending，不惊动订阅者', () => {
    const got: string[] = []
    const off = subscribeBoardFocus((id) => { got.push(id) })
    clearBoardFocus()
    expect(got).toEqual([])
    expect(peekBoardFocus()).toBeUndefined()
    off()
  })

  it('TC-7g 订阅者显式返回 false（不在屏/已卸载）→ 意图不被吃掉，回落为 pending（复核 R2）', () => {
    const off = subscribeBoardFocus(() => false)
    requestBoardFocus('REQ-e')
    expect(peekBoardFocus()).toBe('REQ-e') // 没人消费 → 留给下次挂载，而不是静默消失
    off()
  })

  it('TC-7h 全部订阅者都抛错 → 同样回落 pending（复核 R3：不允许「无痕迹」）', () => {
    const off = subscribeBoardFocus(() => { throw new Error('坏了') })
    requestBoardFocus('REQ-f')
    expect(peekBoardFocus()).toBe('REQ-f')
    off()
  })

  it('TC-7i 通知期间订阅集合被改（回调里退订/新增）不打乱本次迭代（复核 R6）', () => {
    const got: string[] = []
    let offSelf: () => void = () => {}
    const offA = subscribeBoardFocus((id) => {
      got.push('A:' + id)
      offSelf() // 迭代中退订自己
      subscribeBoardFocus((x) => { got.push('C:' + x) }) // 迭代中新增（不应参与本次通知）
    })
    offSelf = offA
    const offB = subscribeBoardFocus((id) => { got.push('B:' + id) })

    requestBoardFocus('REQ-g')
    expect(got).toEqual(['A:REQ-g', 'B:REQ-g']) // 新增的那个 C 不参与本次
    offB()
  })
})
