/**
 * 输出契约回归（REQ-2e9473 补充；2026-09-17 加固）。
 *
 * 背景：DSH 工具 output.schema 是 additionalProperties:false——返回体出现未声明字段会被
 * 绑定层**拒收**（值算出来了、副作用发生了，调用方却只看到一条 invalid output 错误）。
 * 本轮实测已踩三次：accept_sheet 的 archived/status、archive_submit 的 unlisted_files/warning、
 * ask_confirm 的 requirement_id（后者让"用户已确认推进"变成一条错误）。
 *
 * 两道防线：
 *   ① 动态：对关键工具的**成功路径**直调 execute，断言"返回键 ⊆ 声明键"。
 *   ② 静态：扫描 agent-tools.ts 里每个工具工厂体的**所有** `return {...}` 顶层键，
 *      断言全部已声明——穷尽所有分支，不依赖测试是否跑到那条路径。
 * 第 ② 道是根治手段：① 只能覆盖测到的路径，漏掉的分支就是下次的事故。
 */
import { makeHarness } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
// REQ-260927202051-f6df（v9）：任务改由 TaskStore 提供，工具壳在缺端口时按端口语义**显式失败**
// （不再静默返回空任务集）。故本测试的 deps 必须装配真实 TaskStore，否则 verify_submit / ask_confirm
// 的成功路径会因「任务队列端口未装配」而红——那不是被测工具的缺陷，是夹具欠装配。
import { JsonQueueRepository } from '../src/repositories/QueueRepository.js'
import { QueueTaskStore } from '../src/repositories/QueueTaskStore.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import * as toolModules from '../src/tools/index.js'
// REQ-261006123819-3af3 FR-1：工具登记面（唯一手写清单，本文件只做派生与交叉校验）
import { TOOL_REGISTRY } from '../src/tools/registry.js'
import { defineSubmitTool, defineAskConfirmTool, defineCaptureTool, defineMoveTool } from '../src/tools/index.js'
import { CAPTURE_QUESTION_IDS, WORKSPACE_SENTINELS } from '../src/application/internal/capture-mapping.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-oc-001'
let root: string
// B12 阶段③a：存储改**新端口**（由统一工厂提供，断言/工具同源）；旧 JSON 台账不再自建
let h: ReturnType<typeof makeHarness>
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-outcontract-'))
  h = makeHarness({})
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const REQ = 'REQ-0c0001'
async function seed(status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const r = {
    id: REQ, title: '输出契约', description: '', status, category: 'feature', blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    ...extra,
  } as unknown as RequirementRecord
  h.seedRequirementSync(r)
  await h.seedSettled()
}
/** 真适配器构造 UseCaseDeps（t8 起工具壳吃 application 端口，不再吃旧的 ReqboardToolDeps）。 */
const depsWith = (extra: { userQuestions?: unknown } = {}) =>
  ({

    store: h.store,
    docs: new FileDocRepository({ workspaceRoot: root }),
    clock: new SystemClock(),
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => extra.userQuestions),
    doneThrottleMs: 0,
    // v9：真实队列仓储 + 真实 TaskStore（不造 mock 端口），工作区根与 docs 同根。
    taskStore: new QueueTaskStore({ repo: new JsonQueueRepository({ workspaceRoot: root }) }),
  }) as never
const run = (tool: any, args: unknown) => tool.execute(args, { agent: { id: W } })

/** 工具声明的输出 schema（兼容两种挂载形状）。 */
function outputSchema(tool: any): any {
  return tool?.output?.schema ?? tool?.schema?.output?.schema ?? {}
}
/** 工具声明的输出字段集合。 */
function declaredKeys(tool: any): Set<string> {
  return new Set(Object.keys(outputSchema(tool)?.properties ?? {}))
}
/**
 * 断言返回体 (a) 键都被声明（未声明 → DSH 绑定层会拒收），(b) 已声明键的**值符合声明类型**。
 *
 * (b) 是 2026-09-27 事故后补的闸门：`reqboard_run_status` 在无 active run 时
 * `snapshot.runId` 发的是 `null`，而 schema 声明 `type:'string'` ⇒ **值级**校验失败，
 * 把「当前没有链在跑」这个正常事实转译成硬错误 `value.snapshot.runId must be a string`。
 * 原测试只断言键**是否声明**、**不校验值**，所以它从这道门底下溜了过去。
 *
 * 口径：本仓 DSL 只允许 type/properties/additionalProperties，表达不了 `string | null`，
 * 故**降级路径必须整体省略该键，而不是发 null**（`runId` 已按此修）。
 */
