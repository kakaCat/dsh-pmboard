# t-ce91f7 agent 可见字符串 REQ/FR 历史叙事清零·研发

> 需求：REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9）

## 在做什么
agent 可见字符串 REQ/FR 历史叙事清零·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T13:40:55.444Z，窗口 session-19ffbc9b-e16f-4979-960b-17ff8c516cb0）

研发子卡完成：agent 可见面 REQ 编号非注释命中 0，RunStatusTool 描述 810→663，出处全部挪进注释

### 完成项

- 12 处 agent 可见字符串的 REQ/FR 编号清零（非注释命中数实测 0）：AskConfirmTool.ts 62/63/64/67、SubmitTool.ts 199/433/460/491、StatusTool.ts 131/159/174、HandoffTool.ts 89、CaptureTool/prompt.ts:21
- RunStatusTool 两段修复史整段删除，规范性表述保留为一句『降级形状必须能通过自己的 schema：不是 string 的字段整体省略，而不是发 null』；description 810 → 663 字符
- 出处挪代码注释（agent 不可见）：AskConfirmTool.ts 三处新增『// 出处（agent 不可见）：REQ-… FR-…』，提交豁免参数处同款；RunStatusTool/prompt.ts 头注释写清两条历史事故（status:'terminated' 从未产出的形状 / snapshot.runId null 透传硬错误）
- 判据 1：agent 可见面（prompt.ts 常量 + 各 Tool.ts description 字符串）非注释 REQ 编号命中 0 ✔；判据 2：RunStatusTool description 663 < 810 且不含修复史 ✔；判据 3：全量 vitest 与 t3 基线逐条比对新增红 0（68 vs 69，转绿 1 为既有抖动用例）✔
- 有意保留（如实声明）：SubmitTool.ts:64/68 与 TaskRefsTool.ts:32 的 '["FR-1","FR-2"]' 是**参数格式示例**（不是历史叙事）；StatusTool.ts:103/122 的「（FR-3）/（FR-1）」是字段规格引用（不在报告 §3.4 清单内）——两类都不属 G6 口径
- t4 已顺带清掉 SubmitTool/prompt.ts 的 :18 与 :27-31 两处叙事（原判据 1 的『日期 cutoff 除外』现已无豁免对象：cutoff 规则住代码 docQualityRulesApply，文案不再需要它）
- 门禁：typecheck exit 0、prompts:check exit 0

### 改动文件

- `src/tools/AskConfirmTool/AskConfirmTool.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/StatusTool/StatusTool.ts`
- `src/tools/HandoffTool/HandoffTool.ts`
- `src/tools/CaptureTool/prompt.ts`
- `src/tools/RunStatusTool/prompt.ts`

### 下一步

复核子卡：逐处核对删改与出处落位

---
