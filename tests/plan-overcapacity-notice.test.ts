/**
 * 超容量看得见（一）（REQ-261002175818-80a8 t5 / FR-4、FR-5）：提交返回体与计划文档标记。
 *
 * 三条纪律，每条都对应一个已知会死人的形态：
 *   ① **超容量不是错误**：`success` 仍为 true（软门禁的机器语义）——写成 reject 就等于把
 *      "提醒"变成"卡死"，人连知情放行的机会都没有（需求边界第 2 条明说不做硬拒绝）；
 *   ② **不误报**：轻量卡不得进清单（`overCapacity` 无超容量时是**空数组**，不是缺键——
 *      调用方因此只有一种判空写法）；
 *   ③ **披露与判定不许漂移**：计划文档的标记 N 必须等于判定值。只要求"有标记"的话，
 *      标了旧数字的卡会让人以为已经处理过（相等是可机械证伪的）。
 *
 * 为什么走**用例层**（不过工具壳）：t5 的落点是 SubmitArtifact + content-gate-wiring；
 * 工具壳与出参 schema 是 t3 的范围（tests/output-contract.test.ts 静态扫描每个 return 分支的键）。
 * 本文件只回答「判定与门禁有没有生效」。
 * 夹具照 tests/plan-footprint-propagation.test.ts（真 store + stubDocFile 落 decomposition.md），
 * workspaceRoot 显式指到临时目录，保证"写在哪"与"读在哪"是同一个值。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LIMITS } from '../src/domain/limits.js'
import { markerGateOf, resolveRoundCapacity } from '../src/plugin-config.js'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
import { askConfirm } from '../src/application/use-cases/AskConfirm.js'
import { checkOverCapacityMarkerGate } from '../src/application/internal/content-gate-wiring.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { stubDocFile, toUseCaseDeps, taskStoreOf, definePlanSubmitTool, type ReqboardToolDeps } from './helpers/tool-deps.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-oc-001'
const REQ = 'REQ-oc0001'
const PLAN_PATH = 'docs/requirements/' + REQ + '/decomposition.md'

/** 装不下的那张：100 文件 / 20 锚点 / 6000 字符 = 100 + 10 + 3 = 113 DU > 16 → 8 批。 */
const HEAVY = {
  key: 'heavy',
  title: '一张装不下的卡',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/plan-overcapacity-notice.test.ts 全绿',
  implementation: '改 src/domain/task/Footprint.ts 一处',
  footprint: { files: 100, anchors: 20, chars: 6000 },
}

/** 装得下的那张：1 + 1 + 0.4 = 2.4 DU（**不得**出现在清单里——误报会让人不再信这把尺子）。 */
const LIGHT = {
  key: 'light',
  title: '轻量卡',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/plan-overcapacity-notice.test.ts 全绿',
  implementation: '改 src/domain/limits.ts 一处',
  footprint: { files: 1, anchors: 2, chars: 800 },
}

let store: ReturnType<typeof makeTestStore>
let root: string
let deps: ReqboardToolDeps

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-oc-'))
  store = makeTestStore()
  deps = {
    store,
    now: () => Date.now(),
    toolTrace: new Map(),
    doneThrottleMs: 0,
    workspaceRoot: root,
  } as never
})

afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/**
 * 计划文档（decomposition.md）的任务表；`marker` 就是 FR-5 要求的标记那一格。
 *
 * 首列名必须是「计划 key」（2026-10-06 缺口 4 之四的 `plan_doc_task_table_incomplete` 硬门按这个
 * 表头认任务表；标记门禁是按行认的，与列名无关，故改名不影响它）。
 */
function planDoc(marker: string): string {
  return [
    '# 拆分计划（夹具）',
    '',
    '| 顺序 | 计划 key | 业务标题 | 超容量标记 |',
    '|---|---|---|---|',
    '| 1 | heavy | 一张装不下的卡 | ' + marker + ' |',
    '| 2 | light | 轻量卡 | — |',
    '',
  ].join('\n')
}

