/**
 * 易变段尾部投递：**传输 + 协调**（REQ-261007100513-6749 t3 · FR-2 / FR-3）。
 *
 * 本文件覆盖两批口径：
 *  · 卡面验收 ①–⑪（去重 / 空态 / 分槽去抖 / 常量落点 / 到达判据 / capture 生产者 / 降级 / 端口字段 /
 *    永不抛 / 扫描面 / 增量有界）；
 *  · 2026-10-08 **独立复核对 P1×2 + P2×5 的返工口径**：头部让位一次性永久（P1-A）、回执 = 到达确认
 *    而非送出成功（P1-B）、直投作废旧槽 + 冲刷前重投影（P2-1）、空态重排挪到去重之后（P2-2）、
 *    让位迟滞（P2-3）、sha1 摘要（P2-4）、空态文案带阶段判据（P2-5）。
 *
 * 时间全部走**注入的假定时器**（`setTimer`/`clearTimer`）——"不真等 30 秒 / 5 分钟"是硬要求，
 * 且要能断言"同一窗口同一 kind 只留一个未决定时器"与冲刷**确实发生**（不是"算出了 pending"）。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  DEBOUNCE_MS_BY_KIND,
  createNoticeDelivery,
  notifyVolatileQuietly,
  type NoticeDeliveryOutcome,
  type NoticeDeliverySink,
} from '../src/application/internal/notice-delivery.js'
import {
  createNoticeReconciler,
  type NoticeReconciler,
} from '../src/application/internal/notice-reconciler.js'
import { VolatileNoticeAdapter } from '../src/adapters/VolatileNoticeAdapter.js'
import {
  buildVolatileNotice,
  emptyTaskNoticeText,
  noticeHash,
  pickDebounced,
  VOLATILE_NOTICE_DEBOUNCE_MS,
  type VolatileNotice,
  type VolatileNoticeKind,
} from '../src/application/internal/volatile-notice.js'
import {
  capturePromptForMessage,
  headSectionTextFrom,
  resolveStageNotice,
} from '../src/application/internal/capture-section.js'
import type { InjectionLogInput, InjectionLogPort } from '../src/application/internal/injection-log.js'
import { registerCaptureGuidance } from '../src/gate-wiring.js'
import { LIMITS } from '../src/domain/limits.js'
import { factsOf, type RequirementFacts } from '../src/domain/requirement/RequirementSummary.js'
import { openPromptFactsFor } from '../src/application/internal/window.js'
import { applyTaskRollup } from '../src/application/internal/rollup.js'
import type { RequirementStore, TaskStore, UseCaseDeps, VolatileNoticePort } from '../src/application/ports.js'
import { emptyLedger, type ReqboardLedger, type TaskRecord } from '../src/shared/protocol.js'

const W = 'session-volatile-1'
const CTX = { agent: { id: W } }
const SRC = fileURLToPath(new URL('../src', import.meta.url))
const readSrc = (rel: string): string => readFileSync(SRC + '/' + rel, 'utf8')
/** 组合根注入的摘要（**sha1**；与 index.ts 逐字同式）。 */
const sha1 = (canonical: string): string => createHash('sha1').update(canonical).digest('hex')

// ── 假定时器 / 假窗口 ─────────────────────────────────────────────────────────

interface FakeTimer { at: number; fn: () => void; cancelled: boolean; id: number }

/** 可推进的假时钟 + 假定时器（`advance` 按到期时刻顺序执行；执行时 `now` = 到期时刻）。 */
function makeClock(start = 0) {
  let now = start
  let seq = 0
  const timers: FakeTimer[] = []
  return {
    now: (): number => now,
    setTimer: (fn: () => void, ms: number): unknown => {
      const t: FakeTimer = { at: now + Math.max(0, ms), fn, cancelled: false, id: ++seq }
      timers.push(t)
      return t
    },
    clearTimer: (handle: unknown): void => { (handle as FakeTimer).cancelled = true },
    advance: (ms: number): void => {
      const target = now + ms
      for (;;) {
        const due = timers
          .filter(t => !t.cancelled && t.at <= target)
          .sort((a, b) => a.at - b.at || a.id - b.id)[0]
        if (due === undefined) break
        due.cancelled = true // 已执行 = 不再待决
        now = due.at
        due.fn()
      }
      now = target
    },
    pendingTimers: (): number => timers.filter(t => !t.cancelled).length,
  }
}

interface Delivered { at: number; target: string; message: Record<string, unknown>; messageId: string }

