---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 接口设计（REQ-261007100513-6749）

> 口径：**不新增任何工具**（工具 schema 每轮请求都要重发，新增一个工具 ≈800 字符 × 全树请求数）。
> 所有新能力挂在既有 `reqboard_task_move` 与内部端口上。

## 接口清单（编号口径） `serves: FR-2, FR-3, FR-4, FR-5, FR-6`

| 编号 | 接口 | 形态 | 服务条款 |
|---|---|---|---|
| I-1 | `reqboard_task_move`（新增 `tasks[]` 批量与 `budget` 放行） | 工具 | FR-4, FR-5, FR-6 |
| I-2 | `VolatileNoticePort.notify` | 内部端口 | FR-2, FR-3 |
| I-3 | `buildVolatileNotice` / `noticeHash` / `pickDebounced` | 内部纯函数 | FR-2, FR-3 |
| I-4 | `openBudgetWindow` / `chargeRequest` / `releaseBudget` | 内部纯函数 | FR-6 |
| I-5 | `appendTaskComment` | 内部 helper（非工具） | FR-6 |

> 编号被 `decomposition.md` 的覆盖对照引用；本表是接口侧的唯一编号源。

## 新增/修改的工具接口 `serves: FR-4, FR-5, FR-6`

### reqboard_task_move（修改）`serves: FR-4, FR-5, FR-6`

**用途**：推进任务状态（既有能力）+ 一次批量推进多张卡（FR-4）+ 子卡预算放行（FR-6）。

**调用方**：owner 窗口 agent；子代理（对自己的卡）。

**接口定义**：

