# 架构设计：工具面精简 27 → 21（REQ-261007220012-bd29）

> 面向零上下文的执行者：只凭本文档 + requirement.md 就应能写出拆分计划。
> 术语：「工具壳」= src/tools/&lt;X&gt;Tool/ 下的 defineTool 薄壳；「用例」= src/application/use-cases/。

## 现状盘点与依赖/调用方清单 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

27 个工具目录 ↔ registry 27 条 ↔ index.ts 27 次 register，一一对应（I-1~I-3 机械不变量兜底）。
本批触碰的 10 个工具壳及其依赖（谁调用、谁被调用）：

| 工具壳 | 用例（被调用） | 壳内私有件 | 调用方（谁引用它） |
|--------|----------------|-----------|--------------------|
| TaskExecuteTool（删） | 无（真委托 defineAdvanceTool 产物） | ALIAS_DESCRIPTION | index.ts、registry.ts、render-summaries.ts:181、StageActions.ts:32、tools-render-coverage.test.ts（DELEGATING_ALIASES）、task-run-contract.test.ts、timeout-routing-integration.test.ts |
| ConfirmReceiptTool（删） | ConfirmReceipt.ts（**保留复用**） | prompt.ts、confirmReceiptSummary（render-summaries.ts:102） | index.ts、registry.ts、StageActions.ts:21、AskConfirm prompt 指路文案 |
| RunStatusTool（删） | QueryRunStatus.ts（**保留复用**） | prompt.ts、summarize() | index.ts、registry.ts、StageActions.ts:20、AdvanceTool prompt、run-status-tool.test.ts |
| TaskStatusTool（删） | 无独立用例（壳内直读 taskStore） | taskStatusSummary（render-summaries.ts:158）、TASK_STATUS_PROGRESS（domain/task/TaskStatus.ts，**保留**） | index.ts、registry.ts、StageActions.ts:19、task-status-integration/ledger.test.ts |
| TaskRefsTool（删） | AmendTaskRefs.ts（**保留复用**） | summary.ts（taskRefsSummary） | index.ts、registry.ts、backfill-task-refs.test.ts |
| AdoptTaskTool（删） | AdoptTask.ts（**保留复用**） | 壳内 summarize | index.ts、registry.ts、adopt-task.test.ts |
| RegenerateTool（删） | RegenerateChain.ts（**保留复用**） | 壳内 summarize | index.ts、registry.ts、regenerate-chain.test.ts |
| AskConfirmTool（改） | AskConfirm.ts + ConfirmArtifact.ts（+ 新增分派 ConfirmReceipt.ts） | ASK_CONFIRM_PROMPT | index.ts、registry.ts |
| StatusTool（改） | QueryState.ts（+ 组合 QueryRunStatus.ts） | statusSummary | index.ts、registry.ts |
| TaskTreeTool（改） | TaskTree.ts（+ 单卡展开分支） | TASK_TREE_PROMPT、nodeSchema | index.ts、registry.ts |

**没漏验证**：上表「调用方」列 = 本设计落笔时 `grep -rln` 全仓扫描结果（2026-10-07 工作树基线）；
拆分阶段按 FR-1~FR-4 判据里的 grep 零命中逐条复核。

## 接口契约：ask_confirm + ticket 取回执模式 <!-- serves: FR-2 -->

入参加一个可选键（其余不动）：

```
ticket: { type: 'string', description: '取回执模式：ask_confirm 返回 pending=true 时的 ticket（pc-…）；传了即取回执，不弹框' }
```

分派顺序（execute 内，钉死在 tools-dispatch 静态断言同款形状）：

1. `evidence` 非空 → `confirmArtifact`（现状不变）；
2. 否则 `ticket` 非空 → `confirmReceipt`（用例原样复用，语义与今 ConfirmReceiptTool 逐字一致）；
3. 否则 → `askConfirm`（现状不变）。

返回体：**零新增键**——ConfirmReceipt 的响应键
（success/confirmed/advanced/from/to/requirement_id/user_choice/user_feedback/note）
全部是 ask_confirm output schema 已有键，直接兼容。
渲染：取回执模式走 `confirmReceiptSummary`（从 render-summaries 保留，按分派路径选择）。

