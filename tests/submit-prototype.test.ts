/**
 * `reqboard_submit(kind=prototype)` 登记编排用例（REQ-261005105032-3b02 t10 · serves FR-2 / FR-4）。
 *
 * 卡面验收口径（t-477b25「得到什么结果」逐条）：
 *  - 合法标本 → `success=true` / `registered_count=1` / 返回项 `anchors` 含 `FR-4` /
 *    `geometry` 观测量名含 `tabsTop`；
 *  - 重复调用 → `registered_count=0`，台账不重复入簿，且 `prototypes/INDEX.md` **逐字节未改**
 *    （决议 #9：登记只校验、绝不改写 INDEX）；
 *  - 目录不存在 → `success=false` / `registered_count=0` / `blockers` 含 `prototype_missing`
 *    （**不谎报成功**，且台账零改动）；
 *  - 显式 `path` 仍走可打开性校验（伪路径 / 不存在 / 非原型路径当场拒）；
 *  - 旧路径 `prototype/*.html` 仍识别，并在消息里提示迁移到 `prototypes/`；
 *  - geometry JSON 坏 → 按缺块记录（**不抛、不阻断登记**）。
 *
 * 为什么用真 fs 的临时工作区 + 真工具壳（而不是 mock 用例）：本条链的价值全在"登记后盘上/台账上
 * 真的发生了什么"——INDEX 逐字节未改、台账不重复入簿这两条断言，只有真读写才承重。
 */
import { makeHarness } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { taskStoreAt } from './queue/route-deps.js'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { defineSubmitTool } from '../src/tools/index.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { assertNoPendingConfirm } from '../src/application/internal/support.js'
import { readRTMTriggerTraces } from '../src/application/internal/rtm-health.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-proto-reg-001'
const OTHER = 'session-proto-reg-999'
const REQ = 'REQ-261005105032-p1'
const REQ_DIR = 'docs/requirements/' + REQ
const PROTO_DIR = REQ_DIR + '/prototypes'
const DETAIL = PROTO_DIR + '/detail.html'
const INDEX = PROTO_DIR + '/INDEX.md'
const REQ_MD = REQ_DIR + '/requirement.md'

