/**
 * 锚点门的「非骨架」第一问（REQ-261006201649-cc89 t2 · FR-1 / FR-2）。
 *
 * ## 这份文件为什么存在
 *
 * 改动前实测：把 REQ-261006164732-6503 的**真实三份文件**（requirement.md + INDEX + 骨架原型）
 * 喂给锚点门，结果是 `PASS(放行)`。骨架自带示例区块 `id="FR-1"` 与示例 geometry 块，
 * INDEX 骨架的「服务条款」列填的也正是 `FR-1`——**模板自己给自己发了合格证**。
 *
 * 本文件把「骨架不得占权威位」写成会红的东西，并把**两条元判据**钉死：
 *   · 反向演练 A：骨架必红 → 换成填过的原型必绿 → 基线不可得则不判（不假红）；
 *   · 码唯一性：骨架报 `prototype_placeholder`、真稿缺锚点报 `prototype_anchor_missing`。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { checkPrototypeAnchorsGate, type AnchorGateDeps } from '../src/application/internal/prototype-anchor-gate.ts'
import { PROTOTYPE_HTML_SKELETON } from '../src/application/internal/prototype-skeleton-template.ts'

const repo = (rel: string): string => readFileSync(fileURLToPath(new URL('../' + rel, import.meta.url)), 'utf8')

/** 本需求自己的权威原型（填过的真稿）——用它做"放行"一侧的样本。 */
const OUR_PROTOTYPE = repo('docs/requirements/REQ-261006201649-cc89/prototypes/gate-feedback.html')

const REQ = 'REQ-261006164732-6503'
const REAL = 'docs/requirements/REQ-261006164732-6503'
const PATH = REAL + '/requirement.md'
const INDEX_PATH = REAL + '/prototypes/INDEX.md'
const HTML_PATH = REAL + '/prototypes/detail.html'
/** 规则上线日之后的 createdAt（新判据适用）。 */
const FRESH = Date.parse('2026-10-07T00:00:00.000Z')
/** 规则上线日之前的 createdAt（存量，新判据整段不判）。 */
const STALE = Date.parse('2026-10-05T00:00:00.000Z')

const SIDES = '---\nreq_id: x\nsides: [frontend, backend]\n---\n# 需求'
/** 权威行 = prototypes/detail.html（与真实 INDEX 同形）。 */
const INDEX = [
  '# 原型清单',
  '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '|---|---|---|---|',
  '| prototypes/detail.html | authoritative | FR-1 | |',
].join('\n')

const fakeDocs = (files: Record<string, string>) => ({
  exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
  read: async (p: string) => files[p] ?? '',
})

const reqOf = (over: Record<string, unknown> = {}) => ({
  id: REQ,
  category: 'feature',
  createdAt: FRESH,
  artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: PATH }],
  ...over,
} as never)

/** 三份真实文件（骨架占权威位）——反向演练 A 的"必红"一侧。 */
const realSkeleton = () => ({
  [PATH]: SIDES,
  [INDEX_PATH]: INDEX,
  [HTML_PATH]: repo('docs/requirements/REQ-261006164732-6503/prototypes/detail.html'),
})

/** 同样的三份文件，只把原型换成填过的真稿——反向演练 A 的"必绿"一侧。 */
const realFilled = () => ({ ...realSkeleton(), [HTML_PATH]: OUR_PROTOTYPE })

const depsWithTemplate = (template: string | undefined = PROTOTYPE_HTML_SKELETON): AnchorGateDeps =>
  template === undefined ? {} : { skeleton: { skeletonTemplate: () => template } }

describe('反向演练 A · 骨架占权威位必红，换真稿必绿', () => {
  it('真实的骨架原型占 authoritative → prototype_placeholder，且 gaps 点名该路径', async () => {
    const r = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf(), depsWithTemplate())
    expect(r?.code, '改动前这里是 PASS(放行)——骨架自带示例 FR-1，锚点门查不出来').toBe('prototype_placeholder')
    expect((r?.gaps ?? []).join('\n')).toContain('prototypes/detail.html')
    expect(r?.message).toContain('prototypes/detail.html')
  })

  it('同一份文件换成填过的原型 → 放行（只证明会红不证明不误红，等于没跑）', async () => {
    const r = await checkPrototypeAnchorsGate(fakeDocs(realFilled()) as never, reqOf(), depsWithTemplate())
    expect(r).toBeUndefined()
  })

  it('基线不可得（未注入模板端口）→ 不判、不假红：骨架也放行', async () => {
    const r = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf(), {})
    expect(r, '拿不到基线就报红，等于把"我读不到模板"转嫁给需求').toBeUndefined()
  })

  it('基线为空串 → 同样不判（空基线没有"相似度"可言）', async () => {
    const r = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf(), depsWithTemplate('  \n\t\n'))
    expect(r).toBeUndefined()
  })

  it('命中原因写进 gaps 与信封：占位标记 或 重合率读数（人要知道凭什么被拦）', async () => {
    const r = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf(), depsWithTemplate())
    const text = (r?.gaps ?? []).join('\n') + (r?.message ?? '')
    expect(text).toMatch(/占位标记|重合率/)
  })
})

