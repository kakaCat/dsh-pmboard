# 拆分计划（REQ-261004065652-5c1c）

> **目标 + 做法一句话**：给 Dive 起轮补四道"该停就停"的前置（内存闭锁 / 全局额度闩 / 人工门 / 预算闸），
> 并把起轮判据读的那份同步投影修成**读己所写**——让 2026-10-03 那种"4 小时 36 分空转 7257 回合"
> 在**有限步**内停手。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。
> 依据：`design/architecture.md`（三本账 + 五批 B1~B5）、`design/interfaces.md`（对外零破坏）、
> `design/test-cases.md`（TC-1~TC-14，每条带反向演练）。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款（共 11 条） |
| TC-x | test-cases.md 用例表 | 测试用例（共 14 条） |
| t-x | 本文档任务表 | 任务（计划 key） |

> 本次**无新增对外接口编号**（I-x 不启用）：`design/interfaces.md` 明确"对外工具契约零破坏、
> 不新增工具与错误码"，新增的全部是 application 层内部纯函数与**可选注入端口**——
> 故下方覆盖对照的「接口」格按纯内部改动写 `—` 并给理由，不虚构 I-x 编号。

## 改动盘点（逐份设计文档 → 落点）

| 设计文档 | 落点文件 | 动作 | 承接卡 |
|---|---|---|---|
| architecture.md §FR-1~FR-3 | `src/application/internal/upstream-failure.ts`、`provider-latch.ts` | 新增（分类器 + 进程级闩） | t1, t3 |
| architecture.md §FR-5 | `src/application/internal/human-gate.ts` | 新增（人工门判据） | t1, t4 |
| architecture.md §FR-11 | `src/application/internal/chain-budget.ts`、`RequirementSummary.ts` | 新增 + 投影增 `tokenUsage` 标量 | t1, t2, t7 |
| architecture.md §FR-4 | `src/repositories/ShardedRequirementWriter.ts`、`ShardedRequirementStore.ts` | 修改：`notify` 增 `facts` 参 + 同步刷 `factsCache` | t2 |
| architecture.md §FR-1~3/6 | `src/application/dive/round-driver.ts`、`wake-heartbeat.ts`、`src/index.ts` | 修改：闭锁/退避/闩接入 + 心跳不复活 | t3 |
| architecture.md §FR-9 | `src/domain/dive/transition.ts`、`src/application/internal/reconcile-terminal-dive.ts` | 新增事件 `disarm-terminal` + 启动对账 | t4 |
| architecture.md §FR-7 | `src/application/use-cases/AskConfirm.ts`、`src/plugin-config.ts` | 修改：缺省宽限（配置项） | t5 |
| architecture.md §FR-8 | `src/application/internal/interruption.ts` | 修改：去重键改病因类别 + 限流 + 截断 | t6 |
| architecture.md §FR-10 | `src/application/use-cases/AdvanceChain.ts`、`src/adapters/WorkflowEngineRunner.ts` | 修改：开工前预检 + 幂等短路 | t7 |
| data-model.md | 无落盘结构变更（零迁移） | — | t8 演练 |
| test-cases.md | `tests/`（9 个新增文件，见任务表） | 新增 | t1~t9 |

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 定契约：失败分类器 + 三个判定纯函数 + 类型扩展 | FR-1, FR-2, FR-3, FR-5, FR-11 | `src/application/internal/upstream-failure.ts`、`provider-latch.ts`、`human-gate.ts`、`chain-budget.ts`、`src/domain/requirement/RequirementSummary.ts` | implement | backend | — | M | `npx vitest run tests/upstream-failure.test.ts tests/provider-latch.test.ts tests/human-gate.test.ts tests/chain-budget.test.ts` 全绿；分类器判定顺序 5 条各有用例（含 `unknown` 不猜）；`npx tsc --noEmit \| grep -c 'error TS'` ≤ 144 | dev,review（本卡零调用方，联调段跳过） |
| t2 | （落库后回填） | 修投影：写路径同源刷新窄投影快照 | FR-4, FR-11 | `src/repositories/ShardedRequirementWriter.ts`、`ShardedRequirementStore.ts`、`tests/store-projection-ryow.test.ts` | implement | backend | t1 | M | `npx vitest run tests/store-projection-ryow.test.ts` 全绿；**反向演练**：注释掉 `factsCache.set` → 该文件变红；`tests/store-contract.test.ts` 零新增失败 | dev,integrate,review,test |
| t3 | （落库后回填） | 接线驱动：内存闭锁 + 退避熔断 + 额度闩 + 心跳不复活 | FR-1, FR-2, FR-3, FR-6 | `src/application/dive/round-driver.ts`、`wake-heartbeat.ts`、`src/index.ts` | implement | backend | t1, t2 | M | `npx vitest run tests/dive-loop-breaker.test.ts tests/dive-abort-latch.test.ts` 全绿（含 `-t "loop replay"`：300 拍内投递 ≤ 3）；**反向演练**：把 AUTH 归入 transient → 变红；既有 `dive-*` 用例零新增失败 | dev,integrate,review,test |
| t4 | （落库后回填） | 人工门即停手 + 终态收手与启动对账 | FR-5, FR-9 | `src/application/internal/human-gate.ts`、`reconcile-terminal-dive.ts`、`src/domain/dive/transition.ts`、`round-driver.ts` | implement | backend | t3 | M | `npx vitest run tests/dive-human-gate-stop.test.ts tests/dive-terminal-reconcile.test.ts tests/dive-transition.test.ts` 全绿；对账幂等（第二次零写入）用例在场 | dev,integrate,review,test |
| t5 | （落库后回填） | 弹框缺省有界宽限（配置项，缺省 10 分钟） | FR-7 | `src/application/use-cases/AskConfirm.ts`、`src/plugin-config.ts`、`tests/ask-confirm-default-grace.test.ts` | implement | backend | t1 | S | `npx vitest run tests/ask-confirm-default-grace.test.ts` 全绿（假时钟超宽限 → `pending=true` + ticket，不抛超时）；`tests/ask-confirm-blocking.test.ts` 零新增失败 | dev,review |
| t6 | （落库后回填） | 断点留痕去重限流（病因类别 + 10 分钟 + 截断） | FR-8 | `src/application/internal/interruption.ts`、`tests/interruption-dedupe.test.ts` | implement | backend | t1 | S | `npx vitest run tests/interruption-dedupe.test.ts` 全绿；交替注入两病因各 10 次 → 写入 ≤ 2 条；阶段变化立即写（不受限流）用例在场 | dev,review |
| t7 | （落库后回填） | 引擎开工预检 + 全局预算闸接线 | FR-10, FR-11 | `src/application/use-cases/AdvanceChain.ts`、`src/adapters/WorkflowEngineRunner.ts`、`round-driver.ts`、`tests/advance-engine-precheck.test.ts`、`tests/chain-budget.test.ts` | implement | backend | t2, t3 | M | `npx vitest run tests/advance-engine-precheck.test.ts tests/chain-budget.test.ts` 全绿；不可达时连续推进 3 次 → 只有第 1 次写台账（revision 不变）；`tests/advance-*.test.ts` 零新增失败 | dev,integrate,review,test |
| t8 | （落库后回填） | 迁移与兼容：对账反向脚本 + 台账副本演练 | FR-9, FR-4 | `scripts/rollback-terminal-reconcile.ts`、`docs/requirements/REQ-261004065652-5c1c/evidence/reconcile-drill.md` | implement | backend | t4 | S | 在 `~/.dsh/reqboard` 的**副本**上演练：对账改写 3 条 → 反向脚本还原 → 与原件 sha256 一致；演练输出落 `evidence/reconcile-drill.md` | dev,review |
| t9 | （落库后回填） | 回归收口：反向演练矩阵 + 全量回归 + 类型闸门 | FR-1…FR-11 | `docs/requirements/REQ-261004065652-5c1c/evidence/regression.md`、`tests/` | test | backend | t1, t2, t3, t4, t5, t6, t7, t8 | M | 5 条反向演练逐条记录（投影 / 熔断 / AUTH 分类 / 人工门 / 预算）；`npx vitest run` 失败数 ≤ 开工基线（**2026-10-04 07:06 实测：47 failed files / 97 failed tests / 3523 passed**）；`npx tsc --noEmit \| grep -c 'error TS'` ≤ 144 | dev,review,test |
| t10 | （落库后回填） | 知识层与文档同步（停机判据进契约文档） | FR-1…FR-11 | `docs/architecture/automation-chain-contract.md`、`docs/architecture/project-manual.md`、`docs/knowledge/conventions.md` | doc | doc | t9 | S | `pnpm kb:check` 退出码 0；三份文档新增节与实现一致（文中引用的文件路径逐个存在）；契约文档补「四道停机前置」判据表 | dev,review |

