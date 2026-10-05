/**
 * T1–T4 · 体量算术与声明下限（REQ-261002175818-80a8 t1 / design/test-cases.md）。
 *
 * 为什么这四组断言必须先红：`Footprint.ts` 是本需求唯一的算法，协议层（声明搬运）、
 * 用例层（判定与返回体）、弹框层（批准文本）都调它。它错了，三处一起错。
 *
 * 口径三条（写死在断言里，改口径必须改这里）：
 *   · **未声明 ≠ 错误**：undefined/null → undefined，绝不冒充 0；
 *   · **严格大于才超容量**：detailUnits === capacity → over=false；
 *   · **下限是防缩水下界，不是完整性审计**：散文里没写路径就不计入。
 */
import { describe, it, expect } from 'vitest'
import {
  FOOTPRINT_ERROR,
  FootprintError,
  declaredFilesFloorFrom,
  assertFootprintFloor,
  footprintInvalidReason,
  judgeFootprint,
  normalizeFootprint,
  overCapacitySummary,
  suggestedBatchesOf,
} from '../src/domain/task/Footprint.js'
import { LIMITS } from '../src/domain/limits.js'

const CAP = LIMITS.roundDetailUnits

describe('T1 normalizeFootprint：未声明是正常态，形状非法逐个点名', () => {
  it('undefined / null → undefined（未声明 ≠ 错误，也不冒充 0）', () => {
    expect(normalizeFootprint(undefined)).toBeUndefined()
    expect(normalizeFootprint(null)).toBeUndefined()
  })

  it('合法三字段原样返回', () => {
    expect(normalizeFootprint({ files: 3, anchors: 2, chars: 900 })).toEqual({
      files: 3,
      anchors: 2,
      chars: 900,
    })
  })

  it.each([
    ['缺字段', { files: 1, anchors: 1 }],
    ['files=0', { files: 0, anchors: 1, chars: 1 }],
    ['files 负数', { files: -1, anchors: 1, chars: 1 }],
    ['files 非整数', { files: 1.5, anchors: 1, chars: 1 }],
    ['files 是字符串', { files: '3', anchors: 1, chars: 1 }],
    ['未知键', { files: 1, anchors: 1, chars: 1, extra: 1 }],
    ['超单值上限', { files: LIMITS.footprintValueMax + 1, anchors: 1, chars: 1 }],
    ['不是对象', [] as unknown],
  ])('形状非法逐个点名抛错：%s', (_name, raw) => {
    let caught: unknown
    try {
      normalizeFootprint(raw)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(FootprintError)
    expect((caught as FootprintError).code).toBe(FOOTPRINT_ERROR)
    expect(FOOTPRINT_ERROR).toBe('REQBOARD_BAD_FOOTPRINT')
  })

  it('footprintInvalidReason 对合法值回 undefined、对非法值给人读原因', () => {
    expect(footprintInvalidReason({ files: 1, anchors: 1, chars: 1 })).toBeUndefined()
    expect(footprintInvalidReason({ files: 1.5, anchors: 1, chars: 1 })).toContain('files')
  })
})

describe('T2 judgeFootprint：合成细节量与「严格大于才算超」', () => {
  it('{100,20,6000} → 113 DU、超容量、建议 8 批', () => {
    const j = judgeFootprint({ files: 100, anchors: 20, chars: 6000 }, CAP)
    expect(j.detailUnits).toBe(113)
    expect(j.over).toBe(true)
    expect(j.capacity).toBe(CAP)
    expect(j.suggestedBatches).toBe(8)
  })

  it('{1,2,800} → 2.4 DU、不超容量、无建议批数', () => {
    const j = judgeFootprint({ files: 1, anchors: 2, chars: 800 }, CAP)
    expect(j.detailUnits).toBeCloseTo(2.4, 10)
    expect(j.over).toBe(false)
    expect(j.suggestedBatches).toBeUndefined()
  })

  it('detailUnits 恰好等于容量 → 不超（严格大于）', () => {
    // 10×1 + 4×0.5 + 8000/2000 = 16.0，正好等于 CAP
    const j = judgeFootprint({ files: 10, anchors: 4, chars: 8000 }, CAP)
    expect(j.detailUnits).toBe(CAP)
    expect(j.over).toBe(false)
    expect(j.suggestedBatches).toBeUndefined()
  })

  it('容量非法 → 响亮报错，不静默按 0 处理', () => {
    expect(() => judgeFootprint({ files: 1, anchors: 1, chars: 1 }, 0)).toThrow(FootprintError)
  })
})

describe('T3 declaredFilesFloorFrom：下限是防缩水的下界，不是完整性审计', () => {
  it('点到 3 个路径 → 3', () => {
    const impl = '改 src/a.ts 与 src/b.ts，补 tests/c.test.ts 的用例'
    expect(declaredFilesFloorFrom(impl)).toBe(3)
  })

  it('同一路径写两次仍算 1 个', () => {
    expect(declaredFilesFloorFrom('src/a.ts 再次修改 src/a.ts')).toBe(1)
  })

  it('纯散文（不带前缀）→ 0；undefined → 0', () => {
    expect(declaredFilesFloorFrom('就改一下那个文件，别的不动')).toBe(0)
    expect(declaredFilesFloorFrom(undefined)).toBe(0)
  })

  it('四类前缀都认（src / tests / docs / scripts）', () => {
    const impl = 'src/a.ts tests/b.ts docs/c.md scripts/d.ts'
    expect(declaredFilesFloorFrom(impl)).toBe(4)
  })
})

describe('T4 assertFootprintFloor：允许留余量，不允许缩水', () => {
  const impl = '改 src/a.ts 与 src/b.ts，补 tests/c.test.ts'

  it('声明小于证据 → 抛错且消息给出实际计数', () => {
    let caught: unknown
    try {
      assertFootprintFloor({ files: 1, anchors: 1, chars: 100 }, impl)
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(FootprintError)
    expect((caught as FootprintError).code).toBe(FOOTPRINT_ERROR)
    expect((caught as Error).message).toContain('3')
  })

  it('声明等于证据 → 通过', () => {
    expect(() => assertFootprintFloor({ files: 3, anchors: 1, chars: 100 }, impl)).not.toThrow()
  })

  it('声明大于证据（留余量）→ 通过', () => {
    expect(() => assertFootprintFloor({ files: 5, anchors: 1, chars: 100 }, impl)).not.toThrow()
  })

  it('未声明 → 不判定（也不报错）', () => {
    expect(() => assertFootprintFloor(undefined, impl)).not.toThrow()
  })
})

describe('建议批数与审批摘要（弹框/评论共用同一份纯函数）', () => {
  it('suggestedBatchesOf 下界是 2（只有真超容量才用得上）', () => {
    expect(suggestedBatchesOf(113, 16)).toBe(8)
    expect(suggestedBatchesOf(17, 16)).toBe(2)
    expect(suggestedBatchesOf(1, 16)).toBe(2)
  })

  it('无超容量卡 → 空串（调用方拼文本时逐字节不变）', () => {
    expect(overCapacitySummary([{ key: 't1', footprint: { files: 1, anchors: 1, chars: 100 } }], CAP)).toBe('')
    expect(overCapacitySummary([{ key: 't1' }], CAP)).toBe('')
    expect(overCapacitySummary([], CAP)).toBe('')
  })

  it('单张超容量卡 → 写全 DU 与批数', () => {
    const text = overCapacitySummary([{ key: 't3', footprint: { files: 100, anchors: 20, chars: 6000 } }], CAP)
    expect(text).toContain('t3')
    expect(text).toContain('113')
    expect(text).toContain('8')
  })

  it('多张超容量卡 → 压缩成一行但仍点名每张卡（批数逐字断言，不只 toContain）', () => {
    const text = overCapacitySummary(
      [
        { key: 't3', footprint: { files: 100, anchors: 20, chars: 6000 } },
        { key: 't7', footprint: { files: 40, anchors: 6, chars: 4000 } },
      ],
      CAP,
    )
    // t3: 100+10+3=113 → 8 批；t7: 40+3+2=45 → 3 批。没有截断就不许出现省略号。
    expect(text).toBe('超容量 2 张：t3(建议8批)、t7(建议3批)')
  })
})

/**
 * 复核回归（对抗式复核发现的缺陷，逐条钉死）。
 *
 * 为什么单列一节：这些缺陷**单跑用例时全部幸存**（复核报告里 9 个变异有 5 个存活），
 * 原因是原用例只有正向断言、且把「批数」这类关键事实让 `toContain` 蒙过去了。
 * 本节每条都对准一个**已实测的缺陷**，修前必红。
 */
describe('复核回归：路径下限的误计与漏计（FR-2 的两个失败方向）', () => {
  it('URL 与相似目录名不算（否则下限虚高 → 硬拒合法计划）', () => {
    expect(declaredFilesFloorFrom('照 https://example.com/src/a.ts 的方式改 src/z.ts')).toBe(1)
    expect(declaredFilesFloorFrom('改 mysrc/a.ts')).toBe(0)
    expect(declaredFilesFloorFrom('改 a-src/b.ts')).toBe(0)
  })

  it('反斜杠与大写前缀要计入（否则下限为 0 → FR-2 整条被绕过）', () => {
    expect(declaredFilesFloorFrom('改 src\\a.ts')).toBe(1)
    expect(declaredFilesFloorFrom('改 Src/a.ts')).toBe(1)
    expect(declaredFilesFloorFrom('改 src\\a.ts 和 src\\b.ts 和 src\\c.ts')).toBe(3)
  })

  it('只有四类前缀计入（反向断言：白名单不许被放宽）', () => {
    expect(declaredFilesFloorFrom('改 lib/a.ts 与 vendor/b.ts')).toBe(0)
    expect(declaredFilesFloorFrom('裸 src/ 不是文件')).toBe(0)
  })

  it('下限消息必须点名「声明小于证据」、列出被计到的路径、并给修复指引', () => {
    let caught: unknown
    try {
      assertFootprintFloor({ files: 1, anchors: 1, chars: 100 }, '改 src/a.ts 与 tests/b.test.ts')
    } catch (err) {
      caught = err
    }
    const msg = (caught as Error).message
    expect(msg).toContain('声明小于证据')
    expect(msg).toContain('src/a.ts')
    expect(msg).toContain('tests/b.test.ts')
    expect(msg).toContain('不允许缩水')
  })
})

describe('复核回归：判定口径与未声明语义', () => {
  it('比较用原始值，不许先取整（否则 16.0005 被误判为不超容量）', () => {
    // 1 + 0.5 + 29001/2000 = 16.0005 > 16
    const j = judgeFootprint({ files: 1, anchors: 1, chars: 29001 }, CAP)
    expect(j.over).toBe(true)
    expect(j.detailUnits).toBe(16) // 展示值仍保留两位小数口径
  })

  it('容量为非整数时，raw 恰好等于容量 → 不超（取整后比较会误判为超）', () => {
    // 1 + 0.5 + 28998/2000 = 15.999，容量恰为 15.999
    const j = judgeFootprint({ files: 1, anchors: 1, chars: 28998 }, 15.999)
    expect(j.over).toBe(false)
  })

  it('体量对象非法时 judgeFootprint 必须响亮报错，不许静默按 NaN/强制转换放行', () => {
    expect(() => judgeFootprint({} as never, CAP)).toThrow(FootprintError)
    expect(() => judgeFootprint({ files: '3', anchors: 1, chars: 1 } as never, CAP)).toThrow(FootprintError)
    expect(() => judgeFootprint({ files: -100, anchors: 1, chars: 1 }, CAP)).toThrow(FootprintError)
  })

  it('footprintInvalidReason(undefined/null) 必须是「合法」——否则旧计划会被当成非法拒掉（FR-9 陷阱）', () => {
    expect(footprintInvalidReason(undefined)).toBeUndefined()
    expect(footprintInvalidReason(null)).toBeUndefined()
  })
})

describe('复核回归：摘要的长度预算（弹框题干只有 220 字符）', () => {
  it('默认预算内不超限，且截断时如实说明省略了几张', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      key: 'k'.repeat(20) + String(i),
      footprint: { files: 100, anchors: 20, chars: 6000 },
    }))
    const text = overCapacitySummary(many, CAP)
    expect(text.length).toBeLessThanOrEqual(LIMITS.footprintSummaryMaxChars)
    expect(text).toContain('超容量 10 张')
    expect(text).toContain('等')
  })

  it('显式预算生效（看板评论可以要更多空间，但必须由调用方明确给出）', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      key: 'k'.repeat(20) + String(i),
      footprint: { files: 100, anchors: 20, chars: 6000 },
    }))
    expect(overCapacitySummary(many, CAP, 1000).length).toBeGreaterThan(overCapacitySummary(many, CAP).length)
  })
})

/**
 * 复核补洞（2026-10-04，由 t6 复核实测报入）：多卡分支的最终串必须也受硬预算约束。
 * 原实现只在候选收敛时按预算试探，而"停在第 i 项"与实际停下后剩余的项数差 1，
 * 于是最终串可能超预算（实测 6 张 × 21 字符 key → 124 > 120）。
 */
describe('摘要预算：多卡分支的最终串也必须 ≤ maxChars（修前必红）', () => {
  it('6 张超容量卡 + 21 字符 key → 最终串不超预算', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      key: 'k'.repeat(20) + String(i),
      footprint: { files: 100, anchors: 20, chars: 6000 },
    }))
    const text = overCapacitySummary(many, CAP)
    expect(text.length).toBeLessThanOrEqual(LIMITS.footprintSummaryMaxChars)
  })

  it('预算压到极小时也不越界（含「只有一项且带省略尾巴」的分支）', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      key: 'k'.repeat(20) + String(i),
      footprint: { files: 100, anchors: 20, chars: 6000 },
    }))
    for (const budget of [10, 20, 33, 60, 120]) {
      expect(overCapacitySummary(many, CAP, budget).length).toBeLessThanOrEqual(budget)
    }
  })
})
