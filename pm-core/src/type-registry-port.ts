/**
 * 核心层的**类型注册表装配端口**（REQ-261009174713-7bc8 · RF-25 / RF-26 · 卡 t-cfd8ae）。
 *
 * ## 为什么不直接 import 具体类型包
 *
 * 分层白名单：core（L1）只允许依赖 `common` · `rtm` · `type-kit`（L0.5）。
 * 六个**具体**类型包由聚合根包（L4）装配——core 按 category 问「这个类型要求什么」，
 * 但不认识任何具体类型包（否则「走某类型逻辑只落该类型包」就只是口号）。
 *
 * ## 为什么是「装配期安装」而不是把 registry 一路当参数传
 *
 * 判据消费点分散在 core 的多条链路（文档门 / 阶段门 / 模板 / 归档 / 标签），逐层加参数
 * 会污染一大片签名；而注册表本身是**装配期常量**（六类规格不变），天然适合一次性安装。
 *
 * 因此这里是**单写者端口**：只有根包 `src/type-registry.ts` 调 {@link installTypeRegistry}，
 * 且**未装配就抛**——绝不静默兜底（「类型包没装上」表现为「按默认类型判据放行」是最危险的失效形态）。
 *
 * @module pm-core/type-registry-port
 */
import type { TypeRegistry } from 'pm-category-kit'
import type { GeneratedFragment } from 'pm-common/prompt/generated/fragments.js'

let installed: TypeRegistry | undefined

/** 装配（幂等：同名注册表重复安装无副作用；换一个实例则覆盖，供测试隔离用）。 */
export function installTypeRegistry(registry: TypeRegistry): void {
  installed = registry
}

/** 取当前注册表；**未装配即抛**（装配点：根包 `src/type-registry.ts`）。 */
export function typeRegistry(): TypeRegistry {
  if (installed === undefined) {
    throw new Error(
      '[pm-core] 类型注册表未装配：请在装配点（根包 src/type-registry.ts）调用 installTypeRegistry(TYPE_REGISTRY)',
    )
  }
  return installed
}

/** 是否已装配（测试与自检用；生产判据请直接用 {@link typeRegistry}）。 */
export function typeRegistryInstalled(): boolean {
  return installed !== undefined
}

// ── 类型档提示词片段（REQ-261009174713-7bc8 t11 二期）────────────────────────────
//
// 片段表随类型包走（每类 18 条），core 组装 = 通用（common）+ 按类型（此处下发）。
// 与注册表同款单写者：只有装配点装；**未装配即抛**——绝不静默只注入通用档
// （那会让「类型档没装上」表现为「提示词变薄」，是最难被发现的一类劣化）。
let typeFragmentTables: readonly (readonly GeneratedFragment[])[] | undefined

/** 装配六类片段表（顺序无关：组装时按 id 去重不吃顺序）。 */
export function installTypeFragments(tables: readonly (readonly GeneratedFragment[])[]): void {
  typeFragmentTables = tables
}

/** 取全部类型档片段；未装配即抛。 */
export function typeFragments(): readonly GeneratedFragment[] {
  if (typeFragmentTables === undefined) {
    throw new Error(
      '[pm-core] 类型档提示词片段未装配：请在装配点（根包 src/type-registry.ts）调用 installTypeFragments([...六包 FRAGMENTS])',
    )
  }
  return typeFragmentTables.flat()
}
