# t-40bbc6 汇报工具描述落三锚点（reqboard_task_report）·研发

> 需求：REQ-261002115204-ba52 长文本工具参数写法约定：防整轮失败的入参约束

## 在做什么
汇报工具描述落三锚点（reqboard_task_report）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T03:55:10.495Z，窗口 session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5）

这一步做完，模型准备写完工汇报时，工具描述里就直接带着写法要求（每条短句、「」代引号、太长拆多次），不必靠自觉。报告工具的三个长文本参数与工具描述都引用了同一份约定常量；入参字段、必填与返回体一字未改。

### 完成项

- src/tools/TaskReportTool/prompt.ts：TASK_REPORT_PROMPT 追加「长文本入参写法约定」与「一次汇报过大时拆成多次调用（幂等追加）」指引
- src/tools/TaskReportTool/TaskReportTool.ts：summary / completed / next_step 三个 description 各引用 LONG_TEXT_ARG_NOTE（不复制粘贴）
- TC-1b 报告工具描述用例：3 passed / 7 skipped（全绿）
- tests/task-report.test.ts 既有行为回归：7 passed（全绿）
- 零变更核验（同文件 TC-5）：参数字段集合与必填集合、返回体 7 键与基线一致

### 改动文件

- `src/tools/TaskReportTool/prompt.ts`
- `src/tools/TaskReportTool/TaskReportTool.ts`

### 下一步

交复核段核对描述落点与零变更，然后收 t2 父卡。

---
