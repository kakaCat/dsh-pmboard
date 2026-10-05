---
req: REQ-261003191948-e94a
doc: backend
serves: FR-1, FR-2, FR-3, FR-5, FR-6
---

# 后端设计 · 宿主半的装配分叉与降级路由（REQ-261003191948-e94a）

> 条件必交：`requirement.md` front-matter 声明 `sides: backend, frontend`，故本份必交。
> 本文档覆盖 `src/index.ts`、`src/repositories/migrationGate.ts`、`src/http/**`、`src/wiring/**`。

## 服务与接口实现 `serves: FR-1, FR-2, FR-3, FR-5, FR-6`

| 类型 | 名称 | 职责说明 | 输入 | 输出 | 调用方 | 依赖 |
|---|---|---|---|---|---|---|
| 函数 | `preflightLedger` | 只读判定"能否装配"，返回判别联合而不抛错 | `options: MigrationGateOptions`（`dataRoot` / `ledgerFile`） | `{ok:true}` 或 `{ok:false, failure: MigrationFailure}` | `apply()`；`assertLedgerMigrated` | `node:fs` 的 `existsSync`、`node:path` 的 `join` |
| 函数 | `assertLedgerMigrated` | 既有导出，语义不变：内部改为 `preflightLedger` + rethrow | 同 `preflightLedger` | `true`；失败时抛带 `code`/`hint`/`dataRoot`/`ledgerFile` 的错误 | `apply()`（本需求改为不直接调它，见下）、`tests/reqboard/migration-gate.test.ts` | `preflightLedger` |
| 服务 | `enterNotReadyMode` | 注册降级路由 + 双通道留痕；零数据面副作用 | `ctx: Context`、`failure: MigrationFailure`、`logger` | `void` | `apply()` 的未就绪分支 | `ctx.inject(['webServer'])`、`createNotReadyHandler`、`captureDiag` |
| 接口 | `createNotReadyHandler` | 造一个只回答 503 的 HTTP handler；不依赖业务端口 | `failure: MigrationFailure` | `(req, res) => Promise<void>` | `enterNotReadyMode` | `src/http/envelope.ts` 的 `json` |
| 函数 | `json` / `ok` / `fail` | HTTP 信封与错误→状态码映射的**唯一**实现 | `res`、状态码 / 数据 / 错误对象 | `void`（写响应） | `routes.ts`、`not-ready.ts`、全部 `http/routers/*` | `node:http` 类型 |
| 模块 | `createReqboardHandler` | 既有正常态路由组合根，**本需求不改其行为** | `ReqboardRouteDeps` | `(req, res) => Promise<void>` | `apply()` 的正常分支 | `http/routers/*` |

## `apply()` 的分叉改动 `serves: FR-1, FR-5`

改动前后的控制流（**只有这 6 行是新增的**）：

```ts
// 改动前
assertLedgerMigrated({ dataRoot, ledgerFile: legacyLedgerFile });

// 改动后
const preflight = preflightLedger({ dataRoot, ledgerFile: legacyLedgerFile });
if (!preflight.ok) {
  // 只认迁移门：其余 ok:false 在本类型下不可达（MigrationFailure.code 是字面量类型）
  enterNotReadyMode(ctx, preflight.failure, logger);
  return;   // ← 不抛：fiber 存活，降级路由才留得住
}
```

顺序纪律（`D-ARCH-5`）：

1. `initCaptureDiag(...)` 与 `captureDiag('…apply function STARTED')` **保持原位**（在分叉之前）；
2. 预检与 `enterNotReadyMode` 都在 `new ShardedRequirementStore(...)` **之前**——
   降级路径不得构造任何存储对象、不得创建任何目录；
3. 正常分支从 `const sharded = new ShardedRequirementStore(...)` 起逐字节不变。

## `enterNotReadyMode` 实现要点 `serves: FR-2, FR-6`

```ts
export function enterNotReadyMode(ctx: Context, failure: MigrationFailure, logger: Logger): void {
  const detail = `${failure.code}: ${failure.message}\n迁移命令：${failure.hint}`
  logger.error('reqboard 未就绪（HTTP 全端点 503）：' + detail)
  captureDiag('reqboard-capture [NOT-READY]: ' + detail.replace(/\n/g, ' | '))
  ;(ctx as unknown as { inject?: (s: string[], cb: (c: any) => void) => void }).inject?.(
    ['webServer'],
    (webCtx: { effect?: (fn: () => void, label?: string) => void; webServer?: { register: (r: unknown) => unknown } }) => {
      webCtx.effect?.(() => {
        webCtx.webServer?.register({
          kind: 'prefix',
          path: '/dashboard/api/reqboard',   // 与正常态同一个前缀
          handler: createNotReadyHandler(failure),
        })
      }, 'dsh-pmboard: not-ready api')
    },
  )
}
```

三条实现纪律：

- 路径字面量与 `src/index.ts` 正常分支里的 `/dashboard/api/reqboard` **必须逐字一致**——
  两处写死同一个字符串是刻意的：`webServer.register` 对 `(kind, path)` 重复注册会抛错，
  同一个前缀天然保证"未就绪"与"正常"不会同时挂上。
- `captureDiag` 单行化（`\n` → ` | `）：诊断日志文件是逐行消费的，多行会破坏"一条失败一行"的可读性。
- 沿用既有 `(ctx as any).inject?.(...)` 惰性注入写法（与正常分支同款，见 `index.ts` 头注）。

## `fail()` 的映射改动 `serves: FR-2`

```ts
const status =
  /* …既有分支保持不变… */
  : e.code === 'REQBOARD_BRIDGE_NOT_READY' ? 503
  : e.code === 'REQBOARD_REQUIRES_MIGRATION' ? 503   // ← 新增一行
  : e.code === 'not_found' || e.code === 'REQBOARD_NOT_FOUND' ? 404
  : 500
```

并追加 `hint` 透传（仅在错误对象带 `hint` 时出现，见 `interfaces.md`）。
这一处的价值独立于降级路由：**任何**走到 `fail()` 的迁移门错误都会得到 503 + 命令，
不会因为将来某条新路径忘了映射而退化成 500。

## 信封抽取的迁移纪律 `serves: FR-2`

`json` / `ok` / `fail` 从 `routes.ts` 搬到 `envelope.ts` 时：

- **逐字节搬运**函数体，不改任何一行逻辑（除 `fail` 的两处新增）；
- `routes.ts` 里对 `RouterCtx` 的装配改为 `import { json, ok, fail } from './envelope.js'`，
  `createReqboardHandler` 的签名与全部 `routers/*` 的调用点**零改动**；
- 抽取后立刻跑 `npx vitest run tests/http-routes.test.ts`（或仓库既有路由用例）确认零回退。

## 边界与不做 `serves: FR-1, FR-5`

- **不做**通用装配异常降级：`apply()` 里除迁移门之外的 `throw` **一律不动**（`requirement.md` §边界 第 2 条）。
- **不做**降级态的工具注册、systemPrompt 段、SSE、事件订阅——未就绪就是未就绪，
  半个插件比不加载更难排查。
- **不做**数据根的任何写操作（不建目录、不写就绪文件）——迁移门的告警是"只读探测"，
  降级态沿用同一条纪律。
- **不改** `REQBOARD_SCHEMA_VERSION`、不改 SSE 帧形状、不加新前缀。
