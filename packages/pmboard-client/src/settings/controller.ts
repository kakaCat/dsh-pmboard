/**
 * 设置弹窗**控制器**（REQ-261004103330-005f t11 / 设计 `frontend.md` §入口与挂载）。
 *
 * 本文件是 `settings/` 里**唯一有副作用**的地方：创建宿主、写 DOM、绑事件、取数、dispose。
 * 其余部分（`model.ts` / `render/*`）都是纯函数——这样"行为"能在 Node 环境直测，
 * 只有薄薄一层 DOM 接线不可测（设计明确把宿主集成排除在单测范围外）。
 *
 * ## 为什么挂 `document.body`（设计 R1，硬约束）
 *
 * `board-mount` 的 `render()` 直接写 `viewEl.innerHTML`，而 `viewEl === container`——
 * 任何挂在容器内的弹层都会被**每次 SSE 刷新/轮询重绘抹掉**。故宿主挂 body，
 * 并在创建前清同名残留（与 `injectStyles` 同款"先清残留"纪律，防 HMR 后双开）。
 *
 * ## 委派自己建（设计 R2）
 *
 * 弹窗在容器外，接不到 `board-mount` 的 click 委派，所以控制器自建一处委派；
 * 需要跳会话时用**注入**的 `jumpToWindow`，绝不 import `board-mount`（会成环）。
 *
 * @module dsh-pmboard/client/settings/controller
 */

import {
  initialShellState,
  openConfigIntent,
  reduceShell,
  type SettingsShellState,
} from './model.ts'
import type { SettingsPane } from './types.ts'
import { buildSettingsShell } from './render/shell.ts'
import { attachStoragePathEditor } from './storage-path.ts'
import type { RunSettingsView, StageKey } from './types.ts'
import { dirtyPatch, invalidStages } from './limits.ts'
import { LIMIT_INPUT_ROLE } from './render/limits.ts'
import {
  actionForBackend, migrationFactsOf, shouldClearTicketOnError, storageErrorCopy, ticketExpired,
  type StorageActionKind,
} from './storage.ts'
import type { StorageBackend } from './types.ts'
import { makeSystemRecordLoader } from './records.ts'

/** 宿主标记（幂等清理与测试查询共用一处）。 */
export const SETTINGS_HOST_ATTR = 'data-dsh-pm-settings'

/** 注入的取数能力（生产 = `api.ts` 的 5 个函数；测试 = 替身）。 */
// 类型在本文件内也要用（再导出不创建本地绑定），故既 import 又再导出——既有 import 路径不受影响。
import type { SettingsControllerApi, SettingsHost } from './controller-api.ts'
export type { SettingsControllerApi, SettingsHost } from './controller-api.ts'

/** 控制器的对外形状：`open` / `close` / `isOpen` / `state` / `dispose`（宿主与测试用同一组入口）。 */

export interface SettingsControllerDeps {
  readonly api: SettingsControllerApi
  /** 宿主工厂；缺省 = 挂 `document.body`（见 `createBodyHost`）。 */
  readonly host?: (onClose: () => void) => SettingsHost
  /** 跳转到某个会话窗口（设计 R2/R3：经注入，不 import board-mount）。 */
  readonly jumpToWindow?: (windowKey: string) => void
  /** 打开工作区文档（「打开配置文件」用；缺省 = 什么都不做）。 */
  /** 打开文档的宿主通道；**返回 false 表示没打开**（据此给人提示，不静默）。 */
  readonly openDoc?: (path: string) => boolean | void
  /** 关闭时把焦点还给谁（触发按钮）。 */
  readonly focusReturn?: () => void
  /** 记住最后打开的屏（注入存储；缺省 = 不记，测试因此零副作用）。 */
  readonly rememberPane?: (pane: SettingsPane) => void
}