## 接口契约：status + run 节 <!-- serves: FR-3 -->

入参加两个可选键（与原 RunStatusTool 同语义同缺省）：

```
requirement_id: { type: 'string', description: '需求 ID；不传默认本窗口绑定需求' }
run_id:         { type: 'string', description: '运行 ID（run-xxx）；传入则直接按 run_id 反查需求' }
```

返回体加一个键（能确定目标需求时恒出现；无绑定需求时整键省略）：

```
run: {
  runId?: string            // 无 active run 时整键省略（不发 null，同今降级口径）
  stepIndex: number
  currentSubtaskId?: string
  nextReady: string[]
  jobStatus: string         // running/completed/failed/not_found
  pauseReason?: string
  autoRun: boolean
}
```

实现：QueryState.ts 组合 `queryRunStatus`（用例原样复用），
含原 RunStatusTool 的三段守卫（未绑定报错文案、run_id 反查、TaskStore 未装配显式失败）
与「runId 非 string 即删键」的降级形状。M1 死字段（status/reason 保留键）随合并自然消失，不再声明。

## 接口契约：task_tree + task_id 单卡展开模式 <!-- serves: FR-3 -->

入参加一个可选键：

```
task_id: { type: 'string', description: '任务 id（t-xxxxxx）；传了 = 单卡展开模式（等价原 task_status）' }
```

`task_id` 与 `parent_id` 互斥（同传 → REQBOARD_INVALID_INPUT）。
单卡模式返回体（顶层键与原 TaskStatusTool 逐字一致，挂在 `task` 键下）：

```
task: {
  task_id: string
  status: string
  progress: number          // 0–100，TASK_STATUS_PROGRESS 映射（domain 单点不动）
  run?: { ok, stopReason, valueNonEmpty, reason? }
  report?: { summary, completedCount, filesChangedCount }
  workflow?: object         // 键保留（既有消费者契约），内容 = 真实 run 摘要
}
```

错误形状沿用原 TaskStatusTool：TaskStore 未装配 → status='error' + 显式报错；
卡不存在 → status='not_found'。实现落在 `executeTaskTree` 的单卡分支（壳薄、判定在用例）。

## 接口契约：reqboard_task_amend（修缮簇单入口） <!-- serves: FR-4 -->

新工具壳 `src/tools/TaskAmendTool/`（TaskAmendTool.ts / index.ts / prompt.ts / summary.ts）。

入参（op 必填，其余为各 op 的原工具入参原样平移）：

```
op: { type: 'string', enum: ['refs', 'adopt', 'chain'], required: true }
// op=refs：  task_id 必填、requirement_refs 必填（string[]，全量替换）、reason 必填
// op=adopt： task_id 必填、parent_id 必填、stage_kind、reason、force
// op=chain： task_id（dry_run:false 时必填）、requirement_id、dry_run（缺省 true）、reason
```

执行：三个 op 共用原壳的前置（`assertNoPendingConfirm`），然后分派
`executeTaskRefs` / `executeAdoptTask` / `executeRegenerateChain`——**用例一行不改**。
op 与缺必填参数不匹配 → REQBOARD_INVALID_INPUT，message 点名该 op 的必填集。
未知 op → 绑定层 enum 直接拒。

返回体：三原工具输出键的并集（additionalProperties:false 下全量声明：
success/task_id/requirement_id/before/after/changed/rtm_synced/note/parent_id/
previous_parent_id/stage_kind/role/status/version/error/code/dry_run/applied/scanned/
created_total/candidates）+ `op` 回显。渲染按 op 选对应 summary（taskRefsSummary /
adopt summarize / regenerate summarize，均随目录搬迁到 TaskAmendTool/summary.ts）。

## 接口契约：公共 schema 常量（S6） <!-- serves: FR-6 -->

落点 `src/tools/shared.ts`（既有共享模块，不新建文件）：