- 一个任务只干一件事，标题动词开头。
- 工作量口径：S = 半天内 / M = 1~2 天 / L = 3 天以上（本计划无 L）。
- **子卡段**：t1/t5/t6 是"零调用方"的契约与纯函数卡 → 显式跳过联调段；其余按阶段兜底。
- t9 是验证卡（phase=test）：无新接口，按兜底模板不落联调。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | —（纯内部：新增进程级闩，不改对外契约） | src/application/internal/provider-latch.ts | TC-3, TC-13, TC-14 | t1, t3 | ✅ |
| FR-2 | —（纯内部：退避账在 DriverState 内存） | src/application/dive/round-driver.ts | TC-4, TC-14 | t1, t3 | ✅ |
| FR-3 | —（纯内部：内存闭锁，不落盘） | src/application/dive/round-driver.ts | TC-5, TC-14 | t1, t3 | ✅ |
| FR-4 | —（纯内部：投影管道，不改 read API 形状） | src/repositories/ShardedRequirementStore.ts | TC-1, TC-2 | t2 | ✅ |
| FR-5 | —（纯内部：纯函数判据） | src/application/internal/human-gate.ts | TC-7 | t1, t4 | ✅ |
| FR-6 | —（纯内部：闭锁置位时机） | src/application/dive/round-driver.ts | TC-6 | t3 | ✅ |
| FR-7 | —（工具入参 schema 不变，只改缺省行为） | src/application/use-cases/AskConfirm.ts | TC-8 | t5 | ✅ |
| FR-8 | —（纯内部：留痕去重键） | src/application/internal/interruption.ts | TC-9 | t6 | ✅ |
| FR-9 | —（纯内部：新增领域事件 + 启动对账） | src/application/internal/reconcile-terminal-dive.ts | TC-10 | t4, t8 | ✅ |
| FR-10 | —（回执字段不变，只强化 reason 文本） | src/application/use-cases/AdvanceChain.ts | TC-11 | t7 | ✅ |
| FR-11 | —（纯内部：纯函数预算判定） | src/application/internal/chain-budget.ts | TC-12 | t1, t7 | ✅ |
| **合计** | 0 对外接口（理由见上，非缺项） | 11 个模块落点 | 14 个用例 | 10 个任务 | **11/11 条款有主** |

