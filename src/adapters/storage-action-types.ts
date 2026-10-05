/**
 * 宿主级动作票据的**类型**（REQ-261004103330-005f t7 / FR-11）——自 `PendingConfirmRegistry` 拆出。
 *
 * ## 为什么拆这一刀
 *
 * 注册表本体（行为）此前已 394 行，紧贴 `src/` 的 400 行尺寸门禁。本次给 `consume` 补
 * "否定作答不是许可"那一关（fail-open 修复）**必须写清理由**，而靠删注释腾地方是本仓明令禁止的
 * （"为什么 / 事故出处"型注释是硬约束）。故按"类型与行为分开"切一刀：**注释与类型一字未改地搬过来**，
 * 注册表只留行为，并把本文件的类型**再导出**（既有 import 路径不受影响）。
 *
 * 下面这段原样保留——它解释的是"为什么单开一张表"与"保证等级"，与类型同为契约的一部分。
 */

// ─────────────────────────────────────────────────────────────────────────────
// 宿主级动作的**一次性票据**（REQ-261004103330-005f t7 / FR-11）
//
// 为什么要单开一张表而不是复用 ticket 表：存储后端开关是**宿主级动作**，不属于任何一条需求，
// 且它是**一次性**的（消费即作废）。既有 ticket 表答的是"这条需求的产物/计划确认能不能取回执"，
// 两者谓词不同（一个按需求归属、一个按动作许可），混在一张表里必然漂移。
// 因此：`target:'storage-action'` 的登记路由进本表，**既有 artifact/plan 走原表原码路，行为逐字不变**。
//
// ## 保证等级（照抄 design/interfaces.md「人工确认留痕契约」，刻意留话）
//
// 本机 HTTP 无鉴权，任何本地进程都能打接口，因此这是**通道约定级**保证——与全仓既有五道人工门
// 同级（路由层 actor 默认 `human`，见 `http/routers/requirements.ts` 的 artifact/plan 确认），
// **不是密码学证明**。能做且必须做的三件事：
//   ① **不提供任何 agent 工具入口**（agent 只能 ask、不能 save）；
//   ② 执行必须消费已落章票据（`consume` 的"已落章 + 未过期 + 未消费"三合一判定）；
//   ③ 留痕可审计（`stamp.channel / sessionId / pluginVersion` + `consumedAt`）。
// 绕过工具直接打接口者会留下 `confirmedVia:'board'` 的痕迹，可被复盘查出。
// ─────────────────────────────────────────────────────────────────────────────

import type { ArtifactKind, PendingConfirmationOutcome } from '../shared/protocol.js'

/** 宿主级存储动作（不属于任何需求）。 */
export type StorageAction = 'switch-to-sqlite' | 'switch-to-json' | 'migrate'

/** 作答通道留下的落章信息——**只有作答通道**（人点确认 / 弹框作答 / 文字证据命中真实用户消息）能产生它。 */
export interface StorageActionStamp {
  /** 作答来源：看板确认按钮 / 弹框作答 / 文字证据。 */
  channel: 'board-confirm' | 'dialog-answer' | 'text-evidence'
  /** 作答窗口（审计用；缺省 = 未标注）。 */
  sessionId?: string
  /** 作答时的插件版本（审计用；缺省 = 未标注）。 */
  pluginVersion?: string
}

/**
 * 宿主级动作的挂起确认记录。
 *
 * `requirementId` 保留为**空串**（不是可选字段）：既有 `PendingConfirmation` 里它是必填 `string`，
 * 本表刻意不引入 `string | undefined`，避免读侧多一处判空分叉——空串即"不属于任何需求"。
 */
export interface StorageActionConfirmation {
  ticket: string
  windowKey: string
  /** 宿主级动作 → 空串（不属于任何需求）。 */
  requirementId: string
  target: 'storage-action'
  action: StorageAction
  createdAt: number
  /** 作答后回填（缺省 = 尚未作答）。 */
  outcome?: PendingConfirmationOutcome
  /** 作答通道落章（缺省 = 尚未落章）——与 outcome 一起构成"已落章"判据。 */
  stamp?: StorageActionStamp
  /** 一次性消费时间；非空 = 已消费（**重放必拒**）。 */
  consumedAt?: number
}

/** `consume` 的结构化失败原因（不抛异常，由调用方如实降级）。 */
export type ConsumeFailureReason =
  /** 未知 ticket（不存在 / 已随进程重启丢失）。 */
  | 'unknown'
  /** 已落章但没人作答（只 register 过）。 */
  | 'unsettled'
  /**
   * 已落章，但**答案是否定的**（人在确认框点了取消 / 需要修改）。
   *
   * 为什么单独立一个原因而不是并进 `unsettled`：这两件事对排查者意义完全不同——
   * `unsettled` 是"没人理"，`denied` 是"人明确不同意"。混在一起时，看到日志的人会去追"为什么没人答"，
   * 而真相是"人已经拒绝过了"。
   */
  | 'denied'
  /** 超过 TTL（沿用 `LIMITS.pendingConfirmTtlMs`，未另造数）。 */
  | 'expired'
  /** 已被消费过（一次性票据的重放）。 */
  | 'consumed'

/** `consume` 结果：成功给落章信息；失败给结构化原因。 */
export type ConsumeResult =
  | {
    ok: true
    ticket: string
    action: StorageAction
    requirementId: string
    confirmed: boolean
    advanced: boolean
    by: { kind: 'human'; channel: StorageActionStamp['channel']; sessionId?: string; pluginVersion?: string; at: number }
  }
  | { ok: false; ticket: string; reason: ConsumeFailureReason }

/** `register` 的宽入参（storage-action 下 `requirementId` 可空）。 */
export interface PendingRegisterInput {
  windowKey: string
  requirementId?: string
  target: 'artifact' | 'plan' | 'storage-action'
  kind?: ArtifactKind
  /** 仅 `target:'storage-action'` 有意义。 */
  action?: StorageAction
}
