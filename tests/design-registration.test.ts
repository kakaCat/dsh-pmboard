/**
 * kind=design 登记用例单测（REQ-260924213231-b1c4 T-3 · serves FR-1）
 *
 * 验收口径（interfaces.md I-1 / test-cases.md TC-1、TC-19 前半）：
 *  - 首次 `reqboard_submit(kind=design)` 扫 design/ 登记 5 份，`registered_count=5`，
 *    台账出现 5 条 kind=design 产物；
 *  - 二次调用幂等：`registered_count=0`，条目数仍为 5；
 *  - 空目录 / 无 .md → `registered_count=0` 且 `success=false` + 如实说明（不谎报成功）；
 *  - `path` 单份登记仍走可打开性校验（伪路径 / 不存在当场拒）；
 *  - 登记后 G2 不再报 missing_artifact（登记入口确实被闸门读到）。
 */
import { makeHarness } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { taskStoreAt } from './queue/route-deps.js'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { defineSubmitTool } from '../src/tools/index.js'
import { assertArtifactGates } from '../src/application/internal/artifact-gates.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-design-reg-001'
const OTHER = 'session-design-reg-999'
const REQ = 'REQ-261003000003-d3e1'
const DESIGN5 = ['architecture.md', 'data-model.md', 'interfaces.md', 'test-cases.md', 'use-cases.md']
const DESIGN_DIR = 'docs/requirements/' + REQ + '/design'

let root: string
// B12 阶段③a：存储换统一工厂的新端口
let h: ReturnType<typeof makeHarness>
let store: ReturnType<typeof makeHarness>['store']

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-design-reg-'))
  h = makeHarness({})
  store = h.store
})
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

const depsWith = () =>
  ({

    store,

    taskStore: taskStoreAt(root),
    docs: new FileDocRepository({ workspaceRoot: root }),
    clock: new SystemClock(),
    ids: new RandomIdFactory(),
    session: new SessionProbeAdapter({}),
    questions: new UserQuestionsAdapter(() => undefined),
    doneThrottleMs: 0,
  }) as never

const run = (args: unknown, agentId = W): Promise<any> =>
  (defineSubmitTool(depsWith()) as any).execute(args, { agent: { id: agentId } })

