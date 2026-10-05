/**
 * 临时渲染脚本（不进正式测试集，跑完即删）：把四屏真实渲染结果导出成独立 HTML，
 * 供 headless Chrome 截图，与原型并排比对。
 */
import { it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { buildSettingsShell } from '../src/client/settings/render/shell.ts'
import { initialShellState, type SettingsShellState } from '../src/client/settings/model.ts'
import { SETTINGS_CSS } from '../src/client/styles/settings.ts'
import * as token from '../src/client/styles/token.ts'
import * as base from '../src/client/styles/base.ts'
import { WORKFLOW_STAGES } from '../src/client/workflow-constants.ts'
import type { StageKey, StageLimitView, StorageSettingsView, SystemRecordView } from '../src/client/settings/types.ts'

const TOKENS = (Object.values({ ...token, ...base }).filter((v) => typeof v === 'string') as string[]).join('\n')

function limits(): Readonly<Partial<Record<StageKey, StageLimitView>>> {
  const out: Partial<Record<StageKey, StageLimitView>> = {}
  const stages = Object.keys(WORKFLOW_STAGES) as StageKey[]
  const vals: Partial<Record<StageKey, { value: number; source: string }>> = {
    brainstorming: { value: 300, source: 'settings' },
    implementing: { value: 800, source: 'config' },
  }
  for (const k of stages) {
    const v = vals[k]
    out[k] = { value: v?.value ?? 1000, default: 1000, source: (v?.source ?? 'default') as StageLimitView['source'] }
  }
  return out
}

function storage(): StorageSettingsView {
  return {
    backend: { value: 'json', source: 'config' },
    sqlitePath: '/Users/mac/.dsh/reqboard.sqlite',
    effective: 'json',
    restartRequired: false,
  }
}

function record(): SystemRecordView {
  const now = Date.now()
  return {
    ok: true,
    exists: true,
    updatedAt: now - 60000,
    events: 6,
    active: 'json',
    plugin: { name: 'dsh-pmboard', version: '0.4.2', buildStamp: '8d03c8f413b9' },
    compat: { ok: true, ledgerSchemaVersion: 9, sqliteSchemaVersion: 9 },
    stores: {
      shards: { exists: true, requirements: 128, bytes: 512000, headRevision: 5454 },
      sqlite: { exists: true, requirements: 128, bytes: 430080, migratedAt: now - 3600000, stale: false, writtenBy: 'migrate-ledger-to-sqlite' },
    },
    droppedEvents: 0,
    droppedEventsTotal: 0,
    paths: {
      shardDataRoot: '/Users/mac/.dsh/reqboard',
      sqliteFile: '/Users/mac/.dsh/reqboard.sqlite',
      settingsFile: '/Users/mac/.dsh/dsh-reqboard-settings.json',
      legacyLedgerFile: '/Users/mac/.dsh/dsh-reqboard-ledger.json',
      backupDirs: ['/Users/mac/.dsh/backups/reqboard-20261004-1810'],
    },
    history: [
      { event: 'startup', at: now - 600000, plugin: 'dsh-pmboard@0.4.2' },
      { event: 'migration', at: now - 3600000, result: 'ok', requirements: 128, backupDir: '/Users/mac/.dsh/backups/reqboard-20261004-1000' },
      { event: 'backend-switched', at: now - 3500000, from: 'json', to: 'sqlite' },
      { event: 'startup', at: now - 300000, plugin: 'dsh-pmboard@0.4.2' },
      { event: 'backend-switched', at: now - 200000, from: 'sqlite', to: 'json' },
      { event: 'upgrade', at: now - 120000, from: '0.4.1', to: '0.4.2' },
    ],
  } as unknown as SystemRecordView
}

it('导出四屏渲染结果供截图', () => {
  const cases: [string, Partial<SettingsShellState>][] = [
    ['limits', { pane: 'limits', limits: limits() }],
    ['storage', { pane: 'storage', storage: storage(), sqliteExists: true, sqliteRequirements: 128 }],
    ['records', { pane: 'records', systemRecord: record(), systemFilePath: '/Users/mac/.dsh/dsh-reqboard-system.json' }],
    ['general', { pane: 'general', pluginVersion: '0.4.2', pluginBuildStamp: '8d03c8f413b9', settingsFileExists: true, settingsFilePath: '/Users/mac/.dsh/dsh-reqboard-settings.json' }],
    ['general-missing', { pane: 'general', pluginVersion: '0.4.2', pluginBuildStamp: '8d03c8f413b9', settingsFileExists: false, settingsFilePath: '/Users/mac/.dsh/dsh-reqboard-settings.json' }],
  ]
  for (const [name, over] of cases) {
    const state: SettingsShellState = { ...initialShellState(), open: true, ...over }
    const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>${TOKENS}</style>
<style>${SETTINGS_CSS}</style>
<style>html,body{margin:0;padding:0;background:var(--pm-bg,#1c1c1e);height:100%}
body{font-family:system-ui,-apple-system,"PingFang SC",sans-serif}
.cap{color:#8e8e93;font:12px/1.6 system-ui;padding:8px 14px}
</style></head>
<body><div class="cap">实现渲染（生产代码 + 真令牌）· 屏：${name}</div>${buildSettingsShell(state)}</body></html>`
    writeFileSync(`/tmp/impl-${name}.html`, html)
  }
  writeFileSync('/tmp/impl-tokens.css', TOKENS)
})
