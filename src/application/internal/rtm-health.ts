/**
 * RTM 健康检查与自动修复（修复：yaml 生成失败，下一次校验时提醒）
 * 
 * 功能：
 * 1. 记录 RTM 生成失败历史（state/rtm-failures.json）
 * 2. 根据需求状态校验应有的 RTM 文件
 * 3. 检测缺失并尝试自动修复
 * 4. 返回健康状态供 reqboard_status 展示
 * 5. 触发留痕（state/rtm-trigger-traces.json）：`submit:prototype` 本次带了哪些原型路径
 * 6. 原型节适用性判据（REQ-261005105032-3b02 FR-5 / 决议 #19）：UI 需求缺 `prototypes` 节 = 不健康并点名；
 *    早于规则上线日的存量一律 `exempted: legacy`
 * 
 * @module dsh-pmboard/application/internal/rtm-health
 */
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import type { RequirementRecord } from '../../shared/protocol.js'
// RTMTrigger 的定义在 vendor 生成器（rtm-yaml 只是 import 它、并未再导出），故从源头取类型。
import type { RTMTrigger } from '../../../vendor/reqboard/src/rtm/generator.js'
// 「什么算 UI 需求」全仓只有一份判据（`sides` 解析），直接复用，避免健康检查长出第二套真相。
import { designDocPolicyFrom } from './category-doc-sets.js'
import { parseDocument } from './doc-parse.js'

/** RTM 生成失败记录 */
export interface RTMFailureRecord {
  requirement_id: string
  trigger: RTMTrigger
  timestamp: number
  error: string
  /** 失败次数（连续失败累加） */
  attempts: number
}

/**
 * 原型规则上线日（§10 #19 的「插件配置常量，缺省 = 规则上线日」）。
 *
 * **早于此刻创建**的需求（含本需求自身）视为存量 ⇒ `exempted: legacy`，不因缺 `prototypes` 节被判
 * 不健康（brief #29：规则生效前不追溯）。取 2026-10-06 00:00 UTC = 规则交付后的第一个自然日。
 * 为什么是常量而不是读配置：`plugin-config.ts` 不在本卡范围内；组合根要覆盖时经
 * `checkRTMHealth(..., { prototypeRulesSince })` 传入（单点、可注入、可测）。
 */
export const PROTOTYPE_RULES_SINCE = Date.parse('2026-10-06T00:00:00.000Z')

/** RTM 健康状态 */
export interface RTMHealthStatus {
  /** 是否健康（所有应有的文件都存在，且适用的原型节不缺口） */
  healthy: boolean
  /** 缺失的 RTM 文件 */
  missing_files: string[]
  /**
   * 存量豁免标记（决议 #19）：`createdAt < prototypeRulesSince` 的 UI 需求一律 `legacy`，
   * 如实报告但**不判不健康**。不适用时**省略该键**（理由同 `last_failure`：own property 的
   * `undefined` 会被宿主绑定层的 lossless 校验拦下）。
   */
  exempted?: 'legacy'
  /** 按适用性判据点名的缺口（缺什么 / 在哪 / 怎么补）；空则省略该键。 */
  gaps?: string[]
  /** 最近一次失败记录 */
  last_failure?: {
    trigger: string
    error: string
    timestamp: number
    attempts: number
  }
  /** 是否可以重试修复 */
  retry_available: boolean
}

/** 失败记录文件路径 */
function failuresFilePath(stateDir: string): string {
  return join(stateDir, 'rtm-failures.json')
}

/** 触发留痕文件名（`state/rtm-trigger-traces.json`）。 */
export const RTM_TRIGGER_TRACES_FILE = 'rtm-trigger-traces.json'

/**
 * 一次 RTM 触发的留痕（决议 #48）：`paths` 载荷**只用于增量刷新与留痕**，台账仍是生成器的事实源；
 * 留痕回答的是另一个问题——「这一次登记动作带了哪些路径」。
 */
export interface RTMTriggerTrace {
  requirement_id: string
  trigger: RTMTrigger
  /** 本次携带的原型路径（原样记录，不做归一/去重——留痕只如实记，不替调用方整理）。 */
  paths: string[]
  timestamp: number
}

