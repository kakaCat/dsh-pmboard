/**
 * 存储与数据库屏的**纯字符串渲染**（REQ-261004103330-005f t13 / 对齐趟 2）。
 *
 * 与 `render/limits.ts` 同构：入参是状态、出参是 HTML 字符串，**不碰 DOM**——因此能在 Node 环境直测。
 *
 * ## 结构对齐界面基准（人验收反馈「实现的和原型不一致」后重做）
 *
 * 原型 `prototype/board-settings.html` 的屏 2 是**分组的密集界面**：分段开关 + 键值行 +
 * 重启提示 + 「迁移与校验」Agent 区（含手动命令、五步、体检）。此前实现只照搬了字段、
 * 丢掉了分组与说明，故本次按 `notes/prototype-parity.md` §三 逐条对齐。
 *
 * 三条不许退让的纪律（对齐过程中最容易为了方便而丢掉的）：
 *   · **不写假保证**：本页面板不是"那个同意"（同意只认作答通道落的章）；
 *   · **不编进度**：五步只按可观测事实标记，观测不到写 `?`；
 *   · **不删说明**：`绝不半途换存储实现（做一半会丢写）` 这类解释是"为什么不热切换"的全部答案。
 *
 * 类名纪律（设计 R4）：全部 `dsh-pm-set-` 前缀 + 真令牌（`--pm-*` / `--dsw-*`）。
 *
 * @module dsh-pmboard/client/settings/render/storage
 */

import type { StorageSettingsView } from '../types.ts'
import {
  AGENT_SUB_TEXT, BACKEND_SEG, MIGRATION_STEPS, MIGRATION_STEPS_PLAIN, ROLLBACK_TIP_TEXT, SOURCE_CHAIN_TEXT,
  STORAGE_COPY, actionForBackend, actionTitle, alreadyActiveHint, backendName, healthLinesOf, impactLines,
  manualMigrateCommand, migrationSteps, oldLibNoticeText, refuseNoticeText, restartNoticeText, sourceLabel, whenTextOf,
  type MigrationPhase, type StorageActionKind,
} from '../storage.ts'
import { esc, groupBoxHtml, groupTitleHtml, kvHtml, monoHtml, noticeHtml, paneTitleHtml } from './parts.ts'

export interface StoragePaneInput {
  /** `GET /settings` 的 storage 块；缺省 = 还没取到数（渲染"未知"而不是编造）。 */
  readonly storage?: StorageSettingsView
  readonly phase: MigrationPhase
  /** 正在确认的动作（`phase==='confirm'` 或 `'requesting'` 时有值）。 */
  readonly action?: StorageActionKind
  readonly ticket?: { readonly ticket: string; readonly expiresAt?: number | string }
  /** 迁移窗口键（窗口已开出的事实）。 */
  readonly windowKey?: string
  readonly error?: string
  readonly busy?: boolean
  /** 待迁移条数（来自系统记录摘要；拿不到就不写数字）。 */
  readonly requirements?: number
  readonly sqliteExists?: boolean
  readonly sqliteRequirements?: number
  /** 设置文件里后端已写成 sqlite（第 5 步的硬证据）。 */
  readonly backendWritten?: boolean
  /** 分片数据根（手动迁移命令与体检里要用真实路径，拿不到就写占位）。 */
  readonly shardDataRoot?: string
  /** 「改路径」保存失败的人话（成功清空）。 */
  readonly pathError?: string
}

/**
 * 后端块：分段开关（原型 `#backendSeg`）+ 四行键值 + 重启提示 + 「迁移与校验」Agent 区。
 *
 * 分段开关的两层语义**必须分开**：`aria-checked` 表"设置里的目标"，
 * 角标「当前」表"进程里真正在跑的"——混成一个就会又回到"点完没生效以为坏了"的老问题。
 */
