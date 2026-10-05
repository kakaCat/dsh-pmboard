/**
 * 存储与数据库屏的单测（REQ-261004103330-005f t13）。
 *
 * ## 这份测试锁的是什么
 *
 * 1. **确认门的三步**：先取票 → 人在真确认框作答 → 回来点"继续执行"才带票调接口；
 * 2. **取消不发任何执行请求**（取消是零副作用，不是"发出去再撤回"）；
 * 3. **任何失败都清票且不自动重试**（票据一次性；403 的文案必须点明"重新发起确认"）；
 * 4. **七类错误各有独立人话**（不许一句"出错了"打发所有情况）；
 * 5. **票据只存内存**：不落 localStorage（FR-11）——用替身 localStorage 断言从未被写；
 * 6. **迁移清单只按可观测事实标记**（观测不到标 ?，不编造进度、不显示百分比）；
 * 7. 类名与令牌纪律：只用 `dsh-pm-set-` 前缀与真令牌。
 *
 * 行为层用**最小 document 替身**真跑 `createBodyHost` 的委派（比"读源码断言字符串"更接近行为），
 * 纯逻辑（状态机 / 文案 / 清单）直接直测。
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  MIGRATION_STEPS, STORAGE_COPY, actionForBackend, actionTitle, alreadyActiveHint, backendName,
  impactLines, migrationFactsOf, migrationSteps, shouldClearTicketOnError, sourceLabel, storageErrorCopy,
  ticketExpired,
} from '../src/client/settings/storage.ts'
import { buildStoragePane } from '../src/client/settings/render/storage.ts'
import { buildSettingsShell } from '../src/client/settings/render/shell.ts'
import { STORAGE_PATH_CANCEL, STORAGE_PATH_PICK, STORAGE_PATH_SAVE, attachStoragePathEditor } from '../src/client/settings/storage-path.ts'
import { initialShellState, reduceShell, type SettingsShellState } from '../src/client/settings/model.ts'
import { createSettingsController, SETTINGS_HOST_ATTR } from '../src/client/settings/controller.ts'
import { SETTINGS_CSS } from '../src/client/styles/settings.ts'
import type { RunSettingsView, StorageBackend, StorageSettingsView } from '../src/client/settings/types.ts'

// ---------------------------------------------------------------------------
// 最小 document 替身（与 settings-dialog.test.ts 同款：只覆盖 createBodyHost 用到的几项）
// ---------------------------------------------------------------------------

interface FakeEl {
  attrs: Record<string, string>
  innerHTML: string
  removed: boolean
  listeners: { type: string; handler: (e: unknown) => void }[]
  setAttribute(k: string, v: string): void
  getAttribute(k: string): string | null
  addEventListener(type: string, handler: (e: unknown) => void): void
  remove(): void
}

function fakeDocument(): { bodyChildren: FakeEl[] } {
  const bodyChildren: FakeEl[] = []
  const makeEl = (): FakeEl => {
    const el: FakeEl = {
      attrs: {}, innerHTML: '', removed: false, listeners: [],
      setAttribute(k, v) { el.attrs[k] = v },
      getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
      addEventListener(type, handler) { el.listeners.push({ type, handler }) },
      remove() { el.removed = true; const i = bodyChildren.indexOf(el); if (i >= 0) bodyChildren.splice(i, 1) },
    }
    return el
  }
  const doc = {
    body: { appendChild(el: FakeEl) { bodyChildren.push(el) } },
    createElement: () => makeEl(),
    querySelectorAll: (sel: string) => (sel === '[' + SETTINGS_HOST_ATTR + ']' ? [...bodyChildren] : []),
  }
  ;(globalThis as { document?: unknown }).document = doc
  return { bodyChildren }
}

/** 触发宿主委派里的某个 action（模拟点击带 `data-action` 的元素）。 */
function clickAction(host: FakeEl, action: string, attrs: Record<string, string> = {}): void {
  const listener = host.listeners.find((l) => l.type === 'click')
  expect(listener, '宿主上应当有 click 委派').toBeDefined()
  const el = { getAttribute: (k: string): string | null => (k === 'data-action' ? action : (attrs[k] ?? null)) }
  listener!.handler({ target: { closest: () => el } })
}

