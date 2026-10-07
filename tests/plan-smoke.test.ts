/**
 * t10 收口：兼容核对、回归基线与**真实冒烟**（REQ-261002175818-80a8 / FR-1~FR-9）。
 *
 * 为什么在单元用例（t1/t5/t8…）之外还要一份"冒烟"：那些文件各自钉一个判定点，而它们的
 * 夹具都是**为本文件服务的期望形状**；一旦"期望"与"真跑一遍"不是同一件事，全绿也不代表
 * 端到端说得通。本文件只做三件真事——**真 store + 真用例层 + 真落盘的计划文档**，
 * 三条冒烟都从提交入口进去，断言的是调用方真正拿到的那几个值（`success` / `overCapacity` /
 * `capacityNote` / 台账落点），不碰任何内部函数：
 *   ① **100 文件卡 → 8 批**（FR-1/FR-4/FR-5）：算得准、标得红、标记对不上就拒；
 *   ② **单文件卡不误报**（FR-4）：2.4 DU 的卡不得进清单，且无标记也放行；
 *   ③ **删掉 footprint 照旧通过**（FR-9）：未声明 ≠ 0，台账里连键都不许多出来。
 * 外加两组**兼容核对**（旧计划在两态配置下都进得了门；配置两态可辨）——它们是 t8 兼容用例的
 * 真实入口版：t8 走的是纯函数与投影，这里走的是提交路径。
 *
 * 夹具照 tests/plan-footprint-compat.test.ts：`mkdtemp` + **显式 `workspaceRoot`** +
 * afterEach 整体删除。合成需求（REQ-smoke01）的文档目录因此**绝不落进仓库**——
 * 否则跑一次测试就往 docs/requirements/ 里多一个目录，和本需求要治的"残留"是同一类病。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITS } from '../src/domain/limits.js'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'
import { stubDocFile, toUseCaseDeps, type ReqboardToolDeps } from './helpers/tool-deps.js'

const W = 'session-smoke-001'
const REQ = 'REQ-smoke01'
const PLAN_PATH = 'docs/requirements/' + REQ + '/decomposition.md'

/** 100×1 + 20×0.5 + 6000/2000 = 100 + 10 + 3 = **113 DU** > 容量 16 → ceil(113/16) = **8 批**。 */
const HEAVY = {
  key: 'heavy',
  title: '一张 100 文件的卡',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/plan-smoke.test.ts 全绿',
  implementation: '改 src/domain/task/Footprint.ts 一处',
  footprint: { files: 100, anchors: 20, chars: 6000 },
}

/** 1×1 + 2×0.5 + 800/2000 = **2.4 DU**，远小于 16——它出现在清单里就是误报。 */
const LIGHT = {
  key: 'light',
  title: '轻量卡',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/plan-smoke.test.ts 全绿',
  implementation: '改 src/domain/limits.ts 一处',
  footprint: { files: 1, anchors: 2, chars: 800 },
}

/**
 * 「删掉 footprint」那张：这个字段出现之前写下的计划卡（FR-9 的存量形态）。
 * `implementation` 只点到一个路径而 `files` 未声明——未声明时 FR-2 的下限**不判定**（不是 0）。
 */
const UNDECLARED = {
  key: 'legacy',
  title: '没有体量声明的卡',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/plan-smoke.test.ts 全绿',
  implementation: '改 src/domain/task/Footprint.ts 一处',
}

/** 提交返回体里本文件消费的那几个键（不抄全，只抄断言用到的——抄全就会随实现漂移）。 */
interface SmokeResult {
  success?: boolean
  plan_status?: string
  overCapacity?: {
    key: string
    title: string
    detailUnits: number
    capacity: number
    suggestedBatches: number
    hint: string
  }[]
  capacityNote?: { source: string; value: number; calibrated: boolean }
  marker_warnings?: string[]
}

type Capacity = { roundDetailUnits?: number; markerGate?: 'enforce' | 'warn' }

let store: ReturnType<typeof makeTestStore>
let root: string
let deps: ReqboardToolDeps

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-smoke-'))
  store = makeTestStore()
  deps = {
    store,
    now: () => Date.now(),
    toolTrace: new Map(),
    doneThrottleMs: 0,
    workspaceRoot: root,
  } as never
})

