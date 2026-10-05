/**
 * 运行设置解析与系统记录写入语义的单测（REQ-261004103330-005f t1）。
 *
 * ## 这份测试锁的是什么
 *
 * 1. **四级来源逐项判定**（设置文件 > 插件配置 > 环境变量 > 内置默认）——不是整份覆盖；
 * 2. **非法值 = 该项作废并沿链下探**（不是整份回落默认）——这条最容易在实现里被写反；
 * 3. **越界不钳值**（0 / 10001 / 1.5 一律拒），且如实记 `problems`；
 * 4. **系统记录是追加语义**：派生字段（counters / active / stores）随事件走，历史不被覆盖；
 * 5. SQLite 库版本与台账版本是**两个**版本号。
 */
import { describe, it, expect } from 'vitest'
import {
  resolveRunSettings,
  parseStageRoundsEnv,
  validateRunSettingsPatch,
  stageLimitInvalidReason,
  ENV_STORAGE,
  ENV_STAGE_MAX_ROUNDS,
} from '../../src/application/settings/resolve-settings.js'
import {
  appendEvent,
  emptySystemRecord,
  startupEvent,
  staleSqliteReason,
  withDroppedEvent,
  SYSTEM_HISTORY_MAX,
  SYSTEM_RECORD_SCHEMA_VERSION,
  type SystemEvent,
  type SystemRecordV1,
} from '../../src/application/settings/events.js'
import {
  SQLITE_DDL,
  SQLITE_META_KEYS,
  SQLITE_SCHEMA_VERSION,
  SQLITE_TABLES,
  sqliteSchemaMatches,
} from '../../src/repositories/sqliteSchema.js'
import { STAGE_CONFIGS } from '../../src/application/dive/stage-configs.js'
import { LIMITS } from '../../src/domain/limits.js'

describe('resolveRunSettings · 四级来源逐项判定', () => {
  it('设置文件 > 插件配置 > 环境变量 > 内置默认', () => {
    const all = resolveRunSettings({
      file: { schemaVersion: 1, stageMaxRounds: { implementing: 800 } },
      config: { stageMaxRounds: { implementing: 700 } },
      env: { [ENV_STAGE_MAX_ROUNDS]: 'implementing=600' },
    })
    expect(all.stageMaxRounds.implementing).toEqual({ value: 800, default: 1000, source: 'settings' })

    const noFile = resolveRunSettings({
      config: { stageMaxRounds: { implementing: 700 } },
      env: { [ENV_STAGE_MAX_ROUNDS]: 'implementing=600' },
    })
    expect(noFile.stageMaxRounds.implementing).toEqual({ value: 700, default: 1000, source: 'config' })

    const noConfig = resolveRunSettings({ env: { [ENV_STAGE_MAX_ROUNDS]: 'implementing=600' } })
    expect(noConfig.stageMaxRounds.implementing).toEqual({ value: 600, default: 1000, source: 'env' })

    const bare = resolveRunSettings({})
    expect(bare.stageMaxRounds.implementing).toEqual({ value: 1000, default: 1000, source: 'default' })
  })

  it('内置默认只有一个来源：取自 dive/stage-configs 的默认表', () => {
    const bare = resolveRunSettings({})
    for (const [status, cfg] of Object.entries(STAGE_CONFIGS)) {
      expect(bare.stageMaxRounds[status as keyof typeof bare.stageMaxRounds].default).toBe(cfg.maxRounds)
    }
  })

  it('未提及的阶段不受影响（逐项独立，不是整份覆盖）', () => {
    const r = resolveRunSettings({ file: { schemaVersion: 1, stageMaxRounds: { implementing: 5 } } })
    expect(r.stageMaxRounds.implementing.value).toBe(5)
    expect(r.stageMaxRounds.design.value).toBe(STAGE_CONFIGS.design.maxRounds)
    expect(r.stageMaxRounds.design.source).toBe('default')
  })
})

