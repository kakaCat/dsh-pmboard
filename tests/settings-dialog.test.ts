/**
 * 设置弹窗骨架（REQ-261004103330-005f t11）单测。
 *
 * 本仓 vitest 跑在 **Node 环境、无 jsdom**（`vitest.config.ts` 没有 environment 配置），
 * 与 `tests/client-view.test.ts` 同款：**纯函数直测 + 字符串渲染断言**。
 * 只有一处例外：为钉住设计 R1（"弹窗必须挂 `document.body`，否则会被容器重绘抹掉"），
 * 这里用一个**最小 document 替身**真跑 `createBodyHost`——比"读源码断言字符串"更接近行为。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  SETTINGS_ACTIONS,
  SETTINGS_PANES,
  badgeOf,
  canOpenConfig,
  initialShellState,
  nextFocusIndex,
  openConfigHint,
  paneLabel,
  reduceShell,
  openConfigBadge,
  openConfigIntent,
  type SettingsShellState,
  unknownActions,
  whenText,
} from '../src/client/settings/model.ts'
import {
  SHELL_ID,
  actionsInHtml,
  buildPanePlaceholder,
  buildSettingsShell,
} from '../src/client/settings/render/shell.ts'
import { SETTINGS_HOST_ATTR, createBodyHost, createSettingsController } from '../src/client/settings/controller.ts'
import type { RunSettingsView } from '../src/client/settings/types.ts'


/**
 * 宿主动作集工厂：动作集随 t12/t13 从 4 个扩到 13 个（上限屏 4 + 存储屏 5）。
 * 测试只关心其中几个，其余用 `vi.fn()` 占位——**不要**因此把它们改成可选：
 * 「没有死按钮」的前提正是"渲染出来的动作必须有人在听"。
 */
function hostActions(over: Record<string, unknown> = {}) {
  return {
    onClose: vi.fn(), onPane: vi.fn(), onOpenConfig: vi.fn(), onJump: vi.fn(),
    onLimitInput: vi.fn(), onLimitReset: vi.fn(), onLimitSave: vi.fn(), onLimitDiscard: vi.fn(),
    onStorageSwitch: vi.fn(), onStorageMigrate: vi.fn(), onStorageConfirm: vi.fn(),
    onStorageCancel: vi.fn(), onStorageRetry: vi.fn(),
    ...over,
  } as never
}

// ---------------------------------------------------------------------------
// 最小 document 替身（只覆盖 createBodyHost 用到的那几项）
// ---------------------------------------------------------------------------

interface FakeEl {
  tag: string
  attrs: Record<string, string>
  className: string
  innerHTML: string
  removed: boolean
  listeners: { type: string; handler: (e: unknown) => void }[]
  setAttribute(k: string, v: string): void
  getAttribute(k: string): string | null
  addEventListener(type: string, handler: (e: unknown) => void): void
  remove(): void
  focus(): void
}

function fakeDocument(): { document: unknown; bodyChildren: FakeEl[]; makeEl: (tag: string) => FakeEl } {
  const bodyChildren: FakeEl[] = []
  const makeEl = (tag: string): FakeEl => {
    const el: FakeEl = {
      tag,
      attrs: {},
      className: '',
      innerHTML: '',
      removed: false,
      listeners: [],
      setAttribute(k, v) { el.attrs[k] = v },
      getAttribute: (k) => (k in el.attrs ? el.attrs[k] : null),
      addEventListener(type, handler) { el.listeners.push({ type, handler }) },
      remove() {
        el.removed = true
        const i = bodyChildren.indexOf(el)
        if (i >= 0) bodyChildren.splice(i, 1)
      },
      focus() { /* 替身：只记调用 */ },
    }
    return el
  }
  const document = {
    body: {
      appendChild(el: FakeEl) { bodyChildren.push(el) },
    },
    createElement: (tag: string) => makeEl(tag),
    querySelectorAll: (sel: string) => (sel === '[' + SETTINGS_HOST_ATTR + ']' ? [...bodyChildren] : []),
  }
  return { document, bodyChildren, makeEl }
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
})

// ---------------------------------------------------------------------------
// 纯函数：壳状态机
// ---------------------------------------------------------------------------

