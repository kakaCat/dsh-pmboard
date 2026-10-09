/**
 * REQ-261008103718-f1ea FR-1 回归：弹框请求必须可**无损 JSON 往返**。
 *
 * 事故（2026-10-08）：立项弹框在会话里始终不出现。真因是 questions 的选项里写了
 * `description: i === 0 ? '…' : undefined` —— 该键**存在且值为 undefined**，而宿主
 * api gateway 的 `projectRemoteEventRequest` 会把 agent/signal 之外的所有键原样复制，
 * 再交 `isRemoteJsonValue` 校验；`undefined` 不是合法 JSON 值 ⇒ 抛
 * `api gateway: Remote event request is not lossless JSON data` ⇒ **整条弹框请求被拒收**，
 * 浏览器侧根本收不到，而上层还把它误报成「用户未作答（取消 / 暂离）」。
 *
 * 判据等价物照抄 DSH 的 `packages/typert/protocol/src/json-value.ts`（pm 仓库不依赖该包，
 * 故此处内联；两边判据必须一致，否则本测试会失去意义）。
 *
 * @module dsh-pmboard/tests/lossless-json-questions
 */
import { describe, expect, it } from 'vitest'
import {
  buildCaptureDetailQuestions,
  buildCaptureIntentQuestions,
} from '../src/application/internal/capture-mapping.js'
import { stripUndefinedDeep } from '../src/application/internal/lossless-json.js'

/** DSH 网关判据的等价实现（含 undefined / NaN / Infinity / -0 / 循环引用均为非法）。 */
function isLosslessJson(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0)
  if (typeof value !== 'object') return false
  if (ancestors.has(value)) return false
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) return false
      for (const item of value) if (!isLosslessJson(item, ancestors)) return false
      return true
    }
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return false
      if (!isLosslessJson((value as Record<string, unknown>)[key], ancestors)) return false
    }
    return true
  } finally {
    ancestors.delete(value)
  }
}

describe('弹框请求的无损 JSON 约束', () => {
  it('复现：显式 undefined 的选项键无法无损往返（宿主网关据此拒收整条请求）', () => {
    const legacy = [{
      id: 'name',
      header: '[PM] 立项确认',
      question: '需求名称',
      options: [
        { label: '候选A（推荐）', description: 'agent 推荐' },
        { label: '候选B', description: undefined }, // ← 事故现场的写法
      ],
    }]
    expect(isLosslessJson(legacy)).toBe(false)
    // 清洗后即可通过——这正是通道边界那道防线的职责。
    expect(isLosslessJson(stripUndefinedDeep(legacy))).toBe(true)
  })

  it('修复：buildCaptureIntentQuestions 的输出可无损往返', () => {
    const questions = buildCaptureIntentQuestions(['候选A', '候选B'], { reasonLine: '演示立项' })
    expect(isLosslessJson(questions)).toBe(true)
  })

  it('修复：无候选（纯自定义输入）时也可无损往返', () => {
    const questions = buildCaptureIntentQuestions([], {})
    expect(isLosslessJson(questions)).toBe(true)
  })

  it('修复：buildCaptureDetailQuestions 的输出可无损往返', () => {
    const questions = buildCaptureDetailQuestions({ sessionCwd: '/tmp/ws', hostCwd: '/tmp/host' })
    expect(isLosslessJson(questions)).toBe(true)
  })

  it('清洗：剔除 undefined 键与数组项，保留 null 与其它原始值', () => {
    const dirty = { a: 1, b: undefined, c: [1, undefined, 2], d: null, e: { f: undefined, g: 'x' } }
    expect(stripUndefinedDeep(dirty)).toEqual({ a: 1, c: [1, 2], d: null, e: { g: 'x' } })
    expect(isLosslessJson(stripUndefinedDeep(dirty))).toBe(true)
  })

  it('清洗：不触碰类实例（AbortSignal 等由宿主单独投影，不在此改写）', () => {
    const controller = new AbortController()
    const value = { signal: controller.signal, keep: 'x' }
    expect(stripUndefinedDeep(value).signal).toBe(controller.signal)
  })
})
