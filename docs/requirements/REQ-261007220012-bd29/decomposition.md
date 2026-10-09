# 拆分计划：reqboard 体检第三批工具面精简 27→21（REQ-261007220012-bd29）

## 目标与做法

把 design/architecture.md 的四个接口契约与 migration.md 的 6 个验证批落成 7 张卡：
t1~t4 每卡 = 一次合并/删除（S1~S4），t5 = 目录改名（S5），t6 = schema 常量单源化（S6），
t7 = 文案同步面收尾（README 工具表定稿 + package.json 计数 + 全量验证）。
卡间串行：t1→t2→t3→t4 都改 index.ts / registry.ts / README.md（文件交集非空）；
t5 接 t4（同改 registry/index）；t6 与 t5 文件零交集但同属 B5 收尾序（给语义理由）；
t7 等全部落完后定稿文案口径。

行为等价策略（与 migration.md §数据层一致）：**五个**被复用用例（ConfirmReceipt / QueryRunStatus /
AmendTaskRefs / AdoptTask / RegenerateChain）判定逻辑一行不改（仅四处错误消息抬头随合并改名）；
TaskTree 另有**新增**的单卡展开分支（原单卡查询逻辑平移进来），其原有父子结构逻辑逐字保留。
等价性 = 原用例测试全绿 + 壳层测试换入口复跑 + 契约三件套（I-1~I-3）派生校验。

## 覆盖对照表（FR → 卡，人读汇总；门禁只认卡上 requirement_refs）

| FR | 卡 |
|----|----|
| FR-1 | t1 |
| FR-2 | t2 |
| FR-3 | t3 |
| FR-4 | t4 |
| FR-5 | t5 |
| FR-6 | t6 |
| FR-7 | t7（并复核 t1~t6 的同步面收尾） |

## 接口清单 ↔ 接收卡 key（对照表）

> 右列叫「接收卡 key」（词法避让：叫「计划 key」会被任务表判据误认）。

| 接口（architecture.md 契约节） | 接收卡 key |
|--------------------------------|-----------|
| ask_confirm + ticket 取回执模式（三分派） | t2 |
| status + requirement_id/run_id 入参 + run 节 | t3 |
| task_tree + task_id 单卡展开模式 | t3 |
| reqboard_task_amend（op=refs\|adopt\|chain） | t4 |
| reqboard_task_run（仅目录/工厂改名，工具面不变） | t5 |
| WINDOW_MODES / windowInheritanceSchema 公共常量 | t6 |
| 删除面：reqboard_task_execute | t1 |
| 删除面：reqboard_confirm_receipt | t2 |
| 删除面：reqboard_run_status / reqboard_task_status | t3 |
| 删除面：reqboard_task_refs / reqboard_task_adopt / reqboard_task_regenerate | t4 |

## 任务表

