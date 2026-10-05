# t-ee6da8 wake 活性校验（N-1）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
wake 活性校验（N-1）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
死窗口桩用例通过：wake 返回不受理+driverHealth=paused+诊断评论+lastWakeAt 不刷新；活窗口用例通过：行为同现状；npx vitest run tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts 零回归

## 实施方案（implementation）
① wake 端口返回值改为含受理与否+原因；② ReqboardDiveManager/wake-heartbeat 受理前经注入端口查 agents 注册表；③ 不受理路径写 driverHealth=paused+需求评论诊断；④ 新增死/活窗口用例

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-03T16:28:12.630Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

t5 完成：N-1 闭环——绑定窗口叫不动就如实停下等人（paused+诊断），不再假装健康空转；人的意图（activation）依然不可被运行时改写

### 完成项

- wake 受理前活性校验：绑定窗口无活 agent → 不受理，心跳失败路径转 paused+诊断评论+不刷 lastWakeAt
- N-1 缺口（armed+死窗口=静默停摆）闭环：死窗口不再假装健康
- 活窗口行为逐字保留：受理后走原 onRequirementMoved 路径
- 证据：3 新用例 + dive 26 回归 + 全量 97≤98 零新增

### 改动文件

- `src/application/dive/wake-liveness.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-wake-liveness.test.ts`
- `docs/requirements/REQ-261003222428-3556/tasks/t-ee6da8.md`

### 下一步

t6 绑定改写留痕+人工改绑入口（N-2）

---
