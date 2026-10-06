/**
 * `reqboard_submit(kind=prototype)` 的**豁免三态**用例（REQ-261005105032-3b02 t10 · serves FR-1 / FR-4）。
 *
 * 设计口径（architecture ⑤「豁免生效条件」+ 决议 #7 / D-13）：
 *   · 理由空                     → **拒**（豁免要写清为什么不要原型）；
 *   · 理由非空但 requirement 未落章 → **拒**（agent 不能自己给自己发豁免，须先请人确认需求文档）；
 *   · 理由非空 + requirement 已落章 → **放行**：登记零份原型，并写一条需求评论 `[豁免] <理由>`。
 *
 * 为什么"拒"是响亮抛错（而不是 `success=false`）：与卡面「仍拒」同字——`reqboard_submit(kind=prototype)`
 * 是 agent 宣告"本需求原型义务已了"的入口，写歪的豁免声明若只回一个 `success=false`，agent 很容易
 * 当成"登记了但没文件"继续往下走，到设计阶段才被存在门拦下（白干一轮）。理由空/未落章 = 豁免**无效**，
 * 与「压根没声明豁免」是两件事，故两者用不同通道报告（后者是"还没画"，给结构化 blockers 就够了）。
 *
 * 与 `design_exempt` 同款：无效豁免一律当场拒（既有 `missingCategoryDocs` 的处置）。
 */
import { makeHarness } from './application/harness.js'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { taskStoreAt } from './queue/route-deps.js'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { FileDocRepository } from '../src/adapters/FileDocRepository.js'
import { SystemClock } from '../src/adapters/SystemClock.js'
import { RandomIdFactory } from '../src/adapters/RandomIdFactory.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { defineSubmitTool } from '../src/tools/index.js'
import type { RequirementRecord, StageArtifact } from '../src/shared/protocol.js'

const W = 'session-proto-exempt-001'
const REQ = 'REQ-261005105032-p2'
const REQ_DIR = 'docs/requirements/' + REQ
const PROTO_DIR = REQ_DIR + '/prototypes'
const REQ_MD = REQ_DIR + '/requirement.md'
/** 豁免理由原文（留痕断言按它逐字核）。 */
const REASON = '纯文案微调，人已确认本需求不要原型'

let root: string
let h: ReturnType<typeof makeHarness>
let store: ReturnType<typeof makeHarness>['store']

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-proto-exempt-'))
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

/** requirement 产物（决定豁免是否"人已确认"的唯一凭据：`confirmedAt`）。 */
const requirementArtifact = (confirmed: boolean): StageArtifact => ({
  stage: 'brainstorming', kind: 'requirement', path: REQ_MD, registeredAt: 1, registeredBy: { kind: 'human' },
  ...(confirmed ? { confirmedAt: 2, confirmedBy: { kind: 'human' } } : {}),
})