describe('resolveRunSettings · 非法值作废并沿链下探', () => {
  it('设置文件里写 0 → 该项作废，落到插件配置的有效值（不是内置默认）', () => {
    const r = resolveRunSettings({
      file: { schemaVersion: 1, stageMaxRounds: { implementing: 0 } },
      config: { stageMaxRounds: { implementing: 700 } },
    })
    expect(r.stageMaxRounds.implementing).toEqual({ value: 700, default: 1000, source: 'config' })
    expect(r.problems).toHaveLength(1)
    expect(r.problems[0].key).toBe('stageMaxRounds.implementing')
    expect(r.problems[0].fellBackTo).toBe('config = 700')
  })

  it('链上全非法 → 落到内置默认并逐条记账', () => {
    const r = resolveRunSettings({
      file: { schemaVersion: 1, stageMaxRounds: { design: 10_001 } },
      env: { [ENV_STAGE_MAX_ROUNDS]: 'design=1.5' },
    })
    expect(r.stageMaxRounds.design).toEqual({ value: 200, default: 200, source: 'default' })
    expect(r.problems.map((p) => p.key)).toEqual(['stageMaxRounds.design', 'stageMaxRounds.design'])
    expect(r.problems.every((p) => p.fellBackTo === '内置默认 200')).toBe(true)
  })

  it('越界不钳值：0 / 10001 / 非整数一律拒', () => {
    expect(stageLimitInvalidReason(0)).toContain('不得小于 1')
    expect(stageLimitInvalidReason(10_001)).toContain('不得大于 10000')
    expect(stageLimitInvalidReason(1.5)).toContain('整数')
    expect(stageLimitInvalidReason('8')).toContain('数字')
    expect(stageLimitInvalidReason(LIMITS.stageMaxRoundsMin)).toBeUndefined()
    expect(stageLimitInvalidReason(LIMITS.stageMaxRoundsMax)).toBeUndefined()
  })

  it('未知阶段键如实记账（不静默忽略）', () => {
    const r = resolveRunSettings({ file: { schemaVersion: 1, stageMaxRounds: { nope: 3 } as never } })
    expect(r.problems.some((p) => p.key === 'stageMaxRounds.nope' && p.reason === '未知阶段')).toBe(true)
  })

  it('设置文件版本未知 → 整份作废（格式未知时按新格式猜读更危险）', () => {
    const r = resolveRunSettings({
      file: { schemaVersion: 2, stageMaxRounds: { implementing: 5 } },
      config: { stageMaxRounds: { implementing: 700 } },
    })
    expect(r.stageMaxRounds.implementing).toEqual({ value: 700, default: 1000, source: 'config' })
    expect(r.problems[0].key).toBe('schemaVersion')
  })
})

describe('resolveRunSettings · 环境变量解析', () => {
  it('合法多项解析成功', () => {
    const { values, problems } = parseStageRoundsEnv('implementing=200, design=50')
    expect(values).toEqual({ implementing: 200, design: 50 })
    expect(problems).toHaveLength(0)
  })

  it('非法项逐项作废，不影响同串里的合法项', () => {
    const { values, invalid, problems } = parseStageRoundsEnv('implementing=abc,design=50,nope=3,=7')
    expect(values).toEqual({ design: 50 })
    // 值非法 → 结构化交给最终判定处记账（此刻还不知道会回落到谁）
    expect(invalid).toEqual([{ stage: 'implementing', reason: expect.stringContaining('数字'), raw: 'abc' }])
    // 结构性问题（未知阶段 / 缺阶段名）此刻就能定论
    expect(problems.map((p) => p.key)).toEqual(['stageMaxRounds.nope', ENV_STAGE_MAX_ROUNDS])
  })

  it('env 里的非法项，回落说明如实写「最终用的是谁」而不是笼统的默认', () => {
    const r = resolveRunSettings({
      config: { stageMaxRounds: { implementing: 700 } },
      env: { [ENV_STAGE_MAX_ROUNDS]: 'implementing=abc' },
    })
    expect(r.stageMaxRounds.implementing).toEqual({ value: 700, default: 1000, source: 'config' })
    expect(r.problems).toHaveLength(1)
    expect(r.problems[0].fellBackTo).toBe('config = 700')
  })

  it('空串与缺省都当作没有（不产生问题）', () => {
    expect(parseStageRoundsEnv(undefined).problems).toHaveLength(0)
    expect(parseStageRoundsEnv('   ').values).toEqual({})
  })
})

describe('resolveRunSettings · 存储后端', () => {
  it('后端来源与上限同一套顺序；非法项作废后继续下探', () => {
    expect(resolveRunSettings({ file: { storage: { backend: 'sqlite' } } }).storage.backend)
      .toEqual({ value: 'sqlite', source: 'settings' })
    const r = resolveRunSettings({
      file: { storage: { backend: 'mysql' as never } },
      env: { [ENV_STORAGE]: 'sqlite' },
    })
    expect(r.storage.backend).toEqual({ value: 'sqlite', source: 'env' })
    expect(r.problems[0].key).toBe('storage.backend')
  })

  it('目标与当前进程不同 → restartRequired（不热切换）', () => {
    const r = resolveRunSettings({ file: { storage: { backend: 'sqlite' } }, currentBackend: 'json' })
    expect(r.storage.effective).toBe('json')
    expect(r.storage.restartRequired).toBe(true)
    const same = resolveRunSettings({ file: { storage: { backend: 'sqlite' } }, currentBackend: 'sqlite' })
    expect(same.storage.restartRequired).toBe(false)
  })

  it('sqlitePath：配置优先；缺省随 dshHome 拼绝对路径，无 dshHome 时保持相对', () => {
    expect(resolveRunSettings({ dshHome: '/tmp/home' }).storage.sqlitePath).toBe('/tmp/home/reqboard.sqlite')
    expect(resolveRunSettings({ dshHome: '/tmp/home/' }).storage.sqlitePath).toBe('/tmp/home/reqboard.sqlite')
    expect(resolveRunSettings({}).storage.sqlitePath).toBe('reqboard.sqlite')
    expect(resolveRunSettings({ config: { storage: { sqlitePath: '/data/x.db' } } }).storage.sqlitePath).toBe('/data/x.db')
  })
})

