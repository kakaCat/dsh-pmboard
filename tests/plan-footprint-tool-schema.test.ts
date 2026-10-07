/**
 * 工具门面：体量进得来、超容量出得去（REQ-261002175818-80a8 t3 / FR-1、FR-4）。
 *
 * 为什么这条必须走**真工具壳**：工具入参 schema 是 `additionalProperties:false`，
 * 未声明的键在**绑定层**就被拒（连 execute 都进不去）。t2 的贯通用例为了测「契约与映射」
 * 刻意绕过了壳层，于是这条产品主入口当时**根本没有用例**——复核者把它列为 P0 并指出
 * t2 用例名与真实可达性不符。本文件补的就是那一条。
 *
 * 修前必红：schema 未声明 `footprint` 时，本文件第一条会以
 * `invalid arguments: "tasks[0].footprint" is not a declared property` 失败。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  definePlanSubmitTool,
  stubDocFile,
  resolveWorkspaceRoot,
  type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-ts-001'
const REQ = 'REQ-ts0001'
const PLAN_PATH = 'docs/requirements/' + REQ + '/decomposition.md'

let store: ReturnType<typeof makeTestStore>
let deps: ReqboardToolDeps
let tool: { execute: (a: unknown, e: unknown) => Promise<any> }

/** 计划文档夹具：任务表必须收录 tasks[] 的 key（2026-10-06 `plan_doc_task_table_incomplete` 硬门）。 */
const PLAN_DOC = [
  '# 拆分计划（夹具）',
  '',
  '| 计划 key | 标题 | 依赖 | 工作量 | 验收标准 |',
  '|---|---|---|---|---|',
  '| fp1 | 体量算术落地 | — | M | 跑 npx vitest run 全绿 |',
  '| fp2 | 下游卡 | fp1 | M | 跑 npx vitest run 全绿 |',
  '',
].join('\n')

beforeEach(() => {
  store = makeTestStore()
  deps = { store, now: () => Date.now(), toolTrace: new Map(), doneThrottleMs: 0 } as never
  tool = definePlanSubmitTool(deps) as never
  stubDocFile(PLAN_PATH, undefined, PLAN_DOC)
})

afterEach(() => {
  // REQ-261006201814-ac4f u3：与 stubDocFile 的落点保持一致（临时根），不再清仓库路径。
  rmSync(join(resolveWorkspaceRoot(), 'docs/requirements', REQ), { recursive: true, force: true })
})

async function seed(): Promise<void> {
  const r = {
    id: REQ, title: '工具门面', description: '', status: 'decomposing', blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
    statusHistory: [{ status: 'draft', at: 1, by: { kind: 'human' } }],
  } as RequirementRecord
  await store.replaceAll('requirement-created', {
    schemaVersion: 9, revision: 0, requirements: [r], triages: [],
  })
}

const TASK = {
  key: 'fp1',
  title: '体量算术落地',
  phase: 'implement',
  side: 'backend',
  acceptance: 'npx vitest run tests/round-capacity.test.ts 全绿',
  implementation: '改 src/domain/task/Footprint.ts 与 src/domain/limits.ts',
}

const submit = (tasks: unknown) =>
  tool.execute({ path: PLAN_PATH, summary: '目标：体积进得来；做法：先声明 schema', tasks }, { agent: { id: W } })

describe('工具门面：入参 schema 必须收下 footprint（P0）', () => {
  it('带 footprint 的 tasks 能进 execute（不被 additionalProperties:false 拒收）', async () => {
    await seed()
    const out = await submit([{ ...TASK, footprint: { files: 2, anchors: 3, chars: 1200 } }])
    expect(out.plan_status).toBe('pending_approval')
    expect(out.task_count).toBe(1)
  })

  it('不带 footprint 的老计划照旧能进（未声明是正常态）', async () => {
    await seed()
    const out = await submit([TASK])
    expect(out.plan_status).toBe('pending_approval')
  })

  it('footprint 形状非法 → 用例层的专用错误码（不是绑定层的 schema 错误）', async () => {
    await seed()
    await expect(submit([{ ...TASK, footprint: { files: 1 } }])).rejects.toThrow(/REQBOARD_BAD_FOOTPRINT/)
  })

  it('footprint 里出现未声明的键 → 绑定层拒收（壳层同时守住形状）', async () => {
    await seed()
    await expect(
      submit([{ ...TASK, footprint: { files: 2, anchors: 3, chars: 1200, extra: 1 } }]),
    ).rejects.toThrow(/not a declared property|invalid arguments/)
  })
})

/**
 * 2026-10-06 缺口 4 之三/④：两个新键必须**在壳层声明**（additionalProperties:false 下未声明即被拒），
 * 且各自的门禁语义要真的生效——本仓已在 `footprint` / `prototypeRefs` 上栽过三次「静默丢弃」。
 */
describe('工具门面：skip_integration_reason 与 dep_reasons 也被收下（schema + 门禁）', () => {
  it('skipIntegration 带理由 → 进 execute 并落到台账的 plan.tasks 上', async () => {
    await seed()
    const out = await submit([{ ...TASK, skipIntegration: true, skip_integration_reason: '纯文档卡，无运行时接口' }])
    expect(out.plan_status).toBe('pending_approval')
    const saved = (await store.get(REQ))!.plan!.tasks[0]!
    expect(saved.skipIntegration).toBe(true)
    expect(saved.skipIntegrationReason).toBe('纯文档卡，无运行时接口')
  })

  it('skipIntegration 缺理由 → 代码级硬拒不落库（理由必填，不是无声放行）', async () => {
    await seed()
    await expect(submit([{ ...TASK, skipIntegration: true }]))
      .rejects.toThrow(/REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED/)
    expect((await store.get(REQ))!.plan).toBeUndefined()
  })

  it('camel 拼法 skipIntegrationReason 等价（两种写法都认，避免写法差异变成静默漏判）', async () => {
    await seed()
    const out = await submit([{ ...TASK, skipIntegration: true, skipIntegrationReason: '只改 CI 脚本，不进 HTTP 边界' }])
    expect(out.plan_status).toBe('pending_approval')
    expect((await store.get(REQ))!.plan!.tasks[0]!.skipIntegrationReason).toBe('只改 CI 脚本，不进 HTTP 边界')
  })

  it('dep_reasons 写成 "上游key=一句话" 数组 → 归一成 map 落台账（map 形态在本 schema DSL 里表达不了）', async () => {
    await seed()
    const out = await submit([
      { ...TASK, key: 'fp1', title: '上游卡' },
      { ...TASK, key: 'fp2', title: '下游卡', depends_on: ['fp1'], dep_reasons: ['fp1=上游重建队列文件，本卡读它，虽无同名文件但有时序约束'] },
    ])
    expect(out.plan_status).toBe('pending_approval')
    const saved = (await store.get(REQ))!.plan!.tasks.find(t => t.key === 'fp2')!
    expect(saved.dep_reasons).toEqual({ fp1: '上游重建队列文件，本卡读它，虽无同名文件但有时序约束' })
  })
})
