/**
 * 系统记录屏 + 通用屏的单测（REQ-261004103330-005f t14）。
 *
 * 三条**卡片硬验收**各有一条独立用例（陈旧红字且无合并入口 / 配置文件不存在时按钮禁用并给出确切提示 /
 * 版本不一致给重建指引），其余用例覆盖五类事件渲染、两个丢事件口径不相加、档案损坏不白屏。
 *
 * 测试纪律与 t12/t13 同款：**不碰 DOM**——渲染是纯字符串，取数用替身把整条链路跑一遍。
 */
import { describe, it, expect } from 'vitest'
import {
  compatOf, makeSystemRecordLoader, recordsPaneModelOf, stalenessTextOf, timelineOf,
} from '../src/client/settings/records.ts'
import { generalRowsOf, openConfigCopyOf } from '../src/client/settings/general.ts'
import { buildRecordsPane } from '../src/client/settings/render/records.ts'
import { buildGeneralPane } from '../src/client/settings/render/general.ts'
import { actionsInHtml, buildSettingsShell } from '../src/client/settings/render/shell.ts'
import {
  initialShellState, openConfigHint, reduceShell, unknownActions, type SettingsShellState,
} from '../src/client/settings/model.ts'
import type { SystemRecordInvalidView, SystemRecordView, SystemSummaryView } from '../src/client/settings/types.ts'

/** 一条需求记录（只填本屏用得到的字段）。 */
function recordOf(over: Partial<SystemRecordView> = {}): SystemRecordView {
  return {
    ok: true,
    updatedAt: '2026-10-04T10:31:12+08:00',
    plugin: { name: 'dsh-pmboard', version: '0.1.0', buildStamp: '7f3c1ab9d204', sqliteSchemaVersion: 1, recordedAt: '2026-10-04T10:31:12+08:00' },
    paths: {
      shardDataRoot: '/home/.dsh/reqboard',
      sqliteFile: '/home/.dsh/reqboard.sqlite',
      settingsFile: '/home/.dsh/dsh-reqboard-settings.json',
      legacyLedger: '/home/.dsh/dsh-reqboard.json',
      backupDirs: ['/home/.dsh/backups/reqboard-20261002-1530'],
    },
    active: { backend: 'json', since: '2026-10-03T09:12:40+08:00', source: 'settings' },
    stores: { shards: { exists: true, requirements: 128 }, sqlite: { exists: true, requirements: 44 } },
    history: [],
    counters: {},
    compat: { checkedAt: '2026-10-04T10:31:12+08:00', consistent: true, currentPluginVersion: '0.1.0', upgrades: [] },
    ...over,
  }
}

describe('系统记录屏 · 硬验收①：陈旧要点红，且不许有合并入口', () => {
  it('分片 128 条 > 库 44 条 → 红字「库已陈旧：重启前请重跑迁移」', () => {
    const model = recordsPaneModelOf({ record: recordOf() })
    expect(model.staleText).toContain('库已陈旧：重启前请重跑迁移')
    const html = buildRecordsPane(model)
    expect(html).toContain('库已陈旧：重启前请重跑迁移')
    // 对齐趟 2：红字改用共享说明框基元（`dsh-pm-set-notice is-danger`），不再是屏内自有类
    expect(html).toContain('dsh-pm-set-notice is-danger')
  })

  it('服务端已判 stale 时优先采信它给出的原因', () => {
    const text = stalenessTextOf({ shards: { requirements: 128 }, sqlite: { exists: true, requirements: 44, stale: true, staleReason: '比当前分片少 84 条' } })
    expect(text).toContain('比当前分片少 84 条')
  })

  it('**页面里没有任何合并入口**（本设计不做合并）', () => {
    const html = buildRecordsPane(recordsPaneModelOf({ record: recordOf() }))
    expect(html).not.toContain('合并')
    // 也不该出现任何"合并"动作名（死按钮守卫之外的额外一道）
    expect(actionsInHtml(html).filter((a) => a.includes('merge'))).toEqual([])
  })
})