let root: string
let h: ReturnType<typeof makeHarness>
let store: ReturnType<typeof makeHarness>['store']
let registry: PendingConfirmRegistry

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-proto-reg-'))
  h = makeHarness({})
  store = h.store
})
// REQ-261005200052-ce40 FR-1：装配挂起确认注册表——用来断言「登记原型不再产生票」
beforeEach(() => { registry = new PendingConfirmRegistry({ now: () => Date.now() }) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const depsWith = () =>
  ({
    store,
    taskStore: taskStoreAt(root),
    docs: new FileDocRepository({ workspaceRoot: root }),
    clock: new SystemClock(),
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => undefined),
    pendingConfirms: registry,
    doneThrottleMs: 0,
  }) as never

const run = (args: unknown, agentId = W): Promise<any> =>
  (defineSubmitTool(depsWith()) as any).execute(args, { agent: { id: agentId } })

async function seed(sourceSessionId = W, artifacts: StageArtifact[] = []): Promise<void> {
  const r = {
    id: REQ, title: '原型登记', description: '', status: 'brainstorming', category: 'feature', blocked: false,
    sourceSessionId, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [], artifacts,
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/** 写盘（自动建目录）——测试的真实工作区就是 `root`。 */
function write(rel: string, text: string): void {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
  // 夹具自检：写没落盘就别往下断言——否则"登记没生效"会把夹具问题伪装成实现问题
  // （实测踩过一次：整片 success 断言齐红，而真实原因是盘上夹具不在读根下）。
  expect(existsSync(abs)).toBe(true)
}

/**
 * 成功断言带诊断：失败时把 `blockers` 一起抛出来。用例改动的价值全在"登记到底做了什么"，
 * 一条 `expected false to be true` 会把「没找到文件」「读不出」「幂等命中」三种原因糊成一团。
 */
function expectOk(out: any): void {
  expect(out.success, '未登记成功：blockers=' + JSON.stringify(out.blockers ?? []) + ' / note=' + String(out.note)).toBe(true)
}

/** requirement.md：FR-4 明细 + front-matter（缺省声明 frontend 端侧）。 */
function requirementMd(fm: readonly string[] = ['sides: [frontend]']): string {
  return ['---', 'req: ' + REQ, ...fm, '---', '', '# 需求说明', '', '### FR-4: 原型锚点', 'x', ''].join('\n')
}

/** 权威原型：一个 FR 锚点区块 + 恰好一块 proto-geometry（观测量名 tabsTop）。 */
const DETAIL_HTML = [
  '<!doctype html>',
  '<html><body>',
  '<section id="FR-4">标签区</section>',
  '<!-- proto-geometry {"observations":[{"name":"tabsTop","value":576,"unit":"px",',
  '"at":{"width":1280,"state":"inflight"}}]} -->',
  '</body></html>',
  '',
].join('\n')

/** INDEX（四列，逐字照 data-model §2.1）：权威路径声明服务 FR-4。 */
const INDEX_MD = [
  '# 原型权威清单',
  '',
  '| 路径 | 状态 | 服务条款 | 被取代于 |',
  '|---|---|---|---|',
  '| prototypes/detail.html | authoritative | FR-4 | — |',
  '',
].join('\n')

const protoArtifacts = async (): Promise<StageArtifact[]> =>
  ((await store.get(REQ))?.artifacts ?? []).filter(a => a.kind === 'prototype')

const indexBytes = (): string => readFileSync(join(root, INDEX), 'utf8')

describe('TC-1 正向：扫 prototypes/*.html 登记并抽锚点与几何量', () => {
  it('合法标本 → success=true / registered_count=1 / anchors 含 FR-4 / geometry 含 tabsTop', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)
    write(INDEX, INDEX_MD)

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.requirement_id).toBe(REQ)
    expect(out.registered_count).toBe(1)
    expect(out.prototypes).toHaveLength(1)
    const p = out.prototypes[0]
    expect(p.name).toBe('detail.html')
    expect(p.path).toBe(DETAIL)
    expect(p.on_disk).toBe(true)
    expect(p.registered).toBe(true)
    expect(p.confirmed).toBe(false) // 门禁只要求「已登记」；确认章是可选加强（决议 #13）
    expect(p.authoritative).toBe(true)
    expect(p.serves).toEqual(['FR-4'])
    expect(p.anchors).toContain('FR-4')
    expect(p.geometry).toContain('tabsTop')
    // 成功时 blockers 整体省略（无损 JSON 纪律）
    expect(out.blockers).toBeUndefined()
  })

  it('台账入簿：stage=brainstorming + kind=prototype + prototypeMeta（下游不必重解析 HTML）', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)
    write(INDEX, INDEX_MD)
    expectOk(await run({ kind: 'prototype' }))

    const arts = await protoArtifacts()
    expect(arts).toHaveLength(1)
    expect(arts[0]?.stage).toBe('brainstorming')
    expect(arts[0]?.kind).toBe('prototype')
    expect(arts[0]?.path).toBe(DETAIL)
    expect(arts[0]?.prototypeMeta?.anchors.map(a => a.fr)).toEqual(['FR-4'])
    expect(arts[0]?.prototypeMeta?.geometry.map(g => g.name)).toEqual(['tabsTop'])
    expect(arts[0]?.prototypeMeta?.geometry[0]?.unit).toBe('px')
  })

  it('登记成功后刷新 RTM（触发点 submit:prototype，载荷带本次登记的路径）', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)
    write(INDEX, INDEX_MD)
    expectOk(await run({ kind: 'prototype' }))

    const traces = readRTMTriggerTraces(join(root, '.dsh-data/state'))
    expect(traces.some(t => t.trigger === 'submit:prototype' && t.paths.includes(DETAIL))).toBe(true)
    // 生成器以台账为事实源：本需求目录确实被刷新出 rtm-brainstorming.yml
    expect(existsSync(join(root, REQ_DIR, 'rtm-brainstorming.yml'))).toBe(true)
  })
})

describe('TC-2 幂等：重复调用不重复入簿、INDEX 逐字节未改', () => {
  it('二次调用 → registered_count=0、台账仍 1 条、INDEX 与首次登记前后逐字节相同', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)
    write(INDEX, INDEX_MD)
    const before = indexBytes()

    const first = await run({ kind: 'prototype' })
    expectOk(first)
    expect(first.registered_count).toBe(1)
    expect(indexBytes()).toBe(before) // 登记只校验、绝不改写 INDEX（决议 #9）

    const second = await run({ kind: 'prototype' })
    expectOk(second) // 文件在盘上 = 义务已履行；只是本次新登记 0 份
    expect(second.registered_count).toBe(0)
    expect(second.prototypes[0].registered).toBe(true)
    expect(second.note).toContain('幂等命中')
    expect(await protoArtifacts()).toHaveLength(1)
    expect(indexBytes()).toBe(before)
  })

  it('自动发现补登（autoDiscovered）≠ 已登记：本次 submit 把它升级成显式，才算"新登记 1 份"', async () => {
    // 为什么单列这条：看板 stages 路由**每请求**跑一次产物发现，磁盘上的文件会被自动補登成台账条目
    // （autoDiscovered: true）。若把補登当"已登记"，一次显式 submit 就会回 registered_count=0、不写评论、
    // 不刷 RTM——agent 读不出"我的提交生效了没有"（FR-1「登记才算数」的实测缺口）。
    await seed(W, [{
      stage: 'brainstorming', kind: 'prototype', path: DETAIL, registeredAt: 1,
      registeredBy: { kind: 'system' }, autoDiscovered: true,
    } as StageArtifact])
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)
    write(INDEX, INDEX_MD)

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.registered_count).toBe(1)
    expect(out.prototypes[0].registered).toBe(true)
    const arts = await protoArtifacts()
    expect(arts).toHaveLength(1) // 升级不重复入簿
    expect(arts[0]?.autoDiscovered).toBeUndefined() // 标记被清 = 已是显式登记
    expect((await store.get(REQ))?.comments.some(c => c.body.startsWith('[原型] 登记'))).toBe(true)

    const again = await run({ kind: 'prototype' })
    expect(again.registered_count).toBe(0) // 升级后即幂等
  })
})

