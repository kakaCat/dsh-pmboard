/**
 * verify 端点 + 对话分页游标（REQ-261006130057-7a43 · t-a85893 · serves: FR-6, FR-8）。
 *
 * 三组用例（与 design/test-cases.md 逐条对应）：
 *   · T-20 QueryVerify 装配：sheet/history/tracking/coverage/materials/pendingCount 六段
 *     与台账+RTM 一致；RTM 文件缺失时 tracking/coverage 缺省不抛（增强层降级）；
 *   · T-21 对话游标：`?before=<ts>&limit=40` 返回 `page{hasMore,before,total}`；
 *     越界/缺参走缺省；items 升序；
 *   · T-22 兼容：`DocsResponse.verification` 保留（旧前端不受影响）；
 *     旧服务端无 verify 端点 → 200 + port-unavailable 降级（前端据此走 degraded 文案）。
 *
 * 环境：vitest node。台账/队列走 tests/application/harness.ts 内存端口；RTM 是真实 YAML
 * 落盘（mkdtemp），因为被测的 readRTM / assembleTraceability 就是"读盘失败要降级"的主体——
 * 用内存桩替代它们等于把被测对象换成替身。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { EventEmitter } from 'node:events'
import { queryVerify, pendingCountOf, parseFrNames, frNamesOf } from '../src/application/query/QueryVerify.js'
import { queryDialogue, type DialogueSessionEventsPort } from '../src/application/query/QueryDialogue.js'
import { queryDocs } from '../src/application/query/QueryDocs.js'
import { createReqboardHandler } from '../src/http/routes.js'
import { rtmTraceIdOf } from '../src/domain/workflow/AcceptanceSheetSpec.js'
import type { PanelQueryDeps } from '../src/application/query/contracts.js'
import type { DocRepository } from '../src/application/ports.js'
import type {
  DialogueResponse,
  PanelResult,
  RequirementRecord,
  VerificationSheet,
  VerifyPanelResponse,
} from '../src/shared/protocol.js'
import { FakeDocs, FakeSession, makeHarness, makeTestStore, req } from './application/harness.js'
import { taskStoreAt } from './queue/route-deps.js'

const REQ_ID = 'REQ-261006130057-7a43'

/** 临时目录收集（afterEach 统一清）。 */
const tmpDirs: string[] = []
afterEach(() => {
  while (tmpDirs.length > 0) rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

function tmpWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pmboard-query-verify-'))
  tmpDirs.push(dir)
  return dir
}

/** 在当前验收单里造三项：task 源 pending、requirement 源 unverified、task 源 passed。 */
function sheetV2(): VerificationSheet {
  return {
    version: 2,
    generatedAt: 200,
    generatedBy: { kind: 'agent' },
    items: [
      { id: 'v2-1', source: { kind: 'task', taskId: 't-aaa' }, criterion: 'npx vitest run tests/x 全绿', evidence: [], status: 'pending' },
      { id: 'v2-2', source: { kind: 'requirement' }, criterion: '需求条款逐条有落点', evidence: [], status: 'unverified' },
      { id: 'v2-3', source: { kind: 'task', taskId: 't-bbb' }, criterion: 'tsc 零错', evidence: ['tsc 输出'], status: 'passed', result: 'exit 0', resultSource: 'agent' },
    ],
  }
}

function sheetV1(): VerificationSheet {
  return {
    version: 1,
    generatedAt: 100,
    generatedBy: { kind: 'agent' },
    items: [
      { id: 'v1-1', source: { kind: 'task', taskId: 't-aaa' }, criterion: '初版标准', evidence: [], status: 'failed', opinion: '缺冒烟输出' },
    ],
  }
}

/** 带完整 verification 的需求（sheet v2 + 历史 v1 + 提交材料）。 */
function verifyReq(over: Partial<RequirementRecord> = {}): RequirementRecord {
  return req({
    id: REQ_ID,
    status: 'accepting',
    verification: {
      summary: '交付完成：verify 端点 + 对话游标',
      evidence: ['npx vitest run tests/query-verify 全绿', 'pnpm exec tsc --noEmit 零错'],
      submittedAt: 300,
      submittedBy: { kind: 'agent' },
      sheet: sheetV2(),
      sheetHistory: [sheetV1()],
    },
    ...over,
  })
}

/** 写三份 RTM（design/decomposing/accepting）到 <root>/docs/requirements/<REQ_ID>/。 */
function seedRtm(root: string): void {
  const dir = join(root, 'docs', 'requirements', REQ_ID)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'rtm-design.yml'), [
    'metadata:',
    '  stage: design',
    'traceability:',
    '  fr_to_design:',
    '    FR-1: [§1]',
    '    FR-2: [§2]',
    '',
  ].join('\n'))
  writeFileSync(join(dir, 'rtm-decomposing.yml'), [
    'metadata:',
    '  stage: decomposing',
    'traceability:',
    '  fr_to_tasks:',
    '    FR-1: [t-aaa]',
    '    FR-3: [t-bbb]',
    '',
  ].join('\n'))
  writeFileSync(join(dir, 'rtm-accepting.yml'), [
    'metadata:',
    '  stage: accepting',
    'traceability:',
    '  fr_to_tests:',
    '    FR-1: [TC-1]',
    'acceptance_tracking:',
    '  - acceptance_id: v2-1',
    '    fr_id: t-aaa',
    '    status: pending',
    '  - acceptance_id: v2-2',
    '    fr_id: REQ-LEVEL',
    '    status: unverified',
    '  - acceptance_id: v2-3',
    '    fr_id: t-bbb',
    '    status: passed',
    '    judged_at: 400',
    '',
  ].join('\n'))
}