function buildBackendBlock(input: StoragePaneInput): string {
  const s = input.storage
  const effective = s === undefined ? undefined : s.effective
  const target = s?.backend.value

  const seg = BACKEND_SEG.map((o) => {
    const checked = target === o.backend
    const isCurrent = effective === o.backend
    const hint = alreadyActiveHint(s, o.backend)
    const busy = input.busy === true || input.phase === 'running'
    const disabled = hint !== undefined || busy ? ' disabled' : ''
    // 角标语义：进程里真正在跑的那一项标「当前」，其余显示该项自己的角标（SQLite = 实验性）
    const tag = `<span class="dsh-pm-set-tag is-${isCurrent ? 'now' : o.tone}">${esc(isCurrent ? '当前' : o.tag)}</span>`
    return `<button type="button" role="radio" aria-checked="${checked ? 'true' : 'false'}"`
      + ` class="dsh-pm-set-seg-item${checked ? ' is-on' : ''}"`
      + ` data-action="settings-storage-switch" data-backend="${esc(o.backend)}"`
      + `${disabled}${hint === undefined ? '' : ` title="${esc(hint)}"`}>`
      + `${esc(o.label)}${tag}</button>`
  }).join('')

  const rows = [
    {
      k: '当前生效',
      v: effective === undefined
        ? esc(STORAGE_COPY.noData)
        : esc(backendName(effective)) + (s?.restartRequired === true ? '<span class="dsh-pm-set-warn">（待重启生效）</span>' : ''),
    },
    {
      k: STORAGE_COPY.dataPathHeading,
      v: monoHtml(s?.sqlitePath ?? STORAGE_COPY.noData) + pathEditorHtml(s?.sqlitePath),
    },
    {
      k: STORAGE_COPY.sourceHeading,
      v: (target === undefined || s === undefined
        ? esc(STORAGE_COPY.noData)
        : `<span class="dsh-pm-set-badge is-${esc(s.backend.source)}">${esc(sourceLabel(s.backend.source))}</span>`)
        + `<span class="dsh-pm-set-muted">${esc(SOURCE_CHAIN_TEXT)}</span>`,
    },
    { k: STORAGE_COPY.whenHeading, v: esc(whenTextOf(s)) },
  ]

  const restart = s !== undefined && (s.restartRequired || (effective !== undefined && target !== undefined && effective !== target))
    ? noticeHtml('warn', esc(restartNoticeText(effective, target)))
    : ''

  return groupBoxHtml(
    `<div class="dsh-pm-set-seg" role="radiogroup" aria-label="后端">${seg}</div>`
    + kvHtml(rows) + restart + buildAgentBlock(input),
    groupTitleHtml(STORAGE_COPY.backendHeading, STORAGE_COPY.backendSub),
  )
}

/**
 * 「改路径」编辑器（原型 `#btnPathEdit` + `#backendPath`）。
 *
 * 用原生 `<details>`：展开/收起是浏览器的事，不需要新状态、也不需要新动作——
 * 而"要不要改"这件事本来就不该占一个 reducer 字段。
 */
function pathEditorHtml(current: string | undefined): string {
  return `<details class="dsh-pm-set-pathedit"><summary class="dsh-pm-btn sm">${esc(STORAGE_COPY.pathEdit)}</summary>`
    + `<div class="dsh-pm-set-pathedit-body">`
    + `<input class="dsh-pm-set-input mono" type="text" data-role="storage-path" aria-label="SQLite 库文件路径"`
    + ` value="${esc(current ?? '')}" placeholder="~/.dsh/reqboard.sqlite">`
    // 「选择…」：弹宿主操作系统的选择窗口（人明确要求"和操作系统一样"）——按钮必须在动作清单里登记
    + `<button type="button" class="dsh-pm-btn sm" data-action="settings-storage-path-pick">选择…</button>`
    + `<button type="button" class="dsh-pm-btn primary sm" data-action="settings-storage-path-save">${esc(STORAGE_COPY.pathSave)}</button>`
    + `<button type="button" class="dsh-pm-btn sm" data-action="settings-storage-path-cancel">${esc(STORAGE_COPY.pathCancel)}</button>`
    + `<span class="dsh-pm-set-hint">改的是**库文件路径**；它会写进设置文件，重启宿主后才生效（后端开关本身另有确认门）。</span>`
    + `</div></details>`
}

/**
 * 「迁移与校验」Agent 区（原型 `#agentBox`）。
 *
 * 这一段是本屏的**目的**：迁移这件事人不跑命令，由一个 Agent 窗口去做。
 * 因此"手动命令"必须同时在场——开窗能力未装配时，那是唯一的出路。
 */