// 声明文档写在 mkdtemp 里 → 整体删除即零残留；仓库里不会出现 docs/requirements/REQ-smoke01。
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/**
 * 计划文档（decomposition.md）：FR-5 的标记就是「超容量标记」那一格。
 * 三张卡各占一行——门禁按行认 key + 「建议N批」，一行一卡是这条规则的前提。
 *
 * 首列名必须是「计划 key」（2026-10-06 缺口 4 之四的 `plan_doc_task_table_incomplete` 硬门
 * 按这个表头认任务表；标记门禁是**按行**认的，与列名无关，故改名不影响它）。
 */
function planDoc(heavyMarker: string): string {
  return [
    '# 冒烟计划（夹具）',
    '',
    '| 顺序 | 计划 key | 业务标题 | 超容量标记 |',
    '|---|---|---|---|',
    '| 1 | heavy | 一张 100 文件的卡 | ' + heavyMarker + ' |',
    '| 2 | light | 轻量卡 | — |',
    '| 3 | legacy | 没有体量声明的卡 | — |',
    '',
  ].join('\n')
}

async function seed(status: RequirementStatus = 'decomposing'): Promise<void> {
  const r = {
    id: REQ, title: '真实冒烟', description: '', status, blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('requirement-created', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

/** 走**用例层**提交（工具入参 schema 是 t3 的范围；本卡回答的是"判定与门禁真的生效了吗"）。 */
const submitPlan = (tasks: unknown, capacity?: Capacity): Promise<unknown> =>
  submitPlanArtifact(
    capacity === undefined ? toUseCaseDeps(deps) : { ...toUseCaseDeps(deps), capacity },
    { path: PLAN_PATH, summary: '目标：真实冒烟；做法：真 store + 真落盘文档', tasks },
    { agent: { id: W } },
  )

/** 取拒绝码；成功反而要抛（否则"本该被拒"会静默假绿）。 */
async function rejectedCode(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { ...(e.code !== undefined ? { code: e.code } : {}), message: e.message ?? '' }
  }
  throw new Error('本该被拒绝，却成功了')
}

describe('冒烟① 100 文件卡 → 8 批（FR-1 / FR-4 / FR-5）', () => {
  it('返回体：清单恰好含它（轻量卡不在内），113 DU / 8 批，判据自述是常量 16', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议8批)'))

    const out = (await submitPlan([HEAVY, LIGHT])) as SmokeResult

    // 超容量是**风险不是错误**：success 仍为 true（软门禁）
    expect(out.success).toBe(true)
    expect(out.overCapacity).toHaveLength(1)
    expect(out.overCapacity!.map((x) => x.key)).toEqual(['heavy'])

    const item = out.overCapacity![0]!
    expect(item.title).toBe('一张 100 文件的卡')
    expect(item.detailUnits).toBe(113)
    expect(item.capacity).toBe(LIMITS.roundDetailUnits)
    expect(item.capacity).toBe(16)
    expect(item.suggestedBatches).toBe(8)
    // 切分建议是给人看的一句话，不是空话
    expect(item.hint).toMatch(/按目录|按接口/)
    // FR-3：这是常量不是运行时读数（值是 16、来源是 constant、未经标定）
    expect(out.capacityNote).toEqual({ source: 'constant', value: 16, calibrated: false })
  })

  it('端到端：文档标记写对（建议8批）→ 放行；写错（建议1批）→ plan_overcapacity_marker_missing', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议8批)'))
    const ok = (await submitPlan([HEAVY])) as SmokeResult
    expect(ok.success).toBe(true)
    expect((await store.get(REQ))?.plan?.tasks).toHaveLength(1)

    // 复位台账：让"写错"那半从干净状态起跑，不掺上一次提交的余温
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议1批)'))

    const err = await rejectedCode(submitPlan([HEAVY]))
    expect(err.code).toBe('plan_overcapacity_marker_missing')
    // 消息必须点名**哪张卡**与**期望几批**（只报"有缺口"等于让人自己猜）
    expect(err.message).toContain('heavy')
    expect(err.message).toContain('8')
    // 拒绝零副作用：计划没进台账
    expect((await store.get(REQ))?.plan).toBeUndefined()
  })
})