/** 假 agent：inbox.prepend 记录器 + followup 计数器（后者必须恒为 0——投递不得新起回合）。 */
function makeAgent(clock: { now: () => number }) {
  const delivered: Delivered[] = []
  let followups = 0
  let seq = 0
  const inbox = {
    nextStep: [] as unknown[],
    nextTurn: [] as unknown[],
    prepend(target: string, message: unknown): void {
      const m = message as Record<string, unknown>
      delivered.push({ at: clock.now(), target, message: m, messageId: String(m.id) })
      if (target === 'next-step') inbox.nextStep.push(message)
    },
  }
  const agent = { inbox, followup: (): void => { followups += 1 } }
  return {
    agent, inbox, delivered,
    followups: (): number => followups,
    nextMessageId: (): string => 'nm-' + (++seq),
  }
}

interface Harness {
  clock: ReturnType<typeof makeClock>
  agent: ReturnType<typeof makeAgent>
  logs: InjectionLogInput[]
  diags: string[]
  delivery: ReturnType<typeof createNoticeDelivery>
  reconciler: NoticeReconciler
  setText(kind: VolatileNoticeKind | 'empty', text: string | undefined): void
  deliveredTexts(): string[]
  /** 模拟 host 的 `agent/inbox/claimed`（**到达确认**）。 */
  claimAll(): void
  /** 模拟 host 的 `agent/inbox/discarded`（用户 stop / cancel 清 inbox）。 */
  discardAll(): void
}

const textOf = (m: Record<string, unknown>): string =>
  ((m.content as { text?: string }[] | undefined)?.[0]?.text) ?? ''

/** 装配：传输层（真适配器 + 假 agent）+ 协调层 + 假定时器。 */
function harness(over: {
  agents?: () => unknown
  sink?: NoticeDeliverySink
  contentFor?: (windowKey: string, kind: VolatileNoticeKind) => VolatileNotice | undefined
  emptyNoticeFor?: (windowKey: string) => VolatileNotice | undefined
  hashOf?: (canonical: string) => string
  reclaimAfterFailures?: number
} = {}): Harness {
  const clock = makeClock()
  const agent = makeAgent(clock)
  const texts = new Map<string, string>()
  const logs: InjectionLogInput[] = []
  const diags: string[] = []
  const sink = over.sink ?? new VolatileNoticeAdapter({
    agents: over.agents ?? ((): unknown => ({ get: (): unknown => agent.agent })),
    plugin: 'dsh-pmboard',
    newMessageId: () => agent.nextMessageId(),
  })
  const contentFor = over.contentFor ?? ((_w: string, kind: VolatileNoticeKind) => {
    const text = texts.get(kind)
    return text === undefined ? undefined : { kind, text }
  })
  let reconcilerRef: NoticeReconciler | undefined
  const delivery = createNoticeDelivery({
    sink,
    contentFor,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...(over.hashOf === undefined ? {} : { hashOf: over.hashOf }),
    injectionLog: { record: (e): void => { logs.push(e) } } as InjectionLogPort,
    onOutcome: (o: NoticeDeliveryOutcome): void => { reconcilerRef?.noteSent(o) },
    diagnose: (m): void => { diags.push(m) },
  })
  const reconciler = createNoticeReconciler({
    delivery,
    contentFor,
    ...(over.emptyNoticeFor === undefined
      ? {
          emptyNoticeFor: (): VolatileNotice | undefined => {
            const text = texts.get('empty')
            return text === undefined ? undefined : { kind: 'task', text }
          },
        }
      : { emptyNoticeFor: over.emptyNoticeFor }),
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    ...(over.reclaimAfterFailures === undefined ? {} : { reclaimAfterFailures: over.reclaimAfterFailures }),
    diagnose: (m): void => { diags.push(m) },
  })
  reconcilerRef = reconciler
  return {
    clock, agent, logs, diags, delivery, reconciler,
    setText: (kind, text) => {
      if (text === undefined) texts.delete(kind)
      else texts.set(kind, text)
    },
    deliveredTexts: (): string[] => agent.delivered.map(d => textOf(d.message)),
    claimAll: (): void => {
      for (const d of agent.delivered) reconciler.noteClaimed(W, d.messageId)
    },
    discardAll: (): void => {
      for (const d of agent.delivered) reconciler.noteDiscarded(W, d.messageId)
    },
  }
}

// ── ① 去重 / 通道 / 自署来源 ─────────────────────────────────────────────────

