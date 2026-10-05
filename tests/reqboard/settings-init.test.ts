/**
 * 设置文件与系统记录两个适配器的验收测试（REQ-261004103330-005f t2）。
 *
 * ## 这份测试锁的是什么
 *
 * 1. **FR-17 初始化语义**：系统记录"启动自动建"、设置文件"惰性建"——**两个方向都要断言**
 *    （只测"记录被建了"会漏掉"顺便把设置文件也建了"这种越界）；
 * 2. **只追加不覆盖**、**同事件幂等**（重放不把历史写花）；
 * 3. **写失败不抛但响亮**（只读目录 → `droppedEvents() === 1`，进程不崩）；
 * 4. **读失败保留旧快照**（设置文件损坏不得退化成默认值——否则上限会莫名从 300 变 1000）；
 * 5. **越界不钳值**：非法 PATCH 抛 `REQBOARD_SETTINGS_INVALID` 且**盘上文件一字未变**；
 * 6. **原子写**：更新后不残留 `*.tmp*`。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { FileSettingsStore } from '../../src/adapters/FileSettingsStore.js'
import { SystemRecordFile } from '../../src/adapters/SystemRecordFile.js'
import { SETTINGS_STORE_ERROR } from '../../src/application/ports.js'
import { SETTINGS_FILE_REL } from '../../src/application/settings/resolve-settings.js'
import {
  SYSTEM_RECORD_FILE_REL,
  startupEvent,
  type ActiveBackend,
  type PluginStamp,
  type StorePaths,
  type SystemRecordV1,
} from '../../src/application/settings/events.js'

/** 跑在 root 下时 chmod 挡不住写入（容器 CI 常见）——那条用例跳过而不是假绿。 */
const IS_ROOT = typeof process.getuid === 'function' && process.getuid() === 0

const STAMP: PluginStamp = { version: '0.1.0', buildStamp: '7f3c1ab9d204' }
const PLAIN_NOW = 1_791_000_000_000

let root = ''
let settingsFile = ''
let systemFile = ''
let warnings: string[] = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pmboard-settings-init-'))
  settingsFile = join(root, SETTINGS_FILE_REL)
  systemFile = join(root, SYSTEM_RECORD_FILE_REL)
  warnings = []
})

afterEach(() => {
  try {
    chmodSync(root, 0o700)
  } catch {
    /* best effort：只读用例失败时也要能清理 */
  }
  rmSync(root, { recursive: true, force: true })
})

function paths(): StorePaths {
  return {
    shardDataRoot: join(root, 'reqboard'),
    sqliteFile: join(root, 'reqboard.sqlite'),
    settingsFile,
    legacyLedger: join(root, 'dsh-reqboard.json'),
    backupDirs: [],
  }
}

const ACTIVE: ActiveBackend = { backend: 'json', since: new Date(PLAIN_NOW).toISOString(), source: 'config' }

function recordStore(): SystemRecordFile {
  return new SystemRecordFile({
    file: systemFile,
    now: () => PLAIN_NOW,
    plugin: { name: 'dsh-pmboard', stamp: STAMP, sqliteSchemaVersion: 1 },
    paths: paths(),
    active: ACTIVE,
    startup: { requirements: 12 },
    onWarn: (m) => warnings.push(m),
  })
}

function settingsStore(extra: { currentBackend?: 'json' | 'sqlite' } = {}): FileSettingsStore {
  return new FileSettingsStore({
    dshHome: root,
    env: {},
    now: () => PLAIN_NOW,
    onWarn: (m) => warnings.push(m),
    ...extra,
  })
}

function readSystem(): SystemRecordV1 {
  return JSON.parse(readFileSync(systemFile, 'utf8')) as SystemRecordV1
}

