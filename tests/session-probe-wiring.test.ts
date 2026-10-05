/**
 * 「一轮余量（参考）」节的**装配可达性**（t7 / FR-8 缺口修复）。
 *
 * 为什么这条必须有：t7 的余量节只有在 `IsolateNodeContextDeps.session` 被真正交到输入包构造处时
 * 才会上屏。此前用例层（`isolateNodeContext`）已接好了这条线，但**生产装配没接**——
 * 两个调用点（节点结算分发器 / 闸门链 H2）建 `IsolateNodeContextDeps` 时都没给 `session`，
 * 组合根也没把 `SessionProbeAdapter` 交给它们 ⇒ 该节在生产路径上永远不出现（只在用例层可验）。
 * 故本用例按**组合根的形状**装配并驱动这两条生产路径，断言替换进会话的正文里真的有该节。
 *
 * 组合根形状（index.ts）：适配器依赖 `createCaptureRuntime` 的两张会话缓冲表，**构造晚于**这两个
 * 装配点 ⇒ 两处收到的是惰性 getter `() => sessionProbe`。故这里也先给 getter、后 `attach()`，
 * 并额外钉死不回归的三件事：没装配 → 逐字节无该节；getter 抛错 → 照样不阻断；节内含「非门禁判据」。
 *
 * @module dsh-pmboard/tests/session-probe-wiring
 */
import { describe, it, expect } from 'vitest'
import { makeHarness, req } from './application/harness.js'
import { createNodeSettlementDispatcher } from '../src/application/internal/node-settlement.js'
import { createH2CompactHandler } from '../src/application/gate/handlers/h2-compact.js'
import { assembleGatePostChain } from '../src/gate-wiring.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { AgentDeliverer } from '../src/adapters/AgentDeliverer.js'
import type { SessionProbe } from '../src/application/ports.js'
import type { NodeIsolationPort, SurfaceNode } from '../src/application/use-cases/IsolateNodeContext.js'
import type { ConfirmContext } from '../src/domain/gate/GateSpec.js'
import type { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import type { IsolationTraceFile } from '../src/adapters/IsolationTraceFile.js'
import type { InjectionLogFile } from '../src/adapters/InjectionLogFile.js'
import type { SystemClock } from '../src/adapters/SystemClock.js'

const WINDOW = 'session-w-001'
const REQ_ID = 'REQ-000001'
const DOC_PATH = 'docs/requirements/REQ-000001/requirement.md'
const DOC_BODY = '# 需求文档\n正文标记 DOC-BODY\n'
const HEADING = '## 一轮余量（参考）'
/** A6 的可判点：这串字必须与数值**同一条展示内**出现（同节断言，不是全文 toContain）。 */
const NOTE = '参考值，非门禁判据'

/** 取某个二级节（标题 → 下一个二级标题）。 */
function sectionOf(text: string, heading: string): string {
  const start = text.indexOf(heading)
  if (start < 0) return ''
  const rest = text.slice(start + heading.length)
  const next = rest.indexOf('\n## ')
  return next < 0 ? rest : rest.slice(0, next)
}

/** 隔离端口替身：把**真正替换进会话的正文**（= 输入包文本）留下来供断言。 */
function capturingPort(): { port: NodeIsolationPort; texts: string[] } {
  const nodes: SurfaceNode[] = [
    { seq: 0, type: 'system/message' },
    { seq: 1, type: 'user/message' },
    { seq: 2, type: 'assistant/message' },
  ]
  const texts: string[] = []
  const port: NodeIsolationPort = {
    reachable: () => true,
    idle: () => true,
    surface: () => nodes,
    balancedBefore: () => true,
    balancedAfter: () => true,
    replace: (input) => { texts.push(input.text); return 100 },
  }
  return { port, texts }
}

/**
 * 结构化假会话——供**真 `NodeIsolationAdapter`**（闸门链内部自建，不可注入替身）驱动。
 * 该适配器用结构类型接住宿主 Session（不 import 框架类型），且本机 node_modules 里没有
 * `@deepseek-ai/dsh-session`，故这里只需给出 reachable / surface / 配对平衡 / append 要用的那几样。
 */
function fakeSession(texts: string[]): unknown {
  const events = new Map<number, { type: string }>([
    [0, { type: 'system/message' }],
    [1, { type: 'user/message' }],
    [2, { type: 'assistant/message' }],
  ])
  return {
    surface: { nodes: [0, 1, 2] },
    eventAt: (seq: number) => events.get(seq),
    append: (_type: string, data: unknown) => {
      const text = (data as { content?: { text?: string }[] } | undefined)?.content?.[0]?.text
      if (typeof text === 'string') texts.push(text)
      return { seq: 100 }
    },
  }
}

/**
 * 组合根形状的端口：**先**装配（拿到 getter）**后**建适配器。
 * 刻意用真适配器 + 假投影服务（`contextWindow 64000 − projectedTokens 40000 = 余量 24000`），
 * 这样断言的是"端口 → 输入包"的整条真实链路，而不是一个手搓的假读数。
 */
function lazySessionProbe(): { get: () => SessionProbe | undefined; attach: () => void } {
  let probe: SessionProbe | undefined
  return {
    get: () => probe,
    attach: () => {
      probe = new SessionProbeAdapter({
        agents: () => ({ get: (id: string) => (id === WINDOW ? { session: { id: 'session-1' } } : undefined) }),
        sessionProjections: () => ({
          stateOf: (_session: unknown, kind: string) =>
            kind === 'contextPressure' ? { contextWindow: 64000, projectedTokens: 40000 } : undefined,
        }),
        now: () => 1000,
      })
    },
  }
}

/** 种子：绑定本窗口的需求 + 已落盘的需求文档。 */
function seeded(status: 'design' | 'implementing') {
  const h = makeHarness({ requirements: [req({ id: REQ_ID, status, sourceSessionId: WINDOW })] })
  h.docs.put(DOC_PATH, DOC_BODY)
  return h
}

function confirmCtx(): ConfirmContext {
  return {
    windowKey: WINDOW, gate: 'G1', from: 'brainstorming', to: 'design',
    requirementId: REQ_ID, verdict: 'affirmative', answers: [], decidedAt: 1000,
  }
}

/** 5 个 setImmediate（与 isolate-node-context.test.ts 的 settleAsync 同口径）。 */
async function settleAsync(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => { setImmediate(resolve) })
  }
}

