/**
 * settings 五条路由单测（REQ-261004103330-005f t8）。
 *
 * ## 用**真实**适配器，不用假替身
 *
 * 本卡的成败几乎全在"票据门槛"上，而票据的语义（未落章 / 否定作答 / 已消费 / 过期）正是
 * `PendingConfirmRegistry` 的真实行为。用假替身测出来的绿没有意义——这里直接接真实现。
 * 顺带做一次**结构约束的编译期验证**：`const port: StorageActionPort = registry`，
 * 真实实现的形状若漂移，`tsc` 当场报错（而不是等运行期发现票据字段没了）。
 *
 * ## 锁定的口径
 *
 * 1. 未持票 / 未落章 / 否定作答 / 重放 / 过期 → **403 confirmation_required**，且**不写任何文件**；
 * 2. 否定作答有两道：源头 `PendingConfirmRegistry.consume` 判 `denied`（不给误导性的 ok），
 *    路由再接一道 `confirmed !== true`（就算将来有人改坏 consume 的返回语义也切不动）；
 * 3. 目标是"当前已在用"的后端 = 空操作 → **400**，且**不消费票据**（顺序在 consume 之前）；
 * 4. PATCH 收 `storage.backend` → 400（防"一个 PATCH 换库"）；
 * 5. 系统记录损坏 → **200 + invalid:true**，绝不 500（否则整个设置页白屏）。
 *
 * 注：**成功路径必须构造真实切换**（目标 ≠ 在用后端，故用 `bootstrap('sqlite')` 再请求 json）——
 * 空操作不再是合法成功，这是修复 2 的直接后果。
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
let registry: PendingConfirmRegistry
let handler: ReturnType<typeof createReqboardHandler>
let clock: number

/** 假请求：带 url/method，且可被 readBody 的 `for await` 消费。 */
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
 * 以指定的「本进程在用后端」重建一套装配（同一 `base` 目录）。
 *
 * 为什么需要这个参数：本次修复把"切到**当前已在用**的后端"判成 400（空操作），
 * 于是**成功路径必须是一次真实切换**（目标 ≠ 在用）——否则测的就成了"什么都不做也算成功"，
 * 那正是这次要禁掉的语义。失败路径（票据门）则相反：目标要与在用后端**不同**，
 * 否则空操作判定会抢在票据门之前拦下，测不到原本要测的那一层。
 */
function bootstrap(currentBackend: 'json' | 'sqlite' = 'json'): void {
  clock = 1_000_000
  const h = makeHarness()
  // env 传空对象：把 process.env 隔离出去（否则跑测试的机器上设了 PMBOARD_* 会改变结论）
  settings = new FileSettingsStore({ dshHome: base, env: {}, currentBackend, now: () => clock })
  const systemRecord = new SystemRecordFile({
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
    active: { backend: currentBackend, since: new Date(clock).toISOString(), source: 'default' },
  })
  registry = new PendingConfirmRegistry({ now: () => clock, ttlMs: 60_000 })
  // 结构约束的编译期验证：真实实现必须满足路由层的端口（漂移即 tsc 报错）
  const port: StorageActionPort = registry
  handler = createReqboardHandler({
    requirementStore: h.store,
    taskStore: h.taskStore,
    now: () => clock,
    settings,
    systemRecord,
    storageActions: port,
    pluginInfo: { name: 'dsh-pmboard', version: '0.1.0' },
    dshHome: base,
  })
}

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'pmboard-settings-'))
  settingsFile = join(base, SETTINGS_FILE_REL)
  systemFile = join(base, SYSTEM_RECORD_FILE_REL)
  bootstrap()
})
afterEach(() => { rmSync(base, { recursive: true, force: true }) })

const get = async (path: string) => { const res = fakeRes(); await handler(fakeReq('GET', '/dashboard/api/reqboard' + path), res); return res }
const patch = async (path: string, body: unknown) => { const res = fakeRes(); await handler(fakeReq('PATCH', '/dashboard/api/reqboard' + path, body), res); return res }
const post = async (path: string, body: unknown) => { const res = fakeRes(); await handler(fakeReq('POST', '/dashboard/api/reqboard' + path, body), res); return res }

