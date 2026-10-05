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
  type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-ts-001'
const REQ = 'REQ-ts0001'
const PLAN_PATH = 'docs/requirements/' + REQ + '/decomposition.md'

let store: ReturnType<typeof makeTestStore>
let deps: ReqboardToolDeps
let tool: { execute: (a: unknown, e: unknown) => Promise<any> }

beforeEach(() => {
  store = makeTestStore()
  deps = { store, now: () => Date.now(), toolTrace: new Map(), doneThrottleMs: 0 } as never
  tool = definePlanSubmitTool(deps) as never
  stubDocFile(PLAN_PATH)
})

afterEach(() => {
  rmSync(join(process.cwd(), 'docs/requirements', REQ), { recursive: true, force: true })
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
