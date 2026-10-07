/**
 * HTTP 状态表：新门禁错误码逐条 = 400（REQ-261005105032-3b02 · t-094e28 · §10 #43）。
 *
 * 为什么必须有这个文件：`STATUS_BY_CODE` 是**唯一**的"码 → HTTP 状态"映射点，而它的兜底是 500。
 * 漏登记既不会报错也不会红——只会让看板把"流程没满足、补齐即可重发"显示成"服务器坏了"
 * （本需求后端实测结论，故 §10 #43 列为硬约束 + 用例）。所以判据不是"表里有这个键"，
 * 而是**真发一次信封、看真写出的状态码**：`fail()` 是本仓唯一把 code 落成 HTTP 状态的路径。
 *
 * 手法沿用 tests/reqboard/degraded-startup.test.ts：最小假 res（只实现 writeHead / end），
 * 零网络、零宿主。
 */
import { describe, expect, it } from 'vitest'
import type { ServerResponse } from 'node:http'
import { fail } from '../src/http/envelope.js'
import { expectCode } from './helpers/code-assert.js'

interface Captured {
  status: number
  headers: Record<string, string>
  body: string
}

/** 最小 ServerResponse 替身：只实现信封真正用到的两个成员（多实现一分就少一分证据）。 */
function fakeRes(): { res: ServerResponse; captured: Captured } {
  const captured: Captured = { status: 0, headers: {}, body: '' }
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      captured.status = status
      captured.headers = headers
      return res
    },
    end(body?: string) {
      captured.body = body ?? ''
      return res
    },
  }
  return { res: res as unknown as ServerResponse, captured }
}

/** 发一次失败信封，取回真写出的状态码与响应体。 */
function dispatch(code: string): { status: number; code?: string } {
  const { res, captured } = fakeRes()
  fail(res, Object.assign(new Error('REQ-261005105032-3b02 门禁拒绝'), { code }))
  const body = JSON.parse(captured.body) as { success: boolean; code?: string; error: string }
  expect(body.success).toBe(false)
  // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（信封 code 逐字透出，不吞不改）
  expectCode(body, code)
  return { status: captured.status, code: body.code }
}

/** 新内部码（interfaces.md 错误码总表左列）。 */
const NEW_INTERNAL_CODES = [
  'prototype_missing',
  'prototype_version_conflict',
  'prototype_anchor_missing',
  'decision_log_missing',
  'decision_entry_invalid',
  'verification_prototype_compare_missing',
  'stage_gate_overdue',
] as const

/**
 * 与新内部码**成对**的传输码（interfaces.md 技术方案 #4：内部码与传输码成对补 400）。
 * 为什么两侧都要：四条转移路径里会话侧报传输码、看板侧报内部码——只登一侧，
 * 另一侧就继续落 500；这与"同一件事两种显示"正是 §10 #43 要防的。
 */
const NEW_TRANSPORT_CODES = [
  'REQBOARD_MISSING_PROTOTYPE',
  'REQBOARD_PROTOTYPE_VERSION_CONFLICT',
  'REQBOARD_PROTOTYPE_ANCHOR_MISSING',
  'REQBOARD_DECISION_LOG_MISSING',
  'REQBOARD_DECISION_ENTRY_INVALID',
  'REQBOARD_VERIFICATION_INCOMPLETE',
  'REQBOARD_STAGE_GATE_OVERDUE',
] as const

describe('STATUS_BY_CODE：REQ-261005105032-3b02 新码逐条 = 400（§10 #43）', () => {
  it('7 个新内部码逐一 400，且 code 原样带出（漏登记会如实落 500）', () => {
    for (const code of NEW_INTERNAL_CODES) {
      const r = dispatch(code)
      expect(r.status, code + ' 未登记 → 看板会显示成「服务器坏了」').toBe(400)
      expect(r.code, code).toBe(code)
    }
  })

  it('配对的 7 个传输码同样 400（会话侧报传输码，不得落 500）', () => {
    for (const code of NEW_TRANSPORT_CODES) {
      const r = dispatch(code)
      expect(r.status, code).toBe(400)
      expect(r.code, code).toBe(code)
    }
  })
})

describe('STATUS_BY_CODE：本次扩表不得改动既有映射（零回归）', () => {
  it('既有各档状态码逐条不变', () => {
    const cases: ReadonlyArray<readonly [code: string, status: number]> = [
      ['invalid_input', 400],
      ['missing_artifact', 400],
      ['artifact_not_confirmed', 400],
      ['design_doc_incomplete', 400],
      ['human_gate', 403],
      ['system_gate', 403],
      ['confirmation_required', 403],
      ['not_found', 404],
      ['REQBOARD_NOT_FOUND', 404],
      ['migration_in_progress', 409],
      ['dispatch_failed', 502],
      ['path_picker_unavailable', 501],
      ['REQBOARD_BRIDGE_NOT_READY', 503],
      ['REQBOARD_REQUIRES_MIGRATION', 503],
      ['REQBOARD_REQUIRES_SQLITE_MIGRATION', 503],
      ['REQBOARD_OPEN_WINDOW_UNAVAILABLE', 503],
    ]
    for (const [code, status] of cases) {
      expect(dispatch(code).status, code).toBe(status)
    }
  })

  it('未登记码仍**如实落 500**（不猜成 400：猜错比 500 更难查）', () => {
    expect(dispatch('brand_new_gate_code').status).toBe(500)
    expect(dispatch('brand_new_gate_code').code).toBe('brand_new_gate_code')
  })

  it('无 code 的异常仍 500（信封不伪造 code 字段）', () => {
    const { res, captured } = fakeRes()
    fail(res, new Error('裸异常'))
    const body = JSON.parse(captured.body) as { code?: string }
    expect(captured.status).toBe(500)
    expect(body.code).toBeUndefined()
  })
})