describe('reduceShell · 开合与切屏', () => {
  it('初始为关闭态且停在「运行上限」', () => {
    const s = initialShellState()
    expect(s.open).toBe(false)
    expect(s.pane).toBe('limits')
  })

  it('open 可带屏；close 只改开合；set-pane 换屏', () => {
    let s = reduceShell(initialShellState(), { kind: 'open', pane: 'records' })
    expect(s.open).toBe(true)
    expect(s.pane).toBe('records')
    s = reduceShell(s, { kind: 'close' })
    expect(s.open).toBe(false)
    expect(s.pane).toBe('records') // 关闭不改屏：重开后还是上次那一屏
  })

  it('已打开时再 open（不带屏）不改屏、不重置加载态——「已开则聚焦，不重开」', () => {
    let s = reduceShell(initialShellState(), { kind: 'open', pane: 'storage' })
    s = reduceShell(s, { kind: 'load-start' })
    const again = reduceShell(s, { kind: 'open' })
    expect(again).toBe(s) // 同一引用：真的没变
  })

  it('load-ok 记住「设置文件在不在」与路径、版本', () => {
    const s = reduceShell(initialShellState(), {
      kind: 'load-ok',
      settingsFileExists: true,
      settingsFilePath: '/home/.dsh/dsh-reqboard-settings.json',
      pluginVersion: '0.1.0',
    })
    expect(s.settingsFileExists).toBe(true)
    expect(s.settingsFilePath).toContain('dsh-reqboard-settings.json')
    expect(s.pluginVersion).toBe('0.1.0')
  })

  it('load-fail 记人话错误，且**保留**已知路径（失败不该让按钮突然失去路径）', () => {
    let s = reduceShell(initialShellState(), {
      kind: 'load-ok', settingsFileExists: true, settingsFilePath: '/x/settings.json',
    })
    s = reduceShell(s, { kind: 'load-fail', message: '读取运行设置失败：boom' })
    expect(s.error).toContain('boom')
    expect(s.loading).toBe(false)
    expect(s.settingsFilePath).toBe('/x/settings.json')
  })
})

describe('纯函数：焦点序 / 徽章 / 文案 / R7 可用性', () => {
  it('nextFocusIndex 正反向都能绕回，且容忍越界与空集', () => {
    expect(nextFocusIndex(0, 3, false)).toBe(1)
    expect(nextFocusIndex(2, 3, false)).toBe(0)
    expect(nextFocusIndex(0, 3, true)).toBe(2)
    expect(nextFocusIndex(9, 3, false)).toBe(1) // 越界先归零再前移
    expect(nextFocusIndex(0, 0, false)).toBe(0)
  })

  it('badgeOf 四种来源各不相同（人话 + 类名）', () => {
    const all = (['settings', 'config', 'env', 'default'] as const).map(badgeOf)
    expect(all.map((b) => b.label)).toEqual(['设置文件', '插件配置', '环境变量', '内置默认'])
    expect(new Set(all.map((b) => b.cls)).size).toBe(4)
  })

  it('whenText：目标与当前进程不一致时必须说「要重启」', () => {
    expect(whenText('json', true)).toContain('重启宿主后生效')
    expect(whenText('json', true)).toContain('JSON 分片')
    expect(whenText('sqlite', false)).toBe('已在生效（SQLite）')
  })

  it('R7：文件不存在时不可打开，并给出「尚未创建」的解释', () => {
    const missing = { ...initialShellState(), settingsFilePath: '/x/settings.json', settingsFileExists: false }
    expect(canOpenConfig(missing)).toBe(false)
    // t14 统一措辞：与「通用」屏同一句（惰性创建下"还没创建"是正常态，要给出生成条件）
    expect(openConfigHint(missing)).toContain('尚未创建：首次保存后生成')
    const ok = { ...missing, settingsFileExists: true }
    expect(canOpenConfig(ok)).toBe(true)
    const noPath = initialShellState()
    expect(canOpenConfig(noPath)).toBe(false)
    expect(openConfigHint(noPath)).toContain('拿不到设置文件路径')
  })

  it('屏标题查得到（左菜单与屏标题同源，不各写一份）', () => {
    expect(SETTINGS_PANES.map((p) => p.key)).toEqual(['limits', 'storage', 'records', 'general'])
    expect(paneLabel('storage')).toBe('存储与数据库')
  })
})

// ---------------------------------------------------------------------------
// 渲染：字符串断言（类名前缀 / ARIA / data-action / 禁用态）
// ---------------------------------------------------------------------------

