/**
 * 端到端与反向演练（REQ-261004103330-005f t15）——本需求**最后一张卡**。
 *
 * ## 这份测试和前面各卡的测试有什么不同
 *
 * 前面每张卡测的是"我这块对不对"；这里测的是"**把它们串起来，一条真链条跑得通吗**"：
 *   ① 人在设置文件里改上限 → 装快照 → 真驱动到上限**当拍停手**（且留痕写明用的是设置里的值，不是默认 1000）
 *   ② 分片有数据 → 跑真迁移脚本 → 库里有同样的数据 → 设置指向 sqlite →**重启后装配真的用库读**
 *   ③ 选了 sqlite 但还没迁移就重启 → **未就绪 + 503 指引**（**绝不返回空册**）
 *
 * 三条都从**真实文件**出发（真盘分片 / 真设置文件 / 真库文件），不用内存替身糊过去——
 * 因为这些链路的坑（路径解析、装配顺序、门禁时机）恰恰只在真盘上才暴露。
 *
 * ## 三条反向演练（写在 notes/baseline.md 的「反向演练实测」一节）
 *
 * A 移除迁移脚本的回滚/清理 · B 把设置来源优先级写反 · C 删掉票据的落章/否定校验 ——
 * 逐条临时改 → 目标用例**必红** → 恢复 → 再绿。演练细节见基线文件，本文件不重复。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeHarness } from 'tests/application/harness.js'
import { createReqboardHandler } from 'src/http/routes.js'
import { fail } from 'src/http/envelope.js'
import { FileSettingsStore } from 'src/adapters/FileSettingsStore.js'
import { SystemRecordFile } from 'src/adapters/SystemRecordFile.js'
import { PendingConfirmRegistry } from 'src/adapters/PendingConfirmRegistry.js'
import { SETTINGS_FILE_REL } from 'pm-core/application/settings/resolve-settings.js'
import { SYSTEM_RECORD_FILE_REL } from 'pm-core/application/settings/events.js'
import { SQLITE_SCHEMA_VERSION } from 'pm-core/repositories/sqliteSchema.js'
import { installStageLimitSnapshot, roundLimitFor } from 'pm-core/application/dive-core/round-state.js'
import { buildGoalRoundPorts } from '../../pm/src/adapters/goal-round-ports.js'
import { createGoalRoundDriver } from 'pm-goal-round-driver/driver.js'
import { factsOf } from 'pm-core/domain/requirement/RequirementSummary.js'
import { emptyLedger, type RequirementRecord } from 'pm-core/protocol-domain.js'
import { assembleStorage } from 'src/wiring/settings-assembly.js'
import { migrateLedgerToSqlite, MIGRATE_EXIT } from 'scripts/migrate-ledger-to-sqlite.js'
import { expectCode } from 'tests/helpers/code-assert.js'

const require_ = createRequire(import.meta.url)

let base: string
let dataRoot: string
let settingsFile: string
let systemFile: string

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'pmboard-e2e-'))
  dataRoot = join(base, 'reqboard')
  settingsFile = join(base, SETTINGS_FILE_REL)
  systemFile = join(base, SYSTEM_RECORD_FILE_REL)
})
afterEach(() => {
  installStageLimitSnapshot(undefined)
  rmSync(base, { recursive: true, force: true })
})

/** 真盘分片种子（走真实仓储，不喂内存假 fs——迁移门的探针读真盘）。 */
async function seedShards(count: number): Promise<string[]> {
  const { RequirementShardRepository } = await import('pm-core/repositories/RequirementShardRepository.js')
  const { seedShard } = await import('tests/reqboard/fake-shard-fs.js')
  const repo = new RequirementShardRepository({ now: () => 1, onWarn: () => {} })
  await repo.writeMeta(dataRoot, { schemaVersion: 10, revision: 3 })
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    const id = 'REQ-26100101000' + String(i) + '-abcd'
    ids.push(id)
    await seedShard(repo, dataRoot, {
      record: {
        id, title: 't' + String(i), description: '', status: 'draft', category: 'feature',
        promptDifficulty: 'standard', version: 1, createdAt: 1, updatedAt: 1,
        createdBy: { kind: 'human' }, updatedBy: { kind: 'human' },
        comments: [], statusHistory: [], artifacts: [], blocked: false,
      } as never,
    })
  }
  return ids
}

