/**
 * 结构化验收结果绑定单测（REQ-261006092213-4f5b · t1 / FR-1、FR-2）。
 *
 * 覆盖：四类体检 + 交代完整性 + 非法输入不抛 + 写入纪律 + 可预见项集合口径。
 * 其中**用真 `buildSheet` 的用例是复核返工加的**：旧实现按 `source.kind` 判可预见项，
 * 而「需求级项」与「E2E 覆盖：有」「原型豁免说明」共用 `kind:'requirement'`，
 * 于是同键相撞、结果被写到错误的行、体检还报「齐了」（复核 F1，阻断级）。
 */
import { describe, it, expect } from 'vitest'
import {
  RESULT_MAX_CHARS,
  applyStructuredResults,
  isForeseeableItem,
  matchStructuredResults,
  refKeyOf,
  splitUnmatched,
  type ResultRefInput,
} from '../src/domain/workflow/ResultBinding.js'
import {
  PROTOTYPE_EXEMPT_NOTE_PREFIX,
  REQUIREMENT_LEVEL_CRITERION,
  bindItemResults,
  buildSheet,
  type SheetItemLike,
  type VerificationItemSource,
} from '../src/domain/workflow/AcceptanceSheetSpec.js'

const item = (id: string, source: VerificationItemSource, extra: Partial<SheetItemLike> = {}): SheetItemLike => ({
  id,
  source,
  criterion: '判据',
  evidence: [],
  status: 'pending',
  ...extra,
})