```typescript
interface TaskMoveInput {
  // —— 既有扁平四参（**逐字保留**，单卡路径的唯一形态）——
  task_id?: string
  to?: TaskStatus          // todo|in_progress|integrating|testing|in_review|done|canceled
  reason?: string
  acceptance?: string      // 只传它 = 仅修订验收，不改状态

  // —— 新增：批量（与扁平四参二选一；同传时以 tasks 为准并返回 note 说明）——
  tasks?: Array<{
    task_id: string
    to?: TaskStatus
    reason?: string
    acceptance?: string
  }>

  // —— 新增：子卡预算放行（FR-6；与 to/acceptance 可同时给）——
  budget?: {
    /** 显式放行一次：windowIndex += 1、used 归零、写卡评论留痕。幂等。 */
    release?: boolean
    /** 本次放行的追加额度（缺省 = 卡上 budgetRequests ?? LIMITS.subtaskRequestBudget） */
    add?: number
    /**
     * CAS 期望窗口号（2026-10-07 由 t5 复核 P2-6 补入，原设计漏写）：
     * 与当前窗口号不一致即拒 `REQBOARD_CONFLICT` 并回报**当前**窗口号、**零写入**；
     * 用途 = 消掉「read-modify-write 丢放行」的竞态（两个窗口同时放行时不互相覆盖）。
     */
    expectedWindowIndex?: number
  }
}

interface TaskMoveOutput {
  // —— 既有 11 键（语义与取值逐字不变）——
  success: boolean
  task_id: string
  from?: TaskStatus
  to?: TaskStatus
  status?: TaskStatus
  version?: number
  subtasks_created?: string[]
  task_card?: object
  acceptance?: string
  error?: string
  code?: string

  // —— 新增（只增不减）——
  /** 批量时逐项结果（顺序与入参 tasks 一致）；单卡路径不返回本键 */
  results?: TaskMoveItemResult[]
  /** 存在成功项且存在失败项时为 true（缺省不发） */
  partial?: boolean
  /** 落笔成功后受影响的父卡与其子卡链摘要（一层；复用 TaskTreeNodeView） */
  tree?: TaskTreeSummary
  /** 树摘要不可得时的原因（不静默省略） */
  tree_note?: string
  /** 撞节流时：剩余毫秒（既有的仅文案数字，本次升级为结构化字段） */
  throttleRemainingMs?: number
  /** 撞节流时：这段时间可以做什么（可做之事的指引，禁止让 agent 靠 sleep 试探） */
  guidance?: string
  /** 预算放行/到顶的处置结果 */
  budget?: {
    task_id: string
    windowIndex: number
    limit: number
    /** true = 本次调用确实放行了一个新窗口；false = 幂等命中（已放过） */
    released: boolean
  }
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `task_id` | string | 单卡路径必填 | 任务 id（t-xxxxxx） | — |
| `to` | string | 与 `acceptance` 至少给一个 | 目标状态（合法边由卡片角色决定） | — |
| `reason` | string | 否 | 理由（进台账留痕） | — |
| `acceptance` | string | 否 | 修订验收标准（≤2000 字符，须含可执行锚点） | — |
| `tasks[]` | array | 批量路径必填 | 批量项（1–20 项，每项同扁平四参语义） | — |
| `budget.release` | boolean | 否 | 显式放行一次子卡预算窗口（幂等） | false |
| `budget.add` | number | 否 | 放行的追加额度（正整数） | 卡上 `budgetRequests ?? LIMITS.subtaskRequestBudget` |
| `budget.expectedWindowIndex` | number | 否 | CAS 期望窗口号：不一致即拒 `REQBOARD_CONFLICT` 并回报当前窗口号、零写入（2026-10-07 t5 复核补入） | 不传 = 不做 CAS（旧调用方行为不变） |

**返回值说明**（仅列新增键）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `results[]` | TaskMoveItemResult[] | 逐项结果：`{task_id, ok, from?, to?, status?, version?, code?, error?, throttleRemainingMs?}` |
| `partial` | boolean | 有成功也有失败时 true（缺省不发） |
| `tree` | TaskTreeSummary | `{parents:[{parent, subtasks[], note}]}`，节点逐字复用 `TaskTreeNodeView` |
| `tree_note` | string | 摘要不可得的原因（如「任务快照不可用」） |
| `throttleRemainingMs` | number | 节流剩余毫秒（结构化，替代只在文案里出现的数字） |
| `guidance` | string | 撞节流时的可做之事（如「先提交验收材料 / 先写卡评论 / 先跑基线」） |
| `budget` | object | 放行结果：`{task_id, windowIndex, limit, released}` |

**异常情况**：

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| `REQBOARD_INVALID_INPUT` | 既无 `to` 也无 `acceptance`；或 `tasks` 为空数组/超 20 项；或 `budget.release` 给的 `add <= 0` | `{success:false, error, code}` |
| `REQBOARD_NO_BOUND_REQ` / `REQBOARD_NOT_BOUND_TO_WINDOW` / `REQBOARD_TASK_NOT_FOUND` | 既有绑定/存在性判定（批量时逐项判） | 逐项 `results[i].code` |
| `REQBOARD_CONFIRM_PENDING` | 本窗口有待确认门（既有门，批量同样拦） | `{success:false, error, code}` |
| `invalid_transition` | 该项目标状态非法（逐项，**不影响同批其它项**） | `results[i].code='invalid_transition'` + 合法边文案 |
| `REQBOARD_BULK_CLOSE` | 该项撞 60s 节流（逐项；同批提交的卡互不触发） | `results[i].throttleRemainingMs` + 顶层 `guidance` |
| `REQBOARD_NO_REPORT` / `REQBOARD_NO_EVIDENCE` / `REQBOARD_STALE_BUILD` / `REQBOARD_SUBTASK_GATE` / `REQBOARD_DEPENDENCY_GATE` / `REQBOARD_PARENT_LIMIT` | 既有各道门（**判据一条不改**，批量时逐项判） | `results[i].code` |
| （不新造码） | 全部项失败 | `success:false` + `results[]` 逐项原因 |
| `REQBOARD_CONFLICT` | 放行时 `budget.expectedWindowIndex` 与**当前**窗口号不一致（并发放行竞态） | 拒绝并回报当前窗口号，**零写入**（2026-10-07 t5 复核补入） |

**使用示例**：

```typescript
// 批量收尾三张子卡（一次调用 = 一次 mutate）
await tools.reqboard_task_move({
  tasks: [
    { task_id: 't-a1', to: 'done', reason: '验收 Tab 按 FR 成行：三段全过，汇报在账' },
    { task_id: 't-b2', to: 'done', reason: '文档 Tab 短名+短状态：三段全过，汇报在账' },
    { task_id: 't-c3', to: 'done', reason: '提示词 Tab 折叠：三段全过，汇报在账' },
  ],
})
// → { success:true, results:[{ok:true,...},{ok:true,...},{ok:true,code:'REQBOARD_STALE_BUILD',...}], partial:true, tree:{...} }

// owner 放行一张跑到预算上限的子卡
await tools.reqboard_task_move({
  task_id: 't-a1',
  budget: { release: true, add: 60 },
  reason: '子卡已汇报卡点，人工判断继续值得：放行一个窗口',
})
// → { success:true, budget:{ task_id:'t-a1', windowIndex:1, limit:60, released:true } }
```

### 不新增的工具（明确声明）`serves: FR-4, FR-5, FR-6`

| 曾考虑新增 | 否掉的理由 | 替代 |
|---|---|---|
| `reqboard_comment`（写卡评论） | 卡评论本来就由各用例在 `mutateQueue` 回调内写（`TaskRecord.comments`），agent 直接写会绕过席位与门禁 | 新增**内部** helper `appendTaskComment`（非工具），只由系统/用例调用 |
| `reqboard_task_budget`（预算放行） | 工具 schema 每轮重发；放行是卡片生命周期动作，归 `task_move` | `reqboard_task_move({task_id, budget:{release:true}})` |
| `reqboard_task_batch`（批量推进） | 同上；且批量与单卡共用同一套校验，分两个工具必然分叉 | `reqboard_task_move({tasks:[...]})` |

## 新增的内部接口（端口与纯函数）`serves: FR-2, FR-3, FR-6`

```typescript
// I-2 投递编排（FR-2/FR-3）：写路径用例产「意图」，适配器做投递
export interface VolatileNoticePort {
  /**
   * 请求把该窗口的易变段同步到会话尾部。
   * 实现侧负责：内容哈希去重 → 去抖 → inbox.prepend('next-step') → 失败退回头部 + 留痕。
   * 永不抛（失败以 NoticeDeliveryResult 回报），调用方用例不因投递失败而回滚写路径。
   */
  notify(windowKey: string, kind?: VolatileNoticeKind): Promise<NoticeDeliveryResult>
}

