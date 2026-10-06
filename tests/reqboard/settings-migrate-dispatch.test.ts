/**
 * 迁移开窗链路单测（REQ-261004103330-005f t10 / FR-10、FR-11）。
 *
 * ## 这份测试锁的是什么
 *
 * 1. **票据门槛与 switch 同款**：无票 / 否定作答 / 动作不符 → 403 `confirmation_required`，
 *    且**不开窗、不投递、不写任何系统事件**（"没发生的事不许进档案"）。
 * 2. **失败三态必须分得清**（窗口有没有建成 × 任务有没有送到）：
 *    `window_opener_unavailable`(503) / `window_open_failed`(500) / `dispatch_failed`(502)；
 *    其中 `dispatch_failed` 的消息必须说清"**窗口建成了但任务没送到**"，否则人会以为白点了一下。
 * 3. **请求阶段不写事件**：事件种类只有五种，没有 "migration-requested"——本链路只发起，
 *    迁移结果由脚本结束时报（故三个失败分支都不产生任何事件）。
 * 4. 成功时底稿自带脚本名与 `--from` / `--to`，新窗口无需再问人。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeHarness } from '../application/harness.js'
import { createReqboardHandler } from '../../src/http/routes.js'
import { FileSettingsStore } from '../../src/adapters/FileSettingsStore.js'
import { SystemRecordFile } from '../../src/adapters/SystemRecordFile.js'
import { PendingConfirmRegistry } from '../../src/adapters/PendingConfirmRegistry.js'
import { SETTINGS_FILE_REL } from '../../src/application/settings/resolve-settings.js'
import { SYSTEM_RECORD_FILE_REL } from '../../src/application/settings/events.js'
import type { StorageActionPort } from '../../src/http/routers/shared.js'

let base: string
let settingsFile: string
let systemFile: string
let settings: FileSettingsStore
let systemRecord: SystemRecordFile
let registry: PendingConfirmRegistry
let handler: ReturnType<typeof createReqboardHandler>
let clock: number

/** 记录"谁被调过"——失败路径的断言靠它，而不是靠猜。 */
interface Calls {
  created: number
  delivered: number
  texts: string[]
  /** REQ-261005151245-54ae：继承三件的调用痕迹（仅 `inherit: true` 时被填）。 */
  inherit: {
    profiles: number
    create: { cwd?: string; workspaceId?: string; agentPreset?: string }[]
    rename: { sessionId: string; title: string }[]
    selectModel: { sessionId: string; selection: { provider: string; model: string } }[]
  }
}

function fakeReq(method: string, url: string, body?: unknown): any {
  const req = new EventEmitter() as any
  req.url = url
  req.method = method
  req[Symbol.asyncIterator] = async function* () {
    if (body !== undefined) yield Buffer.from(JSON.stringify(body), 'utf8')
  }
  return req
}

function fakeRes(): any {
  const res: any = new EventEmitter()
  res.statusCode = 0
  res.payload = undefined
  res.writeHead = (code: number) => { res.statusCode = code; return res }
  res.end = (text?: string) => { res.payload = text === undefined ? undefined : JSON.parse(text); return res }
  return res
}

/**
 * 装配一套面向迁移链路的 handler。
 *
 * `opener` / `deliver` 的三种故障形态由调用方注入（能力未装配 / 建会话失败 / 投递失败），
 * 这正是本卡要区分的三态。
 */