async function seed(sourceSessionId = W): Promise<void> {
  const r = {
    id: REQ, title: '设计登记', description: '', status: 'design', category: 'feature', blocked: false,
    sourceSessionId, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [], artifacts: [] as StageArtifact[],
  } as unknown as RequirementRecord
  // 原样导入（保持记录字段原值；seedRequirementSync 会因 create+回填把 version 顶到 2）
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

function writeDesign(names: readonly string[]): void {
  mkdirSync(join(root, DESIGN_DIR), { recursive: true })
  for (const n of names) writeFileSync(join(root, DESIGN_DIR, n), '# ' + n + '\n')
}

const designArtifacts = async (): Promise<StageArtifact[]> =>
  ((await store.get(REQ))?.artifacts ?? []).filter(a => a.kind === 'design')

describe('TC-1 正向：扫 design/ 登记 5 份，二次幂等', () => {
  it('首次 registered_count=5 且 5 条 kind=design 入簿；二次 registered_count=0', async () => {
    await seed()
    writeDesign(DESIGN5)

    const first = await run({ kind: 'design' })
    expect(first.success).toBe(true)
    expect(first.requirement_id).toBe(REQ)
    expect(first.registered_count).toBe(5)
    expect(await designArtifacts()).toHaveLength(5)
    // 逐份态：磁盘有 / 已登记 / 未落章
    expect(first.design_docs).toHaveLength(5)
    for (const d of first.design_docs) {
      expect(d.on_disk).toBe(true)
      expect(d.registered).toBe(true)
      expect(d.confirmed).toBe(false)
      expect(d.path).toBe(DESIGN_DIR + '/' + d.name)
    }
    expect(first.design_docs.map((d: any) => d.name).sort()).toEqual([...DESIGN5].sort())

    const second = await run({ kind: 'design' })
    expect(second.success).toBe(true)
    expect(second.registered_count).toBe(0)
    expect(await designArtifacts()).toHaveLength(5)
    for (const d of second.design_docs) expect(d.registered).toBe(true)
  })

  it('部分新增：已登记 5 份后再落盘第 6 份，registered_count 只数本次新增（=1）', async () => {
    await seed()
    writeDesign(DESIGN5)
    await run({ kind: 'design' })
    writeFileSync(join(root, DESIGN_DIR, 'risks.md'), '# risks\n')
    const out = await run({ kind: 'design' })
    expect(out.registered_count).toBe(1)
    expect(await designArtifacts()).toHaveLength(6)
  })

  it('登记后 G2 读得到（不再 missing_artifact，转为待确认）', async () => {
    await seed()
    writeDesign(DESIGN5)
    await run({ kind: 'design' })
    const failure = assertArtifactGates((await store.get(REQ)) as RequirementRecord, 'design', 'decomposing')
    expect(failure?.code).toBe('artifact_not_confirmed')
    expect(failure?.code).not.toBe('missing_artifact')
  })
})

describe('TC-19 前半 · 边界：空目录返回 0 且不谎报成功', () => {
  it('design/ 不存在 → registered_count=0、success=false、零产物入簿', async () => {
    await seed()
    const out = await run({ kind: 'design' })
    expect(out.registered_count).toBe(0)
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——design 软失败回执只带 note/registered_count（实测 code=undefined），实现缺口只上报。
    expect(out.note).toContain('未发现可登记的设计文档')
    expect(await designArtifacts()).toHaveLength(0)
    // 必交清单仍逐份回报（on_disk=false），让 agent 知道还差哪份
    expect(out.design_docs).toHaveLength(5)
    for (const d of out.design_docs) expect(d.on_disk).toBe(false)
  })

  it('design/ 存在但只有非 .md → 同样 0 且不谎报', async () => {
    await seed()
    mkdirSync(join(root, DESIGN_DIR), { recursive: true })
    writeFileSync(join(root, DESIGN_DIR, 'notes.txt'), 'x')
    const out = await run({ kind: 'design' })
    expect(out.registered_count).toBe(0)
    expect(out.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f)：无码可断——design 软失败回执只带 note/registered_count（实测 code=undefined），实现缺口只上报。
    expect(await designArtifacts()).toHaveLength(0)
  })
})

describe('I-1 path 语义：单份登记 + 可打开性校验', () => {
  it('给了 path 只登记该份', async () => {
    await seed()
    writeDesign(DESIGN5)
    const out = await run({ kind: 'design', path: DESIGN_DIR + '/architecture.md' })
    expect(out.registered_count).toBe(1)
    expect((await designArtifacts()).map(a => a.path)).toEqual([DESIGN_DIR + '/architecture.md'])
    const again = await run({ kind: 'design', path: DESIGN_DIR + '/architecture.md' })
    expect(again.registered_count).toBe(0)
  })

  it('伪路径（..）→ REQBOARD_ARTIFACT_NOT_OPENABLE', async () => {
    await seed()
    await expect(run({ kind: 'design', path: 'docs/../etc/passwd' })).rejects.toThrow(/REQBOARD_ARTIFACT_NOT_OPENABLE/)
  })

  it('文件不存在 → REQBOARD_FILE_MISSING', async () => {
    await seed()
    await expect(run({ kind: 'design', path: DESIGN_DIR + '/nope.md' })).rejects.toThrow(/REQBOARD_FILE_MISSING/)
  })
})

describe('归属校验', () => {
  it('本窗口未绑定需求 → REQBOARD_NO_BOUND_REQ', async () => {
    await seed(OTHER)
    await expect(run({ kind: 'design' })).rejects.toThrow(/REQBOARD_NO_BOUND_REQ/)
  })
})