/** 让 `void asyncFn()` 里的微任务跑完（流程都是"点一下 → await 一次接口"）。 */
async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
  await new Promise((r) => setTimeout(r, 0))
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
  delete (globalThis as { localStorage?: unknown }).localStorage
})

// ---------------------------------------------------------------------------
// 夹具
// ---------------------------------------------------------------------------

function storageView(over: Partial<StorageSettingsView> = {}): StorageSettingsView {
  return {
    backend: { value: 'json', source: 'config' },
    sqlitePath: '/home/.dsh/reqboard.sqlite',
    effective: 'json',
    restartRequired: false,
    ...over,
  }
}

function settingsView(storage: StorageSettingsView, system?: RunSettingsView['system']): RunSettingsView {
  return {
    plugin: { name: 'dsh-pmboard', version: '0.1.0', buildStamp: 'abc' },
    stageMaxRounds: {},
    storage,
    settingsFile: { exists: true, path: '/home/.dsh/dsh-reqboard-settings.json' },
    system: system ?? { ok: true, exists: true },
  }
}

interface Calls {
  request: string[]
  switch: { backend: StorageBackend; ticket: string }[]
  migrate: string[]
}

function makeController(opts: {
  storage?: StorageSettingsView
  system?: RunSettingsView['system']
  failSwitch?: { code?: string; message: string }
  failMigrate?: { code?: string; message: string }
  migrateWindow?: string
} = {}): { host: FakeEl; calls: Calls; state: () => SettingsShellState } {
  const { bodyChildren } = fakeDocument()
  const calls: Calls = { request: [], switch: [], migrate: [] }
  const controller = createSettingsController({
    api: {
      fetchRunSettings: async () => settingsView(opts.storage ?? storageView(), opts.system),
      patchRunSettings: async () => ({}),
      requestStorageAction: async (action) => {
        calls.request.push(action)
        return { ticket: 'sc-' + String(calls.request.length), action, expiresAt: Date.now() + 600_000 }
      },
      switchStorageBackend: async (input) => {
        calls.switch.push(input)
        if (opts.failSwitch !== undefined) throw Object.assign(new Error(opts.failSwitch.message), { code: opts.failSwitch.code })
        return { backend: input.backend, restartRequired: true }
      },
      startLedgerMigration: async (ticket) => {
        calls.migrate.push(ticket)
        if (opts.failMigrate !== undefined) throw Object.assign(new Error(opts.failMigrate.message), { code: opts.failMigrate.code })
        return { windowKey: opts.migrateWindow ?? 'session-mig' }
      },
    },
  })
  controller.open('storage')
  const host = bodyChildren[0]
  expect(host, '打开后应当有宿主元素').toBeDefined()
  return { host, calls, state: () => controller.state() }
}

// ---------------------------------------------------------------------------
// 纯逻辑
// ---------------------------------------------------------------------------