| 计划 key | 任务 | 验收 | 工作量 |
|----------|------|------|--------|
| t1 | 物理删除 reqboard_task_execute（S1） | `grep -rn "reqboard_task_execute\|TaskExecuteTool\|defineTaskExecuteTool" src tests README.md` 零命中；`pnpm vitest run tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/tools-render-coverage.test.ts tests/task-run-contract.test.ts` 全绿；`pnpm test` 全绿 | S（DU≈11：9 文件 / 3 锚点 / ~800 字符） |
| t2 | confirm_receipt 并入 ask_confirm(ticket)（S2） | ask_confirm schema 含可选 `ticket`；`grep -rn "reqboard_confirm_receipt\|ConfirmReceiptTool\|defineConfirmReceiptTool" src` 零命中；ask_confirm(ticket=未知) 仍抛 REQBOARD_UNKNOWN_TICKET；`pnpm vitest run tests/ask-confirm-pending.test.ts tests/ask-confirm-blocking.test.ts tests/confirm-pending-guard.test.ts tests/output-contract.test.ts` 全绿；`pnpm test` 全绿 | M（DU≈12：10 文件 / 4 锚点 / ~1000 字符） |
| t3 | run_status→status(run 节)、task_status→task_tree(task_id)（S3） | status 输出含 run 节（无 active run 时 runId 整键省略）；task_tree(task_id) 返回单卡 task 节且与 parent_id 互斥报错 REQBOARD_INVALID_INPUT；`grep -rn "reqboard_run_status\|reqboard_task_status\|RunStatusTool\|TaskStatusTool" src` 零命中；`pnpm vitest run tests/run-status-tool.test.ts tests/task-status-integration.test.ts tests/task-status-ledger.test.ts tests/task-tree.test.ts` 全绿；`pnpm test` 全绿 | M（DU≈14：12 文件 / 5 锚点 / ~1200 字符） |
| t4 | 修缮簇合一 reqboard_task_amend（S4） | 新工具注册且 op=refs/adopt/chain 各一条等价测试通过；op 缺必填参数报 REQBOARD_INVALID_INPUT 并点名必填集；`grep -rn "reqboard_task_refs\|reqboard_task_adopt\|reqboard_task_regenerate\|TaskRefsTool\|AdoptTaskTool\|RegenerateTool" src` 零命中；`pnpm vitest run tests/adopt-task.test.ts tests/regenerate-chain.test.ts tests/reqboard/backfill-task-refs.test.ts` 全绿；`pnpm test` 全绿 | M（DU≈13：11 文件 / 5 锚点 / ~1100 字符） |
| t5 | AdvanceTool 目录改名 TaskRunTool（S5） | `ls src/tools/TaskRunTool` 存在且 `src/tools/AdvanceTool` 不存在；registry 条目 key=TaskRun；`pnpm vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/task-run-contract.test.ts` 全绿；`pnpm test` 全绿 | S（DU≈8：6 文件 / 3 锚点 / ~600 字符） |
| t6 | handoff/open_window schema 常量单源化（S6） | `grep -rn "'fork', 'create'" src/tools | wc -l` = 1（WINDOW_MODES 唯一定义）；inheritance 子 schema 字面量仅 shared.ts 一处定义；`pnpm vitest run tests/open-window-tool.test.ts tests/handoff.test.ts tests/open-window-inherit.test.ts` 全绿；`pnpm test` 全绿 | S（DU≈8：6 文件 / 3 锚点 / ~600 字符） |
| t7 | 同步面定稿：README 工具表 + package.json 计数 + 全量验证（FR-7） | README 工具表 21 行无被删 7 工具名；package.json description 含「21 个」；`pnpm vitest run tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts tests/tools-schema.test.ts tests/arg-guidance.test.ts tests/error-code-matrix.test.ts` 全绿；`pnpm test` 全绿；apply-wiring 派生注册名单 = 21 | S（DU≈7：3 文件 / 4 锚点 / ~700 字符） |

## 依赖与排序

- t1 → t2 → t3 → t4 → t5：文件交集非空（index.ts / registry.ts / render-summaries.ts / README.md），天然串行。
- t6 在 t5 后：与 t5 文件零交集，给语义理由——同属 B5「不改工具数」收尾批，
  串行保证 registry/index 口径在任何时点只被一张卡动，且 t6 的测试基线含 t5 改名后的路径。
- t7 最后：等 t1~t6 全部落完后一次性定稿 README/package.json 口径，避免中间态计数（26/25/23）写进文案。

## 风险与回滚

- 每卡独立 commit；任一卡红了 `git revert` 单卡即回滚（migration.md §分批与回滚：
  目录级文件集互不重叠，台账数据不受工具面变更影响）。
- 存量调用方硬断（按旧名调 6 个被删工具 → unknown tool）：已获用户授权；
  存续工具 description 写明承接关系（t2/t3/t4 各卡 implementation 含 prompt 更新）。
- footnote：t1~t4 的 footprint.files > 5（软上限，进 granularity_warnings 不拒）——
  文件多是因为「同步面」（index/registry/tests/README）与删除动作天然绑在一起，
  每卡仍只改一类东西（一次合并/删除）。
