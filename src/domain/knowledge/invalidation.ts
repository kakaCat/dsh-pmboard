/**
 * 「失效条件」可判定性纯判定（REQ-261006201841-944d t5 / design/interfaces.md I-4、backend.md K14）。
 *
 * 背景：沉淀侧过去写死一句模板「相关实现被重构、或该结论被新条目 supersede 时」——读的人
 * 无法据此判断"这条结论现在还算不算数"（没有指针、没有指向具体条目的 id）。K14 就是把
 * 这类条目变成**可数、可沉底的读数**，而读数与门禁必须同源，故判定落在 domain 纯函数里。
 *
 * 可判定 = 文本含**至少一个**可判定锚点（照 I-4 / K14 逐字，纯正则、不做语法分析）：
 *   ① 反引号字面量（`` `src/x.ts` `` / `` `pnpm kb:check` `` / `` `kb-0043` ``）；
 *   ② 形如 `路径.扩展名` 的文件指针（含 `#锚点` 亦算，例 `docs/architecture/project-manual.md#收尾门`）；
 *   ③ `supersede` / `被…取代` **加** 一个 `kb-NNNN` id（只有词、没有具体 id 不算——那正是模板句的问题）。
 *
 * 为什么 ② 要求**至少一段目录**（`a/b.md` 算、裸 `b.md` 不算）：本函数的输入是自由文本，
 * 裸 `x.md` 形态在英文行文里会撞上 `e.g.` / `i.e.` 这类缩写，把"没锚点"误判成"可判定"。
 * 而真正落地的指针（归档合并去向 / 说明书路径）都带目录；裸文件名另有 ① 的反引号形态兜住。
 *
 * 纯函数：零 IO、零 import（layer-boundary 门禁把 domain 的依赖钉死在内层）。
 * 正则常量共四个：① 一个、② 一个、③ 两个（「supersede 语义词」∧「具体 kb-NNNN」——
 * 合取语义用单条正则表达只会写出不可读的 lookahead 串，故拆两个常量再 AND）。
 *
 * @module dsh-pmboard/domain/knowledge/invalidation
 */

/** ① 反引号字面量（`…`，单行、非空）。 */
const BACKTICK_LITERAL = /`[^`\n]+`/

/** ② 文件指针：至少一段目录 + 文件名.扩展名（可带 `#锚点`）。 */
const FILE_POINTER = /(?:[\w.@~-]+\/)+[\w.@~-]+\.[A-Za-z][A-Za-z0-9]{0,7}(?:#[\w.@~:.-]+)?/

/** ③ supersede 语义词（中英两态；需与 kb-NNNN 同时出现才算锚点，故在此单独匹配）。 */
const SUPERSEDE_WORD = /supersede|superseded|取代/i

/** ③ 的具体条目 id（`kb-NNNN`；无具体 id 的泛指（如模板句）不算锚点）。 */
const KB_ENTRY_ID = /kb-\d{4}\b/

/**
 * 失效条件文本是否**可判定**（= 含至少一个可判定锚点）。
 *
 * 不抛错、不裁剪：给什么文本判什么文本（空串 / 未登记 → false）。
 */
export function isDecidableInvalidation(text: string): boolean {
  if (text.length === 0) return false
  if (BACKTICK_LITERAL.test(text)) return true
  if (FILE_POINTER.test(text)) return true
  return SUPERSEDE_WORD.test(text) && KB_ENTRY_ID.test(text)
}