describe('buildSettingsShell · 骨架渲染', () => {
  const closed = buildSettingsShell(initialShellState())

  it('类名全部 dsh-pm-set- 前缀，且不含原型私有令牌', () => {
    expect(closed).toContain('dsh-pm-set-dlg')
    expect(closed).toContain('dsh-pm-set-mask')
    expect(closed).toContain('dsh-pm-set-nav')
    // R4：原型私有变量与无前缀类名不得出现
    expect(closed).not.toContain('--s-text')
    expect(closed).not.toContain('class="card"')
    expect(closed).not.toContain('class="badge')
  })

  it('对话窗语义：role=dialog + aria-modal + aria-labelledby 指向真标题', () => {
    expect(closed).toContain('role="dialog"')
    expect(closed).toContain('aria-modal="true"')
    expect(closed).toContain('aria-labelledby="' + SHELL_ID.title + '"')
    expect(closed).toContain('id="' + SHELL_ID.title + '"')
  })

  it('左菜单 role=tablist，四项且只有当前项 aria-selected=true', () => {
    expect(closed).toContain('role="tablist"')
    expect((closed.match(/role="tab"/g) ?? []).length).toBe(4)
    expect((closed.match(/aria-selected="true"/g) ?? []).length).toBe(1)
    expect(closed).toContain('aria-selected="true" aria-controls="' + SHELL_ID.panel('limits') + '"')
  })

  it('四个屏位都在，非当前屏用 hidden（不是从 DOM 删掉，便于保态）', () => {
    expect((closed.match(/role="tabpanel"/g) ?? []).length).toBe(4)
    expect((closed.match(/ role="tabpanel"[^>]*hidden/g) ?? []).length).toBe(3)
    expect(closed).toContain('id="' + SHELL_ID.panel('records') + '"')
  })

  it('三条关闭路径之一：遮罩自身带关闭动作', () => {
    expect(closed).toContain('class="dsh-pm-set-mask" data-action="settings-close"')
  })

  it('R7：设置文件不存在 → 「打开配置文件」禁用并带解释 title', () => {
    // 真实场景：路径已知（服务端给的），但文件还没创建（惰性创建，FR-17）
    const s = { ...initialShellState(), settingsFilePath: '/x/settings.json', settingsFileExists: false }
    const html = buildSettingsShell(s)
    // 人报「没有反应」后改：`disabled` 不派发点击 → 换成 aria-disabled + 可见旁注（点击会带到「通用」屏）
    expect(html).toContain('data-action="settings-open-config" aria-disabled="true"')
    expect(html).toContain('尚未创建：首次保存后生成')
    expect(html).toMatch(/dsh-pm-set-head-note[^>]*>尚未创建</)
    // 连路径都拿不到时，解释换成另一句（不能误导成"文件没建"）
    expect(closed).toContain('data-action="settings-open-config" aria-disabled="true"')
    expect(closed).toContain('拿不到设置文件路径')
  })

  it('文件存在 → 按钮可用；有版本时头部显示版本号', () => {
    const s = reduceShell(initialShellState(), {
      kind: 'load-ok', settingsFileExists: true, settingsFilePath: '/x/s.json', pluginVersion: '0.1.0',
    })
    const html = buildSettingsShell(s)
    expect(html).not.toContain('data-action="settings-open-config" aria-disabled="true"')
    expect(html).toContain('dsh-pm-set-ver')
    expect(html).toContain('0.1.0')
  })

  it('加载态与失败态都进 aria-live 状态区', () => {
    const loading = buildSettingsShell(reduceShell(initialShellState(), { kind: 'load-start' }))
    expect(loading).toContain('aria-live="polite"')
    expect(loading).toContain('正在读取运行设置')
    const failed = buildSettingsShell(reduceShell(initialShellState(), { kind: 'load-fail', message: '读取运行设置失败：boom' }))
    expect(failed).toContain('boom')
    expect(failed).toContain('is-error')
  })

  it('没有死按钮：渲染出的 data-action 必须都在清单内', () => {
    const html = buildSettingsShell(initialShellState())
    const used = actionsInHtml(html)
    expect(used.length).toBeGreaterThan(0)
    expect(unknownActions(used)).toEqual([])
    for (const a of used) expect(SETTINGS_ACTIONS).toContain(a)
  })

  it('占位屏（本卡范围：四屏内容归后续卡）', () => {
    expect(buildPanePlaceholder('general')).toContain('通用')
  })
})

// ---------------------------------------------------------------------------
// 控制器：注入宿主与取数替身
// ---------------------------------------------------------------------------

