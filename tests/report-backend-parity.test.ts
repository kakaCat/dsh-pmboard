/**
 * 双后端语义一致（REQ-261004222448-292a · t-467be0 验收最后一条）
 * ——详情页七个只读查询在「json 分片」与「SQLite」两条台账实现上必须**逐字段一致**。
 *
 * ## 为什么需要这份用例（它钉住的不是某段代码，而是一条硬约束）
 *
 * `design/data-model.md` §存储形态 写死了一句：
 *
 * > 因为台账后端可在 `json` / `sqlite` 之间切换（设置里切、重启生效），**任何新增读取都必须
 * > 在两条实现上语义一致**：走同一 `RequirementStore` 端口、共享用例、共享测试；不许只实现一条腿。
 *
 * 七查询（`queryReport` / `queryTrunk` / `queryDocs` / `queryDag` / `queryDialogue` /
 * `queryPrompts` / `queryTokenExtension`）全部只读台账现有字段，两条实现又都实现了
 * `RequirementStore` 端口——但"设计上应该一致"与"实测逐字段一致"是两件事：
 * 分片实现把大字段外置成 journal/对象再经 `assembleRecord` 拼回，SQLite 走列 + parts 表，
 * **两条装配链各自都可能把"可选字段缺席"读成 `undefined` / `0` / `[]` 中的任意一种**。
 * 那种漂移的症状是"看板一切正常，切了后端页面数字变了"，最难归因，故必须机械钉住。
 *
 * ## 夹具选择的理由（为什么不用 `makeTestStore`）
 *
 * 卡上允许用 `tests/application/harness.ts` 的 `makeTestStore()`（内存替身）。这里**刻意不用**：
 * 要证明的正是"两条**真**后端实现语义一致"，换成内存替身等于把被测对象换成第三份实现，
 * 它一致不代表两个线上适配器一致。故：
 *   - json 分片 = **真** `ShardedRequirementStore` + `RequirementShardRepository`
 *     （底座 `FakeShardFs`，与 `store-contract.test.ts` 注册表里那一份同源）；
 *   - SQLite    = **真** `SqliteRequirementStore`（复用仓内既有装置 `tests/reqboard/sqlite-harness.ts`）。
 *
 * ## 断言分层（哪些是真实现、哪些是桩）
 *
 * - **真**：两条 store 实现、七个查询函数（从 `src/application/query/index.js` 出口导入，
 *   顺带证明出口接线没漏），以及两条后端各自的 `get` / `listComments` / `head`。
 * - **桩**：`PanelQueryDeps` 上另外那几路只读端口（`tasks` / `injections` / `sessions` / `docs` /
 *   `isolations` / `systemPrompt` / `pendingConfirms` / `now`）。两份运行**共用同一批对象**
 *   （模块级 `SHARED_PORTS`），从而把"唯一的自变量"收敛到 `store` 一处——否则分叉了也说不清是谁造成的。
 *
 * ## 只读性怎么观测（卡验收第 3 条）
 *
 * - 分片后端：`FakeShardFs` 自带写探针 `writes` / `writeBytes`，`files` 又持有**全量文件内容**。
 *   跑完七查询后断言 `writes` 未动 **且** 全量文件快照逐字节未变
 *   （`writes` 只证明"没走原子写句柄"，文件快照还兜住 `appendFile` / `unlink` / 直接改 Map 的路径）。
 *   另加反向哨兵：`fs.reads` 必须涨——若一次都没读，上面的"没写"就是句空话。
 * - SQLite 后端：连接对象不暴露行数/页数，故用**等价可观测状态**——`head().revision` /
 *   `schemaVersion` 与逐份记录（`get`）、评论（`listComments`）与基线逐字段相同（卡上允许这种替代）。
 * - 两条后端都另钉一次记录本身：跑完再读 `get()`，`version` / `updatedAt` 等字段须与跑之前逐字段相同。
 *
 * ## "某条后端起不来"时怎么办（卡验收第 5 条要求二选一，这里选**响亮失败**）
 *
 * 本文件**不 skip**。`node:sqlite` 若不可用，`SqliteRequirementStore` 的静态导入会让整个文件
 * **收集失败**（红），而不是静默少跑一半断言。理由：这条硬约束防的正是"只实现一条腿"，
 * 而"SQLite 那半没跑"藏在 skip 里会变成一条**没人看得见的绿**——那比红危险。
 * （本仓实测：node v25 自带 `node:sqlite`，vitest 会打 ExperimentalWarning 但可用；
 * 与 `tests/reqboard/sqlite-store.test.ts` / `store-contract.test.ts` 走同一条导入路径。）
 *
 * @module tests/report-backend-parity
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FakeDocs, FakeSession, buildQueueFile, task } from './application/harness.js'
import { FakeShardFs, seedShard } from './reqboard/fake-shard-fs.js'
import { disposeSqliteHarnesses, makeSqliteHarness } from './reqboard/sqlite-harness.js'
import { RequirementShardRepository } from '../src/repositories/RequirementShardRepository.js'
import { ShardedRequirementStore } from '../src/repositories/ShardedRequirementStore.js'
import type { DocRepository, RequirementStore, TaskStore } from '../src/application/ports.js'
import type { InjectionLogReadPort } from '../src/application/internal/injection-log.js'
import type { IsolationLogReadPort } from '../src/application/internal/isolation-trace.js'
import type { PendingConfirmReadPort } from '../src/application/query/contracts.js'
import {
  queryDag,
  queryDialogue,
  queryDocs,
  queryPrompts,
  queryReport,
  queryTokenExtension,
  queryTrunk,
  type DialogueSessionEventsPort,
  type PanelQueryDeps,
  type PanelQueryInput,
} from '../src/application/query/index.js'
import {
  REQBOARD_SCHEMA_VERSION,
  isDegrade,
  type ActorRef,
  type RequirementRecord,
  type TaskRecord,
  type TokenBuckets,
  type TokenSnapshot,
} from '../src/shared/protocol.js'

// ---------------------------------------------------------------------------
// 常量与通用小件
// ---------------------------------------------------------------------------

/** 富记录：可选字段尽量铺满（含"有的有、有的没有"，例如只给一个产物盖章）。 */
const REQ_FULL = 'REQ-ab12cd'
/** 缺席标本：只留必填字段，用来钉"可选字段缺席"的**同一种不可得表达**。 */
const REQ_SPARSE = 'REQ-ab12ce'
const WINDOW_A = 'session-parity-a'
const WINDOW_B = 'session-parity-b'
/** 固定"现在"：停留时长 / 距上次更新是可断言数，注入时钟后不靠运气。 */
const NOW = 9_000_000
/** 分片数据根（`FakeShardFs` 的内存命名空间，不碰真实磁盘）。 */
const ROOT = '/data/parity'
/** 队列摘要时间（只是给 DAG 一个确定的 generated_at）。 */
const QUEUE_AT = 1_000

