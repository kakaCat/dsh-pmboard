# 拆分计划（REQ-261008011118-defe）

> 目标：把体检报告 §2.2 剩下的四条中危项（M1/M3/M4/M5）各自在**一个收敛点**上收口，
> 每条带「先红 → 后绿」回归读数，且四项**各自独立可回滚**。
> 做法：按**缺陷**拆 5 张卡——4 张各修一条（t1..t4），1 张收口（t5：知识层/提示词基线/错误码清单齐步 + 全量回归）。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）。设计与取舍见 `design/fix-design.md`。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| BUG-x | `requirement.md` 缺陷条款 | 本需求的条款（bug 档用 BUG，无 FR） |
| D-x | `requirement.md`「讨论与裁定记录（D-x）」 | 需求阶段裁定（本需求只有 D-1 = 范围裁定） |
| DD-x | `design/fix-design.md`「决策记录」 | 设计内决策（DD-1 删除死字段 / DD-2 上限 N=3 / DD-3 保序+补偿 / DD-4 认领前置） |
| t-x | 本文档任务表 | 计划内任务键 |

设计文档只有一份：`design/fix-design.md`（bug 档无必交设计文档；无 interfaces.md / frontend.md，
故不设接口清单对照表与原型锚点列）。本需求 `sides: [backend]`，无 UI 卡。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（文件） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 |
|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 删除 run 快照的三处死字段与其死代码 | BUG-1 | `src/domain/checkpoint.ts`（删）、`src/application/internal/checkpoint-manager.ts`（删）、`src/application/use-cases/QueryRunStatus.ts`、`src/tools/StatusTool/StatusTool.ts`、`src/client/types.ts`、`src/repositories/RequirementRepository.ts`、`tests/run-status-tool.test.ts`、`tests/unit/checkpoint-manager.test.ts`（删）、`tests/unit/repository-extensions.test.ts` | D-1 | implement | backend | — | S | ① `grep -rn "stepIndex\|currentSubtaskId\|heartbeatAt" src --include=*.ts` → 无命中（`advance.runId/lockAt` 相关除外）；② `npx vitest run tests/run-status-tool.test.ts tests/unit/repository-extensions.test.ts tests/output-contract.test.ts` → 全绿；③ run 节键集**不含** `stepIndex`/`currentSubtaskId`（即使夹具在 `advance` 里种了遗产字段），且返回值仍过自身 schema |
| t2 | （落库后回填） | 给批量收尾加非子卡 done 上限 N=3 | BUG-2 | `src/application/use-cases/MoveTask.ts`、`src/tools/TaskMoveTool/TaskMoveTool.ts`、`tests/done-throttle-guidance.test.ts`、`tests/task-move-batch.test.ts` | D-1 | implement | backend | — | S | ① 20 张顶层卡一批 `to=done` → 落账 done = 3，其余逐项 `code=REQBOARD_BULK_CLOSE` 且 `0 < throttleRemainingMs ≤ 60000`，顶层带 `guidance`；② `npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` 全绿（既有「同批 3 张不触发」「跨批触发」「子卡豁免」三条保绿）；③ `DoneEvidenceSpec` 判据零改动（`git diff --stat src/domain/workflow/DoneEvidenceSpec.ts` 为空） |
| t3 | （落库后回填） | 回退加队列补偿并补齐取消/复位事件与 version | BUG-3 | `src/application/use-cases/MoveRequirement.ts`、`src/application/internal/rollback-tasks.ts`、`src/shared/error-code-registry.ts`、`tests/fixtures/error-code-inventory.json`、`tests/move-rollback.test.ts`、`tests/canceled-task-trail.test.ts` | D-1 | implement | backend | — | M | ① 注入需求写抛错 → 抛错且队列**逐字段**回到回退前（卡状态与回退前一致、无重做卡）、需求 status 未变；② 注入漂移（回调看到 `status !== from`）→ `REQBOARD_CONFLICT` + 同样归还；③ 正常回退后：取消卡 `statusHistory` 末条 `canceled`、复位卡含 `todo`（reason 含「原地复位」），两类 `version` 均 +1；④ `npx vitest run tests/move-rollback.test.ts tests/canceled-task-trail.test.ts tests/error-code-registry.test.ts tests/error-code-inventory.test.ts` 全绿 |
| t4 | （落库后回填） | 子卡执行改先认领后执行并对并发派发说不 | BUG-4 | `src/application/use-cases/ExecuteTask.ts`、`src/shared/error-code-registry.ts`、`tests/fixtures/error-code-inventory.json`、`tests/execute-task.test.ts` | D-1 | implement | backend | t3 | M | ① 两路并发同一张 todo 子卡 → `workflow.start` 恰 **1** 次，第二路 `code=REQBOARD_SUBTASK_IN_PROGRESS` 且执行记录数不变；② 凭证门失败与跨卡覆盖两条出口跑完 → 子卡回 `todo` + `attempt+1` + 执行闭合 `failed` + `revisions(rollback)` 在；③ 种一条 `startedAt` 早于 `OrphanTimeoutMs`（3min）的 running 执行 → 允许接管且陈旧执行被闭合为 `failed`；④ `npx vitest run tests/execute-task.test.ts tests/t12-queue-readonly-ordering.test.ts tests/advance-parallel.test.ts tests/concurrency-limits.test.ts tests/error-code-registry.test.ts` 全绿 |
| t5 | （落库后回填） | 收口：知识层与契约基线齐步并跑全量回归 | BUG-5 | `docs/knowledge/code-map.md`、`docs/knowledge/code-map.symbols.tsv`、`tests/fixtures/error-code-inventory.json`、`tests/prompt-baseline.test.ts`（必要时） | D-1 | test | backend | t1, t2, t3, t4 | M | ① `pnpm kb:check` → 退出码 0；② `npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts tests/error-code-matrix.test.ts tests/prompt-error-codes.test.ts tests/output-contract.test.ts tests/prompt-cost.test.ts tests/prompt-baseline.test.ts` → 全绿；③ `pnpm test` → 无**新增**红（与开工前基线集合差为空；他窗在飞的红逐条点名归属）；④ 四条修复的回归命令在同一批复跑全绿（t1..t4 的验收命令逐条重跑） |

