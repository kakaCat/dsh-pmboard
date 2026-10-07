/**
 * 回执「断码」断言（REQ-261006201814-ac4f FR-6）：把「失败回执必须携带期望的码」写成一条断言，
 * 失败消息**同时**给出期望码与实际读数（读报告的人不必重跑一遍就知道发生了什么）。
 *
 * 认四种形状：`.code` / `.body.code` / `.error.code` / `.error` 里内嵌的码。「有没有码」只看
 * 前三种**码位**与文案内嵌的**大写传输码**——小写码嵌在散文里与英文词无法区分（实测
 * `任务不存在：t-nope` 会被猜成 `nope`），故不作判据；期望码真以文案形态出现时由包含通道精确对上。
 *
 * @module dsh-pmboard/tests/helpers/code-assert
 */
import { expect } from 'vitest'

/** 传输码 / 领域码的字面形态（小写那条**只用于诊断读数**，不参与判据）。 */
const UPPER = /(?<![A-Za-z0-9_])REQBOARD_[A-Z0-9_]+/
const LOWER = /(?<![A-Za-z0-9_])[a-z][a-z0-9_]{2,}/

/** 读一个字段（非对象 → undefined）。 */
const col = (resp: unknown, key: string): unknown =>
  resp !== null && typeof resp === 'object' ? (resp as Record<string, unknown>)[key] : undefined

/** `error` 的文本形态（字符串 / Error 都认；其余 → 空串）。 */
function textOf(resp: unknown): string {
  const e = col(resp, 'error')
  return typeof e === 'string' ? e : e instanceof Error ? e.message : ''
}

/** 码位：`.code` / `.body.code` / `.error.code`——只有这三处是「码」，`error` 本身是文案。 */
function codeSlotOf(resp: unknown): string | undefined {
  for (const v of [col(resp, 'code'), col(col(resp, 'body'), 'code'), col(col(resp, 'error'), 'code')]) {
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

/** 「带没带码」的判据：码位 → `error` 文案内嵌的大写码 → 期望码被文案包含。 */
function carriedCodeOf(resp: unknown, expected?: string): string | undefined {
  const slot = codeSlotOf(resp)
  if (slot !== undefined) return slot
  const t = textOf(resp)
  if (expected !== undefined && expected.length > 0 && t.includes(expected)) return expected
  return t.match(UPPER)?.[0]
}

/** 只读诊断：回执上读到的码（码位 / 文案内嵌 / 猜一个小写字样——猜的那条只进失败消息）。 */
export function errorCodeOf(resp: unknown, expected?: string): string | undefined {
  return carriedCodeOf(resp, expected) ?? textOf(resp).match(LOWER)?.[0]
}

/** 回执摘要（失败消息里给出原文，免得读者再跑一遍去猜形状）。 */
function brief(resp: unknown): string {
  try {
    const s = JSON.stringify(resp) ?? String(resp)
    return s.length > 400 ? s.slice(0, 400) + '…' : s
  } catch {
    return '(回执无法序列化)'
  }
}

/** 断言回执携带期望的错误码（失败消息同时给出期望码与实际码）。 */
export function expectCode(resp: unknown, code: string): void {
  const actual = carriedCodeOf(resp, code)
  expect(actual, '期望码（' + code + '），实际码（' + (actual ?? '无') + '），回执=' + brief(resp)).toBe(code)
}

/** 断言回执**不携带**错误码（中性降级回执的契约：分得清「契约无码」与「码丢了」）。 */
export function expectNoCode(resp: unknown): void {
  const actual = carriedCodeOf(resp)
  expect(actual, '期望回执不携带错误码（只看码位与 .error 内嵌大写码），实际（' + (actual ?? '无') + '），回执=' + brief(resp))
    .toBeUndefined()
}