/** 建一张票 + 由作答通道落章（channel 走看板按钮）。 */
async function ticket(opts: { backend?: 'json' | 'sqlite'; action?: string; confirmed: boolean }): Promise<string> {
  const reqRes = await post('/settings/storage/request', opts.action !== undefined ? { action: opts.action } : { backend: opts.backend ?? 'json' })
  expect(reqRes.statusCode).toBe(200)
  const t = String(reqRes.payload.data.ticket)
  const settled = registry.settleStorageAction(
    t,
    { confirmed: opts.confirmed, advanced: false, ...(opts.confirmed ? {} : { userChoice: '取消' }) },
    { channel: 'board-confirm', sessionId: 'session-x', pluginVersion: '0.1.0' },
  )
  expect(settled).toBeDefined()
  return t
}

describe('GET /settings', () => {
  it('回生效设置 + 逐项来源 + 插件版本 + 系统记录摘要与路径；设置文件尚未创建', async () => {
    const res = await get('/settings')
    expect(res.statusCode).toBe(200)
    const d = res.payload.data
    expect(d.plugin).toEqual({ name: 'dsh-pmboard', version: '0.1.0', buildStamp: 'unstamped' })
    expect(d.stageMaxRounds.implementing).toEqual({ value: 1000, default: 1000, source: 'default' })
    expect(d.storage.effective).toBe('json')
    expect(d.storage.restartRequired).toBe(false)
    // FR-17：只读不该把设置文件写出来
    expect(existsSync(settingsFile)).toBe(false)
    expect(d.settingsFile).toEqual({ exists: false, path: settingsFile })
    // 系统记录被自动创建（读即初始化），并给出「打开配置文件」需要的绝对路径
    expect(existsSync(systemFile)).toBe(true)
    expect(d.system.ok).toBe(true)
    expect(d.system.paths.settingsFile).toBe(settingsFile)
    expect(d.system.paths.systemFile).toBe(systemFile)
  })
})