describe('① 相同文本只投 1 次 / 走 next-step / 不起回合（followup 计数 = 0）', () => {
  it('到期才冲刷；相同文本去重；改一个字节后重投；投递消息自署来源', async () => {
    const h = harness()
    h.setText('status', '状态行 v1')
    await h.reconciler.notify(W, 'status')
    // 冲刷者归属：到期前一条都不投（不是"算出了 pending 就算数"）。
    h.clock.advance(LIMITS.noticeDebounceMs - 1)
    expect(h.agent.delivered).toEqual([])
    expect(h.clock.pendingTimers()).toBe(1)
    h.clock.advance(1)
    expect(h.agent.delivered).toHaveLength(1)
    expect(h.agent.delivered[0]!.target).toBe('next-step')
    expect(h.agent.delivered[0]!.at).toBe(LIMITS.noticeDebounceMs) // 到期即冲刷（不早不晚）

    const msg = h.agent.delivered[0]!.message
    expect(msg.role).toBe('user')
    expect(textOf(msg)).toBe('状态行 v1')
    const source = msg.source as Record<string, unknown>
    expect(source.kind).toBe('dive') // 自署：**不得**冒充 kind='user'
    expect(source.plugin).toBe('dsh-pmboard')
    expect('revision' in source).toBe(false) // 带齐 revision/round 会变成"合法 Dive 回合来源"
    expect('round' in source).toBe(false)
    expect(h.agent.followups()).toBe(0) // 绝不 followup（会新起一整轮 agent loop）

    await h.reconciler.notify(W, 'status') // 相同文本 → 去重
    h.clock.advance(LIMITS.noticeDebounceMs)
    expect(h.agent.delivered).toHaveLength(1)

    h.setText('status', '状态行 v2') // 改一个字节 → 重投
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    expect(h.deliveredTexts()).toEqual(['状态行 v1', '状态行 v2'])
    expect(h.logs.map(l => [l.origin, l.delivered])).toEqual([['system-notice', true], ['system-notice', true]])
    expect(h.agent.followups()).toBe(0)
  })

  it('同一窗口同一 kind 只保留一个未决定时器（窗口内覆盖不重排、到期只投最后一次）', async () => {
    const h = harness()
    h.setText('status', '第一态')
    await h.reconciler.notify(W, 'status')
    expect(h.clock.pendingTimers()).toBe(1)
    h.clock.advance(5_000)
    h.setText('status', '第二态')
    await h.reconciler.notify(W, 'status')
    expect(h.clock.pendingTimers()).toBe(1)
    h.clock.advance(25_000)
    expect(h.deliveredTexts()).toEqual(['第二态'])
    expect(h.clock.pendingTimers()).toBe(0)
  })
})

// ── 按 kind 的窗口表（capture / stage 立即，task / status 30s）────────────────

describe('按 kind 的窗口表：capture / stage 立即投，task / status 仍 30s 合并', () => {
  it('表是单一落点：capture=0 / stage=0 / task=status=LIMITS.noticeDebounceMs', () => {
    expect(DEBOUNCE_MS_BY_KIND).toEqual({ capture: 0, stage: 0, task: 30_000, status: 30_000 })
    expect(DEBOUNCE_MS_BY_KIND.task).toBe(LIMITS.noticeDebounceMs)
    expect(DEBOUNCE_MS_BY_KIND.status).toBe(LIMITS.noticeDebounceMs)
    expect(readSrc('application/internal/notice-delivery.ts'))
      .toContain('deps.debounceMs ?? DEBOUNCE_MS_BY_KIND[kind]')
  })

  it('① capture 命中提示**不推进时间**即可投（不得等 30s）', async () => {
    const h = harness()
    h.setText('capture', capturePromptForMessage(W, '帮我加一个告警中心页面'))
    await h.reconciler.notify(W, 'capture')
    expect(h.clock.pendingTimers()).toBe(1) // 仍走定时器（异步边界；不起 agent loop）
    h.clock.advance(0) // **时间不走**
    expect(h.deliveredTexts()).toHaveLength(1)
    expect(h.agent.delivered[0]!.at).toBe(0)
    expect(h.deliveredTexts()[0]).toContain('检测到用户新输入')
    h.clock.advance(30_000)
    expect(h.deliveredTexts()).toHaveLength(1)
    expect(h.agent.followups()).toBe(0)
  })

  it('② stage 立即投；同窗口内再改 = 各投一次（两次代表两个阶段）', async () => {
    const h = harness()
    h.setText('stage', '阶段纪律 v1')
    await h.reconciler.notify(W, 'stage')
    h.clock.advance(0)
    expect(h.deliveredTexts()).toEqual(['阶段纪律 v1'])
    h.setText('stage', '阶段纪律 v2')
    await h.reconciler.notify(W, 'stage')
    h.clock.advance(0)
    expect(h.deliveredTexts()).toEqual(['阶段纪律 v1', '阶段纪律 v2'])
  })

  it('③ task 仍按 30s 合并；冲刷时该段已消失 → **不投已消失的正文**（复核返工口径）', async () => {
    const h = harness()
    h.setText('task', '任务 A')
    await h.reconciler.notify(W, 'task')
    h.clock.advance(0)
    expect(h.deliveredTexts()).toEqual([]) // 30s 窗口未到
    h.clock.advance(24_000)
    h.setText('task', undefined) // 空态：任务块消失
    await h.reconciler.notify(W, 'task')
    h.clock.advance(6_000) // t=30s：到期
    // 复核 P2-1 点名「投出已消失的任务块」是缺陷 ⇒ 到期时重投影发现该段已无内容 → **丢弃待发**。
    expect(h.deliveredTexts()).toEqual([])
    expect(h.diags.join('\n')).toContain('已无内容')
    h.clock.advance(18_000) // t=48s
    h.setText('task', '任务 B')
    await h.reconciler.notify(W, 'task')
    h.clock.advance(30_000)
    expect(h.deliveredTexts()).toEqual(['任务 B'])
  })

  it('④ 空态久留 5 分钟补投一次且不重复（空态窗口仍是 noticeEmptySettleMs）', async () => {
    const h = harness()
    h.setText('task', '任务 A')
    await h.reconciler.notify(W, 'task')
    h.clock.advance(30_000)
    h.setText('task', undefined)
    h.setText('empty', '（空态）')
    await h.reconciler.notify(W, 'task') // 空态起点
    h.clock.advance(LIMITS.noticeEmptySettleMs - 1)
    expect(h.deliveredTexts()).toEqual(['任务 A'])
    h.clock.advance(1)
    expect(h.deliveredTexts()).toEqual(['任务 A', '（空态）'])
    await h.reconciler.notify(W, 'task') // 空态继续 + 再次登记
    h.clock.advance(LIMITS.noticeEmptySettleMs * 2)
    expect(h.deliveredTexts()).toHaveLength(2)
  })

  it('P2-2：空态补投**不被去重路径无限推后**（内容未变 = 零副作用）', async () => {
    const h = harness()
    h.setText('task', undefined)
    h.setText('empty', '（空态）')
    await h.reconciler.notify(W, 'task') // t=0：空态起点
    h.clock.advance(200_000)
    await h.reconciler.notify(W, 'task') // 期间反复"无变化"的登记
    h.clock.advance(50_000)
    await h.reconciler.notify(W, 'task')
    h.clock.advance(50_000) // t=300_000：原定补投时刻
    expect(h.deliveredTexts()).toEqual(['（空态）']) // 一次都没被推后
  })

  it('P2-5：空态文案带阶段判据（非 implementing 不产空态补投）', () => {
    expect(emptyTaskNoticeText('implementing')).toContain('无在制任务')
    for (const stage of ['brainstorming', 'design', 'decomposing', 'accepting', 'draft', 'done']) {
      expect(emptyTaskNoticeText(stage), stage).toBeUndefined()
    }
  })
})

