/**
 * 原型登记不产生挂起票——**回归用例**（REQ-261005200052-ce40 · serves: FR-1 / FR-2 / FR-6）。
 *
 * 由诊断探针转正（原 `tests/_probe-prototype-pin.test.ts`）。修前的实测序列：
 *
 * ```
 *   reqboard_submit(kind=prototype) → auto_confirm { triggered: true }
 *     → 2 秒宽限一过留下挂起票 pc-xxxxxx（kind=prototype，无人工确认门）
 *     → 同窗口紧接着的 reqboard_submit(kind=requirement) 被 REQBOARD_CONFIRM_PENDING 拒
 *     → 看板无该种类确认控件（门值域只有 requirement/design/decomposition/verification）⇒ 只能等 30 分钟
 * ```
 *
 * 修后断言翻转为「无票且可写」；三个断言各自承一条 FR：
 *   · FR-1 登记原型不再产生挂起票；
 *   · FR-2 无门的票本来就不该拦（本用例是真 fs + 真工具壳跑的端到端口径）；
 *   · FR-6 回归锁：这条链不许再退回「登记完就钉住窗口」。
 */
import { makeTestStore } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileHostFs } from '../src/adapters/FileHostFs.js'
import { taskStoreAt } from './queue/route-deps.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { PendingConfirmRegistry } from '../src/adapters/PendingConfirmRegistry.js'
import { defineSubmitTool } from '../src/tools/index.js'
import { ARTIFACT_CONFIRM_GATES } from '../src/shared/protocol.js'
import { livePendingConfirm } from '../src/application/internal/pending-guard.js'
import { assertNoPendingConfirm } from '../src/application/internal/support.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'
import type { UseCaseDeps } from '../src/application/ports.js'

const W = 'session-proto-nopin-001'
const REQ = 'REQ-261005200052-nopin'
const REQ_DIR = 'docs/requirements/' + REQ
const DETAIL = REQ_DIR + '/prototypes/detail.html'
const INDEX = REQ_DIR + '/prototypes/INDEX.md'
const REQ_MD = REQ_DIR + '/requirement.md'

let root: string
let store: ReturnType<typeof makeTestStore>
let registry: PendingConfirmRegistry

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-proto-nopin-'))
  store = makeTestStore()
  registry = new PendingConfirmRegistry({ now: () => Date.now() })
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

/** 弹框通道可用但**永不作答**：等价于「人不在旁边」——修前这正是留票的条件。 */
const never = new Promise<never>(() => {})
const depsWith = (): UseCaseDeps => ({
  store,
  taskStore: taskStoreAt(root),
  docs: new FileDocRepository({ workspaceRoot: root }),
  // REQ-261008020617-088f RF-3：hostFs 必填（强转构造的夹具最容易漏）
  hostFs: new FileHostFs(),
  clock: new SystemClock(),
  ids: new RandomIdFactory(),
  session: new SessionProbeAdapter({}),
  questions: new UserQuestionsAdapter(() => ({ ask: (): Promise<never> => never })),
  pendingConfirms: registry,
  doneThrottleMs: 0,
} as unknown as UseCaseDeps)

function write(rel: string, text: string): void {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
}

async function seed(artifacts: StageArtifact[] = []): Promise<void> {
  const r = {
    id: REQ, title: '原型登记不发票', description: '', status: 'brainstorming', category: 'feature', blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [], artifacts,
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('原型登记不钉窗口（REQ-261005200052-ce40 FR-1 / FR-2）', () => {
  it('登记成功后 2.4 秒仍无挂起票，本窗口写路径不被 REQBOARD_CONFIRM_PENDING 拦', async () => {
    await seed()
    write(REQ_MD, ['---', 'req: ' + REQ, 'sides: [frontend]', '---', '', '# 需求说明', '', '### FR-4: 锚点', 'x', ''].join('\n'))
    write(DETAIL, ['<!doctype html>', '<html><body>', '<section id="FR-4">标签区</section>',
      '<!-- proto-geometry {"observations":[{"name":"tabsTop","value":576,"unit":"px","at":{"width":1280,"state":"inflight"}}]} -->',
      '</body></html>', ''].join('\n'))
    write(INDEX, ['# 原型权威清单', '', '| 路径 | 状态 | 服务条款 | 被取代于 |', '|---|---|---|---|',
      '| prototypes/detail.html | authoritative | FR-4 | — |', ''].join('\n'))

    const deps = depsWith()
    const tool = defineSubmitTool(deps as never) as unknown as { execute: (a: unknown, c: unknown) => Promise<Record<string, unknown>> }
    const out = await tool.execute({ kind: 'prototype', requirement_id: REQ }, { agent: { id: W } })
    expect(out.success, '登记本身应当成功：blockers=' + JSON.stringify(out.blockers ?? [])).toBe(true)
    expect(out.registered_count).toBe(1)

    // FR-1：只发通知，不再请人确认（修前这里是 { triggered: true }）
    expect(out.auto_confirm).toEqual({ triggered: false, reason: expect.stringContaining('无需人工确认') })

    // 宽限 2 秒（auto-confirm 的赛跑窗口）过后仍**没有票**——修前这一步会拿到一张 pc- 票
    await sleep(2400)
    expect(await livePendingConfirm(deps, W)).toBeUndefined()
    expect(registry.pendingForWindow(W)).toBeUndefined()

    // FR-2 / FR-6：同窗口写路径放行（修前此处抛 REQBOARD_CONFIRM_PENDING）
    await expect(assertNoPendingConfirm(deps, W)).resolves.toBeUndefined()
  }, 15000)

  it('门值域里没有 prototype——这正是「无门的票不拦」的依据（FR-2 依据锁）', () => {
    const gateKinds = Object.values(ARTIFACT_CONFIRM_GATES)
    expect(gateKinds).not.toContain('prototype')
    expect([...gateKinds].sort()).toEqual(['decomposition', 'design', 'requirement', 'verification'])
  })
})