/** 一张手写验收单：两张任务项 + 需求级项 + 一条系统项（孤儿用例）。 */
const sheet = (): SheetItemLike[] => [
  item('v1-1', { kind: 'task', taskId: 't-aaa' }),
  item('v1-2', { kind: 'task', taskId: 't-bbb' }),
  item('v1-3', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
  item('v1-4', { kind: 'requirement' }, { criterion: '孤儿用例（缺映射）：tests/x.test.ts', gapKind: 'orphan' }),
]

const r = (ref: VerificationItemSource, extra: Partial<ResultRefInput> = {}): ResultRefInput => ({ ref, ...extra })

const build = (input: Partial<Parameters<typeof buildSheet>[0]> = {}) => buildSheet({
  sheetHistoryLength: 0,
  tasks: [],
  evidence: ['整单证据'],
  generatedAt: 1,
  generatedBy: { kind: 'agent', sessionId: 'w' },
  ...input,
}).sheet

describe('引用键：与验收项 id 无关（旧路径不可达的根因）', () => {
  it('refKeyOf 只由来源决定，绝不出现项 id 形态', () => {
    expect(refKeyOf({ kind: 'task', taskId: 't-aaa' })).toBe('task:t-aaa')
    expect(refKeyOf({ kind: 'requirement' })).toBe('requirement')
    expect(refKeyOf({ kind: 'prototype-compare', prototypePath: 'prototypes/a.html' })).toBe('prototype:prototypes/a.html')
    expect(refKeyOf({ kind: 'decision-compare', decisionIds: ['D-2', 'D-1'] })).toBe('decision:D-1,D-2')
    for (const key of ['task:t-aaa', 'requirement']) expect(key).not.toMatch(/^v\d+-\d+$/)
  })

  it('decision-compare：同集合不同顺序 → 同一键；集合内重复 id 先去重', () => {
    const a = refKeyOf({ kind: 'decision-compare', decisionIds: ['D-2', 'D-1'] })
    const b = refKeyOf({ kind: 'decision-compare', decisionIds: ['D-1', 'D-2'] })
    expect(a).toBe(b)
    expect(refKeyOf({ kind: 'decision-compare', decisionIds: ['D-1', 'D-1'] })).toBe('decision:D-1')
    const ids = ['D-2', 'D-1']
    refKeyOf({ kind: 'decision-compare', decisionIds: ids })
    expect(ids).toEqual(['D-2', 'D-1']) // 入参数组不被就地排序（先复制再排）
  })
})

describe('可预见项集合：口径逐字对齐 design/backend.md', () => {
  it('任务项 / 需求级项 / 对照项是可预见项；缺口类系统项与不可照着验项不是', () => {
    const items = sheet()
    expect(isForeseeableItem(items[0]!)).toBe(true)
    expect(isForeseeableItem(items[2]!)).toBe(true)
    expect(isForeseeableItem(items[3]!)).toBe(false)
    expect(isForeseeableItem(item('v1-5', { kind: 'prototype-compare', prototypePath: 'prototypes/a.html' }))).toBe(true)
    expect(isForeseeableItem(item('v1-6', { kind: 'decision-compare', decisionIds: ['D-1'] }))).toBe(true)
    expect(isForeseeableItem(item('v1-7', { kind: 'requirement' }, { criterion: '验收项不可照着验（历史数据）：…' }))).toBe(false)
  })

  it('F1 回归：E2E 覆盖「有」那一行不是可预见项，需求级结果必须落在需求级项上', () => {
    const built = build({ e2eCoverage: true })
    const e2e = built.items.find(i => i.criterion.startsWith('E2E 覆盖'))!
    const reqLevel = built.items.find(i => i.criterion === REQUIREMENT_LEVEL_CRITERION)!
    expect(e2e).toBeDefined()
    expect(reqLevel).toBeDefined()
    expect(isForeseeableItem(e2e)).toBe(false) // 旧实现判 true，与需求级项共用键

    const results = [r({ kind: 'requirement' }, { result: '需求级结论' })]
    const report = matchStructuredResults(built.items, results)
    expect(report.missing).toEqual([])
    expect(report.conflict).toEqual([])

    const applied = applyStructuredResults(built.items, results)
    expect(applied).toEqual({ matched: 1, changed: 1 })
    expect(reqLevel.result).toBe('需求级结论')
    expect(reqLevel.resultSource).toBe('agent')
    expect(e2e.result).toBeUndefined() // 不得被写错行
  })

  it('F1 回归：原型豁免说明行同理（同源同键但不是需求级项）', () => {
    const built = build({ prototypeCompare: { exempt: true, reason: '本需求无界面' } })
    const exempt = built.items.find(i => i.criterion.startsWith(PROTOTYPE_EXEMPT_NOTE_PREFIX))!
    const reqLevel = built.items.find(i => i.criterion === REQUIREMENT_LEVEL_CRITERION)!
    expect(exempt).toBeDefined()
    expect(isForeseeableItem(exempt)).toBe(false)

    applyStructuredResults(built.items, [r({ kind: 'requirement' }, { result: '需求级结论' })])
    expect(reqLevel.result).toBe('需求级结论')
    expect(exempt.result).toBeUndefined()
  })

  it('A1 全项扫描：真 buildSheet（父卡 + 子卡）里每个可预见项都拿到结果', () => {
    const built = build({
      tasks: [
        { id: 't-p', title: '父卡', acceptance: '跑 a' },
        { id: 't-c', title: '子卡', acceptance: '跑 b', parentId: 't-p' },
      ],
    })
    const foreseeable = built.items.filter(isForeseeableItem)
    expect(foreseeable.map(i => refKeyOf(i.source))).toEqual(['task:t-p', 'requirement']) // 子卡不进验收单

    const applied = applyStructuredResults(built.items, [
      r({ kind: 'task', taskId: 't-p' }, { result: 'npx vitest run a → 3 passed' }),
      r({ kind: 'requirement' }, { result: '全量回归 ≤ 基线' }),
    ])
    expect(applied).toEqual({ matched: 2, changed: 2 })
    for (const it of foreseeable) {
      expect(it.result).toBeTruthy()
      expect(it.resultSource).toBe('agent')
    }
  })

  it('冲突不变量：两个可预见项共用同一引用键 → conflict 响亮报出', () => {
    const broken = [
      item('v1-1', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
      item('v1-2', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
    ]
    const report = matchStructuredResults(broken, [])
    expect(report.conflict).toEqual(['requirement ×2'])
  })
})

describe('matchStructuredResults：体检与判定顺序', () => {
  it('漏项 → missing 非空且**去重**点名到来源（系统项不在其中）', () => {
    const report = matchStructuredResults(sheet(), [
      r({ kind: 'task', taskId: 't-aaa' }, { result: 'npx vitest run a → 3 passed' }),
      r({ kind: 'requirement' }, { result: '全量回归 ≤ 基线' }),
    ])
    expect(report.missing).toEqual(['task:t-bbb'])
    expect(new Set(report.missing).size).toBe(report.missing.length)
    expect(report.matched).toBe(2)
    expect(report.unmatched).toEqual([])
    expect(report.invalid).toEqual([])
    expect(report.empty).toEqual([])
  })

  it('坏引用 → unmatched（且**先于**完整性判定：不会误报成「没给 result」）', () => {
    const report = matchStructuredResults(sheet(), [{ ref: { kind: 'task', taskId: 't-zzz' } } as ResultRefInput])
    expect(report.unmatched).toEqual(['task:t-zzz'])
    expect(report.empty).toEqual([]) // 顺序纪律：先判命中
    expect(report.matched).toBe(0)
    expect(report.missing).toEqual(['task:t-aaa', 'task:t-bbb', 'requirement'])
  })

  it('重复引用 → duplicate，且只算一次 matched', () => {
    const report = matchStructuredResults(sheet(), [
      r({ kind: 'task', taskId: 't-aaa' }, { result: '第一次' }),
      r({ kind: 'task', taskId: 't-aaa' }, { result: '第二次' }),
    ])
    expect(report.duplicate).toEqual(['task:t-aaa'])
    expect(report.matched).toBe(1)
  })

  it('交代不完整 → empty（含空白 humanReason）；形状非法 → invalid（两类分开）', () => {
    const empty = matchStructuredResults(sheet(), [r({ kind: 'task', taskId: 't-aaa' })])
    expect(empty.empty).toHaveLength(1)
    expect(empty.invalid).toEqual([])

    const blankReason = matchStructuredResults(sheet(), [r({ kind: 'task', taskId: 't-aaa' }, { needsHuman: true, humanReason: '   ' })])
    expect(blankReason.empty).toHaveLength(1)
    expect(blankReason.empty[0]).toContain('humanReason')

    const bad = matchStructuredResults(sheet(), [
      { ref: { kind: 'nope' } as never, result: 'x' },
      { ref: { kind: 'task', taskId: '  ' } as never, result: 'x' },
      { ref: undefined as never, result: 'x' },
    ])
    expect(bad.invalid).toHaveLength(3)
    expect(bad.empty).toEqual([])
    expect(bad.matched).toBe(0)
  })

  it('results 不是数组（undefined / null / {} / 字符串）→ 不抛异常，如实进 invalid 且全部项算未交代', () => {
    for (const bad of [undefined, null, {}, 'not-array', 42]) {
      const report = matchStructuredResults(sheet(), bad)
      expect(report.invalid).toHaveLength(1)
      expect(report.invalid[0]).toContain('results 必须是数组')
      expect(report.matched).toBe(0)
      expect(report.missing).toEqual(['task:t-aaa', 'task:t-bbb', 'requirement'])
    }
  })

  it('元素是原始值（null / 字符串 / 数字）→ invalid，不抛', () => {
    const report = matchStructuredResults(sheet(), [null, 'x', 42] as never)
    expect(report.invalid).toHaveLength(3)
    expect(report.invalid[0]).toContain('元素必须是对象')
  })

  it('超长结果在 match 层不算错（截断是写入层的事）', () => {
    const report = matchStructuredResults(sheet(), [r({ kind: 'task', taskId: 't-aaa' }, { result: 'x'.repeat(900) })])
    expect(report.matched).toBe(1)
    expect(report.invalid).toEqual([])
    expect(report.empty).toEqual([])
  })

  it('系统项不需要交代：只交代三个可预见项即 missing 为空', () => {
    const report = matchStructuredResults(sheet(), [
      r({ kind: 'task', taskId: 't-aaa' }, { result: 'a' }),
      r({ kind: 'task', taskId: 't-bbb' }, { result: 'b' }),
      r({ kind: 'requirement' }, { result: 'c' }),
    ])
    expect(report.missing).toEqual([])
    expect(report).toMatchObject({ matched: 3, unmatched: [], duplicate: [], invalid: [], empty: [], conflict: [] })
  })

  it('decision-compare 端到端匹配（对照项也要逐项交代）', () => {
    const items = [...sheet(), item('v1-5', { kind: 'decision-compare', decisionIds: ['D-1', 'D-2'] })]
    const report = matchStructuredResults(items, [
      r({ kind: 'task', taskId: 't-aaa' }, { result: 'a' }),
      r({ kind: 'task', taskId: 't-bbb' }, { result: 'b' }),
      r({ kind: 'requirement' }, { result: 'c' }),
      r({ kind: 'decision-compare', decisionIds: ['D-2', 'D-1'] }, { result: 'D-1/D-2 逐条落实' }),
    ])
    expect(report.missing).toEqual([])
    expect(report.matched).toBe(4)
  })
})

describe('applyStructuredResults：写入与纪律', () => {
  it('写入 result 并标 resultSource=agent；超长截断到 RESULT_MAX_CHARS', () => {
    const items = sheet()
    const applied = applyStructuredResults(items, [
      r({ kind: 'task', taskId: 't-aaa' }, { result: 'npx vitest run a → 3 passed' }),
      r({ kind: 'task', taskId: 't-bbb' }, { result: 'x'.repeat(900) }),
    ])
    expect(applied).toEqual({ matched: 2, changed: 2 })
    expect(items[0]!.result).toBe('npx vitest run a → 3 passed')
    expect(items[0]!.resultSource).toBe('agent')
    expect(items[1]!.result).toHaveLength(RESULT_MAX_CHARS)
  })

  it('needsHuman + 理由一并落库（只标 needsHuman 也算改动）', () => {
    const items = [...sheet(), item('v1-5', { kind: 'prototype-compare', prototypePath: 'prototypes/a.html' })]
    const applied = applyStructuredResults(items, [
      r({ kind: 'prototype-compare', prototypePath: 'prototypes/a.html' }, { needsHuman: true, humanReason: '界面视觉需人对照权威原型' }),
    ])
    expect(applied).toEqual({ matched: 1, changed: 1 })
    const it = items.find(x => x.id === 'v1-5')!
    expect(it.needsHuman).toBe(true)
    expect(it.humanReason).toBe('界面视觉需人对照权威原型')
    expect(it.result).toBeUndefined()
  })

  it('needsHuman 缺理由 → 整条不写（不留半截记录）', () => {
    const items = sheet()
    const applied = applyStructuredResults(items, [r({ kind: 'task', taskId: 't-aaa' }, { needsHuman: true })])
    expect(applied).toEqual({ matched: 1, changed: 0 })
    expect(items[0]!.needsHuman).toBeUndefined()
    expect(items[0]!.humanReason).toBeUndefined()
  })

  it('人填过的 result 不被覆盖，但 needsHuman 与理由照常写入（保护范围只到 result）', () => {
    const items = sheet()
    items[0]!.result = '人工复核：界面看起来对'
    items[0]!.resultSource = 'human'
    const applied = applyStructuredResults(items, [
      r({ kind: 'task', taskId: 't-aaa' }, { result: 'agent 的命令输出', needsHuman: true, humanReason: '界面视觉' }),
    ])
    expect(applied).toEqual({ matched: 1, changed: 1 })
    expect(items[0]!.result).toBe('人工复核：界面看起来对')
    expect(items[0]!.resultSource).toBe('human')
    expect(items[0]!.needsHuman).toBe(true)
    expect(items[0]!.humanReason).toBe('界面视觉')
  })

  it('matched 与 changed 口径不同：全是 human 保护项时 matched>0 而 changed=0', () => {
    const items = sheet()
    items[0]!.result = '人工结论'
    items[0]!.resultSource = 'human'
    const applied = applyStructuredResults(items, [r({ kind: 'task', taskId: 't-aaa' }, { result: 'agent 输出' })])
    expect(applied.matched).toBe(1)
    expect(applied.changed).toBe(0)
  })

  it('results 非数组 → 不抛，零改动', () => {
    const items = sheet()
    for (const bad of [undefined, null, {}, 'x']) {
      expect(applyStructuredResults(items, bad)).toEqual({ matched: 0, changed: 0 })
    }
    expect(items.every(i => i.result === undefined)).toBe(true)
  })

  it('坏引用与系统项一律不写（不伪造）', () => {
    const items = sheet()
    const applied = applyStructuredResults(items, [
      r({ kind: 'requirement' }, { result: '这条会写到需求级项' }),
      r({ kind: 'task', taskId: 't-zzz' }, { result: '指不到任何项' }),
    ])
    expect(applied).toEqual({ matched: 1, changed: 1 })
    expect(items[2]!.result).toBe('这条会写到需求级项')
    expect(items[0]!.result).toBeUndefined()
    expect(items[3]!.result).toBeUndefined() // 系统项
  })
})

describe('返工续版与越界引用（复核 R2）', () => {
  it('splitUnmatched：本版不含但确实存在的引用键归 outOfScope；指不到东西的才是 unknown', () => {
    const known = new Set(['requirement', 'task:t-a', 'task:t-b'])
    const split = splitUnmatched(['requirement', 'task:t-ghost'], known)
    expect(split.outOfScope).toEqual(['requirement'])
    expect(split.unknown).toEqual(['task:t-ghost'])
  })

  it('真 buildSheet 续版（reworkOnly）：全量交代时需求级 ref 属「本版不含」，不是错', () => {
    const tasks = [{ id: 't-a', title: '卡', acceptance: '跑 a' }]
    const v1 = build({ tasks })
    v1.items[0]!.status = 'failed'
    v1.items[1]!.status = 'passed' // 需求级项已判过 → 续版不带它
    const v2 = build({ tasks, prevSheet: v1 })
    expect(v2.reworkOnly).toBe(true)
    expect(v2.items).toHaveLength(1)

    const report = matchStructuredResults(v2.items, [
      r({ kind: 'task', taskId: 't-a' }, { result: '跑 a → 3 passed' }),
      r({ kind: 'requirement' }, { result: '全量回归 ≤ 基线' }),
    ])
    expect(report.missing).toEqual([]) // 本版唯一的可预见项已交代
    const split = splitUnmatched(report.unmatched, new Set(['requirement', 'task:t-a']))
    expect(split.unknown).toEqual([])  // 不拒：续版本来就不含它
    expect(split.outOfScope).toEqual(['requirement'])
  })
})

describe('conflict 前置条件、常量漂移锁与脏项（复核建议）', () => {
  it('apply 在 conflict 下零改动（前置条件自守）', () => {
    const broken = [
      item('v1-1', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
      item('v1-2', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION }),
    ]
    const applied = applyStructuredResults(broken, [r({ kind: 'requirement' }, { result: 'x' })])
    expect(applied).toEqual({ matched: 0, changed: 0 })
    expect(broken.every(i => i.result === undefined)).toBe(true)
  })

  it('match 层：同一 ref 重复（decision 集合顺序互换）→ duplicate', () => {
    const items = [item('v1-1', { kind: 'decision-compare', decisionIds: ['D-1', 'D-2'] })]
    const report = matchStructuredResults(items, [
      r({ kind: 'decision-compare', decisionIds: ['D-1', 'D-2'] }, { result: 'a' }),
      r({ kind: 'decision-compare', decisionIds: ['D-2', 'D-1'] }, { result: 'b' }),
    ])
    expect(report.duplicate).toEqual(['decision:D-1,D-2'])
    expect(report.matched).toBe(1)
  })

  it('500 截断的常量漂移锁：文本绑定路径与本模块常量一致（F8 留痕的守卫）', () => {
    const items = [item('t-x', { kind: 'requirement' }, { criterion: REQUIREMENT_LEVEL_CRITERION })]
    bindItemResults(items, ['t-x :: ' + 'x'.repeat(900)])
    expect(items[0]!.result).toHaveLength(RESULT_MAX_CHARS)
  })

  it('脏项（判据字段缺失）不抛异常，也不被当作需求级项', () => {
    const dirty = {
      id: 'v1-9',
      source: { kind: 'requirement' as const },
      evidence: [],
      status: 'pending' as const,
    } as unknown as SheetItemLike
    expect(isForeseeableItem(dirty)).toBe(false)
    expect(() => matchStructuredResults([dirty], [r({ kind: 'requirement' }, { result: 'x' })])).not.toThrow()
    const report = matchStructuredResults([dirty], [r({ kind: 'requirement' }, { result: 'x' })])
    expect(report.unmatched).toEqual(['requirement']) // 该项不可预见 → ref 指不到任何项
  })
})

describe('knownKeys 配方（三轮复核：对照项键必须条件化加入）', () => {
  it('真 buildSheet 续版：任务项返工、两个对照项已过 → 对照项 ref 属「本版不含」', () => {
    const input = {
      tasks: [{ id: 't-a', title: '卡', acceptance: '跑 a' }],
      prototypeCompare: { path: 'prototypes/a.html' },
      decisionIds: ['D-1'],
    }
    const v1 = build(input)
    expect(v1.items.map(i => refKeyOf(i.source))).toEqual([
      'task:t-a', 'requirement', 'prototype:prototypes/a.html', 'decision:D-1',
    ])
    v1.items[0]!.status = 'failed'
    for (const it of v1.items.slice(1)) it.status = 'passed'
    const v2 = build({ ...input, prevSheet: v1 })
    expect(v2.reworkOnly).toBe(true)
    expect(v2.items.map(i => refKeyOf(i.source))).toEqual(['task:t-a'])

    // agent 出单前无从知道本轮是续版 → 按全量交代
    const report = matchStructuredResults(v2.items, [
      r({ kind: 'task', taskId: 't-a' }, { result: '跑 a → 3 passed' }),
      r({ kind: 'requirement' }, { result: '需求级结论' }),
      r({ kind: 'prototype-compare', prototypePath: 'prototypes/a.html' }, { result: '对照截图已附' }),
      r({ kind: 'decision-compare', decisionIds: ['D-1'] }, { result: 'D-1 已落实' }),
    ])
    expect(report.missing).toEqual([])
    expect(report.unmatched).toEqual(['requirement', 'prototype:prototypes/a.html', 'decision:D-1'])

    // 正确配方：四类键（后两类本轮确实产出 → 加）→ 全归 outOfScope，unknown 为空
    const known = new Set([
      'task:t-a',
      'requirement',
      refKeyOf({ kind: 'prototype-compare', prototypePath: 'prototypes/a.html' }),
      refKeyOf({ kind: 'decision-compare', decisionIds: ['D-1'] }),
    ])
    const split = splitUnmatched(report.unmatched, known)
    expect(split.unknown).toEqual([])
    expect(split.outOfScope).toEqual(['requirement', 'prototype:prototypes/a.html', 'decision:D-1'])

    // 反例（旧文档配方「顶层父卡 ∪ requirement」）：两个对照项会被误判 unknown → 拒死返工轮
    const naive = splitUnmatched(report.unmatched, new Set(['task:t-a', 'requirement']))
    expect(naive.unknown).toEqual(['prototype:prototypes/a.html', 'decision:D-1'])
  })
})
