# REQ-261002164800-d8f2 拆分计划（decomposition）

> 目标：让「需求条款 ↔ 任务卡」的取数、门禁、写入各收敛成一处，三条落库入口共用；并给存量 531 张空 refs 一条可回滚的回填路。
> 依据：`design/architecture.md`（模块与不变量）、`design/interfaces.md`（签名与错误码）、`design/data-model.md`（字段与兼容）、`design/test-cases.md`（12 条用例）、`design/backend.md`（改动清单与七步顺序）。

## 改动盘点（对照设计逐份）

| 设计文档 | 改动面 | 承接待办 |
|---|---|---|
| `design/interfaces.md` · 取数单点 | 新增 `src/application/internal/plan-refs.ts`；`Decompose.ts` 与 `confirm-settle.ts` 删各自组装 | t2 |
| `design/interfaces.md` · 落库编排 | 新增 `src/application/internal/approved-plan-landing.ts`；`plan-landing.ts` 返回值与 RTM 入参 | t3 |
| `design/data-model.md` · 字段 | `src/domain/task/RequirementRefs.ts`（新）；`protocol.ts` 的 `PlanTask` 与 `normalizePlanTasks`；`SubmitTool.ts` 入参 schema | t1 |
| `design/interfaces.md` · 看板路由 | `http/routers/requirements.ts` 批准即落库；`SubmitArtifact.ts` 文案对齐 | t4 |
| `design/interfaces.md` · 补写入口 | 新增 `use-cases/AmendTaskRefs.ts` + `tools/TaskRefsTool/`；`http/routers/tasks.ts` 收字段 | t5 |
| `design/data-model.md` · 回填报告 | 新增 `scripts/backfill-task-refs.ts` | t6 |
| `design/use-cases.md` · 异常路径 | 失败分支可见性 + 文案审计 | t7 |
| `design/test-cases.md` · 回归与兼容 | 兼容用例 + 基线比对证据 | t8 |

## 覆盖对照表

| 需求条款 | 条款内容 | 接收任务 |
|---|---|---|
| FR-1 | 三条落库入口收敛为同一取数与同一门禁 | t2、t3、t4、t8 |
| FR-2 | 计划携带任务表的 refs 通道打通 | t1 |
| FR-3 | 文档覆盖表兜底在三条入口一致生效 | t2 |
| FR-4 | 已落库卡的 refs 有唯一补写入口 | t5 |
| FR-5 | 存量空 refs 可一次性回填 | t6、t8 |
| FR-6 | 落库失败响亮，恢复路径真实可执行 | t4、t7 |
| FR-7 | 落库返回体的覆盖度读数可信 | t3、t8 |

## 任务总览

| 顺序 | key | 业务标题 | 类型/端侧 | 依赖 | 验收要点 |
|---|---|---|---|---|---|
| 1 | t1 | 定死 refs 契约：编号校验 + 计划字段 + 入参 schema | implement / backend | — | 新纯函数单测全绿；非法 ref 被拒并点名；`pnpm typecheck` 改动文件零错误 |
| 2 | t2 | 取数单点：显式优先、文档兜底 | implement / backend | t1 | 两路取数结果一致；`grep refsByKey` 只剩构造与消费各一处 |
| 3 | t3 | 落库层收敛：三入口共用 + 读数取真实记录 | implement / backend | t2 | 11 张卡（含 1 张无 FR）落库 11 张；`covers_frs` 非空 |
| 4 | t4 | 看板「批准计划」也落库并推进 | implement / backend | t3 | 批准后任务数 = 计划卡数且状态进 implementing；重复批准幂等 |
| 5 | t5 | 补写入口：工具 + 看板复用同一用例 | implement / backend | t3 | refs 变更 + RTM 同步 + 留痕；同值不写盘 |
| 6 | t6 | 存量回填器：dry-run / apply / check / restore | implement / backend | t5 | `--check` 输出 `empty_with_doc_coverage: 0`；二次 apply 零写入 |
| 7 | t7 | 失败与降级响亮：警告可见、文案只指可执行入口 | implement / backend | t4 | 失败不推进且有 pausedReason；无落点有 warning + 评论 |
| 8 | t8 | 迁移兼容与收口：零迁移可读 + 回滚演练 + 基线 | test / backend | t6、t7 | 兼容用例绿；`pnpm test` ≤106、`pnpm typecheck` ≤223、`pnpm build` 退出码 0 |

## 逐卡说明

### 1. refs 契约卡

