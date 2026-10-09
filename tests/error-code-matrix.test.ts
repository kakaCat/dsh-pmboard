/**
 * 错误码触发矩阵（REQ-261006201814-ac4f FR-2）。
 *
 * ## 判据是什么
 *
 * 口径内每个**可触发**的码，在这里都有且仅有一条 TriggerSpec：真的造景触发一次，
 * 断言观察到**码本身**（不是中文文案）。目标：口径内真零覆盖的码 ≤ 5（FR-2）。
 *
 * ## 三档造景手法（与 design/test-cases.md 同义）
 *
 * - `direct`：直调函数/工具传非法入参，不需夹具；
 * - `fixture`：复用既有夹具（内存台账 + 队列 + 临时工作区）造状态；
 * - `fault`：注入假端口（假 jobs / 假 skill 资产 / 坏文件 / 坏替身）。
 *
 * ## 与豁免白名单的关系（FR-3）
 *
 * 触发不了的码**必须**登记进 `tests/fixtures/error-code-exempt.json`（逐条 reason + plan），
 * 那份名单与「inventory 里 covered=false」双向相等且只减不增。本文件不得用「假触发器」
 * 把红的凑成绿的——每条 trigger 都真的走到产生点。
 *
 * @module dsh-pmboard/tests/error-code-matrix.test
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'
import { makeTestStore } from './application/harness.js'
import { codeOf, defineCodeTriggers, type TriggerSpec } from './helpers/code-trigger-harness.js'
import {
  defineAcceptSheetTool,
  defineVerifySubmitTool,
  seedQueueTasks,
  stubDocFile,
  toUseCaseDeps,
  type ReqboardToolDeps,
} from './helpers/tool-deps.js'
import { checkClaimDependencies } from '../src/domain/workflow/DependencyGateSpec.js'
import { fillStageAcceptance } from '../src/domain/task/SubtaskTemplate.js'
import { docsRootSourceSetting, seatsMaxSetting } from '../src/plugin-config.js'
import { UserQuestionsAdapter } from '../src/adapters/UserQuestionsAdapter.js'
import { SessionProbeAdapter } from '../src/adapters/SessionProbeAdapter.js'
import { SystemRecordFile } from '../src/adapters/SystemRecordFile.js'
import { releaseSubtaskBudget } from '../src/application/internal/subtask-budget.js'
import { executeSubtask } from '../src/application/use-cases/ExecuteTask.js'
import { handoffRequirement } from '../src/application/use-cases/HandoffOwner.js'
import { createReqDetailStore } from '../src/client/req-detail-store.js'
import {
  defineTaskRunTool,
  defineStatusTool,
  defineSkillInstallTool,
} from '../src/tools/index.js'
import type { RequirementRecord, TaskRecord } from '../src/shared/protocol.js'

/** 夹具窗口码（`sourceSessionId` 与 `exec.agent.id` 同值 ⇒ 该窗口是这条需求的 owner）。 */
const W = 'session-ecm-001'

const tmpRoots: string[] = []
afterAll(() => {
  for (const r of tmpRoots.splice(0)) rmSync(r, { recursive: true, force: true })
})

type Store = ReturnType<typeof makeTestStore>

/** 工具壳的最小调用形状。 */
type ToolLike = { execute: (a: unknown, e: unknown) => Promise<Record<string, unknown>> }
const asTool = (t: unknown): ToolLike => t as unknown as ToolLike
const EXEC = { agent: { id: W } }

function mkDeps(): { deps: ReqboardToolDeps; store: Store } {
  const store = makeTestStore()
  return { deps: { store, now: () => 1_700_000_000_000 }, store }
}

/** 播种一条需求（默认：本窗口 owner、implementing、无产物簿 = 存量豁免口径）。 */
async function seedReq(store: Store, over: Record<string, unknown> = {}): Promise<RequirementRecord> {
  const r = {
    id: 'REQ-ecm0001',
    title: '夹具需求',
    description: '',
    status: 'implementing',
    category: 'feature',
    blocked: false,
    sourceSessionId: W,
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'human' },
    updatedBy: { kind: 'human' },
    statusHistory: [],
    ...over,
  } as unknown as RequirementRecord
  await store.replaceAll('seed', { schemaVersion: 9, revision: 0, requirements: [r], triages: [] })
  return r
}