describe('码唯一性 · 同一份文件两种坏必须两个码', () => {
  it('骨架 → prototype_placeholder；真稿缺 id="FR-4" → prototype_anchor_missing', async () => {
    const skeleton = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf(), depsWithTemplate())
    expect(skeleton?.code).toBe('prototype_placeholder')

    // 真稿 + INDEX 声明 FR-4（真稿只服务 FR-1..FR-7 里的若干条；用一条它没有的编号）
    const filled = realFilled()
    filled[INDEX_PATH] = INDEX.replace('| FR-1 |', '| FR-99 |')
    const missing = await checkPrototypeAnchorsGate(fakeDocs(filled) as never, reqOf(), depsWithTemplate())
    expect(missing?.code).toBe('prototype_anchor_missing')
    expect(missing?.code).not.toBe(skeleton?.code)
    expect((missing?.gaps ?? []).join('\n')).toContain('FR-99')
  })

  it('非骨架判据排在锚点之前：骨架即使几何量块也坏，报的仍是 placeholder', async () => {
    // 骨架自带恰好一块 geometry、且 id="FR-1" 齐备 —— 这正是它"看起来合格"的原因
    const r = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf(), depsWithTemplate())
    expect(r?.code).toBe('prototype_placeholder')
  })
})

describe('早退纪律不变（同一处坏只报一次）', () => {
  it('INDEX 有两条 authoritative → 早退（本门返回 undefined，留给版本门）', async () => {
    const files = realSkeleton()
    files[INDEX_PATH] = INDEX + '\n| prototypes/other.html | authoritative | FR-1 | |'
    expect(await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), depsWithTemplate())).toBeUndefined()
  })

  it('INDEX 缺「服务条款」列 → 早退（解析缺口属版本门）', async () => {
    const files = realSkeleton()
    files[INDEX_PATH] = ['| 路径 | 状态 | 被取代于 |', '|---|---|---|', '| prototypes/detail.html | authoritative | |'].join('\n')
    expect(await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), depsWithTemplate())).toBeUndefined()
  })

  it('INDEX 不存在 → 早退', async () => {
    const files = realSkeleton()
    delete (files as Record<string, string>)[INDEX_PATH]
    expect(await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), depsWithTemplate())).toBeUndefined()
  })

  it('非 UI 需求（sides 只含 backend）→ 整门不适用', async () => {
    const files = realSkeleton()
    files[PATH] = SIDES.replace('[frontend, backend]', '[backend]')
    expect(await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf(), depsWithTemplate())).toBeUndefined()
  })
})

describe('存量不追溯（createdAt 早于规则生效日）', () => {
  it('存量需求 + 骨架 → 放行（新判据整段不判，旧口径照旧）', async () => {
    const r = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf({ createdAt: STALE }), depsWithTemplate())
    expect(r, '存量被追溯拒绝＝把系统债转嫁给当时的人').toBeUndefined()
  })

  it('存量需求 + 真稿缺锚点 → 仍按旧口径报 prototype_anchor_missing（既有判据不受豁免影响）', async () => {
    const files = realFilled()
    files[INDEX_PATH] = INDEX.replace('| FR-1 |', '| FR-99 |')
    const r = await checkPrototypeAnchorsGate(fakeDocs(files) as never, reqOf({ createdAt: STALE }), depsWithTemplate())
    expect(r?.code).toBe('prototype_anchor_missing')
  })

  it('createdAt 不可得（旧台账记录）→ 与存量同口径（不判新判据）', async () => {
    const r = await checkPrototypeAnchorsGate(fakeDocs(realSkeleton()) as never, reqOf({ createdAt: undefined }), depsWithTemplate())
    expect(r).toBeUndefined()
  })
})
