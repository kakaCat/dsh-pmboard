/**
 * 席位读取与折算（REQ-261003215944-9e04 FR-2 / t1）。
 *
 * 【为什么要有这道门】
 * 「一条需求绑哪个窗口」原先只有 `sourceSessionId` 一个单值字段。本需求要让它变成
 * 「一个 owner + 若干席位」，但**39 条存量需求一条都不许改写**——否则回滚无路。
 * 于是契约定成：`seats` 有值以它为准，缺省则**读端折算**为单 owner，折算结果**不落盘**。
 *
 * 【四个层次守护（任一被回退即红）】
 *   1. `seats` 有值 → 原样返回（不改写、不重排、不补字段）；
 *   2. `seats` 缺省 + 有 `sourceSessionId` → 折算单 owner，`joinedAt` 取需求 `createdAt`
 *      （owner 是立项那一刻入席的，不是 1970）；
 *   3. 两者都缺 → **空数组**（不伪造 owner：没有来源窗口的需求就是没人坐席）；
 *   4. 只读：折算不修改入参、不写盘（入参被冻结也不抛）。
 */
import { describe, it, expect } from 'vitest'
import { seatsOf } from '../src/application/internal/window.js'
import { REQBOARD_SCHEMA_VERSION, type RequirementRecord, type WindowSeat } from '../src/shared/protocol.js'

/** 造一条只带折算所需三个字段的记录（其余字段与本卡无关）。 */
function rec(fields: {
  seats?: WindowSeat[]
  sourceSessionId?: string
  createdAt?: number
}): Pick<RequirementRecord, 'seats' | 'sourceSessionId' | 'createdAt'> {
  return {
    ...(fields.seats !== undefined ? { seats: fields.seats } : {}),
    ...(fields.sourceSessionId !== undefined ? { sourceSessionId: fields.sourceSessionId } : {}),
    createdAt: fields.createdAt ?? 1_791_000_000_000,
  }
}

describe('seatsOf：席位读取与读端折算（FR-2）', () => {
  it('形态①：seats 有值 → 原样返回（含多席位，owner/worker/observer 全保留）', () => {
    const seats: WindowSeat[] = [
      { windowKey: 'session-owner', role: 'owner', joinedAt: 1_791_000_000_001 },
      { windowKey: 'session-worker', role: 'worker', joinedAt: 1_791_000_000_002, lastSeenAt: 1_791_000_000_003 },
      { windowKey: 'session-observer', role: 'observer', joinedAt: 1_791_000_000_004 },
    ]
    // 同一条记录里 sourceSessionId 故意与 owner 不同——有 seats 时它以 seats 为准，不被覆盖
    const out = seatsOf(rec({ seats, sourceSessionId: 'session-legacy' }))
    expect(out).toBe(seats) // 原样（同一引用）：不做拷贝、不重排
    expect(out.map(s => s.role)).toEqual(['owner', 'worker', 'observer'])
  })

  it('形态②：seats 缺省 → 折算为单 owner，joinedAt 取需求 createdAt', () => {
    const createdAt = 1_791_035_984_428
    const out = seatsOf(rec({ sourceSessionId: 'session-278681bb', createdAt }))
    expect(out).toEqual([{ windowKey: 'session-278681bb', role: 'owner', joinedAt: createdAt }])
    // 反例：不是 0 / undefined（"缺时间"不许伪装成 1970）
    expect(out[0]!.joinedAt).toBe(createdAt)
    expect(out[0]!.joinedAt).not.toBe(0)
  })

  it('形态③：两者都缺 → 空数组（不伪造 owner）', () => {
    expect(seatsOf(rec({}))).toEqual([])
    expect(seatsOf(rec({ sourceSessionId: '' }))).toEqual([]) // 空串视为缺省，不折算出空窗 key
  })

  it('只读：折算不修改入参（入参被冻结也不抛）', () => {
    const input = Object.freeze(rec({ sourceSessionId: 'session-frozen' }))
    const out = seatsOf(input)
    expect(out).toEqual([{ windowKey: 'session-frozen', role: 'owner', joinedAt: input.createdAt }])
    expect(Object.keys(input).sort()).toEqual(['createdAt', 'sourceSessionId']) // 没多出 seats
    expect('seats' in input).toBe(false)
  })

  it('契约：新增可缺省字段不改台账版本（存量零迁移）', () => {
    expect(REQBOARD_SCHEMA_VERSION).toBe(9)
  })
})
