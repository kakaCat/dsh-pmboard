/**
 * `POST /settings/storage/pick-path`（REQ-261004103330-005f，2026-10-04）。
 *
 * ## 为什么这条值得单独一组用例
 *
 * 「改路径」原本要人手打路径；人要求像操作系统那样弹窗口选。浏览器拿不到真实绝对路径（安全边界），
 * 所以真正的选择发生在**宿主进程**，路由只是那道缝。三态**必须确定**，因为它们对用户意味着不同的事：
 *
 * | 结果 | 响应 | 界面该说什么 |
 * |---|---|---|
 * | 选中 | `200 {ok:true,path}` | 填进输入框（保存仍由人点） |
 * | **人取消** | `200 {ok:false,cancelled:true}` | **什么都不说**（报"出错了"= 撒谎） |
 * | 弹不出窗口 | `501 path_picker_unavailable` | "可以手动输入路径" |
 *
 * 另有一条**防注入**断言：请求体里的任何内容都不得进入 osascript 脚本
 * （脚本是常量、参数只走 argv，shell 不参与）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeHarness } from '../application/harness.js'
import { createReqboardHandler } from '../../src/http/routes.js'
import { FileSettingsStore } from '../../src/adapters/FileSettingsStore.js'
import { SystemRecordFile } from '../../src/adapters/SystemRecordFile.js'
import { PendingConfirmRegistry } from '../../src/adapters/PendingConfirmRegistry.js'
import { SETTINGS_FILE_REL } from '../../src/application/settings/resolve-settings.js'
import { SYSTEM_RECORD_FILE_REL } from '../../src/application/settings/events.js'
import type { StoragePathPickOutcome, StoragePathPickerPort } from '../../src/application/ports.js'
import type { StorageActionPort } from '../../src/http/routers/shared.js'

let base: string
let handler: ReturnType<typeof createReqboardHandler>

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

/** 用给定的选择端口（或"不装配"）建一套路由；端口记录每次调用收到的参数（防注入断言用）。 */
function bootstrap(calls: unknown[], outcome?: StoragePathPickOutcome): void {
  const now = 1_000_000
  const settings = new FileSettingsStore({ dshHome: base, env: {}, currentBackend: 'json', now: () => now })
  const systemRecord = new SystemRecordFile({
    file: join(base, SYSTEM_RECORD_FILE_REL),
    now: () => now,
    plugin: { name: 'dsh-pmboard', stamp: { version: '0.1.0', buildStamp: 'test' }, sqliteSchemaVersion: 1 },
    paths: {
      shardDataRoot: join(base, 'reqboard'),
      sqliteFile: join(base, 'reqboard.sqlite'),
      settingsFile: join(base, SETTINGS_FILE_REL),
      legacyLedger: join(base, 'dsh-reqboard.json'),
      backupDirs: [],
    },
    active: { backend: 'json', since: new Date(now).toISOString(), source: 'default' },
  })
  const registry = new PendingConfirmRegistry({ now: () => now, ttlMs: 60_000 })
  const actionPort: StorageActionPort = registry
  const pickStoragePath: StoragePathPickerPort | undefined = outcome === undefined
    ? undefined
    : { pick: async (...args: unknown[]) => { calls.push(args); return outcome } }
  const h = makeHarness()
  handler = createReqboardHandler({
    requirementStore: h.store,
    taskStore: h.taskStore,
    now: () => now,
    settings,
    systemRecord,
    storageActions: actionPort,
    pluginInfo: { name: 'dsh-pmboard', version: '0.1.0' },
    dshHome: base,
    ...(pickStoragePath !== undefined ? { pickStoragePath } : {}),
  })
}

const post = async (path: string, body: unknown) => {
  const res = fakeRes()
  await handler(fakeReq('POST', '/dashboard/api/reqboard' + path, body), res)
  return res
}

beforeEach(() => { base = mkdtempSync(join(tmpdir(), 'pmboard-pickpath-')) })
afterEach(() => { rmSync(base, { recursive: true, force: true }) })

describe('POST /settings/storage/pick-path', () => {
  it('选中：200 + {ok:true,path}', async () => {
    const calls: unknown[] = []
    bootstrap(calls, { kind: 'picked', path: '/Users/mac/.dsh/reqboard.sqlite' })
    const res = await post('/settings/storage/pick-path', {})
    expect(res.statusCode).toBe(200)
    expect(res.payload.data).toEqual({ ok: true, path: '/Users/mac/.dsh/reqboard.sqlite' })
  })

  it('人取消：200 + {ok:false,cancelled:true}（**不是错误**）', async () => {
    const calls: unknown[] = []
    bootstrap(calls, { kind: 'cancelled' })
    const res = await post('/settings/storage/pick-path', {})
    expect(res.statusCode).toBe(200)
    expect(res.payload.data).toEqual({ ok: false, cancelled: true })
  })

  it('弹不出窗口：501 + path_picker_unavailable，消息里明确"可以手动输入路径"', async () => {
    const calls: unknown[] = []
    bootstrap(calls, { kind: 'unavailable', reason: '当前平台是 linux' })
    const res = await post('/settings/storage/pick-path', {})
    expect(res.statusCode).toBe(501)
    expect(res.payload.code).toBe('path_picker_unavailable')
    expect(res.payload.error).toContain('手动输入')
  })

  it('宿主未装配端口：也是 501（组合根事实，不是用户错误）', async () => {
    const calls: unknown[] = []
    bootstrap(calls)
    const res = await post('/settings/storage/pick-path', {})
    expect(res.statusCode).toBe(501)
    expect(res.payload.code).toBe('path_picker_unavailable')
  })

  it('**防注入**：请求体里的任何内容都不会进入选择逻辑（端口收到的入参为空）', async () => {
    const calls: unknown[] = []
    bootstrap(calls, { kind: 'picked', path: '/tmp/a.sqlite' })
    // 恶意/畸形请求体：若被拼进 osascript 就是命令注入面
    const hostile = { path: '"; rm -rf / #', cmd: '$(whoami)', script: 'do shell script "id"' }
    const res = await post('/settings/storage/pick-path', hostile)
    expect(res.statusCode).toBe(200)
    // 端口只被调用一次，且**没有携带任何入参**（脚本是常量，参数只走 argv）
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual([])
  })
})
