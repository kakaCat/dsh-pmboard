/**
 * 「Token」Tab 面板（REQ-261004222448-292a · FR-10 / t-f62af2）——以**阶段**为主视图的花费表。
 *
 * 契约见 `panels/trunk.ts` 的模块头（导出名与类型不得改）。
 *
 * 为什么这里只有三行：面板卡不该再实现一遍渲染——`token-info.ts` 已经是「按阶段八列 + 优化点 +
 * 三态」的唯一实现（旧详情页 Token Tab 也在用它）。本文件只负责把 `unknown` 载荷交给那个渲染器，
 * 于是「旧 Tab 与新 Tab 的占比分母/命中率口径分叉」在结构上不可能发生。
 *
 * 注意：本面板的"不可得"**不走 Degrade 信封**——token 端点的三态写在载荷里的
 * `availability: 'full'|'partial'|'none'`（interfaces.md §Token 扩展）；
 * 「无 token 快照」时**不得**渲染 0 值表（FR-10 判定③、T-19）。
 *
 * @module dsh-pmboard/client/views/panels/token
 */
import type { ReportTabDef } from '../report-tabs.js'
import { renderTokenPanel } from '../../token-info.js'

export const tokenPanel: ReportTabDef = {
  key: 'token',
  label: 'Token',
  badge: () => undefined,
  render: (data) => renderTokenPanel(data),
}
