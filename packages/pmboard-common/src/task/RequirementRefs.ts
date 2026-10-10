/**
 * 需求条款引用（refs）的领域校验与规整（REQ-261002164800-d8f2 t1 / FR-2）。
 *
 * 为什么必须单独成模块（零 IO、零 import）：
 *   `requirement_refs` 这条通道此前**断在三处**——工具入参 schema 不收、`PlanTask` 没字段、
 *   `normalizePlanTasks` 按白名单丢弃。三处各写一份"什么算合法编号"必然漂移，
 *   故把判定收敛成一个纯函数，协议层与工具层都只调用它。
 *
 * 编号形态与需求文档的条款定义位（`doc-parse.DEF_LINE_RE`）保持同一套前缀——
 * 两处若不一致，就会出现"文档里认得的条款，卡上写不进去"的静默断层。
 *
 * @module dsh-pmboard/domain/task/RequirementRefs
 */

/** 合法条款前缀（与需求文档条款定义位一致：FR 功能 / BUG 缺陷 / RF 重构 / SP 调研 / DOC 文档 / CH 维护）。 */
export const REQUIREMENT_REF_PREFIXES = ['FR', 'BUG', 'RF', 'SP', 'DOC', 'CH'] as const

/** 单个条款编号形态：`FR-1` / `BUG-12` / `CH-3`（前缀大写、编号为十进制数字）。 */
export const REF_ID_RE = /^(?:FR|BUG|RF|SP|DOC|CH)-\d+$/

/** 非法 refs 的错误码（跨包可读：消息里也带一份，供纯文本通道识别）。 */
export const REQUIREMENT_REF_ERROR = 'REQBOARD_BAD_REQUIREMENT_REF'

/** 带错误码的 refs 校验错误（调用方按 `code` 分流；消息末尾附码，纯文本通道也能看见）。 */
export class RequirementRefError extends Error {
  readonly code: string = REQUIREMENT_REF_ERROR
  constructor(message: string) {
    super(message + '（' + REQUIREMENT_REF_ERROR + '）')
    this.name = 'RequirementRefError'
  }
}

/** 单个值的非法原因（undefined = 合法）。给"逐个点名"用，不抛错。 */
export function refInvalidReason(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return '不是字符串（' + describe(raw) + '）'
  const t = raw.trim()
  if (t.length === 0) return '是空串'
  if (!REF_ID_RE.test(t)) return '形态不合法（' + t + '）——合法形态如 FR-1 / BUG-2 / DOC-3'
  return undefined
}

/**
 * 规整 refs：去重 + 自然序（`FR-2` 排在 `FR-10` 前面，不是字典序）。
 *
 * 入参缺省（undefined / null）⇒ 空数组——存量台账没有该字段是**正常态**，不是错误。
 * 非数组 / 含非法项 ⇒ 抛 `RequirementRefError`，消息点明位置与那个非法值
 * （"哪张卡写错了什么"必须一眼可见，否则人只能猜）。
 */
export function normalizeRequirementRefs(raw: unknown, where = 'requirement_refs'): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    throw new RequirementRefError(where + ' 必须是字符串数组（收到 ' + describe(raw) + '）')
  }
  const out = new Set<string>()
  for (const item of raw) {
    const reason = refInvalidReason(item)
    if (reason !== undefined) {
      throw new RequirementRefError(where + ' 含非法项：' + reason)
    }
    out.add((item as string).trim())
  }
  return [...out].sort(compareRefIds)
}

/** 自然序比较：先按前缀字典序，再按编号数值（`FR-2` < `FR-10`）；同前缀同号由调用方去重保证唯一。 */
export function compareRefIds(a: string, b: string): number {
  const ma = /^([A-Z]+)-(\d+)$/.exec(a)
  const mb = /^([A-Z]+)-(\d+)$/.exec(b)
  if (ma !== null && mb !== null) {
    if (ma[1] !== mb[1]) return ma[1] < mb[1] ? -1 : 1
    return Number(ma[2]) - Number(mb[2])
  }
  return a < b ? -1 : a > b ? 1 : 0
}

/** 值的人读描述（错误消息里用；只描述形态，不回显任意长度内容）。 */
function describe(raw: unknown): string {
  if (raw === null) return 'null'
  if (Array.isArray(raw)) return '数组'
  if (typeof raw === 'object') return '对象'
  return typeof raw + ' ' + String(raw).slice(0, 40)
}