describe('系统记录屏 · 时间线五类事件', () => {
  const full = recordOf({
    history: [
      { at: '2026-09-28T12:04:00+08:00', event: 'startup', backend: 'json', source: 'config', requirements: 12 },
      { at: '2026-10-01T09:20:00+08:00', event: 'upgrade', from: { version: '0.0.9', buildStamp: 'old' }, to: { version: '0.1.0', buildStamp: 'new' } },
      { at: '2026-10-02T15:30:00+08:00', event: 'migration', from: 'json', to: 'sqlite', result: 'ok', requirements: 44, durationMs: 4210, backupDir: '/home/.dsh/backups/reqboard-20261002-1530', confirmedBy: { kind: 'human', at: '2026-10-02T15:29:31+08:00', channel: 'board-confirm' } },
      { at: '2026-10-03T09:12:40+08:00', event: 'backend-switched', from: 'sqlite', to: 'json', reason: '当日排查存储问题' },
      { at: '2026-10-04T10:00:00+08:00', event: 'settings-invalid', key: 'stageMaxRounds.design', reason: '需为整数', fellBackTo: '内置默认 200' },
    ],
  })

  it('五类事件各渲染一次，且带上各自的细节', () => {
    const entries = timelineOf(full)
    expect(entries.map((e) => e.event)).toEqual(['startup', 'upgrade', 'migration', 'backend-switched', 'settings-invalid'])
    expect(entries[1].lines.join(' ')).toContain('0.0.9 → 0.1.0')
    expect(entries[2].lines.join(' ')).toContain('条数：44')
    expect(entries[2].lines.join(' ')).toContain('备份：/home/.dsh/backups/reqboard-20261002-1530')
    expect(entries[2].by).toContain('人已确认')
    expect(entries[3].title).toContain('回滚')
    expect(entries[4].lines.join(' ')).toContain('回落：内置默认 200')
    const html = buildRecordsPane(recordsPaneModelOf({ record: full }))
    for (const t of ['启动', '插件升级', '迁移到 SQLite', '回滚到 JSON 分片', '设置项被作废']) expect(html).toContain(t)
  })

  it('没有 confirmedBy 时**不编触发者**（留痕不全就说没有）', () => {
    const entries = timelineOf(recordOf({ history: [{ at: '2026-10-02T15:30:00+08:00', event: 'migration', result: 'ok', requirements: 1, durationMs: 1 }] }))
    expect(entries[0].by).toBeUndefined()
    expect(buildRecordsPane(recordsPaneModelOf({
      record: recordOf({ history: [{ at: '2026-10-02T15:30:00+08:00', event: 'migration', result: 'ok', requirements: 1, durationMs: 1 }] }),
    }))).not.toContain('人已确认')
  })
})

describe('系统记录屏 · 硬验收③：版本不一致给重建指引', () => {
  it('一致 → 无重建提示；不一致 → 明确「重建库」且写明不得硬读旧表', () => {
    expect(compatOf(recordOf()).rebuildHint).toBeUndefined()
    const bad = compatOf(recordOf({
      compat: { checkedAt: 'x', consistent: false, currentPluginVersion: '0.2.0', lastMigrationBy: { pluginVersion: '0.1.0', at: '2026-10-02T15:30:04+08:00' }, upgrades: [{ at: 'a', from: '0.0.9', to: '0.1.0' }] },
    }))
    expect(bad.consistent).toBe(false)
    expect(bad.rebuildHint).toContain('重建库')
    expect(bad.rebuildHint).toContain('不得硬读旧表')
    expect(bad.lines.join(' ')).toContain('最近一次迁移由：0.1.0')
    expect(buildRecordsPane(recordsPaneModelOf({ record: recordOf({
      compat: { checkedAt: 'x', consistent: false, currentPluginVersion: '0.2.0', upgrades: [] },
    }) }))).toContain('重建库')
  })
})