/** 控制器句柄（`board-mount` 只持有它，不关心内部）。 */
export interface SettingsController {
  /** 打开（已开则只切屏；不重开、不重置状态）。 */
  open(pane?: SettingsPane): void
  close(): void
  isOpen(): boolean
  /** 当前壳状态（只读快照，测试与后续卡用）。 */
  state(): SettingsShellState
  /** 重新取数（后续卡在保存成功后调用）。 */
  reload(): Promise<void>
  /** 释放：移除宿主、解绑监听（幂等）。 */
  dispose(): void
}

/**
 * 生产宿主：`div[data-dsh-pm-settings]` 挂到 `document.body`。
 *
 * 幂等：创建前先移除同名残留（HMR / 卸载残留会导致双开）。
 * 委派建在宿主上（弹窗在容器外，接不到 board-mount 的委派——设计 R2）。
 */
export function createBodyHost(actions: {
  onClose: () => void
  onPane: (pane: string) => void
  onOpenConfig: () => void
  onJump: (windowKey: string) => void
  onLimitInput: (stage: string, raw: string) => void
  onLimitReset: (stage: string) => void
  onLimitSave: () => void
  onLimitDiscard: () => void
  // t13：存储屏五动作
  onStorageSwitch: (backend: string) => void
  onStorageMigrate: () => void
  onStorageConfirm: () => void
  onStorageCancel: () => void
  onStorageRetry: () => void
}): SettingsHost {
  document.querySelectorAll('[' + SETTINGS_HOST_ATTR + ']').forEach((el) => el.remove())
  const host = document.createElement('div')
  host.setAttribute(SETTINGS_HOST_ATTR, '')
  host.className = 'dsh-pm-set-host'
  host.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null
    const el = target?.closest?.('[data-action]') as HTMLElement | null
    if (el === null || el === undefined) return
    const action = el.getAttribute('data-action')
    if (action === 'settings-close') actions.onClose()
    else if (action === 'settings-pane') actions.onPane(el.getAttribute('data-pane') ?? 'limits')
    else if (action === 'settings-open-config') actions.onOpenConfig()
    else if (action === 'settings-jump-session') actions.onJump(el.getAttribute('data-session') ?? '')
    else if (action === 'settings-limit-reset') actions.onLimitReset(el.getAttribute('data-stage') ?? '')
    else if (action === 'settings-limit-save') actions.onLimitSave()
    else if (action === 'settings-limit-discard') actions.onLimitDiscard()
    else if (action === 'settings-storage-switch') actions.onStorageSwitch(el.getAttribute('data-backend') ?? 'sqlite')
    else if (action === 'settings-storage-migrate') actions.onStorageMigrate()
    else if (action === 'settings-storage-confirm') actions.onStorageConfirm()
    else if (action === 'settings-storage-cancel') actions.onStorageCancel()
    else if (action === 'settings-storage-retry') actions.onStorageRetry()
  })
  // 输入用 `input` 事件（点击委派管不到输入框内容）；同样只认本屏的 `data-role`
  host.addEventListener('input', (e) => {
    const target = e.target as HTMLElement | null
    if (target?.getAttribute?.('data-role') !== LIMIT_INPUT_ROLE) return
    actions.onLimitInput(target.getAttribute('data-stage') ?? '', (target as HTMLInputElement).value)
  })
  document.body.appendChild(host)
  return {
    el: host,
    render(html: string): void { host.innerHTML = html },
    destroy(): void { host.remove() },
  }
}

/**
 * 建控制器（**本卡只做壳**：取数 → 记住"设置文件在不在"→ 渲染；四屏内容归后续卡）。
 *
 * 关闭语义三条等价路径（设计）：✕ / 点遮罩 / ESC——三者在 reducer 里是同一个 `close` 事件，
 * 差别只在"谁触发"（DOM 接线层）。
 */