/** 读取失败记录 */
function readFailures(stateDir: string): RTMFailureRecord[] {
  const path = failuresFilePath(stateDir)
  if (!existsSync(path)) return []
  try {
    const content = readFileSync(path, 'utf-8')
    const data = JSON.parse(content)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/** 写入失败记录（原子写入） */
function writeFailures(stateDir: string, records: RTMFailureRecord[]): void {
  const path = failuresFilePath(stateDir)
  const tmp = path + '.tmp-' + process.pid + '-' + Date.now()
  try {
    writeFileSync(tmp, JSON.stringify(records, null, 2), 'utf-8')
    writeFileSync(path, readFileSync(tmp))
  } finally {
    if (existsSync(tmp)) {
      try { 
        const fs = require('fs')
        fs.unlinkSync(tmp) 
      } catch {}
    }
  }
}

/**
 * 原子写 JSON 状态文件（临时文件 + rename）。与 `writeFailures` 的差别：这里**按需建目录**——
 * 留痕是旁路写入，不该因为 state 目录还没被别的写者建出来而丢掉证据。
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp-' + process.pid + '-' + Date.now()
  try {
    writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
    renameSync(tmp, filePath)
  } catch (err) {
    if (existsSync(tmp)) {
      try { unlinkSync(tmp) } catch { /* 清理失败不覆盖主错误 */ }
    }
    throw err
  }
}

/** 读取触发留痕（不存在 / 坏文件 → 空数组：留痕读不回来不是主流程的事）。 */
export function readRTMTriggerTraces(stateDir: string): RTMTriggerTrace[] {
  const path = join(stateDir, RTM_TRIGGER_TRACES_FILE)
  if (!existsSync(path)) return []
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'))
    return Array.isArray(data) ? data as RTMTriggerTrace[] : []
  } catch {
    return []
  }
}

/**
 * 记录一次触发留痕（决议 #48）。写失败**照实抛**：调用方（`rtm-yaml`）在 try/catch 里用它——
 * "记不上留痕"绝不能改变 RTM 同步的结果（增强层纪律）。
 */
export function recordRTMTriggerTrace(
  stateDir: string,
  requirementId: string,
  trigger: RTMTrigger,
  paths: readonly string[],
): void {
  const traces = readRTMTriggerTraces(stateDir)
  traces.push({
    requirement_id: requirementId,
    trigger,
    paths: [...paths],
    timestamp: Date.now(),
  })
  // 只保留最近 100 条（与失败记录同口径，避免状态文件无限增长）
  const sorted = traces.sort((a, b) => b.timestamp - a.timestamp)
  writeJsonAtomic(join(stateDir, RTM_TRIGGER_TRACES_FILE), sorted.slice(0, 100))
}

/**
 * 记录一次 RTM 生成失败
 */
export function recordRTMFailure(
  stateDir: string,
  requirementId: string,
  trigger: RTMTrigger,
  error: string,
): void {
  const records = readFailures(stateDir)
  const existing = records.find(r => r.requirement_id === requirementId)
  
  if (existing) {
    // 更新已有记录
    existing.trigger = trigger
    existing.timestamp = Date.now()
    existing.error = error
    existing.attempts += 1
  } else {
    // 新增记录
    records.push({
      requirement_id: requirementId,
      trigger,
      timestamp: Date.now(),
      error,
      attempts: 1,
    })
  }
  
  // 只保留最近 100 条
  const sorted = records.sort((a, b) => b.timestamp - a.timestamp)
  writeFailures(stateDir, sorted.slice(0, 100))
}

/**
 * 清除某个需求的失败记录（生成成功后调用）
 */
export function clearRTMFailure(stateDir: string, requirementId: string): void {
  const records = readFailures(stateDir)
  const filtered = records.filter(r => r.requirement_id !== requirementId)
  if (filtered.length !== records.length) {
    writeFailures(stateDir, filtered)
  }
}

/**
 * 根据需求状态判断应该有哪些 RTM 文件
 */
