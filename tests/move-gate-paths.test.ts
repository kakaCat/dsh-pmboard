/**
 * 内容门四路径回归（REQ-261005105032-3b02 t-501caa · serves: FR-1, FR-3, FR-4, FR-8）
 *
 * 这张用例要守的是**「门禁不再丢」**：`contentGatesForMove`（§10 #46 唯一 async 内容门）挂了
 * 四条转移路径，**缺任一条即后门**（REQ-292a 的教训：09-29 快照同步丢过一条，门禁失踪 9 天）。
 *
 * 覆盖口径（逐条对任务卡「得到什么结果」）：
 *   · S-1 标本（feature + `sides: [frontend]` + 无已登记 prototype）走四条路径**全部**得到
 *     `prototype_missing`；会话侧传输码是 `REQBOARD_MISSING_PROTOTYPE`（§10 #35 显式映射）；
 *   · 同标本把**既有 G2**（设计文档集完整性门）置为失败时四条路径也都拒——**双锁**：
 *     只锁新门会漏掉 G2 那半条断链（G2 的调用点与内容门是两行代码，各有各的被删风险）；
 *   · 边界：`sides: [backend]`（非 UI）与存量需求（artifacts 空）四条路径一律放行（不给它们加仪式）；
 *   · 交齐原型（S-2）→ 放行；
 *   · 纯函数级：`contentGatesForMove` 的分派与**短路顺序**（存在门 → 版本门 → 锚点门 → 裁定门）。
 *
 * **逆验证（本卡的机械保证）**：逐条注释掉任一路径的 `contentGatesForMove` 调用 → 对应用例必须红。
 * 实测记录见任务卡汇报（四条各一次）。
 */
import { makeHarness, makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { taskStoreAt } from './queue/route-deps.js'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { EventEmitter } from 'node:events'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { defineMoveTool, defineAskConfirmTool } from './helpers/tool-deps.js'
import { contentGatesForMove } from '../src/application/internal/content-gate-wiring.js'
import type { DocsReader } from '../src/application/internal/content-gates.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-t6-001'
const REQ = 'REQ-t6gate'
const RDIR = 'docs/requirements/' + REQ
const REQP = RDIR + '/requirement.md'
const INDEXP = RDIR + '/prototypes/INDEX.md'
const PROTO = 'prototypes/detail.html'

let dir: string
let store: ReturnType<typeof makeTestStore>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-t6-gate-'))
  store = makeTestStore()
})
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

// ── 标本（磁盘夹具） ─────────────────────────────────────────────────────────

/** 需求文档：带上 feature 必备节与「讨论与裁定记录（D-x）」真空态（裁定门放行的那一态）。 */
function reqDoc(fm: readonly string[] = [], withDecisionSection = true): string {
  return [
    '---', 'req: ' + REQ, ...fm, '---', '',
    '# 需求', '',
    '## 边界', '不做范围外的事。', '',
    '## 产品定义', 'x', '',
    '## 用户与角色', 'x', '',
    '## 功能点', '', '- **FR-1: 甲**', '',
    ...(withDecisionSection ? ['## 讨论与裁定记录（D-x）', '', '本节无裁定', ''] : []),
  ].join('\n')
}

