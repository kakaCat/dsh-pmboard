---
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 接口设计（REQ-261004195831-0f52） serves: FR-1, FR-2, FR-3, FR-4, FR-5

> 本需求**不新增服务端接口**：全文端点 `GET /requirements/:id` 已由 REQ-261002161439-277d 提供。
> 本文档定死的是**客户端内部契约**（新模块导出签名 + 三个占位渲染函数 + 既有渲染入口的入参约束）。

## 服务端契约（既有，不改） `serves: FR-1, FR-2`

### GET /dashboard/api/reqboard/requirements/:id `serves: FR-1, FR-2`

**用途**：按需取单条需求的**全文**（详情页唯一正文数据源）。
**调用方**：客户端 `req-detail-store`（本需求新增唯一调用点）。

**接口定义**：

```typescript
// 请求：GET /dashboard/api/reqboard/requirements/REQ-261004195831-0f52
// 成功响应（200）
interface DetailOk {
  success: true
  data: { revision: number; requirement: RequirementRecord }
}
// 失败响应（HTTP 4xx/5xx）
interface DetailErr {
  success: false
  error: string
  code?: string   // 'REQBOARD_NOT_FOUND' | …
  hint?: string   // 可复制修复命令（如有）
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `:id` | `string`（路径） | 是 | 需求 id（`REQ-…`） | 无 |

**返回值说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `data.revision` | `number` | 台账全局版本（失效判据） |
| `data.requirement` | `RequirementRecord` | 全文（含 `comments/artifacts/plan/verification/archive/statusHistory`） |

**异常情况**：

| 错误码 | 触发条件 | 返回内容 | 客户端落点 |
|---|---|---|---|
| `REQBOARD_NOT_FOUND` | 需求不存在（已删除/换工作区） | `{success:false, code:'REQBOARD_NOT_FOUND', error:'未找到需求 <id>'}` | `missing` 态（FR-2） |
| 其它 `4xx/5xx` / 超时 | 服务端异常、网络不可达 | `error`（+ 可选 `hint`） | `error` 态（FR-2） |

## 客户端模块契约（新增） `serves: FR-1, FR-3`

### req-detail-store `serves: FR-1, FR-3`

**用途**：详情全文的内存态与取数编排（在途去重、按版本失效）——**纯逻辑、无 DOM、无存储写入**，
以便在本仓 node 环境（无 jsdom）直接单测。
**调用方**：`src/client/board-mount.ts`（`case 'req'` 的渲染与刷新路径）。
**落点**：`src/client/req-detail-store.ts`。

**接口定义**：

```typescript
/** 依赖注入：只为可测（生产注入 api.fetchRequirement）。 */
export interface ReqDetailDeps {
  fetchRequirement: (id: string) => Promise<{ revision: number; requirement: RequirementRecord }>
  /** 变更通知（视图订阅后重绘）；同一批变更只通知一次。 */
  onChange?: () => void
}

export interface ReqDetailStore {
  /**
   * 确保 reqId 的详情可用（本需求唯一取数入口）。
   * - 无条目 / 需要失效 → 发 1 次请求，登记 loading，返回；
   * - 在途（loading）→ 复用在途 Promise，**不发新请求**；
   * - ready 且 (summaryVersion, ledgerRevision) 均未变 → 直接返回，不重取；
   * - missing / error → 返回既有结果（重试走 retry）。
   * @param summaryVersion 当前摘要记录的 version（来自 /state；缺省 = 不按 version 判失效）
   * @param ledgerRevision 当前台账 revision（来自 /state；缺省 = 不按 revision 判失效）
   */
  ensure(reqId: string, summaryVersion?: number, ledgerRevision?: number): void
  /** 当前条目（无 → undefined）；渲染函数据此分支。 */
  get(reqId: string): ReqDetailEntry | undefined
  /** 用户点「重试」：清掉该 id 的条目后重新 ensure（强制取数）。 */
  retry(reqId: string): void
  /** 视图卸载/切走时清空（幂等）。 */
  reset(): void
}

