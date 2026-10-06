---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
sides: [frontend, backend]
---

# 需求说明（REQ-261005122915-9f90 修「批准即落库」幂等误判：回退重做卡不得冒充已落库，并补看板「清理误物化重做卡」入口）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。

## TL;DR

- **是什么**：「回退 → 重新批准计划」这条路上，上一轮回退物化出来的**重做卡**被当成「已落库的任务」，
  于是新计划**一张卡都没落**，需求状态却照样推进到实施。
- **为什么**：落库幂等判据只看「有没有未取消任务」，而回退恰好会留下一批占位重做卡；
  两条批准路径又把这次误判当成功继续推进，且设计里承诺的「看板清理按钮」从未接线。
- **得到什么**：重做卡不再冒充已落库；回退态重新落库前先收掉上一轮重做卡（三条入口同一实现）；
  落库没真发生就不推进；看板需求详情补上「清理误物化重做卡」按钮。

## 产品定义

**回退**（把需求退回上游阶段）是给人用的逃生门；**批准计划**是「批准即落库」的唯一人工闸门。
2026-10-05 实测这两件事撞在一起时，系统会**假装成功**：

```
回退 implementing → decomposing
  └─ 13 张旧卡 canceled + 13 张 [重做] 占位卡（todo）
       │
       └─ 重新提交 23 卡计划 → 人批准
            ├─ landApprovedPlan 幂等判据命中 13 张重做卡
            │     → alreadyLanded=13、created=[]（23 张新卡一张不落）
            └─ 两条批准路径仍推进到 implementing
                  → 状态「实施中」，DAG 上跑的是 13 张**旧计划范围**的卡
                     人以为在跑批准的 23 张
```

现场（REQ-261005105032-3b02，本次实测，可复核）：

| 读数 | 值 | 来源 |
|---|---|---|
| 需求状态 | `implementing` | 台账 `record.json` / 看板阶段 API |
| 已批准计划 | 23 个任务（`approvedAt` 有值） | `plan.json` |
| 队列卡数 | 26 = 13 `canceled` + 13 `[重做]` `todo` | `queue.json` |
| **新计划落库数** | **0** | 看板阶段 API：implementing 泳道 26 张全为上述两类 |
| 13 张重做卡执行记录 | 0 次（全 todo） | `queue.json` `executions` |

台账评论原文（人批准那一刻写下的，`1791173971682`）：

> [自动开跑] 批准拆分计划 → **已落库 13 张卡**（收尾步骤报错：该需求已落库 13 个未取消任务，跳过重复拆分（幂等））→ 自动进入实施

这句「已落库 13 张卡」是**假账**：那 13 张是回退的占位重做卡，不是新计划的卡。

根因（五条，逐条对应 FR）：

1. `landApprovedPlan` 的幂等判据是「存在任一未取消任务即视为已落库」，重做卡命中后返回 `created: []`；
2. 「回退态先收掉上一轮重做卡」只写在手动 `reqboard_decompose` 路径，两条批准路径（弹框 / 看板）没有；
3. 两条批准路径把失败当成功：弹框路径用「未取消任务数 > 0」当落库证据，看板路径不看 `alreadyLanded` 就推进；
4. `planRollbackTasks` 把 `reworkOf` 非空的重做卡归入「子卡复位」（改回 todo）而不是取消 —— 再回退一次也清不掉；
5. 设计文档写明「人在看板点按钮」的批量清理入口（REQ-261004121649-bfa7 `design/interfaces.md`、`use-cases.md`），
   服务端 HTTP 路由已交付，但客户端从未接线：看板里**没有这个按钮**，人无法自救。

## 用户与角色

- **窗口 agent**：执行回退与重新拆分的人。需要「落库没发生」这件事被响亮报出，而不是被当成幂等跳过。
- **人工决策者**：在看板上批准计划、清理误物化卡的人。需要看板上有可点的清理入口与可核对回执。
- **后续维护者**：需要三条落库入口行为一致（同一份实现），而不是各自漂移。

## 边界

**做**（三条）：

1. 修**落库幂等误判**与**回退态重做卡收敛**，并把收敛收成**单一实现**供三条落库入口共用；
2. 修**落库未发生却推进**的两条批准路径（响亮留痕 + 不推进）；
3. 补**看板需求详情「清理误物化重做卡」入口**（调用既有 `POST /req/rollback-cleanup`，展示可核对回执）。

**不做**（三条）：

1. 不改回退阶段语义与 `RollbackSpec`、不改回退物化的既有规则（那是 REQ-261004121649-bfa7 的范围）；
2. 不改 `POST /req/rollback-cleanup` 的既有请求/响应协议，也不新增 agent 可调用的清场工具（保持「仅人」）；
3. 不改队列文件与台账 schema（本次为加性修复，无数据迁移）。

## 功能点

- **FR-1: 落库幂等判据不得把回退重做卡当成「已落库」**
  `landApprovedPlan` 的幂等判定必须以「**非重做卡**的活卡」为准：`reworkOf` 非空的卡是占位卡，
  不得计入 `alreadyLanded`。批了 23 张、队列里只有占位卡时，必须真的落 23 张。

- **FR-2: 回退态重新落库前先收掉上一轮重做卡，且该处置为单一实现、三入口共用**
  手动 `reqboard_decompose`、弹框批准（`confirm-settle`）、看板批准（`handlePlanDecision`）
  三条落库入口必须走**同一份**「回退态收敛重做卡」实现（现状只有手动路径有 → 漂移即本缺陷）。
  收敛动作：把 `reworkOf` 非空的活卡置 `canceled` 并留痕「已被新计划取代」。