export function expectedRTMFiles(status: string): string[] {
  const files: string[] = []
  
  // rtm-lifecycle.yml 在立项后就应该有
  if (status !== 'draft') {
    files.push('rtm-lifecycle.yml')
  }
  
  // rtm-brainstorming.yml 在提交需求文档后有
  if (['brainstorming', 'design', 'decomposing', 'implementing', 'accepting', 'archived', 'done'].includes(status)) {
    files.push('rtm-brainstorming.yml')
  }
  
  // rtm-design.yml 在提交设计文档后有
  if (['design', 'decomposing', 'implementing', 'accepting', 'archived', 'done'].includes(status)) {
    files.push('rtm-design.yml')
  }
  
  // rtm-decomposing.yml 在批准拆分计划后有
  if (['decomposing', 'implementing', 'accepting', 'archived', 'done'].includes(status)) {
    files.push('rtm-decomposing.yml')
  }
  
  // rtm-implementing.yml 在批准拆分计划后有
  if (['implementing', 'accepting', 'archived', 'done'].includes(status)) {
    files.push('rtm-implementing.yml')
  }
  
  // rtm-accepting.yml 在提交验收材料后有
  if (['accepting', 'archived', 'done'].includes(status)) {
    files.push('rtm-accepting.yml')
  }
  
  return files
}

/**
 * `rtm-brainstorming.yml` 是否已有 `outputs.prototypes` 节（FR-5 / 决议 #19）。
 *
 * 三态：`true` 有节 / `false` 确定缺节 / `undefined` **判不了**（文件不在、读不回、解析失败）。
 * 为什么解析失败回 `undefined` 而不是 `false`：按 brief §5 的宽容度，只对**确定缺节**点名——
 * 存量坏文件不该被误报，缺文件由 `missing_files` 负责（不重复点名）。
 */
export function prototypesSectionPresent(text: string | undefined): boolean | undefined {
  if (text === undefined) return undefined
  let doc: unknown
  try {
    doc = parseYaml(text)
  } catch {
    return undefined
  }
  if (doc === null || typeof doc !== 'object') return undefined
  const outputs = (doc as { outputs?: unknown }).outputs
  if (outputs === null || typeof outputs !== 'object') return false
  return Object.prototype.hasOwnProperty.call(outputs, 'prototypes')
}

/** 原型节适用性判定结果（决议 #19）。 */
export interface PrototypeSectionVerdict {
  /** 该需求是否**被要求**有 `prototypes` 节（sides 含 frontend 且非存量豁免）。 */
  required: boolean
  /** 存量豁免标记：`createdAt < prototypeRulesSince` 的 UI 需求，如实报告但不判不健康。 */
  exempted?: 'legacy'
  /** 点名清单（仅"确定缺节"时非空）；每条都写清缺什么 / 在哪 / 怎么补。 */
  gaps: string[]
}

/**
 * 原型节**适用性判据**（决议 #19 / brief §5）。纯函数：sides 与文件文本由调用方取好传入。
 *
 * 三层判定（顺序即优先级）：① sides 不含 frontend → 不适用，也不谈豁免；
 * ② `createdAt < rulesSince` → `exempted: 'legacy'`（如实报告、不判不健康、不追溯存量）；
 * ③ 其余：**确定**缺节才点名；判不了 / 有节 → 不点名。
 */
export function prototypeSectionVerdict(input: {
  reqId: string
  createdAt: number
  sides: readonly string[]
  brainstormingText: string | undefined
  /** 规则上线日（毫秒）；缺省 = 插件配置常量 {@link PROTOTYPE_RULES_SINCE}。 */
  rulesSince?: number
}): PrototypeSectionVerdict {
  if (!input.sides.includes('frontend')) return { required: false, gaps: [] }
  const rulesSince = input.rulesSince ?? PROTOTYPE_RULES_SINCE
  if (!(input.createdAt >= rulesSince)) return { required: false, exempted: 'legacy', gaps: [] }
  const present = prototypesSectionPresent(input.brainstormingText)
  if (present !== false) return { required: true, gaps: [] }
  const fix = '；补齐：登记原型后刷新 RTM（reqboard_submit(kind=prototype)），或按原型存在门的命令补齐后重跑该触发点'
  return {
    required: true,
    gaps: [input.reqId + ' 的 rtm-brainstorming.yml 缺 outputs.prototypes 节：UI 需求（sides 含 frontend）的原型未进追溯链，覆盖度会静默虚高' + fix],
  }
}

