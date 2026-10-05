# t-aedabb 接口：submit schema + 计划校验 + plan-landing 解析落库

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
接口：submit schema + 计划校验 + plan-landing 解析落库

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
`npx vitest run tests/subtask-contract.test.ts`（及 plan-landing/submit 相关用例）→ 全绿；非法 template 提交被拒且回执含 REQBOARD_TEMPLATE_INVALID 与合法键清单；stages+template 同给被拒 REQBOARD_TEMPLATE_CONFLICT；UC-1 集成断言：template=change-only 落库 stages=[dev,review] 且 TaskRecord.template 记录引用键

## 实施方案（implementation）
按 design/interfaces.md §1/§3 落 schema 与校验；plan-landing 落库时 stages 写解析值、template 冗余记录；用例覆盖 TC-8/TC-9 与 UC-1/UC-2

## 上游产出摘要（dependsSummary）
- 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T16:19:21.373Z，窗口 session-e48f706a-b51f-47a9-85c5-47b7e59bba48）

template 一等字段全链路打通：submit schema → 计划解析（含两个响亮错误码）→ 批准计划 → decompose → TaskRecord.template；5 条新用例全绿，既有失败 6 条均验证为存量（与 template/stages 路径零交集）

### 完成项

- SubmitTool schema +template 字段（描述列全部合法键与优先级口径），prompt.ts 同步
- protocol.ts 计划解析改用 resolvePlanStages：template 在提交时即解析成具体链写进 PlanTask.stages（批准所见=落库所得），引用键冗余存 PlanTask.template
- 非法 template 抛 REQBOARD_TEMPLATE_INVALID（文案列合法键清单）；stages+template 同给抛 REQBOARD_TEMPLATE_CONFLICT
- PlanTask/TaskRecord/PlanTaskDraft +template 字段；Decompose 两处 draft 映射与 plan-landing 落库透传 TaskRecord.template
- TC-8 UC-1 集成断言：template=change-only 落库 stages=[dev,review] 且 TaskRecord.template=change-only ✓
- TC-9 四组：解析即落链 / 非法键拒绝+列清单 / 同给冲突 / +skipIntegration 合法叠加 ✓

### 改动文件

- `src/shared/protocol.ts`
- `src/application/internal/plan-landing.ts`
- `src/application/use-cases/Decompose.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/SubmitTool/prompt.ts`
- `tests/plan-mode.test.ts`

### 下一步

t4 边界规则卡（STAGE_SCOPE_RULE 类型强制 + 四段规则）

---
