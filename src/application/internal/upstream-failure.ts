/**
 * 上游失败分类（REQ-261004065652-5c1c FR-1 / FR-2 · t1）。
 *
 * ## 为什么需要它
 *
 * 2026-10-03 实测：上游 `AUTH 403`（额度用尽）被当作**普通异常**处理——驱动写一次健康位后
 * 继续起轮，4 小时 36 分空转 7257 回合、6605 次 403（see docs/requirements/REQ-261004065652-5c1c/
 * requirement.md §调研证据 E-1）。根因不是"没人写健康位"，而是**没有任何一层把错误分类**：
 * 致命错误（重试无解）与瞬时错误（重试有用）走同一条路。
 *
 * 本模块是**唯一分类点**，供三处共用一份口径：
 *   · `round-driver`：致命 → 停手 + 全局闩；瞬时 → 退避 + 熔断计数；
 *   · `interruption.stampInterruption`：留痕去重键用 `reasonClassOf()`（FR-8）；
 *   · 诊断/看板：把 `error:AUTH:<300 字符文案>` 归一成 `error:AUTH`。
 *
 * 纯函数、零 I/O、永不抛（层边界见 tests/layer-boundary.test.ts）。
 *
 * @module dsh-pmboard/application/internal/upstream-failure
 */

/** 病因大类。`unknown` 的语义是**什么都不做**（不猜、不写、不动）。 */
export type FailureKind = 'fatal' | 'transient' | 'abort' | 'normal' | 'unknown'

export interface TurnEndClassification {
  kind: FailureKind
  /** 归一后的病因类别（进熔断计数与留痕去重键）：`error:AUTH` / `error:TRANSPORT` / `aborted:user` … */
  reasonClass: string
  /** 可读原因（进 comment；已截断，见 {@link REASON_TEXT_MAX}）。 */
  reasonText: string
}

/** comment 正文里的原因长度上限：实测一条 403 文案 ≈300 字符，逐条落盘会放大台账。 */
export const REASON_TEXT_MAX = 200

/**
 * 致命错误的文案特征。
 *
 * 为什么按文案兜底：provider 的额度/鉴权错误**不总是**带 `code='AUTH'`（实测同一家 provider
 * 5 小时额度与周额度两条文案都不带结构化 code，只有 message 里的 `usage limit`）。
 * 只认 code 会漏判 → 退回自旋，正是本次事故的形态。
 */
const FATAL_MESSAGE_RE = /permission_error|usage limit|quota|unauthorized|forbidden|\b403\b/i

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 截断原因文本（保留头部 + 省略号），保证写台账的长度有界。 */
export function truncateReason(text: string, max: number = REASON_TEXT_MAX): string {
  if (max <= 0) return ''
  if (text.length <= max) return text
  return text.slice(0, Math.max(0, max - 1)) + '…'
}

/**
 * 归一宿主 `turn/end` 的 `data`。判定**顺序敏感**（写成用例锁死）：
 *
 * | # | 输入 | kind | reasonClass |
 * |---|---|---|---|
 * | 1 | `reason.kind='aborted'` | abort | `aborted:<cause.kind \| unknown>` |
 * | 2 | `reason.kind='error'` ∧ (`code='AUTH'` ∨ message 命中致命特征) | fatal | `error:AUTH` |
 * | 3 | `reason.kind='error'` 其它 | transient | `error:<code \| UNKNOWN>` |
 * | 4 | `completed` / `max-tokens` / `blocked` | normal | 同名 |
 * | 5 | 形态不认识 | unknown | `unknown` |
 */
export function classifyTurnEnd(data: unknown): TurnEndClassification {
  const reason = asObject(asObject(data)?.['reason'])
  const kind = asString(reason?.['kind'])

  if (kind === 'aborted') {
    const cause = asObject(reason?.['reason'])
    const causeKind = asString(cause?.['kind'])
    const reasonClass = 'aborted:' + (causeKind.length > 0 ? causeKind : 'unknown')
    return { kind: 'abort', reasonClass, reasonText: truncateReason(reasonClass) }
  }

  // `interrupted`（崩溃孤儿回合）：**不是**可重试的瞬时故障——进程/回合被外力掐断，
  // 重试前必须先有人看一眼。归到 abort 一类（"停下等人"，且 reason 原文保持 `interrupted`，
  // 与既有 FR-6 用例的期望逐字一致）。
  if (kind === 'interrupted') {
    return { kind: 'abort', reasonClass: 'interrupted', reasonText: 'interrupted' }
  }

  if (kind === 'error') {
    const error = asObject(reason?.['error'])
    const code = asString(error?.['code'])
    const message = asString(error?.['message'])
    const fatal = code === 'AUTH' || FATAL_MESSAGE_RE.test(code + ' ' + message)
    const reasonClass = fatal ? 'error:AUTH' : 'error:' + (code.length > 0 ? code : 'UNKNOWN')
    return {
      kind: fatal ? 'fatal' : 'transient',
      reasonClass,
      reasonText: truncateReason('error:' + code + ':' + message),
    }
  }

  if (kind === 'completed' || kind === 'max-tokens' || kind === 'blocked') {
    return { kind: 'normal', reasonClass: kind, reasonText: kind }
  }

  // 形态不认识 → 不猜（调用方据此不写、不动），与 interruption.turnEndOutcome 的既有口径一致。
  return { kind: 'unknown', reasonClass: 'unknown', reasonText: 'unknown' }
}

/**
 * 从**已落库的原因字符串**归一病因类别（FR-8 的留痕去重键用）。
 *
 * 为什么不能直接用 `classifyTurnEnd`：台账里存的是拼好的字符串
 * （`interruption.reason`，形如 `error:AUTH:403 {"error":…}`），结构信息已经丢了；
 * 这里按同一套规则从字符串复原，保证"写入时的类别"与"去重时的类别"同源。
 */
export function reasonClassOf(reason: string): string {
  const text = reason.trim()
  if (text.length === 0) return 'unknown'

  if (text.startsWith('aborted:')) {
    const tail = text.slice('aborted:'.length).split(/[\s（(,，;；]/)[0] ?? ''
    return 'aborted:' + (tail.length > 0 ? tail : 'unknown')
  }

  if (text.startsWith('error:')) {
    const rest = text.slice('error:'.length)
    const code = (rest.split(':')[0] ?? '').trim()
    // 致命特征优先于 code：provider 的额度文案不带 code，只认 code 会漏判（见上）。
    if (code === 'AUTH' || FATAL_MESSAGE_RE.test(text)) return 'error:AUTH'
    return 'error:' + (code.length > 0 ? code : 'UNKNOWN')
  }

  const head = text.split(/[:\s]/)[0] ?? ''
  return head.length > 0 ? head : 'unknown'
}