- **FR-3: 落库未真正发生（本次新落 0 张）时不得推进阶段，并响亮留痕**
  两条批准路径都必须区分「已落库（幂等命中真卡）」与「一张也没落」：
  后者**不推进** `implementing`，写系统评论（含原因与恢复路径）并给出结构化告警；
  禁止再用「未取消任务数 > 0」当作落库成功的证据（重做卡会让它恒真）。

- **FR-4: 再次回退时，重做卡必须被取消而不是复位**
  `planRollbackTasks` 的「子卡原地复位」不得作用于 `reworkOf` 非空的占位卡：
  占位卡没有子卡身份（无 `parentId`），复位的实际后果是它留在顶层继续污染下一次幂等判定；
  正确处置是随该轮回退一并 `canceled`。

- **FR-5: 看板需求详情提供「清理误物化重做卡」入口，并展示可核对回执**
  入口按该需求当前回退序号调用既有 `POST /dashboard/api/reqboard/req/rollback-cleanup`
  （`{id, rollbackSeq}`），展示回执的 `matchedBy` / `canceled` / `restoredLinks` / `skipped`（逐条原因）；
  无回退记录或缺序号时按钮明确禁用并说明原因；错误码（`REQBOARD_UNKNOWN_ROLLBACK_SEQ` /
  `REQBOARD_NOT_FOUND`）原样透出，不静默。

## 接口与契约（本次新增/变更）

- **服务端**：`POST /dashboard/api/reqboard/req/rollback-cleanup` **协议不变**
  （入参 `{id, rollbackSeq, reason?}`；出参 `{canceled, restoredLinks, matchedBy, skipped[], note}`）。
- **客户端新增调用**：需求详情操作区新增一个调用点（当前 `src/client/api.ts` 无此函数，需补）。
  禁用判据：需求无 `rollback` 记录。有记录但无 `seq` 时按既有服务端口径（存量记录允许任意序号）放行并注明。
- **数据契约**：不新增字段、不改必填性。读侧新增一条派生口径「活卡 = 未取消且 `reworkOf` 为空」，
  仅用于落库幂等判定，不落盘。
- **兼容与迁移**：加性修复，无迁移；存量需求（含本次现场 REQ-261005105032-3b02）在修复后
  可直接「清场 → 重新落库」复位，不需要改历史数据。

## 验收口径（可跑）

1. `npx vitest run tests/rollback-materialize.test.ts tests/rollback-cleanup.test.ts` → 全绿；
2. **新增/补充回归（本需求核心判据）**：构造「回退后队列只剩 `reworkOf` 非空的占位卡」的状态，
   调 `landApprovedPlan` → `createdCount` **等于批准计划的任务数**（不是 0），`alreadyLanded === 0`；
3. 构造「落库确实一张也没落」的场景（如覆盖门禁抛错）→ 需求状态**保持 `decomposing`**，
   且台账出现含原因与恢复路径的系统评论（不推进）；
4. 再次回退（第二轮）后，原占位重做卡状态为 `canceled`，**不得**回到 `todo`；
5. 看板需求详情出现「清理误物化重做卡」按钮；点击后回执区显示 `matchedBy` 与逐条 `skipped` 原因；
   无回退记录的需求上该按钮为禁用态并给出原因文案；
6. **现场复演**：对 REQ-261005105032-3b02 执行「清场（第 1 次回退）→ 重新落库」→
   队列活卡等于其已批准的 23 卡计划，且需求状态与落库结果一致。

## 立据

- 现场台账：`~/.dsh/reqboard/requirements/REQ-261005105032-3b02/`（`record.json` / `comments.jsonl` `1791173971682`）；
  队列 `docs/requirements/REQ-261005105032-3b02/queue.json`；
- 相关实现：`src/application/internal/approved-plan-landing.ts:103`（幂等判据）、
  `src/application/internal/confirm-settle.ts:283,337`（两条批准路径的推进）、
  `src/application/use-cases/Decompose.ts:219`（只此一处有收敛）、
  `src/application/internal/rollback-tasks.ts:93-109`（占位卡被复位）、
  `src/http/routers/requirements.ts:298`（看板批准路径推进）；
- 设计承诺（未交付）：`docs/requirements/REQ-261004121649-bfa7/design/interfaces.md:32-35`、`design/use-cases.md:24`；
- 前序事故同族：`docs/requirements/REQ-261001203710-0fbf/notes/rollback-card-explosion.md`（同一次「新计划没落上」）。
- **相关发现（不在本需求范围）**：立项时本窗口命中一次
  `REQBOARD_PROJECT_ROOT_MISMATCH`——`docs`/`queueRepo` 的 workspaceRoot 是**进程级单例**，
  任一窗口调用 reqboard 工具都会按该窗口 cwd 覆写它；并发窗口（本机同时有 notice-webhook 窗口）
  互相踩即可让写入被守卫拒绝。建议另行立项，本需求不夹带。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | 🔴 **未被接收** | — |
| FR-2 | 🔴 **未被接收** | — |
| FR-3 | 🔴 **未被接收** | — |
| FR-4 | 🔴 **未被接收** | — |
| FR-5 | 🔴 **未被接收** | — |

> 🔴 **未被接收（5 条）**：FR-1、FR-2、FR-3、FR-4、FR-5

<!-- reqboard:marks:end -->