/** `checkRTMHealth` 的可注入项（组合根可覆盖插件配置缺省值）。 */
export interface CheckRTMHealthOptions {
  /** 原型规则上线日（毫秒，§10 #19）；缺省 = {@link PROTOTYPE_RULES_SINCE}。 */
  prototypeRulesSince?: number
}

/**
 * 从 `requirement.md` front-matter 读端侧声明（`sides`）。为什么在这里读盘：`RequirementRecord`
 * 上**没有** `sides`（它只在需求文档 front-matter 里），而健康检查只拿到 `req`；解析一律走
 * `designDocPolicyFrom`——「什么算 UI 需求」全仓只此一份判据。读不回 / 畸形 → `[]`（不适用，
 * 宁可少报，不可把存量误报成不健康）。
 */
function sidesOf(workspaceRoot: string, reqId: string): readonly string[] {
  const path = join(workspaceRoot, 'docs', 'requirements', reqId, 'requirement.md')
  try {
    if (!existsSync(path)) return []
    return designDocPolicyFrom(parseDocument(readFileSync(path, 'utf-8')).frontmatter).sides
  } catch {
    return []
  }
}

/** 读文本；文件不在 / 读失败 → `undefined`（调用方按"判不了"处理，不按"缺"处理）。 */
function readTextIfExists(path: string): string | undefined {
  try {
    return existsSync(path) ? readFileSync(path, 'utf-8') : undefined
  } catch {
    return undefined
  }
}

/** 检查 RTM 文件健康状态。 */
export function checkRTMHealth(
  workspaceRoot: string,
  stateDir: string,
  req: RequirementRecord,
  opts: CheckRTMHealthOptions = {},
): RTMHealthStatus {
  const reqDir = join(workspaceRoot, 'docs', 'requirements', req.id)
  const expected = expectedRTMFiles(req.status)
  const missing: string[] = []
  
  for (const file of expected) {
    const path = join(reqDir, file)
    if (!existsSync(path)) {
      missing.push(file)
    }
  }

  // 原型节适用性判据（决议 #19）：只判 applicability 命中的需求；存量在 verdict.exempted 里如实报告。
  const verdict = prototypeSectionVerdict({
    reqId: req.id,
    createdAt: req.createdAt,
    sides: sidesOf(workspaceRoot, req.id),
    brainstormingText: readTextIfExists(join(reqDir, 'rtm-brainstorming.yml')),
    ...(opts.prototypeRulesSince !== undefined ? { rulesSince: opts.prototypeRulesSince } : {}),
  })

  const records = readFailures(stateDir)
  const lastFailure = records.find(r => r.requirement_id === req.id)
  
  // FR-10（REQ-260927100007-b8ba）：无失败记录时**省略**该键，不能写 last_failure: undefined——
  // 那是 own property，JSON.stringify 会静默丢掉，但 PTC 绑定层的 lossless 校验会拦下，
  // 使已绑定窗口的 reqboard_status **必然**报 returned invalid output（实测现状）。
  // 同理：exempted / gaps 也只在有值时出现。
  return {
    healthy: missing.length === 0 && verdict.gaps.length === 0,
    missing_files: missing,
    ...(verdict.exempted !== undefined ? { exempted: verdict.exempted } : {}),
    ...(verdict.gaps.length > 0 ? { gaps: verdict.gaps } : {}),
    ...(lastFailure !== undefined
      ? { last_failure: { trigger: lastFailure.trigger, error: lastFailure.error, timestamp: lastFailure.timestamp, attempts: lastFailure.attempts } }
      : {}),
    retry_available: missing.length > 0 && (!lastFailure || lastFailure.attempts < 3),
  }
}