async function seed(status: RequirementStatus = 'decomposing'): Promise<void> {
  const r = {
    id: REQ, title: '超容量披露', description: '', status, blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('requirement-created', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const submitPlan = (tasks: unknown, capacity?: { roundDetailUnits?: number; markerGate?: 'enforce' | 'warn' }) =>
  submitPlanArtifact(
    capacity === undefined ? toUseCaseDeps(deps) : { ...toUseCaseDeps(deps), capacity },
    { path: PLAN_PATH, summary: '目标：超容量可见；做法：算出来 + 标出来', tasks },
    { agent: { id: W } },
  )

async function rejectedCode(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { ...(e.code !== undefined ? { code: e.code } : {}), message: e.message ?? '' }
  }
  throw new Error('本该被拒绝，却成功了')
}

describe('超容量在提交返回体结构化报出（FR-4）', () => {
  it('一张超容量卡 + 一张轻量卡：success 仍为 true，清单只含超容量那张', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议8批)'))

    const out = (await submitPlan([HEAVY, LIGHT])) as {
      success?: boolean
      overCapacity?: {
        key: string; title: string; detailUnits: number
        capacity: number; suggestedBatches: number; hint: string
      }[]
      capacityNote?: { source: string; value: number; calibrated: boolean }
    }

    // ① 软门禁：超容量**不是**错误（写成 reject 就没人能知情放行）
    expect(out.success).toBe(true)
    expect(out.overCapacity).toHaveLength(1)
    const item = out.overCapacity![0]!
    expect(item.key).toBe('heavy')
    expect(item.title).toBe('一张装不下的卡')
    expect(item.detailUnits).toBe(113)
    expect(item.capacity).toBe(LIMITS.roundDetailUnits)
    expect(item.suggestedBatches).toBe(8)
    // hint 是给人看的切分建议（按目录 / 按接口），不是空话
    expect(item.hint).toMatch(/按目录|按接口/)
    // ② 判据自述：这是常量不是运行时读数
    expect(out.capacityNote).toEqual({
      source: 'constant', value: LIMITS.roundDetailUnits, calibrated: false,
    })
  })

  it('只有轻量卡：overCapacity 是**空数组**（不是缺键；不误报）', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))

    const out = (await submitPlan([LIGHT])) as { success?: boolean; overCapacity?: unknown[] }
    expect(out.success).toBe(true)
    expect(out.overCapacity).toEqual([])
    expect(Object.prototype.hasOwnProperty.call(out, 'overCapacity')).toBe(true)
  })

  it('配置 roundDetailUnits=8 时判据随配置走（capacityNote.source=config，批数按 8 算）', async () => {
    await seed()
    // 113 / 8 = 14.125 → 15 批（标记必须按**判定值**写，不是按常量 16 算的 8 批）
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议15批)'))

    const out = (await submitPlan([HEAVY], { roundDetailUnits: 8 })) as {
      success?: boolean
      overCapacity?: { suggestedBatches: number }[]
      capacityNote?: { source: string; value: number; calibrated: boolean }
    }
    expect(out.success).toBe(true)
    expect(out.overCapacity?.[0]?.suggestedBatches).toBe(15)
    expect(out.capacityNote).toEqual({ source: 'config', value: 8, calibrated: false })
  })
})