/**
 * 已知留债登记表（REQ-261002140814-1a5d FR-3 的发现，**不许静默放过**）：
 *
 * 删掉「undefined 值当省略」的豁免后，门禁立刻抓到第二处**同类活缺陷**——
 * `reqboard_ask_confirm` 走"非肯定项且用户未填意见"时返回 `user_feedback: undefined`
 * （`src/application/use-cases/AskConfirm.ts:312`）。真实调用同样会被绑定层判
 * `value is not lossless JSON`，把人的"需要修改"答复变成一条无信息的硬错误。
 *
 * 本需求边界**只修 clear_pause**，故此处显式登记为留债：登记项**必须仍然存在问题**
 * （修好后本断言会变红，强制摘牌）；到期日 2026-10-16，另立需求治理。
 */
const UNDEFINED_VALUE_DEBT = new Set<string>(['ask_confirm(declined).user_feedback'])

function assertKeysDeclared(tool: any, value: Record<string, unknown>, label: string): void {
  assertConformsToSchema(outputSchema(tool), value, label, label)
}

function assertConformsToSchema(schema: any, value: any, label: string, path: string): void {
  const properties = (schema?.properties ?? {}) as Record<string, any>
  const declared = new Set(Object.keys(properties))
  const obj = (value ?? {}) as Record<string, unknown>
  for (const k of Object.keys(obj)) {
    expect(declared.has(k), `${label} 返回字段未在 output.schema 声明：${path}.${k}`).toBe(true)
  }
  for (const [k, spec] of Object.entries(properties)) {
    // 键**整体省略**是合法形状（降级路径该有的样子）。
    // ⚠️ 但「值为 `undefined`」**不是**省略：绑定层的无损 JSON 校验（`walkJsonValue`）在
    // `JSON.stringify` **之前**就看内存值——`undefined` 不属于任何 JSON 值类型 ⇒ 整个回执被
    // 转成无信息的 `value is not lossless JSON` 硬错误。
    // 此前这里写着 `|| obj[k] === undefined` 的豁免（理由"序列化会丢掉它"），正是
    // reqboard_clear_pause 的 `previous_activation: undefined` 能全绿溜过门禁的原因
    // （REQ-261002140814-1a5d FR-3 已删该豁免）。`null` 同样不合法（会被保留并撞上类型校验）。
    if (!(k in obj)) continue
    const fullPath = `${path}.${k}`
    if (UNDEFINED_VALUE_DEBT.has(fullPath)) {
      // 留债项：必须**仍然**是 undefined —— 修好后这里变红，逼着力刻摘牌（同 LEGACY_PARAM_SHAPE 口径）
      expect(
        obj[k] === undefined,
        `${fullPath} 的留债已修复——请从 UNDEFINED_VALUE_DEBT 移除该项（到期日 2026-10-16）`,
      ).toBe(true)
      continue
    }
    expect(
      obj[k] === undefined,
      `${label} 字段值为 undefined（不是「省略」）：${fullPath}——undefined 不是无损 JSON，缺值必须整体省略该键`,
    ).toBe(false)
    const v = obj[k]
    const t = spec?.type
    if (t === 'string' || t === 'number' || t === 'boolean') {
      // 不允许 null：DSH 绑定层按声明类型做值级校验，null 会被判 invalid output。
      expect(typeof v, `${label} 字段类型不符：${path}.${k} 声明为 ${t}，实际 ${JSON.stringify(v)}`).toBe(t)
    } else if (t === 'array') {
      expect(Array.isArray(v), `${label} 字段类型不符：${path}.${k} 应声明为数组，实际 ${JSON.stringify(v)}`).toBe(true)
    } else if (t === 'object') {
      assertConformsToSchema(spec, v, label, `${path}.${k}`)
    }
  }
}

// ── 源码扫描工具（静态防线用）───────────────────────────────────────────────

/** 找到 src 中下标 start 处 '{' 的配对 '}'（跳过字符串/模板/注释）。 */
function matchBrace(src: string, start: number): number {
  let depth = 0
  let i = start
  while (i < src.length) {
    const c = src[i]!
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      i++
      continue
    }
    if (c === '{') depth++
    else if (c === '}') { depth--; if (depth === 0) return i }
    i++
  }
  return src.length
}

/**
 * 提取对象字面量体（不含花括号）在 depth 0 上的键名。
 *
 * 只在「键位」识别键：开头、或顶层 `,` 之后。为什么不能只认 `ident:`——三元表达式
 * `kind: cond ? kindRaw : ''` 里的 `kindRaw :` 会被误当成键（实测踩到，见 defineConfirmArtifactTool）。
 */