/** 组装面板依赖（verify 查询用得上 store / tasks / injections / sessions / workspaceRoot）。 */
function panelDeps(h: ReturnType<typeof makeHarness>, workspaceRoot?: string): PanelQueryDeps {
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: new FakeSession(),
    now: () => h.clock.t,
    ...(workspaceRoot !== undefined ? { workspaceRoot } : {}),
  }
}

/** 取出正常响应（降级即抛，避免断言落在降级信封上悄悄通过）。 */
function asOk(res: PanelResult<VerifyPanelResponse>): VerifyPanelResponse {
  if (res.available === false) throw new Error('期望正常响应，实际是降级：' + res.reason + ' / ' + res.note)
  return res
}

/* ------------------------------------------------------------------ T-20 */

describe('T-20 · QueryVerify 装配六段一致', () => {
  it('有验收单 + 有 RTM：sheet/history/tracking/coverage/materials/pendingCount 六段与两源一致', async () => {
    const root = tmpWorkspace()
    seedRtm(root)
    const h = makeHarness({ requirements: [verifyReq()] })
    const res = asOk(await queryVerify(panelDeps(h, root), { requirementId: REQ_ID }))

    // ① sheet 整份照抄（与 docs 面板同源，不重排字段）
    expect(res.sheet).toEqual(sheetV2())
    // ② history = sheetHistory
    expect(res.history).toEqual([sheetV1()])
    // ③ tracking = rtm-accepting.yml 的 acceptance_tracking（三行，形状照抄）
    expect(res.tracking).toHaveLength(3)
    expect(res.tracking!.map(t => t.fr_id)).toEqual(['t-aaa', 'REQ-LEVEL', 't-bbb'])
    expect(res.tracking![2]).toMatchObject({ acceptance_id: 'v2-3', status: 'passed', judged_at: 400 })
    // ④ coverage：FR 并集 → 三态布尔（design=fr_to_design、tasks=fr_to_tasks、tests=fr_to_tests）
    expect(res.coverage).toEqual({
      'FR-1': { design: true, tasks: true, tests: true },
      'FR-2': { design: true, tasks: false, tests: false },
      'FR-3': { design: false, tasks: true, tests: false },
    })
    // ④b frMap（D-10 返工）：三张映射**原样透出**——不 join、不裁剪、不补位，
    //     逐键与三份 rtm-*.yml 的 traceability 段落相同（FR-2 没有任务就照实没有）
    expect(res.frMap).toEqual({
      fr_to_design: { 'FR-1': ['§1'], 'FR-2': ['§2'] },
      fr_to_tasks: { 'FR-1': ['t-aaa'], 'FR-3': ['t-bbb'] },
      fr_to_tests: { 'FR-1': ['TC-1'] },
    })
    // ⑤ materials = 提交材料
    expect(res.materials).toEqual({
      summary: '交付完成：verify 端点 + 对话游标',
      evidence: ['npx vitest run tests/query-verify 全绿', 'pnpm exec tsc --noEmit 零错'],
    })
    // ⑥ pendingCount = pending(1) + unverified(1) = 2（与 pendingCountOf 单点同值）
    expect(res.pendingCount).toBe(2)
    expect(res.pendingCount).toBe(pendingCountOf(sheetV2()))

    // 两源对齐（design/interfaces.md §VerifyPanelResponse）：每个 sheet 项的
    // rtmTraceIdOf(source) 都能对上 tracking 的 fr_id——对齐键是既有单点函数，不各写一份。
    const trackingIds = new Set(res.tracking!.map(t => t.fr_id))
    for (const item of res.sheet!.items) {
      expect(trackingIds.has(rtmTraceIdOf(item.source))).toBe(true)
    }
  })

  it('RTM 文件缺失 → tracking/coverage/frMap 缺省不抛（增强层降级），其余四段照常', async () => {
    const root = tmpWorkspace() // 空工作区：没有任何 rtm-*.yml
    const h = makeHarness({ requirements: [verifyReq()] })
    const res = asOk(await queryVerify(panelDeps(h, root), { requirementId: REQ_ID }))
    expect(res.tracking).toBeUndefined()
    expect(res.coverage).toBeUndefined()
    expect(res.frMap).toBeUndefined()
    expect(res.sheet).toEqual(sheetV2())
    expect(res.pendingCount).toBe(2)
    expect(res.materials?.evidence).toHaveLength(2)
  })

  it('frMap 只搬不 join：RTM 里没有的键不许被补齐，空映射段整段缺省（不与 coverage 互相顶替）', async () => {
    const root = tmpWorkspace()
    const dir = join(root, 'docs', 'requirements', REQ_ID)
    mkdirSync(dir, { recursive: true })
    // 只有 design 一段：另两段照实缺省（禁「补一页空映射」冒充有数据）
    writeFileSync(join(dir, 'rtm-design.yml'), [
      'traceability:',
      '  fr_to_design:',
      '    FR-1: [design/frontend.md#原型页面]',
      '    FR-2: []',
      '',
    ].join('\n'))
    const h = makeHarness({ requirements: [verifyReq()] })
    const res = asOk(await queryVerify(panelDeps(h, root), { requirementId: REQ_ID }))
    expect(res.frMap).toEqual({ fr_to_design: { 'FR-1': ['design/frontend.md#原型页面'], 'FR-2': [] } })
    expect(Object.hasOwn(res.frMap!, 'fr_to_tasks')).toBe(false)
    expect(Object.hasOwn(res.frMap!, 'fr_to_tests')).toBe(false)
    // 覆盖链仍按 FR 并集给出（FR-2「设计 ✓」= 键在，即使它挂了零个成员）
    expect(res.coverage).toEqual({ 'FR-1': { design: true, tasks: false, tests: false }, 'FR-2': { design: true, tasks: false, tests: false } })
  })

  it('取根候选序（复核 P1-1）：需求声明根排第一——req.workspaceRoot 有 RTM、deps 根为空时仍出 tracking/coverage', async () => {
    const reqRoot = tmpWorkspace()
    seedRtm(reqRoot) // RTM 在需求自己的根下
    const sessionRoot = tmpWorkspace() // 会话根为空（跨工作区查看场景）
    const h = makeHarness({ requirements: [verifyReq({ workspaceRoot: reqRoot })] })
    const res = asOk(await queryVerify(panelDeps(h, sessionRoot), { requirementId: REQ_ID }))
    expect(res.tracking?.map(t => t.fr_id)).toEqual(['t-aaa', 'REQ-LEVEL', 't-bbb'])
    expect(res.coverage?.['FR-1']).toEqual({ design: true, tasks: true, tests: true })
    expect(res.frMap?.fr_to_tasks).toEqual({ 'FR-1': ['t-aaa'], 'FR-3': ['t-bbb'] })
  })

  it('rtm-accepting.yml 解析失败（坏 YAML）→ tracking 缺省不抛；coverage 仍从其它 RTM 推导', async () => {
    const root = tmpWorkspace()
    seedRtm(root)
    writeFileSync(join(root, 'docs', 'requirements', REQ_ID, 'rtm-accepting.yml'), 'metadata: [unclosed\n  bad: : :')
    const h = makeHarness({ requirements: [verifyReq()] })
    const res = asOk(await queryVerify(panelDeps(h, root), { requirementId: REQ_ID }))
    expect(res.tracking).toBeUndefined()
    // fr_to_tests 随 accepting 一起没了，但 design/decomposing 的映射还在 → coverage 仍有
    expect(res.coverage).toEqual({
      'FR-1': { design: true, tasks: true, tests: false },
      'FR-2': { design: true, tasks: false, tests: false },
      'FR-3': { design: false, tasks: true, tests: false },
    })
    // frMap 同理：坏掉那一段整段缺省，另外两段照常透出（不因一段坏把三层追溯全抹掉）
    expect(Object.hasOwn(res.frMap!, 'fr_to_tests')).toBe(false)
    expect(res.frMap?.fr_to_design).toEqual({ 'FR-1': ['§1'], 'FR-2': ['§2'] })
  })

  it('workspaceRoot 未装配 → tracking/coverage/frMap 缺省（不猜路径），sheet 段不受影响', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    const res = asOk(await queryVerify(panelDeps(h), { requirementId: REQ_ID }))
    expect(res.tracking).toBeUndefined()
    expect(res.coverage).toBeUndefined()
    expect(res.frMap).toBeUndefined()
    expect(res.sheet).toEqual(sheetV2())
  })

  it('无验收材料 → sheet/history/materials/pendingCount 全缺省（禁 0 冒充）；RTM 段照常', async () => {
    const root = tmpWorkspace()
    seedRtm(root)
    const h = makeHarness({ requirements: [verifyReq({ verification: undefined })] })
    const res = asOk(await queryVerify(panelDeps(h, root), { requirementId: REQ_ID }))
    expect(res.sheet).toBeUndefined()
    expect(res.history).toBeUndefined()
    expect(res.materials).toBeUndefined()
    expect(res.pendingCount).toBeUndefined()
    expect(res.tracking).toHaveLength(3)
    expect(res.coverage).toBeDefined()
    expect(res.frMap).toBeDefined()
  })

  it('需求不存在 → 抛 code=not_found（路由层转 404，与 queryDocs 同款）', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    await expect(queryVerify(panelDeps(h), { requirementId: 'REQ-261006130057-ffff' }))
      .rejects.toMatchObject({ code: 'not_found' })
  })

  it('台账读不到 → ledger-unreadable 降级（不抛）', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    h.store.injectFault(REQ_ID)
    const res = await queryVerify(panelDeps(h), { requirementId: REQ_ID })
    expect(res.available).toBe(false)
    if (res.available !== false) throw new Error('unreachable')
    expect(res.reason).toBe('ledger-unreadable')
  })
})

