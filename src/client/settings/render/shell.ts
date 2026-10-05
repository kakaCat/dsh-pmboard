/**
 * 设置弹窗**骨架渲染**（REQ-261004103330-005f t11 / 设计 `frontend.md` §组件结构 S-0…S-6）。
 *
 * 本文件出**壳**：宿主、遮罩、弹窗头、左菜单、四个屏位。
 * 四屏内容已由后续卡填齐（上限屏 / 存储屏 / 记录屏 / 通用屏各一份渲染器），本文件只负责分派，不再有占位。
 * 渲染是**纯字符串**——与 `client/views/*` 同构，因而能在 Node 环境直测（无需 DOM）。
 *
 * 类名与令牌纪律（设计 R4）：全部 `dsh-pm-set-` 前缀 + 真令牌（`--pm-*` / `--dsw-*`）；
 * 原型里的 `--s-*` 私有变量与无前缀类名**一律不得**出现在这里。
 *
 * @module dsh-pmboard/client/settings/render/shell
 */

import {
  SETTINGS_PANES,
  openConfigBadge,
  openConfigIntent,
  openConfigHint,
  type SettingsShellState,
} from '../model.ts'
import type { SettingsPane } from '../types.ts'
import { buildLimitsPane } from './limits.ts'
import { buildStoragePane } from './storage.ts'
import { buildRecordsPane } from './records.ts'
import { buildGeneralPane } from './general.ts'
import { recordsPaneModelOf } from '../records.ts'
import { generalRowsOf, openConfigCopyOf, rebuildHintOf } from '../general.ts'
import { compatOf } from '../records.ts'
import { REQBOARD_SCHEMA_VERSION } from '../../../shared/protocol.ts'

/** 元素 id 的唯一构造处（`aria-controls` / `aria-labelledby` 两处引用必须同源）。 */
export const SHELL_ID = {
  title: 'dsh-pm-set-title',
  tab: (pane: SettingsPane): string => 'dsh-pm-set-tab-' + pane,
  panel: (pane: SettingsPane): string => 'dsh-pm-set-pane-' + pane,
} as const

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * 左菜单图标（逐字取自界面基准原型 `prototype/board-settings.html` 的 `.dlg-nav svg`）。
 *
 * 为什么照抄原型而不是自画：菜单图标是"这屏是干什么的"的第一眼线索，
 * 原型的四个图标已经定稿；重画一套只会让人看到"另一种不一致"。
 */
const PANE_ICON: Record<SettingsPane, string> = {
  limits: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  storage: '<ellipse cx="12" cy="6.5" rx="7.5" ry="3"/><path d="M4.5 6.5v11c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-11"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  records: '<path d="M3.8 12a8.2 8.2 0 1 0 2.6-6"/><path d="M3.5 4.5V8h3.5"/><path d="M12 8v4.4l3 1.8"/>',
  general: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8v.2"/>',
}