describe('TC-3 边界：没有可登记的原型 → 不谎报成功', () => {
  it('prototypes/ 不存在 → success=false、registered_count=0、blockers 含 prototype_missing、台账零改动', async () => {
    await seed()
    write(REQ_MD, requirementMd())

    const out = await run({ kind: 'prototype' })
    expect(out.success).toBe(false)
    expect(out.registered_count).toBe(0)
    expect(out.prototypes).toEqual([])
    expect(Array.isArray(out.blockers)).toBe(true)
    expect(out.blockers.every((b: unknown) => typeof b === 'string')).toBe(true)
    expect(out.blockers.join(' | ')).toContain('prototype_missing')
    // 补齐指引必须可执行（含骨架路径与工具命令锚点）
    expect(out.blockers.join(' | ')).toContain('templates/brainstorming/prototype.html')
    expect(out.blockers.join(' | ')).toContain('reqboard_submit(kind=prototype)')
    expect(await protoArtifacts()).toHaveLength(0)
  })

  it('prototypes/ 存在但只有非 .html（INDEX.md 不是原型页面）→ 同样 0 且不谎报', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(INDEX, INDEX_MD)

    const out = await run({ kind: 'prototype' })
    expect(out.success).toBe(false)
    expect(out.registered_count).toBe(0)
    expect(out.blockers.join(' ')).toContain('prototype_missing')
    expect(await protoArtifacts()).toHaveLength(0)
  })
})

describe('TC-4 path 语义：单份登记 + 可打开性校验', () => {
  it('给了 path 只登记该份，重复调用幂等', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)
    write(PROTO_DIR + '/other.html', DETAIL_HTML)

    const out = await run({ kind: 'prototype', path: DETAIL })
    expect(out.registered_count).toBe(1)
    expect((await protoArtifacts()).map(a => a.path)).toEqual([DETAIL])
    const again = await run({ kind: 'prototype', path: DETAIL })
    expect(again.registered_count).toBe(0)
  })

  it('伪路径（..）→ REQBOARD_ARTIFACT_NOT_OPENABLE', async () => {
    await seed()
    await expect(run({ kind: 'prototype', path: 'docs/../etc/passwd.html' }))
      .rejects.toThrow(/REQBOARD_ARTIFACT_NOT_OPENABLE/)
  })

  it('文件不存在 → REQBOARD_FILE_MISSING', async () => {
    await seed()
    await expect(run({ kind: 'prototype', path: PROTO_DIR + '/nope.html' }))
      .rejects.toThrow(/REQBOARD_FILE_MISSING/)
  })

  it('路径不在原型分类内（design/*.md）→ REQBOARD_INVALID_INPUT（含可执行锚点）', async () => {
    await seed()
    const design = REQ_DIR + '/design/architecture.md'
    write(design, '# 架构\n')
    await expect(run({ kind: 'prototype', path: design })).rejects.toThrow(/REQBOARD_INVALID_INPUT/)
    await expect(run({ kind: 'prototype', path: design })).rejects.toThrow(/templates\/brainstorming\/prototype\.html/)
  })
})

describe('TC-5 兼容旧路径 prototype/*.html（识别 + 提示迁移）', () => {
  it('旧目录里的原型照样登记，并在 note 里提示迁移到 prototypes/', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(REQ_DIR + '/prototype/detail.html', DETAIL_HTML)

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.registered_count).toBe(1)
    expect(out.prototypes[0].path).toBe(REQ_DIR + '/prototype/detail.html')
    expect(out.note).toContain(PROTO_DIR)
    expect(out.note).toContain('迁移')
  })
})