describe('动作与文案（纯逻辑）', () => {
  it('后端 → 动作由目标决定，不由按钮位置决定', () => {
    expect(actionForBackend('sqlite')).toBe('switch-to-sqlite')
    expect(actionForBackend('json')).toBe('switch-to-json')
    expect(actionTitle('migrate')).toContain('Agent')
  })

  it('影响清单写清"动什么、不动什么、失败会怎样"', () => {
    const toJson = impactLines('switch-to-json', {})
    expect(toJson.join(' ')).toContain('保留不删')
    const migrate = impactLines('migrate', { requirements: 128 })
    expect(migrate.join(' ')).toContain('128 条')
    expect(migrate.join(' ')).toContain('校验不过就不写设置')
  })

  it('条数未知时**不编造数字**（说"全部分片"而不是随便写一个数）', () => {
    expect(impactLines('switch-to-sqlite', {}).join(' ')).toContain('全部分片')
  })

  it('七类错误各有独立人话，且都不与泛化文案相同', () => {
    const codes = [
      'confirmation_required', 'sqlite_not_migrated', 'migration_in_progress',
      'dispatch_failed', 'window_opener_unavailable', 'window_open_failed', 'migration_paths_unknown',
    ]
    const texts = codes.map((c) => storageErrorCopy(c, '服务端原话'))
    expect(new Set(texts).size, '七类文案必须互不相同').toBe(codes.length)
    for (const t of texts) {
      expect(t).toContain('服务端原话') // 服务端原话必须保留，不被吞
      expect(t).not.toBe('出错了')
    }
    expect(storageErrorCopy('confirmation_required', 'x')).toContain('不会自动重试')
    expect(storageErrorCopy('dispatch_failed', 'x')).toContain('窗口里没有指令')
    // 未知码：原话优先（不吞服务端的解释）
    expect(storageErrorCopy(undefined, '服务端说：当前已在用 JSON 分片，无需切换')).toContain('无需切换')
  })

  it('任何错误都要清票（票据一次性；失败重来必须重新确认）', () => {
    for (const code of [undefined, 'confirmation_required', 'sqlite_not_migrated', 'dispatch_failed']) {
      expect(shouldClearTicketOnError(code)).toBe(true)
    }
  })

  it('票据过期判定：毫秒与 ISO 都认；解析不出不误判', () => {
    expect(ticketExpired({ expiresAt: 1000 }, 1001)).toBe(true)
    expect(ticketExpired({ expiresAt: 2000 }, 1001)).toBe(false)
    expect(ticketExpired({ expiresAt: 'not-a-time' }, 10 ** 12)).toBe(false)
    expect(ticketExpired({}, 10 ** 12)).toBe(false)
  })

  it('已在用目标后端时给出如实提示（含"改过设置但没重启"这一常见误解）', () => {
    expect(alreadyActiveHint(storageView({ effective: 'json' }), 'json')).toContain('已在用')
    expect(alreadyActiveHint(storageView({ effective: 'sqlite' }), 'json')).toBeUndefined()
    const pending = alreadyActiveHint(storageView({ effective: 'json', backend: { value: 'sqlite', source: 'settings' }, restartRequired: true }), 'json')
    expect(pending).toContain('重启宿主后生效')
  })

  it('迁移清单只按事实：观测不到的标 ?，库里有数据才算迁移完成', () => {
    const idle = migrationSteps({ phase: 'idle' })
    expect(idle.map((s) => s.status)).toContain('unknown') // 备份观测不到 → 不许标 done
    const copied = migrationSteps({ phase: 'running', sqliteExists: true, sqliteRequirements: 128 })
    expect(copied.find((s) => s.key === 'copy')?.status).toBe('done')
    expect(copied.find((s) => s.key === 'copy')?.note).toContain('128')
    const written = migrationSteps({ phase: 'done', sqliteExists: true, sqliteRequirements: 128, backendWritten: true })
    expect(written.find((s) => s.key === 'write')?.status).toBe('done')
    expect(written.find((s) => s.key === 'verify')?.status).toBe('done')
  })

  it('stores 在位时按事实显示：影响清单用源侧真实条数，建库/迁移两步各自成态', () => {
    const facts = migrationFactsOf({
      ok: true,
      stores: { shards: { requirements: 128 }, sqlite: { exists: true, requirements: 64 } },
    })
    expect(facts).toEqual({ migrationRequirements: 128, sqliteExists: true, sqliteRequirements: 64 })
    const html = buildStoragePane({
      storage: storageView(),
      phase: 'confirm',
      action: 'switch-to-sqlite',
      requirements: facts.migrationRequirements,
      sqliteExists: facts.sqliteExists,
      sqliteRequirements: facts.sqliteRequirements,
    })
    expect(html).toContain('128 条')            // 影响清单：真实条数，不是"全部分片"
    expect(html).not.toContain('全部分片')
    expect(html).toContain('库文件已存在')       // 建库：已完成（可观测事实）
    expect(html).toContain('库里已有 64 条')     // 迁移：已完成到 64 条
  })

  it('stores 缺失或档案损坏 → 退回保守文案，绝不编数字', () => {
    // 缺失：一个字段都不给
    expect(migrationFactsOf({ ok: true })).toEqual({})
    expect(migrationFactsOf(undefined)).toEqual({})
    // 档案损坏：**即使带 stores 也不许取数**（损坏档案里的数字不可信）
    expect(migrationFactsOf({
      ok: false,
      stores: { shards: { requirements: 999 }, sqlite: { exists: true, requirements: 999 } },
    })).toEqual({})
    const html = buildStoragePane({ storage: storageView(), phase: 'confirm', action: 'switch-to-sqlite' })
    expect(html).toContain('全部分片')            // 保守文案
    expect(html).toContain('库里还没有数据')      // 观测不到就是"还没数据"，不是"已完成"
    expect(html).not.toContain('999')
  })

  it('五步是固定的五段，且不含任何百分比字样', () => {
    expect(MIGRATION_STEPS.map((s) => s.key)).toEqual(['backup', 'create', 'copy', 'verify', 'write'])
    const html = buildStoragePane({ phase: 'running', windowKey: 'session-x' })
    expect(html).not.toContain('%')
  })
})

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