/** 左菜单（`role=tablist`；横向/纵向由 CSS 断点决定，`aria-orientation` 随之给出）。 */
function buildNav(state: SettingsShellState): string {
  // 未保存项数挂在「运行上限」上（原型里就是这一个角标），让人不切屏也知道有改动没保存
  const unsaved = Object.keys(state.drafts).length
  const items = SETTINGS_PANES.map((p) => {
    const selected = p.key === state.pane
    const sub = p.key === 'limits' && unsaved > 0
      ? `<span class="dsh-pm-set-nav-sub">${String(unsaved)}</span>`
      : ''
    return `<button type="button" class="dsh-pm-set-nav-item${selected ? ' is-active' : ''}"`
      + ` role="tab" aria-selected="${selected ? 'true' : 'false'}"`
      + ` aria-controls="${SHELL_ID.panel(p.key)}" id="${SHELL_ID.tab(p.key)}"`
      + ` data-action="settings-pane" data-pane="${p.key}">`
      + `<svg class="dsh-pm-set-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
      + ` stroke-width="1.7" stroke-linecap="round" aria-hidden="true">${PANE_ICON[p.key]}</svg>`
      + `<span class="dsh-pm-set-nav-label">${esc(p.label)}</span>${sub}</button>`
  }).join('')
  return `<nav class="dsh-pm-set-nav" role="tablist" aria-orientation="vertical" aria-label="设置分类">${items}</nav>`
}

/** 屏位容器（内容由各屏渲染器注入；本函数只保证 ARIA 与选中态正确）。 */
export function buildPanePlaceholder(pane: SettingsPane): string {
  return `<p class="dsh-pm-set-placeholder">「${esc(paneTitle(pane))}」的内容将在后续任务卡中落地。</p>`
}

/** 从系统记录的路径档案里安全取一个字符串（服务端字段是 `Record<string, unknown>`）。 */
function pathOf(state: SettingsShellState, key: string): string | undefined {
  // 摘要优先（弹窗一打开就有）；记录屏的全量数据是第二条来源
  if (key === 'shardDataRoot' && state.shardDataRoot !== undefined) return state.shardDataRoot
  const rec = state.systemRecord
  if (rec === undefined || rec.ok !== true) return undefined
  // 路径档案是**可选**的（旧记录、损坏后重建的记录都可能没有）：缺了就当没有，不要在这里炸
  const paths = rec.paths as Record<string, unknown> | undefined
  const v = paths === undefined ? undefined : paths[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function paneTitle(pane: SettingsPane): string {
  return SETTINGS_PANES.find((p) => p.key === pane)?.label ?? pane
}

/**
 * 屏位内容分派：`limits`（t12）/ `storage`（t13）/ `records` 与 `general`（t14）均已落地。
 *
 * 为什么要集中在这一处：`buildPanePlaceholder` 是"还没做"的显式标记，
 * 谁落地了就把哪一屏从这里换掉——避免出现"两处都在渲染同一屏"的分叉。
 */
function paneContent(pane: SettingsPane, state: SettingsShellState): string {
  if (pane === 'limits') {
    return buildLimitsPane({
      limits: state.limits ?? {},
      drafts: state.drafts,
      saving: state.saving,
      ...(state.saveError !== undefined ? { error: state.saveError } : {}),
      // 说明框里要写"保存写入 <真实路径>"；不传就只能退回展示用的默认路径（那等于在骗人）
      ...(state.settingsFilePath !== undefined ? { settingsFilePath: state.settingsFilePath } : {}),
    })
  }
  if (pane === 'storage') {
    // 「第 5 步做完了」的唯一硬证据：设置文件里后端已写成 sqlite 且来源是设置文件。
    // 不从别处推——推错会让人以为设置已经写好。
    const written = state.storage !== undefined
      && state.storage.backend.value === 'sqlite'
      && state.storage.backend.source === 'settings'
    return buildStoragePane({
      ...(state.storage !== undefined ? { storage: state.storage } : {}),
      phase: state.storagePhase,
      ...(state.storageAction !== undefined ? { action: state.storageAction } : {}),
      ...(state.storageTicket !== undefined ? { ticket: state.storageTicket } : {}),
      ...(state.migrationWindowKey !== undefined ? { windowKey: state.migrationWindowKey } : {}),
      ...(state.storageError !== undefined ? { error: state.storageError } : {}),
      ...(state.migrationRequirements !== undefined ? { requirements: state.migrationRequirements } : {}),
      ...(state.sqliteExists !== undefined ? { sqliteExists: state.sqliteExists } : {}),
      ...(state.sqliteRequirements !== undefined ? { sqliteRequirements: state.sqliteRequirements } : {}),
      ...(pathOf(state, 'shardDataRoot') !== undefined ? { shardDataRoot: pathOf(state, 'shardDataRoot') } : {}),
      ...(state.pathError !== undefined ? { pathError: state.pathError } : {}),
      backendWritten: written,
    })
  }
  if (pane === 'records') {
    return buildRecordsPane(recordsPaneModelOf({
      ...(state.systemRecord !== undefined ? { record: state.systemRecord } : {}),
      ...(state.systemFilePath !== undefined ? { systemFilePath: state.systemFilePath } : {}),
      ...(state.systemLoading === true ? { loading: true } : {}),
      ...(state.systemError !== undefined ? { error: state.systemError } : {}),
    }))
  }
  if (pane === 'general') {
    const sqliteSchemaVersion = (() => {
      const rec = state.systemRecord
      const version = rec !== undefined && rec.ok === true ? rec.plugin.sqliteSchemaVersion : undefined
      return typeof version === 'number' ? version : undefined
    })()
    // 版本一致性只从系统记录来（没记录就不给结论——不假装"一致"）
    const compat = state.systemRecord !== undefined && state.systemRecord.ok === true
      ? compatOf(state.systemRecord)
      : undefined
    const dataRoot = pathOf(state, 'shardDataRoot')
    const backend = (() => {
      if (state.storage === undefined) return undefined
      const label = state.storage.backend.source === 'settings' ? '设置文件'
        : state.storage.backend.source === 'config' ? '插件配置'
          : state.storage.backend.source === 'env' ? '环境变量' : '内置默认'
      return { effective: state.storage.effective === 'sqlite' ? 'SQLite' : 'JSON 分片', sourceLabel: label }
    })()
    return buildGeneralPane({
      rows: generalRowsOf({
        ...(dataRoot !== undefined ? { dataRoot } : {}),
        ...(backend !== undefined ? { backend } : {}),
        ...(state.pluginVersion !== undefined ? { pluginVersion: state.pluginVersion } : {}),
        ...(state.pluginBuildStamp !== undefined ? { pluginBuildStamp: state.pluginBuildStamp } : {}),
        ...(state.settingsFilePath !== undefined ? { settingsFilePath: state.settingsFilePath } : {}),
        settingsFileExists: state.settingsFileExists,
        ledgerSchemaVersion: REQBOARD_SCHEMA_VERSION,
        ...(sqliteSchemaVersion !== undefined ? { sqliteSchemaVersion } : {}),
      }),
      openConfig: openConfigCopyOf({
        ...(state.settingsFilePath !== undefined ? { path: state.settingsFilePath } : {}),
        exists: state.settingsFileExists,
      }),
      ...(compat !== undefined && rebuildHintOf(compat.consistent) !== undefined
        ? { rebuildHint: rebuildHintOf(compat.consistent) }
        : {}),
    })
  }
  return buildPanePlaceholder(pane)
}

/** 四个屏位（选中者可见，其余 `hidden`——**不是**从 DOM 里删掉，便于保态）。 */
function buildPanes(state: SettingsShellState): string {
  return SETTINGS_PANES.map((p) => {
    const selected = p.key === state.pane
    return `<section class="dsh-pm-set-pane" role="tabpanel" data-pane="${p.key}"`
      + ` id="${SHELL_ID.panel(p.key)}" aria-labelledby="${SHELL_ID.tab(p.key)}"`
      + `${selected ? '' : ' hidden'}>${paneContent(p.key, state)}</section>`
  }).join('')
}

/** 状态区（`aria-live`：加载中/失败文案；四屏共用一处）。 */
function buildStatus(state: SettingsShellState): string {
  const text = state.error !== undefined
    ? state.error
    : state.loading ? '正在读取运行设置…' : ''
  const tone = state.error !== undefined ? ' is-error' : ''
  return `<div class="dsh-pm-set-status${tone}" role="status" aria-live="polite">${esc(text)}</div>`
}

/**
 * 弹窗壳（宿主**内部**的全部内容：遮罩 + 弹窗）。
 *
 * 宿主本身由 `controller.ts` 创建（`div.dsh-pm-set-host[data-dsh-pm-settings]`），
 * 因为"挂到哪"是有副作用的事，渲染层不碰。
 */
export function buildSettingsShell(state: SettingsShellState): string {
  // 可用性与提示都按**意图**来（开放哪份文件由 model.openConfigIntent 决定：优先系统记录文件）
  const intent = openConfigIntent(state)
  const canOpen = intent.kind === 'open'
  const hint = intent.kind === 'open' ? '用系统默认程序打开 ' + intent.path : openConfigHint(state)
  const ver = state.pluginVersion !== undefined
    ? `<span class="dsh-pm-set-ver" title="插件版本">dsh-pmboard v${esc(state.pluginVersion)}</span>`
    : ''
  return `<div class="dsh-pm-set-mask" data-action="settings-close" aria-hidden="true"></div>`
    + `<div class="dsh-pm-set-dlg" role="dialog" aria-modal="true" aria-labelledby="${SHELL_ID.title}">`
    + `<div class="dsh-pm-set-head">`
    + `<h2 class="dsh-pm-set-title" id="${SHELL_ID.title}">设置</h2>`
    + ver
    + `<span class="dsh-pm-set-spacer"></span>`
    // **不**用 `disabled`：禁用的按钮不派发点击，用户只会看到「点了没反应」。
    // 改用 `aria-disabled`（外观仍置灰、语义仍是当前不可用）+ **可见**旁注（不靠悬停）；
    // 点击交由控制器把人带到「通用」屏看完整解释。
    + `<button type="button" class="dsh-pm-btn" data-action="settings-open-config"`
    + `${canOpen ? '' : ' aria-disabled="true"'} title="${esc(hint)}">打开配置文件</button>`
    + (openConfigBadge(state).length > 0
      ? `<span class="dsh-pm-set-head-note" title="${esc(hint)}">${esc(openConfigBadge(state))}</span>`
      : '')
    + `<button type="button" class="dsh-pm-set-close" data-action="settings-close" aria-label="关闭设置">✕</button>`
    + `</div>`
    + buildStatus(state)
    + `<div class="dsh-pm-set-body">${buildNav(state)}<div class="dsh-pm-set-main">${buildPanes(state)}</div></div>`
    + `</div>`
}

/** 渲染产物里出现的全部 `data-action`（供测试断言"没有死按钮"）。 */
export function actionsInHtml(html: string): string[] {
  const out: string[] = []
  const re = /data-action="([^"]+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) out.push(m[1])
  return [...new Set(out)]
}