const HUMAN: ActorRef = { kind: 'human' }
const AGENT: ActorRef = { kind: 'agent', sessionId: WINDOW_A }

function buckets(over: Partial<TokenBuckets> = {}): TokenBuckets {
  return { uncachedInputTokens: 100, outputTokens: 50, cacheReadTokens: 400, cacheWriteTokens: 20, ...over }
}

function snapshot(at: number, over: Partial<TokenBuckets> = {}): TokenSnapshot {
  return { sessionId: WINDOW_A, at, totals: buckets(over), source: 'projection' }
}

// ---------------------------------------------------------------------------
// 种子：同一份数据装进两条后端
// ---------------------------------------------------------------------------

/**
 * 富记录：把 `RequirementRecord` 上的可选字段尽量铺满。
 *
 * 刻意保留两处"半满"：① 第二个席位没有 `lastSeenAt`；② 第一个产物已盖章、第二个没有
 * ——这样断言不只覆盖"都有"与"都没有"，还覆盖"同一数组内逐项字段不齐"这条最容易读丢的情形。
 */
function fullRecord(): RequirementRecord {
  return {
    id: REQ_FULL,
    title: '双后端一致性 · 富记录',
    description: '把可选字段铺满的一条需求（分片/SQLite 两条装载路径都要给出同一份读结果）',
    category: 'feature',
    promptDifficulty: 'standard',
    docBasePath: 'docs/requirements/' + REQ_FULL + '/',
    workspaceRoot: '/ws/parity',
    status: 'implementing',
    blocked: false,
    autoRun: true,
    priority: 3,
    reviewSessionId: WINDOW_B,
    sourceSessionId: WINDOW_A,
    seats: [
      { windowKey: WINDOW_A, role: 'owner', joinedAt: 10, lastSeenAt: 20 },
      { windowKey: WINDOW_B, role: 'worker', joinedAt: 11 },
    ],
    comments: [
      { id: 'c-1', body: '开工', createdAt: 1_100, createdBy: HUMAN },
      { id: 'c-2', body: '[验收] 退回返工：证据里没有跑测输出', createdAt: 5_200, createdBy: HUMAN },
      { id: 'c-3', body: '已补证据', createdAt: 5_300, createdBy: AGENT },
    ],
    statusHistory: [
      { status: 'draft', at: 1_000, by: HUMAN },
      { status: 'brainstorming', at: 1_500, by: HUMAN, tokenSnapshot: snapshot(1_500) },
      { status: 'design', at: 2_000, by: AGENT, tokenSnapshot: snapshot(2_000, { uncachedInputTokens: 10 }) },
      { status: 'implementing', at: 3_000, by: HUMAN, tokenSnapshot: snapshot(3_000, { uncachedInputTokens: 20 }) },
    ],
    tokenUsage: {
      byStage: {
        design: buckets({ uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }),
        implementing: buckets({ uncachedInputTokens: 300, outputTokens: 120, cacheReadTokens: 900, cacheWriteTokens: 0 }),
      },
      totals: buckets({ uncachedInputTokens: 310, outputTokens: 125, cacheReadTokens: 900, cacheWriteTokens: 0 }),
      costEstimateCny: 12.5,
      updatedAt: 5_100_000,
    },
    plan: {
      path: 'docs/requirements/' + REQ_FULL + '/decomposition.md',
      summary: '目标：钉住双后端一致；做法：同一份种子 + 同一套端口 + 逐字段深比较',
      tasks: [{ key: 't1', title: '写用例', phase: 'test', side: 'backend', acceptance: '两条后端逐字段一致' }],
      submittedAt: 2_400,
      submittedBy: AGENT,
      approvedAt: 2_500,
      approvedBy: HUMAN,
      approvedVia: 'board',
    },
    verification: {
      summary: '交付：双后端一致用例；证据：vitest 原始输出',
      evidence: ['pnpm vitest run tests/report-backend-parity.test.ts'],
      submittedAt: 4_500_000,
      submittedBy: AGENT,
      sheet: {
        version: 1,
        generatedAt: 4_500_000,
        generatedBy: AGENT,
        items: [
          {
            id: 'v1-1',
            source: { kind: 'task', taskId: 't-parity1' },
            criterion: '跑 vitest 看到绿',
            evidence: ['tests/report-backend-parity.test.ts'],
            status: 'passed',
            opinion: '已跑，绿',
            decidedAt: 5_000_000,
            decidedBy: HUMAN,
            result: '12 passed',
            resultSource: 'agent',
          },
          {
            id: 'v1-2',
            source: { kind: 'requirement' },
            criterion: '只读性可观测',
            evidence: ['fs.writes 未动'],
            status: 'failed',
            opinion: '证据不足，补观测手段',
            decidedAt: 5_000_000,
            decidedBy: HUMAN,
          },
          {
            id: 'v1-3',
            source: { kind: 'requirement' },
            criterion: '缺席字段语义一致',
            evidence: [],
            status: 'pending',
            howToVerify: '读 sparse 标本的 token 扩展段',
          },
        ],
      },
      sheetHistory: [],
      reviewedAt: 5_000_000,
      reviewedBy: HUMAN,
      decision: 'rework',
      reviewNote: '退回返工：只读性观测手段要写清',
    },
    artifacts: [
      {
        stage: 'design',
        kind: 'design',
        path: 'docs/requirements/' + REQ_FULL + '/design/architecture.md',
        registeredAt: 2_100,
        registeredBy: AGENT,
        confirmedAt: 2_200,
        confirmedBy: HUMAN,
        confirmedVia: 'board',
      },
      {
        stage: 'implementing',
        kind: 'task_detail',
        path: 'docs/requirements/' + REQ_FULL + '/tasks/t-parity1.md',
        registeredAt: 4_100,
        registeredBy: AGENT,
      },
    ],
    docSyncPending: [
      { source: 'requirement', downstream: ['plan', 'decomposition'], reason: '需求条款改了 FR-2', at: 2_600 },
    ],
    interruption: {
      at: 4_000_000,
      reason: 'upstream stream idle 3m',
      stage: 'implementing',
      pendingAction: 'reqboard_task_run',
      tool: 'reqboard_submit',
    },
    advance: {
      lockAt: 4_000_000,
      runId: 'run-parity-1',
      noopStreak: 1,
      failureStreak: 0,
      history: [
        {
          at: 3_900_000,
          requirementId: REQ_FULL,
          event: 'RUN_SUBTASK',
          subtaskId: 't-parity1',
          outcome: 'ok',
          durationMs: 1_200,
          detail: '跑了 t-parity1',
          batchId: 'batch-1',
        },
        {
          at: 4_100_000,
          requirementId: REQ_FULL,
          event: 'FINALIZE_PARENT',
          parentId: 't-parity1',
          outcome: 'noop',
          durationMs: 5,
          detail: '重复触发，台账无变化',
        },
      ],
    },
    rollback: {
      from: 'accepting', to: 'implementing', at: 5_100_000, by: HUMAN,
      reason: '验收退回', seq: 2, lastMaterialized: ['t-parity2'],
    },
    version: 7,
    createdAt: 1_000,
    updatedAt: 8_000_000,
    createdBy: HUMAN,
    updatedBy: AGENT,
  }
}