describe('FR-17 初始化语义：系统记录自动建 / 设置文件惰性建', () => {
  it('read() 建出系统记录且首条是 startup；设置文件仍不存在', async () => {
    const rec = recordStore()
    const settings = settingsStore()
    // 先让设置侧也"读过一次"——它不该因此建文件（惰性创建的关键断言）
    await settings.refresh()

    expect(existsSync(systemFile)).toBe(false)
    const record = await rec.read()

    expect(existsSync(systemFile)).toBe(true)
    const first = record.history[0]
    expect(first?.event).toBe('startup')
    // 联合类型按 event 收窄后再取成员（直接 `history[0]?.requirements` 编译不过）
    expect(first !== undefined && first.event === 'startup' ? first.requirements : undefined).toBe(12)
    expect(record.plugin.version).toBe('0.1.0')
    expect(record.counters.droppedEvents).toBe(0)

    expect(existsSync(settingsFile)).toBe(false)
    expect(settings.snapshot().storage.backend.source).toBe('default')
    settings.dispose()
  })

  it('第一次 update() 之后设置文件才出现，内容只含被改的键（且后续是合并而非覆盖）', async () => {
    const store = settingsStore()
    expect(existsSync(settingsFile)).toBe(false)

    const after = await store.update({ stageMaxRounds: { implementing: 800 } })
    expect(existsSync(settingsFile)).toBe(true)
    const first = JSON.parse(readFileSync(settingsFile, 'utf8')) as Record<string, unknown>
    expect(first.schemaVersion).toBe(1)
    expect(Object.keys(first.stageMaxRounds as object)).toEqual(['implementing'])
    expect(after.stageMaxRounds.implementing.value).toBe(800)
    expect(after.stageMaxRounds.implementing.source).toBe('settings')
    // 没提的阶段仍是内建默认（且来源如实写 default）
    expect(after.stageMaxRounds.design.source).toBe('default')

    await store.update({ stageMaxRounds: { design: 50 } })
    const merged = JSON.parse(readFileSync(settingsFile, 'utf8')) as { stageMaxRounds: Record<string, number> }
    expect(merged.stageMaxRounds).toEqual({ implementing: 800, design: 50 })
    store.dispose()
  })

  it('系统记录的"先 append 后 read"也带首条 startup（不留"有事件没启动记录"的档案）', async () => {
    const rec = recordStore()
    await rec.append(startupEvent({
      at: new Date(PLAIN_NOW + 1000).toISOString(),
      backend: 'json',
      source: 'config',
      requirements: 12,
      plugin: STAMP,
    }))
    const record = await rec.read()
    expect(record.history[0]?.event).toBe('startup')
    expect(record.history).toHaveLength(2)
  })
})

describe('系统记录：只追加 / 幂等 / 写失败不抛', () => {
  it('追加不覆盖既有历史；同一事件重复写被忽略', async () => {
    const rec = recordStore()
    await rec.read()
    const event = startupEvent({
      at: new Date(PLAIN_NOW + 5000).toISOString(),
      backend: 'json',
      source: 'config',
      requirements: 13,
      plugin: STAMP,
    })
    await rec.append(event)
    const once = await rec.read()
    expect(once.history).toHaveLength(2)
    expect(once.counters.lastStartupAt).toBe(event.at)

    await rec.append(event)
    await rec.append(event)
    const twice = await rec.read()
    expect(twice.history).toHaveLength(2)
  }, 20000)

  it.skipIf(IS_ROOT)('只读目录下 append()：不抛，droppedEvents() === 1', async () => {
    const rec = recordStore()
    await rec.read() // 先建好文件（可写），再让目录只读
    chmodSync(root, 0o500)
    try {
      await rec.append(startupEvent({
        at: new Date(PLAIN_NOW + 9000).toISOString(),
        backend: 'sqlite',
        source: 'settings',
        requirements: 13,
        plugin: STAMP,
      }))
    } finally {
      chmodSync(root, 0o700)
    }
    expect(rec.droppedEvents()).toBe(1)
    expect(warnings.join('\n')).toContain('系统记录写入失败')
    // 盘上仍是上一次成功写入的内容（没有被半截覆盖）
    expect(readSystem().history).toHaveLength(1)

    // 恢复可写后写一次：丢弃数要**补进档案**（只活在内存里不算"响亮"）
    await rec.append(startupEvent({
      at: new Date(PLAIN_NOW + 11000).toISOString(),
      backend: 'sqlite',
      source: 'settings',
      requirements: 14,
      plugin: STAMP,
    }))
    expect(readSystem().counters.droppedEvents).toBe(1)
    expect(readSystem().history).toHaveLength(2)
  })
})

