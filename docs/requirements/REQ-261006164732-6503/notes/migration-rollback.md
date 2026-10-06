# 迁移 / 兼容 / 回滚清单（REQ-261006164732-6503 t12）

> serves: FR-6（判定标准与迁移口径）。依据：设计 [data-model.md](../design/data-model.md) G-1/G-5、
> [backend.md](../design/backend.md) B-3/B-7。本文只写**会被别的需求引用**的口径。

## 1. 零 schema 变更的依据

| 面 | 结论 | 依据 |
|---|---|---|
| 数据库 | **本需求不碰数据库**：改动集中在确认门的生命周期与提示词文案 | 设计 G-1；`git diff --name-only` 里无迁移脚本、无 SQL |
| 门的存储 | 门是**进程内**结构（`PendingConfirmRegistry` 的 `records` Map），本来就不落盘 | 设计 G-1/G-2；`findOpen` 是纯读，不新增字段 |
| 台账字段 | 不新增键、不改键名；新增的只有 `ConfirmDecisionOutcome.stale`（**返回值通道**，非持久字段） | 设计 G-2 与 interfaces.md I-6 |

**不做的**：无 DDL、无数据回填、无双读开关、无灰度配置（判据幂等，回滚即还原代码）。

## 2. 旧调用方核对

| 调用方 | 是否受影响 | 证据 |
|---|---|---|
| `reqboard_ask_confirm` 的**参数** | 零变更（新增的 `adopted_ticket` 是**内部**参数，工具面不暴露） | interfaces.md I-3；`tests/output-contract.test.ts` |
| `reqboard_ask_confirm` 的**返回键** | 零新增：复用分支只用既有 `pending`/`ticket`/`note`；迟到作答分支用既有 `confirmed`/`advanced`/`note` | interfaces.md I-3；同上用例 |
| `reqboard_status.pending_confirms[]` | 既有键不变（`ticket`/`requirement_id`/`target`/`created_at`/`interrupted`/`blocked_tools`/`recovery`） | `tests/status-pending-confirm.test.ts` |
| `PendingConfirmPort` 的实现者 | **多了一个必选成员 `findOpen`** ——这是唯一对实现方的破坏性面。当前实现者只有 `PendingConfirmRegistry`（已实现）；测试夹具 `tests/contract-shapes.test.ts` 的 fake 已同步，并由键集断言锁死 | `tests/contract-shapes.test.ts`（键集断言） |
| `recovery` 文案消费方（回执 / QueryState / QueryReport） | 文案变短（删了第三条出路），键与结构不变 | `tests/pending-guard-integration.test.ts` |

## 3. 回滚步骤

```bash
# 1) 代码回退（本需求 12 张卡涉及的 15 个源文件 + 8 个用例文件）
git revert <本次提交>     # 或按文件恢复

# 2) 提示词产物必须重生成（改了片段却不回滚产物会让 C-17 校验红）
node scripts/inline-prompt-fragments.mjs
node scripts/check-prompt-fragments.mjs      # 期望退出码 0

# 3) 提示词基线：回滚片段后按脚本重跑（脚本是基线的唯一生成口）
node scripts/dump-stage-prompts.mjs

# 4) 验证
npx vitest run tests/gate-request-uniqueness.test.ts tests/ask-confirm-pending.test.ts \
               tests/pending-guard.test.ts tests/confirm-advance-deadlock.test.ts
```

**没有数据侧回滚动作**：门是进程内结构（重启即清空），台账字段未新增/未改写。

## 4. 历史台账的阅读口径（不追溯）

- 历史上被迟到作答覆写过的 `approvedAt` / `approvedEvidence`（例如
  `REQ-261006163444-8e4f` 的 `plan.approvedAt=1791276133402`、证据原文为自动弹框题干）
  **保持原样**：本需求只保证"此后不再被覆写"，不追溯改写（改写历史记录本身会破坏审计链）。
- 判读方法：同一笔批准若 `approvedAt` 晚于其推进时刻（`statusHistory` 里进 implementing 的时刻），
  即说明它被后到的作答覆写过——按"推进时刻为准"理解。

## 5. 与既有约定的关系

- 不新增错误码（interfaces.md I-8）：复用与迟到作答都不是错误。
- 不改 `PENDING_CONFIRM_BLOCKED_TOOLS`（四条写路径）与门值域 `ARTIFACT_CONFIRM_GATES`。
- G4（验收门）的 `await` 阻塞形态**本次不统一**，登记为后续线（backend.md B-7）。
