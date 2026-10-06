/**
 * parsePrototypeMetadata 单测（REQ-261005105032-3b02 t4 · serves: FR-4）
 *
 * 验收口径（§10 #4/#5 + data-model §3）：正则抽 `id="FR-N"`；抽 proto-geometry 注释并返回**块数**
 * 与解析错误（坏 JSON 按缺块处理、不外抛）；递归扫 JSON 键，命中阈值禁用词表即违规；
 * `unit ∈ {px,count,ratio}`、`at.state ∈ {inflight,terminal}`、`observations[].name` 块内唯一。
 * 本函数**零 IO**（无 docs 入参、无 fs、无第三方解析库）——故可逆验证：人为改坏必红。
 */
import { describe, expect, it } from 'vitest'
import { THRESHOLD_KEYS, parsePrototypeMetadata } from '../src/application/internal/prototype-gates.js'

const block = (json: string): string => '<!-- proto-geometry ' + json + ' -->'
const OBS = { name: 'tabsTop', value: 576, unit: 'px', at: { width: 1280, state: 'inflight' } }
const goodJson = JSON.stringify({ observations: [OBS] })

describe('锚点抽取 id="FR-N"', () => {
  it('抽出每个 id="FR-N" 区块，selector 指向该 id', () => {
    const meta = parsePrototypeMetadata('<section id="FR-3">甲</section>\n<section id="FR-4">乙</section>\n' + block(goodJson))
    expect(meta.anchors).toEqual([{ fr: 'FR-3', selector: '#FR-3' }, { fr: 'FR-4', selector: '#FR-4' }])
  })

  it('同号重复只记一次（覆盖判定按编号）；单引号写法也认', () => {
    const meta = parsePrototypeMetadata("<div id='FR-4'>a</div>\n<div id=\"FR-4\">b</div>\n")
    expect(meta.anchors).toEqual([{ fr: 'FR-4', selector: '#FR-4' }])
  })

  it('没有锚点 → 空数组（不猜、不默认覆盖任何条款）', () => {
    expect(parsePrototypeMetadata('<div class="page">x</div>').anchors).toEqual([])
  })
})

describe('proto-geometry 块数与解析错误（§10 #4 / G2）', () => {
  it('恰好一块 → blocks=1，observations 逐条解析（source 缺省不注入）', () => {
    const meta = parsePrototypeMetadata(block(goodJson))
    expect(meta.blocks).toBe(1)
    expect(meta.parseError).toBeUndefined()
    expect(meta.violations).toEqual([])
    expect(meta.geometry).toEqual([OBS])
  })

  it('两块 → blocks=2（多块由锚点门拒，函数只如实报数）', () => {
    expect(parsePrototypeMetadata(block(goodJson) + '\n' + block(goodJson)).blocks).toBe(2)
  })

  it('零块 → blocks=0 且 geometry 为空（不凭空造观测）', () => {
    const meta = parsePrototypeMetadata('<section id="FR-4">x</section>')
    expect(meta.blocks).toBe(0)
    expect(meta.geometry).toEqual([])
  })

  it('块内 JSON 坏 → parseError 有值（按缺块处理，不外抛）', () => {
    const meta = parsePrototypeMetadata(block('{observations: tabsTop'))
    expect(meta.blocks).toBe(1)
    expect(typeof meta.parseError).toBe('string')
    expect(meta.geometry).toEqual([])
  })

  it('source: human 是合法值（§10 #8：无法量化者由人给值并标来源）', () => {
    const meta = parsePrototypeMetadata(block(JSON.stringify({ observations: [{ ...OBS, source: 'human' }] })))
    expect(meta.violations).toEqual([])
    expect(meta.geometry[0]?.source).toBe('human')
  })
})

describe('阈值禁用词表（D-10：只放观测量名与实测值）', () => {
  it('词表逐字覆盖 13 项', () => {
    expect([...THRESHOLD_KEYS].sort()).toEqual([
      'budget', 'expected', 'fail', 'limit', 'lower', 'max', 'min', 'pass',
      'range', 'target', 'threshold', 'tolerance', 'upper',
    ])
  })

  it('观测项里带 threshold 键 → 违规', () => {
    const meta = parsePrototypeMetadata(block(JSON.stringify({ observations: [{ ...OBS, threshold: 700 }] })))
    expect(meta.violations.join(' ')).toContain('threshold')
    expect(meta.violations.join(' ')).toContain('形状外字段')
  })

  it('嵌套的 thresholds 整块（含前缀写法）也拦——只认全等会被绕过', () => {
    const meta = parsePrototypeMetadata(block(JSON.stringify({ observations: [OBS], thresholds: { tabsTop: 700 } })))
    expect(meta.violations.join(' ')).toContain('thresholds')
  })

  it('合法字段名不含任一禁用词 → 不误伤', () => {
    expect(parsePrototypeMetadata(block(JSON.stringify({ observations: [{ ...OBS, source: 'prototype' }] }))).violations).toEqual([])
  })
})

describe('形状 / 值域不变量（§10 #5）', () => {
  it('unit 值域外 → 违规并点名非法值', () => {
    const meta = parsePrototypeMetadata(block(JSON.stringify({ observations: [{ ...OBS, unit: 'em' }] })))
    expect(meta.violations.join(' ')).toContain('unit 值域外')
    expect(meta.violations.join(' ')).toContain('em')
  })

  it('at.state 值域外 → 违规；缺 at.width → 违规（REQ-292a 的漏传窗口宽）', () => {
    const bad = parsePrototypeMetadata(block(JSON.stringify({ observations: [{ ...OBS, at: { width: 1280, state: 'done' } }] })))
    expect(bad.violations.join(' ')).toContain('at.state 值域外')
    const noWidth = parsePrototypeMetadata(block(JSON.stringify({ observations: [{ ...OBS, at: { state: 'inflight' } }] })))
    expect(noWidth.violations.join(' ')).toContain('at.width')
  })

  it('observations[].name 块内重名 → 违规（#5 要求唯一）', () => {
    const meta = parsePrototypeMetadata(block(JSON.stringify({ observations: [OBS, { ...OBS, value: 600 }] })))
    expect(meta.violations.join(' ')).toContain('重名')
  })

  it('value 非有限数 / 缺 observations → 违规，且不产出半成品观测', () => {
    const nan = parsePrototypeMetadata(block(JSON.stringify({ observations: [{ ...OBS, value: null }] })))
    expect(nan.violations.join(' ')).toContain('有限数')
    expect(nan.geometry).toEqual([])
    const noKey = parsePrototypeMetadata(block('{"other":[]}'))
    expect(noKey.violations.join(' ')).toContain('observations')
  })

  it('空 observations 数组 → 违规（§3.2 要求非空）', () => {
    expect(parsePrototypeMetadata(block('{"observations":[]}')).violations.join(' ')).toContain('空数组')
  })
})
