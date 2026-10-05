/**
 * 运行设置解析（REQ-261004103330-005f FR-1 / FR-2 / FR-6）——**纯函数、零 IO**。
 *
 * 为什么必须是纯函数：解析链要被单测、被路由、被装配期同时使用；任何一处 import fs
 * 都会把 I/O 带进 application（`tests/layer-boundary.test.ts` 禁止 `node:` 进本层）。
 * 读盘与写盘在 `adapters/FileSettingsStore`。
 *
 * ## 四级来源：**逐项**判定，不是整份覆盖
 *
 *   设置文件 > 插件配置 > 环境变量 > 内置默认
 *
 * 为什么逐项：把「部署时给的默认值」与「人后来改过这一项」分开记，看板才能显示**当前来源**，
 * 也才能回答「这个 800 是人设的还是配置里带的」。整份覆盖会让这个问题永远答不出来。
 *
 * ## 默认值只有一个来源
 *
 * 阶段上限的内置默认来自 `dive/stage-configs.ts` 的 `STAGE_CONFIGS`——本文件**不复制**那张表，
 * 只引用。复制一份就会漂移（本仓的"第二份真相"老毛病）。
 *
 * @module dsh-pmboard/application/settings/resolve-settings
 */

import type { RequirementStatus } from '../../shared/protocol.js'
import { ALL_REQ_STATUSES } from '../../shared/protocol.js'
import { STAGE_CONFIGS } from '../dive/stage-configs.js'
import { LIMITS } from '../../domain/limits.js'

/** 存储后端枚举（FR-6）。 */
export type StorageBackend = 'json' | 'sqlite'

/** 单项生效值的来源（看板据此显示徽章）。 */
export type SettingsSource = 'settings' | 'config' | 'env' | 'default'

/** 设置文件形态（`<dshHome>/dsh-reqboard-settings.json`）。字段全部可选——惰性创建。 */
export interface RunSettingsFileV1 {
  schemaVersion?: number
  stageMaxRounds?: Partial<Record<RequirementStatus, number>>
  storage?: { backend?: StorageBackend; sqlitePath?: string }
  updatedAt?: string
}

/** 插件配置里与本需求相关的子集（结构兼容 `PluginConfig`，刻意不 import 它避免反向依赖）。 */
export interface RunSettingsConfigInput {
  stageMaxRounds?: Partial<Record<RequirementStatus, number>>
  storage?: { backend?: StorageBackend; sqlitePath?: string }
}

/** 单项阶段上限的生效形状。 */
export interface StageLimitSetting {
  value: number
  default: number
  source: SettingsSource
}

/** 存储后端的生效形状。`effective` 是本进程**实际**在用的；与 `value` 不同即「待重启生效」。 */
export interface ResolvedStorage {
  backend: { value: StorageBackend; source: SettingsSource }
  sqlitePath: string
  effective: StorageBackend
  restartRequired: boolean
}

/** 一项被作废的原因（不阻断整体；逐项如实报出）。 */
export interface SettingsProblem {
  key: string
  reason: string
  fellBackTo: string
}

export interface ResolvedRunSettings {
  stageMaxRounds: Record<RequirementStatus, StageLimitSetting>
  storage: ResolvedStorage
  problems: readonly SettingsProblem[]
}

export interface RunSettingsInput {
  file?: RunSettingsFileV1
  config?: RunSettingsConfigInput
  env?: Record<string, string | undefined>
  /** 把相对 `sqlitePath` 解析成绝对路径用；缺省则保持相对（由调用方解析）。 */
  dshHome?: string
  /** 本进程实际在用的后端（算 `effective` / `restartRequired`）；缺省 = 与目标一致。 */
  currentBackend?: StorageBackend
}

/** PATCH 接受的形状：**刻意不含** `storage.backend`（后端切换必须走确认门，见 FR-11）。 */
export interface RunSettingsPatch {
  stageMaxRounds?: Partial<Record<RequirementStatus, number>>
  storage?: { sqlitePath?: string }
}

/** 环境变量名（唯一一处定义）。 */
export const ENV_STORAGE = 'PMBOARD_STORAGE'
export const ENV_STAGE_MAX_ROUNDS = 'PMBOARD_STAGE_MAX_ROUNDS'

/** 设置文件的默认文件名（`dshHome` 下）。 */
export const SETTINGS_FILE_REL = 'dsh-reqboard-settings.json'

/** 阶段上限的非法原因（`undefined` = 合法）。越界**不钳值**——静默钳值会让人以为改生效了。 */
export function stageLimitInvalidReason(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '需为数字'
  if (!Number.isInteger(value)) return '需为整数'
  if (value < LIMITS.stageMaxRoundsMin) return '不得小于 ' + String(LIMITS.stageMaxRoundsMin)
  if (value > LIMITS.stageMaxRoundsMax) return '不得大于 ' + String(LIMITS.stageMaxRoundsMax)
  return undefined
}