async function seed(artifacts: StageArtifact[] = []): Promise<void> {
  const r = {
    id: REQ, title: '豁免三态', description: '', status: 'brainstorming', category: 'feature', blocked: false,
    sourceSessionId: W, comments: [], version: 1, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, statusHistory: [], artifacts,
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
}

function write(rel: string, text: string): void {
  const abs = join(root, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
  // 夹具自检：写没落盘就别往下断言（否则夹具问题会伪装成"豁免判定错了"）
  expect(existsSync(abs)).toBe(true)
}

/** 成功断言带诊断：失败时把 blockers/note 一起抛出来（见 submit-prototype.test.ts 同名助手）。 */
function expectOk(out: any): void {
  expect(out.success, '未放行：blockers=' + JSON.stringify(out.blockers ?? []) + ' / note=' + String(out.note)).toBe(true)
}

/** requirement.md：front-matter 行由用例给（sides / prototype_exempt）。 */
function requirementMd(fm: readonly string[]): string {
  return ['---', 'req: ' + REQ, ...fm, '---', '', '# 需求说明', '', '### FR-4: 原型锚点', 'x', ''].join('\n')
}

const DETAIL_HTML = [
  '<!doctype html><html><body>',
  '<section id="FR-4">标签区</section>',
  '<!-- proto-geometry {"observations":[{"name":"tabsTop","value":576,"unit":"px",',
  '"at":{"width":1280,"state":"inflight"}}]} -->',
  '</body></html>',
].join('\n')

const comments = async (): Promise<string[]> => ((await store.get(REQ))?.comments ?? []).map(c => c.body)
const protoArtifacts = async (): Promise<StageArtifact[]> =>
  ((await store.get(REQ))?.artifacts ?? []).filter(a => a.kind === 'prototype')

describe('豁免三态①：理由为空 → 仍拒', () => {
  it('写prototype_exempt 但理由为空 → REQBOARD_MISSING_PROTOTYPE（点名「理由为空」），零副作用', async () => {
    await seed([requirementArtifact(true)])
    write(REQ_MD, requirementMd(['sides: [frontend]', 'prototype_exempt:   ']))

    await expect(run({ kind: 'prototype' })).rejects.toThrow(/REQBOARD_MISSING_PROTOTYPE/)
    await expect(run({ kind: 'prototype' })).rejects.toThrow(/理由为空/)
    expect(await protoArtifacts()).toHaveLength(0)
    expect(await comments()).toEqual([])
  })
})

describe('豁免三态②：理由非空但 requirement 未落章 → 仍拒（agent 不能自豁免）', () => {
  it('有理由、requirement 未落章 → REQBOARD_MISSING_PROTOTYPE（点名「未落章」），零副作用', async () => {
    await seed([requirementArtifact(false)])
    write(REQ_MD, requirementMd(['sides: [frontend]', 'prototype_exempt: ' + REASON]))

    await expect(run({ kind: 'prototype' })).rejects.toThrow(/REQBOARD_MISSING_PROTOTYPE/)
    await expect(run({ kind: 'prototype' })).rejects.toThrow(/未落章/)
    await expect(run({ kind: 'prototype' })).rejects.toThrow(/agent 不能自己豁免自己/)
    expect(await protoArtifacts()).toHaveLength(0)
    expect(await comments()).toEqual([])
    // 补齐路径必须可执行：要么交原型（骨架 + 工具命令），要么请人确认 requirement 产物
    await expect(run({ kind: 'prototype' })).rejects.toThrow(/templates\/brainstorming\/prototype\.html/)
    await expect(run({ kind: 'prototype' })).rejects.toThrow(/reqboard_ask_confirm/)
  })

  it('requirement.md 缺失（front-matter 读不到）→ 按「未声明豁免」处理，仍不谎报成功', async () => {
    await seed()
    const out = await run({ kind: 'prototype' })
    expect(out.success).toBe(false)
    expect(out.blockers.join(' ')).toContain('prototype_missing')
  })
})

describe('豁免三态③：理由非空 + requirement 已落章 → 放行并留痕', () => {
  it('放行（registered_count=0）并写一条 [豁免] <理由> 需求评论', async () => {
    await seed([requirementArtifact(true)])
    write(REQ_MD, requirementMd(['sides: [frontend]', 'prototype_exempt: ' + REASON]))

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.requirement_id).toBe(REQ)
    expect(out.registered_count).toBe(0)
    expect(out.prototypes).toEqual([])
    expect(out.note).toContain('已豁免原型')
    const bodies = await comments()
    expect(bodies.some(b => b.startsWith('[豁免] ' + REASON))).toBe(true)
  })

  it('重复调用不刷屏：同一理由只留一条豁免评论', async () => {
    await seed([requirementArtifact(true)])
    write(REQ_MD, requirementMd(['sides: [frontend]', 'prototype_exempt: ' + REASON]))

    await run({ kind: 'prototype' })
    await run({ kind: 'prototype' })
    const exempt = (await comments()).filter(b => b.startsWith('[豁免] '))
    expect(exempt).toHaveLength(1)
  })

  it('豁免生效 + 盘上有原型 → 正常登记（豁免是"不要原型"，不是"不许有原型"）', async () => {
    await seed([requirementArtifact(true)])
    write(REQ_MD, requirementMd(['sides: [frontend]', 'prototype_exempt: ' + REASON]))
    write(PROTO_DIR + '/detail.html', DETAIL_HTML)

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.registered_count).toBe(1)
    expect(out.prototypes[0].exempted).toBe(REASON)
    const bodies = await comments()
    expect(bodies.some(b => b.startsWith('[原型] 登记'))).toBe(true)
    expect(bodies.some(b => b.startsWith('[豁免] ' + REASON))).toBe(true)
  })
})

describe('对照组：豁免声明写歪时也不得把正常登记拦下', () => {
  it('理由为空但有原型可登记 → 登记照常成功（豁免不参与判定）', async () => {
    await seed([requirementArtifact(true)])
    write(REQ_MD, requirementMd(['sides: [frontend]', 'prototype_exempt:   ']))
    write(PROTO_DIR + '/detail.html', DETAIL_HTML)

    const out = await run({ kind: 'prototype' })
    expectOk(out)
    expect(out.registered_count).toBe(1)
    expect(out.prototypes[0].exempted).toBeUndefined() // 未生效的豁免不注入读数
  })

  it('压根没写豁免 + 没有原型 → 结构化失败（不抛），与"豁免写歪"分属两条通道', async () => {
    await seed([requirementArtifact(true)])
    write(REQ_MD, requirementMd(['sides: [frontend]']))

    const out = await run({ kind: 'prototype' })
    expect(out.success).toBe(false)
    expect(out.registered_count).toBe(0)
    expect(out.blockers.join(' ')).toContain('prototype_missing')
  })
})