describe('渲染（纯字符串）', () => {
  it('后端概览说清"当前生效 / 目标 / 待重启"', () => {
    const html = buildStoragePane({
      storage: storageView({ backend: { value: 'sqlite', source: 'settings' }, effective: 'json', restartRequired: true }),
      phase: 'idle',
    })
    expect(html).toContain('当前生效')
    expect(html).toContain('JSON 分片')
    expect(html).toContain('待重启生效')
    expect(html).toContain('设置文件') // 来源徽章
  })

  it('已在用的后端按钮置灰并带 title（少一次白跑），另一个仍可点', () => {
    const html = buildStoragePane({ storage: storageView({ effective: 'json' }), phase: 'idle' })
    expect(html).toMatch(/data-action="settings-storage-switch" data-backend="json"[^>]*disabled/)
    expect(html).not.toMatch(/data-action="settings-storage-switch" data-backend="sqlite"[^>]*disabled/)
  })

  it('确认态：列出影响清单 + 两个按钮 + 如实说明"同意在哪完成"', () => {
    const html = buildStoragePane({
      storage: storageView(),
      phase: 'confirm',
      action: 'switch-to-sqlite',
      ticket: { ticket: 'sc-1' },
      requirements: 128,
    })
    expect(html).toContain('确认要做什么')
    expect(html).toContain('128 条')
    expect(html).toContain(STORAGE_COPY.confirmContinue)
    expect(html).toContain(STORAGE_COPY.cancel)
    expect(html).toContain('在那里点确认才算数') // 不假装本页就是那个同意
  })

  it('迁移成功态：给窗口键与"打开迁移窗口"按钮；失败态给重来按钮', () => {
    const done = buildStoragePane({ storage: storageView(), phase: 'done', windowKey: 'session-mig' })
    expect(done).toContain('session-mig')
    expect(done).toContain('data-action="settings-jump-session"')
    const failed = buildStoragePane({ storage: storageView(), phase: 'failed', action: 'migrate', error: '开窗失败' })
    expect(failed).toContain('data-action="settings-storage-retry"')
    expect(failed).toContain('开窗失败')
  })

  it('类名与令牌纪律：不出现原型里的私有令牌/裸类名', () => {
    const html = buildStoragePane({ storage: storageView(), phase: 'confirm', action: 'migrate' })
    expect(html).not.toMatch(/--s-(text|line|pill)/)
    expect(html).not.toMatch(/class="(card|dlg|badge)"/)
    expect(SETTINGS_CSS).toContain('.dsh-pm-set-confirm')
    expect(SETTINGS_CSS).toContain('.dsh-pm-set-steps')
  })

  it('壳能把存储屏装进去（分派已接上，不再是占位）', () => {
    const state: SettingsShellState = { ...initialShellState(), open: true, pane: 'storage', storage: storageView() }
    const html = buildSettingsShell(state)
    expect(html).toContain('存储与数据库')
    // 只对**本屏**断言"不再是占位"：records / general 两屏仍归 t14，壳里留着它们的占位是正常的。
    // 注意：`data-pane="storage"` 第一次出现是**左菜单按钮**，不是屏位；按屏位 id 取才准。
    const start = html.indexOf('id="dsh-pm-set-pane-storage"')
    const section = html.slice(start, html.indexOf('</section>', start))
    expect(section).toContain('dsh-pm-set-kv')
    expect(section).not.toContain('内容将在后续任务卡中落地')
  })

  it('后端名与来源名有人话（不把内部字面量直接摊给人看）', () => {
    expect(backendName('json')).toBe('JSON 分片')
    expect(sourceLabel('config')).toBe('插件配置')
  })
})