/**
 * 缺席标本：**只**留必填字段。
 *
 * 具体缺席：`category`（验 `?? 'feature'` 折算）/ `promptDifficulty` / `docBasePath` /
 * `workspaceRoot` / `seats`（验按 `sourceSessionId` 折算单 owner）/ `artifacts` / `plan` /
 * `verification`（验"没有验收单 ≠ 验收了零项通过"）/ `archive` / `tokenUsage`（验"不可得 ≠ 0"）/
 * `advance` / `interruption` / `docSyncPending` / `rollback` / `statusHistory`。
 */
function sparseRecord(): RequirementRecord {
  return {
    id: REQ_SPARSE,
    title: '双后端一致性 · 缺席字段标本',
    description: '可选字段一律缺席：两条后端必须给出同一种「不可得」，不许一边 undefined、一边 0 / []',
    status: 'implementing',
    blocked: false,
    sourceSessionId: WINDOW_A,
    comments: [],
    version: 1,
    createdAt: 1_000,
    updatedAt: 1_000,
    createdBy: HUMAN,
    updatedBy: HUMAN,
  }
}

/** 每次调用返回一份**全新**种子：两条后端各自装载，绝不共享可变引用。 */
function seedRecords(): RequirementRecord[] {
  return [structuredClone(fullRecord()), structuredClone(sparseRecord())]
}

/** 缺席标本上应当"读作没有"的可选键（`undefined` 才算没有；`0` / `[]` / `''` 都算物化，是分叉）。 */
const ABSENT_OPTIONAL_KEYS: readonly string[] = [
  'category', 'promptDifficulty', 'docBasePath', 'workspaceRoot', 'seats', 'artifacts', 'plan',
  'verification', 'archive', 'tokenUsage', 'advance', 'interruption', 'docSyncPending', 'rollback',
  'statusHistory', 'acceptanceOverride', 'blockedReason', 'paused', 'dive', 'autoRun', 'priority',
  'reviewSessionId', 'docLinks', 'archivePath',
]

