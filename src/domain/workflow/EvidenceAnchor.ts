/**
 * 判据锚点的**词汇表**（唯一事实源）——「可验收」这件事在两处用到同一套词汇：
 *
 *   ① **条款级**（需求文档每条 FR 的定义行块内）：这条功能点怎么算做到？缺锚点 = 无判据；
 *   ② **结单级**（任务卡结单证据）：这条证据能不能定位到条款 / 命令 / 数据？
 *
 * 两处共用同一份正则，是因为它们判的是同一件事的两种粒度：**"可核验"不是修辞，是出现
 * 命令、路径、数据或明确取值**。各写一份必然分叉（一处收紧、另一处忘改），而分叉的代价
 * 是"门禁说绿、人看不出凭什么绿"。
 *
 * 为什么放 domain：纯词汇表、零 I/O，且被 domain 侧的条款判据与 application 侧的结单证据
 * 同时需要；内容闸门从这里 import（`content-gate-wiring` 再导出，既有 import 路径不变）。
 *
 * @module dsh-pmboard/domain/workflow/EvidenceAnchor
 */

/**
 * 可核验锚点（比计划期的断言词更严）：路径 / 命令 / 数据查询 / 明确的通过计数。
 *
 * 注意它是**宽松**的（命中任一即可）：刻意不判"这条够不够好"，只判"有没有可核验的东西"——
 * 判质量是人的事，机械层只堵"一句空话也算验收"。
 */
export const EVIDENCE_ANCHOR = /\.(ts|tsx|js|mjs|cjs|md|html|json|py|go|css|sh)\b|\b(npx|npm|pnpm|vitest|node|curl|grep|python3?|bash|pytest|sql)\b|SELECT\s|diff\s|\d+\s*(passed|通过)/i

/**
 * 条款级判据的**附加**形态：明确取值 / 可读数 / 断言比较。
 *
 * 为什么条款级要额外这几种（EVIDENCE_ANCHOR 不够）：需求条款的判据常写作
 * 「退出码 0」「返回 REQBOARD_XXX」「覆盖率 ≥ 90%」「字段等于 paused」——它们不含文件后缀、
 * 也不含命令名，却比任何形容词都更能证伪。缺了这一组，写成「收敛」「优化」的条款会因为
 * 旁边恰好提了个 `.md` 路径而侥幸过关（假阴性/假阳性会同时出现）。
 *
 * 刻意**不含裸数字**（如「8 段进度带」「6 个 Tab」）：那是描述参数，不是判据——
 * 把数字算锚点等于给"排版收敛"这类条款开门，整条判据立刻空转。
 */
export const CLAUSE_VALUE_ANCHOR = /退出码|返回码|状态码|错误码|REQBOARD_[A-Z_]+|\bexit\s*\d|≥|≤|==|!=|不小于|不超过|等于|全绿|逐字节/i

/**
 * 条款级判据锚点 = 结单锚点 ∪ 明确取值形态（同一份词汇表的两个来源，组合在一处）。
 * 用法：`CLAUSE_CRITERIA_ANCHOR.test(条款块正文)`。
 */
export const CLAUSE_CRITERIA_ANCHOR = new RegExp(
  EVIDENCE_ANCHOR.source + '|' + CLAUSE_VALUE_ANCHOR.source,
  'i',
)
