---
req: REQ-261003191948-e94a
doc: interfaces
serves: FR-1, FR-2, FR-3, FR-4
---

# 接口设计 · 未就绪态对外契约（REQ-261003191948-e94a）

## HTTP 端点状态码矩阵 `serves: FR-2`

前缀不变：`/dashboard/api/reqboard`。未就绪态下**所有**方法、**所有**子路径走同一分支。

| 方法 | 路径 | 正常态 | 未就绪态 | 未就绪态响应体 |
|---|---|---|---|---|
| GET | `/health` | `200 {success:true,data:{status:'ok'}}` | **503** | `NotReadyBody` |
| GET | `/state` 与 `/` | `200 {success:true,data:BoardState}` | **503** | `NotReadyBody` |
| GET | `/events`（SSE） | `200 text/event-stream` | **503** | `NotReadyBody`（**不挂起连接**） |
| GET | `/injection-log` | `200` | **503** | `NotReadyBody` |
| GET | `/isolation-log` | `200` | **503** | `NotReadyBody` |
| GET | `/kb` | `200` | **503** | `NotReadyBody` |
| GET | `/file` | `200` / `404` | **503** | `NotReadyBody` |
| GET | `/requirements/summary` | `200` | **503** | `NotReadyBody` |
| GET | `/requirements/<id>` | `200` / `404` | **503** | `NotReadyBody` |
| POST | `/req/*`、`/artifacts/scan` | `200` / `4xx` | **503** | `NotReadyBody` |
| 任意 | 未匹配子路径 | `404 {success:false,error,code}` | **503** | `NotReadyBody` |

三条硬约束：

1. **未就绪态绝不返回 404**——404 与"路径写错"无法区分，是本次事故的成因。
2. **未就绪态绝不返回空册**——`{requirements: []}` 会被读成"数据没了"。
3. **SSE 端点不得挂起**——降级 handler 必须先回 503 再结束，不能进事件循环等待。

## 函数签名 `serves: FR-1, FR-3`

```ts
// src/repositories/migrationGate.ts
/** 只读预检：不建目录、不写文件、不抛错。 */
export function preflightLedger(options: MigrationGateOptions): PreflightResult

/** 既有导出，语义与行为不变：内部改为 preflightLedger + rethrow（判据同源）。 */
export function assertLedgerMigrated(options: MigrationGateOptions): boolean

// src/http/not-ready.ts
/** 造一个只回答 503 的 handler；不依赖任何业务端口。 */
export function createNotReadyHandler(
  failure: MigrationFailure,
): (req: IncomingMessage, res: ServerResponse) => Promise<void>

// src/wiring/not-ready.ts
/** 注册降级路由 + 双通道留痕；不触碰数据根。 */
export function enterNotReadyMode(ctx: Context, failure: MigrationFailure, logger: Logger): void

// src/http/envelope.ts
export function json(res: ServerResponse, status: number, body: unknown): void
export function ok(res: ServerResponse, data: unknown): void
export function fail(res: ServerResponse, err: unknown): void

// src/client/api.ts（签名变更）
export class ApiError extends Error {
  readonly code?: string
  readonly hint?: string
  constructor(message: string, code?: string, hint?: string)
}

// src/client/render/dom-utils.ts（签名变更）
export function buildError(message: string, hint?: string): string
```

## 错误码 `serves: FR-2, FR-3`

| 错误码 | 状态码 | 出现位置 | 语义 |
|---|---|---|---|
| `REQBOARD_REQUIRES_MIGRATION` | **503**（新增映射） | 未就绪 handler；`fail()` 新增分支 | 单册在场、数据根未迁移；必须人工跑迁移 |
| `REQBOARD_BRIDGE_NOT_READY` | 503（既有，不变） | `fail()` 既有分支 | 台账启动装配中 |
| `REQBOARD_NOT_FOUND` / `not_found` | 404（既有，不变） | 详情端点 | 需求不存在 |
| `invalid_input` / `invalid_transition` / … | 400（既有，不变） | `fail()` 既有分支 | 入参或流程不满足 |

`fail()` 的映射改动只有一行：

```ts
: e.code === 'REQBOARD_REQUIRES_MIGRATION' ? 503   // 本需求新增
: e.code === 'REQBOARD_REQUIRES_MIGRATION_XXX' ? ...  // （不存在，仅示位置）
```

同时 `fail()` 的响应体增加可选 `hint` 透传：

```ts
json(res, status, {
  success: false,
  error: e.message ?? String(err),
  ...(e.code ? { code: e.code } : {}),
  ...(typeof (e as { hint?: unknown }).hint === 'string' ? { hint: (e as { hint: string }).hint } : {}),
})
```

`hint` 缺省不出现（保持既有响应体形状不变）——只有带 `hint` 的错误对象才多一个字段。

## `hint` 的命令构造契约 `serves: FR-3`

```ts
const hint =
  '检测到 legacy 单册但数据根尚未迁移。请执行：\n'
  + `node --import tsx/esm scripts/migrate-ledger-v10.ts --file ${ledgerFile} --out ${dataRoot} --apply`
```

- 路径**原样内联**（不做 shell 转义）：本仓路径可能含空格，`--file` / `--out` 后不加引号即可被
  `node` 的参数解析正确处理；若未来发现有路径被 shell 截断，改用双引号包裹是**同一条构造点**内的一行修改。
- `--apply` 是刻意写死的：去掉它脚本默认 dry-run，用户照抄会以为"跑了没反应"。
- 构造点在 `migrationGate.ts` 内**唯一一处**；`assertLedgerMigrated` 抛出的错误与
  `preflightLedger` 返回的 failure 共用它。

## 客户端契约 `serves: FR-4`

```ts
async function unwrap<T>(p: Promise<Response>): Promise<T> {
  const res = await p
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as
      | { error?: unknown; code?: unknown; hint?: unknown }
      | undefined
    const message = typeof body?.error === 'string' && body.error.length > 0
      ? body.error                       // 服务端说了话 → 原样带上（FR-4 的核心）
      : 'HTTP ' + res.status             // 服务端没说 → 退回状态码（不制造假原因）
    throw new ApiError(
      message,
      typeof body?.code === 'string' ? body.code : undefined,
      typeof body?.hint === 'string' ? body.hint : undefined,
    )
  }
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string; code?: string }
  if (json.success !== true) throw new ApiError(json.error ?? 'API 返回失败', json.code)
  return json.data as T
}
```

`fetchReqFile` 的 `!res.ok` 分支同口径处理（该函数当前也直接丢体、只抛 `HTTP <status>`）。

调用方 `board-mount.ts` 的失败呈现：

```ts
catch (err) {
  if (viewEl !== undefined) {
    viewEl.innerHTML = buildError(
      err instanceof ApiError ? err.message : String(err),
      err instanceof ApiError ? err.hint : undefined,
    )
  }
}
```

## 兼容与弃用 `serves: FR-4`

| 入口 | 变更 | 兼容策略 |
|---|---|---|
| `GET /dashboard/api/reqboard/*`（正常态） | 无 | 逐字节不变 |
| `assertLedgerMigrated` | 返回值/抛出语义不变；错误对象**多**一个 `hint` | 既有断言不看 `hint`，不受影响 |
| `fail()` 响应体 | 带 `hint` 的错误多一个字段 | 客户端忽略未知字段；老客户端不受影响 |
| `ApiError` 构造 | 增第三可选参数 | 既有 `new ApiError(msg, code)` 全兼容 |
| `buildError(message)` | 增第二可选参数 | 既有调用点行为不变（无 hint 时不渲染命令块） |
