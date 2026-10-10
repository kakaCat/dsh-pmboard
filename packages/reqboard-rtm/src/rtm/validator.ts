/**
 * 覆盖度门禁校验（REQ-260926140539-457b FR-9 / architecture.md）
 * + RTM 引用白名单与**宽容度**校验（REQ-261005105032-3b02 FR-11 / 决议 `#19`、data-model §6.4/§7）。
 *
 * 阈值单点定义：设计 100%、拆分/实施 100%、验收 ≥80%。
 * 不过门禁时 message 必须点名**缺哪一项**（可照着补），不得只报一个百分比。
 *
 * 新增两件事：
 *  - **编号白名单认原型锚点前缀**：`prototypes/x.html#FR-4` 是锚点引用（页面区块定位符），
 *    既不能算成 "FR-4 已被引用"（假引用会让覆盖度虚高），也不能被判成 dangling
 *    ——锚点形态本身合法，只是走**另一条通道**（详见 collectRTMPrototypeAnchors）。
 *  - **宽容度**：缺 `prototypes` / `decisions` / `task_coverage` 节 = `pending`（旧文件"未采集"），
 *    **不判损坏**；未知 key 一律忽略不报错（存量 66 条需求的 RTM 必须读得进、不炸）。
 *
 * @module @pi-investment/reqboard/rtm/validator
 */
import type { Coverage, GateResult } from './types.js'

/** 各节点覆盖度门禁阈值（百分比）。 */
export const GATE_THRESHOLDS: Readonly<Record<string, number>> = {
  design: 100,
  decomposing: 100,
  implementing: 100,
  accepting: 80,
}

/** 取节点阈值；未知节点默认 100。 */
export function thresholdFor(stage: string): number {
  return GATE_THRESHOLDS[stage] ?? 100
}

// ─────────────────────────────────────────────────────────────────────────────
// 编号白名单与引用形态（REQ-261005105032-3b02 FR-11 / 决议 #19、data-model §7）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 可引用编号白名单（**单一事实源**）。
 *
 * 为什么必须含 `D-\d+`：扩白名单前实测 `collectIds('D-1')` 返回 `[]`——裁定编号对校验器
 * 完全不可见，"每条 D-x 必须被引用"就无法机械核验（data-model §7.1）。`D-\d+` 与既有的
 * `D-[A-Z]+-\d+`（`D-ARCH-2` 形态）同处一条交替里互不吃掉：前者在 `-` 后遇字母即失败，
 * 由后者命中（§7.2）；两端 `\b` 保证 `D-1abc` 不被误伤。
 *
 * 与宿主 `src/application/internal/content-gates.ts` 的 `ID_PATTERN` **同源**：vendor/reqboard
 * 是独立可发布包，不得反向 import dsh-pmboard（模块边界见 context.ts），故此处逐字复刻同一
 * 正则；形态若漂移，两边的回归用例各自会红（本包见 tests/rtm-validator-tolerance.test.ts）。
 */
export const RTM_ID_PATTERN =
  '(?:FR|BUG|RF|SP|DOC|CH)-\\d+|D-[A-Z]+-\\d+|D-\\d+|(?:T|BE|FE|TC|E)-\\d+|t-[0-9a-f]{6}'

/** 原型锚点形态：`<路径>#FR-N`（决议 `#6` 的 strip 目标）。 */
export const RTM_PROTOTYPE_ANCHOR_PATTERN = '\\S+#FR-\\d+'

/** 锚点被替换后的固定 token（决议 `#6`：形态只有一处定义，便于断言与反查）。 */
export const RTM_PROTOTYPE_ANCHOR_TOKEN = '<proto-anchor>'

const ANCHOR_RE = new RegExp(RTM_PROTOTYPE_ANCHOR_PATTERN, 'g')
const ANCHOR_ONLY_RE = new RegExp(`^(?:${RTM_PROTOTYPE_ANCHOR_PATTERN})$`)
const ID_RE = new RegExp(`\\b(?:${RTM_ID_PATTERN})\\b`, 'g')
const DECISION_ID_RE = /^D-\d+$/

/**
 * 抽取**编号引用**（锚点先被抹掉）。
 *
 * 为什么必须先 strip：实测 `collectIds('prototypes/x.html#FR-4')` → `['FR-4']`，那是**假引用**
 * ——贴个锚点就刷出漂亮的覆盖度（§7.3 实测缺陷）。strip 后同一文本返回 `[]`。
 */
