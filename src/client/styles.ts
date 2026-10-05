/**
 * 项目看板 client 样式 —— 泳道 / 详情 / 待归类 / DAG。
 * 类前缀 dsh-pm-（与 shell 隔离）；隐藏规则对齐 taskboard/execution 模式。
 *
 * REQ-47939a t12：原 1886 行单文件已按连续区段分层到 styles/*.ts；
 * 本文件按**原物理顺序**拼接，注入接口不变（REQ-47939a 拆除旧机制卡删除了 base 中的
 * 侧栏入口与旧覆盖层显隐属性选择器区段，故拼接结果不再与拆分前逐字节一致）。
 */
import { BASE_CSS } from './styles/base.ts'
import { BOARD_CSS } from './styles/board.ts'
import { DETAIL_CSS } from './styles/detail.ts'
import { FILES_CSS } from './styles/files.ts'
import { PANEL_CSS } from './styles/panel.ts'
import { TOKEN_CSS } from './styles/token.ts'
import { MARKS_CSS } from './styles/marks.ts'
import { SUBTASK_CSS } from './styles/subtask.ts'
import { NODE_PANEL_CSS } from './styles/node-panel.ts'
import { TRACEABILITY_CSS } from './styles/traceability.ts'
import { DAG_CSS } from './styles/dag.ts'
// REQ-261004103330-005f t11：设置弹窗样式分片（纯新增区段，不改既有选择器）
import { SETTINGS_CSS } from './styles/settings.ts'
// REQ-261004222448-292a：详情页「工作汇报」壳样式分片（纯新增区段；六个面板的专属类名续写在此片末尾）
import { REPORT_CSS } from './styles/report.ts'

/**
 * 本插件在 DSH client-modules 里的**装载身份**（= package.json 的包名，也就是
 * wrap-client.mjs 写进 `__ModuleLoader__.load({ id })` 的值、boot 图里那一行的 id；
 * 见 DSH `packages/client/modules/src/index.ts`：`@param id - entry id (package name)`）。
 *
 * 为什么不复用 dom.ts 的 PANEL_NAME：那是 **UI 身份**（main 插槽 key / 侧栏条目 id），
 * 与装载身份今天同为 'dsh-pmboard' 纯属巧合。哪天 PANEL_NAME 改了，样式归属绝不能跟着漂
 * ——漂了就等于把样式白送给别的插件（见下面「样式归属」）。
 */
const PLUGIN_ID = 'dsh-pmboard'

const CSS_TAG = 'dsh-pmboard/styles.css'

// 拼接顺序 = 拆分前模板的物理顺序：base(9-399) → detail(400-768) → files(769-1147) → board(1148-1531) → panel(1532-1876)
// REQ-a33899 t6：TOKEN_CSS 追加在末尾（纯新增区段，不改既有选择器）
// REQ-d3e61a T-5：MARKS_CSS 追加在末尾（纯新增区段，不改既有选择器）
// REQ-4842fe t-3be71b：SUBTASK_CSS 追加在末尾（纯新增区段，不改既有选择器）
// REQ-260923134706-e72f t5：NODE_PANEL_CSS 追加在末尾（纯新增区段，不改既有选择器）
// REQ-260926140539-457b FR-6：TRACEABILITY_CSS 追加在末尾（纯新增区段，不改既有选择器）
// REQ-260928001915-f978：DAG_CSS（真 DAG 画布面板）追加在末尾（纯新增区段，不改既有选择器）
const CSS = BASE_CSS + DETAIL_CSS + FILES_CSS + BOARD_CSS + PANEL_CSS + TOKEN_CSS + MARKS_CSS + SUBTASK_CSS + NODE_PANEL_CSS + TRACEABILITY_CSS + DAG_CSS + SETTINGS_CSS + REPORT_CSS

/**
 * 注入本插件样式表（幂等）。
 *
 * ## 样式归属（2026-10-01 修复「刷新后流程节点样式全丢」）
 *
 * DSH 的 client-modules 在**每次模块 materialize** 时执行 `claimStyles(ownerId)`：
 * 把当时文档里所有 `style:not([data-plugin])` **认领给当前 materialize 的那个插件**，
 * 并把 `data-plugin-css` 记进该模块的 owned 清单；卸载 / HMR 替换 / 图行裁剪时按
 * `data-plugin` 调 `removeOwnedStyles(ownerId)` 整批删除。
 * （实现见 DSH `packages/client/modules/src/client/system.ts` 的 claimStyles 与
 * `entry-lifecycle.ts` 的 removeOwnedStyles；官方 tsdown 预设
 * `packages/client/tsdown.client.ts` 的 styleInjectionModule 因此**自带
 * `tag.dataset.plugin = id`**，并在**工厂执行期**注入。）
 *
 * 我们此前两件都做错了：不带 `data-plugin` 章、且在 `apply()`（materialize 之后）才注入。
 * 后果：本表在文档里一直是「无主」状态，**下一个 materialize 的别的插件**把它认领走；
 * 那个插件一旦被 HMR 替换 / 裁剪，它的 `removeOwnedStyles` 就把**我们**的样式整张删掉。
 * 而本插件的 apply() 不会因此重跑（我们的模块没被动过），样式再也不会回来
 * —— 用户看到的就是：刷新后会话头部流程节点竖排、圆点/配色/连线全丢。
 *
 * 因此本函数做两件事：
 * 1. 新建标签时**自己盖归属章**（`data-plugin` = PLUGIN_ID），谁也认领不走；
 * 2. 标签已存在但归属不对时**纠正回来**（`data-plugin-css` 是我们的 id，只可能是被误认领）。
 */
export function injectStyles(): void {
  if (typeof document === 'undefined') return
  const existing = document.querySelector(`style[data-plugin-css="${CSS_TAG}"]`)
  if (existing !== null) {
    if (existing.getAttribute('data-plugin') !== PLUGIN_ID) existing.setAttribute('data-plugin', PLUGIN_ID)
    return
  }
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = CSS_TAG
  tag.textContent = CSS
  document.head.appendChild(tag)
}

// 模块求值期注入（= client bundle 工厂执行期，与官方 tsdown.client.ts 的
// styleInjectionModule 同时机）：只有在这一刻注入，claimStyles 才会在 materialize 时
// 把本表登记为**本插件所有**；等到 apply() 才注入就漏登记（见 injectStyles 的归属说明）。
// HMR 替换路径下 shell 会先 removeOwnedStyles(PLUGIN_ID) 再重新 materialize，
// 工厂重跑 → 这里重新注入，不会留下空窗。
injectStyles()
