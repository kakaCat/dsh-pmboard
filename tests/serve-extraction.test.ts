/**
 * serves 抽取 × 原型锚点（REQ-261005105032-3b02 FR-9 / design/data-model §7.3 / 决议 #6）
 *
 * 缺陷形态（实测）：`collectIds('prototypes/x.html#FR-4')` → `['FR-4']`——锚点是"页面内某个区块
 * 的定位符"，却被当成"本条实现/覆盖了 FR-4"的声明，于是贴个锚点就能把覆盖度刷上去（假引用）。
 * 修法是**在 serves 抽取入口**前置调用 `stripPrototypeAnchors`，把 `\S+#FR-\d+` 换成固定 token
 * `<proto-anchor>`；`collectIds` 本体不改语义（它只是编号收集器，抹除是 serves 通道的策略）。
 *
 * 本文件同时锁两侧：① 抹得掉（锚点里的 FR 不再进 serves）；② 不误抹（裸 `#FR-4`、普通编号、
 * 其它 serves 来源照旧）——过抹会把真实引用吃掉，比假引用更危险。
 */
import { describe, expect, it } from 'vitest'
import {
  collectIds,
  extractServes,
  extractServesFrom,
  parseDocument,
  stripPrototypeAnchors,
} from '../src/application/internal/content-gates.js'

const ANCHOR = 'prototypes/detail.html#FR-4'

describe('stripPrototypeAnchors：锚点 → 固定 token', () => {
  it('整段锚点被替换为 <proto-anchor>（决议 #6 钉死的固定形态）', () => {
    expect(stripPrototypeAnchors(ANCHOR)).toBe('<proto-anchor>')
    expect(stripPrototypeAnchors(ANCHOR)).toContain('<proto-anchor>')
  })

  it('抹除后 collectIds 不再产出该 FR（这正是要堵的假引用）', () => {
    const stripped = stripPrototypeAnchors(ANCHOR)
    expect(collectIds(stripped)).not.toContain('FR-4')
    expect(collectIds(stripped)).toEqual([])
  })

  it('锁定缺陷面：collectIds 本体不改语义（裸调用仍认 FR-4，抹除只在 serves 通道）', () => {
    expect(collectIds(ANCHOR)).toEqual(['FR-4'])
  })

  it('句中锚点只抹锚点本身，同行的普通编号保留', () => {
    const text = '见 prototypes/detail.html#FR-4，另见 FR-1。'
    expect(stripPrototypeAnchors(text)).toBe('见 <proto-anchor>，另见 FR-1。')
    expect(collectIds(stripPrototypeAnchors(text))).toEqual(['FR-1'])
  })

  it('不误抹：裸 #FR-4（无承载路径）与普通编号原样保留', () => {
    expect(stripPrototypeAnchors('#FR-4')).toBe('#FR-4')
    expect(stripPrototypeAnchors('FR-1 与 D-1 都是普通编号')).toBe('FR-1 与 D-1 都是普通编号')
    expect(collectIds(stripPrototypeAnchors('#FR-4'))).toEqual(['FR-4'])
  })

  it('多枚锚点一次抹净', () => {
    const text = 'a.html#FR-1 b.html#FR-2'
    expect(stripPrototypeAnchors(text)).toBe('<proto-anchor> <proto-anchor>')
    expect(collectIds(stripPrototypeAnchors(text))).toEqual([])
  })
})

describe('serves 抽取入口前置抹锚点（FR-9）', () => {
  it('extractServes：标题行 serves 里的锚点不计入', () => {
    expect(extractServes('## 原型页 `serves: FR-1, ' + ANCHOR + '`')).toEqual(['FR-1'])
  })

  it('extractServes：只有锚点 → 空数组（不算一条 serves 声明）', () => {
    expect(extractServes('serves: ' + ANCHOR)).toEqual([])
  })

  it('extractServesFrom：表格 serves 列里的锚点不计入（行级映射）', () => {
    const doc = parseDocument([
      '---', 'req_id: REQ-t', '---', '# 设计', '',
      '## 覆盖对照', '',
      '| 章节 | serves |', '|---|---|',
      '| 甲 | FR-1, ' + ANCHOR + ' |',
      '| 乙 | D-1 |',
      '',
    ].join('\n'))
    const out = extractServesFrom(doc)
    expect(out).not.toContain('FR-4')
    expect(out).toEqual(['D-1', 'FR-1'])
  })

  it('extractServesFrom：front-matter 的 serves / requirement_refs 里的锚点不计入', () => {
    const doc = parseDocument([
      '---', 'req_id: REQ-t',
      'serves: FR-1 ' + ANCHOR,
      'requirement_refs: FR-2 prototypes/other.html#FR-5',
      '---', '# 需求', '',
    ].join('\n'))
    const out = extractServesFrom(doc)
    expect(out).not.toContain('FR-4')
    expect(out).not.toContain('FR-5')
    expect(out).toEqual(['FR-1', 'FR-2'])
  })

  it('extractServesFrom：标题行锚点同样是"贴了锚点但没写实现"→ 该 FR 不出现在 serves', () => {
    const doc = parseDocument(['# 设计（serves: FR-1, ' + ANCHOR + '）', ''].join('\n'))
    expect(extractServesFrom(doc)).toEqual(['FR-1'])
  })

  it('回归锁：不含锚点的 serves 声明照旧（两个来源合并且去重、自然排序）', () => {
    const doc = parseDocument([
      '---', 'req_id: REQ-t', '---', '# 设计（serves: FR-9）', '',
      '| 章节 | serves |', '|---|---|',
      '| 甲 | FR-1, FR-9 |',
      '',
    ].join('\n'))
    expect(extractServesFrom(doc)).toEqual(['FR-1', 'FR-9'])
  })
})
