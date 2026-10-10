/**
 * 设置弹窗的**看板侧单例与宿主适配**（REQ-261004103330-005f t11）。
 *
 * 为什么单独一个文件：`board-mount.ts` 已 900+ 行且在尺寸白名单里（设计明确要求本需求**不撑大它**）。
 * 这里承担三件只与"看板怎么用弹窗"有关的事，从而让 board-mount 侧只剩三行调用：
 *   1. **单例**：弹窗挂 `document.body`、不在容器内，故跨重绘存活；单例还保住"重开后仍是上次那一屏"；
 *   2. **宿主能力注入**（设计 R2/R3）：跳会话与打开文档由看板注入——弹窗模块**不得**反向 import
 *      `board-mount.ts`（那会形成 `board-mount → controller → board-mount` 环）；
 *   3. **焦点回退**：关闭时把焦点还给页头的「⚙ 设置」按钮，而不是还给弹窗里的某个控件。
 *
 * @module dsh-pmboard/client/settings/singleton
 */

import { createSettingsController, type SettingsController } from './controller.ts'
import {
  fetchRunSettings,
  openConfigFile,
  fetchSystemRecord,
  patchRunSettings,
  pickStoragePath,
  requestStorageAction,
  startLedgerMigration,
  switchStorageBackend,
} from '../api.ts'
import type { SettingsPane } from './types.ts'

/** 看板侧注入的能力（都是"看板才知道怎么做"的事）。 */
export interface BoardSettingsDeps {
  /** 跳到某个会话窗口（看板注入 `jumpToSession(windowServiceAccess(), key)`）。 */
  readonly jumpToWindow: (windowKey: string) => void
  /** 在工作区侧栏打开文档（看板注入 `openDocInSidebar`）。 */
  readonly openDoc: (path: string) => void
  /** 取「⚙ 设置」按钮（焦点回退用；容器重绘后仍能现取到）。 */
  readonly settingsButton: () => HTMLElement | undefined
}

let singleton: SettingsController | undefined
let deps: BoardSettingsDeps | undefined

/** 登记看板能力（`attachBoard` 时调；重复调用覆盖，幂等）。 */
export function configureBoardSettings(next: BoardSettingsDeps): void {
  deps = next
}

/**
 * 设置弹窗要用到的**全部**看板接口（REQ-261004103330-005f）。
 *
 * ## 为什么单独抽出来（血的教训，2026-10-04）
 *
 * 这里原来只注入了 `fetchRunSettings` 一个函数，于是**生产环境里**：
 * 保存上限报「保存通道未装配」、存储屏的确认门与迁移全报「未装配」、系统记录屏报
 * 「系统记录通道未装配（fetchSystemRecord 缺失）」——人正是照这条报过来的。
 *
 * 为什么测试没发现：单测一律注入**假 api**，"真装配给了什么"从来没人测。
 * 所以现在把它导成具名常量，并由 `tests/settings-wiring.test.ts` 断言**六个一个不少**——
 * 让「装配漏了」变成会红的东西，而不是等人在界面上看见。
 */
export function boardSettingsApi(): {
  fetchRunSettings: typeof fetchRunSettings
  patchRunSettings: typeof patchRunSettings
  requestStorageAction: typeof requestStorageAction
  switchStorageBackend: typeof switchStorageBackend
  startLedgerMigration: typeof startLedgerMigration
  fetchSystemRecord: typeof fetchSystemRecord
  pickStoragePath: typeof pickStoragePath
} {
  return {
    fetchRunSettings,
    patchRunSettings,
    requestStorageAction,
    switchStorageBackend,
    startLedgerMigration,
    fetchSystemRecord,
    pickStoragePath,
  }
}

function controller(): SettingsController {
  if (singleton === undefined) {
    singleton = createSettingsController({
      api: boardSettingsApi(),
      jumpToWindow: (windowKey) => deps?.jumpToWindow(windowKey),
      // 先试官方右侧栏；**打不开就回落宿主**（用系统默认程序打开）。
      // 为什么必须回落：右侧栏只吃工作区内文档，而配置在 ~/.dsh/ 下——
      // 2026-10-04 人实测"打开配置文件"只得到一句"打不开"。
      openDoc: (path) => {
        const viaSidebar = (deps as { openDoc?: (p: string) => boolean | void } | undefined)?.openDoc?.(path)
        if (viaSidebar === true) return true
        void openConfigFile(path).then((r) => {
          // 失败不再对用户说假话：写诊断；用户仍可在「系统记录」屏看原文
          if (r.ok !== true) console.error('[dsh-pmboard] 宿主打开文件失败：', r.reason ?? '未知原因')
        })
        return true
      },
      focusReturn: () => deps?.settingsButton()?.focus(),
    })
  }
  return singleton
}

/** 打开设置弹窗（首次调用即创建；已开则只切屏，**不重置**状态——设计 §入口与挂载）。 */
export function openBoardSettings(pane?: SettingsPane): void {
  controller().open(pane)
}

/** 释放（容器卸载时调；幂等）。 */
export function disposeBoardSettings(): void {
  singleton?.dispose()
  singleton = undefined
}

/** 当前是否已开（测试与后续卡用）。 */
export function boardSettingsOpen(): boolean {
  return singleton?.isOpen() === true
}