function topLevelKeys(body: string): string[] {
  const keys: string[] = []
  let depth = 0
  let expectKey = true
  let i = 0
  while (i < body.length) {
    const c = body[i]!
    if (c === '/' && body[i + 1] === '/') { while (i < body.length && body[i] !== '\n') i++; continue }
    if (c === '/' && body[i + 1] === '*') { i += 2; while (i < body.length && !(body[i] === '*' && body[i + 1] === '/')) i++; i += 2; continue }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++
      while (i < body.length && body[i] !== q) { if (body[i] === '\\') i++; i++ }
      i++
      expectKey = false
      continue
    }
    if (c === '{' || c === '(' || c === '[') { depth++; expectKey = false; i++; continue }
    if (c === '}' || c === ')' || c === ']') { depth--; i++; continue }
    if (depth === 0) {
      if (c === ',') { expectKey = true; i++; continue }
      if (expectKey) {
        const m = /^([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(i))
        if (m !== null) { keys.push(m[1]!); expectKey = false; i += m[0].length; continue }
        if (body.startsWith('...', i)) {
          // 条件字段：...(cond ? { a, b } : {}) —— 展开表达式里的对象字面量键也是响应字段。
          // 不处理它会漏掉"只在某条路径上返回的键"（2026-09-17 实测：task_move 的
          // task_card / blockers / warning 正是这样漏过静态扫描，上线后绑定层拒收回执）。
          let j = i + 3
          while (j < body.length && /\s/.test(body[j]!)) j++
          if (body[j] === '(') {
            const close = matchPair(body, j, '(', ')')
            // 2026-09-27（REQ-260927144541-0481 FR-7）：原实现用 /\{([^{}]*)\}/ 只认**内部无花括号**
            // 的对象组，于是 `...(cond ? { run: { ok } } : {})` 里的 run 被整块漏掉——门禁"看得见才拦得住"，
            // 静默漏键就是下一次线上 invalid output。改为逐个**平衡**花括号取顶层键。
            for (const [s, e] of balancedLiterals(body.slice(j + 1, close))) {
              keys.push(...topLevelKeys(body.slice(j + 1 + s + 1, j + 1 + e)))
            }
            i = close + 1
          } else {
            i += 3
          }
          expectKey = false
          continue
        }
        if (/\s/.test(c)) { i++; continue }
        expectKey = false; i++; continue
      }
    }
    i++
  }
  return keys
}

/** 台账变更集（store.mutate 回调返回体）只由这两种键组成——据此与工具响应区分。 */
const MUTATOR_KEYS = new Set(['requirements', 'tasks'])
const isResponseLiteral = (keys: string[]): boolean =>
  keys.length > 0 && !keys.every(k => MUTATOR_KEYS.has(k))

/** 找 start 处开括号的配对闭括号（跳过字符串/模板/注释）。 */
function matchPair(src: string, start: number, open: string, close: string): number {
  let depth = 0
  let i = start
  while (i < src.length) {
    const c = src[i]!
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      i++
      continue
    }
    if (c === open) depth++
    else if (c === close) { depth--; if (depth === 0) return i }
    i++
  }
  return src.length
}

/**
 * 回调实参区（`.map(...)` / `.filter(...)` / `.forEach(...)` / `.catch(...)` /
 * `.then(...)` / `store.mutate(...)` / `mutateIfPresent(...)`）——其内部的 `return {...}`
 * 不是工具响应（如 archive_submit 里 `.map(u => { return { path, section, summary } })`）。
 *
 * `mutateIfPresent` 是 B12 阶段②a 起 `store.mutate` 的**统一收口入口**
 * （找不到需求 = 无变更，见 use-cases/queue-access.ts）；它的回调同样 return 变更结果
 * （`{ changed: true }`），与被排除的 `store.mutate` 回调是同一类，故一并排除。
 */
function callbackSpans(src: string): [number, number][] {
  const spans: [number, number][] = []
  const re = /(?:\.map|\.filter|\.forEach|\.catch|\.then|\.mutate)\s*\(|mutateIfPresent\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const open = m.index + m[0].length - 1
    spans.push([open, matchPair(src, open, '(', ')')])
  }
  return spans
}

/**
 * 源码片段里所有**响应型** `return {...}` 的顶层键。
 *
 * 判定口径：**不是台账变更集的对象字面量就是工具响应**。为什么用这条：`store.mutate(...)`
 * 的回调也 return 对象（`{ requirements: [...] }` / `{ requirements, tasks }`），它们不是
 * 工具返回体，且其键集恒 ⊆ {requirements, tasks}；据此排除。反向口径（"含 success 才算响应"）
 * 已验证不成立——`reqboard_status` 的响应不带 success。
 */