/** 阶段上限的人话范围（消息复用，避免两处各写一份）。 */
export function stageLimitRangeText(): string {
  return String(LIMITS.stageMaxRoundsMin) + '–' + String(LIMITS.stageMaxRoundsMax) + ' 的整数'
}

function isBackend(v: unknown): v is StorageBackend {
  return v === 'json' || v === 'sqlite'
}

/** 环境变量里某个阶段项非法（结构化返回；**回落说明留到最终判定处再写**）。 */
export interface EnvStageRejection {
  stage: RequirementStatus
  reason: string
  raw: string
}

/**
 * 解析 `PMBOARD_STAGE_MAX_ROUNDS`（形如 `implementing=200,design=50`）。
 *
 * 分两类返回，**刻意不在这里写 `fellBackTo`**：
 *   · `problems` = 结构性问题（未知阶段 / 缺阶段名）——此刻就能定论；
 *   · `invalid`  = 某个阶段值非法——此刻还不知道最终会落到哪个来源（可能落到插件配置），
 *     由 `resolveRunSettings` 在**能算出最终值之后**诚实地写"回落到了谁"。
 * 为什么较真：回落说明写错比不写更坏——它会让人以为"我用的是内置默认"，实际用的是插件配置。
 */
export function parseStageRoundsEnv(raw: string | undefined): {
  values: Partial<Record<RequirementStatus, number>>
  invalid: EnvStageRejection[]
  problems: SettingsProblem[]
} {
  const values: Partial<Record<RequirementStatus, number>> = {}
  const invalid: EnvStageRejection[] = []
  const problems: SettingsProblem[] = []
  if (raw === undefined || raw.trim().length === 0) return { values, invalid, problems }
  const known = new Set<string>(ALL_REQ_STATUSES)
  for (const piece of raw.split(',')) {
    const item = piece.trim()
    if (item.length === 0) continue
    const eq = item.indexOf('=')
    const key = eq > 0 ? item.slice(0, eq).trim() : ''
    const numText = eq > 0 ? item.slice(eq + 1).trim() : ''
    if (key.length === 0) {
      problems.push({ key: ENV_STAGE_MAX_ROUNDS, reason: '条目缺少阶段名（形如 implementing=200）', fellBackTo: '内置默认' })
      continue
    }
    if (!known.has(key)) {
      problems.push({ key: 'stageMaxRounds.' + key, reason: '未知阶段', fellBackTo: '忽略该键' })
      continue
    }
    const num = Number(numText)
    const bad = stageLimitInvalidReason(num)
    if (bad !== undefined) {
      invalid.push({ stage: key as RequirementStatus, reason: bad, raw: numText })
      continue
    }
    values[key as RequirementStatus] = num
  }
  return { values, invalid, problems }
}

/** 组装存储后端的默认路径：给 dshHome 就拼绝对路径，否则保持相对。 */
function defaultSqlitePath(dshHome: string | undefined): string {
  const name = 'reqboard.sqlite'
  if (dshHome === undefined || dshHome.length === 0) return name
  return dshHome.replace(/[/\\]+$/, '') + '/' + name
}

/**
 * 解析生效设置：逐项按四级来源取值 + 校验 + 标注来源。
 *
 * 不抛错：非法项**逐项作废**并进 `problems`（一份文件里一个键写坏，不该让整份设置失效）。
 * 唯一的整体作废：`schemaVersion` 不是 `1`——格式未知时按新格式猜读比回落更危险。
 */
