/**
 * snake/camel 双拼字段取值的**唯一实现**（REQ-261007230908-5ccb FR-4 · 体检报告 G10）。
 *
 * ## 为什么要有这个模块
 *
 * submit tasks[] 有 3 对双拼字段（dep_reasons/depReasons、skip_integration_reason/
 * skipIntegrationReason、granularity_exempt/granularityExempt），归一读取曾分散在
 * protocol.ts 三处与 plan-granularity.ts 一处——同一规则写两遍，改一处漏一处
 * （plan-granularity.ts:73 绕开 protocol 归一结果独立再读，就是实测的破坏点）。
 * 本模块把「两键取值」收敛为一处；**后处理（trim/截断/coerce）留调用方**——
 * 各字段的后处理本就不同，拉齐它们是行为变更，不在本模块职责内。
 *
 * ## 语义约定（与 data-model.md 语义表逐字对应）
 *
 * - `readDual`：按声明优先级取第一个「已定义」（!== undefined）的拼法值原样返回；
 *   两键皆缺 → undefined。优先级是**逐字段的现状事实**（skip_integration_reason 为
 *   camel 优先、granularity_exempt 为 snake 优先），调用方必须显式声明，不设缺省。
 * - `dualMapMerged`：两拼各经 coerce 成 map 后取**并集**（camel 覆盖同 key——
 *   同一条边两种写法各写一遍不该互相覆盖，但同 key 冲突时后声明的 camel 胜出，
 *   与既有 protocol.ts 的 Object.assign 顺序逐字一致）；两者皆无 → undefined。
 *
 * @module dsh-pmboard/shared/dual-field
 */

/**
 * 按声明优先级取第一个已定义的拼法值。
 *
 * @param o 原始对象（提交期未归一的 tasks[] 条目等）
 * @param snake snake_case 键名
 * @param camel camelCase 键名
 * @param priority 哪个拼法优先（逐字段现状事实，必须显式声明）
 * @returns 命中的原始值（未做任何加工）；两键皆 undefined 时返回 undefined
 */
export function readDual(
  o: Record<string, unknown>,
  snake: string,
  camel: string,
  priority: 'snake' | 'camel',
): unknown {
  const first = priority === 'snake' ? snake : camel
  const second = priority === 'snake' ? camel : snake
  return o[first] !== undefined ? o[first] : o[second]
}

/**
 * 两拼各 coerce 成 map 后取并集（camel 覆盖同 key）；两者皆无 → undefined。
 *
 * @param coerce 把原始值归一成 map 的函数（如 protocol.ts 的 depReasonsOf）；
 *               返回 undefined 表示该拼法无有效内容
 */
export function dualMapMerged(
  o: Record<string, unknown>,
  snake: string,
  camel: string,
  coerce: (v: unknown) => Record<string, string> | undefined,
): Record<string, string> | undefined {
  const merged: Record<string, string> = { ...(coerce(o[snake]) ?? {}) }
  Object.assign(merged, coerce(o[camel]) ?? {})
  return Object.keys(merged).length > 0 ? merged : undefined
}