/** 直接读库里的 id 集合（权威读，不经过端口——这一条要证明"盘上真有数据"）。 */
function sqliteIds(file: string): string[] {
  const DatabaseSync = require_('node:sqlite').DatabaseSync as new (f: string) => {
    prepare: (s: string) => { all: () => Array<{ id: string }> }
    close: () => void
  }
  const db = new DatabaseSync(file)
  try {
    return db.prepare('SELECT id FROM requirements ORDER BY id').all().map((r) => r.id)
  } finally {
    db.close()
  }
}

function writeSettings(body: Record<string, unknown>): void {
  mkdirSync(base, { recursive: true })
  writeFileSync(settingsFile, JSON.stringify({ schemaVersion: 1, ...body }, null, 2))
}

/**
 * 小驱动 harness（2026-10-10 改挂新 goal 驱动：`buildGoalRoundPorts` 真适配器 + `createGoalRoundDriver`）。
 *
 * 本卡要验的是「设置里的阶段上限 → 适配器解析成 `maxGoalRounds` → 驱动当拍停手」这一条**真链路**，
 * 故端口走**真适配器**（旧写法手搓 `DiveRoundPorts` 已随 `pm-round-driver` 退役）。
 * 停手形态也随之改变（新驱动口径）：`round-limit` ⇒ `blockGoal` **落盘 block**，不再写 `driverHealth`。
 */
function driveHarness(req: RequirementRecord) {
  const ledger = { ...emptyLedger(), requirements: [req], tasks: [], triages: [] }
  const delivered: unknown[] = []
  const blocked: Array<{ requirementId: string; code: string; message: string }> = []
  const warns: string[] = []
  const ports = buildGoalRoundPorts({
    peekFacts: () => ledger.requirements.map(factsOf),
    getRequirement: async (id) => ledger.requirements.find((r) => r.id === id),
    // 一张 running 卡（不带 goal）+ 需求记录上的 active goal（一条需求一个）：
    // 上限缺省 ⇒ 适配器回落阶段上限（`roundLimitFor`，快照里的 5/10）。
    tasksOf: async () => [{ id: 't-1', status: 'running', acceptance: 'a' }],
    delivery: {
      createRoundMessage: (input) => ({ message: { id: 'm' + String(input.round), role: 'user', content: [{ type: 'text', text: input.text }] }, messageId: 'm' + String(input.round) }),
      deliverMessage: (_wk, message) => { delivered.push(message); return { delivered: true } },
      checkpoint: async () => {},
      persistAdmission: () => {},
      contentOf: (m) => (m as { content?: unknown } | undefined)?.content,
      now: () => 1000,
    },
    checkpoint: async () => {},
    persistAdmission: () => {},
    createGoal: () => true,
    blockGoal: (requirementId, reason) => { blocked.push({ requirementId, code: reason.code, message: reason.message }); return true },
    askStageDone: () => {},
    trace: () => {},
    fiberActive: () => true,
    agentLive: () => true,
    now: () => 1000,
    logger: { info: (m) => warns.push(m), debug: () => {}, warn: (m) => warns.push(m) },
  })
  return { driver: createGoalRoundDriver(ports), delivered, blocked, warns, ledger }
}

function implementingReq(rounds: number): RequirementRecord {
  return {
    id: 'REQ-t', title: 't', description: '', status: 'implementing', blocked: false,
    comments: [], version: 5, createdAt: 1, updatedAt: 1,
    createdBy: { kind: 'human' }, updatedBy: { kind: 'human' }, sourceSessionId: 'agent-1',
    // 当前 goal 挂**需求**（goal 不挂卡）：`blockGoal` 端口要求记录上确有 goal，否则幂等返回 false。
    goal: { id: 'goal:REQ-t', objective: 'a', phase: 'active', revision: 1 },
    goalSeq: 1,
    dive: { phase: 'active', activation: 'armed', roundsInStage: rounds },
  } as unknown as RequirementRecord
}