/** 造一张最小任务卡（只填判据用得到的字段）。 */
function mkTask(over: Record<string, unknown> = {}): TaskRecord {
  return {
    id: 't-ecm001',
    requirementId: 'REQ-ecm0001',
    title: '夹具任务',
    description: '',
    phase: 'test',
    side: 'backend',
    dependsOn: [],
    scope: { apis: [], tables: [], files: [] },
    acceptance: 'npx vitest run tests/x.test.ts 退出码 0',
    implementation: '改 tests/x.test.ts',
    context: '',
    status: 'todo',
    blocked: false,
    executions: [],
    comments: [],
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    createdBy: { kind: 'agent', sessionId: W },
    updatedBy: { kind: 'agent', sessionId: W },
    ...over,
  } as unknown as TaskRecord
}

/** 同步版取码（纯函数 / 装配期抛错的触发器用）。 */
function codeFromSync(fn: () => unknown): string | undefined {
  try {
    return codeOf(fn())
  } catch (err) {
    return codeOf(err)
  }
}

/** 跑一次「期望被拒」的调用：抛错或返回体都算，统一取码。 */
async function codeFrom(fn: () => Promise<unknown> | unknown): Promise<string | undefined> {
  try {
    return codeOf(await fn())
  } catch (err) {
    return codeOf(err)
  }
}

/** 写一组「需求目录下」的夹具文档（落到进程级临时根，不碰真实工作树）。 */
function stubReqDocs(reqId: string, files: Record<string, string>): void {
  const base = 'docs/requirements/' + reqId + '/'
  for (const [rel, content] of Object.entries(files)) stubDocFile(base + rel, undefined, content)
}

const REQ_MD = '---\nsides: []\n---\n\n# 需求\n\n## 功能点\n\n**FR-1 夹具条款**。\n'

