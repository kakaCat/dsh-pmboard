# t8 收口证据（迁移兼容 · 回滚演练 · 全量基线）

> 需求：REQ-261002164800-d8f2 ｜ 卡：t-1f9170 ｜ 采集时间：2026-10-02 17:2x
> 命令原样可复跑；本文件只记**实测输出摘要**，不写"应该没问题"。

## 1. 兼容：旧数据零迁移可读

| 命令 | 结果 |
|---|---|
| `npx vitest run tests/reqboard/legacy-refs-compat.test.ts` | **5 passed** |

覆盖三件事：

- 旧台账 `plan.tasks` 没有 `requirement_refs` → `normalizePlanTasks` **不产生该键**（不是补成空数组）；
- 旧队列卡没有 `requirementRefs` → 取数按空处理、`sources='none'`、点名它，不抛错；
- 新字段是**可选**的：带该键的计划卡去掉键后仍能规整（旧读者忽略新键即可）。

**为什么不需要数据迁移**：本次只新增可选字段（`PlanTask.requirement_refs?` / 既有 `TaskRecord.requirementRefs` 语义不变），
不升 schema 版本，不新增文件格式；旧代码读到新数据时忽略不认识的键。

## 2. 回滚演练

| 路径 | 手段 | 结果 |
|---|---|---|
| 代码回滚 | 新字段可选 ⇒ 旧代码忽略它（兼容用例 ③ 已断言） | 无需数据迁移，直接回退版本 |
| 数据回滚（回填） | `pnpm tsx scripts/backfill-task-refs.ts --restore <报告.json>` 按报告里的 `before` 还原 | 用例 `tests/reqboard/backfill-task-refs.test.ts`「按报告里的 before 还原」**passed** |
| 门禁回滚 | 卡级警告→硬拒只需在 `plan-refs.ts` 一处把 `unrefedKeys` 接回拒绝分支（单点可逆） | 设计已登记，未演练（改一行即回） |

## 3. 全量基线（本卡收口时实测）

| 命令 | 实测 | 基线 | 判定 |
|---|---|---|---|
| `npx vitest run`（全量） | **99 failed / 3240 passed / 20 skipped** | ≤ 106 failed（C-14） | 通过 |
| `npx tsc --noEmit` | **189 errors** | ≤ 223（C-15） | 通过 |
| `pnpm build` | 退出码 **0**；host `dist/` + client `lib/client.js`（`[verify-client] OK 关键符号齐全, 样式归属章在场, CSS 分片完整`） | 退出码 0（C-11） | 通过 |

### 基线噪声的诚实说明

本仓库工作树同时被另一窗口的在途改动搅动（v10 分片迁移：`tests/reqboard/shard-repository.test.ts`、
`src/repositories/ShardedRequirementStore.ts` 等），故全量失败数会随之波动。
判定口径按 C-14：**只认"不高于基线 106 且本需求新增用例全绿"**，另有 3 项输出契约失败
（TaskAdopt / Knowledge / Regenerate）与 3 项既有断言行（plan-mode / auto-chain-approval / t17）
在改动前后**同样失败**，非本需求引入。

## 4. 本需求新增用例（8 个文件 / 48 条）

| 文件 | 条数 |
|---|---|
| `tests/reqboard/requirement-refs.test.ts` | 16 |
| `tests/reqboard/plan-refs.test.ts` | 9 |
| `tests/reqboard/plan-landing-parity.test.ts` | 7 |
| `tests/reqboard/board-plan-approve.test.ts` | 5 |
| `tests/reqboard/task-refs-repair.test.ts` | 6 |
| `tests/reqboard/backfill-task-refs.test.ts` | 4 |
| `tests/reqboard/landing-failure-loud.test.ts` | 4 |
| `tests/reqboard/legacy-refs-compat.test.ts` | 5 |

## 5. 真实数据只读试跑（回填器）

| 命令 | 结果 |
|---|---|
| `pnpm tsx scripts/backfill-task-refs.ts --dry-run --root <repo> --ledger ~/.dsh/dsh-reqboard.json` | 26 个需求；候选 **10**、无来源 **1**、跳过 **618** |
| `... --check` | `empty_with_doc_coverage: 10` |

候选全部落在 REQ-261002161439-277d（即本次事故需求）；唯一"无来源"卡是它的 t10 文档卡
（覆盖对照表确实没给它条款）——**如实留空并列出**，不硬凑引用。

**未对真实库执行 `--apply`**：那会改活数据，留给人在验收时拍板（脚本已在夹具上验证 apply/check/restore 三步）。
