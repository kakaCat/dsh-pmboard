/**
 * 类型注册表（REQ-261009174713-7bc8 · RF-25 / RF-28 · 裁定 D-5）。
 *
 * core **只经这张表**消费类型逻辑：它按 `category` 问「这个类型要求什么」，
 * 而不是自己 switch 六个字面量。装配点（聚合根包的 `type-registry.ts`）把六个类型包的 spec
 * 注进来，缺类就在装配期响亮报错——**不回落「按 feature 兜底」**：静默兜底会让
 * 「类型包没装上」表现为「需求按错类型落盘」，那是最难查的一类事故。
 *
 * 失败一律**带名字**：未命中要说清问的是哪个 category、已注册哪些；
 * 缺类要说清缺哪几个。装配期错误用普通 `Error`（不是 `REQBOARD_*` 领域码）——
 * 它是程序员错误不是用户可触发的业务拒绝，混进错误码口径会污染那张表的口径（见 errors.ts 白名单机制）。
 *
 * @module pmboard-type-kit/registry
 */
import { ALL_REQ_CATEGORIES } from 'pmboard-common/protocol.js'
import type { RequirementCategory } from 'pmboard-common/requirement/Requirement.js'
import type { RequirementTypeSpec } from './contract.js'
import { assertValidTypeSpecs, missingCategories, serializeTypeSpecs } from './validate.js'

/** 类型注册表（只读视图；构建即校验）。 */
export interface TypeRegistry {
  /** 已注册的规格（按类型枚举的规范顺序，与调用方传入顺序无关）。 */
  readonly specs: readonly RequirementTypeSpec[]
  /** 已注册的类型（规范顺序）。 */
  categories(): readonly RequirementCategory[]
  /** 按类型取规格；未知或未传 → undefined（不抛）。 */
  get(category: string | undefined): RequirementTypeSpec | undefined
  /** 按类型取规格；未知/未传 → 抛错并点出该 category（core 的默认取值口）。 */
  require(category: string | undefined): RequirementTypeSpec
  /** 六类里还缺哪些（空数组 = 齐备）。 */
  missing(): readonly string[]
  /** 六类不齐就抛错并点名缺哪几个（装配期调用）。 */
  requireComplete(): void
  /** 确定性快照（t9 六类型规格基线用）。 */
  snapshot(): string
}

/**
 * 用一批规格建注册表。**构建即校验**：规格不合法或类型重复当场抛错（别把坏规格带进运行期）。
 *
 * 允许建**部分**注册表（测试与分步装配要用）；「六类齐备」由 {@link TypeRegistry.requireComplete}
 * 在真正的装配点判——把「齐备」塞进构造函数会让单类型用例无法构造夹具。
 */
export function createTypeRegistry(specs: readonly RequirementTypeSpec[]): TypeRegistry {
  assertValidTypeSpecs(specs, '注册表构建失败')

  const order = new Map(ALL_REQ_CATEGORIES.map((c, i) => [c as string, i]))
  const ordered = [...specs].sort((a, b) => (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99))
  const byCategory = new Map(ordered.map((s) => [s.category as string, s]))

  return {
    specs: ordered,
    categories: () => ordered.map((s) => s.category),
    get: (category) => (category === undefined ? undefined : byCategory.get(category)),
    require(category) {
      const found = category === undefined ? undefined : byCategory.get(category)
      if (found === undefined) {
        const have = ordered.map((s) => s.category).join(', ')
        throw new Error(
          `[pmboard-type-kit] 需求类型未注册：${category === undefined ? '(未传 category)' : category}`
          + `（已注册：${have.length === 0 ? '无' : have}）`,
        )
      }
      return found
    },
    missing: () => missingCategories(ordered),
    requireComplete() {
      const absent = missingCategories(ordered)
      if (absent.length > 0) {
        throw new Error(
          `[pmboard-type-kit] 需求类型注册表缺类：${absent.join(', ')}`
          + `（六类必须齐备：${ALL_REQ_CATEGORIES.join(', ')}；缺类即装配期报错，不按 default 兜底）`,
        )
      }
    },
    snapshot: () => serializeTypeSpecs(ordered),
  }
}