describe('冒烟② 单文件卡不误报（FR-4）', () => {
  it('{1,2,800} → 2.4 DU：overCapacity 是**在场的空数组**，且无标记也能提交成功', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))

    const out = (await submitPlan([LIGHT])) as SmokeResult

    expect(out.success).toBe(true)
    // 缺键与空数组对调用方是两种分支：`in` 与 `toEqual([])` 都要断言
    expect('overCapacity' in (out as object)).toBe(true)
    expect(out.overCapacity).toEqual([])
    expect(out.capacityNote).toEqual({ source: 'constant', value: 16, calibrated: false })
    // 软门禁只对超容量卡说话：没有超容量卡时连降级警告都不该出现
    expect('marker_warnings' in (out as object)).toBe(false)
    expect((await store.get(REQ))?.plan?.tasks).toHaveLength(1)
  })
})

describe('冒烟③ 删掉 footprint 照旧通过（FR-9：未声明 ≠ 0）', () => {
  it('未声明卡：提交成功、overCapacity 空数组、台账里该卡**没有** footprint 键', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))

    const out = (await submitPlan([UNDECLARED])) as SmokeResult

    expect(out.success).toBe(true)
    expect(out.overCapacity).toEqual([])

    const saved = (await store.get(REQ))!
    expect(saved.plan?.tasks).toHaveLength(1)
    // hasOwnProperty 而不是 toBeUndefined：`footprint: undefined` 也"没有值"但**键在场**，
    // 那时"未声明"与"字段名写错/被白名单丢了"在 JSON 化后同形——正是本字段要消掉的歧义。
    expect(Object.prototype.hasOwnProperty.call(saved.plan?.tasks?.[0], 'footprint')).toBe(false)
  })
})

describe('兼容核对① 两态下旧计划仍能提交（FR-9）', () => {
  it('默认（不传 capacity）：缺声明不是失败理由', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))

    const out = (await submitPlan([UNDECLARED])) as SmokeResult
    expect(out.success).toBe(true)
    expect(out.plan_status).toBe('pending_approval')
    expect(out.overCapacity).toEqual([])
  })

  it("capacity:{markerGate:'warn'}：缺声明照旧提交成功（降级的是拒绝，不是披露）", async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))

    const out = (await submitPlan([UNDECLARED], { markerGate: 'warn' })) as SmokeResult
    expect(out.success).toBe(true)
    expect(out.overCapacity).toEqual([])
    // warn 只改"拒不拒"，不改"说不说"；而这里压根没有超容量卡 → 无话可说
    expect('marker_warnings' in (out as object)).toBe(false)
  })
})

describe('兼容核对② 配置两态可辨（FR-3）', () => {
  it("roundDetailUnits=8：source='config'、value=8，同一张 100 文件卡批数由 8 变 15", async () => {
    // 常量态：16 DU → 8 批（标记按判定值写才放行）
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议8批)'))
    const constant = (await submitPlan([HEAVY])) as SmokeResult
    expect(constant.capacityNote).toEqual({ source: 'constant', value: 16, calibrated: false })
    expect(constant.overCapacity![0]!.suggestedBatches).toBe(8)

    // 配置态：8 DU → ceil(113/8)=15 批；判据自述必须随之改成 config（否则没人分得清
    // "配置生效了"还是"被回落成常量了"）
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议15批)'))
    const configured = (await submitPlan([HEAVY], { roundDetailUnits: 8 })) as SmokeResult
    expect(configured.success).toBe(true)
    expect(configured.capacityNote).toEqual({ source: 'config', value: 8, calibrated: false })
    expect(configured.overCapacity![0]!.capacity).toBe(8)
    expect(configured.overCapacity![0]!.suggestedBatches).toBe(15)
  })

  it('同一张卡在 8 DU 下按 15 批判定：标记仍写 16 的 8 批 → 被拒（批数真的跟着配置走）', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议8批)'))

    const err = await rejectedCode(submitPlan([HEAVY], { roundDetailUnits: 8 }))
    expect(err.code).toBe('plan_overcapacity_marker_missing')
    expect(err.message).toContain('15')
  })
})