function returnKeys(src: string): string[] {
  const keys: string[] = []
  const excluded = callbackSpans(src)
  const inCallback = (at: number) => excluded.some(([s, e]) => at > s && at < e)
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      i++
      continue
    }
    const prev = src[i - 1] ?? ''
    if (src.startsWith('return', i) && !/[A-Za-z0-9_$]/.test(prev) && !inCallback(i)) {
      let j = i + 6
      while (j < src.length && /\s/.test(src[j]!)) j++
      if (src[j] === '{') {
        const end = matchBrace(src, j)
        const lit = topLevelKeys(src.slice(j + 1, end))
        if (isResponseLiteral(lit)) keys.push(...lit) // 排除 store.mutate 回调的变更集
        i = end + 1
        continue
      }
    }
    i++
  }
  return keys
}

/**
 * 片段里所有**平衡**的对象字面量区间（[开括号下标, 闭括号下标]）。
 * 为什么不用正则：正则数不清嵌套层数——`{ run: { ok: true } }` 这种形状会被 [^{}]* 整块漏掉。
 */
function balancedLiterals(src: string): [number, number][] {
  const out: [number, number][] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === "'" || c === '"' || c === '`') {
      const q = c; i++
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++ }
      i++
      continue
    }
    if (c === '{') {
      const end = matchBrace(src, i)
      out.push([i, end])
      i = end + 1
      continue
    }
    i++
  }
  return out
}