function runSettingsView(over: Partial<RunSettingsView> = {}): RunSettingsView {
  return {
    plugin: { name: 'dsh-pmboard', version: '0.1.0', buildStamp: 'abc' },
    stageMaxRounds: { implementing: { value: 800, default: 1000, source: 'settings' } },
    storage: { backend: { value: 'json', source: 'config' }, sqlitePath: '/x/reqboard.sqlite', effective: 'json', restartRequired: false },
    settingsFile: { exists: false },
    system: { ok: true, exists: true },
    ...over,
  }
}

function harness(over: { api?: unknown; view?: RunSettingsView } = {}): {
  controller: ReturnType<typeof createSettingsController>
  rendered: string[]
  destroy: ReturnType<typeof vi.fn>
  focusReturn: ReturnType<typeof vi.fn>
  fetch: ReturnType<typeof vi.fn>
} {
  const rendered: string[] = []
  const destroy = vi.fn()
  const focusReturn = vi.fn()
  const fetch = vi.fn(async () => over.view ?? runSettingsView())
  const controller = createSettingsController({
    api: (over.api ?? { fetchRunSettings: fetch }) as never,
    host: () => ({ render: (html) => { rendered.push(html) }, destroy }),
    focusReturn,
  })
  return { controller, rendered, destroy, focusReturn, fetch }
}

