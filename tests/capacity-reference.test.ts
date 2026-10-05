/**
 * 余量参考（适配器层）：只读、可缺省、**不冒充 0**（REQ-261002175818-80a8 t4 / FR-8）。
 *
 * 为什么这条必须有：`contextPressure` 的读数会被**展示给人看**并可能被人当作拆分依据。
 * 引擎/投影不可得时若猜 0（或补 0 让字段"看起来在场"），读数就会被当成真值使用——
 * "余量 0"与"取不到"在展示层无法区分，人会据此做出错误判断。故本用例钉死两件事：
 *   ① 任一环节降级 → `source='unavailable'` 且**不抛错**（不阻断主流程）；
 *   ② 缺的字段**不在返回体上**（用 hasOwnProperty 断言，`toBeUndefined` 分不清"缺键"与"键在值为 undefined"）。
 *
 * 注：口径与 `tokenTotals` 逐字对齐（同一条纪律）；当轮展示（节点输入包 / 任务树）见文件末尾
 * t7 的 T9a–T9d——本文件上半部分（9 条适配器用例）**一行未动**。
 */
import { describe, it, expect } from 'vitest'
import { SessionProbeAdapter, readContextPressure } from '../src/adapters/SessionProbeAdapter.js'
import { buildNodeInputPackage } from '../src/application/internal/node-input-package.js'
import { executeTaskTree } from '../src/application/use-cases/TaskTree.js'
import { makeHarness, req, task } from './application/harness.js'
import type { ContextPressureSnapshot } from '../src/shared/protocol.js'

function make(opts: { agents?: () => unknown; sessionProjections?: () => unknown }): SessionProbeAdapter {
  return new SessionProbeAdapter({ now: () => 1000, ...opts })
}

function agentsWith(session: unknown) {
  return () => ({ get: (id: string) => (id === 'w-1' ? { session } : undefined) })
}
function projectionsWith(state: unknown) {
  return () => ({ stateOf: (_s: unknown, kind: string) => (kind === 'contextPressure' ? state : undefined) })
}

