/**
 * 控制器的注入契约与宿主抽象（REQ-261004103330-005f）。
 *
 * ## 为什么单独一个文件
 *
 * `controller.ts` 顶到了 400 行门禁——**尺寸是硬门禁**，不是风格偏好。两个纯类型块（注入能力 + 宿主抽象）
 * 与编排无关，搬出来既让契约好找，也让控制器回到能继续做事的体量。类型仍从 `controller.ts` 再导出，
 * 既有 import 路径不受影响。
 *
 * @module dsh-pmboard/client/settings/controller-api
 */

import type { RunSettingsView, StorageActionTicket, StorageBackend, SystemRecordInvalidView, SystemRecordView } from './types.ts'
import type { StorageActionKind } from './storage.ts'

export interface SettingsControllerApi {
  fetchRunSettings(): Promise<RunSettingsView>
  /** t12：保存运行上限；对齐趟 2 起也用于「改路径」（`PATCH /settings` 的 `storage.sqlitePath`）。 */
  patchRunSettings?(body: { stageMaxRounds?: Record<string, number>; storage?: { sqlitePath?: string } }): Promise<unknown>
  // ── t13：存储屏三件（缺省不装 = 本屏按钮如实报"通道未装配"，不假装成功） ──────────
  /** 取确认票据（FR-11：这一步只是"问"，服务端同时把真确认框推给人）。 */
  requestStorageAction?(action: StorageActionKind): Promise<StorageActionTicket>
  /** 带票切后端。 */
  switchStorageBackend?(input: { backend: StorageBackend; ticket: string }): Promise<unknown>
  /** 带票开迁移窗口（返回窗口键 = 窗口已开出的事实）。 */
  startLedgerMigration?(ticket: string): Promise<{ readonly windowKey: string }>
  /** 开系统目录选择窗口（「改路径」用）；缺省 = 该部署没有 → 界面退回手输。 */
  pickStoragePath?(): Promise<{ ok: boolean; path?: string; cancelled?: boolean }>
  /** t14：「系统记录」屏的数据源（缺省不装 = 该屏如实报"通道未装配"）。 */
  fetchSystemRecord?(): Promise<SystemRecordView | SystemRecordInvalidView>
}

export interface SettingsHost {
  /** 宿主元素本体（屏内自有监听要挂在它上面，例如「改路径」的输入读取）；替身宿主可不给。 */
  readonly el?: HTMLElement
  /** 写入壳 HTML（幂等：多次调用只换内容）。 */
  render(html: string): void
  /** 移除宿主（dispose 用）。 */
  destroy(): void
}
