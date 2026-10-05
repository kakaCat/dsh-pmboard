---
req_id: REQ-261004154937-2ca3
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 拆分计划（REQ-261004154937-2ca3）

> 依据：`design/{architecture,interfaces,data-model,use-cases,test-cases}.md`（均已确认）。
> **契约卡先行**：t1 先把「快照新形状 + 差值纯函数」定死（`design/interfaces.md` §数据契约、`design/data-model.md` §差值语义），
> t2/t3 才能安全地接线与展示。
> 纪律：每卡 acceptance 必须能跑；无接口可联调的卡 `skipIntegration`（避免空联调段）。

## 目标

把 token 读数的口径从「执行窗口单会话」改为「**本窗口 + 其全部后代子代理会话**」：快照带 `members` 逐成员留痕，
差值逐成员算（新成员全额、消失成员记 0、取不到的不进合计只标 degraded）；展示与预算闸的口径差异写进文档。

## 改动盘点

| 文件/区域 | 动作 | 归属卡 |
|---|---|---|
| `src/shared/protocol.ts` | 修改（`TokenSnapshot` 增 `scope` / `members` / `degradedMembers` / `degradedReason`；新增成员类型） | t1 |
| `src/domain/token/lineage.ts` | **新增**（纯函数：`descendantsOf(headers, rootId)` 血缘闭包 + `deltaSnapshots(start, end)` 五态差值） | t1 |
| `tests/lineage-delta.test.ts` | **新增**（TC-1 聚合/恒等式 + TC-2 五态差值；含红态自证） | t1 |
| `src/application/ports.ts` | 修改（`descendantSessions` 端口方法 + 类型；`tokenTotals` 语义注释更新） | t2 |
| `src/adapters/SessionProbeAdapter.ts` | 修改（枚举走 `sessionPersistence.list()`、取数走 `sessionProjectionCache.cachedSnapshot`、有界冷读、降级标注） | t2 |
| `src/index.ts` | 修改（`ctx.inject(['sessionPersistence','sessionProjectionCache'])` 注入 + 传给适配器；**绝不直接读属性**） | t2 |
| `tests/session-probe-lineage.test.ts` | **新增**（TC-3 缺失不补 0 / 服务缺失降级 / fork 窗口不算子代理） | t2 |
| `src/application/internal/token-usage.ts` | 修改（两处 `subBuckets(...totals)` 改为 `deltaSnapshots(start, end)`：`:78` 阶段累计、`:104` 执行差值） | t3 |
| `src/client/token-info.ts` | 修改（Token tab 口径说明：含子代理 / 预算闸不含 / 历史分界 / 未取到的子会话数） | t3 |
| `src/client/views/board.ts`、`src/client/views/artifacts.ts` | 修改（卡面 token 徽章 `title` 加「含子代理」） | t3 |
| `tests/token-tab.test.ts` | 修改（文案断言；既有断言不动） | t3 |
| `docs/requirements/REQ-261004154937-2ca3/evidence/` | **新增**（真数据取证脚本 + 红态输出 + 兼容回归对照 + 基线 diff） | t4 |

**不动**：`src/application/internal/chain-budget.ts`（预算闸口径不变）、DSH 本体（不请求 token-meter 加血缘聚合）、
已落台账的历史快照（不回填）。

## 任务表

| key | 标题 | phase | side | depends_on | serves |
|---|---|---|---|---|---|
| t1 | 定死契约与差值规则：快照带成员、差值逐成员算（纯函数） | implement | backend | — | FR-1, FR-2 |
| t2 | 让快照真的看得见子代理：血缘枚举 + 缓存优先取数 + 缺失不补 0 | implement | backend | t1 | FR-1, FR-3 |
| t3 | 两级差值换口径 + 把「含子代理 / 闸门不含 / 历史分界」写在明处 | implement | fullstack | t2 | FR-2, FR-4 |
| t4 | 收口：真数据取证 + 兼容回归 + 预算闸未动 + 构建基线（收口） | test | fullstack | t1, t2, t3 | FR-1, FR-3, FR-5 |

