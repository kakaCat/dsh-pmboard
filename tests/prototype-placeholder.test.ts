/**
 * 非骨架判据纯函数用例（REQ-261006201649-cc89 t1 · FR-1）。
 *
 * ## 这份文件为什么存在
 *
 * 门禁此前只查「原型在不在 / 权威是不是一条 / 锚点齐不齐」，**不读正文内容**——
 * 于是与 `templates/brainstorming/prototype.html` 只差标题/req_id/日期的**空骨架**
 * 占住 `authoritative` 位置时，三道门**全绿**（实测：REQ-261006164732-6503 的骨架
 * 喂给 `checkPrototypeAnchorsGate` 得到 PASS）。
 *
 * 本文件把「这份原型是不是骨架」写成**会红的东西**。两条纪律：
 *   · **真稿必须不命中**——夹具用磁盘上**真实存在**的原型文件（人写的、形状不可预测），
 *     不新建"看起来像真稿"的假 HTML；
 *   · **两条判据必须独立**——只删占位符不改结构时仍要命中（相似度分支单独生效）。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  prototypePlaceholderOf,
  SKELETON_PLACEHOLDERS,
  SKELETON_SIMILARITY_THRESHOLD,
} from '../src/application/internal/prototype-placeholder.ts'
import { PROTOTYPE_HTML_SKELETON } from '../src/application/internal/prototype-skeleton-template.ts'

const repo = (rel: string): string => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')

/** 与实现同口径的归一（占位符 → X、按行 trim、丢空行）。测试自带一份是刻意的：
 *  用它**独立**算出重合率，才能发现"实现里的归一悄悄变了"。 */
const normalizedLinesOf = (text: string): string[] =>
  text
    .replaceAll('{{TITLE}}', 'X').replaceAll('{{REQ_ID}}', 'X').replaceAll('{{DATE}}', 'X')
    .split('\n').map(l => l.trim()).filter(l => l.length > 0)

const TEMPLATE = repo('templates/brainstorming/prototype.html')
/** 本需求的权威原型（真稿，行重合率实测 0.391）。 */
const OUR_PROTOTYPE = repo('docs/requirements/REQ-261006201649-cc89/prototypes/gate-feedback.html')
/** 一条需求的**空骨架**（实测 0.957）——它是本判据要拦下的那一类。 */
const SKELETON_6503 = repo('docs/requirements/REQ-261006164732-6503/prototypes/detail.html')
/** 正向样本：54 个 class 全能在 src/client 命中（实测 0.304）。 */
const REAL_12D4 = repo('docs/requirements/REQ-261006175040-12d4/prototypes/card-gates.html')
/** 半成品（实测 0.326）——有自定义样式但与骨架无重合行，不得误伤。 */
const HALF_DONE = repo('docs/requirements/REQ-261006092213-4f5b/prototypes/verification-result.html')

/** 落盘骨架的真实形态：占位符已渲染（两次归一都必须吃掉它）。 */
const renderedSkeleton = (): string =>
  PROTOTYPE_HTML_SKELETON
    .replaceAll('{{TITLE}}', '看板卡面')
    .replaceAll('{{REQ_ID}}', 'REQ-000000000000-0000')
    .replaceAll('{{DATE}}', '2026-10-06')