// ---------------------------------------------------------------------------
// 两条后端装置（都是真实现）
// ---------------------------------------------------------------------------

interface Backend {
  readonly name: string
  readonly store: RequirementStore
  /** 仅分片后端有：写探针 + 全量文件内容（只读性观测用）。 */
  readonly fs?: FakeShardFs
}

/**
 * json 分片后端：真 `ShardedRequirementStore` + 真 `RequirementShardRepository`（底座假 fs）。
 *
 * 种子走 `seedShard`（仓内既有装置）——它按**真实分片布局**落盘：大字段外置成对象、
 * 评论与状态事件落 journal，热记录只留标量 + 计数。若手工拼 record.json，测的就不是装配链了。
 */
async function makeJsonBackend(seed: readonly RequirementRecord[]): Promise<Backend> {
  const fs = new FakeShardFs()
  const repo = new RequirementShardRepository({
    fs, now: () => 1,
    onWarn: () => { /* 一致性用例不校验告警，静音 */ },
  })
  for (const record of seed) await seedShard(repo, ROOT, { record })
  await repo.writeMeta(ROOT, { schemaVersion: REQBOARD_SCHEMA_VERSION, revision: 1 })
  const store = new ShardedRequirementStore({
    root: ROOT, repository: repo, now: () => 1,
    onWarn: () => { /* 同上 */ },
  })
  return { name: 'json 分片（ShardedRequirementStore）', store, fs }
}

/** SQLite 后端：复用仓内既有夹具（每个实例独立临时目录，由模块级 afterAll 统一清理）。 */
async function makeSqliteBackend(seed: readonly RequirementRecord[]): Promise<Backend> {
  const { store } = await makeSqliteHarness(seed)
  return { name: 'SQLite（SqliteRequirementStore）', store }
}

// ---------------------------------------------------------------------------
// 共用只读端口（两份运行用**同一批对象**：唯一自变量只剩 store）
// ---------------------------------------------------------------------------

/** 会话事件（对话流用；`user/message` 与 `assistant/message` 两种形状，后者带工具/推理噪声块）。 */
const SESSION_EVENTS = new Map<string, readonly unknown[]>([
  [WINDOW_A, [
    {
      type: 'user/message', seq: 0, time: 5_000_000,
      data: { id: 'u-0', role: 'user', content: [{ type: 'text', text: '把双后端一致性钉住' }], source: { kind: 'user' } },
    },
    {
      type: 'assistant/message', seq: 1, time: 5_000_100,
      data: {
        turn: 1, step: 1, stream: [],
        message: {
          id: 'a-1', role: 'assistant',
          content: [
            { type: 'text', text: '好，先写种子再比字段' },
            { type: 'reasoning', text: 'tool/call 这类噪声不许进响应' },
            { type: 'tool-call', id: 'c1', name: 'read_file', arguments: '{}' },
          ],
          source: { kind: 'model', provider: 'p', model: 'm' },
        },
      },
    },
  ]],
  [WINDOW_B, [
    {
      type: 'user/message', seq: 0, time: 5_000_200,
      data: { id: 'u-1', role: 'user', content: [{ type: 'text', text: '复核一下' }], source: { kind: 'user' } },
    },
  ]],
])

/** 会话读端：`FakeSession`（`SessionProbe`）+ 对话查询要的那两个结构探测方法。 */
class SharedSessions extends FakeSession implements DialogueSessionEventsPort {
  snapshotEvents(key: string): readonly unknown[] | undefined { return SESSION_EVENTS.get(key) }
  async readEvents(key: string): Promise<readonly unknown[] | undefined> { return SESSION_EVENTS.get(key) }
}

/** 任务桩：两条需求各若干张卡，富记录的第一张卡带一次已闭合执行（有 token 差额与 sessionId）。 */
function makeTasks(): readonly TaskRecord[] {
  const executed = task({
    id: 't-parity1',
    requirementId: REQ_FULL,
    title: '写双后端一致用例',
    status: 'done',
    requirementRefs: ['FR-1', 'FR-2'],
    lastReport: {
      at: 4_200, reportIndex: 0,
      filesChanged: ['tests/report-backend-parity.test.ts'],
      completed: ['七查询逐字段一致'],
    },
    executions: [
      {
        id: 'e-parity1',
        sessionId: WINDOW_B,
        trigger: 'auto',
        startedAt: 4_000,
        endedAt: 4_200,
        outcome: 'succeeded',
        evidence: ['tests/report-backend-parity.test.ts'],
        outputCount: 1,
        tokenUsage: {
          start: snapshot(4_000, { uncachedInputTokens: 50 }),
          end: snapshot(4_200, { uncachedInputTokens: 250, outputTokens: 120, cacheReadTokens: 900 }),
          delta: buckets({ uncachedInputTokens: 200, outputTokens: 120, cacheReadTokens: 900, cacheWriteTokens: 0 }),
          costEstimateCny: 1.2,
        },
      },
    ],
  })
  const pending = task({
    id: 't-parity2',
    requirementId: REQ_FULL,
    title: '补只读性观测',
    status: 'in_progress',
    dependsOn: ['t-parity1'],
    requirementRefs: ['FR-3'],
  })
  const sparse = task({ id: 't-parity3', requirementId: REQ_SPARSE, title: '缺席标本跑一遍', status: 'todo' })
  return [executed, pending, sparse]
}