// I-3 易变段组装（纯函数，无 I/O）
export function buildVolatileNotice(input: VolatileNoticeInput): { kind: VolatileNoticeKind; text: string } | undefined
export function noticeHash(text: string): string                     // 内容规范化后 sha1
export function pickDebounced(pending: PendingNotice | undefined, incoming: {hash:string;text:string}, now: number, debounceMs: number): PendingNotice

// I-4 预算纯判定（FR-6，无 I/O）
export function openBudgetWindow(task: Pick<TaskRecord,'id'|'budgetRequests'>, now: number): BudgetWindow
export function chargeRequest(w: BudgetWindow): { window: BudgetWindow; exceeded: boolean }
export function releaseBudget(w: BudgetWindow, add: number): { window: BudgetWindow; released: boolean }  // 幂等

// I-5 卡评论（内部 helper，非工具）
export async function appendTaskComment(deps: UseCaseDeps, taskId: string, body: string, actor: ActorRef): Promise<void>
```

**端口失败语义**：

| 情形 | 返回 | 副作用 |
|---|---|---|
| 通道可用 | `{delivered:true, channel:'inbox-next-step'}` | `InjectionLog` 一条（`origin='system-notice'`） |
| 通道不可得（`窗口 {w} 不在线`） | `{delivered:true, channel:'system-prompt-fallback', reason}` | 头部写入 + `InjectionLog`（`origin='system-prompt'`）+ 降级诊断记录 |
| 内容未变（去重命中） | `{delivered:false, channel:'inbox-next-step', reason:'内容未变'}` | 无（不写留痕，避免日志噪声） |

## 删除的接口 `serves: FR-1`

| 接口名 | 原用途 | 删除原因 | 替代方案 |
|---|---|---|---|
| 无 | — | 本需求不删除任何对外接口 | — |

（有一处**语义迁移**而非删除：`boundSectionTextFrom` 仍在，但只产头部；其易变部分移入 `buildVolatileNotice`。）

## HTTP API 变更 `serves: FR-4`

| 方法 | 路径 | 变更 |
|---|---|---|
| 无 | — | 本需求不改 HTTP API（看板取数投影只新增可选字段透传，见 [data-model.md](data-model.md)） |

## 关键决策与取舍 `serves: FR-4, FR-5, FR-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 批量结果的字段名 | 新造全局信封 `{ok, code, message}` | `TaskMoveItemResult`（`ok` + 既有码名 + `error` 文本） | 全仓无统一信封；新造一个会引出无关重构，且既有拒绝码必须逐字透传（探针 B 第 6 节） |
| 节流数字怎么给 | 继续只在拒绝文案里写「还需等待约 N 秒」 | 顶层结构化 `throttleRemainingMs` + `guidance` | 现在的数字只进文案不进返回体（`support.ts:793` → `DoneEvidenceSpec.ts:143-145`），agent 无法据此决策只能 sleep 试探 |
| 放行 API | 新增工具 | 既有 `task_move` 的 `budget` 子对象 | 工具 schema 每轮重发；本需求立项的动因就是省这笔重发 |
| 投递失败怎么办 | 让用例抛错回滚写路径 | 端口永不抛，失败降级 + 留痕 | 写路径已落账（状态已推进），因通知失败回滚会制造状态倒退 |
| 批量节流口径 | 同批卡互相触发节流（等于批量必被拒） | 同批卡互不触发；跨批仍触发 | 事故 C 的防线由**逐卡 done 凭证门**承载（每张卡仍要汇报+真实动作），节流只防「无间隙连关」，两者不重叠 |

## 技术方案与亮点 `serves: FR-2, FR-3, FR-4, FR-6`

- **意图/实现分离**：写路径用例只调 `VolatileNoticePort.notify()`（意图），去重、去抖、投递、降级全在适配器里（实现）。用例可单测（fake port），投递可单测（fake agent）。
- **不新增工具的硬理由**：57 个工具的 schema 约 55.2K 字符，每轮请求重发一次；新增一个工具在全树尺度就是数十万 token——本需求的第一性原则就是「不为省请求而增请求」。
- **逐项结果复用既有码**：`results[i].code` 逐字透传既有拒绝码（`invalid_transition` / `REQBOARD_*`），不新造码，看板与排障口径不分叉。
