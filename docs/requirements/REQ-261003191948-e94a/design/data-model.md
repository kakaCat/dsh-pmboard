---
req: REQ-261003191948-e94a
doc: data-model
serves: FR-2, FR-3, FR-4
---

# 数据模型 · 未就绪态的数据契约（REQ-261003191948-e94a）

> 本需求**不改台账、不改 schema、不加表**。本文件只定"失败信息"这一组新的内存/线上形状。

## 概览：三个新形状，零持久化 `serves: FR-2, FR-3, FR-4`

| 形状 | 活在哪 | 是否落盘 | 生命周期 |
|---|---|---|---|
| `MigrationFailure` | 宿主进程内（`preflightLedger` 返回值） | 否 | 一次 `apply` 调用 |
| `NotReadyBody` | HTTP 响应体 | 否 | 一次请求 |
| `ApiError`（增 `hint`） | 浏览器内存 | 否 | 一次请求 |

**没有任何新字段写进台账**：`REQBOARD_SCHEMA_VERSION` 维持不变，`~/.dsh/reqboard/**` 一个字节都不动。

## `MigrationFailure` `serves: FR-3`

```ts
/** 迁移门预检失败（宿主内形状）：把"为什么"与"怎么办"一次带全。 */
export interface MigrationFailure {
  /** 机器可判的错误码；本需求只认这一个值 */
  readonly code: 'REQBOARD_REQUIRES_MIGRATION'
  /** 人读原因（沿用迁移门既有 message 文本，逐字不变） */
  readonly message: string
  /** 代入真实路径的可复制命令（FR-3）：用户复制即跑，无需替换占位符 */
  readonly hint: string
  /** legacy 单册绝对路径（既有字段，语义不变） */
  readonly ledgerFile: string
  /** v10 数据根绝对路径（既有字段，语义不变） */
  readonly dataRoot: string
}

/** 预检结果：判别联合，调用方按 ok 分叉——不用异常做控制流。 */
export type PreflightResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: MigrationFailure }
```

约束：

- `code` 是**字面量类型**（不是 `string`）——调用方无法把别的错误码塞进降级分支。
- `message` 与 `hint` 都非空；`hint` **不得**含 `<单册>` / `<数据根>` 占位符（验收 A3 的机械判据）。
- `hint` 由 `ledgerFile` 与 `dataRoot` 拼接而成，**不在别处再拼一遍**（单一构造点）。

## `NotReadyBody` `serves: FR-2, FR-3`

```ts
/** 未就绪响应体：与既有失败信封同形，只多一个可执行 hint。 */
export interface NotReadyBody {
  readonly success: false
  /** = failure.message */
  readonly error: string
  /** = failure.code，固定 REQBOARD_REQUIRES_MIGRATION */
  readonly code: 'REQBOARD_REQUIRES_MIGRATION'
  /** = failure.hint */
  readonly hint: string
}
```

与既有信封的关系（**刻意同形**）：

| 字段 | 既有失败信封（`fail()`） | 未就绪响应体 |
|---|---|---|
| `success` | `false` | `false`（同） |
| `error` | 人读原因 | 人读原因（同） |
| `code` | 可选 | **必填**（未就绪必须有唯一语义） |
| `hint` | 本需求新增（可选） | **必填**（未就绪必须带可执行指引） |

HTTP 头：`Content-Type: application/json; charset=utf-8`、`Cache-Control: no-store`。
**不带** `Retry-After`：这不是"稍后自动恢复"的临时态，而是要人跑一条命令才能恢复的状态——
给了 `Retry-After` 会误导客户端去重试。

## `ApiError`（新增 `hint`） `serves: FR-4`

```ts
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    /** 服务端给的修复命令（FR-4）；服务端没给则为 undefined */
    readonly hint?: string,
  ) { super(message) }
}
```

兼容性：`hint` 是**第三位可选参数**，既有 `new ApiError(msg, code)` 调用点全部不受影响；
字段只增不改，`code` 语义不变。

## 线上形状的等价性要求 `serves: FR-2, FR-3, FR-4`

同一条失败信息在三个形状之间**必须逐字等价**，只在"字段名"上做一次翻译：

```
MigrationFailure                NotReadyBody                 ApiError
  .code  ─────────────────────▶  .code   ─────────────────▶  .code
  .message ────────────────────▶  .error  ─────────────────▶  .message
  .hint  ──────────────────────▶  .hint   ─────────────────▶  .hint
```

翻译点只有两处：`createNotReadyHandler`（宿主侧）与 `unwrap`（浏览器侧）。
**任何一处做了截断 / 改写 / 二次拼接，即判为违约**——A4 断言用"逐字相等"锁死这条。

## 反例：三种被明确拒绝的形状 `serves: FR-2`

- **404 + 空体**（现状）：客户端只能造出"HTTP 404"，用户不知道发生了什么。
- **200 + 空册**（`{ requirements: [] }`）：比 404 更危险——用户以为"需求全没了"。
  这正是迁移门存在的理由，降级态绝不允许退化成它。
- **503 + 纯文本**：`dsh web authentication required; ...` 那种 `text/plain` 体。
  形状不可解析 ⇒ 客户端拿不到 `hint` ⇒ FR-4 失效。必须走 JSON 信封。
