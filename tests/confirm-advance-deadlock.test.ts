/**
 * 确认门推进回归（REQ-261006094052-1da2 t4 · serves: FR-1, FR-2, FR-3）
 *
 * 缺陷现场（来源需求 REQ-261006092213-4f5b）：产物**已落章**、需求仍停在 brainstorming，
 * 再调 `reqboard_ask_confirm` 命中 `alreadyConfirmed` 早退分支后只跑闸门、**从不推进**
 * （返回 `confirmed:true / advanced:false`），而 `reqboard_move` 被人工门拒 ⇒ agent 无路可走。
 *
 * 本文件的判据（逐条对 requirement.md 的 A1~A3）：
 *  - TC-1 已落章 + 闸门全过 ⇒ `advanced:true`，且**台账读回**真的前进（A1）；
 *  - TC-2 闸门不过 ⇒ `gate_failure` 且状态不变（A2）；
 *  - TC-3 无下一阶段 / TC-4 `advance:false` ⇒ 不推进、不静默（A2 的边界）；
 *  - TC-5 UI 需求缺原型 ⇒ 自动确认**不弹**且给出可执行 reason；TC-7 非 UI 照弹（A3）；
 *  - TC-6 原型豁免生效后重发 ⇒ 推进（A3 的闭合：死锁链在产物补齐后真的能走通）。
 *
 * 断言纪律：状态一律**读回台账**（本缺陷的形态就是「返回体说 confirmed、台账没动」）；
 * 闸门用例断言 `gate_failure.code` 的**具体值**（否则任何门都能冒充）。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { defineAskConfirmTool, toUseCaseDeps } from './helpers/tool-deps.js'
import { triggerAutoConfirm } from '../src/application/internal/auto-confirm.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-deadlock-01'
const REQ = 'REQ-1da2f0'
const REQ_DIR = 'docs/requirements/' + REQ
const REQ_MD = REQ_DIR + '/requirement.md'
const ASK_ARGS = { target: 'artifact', kind: 'requirement', question: '需求文档已提交，请确认进入设计阶段', options: ['确认推进', '需要修改'] }

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-advance-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** 需求文档：`sides` 决定原型门是否适用；`dx` 决定裁定门是否过得去（feature 需求必判）。 */
function writeReqDoc(opts: { sides: readonly string[]; dx?: boolean; exempt?: string }): void {
  const fm = ['---', 'req: ' + REQ, 'sides: [' + opts.sides.join(', ') + ']']
  if (opts.exempt !== undefined) fm.push('prototype_exempt: ' + opts.exempt)
  fm.push('---')
  const body = [
    '', '# 需求说明', '',
    '## 边界（不做）', '', '不做范围外的事。', '',
    '## 产品定义', '', 'x', '',
    '## 用户与角色', '', 'x', '',
    '## 功能点（需求条款）', '', '### FR-1: 甲', '', 'x', '',
  ]
  if (opts.dx === true) {
    body.push(
      '## 讨论与裁定记录（D-x）', '',
      '| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |',
      '|---|---|---|---|---|',
      '| D-1 | 交接底稿：「已落章未推进」 | 闸门全过即兑现推进 | FR-1 | A1 |', '',
    )
  }
  mkdirSync(join(dir, REQ_DIR), { recursive: true })
  writeFileSync(join(dir, REQ_MD), fm.concat(body).join('\n'))
}

const confirmedReqArtifact = (): StageArtifact => ({
  stage: 'brainstorming', kind: 'requirement', path: REQ_MD,
  registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
  confirmedAt: 1, confirmedBy: { kind: 'human' },
}) as StageArtifact

const registeredPrototypeArtifact = (): StageArtifact => ({
  stage: 'brainstorming', kind: 'prototype', path: REQ_DIR + '/prototypes/detail.html',
  registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
}) as StageArtifact

/**
 * 未落章的需求产物：**门真的开着**（REQ-261006164732-6503 t3 新增）。
 *
 * 为什么需要它：修前"照不照弹"只看前置预判——产物已落章也照样弹（弹了再由 AskConfirm 早退）；
 * 修后自动弹先经建门唯一入口，已落章 ⇒ `already-settled`，不弹（新语义见 TC-7b）。
 * 所以 TC-7 要证明"非 UI 需求照弹"，必须给它一个**真的待答**的门。
 */
const openReqArtifact = (): StageArtifact => ({
  stage: 'brainstorming', kind: 'requirement', path: REQ_MD,
  registeredAt: 1, registeredBy: { kind: 'agent', sessionId: W },
}) as StageArtifact

