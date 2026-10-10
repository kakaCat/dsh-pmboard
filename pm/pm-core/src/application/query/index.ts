/**
 * application/query 出口（REQ-47939a t6）：3 个只读投影。
 * @module dsh-pmboard/application/query
 */
export * from './QueryState.js'
export * from './QueryStageDetail.js'
export * from './QueryStageOverview.js'
// 详情页六查询的契约（REQ-261004222448-292a t-361f2f）：只有形状，实现由后续卡填。
export * from './contracts.js'
// 详情页六查询的实现（REQ-261004222448-292a t-43fcf4 / t-8eeed9 / t-242dd9 / t-497311）。
// 出口集中在契约旁边：调用方（路由与组合根）只需要 import 这一个模块；
// 各实现文件由各自的卡单独提交，此处只做出一行接线（避免多卡并发改同一文件）。
export * from './QueryDialogue.js'
export * from './QueryTrunk.js'
export * from './QueryPrompts.js'
export * from './QueryReport.js'
export * from './QueryDocs.js'
export * from './QueryDag.js'
export * from './QueryToken.js'
// 验收 Tab 查询（REQ-261006130057-7a43 t-a85893 FR-8）。
export * from './QueryVerify.js'