describe('系统记录屏 · 损坏与加载/读不到要分开', () => {
  const summary: SystemSummaryView = { ok: false, reason: 'JSON 解析失败（第 3 行）', path: '/home/.dsh/dsh-reqboard-system.json' }

  it('损坏 → 红字含原因与路径，并给出「不自动重建」的处置；不是白屏', () => {
    const model = recordsPaneModelOf({ record: { ok: false, invalid: true, reason: 'JSON 解析失败（第 3 行）', path: '/home/.dsh/dsh-reqboard-system.json' } })
    expect(model.mode).toBe('invalid')
    const html = buildRecordsPane(model)
    expect(html).toContain('系统记录文件损坏')
    expect(html).toContain('/home/.dsh/dsh-reqboard-system.json')
    expect(html).toContain('改名或删除')
    expect(html).toContain('其余分类不受影响')
  })

  it('摘要说损坏但全量还没取到 → 也要红字（不显示成"加载中"骗人）', () => {
    const model = recordsPaneModelOf({ summary })
    const html = buildRecordsPane(model)
    expect(html).toContain('系统记录文件损坏')
  })

  it('读不到（error）与内容坏（invalid）文案不同', () => {
    const err = buildRecordsPane(recordsPaneModelOf({ error: '读取系统记录失败：网络中断' }))
    expect(err).toContain('读取系统记录失败：网络中断')
    expect(err).toContain('其余分类不受影响')
    expect(err).not.toContain('文件损坏')
  })
})

describe('丢事件计数：两个口径分别展示、永不相加', () => {
  it('进程内 2 条 + 历史累计 5 条 → 分别出现，且不出现 7', () => {
    const html = buildRecordsPane(recordsPaneModelOf({ summary: { ok: true, droppedEvents: 2, droppedEventsTotal: 5 } }))
    expect(html).toContain('本次运行：已丢弃 2 条事件')
    expect(html).toContain('累计：历史累计丢弃 5 条')
    expect(html).not.toContain('7 条')
  })

  it('都为 0 时不显示该区块', () => {
    const html = buildRecordsPane(recordsPaneModelOf({ summary: { ok: true, droppedEvents: 0, droppedEventsTotal: 0 } }))
    expect(html).not.toContain('事件丢弃')
  })
})