describe('validateRunSettingsPatch · PATCH 的逐项判据', () => {
  it('合法补丁无问题', () => {
    expect(validateRunSettingsPatch({ stageMaxRounds: { implementing: 800 } })).toHaveLength(0)
  })

  it('越界/未知阶段/空路径分别点名', () => {
    const problems = validateRunSettingsPatch({
      stageMaxRounds: { implementing: 0, nope: 3 } as never,
      storage: { sqlitePath: '  ' },
    })
    expect(problems.map((p) => p.key)).toEqual([
      'stageMaxRounds.implementing',
      'stageMaxRounds.nope',
      'storage.sqlitePath',
    ])
  })
})

// ---------------------------------------------------------------------------
// 系统记录：追加语义
// ---------------------------------------------------------------------------

function seeded(): SystemRecordV1 {
  return emptySystemRecord({
    now: '2026-10-04T10:00:00+08:00',
    plugin: { name: 'dsh-pmboard', stamp: { version: '0.1.0', buildStamp: 'abc123' }, sqliteSchemaVersion: SQLITE_SCHEMA_VERSION },
    paths: {
      shardDataRoot: '/home/.dsh/reqboard',
      sqliteFile: '/home/.dsh/reqboard.sqlite',
      settingsFile: '/home/.dsh/dsh-reqboard-settings.json',
      legacyLedger: '/home/.dsh/dsh-reqboard.json',
      backupDirs: [],
    },
    active: { backend: 'json', since: '2026-10-04T10:00:00+08:00', source: 'default' },
  })
}

const STAMP = { version: '0.1.0', buildStamp: 'abc123' }

describe('系统记录 · 追加语义与派生字段', () => {
  it('初始化：版本戳、空历史、计数为 0', () => {
    const r = seeded()
    expect(r.schemaVersion).toBe(SYSTEM_RECORD_SCHEMA_VERSION)
    expect(r.plugin.version).toBe('0.1.0')
    expect(r.history).toHaveLength(0)
    expect(r.counters).toEqual({
      migrations: 0, migrationsFailed: 0, rollbacks: 0, upgrades: 0, droppedEvents: 0, truncated: 0,
    })
  })

  it('追加不覆盖历史；startup 刷新 active 与 lastStartupAt', () => {
    const e = startupEvent({
      at: '2026-10-04T10:31:00+08:00', backend: 'json', source: 'config',
      requirements: 128, staleSqlite: true, plugin: STAMP,
    })
    const r = appendEvent(seeded(), e)
    expect(r.history).toHaveLength(1)
    expect(r.active).toEqual({ backend: 'json', since: '2026-10-04T10:31:00+08:00', source: 'config' })
    expect(r.counters.lastStartupAt).toBe('2026-10-04T10:31:00+08:00')
    expect(r.updatedAt).toBe('2026-10-04T10:31:00+08:00')
    expect((r.history[0] as { detected?: { staleSqlite?: boolean } }).detected?.staleSqlite).toBe(true)
  })

  it('迁移成功：migrations++ 且 stores.sqlite 随动；失败：migrationsFailed++ 且库快照不动', () => {
    const ok: SystemEvent = {
      at: '2026-10-04T11:00:00+08:00', event: 'migration', from: 'json', to: 'sqlite',
      result: 'ok', requirements: 128, durationMs: 4200,
      backupDir: '/home/.dsh/backups/reqboard-1', windowKey: 'session-x', plugin: STAMP,
    }
    const afterOk = appendEvent(seeded(), ok)
    expect(afterOk.counters.migrations).toBe(1)
    expect(afterOk.counters.lastMigrationAt).toBe('2026-10-04T11:00:00+08:00')
    expect(afterOk.stores.sqlite).toMatchObject({ exists: true, requirements: 128, stale: false, writtenBy: STAMP })

    const failed: SystemEvent = {
      at: '2026-10-04T11:05:00+08:00', event: 'migration', from: 'json', to: 'sqlite',
      result: 'failed', requirements: 0, durationMs: 100, error: '校验不过', plugin: STAMP,
    }
    const afterFail = appendEvent(seeded(), failed)
    expect(afterFail.counters.migrationsFailed).toBe(1)
    expect(afterFail.stores.sqlite.exists).toBe(false)
  })

  it('回滚口径 = 切回 json 才 +1（切到 sqlite 不算回滚）', () => {
    const toSqlite: SystemEvent = {
      at: '2026-10-04T12:00:00+08:00', event: 'backend-switched', from: 'json', to: 'sqlite',
      keptOtherStore: true, plugin: STAMP,
    }
    const toJson: SystemEvent = {
      at: '2026-10-04T13:00:00+08:00', event: 'backend-switched', from: 'sqlite', to: 'json',
      keptOtherStore: true, plugin: STAMP,
    }
    expect(appendEvent(seeded(), toSqlite).counters.rollbacks).toBe(0)
    const back = appendEvent(seeded(), toJson)
    expect(back.counters.rollbacks).toBe(1)
    expect(back.active.backend).toBe('json')
  })

  it('升级事件 +1；写失败计数单独累加', () => {
    const up: SystemEvent = {
      at: '2026-10-01T09:20:00+08:00', event: 'upgrade',
      from: { version: '0.0.9', buildStamp: 'old' }, to: STAMP,
      detectedBy: 'startup-compare', plugin: STAMP,
    }
    expect(appendEvent(seeded(), up).counters.upgrades).toBe(1)
    expect(withDroppedEvent(seeded()).counters.droppedEvents).toBe(1)
  })

  it('历史超上限：丢最旧并记 truncated（不静默丢）', () => {
    let r = seeded()
    for (let i = 0; i < SYSTEM_HISTORY_MAX + 3; i++) {
      r = appendEvent(r, startupEvent({
        at: '2026-10-04T10:00:00+08:00', backend: 'json', source: 'default',
        requirements: i, plugin: STAMP,
      }))
    }
    expect(r.history).toHaveLength(SYSTEM_HISTORY_MAX)
    expect(r.counters.truncated).toBe(3)
  })
})

