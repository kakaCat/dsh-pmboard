/**
 * 头部/易变分层稳定性（REQ-261007100513-6749 t2 · FR-1 / FR-2 ← design/architecture.md
 * §头部/尾部分层判据、design/backend.md §S-1）。
 *
 * 为什么要有这份用例：本卡的全部收益来自一条**可机械断言的**性质——头部只由窗口绑定关系决定，
 * 阶段推进（brainstorming→design）与在制卡切换都**不得**改动它一个字节；否则前缀缓存又被整段
 * 重写，"16 个版本、3.9M 全价未命中"的事故原样复发。
 *
 * 四条断言（对应卡上验收）：
 *  ① 同一 (facts, tasks) 两次调用头部组装 → 逐字节相等；
 *  ② 需求 status 由 brainstorming 改 design、在制卡换成另一张 → 头部仍逐字节相等；
 *  ③ 尾部通道可用注入下，`section.text` 整段文本在这些变化前后逐字节相等（= 只回头部）；
 *     通道不可用（缺省）下，整段文本仍含阶段纪律与状态行（= 纪律没丢，回落是安全底线）；
 *  ④ 头部长度 ≤ 改造前同条件长度（同 fixture 实测 4919，见下方常量）。
 */
import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import {
  boundSectionTextFrom,
  capturePromptForMessage,
  headSectionTextFrom,
  volatileSectionTextFrom,
} from '../src/application/internal/capture-section.js'
import {
  noticeHash,
  pickDebounced,
  type VolatileNotice,
} from '../src/application/internal/volatile-notice.js'
import { registerCaptureGuidance } from '../src/gate-wiring.js'
import { resolveStagePrompt } from '../src/domain/prompt/index.js'
import type { RequirementFacts } from '../src/domain/requirement/RequirementSummary.js'
import type { RequirementStore, TaskStore } from '../src/application/ports.js'
import type { InjectionLogFile } from '../src/adapters/InjectionLogFile.js'
import type { TaskRecord } from '../src/shared/protocol.js'

// ── 夹具（**与改造前实测长度同条件**：下文 PRE_CHANGE_SECTION_LEN 就是拿这套 fixture
//    在改造前的 boundSectionTextFrom 上量出来的）────────────────────────────────────
const W = 'session-stability-1'
const CTX = { agent: { id: W } }

const REQ_TITLE = '稳定头部'
const REQ_DESC = '把易变内容移出 system prompt 头部'

function facts(status: RequirementFacts['status'], updatedAt: number): RequirementFacts {
  return {
    id: 'REQ-stab-1',
    title: REQ_TITLE,
    description: REQ_DESC,
    status,
    category: 'feature',
    updatedAt,
    version: 1,
    sourceSessionId: W,
    artifacts: [],
  }
}

function task(id: string, title: string): TaskRecord {
  return {
    id,
    requirementId: 'REQ-stab-1',
    title,
    description: `说明-${id}`,
    context: `背景-${id}`,
    acceptance: `验收-${id}`,
    phase: 'implement',
    side: 'backend',
    dependsOn: [],
    status: 'in_progress',
  } as unknown as TaskRecord
}

const FACTS_BRAINSTORMING = [facts('brainstorming', 100)]
const FACTS_DESIGN = [facts('design', 200)]
// 「当前任务执行中」块的前提是**需求处于 implementing**（改造前口径：`open.find(isImplementing)`）
// ——故"在制卡换张"这一路必须在 implementing 夹具上验，否则块根本不渲染。
const FACTS_IMPL_甲 = [facts('implementing', 100)]
const FACTS_IMPL_乙 = [facts('implementing', 200)]
const TASKS_甲 = [task('t-stab-1', '在制卡甲')]
const TASKS_乙 = [task('t-stab-2', '在制卡乙')]

/**
 * 改造前同条件长度：改造前实现（`boundSectionTextFrom` = 单个大段，含状态行 + 任务块 + 阶段纪律
 * + 常量块）在本 fixture 上的返回值长度，实测 4919（t2 开工前用 `npx tsx` 直接量得）。
 * 头部必须 ≤ 这个数——它是"把易变内容搬出头部"这件事的**唯一可量化证据**。
 */
const PRE_CHANGE_SECTION_LEN = 4919

// ── section 装配夹具（走真实注册点 gate-wiring，验的才是"进会话的那段文本"）──────────
interface SectionSpec {
  name: string
  order: number
  interpolate?: boolean
  text: (context: unknown) => string
}

