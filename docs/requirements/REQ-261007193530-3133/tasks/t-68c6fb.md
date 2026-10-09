# t-68c6fb 总验收：全量回归 + diff 盘点

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
总验收：全量回归 + diff 盘点

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
pnpm test 退出码 0 且无新增失败；pnpm typecheck 退出码 0；git diff --stat 盘点 = 5 源码文件（AskConfirm.ts / task-transition.ts / tasks.ts / RequirementStatus.ts / DoneEvidenceSpec.ts）+ 4 测试文件，无表外改动

## 实施方案（implementation）
不改代码。跑 pnpm test（与基线比对无新增失败）、pnpm typecheck、git diff --stat 盘点改动文件集合 = 设计文档「文件结构」表（5 源码 + 4 测试），逐条核对四条 FR 的 grep 判据

## 上游产出摘要（dependsSummary）
- 修复 AskConfirm 否定回执 user_feedback 条件展开（FR-1）
- 修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2）
- 修复需求 canceled→draft 复活边挂人工门（FR-3）
- 修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T12:01:59.850Z，窗口 session-38e57340-14d5-41ff-9f88-98f0f69b0191）

总验收完成：四处边界 bug 全部修复并回归覆盖，无表外改动

### 完成项

- t1-t4 四张父卡全部 done，子卡链各 4/4 完成
- 校验段（t-601a53）完成：typecheck 0 error、diff 盘点与设计表一致、四组新增用例 36 条全绿
- 全量测试存量失败已如实标注并抽验归因（HEAD 上同样失败）

### 下一步

提交验收材料 reqboard_submit(kind=verification)

---
