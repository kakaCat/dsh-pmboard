/**
 * 运行上限屏的**纯字符串渲染**（REQ-261004103330-005f t12 / 设计 `frontend.md` 屏 1）。
 *
 * 与 `render/shell.ts` 同构：入参是状态、出参是 HTML 字符串，**不碰 DOM**——因此能在 Node 环境直测。
 *
 * 观感以界面基准 `docs/requirements/REQ-261004103330-005f/prototype/board-settings.html` 的屏 1 为准：
 * 标题与副标题**同一行**、表格与保存条**同框**（分组盒子）、行标签是**色点 + 主名 + 副标题**、
 * 底部是一条**带底色的说明框**（范围 / 生效时机 / 保存去向与来源顺序）。
 * 基元来自 `render/parts.ts`（与存储屏、记录屏共用一套，避免各屏各写一份而分叉）。
 *
 * 类名纪律（设计 R4）：全部 `dsh-pm-set-` 前缀 + 真令牌（`--pm-*` / `--dsw-*`）；
 * 原型里的 `--s-*` 私有变量与无前缀类名**一律不得**出现在这里。
 *
 * @module dsh-pmboard/client/settings/render/limits
 */

import {
  COPY, SETTINGS_STAGES, dirtyStages, displaySettingsPath, dotClassOf, effectiveOf,
  invalidStages, isAutomatedStage, limitInvalidReason, sourceBadge, stageDesc, stageLabel,
} from '../limits.ts'
import { paneLabel } from '../model.ts'
import type { StageKey, StageLimitView } from '../types.ts'
import { esc, groupHtml, labeledCellHtml, monoHtml, noticeHtml, paneTitleHtml } from './parts.ts'

export interface LimitsPaneInput {
  readonly limits: Readonly<Partial<Record<StageKey, StageLimitView>>>
  readonly drafts: Readonly<Partial<Record<StageKey, string>>>
  readonly saving: boolean
  readonly error?: string
  /** 设置文件真实路径（系统记录给）；未知时说明框退回默认展示值。 */
  readonly settingsFilePath?: string
}

/** 输入框的 `data-role`（事件委派据此认出"这是本屏的输入"）。 */
export const LIMIT_INPUT_ROLE = 'settings-limit-input'

/** 单行的输入框显示值：有草稿用草稿，否则用生效值。 */
function inputValue(stage: StageKey, input: LimitsPaneInput): string {
  const draft = input.drafts[stage]
  if (draft !== undefined) return draft
  return String(effectiveOf(input.limits, stage).value)
}

function buildRow(stage: StageKey, input: LimitsPaneInput): string {
  const item = effectiveOf(input.limits, stage)
  const draft = input.drafts[stage]
  const invalid = draft !== undefined ? limitInvalidReason(draft) : undefined
  const isDirty = draft !== undefined && invalid === undefined && Number(draft.trim()) !== item.value
  const automated = isAutomatedStage(stage)

  const trCls = [
    'dsh-pm-set-limit-row',
    automated ? '' : 'is-manual',
    invalid !== undefined ? 'is-invalid' : (isDirty ? 'is-dirty' : ''),
  ].filter((c) => c.length > 0).join(' ')

  // 徽章：有草稿且真变了 → 「待保存」；否则显示真实来源
  const badge = draft !== undefined
    ? (isDirty || invalid !== undefined
      ? { cls: 'is-pending', label: '待保存' }
      : sourceBadge(item.source))
    : sourceBadge(item.source)

  const errLine = invalid !== undefined
    ? `<span class="dsh-pm-set-limit-err" role="alert">${esc(invalid)}</span>`
    : ''

  const resetDisabled = item.source === 'default' && draft === undefined ? ' disabled' : ''
  // 副标题 = 阶段说明 + （非自动阶段）「不自动跑」；分隔符由基元统一加
  const subs = automated ? [stageDesc(stage)] : [stageDesc(stage), COPY.manualTag]

  return `<tr class="${trCls}" data-stage="${stage}">`
    + `<td>${labeledCellHtml(dotClassOf(stage), stageLabel(stage), subs)}</td>`
    + `<td class="dsh-pm-set-limit-default">${String(item.default)}</td>`
    + `<td class="dsh-pm-set-limit-input-cell">`
    + `<input class="dsh-pm-set-limit-input${invalid !== undefined ? ' is-invalid' : ''}"`
    + ` type="text" inputmode="numeric" autocomplete="off" data-role="${LIMIT_INPUT_ROLE}"`
    + ` data-stage="${stage}" aria-label="${esc(stageLabel(stage))}的执行次数上限"`
    + `${invalid !== undefined ? ' aria-invalid="true"' : ''} value="${esc(inputValue(stage, input))}">`
    + `${errLine}</td>`
    + `<td><span class="dsh-pm-set-badge ${badge.cls}">${esc(badge.label)}</span></td>`
    + `<td><button type="button" class="dsh-pm-btn sm" data-action="settings-limit-reset"`
    + ` data-stage="${stage}"${resetDisabled}>${esc(COPY.reset)}</button></td>`
    + `</tr>`
}