export function createReqDetailStore(deps: ReqDetailDeps): ReqDetailStore
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `deps.fetchRequirement` | `(id) => Promise<{revision, requirement}>` | 是 | 取全文（生产 = `api.fetchRequirement`） | 无 |
| `deps.onChange` | `() => void` | 否 | 条目变化通知（视图订阅重绘） | 无（不通知） |
| `reqId` | `string` | 是 | 需求 id | 无 |
| `summaryVersion` | `number` | 否 | 摘要 `version`，失效判据之一 | `undefined` = 不据此判失效 |
| `ledgerRevision` | `number` | 否 | 台账 `revision`，失效判据之一 | `undefined` = 不据此判失效 |

**异常情况**：

| 触发条件 | store 行为 | 视图结果 |
|---|---|---|
| `ApiError.code === 'REQBOARD_NOT_FOUND'` | 记 `missing`（保留 `message`） | 「未找到」占位（FR-2） |
| 其它异常 / 超时 | 记 `error`（`message` + `hint` + `code`） | 失败占位 + 重试（FR-2） |
| 响应 `requirement.id !== reqId` | **丢弃响应**（不写条目） | 视图维持原状态（FR-2 边界） |
| 页面销毁后响应才到 | 丢弃（`reset()` 后不写条目） | 无（视图已不在） |

## 占位渲染契约（新增） `serves: FR-2`

### views/detail-states.ts `serves: FR-2`

**用途**：三种非成功态的详情占位 HTML（纯函数，与 `buildError` 同款口径，便于单测断言文案）。
**调用方**：`board-mount.ts` 的 `case 'req'`。
**落点**：`src/client/views/detail-states.ts`。

```typescript
/** 取数中：详情骨架内就地占位（不白屏）。 */
export function buildDetailLoading(reqId: string): string
/** 404：说清是哪条需求不在，并给「← 看板」返回；不自动切视图。 */
export function buildDetailMissing(reqId: string, message: string): string
/** 其它失败：原因 + hint 原样呈现 + 重试入口（data-action="retry-detail"）。 */
export function buildDetailError(reqId: string, message: string, hint?: string): string
```

**HTML 契约（事件委派依赖，不得改名）**：

| 元素 | 选择器 | 语义 |
|---|---|---|
| 占位容器 | `.dsh-pm-detail[data-detail-req="<id>"]` | 与正常渲染同根，返回/刷新按钮照旧可用 |
| 状态标记 | `[data-detail-state="loading\|missing\|error"]` | 单测断言用（不参与样式逻辑） |
| 重试按钮 | `button[data-action="retry-detail"][data-id="<id>"]` | 由 `board-mount` 的既有 `[data-action]` 委派处理 |
| 返回看板 | `button[data-action="back"]` | 复用既有分支（不新增语义） |

**异常情况**：

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| —（纯函数） | `message` 为空 | 使用兜底文案（`取数失败`），不产出空标签 |
| —（纯函数） | `hint` 为 `undefined` | 不渲染 hint 块（与 `buildError` 同口径） |

## 既有渲染入口（签名不变，入参约束收紧） `serves: FR-1, FR-4`

### buildReqDetail `serves: FR-1, FR-4`

**用途**：详情页 HTML 渲染（不变）。
**签名**：`buildReqDetail(req: RequirementRecord, tasks: TaskRecord[], now?: number, archived?: ReadonlySet<string>): string`
**入参约束（本次收紧）**：`req` **必须是全文**（`GET /requirements/:id` 的 `requirement`）；
不得再传 `state.requirements` 里的摘要记录——**但**即便传了（旧调用方/半残数据），
本函数也必须按 FR-4 兜底渲染、**不抛异常**（兜底 ≠ 掩盖：正常路径仍必须传全文，由 FR-5 的
反向断言守住）。

**异常情况**：

| 触发条件 | 行为 |
|---|---|
| `req.comments` / `artifacts` / `plan` / `verification` / `archive` / `statusHistory` / `docLinks` 缺失或非数组 | 按空数组/缺省渲染对应空态，不抛异常 |
| `req.comments` 为空数组 | 评论区显示「暂无评论」，计数 0 |
| `req.status` 非法 | 沿用既有 `STATUS_LABELS[status] ?? status` 行为（不新增分支） |

### renderComments `serves: FR-4`

**签名（放宽）**：`renderComments(comments: CommentRecord[] | undefined): string`
**行为**：`undefined` / 非数组 → 返回 `<div class="dsh-pm-empty">暂无评论</div>`（与空数组逐字节一致）。
**调用方**：详情评论（`stage-detail.ts`）、任务卡评论（`stage-panel.ts`）——两处同口径。