function buildAgentBlock(input: StoragePaneInput): string {
  const steps = migrationSteps({
    phase: input.phase,
    ...(input.windowKey !== undefined ? { windowKey: input.windowKey } : {}),
    ...(input.sqliteExists !== undefined ? { sqliteExists: input.sqliteExists } : {}),
    ...(input.sqliteRequirements !== undefined ? { sqliteRequirements: input.sqliteRequirements } : {}),
    ...(input.backendWritten !== undefined ? { backendWritten: input.backendWritten } : {}),
  })
  const mark: Record<string, string> = { done: '✓', pending: '○', unknown: '?' }
  const items = steps.map((s) => `<li class="is-${s.status}"><span class="dsh-pm-set-step-mark">${mark[s.status]}</span>`
    + `<span class="dsh-pm-set-step-label">${esc(s.label)}</span>`
    + (s.note === undefined || s.note.length === 0 ? '' : `<span class="dsh-pm-set-step-note">${esc(s.note)}</span>`)
    + '</li>').join('')

  const cmd = manualMigrateCommand({
    ...(input.shardDataRoot !== undefined ? { shardDataRoot: input.shardDataRoot } : {}),
    ...(input.storage?.sqlitePath !== undefined ? { sqliteFile: input.storage.sqlitePath } : {}),
  })

  // 旧库检出（原型那句红字）：只有"库里确实有东西"时才说，避免对着空库喊狼来了
  const oldLib = input.sqliteExists === true && input.sqliteRequirements !== undefined && input.sqliteRequirements > 0
    ? noticeHtml('warn', esc(oldLibNoticeText(input.sqliteRequirements, input.requirements)))
    : ''

  const win = input.windowKey !== undefined
    ? `<button type="button" class="dsh-pm-btn" data-action="settings-jump-session"`
      + ` data-session="${esc(input.windowKey)}">${esc(STORAGE_COPY.openWindow)}</button>`
      + `<span class="dsh-pm-set-hint mono">${esc(input.windowKey)}</span>`
    : ''
  const running = input.busy === true || input.phase === 'running' ? ' disabled' : ''
  const retry = input.phase === 'failed'
    ? `<button type="button" class="dsh-pm-btn" data-action="settings-storage-retry">${esc(STORAGE_COPY.retry)}</button>`
    : ''
  const run = input.phase === 'done' && input.windowKey !== undefined
    ? win
    : `<button type="button" class="dsh-pm-btn primary" data-action="settings-storage-migrate"${running}>`
      + `${esc(STORAGE_COPY.migrate)}</button>` + win

  const doneNote = input.phase === 'done'
    ? noticeHtml('ok', esc(input.windowKey === undefined ? STORAGE_COPY.doneSwitch : STORAGE_COPY.doneMigrate))
    : ''
  const failedNote = input.phase === 'failed'
    ? `<p class="dsh-pm-set-hint">重来会**重新发起确认**（票据一次性，旧票已作废）。</p>`
    : ''

  const head = `<div class="dsh-pm-set-agent-head">`
    + `<span class="dsh-pm-set-agent-dot is-${esc(input.phase)}" aria-hidden="true"></span>`
    + `<b>迁移与校验</b><span class="dsh-pm-set-muted">${esc(AGENT_SUB_TEXT)}</span>`
    + `<span class="dsh-pm-set-spacer"></span>`
    + `<details class="dsh-pm-set-manual"><summary class="dsh-pm-btn sm">${esc(STORAGE_COPY.manualCmd)}</summary>`
    + `<pre class="dsh-pm-set-cmd">${esc(cmd)}</pre>`
    + `<p class="dsh-pm-set-hint">开窗能力未装配时，人可以在终端跑这条命令：它备份 → 建库 → 迁移 → 校验，`
    + `**校验通过后**才把设置写成 sqlite（校验不过就不写，源数据不动）。</p>`
    + `</details></div>`

  return `<div class="dsh-pm-set-agent">${head}`
    + `<div class="dsh-pm-set-agent-hint">这件事<b>不用你做</b>：点下面的按钮会<b>开一个 Agent 窗口</b>，由它执行 `
    + esc(MIGRATION_STEPS_PLAIN) + `，完成后回报结论。你只需要看结果、重启宿主。</div>`
    + oldLib
    + `<ol class="dsh-pm-set-steps">${items}</ol>`
    + `<p class="dsh-pm-set-hint">以上只按可观测事实标记：观测不到的标 ?，以迁移窗口的实际输出为准。</p>`
    + `<div class="dsh-pm-set-agent-actions">${run}${retry}</div>`
    + doneNote + failedNote
    + `</div>`
}

