---
req_id: REQ-261003222428-3556
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 拆分计划（REQ-261003222428-3556）

> 依据：design/architecture.md + migration.md（均已确认）。refactor 纪律：
> 一卡一类改动；卡间依赖显式；验收 = 行为等价/行为修正的可证伪证据。

## 目标

让实施链「名义能力 = 实际行为」：锁真死才被接管、并发额度兑现、计划依赖不丢、
单代实现、三条已知缺口关闭——每点带可复跑判据。

## 改动盘点

| 文件/区域 | 动作 | 归属卡 |
|---|---|---|
| `application/use-cases/AdvanceChain.ts` | 修改：锁续租心跳（t1）；批内分层并行（t2） | t1/t2 |
| `application/internal/advance-parallel.ts` | 新增：写集分组（自 batch-scheduler 移植） | t2 |
| `use-cases/StartSubtaskChain.ts`、`internal/background-runner.ts`、`internal/checkpoint-manager.ts`、`internal/batch-scheduler.ts` + 三个专属测试 | 删除 | t4 |
| `tests/` 新增：锁续租 / 并行 / 端到端落库复现 / wake 活性 / 绑定留痕 / 催办聚合用例 | 新增 | t1/t2/t3/t5/t6/t7 |
| Dive 域（wake-heartbeat / ReqboardDiveManager 活性校验） | 修改 | t5 |
| 绑定写入点收编 + 留痕助手 + 改绑入口 | 修改+新增 | t6 |
| 催办聚合（artifact-gates / notify） | 修改 | t7 |
| `reqboard_status` 回执 + schema：新增 `plugin_build` | 修改 | t3 |
| `docs/architecture/automation-chain-contract.md` §5 缺口摘牌 | 修改 | t8 |

## 任务表

| key | 标题 | phase | side | depends_on | serves |
|---|---|---|---|---|---|
| t1 | 推进锁续租心跳 | implement | backend | — | FR-1 |
| t2 | 批内写集分组真并行 | implement | backend | t1 | FR-2 |
| t3 | depends_on 端到端复现 + 构建指纹 | test | backend | — | FR-3 |
| t4 | 死代码清偿（删四文件三测试） | implement | backend | t2 | FR-4 |
| t5 | wake 活性校验（N-1） | implement | backend | — | FR-5 |
| t6 | 绑定改写留痕 + 人工改绑入口（N-2） | implement | backend | — | FR-6 |
| t7 | 产物催办按 kind 聚合 + 成组确认（N-3） | implement | backend | — | FR-7 |
| t8 | 全量回归 + 契约文档摘缺口 | test | backend | t1,t2,t3,t4,t5,t6,t7 | 全部 |

## 各卡验收（可证伪）

- **t1**：假时钟用例——① 心跳在跑 + 越过 `advanceLockStaleMs` → 二次 `advanceRequirement` 返回 `locked`、原 run 不被接管；② 心跳停 + 越过 stale → 接管成功（既有语义等价）；③ 心跳遇他人 runId 不覆写。`npx vitest run tests/advance-lock-heartbeat.test.ts` 全绿。
- **t2**：桩 executeSubtask（deferred）——① 两父卡写集无冲突 → 子卡执行窗口重叠（同时在跑）；② 冲突对/未声明写集对 → 严格串行（后张开始 ≥ 前张结束）；③ 并行组内一败 → 链暂停、成功卡 history 保留。`advance-select` 既有用例零改动通过（行为不变式 1）。
- **t3**：端到端用例走 `landApprovedPlan`（链式 depends_on 计划）→ 断言父卡 dependsOn 逐环成链（真实 id）；`reqboard_status` 回执含 `plugin_build` 且过自身 schema（先声明后实现）。
- **t4**：`grep -rn "StartSubtaskChain\|backgroundRunner\|CheckpointManager\|scheduleBatches" src/` 零命中；tsc 本需求文件零新错；`pnpm test` 失败数 ≤ 98。
- **t5**：死窗口桩 → wake 不受理 + `driverHealth=paused` + 诊断评论、`lastWakeAt` 不刷新；活窗口 → 行为同现状（既有 dive-rearm 用例零回归）。
- **t6**：改绑用例 → 台账留痕含 actor/at/from/to；静态断言用例——临时在助手外文件加 `sourceSessionId` 赋值 → 红（反向演练后还原）；agent 调改绑入口被拒（human_gate）。
- **t7**：登记 5 份 task_detail → 催办聚合成 1 条；一次成组确认 → 5 份全 confirmed；design 成组既有用例零回归。
- **t8**：`pnpm test` 失败数 ≤ 98 且本需求新增用例全绿；`automation-chain-contract.md` §5 三条缺口摘牌（注明关闭于本需求）；说明书变更记录补行。

## 边界（不做）

不碰并行窗口在制文件；不做跨需求调度/模型路由（业务设计需求）；不给写集声明做录入界面（只留接口）。