/* ------------------------------------------------- T-20b FR 名称（D-10 返工） */

/**
 * FR 名称用例（D-10 返工）：FR 列要渲染「编号 + 名称」，名称这一半来自需求文档正文。
 *
 * 判据四条（缺一条这个功能就可能悄悄变成"编名称"或"抛 500"）：
 *  ① 有文档端口 → 抽出的名称**与文档逐字一致**，且**只含解析得到的 FR**（不给别的 FR 补名称）；
 *  ② 无端口 / 读不到（抛错）/ 文档里没有标题行 → **缺省**（不是空对象、更不是编一个名称）；
 *  ③ 名称里的 `——` 尾巴（说明）被截干净；
 *  ④ 候选根逐个试（需求声明根排第一，读不到才落下一个）。
 */
const FR_MD = [
  '# 需求说明（REQ-261006130057-7a43）',
  '',
  '## 功能点',
  '',
  '- **FR-1: 头部信息分层与操作区聚类**——标识行（REQ-id / 状态 / 分类 / 难度）、标题、',
  '  meta（停留/更新/创建）、席位 chips、操作按钮分区。',
  '- **FR-2: 状态带三格视觉权重**——缺口强化为视觉焦点。',
  '- **FR-3: 最近评论区紧凑化**',
  '',
  '（边界里的 `FR-4 进度带` 这种引用**不是**标题行，不许被当成名称）',
  '',
].join('\n')