const TASKS = makeTasks()

/** 任务端口桩：只实现七查询真正用到的两个读方法（其余调用会 TypeError，静默不了）。 */
function makeTaskPort(tasks: readonly TaskRecord[]): TaskStore {
  const mine = (id: string): readonly TaskRecord[] => tasks.filter((t) => t.requirementId === id)
  return {
    listByRequirement: async (id: string) => mine(id),
    // 有卡才给队列文件（"无队列"与"空队列"是两件事，桩必须能表达前者为 undefined）。
    readQueue: async (id: string) => (mine(id).length === 0 ? undefined : buildQueueFile(id, mine(id), QUEUE_AT)),
  } as unknown as TaskStore
}

/**
 * 文档端口桩：`FakeDocs`（内存，不碰 fs）+ 两条需求各写一份"有结构"的正文。
 *
 * 正文里带条款定义（`**FR-n**`）与 RTM 覆盖表——否则 report/trunk/docs 会退化成空结果，
 * 两条后端"一致地空"也能过 toEqual，那是**假绿**（下面的非退化守卫专治这个）。
 */
function makeDocsPort(): DocRepository {
  const docs = new FakeDocs(() => NOW)
  for (const id of [REQ_FULL, REQ_SPARSE]) {
    const dir = 'docs/requirements/' + id
    docs.put(dir + '/requirement.md', [
      '# 需求：双后端一致性',
      '',
      '## 产品定义',
      '',
      '**一句话**：同一份种子装两条后端，七查询返回体逐字段一致。',
      '',
      '## 边界（不做什么）',
      '',
      '1. **不改 src**：发现分叉只上报，不就地改。',
      '',
      '## 功能点',
      '',
      '**FR-1** 两条后端各跑一次读用例',
      '**FR-2** 返回体逐字段一致',
      '**FR-3** 只读性可观测',
      '**FR-4** 缺席字段语义一致',
      '',
      '## 技术方案与亮点',
      '',
      '- 差异：真实现对真实现，桩只用在端口',
      '  为什么：替身一致不代表两个适配器一致',
      '  证据：tests/report-backend-parity.test.ts',
      '',
    ].join('\n'))
    docs.put(dir + '/decomposition.md', [
      '# 拆分计划',
      '',
      '| 根编号 | 任务 | 标题 |',
      '|---|---|---|',
      '| FR-1 | t-parity1 | 写双后端一致用例 |',
      '| FR-2 | t-parity1 | 写双后端一致用例 |',
      '',
    ].join('\n'))
    docs.put(dir + '/design/architecture.md', [
      '# 架构',
      '',
      '## 架构 `serves: FR-1`',
      '',
      '两条后端各装同一份种子，七查询走同一批端口。',
      '',
      '## 关键决策与取舍 `serves: FR-2`',
      '',
      '| 决策 | 理由 |',
      '|---|---|',
      '| 用真分片实现而非内存替身 | 替身一致不代表适配器一致 |',
      '',
    ].join('\n'))
    docs.put(dir + '/tasks/t-parity1.md', '# t-parity1 双后端一致用例\n')
  }
  return docs
}

/** 注入留痕桩：一条 v2 新条目（来源/投递齐）、一条旧条目（v2 字段缺席 → 读端补"未知"）。 */
function makeInjectionPort(): InjectionLogReadPort {
  return {
    readAll: async () => [
      {
        at: 3_100, windowKey: WINDOW_A, stage: 'implementing', difficulty: 'standard', category: 'feature',
        routeKey: 'implementing/standard/feature', hitLevel: 'exact', fragmentIds: ['frag-a'], charCount: 120,
        trimmed: [], difficultyReasons: ['含验证锚点'], origin: 'dive-node', delivered: true, text: '注入正文',
        truncated: false,
      },
      {
        at: 3_200, windowKey: WINDOW_B, stage: 'implementing', difficulty: 'standard', category: 'feature',
        routeKey: 'implementing/standard/feature', hitLevel: '②', fragmentIds: ['frag-b'], charCount: 80,
        trimmed: ['frag-c'],
      },
    ],
  }
}

/** 隔离留痕桩：一条 replaced（真发生过替换）+ 一条 skipped（只算尝试）。 */
function makeIsolationPort(): IsolationLogReadPort {
  return {
    readAll: async () => [
      {
        at: 3_300, windowKey: WINDOW_A, stage: 'implementing', status: 'replaced',
        reason: '超预算，替换 surface', routeKey: 'implementing/standard/feature', packageChars: 4_000,
        range: { start: 10, end: 20 },
      },
      {
        at: 3_400, windowKey: WINDOW_A, stage: 'implementing', status: 'skipped',
        reason: '内容已足够短', routeKey: 'implementing/standard/feature', packageChars: 900,
      },
    ],
  }
}