/**
 * 生产路径 ①：节点结算分发器（NODE_ISOLATION 遗留隔离路径）。
 * 隔离端口被驱动到 `replace` ⇒ 它的 `text` 就是**生产路径真的会注入的输入包正文**。
 * 分两拍：`startSettlement` = 组合根装配（装配期只登记，**不执行**），`flushSettlement` = 异步边界执行
 * ——生产里赋值与执行分处这两拍之间（D-17：结算点交给 setImmediate），故时序必须照抄。
 */
function startSettlement(sessionProbe?: () => SessionProbe | undefined): {
  scheduled: Array<() => void>
  texts: string[]
} {
  const h = seeded('implementing')
  const { port, texts } = capturingPort()
  const scheduled: Array<() => void> = []
  const dispatcher = createNodeSettlementDispatcher({
    enabled: true,
    store: h.store,
    docs: h.docs,
    clock: h.clock,
    taskStore: h.taskStore,
    isolationFor: () => port,
    persistArtifacts: () => 1,
    schedule: (task) => { scheduled.push(task) },
    ...(sessionProbe === undefined ? {} : { sessionProbe }),
  })
  dispatcher.onSettle({ windowKey: WINDOW, stage: 'implementing', requirementId: REQ_ID }, {})
  return { scheduled, texts }
}

async function flushSettlement(scheduled: readonly (() => void)[]): Promise<void> {
  for (const task of scheduled) task()
  await settleAsync()
}

/** 一次完整的结算（装配 → 执行）：给"端口本来就缺/坏"这类不涉及时序的断言用。 */
async function runSettlement(sessionProbe?: () => SessionProbe | undefined): Promise<string[]> {
  const { scheduled, texts } = startSettlement(sessionProbe)
  await flushSettlement(scheduled)
  return texts
}

/** 生产路径 ②：闸门链 H2 压缩——直接驱动 H2 handler 这一层（gate-wiring 只是转交本 dep）。 */
async function runH2(sessionProbe?: () => SessionProbe | undefined): Promise<{ kind: string; texts: string[] }> {
  const h = seeded('design')
  const { port, texts } = capturingPort()
  const handler = createH2CompactHandler({
    store: h.store,
    persistArtifacts: () => 0,
    docs: h.docs,
    clock: h.clock,
    taskStore: h.taskStore,
    isolationFor: () => port,
    ...(sessionProbe === undefined ? {} : { sessionProbe }),
  })
  const outcome = await handler.run({ ctx: confirmCtx(), session: {} })
  return { kind: outcome.kind, texts }
}