describe('通用屏 · 硬验收②：设置文件不存在时按钮禁用并给出确切提示', () => {
  it('openConfigCopyOf：不存在 → 禁用 + 「尚未创建：首次保存后生成」', () => {
    const copy = openConfigCopyOf({ path: '/home/.dsh/dsh-reqboard-settings.json', exists: false })
    expect(copy.disabled).toBe(true)
    expect(copy.hint).toContain('尚未创建：首次保存后生成')
  })

  it('壳里的按钮：文件不存在 → 不可用但**不静默**（可见旁注 + 可点击给解释）；存在 → 可点', () => {
    const base = { ...initialShellState(), open: true, settingsFilePath: '/home/.dsh/dsh-reqboard-settings.json' }
    const missing = buildSettingsShell({ ...base, settingsFileExists: false } as SettingsShellState)
    // 2026-10-04 人报「打开配置文件没有反应」后改：不再用 `disabled`（它不派发点击 = 死点击），
    // 改用 aria-disabled + **可见**旁注，并把点击交给控制器带去解释那一屏。
    expect(missing).toContain('data-action="settings-open-config" aria-disabled="true"')
    expect(missing).not.toContain('data-action="settings-open-config" disabled')
    expect(missing).toContain('尚未创建：首次保存后生成')
    // 旁注必须是**页面上看得见**的字，不能只在 title 里（悬停才看得到 = 等于没有）
    expect(missing).toMatch(/dsh-pm-set-head-note[^>]*>尚未创建</)
    const present = buildSettingsShell({ ...base, settingsFileExists: true } as SettingsShellState)
    expect(present).toContain('data-action="settings-open-config" title=')
    expect(present).not.toContain('aria-disabled="true"')
    expect(openConfigHint({ ...base, settingsFileExists: false } as SettingsShellState)).toContain('尚未创建')
  })

  it('通用屏列出运行信息，且对"客户端读不到的运行时"如实写未知', () => {
    const rows = generalRowsOf({
      pluginVersion: '0.1.0', pluginBuildStamp: '7f3c1ab9d204',
      settingsFilePath: '/home/.dsh/dsh-reqboard-settings.json', settingsFileExists: false,
      sqliteSchemaVersion: 1, ledgerSchemaVersion: 9,
    })
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]))
    // 标签与文案照原型（`dsh-pmboard 0.1.0` 无 v；schema 行带"不因加 SQLite 而升版"）
    expect(byLabel['PM 插件版本'].value).toContain('dsh-pmboard 0.1.0')
    expect(byLabel['插件构建指纹'].value).toContain('plugin_build=7f3c1ab9d204')
    expect(byLabel['台账 schema'].value).toContain('9')
    expect(byLabel['SQLite 库结构版本'].value).toBe('1')
    expect(byLabel['运行时'].value).toContain('未知')
    expect(byLabel['设置文件'].note).toContain('尚未创建')
    // 对齐趟 2 新增：这两行**恒定存在**（拿不到值也要如实写未知，而不是把整行省掉）
    expect(byLabel['台账数据根'].label).toBe('台账数据根')
    expect(byLabel['当前后端'].label).toBe('当前后端')
  })

  it('通用屏渲染：有重建指引时出红字', () => {
    const html = buildGeneralPane({
      rows: generalRowsOf({ settingsFileExists: true }),
      openConfig: openConfigCopyOf({ path: '/x.json', exists: true }),
      rebuildHint: '版本不一致：请重建库（迁移会先备份旧库再全量重建）——不得硬读旧表。',
    })
    expect(html).toContain('重建库')
    expect(html).toContain('dsh-pm-set-notice is-danger')
  })
})

describe('取数链路：替身跑一遍，状态迁移正确且不留死按钮', () => {
  it('通道缺失 → 如实报"未装配"，不假装成功', async () => {
    const seen: string[] = []
    const load = makeSystemRecordLoader({ api: {}, dispatch: (ev) => seen.push(ev.kind) })
    await load()
    expect(seen).toEqual(['record-fail'])
  })

  it('取数成功 → start → ok；失败 → start → fail，且壳渲染出对应屏内容', async () => {
    const events: string[] = []
    const okLoader = makeSystemRecordLoader({ api: { fetchSystemRecord: async () => recordOf() }, dispatch: (ev) => events.push(ev.kind) })
    await okLoader()
    expect(events).toEqual(['record-start', 'record-ok'])

    let state = reduceShell({ ...initialShellState(), open: true, pane: 'records' }, { kind: 'record-start' })
    state = reduceShell(state, { kind: 'record-ok', record: recordOf({ history: [{ at: 'a', event: 'startup', backend: 'json', source: 'config', requirements: 1 }] }) })
    const html = buildSettingsShell(state)
    expect(html).toContain('后端使用史')
    expect(html).toContain('启动')
    // 死按钮守卫：本卡没有新增任何 data-action，渲染出的动作都必须已在清单内
    expect(unknownActions(actionsInHtml(html))).toEqual([])

    let failed = reduceShell(state, { kind: 'record-fail', message: '读取系统记录失败：网络中断' })
    failed = { ...failed, pane: 'records' }
    expect(buildSettingsShell(failed)).toContain('读取系统记录失败：网络中断')
    expect(buildSettingsShell(failed)).toContain('其余分类不受影响')
  })

  it('损坏形态也能被壳渲染成红字（服务端 200 + invalid 标记的路径）', () => {
    const invalid: SystemRecordInvalidView = { ok: false, invalid: true, reason: 'JSON 解析失败', path: '/home/.dsh/dsh-reqboard-system.json' }
    const state = reduceShell({ ...initialShellState(), open: true, pane: 'records' }, { kind: 'record-ok', record: invalid })
    const html = buildSettingsShell(state)
    expect(html).toContain('系统记录文件损坏')
    expect(html).toContain('其余分类不受影响')
  })
})