/** 挂起确认桩（内存态，不落台账）：只有富记录挂了一条。 */
function makePendingPort(): PendingConfirmReadPort {
  return {
    pendingForRequirement: (id: string) => (id === REQ_FULL
      ? [{
          ticket: 'pc-parity1', windowKey: WINDOW_A, requirementId: REQ_FULL,
          target: 'artifact' as const, kind: 'design' as const, createdAt: 4_600_000,
        }]
      : []),
  }
}

/**
 * 固定系统提示词装配桩。
 *
 * 返回形状照 `queryPrompts` 的结构约定（`sections` / `contexts` / `trimmed`）；它是"读时装配"、
 * 与台账后端无关——正因如此，两份运行必须共用**同一个**函数引用，否则分叉说不清是谁的。
 */
function makeSystemPrompt(): () => unknown {
  return () => ({
    assemble: async () => ({
      routeKey: 'implementing/standard/feature',
      hitLevel: '②',
      sections: [
        { name: 'fragments/stage-discipline.md', text: '纪律正文' },
        { name: 'shell:identity', text: '身份正文' },
      ],
      contexts: [{ name: 'context:address', text: '地址正文' }],
      trimmed: [{ id: 'fragments/glossary.md', chars: 12, text: '术语正文' }],
    }),
  })
}

/** 共用只读端口（模块级单例：两份运行共用同一批对象；类型对着真契约检查，免得桩悄悄少个成员）。 */
const SHARED_PORTS: Omit<PanelQueryDeps, 'store'> = {
  tasks: makeTaskPort(TASKS),
  injections: makeInjectionPort(),
  sessions: new SharedSessions(),
  docs: makeDocsPort(),
  isolations: makeIsolationPort(),
  systemPrompt: makeSystemPrompt(),
  pendingConfirms: makePendingPort(),
  now: () => NOW,
}

/** 组装七查询依赖：换的只有 `store`，其余引用完全相同。 */
function depsFor(store: RequirementStore): PanelQueryDeps {
  return { store, ...SHARED_PORTS }
}

// ---------------------------------------------------------------------------
// 七个查询（从出口导入，顺带证明 index.ts 的接线）
// ---------------------------------------------------------------------------

interface QueryCase {
  readonly name: string
  readonly run: (deps: PanelQueryDeps, input: PanelQueryInput) => Promise<unknown>
  /**
   * 非退化守卫：两条后端若"一致地什么都不给"（全降级 / 全空数组），toEqual 照样绿。
   * 这个守卫把那种假绿当场打红——它断言的是"响应里真有从台账读出来的东西"。
   */
  readonly guard: (result: unknown) => void
}

const QUERIES: readonly QueryCase[] = [
  {
    name: 'queryReport',
    run: (d, i) => queryReport(d, i),
    guard: (r) => {
      const v = r as { head?: { title?: string; comments?: unknown[] }; gaps?: unknown[]; tabCounts?: unknown }
      // 标题与三条评论都只能从台账 `get()` 来 ⇒ 这条守卫把"响应真的读过 store"钉住。
      expect(v.head?.title).toBe('双后端一致性 · 富记录')
      expect((v.head?.comments ?? []).length).toBe(3)
      expect((v.gaps ?? []).length).toBeGreaterThan(0)
      expect(v.tabCounts).toBeDefined()
    },
  },
  {
    name: 'queryTrunk',
    run: (d, i) => queryTrunk(d, i),
    guard: (r) => {
      expect(isDegrade(r)).toBe(false)
      expect(((r as { items?: unknown[] }).items ?? []).length).toBeGreaterThan(0)
    },
  },
  {
    name: 'queryDocs',
    run: (d, i) => queryDocs(d, i),
    guard: (r) => {
      expect(isDegrade(r)).toBe(false)
      const v = r as { documents?: unknown[]; gates?: unknown[] }
      expect((v.documents ?? []).length).toBeGreaterThan(0)
      expect((v.gates ?? []).length).toBeGreaterThan(0)
    },
  },
  {
    name: 'queryDag',
    run: (d, i) => queryDag(d, i),
    guard: (r) => {
      expect(isDegrade(r)).toBe(false)
      const v = r as { tasks?: unknown[]; steps?: unknown[] }
      expect((v.tasks ?? []).length).toBeGreaterThan(0)
      expect(Array.isArray(v.steps)).toBe(true)
    },
  },
  {
    name: 'queryDialogue',
    run: (d, i) => queryDialogue(d, i),
    guard: (r) => {
      expect(isDegrade(r)).toBe(false)
      const v = r as { items?: unknown[]; page?: { total?: number } }
      expect((v.items ?? []).length).toBeGreaterThan(0)
      expect(v.page?.total ?? 0).toBeGreaterThan(0)
    },
  },
  {
    name: 'queryPrompts',
    run: (d, i) => queryPrompts(d, i),
    guard: (r) => {
      const v = r as { system?: { sections?: unknown[] }; injections?: unknown[]; context?: { available?: boolean } }
      expect((v.system?.sections ?? []).length).toBeGreaterThan(0)
      expect((v.injections ?? []).length).toBeGreaterThan(0)
      expect(v.context?.available).toBe(true)
    },
  },
  {
    name: 'queryTokenExtension',
    run: (d, i) => queryTokenExtension(d, i),
    guard: (r) => {
      expect(isDegrade(r)).toBe(false)
      const v = r as { byStage?: unknown[]; availability?: string }
      expect((v.byStage ?? []).length).toBeGreaterThan(0)
      expect(v.availability).not.toBe('none')
    },
  },
]

