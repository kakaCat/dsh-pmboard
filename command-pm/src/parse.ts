/**
 * `/pm` 命令的文法解析（REQ-261009174713-7bc8 · RF-17 · 卡 t18）。
 *
 * 文法（设计 `design/interfaces.md` 的「语法文法」节，逐条对应）：
 *
 * | rawInput | 结果 |
 * |---|---|
 * | 空 / 纯空白 | `show` |
 * | `<名称>`（≤ 120 字符） | `create(title)` |
 * | `<名称>`（> 120 字符） | `invalid`（不落任何数据） |
 * | 其它（含 `--flag`） | `create('--flag')` —— 命令面**不认旗标**，避免「看似支持其实不生效」 |
 *
 * 纯函数、零依赖：边界（空白 / 超长 / 非 ASCII）由单测直接覆盖。
 *
 * @module command-pm/parse
 */

/** 需求名称长度上限（与工具面 `normalizeTitle` 同一口径）。 */
export const PM_TITLE_MAX = 120

/** 解析结果（无子命令：V1 只有 show 与 create 两条，见需求的「边界」节）。 */
export type PmCommand =
  | { readonly kind: 'show' }
  | { readonly kind: 'create'; readonly title: string }
  | { readonly kind: 'invalid' }

/** `rawInput` 是命令名之后的原文（含分隔空白），文法由命令面独占。 */
export function parsePmCommand(rawInput: string): PmCommand {
  const title = (rawInput ?? '').trim()
  if (title === '') return { kind: 'show' }
  // 按**码点**计数：非 ASCII（emoji / CJK）按一个字符算，与用户直觉一致。
  if ([...title].length > PM_TITLE_MAX) return { kind: 'invalid' }
  return { kind: 'create', title }
}
