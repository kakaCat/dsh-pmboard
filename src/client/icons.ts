/**
 * 详情页**图标唯一来源**（REQ-261005155003-f32f · FR-1 / FR-8）——纯导出、零依赖、零副作用。
 *
 * 为什么独立成模块（而不是让每个渲染模块自带一份）：图标是**结构语义**，不是某个面板的内容。
 * 散在 `report-tabs` / `report-band` / `panels/*` 里就是六份各自为政的图标——emoji 时代正是如此：
 * 同一排 Tab 里「汇报」琥珀、「DAG」浅灰近乎看不见、「Token」深黑，既没有统一线宽与网格，
 * 也无法机械断言（跨平台还会因系统字型而变）。
 *
 * 三条纪律（改本文件时必须保住）：
 *  ① **全族一套常量**：16×16 网格、线宽 1.5、描边取文字色、面 `none`、圆角端点——
 *     十个图标逐字复用同一组值（值只在 {@link ICON_VIEW_BOX} / {@link ICON_STROKE_WIDTH} 定义一次）。
 *  ② **尺寸与颜色不进字符串**：值里没有 `width`/`height`/`style`/`class` 这些**属性**，也没有任何
 *     色值字面量（`currentColor` 是"继承文字色"，不是颜色字面量）。尺寸只由消费端 CSS 令牌
 *     `--pm-icon`（14px，Tab 栏）与 `--pm-icon-sm`（12px，行内）决定——"只有两档"因此是**令牌事实**，
 *     不是逐图标的自觉。颜色由 `currentColor` 跟随宿主，Tab 选中态自动跟文字一起变色。
 *  ③ **装饰性**：图标旁总有可见文字（Tab 名 / 缺口文案），故值里一律带装饰标记，**不产出**可访问名
 *     （没有 `role` / `aria-label` / `<title`）——本模块不制造"只有图标没有名字"的控件。
 *
 * 判据口径（验收 grep，先在此写明以免后人误读）：
 *  · `grep -c` 的**图标数 = 10**：每个图标一行开标签，网格属性与装饰标记都落在那一行上（7 Tab + 3 圆点）；
 *  · 「无尺寸字面量」必须按**属性边界**匹配，例如 `grep -c -E ' (width|height|style)='`。
 *    直接 grep `width` 会命中线宽那条**全族强制常量**（`stroke-` 前缀的 1.5，FR-1 #1 点名要求），
 *    那是线宽不是尺寸；除它之外，本模块的值里没有任何 width/height/style 属性。
 *
 * @module dsh-pmboard/client/icons
 */
// 类型单向依赖：图标模块**不**反向 import 渲染层（`import type` 编译期擦除，运行时零依赖）
import type { ReportTabKey } from './views/report-tabs.js'
import type { ReportGap } from '../shared/protocol.js'

/** 网格（全族常量）：十六格见方，十个图标都画在这个网格上。 */
export const ICON_VIEW_BOX = '0 0 16 16'

/** 线宽（全族常量）：与权威原型 `prototypes/detail-ui-v3.html#FR-1` 的图标逐字一致。 */
export const ICON_STROKE_WIDTH = '1.5'

/**
 * 七个 Tab 的结构图标：值 = **完整的内联 SVG 字符串**，可直接拼进 HTML
 * （与全仓"纯字符串渲染"一致：不装图标库、不用 icon font、不引网络资源）。
 *
 * 前六枚形状取自权威原型 `prototypes/detail-ui-v3.html#FR-1`（`?v=next`）的 Tab 栏，逐字对齐：
 * 汇报 = 清单/段落 · 文档 = 纸页 · DAG = 节点网络 · 对话 = 气泡 · Token = 圆环硬币 · 提示词 = 终端提示符；
 * 第七枚「验收」（REQ-261006130057-7a43 FR-8）= 盾形对勾，插在「对话」与「Token」之间（与注册表同序）。
 *
 * 键 = 既有 `ReportTabKey`（`views/report-tabs.ts`），故**漏写一个键是编译期类型错**，不会静默回落 emoji。
 */
