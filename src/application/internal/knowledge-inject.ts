/**
 * 注入侧的索引节与文档瘦身（REQ-261001110934-3766 t8 / design/architecture.md「关键机制 3」）。
 *
 * 三条不变量：
 *  ① **缺省即老行为**：调用方不给 `knowledgeIndex` 就一个字都不加（老需求逐字节不变）；
 *  ② **按行截断并响亮标注**（不返回半行，也不静默裁）；
 *  ③ **摘要必须带指针**：瘦身后只留 TL;DR，原文位置必须写出来（压缩式恢复会丢上下文的反面教材）。
 *
 * @module dsh-pmboard/application/internal/knowledge-inject
 */
import { describeOverflow } from '../../domain/knowledge/budget.js'
import { sliceSection } from '../../domain/knowledge/slug.js'
import type { KbOverflow } from '../../domain/knowledge/types.js'

export interface KnowledgeIndexInput {
  readonly text: string
  readonly overflows: readonly KbOverflow[]
  readonly budgetChars: number
}

export interface KnowledgeSectionResult {
  readonly section: string
  readonly truncated: boolean
  readonly keptLines: number
  readonly totalLines: number
}

/** TL;DR 锚点（`## TL;DR` 经 slug 规则得到 `tl-dr`）。 */
const TLDR_ANCHOR = 'tl-dr'

/**
 * 构造「项目知识索引」节：预算内按行取，超出则截断并标注还剩多少行（指向 reqboard_kb）。
 * 索引本身超预算（overflows）时**把超限写在节首**——不让读者以为这就是全部知识。
 */
export function buildKnowledgeSection(input: KnowledgeIndexInput): KnowledgeSectionResult {
  const lines = input.text.split('\n')
  const header = '## 项目知识索引（本节点只注入目录；完整在 docs/knowledge/INDEX.md）'
  const warnings = input.overflows.map((o) => '> ⚠️ ' + describeOverflow(o))
  const head = [header, '', ...warnings, ...(warnings.length > 0 ? [''] : [])]
  const used = head.join('\n').length
  const kept: string[] = []
  let chars = used
  for (const line of lines) {
    if (chars + line.length + 1 > input.budgetChars) break
    kept.push(line)
    chars += line.length + 1
  }
  const truncated = kept.length < lines.length
  const tail = truncated
    ? ['', '> （已截断：还有 ' + String(lines.length - kept.length) + ' 行未注入）',
       '> 取更多：`reqboard_kb(kind=' + "'<类>'" + ')` 列一类、`reqboard_kb(query=…)` 找关键词、`reqboard_kb(id=…)` 取一条。']
    : []
  return {
    section: [...head, ...kept, ...tail].join('\n'),
    truncated,
    keptLines: kept.length,
    totalLines: lines.length,
  }
}

export interface RequirementDigest {
  readonly text: string
  readonly truncated: boolean
  readonly hadTldr: boolean
}

/**
 * 需求文档瘦身：取 `## TL;DR` 小节（缺失则取开头若干行并如实标注），附原文指针。
 * 超出上限 → 按行截断并标注（不返回半行）。
 */
export function digestRequirementDoc(docText: string, docPath: string, maxChars: number): RequirementDigest {
  const tldr = sliceSection(docText, TLDR_ANCHOR)
  const hadTldr = tldr !== undefined
  const source = hadTldr ? tldr : docText.split('\n').slice(0, 24).join('\n')
  const lines = source.split('\n')
  const kept: string[] = []
  let chars = 0
  for (const line of lines) {
    if (chars + line.length + 1 > maxChars) break
    kept.push(line)
    chars += line.length + 1
  }
  const truncated = kept.length < lines.length
  const body = [
    hadTldr ? '（以下为需求文档的 TL;DR；完整文档见指针）' : '（未找到 `## TL;DR` 小节：以下为文档开头若干行；完整文档见指针）',
    '',
    ...kept,
    ...(truncated ? ['', '> （已截断：还有 ' + String(lines.length - kept.length) + ' 行；需要细节请直接读原文）'] : []),
    '',
    '> 指针：' + docPath,
  ]
  return { text: body.join('\n'), truncated, hadTldr }
}