describe('SessionProbe.contextPressure（适配器降级：不可得就是不可得）', () => {
  it('agents.get 抛错 → source=unavailable、字段全缺席、不抛错', () => {
    const adapter = make({
      agents: () => ({ get: () => { throw new Error('agents unavailable') } }),
      sessionProjections: projectionsWith({ contextWindow: 64000, pressureTokens: 40000, projectedTokens: 41000 }),
    })
    const snap = adapter.contextPressure('w-1')
    expect(snap.source).toBe('unavailable')
    expect(snap.at).toBe(1000)
    for (const key of ['contextWindow', 'pressureTokens', 'projectedTokens']) {
      expect(Object.prototype.hasOwnProperty.call(snap, key)).toBe(false)
    }
  })

  it('sessionProjections.stateOf 抛错 → source=unavailable、不抛错', () => {
    const adapter = make({
      agents: agentsWith({ id: 'session-1' }),
      sessionProjections: () => ({ stateOf: () => { throw new Error('projection unavailable') } }),
    })
    const snap = adapter.contextPressure('w-1')
    expect(snap.source).toBe('unavailable')
    expect(Object.prototype.hasOwnProperty.call(snap, 'contextWindow')).toBe(false)
  })

  it('服务未装配（new SessionProbeAdapter({})）→ source=unavailable、不抛错', () => {
    const snap = new SessionProbeAdapter({}).contextPressure('w-1')
    expect(snap.source).toBe('unavailable')
    expect(Object.prototype.hasOwnProperty.call(snap, 'projectedTokens')).toBe(false)
  })

  it('投影可得 → source=projection，三字段原样返回', () => {
    const adapter = make({
      agents: agentsWith({ id: 'session-1' }),
      sessionProjections: projectionsWith({ contextWindow: 64000, pressureTokens: 40000, projectedTokens: 41000 }),
    })
    expect(adapter.contextPressure('w-1')).toEqual({
      at: 1000,
      contextWindow: 64000,
      pressureTokens: 40000,
      projectedTokens: 41000,
      source: 'projection',
    })
  })

  it('只有 contextWindow（缺另两个）→ 缺的字段不在返回体上（不猜 0）', () => {
    const adapter = make({
      agents: agentsWith({ id: 'session-1' }),
      sessionProjections: projectionsWith({ contextWindow: 64000 }),
    })
    const snap = adapter.contextPressure('w-1')
    expect(snap.source).toBe('projection')
    expect(snap.contextWindow).toBe(64000)
    expect(Object.prototype.hasOwnProperty.call(snap, 'pressureTokens')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(snap, 'projectedTokens')).toBe(false)
  })

  it.each([['字符串', 'contextPressure-broken'], ['数组', [64000, 40000]], ['null', null]])(
    '形状不符（%s）→ source=unavailable',
    (_label, state) => {
      const adapter = make({ agents: agentsWith({ id: 'session-1' }), sessionProjections: projectionsWith(state) })
      const snap = adapter.contextPressure('w-1')
      expect(snap.source).toBe('unavailable')
      expect(Object.prototype.hasOwnProperty.call(snap, 'contextWindow')).toBe(false)
    },
  )

  it('非有限数（NaN / Infinity）不算读数 → 视为该字段缺席', () => {
    expect(readContextPressure({ contextWindow: Number.NaN, projectedTokens: 41000 })).toEqual({ projectedTokens: 41000 })
    expect(readContextPressure({ contextWindow: Number.POSITIVE_INFINITY })).toBeUndefined()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// t7（FR-8、FR-9）：余量参考上屏——节点输入包与任务树，都标「非判据」
//
// 为什么这四条必须成组：余量是**运行时读数**（可能取不到），而它会被展示给人看并被当成拆分
// 依据。故上屏层要同时钉死三件事：
//   ① 读得到时，数值与「参考值，非门禁判据」必须在**同一节内**（跨节出现不算"同一条展示"）；
//   ② 读不到时整节不出现，且输入包与"没有该能力"**逐字节相同**——这条只能用字符串全等，
//      `toContain` 分不清"没加"与"加了半句"；
//   ③ 单边读数（只有 contextWindow）不猜 0：缺的是**键**，不是值 0（`toBeUndefined` 分不清两者）。
// ─────────────────────────────────────────────────────────────────────────────

const NOTE = '参考值，非门禁判据'
/** FakeSession 的缺省窗口键（exec 为空时绑定判定按它走）。 */
const WINDOW_KEY = 'session-w-001'
const TREE_REQ = 'REQ-000001'
const DOC_PATH = 'docs/requirements/REQ-000001/requirement.md'

/** 输入包正文：除 pressure 外逐字相同，故可与"无该能力"做全等比较。 */
function packageText(pressure?: ContextPressureSnapshot): string {
  return buildNodeInputPackage({
    stage: 'implementing',
    requirementDoc: '# 需求文档\n',
    requirementDocPath: DOC_PATH,
    ...(pressure === undefined ? {} : { contextPressure: pressure }),
  }).text
}

/** 取某个二级节（标题 → 下一个二级标题）："同一节内"的断言不能用全文 toContain 代替。 */
function sectionOf(text: string, heading: string): string {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const rest = text.slice(start + heading.length)
  const next = rest.indexOf('\n## ')
  return next < 0 ? rest : rest.slice(0, next)
}

/** 只声明本用例要断言的键（schema 完整性由 output-contract 用例守）。 */
interface NodeView {
  id: string
  footprint?: { files: number; anchors: number; chars: number }
  footprintState: 'declared' | 'undeclared'
}

interface TreeResult {
  success: boolean
  error?: string
  contextPressure?: {
    source: 'projection' | 'unavailable'
    contextWindow?: number
    projectedTokens?: number
    remainingTokens?: number
    note: string
  }
  parents: { parent: NodeView; subtasks: NodeView[] }[]
}

/** 任务树夹具：一张在制父卡 + 该窗口绑定的需求（绑定判定走 sourceSessionId）。 */
function treeHarness(): ReturnType<typeof makeHarness> {
  const h = makeHarness({ requirements: [req({ status: 'implementing', sourceSessionId: WINDOW_KEY })] })
  h.session.contextPressureSnapshot = { at: 1, contextWindow: 64000, projectedTokens: 40000, source: 'projection' }
  return h
}

describe('t7 · T9a–T9d 余量参考上屏（只读、可缺省、不猜 0）', () => {
  it('T9a 投影可得 → 出现余量参考节，remainingTokens 正确且同节含「参考值，非门禁判据」', () => {
    const text = packageText({ at: 1, contextWindow: 64000, projectedTokens: 40000, source: 'projection' })
    const section = sectionOf(text, '## 一轮余量（参考）')
    expect(section).not.toBe('')
    expect(section).toContain('remainingTokens')
    expect(section).toContain('24000')
    // FR-8 的硬要求：标注与数值**同一条展示内**
    expect(section).toContain(NOTE)
  })

  it('T9b 投影不可得 → 该节整节不出现，且输入包与"无该能力时"逐字节相同', () => {
    const without = packageText(undefined)
    const unavailable = packageText({ at: 1, source: 'unavailable' })
    // 字符串全等：多一行、多一句标注都必须让这条红
    expect(unavailable).toBe(without)
    expect(without).not.toContain('## 一轮余量（参考）')
    expect(without).not.toContain(NOTE)
  })

  it('T9c 只有 contextWindow → 不猜 0：输入包整条不显示、树里 remainingTokens 键缺席、取不到端口也不报错', async () => {
    // ① 输入包：单边读数算不出余量 → 整条参考不显示（design/architecture.md §余量参考的标注）
    expect(packageText({ at: 1, contextWindow: 64000, source: 'projection' })).toBe(packageText(undefined))

    // ② 任务树：有读数但 remainingTokens **缺键**——"算不出"与"余量 0"在展示层必须可区分
    const h = treeHarness()
    h.session.contextPressureSnapshot = { at: 1, contextWindow: 64000, source: 'projection' }
    await h.addTasks(TREE_REQ, [task({ id: 't-solo', status: 'in_progress' })])
    const res = await executeTaskTree(h.deps, { requirement_id: TREE_REQ, parent_id: 't-solo' }, {}) as TreeResult
    expect(res.success).toBe(true)
    expect(res.contextPressure?.source).toBe('projection')
    expect(res.contextPressure?.contextWindow).toBe(64000)
    expect(Object.prototype.hasOwnProperty.call(res.contextPressure, 'remainingTokens')).toBe(false)

    // ③ 拿不到端口（旧适配器实例没有该方法 / 该方法抛错）：不报错，contextPressure 键缺席（不是 null）
    const bare = treeHarness()
    await bare.addTasks(TREE_REQ, [task({ id: 't-solo', status: 'in_progress' })])
    // 置成实例自有属性（FakeSession 的方法是原型上的，delete 删不掉）：读端必须按"没有这个方法"处理
    ;(bare.deps.session as { contextPressure?: unknown }).contextPressure = undefined
    const bareNoMethod = await executeTaskTree(bare.deps, { requirement_id: TREE_REQ, parent_id: 't-solo' }, {}) as TreeResult
    expect(bareNoMethod.success).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(bareNoMethod, 'contextPressure')).toBe(false)

    const broken = treeHarness()
    await broken.addTasks(TREE_REQ, [task({ id: 't-solo', status: 'in_progress' })])
    ;(broken.deps.session as unknown as { contextPressure: () => never }).contextPressure = () => { throw new Error('取不到投影') }
    const bareBroken = await executeTaskTree(broken.deps, { requirement_id: TREE_REQ, parent_id: 't-solo' }, {}) as TreeResult
    expect(bareBroken.success).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(bareBroken, 'contextPressure')).toBe(false)
  })

  it('T9d 任务树顶层 contextPressure 与每卡 footprintState 在场，未声明卡无 footprint 键', async () => {
    const h = treeHarness()
    await h.addTasks(TREE_REQ, [
      task({ id: 't-parent', status: 'in_progress' }),
      task({ id: 't-sub', parentId: 't-parent', stageKind: 'dev', status: 'todo', footprint: { files: 3, anchors: 2, chars: 800 } }),
    ])
    const res = await executeTaskTree(h.deps, { requirement_id: TREE_REQ, parent_id: 't-parent' }, {}) as TreeResult
    expect(res.success).toBe(true)
    expect(res.contextPressure).toEqual({
      source: 'projection',
      contextWindow: 64000,
      projectedTokens: 40000,
      remainingTokens: 24000,
      note: NOTE,
    })

    const parent = res.parents[0]!.parent
    expect(parent.footprintState).toBe('undeclared')
    // 未声明 ≠ 0：键根本不在（抄 tests/reqboard/legacy-refs-compat 的断言手法）
    expect(Object.prototype.hasOwnProperty.call(parent, 'footprint')).toBe(false)

    const sub = res.parents[0]!.subtasks[0]!
    expect(sub.footprintState).toBe('declared')
    expect(sub.footprint).toEqual({ files: 3, anchors: 2, chars: 800 })
  })
})
