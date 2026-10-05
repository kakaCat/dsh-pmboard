// serves: FR-1, FR-2, FR-3
/**
 * reqboard_clear_pause：回执无损 + 留痕可见（REQ-261002140814-1a5d · t-93f87b）。
 *
 * 背景（实测缺陷）：解锁**真的生效**（台账已改），但回执带了一个值为 `undefined` 的属性
 * `previous_activation`（根因：用例从 `mutate()` 的 `{changed,revision}` 结果里读变更器的自定义键），
 * 绑定层的无损 JSON 校验（`walkJsonValue`）不认 `undefined` ⇒ 整个回执被转成
 * `value is not lossless JSON` ⇒ agent 误判失败、可能重试。
 *
 * 口径：`undefinedPaths` 递归列「值为 undefined 的属性」，与 `tests/status-lossless.test.ts`
 * 同款（同一处 PTC/绑定层口径），本文件独立复制一份以避免 import 测试文件带来的重复 describe。
 */
import { makeHarness, makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { defineClearPauseTool } from '../src/tools/index.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-cp-001'
const REQ = 'REQ-261003000001-c0de'
const OTHER = 'REQ-261003000002-c0df'

let root: string
// B12 阶段③a：存储换统一工厂的新端口（不再自建旧 JSON 台账）
let h: ReturnType<typeof makeHarness>
let store: ReturnType<typeof makeHarness>['store']

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-clear-pause-'))
  h = makeHarness({})
  store = h.store
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/** 递归扫描「值为 undefined 的属性」（与绑定层 lossless 校验同口径）。 */
function undefinedPaths(v: unknown, path = ''): string[] {
  const out: string[] = []
  if (v === undefined) { out.push(path || '<root>'); return out }
  if (Array.isArray(v)) {
    v.forEach((x, i) => out.push(...undefinedPaths(x, path + '[' + i + ']')))
    return out
  }
  if (typeof v === 'object' && v !== null) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === undefined) { out.push(path.length > 0 ? path + '.' + k : k); continue }
      out.push(...undefinedPaths(val, path.length > 0 ? path + '.' + k : k))
    }
  }
  return out
}

/** 留痕可见判据：GUI 渲染读的是 `body`（src/client/render/dom-utils.ts:254）。 */
const hasVisibleBody = (c: unknown): boolean => {
  const body = (c as { body?: unknown }).body
  return typeof body === 'string' && body.length > 0
}
/** 旧形状（写 text）判据——用于反向证伪。 */
const writesLegacyTextKey = (c: unknown): boolean =>
  Object.prototype.hasOwnProperty.call(c as object, 'text')

function reqRecord(id: string, extra: Record<string, unknown> = {}): RequirementRecord {
  return {
    id, title: '解锁回执', description: '', status: 'implementing', category: 'feature', blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    ...extra,
  } as unknown as RequirementRecord
}

/** 种一条 armed 需求 + 一条属于别的窗口的需求。 */
async function seed(): Promise<void> {
  const armed = reqRecord(REQ, {
    dive: { activation: 'armed', phase: 'active', roundsInStage: 3, pausedReason: 'foo' },
  })
  const foreign = reqRecord(OTHER, { sourceSessionId: 'session-other-999' })
  // B12 阶段③a：用 replaceAll **原样导入**（seedRequirementSync 是 create+回填两次写 ⇒ 记录 version 会变 2，
  // 而本文件有 version 断言）。replaceAll 保持记录字段原值。
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [armed, foreign], triages: [] })
}

const depsOf = (storeLike: unknown = store) => ({
  // B12 阶段③a：读点与写点都在**新端口**上；调用方可注入替身（拒绝路径要测"需求消失/不属本窗口"）。
  store: storeLike,

  docs: new FileDocRepository({ workspaceRoot: root }),
  clock: new SystemClock(),
  ids: new RandomIdFactory(),
  session: new SessionProbeAdapter({}),
  questions: new UserQuestionsAdapter(() => undefined),
  doneThrottleMs: 0,
}) as never

/** 走真实工具壳（等于走真实入口与 deps.session.windowKey）。 */
async function runClearPause(args: Record<string, unknown> = {}, storeLike: unknown = store): Promise<any> {
  const tool = defineClearPauseTool(depsOf(storeLike)) as unknown as {
    execute: (a: unknown, c: unknown) => Promise<any>
  }
  return await tool.execute(args, { agent: { id: W } })
}

const after = async (): Promise<RequirementRecord> => (await store.get(REQ)) as RequirementRecord