describe('输出契约：返回字段 ⊆ output.schema 声明', () => {
  it('archive_submit（含 unlisted_files 警告路径）', async () => {
    await seed('archived')
    const reqDir = join(root, 'docs/requirements', REQ)
    mkdirSync(reqDir, { recursive: true })
    writeFileSync(join(reqDir, 'requirement.md'), 'x')
    // REQ-2d1c74 FR-5：archive 清单内文档须真实落盘
    writeFileSync(join(reqDir, 'plan.md'), 'x')
    writeFileSync(join(reqDir, 'verification.md'), 'x')
    writeFileSync(join(reqDir, 'prototype.html'), 'x') // 未列入清单 → warning 路径
    const tool = defineSubmitTool(depsWith())
    let out: any
    try {
      out = await run(tool, {
        kind: 'archive',
        dir: 'docs/requirements/' + REQ,
        docs: [
          { kind: 'requirement', path: 'docs/requirements/' + REQ + '/requirement.md' },
          { kind: 'plan', path: 'docs/requirements/' + REQ + '/plan.md' },
          { kind: 'verification', path: 'docs/requirements/' + REQ + '/verification.md' },
        ],
        merged_into: ['docs/architecture/workflow-stages.md'],
        index_entry: '输出契约测试',
        manual_updates: [{ path: 'docs/architecture/workflow-stages.md', section: 'x', summary: 'y' }],
        // REQ-261004183621-de3f FR-2：未列文件默认拒绝 → 显式声明不收（这条用例考的是输出契约，不是闸门）
        unlisted_ack: [{ path: 'docs/requirements/' + REQ + '/prototype.html', reason: '输出契约测试夹具：有意不收' }],
      })
    } catch (err) {
      rmSync(reqDir, { recursive: true, force: true })
      throw err
    }
    assertKeysDeclared(tool, out, 'archive_submit')
    rmSync(reqDir, { recursive: true, force: true })
  })

  it('verify_submit（含 sheet 摘要路径）', async () => {
    await seed('implementing')
    const tool = defineSubmitTool(depsWith())
    const out = await run(tool, { kind: 'verification', summary: '交付', evidence: ['npx vitest run 全绿'] })
    assertKeysDeclared(tool, out, 'verify_submit')
  })

  it('ask_confirm 成功路径（肯定项 → 落章 + 推进）', async () => {
    await seed('brainstorming', {
      artifacts: [{ kind: 'requirement', path: 'docs/requirements/' + REQ + '/requirement.md' }],
    })
    // REQ-261005105032-3b02：feature 需求出需求阶段必须有需求文档（裁定门读「讨论与裁定记录（D-x）」节）。
    // 夹具原先只登记产物、没落文档；补一份含真空态的最小文档——schema 声明与断言都不动
    // （本用例本就断言 advanced===true，补文档后自然恢复）。
    const askReqDir = join(root, 'docs/requirements', REQ)
    mkdirSync(askReqDir, { recursive: true })
    writeFileSync(join(askReqDir, 'requirement.md'), '# 需求\n\n## 讨论与裁定记录（D-x）\n\n本节无裁定\n')
    const uq = { ask: async () => ({ answers: [{ id: 'confirm', selected: ['好'] }] }) }
    const tool = defineAskConfirmTool(depsWith({ userQuestions: uq }))
    const out = await run(tool, { target: 'artifact', kind: 'requirement', question: '确认？', options: ['好', '不'] })
    assertKeysDeclared(tool, out, 'ask_confirm(success)')
    expect((out as any).confirmed).toBe(true)
    expect((out as any).advanced).toBe(true)
  })

  it('ask_confirm 非肯定项（不推进）', async () => {
    await seed('brainstorming', {
      artifacts: [{ kind: 'requirement', path: 'docs/requirements/' + REQ + '/requirement.md' }],
    })
    const uq = { ask: async () => ({ answers: [{ id: 'confirm', selected: ['不'] }] }) }
    const tool = defineAskConfirmTool(depsWith({ userQuestions: uq }))
    const out = await run(tool, { target: 'artifact', kind: 'requirement', question: '确认？', options: ['好', '不'] })
    assertKeysDeclared(tool, out, 'ask_confirm(declined)')
    expect((out as any).confirmed).toBe(false)
  })

  it('ask_confirm 弹框不可用（fallback=board）', async () => {
    await seed('brainstorming')
    const tool = defineAskConfirmTool(depsWith())
    const out = await run(tool, { target: 'artifact', kind: 'requirement', question: '确认？' })
    assertKeysDeclared(tool, out, 'ask_confirm(fallback)')
    expect((out as any).fallback).toBe('board')
  })

  /**
   * requirement_submit 成功路径（2026-10-03 事故后的补线）。
   *
   * 同一天第二次踩同一个坑：`auto_confirm` 声明的类型（`boolean`）与真实形状
   * （`AutoConfirmResult = { triggered, reason? }`）不符 ⇒ 产物登记了、确认门也挂上了，
   * agent 只拿到 `value.auto_confirm must be a boolean`。静态扫描抓不到这类漂移：
   * 它只比**键集**、不比**值的类型**；而动态防线此前没覆盖 submit 的 requirement 路径。
   */
  it('requirement_submit 成功路径（登记 + auto_confirm 回执形状）', async () => {
    await seed('brainstorming')
    const reqDir = join(root, 'docs/requirements', REQ)
    mkdirSync(reqDir, { recursive: true })
    writeFileSync(
      join(reqDir, 'requirement.md'),
      '# 需求\n\n## 边界\n\n## 产品定义\n\n## 用户与角色\n\n## 功能点\n',
    )
    const tool = defineSubmitTool(depsWith())
    const out = await run(tool, { kind: 'requirement', summary: '一句话摘要' })
    expect((out as any).success, 'requirement_submit 未成功：' + JSON.stringify(out)).toBe(true)
    assertKeysDeclared(tool, out, 'requirement_submit')
  })

  /**
   * capture 成功路径（2026-10-03 事故后的补线）。
   *
   * 为什么必须补：`answers` 是**嵌套对象**——静态扫描只取 return 的顶层键，
   * `answers.workspace` 在内层，静态防线结构上看不见；而动态防线此前只覆盖
   * archive/verify/ask_confirm 三条路径，capture 从未进来过。于是
   * `mapCaptureAnswers` 的 answers 多了 `workspace`（capture-mapping.ts）而
   * CaptureTool 的 output.schema 没声明，两边静默漂移 —— 实测后果是**每次四问立项都报
   * `value.answers.workspace is not a declared property`**：需求建出来了、窗口也绑上了，
   * agent 却只拿到一条 invalid output（值算出来了、副作用发生了，调用方只看到错误）。
   *
   * 本用例让递归校验真正走进 answers 内层：再漂移一次即红。
   */
  it('capture 成功路径（四问作答 → 立项；answers 内层键也在校验范围内）', async () => {
    const uq = {
      ask: async () => ({
        answers: [
          { id: CAPTURE_QUESTION_IDS.name, selected: ['输出契约立项'] },
          { id: CAPTURE_QUESTION_IDS.category, selected: ['feature'] },
          { id: CAPTURE_QUESTION_IDS.difficulty, selected: ['standard'] },
          { id: CAPTURE_QUESTION_IDS.doc_location, selected: ['docs/requirements/<REQ>/'] },
          { id: CAPTURE_QUESTION_IDS.workspace, selected: [WORKSPACE_SENTINELS.session] },
        ],
      }),
    }
    const tool = defineCaptureTool(depsWith({ userQuestions: uq }))
    const out = await run(tool, {})
    // 先确认走的是**成功路径**（失败回执同样是合法形状，但那样这条用例就测不到立项回执）
    expect((out as any).success, 'capture 未成功立项：' + JSON.stringify(out)).toBe(true)
    assertKeysDeclared(tool, out, 'capture(success)')
    expect((out as any).answers.workspace).toBe(WORKSPACE_SENTINELS.session)
  })

  /**
   * move 回退成功路径（REQ-261003204149-1e80 t12）。
   *
   * 为什么单独立一条：`rollback` 是**嵌套对象**——静态扫描只看 return 的顶层键，
   * 四个子键在里层，静态防线结构上看不见；而本仓当天已因同类漂移（capture 的
   * answers.workspace、submit 的 auto_confirm）把两次成功调用变成 invalid output。
   * 递归校验 `assertConformsToSchema` 具备走进内层的能力，缺的只是"有人真跑过这条路径"。
   */
  it('move 回退成功路径（rollback 与四个子键逐字声明）', async () => {
    await seed('implementing', {
      artifacts: [
        {
          stage: 'decomposing', kind: 'decomposition',
          path: 'docs/requirements/' + REQ + '/decomposition.md',
          registeredAt: 1, registeredBy: { kind: 'human' },
          confirmedAt: 30, confirmedBy: { kind: 'human' },
        },
      ],
      plan: {
        path: 'docs/requirements/' + REQ + '/decomposition.md',
        submittedAt: 25, approvedAt: 30, approvedBy: { kind: 'human' }, tasks: [],
      },
    })
    const tool = defineMoveTool(depsWith())
    const out = await run(tool, { to: 'design', reason: '需求描述不对' })
    expect((out as any).status, '应走回退路径：' + JSON.stringify(out)).toBe('design')
    expect(Object.keys((out as any).rollback ?? {}).sort(), '回退回执四键应齐备').toEqual([
      'artifacts_revoked', 'plan_approval_revoked', 'tasks_canceled', 'tasks_reworked',
    ])
    assertKeysDeclared(tool, out, 'move(rollback)')
  })
})