function bootstrap(opts: {
  opener?: 'ok' | 'unavailable' | 'create-fail'
  deliver?: 'ok' | 'fail' | 'missing'
  /** REQ-261005151245-54ae：给假开窗口装上「读画像 / 写标题 / 写模型」三个新方法。 */
  inherit?: boolean
} = {}): Calls {
  clock = 1_000_000
  const h = makeHarness()
  const calls: Calls = {
    created: 0,
    delivered: 0,
    texts: [],
    inherit: { profiles: 0, create: [], rename: [], selectModel: [] },
  }
  settings = new FileSettingsStore({ dshHome: base, env: {}, currentBackend: 'json', now: () => clock })
  systemRecord = new SystemRecordFile({
    file: systemFile,
    now: () => clock,
    plugin: { name: 'dsh-pmboard', stamp: { version: '0.1.0', buildStamp: 'test' }, sqliteSchemaVersion: 1 },
    paths: {
      shardDataRoot: join(base, 'reqboard'),
      sqliteFile: join(base, 'reqboard.sqlite'),
      settingsFile,
      legacyLedger: join(base, 'dsh-reqboard.json'),
      backupDirs: [],
    },
    active: { backend: 'json', since: new Date(clock).toISOString(), source: 'default' },
  })
  registry = new PendingConfirmRegistry({ now: () => clock, ttlMs: 60_000 })
  const port: StorageActionPort = registry

  const kind = opts.opener ?? 'ok'
  const windowOpener = {
    available: () => kind !== 'unavailable',
    create: async (request?: { cwd?: string; workspaceId?: string; agentPreset?: string }) => {
      calls.created += 1
      calls.inherit.create.push(request ?? {})
      return kind === 'create-fail'
        ? { ok: false as const, code: 'open_failed' as const, reason: '宿主拒绝建会话' }
        : { ok: true as const, windowKey: 'session-mig-1' }
    },
    resolveSourceProject: () => ({ cwd: base }),
    ...(opts.inherit === true
      ? {
          readProfile: async () => {
            calls.inherit.profiles += 1
            return {
              title: '源窗口标题 (2)',
              agentPreset: 'cordis',
              modelSelection: { provider: 'deepseek', model: 'deepseek-chat' },
            }
          },
          rename: async (sessionId: string, title: string) => {
            calls.inherit.rename.push({ sessionId, title })
          },
          selectModel: async (sessionId: string, selection: { provider: string; model: string }) => {
            calls.inherit.selectModel.push({ sessionId, selection })
          },
        }
      : {}),
  }
  const dkind = opts.deliver ?? 'ok'
  const crossWindowDeliver = {
    createMessage: (p: { text: string; kind: string }) => {
      calls.texts.push(p.text)
      return { message: { text: p.text, kind: p.kind }, messageId: 'm-1' }
    },
    deliver: async () => {
      calls.delivered += 1
      return dkind === 'fail'
        ? { delivered: false, reason: '目标窗口不在线' }
        : { delivered: true }
    },
  }

  handler = createReqboardHandler({
    requirementStore: h.store,
    taskStore: h.taskStore,
    now: () => clock,
    settings,
    systemRecord,
    storageActions: port,
    pluginInfo: { name: 'dsh-pmboard', version: '0.1.0' },
    dshHome: base,
    ...(dkind === 'missing'
      ? { applicationDeps: { windowOpener } as never }
      : { applicationDeps: { windowOpener, crossWindowDeliver } as never }),
  })
  return calls
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'pmboard-migrate-'))
  settingsFile = join(base, SETTINGS_FILE_REL)
  systemFile = join(base, SYSTEM_RECORD_FILE_REL)
})
afterEach(() => { rmSync(base, { recursive: true, force: true }) })

const post = async (path: string, body: unknown) => {
  const res = fakeRes()
  await handler(fakeReq('POST', '/dashboard/api/reqboard' + path, body), res)
  return res
}

/** 建一张 migrate 票并由作答通道落章。 */
async function migrateTicket(confirmed: boolean, action = 'migrate'): Promise<string> {
  const r = await post('/settings/storage/request', { action })
  expect(r.statusCode).toBe(200)
  const t = String(r.payload.data.ticket)
  registry.settleStorageAction(
    t,
    { confirmed, advanced: false, ...(confirmed ? {} : { userChoice: '取消' }) },
    { channel: 'board-confirm', sessionId: 'session-x', pluginVersion: '0.1.0' },
  )
  return t
}

/** 系统记录文件里有没有 migration 事件（"没发生的事不许进档案"）。 */
function hasMigrationEvent(): boolean {
  if (!existsSync(systemFile)) return false
  return readFileSync(systemFile, 'utf8').includes('"event":"migration"')
}

/**
 * 记录文件的**逐字节快照**。
 *
 * 为什么比"没有 migration 事件"更硬：只查某个事件名，会漏掉"写了别的事件"或"悄悄改了 updatedAt"。
 * 失败路径的正确语义是**档案完全没被动过**，所以就按逐字节比。
 */
function snapshotSystemFile(): string {
  return existsSync(systemFile) ? readFileSync(systemFile, 'utf8') : '(不存在)'
}