export function resolveRunSettings(input: RunSettingsInput = {}): ResolvedRunSettings {
  const problems: SettingsProblem[] = []
  const env = input.env ?? {}

  let file = input.file
  if (file !== undefined && file.schemaVersion !== undefined && file.schemaVersion !== 1) {
    problems.push({
      key: 'schemaVersion',
      reason: '未知的设置文件版本 ' + String(file.schemaVersion) + '（只认 1）',
      fellBackTo: '整份按内置默认生效',
    })
    file = undefined
  }

  const envRounds = parseStageRoundsEnv(env[ENV_STAGE_MAX_ROUNDS])
  problems.push(...envRounds.problems)
  const envInvalid = new Map(envRounds.invalid.map((i) => [i.stage, i]))

  const known = new Set<string>(ALL_REQ_STATUSES)
  for (const [key, value] of Object.entries(file?.stageMaxRounds ?? {})) {
    if (known.has(key)) continue
    problems.push({ key: 'stageMaxRounds.' + key, reason: '未知阶段', fellBackTo: '忽略该键' })
    void value
  }

  const stageMaxRounds = {} as Record<RequirementStatus, StageLimitSetting>
  for (const status of ALL_REQ_STATUSES) {
    const fallback = STAGE_CONFIGS[status].maxRounds
    const candidates: Array<{ source: SettingsSource; raw: unknown }> = [
      { source: 'settings', raw: file?.stageMaxRounds?.[status] },
      { source: 'config', raw: input.config?.stageMaxRounds?.[status] },
      { source: 'env', raw: envRounds.values[status] },
    ]
    // 非法值 = **该项作废**（当作没写），继续沿链往下找——不是整份回落到内置默认。
    // 为什么：链上下一级往往是有效的（部署方在插件配置里给了 700），丢掉它等于把
    // "部署意图"也一起作废；且看板的「当前来源」徽章会如实说明最终用的是谁。
    const rejected: string[] = []
    let picked: { source: SettingsSource; value: number } | undefined
    for (const c of candidates) {
      if (c.raw === undefined) continue
      const bad = stageLimitInvalidReason(c.raw)
      if (bad !== undefined) {
        rejected.push(bad + '（' + c.source + ' 里是 ' + JSON.stringify(c.raw) + '）')
        continue
      }
      picked = { source: c.source, value: c.raw as number }
      break
    }
    // env 里的非法项排在同一阶段的问题序列末尾（顺序与判定链一致：settings → config → env）
    const envBad = envInvalid.get(status)
    if (envBad !== undefined) {
      rejected.push(envBad.reason + '（env 里是 ' + JSON.stringify(envBad.raw) + '）')
    }
    if (picked === undefined) {
      for (const reason of rejected) {
        problems.push({ key: 'stageMaxRounds.' + status, reason, fellBackTo: '内置默认 ' + String(fallback) })
      }
      stageMaxRounds[status] = { value: fallback, default: fallback, source: 'default' }
      continue
    }
    for (const reason of rejected) {
      problems.push({
        key: 'stageMaxRounds.' + status,
        reason,
        fellBackTo: picked.source + ' = ' + String(picked.value),
      })
    }
    stageMaxRounds[status] = { value: picked.value, default: fallback, source: picked.source }
  }

  // 后端同样"非法即作废、继续沿链往下找"，最后才落内置默认 json（口径与上限一致）。
  let backend: ResolvedStorage['backend'] = { value: 'json', source: 'default' }
  const backendCandidates: Array<{ source: SettingsSource; raw: unknown }> = [
    { source: 'settings', raw: file?.storage?.backend },
    { source: 'config', raw: input.config?.storage?.backend },
    { source: 'env', raw: env[ENV_STORAGE] },
  ]
  for (const c of backendCandidates) {
    if (c.raw === undefined) continue
    if (isBackend(c.raw)) {
      backend = { value: c.raw, source: c.source }
      break
    }
    problems.push({
      key: 'storage.backend',
      reason: '只接受 json / sqlite（' + c.source + ' 里是 ' + JSON.stringify(c.raw) + '）',
      fellBackTo: '继续沿链往下找，最终未命中则 json',
    })
  }

  const pathText = file?.storage?.sqlitePath ?? input.config?.storage?.sqlitePath
  const sqlitePath = typeof pathText === 'string' && pathText.length > 0
    ? pathText
    : defaultSqlitePath(input.dshHome)

  const effective = input.currentBackend ?? backend.value
  return {
    stageMaxRounds,
    storage: { backend, sqlitePath, effective, restartRequired: effective !== backend.value },
    problems,
  }
}

/** PATCH 的逐项校验（路由层用它凑 400 消息；与解析链共用同一份判据）。 */
export function validateRunSettingsPatch(patch: RunSettingsPatch): SettingsProblem[] {
  const problems: SettingsProblem[] = []
  for (const [status, value] of Object.entries(patch.stageMaxRounds ?? {})) {
    if (!ALL_REQ_STATUSES.includes(status as RequirementStatus)) {
      problems.push({ key: 'stageMaxRounds.' + status, reason: '未知阶段', fellBackTo: '忽略该键' })
      continue
    }
    const bad = stageLimitInvalidReason(value)
    if (bad !== undefined) {
      problems.push({ key: 'stageMaxRounds.' + status, reason: bad, fellBackTo: '不改动' })
    }
  }
  const p = patch.storage?.sqlitePath
  if (p !== undefined && (typeof p !== 'string' || p.trim().length === 0)) {
    problems.push({ key: 'storage.sqlitePath', reason: '需为非空字符串', fellBackTo: '不改动' })
  }
  return problems
}