describe('PATCH /settings', () => {
  it('改上限 → 200，来源变 settings，且此时才创建设置文件', async () => {
    const res = await patch('/settings', { stageMaxRounds: { implementing: 5 } })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.stageMaxRounds.implementing).toEqual({ value: 5, default: 1000, source: 'settings' })
    expect(existsSync(settingsFile)).toBe(true)
    expect(JSON.parse(readFileSync(settingsFile, 'utf8')).stageMaxRounds).toEqual({ implementing: 5 })
  })

  it('体里出现 storage.backend → 400 且指向确认门（防"一个 PATCH 换库"）', async () => {
    const res = await patch('/settings', { storage: { backend: 'sqlite' } })
    expect(res.statusCode).toBe(400)
    expect(res.payload.code).toBe('invalid_input')
    expect(res.payload.error).toContain('storage.backend')
    expect(res.payload.error).toContain('/settings/storage/switch')
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('越界值 → 400 且消息含范围「1–10000」，不写盘', async () => {
    for (const bad of [0, 10_001, 1.5]) {
      const res = await patch('/settings', { stageMaxRounds: { implementing: bad } })
      expect(res.statusCode).toBe(400)
      expect(res.payload.error).toContain('1–10000')
    }
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('空体 → 400（不允许"空请求把文件写出来"）', async () => {
    const res = await patch('/settings', {})
    expect(res.statusCode).toBe(400)
    expect(existsSync(settingsFile)).toBe(false)
  })
})

describe('POST /settings/storage/request', () => {
  it('建票据；没有弹框通道时如实说 delivered:false，且票据**未落章**', async () => {
    const res = await post('/settings/storage/request', { backend: 'sqlite', sessionId: 'session-x' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.action).toBe('switch-to-sqlite')
    expect(res.payload.data.delivered).toBe(false)
    expect(res.payload.data.hint).toContain('未落章')
    expect(res.payload.data.expiresAt).toBeGreaterThan(res.payload.data.expiresAt - 1)
    // 未落章的票据不可消费：这是 fail-closed 的核心
    const c = registry.consume(String(res.payload.data.ticket))
    expect(c.ok).toBe(false)
    expect(c.ok === false && c.reason).toBe('unsettled')
  })

  it('缺 action/backend → 400', async () => {
    const res = await post('/settings/storage/request', {})
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /settings/storage/switch · 人工确认门', () => {
  it('无票据 → 403 confirmation_required，且不写设置文件', async () => {
    // 目标用 sqlite（≠ 在用 json）：否则"空操作"那条会先拦下，测不到票据门这一层
    const res = await post('/settings/storage/switch', { backend: 'sqlite' })
    expect(res.statusCode).toBe(403)
    expect(res.payload.code).toBe('confirmation_required')
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('票据存在但无人作答 → 403，且不写设置文件', async () => {
    const reqRes = await post('/settings/storage/request', { backend: 'sqlite' })
    const t = String(reqRes.payload.data.ticket)
    const res = await post('/settings/storage/switch', { backend: 'sqlite', ticket: t })
    expect(res.statusCode).toBe(403)
    expect(res.payload.error).toContain('还没有人作答')
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('人点了「取消」→ 403，且**不切后端**（源头那道已判 denied：否定作答不是许可）', async () => {
    const t = await ticket({ backend: 'sqlite', confirmed: false })
    const res = await post('/settings/storage/switch', { backend: 'sqlite', ticket: t })
    expect(res.statusCode).toBe(403)
    expect(res.payload.code).toBe('confirmation_required')
    // 原因必须是"否定作答"而不是笼统的"不可用"：排查者据此区分"人拒绝了"与"没人答/过期/重放"
    expect(res.payload.error).toContain('否定')
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('空操作不烧票据：目标是「当前已在用」的后端 → 400，且票据仍未被消费', async () => {
    // 先造一次真实写入，好让"设置文件未变"是可断言的（否则文件根本不存在，断言会偏弱）
    await patch('/settings', { stageMaxRounds: { implementing: 7 } })
    const before = readFileSync(settingsFile, 'utf8')
    const t = await ticket({ backend: 'json', confirmed: true })   // 合法票据（已落章且同意）

    const res = await post('/settings/storage/switch', { backend: 'json', ticket: t })
    expect(res.statusCode).toBe(400)
    expect(res.payload.error).toContain('已在用')
    // ① 不写设置文件（逐字节未变）
    expect(readFileSync(settingsFile, 'utf8')).toBe(before)
    // ② 不写系统记录事件（档案里不该出现一次什么都没做的 backend-switched）；
    //    文件压根没被创建也算通过——那是更强的证据（连档案都没碰），故两种情形都要覆盖
    const rec = existsSync(systemFile) ? JSON.parse(readFileSync(systemFile, 'utf8')) : { history: [] }
    expect(rec.history.filter((e: { event: string }) => e.event === 'backend-switched')).toHaveLength(0)
    // ③ **票据未被烧掉**：否则人得为一次"没有可做的事"重新确认一遍
    expect(registry.getStorageAction(t)?.consumedAt).toBeUndefined()
  })

  it('空操作 400 之后同一张票据仍可用到下一关（行为级证明它没被消费）', async () => {
    // 在用 sqlite，于是"切 sqlite"是空操作、"切 json"是真实切换
    bootstrap('sqlite')
    const t = await ticket({ backend: 'sqlite', confirmed: true })

    const noop = await post('/settings/storage/switch', { backend: 'sqlite', ticket: t })
    expect(noop.statusCode).toBe(400)
    expect(noop.payload.error).toContain('已在用')

    // 同一张票（动作是 switch-to-sqlite）去请求切 json：会走到"动作与请求不符"，
    // 而**不是**"票据已被消费"——这正好证明它在空操作那一步没有被消费掉。
    const next = await post('/settings/storage/switch', { backend: 'json', ticket: t })
    expect(next.statusCode).toBe(400)
    expect(next.payload.error).toContain('动作与请求不符')
    expect(next.payload.error).not.toContain('已被消费')
  })

  it('已落章且同意 → 200：写设置文件 + 追加 backend-switched 事件（带确认人留痕）', async () => {
    // 真实切换：在用 sqlite → 请求 json（否则会被"已在用"判成 400 空操作）
    bootstrap('sqlite')
    const t = await ticket({ backend: 'json', confirmed: true })
    const res = await post('/settings/storage/switch', { backend: 'json', ticket: t, reason: '测试' })
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.backend).toBe('json')
    expect(res.payload.data.restartRequired).toBe(true)
    expect(JSON.parse(readFileSync(settingsFile, 'utf8')).storage.backend).toBe('json')

    const rec = JSON.parse(readFileSync(systemFile, 'utf8'))
    const ev = rec.history.filter((e: { event: string }) => e.event === 'backend-switched').pop()
    expect(ev).toBeDefined()
    expect(ev.keptOtherStore).toBe(true)
    expect(ev.reason).toBe('测试')
    expect(ev.confirmedBy.channel).toBe('board-confirm')
    expect(ev.confirmedBy.sessionId).toBe('session-x')
    expect(ev.confirmedBy.pluginVersion).toBe('0.1.0')
    expect(rec.active.backend).toBe('json')
  })

  it('重放同一票据 → 403（一次性，不可重放）', async () => {
    bootstrap('sqlite')
    const t = await ticket({ backend: 'json', confirmed: true })
    expect((await post('/settings/storage/switch', { backend: 'json', ticket: t })).statusCode).toBe(200)
    const again = await post('/settings/storage/switch', { backend: 'json', ticket: t })
    expect(again.statusCode).toBe(403)
    expect(again.payload.error).toContain('已被消费')
  })

  it('过期票据 → 403（时钟推进，不 sleep）', async () => {
    const t = await ticket({ backend: 'sqlite', confirmed: true })
    clock += 120_000 // TTL 60s
    const res = await post('/settings/storage/switch', { backend: 'sqlite', ticket: t })
    expect(res.statusCode).toBe(403)
    expect(res.payload.error).toContain('已过期')
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('票据动作与请求不符 → 400（不能拿"切回 json"的票去切 sqlite）', async () => {
    const t = await ticket({ backend: 'json', confirmed: true })
    const res = await post('/settings/storage/switch', { backend: 'sqlite', ticket: t })
    expect(res.statusCode).toBe(400)
    expect(res.payload.error).toContain('动作与请求不符')
  })

  it('切 sqlite 但库里没数据 → 409 sqlite_not_migrated（不让空库被当现状）', async () => {
    const t = await ticket({ backend: 'sqlite', confirmed: true })
    const res = await post('/settings/storage/switch', { backend: 'sqlite', ticket: t })
    expect(res.statusCode).toBe(409)
    expect(res.payload.code).toBe('sqlite_not_migrated')
    expect(existsSync(settingsFile)).toBe(false)
  })

  it('backend 取值非法 → 400', async () => {
    const res = await post('/settings/storage/switch', { backend: 'mysql', ticket: 'sc-1' })
    expect(res.statusCode).toBe(400)
  })
})

describe('GET /settings/system', () => {
  it('正常 → 200 + 记录全量 + 两个 droppedEvents 口径都在', async () => {
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    const d = res.payload.data
    expect(d.ok).toBe(true)
    expect(d.record.history[0].event).toBe('startup')
    expect(d.droppedEvents).toBe(0)
    expect(d.droppedEventsTotal).toBe(0)
    expect(d.paths.systemFile).toBe(systemFile)
  })

  it('记录文件损坏 → **200 + invalid:true**（绝不 500，否则设置页白屏），并给可复制路径与指引', async () => {
    writeFileSync(systemFile, '{ 这不是 JSON')
    const res = await get('/settings/system')
    expect(res.statusCode).toBe(200)
    const d = res.payload.data
    expect(d.ok).toBe(false)
    expect(d.invalid).toBe(true)
    expect(d.path).toBe(systemFile)
    expect(d.hint).toContain('不自动重建')
  })

  it('limit 生效（只回尾部 N 条），上限被夹住', async () => {
    const res = await get('/settings/system?limit=1')
    expect(res.statusCode).toBe(200)
    expect(res.payload.data.record.history).toHaveLength(1)
    expect(res.payload.data.historyTotal).toBeGreaterThanOrEqual(1)
  })
})

describe('组合根未装配时的行为', () => {
  it('缺 settings 端口 → 响亮 500 且点明组合根 bug（不伪造空设置）', async () => {
    const bare = createReqboardHandler({ requirementStore: makeHarness().store, taskStore: makeHarness().taskStore, now: () => clock })
    const res = fakeRes()
    await bare(fakeReq('GET', '/dashboard/api/reqboard/settings'), res)
    expect(res.statusCode).toBe(500)
    expect(res.payload.error).toContain('未装配')
    expect(res.payload.error).toContain('组合根')
  })
})

describe('弹框作答通道 → 落章 → 切换（把选项文案与判定钉死）', () => {
  /** 用真实 registry + 假弹框通道：验证"人点确认执行"这条链真的能走通。 */
  function withQuestions(answerLabel: string) {
    const h = makeHarness()
    const questions = {
      available: () => true,
      ask: async () => [{ id: 'x', selected: [answerLabel] }],
    }
    return createReqboardHandler({
      requirementStore: h.store,
      taskStore: h.taskStore,
      now: () => clock,
      settings,
      systemRecord: new SystemRecordFile({
        file: systemFile,
        now: () => clock,
        plugin: { name: 'dsh-pmboard', stamp: { version: '0.1.0', buildStamp: 'test' }, sqliteSchemaVersion: 1 },
        paths: { shardDataRoot: join(base, 'reqboard'), sqliteFile: join(base, 'reqboard.sqlite'), settingsFile, legacyLedger: join(base, 'ledger.json'), backupDirs: [] },
        active: { backend: 'json', since: new Date(clock).toISOString(), source: 'default' },
      }),
      storageActions: registry,
      pluginInfo: { name: 'dsh-pmboard', version: '0.1.0' },
      dshHome: base,
      applicationDeps: { ...h.deps, questions } as never,
    })
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))

  it('人点「确认执行」→ 票据由作答通道落章 → switch 成功', async () => {
    // 真实切换（在用 sqlite → 请求 json）：避免被"已在用"判成 400 空操作
    bootstrap('sqlite')
    const h = withQuestions('确认执行')
    const reqRes = fakeRes()
    await h(fakeReq('POST', '/dashboard/api/reqboard/settings/storage/request', { backend: 'json', sessionId: 'session-x' }), reqRes)
    expect(reqRes.payload.data.delivered).toBe(true)
    const t = String(reqRes.payload.data.ticket)
    await flush() // 落章发生在作答返回之后（fire-and-forget）
    expect(registry.consume(t).ok).toBe(true)

    // consume 会把票据消费掉，故再建一张来验证 switch 全链
    const req2 = fakeRes()
    await h(fakeReq('POST', '/dashboard/api/reqboard/settings/storage/request', { backend: 'json', sessionId: 'session-x' }), req2)
    const t2 = String(req2.payload.data.ticket)
    await flush()
    const res = fakeRes()
    await h(fakeReq('POST', '/dashboard/api/reqboard/settings/storage/switch', { backend: 'json', ticket: t2 }), res)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(readFileSync(settingsFile, 'utf8')).storage.backend).toBe('json')
  })

  it('人点「取消」→ 落章为否定 → switch 403 且不写文件（选项文案与判定同源）', async () => {
    // 目标 json（在用 sqlite）：否则"已在用"会先判 400，测不到"否定作答"这条链
    bootstrap('sqlite')
    const h = withQuestions('取消')
    const reqRes = fakeRes()
    await h(fakeReq('POST', '/dashboard/api/reqboard/settings/storage/request', { backend: 'json' }), reqRes)
    const t = String(reqRes.payload.data.ticket)
    await flush()
    const res = fakeRes()
    await h(fakeReq('POST', '/dashboard/api/reqboard/settings/storage/switch', { backend: 'json', ticket: t }), res)
    expect(res.statusCode).toBe(403)
    expect(existsSync(settingsFile)).toBe(false)
  })
})