describe('设置文件：读外部改动 / 拒非法值 / 原子写', () => {
  it('refresh() 能读到绕过 update() 手改的文件；损坏时保留旧快照并告警', async () => {
    const store = settingsStore()
    writeFileSync(settingsFile, JSON.stringify({ schemaVersion: 1, stageMaxRounds: { implementing: 123 } }), 'utf8')
    const refreshed = await store.refresh()
    expect(refreshed.stageMaxRounds.implementing.value).toBe(123)
    expect(refreshed.stageMaxRounds.implementing.source).toBe('settings')

    writeFileSync(settingsFile, '{ 这不是 JSON', 'utf8')
    const after = await store.refresh()
    // 关键：**退回默认值是错的**——必须保留上一份生效快照
    expect(after.stageMaxRounds.implementing.value).toBe(123)
    expect(warnings.join('\n')).toContain('保留上一份生效值')
    store.dispose()
  })

  it('越界/非整数一律抛 REQBOARD_SETTINGS_INVALID，且盘上文件一字未变', async () => {
    const store = settingsStore()
    await store.update({ stageMaxRounds: { implementing: 800 } })
    const before = readFileSync(settingsFile, 'utf8')
    for (const bad of [0, 10_001, 1.5, Number.NaN]) {
      await expect(store.update({ stageMaxRounds: { implementing: bad } }))
        .rejects.toMatchObject({ code: SETTINGS_STORE_ERROR.INVALID })
      expect(readFileSync(settingsFile, 'utf8')).toBe(before)
    }
    store.dispose()
  })

  it('原子写：更新后目录里没有残留 *.tmp*', async () => {
    const store = settingsStore()
    await store.update({ stageMaxRounds: { implementing: 700 } })
    await store.update({ storage: { sqlitePath: join(root, 'custom.sqlite') } })
    const leftovers = readdirSync(root).filter((n) => n.includes('.tmp'))
    expect(leftovers).toEqual([])
    const file = JSON.parse(readFileSync(settingsFile, 'utf8')) as { storage: { sqlitePath: string } }
    expect(file.storage.sqlitePath).toBe(join(root, 'custom.sqlite'))
    store.dispose()
  })
})

describe('版本一致性核对（FR-16）', () => {
  it('插件版本不同 → 追加 upgrade 事件并刷新顶层版本戳；history 里的旧版本不动', async () => {
    const rec = recordStore()
    await rec.read()
    const compat = await rec.reconcileVersion({ version: '0.2.0', buildStamp: 'newbuild0001' }, 1)
    expect(compat.consistent).toBe(true)
    expect(compat.upgrades).toEqual([{ at: new Date(PLAIN_NOW).toISOString(), from: '0.1.0', to: '0.2.0' }])

    const after = readSystem()
    expect(after.plugin.version).toBe('0.2.0')
    expect(after.counters.upgrades).toBe(1)
    const upgrade = after.history.find((e) => e.event === 'upgrade')
    expect(upgrade !== undefined && upgrade.event === 'upgrade' ? upgrade.from.version : undefined).toBe('0.1.0')
  })

  it('库的表结构版本与当前不一致 → consistent=false（不许硬读旧表）', async () => {
    const rec = recordStore()
    await rec.read()
    const compat = await rec.reconcileVersion(STAMP, 2)
    expect(compat.consistent).toBe(false)
    expect(compat.currentPluginVersion).toBe('0.1.0')
  })
})

/**
 * t5 装配期接线（REQ-261004103330-005f t5）：**选实现**与**启动建档**这两段新代码的验收。
 *
 * 为什么补在这里而不是新建文件：它们与本文件同属"装配期把设置/档案接起来"这条线，
 * 新开一份只会让同一件事有两处真相（父卡也明确要求"不新建重复文件"）。
 */
