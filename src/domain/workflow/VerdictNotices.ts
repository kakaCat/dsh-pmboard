/**
 * 裁决回执文案单点（REQ-261007160829-1991 FR-2 / FR-4 · design/interfaces.md I-7）。
 *
 * 两条出口（弹框工具回执 / 看板 HTTP 回执）与弹框第 2 问题干此前**各写死一句**「未复核」：
 * 既说不清**为什么**没过（没写结果 vs 写了但没锚点），也说不清**该补什么**；而「可核验形态」
 * 这句话散在两处必然漂移。故把文案收口到本模块——**唯一出处**，弹框与 HTTP 都调这两个函数。
 *
 * 纪律：纯字符串逻辑、零 IO（不 import repo / fs / 时间 / 正则判据）；判据只允许一处
 * （`hasResultAnchor`，本模块不复制词表，只按已落账的 `UnverifiedReason` 措辞）。
 */

import type { UnverifiedReason } from './AcceptanceSheetSpec.js'
import { isSystemItem, SYSTEM_ITEM_DISPOSITION_HINT, type SheetItemLike } from './AcceptanceSheetSpec.js'

/**
 * 弹框第 2 问题干与回执补法共用同一句形态要求——两处各写一份必然漂移（FR-4 的判据就是它）。
 *
 * 三类形态词（命令 / 路径 / 计数）必须同时出现：只写「要可核验」等于没写，填的人仍不知道
 * 合格长什么样；末尾给一个**可照抄**的样例，把抽象要求变成形态示范。
 */
export const ACCEPT_RESULT_FORM_HINT =
  '可核验形态：一条命令 + 读数 / 一个文件路径 / 一个明确计数（例：npx vitest run tests/x.test.ts → 10 passed）'

/** 普通项 / 人工项的第 2 问结尾：「请贴实际结果」那句（原实现写死的位置，现收口到本模块）。 */
export const ACCEPT_RESULT_REQUEST_TAIL =
  '请贴实际结果（命令输出摘要 / 看到的界面 / 数据）；通过必填，留空则记「未复核」，不计入通过'

/**
 * 弹框第 2 问（收「结果」或「处置」）的**结尾引导**——按项类型分派（REQ-261007160829-1991 验收期修正）。
 *
 * 为什么必须分派：**系统缺口项**要通过，域要的是「处置」（命中两义模板 + 对象或理由，见
 * `isValidDisposition`）；而结尾引导原先一律按「请贴实际结果」写、本需求 FR-4 又追加了
 * 「可核验形态：命令 + 读数」，**照着题干写必然被判无效**。实测出处：验收本需求自身时，
 * 人按题干写下内容 → `system_item_disposition_required` 整批被拒，而报错只说「点通过却不写处置」。
 *
 * 纯函数、零 IO；是「题干该问什么」的唯一点，弹框用例只调它（不再内联三元）。
 * 注意：入参只需判类型的那两个字段，故用最小投影，测试可直接构造。
 */
export function resultQuestionTailOf(item: Pick<SheetItemLike, 'gapKind' | 'criterion'>): string {
  return isSystemItem(item)
    // 系统项：问处置（提示与处置判据同址，改判据必同时改它）。**不**追加形态提示——
    // 那是「实测结果」的形态要求，对「处置」是误导（也是本修正要掐掉的坑）。
    ? SYSTEM_ITEM_DISPOSITION_HINT
    : ACCEPT_RESULT_REQUEST_TAIL + '\n' + ACCEPT_RESULT_FORM_HINT
}

/**
 * 未复核汇总（两条通道共用）：区分「没写」与「写了但不认」。
 *
 * 为什么必须分类：这两类的补法完全不同（补结果 vs 补锚点），一句「未复核 N 项」会让人
 * 在错误方向上反复重试（立项描述里实测 5 次）。
 *
 * 老数据口径：`unverifiedReason` 缺席的未复核项计入「未写结果」——该字段落地之前的降级
 * 全是「点了通过却没留结果」，把它算作「无锚点」会诬告一批本没有文本的项。
 *
 * 无未复核项时返回**空串**：调用方直接拼接，不必自己处理「0 项未复核」这种噪声。
 *
 * 入参只投影两个字段（`status` 保持自由字符串——老数据与新数据同形；`unverifiedReason`
 * 缺席即「没写」），以免调用方为传参而构造整个验收项。
 */
export function unverifiedSummaryOf(
  items: readonly { status: string; unverifiedReason?: UnverifiedReason }[],
): string {
  let anchorMissing = 0
  let blankPass = 0
  for (const it of items) {
    if (it.status !== 'unverified') continue
    if (it.unverifiedReason === 'anchor_missing') anchorMissing++
    else blankPass++ // 'blank_pass' 与老数据（缺席）同归「未写结果」
  }
  const total = anchorMissing + blankPass
  if (total === 0) return ''
  return `${total} 项未复核（无锚点 ${anchorMissing}、未写结果 ${blankPass}）`
}

/**
 * 按**真实原因**给补法；无原因（老数据）时用中性措辞。
 *
 * 三种取值互不相同，否则「按原因分派」退化成同一句话（回执说了等于没说）：
 *   · `anchor_missing` —— 文本在，缺的是证据形态，故先给形态再让人重交；
 *   · `blank_pass`     —— 根本没文本，谈锚点还太早，先让他补结果；
 *   · `undefined`      —— 原因不可考，不猜是哪一类，两件都提且都写得可执行。
 */
export function unverifiedAdviceOf(reason?: UnverifiedReason): string {
  if (reason === 'anchor_missing') {
    return '给结果补一个可核验锚点（命令 + 读数 / 路径 / 明确计数）后重交'
  }
  if (reason === 'blank_pass') {
    return '补上实际结果后重交'
  }
  // 老数据：未记原因 ⇒ 不误导成某一类原因，给中性且可执行的措辞。
  return '该项未复核原因未记录：补上实际结果，或给结果补一个可核验锚点（命令 + 读数 / 路径 / 明确计数）后重交'
}