function record(status: string, artifacts: StageArtifact[]): RequirementRecord {
  return {
    id: REQ, title: '确认门推进基线', description: '', category: 'feature',
    status, blocked: false, sourceSessionId: W,
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    artifacts,
  } as unknown as RequirementRecord
}

async function seed(r: RequirementRecord): Promise<void> {
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

const askTool = () => defineAskConfirmTool({
  store, now: () => 1000, workspaceRoot: dir,
  userQuestions: () => ({ ask: async () => ({ answers: [{ id: 'confirm', selected: ['确认推进'] }] }) }),
} as never) as never as { execute: (a: unknown, e: unknown) => Promise<any> }

const commentsOf = (): string => (store.peek(REQ)?.comments ?? []).map((c) => c.body).join('\n')

describe('A1/A2 · 已落章的确认门重发', () => {
  it('TC-1 闸门全过 ⇒ advanced:true，且台账状态真的前进（不是只改返回体）', async () => {
    writeReqDoc({ sides: ['backend'], dx: true })
    await seed(record('brainstorming', [confirmedReqArtifact()]))

    const out = await run(askTool(), ASK_ARGS)

    expect(out.success).toBe(true)
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(true)
    expect(out.from).toBe('brainstorming')
    expect(out.to).toBe('design')
    expect(out.note).toContain('未重复弹框')
    expect(out.note).toContain('已自动推进')
    // 读回台账（本缺陷的形态：返回体说 confirmed、台账没动）
    expect(store.peek(REQ)?.status).toBe('design')
    // StatusEvent 的字段名是 status（不是 to）——见 src/shared/protocol.ts:127
    expect(store.peek(REQ)?.statusHistory?.map((h) => h.status)).toContain('design')
    expect(commentsOf()).toContain('[自动推进] brainstorming → design')
  })

  it('TC-2 闸门不过 ⇒ advanced:false + gate_failure（点名具体 code），状态不变', async () => {
    writeReqDoc({ sides: ['backend'], dx: false }) // 缺「讨论与裁定记录（D-x）」节 ⇒ 裁定门拦
    await seed(record('brainstorming', [confirmedReqArtifact()]))

    const out = await run(askTool(), ASK_ARGS)

    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(false)
    expect(out.gate_failure?.code).toBe('decision_log_missing')
    expect(out.note).toContain('未推进')
    expect(store.peek(REQ)?.status).toBe('brainstorming')
  })

  it('TC-3 无可自动推进的下一阶段 ⇒ 不推进、也不报假缺口', async () => {
    writeReqDoc({ sides: ['backend'], dx: true })
    await seed(record('accepting', [confirmedReqArtifact()]))

    const out = await run(askTool(), ASK_ARGS)

    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(false)
    expect(out.gate_failure).toBeUndefined()
    expect(out.note).toContain('未重复弹框')
    expect(store.peek(REQ)?.status).toBe('accepting')
  })

  it('TC-4 advance:false ⇒ 明确不推进（人的开关优先于闸门）', async () => {
    writeReqDoc({ sides: ['backend'], dx: true })
    await seed(record('brainstorming', [confirmedReqArtifact()]))

    const out = await run(askTool(), { ...ASK_ARGS, advance: false })

    expect(out.advanced).toBe(false)
    expect(store.peek(REQ)?.status).toBe('brainstorming')
  })
})

describe('A3 · 首轮自动确认不制造注定失败的确认门', () => {
  const autoDeps = () => toUseCaseDeps({
    store, now: () => 1000, workspaceRoot: dir,
    userQuestions: () => ({ ask: async () => ({ answers: [{ id: 'confirm', selected: ['确认推进'] }] }) }),
  } as never)

  it('TC-5 UI 需求缺原型 ⇒ 不弹框，reason 给出可执行的下一步（原型目录 + 登记命令）', async () => {
    writeReqDoc({ sides: ['frontend'], dx: true })
    await seed(record('brainstorming', [confirmedReqArtifact()]))

    const out = await triggerAutoConfirm(
      autoDeps(),
      { requirementId: REQ, target: 'artifact', kind: 'requirement', question: '确认进入设计？' },
      { agent: { id: W } },
    )

    expect(out.triggered).toBe(false)
    expect(out.reason).toContain(REQ_DIR + '/prototypes/')
    expect(out.reason).toContain('reqboard_submit(kind=prototype)')
  })

  it('TC-7 非 UI 需求（sides 不含 frontend）⇒ 照弹，窄口径不越界', async () => {
    writeReqDoc({ sides: ['backend'], dx: true })
    // REQ-261006164732-6503 t3 口径修正：用**未落章**的产物（门真的开着）才谈得上"照弹"；
    // 旧用例用的是已落章产物，修后会被建门唯一入口正确判为已落章（见 TC-7b）。
    await seed(record('brainstorming', [openReqArtifact()]))

    const out = await triggerAutoConfirm(
      autoDeps(),
      { requirementId: REQ, target: 'artifact', kind: 'requirement', question: '确认进入设计？' },
      { agent: { id: W } },
    )

    expect(out.triggered).toBe(true)
  })

  it('TC-7b 产物已落章 ⇒ 不弹框（建门唯一入口判 already-settled）', async () => {
    writeReqDoc({ sides: ['backend'], dx: true })
    await seed(record('brainstorming', [confirmedReqArtifact()]))

    const out = await triggerAutoConfirm(
      autoDeps(),
      { requirementId: REQ, target: 'artifact', kind: 'requirement', question: '确认进入设计？' },
      { agent: { id: W } },
    )

    expect(out.triggered).toBe(false)
    expect(out.reason ?? '').toContain('已落章')
  })

  it('TC-6 UI 需求原型豁免生效后重发 ⇒ 闸门全过并推进（死锁链闭合）', async () => {
    writeReqDoc({ sides: ['frontend'], dx: true, exempt: '本轮只改宿主工具层，无界面改动' })
    await seed(record('brainstorming', [confirmedReqArtifact()]))

    const out = await run(askTool(), ASK_ARGS)

    expect(out.advanced).toBe(true)
    expect(out.to).toBe('design')
    expect(store.peek(REQ)?.status).toBe('design')
  })

  it('TC-6b 已登记原型 + INDEX 一条权威 + 锚点齐 ⇒ 存在/版本/锚点三门全过并推进', async () => {
    writeReqDoc({ sides: ['frontend'], dx: true })
    // 现场路径（来源需求就是这么走的）：真交了一份原型、INDEX 标唯一权威
    mkdirSync(join(dir, REQ_DIR, 'prototypes'), { recursive: true })
    writeFileSync(join(dir, REQ_DIR, 'prototypes/INDEX.md'),
      '# 原型权威清单\n\n| 路径 | 状态 | 服务条款 | 被取代于 |\n|---|---|---|---|\n'
      + '| prototypes/detail.html | authoritative | FR-1 | |\n')
    writeFileSync(join(dir, REQ_DIR, 'prototypes/detail.html'),
      '<section id="FR-1">x</section>\n'
      + '<!-- proto-geometry ' + JSON.stringify({ observations: [{ name: 'tabsTop', value: 576, unit: 'px', at: { width: 1280, state: 'inflight' } }] }) + ' -->\n')
    await seed(record('brainstorming', [confirmedReqArtifact(), registeredPrototypeArtifact()]))

    const out = await run(askTool(), ASK_ARGS)

    expect(out.advanced).toBe(true)
    expect(store.peek(REQ)?.status).toBe('design')
  })
})

describe('A2 · 后门回归：kind=requirement 不得绕过 G2（设计完整性门）', () => {
  it('TC-9 已到 design 阶段、设计文档未交齐 ⇒ 重发确认也不得推进到 decomposing', async () => {
    writeReqDoc({ sides: ['backend'], dx: true })
    // 盘上有一份未登记的设计文档：设计完整性门（G2）必须拦下
    mkdirSync(join(dir, REQ_DIR, 'design'), { recursive: true })
    writeFileSync(join(dir, REQ_DIR, 'design/architecture.md'), '# 架构\n')
    const r = record('design', [confirmedReqArtifact()])
    await seed({ ...r, category: 'feature' } as RequirementRecord)

    const out = await run(askTool(), ASK_ARGS)

    // 关键：不是「有没有 gate_failure」，而是**状态没动**——早退分支的推进必须与主路径吃同一批门。
    expect(out.advanced).toBe(false)
    expect(out.gate_failure).toBeDefined()
    expect(store.peek(REQ)?.status).toBe('design')
  })
})

describe('文档根隔离自检（防止用例把产物写进仓库）', () => {
  it('TC-8 本文件只写临时目录', async () => {
    writeReqDoc({ sides: ['backend'], dx: true })
    const reader = new FileDocRepository({ workspaceRoot: dir })
    expect(reader.exists(REQ_MD)).toBe(true)
    expect(dir.startsWith(tmpdir())).toBe(true)
  })
})