describe('t5 装配期接线：按后端选实现', () => {
  it('sqlite：库文件父目录不存在时会被建出来，且端口可用（revision 从 0 起）', async () => {
    const { selectRequirementStore } = await import('../../src/wiring/settings-assembly.js')
    const nested = join(root, 'nested', 'deeper', 'ledger.sqlite')
    const store = selectRequirementStore({
      backend: 'sqlite', dataRoot: root, sqliteFile: nested, now: () => PLAIN_NOW, warn: () => {},
    })
    const head = await store.head()
    expect(head.revision).toBe(0)
    expect(existsSync(nested)).toBe(true) // 父目录被补上 + 库文件被创建
    await store.replaceAll('test', { schemaVersion: 9, revision: 0, requirements: [], triages: [] })
  })

  it('json：走分片实现，不碰库文件；两种选择都满足同一端口（能 head）', async () => {
    const { selectRequirementStore } = await import('../../src/wiring/settings-assembly.js')
    const sqliteFile = join(root, 'unused.sqlite')
    const store = selectRequirementStore({
      backend: 'json', dataRoot: root, sqliteFile, now: () => PLAIN_NOW, warn: () => {},
    })
    await store.head() // 端口方法可用即证明装配成立
    expect(existsSync(sqliteFile)).toBe(false) // 选 json 时绝不去建库文件
  })
})

