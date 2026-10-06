/**
 * 后台续跑路径上的迟到作答（REQ-261006164732-6503 t7 · serves: FR-5）。
 *
 * 与 t6 的分工：t6 在**落章实现**里判"这道门还算不算数"（覆盖需求已推进等情形）；
 * 本文件的场景更靠前也更隐蔽——**票已经被落定了**（被取代、被清理、被中止），
 * 而那条弹框的后台续跑还在等作答；人这时才点它，续跑回调照样会去调落章实现。
 *
 * 现场就是这一笔：门 A 的票被清理后，人 2.5 秒后点它 → `approvedAt` 被覆写成 16:42:13.402。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeTestStore } from './application/harness.js'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { suspendConfirm, type ConfirmSubmitted } from '../src/application/internal/pending-confirm.js'
import type { UseCaseDeps } from '../src/application/ports.js'
import type { RequirementRecord } from '../src/shared/protocol.js'

const W = 'session-t7-stale'
const REQ = 'REQ-t7stale'

let dir: string
let store: ReturnType<typeof makeTestStore>
let deps: UseCaseDeps
let reg: PendingConfirmRegistry

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'pmboard-t7-'))
  store = makeTestStore()
  reg = new PendingConfirmRegistry({ now: () => 1000 })
  deps = {
    store,
    docs: new FileDocRepository({ workspaceRoot: dir }),
    clock: { now: () => 1000 },
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    pendingConfirms: reg,
  } as unknown as UseCaseDeps
  await store.replaceAll('seed', {
    schemaVersion: 9, revision: 0, triages: [],
    requirements: [{
      id: REQ, title: '迟到作答', description: '', status: 'decomposing', blocked: false,
      sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
      createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [],
    } as unknown as RequirementRecord],
  })
})

afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

async function waitFor(fn: () => boolean, ms = 2000): Promise<void> {
  const start = Date.now()
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('waitFor 超时')
    await new Promise(r => setTimeout(r, 5))
  }
}

const submitted: ConfirmSubmitted = {
  requirementId: REQ, windowKey: W, target: 'plan', kind: 'decomposition',
  question: '拆分计划已提交，请批准', optionLabels: ['确认'], advance: true,
}

describe('t7 · 票已落定后的迟到作答不再落章', () => {
  it('失效票的作答：不调落章实现（spy 计数 0）、台账零新时间戳、多一条留痕', async () => {
    const ticket = reg.register({ windowKey: W, requirementId: REQ, target: 'plan' }).ticket
    reg.settle(ticket, { confirmed: false, advanced: false })   // 被取代 / 被清理

    let settleCalls = 0
    suspendConfirm(
      deps,
      Promise.resolve([{ id: 'confirm', selected: ['确认，推进到下一阶段 (Recommended)'] }]),
      submitted,
      ticket,
      async () => { settleCalls += 1; return { success: true, confirmed: true, advanced: true, note: '不该走到这里' } },
    )

    await waitFor(() => (store.peek(REQ)?.comments.length ?? 0) > 0)
    expect(settleCalls).toBe(0)                                   // 失效路径**没有**调落章实现
    const after = store.peek(REQ)!
    expect(after.plan?.approvedAt).toBeUndefined()                // 台账零新时间戳
    expect(after.comments[after.comments.length - 1]?.body).toContain('迟到作答未生效')
    expect(after.comments[after.comments.length - 1]?.body).toContain('已被取代')
  })

  it('未失效票的作答：照旧走落章实现（对照，行为不变）', async () => {
    const ticket = reg.register({ windowKey: W, requirementId: REQ, target: 'plan' }).ticket

    let settleCalls = 0
    suspendConfirm(
      deps,
      Promise.resolve([{ id: 'confirm', selected: ['确认，推进到下一阶段 (Recommended)'] }]),
      submitted,
      ticket,
      async () => { settleCalls += 1; return { success: true, confirmed: true, advanced: true, note: '正常落章' } },
    )

    await waitFor(() => settleCalls > 0)
    expect(settleCalls).toBe(1)
    expect(reg.get(ticket, W)?.outcome?.confirmed).toBe(true)     // 回填的仍是真实结果
  })
})
