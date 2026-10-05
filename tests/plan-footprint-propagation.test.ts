/**
 * 体量声明的端到端贯通（REQ-261002175818-80a8 t2 / FR-7）。
 *
 * 为什么必须端到端锁这条：本仓在**同一条路**上栽过两次——`stages` 与 `requirement_refs`
 * 都「只到协议层为止」，拆分节点写了、落库卡上却是空的，而**没有任何测试会红**。
 * 体量声明走的是同一串手写映射（normalizePlanTasks → PlanTaskDraft → TaskRecord），
 * 所以本用例只认**队列卡上的实际值**，不认任何中间层的自述。
 *
 * 为什么直接调用例而不过工具壳：工具入参 schema 属于 **t3**（工具门面）的范围，
 * 而计划把 t3 排在 t2 之后——经工具壳调用会被 `additionalProperties:false` 挡在门外，
 * 测的就不是本卡的东西了。本卡测「契约与四处映射」，壳层端到端在 t3 的验收里。
 *
 * 反向证伪（手工执行一次并留痕）：把 `normalizePlanTasks` 里白名单搬运的
 * `...(footprint !== undefined ? { footprint } : {})` 删掉 → 本文件第一个用例必须变红。
 * 「删掉就红」才是这条线会响的证据；只写正向断言等于没测。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { join } from 'node:path'
import { createReqboardHandler } from '../src/http/routes.js'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
import {
  defineDecomposeTool,
  stubDocFile,
  taskStoreOf,
  toUseCaseDeps,
  type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-fp-001'
const REQ = 'REQ-fp0001'
const PLAN_PATH = 'docs/requirements/' + REQ + '/decomposition.md'

let store: ReturnType<typeof makeTestStore>
let decompose: { execute: (a: unknown, e: unknown) => Promise<any> }
let handler: ReturnType<typeof createReqboardHandler>
let deps: ReqboardToolDeps
const queueTasksOf = (reqId: string) => taskStoreOf(deps).listByRequirement(reqId)

beforeEach(() => {
  store = makeTestStore()
  deps = { store, now: () => Date.now(), toolTrace: new Map(), doneThrottleMs: 0 } as never
  decompose = defineDecomposeTool(deps) as never
  handler = createReqboardHandler({
    requirementStore: store,
    taskStore: taskStoreOf(deps),
    now: () => Date.now(),
  })
  stubDocFile(PLAN_PATH)
})

afterEach(() => {
  // 夹具按既有惯例落盘到工作区根（见 stubDocFile 注释）；这里只清自己那个**合成 id** 的目录，不留垃圾。
  rmSync(join(process.cwd(), 'docs/requirements', REQ), { recursive: true, force: true })
})

async function seed(
  status: RequirementStatus = 'decomposing',
  plan?: Record<string, unknown>,
): Promise<void> {
  const r = {
    id: REQ, title: '体量声明贯通', description: '', status, blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
    ...(plan !== undefined ? { plan } : {}),
  } as RequirementRecord
  await store.replaceAll('requirement-created', {
    schemaVersion: 9, revision: 0, requirements: [r], triages: [],
  })
}

const run = (tool: { execute: (a: unknown, e: unknown) => Promise<any> }, args: unknown) =>
  tool.execute(args, { agent: { id: W } })

/** 一张带体量声明的卡：声明 2 个文件 ≥ implementation 里点到的 2 个路径（恰好等于，合法）。 */
const TASK_WITH_FOOTPRINT = [{
  key: 'fp1',
  title: '体量算术落地',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/round-capacity.test.ts 全绿',
  implementation: '改 src/domain/task/Footprint.ts 与 src/domain/limits.ts',
  footprint: { files: 2, anchors: 3, chars: 1200 },
}]

const submitPlan = (tasks: unknown = TASK_WITH_FOOTPRINT) =>
  submitPlanArtifact(
    toUseCaseDeps(deps),
    { path: PLAN_PATH, summary: '目标：体量贯通；做法：契约先行再落库', tasks },
    { agent: { id: W } },
  )

function fakeReq(body: unknown): any {
  const req = new EventEmitter() as any
  req.url = '/dashboard/api/reqboard/req/plan/approve'
  req.method = 'POST'
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}
function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}
async function approvePlan() {
  const res = fakeRes()
  await handler(fakeReq({ id: REQ }), res)
  return res
}

