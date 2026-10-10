/**
 * 面板补丁总入口（REQ-261001210304-0dfb · FR-2 / FR-3）。
 *
 * 背景：面板内容是 `dangerouslySetInnerHTML` 注入的整段字符串，而 React 只在
 * `__html` **逐字节不同**时才重设 innerHTML（相同就一个 DOM 节点都不动）。原先把
 * 「数据时间 HH:MM:SS」「data-fetched-at」和相对时间（「刚刚 / N 分钟前」）写进字符串，
 * 于是**每一轮 5 秒轮询都让字符串变一次** → 整段 DOM 重建 → DAG 画布、滚动位置、
 * 页签选择全部归零（实测：两轮仅差 5 秒的渲染，首个差异点就是 `data-fetched-at`）。
 *
 * 修法：易变值**出注入字符串**，字符串里只留稳定钩子，渲染后再由本模块补值：
 *
 * ```
 *   renderNodePanel(...)  ──►  稳定字符串（数据没变 → 逐字节相同 → React 不动 DOM）
 *        │                                   │
 *        │  钩子：data-dsh-pm-fresh-slot      │  补值（只改文本/属性，不插删元素）
 *        │        data-dsh-pm-rel="<ts>"     ▼
 *        └─────────────────────────►  hydrateNodePanel(root, { freshness, tab, now })
 * ```
 *
 * 纪律：**幂等、不换元素、找不到钩子静默返回**（阶段没有该块是正常情况）。
 *
 * @module dsh-pmboard/client/panel-hydrate
 */
import { hydrateFreshness, type NodePanelFreshness } from './panel-freshness.js'
import { hydrateRelTimes } from './node-panel.js'

export interface NodePanelHydrateInput {
  /** 数据新鲜度（缺省不补「数据时间」，与旧渲染契约一致） */
  freshness?: NodePanelFreshness
  /** 视图页签（flow=DAG / list=泳道）；缺省不动页签（保持注入模板的默认态） */
  tab?: 'flow' | 'list'
  /** 相对时间的"现在"（测试注入固定时钟；缺省 Date.now()） */
  now?: number
}

/**
 * 面板补丁总入口：新鲜度 + 相对时间 + 页签选择。
 *
 * @param root 本次渲染的面板容器（React 注入 HTML 的那个节点或其祖先）
 * @param input 见 {@link NodePanelHydrateInput}
 */
export function hydrateNodePanel(root: ParentNode, input: NodePanelHydrateInput): void {
  if (input.freshness !== undefined) hydrateFreshness(root, input.freshness)
  hydrateRelTimes(root, input.now)
  if (input.tab !== undefined) applyView(root, input.tab)
}

/**
 * 页签恢复：把 `is-active` 与 pane 的 `hidden` 按记忆里的选择重设。
 *
 * 为什么需要：页签切换原先只 toggle 当前 DOM 的 class，而注入模板恒把 DAG 页写成
 * `is-active`、泳道 pane 写成 `hidden`——整段重建后就会跳回 DAG（用户看到的是
 * 「我切到泳道，一刷新又回到 DAG」）。
 */
function applyView(root: ParentNode, tab: 'flow' | 'list'): void {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('.dsh-pm-np-tab[data-view]'))) {
    el.classList.toggle('is-active', el.getAttribute('data-view') === tab)
  }
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('.dsh-pm-np-pane[data-pane]'))) {
    el.hidden = el.getAttribute('data-pane') !== tab
  }
}
