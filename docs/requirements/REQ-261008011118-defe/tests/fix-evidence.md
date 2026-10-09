# 测试证据（REQ-261008011118-defe）

> 交付物：四条中危项修复的**可复核读数**。三条纪律：① 每条修复都有"先红 → 后绿"两段读数；
> ② 命令与输出摘要逐条给出（可照抄重跑）；③ 与基线不一致处逐条归属，不掩盖。

## ① 单卡验收命令（13 文件 / 190 用例） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

```bash
npx vitest run tests/run-status-tool.test.ts tests/unit/repository-extensions.test.ts \
  tests/output-contract.test.ts tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts \
  tests/move-rollback.test.ts tests/canceled-task-trail.test.ts tests/execute-task.test.ts \
  tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts \
  tests/concurrency-limits.test.ts tests/error-code-registry.test.ts tests/error-code-inventory.test.ts
# → Test Files  13 passed (13)
# → Tests       190 passed (190)
```

## ② 四条修复的先红 → 后绿读数 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

| 条款 | 命令 | 先红 | 后绿 |
|---|---|---|---|
| BUG-1 | `npx vitest run tests/run-status-tool.test.ts` | `Tests 2 failed | 5 passed (7)`（`expected true to be false`：`'stepIndex' in run`） | `7 passed` |
| BUG-1（附带） | `npx vitest run tests/unit/query-run-status.test.ts tests/unit/migration-v8.test.ts` | 同批红（字段被回报 / 类型引用残留） | 全绿 |
| BUG-2 | `npx vitest run tests/done-throttle-guidance.test.ts` | `Tests 2 failed | 9 passed (11)`（`expected … length 3 but got 20`；`[true,true,true,true] ≠ [true,true,true,false]`） | `11 passed`（+ `task-move-batch` 共 27 passed） |
| BUG-3 | `npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts`（HEAD 版生产文件） | `Test Files 2 failed / Tests 5 failed | 38 passed` | 全绿（`move-rollback` 23 + `canceled-task-trail` 20） |
| BUG-4 | `npx vitest run tests/execute-task.test.ts tests/concurrency-limits.test.ts`（HEAD 版生产文件） | `Test Files 2 failed / Tests 4 failed | 33 passed`（`workflow.start` ×2；归还未留痕） | 全绿（`execute-task` 27 + 邻域 142） |

**红读数的取得方式（可复核）**：BUG-3 / BUG-4 的实现与用例同批完成，故先 `cp` 备份生产文件 →
`git checkout -- <两/一个文件>` 还原到 HEAD → 跑同命令 → `cp` 回备份；恢复后
`git diff --stat` 与还原前逐字一致（BUG-3: 134 insertions / 3 deletions；BUG-4: 120 insertions / 50 deletions）。

## ③ 邻域回归（逐卡防扩散） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4 -->

| 卡 | 命令范围 | 读数 |
|---|---|---|
| BUG-1 | `tests/unit` + status 家族 + `output-contract` + `error-code-matrix`（19 文件） | `Test Files 19 passed / Tests 227 passed` |
| BUG-2 | 批量/队列顺序/旧回执键集/错误码/并发（10 文件） | `Test Files 10 passed / Tests 147 passed` |
| BUG-3 | 回退/取消留痕/门禁/队列顺序/错误码（8 文件） | `Test Files 8 passed / Tests 160 passed` |
| BUG-4 | 执行/团队/调度锁/预算/阶段遥测（16 文件） | `Test Files 16 passed / Tests 142 passed`（含 `failure-handling` 8/8，由基线红转绿） |

## ④ 仓库门与全量集合差 <!-- serves: BUG-5 -->

```bash
npx tsc --noEmit
# → exit 0 · error TS 0

npx tsx scripts/test-baseline.mts --check
# → [工作树指纹] HEAD c49fd5e · 194 files changed（含未跟踪共 260 个改动）
# → [基线] 本次失败 23 条 · 基线 68 条
# → [差集] 新增失败 7 / 不再失败 52
# → [口径] tsc 退出码 0 · error TS 0 条

npx tsx scripts/kb-build.mts --write && pnpm kb:check
# → K7 生成物与源码一致（零漂移）✅ / K9 符号表 3394 = 源码口径 3394 ✅（改前 2 处漂移）
# → K1 INDEX.md 超限 / K3 conventions.md 222 行 > 200 / K14 kb-0064/0065 待刷基线（3 项失败，见偏离）
```

**新增 7 条的归属（非本需求引入）**：全部落在 `tests/kb-ensure.test.ts`；该文件与其被测模块
**未被任何改动**（HEAD 状态），且 `npx vitest run tests/kb-ensure.test.ts` → `11 passed`，
与知识层家族同跑 → `55 passed`，与本需求全部测试文件同跑 → `150 passed` ⇒ 套件内顺序相关，
按边界不代刷基线。

