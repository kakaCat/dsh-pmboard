/**
 * 系统记录屏的**纯字符串渲染**（REQ-261004103330-005f t14 / 设计 `frontend.md` 屏 3）。
 *
 * 与 `render/shell.ts` / `render/limits.ts` 同构：入参是视图模型、出参是 HTML 字符串，不碰 DOM。
 *
 * 两条硬纪律：
 *   · **页面里不得出现任何"合并"入口**（本设计不做合并）——只提示"重启前请重跑迁移"；
 *   · 类名全部 `dsh-pm-set-` 前缀 + 真令牌（设计 R4）。
 *
 * @module dsh-pmboard/client/settings/render/records
 */

import type { RecordsPaneModel, TimelineEntry } from '../records.ts'
import { esc, groupBoxHtml, groupTitleHtml, kvHtml, noticeHtml, paneTitleHtml } from './parts.ts'

/** 分组盒子（原型 `.card` + `h3`）——与另三屏共用同一套基元，避免"四屏各长一样"。 */
function section(title: string, body: string, sub?: string): string {
  return groupBoxHtml(body, groupTitleHtml(title, sub))
}

function timelineItem(entry: TimelineEntry): string {
  const lines = entry.lines.map((l) => `<span class="dsh-pm-set-tl-line">${esc(l)}</span>`).join('')
  const by = entry.by !== undefined ? `<span class="dsh-pm-set-tl-by">${esc(entry.by)}</span>` : ''
  return `<li class="dsh-pm-set-tl-item is-${entry.tone}" data-event="${esc(entry.event)}">`
    + `<span class="dsh-pm-set-tl-time">${esc(entry.at)}</span>`
    + `<span class="dsh-pm-set-tl-title">${esc(entry.title)}</span>`
    + lines + by
    + `</li>`
}

function droppedBlock(model: RecordsPaneModel): string {
  if (model.dropped.length === 0) return ''
  const items = model.dropped
    .map((d) => `<div class="dsh-pm-set-red-inline is-${d.tone}">${esc(d.label)}：${esc(d.text)}</div>`)
    .join('')
  return section('事件丢弃', items)
}

/** 版本核对的句子是「键：值」形，拆成两列才像原型的 `kv-readonly`（原样保留整句会挤成一列）。 */
function compatRows(lines: readonly string[]): { readonly k: string; readonly v: string }[] {
  return lines.map((l) => {
    const i = l.indexOf('：')
    return i > 0 ? { k: l.slice(0, i), v: esc(l.slice(i + 1)) } : { k: '', v: esc(l) }
  })
}