/** 全量文件快照（排序后比较：Map 顺序不参与语义，但内容逐字节参与）。 */
function filesSnapshot(fs: FakeShardFs): readonly (readonly [string, string])[] {
  return [...fs.files.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
}

/** 把七个查询对两条需求各跑一遍（只读性用例与一致性用例共用同一条跑法）。 */
async function runAllQueries(store: RequirementStore, requirementIds: readonly string[]): Promise<void> {
  const deps = depsFor(store)
  for (const requirementId of requirementIds) {
    for (const q of QUERIES) await q.run(deps, { requirementId })
  }
}

// ---------------------------------------------------------------------------
// 用例 · 一致性
// ---------------------------------------------------------------------------

describe('双后端读语义一致 · REQ-261004222448-292a t-467be0', () => {
  let json: Backend
  let sqlite: Backend

  beforeAll(async () => {
    json = await makeJsonBackend(seedRecords())
    sqlite = await makeSqliteBackend(seedRecords())
  })

  it('两条后端都真装上了同一份种子（否则下面的一致性断言毫无意义）', async () => {
    for (const backend of [json, sqlite]) {
      const full = await backend.store.get(REQ_FULL)
      const sparse = await backend.store.get(REQ_SPARSE)
      expect(full?.id, backend.name).toBe(REQ_FULL)
      expect(full?.version, backend.name).toBe(7)
      expect((await backend.store.listComments(REQ_FULL)).map((c) => c.id), backend.name).toEqual(['c-1', 'c-2', 'c-3'])
      expect(sparse?.id, backend.name).toBe(REQ_SPARSE)
      expect(await backend.store.get('REQ-ffffff'), backend.name).toBeUndefined()
    }
  })

  it('① 富记录：七个查询逐字段深比较（两条后端返回值 toEqual）', async () => {
    const input = { requirementId: REQ_FULL }
    const jsonDeps = depsFor(json.store)
    const sqliteDeps = depsFor(sqlite.store)
    for (const q of QUERIES) {
      const fromJson = await q.run(jsonDeps, input)
      const fromSqlite = await q.run(sqliteDeps, input)
      // 先跑非退化守卫：两条都空也"一致"，那种绿是假绿。
      q.guard(fromJson)
      q.guard(fromSqlite)
      expect(fromJson, `${q.name}：json 分片与 SQLite 返回体必须逐字段一致（富记录 ${REQ_FULL}）`).toEqual(fromSqlite)
    }
  })

  it('② 缺席标本：同样七个查询逐字段深比较（可选字段缺席的两条路径必须同一种表达）', async () => {
    const input = { requirementId: REQ_SPARSE }
    const jsonDeps = depsFor(json.store)
    const sqliteDeps = depsFor(sqlite.store)
    for (const q of QUERIES) {
      const fromJson = await q.run(jsonDeps, input)
      const fromSqlite = await q.run(sqliteDeps, input)
      expect(fromJson, `${q.name}：json 分片与 SQLite 返回体必须逐字段一致（缺席标本 ${REQ_SPARSE}）`).toEqual(fromSqlite)
    }
  })

  it('③ 缺席字段在两条 store 上都读作「没有」——不是 undefined / 0 / [] 各说各话', async () => {
    const fromJson = await json.store.get(REQ_SPARSE)
    const fromSqlite = await sqlite.store.get(REQ_SPARSE)
    const materialized: string[] = []
    for (const key of ABSENT_OPTIONAL_KEYS) {
      for (const [name, rec] of [['json 分片', fromJson], ['SQLite', fromSqlite]] as const) {
        const value = (rec as unknown as Record<string, unknown>)[key]
        if (value !== undefined) materialized.push(`${name}.${key} = ${JSON.stringify(value)}`)
      }
    }
    // 一次报全：谁把缺席物化成 0 / [] / '' 都会被列出来（本仓 FR-12「禁 0 冒充不可得」的同款判据）。
    expect(materialized, `缺席可选字段被物化了（应为 undefined）：\n${materialized.join('\n')}`).toEqual([])
    // 两条记录整体也必须等价：toStrictEqual **不忽略** undefined 值键，比 toEqual 更严。
    expect(fromJson, '缺席标本整份记录两条后端必须严格一致').toStrictEqual(fromSqlite)
  })

  it('④ 缺席标本的「不可得」在查询响应里也是**同一种**表达（不是一边 undefined、一边 0 / 空数组）', async () => {
    const input = { requirementId: REQ_SPARSE }
    const runs = [['json 分片', depsFor(json.store)], ['SQLite', depsFor(sqlite.store)]] as const

    // Token 扩展段：无快照 → availability='none'、不产 0 值表；也**不得**给 partial 才有的下界标记。
    for (const [name, deps] of runs) {
      const token = (await queryTokenExtension(deps, input)) as {
        byStage?: unknown[]; optimizations?: unknown[]; availability?: string
        missingStages?: unknown; boundsAreLowerBound?: unknown
      }
      expect(token.availability, name).toBe('none')
      expect(token.byStage, name).toEqual([])
      expect(token.optimizations, name).toEqual([])
      expect('missingStages' in token, `${name}：none 态不该给 missingStages`).toBe(false)
      expect('boundsAreLowerBound' in token, `${name}：none 态不该给下界标记`).toBe(false)
    }

    // 首屏：没有验收单 → 不给 outcome（**不是** passed:0），两条后端同款。
    for (const [name, deps] of runs) {
      const report = (await queryReport(deps, input)) as {
        outcome?: unknown; head?: { promptDifficulty?: unknown; category?: string }; gaps?: unknown[]
      }
      expect('outcome' in report, `${name}：无验收单不该给 outcome（禁 0 冒充）`).toBe(false)
      expect('promptDifficulty' in (report.head ?? {}), `${name}：缺席难度不该给键`).toBe(false)
      // category 缺席 → 按全仓同口径折算 feature（是"折算值"，不是物化进记录的 0/空串）。
      expect(report.head?.category, name).toBe('feature')
      // 挂起端口装配了、而该需求没有挂起 → 不产生"状态不可知"灰条（那是端口缺席才有的）。
      expect((report.gaps ?? []).some((g) => JSON.stringify(g).includes('挂起确认状态不可知')), name).toBe(false)
    }

    // 文档：没有验收材料 / 没有归档材料 → 响应里连这两个键都不该有（两条后端同款）。
    for (const [name, deps] of runs) {
      const docs = (await queryDocs(deps, input)) as { verification?: unknown; archive?: unknown }
      expect('verification' in docs, `${name}：缺席验收材料不该给 verification 键`).toBe(false)
      expect('archive' in docs, `${name}：缺席归档材料不该给 archive 键`).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// 用例 · 只读性（七个查询一次写都不许发生）
// ---------------------------------------------------------------------------

describe('只读性观测 · 七个查询跑完两条后端都分毫未动', () => {
  it('分片 JSON 后端：写探针未动 + 全量文件逐字节未变 + version/updatedAt 未改', async () => {
    const json = await makeJsonBackend(seedRecords())
    const fs = json.fs!
    const writesBefore = fs.writes
    const filesBefore = filesSnapshot(fs)
    const readsBefore = fs.reads
    const headBefore = await json.store.head()
    const fullBefore = await json.store.get(REQ_FULL)
    const sparseBefore = await json.store.get(REQ_SPARSE)

    await runAllQueries(json.store, [REQ_FULL, REQ_SPARSE])

    // 观测手段一：`FakeShardFs` 的写探针（`open` / `appendFile` 都会 +1）。
    expect(fs.writes, '七个查询期间发生了落盘写（写探针 +1）').toBe(writesBefore)
    // 观测手段二：全量文件内容快照——它还兜住 unlink / rename / 直接改 Map 这些绕过探针的路径。
    expect(filesSnapshot(fs), '分片文件内容被改动（逐字节比较）').toEqual(filesBefore)
    // 观测手段三：端口读数（版本与全局序都是"有没有写过"的直接可观测量）。
    expect(await json.store.head(), '分片台账全局序/schema 版本被改动').toEqual(headBefore)
    expect(await json.store.get(REQ_FULL), 'REQ_FULL 记录（含 version/updatedAt）被改动').toEqual(fullBefore)
    expect((await json.store.get(REQ_FULL))?.version, 'REQ_FULL.version 被改动').toBe(fullBefore?.version)
    expect((await json.store.get(REQ_FULL))?.updatedAt, 'REQ_FULL.updatedAt 被改动').toBe(fullBefore?.updatedAt)
    expect(await json.store.get(REQ_SPARSE), 'REQ_SPARSE 记录被改动').toEqual(sparseBefore)
    // 反向哨兵：读数一次都没涨，说明查询压根没碰 store，上面的"没写"就是句空话。
    expect(fs.reads, '七个查询应当真的读过分片（否则只读性断言是空的）').toBeGreaterThan(readsBefore)
  })

  it('SQLite 后端：head() 与逐份记录/评论内容均与跑之前一致', async () => {
    const sqlite = await makeSqliteBackend(seedRecords())
    const headBefore = await sqlite.store.head()
    const fullBefore = await sqlite.store.get(REQ_FULL)
    const sparseBefore = await sqlite.store.get(REQ_SPARSE)
    const commentsBefore = await sqlite.store.listComments(REQ_FULL)

    await runAllQueries(sqlite.store, [REQ_FULL, REQ_SPARSE])

    // 观测手段（SQLite 连接不暴露页/行计数，故用等价可观测状态，卡上允许这种替代）：
    // ① 全局序与 schema 版本未动；② 再读一次，整份记录与评论与跑之前逐字段相同。
    expect(await sqlite.store.head(), 'SQLite 台账全局序/schema 版本被改动').toEqual(headBefore)
    expect(await sqlite.store.get(REQ_FULL), 'REQ_FULL 记录内容被改动').toEqual(fullBefore)
    expect(await sqlite.store.get(REQ_SPARSE), 'REQ_SPARSE 记录内容被改动').toEqual(sparseBefore)
    expect(await sqlite.store.listComments(REQ_FULL), '评论被改动').toEqual(commentsBefore)
  })
})

// SQLite 夹具建的临时目录必须由**调用方**清掉（vitest 的钩子只能注册在测试文件里）：
// 放模块级（而不是某个 describe 里）——本文件有多个 describe 各自建库，模块级 afterAll 才是最后一次执行。
afterAll(() => { disposeSqliteHarnesses() })
