/**
 * REQ-261001210304-0dfb 端到端探针（**修复后版本**）：证明「刷新不再打断读图」。
 *
 * 跑法：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts
 *
 * 同一脚本在修复前（旧版本，见任务卡 t-5f7644 的完工记录）报的是缺陷：
 *   A-2 = {"dir":"vertical","crit":false,"focus":false,"pinned":null}（一轮刷新即回初始态）
 *   B-1 = false（两轮 __html 不同，首个差异点 data-fetched-at）
 * 现在两段都应通过（期望值已按修复后的行为翻转）：
 *   A. 记忆回填：带 stateKey 的二次挂载后，方向 / 两个开关 / 钉住原样保持，滚动位置还原；
 *   B. 字符串稳定：仅 freshness.fetchedAt 差 5 秒的两次 renderNodePanel 输出**逐字节相同**
 *      → React 不会重设整段 innerHTML → 画布 / 滚动 / 页签都不被重建。
 */
import assert from 'node:assert/strict'
import { mountDagCanvas, PANEL_DAG_CANVAS_ID, type DagTaskLike } from '../../../../src/client/views/dag-view.js'
import { renderNodePanel } from '../../../../src/client/node-panel.ts'
import { _resetDagViewState } from '../../../../src/client/dag/view-state.js'

// ---------------------------------------------------------------------------
// 极简 document + 画布桩（Node 环境没有 DOM；含 wrap，便于断言滚动还原）
// ---------------------------------------------------------------------------
function withFakeDom<T>(fn: (dom: { add: (id: string) => void; wrap: { scrollTop: number; scrollLeft: number } }) => T): T {
  const g = globalThis as unknown as { document?: unknown }
  const prev = g.document
  const registry = new Set<string>()
  const noop = (): void => { /* 绘制不入断言 */ }
  const ctx: Record<string, unknown> = {
    save: noop, restore: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    quadraticCurveTo: noop, bezierCurveTo: noop, clip: noop, fill: noop, stroke: noop,
    clearRect: noop, setLineDash: noop, setTransform: noop, arc: noop,
    measureText: (s: string) => ({ width: String(s).length * 6 }),
    fillRect: noop, fillText: noop,
  }
  for (const k of ['font', 'fillStyle', 'strokeStyle', 'lineWidth', 'globalAlpha', 'textAlign', 'textBaseline', 'lineCap']) {
    Object.defineProperty(ctx, k, { set: noop, get: () => undefined })
  }
  const wrap = { scrollTop: 0, scrollLeft: 0, clientWidth: 690 }
  const panel: Record<string, unknown> = {
    addEventListener: noop, removeEventListener: noop, contains: () => true,
    querySelector: (sel: string) => (sel === '[data-dag-wrap]' ? wrap : null),
    querySelectorAll: () => [],
  }
  const canvas: Record<string, unknown> = {
    width: 0, height: 0, style: {},
    parentElement: { clientWidth: 690, appendChild: () => {} },
    getContext: () => ctx,
    closest: () => panel,
    addEventListener: noop,
    removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  }
  g.document = {
    getElementById: (id: string) => (registry.has(id) ? canvas : null),
    createElement: () => ({ dataset: {}, appendChild: () => {}, click: () => {}, remove: () => {} }),
  }
  try {
    return fn({ add: (id: string) => { registry.add(id) }, wrap })
  } finally {
    if (prev === undefined) delete g.document
    else g.document = prev
  }
}

const tasks: DagTaskLike[] = [
  { id: 't-a', title: '卡 A', status: 'done', phase: 'implement', side: 'backend', dependsOn: [] },
  { id: 't-b', title: '卡 B', status: 'in_progress', phase: 'implement', side: 'backend', dependsOn: ['t-a'] },
  { id: 't-c', title: '卡 C', status: 'todo', phase: 'implement', side: 'frontend', dependsOn: ['t-b'] },
]

// ---------------------------------------------------------------------------
// A. 记忆回填：一轮刷新（= 同一 canvas 再挂一次）后，用户的选择与滚动位置都还在
// ---------------------------------------------------------------------------
_resetDagViewState()
const STATE_KEY = PANEL_DAG_CANVAS_ID + '::REQ-261001210304-0dfb'
withFakeDom((dom) => {
  dom.add(PANEL_DAG_CANVAS_ID)
  const v1 = mountDagCanvas(tasks, undefined, PANEL_DAG_CANVAS_ID, { stateKey: STATE_KEY })
  assert.ok(v1 !== undefined, '首次挂载应返回 viewer')
  v1.patch({ dir: 'horizontal', crit: true, focus: true, pinned: 't-b' })
  dom.wrap.scrollTop = 180
  dom.wrap.scrollLeft = 12
  const before = v1.state()
  console.log('A-1 用户调过的视图状态       :', JSON.stringify(before))

  const v2 = mountDagCanvas(tasks, undefined, PANEL_DAG_CANVAS_ID, { stateKey: STATE_KEY }) // ← 下一次轮询做的事
  assert.ok(v2 !== undefined, '二次挂载应返回 viewer')
  const after = v2.state()
  console.log('A-2 一轮刷新后的视图状态     :', JSON.stringify(after))
  assert.deepEqual(after, before, '修复后：一轮刷新不得改变方向/关键路径/只看主线/钉住')
  assert.deepEqual(after, { dir: 'horizontal', crit: true, focus: true, pinned: 't-b' })
  console.log('A-3 滚动位置还原             :', 'top=' + dom.wrap.scrollTop + ' left=' + dom.wrap.scrollLeft)
  assert.equal(dom.wrap.scrollTop, 180)
  assert.equal(dom.wrap.scrollLeft, 12)
  console.log('A-4 结论：重建时按记忆回填 initial + 滚动 → 用户的选择保持（已修复）')
})

// ---------------------------------------------------------------------------
// B. 字符串稳定：只是时间往前走了，不得改变注入字符串（否则 React 重设整段 innerHTML）
// ---------------------------------------------------------------------------
const overview = {
  requirementId: 'REQ-261001210304-0dfb',
  currentStage: 'implementing',
  stages: [
    {
      stage: 'implementing', enabled: true, timeline: [{ at: 1700000000000, status: 'implementing' }],
      body: { tasks, byWindow: {} },
    },
  ],
} as never

const render = (fetchedAt: number): string => renderNodePanel({
  overview,
  stage: 'implementing',
  requirement: { id: 'REQ-261001210304-0dfb', title: '探针' },
  freshness: { fetchedAt, intervalMs: 5000, staleAfterMs: 30000 },
})

const html1 = render(1700000000000)
const html2 = render(1700000005000) // 只是过了一个轮询周期（5s）
console.log('B-1 两轮 __html 是否逐字节相同 :', html1 === html2)
assert.equal(html1, html2, '修复后：仅时间戳变化不得改变注入字符串')
console.log('B-2 稳定钩子（新鲜度/相对时间）:', 'fresh-slot=' + html1.includes('data-dsh-pm-fresh-slot') + ' rel-slot=' + html1.includes('data-dsh-pm-rel'))
assert.ok(html1.includes('data-dsh-pm-fresh-slot'), '注入字符串里应只有稳定钩子')
assert.ok(!html1.includes('数据时间'), '注入字符串里不得出现随时间变化的数据时间文本')
console.log('B-3 结论：时间戳不进字符串 → React 不重设 innerHTML → 画布/滚动/页签不会被连累重建（已修复）')