/**
 * 故障注入（REQ-260927144541-0481 FR-7 / design test-cases TC-4）：**只测成功路径等于没测**——
 * 这里直接给扫描器喂一段"新增未声明返回键"的源码，检验它真的能抓到（抓不到 = 门禁形同虚设）。
 */
describe('输出契约·故障注入：注入未声明返回键时门禁必红', () => {
  it('临时给工具加一个未声明返回键 → 扫描器抓到、差集非空', () => {
    const declared = declaredKeys({ output: { schema: { properties: { success: { type: 'boolean' } } } } })
    const keys = returnKeys('async execute() { return { success: true, totally_undeclared: 1 } }')
    const missing = [...new Set(keys)].filter(k => !declared.has(k))
    expect(keys).toContain('success')
    expect(missing).toEqual(['totally_undeclared'])
  })

  it('嵌套对象的条件展开也要被抓到（run/report/workflow 这类形状）', () => {
    const keys = returnKeys('fn() { return { success: true, ...(r !== undefined ? { run: { ok: true } } : {}) } }')
    expect(keys).toContain('run')
  })

  /**
   * REQ-261002140814-1a5d FR-3：**值为 `undefined` 的属性必须判红**（不再当"省略"放过）。
   * 这一条是本次缺陷（clear_pause 成功却报 value is not lossless JSON）能全绿溜过门禁的补洞，
   * 也是门禁自身的反向自检：喂旧形状必须报错，喂"真正省略"必须通过。
   */
  it('值为 undefined 的属性被判红，键整体省略才合法（clear_pause 同款形状）', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { success: { type: 'boolean' }, previous_activation: { type: 'string' } },
    }
    expect(() =>
      assertConformsToSchema(schema, { success: true, previous_activation: undefined }, 'clear_pause(旧形状)', 'out'),
    ).toThrow(/undefined/)
    expect(() =>
      assertConformsToSchema(schema, { success: true }, 'clear_pause(缺值省略键)', 'out'),
    ).not.toThrow()
  })

  /**
   * TC-4 的真实形态：给**某工具**临时加未声明返回键 → 该工具在 output-contract 里变红。
   * 为什么必须用真实工具源：合成字符串只证明"扫描器认识花括号"，证明不了"这个工具真被门禁看着"。
   * 这里取真实 TaskTree 用例源 + 真实 defineTaskTreeTool 的 output.schema，走与静态扫描同一条管线
   * （returnKeys → declaredKeys → 差集）。注入落在**临时副本**上，跑完即删，绝不写真实工作区——
   * 本仓是多窗口共享的脏工作树，测试里改真源文件=给别人埋雷。
   */
  it('给真实工具源临时加未声明返回键 → 真实声明集下差集非空（在临时副本上验证）', () => {
    const ROOT = fileURLToPath(new URL('../src', import.meta.url))
    const rel = 'application/use-cases/TaskTree.ts'
    const original = readFileSync(join(ROOT, rel), 'utf8')
    if (!original.includes('return {')) throw new Error('注入前提不成立：' + rel + ' 无可注入的响应字面量')
    const dir = mkdtempSync(join(tmpdir(), 'pmboard-gate-fault-'))
    try {
      writeFileSync(
        join(dir, 'TaskTree.ts'),
        original.replace('return {', 'return {\n      gate_fault_injected_undeclared: 1,'),
      )
      // 反向自检：原件不含该键，说明后面观察到的差异确实来自这次注入
      expect(returnKeys(original)).not.toContain('gate_fault_injected_undeclared')
      const keys = returnKeys(readFileSync(join(dir, 'TaskTree.ts'), 'utf8'))
      const declared = declaredKeys((toolModules as any).defineTaskTreeTool({} as never))
      const missing = [...new Set(keys)].filter(k => !declared.has(k))
      expect(missing, '注入未声明键后门禁竟然没抓到——门禁形同虚设').toContain('gate_fault_injected_undeclared')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

/** 递归列出目录下全部 .ts（扫描器覆盖全部工具文件，而非只读一个文件）。 */
function listTs(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...listTs(p))
    else if (e.name.endsWith('.ts')) out.push(p)
  }
  return out
}

/**
 * 工具登记面（REQ-261006123819-3af3 FR-1）：响应源映射不再是本文件里的手写表，
 * 而是 `src/tools/registry.ts` 这一份登记面——加工具只改那里，这里只做派生与交叉校验。
 */
/**
 * 响应源扫描的**已知假阳性**登记表（REQ-261006123819-3af3 FR-1）。
 *
 * 扫描口径是「文件里每一处非回调 `return {...}` 的顶层键都算响应键」。对**响应体只在导出入口
 * 函数里**的用例文件成立；但下面三个用例文件同时含**内部辅助函数**的 return 字面量，那些键
 * 不是工具响应字段：Knowledge 的 `list` 来自参数解析 helper；Handoff 的 `windowKey` 等来自
 * 开窗 / 投递 / 压力读数三个 helper；SkillInstall 的 `commit` 等来自 `manifestDigest`。
 *
 * 处置（**不是**放宽扫描器，也**不是**删断言）：
 *  - 就地登记「工具 → 假阳性键」，逐条写明来源；登记项**必须仍然被扫到**（消失了就变红，逼摘牌）。
 *  - 收窄扫描口径（如"只扫导出入口函数"）会**静默漏掉**"响应字面量写在私有 helper 里"的工具——
 *    那是本仓最怕的失效形态（门禁看得见才拦得住），故不动扫描器。
 *  - 不把这些键补进 `output.schema`：它们是内部 helper 的返回形状，声明成顶层响应字段等于说假话
 *    （schema 是 additionalProperties:false 的对外契约，多声明一个永不出现的字段只会误导调用方）。
 */
const SCAN_FALSE_POSITIVES: Record<string, readonly string[]> = {
  // parseKbQueryArgs 的归一化结果（QueryKnowledge.ts:102），不是 kb 回执的顶层字段。
  Knowledge: ['list'],
  // openHandoffWindow / deliverSeed / pressureProjection 的返回（HandoffOwner.ts:312,333,346,352,361）；
  // 回执里它们是**嵌套**在 delivery / context_pressure / 无 windowKey 顶层的形状。
  Handoff: ['windowKey', 'delivered', 'kind', 'reason', 'contextWindow', 'pressureTokens', 'projectedTokens', 'source'],
  // manifestDigest 的清单摘要（InstallSkills.ts:193），回执里嵌在 manifest 对象内。
  SkillInstall: ['commit', 'version', 'trimmed', 'sha256Count'],
}

describe('输出契约·静态扫描：每个工具的全部 return 分支键都必须已声明', () => {
  const ROOT = fileURLToPath(new URL('../src', import.meta.url))
  const toolFiles = listTs(join(ROOT, 'tools'))
  // 工具工厂：export function define<Name>Tool(deps: UseCaseDeps[, 第二参数...])
  // REQ-261006123819-3af3 FR-1 第二步：原正则要求「恰好一个 deps 参数」，于是带 ops 的
  // Bind / Handoff 两个工厂对安全网**完全失明**（改动前只扫到 25/27）。容许第二参数后补齐。
  const re = /export function define(\w+)Tool\(deps: UseCaseDeps(?:\s*,[^)]*)?\)/g
  const sites: { name: string; file: string; at: number }[] = []
  for (const f of toolFiles) {
    const text = readFileSync(f, 'utf8')
    let mm: RegExpExecArray | null
    while ((mm = re.exec(text)) !== null) sites.push({ name: mm[1]!, file: f, at: mm.index })
  }

  it('扫描器覆盖全部工具文件，且扫到的工厂数不低于登记面条数（少一个即红——防退化为只覆盖部分）', () => {
    // 遍历 src/tools/**/*.ts：覆盖下限 9；t9 删除 host/agent-tools.ts 后本扫描不受影响
    expect(toolFiles.length).toBeGreaterThanOrEqual(9)
    // 断言随 TOOL_REGISTRY.length 走：登记面加一条，这里自动抬高下限（不再写死 9 或 27）。
    expect(sites.length, '工厂扫描数少于登记面条数：漏扫 Bind/Handoff 这类带第二参数的工厂').toBeGreaterThanOrEqual(TOOL_REGISTRY.length)
    // 工厂名唯一（同名的第二个工具会静默覆盖第一个）
    expect(new Set(sites.map(s => s.name)).size).toBe(sites.length)
  })

  // 驱动源 = TOOL_REGISTRY（唯一手写登记面）；正则扫描降级为**安全网**（见下方两条用例）。
  for (const entry of TOOL_REGISTRY) {
    it('define' + entry.key + 'Tool：所有 return 分支键均已声明', () => {
      const keys: string[] = [...returnKeys(readFileSync(join(ROOT, entry.factoryFile), 'utf8'))]
      for (const rel of entry.responseSources) {
        expect(existsSync(join(ROOT, rel)), '响应源文件不存在：' + entry.key + ' → ' + rel).toBe(true)
        keys.push(...returnKeys(readFileSync(join(ROOT, rel), 'utf8')))
      }
      // 扫描器可信度：每个工具体至少应抓到一个键
      expect(keys.length, 'define' + entry.key + 'Tool 未扫到任何 return 键，扫描器可能失效').toBeGreaterThan(0)
      const factory = (toolModules as unknown as Record<string, (d: unknown) => any>)['define' + entry.key + 'Tool']
      expect(typeof factory, 'define' + entry.key + 'Tool 未导出').toBe('function')
      const declared = declaredKeys(factory({} as never))
      const fp = new Set(SCAN_FALSE_POSITIVES[entry.key] ?? [])
      const missing = [...new Set(keys)].filter(k => !declared.has(k) && !fp.has(k))
      expect(missing, 'define' + entry.key + 'Tool 的 return 含未声明字段：' + missing.join(', ')).toEqual([])
      // 假阳性登记必须**仍然存在**：扫描器或源码变了导致某项消失 → 这里变红，逼着摘牌（不许留过期豁免）。
      for (const k of fp) {
        expect(keys, entry.key + ' 的假阳性登记 ' + k + ' 已消失——请从 SCAN_FALSE_POSITIVES 摘牌').toContain(k)
      }
    })
  }

  it('安全网：正则扫到的工厂全部已登记（未登记即红并点名）', () => {
    const known = new Set(TOOL_REGISTRY.map(e => e.key))
    // 差集非空 = 有人加了工厂但没在 registry.ts 登记。正则已放宽到覆盖带第二参数的工厂
    // （REQ-261006123819-3af3 FR-1 第二步），故 Bind / Handoff 也在这张网里。
    expect(sites.map(s => s.name).filter(k => !known.has(k))).toEqual([])
  })

  it('registry 逐条可构造（工厂文件存在且导出 define<key>Tool）', () => {
    for (const e of TOOL_REGISTRY) {
      const f = join(ROOT, e.factoryFile)
      expect(existsSync(f), 'registry 条目指向不存在的工厂文件：' + e.key + ' → ' + e.factoryFile).toBe(true)
      expect(
        typeof (toolModules as unknown as Record<string, unknown>)['define' + e.key + 'Tool'],
        'registry 条目对应的工厂未导出：define' + e.key + 'Tool',
      ).toBe('function')
    }
  })
})
