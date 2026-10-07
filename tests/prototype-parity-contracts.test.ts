/**
 * 可参数化对齐判据的用例（REQ-261006201649-cc89 t4 · FR-5）。
 *
 * 三组契约各有正反例，且每条违规必须带锚点——这两条是本卡的验收标准。
 * 反面样本刻意用**真实事故的形状**（`data-result-source` vs `data-result-src`，
 * 见 REQ-261006092213-4f5b 的 `evidence/prototype-conformance.md:18`）。
 */
import { describe, it, expect } from 'vitest'
import {
  formatParityViolations,
  prototypeParityViolations,
  type ParityContracts,
} from '../src/domain/prototype/ParityContracts.ts'

const REF = 'prototypes/detail.html#FR-2'
const P = '<section id="FR-2"><div class="dsh-pm-card dsh-pm-flags"></div></section>'

const contracts = (over: Partial<ParityContracts> = {}): ParityContracts => ({
  classes: [], dataAttrs: [], order: [], ...over,
})

describe('① class 契约', () => {
  it('全部命中 → 零违规', () => {
    const impl = '<div class="dsh-pm-card dsh-pm-flags"></div>'
    expect(prototypeParityViolations(P, impl, contracts({ classes: ['dsh-pm-card', 'dsh-pm-flags'] }), REF)).toEqual([])
  })

  it('少一个 class → 一条 classes 违规，expected 点名该类', () => {
    const impl = '<div class="dsh-pm-card"></div>'
    const v = prototypeParityViolations(P, impl, contracts({ classes: ['dsh-pm-card', 'dsh-pm-flags'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.contract).toBe('classes')
    expect(v[0]?.expected).toBe('dsh-pm-flags')
    expect(v[0]?.actual).toContain('实现里找不到')
  })

  it('原型里没有、实现里也没有的类 → 同样报（契约不是"照原型抄"，是"实现必须有"）', () => {
    const v = prototypeParityViolations(P, '<div></div>', contracts({ classes: ['dsh-pm-nope'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.actual).not.toContain('原型里有')
  })

  it('空契约项 → 响亮报形态问题，不静默跳过', () => {
    const v = prototypeParityViolations(P, '<div></div>', contracts({ classes: [''] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.actual).toContain('契约项为空')
  })
})

describe('② data-* 契约', () => {
  it('只判属性名存在 → 命中即零违规', () => {
    const impl = '<span data-needs-human="1"></span>'
    expect(prototypeParityViolations(P, impl, contracts({ dataAttrs: ['data-needs-human'] }), REF)).toEqual([])
  })

  it('属性名不符（**复现真实事故**）：契约要 data-result-src，实现只有 data-result-source', () => {
    const impl = '<span data-result-source="agent"></span>'
    const v = prototypeParityViolations(P, impl, contracts({ dataAttrs: ['data-result-src=agent|human|none'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.contract).toBe('dataAttrs')
    expect(v[0]?.expected).toContain('data-result-src')
    expect(v[0]?.actual).toContain('没有这条属性')
  })

  it('属性在、取值超出值域 → 违规并给出实际取值', () => {
    const impl = '<span data-result-src="robot"></span>'
    const v = prototypeParityViolations(P, impl, contracts({ dataAttrs: ['data-result-src=agent|human|none'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.actual).toContain('robot')
  })

  it('属性在、取值在域内 → 零违规（含三态枚举）', () => {
    for (const val of ['agent', 'human', 'none']) {
      const impl = '<span data-result-src="' + val + '"></span>'
      expect(prototypeParityViolations(P, impl, contracts({ dataAttrs: ['data-result-src=agent|human|none'] }), REF)).toEqual([])
    }
  })

  it('属性没有取值 → 违规（不当作"存在即合格"）', () => {
    const v = prototypeParityViolations(P, '<span data-result-src></span>', contracts({ dataAttrs: ['data-result-src=agent'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.actual).toContain('没有取值')
  })

  it('形态非法（不以 data- 开头）→ 响亮报出', () => {
    const v = prototypeParityViolations(P, '<span></span>', contracts({ dataAttrs: ['aria-x=1'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.actual).toContain('形态非法')
  })

  it('两元形态 [name, 记号]：用于原型属性名与实现不同的既有偏差', () => {
    const impl = '<span data-source="agent"></span>'
    expect(prototypeParityViolations(P, impl, contracts({ dataAttrs: [['data-result-source', 'data-source']] }), REF)).toEqual([])
    const v = prototypeParityViolations(P, '<span data-other="1"></span>', contracts({ dataAttrs: [['data-result-source', 'data-source']] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.actual).toContain('data-source')
  })
})

describe('③ DOM 顺序契约', () => {
  it('顺序一致 → 零违规（允许中间隔着别的节点）', () => {
    const impl = '<i class="A"></i><span>别的</span><i class="B"></i><i class="C"></i>'
    expect(prototypeParityViolations(P, impl, contracts({ order: ['A', 'B', 'C'] }), REF)).toEqual([])
  })

  it('顺序颠倒 → 一条 order 违规，且点名这两个名字', () => {
    const impl = '<i class="B"></i><i class="A"></i>'
    const v = prototypeParityViolations(P, impl, contracts({ order: ['A', 'B'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.contract).toBe('order')
    expect(v[0]?.expected).toContain('A')
    expect(v[0]?.expected).toContain('B')
    expect(v[0]?.actual).toContain('顺序颠倒')
  })

  it('**顺序项找不到 = 违规**（静默跳过会让"顺序"在部件缺失时假装通过）', () => {
    const impl = '<i class="A"></i>'
    const v = prototypeParityViolations(P, impl, contracts({ order: ['A', 'B'] }), REF)
    expect(v).toHaveLength(1)
    expect(v[0]?.contract).toBe('order')
    expect(v[0]?.actual).toContain('找不到')
  })

  it('两元形态 [顺序名, 记号]：语义顺序也能判', () => {
    const impl = '<div class="dsh-pm-tv-err-detail"></div><div class="dsh-pm-tv-err-hint"></div>'
    const ok = prototypeParityViolations(P, impl, contracts({ order: [['错误详情', 'err-detail'], ['错误提示', 'err-hint']] }), REF)
    expect(ok).toEqual([])
    const bad = prototypeParityViolations(P, '<div class="dsh-pm-tv-err-hint"></div><div class="dsh-pm-tv-err-detail"></div>',
      contracts({ order: [['错误详情', 'err-detail'], ['错误提示', 'err-hint']] }), REF)
    expect(bad).toHaveLength(1)
    expect(bad[0]?.actual).toContain('顺序颠倒')
  })
})

describe('每条违规必带锚点（回原型看得到）', () => {
  it('三组契约同时违规 → 每一组都至少出一条，且 anchor 逐条非空且形态正确', () => {
    const impl = '<div class="dsh-pm-card"></div>'
    const v = prototypeParityViolations(P, impl, contracts({
      classes: ['dsh-pm-flags'],
      dataAttrs: ['data-result-src=agent'],
      order: ['A', 'B'],
    }), REF)
    // 顺序组两条：A 找不到、B 找不到（**逐项报**，不因为前一项缺就少报后一项）
    expect(v).toHaveLength(4)
    expect(new Set(v.map(x => x.contract))).toEqual(new Set(['classes', 'dataAttrs', 'order']))
    for (const x of v) {
      expect(x.anchor, '没有锚点的违规等于让人自己猜去哪看').toBe(REF)
      expect(x.anchor).toMatch(/^prototypes\/[\w.-]+\.html#FR-\d+$/)
    }
  })

  it('一次给全违规（不是首个即停）——避免"改一条又冒一条"的反复返工', () => {
    const v = prototypeParityViolations(P, '<div></div>', contracts({ classes: ['x-a', 'x-b', 'x-c'] }), REF)
    expect(v).toHaveLength(3)
  })

  it('人读摘要逐条含契约名、期望、实际与锚点', () => {
    const v = prototypeParityViolations(P, '<div></div>', contracts({ classes: ['dsh-pm-flags'] }), REF)
    const text = formatParityViolations(v)
    expect(text).toContain('[classes]')
    expect(text).toContain('dsh-pm-flags')
    expect(text).toContain(REF)
    expect(formatParityViolations([])).toBe('无违规')
  })
})

describe('判据是纯函数（可逆验证的前提）', () => {
  it('同一输入两次调用结果相同，且不改动入参', () => {
    const impl = '<div></div>'
    const c = contracts({ classes: ['a'] })
    const before = JSON.stringify(c)
    const a = prototypeParityViolations(P, impl, c, REF)
    const b = prototypeParityViolations(P, impl, c, REF)
    expect(a).toEqual(b)
    expect(JSON.stringify(c)).toBe(before)
  })
})