describe('reqboard_clear_pause 回执无损（FR-1）', () => {
  it('UC-1 armed 需求解锁：回执无 undefined 属性，且含 previous_activation', async () => {
    await seed()
    const out = await runClearPause()

    expect(out.success).toBe(true)
    expect(out.requirement_id).toBe(REQ)
    expect(out.previous_activation).toBe('armed')
    expect(undefinedPaths(out)).toEqual([])

    const r = await after()
    expect(r.dive?.activation).toBe('disarmed')
    expect(r.dive?.phase).toBe('idle')
    expect(r.dive?.roundsInStage).toBe(3)
    expect(r.version).toBe(2)
    expect(r.comments).toHaveLength(1)
  })

  it('UC-2 无 dive 记录：previous_activation 键整体省略（不是 undefined/null）', async () => {
    const legacy = reqRecord(REQ)
    await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [legacy], triages: [] })

    const out = await runClearPause()

    expect(Object.prototype.hasOwnProperty.call(out, 'previous_activation')).toBe(false)
    expect(out.previous_activation).toBeUndefined()
    expect(undefinedPaths(out)).toEqual([])

    const r = await after()
    expect(r.dive?.activation).toBe('disarmed')
    expect(r.dive?.phase).toBe('idle')
    expect(r.dive?.roundsInStage).toBe(0)
    expect((r.comments.at(-1) as unknown as { body: string }).body).toContain('之前状态：none')
  })

  it('UC-3 变更期间需求消失：抛 REQBOARD_MUTATION_FAILED，绝不报假成功、零写入', async () => {
    await seed()
    const revBefore = (await store.head()).revision
    // B12 阶段③a：新端口没有整册快照 ⇒ 用**存储替身**表达同一竞态：
    //   读走真实存储（REQ 仍在 ⇒ 窗口校验通过），**写**改派到一个"从没有过 REQ"的空存储
    //   ⇒ 写时 NOT_FOUND（等价旧的"草稿里已无 REQ"）⇒ 用例边界必须响亮失败。
    const emptyStore = makeTestStore()
    const storeDouble = Object.create(store) as typeof store
    Object.defineProperty(storeDouble, 'mutate', { value: emptyStore.mutate.bind(emptyStore) })

    await expect(runClearPause({}, storeDouble)).rejects.toMatchObject({ code: 'REQBOARD_MUTATION_FAILED' })
    expect((await store.head()).revision).toBe(revBefore)   // 变更器返回 undefined ⇒ 不落盘、不 bump
  })

  it('UC-4 拒绝路径：无绑定需求 / 显式 id 不属本窗口，且零写入', async () => {
    await seed()

    await expect(runClearPause({ requirement_id: OTHER })).rejects.toMatchObject({
      code: 'REQBOARD_NOT_BOUND_TO_WINDOW',
    })
    expect((await after()).version).toBe(1)
    expect((await after()).comments).toHaveLength(0)

    // B12 阶段③a：空存储直接用统一工厂的内存替身（语义等价：里面没有任何需求）
    const emptyStore = makeTestStore()
    await expect(runClearPause({}, emptyStore)).rejects.toMatchObject({ code: 'REQBOARD_NO_BOUND_REQ' })
  })
})

describe('reqboard_clear_pause 留痕可见（FR-2）', () => {
  it('UC-5 解锁留痕写 body（含之前状态）且不写 text 键', async () => {
    await seed()
    await runClearPause()

    const comment = (await after()).comments.at(-1)
    expect(hasVisibleBody(comment)).toBe(true)
    expect((comment as unknown as { body: string }).body).toContain('Dive 模式已解除锁定（reqboard_clear_pause）')
    expect((comment as unknown as { body: string }).body).toContain('之前状态：armed')
    expect(writesLegacyTextKey(comment)).toBe(false)
    expect((comment as unknown as { createdBy?: { sessionId?: string } }).createdBy?.sessionId).toBe(W)
  })
})

describe('反向证伪：把修复退回去必须变红（FR-1 / FR-2 / FR-3）', () => {
  it('旧回执形状（previous_activation: undefined）必被判缺', () => {
    const oldShape = { success: true, requirement_id: REQ, previous_activation: undefined, message: 'x' }
    expect(undefinedPaths(oldShape)).toEqual(['previous_activation'])
    expect(undefinedPaths({ ...oldShape, previous_activation: 'armed' })).toEqual([])
  })

  it('旧留痕形状（写 text 不写 body）必被判不可见', () => {
    const oldComment = { id: 'c1', text: 'Dive 模式已解除锁定（reqboard_clear_pause）', createdAt: 1 }
    expect(hasVisibleBody(oldComment)).toBe(false)
    expect(writesLegacyTextKey(oldComment)).toBe(true)
  })
})

/**
 * REQ-261002173819-69c7 t4 · 渲染（FR-4）。
 *
 * 现场：本工具此前**没有** `output.render`，宿主渲染抛 `userRender is not a function`，
 * 把已生效的解锁报成 INVALID_TOOL_OUTPUT——调用方无法从返回值判断锁开没开。
 */
describe('reqboard_clear_pause 输出渲染（FR-4 · REQ-261002173819-69c7）', () => {
  const toolOf = () => defineClearPauseTool(depsOf(store)) as unknown as {
    output?: { render?: (args: unknown, value: unknown) => { type: string; text: string }[] }
  }

  it('T-3：声明了 render，首行是含需求号的单行中文摘要，空行后可 JSON.parse', async () => {
    await seed()
    const render = toolOf().output?.render
    expect(typeof render, 'output.render 必须存在（缺它宿主只会报 userRender is not a function）').toBe('function')

    const out = await runClearPause()
    const parts = render!({}, out)
    expect(parts[0]!.type).toBe('text')

    const text = parts[0]!.text
    const [first, ...rest] = text.split('\n\n')
    expect(first!.includes('\n')).toBe(false)
    expect(first!).toContain(REQ)
    expect(first!).toContain('disarmed')
    const detail = JSON.parse(rest.join('\n\n')) as Record<string, unknown>
    expect(detail['success']).toBe(true)
  })

  it('T-4：回执与台账一致（回执说 armed → disarmed，台账就真的是那样）', async () => {
    await seed()
    const out = await runClearPause()

    expect(out.success).toBe(true)
    expect(out.previous_activation).toBe('armed')
    const r = await after()
    expect(r.dive?.activation).toBe('disarmed')
    expect(r.dive?.phase).toBe('idle')
  })
})