// ── P1-A：覆盖（不靠穷举生产者）──────────────────────────────────────────────

describe('P1-A 覆盖：系统路径（rollup）造成的变更也会被投出，不靠「谁改的谁通知」', () => {
  it('rollup 把 implementing 推到 accepting（**没有窗口可通知**）→ 装配缝扫出差异并投出', async () => {
    const ledger: ReqboardLedger = {
      ...emptyLedger(),
      requirements: [{
        id: 'REQ-roll-1', title: '覆盖剧本', description: '验证无生产者的推进不丢纪律',
        status: 'implementing', category: 'feature', sourceSessionId: W, version: 1,
        createdAt: 1, updatedAt: 1, comments: [],
      } as never],
    }
    const tasks: readonly TaskRecord[] = [mkTaskDone('t-roll-1', 'REQ-roll-1')]
    const facts = (): readonly RequirementFacts[] => ledger.requirements.map(factsOf)
    const contentFor = (windowKey: string, kind: VolatileNoticeKind): VolatileNotice | undefined => {
      const open = openPromptFactsFor(facts(), windowKey)
      const stage = kind === 'stage' ? resolveStageNotice(open) : undefined
      return buildVolatileNotice({ windowKey, open, tasks, stageText: stage?.resolved.text }, kind)
    }
    const h = harness({ contentFor })
    // 起点：先让通道"证明过自己"（一次到达确认 → 头部让位闩成立），此后头部不再装载易变段。
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    h.claimAll()
    expect(h.reconciler.available(W)).toBe(true)

    // ★ 无生产者的推进：直接调 rollup（MoveTask / 看板路由 / verdicts 都走这条代码路径）。
    const changed = applyTaskRollup(ledger, tasks, { now: 2, commentId: () => 'c-1' }, 'REQ-roll-1')
    expect(changed.map(r => r.status)).toContain('accepting')

    // **下一次装配前**：装配缝（available）先扫差异 → 阶段纪律与状态行都必须到尾部。
    const before = h.deliveredTexts().length
    expect(h.reconciler.available(W)).toBe(true) // 同步缝：先补投，再回答让位
    h.clock.advance(0)
    const fresh = h.deliveredTexts().slice(before).join('\n')
    expect(fresh).toContain('accepting') // 状态行
    expect(fresh).toContain('验收') // 阶段纪律（accepting 档）
  })

  it('每窗口头部重写 ≤ 1 次：连续 8 次变更后头部只有一个版本（FR-1 核心判据）', async () => {
    let facts: readonly RequirementFacts[] = [ledgerReq('REQ-head-1', 'implementing', 1)]
    const tasks: readonly TaskRecord[] = [mkTask('t-head-1', 'REQ-head-1', 'in_progress')]
    // 协调层的内容投影必须吃**真 facts**（与组合根同一式）：否则它扫不出差异，头部永远不会让位。
    const h = harness({
      contentFor: (windowKey: string, kind: VolatileNoticeKind): VolatileNotice | undefined => {
        const open = openPromptFactsFor(facts, windowKey)
        const stage = kind === 'stage' ? resolveStageNotice(open) : undefined
        return buildVolatileNotice({ windowKey, open, tasks, stageText: stage?.resolved.text }, kind)
      },
    })
    const spec = await sectionWith(
      { available: (w: string): boolean => h.reconciler.available(w) },
      () => facts, () => tasks,
    )
    const samples: string[] = []
    for (let i = 0; i < 8; i++) {
      // 每次变更都换阶段 + 换在制卡（改造前这是"头部每变一次就重写"的来源）
      facts = [ledgerReq('REQ-head-1', i % 2 === 0 ? 'implementing' : 'design', 1 + i)]
      samples.push(spec.text(CTX))
      h.clock.advance(0) // 让窗口 0 的段（stage / status）冲刷出去
      h.claimAll() // 到达确认
    }
    expect(h.reconciler.available(W)).toBe(true)
    // 头部**版本数**：让位前的回落整段各版不同（它们含易变段），让位后必须**逐字节恒定**。
    const headOnly = samples.filter(s => !s.includes('当前状态：'))
    expect(headOnly.length).toBeGreaterThanOrEqual(6)
    expect(new Set(headOnly).size, '让位后头部只允许一个版本').toBe(1)
    expect(headOnly[headOnly.length - 1]).toBe(headSectionTextFrom(facts, CTX))
    // 回落版本只出现在让位前（每窗口 1 次头部重写）
    expect(samples.filter(s => s.includes('当前状态：')).length).toBeLessThanOrEqual(2)
  })
})

