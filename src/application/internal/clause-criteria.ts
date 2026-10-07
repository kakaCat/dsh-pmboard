/**
 * 条款级判据软门禁（**只提示不拦**，与 `ReadabilityHints` 同口径）——
 * 需求文档里每条条款（FR-x / BUG-x / RF-x / SP-x / DOC-x / CH-x）的定义行块内，
 * 必须出现**可执行判据**：命令 / 断言 / 可读数 / 明确取值。
 *
 * ## 为什么需要它（实测缺口，2026-10-06 产物质量体检）
 *
 * 形状门禁全绿、编号全连续的需求，仍可能一条判据都没有：抽最近 12 条真实需求，
 * **7/73 条条款无可验收判据**，且集中在同一份文档（`REQ-261006130057-7a43` 的
 * 「纵向占地收敛」「减少无效留白」）。根因：C-08「验收标准必须可执行」只落在**任务卡**
 * （`checkAcceptance` / `evidenceAnchorGap`），**条款层完全没有对应判据**——
 * 于是"文档写得齐"与"文档写得能验"之间那道缝，谁都不报。
 *
 * ## 为什么是软门禁
 *
 * 条款判据的**质量**判不了（"覆盖率 ≥ 90%" 与 "界面不闪" 谁是判据，只有人能定），
 * 机械层只能判**有没有**可核验的东西。判不了却硬拦 = 逼人写废话糊门禁（本仓最贵的失败形态）；
 * 故：提示进提交回执，agent 可读可改，人不因缺判据被卡流程。
 *
 * ## 扫描口径（与 `extractSkippedClauses` 同构，避免"同一条款两个窗口"）
 *
 * 从条款定义行**向下**扫到「下一条款定义行」或「下一个标题」为止（最多 {@link CLAUSE_CRITERIA_WINDOW} 行）。
 * 为什么不是固定 ±N：条款块长度天然不同，固定窗口要么越过下一条款把别人的判据算到自己头上
 * （假绿），要么截断多行条款（假红）。
 *
 * 纯函数、零 I/O：调用方读文件、传 `ParsedDoc`。
 *
 * @module dsh-pmboard/application/internal/clause-criteria
 */
import { fmt } from '../../domain/text/fmt.js'
import { CLAUSE_CRITERIA_ANCHOR } from '../../domain/workflow/EvidenceAnchor.js'
import { DEF_LINE_RE, type ParsedDoc } from './doc-parse.js'

/**
 * 条款块最多向下看多少行（含定义行本身）。
 *
 * 取 40 的理由（2026-10-06 本需求 dogfood 修正）：原先取 12，理由是"条款块实测 3~8 行"——
 * 但**本需求自己的文档**就把 3 条 FR 判成了缺口（判据在「验收标准」里，落在定义行 15 行之后），
 * 那是**假红**：判据就在这条款自己的块里，只是块比预想的长。假红比漏报更贵——
 * 它会训练人忽略这条提示（本仓最怕"红了没人看"）。
 * 真正的边界是**文档结构**（下一条款定义行 / 层级不深于本条款的标题），这个数字只是
 * 防"整篇没有第二条款也没有标题"的病态文档的兜底，故放宽到 40。
 */
export const CLAUSE_CRITERIA_WINDOW = 40

/** 一条"无可执行判据"的条款（供逐条点名，而不是只说"文档缺判据"）。 */
export interface ClauseCriteriaGap {
  /** 条款编号（FR-3 / BUG-1 …） */
  clause: string
  /** 定义行在正文里的下标（0 基，便于人反查；不对外承诺与文件行号同值） */
  line: number
  /** 定义行开头（截断 60 字），人一眼认出是哪条 */
  excerpt: string
}

/** 是否是一行标题（条款块的自然边界之一）。 */
function isHeadingLine(line: string): boolean {
  return /^#{1,6}\s/.test(line)
}