/** 确认面板（含影响清单）——`requesting` / `confirm` 两态共用，按钮不同。**它不是"那个同意"**。 */
function buildConfirmBlock(input: StoragePaneInput): string {
  const action = input.action
  if (action === undefined) return ''
  const impacts = impactLines(action, {
    ...(input.requirements !== undefined ? { requirements: input.requirements } : {}),
    ...(input.storage?.sqlitePath !== undefined ? { sqlitePath: input.storage.sqlitePath } : {}),
  })
  const list = impacts.map((t) => `<li>${esc(t)}</li>`).join('')
  if (input.phase === 'requesting') {
    return `<div class="dsh-pm-set-confirm" role="group" aria-label="确认中">`
      + `<p class="dsh-pm-set-h4">${esc(actionTitle(action))}</p>`
      + `<ul class="dsh-pm-set-impacts">${list}</ul>`
      + `<p class="dsh-pm-set-hint">正在发起确认…</p></div>`
  }
  if (input.phase !== 'confirm') return ''
  return `<div class="dsh-pm-set-confirm" role="group" aria-label="待确认">`
    + `<p class="dsh-pm-set-h4">${esc(STORAGE_COPY.confirmHeading)}：${esc(actionTitle(action))}</p>`
    + `<ul class="dsh-pm-set-impacts">${list}</ul>`
    + `<p class="dsh-pm-set-hint dsh-pm-set-hint-strong">${esc(STORAGE_COPY.consentNote)}</p>`
    + `<p class="dsh-pm-set-hint">${esc(STORAGE_COPY.awaitingConsent)}</p>`
    + `<div class="dsh-pm-set-actions">`
    + `<button type="button" class="dsh-pm-btn primary" data-action="settings-storage-confirm">${esc(STORAGE_COPY.confirmContinue)}</button>`
    + `<button type="button" class="dsh-pm-btn" data-action="settings-storage-cancel">${esc(STORAGE_COPY.cancel)}</button>`
    + `</div>`
    + `<p class="dsh-pm-set-hint">${esc(STORAGE_COPY.ticketOnce)}</p></div>`
}

/** 载体体检（原型 `.health`）+ 回滚说明 + 队列说明：都是"让人放心动手"的话。 */
function buildFooterBlock(input: StoragePaneInput): string {
  const health = healthLinesOf({
    ...(input.requirements !== undefined ? { shardCount: input.requirements } : {}),
    ...(input.sqliteExists !== undefined ? { sqliteExists: input.sqliteExists } : {}),
    ...(input.sqliteRequirements !== undefined ? { sqliteCount: input.sqliteRequirements } : {}),
    stale: input.sqliteExists === true && input.requirements !== undefined
      && input.sqliteRequirements !== undefined && input.requirements > input.sqliteRequirements,
  })
  const healthHtml = `<div class="dsh-pm-set-health">${health.map((h) => `<div>${esc(h)}</div>`).join('')}</div>`
  // 拒绝服务说明：只在"设置里已选 SQLite"时出现——其它时候说这句是噪音
  const refuse = input.storage?.backend.value === 'sqlite'
    ? noticeHtml('warn', '<b>迁移没做完就重启宿主 → 拒绝服务。</b>' + esc(refuseNoticeText(input.requirements)))
    : ''
  const queue = noticeHtml('info', '本次<b>不切任务队列</b>（<span class="mono">docs/requirements/&lt;REQ&gt;/queue.json</span> '
    + '仍在项目目录下）——队列是跨窗口可见的协作产物，单独一卡再说。')
  return healthHtml + refuse + noticeHtml('info', esc(ROLLBACK_TIP_TEXT)) + queue
}

/**
 * 本屏内容（`shell.ts` 在 `pane==='storage'` 时用它替换占位）。
 *
 * 顺序刻意是"后端 → 确认面板 → 体检与说明 → 错误"：先看清现状与目标，再看要做什么，
 * 最后才是错误——和人做决定的心理顺序一致。
 */
export function buildStoragePane(input: StoragePaneInput): string {
  const err = input.error !== undefined
    ? noticeHtml('danger', esc(input.error))
    : ''
  // 「改路径」的结果：失败要说清原因（成功则重取后自然消失，不留提示）
  const pathErr = input.pathError !== undefined
    ? noticeHtml('danger', esc(input.pathError))
    : ''
  return paneTitleHtml(STORAGE_COPY.paneTitle, STORAGE_COPY.paneSub)
    + err + pathErr
    + buildBackendBlock(input)
    + buildConfirmBlock(input)
    + buildFooterBlock(input)
}

/** 供测试断言：五步标签必须与逻辑层同源（避免渲染层自己抄一份）。 */
export function stepLabels(): string[] {
  return MIGRATION_STEPS.map((s) => s.label)
}

/** 供测试断言：某后端对应的动作键（防止渲染与逻辑对不上）。 */
export function actionOf(backend: 'json' | 'sqlite'): StorageActionKind {
  return actionForBackend(backend)
}