// ---------------------------------------------------------------------------
// 行为（经宿主任委派真跑）
// ---------------------------------------------------------------------------

describe('确认门三步（行为）', () => {
  it('取票 → 确认 → 带票执行：票只在"继续执行"后才被用掉', async () => {
    const { host, calls } = makeController()
    clickAction(host, 'settings-storage-switch', { 'data-backend': 'sqlite' })
    await flush()
    expect(calls.request).toEqual(['switch-to-sqlite'])
    expect(calls.switch, '还没点继续执行就不该调切换').toHaveLength(0)
    expect(host.innerHTML).toContain(STORAGE_COPY.confirmContinue)

    clickAction(host, 'settings-storage-confirm')
    await flush()
    expect(calls.switch).toEqual([{ backend: 'sqlite', ticket: 'sc-1' }])
  })

  it('取消：不发任何执行请求，回到未发起态', async () => {
    const { host, calls, state } = makeController()
    clickAction(host, 'settings-storage-switch', { 'data-backend': 'sqlite' })
    await flush()
    clickAction(host, 'settings-storage-cancel')
    await flush()
    expect(calls.switch).toHaveLength(0)
    expect(calls.migrate).toHaveLength(0)
    expect(state().storagePhase).toBe('idle')
    expect(state().storageTicket).toBeUndefined()
  })

  it('迁移链路：带票开窗 → 显示窗口键与打开按钮', async () => {
    const { host, calls } = makeController({ migrateWindow: 'session-abc' })
    clickAction(host, 'settings-storage-migrate')
    await flush()
    expect(calls.request).toEqual(['migrate'])
    clickAction(host, 'settings-storage-confirm')
    await flush()
    expect(calls.migrate).toEqual(['sc-1'])
    expect(host.innerHTML).toContain('session-abc')
    expect(host.innerHTML).toContain('data-action="settings-jump-session"')
  })

  it('403 确认未过：清票 + 独立文案 + **不自动重试**（只调了一次执行接口）', async () => {
    const { host, calls, state } = makeController({
      failSwitch: { code: 'confirmation_required', message: '人工确认票据不可用（还没落章）' },
    })
    clickAction(host, 'settings-storage-switch', { 'data-backend': 'sqlite' })
    await flush()
    clickAction(host, 'settings-storage-confirm')
    await flush()
    expect(calls.switch).toHaveLength(1)
    expect(state().storageTicket, '失败必须清票').toBeUndefined()
    expect(host.innerHTML).toContain('确认未通过')
    expect(host.innerHTML).toContain('不会自动重试')
    await flush()
    expect(calls.switch, '不自动重试：再等也不该有第二次调用').toHaveLength(1)
  })

  it('失败后重来要**重新取票**（旧票绝不复用）', async () => {
    const { host, calls } = makeController({
      failSwitch: { code: 'confirmation_required', message: 'x' },
    })
    clickAction(host, 'settings-storage-switch', { 'data-backend': 'sqlite' })
    await flush()
    clickAction(host, 'settings-storage-confirm')
    await flush()
    expect(calls.request).toEqual(['switch-to-sqlite'])
    // 点"重新发起确认" → 必须再取一次票（拿到 sc-2），而不是拿 sc-1 重试
    clickAction(host, 'settings-storage-retry')
    await flush()
    expect(calls.request).toEqual(['switch-to-sqlite', 'switch-to-sqlite'])
    clickAction(host, 'settings-storage-confirm')
    await flush()
    expect(calls.switch.map((s) => s.ticket)).toEqual(['sc-1', 'sc-2'])
  })

  it('取数时把 stores 的真实条数接进本屏（原先漏掉的正是这一环）', async () => {
    const { host } = makeController({
      system: {
        ok: true, exists: true,
        stores: { shards: { requirements: 128, exists: true }, sqlite: { exists: false, requirements: 0 } },
      },
    })
    clickAction(host, 'settings-storage-migrate')
    await flush()
    expect(host.innerHTML, '确认面板要用源侧真实条数').toContain('128 条')
    expect(host.innerHTML).not.toContain('全部分片')
  })

  it('档案损坏（ok:false）时即使带 stores 也不显示数字', async () => {
    const { host } = makeController({
      system: {
        ok: false,
        stores: { shards: { requirements: 999 }, sqlite: { exists: true, requirements: 999 } },
      } as unknown as RunSettingsView['system'],
    })
    clickAction(host, 'settings-storage-migrate')
    await flush()
    expect(host.innerHTML).toContain('全部分片')
    expect(host.innerHTML).not.toContain('999')
  })

  it('通道未装配时如实报错，不假装成功（也不留下"已发起"的假象）', async () => {
    const { bodyChildren } = fakeDocument()
    const controller = createSettingsController({
      api: { fetchRunSettings: async () => settingsView(storageView()) },
    })
    controller.open('storage')
    const host = bodyChildren[0]
    clickAction(host, 'settings-storage-switch', { 'data-backend': 'sqlite' })
    await flush()
    expect(host.innerHTML).toContain('未装配')
    expect(controller.state().storagePhase).toBe('failed')
  })

  it('票据只存内存：整个成功链跑完，localStorage 一次都没被写', async () => {
    const writes: string[] = []
    ;(globalThis as { localStorage?: unknown }).localStorage = {
      setItem: (k: string) => { writes.push(k) },
      getItem: () => null,
      removeItem: () => { /* noop */ },
    }
    const { host, calls } = makeController()
    clickAction(host, 'settings-storage-switch', { 'data-backend': 'sqlite' })
    await flush()
    clickAction(host, 'settings-storage-confirm')
    await flush()
    expect(calls.switch).toHaveLength(1)
    expect(writes, 'FR-11：票据只存内存，绝不落 localStorage').toEqual([])
  })

  it('已经在用目标后端时：服务端 400 的原话如实显示（不吞、不美化）', async () => {
    const { host } = makeController({
      failSwitch: { code: 'invalid_input', message: '切换未执行：当前已在用 JSON 分片，无需切换' },
    })
    clickAction(host, 'settings-storage-switch', { 'data-backend': 'sqlite' })
    await flush()
    clickAction(host, 'settings-storage-confirm')
    await flush()
    expect(host.innerHTML).toContain('当前已在用 JSON 分片，无需切换')
  })
})