interface AssembleOptions {
  facts: readonly RequirementFacts[]
  tasks: readonly TaskRecord[]
  /** 易变段尾部通道；**不传 = 未装配 = 不可用**（缺省口径）。 */
  channel?: { available: (windowKey: string) => boolean }
  /** 本窗口待捕获候选（确定性消息 hook 登记的那张表）。缺省 = 空表（未命中）。 */
  pending?: { windowKey: string; text: string; capturedAt: number }
}

async function assembleSection(options: AssembleOptions): Promise<SectionSpec> {
  let spec: SectionSpec | undefined
  const disposers: Array<() => void> = []
  const systemPrompt = {
    section: (s: SectionSpec) => { spec = s; return () => { /* unregister */ } },
  }
  const fakeCtx = {
    inject: (_services: string[], cb: (c: unknown) => void) => {
      cb({ effect: (fn: () => void) => { fn() }, systemPrompt })
    },
  }
  registerCaptureGuidance(fakeCtx as unknown as Context, {
    disposers,
    requirementStore: { peekFacts: () => options.facts } as unknown as RequirementStore,
    pendingCapture: new Map(
      options.pending === undefined ? [] : [[options.pending.windowKey, options.pending]],
    ),
    injectionLog: { record: () => { /* 留痕口：本用例只验正文 */ } } as unknown as InjectionLogFile,
    taskStore: {
      listAll: async () => options.tasks,
      subscribe: () => () => { /* unsubscribe */ },
    } as unknown as TaskStore,
    logger: { info: () => { /* quiet */ }, warn: () => { /* quiet */ } },
    plugin: 'test',
    sectionName: 'reqboard:capture',
    sectionOrder: 10,
    onSystemPrompt: () => { /* 不消费 */ },
    ...(options.channel === undefined ? {} : { volatileChannel: options.channel }),
  })
  // 任务快照是**异步**刷新（`listAll().then(...)`）：这里放行微任务队列，让缓存落到已加载态
  // （否则三态第一态 `undefined` 会整体略过任务块，用例就验不到"任务切换"这一路）。
  await Promise.resolve()
  await Promise.resolve()
  if (spec === undefined) throw new Error('capture guidance section 未注册')
  return spec
}

