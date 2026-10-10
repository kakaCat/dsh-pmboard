/**
 * `/pm` 的回执文案（REQ-261009174713-7bc8 · RF-17 · 卡 t18）。
 *
 * 文案**逐字**取自设计 `design/interfaces.md` 的「回执契约」表——命令面的文案是**用户可见契约**，
 * 不在这里自由发挥；改文案等于改契约，要同步设计。
 *
 * `<board_link>` 一律取用例回执里的 `board_link` 字段（与工具面同一来源，命令面**不自拼链接**）；
 * 拿不到链接时只省略链接段，不造一个假链接。
 *
 * @module command-pm/render
 */

/** 有链接则追加 ` · <link>`，没有就不追加（不造链接）。 */
function withLink(base: string, boardLink: string | undefined): string {
  return boardLink === undefined || boardLink === '' ? base : base + ' · ' + boardLink
}

/** 创建成功：`已创建需求 <REQ-ID> · <board_link>`。 */
export function renderCreated(requirementId: string, boardLink?: string): string {
  return withLink('已创建需求 ' + requirementId, boardLink)
}

/** show（本窗口无绑定）：`本窗口未绑定需求。用法：/pm <需求名称>`。 */
export function renderUnbound(): string {
  return '本窗口未绑定需求。用法：/pm <需求名称>'
}

/** show（已绑定）：`本窗口需求：<REQ-ID> <title> · 阶段 <status> · <board_link>`。 */
export function renderBound(requirementId: string, title: string, status: string, boardLink?: string): string {
  return withLink('本窗口需求：' + requirementId + ' ' + title + ' · 阶段 ' + status, boardLink)
}

/** 已绑定进行中需求（REQBOARD_WINDOW_BOUND）：`本窗口已绑定进行中需求 <REQ-ID>；先推进或取消它再立项`。 */
export function renderWindowBound(requirementId?: string): string {
  const id = requirementId === undefined || requirementId === '' ? '' : ' ' + requirementId
  return '本窗口已绑定进行中需求' + id + '；先推进或取消它再立项'
}

/** 工作区不可用（REQBOARD_INVALID_WORKSPACE）。 */
export function renderWorkspaceUnavailable(): string {
  return '工作区不可用，需求落不了盘（REQBOARD_INVALID_WORKSPACE）'
}

/** 入参非法（REQBOARD_INVALID_INPUT）/ 名称超长。 */
export function renderUsage(): string {
  return '用法：/pm [<需求名称>]（名称 ≤ 120 字符）'
}

/** 未知错误：不吞异常，但也不把栈丢给用户。 */
export function renderUnknown(message: string): string {
  return '命令执行失败：' + message
}
