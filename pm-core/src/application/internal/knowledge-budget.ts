/**
 * 检索预算裁剪（REQ-261001110934-3766 t4 / design/interfaces.md「语义细则」）。
 *
 * 口径：**按序列化后的字符数**算预算（返回体真实占用的字符），而不是"正文长度之和"——
 * 后者会低估，让 Agent 以为还有余量。
 * 规则：先尽力放**指针行**（一行一条：id · kind · 一句话 · 指针），有余量再放**正文**；
 * 任何被丢掉的东西 → `truncated=true`（响亮，不静默）。documents 不足时不返回碎片正文。
 *
 * @module dsh-pmboard/application/internal/knowledge-budget
 */

/** 一条候选（正文按需附带）。 */
export interface KbCandidate {
  readonly id: string
  readonly kind: string
  readonly title: string
  readonly oneLiner: string
  readonly pointer: string
  readonly updatedAt: string
  readonly body?: string
}

/** 裁剪结果：条目 + 是否发生截断 + 实际占用字符。 */
export interface KbTrimResult {
  readonly items: readonly KbCandidate[]
  readonly truncated: boolean
  readonly usedChars: number
}

/** 返回体的字符口径：与序列化后一致（含 JSON 结构开销）。 */
export function payloadChars(items: readonly KbCandidate[]): number {
  return JSON.stringify({ items }).length
}

/**
 * 按预算裁剪：**先指针后正文**，指针是保底（至少回一条）。
 *
 * 为什么指针是 floor：预算不足时"空手而归"比"给一条指针"更糟——Agent 连去哪找都不知道。
 * 这与本仓提示词预算的 floor 语义同源（`domain/prompt/budget.ts`：清单/闸门永不裁）。
 * 正文才是被预算约束的部分：放不下就只留指针，并置 `truncated=true`（响亮，不静默截断正文）。
 *
 * @param candidates 已按相关性排序的候选
 * @param budgetChars 预算（字符）
 */
export function trimToBudget(candidates: readonly KbCandidate[], budgetChars: number): KbTrimResult {
  const kept: KbCandidate[] = []
  let truncated = false
  for (const c of candidates) {
    const pointerOnly: KbCandidate = c.body === undefined ? c : { ...c, body: undefined }
    const hasBody = c.body !== undefined && c.body.length > 0
    if (payloadChars([...kept, pointerOnly]) > budgetChars) {
      if (kept.length === 0) {
        // 保底：第一条指针无论如何都回（否则调用方拿到空集，不知道该去读哪个文件）
        kept.push(pointerOnly)
        truncated = true
      }
      truncated = true
      break
    }
    kept.push(pointerOnly)
    if (!hasBody) continue
    if (payloadChars([...kept.slice(0, -1), c]) <= budgetChars) {
      kept[kept.length - 1] = c // 正文装得下 → 升级为带正文
    } else {
      truncated = true // 装不下 → 只留指针（不返回半截正文）
    }
  }
  if (kept.length < candidates.length) truncated = true
  return { items: kept, truncated, usedChars: payloadChars(kept) }
}