describe('体量声明端到端贯通（FR-7）', () => {
  it('计划里的体量声明活着走到队列卡上，且三个字段逐字相同', async () => {
    await seed()
    const out = (await submitPlan()) as { plan_status?: string }
    expect(out.plan_status).toBe('pending_approval')

    // ① 台账的 plan.tasks 上必须有（这一步就能抓住「白名单丢弃」）
    const afterSubmit = (await store.get(REQ))!
    expect(afterSubmit.plan?.tasks?.[0]?.footprint).toEqual({ files: 2, anchors: 3, chars: 1200 })

    // ② 人批准（真 HTTP 全链路）
    const approved = await approvePlan()
    expect(approved.statusCode).toBeLessThan(400)

    // ③ 落库
    await run(decompose, {})

    // ④ 队列卡上逐字相同——这是唯一可信的验收面
    const cards = await queueTasksOf(REQ)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.footprint).toEqual({ files: 2, anchors: 3, chars: 1200 })
  })

  it('未声明的卡落库后**没有** footprint 键（未声明 ≠ 0）', async () => {
    await seed()
    const { footprint: _omit, ...withoutFootprint } = TASK_WITH_FOOTPRINT[0]!
    await submitPlan([withoutFootprint])
    await approvePlan()
    await run(decompose, {})

    const cards = await queueTasksOf(REQ)
    expect(cards).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(cards[0], 'footprint')).toBe(false)
  })

  it('声明小于证据 → 提交即被拒（下限在协议层就生效，不靠落库时兜）', async () => {
    await seed()
    const undersized = [{ ...TASK_WITH_FOOTPRINT[0]!, footprint: { files: 1, anchors: 3, chars: 1200 } }]
    await expect(submitPlan(undersized)).rejects.toThrow(/REQBOARD_BAD_FOOTPRINT/)
    const after = (await store.get(REQ))!
    expect(after.plan).toBeUndefined() // 拒绝零副作用：计划没进台账
  })
})

/**
 * 2026-10-04 复核补的两个覆盖洞（此前变异后仍然全绿，属真实盲区）。
 *
 * 洞 1：`approved-plan-landing.draftOf` 是**看板批准**与**弹框批准**两条生产落库路径的承载者，
 *   但缺省 `applicationDeps` 时看板路由只落章不落库（见 requirements.ts 的如实说明），
 *   于是原用例的落库实际由随后的 `reqboard_decompose` 完成 —— `draftOf` 从没被执行过。
 * 洞 2：`Decompose.ts` 的**创作型**（显式传 tasks）映射与「计划携带任务表」是两条独立手写映射，
 *   原用例只走了后者。
 */
function handlerWithAppDeps() {
  return createReqboardHandler({
    requirementStore: store,
    taskStore: taskStoreOf(deps),
    applicationDeps: toUseCaseDeps(deps),
    now: () => Date.now(),
  })
}

async function approvePlanWith(h: ReturnType<typeof createReqboardHandler>) {
  const res = fakeRes()
  await h(fakeReq({ id: REQ }), res)
  return res
}

describe('复核补洞：看板/弹框批准的落库路径（draftOf）', () => {
  it('经看板批准**直接落库**时，卡上就带体量声明（不依赖随后的 decompose）', async () => {
    await seed()
    await submitPlan()
    const res = await approvePlanWith(handlerWithAppDeps())
    expect(res.statusCode).toBeLessThan(400)
    const cards = await queueTasksOf(REQ)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0]!.footprint).toEqual({ files: 2, anchors: 3, chars: 1200 })
  })
})

describe('复核补洞：创作型 decompose 路径（Decompose 第一条映射）', () => {
  const creative = [{
    key: 'fp1',
    title: '体量算术落地',
    acceptance: 'npx vitest run tests/round-capacity.test.ts 全绿',
    implementation: '改 src/domain/task/Footprint.ts 与 src/domain/limits.ts',
    footprint: { files: 2, anchors: 3, chars: 1200 },
  }]

  /**
   * 这条分支**只在计划没有任务表时才可达**（legacy 计划）：有计划表时走
   * 「落库内容以批准的计划为准」那条（Decompose.ts 的同段注释），创作型入参只做 key 一致性校验。
   * 我第一版用例误把后者当成了前者，属于复核者点出的「测的不是它以为的那条路」。
   */
  const legacyPlan = { path: PLAN_PATH, summary: 'legacy 计划：无任务表', tasks: [], approvedAt: 1 }

  it('计划无任务表时（legacy），创作型传入的体量声明贯通到卡上', async () => {
    await seed('decomposing', legacyPlan)
    await run(decompose, { tasks: creative })
    const cards = await queueTasksOf(REQ)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.footprint).toEqual({ files: 2, anchors: 3, chars: 1200 })
  })

  it('计划无任务表时，创作型省略体量 → 卡上没有该键（未声明 ≠ 0）', async () => {
    await seed('decomposing', legacyPlan)
    const { footprint: _omit, ...without } = creative[0]!
    await run(decompose, { tasks: [without] })
    const cards = await queueTasksOf(REQ)
    expect(cards).toHaveLength(1)
    expect(Object.prototype.hasOwnProperty.call(cards[0], 'footprint')).toBe(false)
  })
})

describe('复核发现：计划携带任务表时，落库以**批准的计划**为准', () => {
  it('创作型入参里的体量声明**不会**覆盖计划里的声明（计划赢）', async () => {
    await seed()
    await submitPlan() // 计划里 fp1 声明 { files: 2, anchors: 3, chars: 1200 }
    await approvePlan()
    await run(decompose, {
      tasks: [{
        key: 'fp1',
        title: '体量算术落地',
        acceptance: 'npx vitest run tests/round-capacity.test.ts 全绿',
        implementation: '改 src/domain/task/Footprint.ts 与 src/domain/limits.ts',
        footprint: { files: 9, anchors: 9, chars: 9 },
      }],
    })
    const cards = await queueTasksOf(REQ)
    expect(cards).toHaveLength(1)
    // 批准的计划才是权威：卡上是 2/3/1200，不是入参里的 9/9/9
    expect(cards[0]!.footprint).toEqual({ files: 2, anchors: 3, chars: 1200 })
  })
})