describe('计划文档标记在场校验（FR-5）', () => {
  it('超容量卡在计划文档里没有标记 → 拒绝，消息点名 key 与期望批数', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))

    const err = await rejectedCode(submitPlan([HEAVY, LIGHT]))
    expect(err.code).toBe('plan_overcapacity_marker_missing')
    expect(err.message).toContain('heavy')
    expect(err.message).toContain('8')
    // 拒绝零副作用：计划没进台账
    expect((await store.get(REQ))?.plan).toBeUndefined()
  })

  it('标记批数写错（建议1批，判定为 8）→ 同样拒绝（披露与判定不许漂移）', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议1批)'))

    const err = await rejectedCode(submitPlan([HEAVY]))
    expect(err.code).toBe('plan_overcapacity_marker_missing')
    expect(err.message).toContain('heavy')
    expect(err.message).toContain('8')
  })

  it('标记正确（⚠️超容量(建议8批)）→ 提交通过且返回体清单非空', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议8批)'))

    const out = (await submitPlan([HEAVY, LIGHT])) as { success?: boolean; overCapacity?: unknown[] }
    expect(out.success).toBe(true)
    expect(out.overCapacity).toHaveLength(1)
    expect((await store.get(REQ))?.plan?.tasks).toHaveLength(2)
  })

  it('markerGate=warn + 无标记 → 不拒绝，但 gaps 仍**响亮**出现在返回体里', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))

    const out = (await submitPlan([HEAVY], { markerGate: 'warn' })) as {
      success?: boolean
      overCapacity?: unknown[]
      marker_warnings?: string[]
    }
    expect(out.success).toBe(true)
    expect(out.overCapacity).toHaveLength(1)
    // 降级的是**拒绝**，不是披露——静默失效是本仓明令反对的形态
    expect(out.marker_warnings).toHaveLength(1)
    expect(out.marker_warnings![0]).toContain('heavy')
    expect(out.marker_warnings![0]).toContain('8')
    expect((await store.get(REQ))?.plan?.tasks).toHaveLength(1)
  })

  it('门禁返回的 gaps 逐卡点名 key 与期望批数（结构化契约，不只是消息文本）', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('—'))
    const report = await checkOverCapacityMarkerGate(
      toUseCaseDeps(deps).docs,
      { id: REQ },
      [{ key: 'heavy', suggestedBatches: 8 }],
      'enforce',
    )
    expect(report.failure?.code).toBe('plan_overcapacity_marker_missing')
    expect(report.gaps).toHaveLength(1)
    expect(report.gaps[0]).toContain('heavy')
    expect(report.gaps[0]).toContain('8')
  })

  it('计划文档不存在 → 早退放行（与 assertClauseCoverageGate 同一惯例，不凭不存在判违规）', async () => {
    await seed()
    // 故意不落盘：没有文档就没有可查的依据。
    // 直接调门禁函数（提交路径本身要求计划文档落盘，可打开性门禁在它更前面，
    // 故"缺文件早退"这条语义只能在门禁自身的 seame 上钉）。
    const report = await checkOverCapacityMarkerGate(
      toUseCaseDeps(deps).docs,
      { id: REQ },
      [{ key: 'heavy', suggestedBatches: 8 }],
      'enforce',
    )
    expect(report.failure).toBeUndefined()
    expect(report.gaps).toEqual([])
  })
})

describe('经工具壳的同一路径（入参 schema 收下 footprint，出参不被绑定层丢掉）', () => {
  it('reqboard_submit(kind=plan) 提交超容量卡：返回体照旧带 overCapacity 与 capacityNote', async () => {
    await seed()
    stubDocFile(PLAN_PATH, root, planDoc('⚠️超容量(建议8批)'))
    // 工具壳（不是直接调用例）：这一条钉的是**缝**——入参 schema 是否收下 footprint、
    // 出参的 overCapacity/capacityNote 是否到了调用方手里（未声明键会被绑定层拒收）。
    const tool = definePlanSubmitTool(deps) as { execute: (a: unknown, e: unknown) => Promise<any> }
    const out = (await tool.execute(
      { path: PLAN_PATH, summary: '目标：壳层贯通；做法：提交带体量的计划', tasks: [HEAVY] },
      { agent: { id: W } },
    )) as { success?: boolean; overCapacity?: { key: string }[]; capacityNote?: { calibrated: boolean } }

    expect(out.success).toBe(true)
    expect(out.overCapacity?.[0]?.key).toBe('heavy')
    expect(out.capacityNote?.calibrated).toBe(false)
  })
})

