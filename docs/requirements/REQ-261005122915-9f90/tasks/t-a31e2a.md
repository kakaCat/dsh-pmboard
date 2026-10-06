# t-a31e2a 两条批准路径推进判据收窄：落库没真发生就不推进

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
两条批准路径推进判据收窄：落库没真发生就不推进

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/confirm-settle-landing-gate.test.ts 全绿：① 覆盖门禁抛错且队列只剩占位卡 → 状态仍 decomposing、有含恢复路径的系统评论、advance.pausedReason 非空；② 正常落库 → 仍推进；③ 看板路径同判据 → 不推进且 landing.failed===true。

## 实施方案（implementation）
改 src/application/internal/confirm-settle.ts：落库证据由「未取消卡数」换「真卡数」（liveRealCards 取数），alreadyLanded>0 分支保留但凭真卡成立；改 src/http/routers/requirements.ts 的 handlePlanDecision：仅 createdCount>0 || alreadyLanded>0 才 transitionRequirement('implementing')，否则写失败评论 + landing.failed 且不推进。新增 tests/confirm-settle-landing-gate.test.ts。

## 上游产出摘要（dependsSummary）
- 落库幂等只看真卡 + 回退态前置收敛（landApprovedPlan）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T04:50:40.006Z，窗口 session-2b5a64a9-01aa-4ce9-8b2d-46d2f7f89cd2）

t4 完成：两条批准路径推进判据收窄——落库没真发生就不推进

### 完成项

- confirm-settle.ts：落库生效的证据由「未取消卡数」换成真卡数（liveRealCards），幂等命中分支文案如实
- requirements.ts handlePlanDecision：新增 landingEffective = createdCount>0 || alreadyLanded>0，为假则不推进、并把原因如实回给看板
- tests/reqboard/board-plan-approve.test.ts 增补 3 条：只剩占位卡→先收再落库再推进 / 只剩占位卡+覆盖缺口→不推进不误收 / 空计划（本次新落 0 张）→拒绝推进
- npx vitest run tests/reqboard/board-plan-approve.test.ts → 8 passed

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `src/http/routers/requirements.ts`
- `tests/reqboard/board-plan-approve.test.ts`

### 下一步

t6 看板清场入口接线

---