function write(rel: string, text: string): void {
  const abs = join(dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

/** S-1：UI 需求 + 无已登记 prototype（磁盘上也没有原型资产）。 */
function writeS1(fm: readonly string[] = ['sides: [frontend]'], withDecisionSection = true): void {
  write(REQP, reqDoc(fm, withDecisionSection))
}

/** S-2：交齐原型——INDEX 恰好一条 authoritative + 锚点齐 + 恰好一块 proto-geometry。 */
function writeS2(): void {
  writeS1()
  write(INDEXP, [
    '# 原型权威清单', '',
    '| 路径 | 状态 | 服务条款 | 被取代于 |', '|---|---|---|---|',
    '| ' + PROTO + ' | authoritative | FR-1 | |', '',
  ].join('\n'))
  write(RDIR + '/' + PROTO, [
    '<section id="FR-1">甲</section>',
    '<!-- proto-geometry ' + JSON.stringify({
      observations: [{ name: 'tabsTop', value: 576, unit: 'px', at: { width: 1280, state: 'inflight' } }],
    }) + ' -->', '',
  ].join('\n'))
}

/** 设计文档集（G2 用）：只交 4 份，缺 use-cases.md。 */
const DESIGN4 = ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md']

interface SeedOpts {
  status?: string
  category?: string
  /** 需求产物是否已落章（false = 弹框首次确认那一态） */
  requirementConfirmed?: boolean
  /** 已登记 prototype 产物（S-2 用） */
  prototypeRegistered?: boolean
  /** 设计文档产物（G2 用；缺省 = 空） */
  designDocs?: readonly string[]
  /** 存量需求（无 artifacts 字段） */
  noArtifacts?: boolean
}

async function seed(opts: SeedOpts = {}): Promise<void> {
  const artifacts: StageArtifact[] = []
  if (opts.requirementConfirmed !== false) {
    artifacts.push({
      stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1,
      registeredBy: { kind: 'agent', sessionId: W }, confirmedAt: 1, confirmedBy: { kind: 'human' },
    } as StageArtifact)
  } else {
    artifacts.push({
      stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1,
      registeredBy: { kind: 'agent', sessionId: W },
    } as StageArtifact)
  }
  if (opts.prototypeRegistered === true) {
    artifacts.push({
      stage: 'brainstorming', kind: 'prototype', path: RDIR + '/' + PROTO, registeredAt: 1,
      registeredBy: { kind: 'agent', sessionId: W },
    } as StageArtifact)
  }
  for (const name of opts.designDocs ?? []) {
    artifacts.push({
      stage: 'design', kind: 'design', path: RDIR + '/design/' + name, registeredAt: 1,
      registeredBy: { kind: 'agent', sessionId: W }, confirmedAt: 1, confirmedBy: { kind: 'human' },
    } as StageArtifact)
  }
  const r = {
    id: REQ, title: '内容门四路径', description: '', category: opts.category ?? 'feature',
    status: opts.status ?? 'brainstorming', blocked: false, sourceSessionId: W,
    comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    ...(opts.noArtifacts === true ? {} : { artifacts }),
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const status = (): string => store.peekAll()[0]!.status

// ── 四个入口 ────────────────────────────────────────────────────────────────

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

function moveTool() {
  return defineMoveTool({ store, now: () => 1000, workspaceRoot: dir } as never) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}

/** 弹框确认工具（evidence 为空 → AskConfirm 路径；evidence 非空 → ConfirmArtifact 文字证据路径）。 */
function askTool(options: readonly string[]) {
  const deps = {
    store, now: () => 1000, workspaceRoot: dir,
    userQuestions: () => ({ ask: async () => ({ answers: [{ id: 'confirm', selected: [options[0]] }] }) }),
  } as never
  return defineAskConfirmTool(deps) as never as { execute: (a: unknown, e: unknown) => Promise<any> }
}

function fakeReq(url: string, body?: unknown): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = 'POST'
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.payload = undefined
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

function board() {
  return createReqboardHandler({
    requirementStore: store, taskStore: taskStoreAt(dir),
    // t2（REQ-261007135258-331a）：看板「确认即推进」改走单点 ⇒ 需完整用例依赖
    applicationDeps: { ...makeHarness().deps, store } as never,
    now: () => 1000,
    docs: new FileDocRepository({ workspaceRoot: dir }),
    // 看板确认路径以「绑定窗口在线」为前提（否则只落章、不推进，门禁无从触发）
    agents: () => ({ get: () => ({ id: W, session: {} }) }),
  } as never)
}

async function post(handler: ReturnType<typeof board>, url: string, body: unknown): Promise<any> {
  const res = fakeRes()
  await handler(fakeReq('/dashboard/api/reqboard' + url, body), res)
  return res
}

// ── S-1：四条路径全部拒（prototype_missing） ─────────────────────────────────

describe('S-1（feature + sides:[frontend] + 无已登记 prototype）→ 四条转移路径全部拒', () => {
  beforeEach(() => { writeS1() })

  it('① 会话 reqboard_move → 拒，传输码 REQBOARD_MISSING_PROTOTYPE，状态零变化', async () => {
    await seed()
    await expect(run(moveTool(), { to: 'design' })).rejects.toThrow(/REQBOARD_MISSING_PROTOTYPE/)
    // 同一次拒绝的消息本身也要点名缺口与补齐命令（§10 #40：how 必含可执行锚点）
    await expect(run(moveTool(), { to: 'design' })).rejects.toThrow(/reqboard_submit\(kind=prototype\)/)
    expect(status()).toBe('brainstorming')
  })

  it('② 弹框首次确认后自动推进 → 拦：advanced=false + gate_failure=prototype_missing（落章保留）', async () => {
    await seed({ requirementConfirmed: false }) // 首次确认那一态（confirm-settle 的推进块）
    const out = await run(askTool(['确认，进入设计', '需要修改']), {
      target: 'artifact', kind: 'requirement', question: '需求文档已完成，是否确认进入设计？',
      options: ['确认，进入设计', '需要修改'],
    })
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(false)
    expect(out.gate_failure?.code).toBe('prototype_missing')
    expect(out.note).toContain('未推进')
    // 落章保留（确认动作有效），但阶段不推进
    expect(store.peekAll()[0]!.artifacts![0]!.confirmedAt).toBeDefined()
    expect(status()).toBe('brainstorming')
  })

  it('②b 弹框重复确认（产物已落章、阶段未推进）→ 拦（AskConfirm 的推进块）', async () => {
    await seed() // 需求产物已落章：走「已确认、未推进」那条早退分支
    const out = await run(askTool(['确认，进入设计', '需要修改']), {
      target: 'artifact', kind: 'requirement', question: '需求文档已完成，是否确认进入设计？',
      options: ['确认，进入设计', '需要修改'],
    })
    expect(out.confirmed).toBe(true)
    expect(out.advanced).toBe(false)
    expect(out.gate_failure?.code).toBe('prototype_missing')
    expect(status()).toBe('brainstorming')
  })

  it('③ 看板移动端点 → 400 prototype_missing', async () => {
    await seed()
    const res = await post(board(), '/req/move', { id: REQ, to: 'design', actor: 'human' })
    expect(res.statusCode).toBe(400)
    expect(res.payload.code).toBe('prototype_missing')
    expect(res.payload.error).toContain('reqboard_submit(kind=prototype)')
    expect(status()).toBe('brainstorming')
  })

  it('④ 看板确认产物即推进 → 拦：advanced=false + gate_failure=prototype_missing（落章保留）', async () => {
    await seed({ requirementConfirmed: false })
    const res = await post(board(), '/req/artifact/confirm', { id: REQ, kind: 'requirement' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.advanced).toBe(false)
    expect(res.payload.data.gate_failure?.code).toBe('prototype_missing')
    expect(store.peekAll()[0]!.artifacts![0]!.confirmedAt).toBeDefined()
    expect(status()).toBe('brainstorming')
  })

  it('④b 会话文字证据确认即推进（reqboard_confirm_artifact 分支）→ 拦：advanceNote + gate_failure', async () => {
    await seed({ requirementConfirmed: false })
    const out = await run(askTool(['确认，进入设计']), {
      target: 'artifact', kind: 'requirement', question: '需求文档已完成，是否确认进入设计？',
      evidence: '用户原文：需求文档我确认了，进设计', advance: true,
    })
    expect(out.success).toBe(true)
    expect(out.advanced).toBe(false)
    expect(out.gate_failure?.code).toBe('prototype_missing')
    expect(status()).toBe('brainstorming')
  })
})

// ── 双锁：既有 G2 仍在四条路径上生效 ────────────────────────────────────────

describe('双锁：设计文档集不齐（既有 G2）→ 四条转移路径同样全部拒', () => {
  beforeEach(() => {
    writeS1()
    // 磁盘上 5 份必交设计文档只交 4 份（缺 use-cases.md）——G2 的判据
    mkdirSync(join(dir, RDIR, 'design'), { recursive: true })
    for (const n of DESIGN4) write(RDIR + '/design/' + n, '# ' + n + '\n')
  })

  const seedDesign = () => seed({ status: 'design', designDocs: DESIGN4 })

  it('① 会话 reqboard_move → 拒 design_doc_incomplete 且点名 use-cases.md', async () => {
    await seedDesign()
    await expect(run(moveTool(), { to: 'decomposing' })).rejects.toThrow(/design_doc_incomplete/)
    await expect(run(moveTool(), { to: 'decomposing' })).rejects.toThrow(/use-cases\.md 未交/)
  })

  it('② 弹框确认后自动推进 → 拦，gate_failure=design_doc_incomplete', async () => {
    await seedDesign()
    const out = await run(askTool(['确认，进入拆分']), {
      target: 'artifact', kind: 'design', question: '设计文档已完成，是否确认进入拆分？',
      options: ['确认，进入拆分', '需要修改'],
    })
    expect(out.advanced).toBe(false)
    expect(out.gate_failure?.code).toBe('design_doc_incomplete')
  })

  it('③ 看板移动端点 → 400 design_doc_incomplete', async () => {
    await seedDesign()
    const res = await post(board(), '/req/move', { id: REQ, to: 'decomposing', actor: 'human' })
    expect(res.statusCode).toBe(400)
    expect(res.payload.code).toBe('design_doc_incomplete')
  })

  it('④ 看板确认产物即推进 → 拦，gate_failure=design_doc_incomplete', async () => {
    await seedDesign()
    const res = await post(board(), '/req/artifact/confirm', { id: REQ, kind: 'design' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.advanced).toBe(false)
    expect(res.payload.data.gate_failure?.code).toBe('design_doc_incomplete')
  })

  it('④b 会话文字证据确认即推进 → 拦，gate_failure=design_doc_incomplete', async () => {
    await seedDesign()
    const out = await run(askTool(['确认，进入拆分']), {
      target: 'artifact', kind: 'design', question: '设计文档已完成，是否确认进入拆分？',
      evidence: '用户原文：设计文档我确认了，进拆分', advance: true,
    })
    expect(out.advanced).toBe(false)
    expect(out.gate_failure?.code).toBe('design_doc_incomplete')
  })
})

// ── 放行边界：交齐原型 / 非 UI / 存量 ───────────────────────────────────────

describe('放行边界（不给非 UI 与存量需求加仪式；交齐即放行）', () => {
  // 注意：brainstorming → design 是 **G1 人工闸门（humanOnly）**——会话语义 `reqboard_move` 本来就
  // 推不动它（被 REQBOARD_HUMAN_GATE 拦）。故"放行"这一侧分两处断言：
  //   · 看板端点（actor=human 满足人工门）→ 真的推进到 design；
  //   · 会话语义 → 断言它**没有**被内容门拦（拒绝原因里不能出现 prototype_missing），
  //     即内容门确实放行了，剩下的是人工门那件事。
  it('S-2 交齐原型 → 看板 move 放行到 design；会话语义已越过内容门（只剩人工门）', async () => {
    writeS2()
    await seed({ prototypeRegistered: true })
    const res = await post(board(), '/req/move', { id: REQ, to: 'design', actor: 'human' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.status).toBe('design')

    await seed({ prototypeRegistered: true })
    const err = await run(moveTool(), { to: 'design' }).then(() => undefined, (e: Error) => e)
    expect(err?.message).toContain('REQBOARD_HUMAN_GATE')
    expect(err?.message).not.toContain('prototype_missing')
    expect(err?.message).not.toContain('REQBOARD_MISSING_PROTOTYPE')
  })

  it('非 UI（sides:[backend]）→ 看板 move 放行；会话语义同样越过内容门，消息不含原型字样', async () => {
    writeS1(['sides: [backend]'])
    await seed()
    const res = await post(board(), '/req/move', { id: REQ, to: 'design', actor: 'human' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.status).toBe('design')

    await seed()
    const err = await run(moveTool(), { to: 'design' }).then(() => undefined, (e: Error) => e)
    expect(err?.message).toContain('REQBOARD_HUMAN_GATE')
    expect(err?.message).not.toContain('原型')

    // 四个入口里"确认即推进"那条也不能被内容门拦（非 UI 不进**原型门**；D-x 节在本标本里写了真空态）
    await seed({ requirementConfirmed: false })
    const confirmed = await post(board(), '/req/artifact/confirm', { id: REQ, kind: 'requirement' })
    expect(confirmed.statusCode).toBe(200)
    expect(confirmed.payload.data.advanced).toBe(true)
    expect(confirmed.payload.data.gate_failure).toBeUndefined()
  })

  // 2026-10-05 裁决（依据 FR-8 本身）：裁定门适用面 = **所有 feature 需求**，与界面无关——
  // 纯后端 feature 一样会有讨论裁定，收窄成"只有 UI 才判"会让 FR-8 对它完全失效。
  // 故此标本（feature + sides:[backend]）**必须**被裁定门拦下，而原型门对它不适用。
  it('非 UI 的 feature 需求缺「讨论与裁定记录（D-x）」节 → 被**裁定门**拒（原型门不适用）', async () => {
    writeS1(['sides: [backend]'], false) // 有需求文档、无 D-x 节
    await seed()
    const res = await post(board(), '/req/move', { id: REQ, to: 'design', actor: 'human' })
    expect(res.statusCode).toBe(400)
    expect(res.payload.code).toBe('decision_log_missing')
    expect(res.payload.error).toContain('讨论与裁定记录')
    // 拒绝原因里**不该**出现原型字样（非 UI 不进原型门，别让两条门混成一条消息）
    expect(res.payload.error).not.toContain('原型')
    expect(status()).toBe('brainstorming')
  })

  it('存量需求（无 artifacts 字段）→ 放行（不追溯存量）', async () => {
    writeS1()
    await seed({ noArtifacts: true })
    const res = await post(board(), '/req/move', { id: REQ, to: 'design', actor: 'human' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.status).toBe('design')
  })

  it('其余转移（design → decomposing）不被内容门波及（返回 undefined）', async () => {
    writeS1()
    await seed({ status: 'design' })
    const req = store.peekAll()[0]!
    expect(await contentGatesForMove(new FileDocRepository({ workspaceRoot: dir }), req, 'design', 'decomposing')).toBeUndefined()
  })
})

// ── 纯函数级：分派与短路顺序 ────────────────────────────────────────────────

function fakeDocs(files: Readonly<Record<string, string>>): DocsReader {
  return {
    exists: (p: string) => Object.prototype.hasOwnProperty.call(files, p),
    read: async (p: string) => files[p] ?? '',
    list: () => [],
  }
}

const reqOf = (over: Partial<RequirementRecord> = {}): RequirementRecord => ({
  id: REQ, title: '内容门', description: '', category: 'feature', status: 'brainstorming',
  blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
  createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  artifacts: [{ stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1 }],
  ...over,
} as unknown as RequirementRecord)

const FULL_DOC = reqDoc(['sides: [frontend]'])
const DOC_WITH_TABLE = FULL_DOC.replace(
  '本节无裁定',
  ['| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |', '|---|---|---|---|---|', '| D-1 | w-1 10:00「改成 A」 | 改成 A | FR-1 | 单测断言 A |'].join('\n'),
)

describe('contentGatesForMove 分派与短路顺序（纯函数级）', () => {
  const run5 = (files: Readonly<Record<string, string>>, req: RequirementRecord, from: string, to: string) =>
    contentGatesForMove(fakeDocs(files), req, from as never, to as never)

  it('其余转移一律 undefined（回退 / 非本源转移）', async () => {
    const files = { [REQP]: FULL_DOC }
    expect(await run5(files, reqOf(), 'design', 'decomposing')).toBeUndefined()
    expect(await run5(files, reqOf(), 'design', 'brainstorming')).toBeUndefined()
    expect(await run5(files, reqOf(), 'brainstorming', 'canceled')).toBeUndefined()
  })

  it('非 UI（sides:[backend]）feature：原型门不适用，但裁定门仍生效（写了 D-x 真空态 → 放行）', async () => {
    expect(await run5({ [REQP]: reqDoc(['sides: [backend]']) }, reqOf(), 'brainstorming', 'design')).toBeUndefined()
  })

  it('非 UI（sides:[backend]）feature 缺 D-x 节 → 裁定门拒（FR-8 宽口径，2026-10-05 裁决）', async () => {
    const f = await run5({ [REQP]: reqDoc(['sides: [backend]'], false) }, reqOf(), 'brainstorming', 'design')
    expect(f?.code).toBe('decision_log_missing')
    expect(f?.message).toContain('讨论与裁定记录')
  })

  it('非 feature（bug / chore）→ 两道门都不适用 → undefined', async () => {
    expect(await run5({ [REQP]: reqDoc(['sides: [frontend]'], false) }, reqOf({ category: 'bug' }), 'brainstorming', 'design')).toBeUndefined()
    expect(await run5({}, reqOf({ category: 'chore' }), 'brainstorming', 'design')).toBeUndefined()
  })

  it('feature 而盘上没有需求文档 → 裁定门拒（没有需求文档就出不了需求阶段）', async () => {
    const f = await run5({}, reqOf(), 'brainstorming', 'design')
    expect(f?.code).toBe('decision_log_missing')
  })

  it('短路顺序：存在门先于版本门（既无 prototype 又无 INDEX → prototype_missing）', async () => {
    const f = await run5({ [REQP]: FULL_DOC }, reqOf(), 'brainstorming', 'design')
    expect(f?.code).toBe('prototype_missing')
  })

  it('短路顺序：有 prototype 但 INDEX 缺 → 版本门（不报存在门）', async () => {
    const req = reqOf({
      artifacts: [
        { stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1 },
        { stage: 'brainstorming', kind: 'prototype', path: RDIR + '/' + PROTO, registeredAt: 1 },
      ] as StageArtifact[],
    })
    const f = await run5({ [REQP]: FULL_DOC }, req, 'brainstorming', 'design')
    expect(f?.code).toBe('prototype_version_conflict')
  })

  it('顺序：INDEX 合法但原型缺锚点 → 锚点门', async () => {
    const req = reqOf({
      artifacts: [
        { stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1 },
        { stage: 'brainstorming', kind: 'prototype', path: RDIR + '/' + PROTO, registeredAt: 1 },
      ] as StageArtifact[],
    })
    const files = {
      [REQP]: FULL_DOC,
      [INDEXP]: '| 路径 | 状态 | 服务条款 | 被取代于 |\n|---|---|---|---|\n| ' + PROTO + ' | authoritative | FR-1 | |\n',
      [RDIR + '/' + PROTO]: '<!-- proto-geometry {"observations":[{"name":"tabsTop","value":1,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->\n',
    }
    const f = await run5(files, req, 'brainstorming', 'design')
    expect(f?.code).toBe('prototype_anchor_missing')
    expect(f?.gaps?.join(' ')).toContain('FR-1')
  })

  it('顺序末尾：原型齐但缺「讨论与裁定记录」节且有留痕 → 裁定门（trace 由本函数自取自算）', async () => {
    const req = reqOf({
      artifacts: [
        { stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1 },
        { stage: 'brainstorming', kind: 'prototype', path: RDIR + '/' + PROTO, registeredAt: 1 },
      ] as StageArtifact[],
    })
    const files = {
      [REQP]: FULL_DOC.replace(/\n## 讨论与裁定记录（D-x）[\s\S]*$/, '\n'),
      [INDEXP]: '| 路径 | 状态 | 服务条款 | 被取代于 |\n|---|---|---|---|\n| ' + PROTO + ' | authoritative | FR-1 | |\n',
      [RDIR + '/' + PROTO]: '<section id="FR-1">甲</section>\n<!-- proto-geometry {"observations":[{"name":"tabsTop","value":1,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->\n',
    }
    // 探针命中祈使句留痕 → 缺节即拒
    const hit = { snapshotEvents: () => [{ type: 'user/message', data: { source: { kind: 'user' }, content: '这里必须改成 B' } }] }
    const f = await contentGatesForMove(fakeDocs(files), req, 'brainstorming', 'design', { sessionProbe: hit })
    expect(f?.code).toBe('decision_log_missing')
    // 同标本、无留痕通道 → 不适用留痕判据…（缺节仍拒：feature 模板本就要求该节）
    const f2 = await contentGatesForMove(fakeDocs(files), req, 'brainstorming', 'design')
    expect(f2?.code).toBe('decision_log_missing')
  })

  it('有节且条目合法 → 放行（四门全过）', async () => {
    const req = reqOf({
      artifacts: [
        { stage: 'brainstorming', kind: 'requirement', path: REQP, registeredAt: 1 },
        { stage: 'brainstorming', kind: 'prototype', path: RDIR + '/' + PROTO, registeredAt: 1 },
      ] as StageArtifact[],
    })
    const files = {
      [REQP]: DOC_WITH_TABLE,
      [INDEXP]: '| 路径 | 状态 | 服务条款 | 被取代于 |\n|---|---|---|---|\n| ' + PROTO + ' | authoritative | FR-1 | |\n',
      [RDIR + '/' + PROTO]: '<section id="FR-1">甲</section>\n<!-- proto-geometry {"observations":[{"name":"tabsTop","value":1,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->\n',
    }
    expect(await run5(files, req, 'brainstorming', 'design')).toBeUndefined()
  })
})