// ── P1-B：回执 = 到达确认 ─────────────────────────────────────────────────────

describe('P1-B 到达确认：送出 ≠ 到达；未确认期间头部继续承载，丢弃即补投', () => {
  it('未 claimed 前 available() 恒 false（头部继续承载）；claimed 后才让位', async () => {
    const h = harness()
    h.setText('status', '状态行 v1')
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    expect(h.agent.delivered).toHaveLength(1)
    expect(h.reconciler.available(W), '只送出、未确认到达 → 不让位').toBe(false)
    h.reconciler.noteClaimed(W, h.agent.delivered[0]!.messageId)
    expect(h.reconciler.available(W)).toBe(true)

    // 与装配缝联动：让位后头部只留绑定关系（未确认的那一段由头部承载）
    h.setText('task', '## 【当前任务执行中】\n\n任务：在制卡')
    const spec = await sectionWith(
      { available: (w: string): boolean => h.reconciler.available(w) },
      () => [FACTS_IMPL], () => [mkTask('t-vol-1', 'REQ-vol-1', 'in_progress')],
    )
    const text = spec.text(CTX)
    expect(text).toContain('本窗口名下有进行中的需求') // 绑定关系与常量块
    expect(text).not.toContain('当前状态：') // 易变段不再进头部
    expect(text).not.toContain('【当前任务执行中】')
  })

  it('被丢弃（用户 stop/cancel）→ 不静默丢：头部继续承载 **或** 下一次协调补投', async () => {
    const h = harness()
    h.setText('status', '状态行 v1')
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    expect(h.agent.delivered).toHaveLength(1)
    h.reconciler.noteDiscarded(W, h.agent.delivered[0]!.messageId) // host: agent/inbox/discarded
    // ① 头部侧：没确认到达 → 不让位（头部承载该段）
    expect(h.reconciler.available(W)).toBe(false)
    // ② 补投侧：下一次协调（装配缝/写路径）重新把它投出去
    h.clock.advance(LIMITS.noticeDebounceMs)
    const resent = h.agent.delivered.slice(1).map(d => textOf(d.message))
    expect(resent, '被丢弃后必须补投，不得两者都无').toContain('状态行 v1')
  })

  it('P2-3 迟滞：连续 N 次未确认才回收头部让位（单次抖动不回收）', async () => {
    const h = harness({ reclaimAfterFailures: LIMITS.noticeReclaimAfterFailures })
    h.setText('status', '状态行 v1')
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    h.claimAll()
    expect(h.reconciler.available(W)).toBe(true)

    // 连续 2 次（< 3）被丢弃 → 仍不让位回收（每轮换内容，免得被去重吞掉）
    for (let i = 0; i < 2; i++) {
      h.setText('status', '状态行 v' + (i + 2))
      await h.reconciler.notify(W, 'status')
      h.clock.advance(LIMITS.noticeDebounceMs)
      const last = h.agent.delivered[h.agent.delivered.length - 1]!
      h.reconciler.noteDiscarded(W, last.messageId)
    }
    expect(h.reconciler.available(W), '抖动不到阈值不回收（避免头部反复重写）').toBe(true)
    // 第 3 次 → 回收（纪律交回头部承载）
    h.setText('status', '状态行 v4')
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    const last = h.agent.delivered[h.agent.delivered.length - 1]!
    h.reconciler.noteDiscarded(W, last.messageId)
    expect(h.reconciler.available(W)).toBe(false)
    expect(h.diags.join('\n')).toContain('回收头部让位')
  })
})

