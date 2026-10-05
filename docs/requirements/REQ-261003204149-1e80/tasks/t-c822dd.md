# t-c822dd 注入与断点重算：pendingAction + dive armed

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
注入与断点重算：pendingAction + dive armed

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/move-rollback.test.ts -t 注入 绿：① 回退到 design 后断点 pendingAction 为设计阶段动作且不含验收/实施指引；② 回退后 dive.activation==='disarmed'。

## 实施方案（implementation）
回退成功后调 stampCheckpoint(req, now, 'reqboard_move') 使断点按新状态重算；回退时置 req.dive.activation='disarmed' 并清 pausedReason；核对 src/application/internal/interruption.ts 的 pendingActionFor 对新状态有分支，缺则补。

## 上游产出摘要（dependsSummary）
- 用例接入：工具侧与看板侧共用编排

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T13:23:34.146Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

回退后不再留旧阶段的「下一步」：断点按退回去的阶段重算，自动链停下——不会出现「人已经退回去了、系统还在催你交验收」。

### 完成项

- resetInjectionAfterRollback 单点落地：断点按新阶段重算 + dive 解除并清 pausedReason
- 两侧在状态转移之后调用（时机即正确性：stampCheckpoint 按 req.status 现算）
- t10 验收用例绿；判别力 A/B 自证（停用即红）
- 全量与 tsc 均与基线一致，双向差集为空

### 改动文件

- `src/application/internal/rollback.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/http/routers/requirements.ts`
- `tests/move-rollback.test.ts`

### 下一步

投递下一张 ready 卡：回退用例集（TC-1…TC-16）

---