// ---------------------------------------------------------------------------
// 状态机（纯函数）
// ---------------------------------------------------------------------------

describe('reduceShell · 存储屏状态', () => {
  it('初始为 idle；失败清票回 idle 后仍能重新进入 requesting', () => {
    let s = initialShellState()
    expect(s.storagePhase).toBe('idle')
    s = reduceShell(s, { kind: 'storage-phase', phase: 'requesting', action: 'migrate' })
    s = reduceShell(s, { kind: 'storage-ticket', ticket: { ticket: 'sc-9', action: 'migrate' } })
    s = reduceShell(s, { kind: 'storage-phase', phase: 'confirm', action: 'migrate' })
    expect(s.storageTicket?.ticket).toBe('sc-9')
    s = reduceShell(s, { kind: 'storage-clear' })
    expect(s.storagePhase).toBe('idle')
    expect(s.storageTicket).toBeUndefined()
    s = reduceShell(s, { kind: 'storage-phase', phase: 'requesting', action: 'migrate' })
    expect(s.storagePhase).toBe('requesting')
  })

  it('窗口键进入状态（迁移窗口已开出的事实）', () => {
    const s = reduceShell(initialShellState(), { kind: 'storage-window', windowKey: 'session-x' })
    expect(s.migrationWindowKey).toBe('session-x')
  })

  it('取数失败不吞服务端人话', () => {
    const s = reduceShell(initialShellState(), { kind: 'load-fail', message: '读取运行设置失败：网关 502' })
    expect(s.error).toContain('网关 502')
  })
})