export function collectRTMIds(text: string): string[] {
  const stripped = text.replace(ANCHOR_RE, RTM_PROTOTYPE_ANCHOR_TOKEN)
  return [...new Set(stripped.match(ID_RE) ?? [])].sort()
}

/** 抽取**锚点引用原文**（单列通道，不与编号引用混算；§7.3）。 */
export function collectRTMPrototypeAnchors(text: string): string[] {
  return [...new Set(text.match(ANCHOR_RE) ?? [])].sort()
}

/**
 * 是否锚点形态（如 `prototypes/x.html#FR-4`）。
 *
 * 锚点是**合法引用形态**：它指向原型页面内的区块，解析权在原型门（prototype-gates）。
 * 校验器若不认这个前缀，正确的东西会被判成悬空（requirement.md 的痛点原话）。
 */
export function isRTMPrototypeAnchor(token: string): boolean {
  return ANCHOR_ONLY_RE.test(token)
}

/**
 * 判悬空引用。
 *
 * 口径：ref 是**已知编号**（在 `knownIds` 里）或**锚点形态** → 不悬空；
 * 其余（认不出的编号 / 写错的编号）→ 悬空并逐条点名。
 */
export function findDanglingRTMReferences(
  refs: readonly string[],
  knownIds: Iterable<string>,
): string[] {
  const known = new Set(knownIds)
  const dangling = new Set<string>()
  for (const ref of refs) {
    if (isRTMPrototypeAnchor(ref) || known.has(ref)) continue
    dangling.add(ref)
  }
  return [...dangling].sort()
}

/** 引用完整性裁决（不是阶段门禁，故不带覆盖率）。 */
export interface ReferenceCheckResult {
  /** 悬空引用（点名）；空 = 通过。 */
  dangling: string[]
  /** 锚点引用原文（单列统计：既不算编号引用，也不判悬空）。 */
  anchors: string[]
  passed: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// 新节宽容度（data-model §6.4 / 决议 #19）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * RTM 节的采集态。
 *
 * `pending` = **未采集**（旧文件没有这一节），**不判损坏**：存量 66 条需求的 RTM 不能被新
 * schema 判坏（兼容基线，决议 `#19`）。只有"节在、内容坏"才是 `error`。
 */
export type RTMSectionState = 'ok' | 'pending' | 'error'

/** 单节报告。 */
export interface RTMSectionReport {
  /** 节名（如 `outputs.prototypes`）。 */
  section: string
  state: RTMSectionState
  /** 损坏点名（`state === 'error'` 时非空）。`pending` 恒空——未采集不是错误。 */
  gaps: string[]
  /** 采集态说明（pending / 部分采集写这里，不占 `gaps`）。 */
  note?: string
}

/** 一个文件的宽容度报告。 */
export interface RTMToleranceReport {
  /** 无 `error` 即 true：`pending` 与未知 key 都不影响（前向兼容）。 */
  ok: boolean
  sections: RTMSectionReport[]
}

/** 宽容度校验的作用域（两份带新节的文件）。 */
export type RTMToleranceScope = 'brainstorming' | 'decomposing'

/** 安全取对象（非对象/数组/null → undefined；从不抛）。 */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

/** 安全取字符串数组（含非字符串元素即视为形状不对）。 */
function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.every(v => typeof v === 'string') ? (value as string[]) : undefined
}

