/**
 * 设置弹窗的**共享渲染基元**（REQ-261004103330-005f 对齐趟 1 / 界面基准 `prototype/board-settings.html`）。
 *
 * 为什么单独一份：四屏（上限 / 存储 / 记录 / 通用）在原型里是**同一套视觉语言**——分组盒子、
 * 说明框、色点行标签、两列键值。若各屏各写一份字符串拼接，第一屏改观感时另三屏不会跟着变，
 * "看起来不是同一个界面"就是这么来的。故此处**只放与屏无关的基元**，屏自己的文案/结构不放这里。
 *
 * 配套 CSS 在 `client/styles/settings.ts` 的「共享视觉基元」段（同名类名，一处定义）。
 *
 * 纪律（设计 R4）：类名一律 `dsh-pm-set-` 前缀；颜色一律走 CSS 里的真令牌（`--pm-c-*` / `--dsw-*`），
 * 本文件**不出现任何 hex 色值**——色点只交出"该用什么类"，取色是 CSS 的事。
 *
 * @module dsh-pmboard/client/settings/render/parts
 */

/** HTML 转义（四屏共用一处；文案里的 `>` 等字符必须过这里）。 */
export function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 说明框语气：信息（蓝）/ 提醒（黄）/ 危险（红）/ 成功（绿）。 */
export type NoticeKind = 'info' | 'warn' | 'danger' | 'ok'

/** 说明框（带底色 + 边框）。`inner` 允许带标记（调用方自己 `esc` 普通文案）。 */
export function noticeHtml(kind: NoticeKind, inner: string): string {
  return `<div class="dsh-pm-set-notice is-${kind}">${inner}</div>`
}

/**
 * 屏标题（标题 + 同行副标题）。
 *
 * 原型把副标题**放在标题同一行**（`.pane-title .muted`），不是另起一段——
 * 另起一段会让"标题区"看起来比原型高两行，整屏的密度就散了。
 */
export function paneTitleHtml(title: string, sub?: string): string {
  const tail = sub === undefined || sub.length === 0
    ? ''
    : `<span class="dsh-pm-set-pane-sub">${esc(sub)}</span>`
  return `<h2 class="dsh-pm-set-pane-title">${esc(title)}${tail}</h2>`
}

/** 分组盒子（可选小标题 + 内容）。用于"一张表 / 一组设置项"这类需要视觉分组的内容。 */
export function groupHtml(inner: string, title?: string): string {
  const head = title === undefined || title.length === 0
    ? ''
    : `<h3 class="dsh-pm-set-grp-title">${esc(title)}</h3>`
  return `<section class="dsh-pm-set-grp">${head}<div class="dsh-pm-set-grp-body">${inner}</div></section>`
}

/**
 * 分组标题：主标题 + 灰字副标题（原型 `<h3>后端<span class="muted">数据库开关</span></h3>`）。
 *
 * 副标题按**纯文本**转义；主标题同理——需要更复杂的标题请用 `groupBoxHtml`。
 */
export function groupTitleHtml(title: string, sub?: string): string {
  const tail = sub === undefined || sub.length === 0 ? '' : `<span class="dsh-pm-set-grp-sub">${esc(sub)}</span>`
  return `${esc(title)}${tail}`
}

/**
 * 分组盒子（标题为**本模块产出的 HTML**，故不再转义）。
 *
 * 为什么必须与 `groupHtml` 分开：`groupHtml` 会把标题整个转义——把 `groupTitleHtml` 的结果
 * 交给它，页面上就会出现字面的 `&lt;span …`（这个 bug 在本趟真实发生过一次）。
 */
export function groupBoxHtml(inner: string, headHtml: string): string {
  const head = headHtml.length === 0 ? '' : `<h3 class="dsh-pm-set-grp-title">${headHtml}</h3>`
  return `<section class="dsh-pm-set-grp">${head}<div class="dsh-pm-set-grp-body">${inner}</div></section>`
}

/**
 * 阶段色点。`colorCls` 由调用方给出（如 `dotClassOf('implementing')` → `is-implementing`）——
 * 取色留在 CSS，本文件不碰色值。
 */
export function dotHtml(colorCls: string): string {
  return `<span class="dsh-pm-set-dot ${esc(colorCls)}" aria-hidden="true"></span>`
}

/**
 * 「色点 + 主名 + 副标题」的行标签（原型 `.node-cell`）。
 *
 * `sub` 传**不含分隔符**的多段副标题，由本函数统一加 ` · `——
 * 各调用点自己拼分隔符，很快就会出现"有的带空格有的不带"。
 */
export function labeledCellHtml(colorCls: string, name: string, sub: readonly string[]): string {
  const tail = sub.filter((s) => s.length > 0)
  const subHtml = tail.length === 0
    ? ''
    : `<span class="dsh-pm-set-node-sub"> · ${tail.map((s) => esc(s)).join(' · ')}</span>`
  return `<div class="dsh-pm-set-node-cell">${dotHtml(colorCls)}`
    + `<span class="dsh-pm-set-node-text"><span class="dsh-pm-set-node-name">${esc(name)}</span>${subHtml}</span></div>`
}

/** 等宽小字（路径、版本号、窗口码这类"要能逐字核对"的内容）。 */
export function monoHtml(text: string): string {
  return `<span class="dsh-pm-set-mono">${esc(text)}</span>`
}

/**
 * 两列键值（标签 / 值）。存储屏与记录屏复用。
 *
 * 值允许是**已转义的 HTML**（调用方要放徽章或等宽片段），标签一律按纯文本转义。
 */
export function kvHtml(rows: readonly { readonly k: string; readonly v: string }[]): string {
  const body = rows.map((r) => `<dt>${esc(r.k)}</dt><dd>${r.v}</dd>`).join('')
  return `<dl class="dsh-pm-set-kv is-cols">${body}</dl>`
}