describe('容量配置的解析（FR-3）', () => {
  it('非有限正数一律回落常量，且如实回显来源', () => {
    expect(resolveRoundCapacity()).toEqual({ value: LIMITS.roundDetailUnits, source: 'constant' })
    expect(resolveRoundCapacity({ capacity: {} })).toEqual({ value: LIMITS.roundDetailUnits, source: 'constant' })
    expect(resolveRoundCapacity({ capacity: { roundDetailUnits: 0 } }))
      .toEqual({ value: LIMITS.roundDetailUnits, source: 'constant' })
    expect(resolveRoundCapacity({ capacity: { roundDetailUnits: -3 } }))
      .toEqual({ value: LIMITS.roundDetailUnits, source: 'constant' })
    expect(resolveRoundCapacity({ capacity: { roundDetailUnits: Number.NaN } }))
      .toEqual({ value: LIMITS.roundDetailUnits, source: 'constant' })
    expect(resolveRoundCapacity({ capacity: { roundDetailUnits: 8 } })).toEqual({ value: 8, source: 'config' })
  })

  it('标记门禁缺省 enforce；只认 warn 一个降级值', () => {
    expect(markerGateOf()).toBe('enforce')
    expect(markerGateOf({ capacity: {} })).toBe('enforce')
    expect(markerGateOf({ capacity: { markerGate: 'warn' } })).toBe('warn')
    expect(markerGateOf({ capacity: { markerGate: 'nonsense' as never } })).toBe('enforce')
  })
})

/**
 * 复核补洞（2026-10-04）：门禁此前**硬编码**读 `decomposition.md`，而提交路径
 * 是 `reqboard_submit(kind=plan)` 的 agent 可传参数——计划提交到别处时标记无人查、
 * 也不报警，成了一条**静默放行**面。这两条用例把"读实际提交的那份"钉住。
 */
describe('标记门禁读的是实际提交的那份计划（非默认路径不许静默放行）', () => {
  const CUSTOM_PATH = 'docs/requirements/' + REQ + '/custom-plan.md'

  it('提交到非默认路径且无标记 → 照样拒绝（不是静默放行）', async () => {
    await seed()
    stubDocFile(CUSTOM_PATH, root, planDoc('—'))
    const r = await rejectedCode(submitPlanArtifact(
      toUseCaseDeps(deps),
      { path: CUSTOM_PATH, summary: '提交到非默认路径', tasks: [HEAVY] },
      { agent: { id: W } },
    ))
    expect(r.code).toBe('plan_overcapacity_marker_missing')
  })

  it('非默认路径文档里标记正确 → 通过（门禁真的读了那份文件）', async () => {
    await seed()
    stubDocFile(CUSTOM_PATH, root, planDoc('⚠️超容量(建议8批)'))
    const out = (await submitPlanArtifact(
      toUseCaseDeps(deps),
      { path: CUSTOM_PATH, summary: '提交到非默认路径', tasks: [HEAVY] },
      { agent: { id: W } },
    )) as { success?: boolean }
    expect(out.success).toBe(true)
  })
})

/**
 * ── t6：超容量看得见（二）·批准前摆在人眼前（FR-4、FR-6）─────────────────────────
 *
 * t5 把超容量**算出来**了，但它只出现在提交返回体里——而批准这个动作恰恰发生在
 * 「没人再回头看返回体」的时刻。本组用例钉的是人批准前/批准时**真的看得见的那两处文本**：
 *   ① agent 路径：`reqboard_ask_confirm`（target=plan）的题干；
 *   ② 看板路径：`POST /req/plan/approve` 写下的台账评论。
 * 两处**共用同一份摘要文本**（`domain/task/Footprint.overCapacitySummary`）——各写一套措辞
 * 就是两处真相，迟早漂移。
 *
 * 反例方向同样钉住（T8b）：无超容量卡时题干必须与改造前**逐字节相同**——
 * 这条不是"顺带"，因为批准题干是本仓唯一一个人会反复读的文本，给它加一个分隔符
 * 也是行为变更，而回归测试只会在别人踩到时才发现。
 */

/** 批准弹框题干（本组用例只关心"批准前摆出来的文本"，不关心落章推进）。 */
const PLAN_QUESTION = '计划已完成，是否批准进入拆分？'

/**
 * 改造前的 plan 题干（**逐字节**冻结的基准）。T8b 用它与实现后的输出做全等比较：
 * 该常量在本文件写下的那一刻（实现尚未改）就已实测等于 popupQuestion，故它是"改造前形态"，
 * 不是"照实现抄回来的期望值"。
 */
