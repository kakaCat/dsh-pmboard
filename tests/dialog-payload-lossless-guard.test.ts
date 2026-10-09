/**
 * 静态护栏（REQ-261008103718-f1ea FR-1）：构造弹框数据时，**禁止**把 `undefined`
 * 写成键的值。
 *
 * 背景（2026-10-08 事故）：`description: i === 0 ? '…' : undefined` 这种"键存在、值为
 * undefined"的写法会让弹框请求无法无损 JSON 往返，被宿主 remote 网关以
 * `api gateway: Remote event request is not lossless JSON data` **整条拒收**——弹框
 * 不出现，而错误还被误报成「用户取消」。运行时已由 `UserQuestionsAdapter` 兜底清洗，
 * 但上游写对才是正解；本测试让同类写法在 CI 阶段就被抓住，而不是再去线上排查一次。
 *
 * 与 `tests/lossless-json-questions.test.ts` 的分工：那边验**运行时**（清洗函数 +
 * 真实构造器输出可无损往返），这边验**源码形状**（不再出现该写法）。
 *
 * @module dsh-pmboard/tests/dialog-payload-lossless-guard
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** 抹掉注释（注释里允许留反例做文档——不抹会把"留档"误判成违规，参见既有同类测试）。 */
function stripComments(raw: string): string {
  return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
}

/**
 * 会进入弹框请求的数据构造处。**新增弹框问题构造器时必须把文件加到这里**——
 * 漏了也不会静默出错（适配器出口清洗会记 `[UI-2]` 诊断），但就失去了 CI 的早拦。
 */
const DIALOG_PAYLOAD_SOURCES = [
  '../src/application/internal/capture-mapping.ts',
] as const

/**
 * 违规形状：对象字面量的键被赋成 `条件 ? 值 : undefined`
 * （键名取弹框数据实际用到的几个，避免波及无关代码）。
 */
const OFFENDING_KEY = /^\s*(?:description|header|label|question|id)\s*:[^\n]*\?[^\n]*:\s*undefined\b/gm

describe('弹框请求载荷的无损 JSON 护栏', () => {
  it('抹注释确实生效（否则下面的断言可能因为注释里的反例而假绿/假红）', () => {
    const sample = "/* description: a ? 'x' : undefined */\nconst x = 1 // description: a ? 'y' : undefined\n"
    expect(stripComments(sample)).not.toContain('undefined')
  })

  it.each(DIALOG_PAYLOAD_SOURCES)('%s 不含「键: 条件 ? 值 : undefined」写法', (relative) => {
    const code = stripComments(readFileSync(new URL(relative, import.meta.url), 'utf8'))
    const offenders = code.match(OFFENDING_KEY) ?? []
    expect(offenders).toEqual([])
  })

  it('源码确实被读到了（防空文件恒绿）', () => {
    const code = stripComments(readFileSync(new URL(DIALOG_PAYLOAD_SOURCES[0], import.meta.url), 'utf8'))
    expect(code).toContain('buildCaptureIntentQuestions')
  })
})
