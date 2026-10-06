---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 拆分计划（REQ-261005122915-9f90 修「批准即落库」幂等误判 + 看板清场入口）

> 需求：`docs/requirements/REQ-261005122915-9f90/requirement.md`（FR-1~FR-5）
> 设计：同目录 `design/`（architecture / interfaces / data-model / test-cases / use-cases / frontend / backend）
> 现场：REQ-261005105032-3b02（状态 `implementing`、已批准 23 卡、队列 0 张新卡、13 张占位卡 `todo`）

## §1 改动盘点（逐份对照设计）

| 设计文档 | 被哪张卡兑现 | 改动性质 |
|---|---|---|
| `design/architecture.md` | t1（判据单点）、t2（单一实现收敛）、t3（落库判据）、t4（推进判据） | 新增 2 个模块 + 2 处判据替换 |
| `design/interfaces.md` | t3（`staleReworkCanceled` 返回体）、t6（客户端新调用与 DOM 契约） | 1 处返回体加字段 + 1 个新客户端函数 |
| `design/data-model.md` | t1（真卡/占位卡口径单点）、t8（兼容核对：无 schema 改动、无迁移） | 纯读侧口径 + 兼容核对 |
| `design/test-cases.md` | t1~t8 的 acceptance 逐条对应；t7 专做逆验证与现场复演 | 新增 4 个测试文件 |
| `design/use-cases.md` | UC-1/2 → t3、t4；UC-3 → t6；UC-4 → t5；UC-5 → t7 | 用例即验收脚本 |
| `design/backend.md` | t2、t3、t4、t5、t8（服务端 6 处改动，逐条对号） | application / domain / http |
| `design/frontend.md` | t6（api + 操作条按钮 + 事件通道 + 回执展示） | client 三文件 |

**零改动项（设计明确要求不动的）**：`POST /req/rollback-cleanup` 协议、`RollbackSpec` 阶段语义、
队列文件与台账 schema、agent 侧清场工具面（始终不存在）。

## §2 RTM 覆盖对照表（每条 FR 的落点）

| 条款 | 承载卡 | 说明 |
|---|---|---|
| FR-1 落库幂等不得把占位卡当已落库 | t1, t3 | t1 给判据，t3 用它替换 `existing.length > 0` |
| FR-2 回退态收敛收成单一实现、三入口共用 | t2, t3 | t2 抽模块 + 手动路径改调；t3 在批准路径前置调用 |
| FR-3 落库没真发生不推进、响亮留痕 | t4 | 弹框路径与看板路径各一处判据收窄 |
| FR-4 再次回退时占位卡取消而非复位 | t5 | `resetTasks` 过滤占位卡 |
| FR-5 看板清理入口 + 可核对回执 | t6 | api + 操作条按钮 + 回执展示 |
| 逆验证与现场复演（验收口径 1~6） | t7 | 三条逆验证必须红 + 3b02 现场复演 |
| 兼容与存量核对（无迁移） | t8 | `alreadyLanded` 语义收窄的消费者盘点 |

## §3 任务表

| key | 标题 | phase | side | depends_on | template | 体量 DU |
|---|---|---|---|---|---|---|
| t1 | 定义占位卡判据单点（isReworkPlaceholder / liveRealCards） | implement | backend | — | change-only | 3.8 |
| t2 | 抽「回退态收敛占位卡」为单一实现并让手动拆分改调 | implement | backend | t1 | change-only | 5.6 |
| t3 | 落库幂等只看真卡 + 回退态前置收敛（landApprovedPlan） | implement | backend | t1, t2 | change-only | 5.25 |
| t4 | 两条批准路径推进判据收窄：落库没真发生就不推进 | implement | backend | t3 | change-only | 6.25 |
| t5 | 再次回退时占位卡取消而非复位（planRollbackTasks 分流） | implement | backend | t1 | change-only | 3.85 |
| t6 | 看板需求详情接上「清理误物化重做卡」入口与回执 | ui | frontend | — | change-only | 7.3 |
| t7 | 逆验证（三条必红）与 3b02 现场复演证据 | test | fullstack | t3, t4, t5, t6 | acceptance | 5.5 |
| t8 | 兼容与存量核对：语义收窄的消费者盘点、无迁移确认 | test | backend | t3 | change-only | 2.75 |

无超容量卡（单卡上限 16 DU，最大 7.3）。

## §4 逐卡实施与验收

### t1 定义占位卡判据单点
- **实施**：新增 `src/domain/task/ReworkPlaceholder.ts`，导出 `isReworkPlaceholder(t)`（判据：`reworkOf` 非空）
  与 `liveRealCards(tasks)`（判据：`status !== 'canceled'` 且非占位）。零外部依赖（层边界只许向内）。
  新增 `tests/rework-placeholder.test.ts`。
- **验收**：`npx vitest run tests/rework-placeholder.test.ts` 全绿，且含断言：占位卡不进 `liveRealCards`、
  `canceled` 卡不进、普通真卡进。

### t2 抽「回退态收敛占位卡」为单一实现
- **实施**：新增 `src/application/internal/stale-rework.ts` 导出 `cancelStaleReworkCards`（置 `canceled` +
  追加 `kind:'rollback'` 修订；无候选不写盘）。把 `src/application/use-cases/Decompose.ts` 的内联
  mutateQueue 块（现 219~241 行）替换为调用该模块。新增 `tests/decompose-stale-rework.test.ts`。
