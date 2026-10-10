/**
 * 阶段模型路由（REQ-261004110201-f253 FR-1）——纯函数：路由表校验 + 两级命中解析。
 *
 * 为什么在 domain：路由规则（哪个键优先、非法怎么判）是**规约**，与配置读取（fs/宿主）正交；
 * 抽成纯函数后可用冻参单测，不必搭真配置。
 *
 * 分层：domain 最内层，零 import（不引 shared）。难度入参收 `string`，
 * 与 shared 的 `PromptDifficulty`（simple/standard/advanced/expert）一致性由用例用真实枚举值锁死
 * （与 `domain/prompt/difficulty-mapping.ts` 同一纪律）。
 *
 * 命中顺序（**两级回落**，命中即返）：
 *   `'<stageKind>@<difficulty>'` → `'<stageKind>'` → undefined（不注入 = 现状行为）
 *
 * @module dsh-pmboard/domain/task/StageRouting
 */
import { STAGE_KINDS } from './SubtaskTemplate.js'

/** 一条路由：provider / model 至少一项非空才有意义（校验时强制）。 */
export interface StageModelRoute {
  provider?: string
  model?: string
}

/** 合法难度字面量（与 shared 的 PromptDifficulty 同值；一致性由用例锁）。 */
const ROUTING_DIFFICULTIES: readonly string[] = ['simple', 'standard', 'advanced', 'expert']

function bad(message: string): never {
  throw Object.assign(new Error(message), { code: 'REQBOARD_STAGE_ROUTING_INVALID' })
}

/** 非空字符串判定（trim 后）。 */
function nonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/**
 * 校验路由表（装配期调用：**非法即响亮抛错**，不静默忽略——宁可不启用，也不要"配了但不生效"）。
 *
 * 合法形状：
 *   · key = `<StageKind>` 或 `<StageKind>@<difficulty>`（difficulty ∈ simple/standard/advanced/expert）
 *   · value = 对象，且 `provider` / `model` 至少一项为非空字符串
 * 空对象（`{}` 或 undefined）合法 = 未配置路由（现状行为）。
 */
export function validateStageRouting(raw: unknown): Record<string, StageModelRoute> {
  if (raw === undefined || raw === null) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    bad('stageRouting 必须是对象（键 = 阶段名 或 阶段名@难度，值 = {provider?, model?}）')
  }
  const kinds = new Set<string>(STAGE_KINDS)
  const out: Record<string, StageModelRoute> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const [kind, difficulty, ...rest] = key.split('@')
    if (rest.length > 0) bad('stageRouting 键 ' + key + ' 非法：至多一个 @（形如 test@expert）')
    if (!kinds.has(String(kind))) {
      bad('stageRouting 键 ' + key + ' 的阶段名非法：' + String(kind) + '（合法值见 STAGE_KINDS）')
    }
    if (difficulty !== undefined && !ROUTING_DIFFICULTIES.includes(difficulty)) {
      bad('stageRouting 键 ' + key + ' 的难度非法：' + difficulty
        + '（合法值：' + ROUTING_DIFFICULTIES.join(' / ') + '）')
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      bad('stageRouting 键 ' + key + ' 的值必须是对象（{provider?, model?}）')
    }
    const v = value as Record<string, unknown>
    const unknownKeys = Object.keys(v).filter((k) => k !== 'provider' && k !== 'model')
    if (unknownKeys.length > 0) {
      bad('stageRouting 键 ' + key + ' 含未知字段：' + unknownKeys.join('、') + '（只认 provider / model）')
    }
    const provider = nonEmptyString(v.provider) ? v.provider.trim() : undefined
    const model = nonEmptyString(v.model) ? v.model.trim() : undefined
    if (v.provider !== undefined && provider === undefined) bad('stageRouting 键 ' + key + ' 的 provider 必须是非空字符串')
    if (v.model !== undefined && model === undefined) bad('stageRouting 键 ' + key + ' 的 model 必须是非空字符串')
    if (provider === undefined && model === undefined) {
      bad('stageRouting 键 ' + key + ' 至少要有一项（provider 或 model）非空——空值等于没配，请在表里删掉该键')
    }
    out[key] = { ...(provider !== undefined ? { provider } : {}), ...(model !== undefined ? { model } : {}) }
  }
  return out
}

/**
 * 两级命中解析：`<stageKind>@<difficulty>` 优先，其次 `<stageKind>`；
 * 都未命中 → undefined（调用方据此**不注入** = 现状行为）。
 */
export function resolveStageModel(
  stageKind: string,
  difficulty: string | undefined,
  routing: Record<string, StageModelRoute> | undefined,
): StageModelRoute | undefined {
  if (routing === undefined) return undefined
  if (difficulty !== undefined && difficulty.length > 0) {
    const qualified = routing[stageKind + '@' + difficulty]
    if (qualified !== undefined) return qualified
  }
  return routing[stageKind]
}
