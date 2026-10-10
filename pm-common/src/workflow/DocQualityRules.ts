/**
 * 文档质量规则的**适用起点**（2026-10-06 加固：条款判据软门禁 / sides 硬门禁）。
 *
 * 为什么需要它：本仓「门禁上线」与「存量不追溯」是两条同时成立的纪律——
 * 新规则不该让**在规则生效前就已立项**的需求突然卡住（那是把系统债转嫁给当时的人），
 * 但**生效后**新立的每条需求都必须吃到。判据只有一处（本常量），
 * 调用点按 `RequirementRecord.createdAt` 比大小，不各自写一个日期。
 *
 * 与 `PROTOTYPE_RULES_SINCE`（rtm-health）同构同理由：那边管「UI 需求的 RTM 原型节」，
 * 这边管「条款判据 / sides 声明」；两个起点刻意都是**常量而非配置**——
 * 配置化会让"这条需求吃不吃新门"变成每次都要读一遍的运行时问题。
 *
 * 取 2026-10-06 12:00 UTC：加固当天（本仓最后一条被审计的需求 261006130057 早于此，
 * 故不追溯）；此后新立的需求一律适用。
 *
 * @module dsh-pmboard/domain/workflow/DocQualityRules
 */

/** 文档质量规则上线时刻（毫秒）；`createdAt` 早于它 = 存量，不判新门。 */
export const DOC_QUALITY_RULES_SINCE = Date.parse('2026-10-06T12:00:00.000Z')

/**
 * 该需求是否适用新文档质量规则。
 *
 * `createdAt` 不可得（旧台账记录 / 测试夹具）→ **false**（不判）：
 * 读数不可得时不判是既有口径（宁可少报，也不把存量误报成违规）。
 */
export function docQualityRulesApply(createdAt: number | undefined): boolean {
  return createdAt !== undefined && createdAt >= DOC_QUALITY_RULES_SINCE
}