export const TAB_ICON_SVG: Record<ReportTabKey, string> = {
  trunk: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<line x1="3.25" y1="4.25" x2="12.75" y2="4.25"/>'
    + '<line x1="3.25" y1="8" x2="12.75" y2="8"/>'
    + '<line x1="3.25" y1="11.75" x2="9.25" y2="11.75"/>'
    + '</svg>',
  docs: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<path d="M4.25 1.75h5L12.5 5.25v9H4.25z"/>'
    + '<path d="M9.25 1.75v3.5h3.25"/>'
    + '</svg>',
  dag: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<circle cx="3.5" cy="8" r="1.75"/>'
    + '<circle cx="12.5" cy="3.75" r="1.75"/>'
    + '<circle cx="12.5" cy="12.25" r="1.75"/>'
    + '<path d="M5.15 7.15 10.95 4.4"/>'
    + '<path d="M5.15 8.85l5.8 2.75"/>'
    + '</svg>',
  dialogue: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<path d="M13.75 7.75c0 2.9-2.57 5.25-5.75 5.25-.7 0-1.37-.12-1.99-.34L2.5 13.75l1.14-2.72A5.03 5.03 0 0 1 2.25 7.75C2.25 4.85 4.82 2.5 8 2.5s5.75 2.35 5.75 5.25Z"/>'
    + '</svg>',
  /* 验收（REQ-261006130057-7a43 FR-8）：盾形 + 对勾——与既有六枚同一套全族常量
     （16 网格 / 线宽 1.5 / 描边取文字色 / 面 none / 圆角端点）。 */
  verify: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<path d="M8 1.75 12.9 3.7v4.05c0 3.05-2.08 5.32-4.9 6.4-2.82-1.08-4.9-3.35-4.9-6.4V3.7z"/>'
    + '<path d="m5.6 8.05 1.7 1.7 3.2-3.4"/>'
    + '</svg>',
  token: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<circle cx="8" cy="8" r="5.75"/>'
    + '<circle cx="8" cy="8" r="2.25"/>'
    + '</svg>',
  prompts: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<path d="M3.4 5.2 6 8l-2.6 2.8"/>'
    + '<path d="M8 11h4.6"/>'
    + '</svg>',
}

/**
 * 缺口严重度圆点（FR-8 #2）：把原来靠系统字型的 emoji 圆点（红/黄/灰）换成**不依赖字体**的圆。
 *
 * 为什么三个键的值目前同形（同一个描边圆）：**严重度由颜色承载**——消费端 CSS 按
 * `.dsh-pm-gap-line[data-severity]` 给 `color`，圆点靠 `currentColor` 上色；
 * 而"不靠颜色单一表达"这条判据由**周边真实文本标记**承担（`report-band.ts` 输出 `!!` / `!` / `·`，
 * 不是伪元素），不在本模块。仍保留 `Record` 形状的理由：键集合绑定 `ReportGap['severity']`，
 * severity 增删即编译期报错，且消费端一律按 severity 取值的写法不必跟着改。
 *
 * 描边圆（而不是实心点）是**全族常量**的结果：本模块所有图标共用"面 none + 描边取文字色"一套值，
 * 圆点不为自己单开一个填充色例外。尺寸同样只走 CSS 令牌（缺口行用 `--pm-icon-sm`，12px）。
 */
export const GAP_DOT_SVG: Record<ReportGap['severity'], string> = {
  red: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<circle cx="8" cy="8" r="4"/>'
    + '</svg>',
  yellow: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<circle cx="8" cy="8" r="4"/>'
    + '</svg>',
  gray: `<svg viewBox="${ICON_VIEW_BOX}" fill="none" stroke="currentColor" stroke-width="${ICON_STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`
    + '<circle cx="8" cy="8" r="4"/>'
    + '</svg>',
}