function readyBody(model: RecordsPaneModel): string {
  // 「记录文件」：路径 / 写入者 / 更新时刻 / 初始化 / 保留策略 / 本安装版本 / 版本字段
  // —— 这几行是原型屏 3 的**主体**：它们回答"这份记录归谁写、什么时候建的、裁不裁剪、哪个版本写的"。
  const rows: { k: string; v: string }[] = []
  // 路径行 + 「打开系统记录文件」按钮：复用既有的 settings-open-config 动作（意图层已把它指向本文件），
  // 不新增动作名 → 不必动 SETTINGS_ACTIONS，也就不会与在飞改动撞车。
  const openSelf = model.systemFilePath === undefined
    ? ''
    : ` <button type="button" class="dsh-pm-btn sm" data-action="settings-open-config"`
      + ` title="用系统默认程序打开 ${esc(model.systemFilePath)}">打开系统记录文件</button>`
  rows.push({ k: '路径', v: `<span class="dsh-pm-set-mono">${esc(model.systemFilePath ?? '未知（服务端未返回）')}</span>` + openSelf })
  rows.push({ k: '写入者', v: esc('宿主（启动 / 装配 / 后端切换）+ 迁移 Agent（迁移与校验结果，带窗口键与确认人）') })
  if (model.updatedAt !== undefined) {
    rows.push({ k: '更新时刻', v: `<span class="dsh-pm-set-mono">${esc(model.updatedAt)}</span>` })
  }
  if (model.activeText !== undefined) rows.push({ k: '当前生效', v: esc(model.activeText) })
  rows.push({
    k: '初始化',
    v: '<b>插件启动时自动创建</b>'
      + (model.recordedAt === undefined ? '' : `<span class="dsh-pm-set-muted">（本记录创建于 ${esc(model.recordedAt)}）</span>`)
      + '<span class="dsh-pm-set-muted">（幂等——文件已存在则只追加，不覆盖）</span>',
  })
  rows.push({ k: '保留策略', v: esc('只追加不裁剪（单条 < 1 KB，一年量级仍在百 KB 内）') })
  if (model.pluginVersion !== undefined) {
    rows.push({
      k: '本安装版本',
      v: `<b>dsh-pmboard ${esc(model.pluginVersion)}</b>`
        + (model.pluginBuildStamp === undefined ? '' : ` · build <span class="dsh-pm-set-mono">${esc(model.pluginBuildStamp)}</span>`)
        + '<span class="dsh-pm-set-muted">（写在本文件顶层 <span class="dsh-pm-set-mono">plugin</span> 块：这就是"这个安装是哪个版本"的档案）</span>',
    })
  }
  rows.push({
    k: '版本字段',
    v: '每条事件都带 <span class="dsh-pm-set-mono">plugin: { version, buildStamp }</span>'
      + '<span class="dsh-pm-set-muted">——事后能判断"这次迁移是哪个版本的插件干的"</span>',
  })
  // 原始 JSON：**可展开**（默认收起，避免把这一屏撑得很长），内容逐字转义后放进 <pre>
  const raw = model.rawJson === undefined
    ? ''
    : `<details class="dsh-pm-set-json">`
      + `<summary>原始 JSON（文件里到底写了什么）</summary>`
      + `<pre class="dsh-pm-set-mono">${esc(model.rawJson)}</pre>`
      + `</details>`
  const head = section('记录文件', kvHtml(rows) + raw, '追加式；机器写，人只读')

  const stale = model.staleText !== undefined
    ? noticeHtml('danger', esc(model.staleText))
    : ''

  const timeline = section('后端使用史',
    model.timeline.length > 0
      ? `<ol class="dsh-pm-set-tl">${model.timeline.map(timelineItem).join('')}</ol>`
      : '<p class="dsh-pm-set-empty">还没有任何事件记录。</p>',
    '「以前用过 SQLite」这件事回滚后也必须查得到')

  const paths = model.paths.length > 0
    ? section('数据路径档案', kvHtml(model.paths.map((p) => ({ k: p.label, v: `<span class="dsh-pm-set-mono">${esc(p.value)}</span>` }))),
      '实际解析到的路径与体量，不是配置里的写法')
    : ''

  const compat = section('版本一致性核对',
    kvHtml(compatRows(model.compat.lines))
    + (model.compat.rebuildHint !== undefined
      ? noticeHtml('danger', esc(model.compat.rebuildHint))
      : ''),
    '版本号真正的用处：判断旧记录还作不作数')

  return head + stale + timeline + paths + compat + droppedBlock(model)
}

/**
 * 整屏 HTML。
 *
 * 四种形态各有明确呈现：**加载中**（不是错误）、**读不到**（error）、**读到了但内容坏**（invalid）、
 * **正常**（ready）——把前两者混起来会让人以为档案坏了。
 */
export function buildRecordsPane(model: RecordsPaneModel): string {
  const title = paneTitleHtml('系统记录', '这台机器上「数据放在哪、以前用过哪个后端、谁在什么时候改的」')
  if (model.mode === 'loading') {
    const invalid = model.invalidText !== undefined
      ? noticeHtml('danger', esc(model.invalidText))
      : ''
    return title + `<p class="dsh-pm-set-placeholder">正在读取系统记录…</p>` + invalid + droppedBlock(model)
  }
  if (model.mode === 'error') {
    return title + noticeHtml('danger', esc(model.errorText ?? '读取系统记录失败'))
      + '<p class="dsh-pm-set-empty">设置页其余分类不受影响。</p>'
      + droppedBlock(model)
  }
  if (model.mode === 'invalid') {
    return title + noticeHtml('danger', esc(model.invalidText ?? '系统记录文件损坏'))
      + '<p class="dsh-pm-set-empty">其余分类不受影响；本次不自动重建，也不提供任何"合并"动作。</p>'
      + droppedBlock(model)
  }
  // **正常态也必须带标题**：这里曾漏过 `title`（只有 loading/error/invalid 三态带了），
  // 结果是"最常见的那种状态反而没有屏标题"，肉眼一看就知道和另外三屏不是一套。
  return title + readyBody(model)
}