/** 标题层级（1~6）；非标题 = 0。 */
function headingLevel(line: string): number {
  const m = /^(#{1,6})\s/.exec(line)
  return m === null ? 0 : (m[1] ?? '').length
}

/**
 * 一行的**条款定义位**口径 —— 与 `extractClauseDefinitions` 逐字同源：
 *   ① 正文行：`- **FR-3: …**`（`DEF_LINE_RE` 直接命中）；
 *   ② 标题行：`### FR-1：功能点标题` —— 门禁侧的写法是给标题文本前置 `**` 再匹配
 *      （`content-gates.ts` 的 `DEF_LINE_RE.exec('**' + h.text)`），本函数照抄这一步，
 *      否则同一份文档"编号门禁认得、判据门禁看不见"（两套定义位口径 = 静默漏判）。
 */
function clauseDefinitionOf(line: string): string | undefined {
  const direct = DEF_LINE_RE.exec(line)
  if (direct !== null) return direct[1]
  if (!isHeadingLine(line)) return undefined
  const byHeading = DEF_LINE_RE.exec('**' + line.replace(/^#{1,6}\s*/, ''))
  return byHeading?.[1]
}

/**
 * 逐条扫描「无可执行判据」的条款。
 *
 * 定义行口径**完全复用** `DEF_LINE_RE`（与编号门禁、条款覆盖门禁同一份）：
 * 本函数不另立"什么算条款定义"的第二份真相（标题写法见 {@link clauseDefinitionOf}）。
 */
export function clauseCriteriaGaps(doc: ParsedDoc): ClauseCriteriaGap[] {
  const lines = doc.bodyLines
  const gaps: ClauseCriteriaGap[] = []
  // 同一编号只点名一次（keep 第一条）：编号重复是**编号门禁**的事（会另点名并要求修），
  // 这里若也逐次报，人读到的会是「FR-1（…）、FR-1（…）」这种像 bug 的输出。
  const seen = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const clause = clauseDefinitionOf(line)
    if (clause === undefined || seen.has(clause)) continue
    seen.add(clause)
    // 条款块的下边界 = 下一条款定义行，或**层级不深于本条款**的标题（更深的子标题仍属本条款：
    // `### FR-1` 下面的 `#### 验收标准` 里的命令，是这条 FR 的判据，不该被截掉）。
    const ownLevel = headingLevel(line)
    const win: string[] = []
    for (let j = i; j < lines.length && win.length < CLAUSE_CRITERIA_WINDOW; j++) {
      const l = lines[j] ?? ''
      const lvl = headingLevel(l)
      const boundary = lvl > 0 && (ownLevel === 0 || lvl <= ownLevel)
      if (j > i && (clauseDefinitionOf(l) !== undefined || boundary)) break
      win.push(l)
    }
    if (CLAUSE_CRITERIA_ANCHOR.test(win.join('\n'))) continue
    gaps.push({ clause, line: i, excerpt: line.trim().slice(0, 60) })
  }
  return gaps
}

/**
 * 人读提示（空数组 = 每条条款都给了可核验判据）。
 *
 * 文案带**修复锚点**（写什么算判据、举个能照抄的例子），不是"请补充判据"这类空话——
 * 后者只会换来一句"已补充"。
 */
export function clauseCriteriaHints(doc: ParsedDoc): string[] {
  const gaps = clauseCriteriaGaps(doc)
  if (gaps.length === 0) return []
  const detail = gaps.map(g => fmt('{clause}（{excerpt}…）', { clause: g.clause, excerpt: g.excerpt })).join('、')
  return [
    fmt('条款级判据缺口（不阻断提交）：{n} 条条款的定义行块内找不到可执行判据——{detail}。每条 FR 至少给一样可核验的东西：跑什么命令（`npx vitest run tests/x.test.ts` 全绿）、看什么读数（退出码 0 / 覆盖率 ≥ 90%）、什么明确取值（状态字段等于 paused / 返回 REQBOARD_XXX）。判据是「这条算做到」的唯一可证伪凭据，缺了它验收只能凭印象，设计与测试也无从对齐。', { n: gaps.length, detail }),
  ]
}