> **「接口」格为 `—` 的理由**（按覆盖完整性规则第 1 条，须给一句话理由）：
> 本需求的全部改动都是"**收紧既有自动链的停机判据**"——不新增工具、不新增错误码、
> 不改任何入参 schema 与回执字段集合（`design/interfaces.md` 的"零破坏"节）。
> 四个新增端口全部**可选、缺省即旧行为**，这是设计里刻意留的灰度与回滚点。

## 执行顺序与批次（与 architecture.md §分批一一对应）

```
B1  t1 ──▶ t2                 （契约 → 投影：把"读己所写"先修好）
B2            t3              （闭锁/熔断/闩：让死循环不可能）
B3                 t4         （人工门停手 + 终态收手）
B4  t1 ──▶ t5, t6             （可并行：宽限 + 留痕限流）
B5            t2,t3 ──▶ t7    （预检 + 预算闸）
收口                 t8 ──▶ t9 ──▶ t10
```

- t5 / t6 只依赖 t1，可与 B2/B3 并行落卡；
- t8（迁移演练）必须在 t4 之后、t9 之前——它是全需求**唯一会改写存量数据**的一步。

## 覆盖完整性规则（自查结果）

1. 每行三格不为空：本计划 11 行全部有落点与接收任务；「接口」格为 `—` 且**逐行给了理由** ✅
2. 反向查超范围：`test-cases.md` 的 TC-1~TC-14 全部被任务接收（t1~t9）；无孤儿设计 ✅
3. 每个 FR 有人接：11/11（见上表「接收任务」列），且落库时每张卡带 `requirement_refs` ✅

## 开工基线（2026-10-04 实测，写死在计划里防漂）

| 闸门 | 命令 | 实测基线 |
|---|---|---|
| 全量测试 | `npx vitest run` | **47 failed files / 97 failed tests / 3523 passed / 20 skipped（350 文件 / 3640 用例，47.1s）** |
| 类型检查 | `npx tsc --noEmit \| grep -c 'error TS'` | **144** |
| dive 相关 8 文件 | 见 requirement.md「判定标准 #4」 | **1 failed / 101 passed**（TC-7 存量失败） |

> **判据口径**：本次改动只许"**新增失败 = 0**"，不要求全绿——工作区长期带大量存量失败
> （且本工作区同时有别的窗口在改文件）。任何一条新增失败即本次引入，必须当场修掉或如实登记。
> 注：仓库知识层 `conventions.md` C-14 记的"106 failed / 2807 passed"是**旧基线**，以本表为准。
