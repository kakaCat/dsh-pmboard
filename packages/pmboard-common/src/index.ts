/**
 * pmboard-common · 公共抽象底座（L0，零依赖）。
 *
 * 承载判据：删除本包内任一文件只影响编译，不影响任何业务判据（design/architecture.md 的公共包边界）。
 * 目录形状保留原路径（domain/x → common/x），让搬迁可逐文件对照。
 *
 * @module pmboard-common
 */
export * from './errors.js'
export * from './limits.js'
export * from './write-set.js'
export * from './job-spec.js'
export * from './dual-field.js'
export * from './build-stamp.js'
export * from './artifact-labels.js'
export * from './error-code-registry.js'
export * from './text/labels.js'
export * from './text/pm-badge.js'
export * from './requirement/Requirement.js'
export * from './requirement/ColdWrite.js'
export * from './requirement/DocLocation.js'
export * from './requirement/archive-exemptions.js'
export * from './queue/queuePath.js'
export * from './queue/transitiveReduction.js'
export * from './stage/StagePromptSpec.js'
export * from './status/ArchivedMoment.js'
export * from './task/RequirementRefs.js'
export * from './task/ReworkPlaceholder.js'
export * from './template/types.js'
export * from './prototype/ParityContracts.js'
export * from './knowledge/types.js'
export * from './knowledge/slug.js'
export * from './knowledge/invalidation.js'
export * from './knowledge/operations.js'
