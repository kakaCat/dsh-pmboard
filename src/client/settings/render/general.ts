/**
 * 通用屏的**纯字符串渲染**（REQ-261004103330-005f t14 / 对齐趟 2）。
 *
 * 只读信息屏：设置文件 / 台账数据根 / 当前后端 / 版本 / 指纹 / schema / 运行时。
 * 与另三屏共用基元（`parts.ts`）——"四屏长得像同一个界面"靠的就是这一层复用。
 *
 * 显式动作（下面 `openConfig` 那条）：**打开配置文件**按钮在页头，本屏只负责在
 * 「设置文件」行里说清"还没创建"这件事。按钮的 `disabled` 是壳的属性，
 * 屏内不该再长一个同名按钮（那会变成第二个入口）。
 *
 * @module dsh-pmboard/client/settings/render/general
 */

import type { GeneralRow } from '../general.ts'
import { esc, groupBoxHtml, groupTitleHtml, kvHtml, noticeHtml, paneTitleHtml } from './parts.ts'

export interface GeneralPaneInput {
  readonly rows: readonly GeneralRow[]
  /** 「打开配置文件」的可用性与提示（R7：惰性创建下文件可能还不存在）。 */
  readonly openConfig: { readonly disabled: boolean; readonly hint: string }
  /** 版本不一致时的重建指引（有就红字提示"别硬读旧表"）。 */
  readonly rebuildHint?: string
}

/** 一行的值：等宽内容 + 灰色出处注（注里的 `**` 是原型的加粗语法，这里用 `<b>` 呈现）。 */
function rowOf(row: GeneralRow): { readonly k: string; readonly v: string } {
  const note = row.note === undefined
    ? ''
    : `<span class="dsh-pm-set-kv-note">（${esc(row.note)}）</span>`
  const value = row.mono === true
    ? `<span class="dsh-pm-set-mono">${esc(row.value)}</span>`
    : esc(row.value)
  return { k: row.label, v: value + note }
}

export function buildGeneralPane(input: GeneralPaneInput): string {
  const rebuild = input.rebuildHint !== undefined
    ? noticeHtml('danger', esc(input.rebuildHint))
    : ''
  // 「尚未创建」是**正常态**而不是错误：用 info 语气说清惰性创建的理由，不要用红字吓人
  const openHint = input.openConfig.disabled
    ? noticeHtml('info', esc(input.openConfig.hint))
    : ''
  return paneTitleHtml('通用', '只读信息，用来对账「现在跑的是哪份东西」')
    + groupBoxHtml(kvHtml(input.rows.map(rowOf)), groupTitleHtml('运行信息'))
    + rebuild
    + openHint
}