/** 带文档端口的依赖（其余各段与 `panelDeps` 同）。 */
function depsWithDocs(h: ReturnType<typeof makeHarness>, docs: DocRepository): PanelQueryDeps {
  return { ...panelDeps(h), docs }
}

/** 一份**内容写好**的内存文档端口（真实需求的 requirement.md 就在这个相对路径上）。 */
function docsWithRequirement(text: string, relPath = 'docs/requirements/' + REQ_ID + '/requirement.md'): FakeDocs {
  const docs = new FakeDocs()
  docs.put(relPath, text)
  return docs
}

/** 只会抛的读端口（"读不动"那一支：文件权限 / 磁盘异常这类）。 */
const THROWING_DOCS = {
  read: async (): Promise<string> => { throw new Error('EACCES: 读不动') },
} as unknown as DocRepository

describe('T-20b · FR 名称（D-10 返工）：从 requirement.md 抽 FR-N 名称，读不到即缺省', () => {
  it('有文档端口 → frNames 抽出的名称与文档逐字一致，且只含解析得到的 FR', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    const res = asOk(await queryVerify(depsWithDocs(h, docsWithRequirement(FR_MD)), { requirementId: REQ_ID }))
    expect(res.frNames).toEqual({
      'FR-1': '头部信息分层与操作区聚类',
      'FR-2': '状态带三格视觉权重',
      'FR-3': '最近评论区紧凑化',
    })
    // 文档里被提到的 FR-4（边界引用，不是标题行）**不许**凭空长出名称
    expect(Object.hasOwn(res.frNames!, 'FR-4')).toBe(false)
    // 其余六段不受影响（多读一份文档不改已有口径）
    expect(res.sheet).toEqual(sheetV2())
    expect(res.pendingCount).toBe(2)
  })

  it('文档位置按台账 `docBasePath` 解析（换过位置的需求照样读得到名称）', async () => {
    const h = makeHarness({ requirements: [verifyReq({ docBasePath: 'docs/rfcs/<REQ>/' })] })
    const docs = docsWithRequirement('- **FR-1: 头部信息分层与操作区聚类**——说明\n', 'docs/rfcs/' + REQ_ID + '/requirement.md')
    const res = asOk(await queryVerify(depsWithDocs(h, docs), { requirementId: REQ_ID }))
    expect(res.frNames).toEqual({ 'FR-1': '头部信息分层与操作区聚类' })
  })

  it('无文档端口 → frNames 缺省（不编名称、不抛）；其余段照常', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    const res = asOk(await queryVerify(panelDeps(h), { requirementId: REQ_ID }))
    expect(res.frNames).toBeUndefined()
    expect(Object.hasOwn(res, 'frNames')).toBe(false)
    expect(res.sheet).toEqual(sheetV2())
  })

  it('文档读不到（read 抛错 / 文件不在 / 没有标题行）→ 缺省不抛（三支同一个结果）', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    // ① read 抛错（权限 / 磁盘）
    const thrown = asOk(await queryVerify(depsWithDocs(h, THROWING_DOCS), { requirementId: REQ_ID }))
    expect(thrown.frNames).toBeUndefined()
    // ② 端口在、文件不在（FakeDocs 读不到给空串）
    const missing = asOk(await queryVerify(depsWithDocs(h, new FakeDocs()), { requirementId: REQ_ID }))
    expect(missing.frNames).toBeUndefined()
    // ③ 文件在、但没有可解析的 FR 标题行
    const noTitles = asOk(await queryVerify(
      depsWithDocs(h, docsWithRequirement('# 需求说明\n\n- **普通加粗**——不是 FR 标题\n')),
      { requirementId: REQ_ID },
    ))
    expect(noTitles.frNames).toBeUndefined()
  })

  it('候选根逐个试：首个根读不动 → 落到下一个根（需求声明根排第一）', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    const hit = docsWithRequirement('- **FR-1: 头部信息分层与操作区聚类**——说明\n')
    const deps: PanelQueryDeps = {
      ...panelDeps(h),
      docs: new FakeDocs(), // 会话根那一份：空
      docRootsOf: () => ['/root-broken', '/root-good'],
      docsAt: (root) => (root === '/root-good' ? hit : THROWING_DOCS),
    }
    const res = asOk(await queryVerify(deps, { requirementId: REQ_ID }))
    expect(res.frNames).toEqual({ 'FR-1': '头部信息分层与操作区聚类' })
  })

  it('parseFrNames 纯函数边界：`——` 尾巴截干净 / 全角冒号 / 无列表符 / 空名称不收 / 重复首次为准', () => {
    // ① `——` 之后是说明不是名称
    expect(parseFrNames('- **FR-1: 头部信息分层与操作区聚类**——标识行、标题、meta'))
      .toEqual({ 'FR-1': '头部信息分层与操作区聚类' })
    // ② 名称与 `——` 都在粗体里（说明误写进粗体也不许带进名称）
    expect(parseFrNames('- **FR-2: 状态带三格视觉权重——缺口强化**')).toEqual({ 'FR-2': '状态带三格视觉权重' })
    // ③ 全角冒号 / 无列表符的写法都认
    expect(parseFrNames('**FR-3：最近评论区紧凑化**')).toEqual({ 'FR-3': '最近评论区紧凑化' })
    // ④ 空名称不收（`FR-4: **` 这种空壳不许长出一条空名称）
    expect(parseFrNames('- **FR-4: **——空名称')).toBeUndefined()
    // ⑤ 同一个 FR 出现两次 → 首次为准（重复标题不改写前面那条）
    expect(parseFrNames('- **FR-1: 甲**\n- **FR-1: 乙**')).toEqual({ 'FR-1': '甲' })
    // ⑥ 一条都没有 / 空串 → undefined（不是空对象）
    expect(parseFrNames('')).toBeUndefined()
    expect(parseFrNames('# 需求说明\n\n没有 FR 标题行\n')).toBeUndefined()
  })

  it('frNamesOf 对脏台账（docBasePath 不是字符串）也绝不抛', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    const dirty = verifyReq({ docBasePath: 42 as unknown as string })
    const res = await frNamesOf(depsWithDocs(h, docsWithRequirement(FR_MD)), dirty)
    expect(res).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ T-21 */

const WINDOW = 'session-verify-t21'

/** 会话读端替身（与 tests/query-dialogue.test.ts 同款：值 undefined = 读不到）。 */
class T21Session extends FakeSession implements DialogueSessionEventsPort {
  constructor(private readonly events: readonly unknown[]) { super() }
  snapshotEvents(key: string): readonly unknown[] | undefined {
    return key === WINDOW ? this.events : undefined
  }
  async readEvents(key: string): Promise<readonly unknown[] | undefined> {
    return key === WINDOW ? this.events : undefined
  }
}

function humanMsg(at: number, seq: number, text: string): unknown {
  return {
    type: 'user/message',
    seq,
    time: at,
    data: { id: 'u-' + seq, role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } },
  }
}