describe('非骨架判据 · 命中（骨架必须被拦下）', () => {
  it('渲染后的骨架原文对自身命中，且 hits 含 marker 判据', () => {
    const hit = prototypePlaceholderOf(renderedSkeleton(), TEMPLATE)
    expect(hit).toBeDefined()
    expect(hit?.hits.some(h => h.kind === 'marker')).toBe(true)
    // 骨架与模板逐字节一致（既有断言锁死），故重合率必然贴顶
    expect(hit?.reading.lineRatio).toBeGreaterThan(SKELETON_SIMILARITY_THRESHOLD)
  })

  it('需求里真实落盘的骨架（REQ-261006164732-6503）命中', () => {
    const hit = prototypePlaceholderOf(SKELETON_6503, TEMPLATE)
    expect(hit).toBeDefined()
    expect(hit?.reading.lineRatio).toBeCloseTo(0.957, 3)
    expect(hit?.reading.markers).toContain('（功能点名）')
  })

  it('相似度判据独立生效：只把「已填过的两处」换成真内容 → 仍命中（marker 已消失，只剩 similarity）', () => {
    // 换掉 h2 与草图区两行（人真的动手填了这两处），**不动**其余骨架行——
    // 这正是"两条判据独立"的关键情形：占位标记少了两个，重合率略降但仍在阈值之上
    const swapped = renderedSkeleton()
      .replaceAll('（功能点名）', '看板卡面标题')
      .replaceAll('（界面草图区：布局结构 / 关键控件 / 占位图）', '真实界面草图：三列泳道')
    const hit = prototypePlaceholderOf(swapped, TEMPLATE)
    expect(hit, '填了两处就放行，等于只验"人有没有碰过文件"而不是"填完没有"').toBeDefined()
    expect(hit?.reading.markers, '换掉的那两个标记不该再出现在读数里').not.toContain('（功能点名）')
    expect(hit?.reading.markers, '没换的标记必须仍被读到').toContain('（分支：若…则…）')
    expect(hit?.hits.some(h => h.kind === 'similarity')).toBe(true)
    expect(hit?.reading.lineRatio).toBeGreaterThan(SKELETON_SIMILARITY_THRESHOLD)
  })

  it('把**全部**占位标记换词（结构一行不动）→ 重合率实测 0.870，落在阈值之下（已知边界，如实记）', () => {
    // 这一条记的是判据的**已知边界**，不是它的战功：骨架的占位标记只占少数行，
    // 人若把每一处字面都换掉、行数与缩进照抄，相似度就掉到 0.90 之下而漏过。
    // 如实断言这个读数，是为了将来有人调阈值/改模板时**这条断言先红**——
    // 那时必须重新标定，而不是让边界悄悄漂走。
    const swapped = renderedSkeleton()
      .replaceAll('（功能点名）', '看板卡面标题')
      .replaceAll('（界面草图区：布局结构 / 关键控件 / 占位图）', '界面草图')
      .replaceAll('（分支：若…则…）', '分支说明')
      .replaceAll('按功能点数量照抄改号', '照此改号')
    const markersLeft = SKELETON_PLACEHOLDERS.filter(m => swapped.includes(m))
    expect(markersLeft, '本用例要求 marker 判据整体失效').toEqual([])
    // 单独取读数：判据未命中时不返回读数，这里用同一条归一自己算，口径与实现一致
    const base = new Set(normalizedLinesOf(TEMPLATE))
    const got = new Set(normalizedLinesOf(swapped))
    const ratio = [...base].filter(l => got.has(l)).length / base.size
    expect(ratio).toBeCloseTo(0.870, 3)
    expect(ratio, '若这条红了：模板或阈值变了，请重新标定实测三档读数').toBeLessThan(SKELETON_SIMILARITY_THRESHOLD)
    // 并且如实确认：此时判据**确实不命中**（不假装它拦住了）
    expect(prototypePlaceholderOf(swapped, TEMPLATE)).toBeUndefined()
  })

  it('骨架整体重新缩进（人重排了格式）→ 仍命中', () => {
    const indented = renderedSkeleton().split('\n').map(l => '    ' + l).join('\n')
    const hit = prototypePlaceholderOf(indented, TEMPLATE)
    expect(hit).toBeDefined()
    expect(hit?.reading.lineRatio).toBeGreaterThan(SKELETON_SIMILARITY_THRESHOLD)
  })

  it('阈值是严格大于：重合率恰好 0.90 且无占位标记 → 不命中', () => {
    // 构造：46 行基线里命中 41 行（41/46 ≈ 0.8913）与 42 行（42/46 ≈ 0.9130）——
    // 无一恰为 0.90，故直接断言"阈值常量本身参与比较"的口径：把基线切成 10 行命中 9 行
    const baseline = Array.from({ length: 10 }, (_, i) => 'line-' + String(i)).join('\n')
    const nineOfTen = Array.from({ length: 9 }, (_, i) => 'line-' + String(i)).join('\n')
    expect(prototypePlaceholderOf(nineOfTen, baseline)).toBeUndefined() // 0.90 不命中
    const all = Array.from({ length: 10 }, (_, i) => 'line-' + String(i)).join('\n')
    expect(prototypePlaceholderOf(all, baseline)).toBeDefined() // 1.00 命中
  })
})

