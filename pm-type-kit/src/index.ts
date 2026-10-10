/**
 * `pm-type-kit` —— 需求**类型层**契约（L0.5，只依赖 `pm-common`）。
 *
 * 对外就三样东西：
 *   · 契约（`contract.ts`）：`RequirementTypeSpec` 与它的子结构——一份类型规格长什么样；
 *   · 注册表（`registry.ts`）：`createTypeRegistry()`——core 只经它按 category 问要求；
 *   · 校验与快照（`validate.ts`）：通用校验 + 确定性 dump（六类型规格基线的载体）。
 *
 * 六个类型包（`pmboard-type-{feature,bug,doc,refactor,spike,chore}`）各导出**一份 spec**；
 * 装配点在聚合根包的 `type-registry.ts`（只有那里同时认识六个包与 core 用例）。
 *
 * @module pm-type-kit
 */
// 模板引用类型不在本包另立：契约直接复用 `pm-common/template/types.js` 的 `TemplateRef`
// （同名不同形是这类重构最容易留下的漂移），故这里只导出本包自己的契约类型。
export type {
  ArchiveRule,
  ConditionalArtifactRule,
  ConditionalDocRule,
  RequirementTypeSpec,
  SpecSide,
  StageTemplates,
} from './contract.js'
export { createTypeRegistry, type TypeRegistry } from './registry.js'
export {
  assertValidTypeSpecs,
  missingCategories,
  serializeTypeSpec,
  serializeTypeSpecs,
  validateTypeSpec,
  validateTypeSpecs,
  violationText,
  type TypeSpecViolation,
} from './validate.js'