**并行说明**：t1 是纯函数与类型（无 IO），t2 依赖它的类型与规则；t3 只改两处差值调用点与文案；
t4 是链尾收口（真数据取证要等前三张都落地）。

## 覆盖对照表

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t1, t2, t4 |
| FR-2 | t1, t3 |
| FR-3 | t2, t4 |
| FR-4 | t3 |
| FR-5 | t4 |

## 各卡验收（可证伪）

- **t1**：`./node_modules/.bin/vitest run tests/lineage-delta.test.ts` 全绿，逐条含：
  TC-1a 主+2 子 → `totals == 主+子1+子2` 且 `totals === Σ members[].totals`；TC-1b 主+0 子 → 与自身逐字相同；
  TC-1c 三层血缘 `depth` 0/1/2；TC-1d fork 窗口（`delegationDepth:0` 且非 subagent）**不算**后代；
  TC-2a 同名成员相减；TC-2b 新成员**全额**；TC-2c 消失成员**记 0 不记负**；TC-2d `seq` 缺失该成员不参与且标 degraded；
  TC-2e 旧快照（缺 `members`）退化为总数相减并标 `legacy-snapshot`，**不抛错**。
  **红态自证**：把聚合关掉（只算自身）→ TC-1a 红；把新成员改成只算增量 → TC-2b 红；红绿输出存档。
- **t2**：`./node_modules/.bin/vitest run tests/session-probe-lineage.test.ts` 全绿，逐条含：
  注入假 `sessionPersistence`（三条 header：主 / 子 / 孙）+ 假 `sessionProjectionCache` → 闭包含全部后代且 `depth` 正确；
  某后代缓存未命中且超冷读预算 → 进 `degradedMembers`、**不进 totals**、`degradedReason='cold-read-budget'`；
  两个服务都缺失 → `scope='self'` 且 `degradedReason='descendants-unavailable'`，数字与自身路径逐字相同；
  fork 窗口（`parentSession` 有但 `delegationDepth:0`）不算后代。
- **t3**：`./node_modules/.bin/vitest run tests/token-tab.test.ts tests/token-endpoint.test.ts` 全绿；
  两处差值调用点已全部改用 `deltaSnapshots`（`grep -c "subBuckets(" src/application/internal/token-usage.ts` 为 0）；
  Token tab 口径说明含「含子代理」「预算闸」「上线前」三段（结构断言）；
  卡面与列表徽章 `title` 含「含子代理」；`tests/chain-budget*.test.ts`（预算闸）用例**一条不改仍全绿**。
- **t4**：`./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts`
  输出「聚合读数 vs 独立复算」两个数字且一致（或偏差按 `design/architecture.md` 已知偏差表解释，并写明是哪一条）；
  `pnpm test` 的失败文件集合与开工前**逐文件相同**（贴 diff）；`pnpm typecheck` 错误数 ≤ 146；
  `pnpm build` 退出码 0 且 `[verify-client] OK`。

## 兼容与回滚

- **旧快照**：新字段全可选；旧快照参与差值走 `legacy-snapshot` 退化（不抛错、不回填）。
- **服务不可得**（老宿主）：退回今天的行为并标 `descendants-unavailable`——**不假装聚合过**。
- **无子代理窗口**：数字与改造前**逐字相同**（t1 的 TC-1b + t4 的兼容回归双重锁）。
- **预算闸**：口径与阈值都不动（t4 用既有预算闸用例证明"一条没改"）。
- **回滚**：`tokenTotals` 恢复为只读本窗口会话即可；多出来的字段是可选键，旧读法忽略。

## 边界（不做）

与需求文档「边界」三条一致：不改预算闸判据与阈值；不改 DSH 本体；不回填历史快照。
没写进边界的即本次不做。