## ⑤ 错误码与提示词门 <!-- serves: BUG-5 -->

```bash
npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts \
  tests/error-code-matrix.test.ts tests/error-code-exempt.test.ts \
  tests/prompt-error-codes.test.ts tests/prompt-cost.test.ts tests/prompt-baseline.test.ts
# → Test Files 7 passed / Tests 73 passed

npx tsx tests/drill/refresh-error-code-inventory.mts   # 连跑第二次
# → [refresh] 清单无变化（幂等：未写盘）
# → 大写码 135（零覆盖 5）· 小写码 28 · 排除 7
```

## ⑥ 落点与回滚清单 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

```text
修改（9 个生产/类型文件，+362/-179）：
  src/application/use-cases/QueryRunStatus.ts        （BUG-1：run 快照只报活字段）
  src/tools/StatusTool/StatusTool.ts                （BUG-1：run 节 schema 删两键）
  src/client/types.ts                                （BUG-1：AdvanceState 删三键）
  src/repositories/RequirementRepository.ts          （BUG-1：删三方法 + Checkpoint import）
  src/application/use-cases/MoveTask.ts              （BUG-2：批内非子卡 done 上限 N=3）
  src/tools/TaskMoveTool/TaskMoveTool.ts             （BUG-2：批量口径文案）
  src/application/internal/rollback-tasks.ts         （BUG-3：canceled 事件 + version+1）
  src/application/use-cases/MoveRequirement.ts       （BUG-3：留档 + 补偿接线 + 白名单九字段）
  src/application/use-cases/ExecuteTask.ts           （BUG-4：认领前置 + 归还单点）
新增：
  src/application/internal/rollback-compensation.ts  （BUG-3：补偿单点，163 行）
删除：
  src/domain/checkpoint.ts                           （BUG-1：死类型 + 死纯函数）
  src/application/internal/checkpoint-manager.ts     （BUG-1：死管理器）
  tests/unit/checkpoint-manager.test.ts              （BUG-1：随死代码删除）
清单与生成物：
  src/shared/error-code-registry.ts                  （BUG-3/4：注册两个新码）
  tests/fixtures/error-code-inventory.json           （drill 刷新 + tier 勘定）
  docs/knowledge/code-map.md / code-map.symbols.tsv  （kb-build 重生成）
测试跟随：
  tests/run-status-tool.test.ts / unit/query-run-status.test.ts / unit/migration-v8.test.ts
  tests/unit/repository-extensions.test.ts / tests/done-throttle-guidance.test.ts
  tests/move-rollback.test.ts / tests/canceled-task-trail.test.ts
  tests/execute-task.test.ts / tests/concurrency-limits.test.ts
```

**逐项回滚**：上表每张卡的落点集可单独 `git checkout -- <该卡落点>`；t3/t4 共享注册表与清单，
故落库顺序为 t3 → t4（依赖边已在计划里声明）；无数据迁移、无不可逆副作用。

## ⑦ 覆盖标注（covers：任务 ↔ 测试证据） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5 -->

> 口径：本需求 5 张父卡 + 19 张子卡 = **24 个任务全部有测试证据落点**（= 100%，门禁要求 ≥80%）。
> 每个父卡一行（含其子卡链：复现 / 修复 / 复核 / 回归），行内列出该链的证据出处。

BUG-1（t-f33d47）：删 run 进度死字段与死代码——证据见 §②第一行 + §③第一行 + §⑥
covers: t-f33d47, t-0171ec, t-3e2e45, t-0d3145, t-cfd24f

BUG-2（t-20f5dc）：批内非子卡 done 上限 N=3——证据见 §②第二行 + §③第二行 + §⑥
covers: t-20f5dc, t-649be9, t-0c8772, t-03aeb3, t-d6faed

BUG-3（t-6969c5）：回退队列补偿 + 事件/version 补齐——证据见 §②第三行 + §③第三行 + §⑥
covers: t-6969c5, t-9d36d9, t-bd3094, t-395e5d, t-86e5f9

BUG-4（t-869f61）：先认领后执行 + 并发拒绝 + 归还单点——证据见 §②第四行 + §③第四行 + §⑥
covers: t-869f61, t-14824a, t-3ca491, t-699719, t-0d2a4f

BUG-5（t-1bb2e9）：知识层与契约基线齐步 + 全量回归——证据见 §④ + §⑤ + §⑥
covers: t-1bb2e9, t-e17575, t-eb6093, t-ab5633

## 修订记录 <!-- serves: BUG-5 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：六组读数（单卡验收/先红后绿/邻域回归/仓库门与全量/错误码与提示词/落点回滚清单） | session-9574f815 |
