---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 拆分计划（REQ-261007100513-6749 PM 插件 token 与耗时治理）

> 目标（人能读的一段）：把「每轮重发整段 system prompt」改成「稳定头 + 尾部增量」，把记账
> 从「一次一卡一往返」改成「一次批量 + 回执自带树摘要」，并给子卡装上 60 次请求的软预算。
> 做法：先定死接口与数据契约（t1），再分两条独立线落地——上下文分层（t2→t3）与记账合并（t4）、
> 子卡预算（t5）；度量命令（t6）与兼容回归（t7）并行。**不新增工具、不 bump schema、不改门禁判据**。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定 |
| I-x | interfaces.md 接口清单 | 接口 |
| S-x | backend.md 服务与接口实现 | 服务/模块 |
| TC-x | test-cases.md 用例表 | 测试用例 |
| t-x | 本文档任务表 | 任务 |

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点 | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 定死接口与数据契约（端口 / 可选字段 / 逐项结果类型） | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 | I-1~I-5 + src/application/ports.ts, src/shared/protocol.ts, src/client/types.ts, src/application/query/QueryStageDetail.ts, src/application/internal/sheet-tasks.ts, src/application/query/QueryDag.ts, src/http/routers/stages.ts | — | D-1 | implement | backend | — | M | ① `pnpm typecheck` 零错；② 新端口与新可选字段的类型存在性断言（`npx vitest run tests/contract-types.test.ts` 绿）；③ `pnpm build:client` 退出码 0（客户端镜像同步，C-12） | dev,review |
| t2 | （落库后回填） | 头部段稳定化：易变内容移出 system prompt | FR-1 | I-3 + src/application/internal/capture-section.ts, src/gate-wiring.ts, src/application/internal/volatile-notice.ts | — | D-1 | implement | backend | t1 | M | ① `npx vitest run tests/capture-section-stability.test.ts`：同 (facts,tasks) 两次组装逐字节相等，且 status/在制卡变化后仍相等；② 既有 `tests/capture.test.ts`、`tests/stage-prompts.test.ts` 全绿（断言语义不变） | dev,review |
| t3 | （落库后回填） | 尾部增量投递：内容哈希去重、去抖与降级兜底 | FR-2, FR-3 | I-2, I-3 + src/application/internal/notice-delivery.ts, src/adapters/VolatileNoticeAdapter.ts, src/application/internal/injection-log.ts, src/domain/limits.ts, src/index.ts | — | D-1 | implement | backend | t1, t2 | M | ① `npx vitest run tests/volatile-notice.test.ts`：相同文本只投 1 次、走 `next-step`、路径无 `followup`；两态往返投递 ≤2；通道不可得时退回头部且留痕（不静默）；② 投递后紧邻请求增量 ≤ 该段估算 token 数 | dev,review |
| t4 | （落库后回填） | 记账批量推进：逐项结果、回执树摘要、节流结构化 | FR-4, FR-5 | I-1 + src/application/use-cases/MoveTask.ts, src/tools/TaskMoveTool/TaskMoveTool.ts, src/application/use-cases/TaskTree.ts, src/domain/workflow/DoneEvidenceSpec.ts | — | D-2 | implement | backend | t1 | M | ① `npx vitest run tests/task-move-batch.test.ts`：3 卡全成 + 混合批（2 成 1 拒且不回滚）+ 重复项拒 + 旧单卡 11 键不变；② `npx vitest run tests/done-throttle-guidance.test.ts`：节流回执含 `throttleRemainingMs` 与 `guidance`，子卡仍豁免 | dev,review |
| t5 | （落库后回填） | 子卡预算软门禁：计数、到顶先停后报、幂等放行 | FR-6 | I-4, I-5 + src/application/internal/subtask-budget.ts, src/application/internal/request-counter.ts, src/application/internal/task-comment.ts, src/application/use-cases/ExecuteTask.ts, src/application/internal/awaiting-confirm.ts, src/domain/limits.ts | — | D-2, D-3 | implement | backend | t1, t3 | L→拆 | ① `npx vitest run tests/subtask-budget.test.ts`：预算 3 次时第 3 次后不再发起请求、**停止时刻早于汇报时刻**、未放行不续跑、放行幂等、计数不可得时标注「计数不可得」；② 放行只写卡评论不改状态机 | dev,review |
| t6 | （落库后回填） | 固化同口径成本度量命令 | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 | 度量口径（无接口编号）+ scripts/token-cost-report.mts, package.json | — | D-1 | test | backend | — | S | ① `pnpm cost:report --req REQ-261006130057-7a43` 输出的请求数 / 未命中 / 命中缓存 / 输出 / 墙钟与诊断报告基线一致（2,324 / 9,484,808 / 402,700,547 / 1,400,237 / 21.0h±）；② 输出含缓存失效点清单（`cacheReadTokens<20000 且 inputTokens>40000` + 前 60s 是否有 `system/message`） | dev,review |
| t7 | （落库后回填） | 兼容与迁移回归：旧调用方、旧台账、豁免口径 | FR-6 | I-1 + tests/legacy-compat.test.ts | — | D-3 | test | backend | t4, t5 | S | ① `npx vitest run tests/legacy-compat.test.ts`：无 `budgetRequests` 的旧卡按 60 起算；旧单卡 `task_move` 返回体键集合不变；子卡 done 仍豁免 60s 节流；② `pnpm baseline:check` 新增失败数 = 0 | dev,review |