export function createSettingsController(deps: SettingsControllerDeps): SettingsController {
  let state = initialShellState()
  let host: SettingsHost | undefined

  const onClose = (): void => {
    if (!state.open) return
    state = reduceShell(state, { kind: 'close' }); paint()
    deps.focusReturn?.()
  }

  const hostOf = (): SettingsHost => {
    if (host !== undefined) return host
    host = deps.host !== undefined
      ? deps.host(onClose)
      : createBodyHost({
        onClose,
        onPane: (pane) => setPane(pane as SettingsPane),
        onOpenConfig: () => {
          const intent = openConfigIntent(state)
          if (intent.kind === 'explain') {
            // 文件还没创建（惰性）：把人带到有成句解释的那一屏，**不留死点击**
            setPane(intent.pane)
            return
          }
          const opened = deps.openDoc?.(intent.path)
          // 打开通道失败也必须说话：能返回 false 就据此提示；返回 undefined 视为未装配
          if (opened !== true) {
            state = reduceShell(state, {
              kind: 'notice',
              message: opened === false
                ? '打不开 ' + intent.path + '：打开通道不可用（具体原因见控制台）。可到「系统记录」屏展开「原始 JSON」直接看内容。'
                : '打不开 ' + intent.path + '：宿主未提供打开通道。可到「系统记录」屏展开「原始 JSON」直接看内容。',
            })
            paint()
          }
        },
        onJump: (windowKey) => {
          if (windowKey.length > 0) deps.jumpToWindow?.(windowKey)
        },
        onLimitInput: (stage, raw) => setDraft(stage as StageKey, raw),
        onLimitReset: (stage) => {
          state = reduceShell(state, { kind: 'reset-draft', stage: stage as StageKey }); paint()
        },
        onLimitSave: () => void saveLimits(),
        onLimitDiscard: () => {
          state = reduceShell(state, { kind: 'clear-drafts' }); paint()
        },
        // t13：存储屏（backend 字符串来自渲染层的 data-backend，非法值按 sqlite 处理但会被服务端再拦一道）
        onStorageSwitch: (backend) => void storageBegin(actionForBackend(backend === 'json' ? 'json' : 'sqlite')),
        onStorageMigrate: () => void storageBegin('migrate'),
        onStorageConfirm: () => void storageExecute(),
        onStorageCancel: storageCancel,
        onStorageRetry: () => void storageBegin(state.storageAction ?? 'migrate'),
      })
    // 「改路径」：整条链路在 storage-path.ts（本文件只剩接线；它自带监听，故这里只一行）
    if (host.el !== undefined) attachStoragePathEditor(host.el, { api: deps.api, onResult: (ok, message) => { state = reduceShell(state, { kind: 'storage-path-result', ...(message !== undefined ? { message } : {}) }); if (ok) void reload(); paint() } })
    return host
  }

  const paint = (): void => {
    if (!state.open) {
      host?.destroy()
      host = undefined
      return
    }
    hostOf().render(buildSettingsShell(state))
  }

  // t14：系统记录取数（逻辑在 records.ts，控制器只提供 dispatch 与 paint 这两个闭包能力）
  const loadRecord = makeSystemRecordLoader({
    api: deps.api,
    dispatch: (ev) => { state = reduceShell(state, ev); paint() },
  })

  const setPane = (pane: SettingsPane): void => {
    state = reduceShell(state, { kind: 'set-pane', pane })
    deps.rememberPane?.(pane)
    if (pane === 'records' && state.systemRecord === undefined) void loadRecord()
    paint()
  }

  const applyLoaded = (view: RunSettingsView): void => {
    state = reduceShell(state, {
      kind: 'load-ok',
      settingsFileExists: view.settingsFile?.exists === true,
      ...(view.settingsFile?.path !== undefined ? { settingsFilePath: view.settingsFile.path } : {}),
      ...(view.plugin?.version !== undefined ? { pluginVersion: view.plugin.version } : {}),
      limits: view.stageMaxRounds ?? {},
      // 服务端值即权威：重取后清空草稿，否则旧草稿会立刻又变"脏"（看起来像没保存成功）
      clearDrafts: true,
      // t13：后端概览（effective / restartRequired 都在里面——"待重启生效"就靠它说清）
      ...(view.storage !== undefined ? { storage: view.storage } : {}),
      // t13：迁移清单的可观测事实（源侧条数 / 库存在与否与条数）；档案损坏时它返回 {}（不编数字）
      ...migrationFactsOf(view.system),
      // 摘要里的分片数据根：通用屏「台账数据根」与手动迁移命令要用（弹窗一打开就该有）
      // 摘要里的路径：分片数据根（通用屏/手动命令）+ 系统记录文件（页头按钮要打开它，见 model.openConfigIntent）
      ...(view.system?.paths === undefined ? {} : { shardDataRoot: view.system.paths.shardDataRoot, systemFilePath: view.system.paths.systemFile }),
    })
  }

  const setDraft = (stage: StageKey, raw: string): void => {
    state = reduceShell(state, { kind: 'set-draft', stage, raw }); paint()
  }

  /**
   * 保存运行上限（t12）。
   *
   * 三条纪律：① 有非法项**不发请求**（前端先拦，服务端仍会再拦一道）；
   * ② 服务端原话优先（`ApiError.message`）；③ 成功后**重取**而不是本地改数字——
   * 来源徽章要反映服务端真实生效值（"设置文件 / 插件配置 / 内置默认"），本地猜不出来。
   */
  const saveLimits = async (): Promise<void> => {
    if (state.saving) return
    const invalid = invalidStages(state.drafts)
    if (invalid.length > 0) {
      state = reduceShell(state, {
        kind: 'save-fail',
        message: '保存未执行：有 ' + String(invalid.length) + ' 项不合法，先改成 ' + invalid[0].reason,
      })
      paint()
      return
    }
    const patch = dirtyPatch(state.limits ?? {}, state.drafts)
    if (Object.keys(patch).length === 0) return
    if (deps.api.patchRunSettings === undefined) {
      state = reduceShell(state, { kind: 'save-fail', message: '保存未执行：保存通道未装配（patchRunSettings 缺失）' })
      paint()
      return
    }
    state = reduceShell(state, { kind: 'save-start' }); paint()
    try {
      await deps.api.patchRunSettings({ stageMaxRounds: patch })
      state = reduceShell(state, { kind: 'save-ok' })
      await reload()
    } catch (err) {
      const message = (err as { message?: string } | undefined)?.message ?? String(err)
      state = reduceShell(state, { kind: 'save-fail', message: '保存失败：' + message })
      paint()
    }
  }

  /**
   * 取数（局部函数而非对象方法：避免依赖 `this`——控制器被解构传递时方法里的 `this` 会丢）。
   */
  const reload = async (): Promise<void> => {
    state = reduceShell(state, { kind: 'load-start' }); paint()
    try {
      const view = await deps.api.fetchRunSettings()
      applyLoaded(view)
    } catch (err) {
      // 人话优先：`ApiError.message` 是服务端原话（REQ-261003191948-e94a 的口径）
      const message = (err as { message?: string } | undefined)?.message ?? String(err)
      state = reduceShell(state, { kind: 'load-fail', message: '读取运行设置失败：' + message })
    }
    paint()
  }

  /** 错误对象里的传输码/人话（`ApiError` 带 `code`；其余错误只有 message）。 */
  const codeOf = (err: unknown): string | undefined => (err as { code?: string } | undefined)?.code
  const messageOf = (err: unknown): string => (err as { message?: string } | undefined)?.message ?? String(err)

  const failStorage = (action: StorageActionKind | undefined, code: string | undefined, message: string): void => {
    // 任何失败都清票：票据一次性，重试必须重新走确认（卡里的硬要求，**不自动重试**）
    if (shouldClearTicketOnError(code)) state = reduceShell(state, { kind: 'storage-clear' })
    state = reduceShell(state, {
      kind: 'storage-phase', phase: 'failed',
      ...(action !== undefined ? { action } : {}),
      error: storageErrorCopy(code, message),
    })
    paint()
  }

  /**
   * 发起确认（取票）。
   *
   * 顺序按设计：**先取票，再让人在真确认框里作答**。注意本页不是那个同意本身——
   * 服务端在取票时就把确认框推给人，并只在人作答后落章（见 `storage.ts` 头注）。
   */
  const storageBegin = async (action: StorageActionKind): Promise<void> => {
    if (state.storagePhase === 'running' || state.storagePhase === 'requesting') return
    if (deps.api.requestStorageAction === undefined) {
      failStorage(action, undefined, '确认通道未装配（requestStorageAction 缺失）：本页没有发起任何请求')
      return
    }
    // 重来之前先清掉可能残留的旧票（一次性票据：绝不复用）
    if (state.storageTicket !== undefined) state = reduceShell(state, { kind: 'storage-clear' })
    state = reduceShell(state, { kind: 'storage-phase', phase: 'requesting', action })
    paint()
    try {
      const ticket = await deps.api.requestStorageAction(action)
      state = reduceShell(state, { kind: 'storage-ticket', ticket })
      state = reduceShell(state, { kind: 'storage-phase', phase: 'confirm', action })
    } catch (err) {
      failStorage(action, codeOf(err), messageOf(err))
      return
    }
    paint()
  }

  /** 带票执行（人已在真确认框作答）。过期/缺失一律拒绝并清票，不静默重试。 */
  const storageExecute = async (): Promise<void> => {
    const action = state.storageAction
    const ticket = state.storageTicket
    if (action === undefined || ticket === undefined) {
      failStorage(action, undefined, '没有可用的确认票据：请重新发起确认')
      return
    }
    if (ticketExpired(ticket, Date.now())) {
      failStorage(action, 'confirmation_required', '确认票据已过期')
      return
    }
    state = reduceShell(state, { kind: 'storage-phase', phase: 'running', action })
    paint()
    try {
      if (action === 'migrate') {
        if (deps.api.startLedgerMigration === undefined) throw new Error('迁移通道未装配（startLedgerMigration 缺失）')
        const out = await deps.api.startLedgerMigration(ticket.ticket)
        state = reduceShell(state, { kind: 'storage-window', windowKey: out.windowKey })
      } else {
        if (deps.api.switchStorageBackend === undefined) throw new Error('切换通道未装配（switchStorageBackend 缺失）')
        const backend: StorageBackend = action === 'switch-to-sqlite' ? 'sqlite' : 'json'
        await deps.api.switchStorageBackend({ backend, ticket: ticket.ticket })
      }
      state = reduceShell(state, { kind: 'storage-phase', phase: 'done', action })
      paint()
      // 成功后重取：让"目标后端 / 待重启"这些服务端事实刷新，而不是本地猜
      await reload()
    } catch (err) {
      failStorage(action, codeOf(err), messageOf(err))
    }
  }

  /** 取消：**不发任何请求**（票留在服务端过期即可；本地立即清掉，绝不复用）。 */
  const storageCancel = (): void => {
    state = reduceShell(state, { kind: 'storage-clear' })
    paint()
  }

  return {
    open(pane?: SettingsPane): void {
      const wasOpen = state.open
      state = reduceShell(state, { kind: 'open', ...(pane !== undefined ? { pane } : {}) })
      paint()
      if (state.pane === 'records' && state.systemRecord === undefined) void loadRecord()
      if (!wasOpen) void reload()
    },
    close: onClose,
    isOpen: (): boolean => state.open,
    state: (): SettingsShellState => state,
    reload,
    dispose(): void {
      host?.destroy()
      host = undefined
    },
  }
}