describe('票据门槛（与 switch 同款）', () => {
  it('无票 → 403 confirmation_required，且不开窗、不投递、不写事件', async () => {
    const calls = bootstrap()
    await systemRecord.read() // 先让记录文件存在（含首条 startup），失败路径才谈得上"没多写"
    const res = await post('/settings/storage/migrate', {})
    expect(res.statusCode).toBe(403)
    expect(res.payload.code).toBe('confirmation_required')
    expect(calls.created).toBe(0)
    expect(calls.delivered).toBe(0)
    expect(hasMigrationEvent()).toBe(false)
  })

  it('否定作答（人点取消）→ 403，且不开窗、不投递、不写事件', async () => {
    const calls = bootstrap()
    const t = await migrateTicket(false)
    const res = await post('/settings/storage/migrate', { ticket: t })
    expect(res.statusCode).toBe(403)
    expect(res.payload.error).toContain('否定')
    expect(calls.created).toBe(0)
    expect(hasMigrationEvent()).toBe(false)
  })

  it('票据动作不符（拿 switch 的票来迁移）→ 403，且不消费成执行', async () => {
    const calls = bootstrap()
    const t = await migrateTicket(true, 'switch-to-sqlite')
    const res = await post('/settings/storage/migrate', { ticket: t })
    expect(res.statusCode).toBe(403)
    expect(res.payload.error).toContain('动作与请求不符')
    expect(calls.created).toBe(0)
  })
})

describe('失败三态必须分得清', () => {
  it('开窗能力未装配 → 503 window_opener_unavailable，且未投递', async () => {
    const calls = bootstrap({ opener: 'unavailable' })
    // 先让档案就位：**首次 `read()` 会自动建档并记一条启动事件**（FR-17 的自动初始化），
    // 那是"档案诞生"，不是"给迁移记账"。催熟之后再比，断言的才是"这次调用没动过档案"。
    await systemRecord.read()
    const t = await migrateTicket(true)
    const before = snapshotSystemFile()
    const res = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(res.statusCode).toBe(503)
    expect(res.payload.code).toBe('window_opener_unavailable')
    expect(res.payload.error).toContain('窗口没建成')
    expect(calls.delivered).toBe(0)
    expect(hasMigrationEvent()).toBe(false)
    expect(snapshotSystemFile()).toBe(before) // 档案逐字节未变：没发生的事不许进档案
  })

  it('投递通道未装配（只装了开窗）→ 503，且未建窗口', async () => {
    const calls = bootstrap({ deliver: 'missing' })
    const t = await migrateTicket(true)
    const res = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(res.statusCode).toBe(503)
    expect(res.payload.code).toBe('window_opener_unavailable')
    expect(calls.created).toBe(0)
    expect(hasMigrationEvent()).toBe(false)
  })

  it('建会话失败 → 500 window_open_failed，且未投递', async () => {
    const calls = bootstrap({ opener: 'create-fail' })
    // 先让档案就位：**首次 `read()` 会自动建档并记一条启动事件**（FR-17 的自动初始化），
    // 那是"档案诞生"，不是"给迁移记账"。催熟之后再比，断言的才是"这次调用没动过档案"。
    await systemRecord.read()
    const t = await migrateTicket(true)
    const before = snapshotSystemFile()
    const res = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(res.statusCode).toBe(500)
    expect(res.payload.code).toBe('window_open_failed')
    expect(res.payload.error).toContain('窗口没建成')
    expect(calls.delivered).toBe(0)
    expect(hasMigrationEvent()).toBe(false)
    expect(snapshotSystemFile()).toBe(before)
  })

  it('投递失败 → 502 dispatch_failed，且消息须说明「窗口已建成但任务没送到」', async () => {
    const calls = bootstrap({ deliver: 'fail' })
    // 先让档案就位：**首次 `read()` 会自动建档并记一条启动事件**（FR-17 的自动初始化），
    // 那是"档案诞生"，不是"给迁移记账"。催熟之后再比，断言的才是"这次调用没动过档案"。
    await systemRecord.read()
    const t = await migrateTicket(true)
    const before = snapshotSystemFile()
    const res = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(res.statusCode).toBe(502)
    expect(res.payload.code).toBe('dispatch_failed')
    expect(res.payload.error).toContain('窗口已建成')
    expect(res.payload.error).toContain('没有送达')
    expect(res.payload.error).toContain('session-mig-1')
    expect(calls.created).toBe(1)
    expect(hasMigrationEvent()).toBe(false)
    expect(snapshotSystemFile()).toBe(before)
  })

  it('系统记录不可读 → 响亮失败（不猜数据在哪），且不建窗口', async () => {
    const calls = bootstrap()
    writeFileSync(systemFile, '{ 这不是 JSON', 'utf8')
    const t = await migrateTicket(true)
    const res = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(res.statusCode).toBe(500)
    expect(res.payload.code).toBe('migration_paths_unknown')
    expect(res.payload.error).toContain('无法确定源数据根')
    expect(calls.created).toBe(0)
  })
})