describe('TC-6 坏几何量块：按缺块记录，不抛、不阻断登记', () => {
  it('proto-geometry JSON 坏 → 登记成功、geometry 为空、锚点照样抽出', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, [
      '<!doctype html><html><body>',
      '<section id="FR-4">标签区</section>',
      '<!-- proto-geometry {这不是 JSON} -->',
      '</body></html>',
    ].join('\n'))

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.registered_count).toBe(1)
    expect(out.prototypes[0].anchors).toContain('FR-4')
    expect(out.prototypes[0].geometry).toEqual([]) // 按缺块记录，不猜（判据留给锚点门）
    const arts = await protoArtifacts()
    expect(arts[0]?.prototypeMeta?.geometry).toEqual([])
  })

  it('INDEX 缺失不阻断登记（权威唯一由设计阶段的原型版本门执法，登记只投影读数）', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.registered_count).toBe(1)
    expect(out.prototypes[0].authoritative).toBe(false)
    expect(out.prototypes[0].serves).toEqual([])
  })
})

describe('归属校验', () => {
  it('本窗口未绑定需求 → REQBOARD_NO_BOUND_REQ', async () => {
    await seed(OTHER)
    await expect(run({ kind: 'prototype' })).rejects.toThrow(/REQBOARD_NO_BOUND_REQ/)
  })
})

describe('工具契约：输出 schema 必须装得下原型返回体', () => {
  // 为什么单列这组：`output.schema` 是 additionalProperties:false 的硬壳，**算出来了却没声明**的键
  // 会被绑定层换成一条 `invalid output`（本仓已踩过三次：auto_confirm / overCapacity / footprint）。
  // 本用例直接拿声明出的 schema 校验真实返回形状——不是"看起来声明了"，而是"校验器认"。
  const schemaOf = (): Record<string, unknown> => (defineSubmitTool(depsWith()) as any).output.schema
  const violations = (value: unknown): string[] => validateJsonSchemaValue(schemaOf(), value)

  it('kind=prototype 的成功返回（含逐份态全字段、省略 blockers）→ 零违规', () => {
    expect(violations({
      success: true,
      requirement_id: REQ,
      registered_count: 1,
      prototypes: [{
        name: 'detail.html', path: DETAIL, on_disk: true, registered: true, confirmed: false,
        exempted: '理由', authoritative: true, superseded_by: 'prototypes/detail-v2.html',
        serves: ['FR-4'], anchors: ['FR-4'], geometry: ['tabsTop'],
      }],
      auto_confirm: { triggered: false, reason: '弹框通道不可用' },
      warning: 'RTM 刷新失败（已忽略）',
      note: '已登记 1 份',
    })).toEqual([])
  })

  it('kind=prototype 的失败返回：blockers 是**字符串**清单（不谎报成功的那条通道）', () => {
    expect(violations({
      success: false,
      requirement_id: REQ,
      registered_count: 0,
      prototypes: [],
      blockers: ['prototype_missing：docs/requirements/' + REQ + '/prototypes/ 内没有 .html 原型'],
      note: '未发现可登记的原型',
    })).toEqual([])
  })

  it('kind=verification 的对象 blockers 仍然合法（一种 kind 一种形状，靠 oneOf 并列而不互相降级）', () => {
    expect(violations({
      success: true,
      requirement_id: REQ,
      blockers: [{ id: 't-1', title: '未完成任务', status: 'in_progress' }],
    })).toEqual([])
  })

  it('未声明的键会被拒（证明上面三条不是空转）', () => {
    expect(violations({ success: true, requirement_id: REQ, oops_undeclared: 1 }).length).toBeGreaterThan(0)
  })
})

describe('原型登记不产生挂起票（REQ-261005200052-ce40 FR-1）', () => {
  it('登记成功后不产生挂起票，本窗口写路径不被 REQBOARD_CONFIRM_PENDING 拦', async () => {
    await seed()
    write(REQ_MD, requirementMd())
    write(DETAIL, DETAIL_HTML)
    write(INDEX, INDEX_MD)

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.registered_count).toBe(1)
    // 修前：返回 {triggered:true}，2 秒宽限过后留下一张 pc- 票（无门产物），窗口被钉 30 分钟。
    // 修后：只发通知、不产生票——「登记即生效」。
    expect(out.auto_confirm).toEqual({ triggered: false, reason: expect.stringContaining('无需人工确认') })
    expect(registry.pendingForWindow(W)).toBeUndefined()
    // 写路径守卫放行：这正是「登记完原型，接着提交文档不再报 REQBOARD_CONFIRM_PENDING」的机制口径
    await expect(assertNoPendingConfirm(depsWith(), W)).resolves.toBeUndefined()
  })
})