describe('陈旧库判定', () => {
  it('库少于分片 → 给原因；不少 → 无原因；库不存在 → 不判', () => {
    const shards = { exists: true, requirements: 128, bytes: 1, headRevision: 4 }
    expect(staleSqliteReason(shards, { exists: true, requirements: 44, bytes: 1, stale: false }))
      .toContain('少 84 条')
    expect(staleSqliteReason(shards, { exists: true, requirements: 128, bytes: 1, stale: false })).toBeUndefined()
    expect(staleSqliteReason(shards, { exists: false, requirements: 0, bytes: 0, stale: false })).toBeUndefined()
  })

  it('条数相同但分片在库迁移之后又有写入 → 也算陈旧（只比条数会漏）', () => {
    const shards = {
      exists: true, requirements: 128, bytes: 1, headRevision: 9,
      lastWriteAt: '2026-10-04T12:00:00+08:00',
    }
    const sqlite = {
      exists: true, requirements: 128, bytes: 1, stale: false,
      migratedAt: '2026-10-02T15:30:00+08:00',
    }
    expect(staleSqliteReason(shards, sqlite)).toContain('之后还有写入')
  })

  it('时区写法不同也按同一时刻比较；解析不出则不判（不给假告警）', () => {
    const base = { exists: true, requirements: 128, bytes: 1, headRevision: 9 }
    // 04:00Z 与 12:00+08:00 是同一时刻 → 不判陈旧
    expect(staleSqliteReason(
      { ...base, lastWriteAt: '2026-10-02T04:00:00Z' },
      { exists: true, requirements: 128, bytes: 1, stale: false, migratedAt: '2026-10-02T12:00:00+08:00' },
    )).toBeUndefined()
    // 时间戳不可解析 → 不判，而不是当 0 处理
    expect(staleSqliteReason(
      { ...base, lastWriteAt: '不是时间' },
      { exists: true, requirements: 128, bytes: 1, stale: false, migratedAt: '2026-10-02T12:00:00+08:00' },
    )).toBeUndefined()
  })
})

describe('SQLite 库结构常量', () => {
  it('版本号与表清单自洽', () => {
    expect(SQLITE_SCHEMA_VERSION).toBe(1)
    expect(sqliteSchemaMatches(1)).toBe(true)
    expect(sqliteSchemaMatches(undefined)).toBe(false)
    expect(sqliteSchemaMatches(2)).toBe(false)
    for (const table of SQLITE_TABLES) {
      expect(SQLITE_DDL.some((s) => s.includes('CREATE TABLE IF NOT EXISTS ' + table))).toBe(true)
    }
    expect(SQLITE_META_KEYS.schemaVersion).toBe('sqlite_schema_version')
  })
})