describe('成功路径', () => {
  it('返回窗口码，且底稿自带脚本名与 --from / --to', async () => {
    const calls = bootstrap()
    await systemRecord.read() // 催熟档案（首次读会建档 + 记一条启动事件）
    const t = await migrateTicket(true)
    const before = snapshotSystemFile()
    const res = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.windowKey).toBe('session-mig-1')
    expect(res.payload.data.sessionId).toBe('session-mig-1')
    expect(res.payload.data.task).toBe('migrate-ledger-to-sqlite')

    expect(calls.created).toBe(1)
    expect(calls.delivered).toBe(1)
    expect(calls.texts).toHaveLength(1)
    const text = calls.texts[0]
    expect(text).toContain('migrate-ledger-to-sqlite')
    expect(text).toContain('--from')
    expect(text).toContain('--to')
    expect(text).toContain('--write-settings')
    // 底稿必须把两条硬约束带给新窗口（源只读 / 校验通过才写设置）
    expect(text).toContain('只读')
    expect(text).toContain('校验')
    // **成功路径同样不许写事件**：本链路只发起，迁移结果由脚本结束时记。
    // （反向演练确认过：把一条事件写在这条路径上，这一行必红。）
    expect(snapshotSystemFile()).toBe(before)
  })

  it('票据一次性：同一张票第二次调用被拒，且不重复建窗口', async () => {
    const calls = bootstrap()
    const t = await migrateTicket(true)
    const first = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(first.statusCode).toBe(200)
    const second = await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
    expect(second.statusCode).toBe(403)
    expect(second.payload.error).toContain('已被消费')
    expect(calls.created).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// REQ-261005151245-54ae FR-5 / FR-6：迁移窗口也继承（标题走显式语义名，模式与模型照样继承）
// ---------------------------------------------------------------------------

describe('REQ-261005151245-54ae 迁移窗口的继承回执', () => {
  /** 走完票据门槛的成功路径（迁移发起需要人工确认票）。 */
  async function migrateWithTicket() {
    const t = await migrateTicket(true)
    return await post('/settings/storage/migrate', { ticket: t, sessionId: 'session-x' })
  }

  it('T-15 显式语义标题 + 模式随建会话请求带入 + 回执含 inheritance（三项 set）', async () => {
    const calls = bootstrap({ inherit: true })
    const res = await migrateWithTicket()

    expect(res.statusCode).toBe(200)
    expect(res.payload.data.windowKey).toBe('session-mig-1')
    expect(res.payload.data.inheritance).toEqual({ title: 'set', preset: 'set', model: 'set', reasons: [] })
    // 标题走显式语义名（迁移窗口不是续作，不递增源标题）
    expect(calls.inherit.rename).toEqual([{ sessionId: 'session-mig-1', title: '台账迁移窗口' }])
    // 模式随 create 请求体带入；模型单独写一次
    expect(calls.inherit.create).toEqual([{ cwd: base, agentPreset: 'cordis' }])
    expect(calls.inherit.selectModel).toEqual([
      { sessionId: 'session-mig-1', selection: { provider: 'deepseek', model: 'deepseek-chat' } },
    ])
  })

  it('T-15b 旧装配（无 readProfile）→ 窗口照建、任务照投，inheritance 三项 failed 且不阻断迁移发起', async () => {
    const calls = bootstrap()
    const res = await migrateWithTicket()

    expect(res.statusCode).toBe(200)
    expect(res.payload.data.inheritance.title).toBe('failed')
    expect(res.payload.data.inheritance.preset).toBe('failed')
    expect(res.payload.data.inheritance.model).toBe('failed')
    expect(res.payload.data.inheritance.reasons.join(' ')).toContain('未装配读画像能力')
    expect(calls.created).toBe(1)
    expect(calls.delivered).toBe(1)
  })
})
