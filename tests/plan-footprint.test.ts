/**
 * 声明与证据的对账（REQ-261002175818-80a8 t5 / FR-2）：缩水与形状非法的**拒绝**路径。
 *
 * 为什么断言「台账零变更」而不只断言抛错：拒绝的全部价值在于**零副作用**——
 * 计划进了台账却报了错，是最坏的一种半成功（人以为没提交，实际躺着一条待批计划，
 * 下一次提交还会撞上"计划已批准需 change_note"这类下游状态）。故直接比对拒绝前后
 * 那条需求记录的逐字节快照，而不是只看 `plan === undefined`。
 *
 * 为什么走**用例层**（不过工具壳）：t5 交付的是判定与门禁（SubmitArtifact +
 * content-gate-wiring）；工具壳与入参 schema 是 t3 的范围，另有
 * tests/output-contract.test.ts 与 tests/plan-footprint-tool-schema.test.ts 守着。
 * 两条缝各自钉住一件事，本文件只回答「判定有没有生效」。
 * 夹具照 tests/plan-footprint-propagation.test.ts（真 store + stubDocFile 落 decomposition.md），
 * 但把 workspaceRoot 显式指到临时目录——stubDocFile 的缺省根是进程级临时目录，
 * 显式传根才能把"写在哪"与"读在哪"钉成同一个值，并在 afterEach 里确定性地清干净。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { submitPlanArtifact } from '../src/application/use-cases/SubmitArtifact.js'
import { stubDocFile, toUseCaseDeps, type ReqboardToolDeps } from './helpers/tool-deps.js'
import type { RequirementRecord, RequirementStatus } from '../src/shared/protocol.js'

const W = 'session-pf-001'
const REQ = 'REQ-pf0001'
const PLAN_PATH = 'docs/requirements/' + REQ + '/decomposition.md'
/** implementation 里点到的三个路径（去重计数 = 3，即 FR-2 的声明下限）。 */
const THREE_PATHS = '改 src/domain/task/Footprint.ts、src/domain/limits.ts 与 tests/plan-footprint.test.ts'

/**
 * 计划文档夹具：**任务表必须收录 tasks[] 的 key**（2026-10-06 缺口 4 之四的
 * `plan_doc_task_table_incomplete` 硬门——文档里没这张卡 = 批准人没看见它）。
 * 本文件出现过的计划 key 都在表里。
 */
const PLAN_DOC = [
  '# 拆分计划（' + REQ + '）',
  '',
  '## 任务表',
  '',
  '| 计划 key | 标题 | 依赖 | 工作量 | 验收标准 |',
  '|---|---|---|---|---|',
  ...['shrunk', 'malformed', 'undeclared', 'roomy'].map(
    k => `| ${k} | 夹具占位标题 | — | M | 跑 npx vitest run tests/plan-footprint.test.ts 全绿 |`,
  ),
  '',
].join('\n')

let store: ReturnType<typeof makeTestStore>
let root: string
let deps: ReqboardToolDeps

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-pf-'))
  store = makeTestStore()
  deps = {
    store,
    now: () => Date.now(),
    toolTrace: new Map(),
    doneThrottleMs: 0,
    workspaceRoot: root,
  } as never
  stubDocFile(PLAN_PATH, root, PLAN_DOC)
})

afterEach(() => { rmSync(root, { recursive: true, force: true }) })

async function seed(status: RequirementStatus = 'decomposing'): Promise<void> {
  const r = {
    id: REQ, title: '声明与证据对账', description: '', status, blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('requirement-created', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const submitPlan = (tasks: unknown) =>
  submitPlanArtifact(
    toUseCaseDeps(deps),
    { path: PLAN_PATH, summary: '目标：声明与证据对账；做法：先缩水再补齐', tasks },
    { agent: { id: W } },
  )

/** 拒绝前后那条需求记录的逐字节快照（拒绝零副作用的可证伪形态）。 */
const snapshot = async (): Promise<string> => JSON.stringify(await store.get(REQ))

async function rejectedCode(p: Promise<unknown>): Promise<{ code?: string; message: string }> {
  try {
    await p
  } catch (err) {
    const e = err as { code?: string; message?: string }
    return { ...(e.code !== undefined ? { code: e.code } : {}), message: e.message ?? '' }
  }
  throw new Error('本该被拒绝，却成功了')
}

describe('声明与证据的对账（FR-2）', () => {
  it('声明缩水（files:1，implementation 点 3 个路径）→ REQBOARD_BAD_FOOTPRINT，且台账零变更', async () => {
    await seed()
    const before = await snapshot()
    const err = await rejectedCode(submitPlan([{
      key: 'shrunk',
      title: '缩水的声明',
      phase: 'implement',
      side: 'backend',
      acceptance: 'npx vitest run tests/plan-footprint.test.ts 全绿',
      implementation: THREE_PATHS,
      footprint: { files: 1, anchors: 3, chars: 1200 },
    }]))

    expect(err.code).toBe('REQBOARD_BAD_FOOTPRINT')
    // 消息必须给出**实际路径计数**与修复指引（只说"非法"使用者无法自查）
    expect(err.message).toContain('3')
    expect(err.message).toContain('src/domain/task/Footprint.ts')
    expect(await snapshot()).toBe(before)
  })

  it('footprint 形状非法（缺 anchors）→ REQBOARD_BAD_FOOTPRINT，消息点名缺哪个字段，台账零变更', async () => {
    await seed()
    const before = await snapshot()
    const err = await rejectedCode(submitPlan([{
      key: 'malformed',
      title: '形状非法的声明',
      phase: 'implement',
      side: 'backend',
      acceptance: 'npx vitest run tests/plan-footprint.test.ts 全绿',
      implementation: THREE_PATHS,
      footprint: { files: 3, chars: 1200 },
    }]))

    expect(err.code).toBe('REQBOARD_BAD_FOOTPRINT')
    expect(err.message).toContain('anchors')
    expect(await snapshot()).toBe(before)
  })

  it('未声明 footprint → 不判定（照旧通过，落库卡上**没有**该键，绝不冒充 0）', async () => {
    await seed()
    const out = (await submitPlan([{
      key: 'undeclared',
      title: '未声明体量',
      phase: 'implement',
      side: 'backend',
      acceptance: 'npx vitest run tests/plan-footprint.test.ts 全绿',
      implementation: THREE_PATHS,
    }])) as { success?: boolean; overCapacity?: unknown[] }

    expect(out.success).toBe(true)
    // 未声明 = 不判定：不该出现在超容量清单里，也不该报错（FR-9 / A7）
    expect(out.overCapacity).toEqual([])
    const saved = (await store.get(REQ))!
    const card = saved.plan?.tasks?.[0]
    expect(card?.key).toBe('undeclared')
    expect(Object.prototype.hasOwnProperty.call(card, 'footprint')).toBe(false)
  })

  it('声明留余量（files:5 > 3 个路径）→ 通过（单向约束：只堵缩水，不逼人写等号）', async () => {
    await seed()
    const out = (await submitPlan([{
      key: 'roomy',
      title: '留余量的声明',
      phase: 'implement',
      side: 'backend',
      acceptance: 'npx vitest run tests/plan-footprint.test.ts 全绿',
      implementation: THREE_PATHS,
      footprint: { files: 5, anchors: 3, chars: 1200 },
    }])) as { success?: boolean }

    expect(out.success).toBe(true)
    expect((await store.get(REQ))?.plan?.tasks?.[0]?.footprint).toEqual({ files: 5, anchors: 3, chars: 1200 })
  })
})