function dialogueOk(res: PanelResult<DialogueResponse>): DialogueResponse {
  if (res.available === false) throw new Error('期望正常响应，实际是降级：' + res.reason)
  return res
}

/** 50 条消息（at = 1000 + i*10，全不同值），需求挂 WINDOW 席位。 */
function t21Setup(): PanelQueryDeps {
  const events = Array.from({ length: 50 }, (_, i) => humanMsg(1000 + i * 10, i, 'm' + i))
  const h = makeHarness({
    requirements: [req({
      id: REQ_ID,
      status: 'implementing',
      sourceSessionId: WINDOW,
      seats: [{ windowKey: WINDOW, role: 'owner', joinedAt: 10 }],
    })],
  })
  return {
    store: h.store,
    tasks: h.taskStore,
    injections: { readAll: async () => [] },
    sessions: new T21Session(events),
    now: () => h.clock.t,
  }
}

describe('T-21 · 对话游标：before（ms 时间戳）/ limit / page / 升序 / 缺参越界缺省', () => {
  it('缺参 → 最新一页 40 条；items 按 at 升序；page{hasMore,before,total} 三段齐', async () => {
    const deps = t21Setup()
    const res = dialogueOk(await queryDialogue(deps, { requirementId: REQ_ID }))
    expect(res.items).toHaveLength(40) // 缺省 limit = 40
    expect(res.page.total).toBe(50)
    expect(res.page.hasMore).toBe(true)
    expect(res.page.before).toBe(res.items[0]!.at) // 游标 = 本页最早一条的 at
    expect(res.items[0]!.at).toBe(1100) // 1000 + 10*10（最新 40 条从第 11 条起）
    const times = res.items.map(i => i.at)
    for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeGreaterThan(times[i - 1]!) // 升序
  })

  it('before=<ts>&limit=40 → 取 at<before 的最后一页；回传游标能翻页且不重不漏', async () => {
    const deps = t21Setup()
    const page1 = dialogueOk(await queryDialogue(deps, { requirementId: REQ_ID, limit: 40 }))
    const page2 = dialogueOk(await queryDialogue(deps, { requirementId: REQ_ID, limit: 40, before: page1.page.before }))
    expect(page2.items).toHaveLength(10) // at < 1100 的只有 10 条
    expect(page2.page.total).toBe(50)
    expect(page2.page.hasMore).toBe(false)
    expect(page2.page.before).toBeUndefined()
    expect(page2.items.map(i => i.at)).toEqual(Array.from({ length: 10 }, (_, i) => 1000 + i * 10))
    const all = [...page1.items, ...page2.items].map(i => i.at)
    expect(new Set(all).size).toBe(50)
  })

  it('中间页：before=1250&limit=10 → 池子 25 条取末 10 条，hasMore=true，游标=本页最早 at', async () => {
    const deps = t21Setup()
    const res = dialogueOk(await queryDialogue(deps, { requirementId: REQ_ID, before: 1250, limit: 10 }))
    expect(res.items.map(i => i.at)).toEqual(Array.from({ length: 10 }, (_, i) => 1150 + i * 10))
    expect(res.page.hasMore).toBe(true)
    expect(res.page.before).toBe(1150)
    expect(res.page.total).toBe(50)
  })

  it('越界走缺省：before 在未来 → 同最新一页；before 早于全部 → 空页不报错', async () => {
    const deps = t21Setup()
    const future = dialogueOk(await queryDialogue(deps, { requirementId: REQ_ID, before: 9_999_999 }))
    expect(future.items).toHaveLength(40)
    expect(future.items[0]!.at).toBe(1100)
    const ancient = dialogueOk(await queryDialogue(deps, { requirementId: REQ_ID, before: 500 }))
    expect(ancient.items).toEqual([])
    expect(ancient.page).toEqual({ total: 50, hasMore: false })
  })
})

