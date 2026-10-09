# t-b7ee98 弹框答案映射防静默回落

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
弹框答案映射防静默回落

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
单测绿：带（推荐）后缀的 selected 映射后 category=feature 不回落默认；location 三态（含已知根前缀/相对段/不含已知根绝对路径）拆分取值逐条断言；CAPTURE_ANSWER_KEYS 键集契约断言 == 4 键（location 替 workspace）。命令：`pnpm vitest run` 相关测试文件退出码 0。

## 实施方案（implementation）
mapCaptureAnswers 先 stripRecommendSuffix 再严格相等校验；新增 acceptAllRecommended 短路（defaultsUsed 记后 3 问）；location 作答拆分 (workspaceRoot, docBasePath) 三态规则（IF-2）；同步 CAPTURE_ANSWER_KEYS 与 tests/capture-output-contract 键集断言。

## 上游产出摘要（dependsSummary）
- 立项弹框四问内容定稿

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T15:58:19.358Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

这一步做完，弹框答案不会再被「悄悄改回默认值」：宿主原样回传的带推荐后缀选项先被剥干净再校验，一键过学会了自己补名称，文件落点也能把一条绝对路径拆回「工作区 + 相对目录」两笔台账。

### 完成项

- 剥后缀：mapCaptureAnswers 与 pickAnswer 统一先 stripRecommendSuffix 再严格相等校验（带（推荐）后缀的 label 不再静默回落默认）
- 一键过短路：acceptAllRecommended 命中时第二段不下发，后 3 问全走默认并记 defaults_used，名称由 titleOptions[0] 补
- 落点拆分三态：命中会话/宿主根前缀 → 哨兵 + 余下相对段；不含已知根的绝对路径 → 整段当工作区 + 默认目录；相对路径 → 会话工作区 + 该相对路径
- 答案键集 4 键同步：CAPTURE_ANSWER_KEYS / CaptureMapping.answers / CaptureTool schema 生成式 三处同源
- 新增单测：剥后缀防回落、一键过、落点三态拆分逐条断言

### 改动文件

- `src/application/internal/capture-mapping.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `tests/capture-tool.test.ts`
- `tests/capture-output-contract.test.ts`

### 下一步

子卡链（研发/联调/复核/测试）逐张收口

---