/** 校验一条 `Prototype`（data-model §6.1）；返回损坏点名。 */
function prototypeEntryGaps(index: number, entry: unknown): string[] {
  const where = `prototypes[${index}]`
  const rec = asRecord(entry)
  if (rec === undefined) return [`${where} 不是对象`]
  const gaps: string[] = []
  const path = rec['path']
  if (typeof path !== 'string' || path.length === 0) gaps.push(`${where}.path 缺失或为空`)
  if (typeof rec['authoritative'] !== 'boolean') gaps.push(`${where}.authoritative 缺失或非布尔`)
  if (asStringArray(rec['serves']) === undefined) gaps.push(`${where}.serves 缺失或非字符串数组`)

  const anchors = rec['anchors']
  if (!Array.isArray(anchors)) {
    gaps.push(`${where}.anchors 缺失或非数组`)
  } else {
    anchors.forEach((a, i) => {
      const ar = asRecord(a)
      if (ar === undefined || typeof ar['fr'] !== 'string' || typeof ar['selector'] !== 'string') {
        gaps.push(`${where}.anchors[${i}] 缺 fr/selector`)
      }
    })
  }

  const geometry = rec['geometry']
  if (!Array.isArray(geometry)) {
    gaps.push(`${where}.geometry 缺失或非数组`)
  } else {
    geometry.forEach((g, i) => {
      const gr = asRecord(g)
      if (
        gr === undefined
        || typeof gr['name'] !== 'string'
        || typeof gr['value'] !== 'number'
        || typeof gr['unit'] !== 'string'
        || asRecord(gr['at']) === undefined
      ) {
        gaps.push(`${where}.geometry[${i}] 缺 name/value/unit/at`)
      }
    })
  }
  return gaps
}

/** 校验一条 `Decision`（data-model §6.2）；返回损坏点名。 */
function decisionEntryGaps(index: number, entry: unknown): string[] {
  const where = `decisions[${index}]`
  const rec = asRecord(entry)
  if (rec === undefined) return [`${where} 不是对象`]
  const gaps: string[] = []
  const id = rec['id']
  if (typeof id !== 'string' || !DECISION_ID_RE.test(id)) {
    gaps.push(`${where}.id 缺失或不是 D-<数字> 形态`)
  }
  for (const key of ['source', 'verdict', 'criterion'] as const) {
    const v = rec[key]
    if (typeof v !== 'string' || v.trim().length === 0) gaps.push(`${where}.${key} 缺失或为空`)
  }
  if (asStringArray(rec['serves']) === undefined) gaps.push(`${where}.serves 缺失或非字符串数组`)
  return gaps
}

/** 取一个节：缺 key → pending；在但形状不对 → error；数组 → 逐条校验条目。 */
function listSection(
  section: string,
  value: unknown,
  entryGaps: (index: number, entry: unknown) => string[],
): RTMSectionReport {
  if (value === undefined || value === null) {
    return { section, state: 'pending', gaps: [], note: `${section} 未采集（pending），不判损坏` }
  }
  if (!Array.isArray(value)) {
    return { section, state: 'error', gaps: [`${section} 不是数组`] }
  }
  const gaps: string[] = []
  value.forEach((entry, i) => gaps.push(...entryGaps(i, entry)))
  return gaps.length === 0 ? { section, state: 'ok', gaps: [] } : { section, state: 'error', gaps }
}

/**
 * 校验 `rtm-decomposing.yml` 的 `task_coverage[].covers_prototypes` / `covers_decisions`。
 *
 * 逐卡取值，故三态比 brainstorming 多一档：**没有任何卡采集该字段 = pending**（旧文件）；
 * 部分卡采集 = ok + note 点名未采集的卡（"未采集"不等于"坏"，但也不该静默）；
 * 采集了但不是数组 = error。
 */
function taskCoverageSection(section: string, field: string, root: unknown): RTMSectionReport {
  const taskCoverage = asRecord(root) === undefined ? undefined : asRecord(root)?.['task_coverage']
  if (taskCoverage === undefined || taskCoverage === null) {
    return { section, state: 'pending', gaps: [], note: `${section} 未采集（pending），不判损坏` }
  }
  if (!Array.isArray(taskCoverage)) {
    return { section, state: 'error', gaps: [`task_coverage 不是数组`] }
  }
  const gaps: string[] = []
  const absent: string[] = []
  let seen = 0
  taskCoverage.forEach((entry, i) => {
    const rec = asRecord(entry)
    if (rec === undefined) {
      gaps.push(`task_coverage[${i}] 不是对象`)
      return
    }
    const value = rec[field]
    if (value === undefined || value === null) {
      const id = rec['task_id']
      absent.push(typeof id === 'string' && id.length > 0 ? id : `task_coverage[${i}]`)
      return
    }
    seen += 1
    if (asStringArray(value) === undefined) gaps.push(`task_coverage[${i}].${field} 非字符串数组`)
  })
  if (gaps.length > 0) return { section, state: 'error', gaps }
  if (seen === 0 && absent.length > 0) {
    return { section, state: 'pending', gaps: [], note: `${section} 未采集（pending），不判损坏` }
  }
  if (absent.length > 0) {
    return {
      section,
      state: 'ok',
      gaps: [],
      note: `${section} 部分未采集（未采集的卡：${absent.join('、')}）`,
    }
  }
  return { section, state: 'ok', gaps: [] }
}