const PLAN_QUESTION_BEFORE = PLAN_QUESTION
  + '（批准后将自动拆分任务卡并立即开跑，中途不再打断；如需干预可在看板暂停或取消）'

/** 体量夹具：113 DU（100 + 10 + 3）> 容量 16 → 建议 8 批；23 DU → 建议 2 批。 */
const ocTask = (key: string, footprint: { files: number; anchors: number; chars: number }) => ({
  key,
  title: key + ' 卡',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/plan-overcapacity-notice.test.ts 全绿',
  implementation: '改 src/domain/task/Footprint.ts 一处',
  footprint,
})
const OC_HEAVY = ocTask('heavy', { files: 100, anchors: 20, chars: 6000 })
const OC_MEDIUM = ocTask('t-medium', { files: 20, anchors: 4, chars: 2000 })
const OC_LIGHT = ocTask('light', { files: 1, anchors: 2, chars: 800 })

/** 播种「计划已提交、待人批准」（tasks 直接进台账——本组用例不经过提交路径）。 */
async function seedPlan(tasks: unknown[]): Promise<void> {
  await seed('decomposing')
  await store.mutate(REQ, (r) => {
    r.plan = {
      path: PLAN_PATH,
      summary: '夹具计划',
      submittedAt: 1,
      submittedBy: { kind: 'agent' },
      tasks,
    } as never
    return { changed: true }
  })
}

/**
 * 捕获批准弹框的题干。以**非肯定项**作答：本组用例只回答"批准前文本里有什么"，
 * 一旦点"确认"就会牵动落章/推进，断言重心被拖到闸门与队列上。
 */
async function planPopupQuestion(tasks: unknown[], capacity?: { roundDetailUnits?: number }): Promise<string> {
  await seedPlan(tasks)
  const seen: string[] = []
  const svc = {
    // 原始服务的入参是 `{ questions, agent, signal }`（**不是**题目数组）——
    // 取错形状会静默捕获到 ''，而"空字符串不包含超容量"会让本组用例全体假绿。
    ask: async (req: { questions?: { question?: string }[] }) => {
      seen.push(req.questions?.[0]?.question ?? '')
      return { answers: [{ id: 'confirm', selected: ['需要修改'] }] }
    },
  }
  const uc = {
    ...toUseCaseDeps({ ...deps, userQuestions: () => svc }),
    ...(capacity === undefined ? {} : { capacity }),
  }
  await askConfirm(uc, { target: 'plan', question: PLAN_QUESTION }, { agent: { id: W } })
  return seen[0] ?? ''
}

