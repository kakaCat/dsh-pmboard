# t-3b61dd 回退只动物化该动的卡：子卡原地复位，不再升格成新父卡

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
回退只动物化该动的卡：子卡原地复位，不再升格成新父卡

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) `npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层"` → 全绿：6 张顶层卡 → 物化 6 张；11 张子卡**原地复位**且 `parentId`/`stageKind` 保留；2) 判别力（A/B）：在当前实现下该用例**必红**（能复现 17 → 56 的膨胀）；3) `npx vitest run` 失败数 ≤ 开工基线。

## 实施方案（implementation）
src/application/internal/rollback.ts 的物化段（生成 reworkDrafts 处）：先按 `parentId === undefined` 分流——顶层父卡 → 生成重做草稿（继承标题/phase/side/acceptance，`reworkOf=原卡id`）；子卡 → 收集到新增的 `resetSubtasks` 列表，不再进 reworkDrafts。rollback-tasks.ts 里物化与复位分别落库（复位 = mutate 把 status 置回 todo，**不动** parentId/stageKind）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T06:36:42.837Z，窗口 session-97bd3bf9-d995-4f61-81fa-9d72c58d40f8）

回退不再让子卡升格成新父卡。这一步做完，什么变了——以前一次回退会把每张被取消的卡（含子卡）都物化成顶层新卡，子卡丢了身份、开工时又展开一遍子链，名字递归成「…·研发·研发」（实测 17 张变 73 张）；现在只有顶层父卡物化重做卡，子卡原地复位并保留父子身份，卡片总数不再爆炸。这一条现在是 3 个可复跑的断言，其中一条专门盯住「物化数必须小于卡总数」。

### 完成项

- 交付：回退物化段分流（只有顶层父卡物化重做卡；子卡原地复位并保留 parentId/stageKind），新增 taskPlan.resetTasks（整卡副本），会话侧与看板侧两条回退路径同步消费
- 新增 tests/rollback-materialize.test.ts（3 条用例）；更新 tests/rollback-tasks.test.ts 的严格相等断言到新契约
- 验收命令全过：`-t "只物化顶层"` 3 passed；rollback-materialize 3 passed；rollback-tasks 7 passed
- 类型：146 条（三个改动源文件零错误）；全量：96 failed / 3913 passed（改动前 97 —— 少一条），我的改动面零失败
- 四张子卡（研发 / 联调 / 复核 / 测试）各自完成并留下完工记录
- 两处偏离已定性并留痕：返回值用整卡副本（与 canceled 同形，避免两处写入分叉）；物化段落在 rollback-tasks.ts 而非 rollback.ts（那才是产卡计划处）

### 改动文件

- `src/application/internal/rollback-tasks.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/http/routers/requirements.ts`
- `tests/rollback-materialize.test.ts`
- `tests/rollback-tasks.test.ts`

### 下一步

t2：回退物化幂等 + 上限 20（超限整次拒绝、队列零新增；新错误码 REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT）；t4 重做卡 stages: [] 紧随其后（同一条物化路径）。

---