/* ------------------------------------------------------------------ T-22 */

describe('T-22 · 兼容：DocsResponse.verification 保留；旧服务端无 verify 端点 → 降级', () => {
  it('docs 端点仍带 verification（整份照抄 sheet，旧前端不受影响）', async () => {
    const h = makeHarness({ requirements: [verifyReq()] })
    const deps: PanelQueryDeps = {
      store: h.store,
      tasks: h.taskStore,
      injections: { readAll: async () => [] },
      sessions: new FakeSession(),
      now: () => h.clock.t,
      docs: new FakeDocs(),
    }
    const res = await queryDocs(deps, { requirementId: REQ_ID })
    if (res.available === false) throw new Error('期望正常响应，实际是降级：' + res.reason)
    expect(res.verification).toEqual(sheetV2())
  })

  function fakeRes(): any {
    const res: any = new EventEmitter()
    res.statusCode = 0
    res.payload = undefined
    res.writeHead = (code: number) => { res.statusCode = code; return res }
    res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
    return res
  }

  function fakeReq(url: string): any {
    const r: any = new EventEmitter()
    r.url = '/dashboard/api/reqboard' + url
    r.method = 'GET'
    return r
  }

  function routeHarness(panelQueries: Parameters<typeof createReqboardHandler>[0]['panelQueries']): ReturnType<typeof createReqboardHandler> {
    const dir = tmpWorkspace()
    return createReqboardHandler({
      requirementStore: makeTestStore({ requirements: [verifyReq()] }) as never,
      taskStore: taskStoreAt(dir),
      now: () => 1_700_000_000_000,
      injectionLog: { readAll: async () => [] } as never,
      panelQueries,
    } as never)
  }

  it('verify 查询未装配（旧服务端）→ 200 + port-unavailable 降级（前端据此走 degraded 文案，不白屏）', async () => {
    const handler = routeHarness(undefined)
    const res = fakeRes()
    await handler(fakeReq(`/requirements/${REQ_ID}/verify`), res)
    expect(res.statusCode).toBe(200)
    expect(res.payload.success).toBe(true)
    expect(res.payload.data.available).toBe(false)
    expect(res.payload.data.reason).toBe('port-unavailable')
  })

  it('verify 查询已装配 → 200 且载荷原样透传（路由/正则接线锚点）', async () => {
    const payload: VerifyPanelResponse = { pendingCount: 2, materials: { evidence: ['x'] } }
    const handler = routeHarness({
      verify: (async () => payload) as never,
    })
    const res = fakeRes()
    await handler(fakeReq(`/requirements/${REQ_ID}/verify`), res)
    expect(res.statusCode).toBe(200)
    expect(res.payload.success).toBe(true)
    expect(res.payload.data).toEqual(payload)
  })
})
