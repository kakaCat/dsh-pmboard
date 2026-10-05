# 拆分计划 · REQ-261003203909-55f2 子卡阶段模板补充

> **TL;DR**：7 张卡。t1 契约先行（枚举+模板键+纯函数），t2/t3/t4/t5 并行跟进
> （颜色/接口/边界规则/manual 链行为），t6 规范与 fixtures 收尾，t7 总验收。
> 全部增量改动，零存量改写；回滚 = revert。

## 目标与做法

把 design/ 五份文档落成代码：stageKind 16→20（e2e/manual/release/capture）、模板表 +2 键
（change-only/acceptance）、计划任务表 +template 字段、AdvanceChain +manual 停链分支、
`STAGE_SCOPE_RULE` 改类型强制。做法：契约（t1）落死再写实现，接口（t3）与执行（t4/t5）
分层推进，规范（t6）与总验收（t7）殿后。

## 改动盘点（对照设计文档逐份）

| 设计文档 | 落点文件 | 变更 | 承接卡 |
|---|---|---|---|
| data-model.md §1 | `src/domain/task/SubtaskTemplate.ts` | 修改：四段登记（KINDS/LABELS/ACCEPTANCE/EVIDENCE_KIND）+ 模板表 +2 键 + `validateTemplateRef`/`resolvePlanStages` | t1 |
| interfaces.md §1 | `src/shared/protocol.ts` | 修改：计划解析层调 template 校验（两错误码） | t3 |
| interfaces.md §1 | `src/tools/SubmitTool/`（SubmitTool.ts + prompt.ts） | 修改：schema +template 字段与描述 | t3 |
| interfaces.md §3 | `src/application/internal/plan-landing.ts` | 修改：template→stages 解析落库 + TaskRecord.template 透传 | t3 |
| data-model.md §1 | `src/domain/card-types.ts` | 修改：`STAGE_TO_PHASE_COLOR` +4 项 | t2 |
| data-model.md §1 | `src/application/use-cases/ExecuteTask.ts` | 修改：`STAGE_SCOPE_RULE` +4 项并改 `Record<StageKind,string>` | t4 |
| interfaces.md §4 | `src/application/use-cases/AdvanceChain.ts` | 修改：`AdvanceStop` +`awaiting-manual` + manual 分支（清单生成/停链/回执） | t5 |
| interfaces.md §5 #7 | `docs/knowledge/conventions.md` + eval-suite fixtures | 修改：登记点规范条目 + fixture 同步 | t6 |
| test-cases.md | `tests/`（domain/subtask-template、subtask-contract、execute-task、stage-colors、新增 advance-manual-stage） | 新增/修改用例 | 各卡自带 |
| architecture.md §4 | 存量台账/旧卡 | **零改写**（新枚举+可选字段，读取侧 undefined tolerant） | t7 验证 |

## 任务表

| key | title | phase | side | depends_on | 子卡段（显式） | serves |
|---|---|---|---|---|---|---|
| t1 | 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate） | implement | backend | — | dev,review,test | FR-1,2,3,5,6 |
| t2 | 颜色登记：STAGE_TO_PHASE_COLOR +4 项与用例 | implement | backend | t1 | dev,review,test | FR-1,2,3,6,7 |
| t3 | 接口：submit schema + 计划校验 + plan-landing 解析落库 | implement | backend | t1 | dev,integrate,review,test | FR-4,5 |
| t4 | 边界规则：STAGE_SCOPE_RULE 类型强制 + 四段规则 + prompt 快照 | implement | backend | t1 | dev,review,test | FR-1,2,3,6,7 |
| t5 | manual 链行为：awaiting-manual 分支 + 清单生成 + 回执 | implement | backend | t1 | dev,integrate,review,test | FR-2 |
| t6 | 规范沉淀：conventions 登记点条目 + eval fixtures 同步 | doc | doc | t2,t3,t4,t5 | （phase=doc 自动 dev,review） | FR-7 |
| t7 | 总验收：全量回归 + 反向演练 + 实机端到端复跑 | test | backend | t6 | （phase=test 自动 dev,review,test） | 全部 |

## 验收口径

- 每卡 acceptance 含可跑命令（见任务表 implementation），空话打回。
- t7 汇总：① `npx vitest run`（本需求涉及用例文件清单）全绿 ② `npx tsc --noEmit` 基线零新增
  ③ 反向演练 R-1/R-2（摘登记项 → 编译报错）输出入 evidence/
  ④ 实机端到端：带 template 的计划 → decompose → `queue.json` 断言 → 开工展开链构成符合 UC-1。
- 兼容验证（t7 内）：无 template 的旧计划提交/落库/展开行为不变（既有套件零改动全绿即证）。