describe('t7 · 生产装配把 session 端口交到输入包（FR-8 缺口）', () => {
  it('节点结算路径：组合根形状（惰性 getter）→ 替换进会话的输入包含余量节 + 非门禁判据', async () => {
    const probe = lazySessionProbe()
    // index.ts：装配点先拿到 getter，适配器在**装配期**随后构造 ⇒ 读实例发生在执行期
    const { scheduled, texts } = startSettlement(probe.get)
    probe.attach()
    await flushSettlement(scheduled)

    expect(texts).toHaveLength(1) // 真的走到了 replace（生产路径而非兜底文本）
    const section = sectionOf(texts[0]!, HEADING)
    expect(section, '接通后必须真的出现该节').not.toBe('')
    expect(section).toContain('24000') // 64000 − 40000
    expect(section).toContain(NOTE)    // 与数值同节
  })

  it('闸门链 H2 路径：同一个 getter 形状 → 压缩出来的输入包含余量节', async () => {
    const probe = lazySessionProbe()
    const pending = runH2(probe.get)
    probe.attach()
    const { kind, texts } = await pending

    expect(kind).toBe('continue')
    expect(texts).toHaveLength(1)
    const section = sectionOf(texts[0]!, HEADING)
    expect(section).not.toBe('')
    expect(section).toContain('24000')
    expect(section).toContain(NOTE)
  })

  it('缺省（没传 sessionProbe）= 本改动前：两条路径都没有该节，且与"端口读数不可得"逐字节相同', async () => {
    const noDepSettlement = await runSettlement(undefined)
    const noDepH2 = await runH2(undefined)
    expect(noDepSettlement).toHaveLength(1)
    expect(noDepSettlement[0]).not.toContain(HEADING)
    expect(noDepH2.texts[0]).not.toContain(HEADING)

    // 端口在场但读数不可得（投影服务没装配）→ 同一份文本（"缺能力"与"取不到"都只是不追加该节）
    const bare = new SessionProbeAdapter({})
    expect(await runSettlement(() => bare)).toEqual(noDepSettlement)
    expect((await runH2(() => bare)).texts).toEqual(noDepH2.texts)
    expect(noDepSettlement[0]).not.toContain(NOTE)
  })

  it('getter 抛错 / 还没装配：不阻断节点隔离与压缩，只是不追加该节（降级不冒泡）', async () => {
    const thrower = (): SessionProbe | undefined => { throw new Error('not assembled yet') }
    const s = await runSettlement(thrower)
    const c = await runH2(thrower)
    expect(s).toHaveLength(1)          // 替换照常发生
    expect(c.kind).toBe('continue')    // 压缩照常完成
    expect(s[0]).not.toContain(HEADING)
    expect(c.texts[0]).not.toContain(HEADING)
  })
})

describe('t7 · gate-wiring 真的把 sessionProbe 转交给了 H2（整链驱动，真 NodeIsolationAdapter）', () => {
  /** 链装配：与 index.ts 同形（链先装配、适配器后构造 → 转交的是 getter）。 */
  function assemble(sessionProbe?: () => SessionProbe | undefined) {
    const h = seeded('design')
    const texts: string[] = []
    const chain = assembleGatePostChain({
      requirementStore: h.store,
      docs: h.docs as unknown as FileDocRepository,
      clock: h.clock as unknown as SystemClock,
      now: () => 1000,
      isolationTrace: { record: () => {} } as unknown as IsolationTraceFile,
      injectionLog: { record: () => {} } as unknown as InjectionLogFile,
      deliverer: new AgentDeliverer(() => undefined, () => 'c-1', 'test'),
      taskStore: h.taskStore,
      logger: { info: () => {}, warn: () => {} },
      plugin: 'test',
      compactionEnabled: true,
      idle: () => true,
      idleState: () => 'idle',
      ...(sessionProbe === undefined ? {} : { sessionProbe }),
    })
    return { chain, texts }
  }

  it('assembleGatePostChain（组合根形状）→ H1 校验 → H2 压缩：正文含余量节', async () => {
    const probe = lazySessionProbe()
    const { chain, texts } = assemble(probe.get)
    probe.attach()
    const session = fakeSession(texts)

    chain.enqueue(confirmCtx())
    const summary = await chain.runPending(WINDOW, session)

    expect(summary.steps.find((s) => s.name === 'h2-compact')?.outcome).toEqual({ kind: 'continue' })
    expect(texts).toHaveLength(1)
    expect(sectionOf(texts[0]!, HEADING)).toContain(NOTE)
  })

  it('链缺省 sessionProbe → H2 仍压缩，只是正文没有该节（与本改动前逐字节相同）', async () => {
    const { chain, texts } = assemble(undefined)
    const session = fakeSession(texts)

    chain.enqueue(confirmCtx())
    const summary = await chain.runPending(WINDOW, session)

    expect(summary.steps.find((s) => s.name === 'h2-compact')?.outcome).toEqual({ kind: 'continue' })
    expect(texts).toHaveLength(1)
    expect(texts[0]).not.toContain(HEADING)
    expect(texts[0]).not.toContain(NOTE)
  })
})