describe('头部稳定性（t2 的核心性质）', () => {
  it('① 同一 (facts, tasks) 两次调用头部组装 → 逐字节相等', () => {
    const first = headSectionTextFrom(FACTS_BRAINSTORMING, CTX)
    const second = headSectionTextFrom(FACTS_BRAINSTORMING, CTX)
    expect(second).toBe(first)
    expect(first.length).toBeGreaterThan(0)
  })

  it('② 阶段推进（brainstorming→design）+ 在制卡换张 → 头部仍逐字节相等', () => {
    const before = headSectionTextFrom(FACTS_BRAINSTORMING, CTX)
    expect(headSectionTextFrom(FACTS_DESIGN, CTX)).toBe(before)
    expect(headSectionTextFrom(FACTS_IMPL_甲, CTX)).toBe(before)
    expect(headSectionTextFrom(FACTS_IMPL_乙, CTX)).toBe(before)
    // 反向证明：头部里**不许**出现状态行/任务块/阶段纪律正文——否则上面的相等就是恒真装饰
    // （注意：常量块正文里合法地提到阶段名 brainstorming / design，故只禁"状态行"与"阶段纪律正文"）
    expect(before).not.toContain('当前状态：')
    expect(before).not.toContain('【当前任务执行中】')
    expect(before).not.toContain('t-stab-1')
    expect(before).not.toContain(stageText('brainstorming'))
    expect(before).not.toContain(stageText('design'))
  })

  it('③-a 尾部通道可用 → section.text 在状态/任务变化前后逐字节相等（只回头部）', async () => {
    const channel = { available: () => true }
    const specBefore = await assembleSection({ facts: FACTS_BRAINSTORMING, tasks: TASKS_甲, channel })
    const before = specBefore.text(CTX)
    // 一次变到底：需求 status brainstorming→design，同时在制卡换成另一张
    const specAfter = await assembleSection({ facts: FACTS_DESIGN, tasks: TASKS_乙, channel })
    const after = specAfter.text(CTX)
    expect(after).toBe(before)
    expect(before).toBe(headSectionTextFrom(FACTS_BRAINSTORMING, CTX))
    // 通道可用 = 易变段不在头部（它们由尾部通道投递，t3 落地）
    expect(before).not.toContain('当前状态：')
    expect(before).not.toContain('【当前任务执行中】')
    // 既有事故的防线不动：段文本仍是**字面量**（宿主不扫描 {{变量}}）
    expect(specBefore.interpolate).toBe(false)
  })

  it('③-b 通道不可用（缺省 / 显式 false）→ 整段文本仍含阶段纪律与状态行（纪律没丢）', async () => {
    const defaultSpec = await assembleSection({ facts: FACTS_IMPL_甲, tasks: TASKS_甲 })
    const defaultText = defaultSpec.text(CTX)
    const falseSpec = await assembleSection({
      facts: FACTS_IMPL_甲, tasks: TASKS_甲, channel: { available: () => false },
    })
    expect(falseSpec.text(CTX)).toBe(defaultText)

    // 阶段纪律（≈3.3K tok，头部重写的主要来源）仍在
    expect(defaultText).toContain(stageText('implementing'))
    // 看板状态行仍在（id + 状态；标题不重复——评审 R3）
    expect(defaultText).toContain('- REQ-stab-1 当前状态：implementing')
    // 当前任务块仍在（含卡 id——它随任务切换变，故属易变）
    expect(defaultText).toContain('【当前任务执行中】')
    expect(defaultText).toContain('t-stab-1')
    // 评审 R3：状态行**紧跟需求清单**，不被常量块推到后面
    const listAt = defaultText.indexOf(`- REQ-stab-1《${REQ_TITLE}》`)
    const statusAt = defaultText.indexOf('- REQ-stab-1 当前状态：implementing')
    expect(listAt).toBeGreaterThanOrEqual(0)
    expect(statusAt).toBeGreaterThan(listAt)
    expect(statusAt).toBeLessThan(defaultText.indexOf('流水线（状态就是阶段'))
    // 评审 R4-②：回落路径不出现重复需求行（同一 id + 标题只出现一次）
    expect(occurrences(defaultText, `REQ-stab-1《${REQ_TITLE}》`)).toBe(1)
    expect(occurrences(defaultText, '当前状态：')).toBe(1)
    expect(headSectionTextFrom(FACTS_IMPL_甲, CTX)).toBe(headSectionTextFrom(FACTS_BRAINSTORMING, CTX))
  })

  it('⑤ 未绑定 × 待捕获命中 → 整段 = 命中提示（静态引导让位；评审 R1 / R4-①）', async () => {
    const msg = '帮我加一个告警中心页面，把市场告警做成可视化看板'
    const hit = await assembleSection({ facts: [], tasks: [], pending: { windowKey: W, text: msg, capturedAt: 1 } })
    const text = hit.text(CTX)
    // **替换**语义（= 改造前口径）：整段就是命中提示，不叠静态引导
    expect(text).toBe(capturePromptForMessage(W, msg))
    expect(text.length).toBe(capturePromptForMessage(W, msg).length)
    // 静态引导的独有句不在场（否则就是同屏叠加）
    expect(text).not.toContain('未绑定需求')
    expect(text).not.toContain('可以选"不需要"')
    expect(text).toContain('本回合你必须先做一次显式裁定')
    // 未命中 → 静态引导（原口径不变）
    const noHit = await assembleSection({ facts: [], tasks: [] })
    expect(noHit.text(CTX)).toContain('未绑定需求')
    expect(noHit.text(CTX)).not.toContain('检测到用户新输入')
  })

  it('⑥ 通道可用性判定抛错 → 按不可用处理（回落整段，不炸装配；评审 R2）', async () => {
    const thrower = await assembleSection({
      facts: FACTS_IMPL_甲, tasks: TASKS_甲,
      channel: { available: () => { throw new Error('channel boom') } },
    })
    const fallback = await assembleSection({ facts: FACTS_IMPL_甲, tasks: TASKS_甲 })
    expect(thrower.text(CTX)).toBe(fallback.text(CTX)) // 抛错 = 不可用（安全侧：纪律照投）
    expect(thrower.text(CTX)).toContain(stageText('implementing'))
  })

  it('④ 头部长度 ≤ 改造前同条件长度（同 fixture 实测）', () => {
    const head = headSectionTextFrom(FACTS_BRAINSTORMING, CTX)
    expect(head.length).toBeLessThanOrEqual(PRE_CHANGE_SECTION_LEN)
    // 与"头部 + 易变段"的同条件全文对比：头部只是其中一小截（常量块 + 绑定关系）
    expect(head.length).toBeLessThan(boundSectionTextFrom(FACTS_BRAINSTORMING, TASKS_甲, CTX).length)
  })
})