// ── P2-1 / P2-4 ──────────────────────────────────────────────────────────────

describe('P2-1 会话倒挂 / P2-4 摘要强度', () => {
  it('P2-1：直投新内容会作废旧槽——不会在 t=30 又把更旧的正文投出来', async () => {
    const h = harness()
    h.setText('status', '状态 v1')
    await h.reconciler.notify(W, 'status') // 排入 30s 窗口
    h.clock.advance(10_000)
    h.delivery.sendImmediate(W, { kind: 'status', text: '状态 v2' }) // 直投（新内容）
    expect(h.deliveredTexts()).toEqual(['状态 v2'])
    h.clock.advance(20_000) // 原 t=30 到期点
    expect(h.deliveredTexts(), '不许把更旧的状态 v1 后到（倒挂）').toEqual(['状态 v2'])
  })

  it('P2-4：32 位 FNV 撞车的两份正文，在 sha1 摘要下不再被判成「内容未变」', async () => {
    // 实测撞车对（FNV-1a 32 位 = f1530600）：摘要仍是 32 位时，第二份会被静默吞掉（纪律丢失）。
    const a = '状态行 vo11 · 任务块 dy65n9'
    const b = '状态行 v10qb · 任务块 jb7hmr'
    expect(noticeHash(a)).toBe(noticeHash(b)) // 自证风险：缺省 32 位确实会撞
    expect(noticeHash(a, sha1)).not.toBe(noticeHash(b, sha1)) // 注入 sha1 后不再撞

    const h = harness({ hashOf: sha1 })
    h.setText('status', a)
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    h.setText('status', b)
    await h.reconciler.notify(W, 'status')
    h.clock.advance(LIMITS.noticeDebounceMs)
    expect(h.deliveredTexts()).toEqual([a, b]) // 两份都投出（32 位下只会投第一份）
    // 源码级：组合根把 sha1 注进来了（不是"打算"而已）
    expect(readSrc('index.ts')).toContain("createHash('sha1').update(canonical).digest('hex')")
  })
})

// ── ③ 常量落点 / ⑥ 分槽 / ⑦ 降级 ────────────────────────────────────────────

describe('③ 常量落点 / ⑥ 分槽去抖 / ⑦ 降级归属实现侧', () => {
  it('③ LIMITS 落 30s；volatile-notice 的常量只是引用它', () => {
    expect(LIMITS.noticeDebounceMs).toBe(30_000)
    expect(VOLATILE_NOTICE_DEBOUNCE_MS).toBe(LIMITS.noticeDebounceMs)
    expect(readSrc('application/internal/volatile-notice.ts'))
      .toContain('export const VOLATILE_NOTICE_DEBOUNCE_MS = LIMITS.noticeDebounceMs')
    expect(readSrc('domain/limits.ts')).toContain('16s / 24s / 71s')
  })

  it('⑥ pickDebounced 是 kind→slot 映射：交替 kind 不重置同一槽的窗口', () => {
    const slots = pickDebounced(new Map(), { kind: 'status', text: 's1' }, 1_000, LIMITS.noticeDebounceMs)
    const two = pickDebounced(slots, { kind: 'task', text: 't1' }, 1_500, LIMITS.noticeDebounceMs)
    expect(two.get('status')!.since).toBe(1_000) // 交替 kind 不重置 status 槽
    const overwritten = pickDebounced(two, { kind: 'status', text: 's2' }, 2_000, LIMITS.noticeDebounceMs)
    expect(overwritten.get('status')!.since).toBe(1_000) // 窗口内最后一次胜出，起点不刷新
    expect(overwritten.get('status')!.notice.text).toBe('s2')
    expect(overwritten.get('status')!.updatedAt).toBe(2_000)
    expect(overwritten.get('task')!.since).toBe(1_500)
    expect(pickDebounced(overwritten, { kind: 'status', text: 's3' }, 40_000, 30_000).get('status')!.since).toBe(40_000)
    expect(slots.size).toBe(1) // 入参表不被改写（纯函数）
  })

  it('⑦ 降级归属实现侧：通道不可得 → 退回头部 + InjectionLog + 诊断，且**不算到达**', async () => {
    const h = harness({ agents: (): unknown => undefined }) // 窗口不在线
    h.setText('stage', '## 实施阶段纪律\n\n按卡执行。')
    const receipt = await h.reconciler.notify(W, 'stage')
    expect(receipt).toEqual({
      delivered: true, channel: 'system-prompt-fallback', reason: expect.stringContaining('不在线'),
    })
    expect(h.logs.map(l => [l.origin, l.delivered])).toEqual([['system-prompt', true]])
    expect(h.logs[0]!.text).toContain('按卡执行')
    expect(h.clock.pendingTimers()).toBe(0) // 未就绪不排定时器
    expect(h.reconciler.available(W), '降级不算到达').toBe(false)
    expect(h.diags.join('\n')).toContain('退回头部')
  })
})

