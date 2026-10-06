# t-f92ad7 落库幂等只看真卡 + 回退态前置收敛（landApprovedPlan）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
落库幂等只看真卡 + 回退态前置收敛（landApprovedPlan）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/approved-plan-landing-rework.test.ts 全绿：① 预置 N 张占位卡 + 已批准 M 卡计划 → createdCount===M、alreadyLanded===0、staleReworkCanceled===N；② 连调两次 → 第二次 createdCount===0 且 queue.json mtime 不变；③ 非回退态已有真卡 → 仍幂等跳过（事故 B 防线）。

## 实施方案（implementation）
改 src/application/internal/approved-plan-landing.ts：① 计算 rollbackTo（口径照抄 Decompose.ts）；② rollbackTo 有定义时先 await cancelStaleReworkCards；③ 幂等判定改为 checkDecomposeIdempotency(fresh.status, liveRealCards(tasks), { rollbackTo })；④ 返回体加 staleReworkCanceled，alreadyLanded 语义收窄为真卡数。新增 tests/approved-plan-landing-rework.test.ts。

## 上游产出摘要（dependsSummary）
- 抽「回退态收敛占位卡」为单一实现并让手动拆分改调

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T04:50:36.001Z，窗口 session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2）

t3 完成：落库幂等只看真卡 + 回退态前置收敛（现场缺陷本体修复）

### 完成项

- approved-plan-landing.ts：回退态（rollback.to === status）先 cancelStaleReworkCards，再做幂等判定（顺序即语义）
- 幂等判据由 existing.length>0 换成 checkDecomposeIdempotency + liveRealCards（domain 单点）
- 回退态用「顶层真卡」区分「已重建」与「还没重建」，避免同一次回退里重复落库
- 返回体新增 staleReworkCanceled；alreadyLanded 语义收窄为真卡数
- 新增 tests/approved-plan-landing-rework.test.ts：5 条（含 3b02 现场形态：状态已越过回退、占位卡还活着 → 仍必须真落库）
- npx vitest run tests/approved-plan-landing-rework.test.ts → 5 passed；tests/reqboard/plan-landing-parity.test.ts → 7 passed（无回归）

### 改动文件

- `src/application/internal/approved-plan-landing.ts`
- `tests/approved-plan-landing-rework.test.ts`

### 下一步

t4 收窄两条批准路径的推进判据

---