/**
 * 「改路径」（对齐趟 2 补）。
 *
 * 为什么单独测这条：它是**唯一一个不经确认门**的写操作（`PATCH /settings` 的
 * `storage.sqlitePath`）——后端开关要过票据，路径不是。既然少了票据这道门，
 * 就至少要有"空值不发请求 / 未装配如实说 / 失败了说清原因"这三条兜住。
 */
describe('存储屏 · 改路径（不经确认门的那个写操作）', () => {
  function fakeHost(value: string, captured: { clicks: ((e: unknown) => void)[] }) {
    return {
      addEventListener: (_t: string, l: (e: unknown) => void) => { captured.clicks.push(l) },
      querySelector: (_s: string) => ({ value }),
    }
  }
  const clickOn = (action: string) => ({ target: { closest: () => ({ getAttribute: () => action }) } })

  it('保存：把输入框里的路径交给 PATCH /settings（storage.sqlitePath）', async () => {
    const calls: unknown[] = []
    const captured = { clicks: [] as ((e: unknown) => void)[] }
    const host = fakeHost('/tmp/x.sqlite', captured)
    const results: { ok: boolean; message?: string }[] = []
    attachStoragePathEditor(host, {
      api: { patchRunSettings: async (body) => { calls.push(body); return {} } },
      onResult: (ok, message) => results.push({ ok, ...(message !== undefined ? { message } : {}) }),
    })
    captured.clicks[0](clickOn(STORAGE_PATH_SAVE))
    await new Promise((r) => setTimeout(r, 0))
    expect(calls).toEqual([{ storage: { sqlitePath: '/tmp/x.sqlite' } }])
    expect(results[0]?.ok).toBe(true)
  })

  it('空路径不发请求，并当场说清（不让人以为点了没反应）', () => {
    const calls: unknown[] = []
    const captured = { clicks: [] as ((e: unknown) => void)[] }
    const results: { ok: boolean; message?: string }[] = []
    attachStoragePathEditor(fakeHost('   ', captured), {
      api: { patchRunSettings: async (b) => { calls.push(b); return {} } },
      onResult: (ok, message) => results.push({ ok, ...(message !== undefined ? { message } : {}) }),
    })
    captured.clicks[0](clickOn(STORAGE_PATH_SAVE))
    expect(calls).toEqual([])
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.message).toContain('路径没写')
  })

  it('通道未装配：如实说"无法保存"，不假装成功', () => {
    const captured = { clicks: [] as ((e: unknown) => void)[] }
    const results: { ok: boolean; message?: string }[] = []
    attachStoragePathEditor(fakeHost('/tmp/x.sqlite', captured), {
      api: {},
      onResult: (ok, message) => results.push({ ok, ...(message !== undefined ? { message } : {}) }),
    })
    captured.clicks[0](clickOn(STORAGE_PATH_SAVE))
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.message).toContain('未装配')
  })

  it('取消：不发请求', () => {
    const calls: unknown[] = []
    const captured = { clicks: [] as ((e: unknown) => void)[] }
    attachStoragePathEditor(fakeHost('/tmp/x.sqlite', captured), {
      api: { patchRunSettings: async (b) => { calls.push(b); return {} } },
      onResult: () => undefined,
    })
    captured.clicks[0](clickOn(STORAGE_PATH_CANCEL))
    expect(calls).toEqual([])
  })
})


/**
 * 「选择…」（2026-10-04 人要求：改路径要像操作系统那样弹窗口选）。
 *
 * 三条要点：**取消什么都不改**（不报错、不提示——把它当失败就是撒谎）；
 * 选中要**填入并标脏**（让"改过了还没保存"看得见，保存仍由人点）；**501 给人话并允许手输**。
 */
