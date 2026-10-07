/**
 * 注册日志 ↔ 登记面 校验（REQ-261006201508-5cb6 t4 / FR-3）。
 *
 * 解决什么问题：装配期那行 `agent tools registered (N): a / b / c` 此前是**手写的数字 + 手写名单**，
 * 实测已漂移成「(13)，只列 19 个名」。静态扫源码只能证明"代码长这样"，证明不了"跑起来确实一致"——
 * 本用例真的执行 `apply()` 并**捕获日志行**，再与唯一手写事实源（`src/tools/registry.ts`）对账：
 * 数字或名单不一致即红，名单缺失也红（缺名 = 名单没有列全）。
 *
 * 契约（逐字见 docs/requirements/REQ-261006201508-5cb6/design/interfaces.md 第 3 节）：
 *   行形态 `agent tools registered (N): a / b / c`（单行，` / ` 分隔）；
 *   N = TOOL_REGISTRY.length；名单 = TOOL_REGISTRY.map(e => e.toolName)——两者都必须**派生**。
 *
 * 为什么自建 stub ctx 而不复用 tests/helpers：本用例要的是一个**只捕获 info**的最小宿主，
 * 自建能把「日志捕获」这件事本身读清楚，也不受别处 helper 改动牵连。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply } from '../src/index.js'
// 从**工具面出口**取（而不是直接摸 registry 文件）：顺带验证 FR-3 的再导出契约真的成立。
import { TOOL_REGISTRY } from '../src/tools/index.js'

type DisposeFn = () => void

/** 捕获宿主日志的 stub ctx：只记 info 文本，其余按需空实现。 */
function stubCtxWithLogs(logs: string[]): unknown {
  const disposers: DisposeFn[] = []
  const mkSvc = (extra: Record<string, unknown> = {}) => ({
    effect: (fn: () => unknown) => { const d = fn(); if (typeof d === 'function') disposers.push(d as DisposeFn) },
    systemPrompt: { section: () => () => {} },
    tools: { register: () => () => {} },
    webServer: { register: () => () => {} },
    ...extra,
  })
  const svcs: Record<string, unknown> = {
    systemPrompt: mkSvc(),
    tools: mkSvc(),
    webServer: mkSvc(),
    agents: mkSvc({ agents: {} }),
    sessionProjections: mkSvc({ sessionProjections: {} }),
  }
  return {
    sections: [],
    tools: [],
    routes: [],
    // cordis Service 基类构造时调 ctx.reflect.provide(...)，缺了装配阶段就抛
    reflect: { provide: () => {} },
    logger: (_name: string) => ({
      debug: () => {},
      info: (m: string) => { logs.push(String(m)) },
      warn: () => {},
      error: () => {},
    }),
    inject: (names: string[], cb: (c: unknown) => void) => { for (const n of names) cb(svcs[n]) },
    on: () => {},
  }
}

/** 从捕获到的日志里取注册行；取不到返回 undefined（调用方必须响亮失败，不得静默跳过）。 */
function registrationLineOf(logs: readonly string[]): string | undefined {
  return logs.find((l) => /agent tools registered \(\d+\)/.test(l))
}

const expectedCount = TOOL_REGISTRY.length
const expectedNames = TOOL_REGISTRY.map((e) => e.toolName).sort()

let dir: string
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'pmboard-registry-log-')) })
afterAll(() => { rmSync(dir, { recursive: true, force: true }) })

describe('注册日志 ↔ 登记面（REQ-261006201508-5cb6）', () => {
  it('装配后打印注册日志行，格式为 agent tools registered (N): a / b / c', () => {
    const logs: string[] = []
    apply(stubCtxWithLogs(logs) as never, { dshHome: dir })
    const line = registrationLineOf(logs)
    expect(line, '注册日志未打印：apply() 之后没有出现 agent tools registered (N): 行').toBeDefined()
    expect(line, '注册日志行形态不符：' + String(line)).toMatch(/^agent tools registered \(\d+\): \S/)
  })

  it('日志里的 N 等于登记面条数', () => {
    const logs: string[] = []
    apply(stubCtxWithLogs(logs) as never, { dshHome: dir })
    const line = registrationLineOf(logs)
    expect(line, '注册日志未打印').toBeDefined()
    const declared = Number(/\((\d+)\)/.exec(String(line))?.[1])
    expect(
      declared,
      '日志写 ' + String(declared) + ' 个 / 登记面 ' + String(expectedCount) + ' 条（数字必须从 TOOL_REGISTRY.length 派生）',
    ).toBe(expectedCount)
  })

  it('日志里的名单与登记面工具名集合一致（不多不少、不重不漏）', () => {
    const logs: string[] = []
    apply(stubCtxWithLogs(logs) as never, { dshHome: dir })
    const line = registrationLineOf(logs)
    expect(line, '注册日志未打印').toBeDefined()
    const raw = String(line).replace(/^agent tools registered \(\d+\): /, '')
    const printed = raw.split(' / ').map((s) => s.trim()).filter((s) => s.length > 0)
    // 重复即视为"名单没列全/列串了"：先卡这一条，再比对集合
    expect(new Set(printed).size, '日志名单里出现重名：' + printed.join(' / ')).toBe(printed.length)
    const missing = expectedNames.filter((n) => !printed.includes(n))
    // 严格比对：日志里出现的每个名字都必须是登记面上的**工具名原文**
    // （旧日志那种 reqboard_submit(kind) 写法算多名——契约要求逐字等于 toolName）。
    const extra = printed.filter((n) => !expectedNames.includes(n))
    expect(missing, '注册日志缺名（登记面有、日志没列）：' + (missing.join('、') || '（无）')).toEqual([])
    expect(extra, '注册日志多名（日志列了、登记面没有）：' + (extra.join('、') || '（无）')).toEqual([])
    expect(printed).toHaveLength(expectedCount)
  })
})