// ---------------------------------------------------------------------------
// E2E-1：上限从设置文件一路生效到"当拍停手"
// ---------------------------------------------------------------------------
describe('E2E-1 上限生效：设置文件 → 快照 → 驱动当拍停手', () => {
  it('上限 5：到 5 当拍停手且留痕写明用的是设置里的值（不是默认 1000）；上调到 10 后继续起轮', async () => {
    writeSettings({ stageMaxRounds: { implementing: 5 } })
    const store = new FileSettingsStore({ dshHome: base, env: {}, now: () => 1_000_000 })
    await store.refresh()
    installStageLimitSnapshot(store.snapshot())

    expect(roundLimitFor('implementing')).toBe(5)

    // roundsInStage 已达 5 → 停手（当拍判定，不动正在跑的那一轮）
    const stopped = driveHarness(implementingReq(5))
    await stopped.driver.requestDrive('agent-1')
    await stopped.driver.whenQuiet()
    stopped.driver.teardown()
    expect(stopped.delivered.length).toBe(0)
    const afterStop = stopped.ledger.requirements[0]
    // 停手形态：goal **落盘 block**（round-limit）——耐久半边，重启不失忆、人可见可裁
    expect(stopped.blocked).toHaveLength(1)
    expect(stopped.blocked[0]!.code).toBe('round-limit')
    expect(stopped.blocked[0]!.requirementId).toBe('REQ-t')
    // 留痕里的上限 = 设置文件里的 5，而**不是**默认 1000：这是「权威来源真的换了」的硬证据
    expect(stopped.blocked[0]!.message).toContain('上限 5')
    expect(stopped.blocked[0]!.message).not.toContain('上限 1000')
    // 人的意图不变（activation 仍 armed）——停手只发生在判定点，不掐断正在跑的那一轮
    expect(afterStop.dive?.activation).toBe('armed')

    // 人把上限放宽到 10 → 下一次判定即继续起轮
    writeSettings({ stageMaxRounds: { implementing: 10 } })
    await store.refresh()
    installStageLimitSnapshot(store.snapshot())
    expect(roundLimitFor('implementing')).toBe(10)

    const resumed = driveHarness(implementingReq(5))
    await resumed.driver.requestDrive('agent-1')
    await resumed.driver.whenQuiet()
    resumed.driver.teardown()
    expect(resumed.delivered.length).toBe(1)
    expect(resumed.blocked).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// E2E-2：切库全链（真脚本 → 真库 → 设置指向 → 重启后装配用库）
// ---------------------------------------------------------------------------
describe('E2E-2 切库全链：迁移 → 库里有同样的数据 → 重启后装配真的用库', () => {
  it('迁移后库 id 集合与分片一致、设置指向 sqlite、重启装配读库且路由层如实标注待重启', async () => {
    const ids = await seedShards(3)

    // ① 真迁移脚本（含写设置）
    const report = await migrateLedgerToSqlite({ from: dataRoot, dshHome: base, writeSettings: true, now: 1_700_000_000_000 })
    expect(report.code).toBe(MIGRATE_EXIT.ok)
    const sqliteFile = join(base, 'reqboard.sqlite')
    expect(existsSync(sqliteFile)).toBe(true)
    expect(sqliteIds(sqliteFile)).toEqual([...ids].sort())

    // ② 设置文件真的指向了 sqlite
    expect(JSON.parse(readFileSync(settingsFile, 'utf8')).storage.backend).toBe('sqlite')

    // ③ 重启前：本进程仍在 json → 路由如实标注「目标 sqlite / 生效 json / 待重启」
    const clock = 1_700_000_000_000
    const systemRecord = new SystemRecordFile({
      file: systemFile, now: () => clock,
      plugin: { name: 'dsh-pmboard', stamp: { version: '0.1.0', buildStamp: 'e2e' }, sqliteSchemaVersion: SQLITE_SCHEMA_VERSION },
      paths: { shardDataRoot: dataRoot, sqliteFile, settingsFile, legacyLedger: join(base, 'dsh-reqboard.json'), backupDirs: [] },
      active: { backend: 'json', since: new Date(clock).toISOString(), source: 'default' },
    })
    await systemRecord.read()
    await systemRecord.updateStores({
      shards: { exists: true, requirements: ids.length, bytes: 0, headRevision: 3 },
      sqlite: { exists: true, requirements: ids.length, bytes: 0, stale: false, migratedAt: new Date(clock).toISOString() },
    })

    const beforeStore = new FileSettingsStore({ dshHome: base, env: {}, currentBackend: 'json', now: () => clock })
    // 构造期已同步读盘；这里显式 refresh 一次，与生产装配期「构造 + 启动读一次」同口径
    await beforeStore.refresh()
    const fakeRes = (): any => { const res: any = new EventEmitter(); res.statusCode = 0; res.writeHead = (c: number) => { res.statusCode = c; return res }; res.end = (t?: string) => { res.payload = t === undefined ? undefined : JSON.parse(t); return res }; return res }
    const fakeReq = (method: string, url: string, body?: unknown): any => { const req: any = new EventEmitter(); req.url = url; req.method = method; req[Symbol.asyncIterator] = async function* () { if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8') }; return req }
    const h = makeHarness()
    const registry = new PendingConfirmRegistry({ now: () => clock, ttlMs: 60_000 })
    const handler = createReqboardHandler({
      requirementStore: h.store, taskStore: h.taskStore, now: () => clock,
      settings: beforeStore, systemRecord, storageActions: registry,
      pluginInfo: { name: 'dsh-pmboard', version: '0.1.0' }, dshHome: base,
    })

    const res = fakeRes()
    await handler(fakeReq('GET', '/dashboard/api/reqboard/settings'), res)
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.storage.backend).toEqual({ value: 'sqlite', source: 'settings' })
    expect(res.payload.data.storage.effective).toBe('json')
    expect(res.payload.data.storage.restartRequired).toBe(true)

    // ④ 重启后：装配真的选了库，并且**从库里读得到那 3 条**
    const assembled = assembleStorage({
      dshHome: base, dataRoot, legacyLedger: join(base, 'dsh-reqboard.json'),
      moduleDir: join(process.cwd(), 'src'), now: () => clock, warn: () => {}, info: () => {},
    })
    expect(assembled.ok).toBe(true)
    if (!assembled.ok) return
    expect(assembled.backend).toBe('sqlite')
    const page = await assembled.store.listSummaries({ scope: 'all' })
    expect(page.items.map((x) => x.id).sort()).toEqual([...ids].sort())
  })
})

// ---------------------------------------------------------------------------
// E2E-3：未迁移就重启 → 未就绪 + 503 指引（绝不返回空册）
// ---------------------------------------------------------------------------
describe('E2E-3 未迁移拒绝服务：选了 sqlite 而库是空的', () => {
  it('装配进未就绪、HTTP 503 且指引指向迁移脚本；响应里没有空册', async () => {
    await seedShards(2)
    writeSettings({ storage: { backend: 'sqlite', sqlitePath: join(base, 'reqboard.sqlite') } })

    const assembled = assembleStorage({
      dshHome: base, dataRoot, legacyLedger: join(base, 'dsh-reqboard.json'),
      moduleDir: join(process.cwd(), 'src'), now: () => 1, warn: () => {}, info: () => {},
    })
    expect(assembled.ok).toBe(false)
    if (assembled.ok) return
    expect(assembled.failure.code).toBe('REQBOARD_REQUIRES_SQLITE_MIGRATION')
    expect(assembled.failure.hint).toContain('migrate-ledger-to-sqlite.ts')

    // 同一条失败经 HTTP 信封 → 503（不是 500「服务器坏了」，也不是空册）
    const res: any = new EventEmitter()
    res.statusCode = 0
    res.writeHead = (c: number) => { res.statusCode = c; return res }
    res.end = (t?: string) => { res.payload = t === undefined ? undefined : JSON.parse(t); return res }
    fail(res, Object.assign(new Error(assembled.failure.message), { code: assembled.failure.code, hint: assembled.failure.hint }))
    expect(res.statusCode).toBe(503)
    expect(res.payload.success).toBe(false)
    // FR-6(REQ-261006201814-ac4f): 由中文文案兜底升级为断码（同一条失败经信封 → 503 且码原样）
    expectCode(res.payload, 'REQBOARD_REQUIRES_SQLITE_MIGRATION')
    expect(res.payload.code).toBe('REQBOARD_REQUIRES_SQLITE_MIGRATION')
    expect(res.payload.hint).toContain('migrate-ledger-to-sqlite.ts')
    expect(res.payload.data).toBeUndefined()
  })
})