```ts
export const WINDOW_MODES = ['fork', 'create'] as const
export function windowInheritanceSchema() { /* 每次返回新对象（编译层消费，不复用引用） */ }
```

HandoffTool 的 `HANDOFF_MODES` 与 OpenWindowTool 的 `OPEN_WINDOW_MODES` 删除，
`enum: [...WINDOW_MODES]` 两处引用；两处逐字重复的 inheritance 子 schema
（title/preset/model/reasons）改为 `windowInheritanceSchema()`。
**只抽这两处**；capture/create 文案收敛不在本批（N2）。

## 文件结构：新建 / 删除 / 修改 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7 -->

**删除（7 个目录）**：TaskExecuteTool/、ConfirmReceiptTool/、RunStatusTool/、
TaskStatusTool/、TaskRefsTool/、AdoptTaskTool/、RegenerateTool/。

**新建（1 个目录）**：TaskAmendTool/（4 文件，见上节）。

**改名（1 个目录）**：`git mv src/tools/AdvanceTool src/tools/TaskRunTool`；
工厂 `defineAdvanceTool` → `defineTaskRunTool`（registry key 同步 'Advance'→'TaskRun'，
output-contract 扫描键随动）；工具名 `reqboard_task_run` 不变。

**修改（同步面）**：
`src/index.ts`（import 与 register 减 6 增 1、改名 1）；
`src/tools/registry.ts`（27 → 21 条，注释计数同步）；
`src/tools/render-summaries.ts`（别名摘要删、confirmReceipt/taskStatus 摘要随迁）；
`src/tools/shared.ts`（+WINDOW_MODES、+windowInheritanceSchema）；
`src/domain/stage/StageActions.ts`（删 4 个工具名条目，task_execute 条目删，task_amend 补）；
`src/application/query/QueryState.ts`（+run 节组合）；
`src/application/use-cases/TaskTree.ts`（+单卡分支）；
`README.md`（工具表 6 删 1 增、计数改 21）；
`package.json`（description 27 → 21）；
测试（下节）。

## 行为等价验证设计 <!-- serves: FR-2, FR-3, FR-4, FR-5 -->

等价策略：**用例层零改动**（ConfirmReceipt / QueryRunStatus / AmendTaskRefs / AdoptTask /
RegenerateChain 五行代码不动），等价性由「原用例测试全绿 + 壳层测试换入口复跑」双层保证：

| 批 | 换入口复跑的测试 | 新增断言 |
|----|------------------|----------|
| S2 | ask-confirm-pending / ask-confirm-blocking / confirm-pending-guard / pending-guard / status-pending-confirm | ask_confirm(ticket) 命中 confirmReceipt 分派；REQBOARD_UNKNOWN_TICKET 原样 |
| S3 | run-status-tool.test.ts → 打 status；task-status-integration/ledger.test.ts → 打 task_tree(task_id) | status 输出含 run 节且降级形状同今；task_id+parent_id 互斥报错 |
| S4 | adopt-task / regenerate-chain / backfill-task-refs → 打 task_amend 对应 op | op 缺必填 → REQBOARD_INVALID_INPUT 点名必填集 |
| S5 | output-contract / apply-wiring / task-run-contract | registry key=TaskRun 工厂扫描命中 |
| 全批 | tools-dispatch（I-1）、tools-render-coverage（摘 DELEGATING_ALIASES 白名单条目）、readme-tool-face、tools-schema、arg-guidance、error-code-matrix | 注册名单 = 21 |

全量 `pnpm test` 每批收尾必绿；任一批红了只 revert 该批（migration.md §分批与回滚）。

## 边界（本设计不做什么） <!-- serves: FR-7 -->

- 不动 6 个存续用例的实现；不动台账 schema / 状态机 / HTTP 面。
- 不动 archive_amend / note_interruption（N1）；不收敛 capture/create 文案（N2）。
- client 零改动（N5 已核实零引用）；toolviews 由既有机械校验守住。
- 不给 task_amend 加 op 之外的新能力（防范围蔓延；夹带新功能即另开需求）。
