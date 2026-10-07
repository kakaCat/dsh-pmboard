---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 数据模型设计（REQ-261007100513-6749）

> 口径：本需求**不改**既有字段语义、不新增必填字段、不改任务状态机与合法边；只（a）给 `TaskRecord` 加一个可选覆盖字段，（b）新增两个**运行态**文件（与既有 `state/prompt-injection-log.json` 同类，可删可重建）。

## 新增/修改的数据结构 `serves: FR-6`

### 台账字段（`docs/requirements/<REQ>/queue.json` 内的 `TaskRecord`）`serves: FR-6`

```typescript
// src/shared/protocol.ts —— 只增一个可选字段
interface TaskRecord {
  // ...既有 45 个字段逐一不动...
  /** 本卡请求预算覆盖值（新增，可选）。缺省 = LIMITS.subtaskRequestBudget（60）。
   *  仅覆盖用：不参与状态机、不参与门禁判据、不参与依赖解析。 */
  budgetRequests?: number
}
```

- **必填性**：可选。缺省即现行为（默认 60）。
- **约束**：正整数；`<= 0` 或非整数 → 读取侧按缺省处理并留一条诊断（不阻断开工）。
- **写入方**：拆分期落卡时可由计划给出（供测试与小卡使用），或由 owner 在卡评论约定后人工改台账——**不新增写入工具**。

### 运行态文件 1：预算窗口 `state/subtask-budget.json` `serves: FR-6`

```typescript
interface SubtaskBudgetState {
  /** 版本号：结构变更时自增，旧版本读到未知版本按「重置」处理并留痕 */
  v: 1
  /** key = taskId */
  tasks: Record<string, {
    /** 已放行次数（0 起）。窗口 = windowIndex + 1 */
    windowIndex: number
    /** 本窗口内已用请求次数 */
    used: number
    /** 本窗口生效的上限（落盘时定格，避免事后改台账导致窗口漂移） */
    limit: number
    /** 本窗口开始时间（ms） */
    windowStartAt: number
    /** 到顶后是否已汇报（幂等：同一窗口只报一次） */
    reportedAt?: number
  }>
}
```

- **位置**：`state/subtask-budget.json`（与 `state/prompt-injection-log.json`、`state/capture-rejections.json` 同级）。
- **为什么落运行态而不是台账**：计数是**每请求自增**的热数据；写进 `queue.json` 会让每次请求都触发一次台账原子写（temp → fsync → rename）与缓存 revision 抖动，代价远大于收益。台账只承载**结论**（到顶汇报 / 放行留痕），落在**卡评论**里。
- **幂等放行的实现**：放行 = `windowIndex += 1`、`used = 0`、`reportedAt = undefined`。重复放行同一 `windowIndex` 只生效一次（比较并写入在同一把锁内）。
- **可删可重建**：文件缺失/损坏 → 所有卡从窗口 0 起算，并在卡评论标注「计数不可得」，**不按 0 静默通过**。
- **类型落点（t1 复核对齐，2026-10-07）**：`SubtaskBudgetState` 的类型定义**唯一落在 `src/shared/protocol.ts`**；t5 只 import，**不得**在 `application/internal/subtask-budget.ts` 另立第二处声明（本仓已多次因「同一口径两处声明」分叉返工）。
- **`SubtaskBudgetPort.write` 失败语义**：告警 + 留痕 + **不阻断开工**（计数丢失不等于卡不能干）；`read()` 返回 `undefined` 即「计数不可得」，必须显式标注，不得按 0 通过。

### 运行态文件 2：易变段去重表（内存 + 可选落盘）`serves: FR-2, FR-3`

```typescript
interface VolatileNoticeState {
  /** key = windowKey */
  windows: Record<string, {
    /** key = VolatileNoticeKind，value = 上次**已投递**内容哈希 */
    lastDelivered: Record<'status' | 'stage' | 'task' | 'capture', string>
    /** 去抖中的待投递项（key = kind，value = {hash, text, dueAt}） */
    pending?: Record<string, { hash: string; text: string; dueAt: number }>
  }>
}
```

- **默认内存态**（进程内 Map），可选落盘到 `state/volatile-notice.json` 以跨重启保留去重基线。
- **哈希口径**：内容规范化后（去首尾空白、统一换行）取 `sha1`；哈希相同 = 内容等价 = 不投递。

### 逐项结果与树摘要类型 `serves: FR-4, FR-5, FR-6`

