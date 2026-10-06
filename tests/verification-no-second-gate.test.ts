/**
 * 验收门重复提交不得开出第二个框（REQ-261006164732-6503 t5 · serves: FR-1, FR-3）。
 *
 * 现场：验收材料常常要**重复提交**（补材料、改结论）。修前每次提交都会走 `await askConfirm` 再弹一次，
 * 于是"同一道验收门两个框"跟拆分门是同一种病；中间那次若被点，还会把已落章的 `confirmedAt` 覆写。
 *
 * 本文件用**真实用例** `submitVerification`（defineVerifySubmitTool）跑两次提交，钉住两件事：
 *   ① 第二次提交在门未答时被写路径守卫拦下（`REQBOARD_CONFIRM_PENDING`）——上游就断了第二个框的来源；
 *   ② 弹框通道不可用时**不建门**（不制造一张没人能答的票去钉窗口）。
 * 注：绕过 submit 直接调 `reqboard_ask_confirm` 的路径由 t3/t4 的用例覆盖（复用原票）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { defineVerifySubmitTool, seedQueueTasks, type ReqboardToolDeps } from './helpers/tool-deps.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

const W = 'session-t5-verify'
const REQ_ID = 'REQ-t5verify'

let dir: string
let store: ReturnType<typeof makeTestStore>
let verify: { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }
let askCalls: number
/** 让用例能自己收尾那个"不作答"的弹框（用盒子装，避免 TS 把变量收窄成 never）。 */
const askBox: { fn?: (v: unknown) => void } = {}
/** 本用例装配的挂起门注册表（断言"有没有留下没人能答的票"）。 */
let reg: PendingConfirmRegistry

const mk = (over: Partial<TaskRecord> & { id: string; acceptance: string }): TaskRecord => ({
  requirementId: REQ_ID, title: '任务', description: '', phase: 'implement' as const, side: 'backend' as const,
  dependsOn: [], scope: { apis: [], tables: [], files: [] }, context: '', status: 'done' as const,
  blocked: false, executions: [], comments: [], version: 1, createdAt: 1, updatedAt: 1,
  createdBy: { kind: 'agent', sessionId: W }, updatedBy: { kind: 'agent', sessionId: W },
  ...over,
} as unknown as TaskRecord)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-t5-'))
  mkdirSync(join(dir, 'tests'), { recursive: true })
  writeFileSync(join(dir, 'tests', 'real.test.ts'), '// 真实存在的锚点\n')
  store = makeTestStore()
  askCalls = 0
  askBox.fn = undefined
})

/** 轮询等待条件成立（后台/并发路径含异步落盘，固定 sleep 会 flaky）。 */
async function waitFor(fn: () => boolean, ms = 3000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('waitFor 超时')
    await new Promise(r => setTimeout(r, 5))
  }
}

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

/** 弹框先不作答（把 resolver 交给用例控制）：第一道门保持 open，才谈得上"复用"。
 *  注意必须装配 `pendingConfirms` 注册表——没有它就没有"在途门"这个概念，去重无从谈起。 */
function makeDeps(): ReqboardToolDeps {
  reg = new PendingConfirmRegistry({ now: () => Date.now() })
  return {
    store,
    now: () => Date.now(),
    workspaceRoot: dir,
    pendingConfirms: reg,
    userQuestions: () => ({
      ask: () => { askCalls += 1; return new Promise((res) => { askBox.fn = res }) },
    }),
  }
}

async function seed(): Promise<void> {
  const r = {
    id: REQ_ID, title: '验收门复用', description: '', status: 'implementing', category: 'feature',
    blocked: false, sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  await seedQueueTasks(makeDeps(), REQ_ID, [
    mk({ id: 't-parent', title: '父卡', acceptance: 'npx vitest run tests/real.test.ts 全绿' }),
  ])
}

describe('t5 · 验收门重复提交只复用不开新框', () => {
  it('第二次提交：在途门未答时被写路径守卫拦下（响亮），且没有再弹第二个框', async () => {
    await seed()
    const deps = makeDeps()
    verify = defineVerifySubmitTool(deps) as never
    await seedQueueTasks(deps, REQ_ID, [
      mk({ id: 't-parent', title: '父卡', acceptance: 'npx vitest run tests/real.test.ts 全绿' }),
    ])

    // 第一次提交：它会停在弹框上（G4 是 await 形态），门由此建好并保持 open
    askBox.fn = undefined
    const first = verify.execute({ summary: '交付', evidence: ['npx vitest run tests/real.test.ts'] }, { agent: { id: W } })
    await waitFor(() => askCalls === 1)

    // 第二次提交：**在到达建门入口之前**就被「收到作答前不得产出下游产物」的守卫拦下
    // （这是同一条不变量的更上游落点：不但不弹第二个框，连下游产物都不产出）
    await expect(verify.execute({ summary: '交付（补材料）', evidence: ['npx vitest run tests/real.test.ts'] }, { agent: { id: W } }))
      .rejects.toMatchObject({ code: 'REQBOARD_CONFIRM_PENDING' })
    expect(askCalls).toBe(1)   // 没有第二个框

    // 收尾：让第一次那口弹框得到否定作答，门随之 settle，调用干净退出（避免悬挂句柄）
    ;(askBox.fn as ((v: unknown) => void) | undefined)?.({ answers: [{ id: 'confirm', selected: ['暂停'] }] })
    const firstOut = await first
    expect(firstOut.success).toBe(true)
  })

  it('弹框通道不可用时不建门：窗口不被一张没人能答的票钉住', async () => {
    await seed()
    const deps: ReqboardToolDeps = { store, now: () => Date.now(), workspaceRoot: dir }  // 不装配 userQuestions
    verify = defineVerifySubmitTool(deps) as never
    await seedQueueTasks(deps, REQ_ID, [
      mk({ id: 't-parent', title: '父卡', acceptance: 'npx vitest run tests/real.test.ts 全绿' }),
    ])

    const out = await verify.execute({ summary: '交付', evidence: ['npx vitest run tests/real.test.ts'] }, { agent: { id: W } })
    expect(out.success).toBe(true)
    expect(String(out.note)).toContain('未建门')
    // 台账上没有任何挂起门（不钉窗口）
    expect(reg.findOpen({ requirementId: REQ_ID, target: 'artifact', kind: 'verification' })).toBeUndefined()
  })
})