const SPECS: readonly TriggerSpec[] = [
  // ── direct：直调函数传非法入参 ───────────────────────────────────────────────
  {
    code: 'REQBOARD_DEPENDENCY_GATE',
    tier: 'direct',
    trigger: () => {
      const t = { id: 't-dep', title: 'x', status: 'todo', dependsOn: ['t-dep'] }
      const rejection = checkClaimDependencies(t, [t])
      return { code: rejection?.code, note: rejection?.reason }
    },
  },
  {
    code: 'REQBOARD_STAGES_INVALID',
    tier: 'direct',
    trigger: () => ({
      code: codeFromSync(() => fillStageAcceptance('<这张卡的占位符>', {
        requirementId: 'REQ-ecm0001',
        taskId: 't-ecm001',
        parentAcceptance: 'npx vitest run tests/x.test.ts 退出码 0',
      })),
    }),
  },
  {
    code: 'REQBOARD_DOCS_ROOT_SOURCE_INVALID',
    tier: 'direct',
    trigger: () => ({
      code: codeFromSync(() => docsRootSourceSetting({ docsRootSource: '不是受控值' } as never)),
    }),
  },
  {
    code: 'REQBOARD_SEATS_MAX_INVALID',
    tier: 'direct',
    trigger: () => ({
      code: codeFromSync(() => seatsMaxSetting({ seatsMax: 0 } as never)),
    }),
  },
  {
    code: 'REQBOARD_NO_UI',
    tier: 'fault',
    trigger: async () => {
      const adapter = new UserQuestionsAdapter(() => undefined)
      return { code: await codeFrom(() => adapter.ask([], {})) }
    },
  },
  {
    code: 'REQBOARD_STORE_INCONSISTENT',
    tier: 'direct',
    trigger: async () => {
      const { deps } = mkDeps()
      // 故意不装配 subtaskBudget 端口：组合根缺端口 ⇒ 与 taskStoreOf / requirementStoreOf 同一语义。
      const receipt = await releaseSubtaskBudget(toUseCaseDeps(deps), {
        taskId: 't-ecm001', windowKey: W, reason: '夹具放行',
      })
      return { code: (receipt as { code?: string }).code, note: (receipt as { error?: string }).error }
    },
  },
  {
    code: 'REQBOARD_DRIVER_REQUIRED',
    tier: 'fault',
    trigger: () => {
      const adapter = new SessionProbeAdapter({
        agents: () => ({ get: () => undefined, currentInitiator: () => undefined }),
      })
      return { code: codeFromSync(() => adapter.requireLiveDriver({ agent: { id: W } })) }
    },
  },
  {
    code: 'REQBOARD_REQUIREMENT_NOT_FOUND',
    tier: 'direct',
    trigger: async () => {
      const { deps } = mkDeps()
      // 查询式入口：显式给一个台账里不存在的需求 id ⇒ 读点抛码（不是"扫不到当成没有"）。
      const tool = asTool(defineStatusTool(toUseCaseDeps(deps)))
      return { code: await codeFrom(() => tool.execute({ requirement_id: 'REQ-ecm-not-exist' }, EXEC)) }
    },
  },
  {
    code: 'REQBOARD_SYSTEM_RECORD_INVALID',
    tier: 'fixture',
    trigger: async () => {
      const dir = mkdtempSync(join(tmpdir(), 'ecm-sysrec-'))
      tmpRoots.push(dir)
      const file = join(dir, 'dsh-reqboard-system.json')
      writeFileSync(file, '{ 这不是合法 JSON')
      const record = new SystemRecordFile({
        file,
        now: () => 1_700_000_000_000,
        plugin: { name: 'dsh-pmboard', stamp: { version: '1.0.0', buildStamp: 'fixture' }, sqliteSchemaVersion: 1 },
        paths: {
          shardDataRoot: join(dir, 'reqboard'),
          sqliteFile: join(dir, 'reqboard.sqlite'),
          settingsFile: join(dir, 'settings.json'),
          legacyLedger: join(dir, 'dsh-reqboard.json'),
          backupDirs: [],
        },
        active: { backend: 'json', since: '2026-01-01T00:00:00.000Z', source: 'config' },
      } as never)
      return { code: await codeFrom(() => record.read()) }
    },
  },

  // ── fixture：复用既有夹具造状态 ─────────────────────────────────────────────
  {
    code: 'REQBOARD_NOT_SUBTASK',
    tier: 'fixture',
    trigger: async () => {
      const { deps, store } = mkDeps()
      const r = await seedReq(store)
      await seedQueueTasks(deps, r.id, [mkTask({ id: 't-top', requirementId: r.id })])
      const result = await executeSubtask(toUseCaseDeps(deps), { subtaskId: 't-top', windowKey: W })
      return { code: (result as { code?: string }).code, note: (result as { reason?: string }).reason }
    },
  },
  {
    code: 'REQBOARD_VERSION_MISMATCH',
    tier: 'fixture',
    trigger: async () => {
      const { deps, store } = mkDeps()
      const r = await seedReq(store)
      await seedQueueTasks(deps, r.id, [mkTask({ id: 't-ecm001', requirementId: r.id, status: 'done' })])
      // 先真的交一次验收材料（存量口径：无产物簿 ⇒ 文档/可执行性门豁免）⇒ 台账里有验收单
      const verify = asTool(defineVerifySubmitTool(deps))
      const submitted = await codeFrom(() => verify.execute(
        { requirement_id: r.id, summary: '交付', evidence: ['npx vitest run 全绿'] }, EXEC,
      ))
      if (submitted !== undefined) return { code: submitted, note: '验收材料未交成，拿不到验收单' }
      const sheetTool = asTool(defineAcceptSheetTool(deps))
      return { code: await codeFrom(() => sheetTool.execute({ requirement_id: r.id, version: 9_999 }, EXEC)) }
    },
  },
  {
    code: 'REQBOARD_REQ_TERMINAL',
    tier: 'fixture',
    trigger: async () => {
      const { deps, store } = mkDeps()
      // accepting 属于「开放态」（isOpenRequirement）但属于链的终态集合 ⇒ 工具映射到终态码。
      const r = await seedReq(store, { status: 'accepting', autoRun: true })
      const tool = asTool(defineTaskRunTool(toUseCaseDeps(deps)))
      return { code: await codeFrom(() => tool.execute({ requirement_id: r.id }, EXEC)) }
    },
  },
  {
    code: 'REQBOARD_DISPATCH_FAILED',
    tier: 'fault',
    trigger: async () => {
      const { deps, store } = mkDeps()
      const r = await seedReq(store, { status: 'implementing', autoRun: true })
      const uc = toUseCaseDeps(deps) as unknown as { jobs?: unknown }
      uc.jobs = {
        available: () => true,
        // 注意：消息里**不能**出现字面量 jobs——工具壳优先按 reason 里有没有 "jobs" 判 DSH_JOBS_UNAVAILABLE，
        // 那条分支先于 stopped==='dispatch_failed' 生效（本码因此需要一条不含该词的投递失败）
        start: async () => { throw new Error('夹具：后台任务投递服务不可用') },
        get: async () => null,
      }
      const tool = asTool(defineTaskRunTool(uc as never))
      return { code: await codeFrom(() => tool.execute({ requirement_id: r.id }, EXEC)) }
    },
  },
  {
    code: 'REQBOARD_SKILLS_INSTALL_FAILED',
    tier: 'fault',
    trigger: async () => {
      const { deps } = mkDeps()
      const uc = toUseCaseDeps(deps) as unknown as Record<string, unknown>
      uc.skillSettings = { enabled: true }
      uc.skillInstall = {}
      // 资产端口本身坏掉（抛出**不带码**的错误）⇒ 工具壳兜底到 REQBOARD_SKILLS_INSTALL_FAILED
      uc.skillAssets = {
        readProvenance: async () => { throw new Error('夹具：skill 资产包损坏') },
        listSkills: () => [] as readonly string[],
      }
      const tool = asTool(defineSkillInstallTool(uc as never))
      return { code: await codeFrom(() => tool.execute({}, EXEC)) }
    },
  },
  {
    code: 'REQBOARD_DETAIL_SETTLE_FAILED',
    tier: 'fault',
    trigger: async () => {
      // 客户端详情取数：结算回调自身抛错 ⇒ 必须落**可恢复的终态**（不许卡在 loading）
      const detail = createReqDetailStore({
        fetchRequirement: async () => {
          const payload: Record<string, unknown> = {}
          Object.defineProperty(payload, 'requirement', {
            get() { throw new Error('夹具：结算时读 requirement 抛错') },
          })
          return payload as never
        },
      })
      detail.ensure('REQ-ecm-detail')
      await new Promise(resolve => setTimeout(resolve, 10))
      const entry = detail.get('REQ-ecm-detail')
      return {
        code: entry !== undefined && entry.status === 'error' ? entry.code : undefined,
        note: entry?.status,
      }
    },
  },
  {
    code: 'REQBOARD_HANDOFF_WRITE_FAILED',
    tier: 'fault',
    trigger: async () => {
      const { store } = mkDeps()
      const r = await seedReq(store)
      // 读得到、写不到（并发删掉 / 写盘失败）⇒ 交接必须整条回退，不得「没成立却报成功」
      const unWritable = new Proxy(store, {
        get(target, prop, receiver) {
          if (prop === 'mutate' || prop === 'mutateIf') {
            return async (): Promise<never> => {
              throw Object.assign(new Error('夹具：需求已不可变'), { code: 'REQBOARD_NOT_FOUND' })
            }
          }
          const value = Reflect.get(target, prop, receiver) as unknown
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
        },
      })
      const uc = toUseCaseDeps({ store: unWritable as never, now: () => 1_700_000_000_000 })
      return {
        code: await codeFrom(() => handoffRequirement(
          uc,
          { requirement_id: r.id, to_window: 'session-ecm-other', reason: '夹具：人明确要求换窗口接手' },
          EXEC,
        )),
      }
    },
  },
  {
    code: 'REQBOARD_DOC_INCOMPLETE',
    tier: 'fixture',
    trigger: async () => {
      const { deps, store } = mkDeps()
      // 非存量口径：产物簿非空 + 盘上有 requirement.md ⇒ 9 类文档完整性门**真的执法**
      const r = await seedReq(store, {
        id: 'REQ-ecm-doc',
        artifacts: [{
          stage: 'design', kind: 'design',
          path: 'docs/requirements/REQ-ecm-doc/design/architecture.md', confirmedAt: 1,
        }],
      })
      stubReqDocs(r.id, { 'requirement.md': REQ_MD })
      const verify = asTool(defineVerifySubmitTool(deps))
      return {
        code: await codeFrom(() => verify.execute(
          { requirement_id: r.id, summary: '交付', evidence: ['npx vitest run 全绿'] }, EXEC,
        )),
      }
    },
  },
  {
    code: 'REQBOARD_ACCEPTANCE_NOT_EXECUTABLE',
    tier: 'fixture',
    trigger: async () => {
      const { deps, store } = mkDeps()
      const r = await seedReq(store, {
        id: 'REQ-ecm-how',
        artifacts: [{
          stage: 'design', kind: 'design',
          path: 'docs/requirements/REQ-ecm-how/design/architecture.md', confirmedAt: 1,
        }],
      })
      // 一张活卡：验收标准**过了计划期锚点**（含「不变」）却**过不了验收期硬门槛**（没有可执行操作）
      await seedQueueTasks(deps, r.id, [
        mkTask({ id: 't-how', requirementId: r.id, acceptance: '提交后状态保持不变' }),
      ])
      stubReqDocs(r.id, {
        'requirement.md': REQ_MD,
        'design/architecture.md': '# 架构\n\n## 夹具章节 serves: FR-1\n',
        'design/data-model.md': '# 数据模型\n',
        'design/interfaces.md': '# 接口\n',
        'design/test-cases.md': '# 测试用例\n',
        'decomposition.md': '# 拆分计划\n',
        'reviews/r.md': '# 评审\n',
        'tests/evidence.txt': '夹具测试证据\n',
        'tasks/t-how.md': '# t-how 夹具任务卡\n',
      })
      const verify = asTool(defineVerifySubmitTool(deps))
      return {
        code: await codeFrom(() => verify.execute(
          { requirement_id: r.id, summary: '交付', evidence: ['npx vitest run 全绿'] }, EXEC,
        )),
      }
    },
  },
]

defineCodeTriggers(SPECS)