/** 造一个最小 HTTP 请求（照 tests/reqboard/board-plan-approve.test.ts 的既有写法）。 */
function fakeReq(body: unknown, url: string): never {
  const r = new EventEmitter() as never as { url: string; method: string; [Symbol.asyncIterator]: unknown }
  r.url = url
  r.method = 'POST'
  ;(r as unknown as Record<symbol, unknown>)[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return r as never
}

function fakeRes(): { statusCode: number; payload?: { success: boolean; data?: Record<string, unknown> } } {
  const res = new EventEmitter() as unknown as Record<string, unknown>
  res['statusCode'] = 0
  res['writeHead'] = (code: number) => { res['statusCode'] = code; return res }
  res['end'] = (text?: string) => { res['payload'] = text === undefined ? undefined : JSON.parse(text); return res }
  return res as never
}

/** 走真路由批准（不装配 applicationDeps ⇒ 只落章 + 写评论，不牵动落库与 RTM 之外的东西）。 */
async function approveViaBoard(tasks: unknown[]): Promise<Record<string, unknown>> {
  await seedPlan(tasks)
  const uc = toUseCaseDeps(deps)
  const handler = createReqboardHandler({
    requirementStore: store,
    taskStore: taskStoreOf(deps),
    now: () => Date.now(),
    docs: uc.docs,
  })
  const res = fakeRes()
  await handler(fakeReq({ id: REQ }, '/dashboard/api/reqboard/req/plan/approve'), res as never)
  expect(res.statusCode).toBe(200)
  return res.payload?.data as Record<string, unknown>
}

describe('t6 批准前摆在人眼前：弹框题干（FR-6）', () => {
  it('T8a 题干含超容量卡 key 与**各自的**建议批数（一个数字糊弄不了）', async () => {
    const q = await planPopupQuestion([OC_HEAVY, OC_MEDIUM, OC_LIGHT])

    // 既有后缀一字不少（披露是**追加**，不是替换）
    expect(q).toContain('批准后将自动拆分任务卡并立即开跑')
    // 摘要自带「超容量 N 张：」标签；调用方不再拼一遍（双写会读成两张不同的清单）
    expect(q).toContain('超容量 2 张：')
    expect(q).toContain('heavy(建议8批)')
    expect(q).toContain('t-medium(建议2批)')
    // 装得下的卡**不得**出现在清单里（误报会让人不再信这把尺子）
    expect(q).not.toContain('light')
  })

  it('T8c 看板批准：台账评论追加超容量一句；无超容量时不追加、响应体形状不变', async () => {
    const data = await approveViaBoard([OC_HEAVY, OC_MEDIUM, OC_LIGHT])
    const req = (await store.get(REQ))!
    const body = String(req.comments.find((c) => c.body.includes('[计划] 已批准（人）'))?.body ?? '')
    // 看板路径唯一能被人看见的载体就是这条评论（响应体刻意不加字段）
    expect(body).toContain('已批准（人）')
    expect(body).toContain('超容量 2 张')
    expect(body).toContain('heavy(建议8批)')
    expect(body).toContain('t-medium(建议2批)')
    expect(body).toContain('详见计划文档标记')
    // 响应体形状：除既有 landing 外**一个键都不许多**（声明了没人消费的字段就是契约漂移）
    const recordKeys = Object.keys((await store.get(REQ))!)
    expect(Object.keys(data).sort()).toEqual([...recordKeys, 'landing'].sort())
    expect(Object.keys(data)).not.toContain('overCapacity')

    // 反向：全是装得下的卡 → 评论里不许多出一句（"零超容量也报一句"会让这句话变成噪音）
    const clean = await approveViaBoard([OC_LIGHT])
    const cleanBody = String((await store.get(REQ))!.comments.find((c) => c.body.includes('[计划] 已批准（人）'))?.body ?? '')
    expect(cleanBody).not.toContain('超容量')
    expect(Object.keys(clean).sort()).toEqual([...Object.keys((await store.get(REQ))!), 'landing'].sort())
  })

  it('T8d 六张超容量卡：摘要压缩后题干仍不超过 popupQuestionMax，且如实标出省略', async () => {
    // key 拉长是为了**逼出压缩**：短 key 时 6 张卡能整段装进 120 字符预算，用例就成了摆设。
    const many = [0, 1, 2, 3, 4, 5].map((i) => ocTask('heavy-card-' + String(i).padStart(10, '0'), { files: 100, anchors: 20, chars: 6000 }))
    const q = await planPopupQuestion(many)

    expect(q.length).toBeLessThanOrEqual(LIMITS.popupQuestionMax)
    expect(q).toContain('超容量 6 张')
    // 「声称省略就必须真的省略」：压缩掉了卡片就得留下省略标记（不是悄悄少印几张）
    expect(q).toContain('…等')
    // 题干尾部没有被 popupQuestionMax 拦腰截断（截断也满足长度上限，但读不出省略了几张）
    expect(q.endsWith('张')).toBe(true)
  })

  it('T8b 无超容量卡：题干与改造前**逐字节相同**（字符串全等，不是包含）', async () => {
    const q = await planPopupQuestion([OC_LIGHT])
    // 全等而非 toContain：摘要的"空"必须连分隔符都不留（`超容量` 之外的一个「；」也是行为变更）
    expect(q).toBe(PLAN_QUESTION_BEFORE)
    expect(q).not.toContain('超容量')
    expect(q.length).toBe(PLAN_QUESTION_BEFORE.length)
  })
})