describe('非骨架判据 · 不命中（真稿不得被误伤）', () => {
  it('本需求的权威原型不命中（自洽性：它必须过自己要立的判据）', () => {
    expect(
      prototypePlaceholderOf(OUR_PROTOTYPE, TEMPLATE),
      '本需求的原型必须过它自己要立的判据（自洽性）',
    ).toBeUndefined()
    // 显式断言「不命中」的量化含义：不是擦边放过，而是远低于阈值
    const base = new Set(normalizedLinesOf(TEMPLATE))
    const got = new Set(normalizedLinesOf(OUR_PROTOTYPE))
    const ratio = [...base].filter(l => got.has(l)).length / base.size
    expect(ratio, '本需求原型的行重合率必须 < 阈值').toBeLessThan(SKELETON_SIMILARITY_THRESHOLD)
    expect(ratio).toBeCloseTo(0.391, 3)
  })

  it('正向样本（REQ-261006175040-12d4 的 card-gates.html）不命中', () => {
    expect(prototypePlaceholderOf(REAL_12D4, TEMPLATE)).toBeUndefined()
  })

  it('半成品（REQ-261006092213-4f5b 的 verification-result.html）不命中——有自定义内容就不算骨架', () => {
    expect(prototypePlaceholderOf(HALF_DONE, TEMPLATE)).toBeUndefined()
  })

  it('superseded 的旧骨架也不因"像骨架"以外的理由命中：判据只看正文，不看状态', () => {
    // 判据不读 INDEX、不判状态（那是版本门的职责）——同一份骨架文本必然命中，
    // 这条断言锁的是"判据的输入只有两份文本"，防止将来有人把 INDEX 解析塞进纯函数
    expect(prototypePlaceholderOf(SKELETON_6503, TEMPLATE)).toBeDefined()
  })
})

describe('非骨架判据 · 边界与降级', () => {
  it('空文件不抛错，lineRatio === 0，且不命中（无占位标记）', () => {
    const hit = prototypePlaceholderOf('', TEMPLATE)
    expect(hit).toBeUndefined()
  })

  it('空文件 + 占位标记 → 命中（marker 这条不依赖行重合率）', () => {
    const hit = prototypePlaceholderOf('<!-- ' + SKELETON_PLACEHOLDERS[0] + ' -->', TEMPLATE)
    expect(hit).toBeDefined()
    expect(hit?.reading.lineRatio).toBe(0)
    expect(hit?.hits).toContainEqual({ kind: 'marker', marker: SKELETON_PLACEHOLDERS[0] })
  })

  it('模板基线为空串 → 返回 undefined（基线不可得 ⇒ 不判，绝不假红）', () => {
    expect(prototypePlaceholderOf(SKELETON_6503, '')).toBeUndefined()
    expect(prototypePlaceholderOf(SKELETON_6503, '\n \n\t\n')).toBeUndefined()
  })

  it('基线只有空白行、正文是骨架 → 仍是不判（不把"没基线"当成"命中"）', () => {
    expect(prototypePlaceholderOf(renderedSkeleton(), '   \n\n   ')).toBeUndefined()
  })

  it('占位标记清单逐字来自骨架正文（两份必须同源）', () => {
    for (const m of SKELETON_PLACEHOLDERS) {
      expect(PROTOTYPE_HTML_SKELETON.includes(m), '骨架正文里找不到占位标记：' + m).toBe(true)
    }
    // 归一后的行重合率不可能超过 1
    const hit = prototypePlaceholderOf(renderedSkeleton(), TEMPLATE)
    expect(hit?.reading.lineRatio).toBeLessThanOrEqual(1)
  })
})