describe('createSettingsController · 壳行为', () => {
  it('open 后渲染壳，且当前屏与入参一致', async () => {
    const h = harness()
    h.controller.open('storage')
    expect(h.controller.isOpen()).toBe(true)
    expect(h.controller.state().pane).toBe('storage')
    expect(h.rendered.at(-1)).toContain('data-pane="storage"')
    await Promise.resolve()
  })

  it('close 调宿主的 destroy 并把焦点还给触发者', () => {
    const h = harness()
    h.controller.open()
    h.controller.close()
    expect(h.destroy).toHaveBeenCalledTimes(1)
    expect(h.focusReturn).toHaveBeenCalledTimes(1)
    expect(h.controller.isOpen()).toBe(false)
  })

  it('重开后仍是上次那一屏（关闭不改屏）', () => {
    const h = harness()
    h.controller.open('records')
    h.controller.close()
    h.controller.open()
    expect(h.controller.state().pane).toBe('records')
  })

  it('已打开时再 open 只切屏、**不重复取数**', async () => {
    const h = harness()
    h.controller.open('limits')
    await Promise.resolve()
    const before = h.fetch.mock.calls.length
    h.controller.open('general')
    await Promise.resolve()
    expect(h.fetch.mock.calls.length).toBe(before)
    expect(h.controller.state().pane).toBe('general')
  })

  it('取数成功：把「设置文件在不在」与路径记进状态，渲染禁用态随之变化', async () => {
    const h = harness({ view: runSettingsView({ settingsFile: { exists: true, path: '/x/s.json' } }) })
    h.controller.open()
    await h.controller.reload()
    expect(h.controller.state().settingsFileExists).toBe(true)
    expect(h.rendered.at(-1)).not.toContain('data-action="settings-open-config" aria-disabled="true"')
  })

  it('取数失败：状态带人话错误，且不抛给调用方', async () => {
    const h = harness({ api: { fetchRunSettings: vi.fn(async () => { throw new Error('boom') }) } })
    h.controller.open()
    await h.controller.reload()
    expect(h.controller.state().error).toContain('boom')
    expect(h.rendered.at(-1)).toContain('boom')
  })

  it('dispose 幂等（重复调用不再找宿主）', () => {
    const h = harness()
    h.controller.open()
    h.controller.dispose()
    h.controller.dispose()
    expect(h.destroy).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// R1 回归钉：宿主必须挂 body、且创建前清同名残留
// ---------------------------------------------------------------------------

describe('createBodyHost · R1 回归钉（无 jsdom，用最小替身真跑）', () => {
  it('宿主挂在 document.body 上并带标记属性', () => {
    const { document, bodyChildren } = fakeDocument()
    ;(globalThis as { document?: unknown }).document = document
    createBodyHost(hostActions())
    expect(bodyChildren.length).toBe(1)
    expect(bodyChildren[0].attrs[SETTINGS_HOST_ATTR]).toBe('')
    expect(bodyChildren[0].className).toBe('dsh-pm-set-host')
  })

  it('创建前清掉同名残留（防 HMR 双开）', () => {
    const { document, bodyChildren } = fakeDocument()
    ;(globalThis as { document?: unknown }).document = document
    const first = createBodyHost(hostActions())
    const second = createBodyHost(hostActions())
    expect(bodyChildren.length).toBe(1) // 旧的被移除，只剩新的
    expect(bodyChildren[0]).not.toBe(undefined)
    first.destroy() // 已被移除 → no-op，不该误删第二份
    expect(bodyChildren.length).toBe(1)
    second.destroy()
    expect(bodyChildren.length).toBe(0)
  })

  it('宿主上的委派认得出四类动作（关闭 / 切屏 / 打开配置 / 跳会话）', () => {
    const { document, bodyChildren } = fakeDocument()
    ;(globalThis as { document?: unknown }).document = document
    const onClose = vi.fn(); const onPane = vi.fn(); const onOpenConfig = vi.fn(); const onJump = vi.fn()
    createBodyHost(hostActions({ onClose, onPane, onOpenConfig, onJump }))
    const handler = bodyChildren[0].listeners.find((l) => l.type === 'click')?.handler
    expect(handler).toBeTypeOf('function')
    const target = (action: string, extra: Record<string, string> = {}) => ({
      closest: () => ({ getAttribute: (k: string) => (k === 'data-action' ? action : (extra[k] ?? null)) }),
    })
    handler?.({ target: target('settings-close') })
    expect(onClose).toHaveBeenCalled()
    handler?.({ target: target('settings-pane', { 'data-pane': 'records' }) })
    expect(onPane).toHaveBeenCalledWith('records')
    handler?.({ target: target('settings-open-config') })
    expect(onOpenConfig).toHaveBeenCalled()
    handler?.({ target: target('settings-jump-session', { 'data-session': 'session-x' }) })
    expect(onJump).toHaveBeenCalledWith('session-x')
  })
})


describe('打开配置文件 · 点击意图（2026-10-04 人报「没有反应」后补）', () => {
  const base = { ...initialShellState(), settingsFilePath: '/x/settings.json' }

  it('文件还没创建 → 意图是「去通用屏解释」，不是死点击', () => {
    const intent = openConfigIntent({ ...base, settingsFileExists: false })
    expect(intent.kind).toBe('explain')
    if (intent.kind === 'explain') {
      expect(intent.pane).toBe('general')
      expect(intent.hint).toContain('尚未创建')
    }
  })

  it('文件在 → 意图是打开，且带着真实路径', () => {
    const intent = openConfigIntent({ ...base, settingsFileExists: true })
    expect(intent).toEqual({ kind: 'open', path: '/x/settings.json' })
  })

  it('路径都拿不到 → 也是 explain（且提示换一句，不误导成「文件没建」）', () => {
    const intent = openConfigIntent({ ...initialShellState(), settingsFileExists: false })
    expect(intent.kind).toBe('explain')
    if (intent.kind === 'explain') expect(intent.hint).toContain('拿不到设置文件路径')
  })
})


describe('打开配置文件 · 目标是系统记录文件（2026-10-04 人确认 dsh-reqboard-system.json）', () => {
  const base = (over: Partial<SettingsShellState>): SettingsShellState => ({ ...initialShellState(), ...over })

  it('摘要给了系统记录文件路径 → 打开它（哪怕设置文件还没创建）', () => {
    const intent = openConfigIntent(base({
      systemFilePath: '/x/dsh-reqboard-system.json',
      settingsFilePath: '/x/dsh-reqboard-settings.json',
      settingsFileExists: false,
    }))
    expect(intent).toEqual({ kind: 'open', path: '/x/dsh-reqboard-system.json' })
  })

  it('没有系统记录路径但设置文件在 → 退回设置文件（不把功能做死）', () => {
    const intent = openConfigIntent(base({
      settingsFilePath: '/x/dsh-reqboard-settings.json',
      settingsFileExists: true,
    }))
    expect(intent).toEqual({ kind: 'open', path: '/x/dsh-reqboard-settings.json' })
  })

  it('两个都没有 → 解释（不留死点击）', () => {
    expect(openConfigIntent(base({})).kind).toBe('explain')
  })

  it('旁注：能打开时不出旁注（不再因为设置文件没建就写「尚未创建」）', () => {
    expect(openConfigBadge(base({ systemFilePath: '/x/dsh-reqboard-system.json' }))).toBe('')
  })
})
