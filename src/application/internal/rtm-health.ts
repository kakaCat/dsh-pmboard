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
// REQ-261008020617-088f RF-3：本模块的宿主 I/O **全部**经 HostFsPort（state 读写 + 文档/RTM 读取），
// application 侧不再 import node:fs / node:path —— 层门的 application/ 越界在这条链上归零。
import type { HostFsPort } from '../ports.js'
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

/**
 * 失败记录文件名（state 目录内）。
 *
 * **落点不由本模块拼**：`<root>/.dsh-data/state/<name>` 由 `HostFsPort` 决定——这条布局此前
 * 硬编码在 3 处 application 调用点，收进端口后才有一处可改契约（REQ-261008020617-088f RF-3）。
 */
export const RTM_FAILURES_FILE = 'rtm-failures.json'

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

/**
 * 读取失败记录（不存在 / 坏文件 / 非数组 → 空数组：读不回来不是主流程的事）。
 *
 * **刻意的行为变更（REQ-261008020617-088f RF-3，设计里已申报）**：搬迁前这里是
 * 「`writeFailures`：写临时文件 + 复制到正式文件（**不建目录**）」与
 * 「`writeJsonAtomic`：建目录 + 临时文件 + rename」两套原子写；合并到端口后统一为
 * 「按需建目录 + rename」一套。差异只落在两条边：① state 目录不存在时改前抛错（被调用方
 * try/catch 吞掉、证据丢失），改后正常落盘；② 改前 finally 里用 `require('fs')` 清临时文件
 * （ESM 下必抛）⇒ 残留 `.tmp-*`，改后由适配器用 unlinkSync 真清掉。键、文件名、2 空格缩进、
 * 「只保留最近 100 条」一律不变。
 */
function readFailures(host: HostFsPort, root: string): RTMFailureRecord[] {
  const data = host.readStateJson(root, RTM_FAILURES_FILE)
  return Array.isArray(data) ? (data as RTMFailureRecord[]) : []
}

/** 读取触发留痕（不存在 / 坏文件 / 非数组 → 空数组：留痕读不回来不是主流程的事）。 */
export function readRTMTriggerTraces(host: HostFsPort, root: string): RTMTriggerTrace[] {
  const data = host.readStateJson(root, RTM_TRIGGER_TRACES_FILE)
  return Array.isArray(data) ? (data as RTMTriggerTrace[]) : []
}

/**
 * 记录一次触发留痕（决议 #48）。写失败**照实抛**：调用方（`rtm-yaml`）在 try/catch 里用它——
 * "记不上留痕"绝不能改变 RTM 同步的结果（增强层纪律）。
 */
export function recordRTMTriggerTrace(
  host: HostFsPort,
  root: string,
  requirementId: string,
  trigger: RTMTrigger,
  paths: readonly string[],
): void {
  const traces = readRTMTriggerTraces(host, root)
  traces.push({
    requirement_id: requirementId,
    trigger,
    paths: [...paths],
    timestamp: Date.now(),
  })
  // 只保留最近 100 条（与失败记录同口径，避免状态文件无限增长）
  const sorted = traces.sort((a, b) => b.timestamp - a.timestamp)
  host.writeStateJsonAtomic(root, RTM_TRIGGER_TRACES_FILE, sorted.slice(0, 100))
}

/**
 * 记录一次 RTM 生成失败
 */
export function recordRTMFailure(
  host: HostFsPort,
  root: string,
  requirementId: string,
  trigger: RTMTrigger,
  error: string,
): void {
  const records = readFailures(host, root)
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
  host.writeStateJsonAtomic(root, RTM_FAILURES_FILE, sorted.slice(0, 100))
}

/**
 * 清除某个需求的失败记录（生成成功后调用）
 */
export function clearRTMFailure(host: HostFsPort, root: string, requirementId: string): void {
  const records = readFailures(host, root)
  const filtered = records.filter(r => r.requirement_id !== requirementId)
  if (filtered.length !== records.length) {
    host.writeStateJsonAtomic(root, RTM_FAILURES_FILE, filtered)
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
  /**
   * state 文件的根（缺省 = 传入的 `workspaceRoot`）。
   *
   * 为什么留这个口：**生产调用点一律同根**（state 与 docs 同属一个工作区），但既有测试里
   * 有把 state 隔离到临时目录、而 docs 指向仓库夹具的写法（`tests/compat-regression.test.ts`）。
   * 给它们一个显式的隔离出口，好过让端口悄悄去读真实工作区的 state。
   */
  stateRoot?: string
}

/**
 * 从 `requirement.md` front-matter 读端侧声明（`sides`）。为什么在这里读盘：`RequirementRecord`
 * 上**没有** `sides`（它只在需求文档 front-matter 里），而健康检查只拿到 `req`；解析一律走
 * `designDocPolicyFrom`——「什么算 UI 需求」全仓只此一份判据。读不回 / 畸形 → `[]`（不适用，
 * 宁可少报，不可把存量误报成不健康）。
 */
function sidesOf(host: HostFsPort, root: string, reqId: string): readonly string[] {
  const text = host.readText(root, reqRelPath(reqId, 'requirement.md'))
  if (text === undefined) return []
  try {
    return designDocPolicyFrom(parseDocument(text).frontmatter).sides
  } catch {
    return []
  }
}

/** 需求目录内某个文件的**工作区相对**路径（根由端口的 root 参数给）。 */
function reqRelPath(reqId: string, file: string): string {
  return 'docs/requirements/' + reqId + '/' + file
}

/** 检查 RTM 文件健康状态。 */
export function checkRTMHealth(
  host: HostFsPort,
  workspaceRoot: string,
  req: RequirementRecord,
  opts: CheckRTMHealthOptions = {},
): RTMHealthStatus {
  const expected = expectedRTMFiles(req.status)
  const missing: string[] = []

  for (const file of expected) {
    if (!host.exists(workspaceRoot, reqRelPath(req.id, file))) {
      missing.push(file)
    }
  }

  // 原型节适用性判据（决议 #19）：只判 applicability 命中的需求；存量在 verdict.exempted 里如实报告。
  const verdict = prototypeSectionVerdict({
    reqId: req.id,
    createdAt: req.createdAt,
    sides: sidesOf(host, workspaceRoot, req.id),
    brainstormingText: host.readText(workspaceRoot, reqRelPath(req.id, 'rtm-brainstorming.yml')),
    ...(opts.prototypeRulesSince !== undefined ? { rulesSince: opts.prototypeRulesSince } : {}),
  })

  const records = readFailures(host, opts.stateRoot ?? workspaceRoot)
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