describe('存储屏 · 改路径的「选择…」', () => {
  function hostWith(input: { value: string; classList: { added: string[]; add(c: string): void }; dispatchEvent?: (e: unknown) => void }) {
    const captured = { clicks: [] as ((e: unknown) => void)[], events: [] as unknown[] }
    return {
      captured,
      host: {
        addEventListener: (_t: string, l: (e: unknown) => void) => { captured.clicks.push(l) },
        querySelector: (_s: string) => input,
      },
    }
  }
  const inputOf = (value: string) => {
    const added: string[] = []
    const events: unknown[] = []
    return {
      input: { value, classList: { added, add: (c: string) => added.push(c) }, dispatchEvent: (e: unknown) => { events.push(e) } },
      added,
      events,
    }
  }
  const clickOn = (action: string) => ({ target: { closest: () => ({ getAttribute: () => action }) } })

  it('选中：填入输入框 + 标脏 + 派发 input 事件（保存仍由人点）', async () => {
    const { input, added, events } = inputOf('/old.sqlite')
    const { captured, host } = hostWith(input)
    const results: { ok: boolean; message?: string }[] = []
    let patched = 0
    attachStoragePathEditor(host, {
      api: {
        patchRunSettings: async () => { patched += 1; return {} },
        pickStoragePath: async () => ({ ok: true, path: '/Users/mac/.dsh/reqboard.sqlite' }),
      },
      onResult: (ok, message) => results.push({ ok, ...(message !== undefined ? { message } : {}) }),
    })
    captured.clicks[0](clickOn(STORAGE_PATH_PICK))
    await new Promise((r) => setTimeout(r, 0))
    expect(input.value).toBe('/Users/mac/.dsh/reqboard.sqlite')
    expect(added).toContain('is-dirty')                       // 脏标记
    expect(events.map((e) => (e as { type?: string }).type)).toEqual(['input'])
    expect(results[0]?.ok).toBe(true)
    expect(patched).toBe(0)                                    // 关键：选择**不**写设置
  })

  it('取消：什么都不改、什么都不说（不许把"人改主意"报成错误）', async () => {
    const { input, added, events } = inputOf('/old.sqlite')
    const { captured, host } = hostWith(input)
    const results: unknown[] = []
    attachStoragePathEditor(host, {
      api: { pickStoragePath: async () => ({ ok: false, cancelled: true }) },
      onResult: (ok, message) => results.push({ ok, message }),
    })
    captured.clicks[0](clickOn(STORAGE_PATH_PICK))
    await new Promise((r) => setTimeout(r, 0))
    expect(results).toEqual([])
    expect(input.value).toBe('/old.sqlite')
    expect(added).toEqual([])
    expect(events).toEqual([])
  })

  it('501（这台机器弹不出窗口）：给人话并明确可以手输', async () => {
    const { input } = inputOf('')
    const { captured, host } = hostWith(input)
    const results: { ok: boolean; message?: string }[] = []
    attachStoragePathEditor(host, {
      api: { pickStoragePath: async () => { throw new Error('501 path_picker_unavailable: 这台机器拿不到系统选择窗口') } },
      onResult: (ok, message) => results.push({ ok, ...(message !== undefined ? { message } : {}) }),
    })
    captured.clicks[0](clickOn(STORAGE_PATH_PICK))
    await new Promise((r) => setTimeout(r, 0))
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.message).toContain('请手动输入路径')
  })

  it('通道未装配：如实说清并保留手输（不静默）', () => {
    const { input } = inputOf('')
    const { captured, host } = hostWith(input)
    const results: { ok: boolean; message?: string }[] = []
    attachStoragePathEditor(host, { api: {}, onResult: (ok, message) => results.push({ ok, ...(message !== undefined ? { message } : {}) }) })
    captured.clicks[0](clickOn(STORAGE_PATH_PICK))
    expect(results[0]?.ok).toBe(false)
    expect(results[0]?.message).toContain('手动输入')
  })
})