- **验收**：`npx vitest run tests/decompose-stale-rework.test.ts` 全绿：① 回退态落库后占位卡全 `canceled`；
  ② 无占位卡时 queue.json **mtime 不变**（不写盘）；③ 修订理由含「已被新计划取代」。

### t3 落库幂等只看真卡 + 回退态前置收敛
- **实施**：改 `src/application/internal/approved-plan-landing.ts`：① 计算 `rollbackTo`（口径照抄 `Decompose.ts`）；
  ② `rollbackTo !== undefined` → 先 `await cancelStaleReworkCards(...)`；③ 幂等判定改为
  `checkDecomposeIdempotency(fresh.status, liveRealCards(tasks), { rollbackTo })`；④ 返回体加
  `staleReworkCanceled`、`alreadyLanded` 语义收窄为真卡数。新增 `tests/approved-plan-landing-rework.test.ts`。
- **验收**：`npx vitest run tests/approved-plan-landing-rework.test.ts` 全绿，含：① 队列预置 N 张占位卡 +
  已批准 M 卡计划 → `createdCount === M`、`alreadyLanded === 0`、`staleReworkCanceled === N`；
  ② 连调两次 → 第二次 `createdCount === 0`、`alreadyLanded === M`、queue.json mtime 不变；
  ③ 非回退态已有真卡 → 仍幂等跳过（事故 B 防线）。

### t4 两条批准路径推进判据收窄
- **实施**：改 `src/application/internal/confirm-settle.ts`：落地证据由「未取消卡数」换「真卡数」
  （`liveRealCards` 取数）；`alreadyLanded > 0` 分支保留但凭真卡成立。改
  `src/http/routers/requirements.ts` 的 `handlePlanDecision`：仅 `createdCount > 0 || alreadyLanded > 0`
  才 `transitionRequirement('implementing')`，否则写失败评论 + `landing.failed`、不推进。
  新增 `tests/confirm-settle-landing-gate.test.ts`。
- **验收**：`npx vitest run tests/confirm-settle-landing-gate.test.ts` 全绿：① 覆盖门禁抛错且队列只剩占位卡 →
  状态仍 `decomposing`、有含恢复路径的系统评论、`advance.pausedReason` 非空；② 正常落库 → 仍推进；
  ③ 看板路径同一判据（不推进且 `landing.failed === true`）。

### t5 再次回退时占位卡取消而非复位
- **实施**：改 `src/application/internal/rollback-tasks.ts`：`resetTasks` 过滤加 `!isReworkPlaceholder(c)`；
  占位卡留在 `canceled` 数组（调用方写入路径不变）。在 `tests/rollback-materialize.test.ts` 增补断言。
- **验收**：`npx vitest run tests/rollback-materialize.test.ts` 全绿，含新增断言：第二轮回退后占位卡
  状态为 `canceled`（**修复前该断言必红**）、真子卡仍复位为 `todo`、`reworkDrafts` 仍为 0。

### t6 看板需求详情接上清场入口与回执
- **实施**：在 `src/client/api.ts` 加 `rollbackCleanup`（复用 `post` 助手）；在
  `src/client/views/stage-detail.ts` 的 `renderActionBar` 追加按钮（条件 `req.rollback !== undefined`，
  `data-seq = rollback.seq ?? 1`）；在 `src/client/board-mount.ts` 加 `case 'rollback-cleanup'`
  （`confirm` 说明后果 → 调 api → `alert` 逐行展示 `note`/`canceled`/`restoredLinks`/逐条 `skipped`
  → `fetchAll()`）。新增 `tests/client-rollback-cleanup.test.ts`。
- **验收**：`npx vitest run tests/client-rollback-cleanup.test.ts` 全绿：① 有回退记录 → 操作条含
  `data-action="rollback-cleanup"` 且 `data-seq` 正确；② 无回退记录 → 不含该按钮；
  ③ `api.rollbackCleanup` 请求路径与 body 形状正确。

### t7 逆验证与现场复演证据
- **实施**：新增 `tests/rework-inverse-verification.test.ts`（三条逆验证：把判据换回旧实现必须变红）
  与 `scripts/rollback-landing-replay.mts`（对 3b02 现场复演：清场第 1 次回退 → 重新落库 → 打印活卡集）。
- **验收**：逆验证三条各自在「注入旧实现」时红、还原后绿（红/绿输出留档）；复演后
  `queue.json` 活卡集合等于 3b02 已批准的 23 卡计划（逐 key 对齐），并保留清场/落库两条台账评论。

### t8 兼容与存量核对（无迁移）
- **实施**：写 `docs/requirements/REQ-261005122915-9f90/notes/compat-check.md`：盘点 `alreadyLanded`
  的全部消费者（两条批准路径），确认语义收窄无外部契约；确认无 schema/迁移改动。
- **验收**：`npx vitest run tests/rollback-materialize.test.ts tests/rollback-cleanup.test.ts tests/decompose-tools.test.ts`
  全绿；`grep -rn "alreadyLanded" src` 的命中集合与盘点表一致（无遗漏消费者）。

## §5 判定口径与不做

- **完成判据**：§2 每条 FR 至少一张卡接收且验收命令全绿；t7 的逆验证在注入旧实现时必红。
- **不做**：不改清场 HTTP 协议、不改回退阶段语义、不改 schema、不新增 agent 可调用清场工具；
  3b02 的一次性清场与重落库**只作为验证现场**（由人点/由现场剧本执行），不写成产品功能。