**key**: t1
**serves**: FR-2

**实施方案**：新增 `src/domain/task/RequirementRefs.ts`（零 IO：`REF_ID_RE` / `refInvalidReason` / `normalizeRequirementRefs`，去重 + 自然序）；`src/shared/protocol.ts` 的 `PlanTask` 增可选 `requirement_refs?: string[]`，`normalizePlanTasks` 保留并校验（非法抛 `REQBOARD_BAD_REQUIREMENT_REF`，点名 `key` 与非法值）；`src/tools/SubmitTool/SubmitTool.ts` 的 `parameters.tasks.items.properties` 补 `requirement_refs`（保持 `additionalProperties:false`）。验证：`tests/reqboard/requirement-refs.test.ts`。

**验收标准**：`npx vitest run tests/reqboard/requirement-refs.test.ts` 全绿——合法值去重保序、`X-1` / `FR-99x` / 空串被拒且错误文本含卡 key 与非法值；`pnpm typecheck` 改动文件零错误。修前：该用例全红（字段在协议层被丢弃）。

### 2. 取数单点卡

**key**: t2
**serves**: FR-1, FR-3

**实施方案**：新增 `src/application/internal/plan-refs.ts`（`refsForLanding` / `unrefedKeys` / `sources`；复用 `planRefsFromDoc` 与 `requirementRefsOf`）；`src/application/use-cases/Decompose.ts` 与 `src/application/internal/confirm-settle.ts` 删掉各自的 refs 组装循环，改调 `refsForLanding`；卡级 refs 硬拒改为 `unrefed` 警告。验证：`tests/reqboard/plan-refs.test.ts`。

**验收标准**：`npx vitest run tests/reqboard/plan-refs.test.ts` 全绿——显式优先、缺失时文档兜底、两处皆无则 `sources='none'`；`grep -rn "refsByKey" src` 只命中 `plan-refs.ts` 与 `plan-landing.ts`。修前：decompose 路径不读文档表，同 key 两路结果不一致。

### 3. 落库层收敛卡

**key**: t3
**serves**: FR-1, FR-7

**实施方案**：新增 `src/application/internal/approved-plan-landing.ts`（两条人工入口共用的落库层）；`src/application/internal/plan-landing.ts` 返回 `unrefed` / `sources`，并把 `generateRTMData` 的入参从 `LandedTaskRef[]` 换成按 `createdIds` 过滤的真实记录；`confirm-settle.ts` 改调 `landApprovedPlan`（净减行数，回到 ≤400 行）。验证：`tests/reqboard/plan-landing-parity.test.ts`。

**验收标准**：`npx vitest run tests/reqboard/plan-landing-parity.test.ts` 全绿——11 张卡（含 1 张无 FR）落库 11 张、`unrefed=['t7']`、`task_coverage[i].covers_frs` 非空且等于卡上 refs。修前：0 张且抛 `REQBOARD_PLAN_REFS_MISSING`；`wc -l src/application/internal/confirm-settle.ts` ≤400（修前 439）。

### 4. 看板通道卡

**key**: t4
**serves**: FR-1, FR-6

**实施方案**：`src/http/routers/requirements.ts` 的 `handlePlanDecision` 批准分支改调 `landApprovedPlan(source='board')` 并推进 implementing，返回体附 `landed` / `unrefed` / `warning`；`src/application/use-cases/SubmitArtifact.ts` 的计划返回文案改成与实际通道一致（不再声称做不到的入口）。验证：`tests/reqboard/board-plan-approve.test.ts`。

**验收标准**：`npx vitest run tests/reqboard/board-plan-approve.test.ts` 全绿——批准后台账任务数 = 计划卡数、需求状态为 implementing；重复批准不新增卡（幂等）。修前：批准只盖 `approvedAt`，0 张卡、状态不变。

### 5. 补写入口卡

**key**: t5
**serves**: FR-4

**实施方案**：新增 `src/application/use-cases/AmendTaskRefs.ts`（全量替换、值同不写盘、同步 `rtm-implementing/<id>.yml` 的 `serves`、写评论留痕、跨需求拒绝）；新增 `src/tools/TaskRefsTool/` 并接进 `src/tools/index.ts`；`src/http/routers/tasks.ts` 的 `handleTaskUpdate` 接受 `requirementRefs` + `reason`，走同一用例。验证：`tests/reqboard/task-refs-repair.test.ts`。