describe('易变段组装（走 volatile-notice）', () => {
  it('未绑定窗口产出待捕获提示；已绑定窗口产出状态/任务/阶段三类', () => {
    const unbound = volatileSectionTextFrom([], undefined, CTX, {
      pending: { windowKey: W, text: '帮我加一个告警中心页面', capturedAt: 1 },
    })
    expect(unbound).toContain('检测到用户新输入')
    expect(unbound).toContain('帮我加一个告警中心页面')

    const bound = volatileSectionTextFrom(FACTS_IMPL_甲, TASKS_甲, CTX)
    expect(bound).toContain('- REQ-stab-1 当前状态：implementing')
    expect(bound).toContain('【当前任务执行中】')
    expect(bound).toContain(stageText('implementing'))
  })

  it('在制卡换张 → 易变段随之改变（易变段承担变化，头部不承担）', () => {
    const a = volatileSectionTextFrom(FACTS_IMPL_甲, TASKS_甲, CTX)
    const b = volatileSectionTextFrom(FACTS_IMPL_乙, TASKS_乙, CTX)
    expect(b).not.toBe(a)
    expect(b).toContain('t-stab-2')
    expect(b).not.toContain('t-stab-1')
  })

  it('noticeHash：规范化后同一内容同一哈希（排版差异不各算一份）', () => {
    const base = '状态行\n任务块'
    expect(noticeHash('状态行\r\n任务块  \n\n')).toBe(noticeHash(base))
    expect(noticeHash(base)).toMatch(/^[0-9a-f]{8}$/)
    expect(noticeHash(`${base}\n多了内容`)).not.toBe(noticeHash(base))
  })

  it('pickDebounced：分槽去抖（窗口内最后一次胜出，since 不刷新；到期/换槽重开窗口）', () => {
    // t3 起 pickDebounced 是**分槽**形态（入参/出参都是 kind→槽 的映射）：断言语义与 t2 逐条相同，
    // 只是每次多取一步 `slots.get(kind)`。
    const first: VolatileNotice = { kind: 'status', text: '第一态' }
    const second: VolatileNotice = { kind: 'status', text: '第二态' }
    const inWindow = pickDebounced(new Map(), first, 1_000, 2_000).get('status')!
    expect(inWindow.since).toBe(1_000)
    const overwritten = pickDebounced(new Map([['status', inWindow]]), second, 1_500, 2_000).get('status')!
    expect(overwritten.notice.text).toBe('第二态') // 最后一次胜出
    expect(overwritten.since).toBe(1_000) // 窗口起点不因覆盖而刷新（否则永不到期 = 永不投递）
    expect(overwritten.updatedAt).toBe(1_500)

    const expired = pickDebounced(new Map([['status', overwritten]]), first, 3_000, 2_000).get('status')!
    expect(expired.since).toBe(3_000)

    const other: VolatileNotice = { kind: 'task', text: '任务块' }
    const independent = pickDebounced(new Map([['status', overwritten]]), other, 1_600, 2_000)
    expect(independent.get('task')!.since).toBe(1_600) // 不同槽不互相吞
    expect(independent.get('status')!.since).toBe(1_000) // 且**不重置别的槽**的窗口（t3 验收 ⑥）
    expect(independent.get('task')!.notice.kind).toBe('task')

    const noDebounce = pickDebounced(new Map([['status', inWindow]]), second, 1_001, 0).get('status')!
    expect(noDebounce.since).toBe(1_001) // 窗口 0 = 显式关闭去抖
  })
})

/** 子串出现次数（评审 R4-② 的"不重复列出"判据）。 */
function occurrences(text: string, needle: string): number {
  let count = 0
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + needle.length)) count++
  return count
}

/** 阶段纪律正文（与生产同一取词入口；不钉死措辞，措辞随分片演进）。 */
function stageText(stage: 'brainstorming' | 'design' | 'implementing'): string {
  return resolveStagePrompt({
    stage,
    category: 'feature',
    requirement: { title: REQ_TITLE, description: REQ_DESC },
  }).text
}
