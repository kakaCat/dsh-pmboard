# t-ac6dbe confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/confirm-advance-deadlock.test.ts 全绿；② 已批准计划再走一次落章路径 ⇒ plan.approvedAt 与 approvedEvidence 逐字节不变；③ 构造「需求已离开来源阶段」后作答 ⇒ 台账零新时间戳、评论 +1、回执 confirmed=false。

## 实施方案（implementation）
改 src/application/internal/confirm-settle.ts：① 新增 SettlePrecondition 计算——gateOpen（该 ref 的运行记录 outcome === undefined）、onSourceStage（req.status === 来源阶段，来源阶段由 src/domain/gate/GateCatalog.ts 的 ARTIFACT_CONFIRM_GATES 反查得到，不另写映射表）；② applyConfirmDecision 入口先算前提，gateOpen===false 或 onSourceStage===false 时返回 {success:true, confirmed:false, advanced:false, note:'该确认已被取代（或需求已推进到 <status>）：本次作答不改变状态'} 并调 recordStaleAnswer 留一条评论，不落章、不推进、不抛；③ 落章写入改为「仅当为空时写」：plan.approvedAt / 产物 confirmedAt / approvedEvidence / confirmedEvidence；④ 新增 recordStaleAnswer（与 recordDeclinedConfirmation 同址），只写评论不碰台账时间戳。

## 上游产出摘要（dependsSummary）
- AskConfirm 改走 requestGate 且陈旧票清理分门

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T09:57:49.986Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

t6 完成：台账从此首写即事实——被取代或已推进的作答只留痕，不再改写审批时间与证据原文。

### 完成项

- 落章两前提落地：尚未落章（首写之前）∧ 需求仍在该门来源阶段；来源阶段由门值域反查
- 首写即事实：产物 confirmedAt/证据、计划 approvedAt/证据一律「仅当为空时写」
- 被取代/已推进的作答走中性通道：recordStaleAnswer 只留痕，回执 confirmed:false，不落章不推进不抛
- 超显式 stale 通道让调用方不必猜 note；AskConfirm 据此组装回执
- 新增 4 例用例 + 相邻 6 套件 61 例全绿；tsc 0 错
- 研发 t-1c7ffb / 复核 t-d09bda 两张子卡均完成；一处实现口径差异（gateOpen 取台账形式）已如实登记

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `src/application/use-cases/AskConfirm.ts`
- `tests/confirm-settle-preconditions.test.ts`

### 下一步

下一步 t7：迟到作答在后台续跑路径上接到中性通道（再依赖 t6）。

---