describe('t5 装配期接线：启动把档案写一遍', () => {
  it('bootSystemRecord：首次启动建档 + 记 startup + 写体检快照（分片层与库层都记）', async () => {
    const { bootSystemRecord } = await import('../../src/wiring/settings-assembly.js')
    const record = bootSystemRecord({
      dshHome: root,
      dataRoot: join(root, 'reqboard'),
      legacyLedger: join(root, 'dsh-reqboard.json'),
      sqliteFile: join(root, 'other.sqlite'),
      backend: 'json',
      backendSource: 'settings',
      plugin: { name: 'dsh-pmboard', stamp: STAMP },
      now: () => PLAIN_NOW,
      warn: (m) => warnings.push(m),
    })
    // 等它把异步那半跑完（boot 不 await 是刻意的：档案是旁路，不该拖住装配）
    await new Promise((r) => setTimeout(r, 30))
    const rec = await record.read()
    const sysFile = join(root, SYSTEM_RECORD_FILE_REL)
    expect(existsSync(sysFile)).toBe(true)
    expect(rec.active.backend).toBe('json')
    expect(rec.active.source).toBe('settings')
    expect(rec.plugin.version).toBe('0.1.0')
    // 首个 startup 由适配器初始化写；本次启动那条由接线追加 → 至少一条，且带 backend 与条数
    const startups = rec.history.filter((e) => e.event === 'startup')
    expect(startups.length).toBeGreaterThanOrEqual(1)
    // 体检快照：分片层与库层都在（库不存在 → exists:false，但字段齐全，不伪造条数）
    expect(rec.stores.shards.requirements).toBe(0)
    expect(rec.stores.sqlite.exists).toBe(false)
  })

  it('记录文件损坏 → 启动建档**降级为告警**且不抛（档案坏了不该拖垮看板）', async () => {
    const { bootSystemRecord } = await import('../../src/wiring/settings-assembly.js')
    writeFileSync(join(root, SYSTEM_RECORD_FILE_REL), '{ 这不是 JSON')
    const record = bootSystemRecord({
      dshHome: root,
      dataRoot: join(root, 'reqboard'),
      legacyLedger: join(root, 'dsh-reqboard.json'),
      sqliteFile: join(root, 'other.sqlite'),
      backend: 'json',
      backendSource: 'default',
      plugin: { name: 'dsh-pmboard', stamp: STAMP },
      now: () => PLAIN_NOW,
      warn: (m) => warnings.push(m),
    })
    await new Promise((r) => setTimeout(r, 30))
    expect(warnings.some((w) => w.includes('不可读'))).toBe(true)
    expect(record).toBeDefined() // 端口仍返回，启动不抛
  })

  it('已存在的记录：启动接线把路径档案刷新成本次解析到的值（history 原样保留）', async () => {
    const { bootSystemRecord } = await import('../../src/wiring/settings-assembly.js')
    // ① 造一份"paths 是旧值"的档案（先住旧根），并让它带上一条历史
    const oldRoot = join(root, 'old-root')
    const old = new SystemRecordFile({
      file: systemFile,
      now: () => PLAIN_NOW,
      plugin: { name: 'dsh-pmboard', stamp: STAMP, sqliteSchemaVersion: 1 },
      paths: { ...paths(), shardDataRoot: oldRoot, sqliteFile: join(oldRoot, 'old.sqlite') },
      active: ACTIVE,
      onWarn: (m) => warnings.push(m),
    })
    await old.read()
    await old.append(startupEvent({
      at: new Date(PLAIN_NOW + 1_000).toISOString(), backend: 'json', source: 'config',
      requirements: 7, plugin: STAMP,
    }))
    const before = await old.read()
    expect(before.paths.shardDataRoot).toBe(oldRoot)

    // ② 本次启动：数据根与库文件都"搬家"了 → 接线必须把档案刷新成新路径
    const newDataRoot = join(root, 'new-reqboard')
    const newSqlite = join(root, 'new.sqlite')
    const newLegacy = join(root, 'legacy.json')
    bootSystemRecord({
      dshHome: root,
      dataRoot: newDataRoot,
      legacyLedger: newLegacy,
      sqliteFile: newSqlite,
      backend: 'json',
      backendSource: 'settings',
      plugin: { name: 'dsh-pmboard', stamp: STAMP },
      now: () => PLAIN_NOW + 5_000,
      warn: (m) => warnings.push(m),
    })
    await new Promise((r) => setTimeout(r, 30))

    const after = await old.read()
    expect(after.paths.shardDataRoot).toBe(newDataRoot)
    expect(after.paths.sqliteFile).toBe(newSqlite)
    expect(after.paths.legacyLedger).toBe(newLegacy)
    // 历史**原样保留**：本次启动追加的那条只在末尾，前面逐条不变（不是被整份覆盖）
    expect(after.history.slice(0, before.history.length)).toEqual(before.history)
    expect(after.history.length).toBe(before.history.length + 1)
  })

  it.skipIf(IS_ROOT)('只读目录下 updatePaths()：不抛，droppedEvents() === 1（写失败降级口径一致）', async () => {
    const rec = recordStore()
    await rec.read() // 先在可写状态建档
    chmodSync(root, 0o500)
    try {
      await rec.updatePaths({ ...paths(), shardDataRoot: join(root, 'moved-root') })
    } finally {
      chmodSync(root, 0o700)
    }
    expect(rec.droppedEvents()).toBe(1)
    expect(warnings.join('\n')).toContain('系统记录写入失败')
    // 盘上路径档案仍是旧值（没被半截覆盖，也没静默"成功"）
    expect(readSystem().paths.shardDataRoot).toBe(paths().shardDataRoot)
  })

  it('路径档案刷新是幂等的：同值连调两次，文件内容一字不改', async () => {
    const rec = recordStore()
    await rec.read()
    const same = paths()
    await rec.updatePaths(same)
    const first = readFileSync(systemFile, 'utf8')
    await rec.updatePaths(same)
    const second = readFileSync(systemFile, 'utf8')
    expect(second).toBe(first) // 未变不写盘：updatedAt 也不动
    const after = await rec.read()
    expect(after.counters).toMatchObject({
      migrations: 0, migrationsFailed: 0, rollbacks: 0, upgrades: 0, droppedEvents: 0, truncated: 0,
    })
    // 没有因为刷新路径而追加任何事件
    expect(after.history.every((e) => e.event === 'startup')).toBe(true)
  })
})