- **t1 的验收标准写「零错」不算空话**：它挂的是 `pnpm typecheck` 与存在性断言（可跑、可失败）。
- **t5 的工作量标 L→拆**：其 footprint 合成量 10.8 DU 虽在容量 16 以内，但「计数源 + 挂起 + 放行」三件独立事，实施时按 `subtask-budget`（计数/放行纯判定）与「到顶挂起接线」两个子卡段推进。
- **所有卡 `skipIntegration`**：本仓无对外可联调接口（纯插件内部行为变更），联调段不产生物。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | I-1, I-3（2） | S-1（1） | TC-1, TC-8（2） | t1, t2, t6（3） | ✅ |
| FR-2 | I-2, I-3（2） | S-1（1） | TC-2, TC-7, TC-8（3） | t1, t3, t6（3） | ✅ |
| FR-3 | I-2, I-3（2） | S-1（1） | TC-3, TC-8（2） | t3, t6（2） | ✅ |
| FR-4 | I-1（1） | S-2（1） | TC-4, TC-8（2） | t1, t4, t6（3） | ✅ |
| FR-5 | I-1（1） | S-2（1） | TC-5, TC-8（2） | t4, t6（2） | ✅ |
| FR-6 | I-1, I-4, I-5（3） | S-3（1） | TC-6, TC-8（2） | t1, t5, t6, t7（4） | ✅ |
| **合计** | **5 接口** | **3 模块** | **8 用例** | **7 任务** | **6/6 条款有主** |

（反向核对：I-1~I-5 全被认领；S-1~S-3 全被认领；TC-1~TC-8 全被认领——无超范围设计。）

## 覆盖完整性规则说明

- 本需求 `sides=backend`，**无 UI 卡**，故「原型锚点」列全为「—」，不产原型（需求文档「边界」已声明）。
- 纯文档/度量卡（t6）的接口格写「度量口径（无接口编号）」并给理由：它是验收度量命令，不对外暴露接口。
- 关联 D-x：t1 承接 D-1（立项范围）、t4 承接 D-2（范围含记账合并）、t5 承接 D-2 与 D-3（预算语义）、t7 承接 D-3（软门禁的兼容口径）。

## 边界与回退

- 与设计矛盾时**退回设计**改计划，不在本阶段私改设计。
- 若 t3 的尾部注入通道经实测不可得（宿主不给 `agent.inbox`），**不静默降级**：此时 t3 按其验收标准的降级分支交付（退回头部 + 留痕），并在需求评论里报「缓存优化未达成，仅保留 FR-3 去抖与本条告警」，由人决定是否继续 t5。
- 若 t5 的 `assistant/message` 计数源在两条派发路线上都不可得：按 data-model 的既有约定落到「计数不可得」显式降级，**不按 0 通过**，并报该卡为「部分交付」。
