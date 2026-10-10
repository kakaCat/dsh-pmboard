/**
 * 侧栏「项目看板」条目的标志图（sidebar.panellist 图标占用者）。
 *
 * 契约（client Slots Inspect 实测，非推测）：
 * - 插槽 `sidebar.panellist`（list / root 作用域）：注册项收 `{ id, order, label }`，
 *   占用者收 **`{ size: number; active: boolean }`** —— size = 请求的像素边长，active = 该面板是否在主列被选中。
 * - 标签文案由 list 元数据投影（PANEL_LABEL），故图标本身 `aria-hidden`，不承担可访问名。
 *
 * 形状选择：三列高低不等的圆角矩形 = 看板（Kanban）。选中态用同色低透明度填充，
 * 与侧栏其余条目共用 `currentColor`，因此亮/暗主题都自动跟随，不写死颜色。
 *
 * 为什么单独一个模块：`page/page-panel.ts` 是本包唯一「零 import」的注册 helper
 * （自包含纪律），react 只在本模块引入。
 *
 * @module dsh-pmboard/client/page/panel-icon
 */
import { createElement } from 'react'

/** 侧栏图标组件收到的 props（与插槽 ownerProps 同形；字段可缺省以便容错）。 */
export interface PmboardPanelIconProps {
  /** 请求的方形边长（像素）。 */
  size?: number
  /** 该面板是否在主列被选中。 */
  active?: boolean
}

/** 板面外框（16 视口）。 */
const FRAME = { x: 1.8, y: 2.6, width: 12.4, height: 10.8, rx: 2, strokeWidth: 1.4 }

/** 板内三列：x 起点 + 列宽 + 列高（顶部对齐 y=5，三列高低不等 = 看板语义）。 */
const COLUMNS: ReadonlyArray<readonly [number, number, number]> = [
  [4, 2.1, 6],
  [7, 2.1, 3.6],
  [10, 2.1, 4.8],
]

/**
 * 「项目看板」标志图 —— 一块板面（外框）+ 板内三列。
 *
 * 形状选择（2026-09-30 用户第二轮裁定）：上一版是「三根实心竖条」，16px 下读不出
 * 「项目」，用户判「不好看」。改为带外框的板面：外框给出「一块板」的轮廓，
 * 内部三列高低不等保留看板语义——缩到 16px 也读得出是「板 + 列」，且与侧栏
 * 线框类图标风格一致（候选对照见用户选定稿）。
 *
 * @param props - 插槽注入的 `{ size, active }`；缺省 size=16、active=false。
 * @returns React 元素（svg）
 */
export function PmboardPanelIcon(props: PmboardPanelIconProps): unknown {
  const size = typeof props.size === 'number' && props.size > 0 ? props.size : 16
  const active = props.active === true
  const frame = createElement('rect', {
    key: 'frame',
    x: FRAME.x,
    y: FRAME.y,
    width: FRAME.width,
    height: FRAME.height,
    rx: FRAME.rx,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: FRAME.strokeWidth,
  })
  const columns = COLUMNS.map(([x, width, height], i) =>
    createElement('rect', {
      key: `col-${i}`,
      x,
      y: 5,
      width,
      height,
      rx: 0.7,
      fill: 'currentColor',
      // 颜色完全交给侧栏（currentColor 随主题与选中态走）；这里只做极轻的选中态加重
      fillOpacity: active ? 1 : 0.8,
    }))
  return createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': 'true',
      focusable: 'false',
      'data-pm-icon': 'board',
    },
    frame,
    ...columns,
  )
}