**验收标准**：`npx vitest run tests/reqboard/task-refs-repair.test.ts` 全绿——改 refs 后卡上值变更且 RTM 的 `serves` 同步；同值重复调用 `changed:false` 且队列文件 mtime 不变；跨需求卡被拒（`REQBOARD_TASK_NOT_BOUND`）。修前：全仓无任何卡级 refs 写入口。

### 6. 存量回填卡

**key**: t6
**serves**: FR-5

**实施方案**：新增 `scripts/backfill-task-refs.ts`——经 `TaskStore` 与 docs 读端口，逐个需求按 `decomposition.md` 覆盖表回填空 refs 的父卡；子卡与归档需求进 `skipped`；产出报告（候选 / 无来源 / 跳过 / 已写）；`--restore <report>` 按 `before` 还原。验证：`tests/reqboard/backfill-task-refs.test.ts`（夹具工作区）。

**验收标准**：`pnpm tsx scripts/backfill-task-refs.ts --dry-run` 输出候选数且零文件变更（mtime 不变）；`--apply` 后 `--check` 输出 `empty_with_doc_coverage: 0`；二次 `--apply` 报 `applied:0`；`--restore <report>` 后卡上 refs 回到 `before`。对应单测 `npx vitest run tests/reqboard/backfill-task-refs.test.ts` 全绿。修前：全仓 590 卡中 531 张 refs 为空且无回填路径。

### 7. 响亮失败卡

**key**: t7
**serves**: FR-6

**实施方案**：`src/application/internal/approved-plan-landing.ts` 与 `src/application/internal/confirm-settle.ts` 的失败分支定型——落库未生效 ⇒ 不推进 + 系统评论 + `advance.pausedReason` + 告警；落库生效而收尾失败 ⇒ 照常推进并留痕；`unrefed` 非空时写一条需求评论并在返回体 `warning` 复述；审计并删除指向"做不到的动作"的文案。验证：`tests/reqboard/landing-failure-loud.test.ts`。

**验收标准**：`npx vitest run tests/reqboard/landing-failure-loud.test.ts` 全绿——注入落库抛错时需求状态不推进且 `advance.pausedReason` 非空、评论含可执行恢复入口；无落点卡场景 `warning` 与评论各出现一次；`grep -rn "REQBOARD_PLAN_REFS_MISSING" src` 不再命中拒绝分支。

### 8. 迁移兼容与收口卡

**key**: t8
**serves**: FR-1, FR-5, FR-7

**实施方案**：兼容用例 `tests/reqboard/legacy-refs-compat.test.ts`（旧台账 `plan.tasks` 无 `requirement_refs`、旧队列卡无 `requirementRefs` 时读取行为与现状一致）；回滚演练（代码回退后新字段被忽略、`--restore` 还原数据）；跑全量回归与构建并与 HEAD 基线逐条比对，证据落 `docs/requirements/REQ-261002164800-d8f2/notes/`。

**验收标准**：`npx vitest run tests/reqboard/legacy-refs-compat.test.ts` 全绿；`pnpm test` 失败数 ≤ 基线 106 且无新增失败；`pnpm typecheck` 错误数 ≤ 223；`pnpm build` 退出码 0。

## 批次与依赖（为什么这样切）

```
t1 契约（纯函数 + 协议 + 入参 schema）
 └ t2 取数单点（显式优先 / 文档兜底）
    └ t3 落库层收敛（三入口共用 + 读数修正）
       ├ t4 看板通道（批准即落库 + 文案对齐）
       │   └ t7 失败与降级可见性
       └ t5 补写入口（工具 + 路由同实现）
           └ t6 存量回填（dry-run / apply / check / restore）
                └ t8 迁移兼容与收口（t6、t7 都完成后跑基线与回滚演练）
```

- **契约定死再实现**：t1/t2 先把字段与取数语义定死，t3 之后才好写落库与入口。
- **t4 与 t5 并行**（同挂 t3）：一个改看板批准通道，一个开补写入口，互不共享文件（各自独立用例文件）。
- **t6 依赖 t5**：回填复用补写用例的写入口（同一实现，不造第二条写路径）。
- **t8 最后**：兼容与回归必须建在全部改动落地之后，否则基线读数无效。

## 不做什么（本次范围）

- 不做看板客户端 UI（补写入口只到工具 + HTTP 路由）。
- 不新增第二种 RTM 事实源，不直连队列文件（只经 `TaskStore`）。
- 不回填归档需求；不动 v10 分片迁移；不改需求文档格式门禁规则。