describe('系统记录屏 · 原始 JSON（人说「应该是系统文件 json、路径等信息」后补）', () => {
  it('把记录文件的原文放进可展开块（默认收起，不撑长那一屏）', () => {
    const html = buildRecordsPane(recordsPaneModelOf({ record: recordOf({ paths: { systemFile: '/x/sys.json' } as never }) }))
    expect(html).toContain('原始 JSON')
    expect(html).toContain('<details')
    expect(html).toContain('</details>')
    // 原文必须在 <pre> 里，且是转义过的（不是把 JSON 当 HTML 塞进去）
    // 原文是个 JSON 对象（`{` 起头）——别把断言写成依赖某个字段名，夹具变了就会误红
    expect(html).toMatch(/<pre class="dsh-pm-set-mono">\{/)
  })

  it('原文里带 HTML 危险字符时必须被转义（不许当标记渲染）', () => {
    const html = buildRecordsPane(recordsPaneModelOf({
      record: recordOf({ paths: { systemFile: '<img src=x onerror=alert(1)>' } as never }),
    }))
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img')
  })

  it('拿不到记录时不显示那一段（不编）', () => {
    const html = buildRecordsPane(recordsPaneModelOf({}))
    expect(html).not.toContain('原始 JSON')
  })
})


describe('系统记录屏 · 打开记录文件（人确认按钮该指向 dsh-reqboard-system.json）', () => {
  it('路径行旁有「打开系统记录文件」按钮，且指向该文件', () => {
    const html = buildRecordsPane(recordsPaneModelOf({
      record: recordOf({} as never),
      systemFilePath: '/x/dsh-reqboard-system.json',
    }))
    expect(html).toContain('打开系统记录文件')
    expect(html).toContain('/x/dsh-reqboard-system.json')
  })

  it('摘要没给路径时不渲染那个按钮（不给死点击），路径显示为「未知」', () => {
    const html = buildRecordsPane(recordsPaneModelOf({ record: recordOf({} as never) }))
    expect(html).not.toContain('打开系统记录文件')
    expect(html).toContain('未知')
  })
})


describe('系统记录取数 · 形状归一（2026-10-04 人报「一直停在正在读取」后补）', () => {
  const REC = { schemaVersion: 1, plugin: { version: '0.1.0' }, paths: { systemFile: '/x/sys.json' }, history: [] }

  it('宿主回的是「包一层」的外壳 → 取里面的 record（不把外壳当记录）', async () => {
    const events: unknown[] = []
    const load = makeSystemRecordLoader({
      api: { fetchSystemRecord: async () => ({ ok: true, record: REC, paths: {} } as never) },
      dispatch: (e) => events.push(e),
    })
    await load()
    const ok = events.find((e) => (e as { kind: string }).kind === 'record-ok') as { record: unknown }
    expect(ok).toBeDefined()
    expect((ok.record as { schemaVersion?: unknown }).schemaVersion).toBe(1)
  })

  it('形状认不出来 → **报错**，绝不留一个永转的「正在读取」', async () => {
    const events: unknown[] = []
    const load = makeSystemRecordLoader({
      api: { fetchSystemRecord: async () => ({ whatever: 1 } as never) },
      dispatch: (e) => events.push(e),
    })
    await load()
    const kinds = events.map((e) => (e as { kind: string }).kind)
    expect(kinds).toContain('record-fail')
    expect(kinds).not.toContain('record-ok')
  })
})