```typescript
/** 批量推进的逐项结果（对齐既有 SubmitTool.results[] 的「逐项点名」精神，字段名新建） */
interface TaskMoveItemResult {
  task_id: string
  ok: boolean
  from?: TaskStatus
  to?: TaskStatus
  status?: TaskStatus
  version?: number
  /** 失败时：既有拒绝码（invalid_transition / REQBOARD_* 系列），逐字透传，不新造码 */
  code?: string
  error?: string
  /** 该项撞节流时（ok=false）：剩余毫秒，前端/agent 可直接照此等待或改做他事 */
  throttleRemainingMs?: number
}

/** 树摘要：复用 TaskTree 的节点投影，只取一层（父卡 + 其子卡） */
interface TaskTreeSummary {
  parents: Array<{
    parent: TaskTreeNodeView
    subtasks: TaskTreeNodeView[]
    note: string
  }>
}
```

- `TaskTreeNodeView` **逐字复用** `src/application/use-cases/TaskTree.ts:34` 的既有类型，不新造节点结构（避免两套渲染口径分叉）。

### 留痕类型扩展 `serves: FR-2`

```typescript
// src/application/internal/injection-log.ts
type InjectionLogOrigin =
  | 'gate-h3' | 'dive-node' | 'dive-round' | 'system-prompt'
  | 'system-notice'   // 新增：尾部注入（inbox next-step）
// 读端必须容忍未知取值（老日志不含新值 → 反向安全；新日志被旧读端读到 → 未知值当字符串处理）
```

### 兼容性分析 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `TaskRecord.budgetRequests` | 不存在 | 可选覆盖，缺省 60 | 无回填；读取侧 `?? LIMITS.subtaskRequestBudget` |
| 新增字段的**必改清单**（漏一处则投影丢字段） | — | `protocol.ts:1691` + 客户端镜像 `src/client/types.ts:298` + 四处服务端投影（`QueryStageDetail.ts:336`、`sheet-tasks.ts:36`、`QueryDag.ts:92`、`http/routers/stages.ts:392`） | **不改** `REQUIRED_TASK_FIELDS`（`validateQueue.ts:64`）、**不 bump** `REQBOARD_SCHEMA_VERSION`(9) 与 `QUEUE_VERSION`(1)；改客户端后 `pnpm build:client`（C-12） |
| 卡评论落点 | — | 落在 `queue.json` 的 `TaskRecord.comments`（**不是** `comments.jsonl`），只能由 `mutateQueue` 回调内的用例/系统写 | 无独立写评论工具；用内部 helper `appendTaskComment` |
| `state/subtask-budget.json` | 不存在 | 计数与窗口 | 无迁移；缺失即窗口 0 + 标注「计数不可得」 |
| `state/volatile-notice.json` | 不存在 | 去重基线（内存优先） | 无迁移；缺失即全部视为「未投递过」 |
| `InjectionLogOrigin` 新增值 | 4 个取值 | 5 个取值 | 只增；读端容忍未知 |
| `reqboard_task_move` 入参 | 扁平 4 参 | 扁平 4 参与 `tasks[]`/`budget` **并存** | 旧调用零改动 |
| `reqboard_task_move` 出参 | 11 键 | 11 键 + `results[]`/`tree`/`throttleRemainingMs`/`guidance` | 只增不减；既有断言的键语义不变 |
| 回滚 | — | 删可选字段 + 删两个运行态文件 | 旧版本忽略未知字段与未知文件，无破坏 |

## 关键决策与取舍 `serves: FR-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 预算计数存哪 | 写进 `TaskRecord`（每次请求写台账） | 运行态文件 + 结论写卡评论 | 台账写是 temp→fsync→rename 的原子写并触发缓存 revision 抖动，每请求一次代价过大 |
| 放行 API 形态 | 新增 `reqboard_task_budget` 工具 | 挂到既有 `reqboard_task_move` 的 `budget` 子对象 | 工具 schema 每轮请求都要重发；新增一个工具 ≈800 字符 × 全树请求数，本需求正是为省这笔钱而立 |
| 树摘要结构 | 新造一套精简节点 | 逐字复用 `TaskTreeNodeView` | 两套渲染口径必然分叉（本仓已栽过多次：路径归一/口径只能有一份实现） |
| 逐项结果字段名 | 复用 `ok`/`code`/`message` 全局信封 | 新建 `TaskMoveItemResult`（字段名对齐既有 `resolved_targets[].ok` 用法） | 全仓无统一信封，硬造一个会引出一轮无关重构；字段名与既有 `ok` 用法保持一致即可 |

## 技术方案与亮点 `serves: FR-6`

- **热数据与结论分离**：每请求自增的计数走运行态文件（快、可丢、可重建），门禁与验收依赖的结论走台账卡评论（慢、不可丢、可审计）。这条分界是本设计的核心取舍。
- **窗口定格**：`limit` 在开窗时写死，避免事后改台账导致「同一窗口前后两次判定不同」的漂移（本仓在 `claimedAt` 用作基准时踩过同类坑，见 `support.ts:669-682` 的注释）。
- **缺失不静默**：计数不可得必须显式标注；这是本仓「失败要响亮」铁律在数据层的落点。