- 一个任务只干一件事，标题动词开头；**落点**列全是具体路径，不许写「相关模块」。
- 工作量口径：S = 半天内 / M = 1~2 天 / L = 3 天以上（本计划无 L；t3/t4/t5 记 M 是"跨存储补偿 /
  并发时序 / 基线齐步"三处判断成本，不是文件多）。
- **子卡段**：不显式声明，按相位与需求分类兜底——t1..t4（implement）吃 bug 档默认
  `复现 → 修复 → 复核 → 回归`（**无联调段**，故不设 `skipIntegration`）；t5（test）→ `研发 → 复核 → 测试`。
- **依赖理由**（`dep_reasons`，两条边都在 tasks[] 里写明）：
  - `t4 → t3`：两端都写 `src/shared/error-code-registry.ts` 与 `tests/fixtures/error-code-inventory.json`
    （**单文件、按 code 字典序、清单由脚本整体重写**）——并行写会互相覆盖，故串行。
  - `t5 → t1..t4`：t5 的落点是**基线与清单**，与各修复卡的 `src/**`/`tests/**` 落点零交集，
    但语义上必须等四项全部落地后才能一次性采集（kb 生成物要等符号删除落地、错误码清单要等两个新码
    落地、文案字数基线要等文案定稿、全量回归要等四项全落地），故逐条给理由，避免被判「疑似伪依赖」。
- **未声明 `skipIntegration` 的理由**：bug/t 档默认链本就无 `integrate` 段（`test` 相位也无），
  没有可裁的联调段——显式设 `skipIntegration: true` 反而要额外解释，故不设。
- **文件面披露（软门禁知情放行）**：t1 声明 `files=9`、t3 声明 `files=7`（落点 6 个 + 清单刷新脚本 1 个）、
  t5 声明 `files=6`（知识层生成物 2 个 + 清单与刷新脚本 2 个 + 提示词基线 1 个 + 余量 1 个），均超过软阈值 5——动作实为
  「删两个文件 + 四处去引用 + 三处测试跟进」（t1，净删代码）与「一处补偿 + 两处事件补齐 + 注册一个码」
  （t3），一轮装得下；若实施中发现装不下，就地拆成「生产改动」与「测试跟进」两张（后者依赖前者），
  条款覆盖关系不变（两张都接同一条 BUG）。

## 覆盖对照

| 需求条款 | 设计章节（`design/fix-design.md`） | 设计决策 | 接收任务 | 完整性 |
|---|---|---|---|---|
| BUG-1 | BUG-1 设计：删除 run 进度死字段 | DD-1 | t1 | ✅ |
| BUG-2 | BUG-2 设计：批内非子卡 done 上限 | DD-2 | t2 | ✅ |
| BUG-3 | BUG-3 设计：回退补偿与事件补齐 | DD-3 | t3 | ✅ |
| BUG-4 | BUG-4 设计：先认领后执行 | DD-4 | t4 | ✅ |
| BUG-5 | BUG-5 设计：契约 / 文案 / 错误码 / 基线齐步 | —（承 DD-1..DD-4 的契约面） | t5 | ✅ |
| **合计** | 5 条条款 / 5 个设计章节 + 6 个横切章节 | 4 条设计决策 | **5 张卡** | 5/5 条款有主 |

## 收口验收口径（与 requirement.md §验收标准 同源）

1. `npx vitest run` 逐卡点名的测试文件全绿（t1..t4 各自的命令见任务表验收列）。
2. `npx vitest run tests/error-code-registry.test.ts tests/error-code-inventory.test.ts
   tests/error-code-matrix.test.ts tests/prompt-error-codes.test.ts tests/output-contract.test.ts
   tests/prompt-cost.test.ts tests/prompt-baseline.test.ts` → 全绿（新码已注册 + 清单已刷新）。
3. `pnpm kb:check` → 退出码 0（BUG-1 删符号后知识层重生成）。
4. `pnpm test` → 无新增红（对照开工前基线逐条点名归属；他窗在飞的红不算本需求）。
5. 四项的「先红读数」与「后绿读数」都落进各自任务卡文档（可复核）。

## 风险与回滚

- **逐项独立回滚**：t1/t2/t3/t4 的落点文件集互不重叠（t3 与 t4 共享 registry/inventory，
  故 t4 依赖 t3），任一项可单独 `git checkout -- <该卡落点>`；无数据迁移、无不可逆副作用。
- **已知对价**（设计 §风险与未决）：t2 的 N=3 会给"一次关 8 张"的合法窗口带来等待摩擦
  （拒绝文案给确定等待毫秒 + 自动链这条零摩擦路径）；t4 认领前置后崩溃会留下 `in_progress`
  卡直到 3min 孤儿回收接管——两者都是"把静默错行为换成显式节奏"的对价。
- **他窗在飞**：工作树有 234 条在飞改动；每卡开工前对落点文件跑一次 `git status --porcelain`
  复核，重叠即点名叫停，不代改、不回滚。