/**
 * 宽容度校验入口（**只读、不抛异常**）。
 *
 * 两条硬口径：
 *  - 缺节 = `pending`（未采集，不判损坏）——存量 RTM 的兼容基线（决议 `#19`）；
 *  - **未知 key 一律忽略**：本函数只按白名单取节名，多出来的键根本不参与判定（前向兼容）。
 *    这也是"存量 66 条读取不报错"的实现方式：不认识的东西不判、不猜、不炸。
 */
export function checkRTMSectionTolerance(
  data: unknown,
  scope: RTMToleranceScope,
): RTMToleranceReport {
  const root = asRecord(data)
  const outputs = root === undefined ? undefined : asRecord(root['outputs'])
  const sections = scope === 'brainstorming'
    ? [
        listSection('outputs.prototypes', outputs?.['prototypes'], prototypeEntryGaps),
        listSection('outputs.decisions', outputs?.['decisions'], decisionEntryGaps),
      ]
    : [
        taskCoverageSection('task_coverage[].covers_prototypes', 'covers_prototypes', root),
        taskCoverageSection('task_coverage[].covers_decisions', 'covers_decisions', root),
      ]
  return { ok: sections.every(s => s.state !== 'error'), sections }
}

/** 覆盖度门禁校验器。 */
export class RTMValidator {
  /** 设计/实施覆盖度校验（threshold 必填）。 */
  checkGate(stage: string, coverage: Coverage, threshold?: number): GateResult {
    const th = threshold ?? thresholdFor(stage)
    const passed = coverage.rate >= th
    if (passed) {
      return { passed: true, stage, coverage, threshold: th }
    }
    const missing = coverage.uncovered.length > 0
      ? coverage.uncovered.join('、')
      : `共 ${coverage.total} 项`
    return {
      passed: false,
      stage,
      coverage,
      threshold: th,
      message: `${stage} 覆盖度不足（${coverage.rate}% < ${th}%），缺少以下项：${missing}`,
    }
  }

  /** 设计门禁：所有 FR 必须有设计。 */
  checkDesign(coverage: Coverage): GateResult {
    return this.checkGate('design', coverage, GATE_THRESHOLDS.design)
  }

  /** 实施门禁：所有设计章节必须有任务。 */
  checkImplementation(coverage: Coverage): GateResult {
    return this.checkGate('decomposing', coverage, GATE_THRESHOLDS.decomposing)
  }

  /** 验收门禁：测试覆盖度 ≥80%。 */
  checkAcceptance(coverage: Coverage): GateResult {
    return this.checkGate('accepting', coverage, GATE_THRESHOLDS.accepting)
  }

  /**
   * 引用完整性：编号引用的悬空判定 + 锚点单列。
   *
   * 锚点（`prototypes/x.html#FR-4`）**永不悬空**——它指向原型页内区块，归属原型门判定；
   * 认不出的编号才逐条点名（FR-11 白名单口径）。
   */
  checkReferences(refs: readonly string[], knownIds: Iterable<string>): ReferenceCheckResult {
    const dangling = findDanglingRTMReferences(refs, knownIds)
    const anchors = refs.filter(isRTMPrototypeAnchor)
    return { dangling, anchors: [...new Set(anchors)].sort(), passed: dangling.length === 0 }
  }

  /** 宽容度：`rtm-brainstorming.yml` 的 `outputs.prototypes` / `outputs.decisions`。 */
  checkBrainstormingSections(data: unknown): RTMToleranceReport {
    return checkRTMSectionTolerance(data, 'brainstorming')
  }

  /** 宽容度：`rtm-decomposing.yml` 的 `task_coverage[].covers_prototypes` / `covers_decisions`。 */
  checkDecomposingSections(data: unknown): RTMToleranceReport {
    return checkRTMSectionTolerance(data, 'decomposing')
  }
}

/** 便捷单例。 */
export const rtmValidator = new RTMValidator()
