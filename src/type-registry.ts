/**
 * 需求类型注册表的**唯一装配点**（REQ-261009174713-7bc8 · RF-25 / RF-26 · 卡 t-cfd8ae）。
 *
 * 为什么装配点必须在根包（而不是 core 或 type-kit）：
 *   · 六个具体类型包（`pmboard-type-*`）只有**这里**认识 —— core 的依赖白名单只到 `pmboard-type-kit`
 *     （L1 → L0.5），它按 category 问「这个类型要求什么」，但不该 import 任何具体类型包；
 *   · 反过来，装配期缺类必须**响亮**（不是「按 feature 兜底」）：缺了就在插件装配时抛错，
 *     免得「类型包没装上」表现为「需求按错类型落盘」——那是最难查的一类事故。
 *
 * 谁消费：core 的类型判据（必填节 / 必交设计文档 / 条件产物 / 模板引用 / 归档去向）与
 * 提示词片段组装，都应当**经本注册表**取数，不再各自持有按类型的表（RF-26 单点化）。
 *
 * @module dsh-pmboard/type-registry
 */
import { createTypeRegistry, type TypeRegistry } from 'pmboard-type-kit'
import { spec as bugSpec } from 'pmboard-type-bug'
import { spec as choreSpec } from 'pmboard-type-chore'
import { spec as docSpec } from 'pmboard-type-doc'
import { spec as featureSpec } from 'pmboard-type-feature'
import { spec as refactorSpec } from 'pmboard-type-refactor'
import { spec as spikeSpec } from 'pmboard-type-spike'
import { installTypeFragments, installTypeRegistry } from 'pmboard-core/type-registry-port.js'
import { FRAGMENTS as bugFragments } from 'pmboard-type-bug/fragments.js'
import { FRAGMENTS as choreFragments } from 'pmboard-type-chore/fragments.js'
import { FRAGMENTS as docFragments } from 'pmboard-type-doc/fragments.js'
import { FRAGMENTS as featureFragments } from 'pmboard-type-feature/fragments.js'
import { FRAGMENTS as refactorFragments } from 'pmboard-type-refactor/fragments.js'
import { FRAGMENTS as spikeFragments } from 'pmboard-type-spike/fragments.js'

/** 六类规格（顺序无关：注册表内部按类型枚举归一）。 */
export const TYPE_SPECS = [featureSpec, bugSpec, docSpec, refactorSpec, spikeSpec, choreSpec] as const

/**
 * 装配期构建 + **齐备性校验**（缺类即抛，错误信息点名缺哪几个）。
 *
 * 用模块级常量而不是惰性 getter：装配期错误要在**加载插件时**就炸，而不是等到某次请求才发现。
 */
export const TYPE_REGISTRY: TypeRegistry = (() => {
  const registry = createTypeRegistry(TYPE_SPECS)
  registry.requireComplete()
  // 交给 core：core 只经这个端口按 category 问「该类型要求什么」（L1 不认识具体类型包）。
  installTypeRegistry(registry)
  // 类型档片段（RF-27）：六包各自的 18 条——core 组装 = 通用 + 这里下发的类型档。
  installTypeFragments([featureFragments, bugFragments, docFragments, refactorFragments, spikeFragments, choreFragments])
  return registry
})()