/** 底部保存条：无改动则整条不渲染（而不是渲染一条禁用态）。 */
function buildSaveBar(input: LimitsPaneInput): string {
  const dirty = dirtyStages(input.limits, input.drafts).length
  const invalid = invalidStages(input.drafts).length
  if (dirty === 0 && invalid === 0) return ''
  const count = invalid > 0 ? invalid : dirty
  const suffix = invalid > 0 ? COPY.invalidSuffix : COPY.dirtySuffix
  const disabled = invalid > 0 || input.saving ? ' disabled' : ''
  // 数字加粗（界面基准原文是「有 <b>N</b> 项改动未保存」）
  return `<div class="dsh-pm-set-savebar" role="group" aria-label="未保存的改动">`
    + `<span class="dsh-pm-set-savebar-text">${esc(COPY.dirtyPrefix)} <b>${String(count)}</b> ${esc(suffix)}</span>`
    + `<span class="dsh-pm-set-spacer"></span>`
    + `<button type="button" class="dsh-pm-btn" data-action="settings-limit-discard">${esc(COPY.discard)}</button>`
    + `<button type="button" class="dsh-pm-btn primary" data-action="settings-limit-save"${disabled}>`
    + `${esc(input.saving ? COPY.saving : COPY.save)}</button>`
    + `</div>`
}

/**
 * 说明框（界面基准的 `.notice.info`）。
 *
 * 两句**必须逐字出现**的文案在此汇合：界面基准的「取值 1–10000 的整数」与「改动对下一个回合生效」，
 * 以及设计裁定的「改小不会掐断正在跑的那一次，从下一次判定起不再续跑」。两者说的是同一件事的
 * 粗/细两面，故同框呈现，而不是二选一。
 */
function buildNotice(input: LimitsPaneInput): string {
  const path = monoHtml(displaySettingsPath(input.settingsFilePath))
  return noticeHtml('info',
    `<div><b>${esc(COPY.range)}。</b>${esc(COPY.applyTiming)}。${esc(COPY.shrink)}`
    + `${esc(COPY.noAutomation)}保存写入 ${path}（${esc(COPY.sourceOrder)}）。</div>`)
}

/**
 * 本屏内容（`shell.ts` 在 `pane==='limits'` 时用它替换占位）。
 *
 * 顺序与界面基准一致：标题 → （错误提示）→ 分组盒子（表 + 保存条）→ 说明框。
 */
export function buildLimitsPane(input: LimitsPaneInput): string {
  const rows = SETTINGS_STAGES.map((s) => buildRow(s, input)).join('')
  const err = input.error !== undefined
    ? noticeHtml('danger', esc(input.error))
    : ''
  const table = `<table class="dsh-pm-set-table"><thead><tr>`
    + `<th scope="col">节点（需求阶段）</th><th scope="col">内置默认</th><th scope="col">上限</th>`
    + `<th scope="col">当前来源</th><th scope="col"></th>`
    + `</tr></thead><tbody>${rows}</tbody></table>`
  return paneTitleHtml(paneLabel('limits'), COPY.paneSub)
    + err
    + groupHtml(table + buildSaveBar(input))
    + buildNotice(input)
}