// ── ⑧ 端口字段 / ⑨ 永不抛 / ⑩ 扫描面 ────────────────────────────────────────

describe('⑧ 端口字段 / ⑨ 永不抛 / ⑩ 扫描面与钩子额度', () => {
  it('⑧ UseCaseDeps 补可选 volatileNotice（形状就是 VolatileNoticePort）', () => {
    expectTypeOf<'volatileNotice' extends keyof UseCaseDeps ? true : false>().toEqualTypeOf<true>()
    expectTypeOf<UseCaseDeps['volatileNotice']>().toEqualTypeOf<VolatileNoticePort | undefined>()
    expectTypeOf<keyof VolatileNoticePort>().toEqualTypeOf<'notify'>()
    expect(readSrc('application/ports.ts')).toContain('volatileNotice?: VolatileNoticePort')
  })

  it('⑨ 永不抛：投递器抛错 / 判定抛错 / 投影抛错 / 端口违约都不冒泡', async () => {
    const throwingSink: NoticeDeliverySink = {
      canDeliver: () => true,
      deliver: () => { throw new Error('deliver boom') },
    }
    const h = harness({ sink: throwingSink })
    h.setText('status', '状态行')
    await expect(h.reconciler.notify(W, 'status')).resolves.toMatchObject({ channel: 'inbox-next-step' })
    expect(() => { h.clock.advance(LIMITS.noticeDebounceMs) }).not.toThrow()
    expect(h.reconciler.available(W)).toBe(false)
    expect(h.logs.map(l => l.delivered)).toEqual([false])

    const throwingProbe: NoticeDeliverySink = {
      canDeliver: () => { throw new Error('probe boom') },
      deliver: () => ({ ok: true, messageId: 'x' }),
    }
    const h2 = harness({ sink: throwingProbe })
    h2.setText('status', '状态行')
    await expect(h2.reconciler.notify(W, 'status')).resolves.toMatchObject({ channel: 'system-prompt-fallback' })

    const boom = harness({ contentFor: () => { throw new Error('projection boom') } })
    await expect(boom.reconciler.notify(W, 'status')).resolves.toMatchObject({ delivered: false })
    expect(boom.diags.join('\n')).toContain('projection boom')

    const throwsOnCall: VolatileNoticePort = { notify: () => { throw new Error('port boom') } }
    expect(() => notifyVolatileQuietly(throwsOnCall, W, 'task')).not.toThrow()
    await Promise.resolve()
  })

  it('⑩ 抖动的钩子不放大投递：同一回合的装配缝扫描只算一次，回合末开启新额度', async () => {
    const h = harness()
    h.setText('stage', '阶段纪律 v1')
    expect(h.reconciler.available(W)).toBe(false)
    h.clock.advance(0)
    expect(h.agent.delivered).toHaveLength(1)
    h.setText('stage', '阶段纪律 v2')
    h.reconciler.available(W) // 同一回合内再扫（额度已用）
    h.reconciler.available(W)
    h.clock.advance(0)
    expect(h.agent.delivered, '同回合内钩子抖动不得再投').toHaveLength(1)
    h.reconciler.noteTurnEnded(W) // 回合末：推进额度并扫一次
    h.clock.advance(0)
    expect(h.deliveredTexts()).toEqual(['阶段纪律 v1', '阶段纪律 v2'])
  })

  it('⑩ 源码级：投递路径没有 followup / deliver（定时器回调里不得起 agent loop）', () => {
    for (const rel of [
      'application/internal/notice-delivery.ts',
      'application/internal/notice-reconciler.ts',
      'adapters/VolatileNoticeAdapter.ts',
    ]) {
      const code = readSrc(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
      expect(code, rel).not.toMatch(/\.followup\s*\(/)
      expect(code, rel).not.toMatch(/\.deliverMessage\s*\(/)
    }
  })
})

// ── ⑤ capture 生产者 / ⑪ 增量有界 ────────────────────────────────────────────

describe('⑤ capture 生产者 / ⑪ 增量有界', () => {
  it('⑤ 登记命中处（写路径）真的接了生产者——只加扫描目标，不改既有断言', () => {
    expect(readSrc('application/dive/session-driver.ts'))
      .toContain("notifyVolatileQuietly(deps.volatileNotice?.(), windowKey, 'capture')")
  })

  it('⑪ 投递只带本段：正文 = 该段本身（不含头部常量块），且整段回落比它大得多', async () => {
    const h = harness()
    h.setText('stage', STAGE_TEXT)
    await h.reconciler.notify(W, 'stage')
    h.clock.advance(0)
    const delivered = h.deliveredTexts()[0]!
    expect(delivered).toBe(STAGE_TEXT)
    const wholeFallback = await assemblyText(h)
    expect(wholeFallback).toContain('流水线（状态就是阶段')
    expect(delivered).not.toContain('流水线（状态就是阶段')
    // **有意义的**有界断言（不是恒真）：增量 = 这一段，且严格小于整段回落（不含头部常量块）。
    expect(delivered.length).toBeLessThan(wholeFallback.length)
    expect(Math.ceil(delivered.length / 4)).toBeLessThan(Math.ceil(wholeFallback.length / 4))
  })
})

// ── 装配缝夹具（走真实注册点 gate-wiring）────────────────────────────────────

interface SectionSpec { text: (context: unknown) => string }

async function sectionWith(
  channel: { available: (windowKey: string) => boolean },
  factsRef: () => readonly RequirementFacts[],
  tasksRef: () => readonly TaskRecord[],
): Promise<SectionSpec> {
  let spec: SectionSpec | undefined
  const fakeCtx = {
    inject: (_services: string[], cb: (c: unknown) => void) => {
      cb({ effect: (fn: () => void) => { fn() }, systemPrompt: { section: (s: never) => { spec = s; return (): void => {} } } })
    },
  }
  registerCaptureGuidance(fakeCtx as unknown as Context, {
    disposers: [],
    requirementStore: { peekFacts: () => factsRef() } as unknown as RequirementStore,
    pendingCapture: new Map(),
    injectionLog: { record: (): void => {} } as never,
    taskStore: {
      listAll: async () => tasksRef(),
      subscribe: () => (): void => {},
    } as unknown as TaskStore,
    logger: { info: (): void => {}, warn: (): void => {} },
    plugin: 'test',
    sectionName: 'reqboard:capture', sectionOrder: 10,
    onSystemPrompt: (): void => {},
    volatileChannel: channel,
  })
  await Promise.resolve(); await Promise.resolve()
  if (spec === undefined) throw new Error('section 未注册')
  return spec
}

/** 通道不让位时的整段回落文本（对照用）。 */
async function assemblyText(h: Harness): Promise<string> {
  h.setText('status', '- REQ-vol-1 当前状态：implementing')
  h.setText('task', '## 【当前任务执行中】\n\n任务：在制卡')
  const spec = await sectionWith(
    { available: (): boolean => false }, // 显式"不让位" → 回落整段
    () => [FACTS_IMPL], () => [mkTask('t-vol-1', 'REQ-vol-1', 'in_progress')],
  )
  return spec.text(CTX)
}

// ── 夹具 ────────────────────────────────────────────────────────────────────

const STAGE_TEXT = '## 实施阶段纪律\n\n按卡执行；完成后 reqboard_task_report 汇报，再 reqboard_task_move 推进。'

const FACTS_IMPL: RequirementFacts = {
  id: 'REQ-vol-1',
  title: '易变段尾部投递',
  description: '把易变段从头部搬到尾部',
  status: 'implementing',
  category: 'feature',
  updatedAt: 100,
  version: 1,
  sourceSessionId: W,
  artifacts: [],
}

function mkTask(id: string, requirementId: string, status: string): TaskRecord {
  return {
    id,
    requirementId,
    title: '在制卡',
    description: '说明',
    context: '背景',
    acceptance: '验收',
    phase: 'implement',
    side: 'backend',
    dependsOn: [],
    status,
  } as unknown as TaskRecord
}

function mkTaskDone(id: string, requirementId: string): TaskRecord {
  return mkTask(id, requirementId, 'done')
}

function ledgerReq(id: string, status: string, updatedAt: number): RequirementFacts {
  return {
    id, title: '头部只重写一次', description: '连续变更不重写头部',
    status: status as RequirementFacts['status'], category: 'feature', sourceSessionId: W,
    version: updatedAt, updatedAt, artifacts: [],
  }
}
