---
req: REQ-261003191948-e94a
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 测试策略 · 七条断言怎么跑、看到什么算过（REQ-261003191948-e94a）

> **TL;DR**：原则**修前必红、修后必绿**。分三层：领域预检（真临时目录，零 mock）、
> 未就绪 handler（真 `req`/`res` 假对象）、客户端数据层（mock `fetch`）。
> 测试文件名与 `requirement.md` §验收 **逐字一致**，避免需求与设计两份真相。

## 断言与用例对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

| 需求断言 | 用例 | 命令 |
|---|---|---|
| A1 未就绪也起得来 | T3, T4 | `npx vitest run tests/reqboard/degraded-startup.test.ts` |
| A2 原因结构化 | T4, T5 | 同上 |
| A3 命令可照抄 | T2, T6 | `npx vitest run tests/reqboard/degraded-startup.test.ts -t hint` |
| A4 客户端不再吞原因 | T8, T9 | `npx vitest run tests/api-client.test.ts` |
| A5 降级零副作用 | T3, T7 | `npx vitest run tests/reqboard/degraded-startup.test.ts` |
| A6 留痕响亮 | T10 | 同上 |
| A7 不越界覆盖 | T11 | `npx vitest run tests/reqboard/degraded-startup.test.ts -t 非迁移门` |

## T1–T2 · 领域预检（真临时目录，零 mock） `serves: FR-1, FR-3`

**测试目标**：`preflightLedger` 与 `assertLedgerMigrated` 的判定与 `hint` 构造。
夹具沿用 `tests/reqboard/migration-gate.test.ts` 的 `mkdtempSync` 手法。

| 编号 | 被测 | 输入 | 通过条件 |
|---|---|---|---|
| T1 | `preflightLedger` 三态 | ① 有单册无 meta ② 有单册有 meta ③ 两者皆无 | ① → `ok:false`、`failure.code === 'REQBOARD_REQUIRES_MIGRATION'`；②③ → `ok:true`（**不抛错**，与 `assertLedgerMigrated` 的返回真值一致） |
| T2 | `hint` 构造（FR-3 / A3） | 同上 ① | `hint` 含 `migrate-ledger-v10.ts`、`--apply`、**真实** `ledgerFile` 与 `dataRoot` 全路径；`hint` **不含** `<单册>` / `<数据根>` / `<ledger` 任一占位符子串 |
| T2b | 同源（不产生第二份判据） | 同上 ①②③ | 对每个夹具：`assertLedgerMigrated` 抛错 ⟺ `preflightLedger().ok === false`；且两者 `message` **逐字相等** |

**修前必红**：`preflightLedger` 不存在时 import 失败即本层全红。

## T3–T7 · 未就绪 handler（真 req/res 假对象） `serves: FR-2, FR-5`

**测试目标**：`createNotReadyHandler` 的形状与"零副作用"。

| 编号 | 场景 | 通过条件 |
|---|---|---|
| T3 | `GET /state`、`GET /health`、`POST /req/create`、未匹配子路径（如 `/nope`）各发一次 | 四条全部 **503**（**不是 404**）；`Content-Type` 为 `application/json`；`Cache-Control: no-store` |
| T4 | 读 T3 四个响应体 | 每个都满足 `success === false`、`code === 'REQBOARD_REQUIRES_MIGRATION'`、`error` 非空、`hint` 非空 |
| T5 | `GET /events`（SSE 路径） | **503 且立即结束**（断言 `res.end` 被调用一次；不得进入事件循环、不得写 `text/event-stream` 头） |
| T6 | 响应体 `hint` 与 `preflightLedger().failure.hint` 比对 | **逐字相等**（三形状等价性，`data-model.md` §等价性要求） |
| T7 | 对未就绪 handler 发 4 类请求后检查夹具目录 | 数据根**未新建** `requirements/`；`meta.json` **仍未创建**（零副作用，A5） |

## T8–T9 · 客户端数据层（mock fetch） `serves: FR-4`

**测试目标**：`unwrap` 不再吞掉服务端说的话。夹具照 `tests/api-client.test.ts` 既有的 `mockFetchOnce`。

| 编号 | 场景 | 通过条件 |
|---|---|---|
| T8 | `mockFetchOnce(503, { success:false, error:'台账未迁移…', code:'REQBOARD_REQUIRES_MIGRATION', hint:'node --import tsx/esm …' })` → `fetchState()` | 抛 `ApiError`；`message` **等于**服务端 `error`（**不是** `HTTP 503`）；`code` 与 `hint` 均透传 |
| T8b | `mockFetchOnce(503)`（**空体 / 非 JSON 体**） | 抛 `ApiError`、`message === 'HTTP 503'`、`hint === undefined`——**不制造假原因**（服务端没说就不编） |
| T9 | `buildError('台账未迁移…', 'node --import …')` | 渲染串含 `error` 文案与 `hint` 命令；`buildError('x')`（无 hint）**不含**命令块 |

## T10 · 留痕响亮 `serves: FR-6`

**测试目标**：降级时两条通道都有完整记录。

| 编号 | 场景 | 通过条件 |
|---|---|---|
| T10 | 假 ctx（`inject` 捕获 + 假 logger）跑 `enterNotReadyMode` | `logger.error` 被调用且实参串含 `REQBOARD_REQUIRES_MIGRATION`；`captureDiag` 写入的日志行含 code **且含 hint**（不再停在「apply function STARTED」半句话） |
| T10b | 同上的 `ctx.inject` 调用 | 只注入 `['webServer']` 一次；**未**注入 `['tools']` / `['systemPrompt']`（FR-5） |

## T11 · 不越界覆盖 `serves: FR-1`

**测试目标**：非迁移门异常仍让装配失败（A7）。

| 编号 | 场景 | 通过条件 |
|---|---|---|
| T11 | 注入一个假夹具：有单册无 meta，但 monkey-patch 使 `preflightLedger` 返回 `ok:false, code:'REQBOARD_OTHER'`（类型上不可达 → 用 `as never` 强制） | 分叉代码**不进入**降级相：断言 `enterNotReadyMode` 未被调用；异常照旧冒泡 |
| T11b | 静态判据 | `index.ts` 的 catch 条件里出现的字面量**只有** `REQBOARD_REQUIRES_MIGRATION`（grep 断言：`src/index.ts` 中 `REQBOARD_REQUIRES_MIGRATION` 出现次数 === 1） |

## 回归路径 `serves: FR-1, FR-2`

这次事故的**同形夹具**就是回归路径，必须能一条命令重放：

```bash
# 造夹具：数据根只放 v9 单册（无 meta.json），然后按 §T3/T4 断言
npx vitest run tests/reqboard/degraded-startup.test.ts

# 既有迁移门行为不回退（仍抛同 code、仍不建目录、不新增写盘）
npx vitest run tests/reqboard/migration-gate.test.ts

# 客户端既有失败语义不回退
npx vitest run tests/api-client.test.ts
```

## 纪律性命令（非本需求新增，但改动后必跑） `serves: FR-4`

```bash
pnpm build:client    # C-12：改了 client 源码必须重建 bundle（期望 [verify-client] OK）
pnpm typecheck       # C-15：不高于基线 223 个错误
npx vitest run       # C-14：失败数 ≤ 基线 106
```

## 刻意不测的项 `serves: FR-5`

- **不测**「未就绪态下 13 个工具是否可用」——不注册即不可用，测它等于测"不存在的东西"；
  T10b 从接线侧断言未注入 `tools`，比运行期探测更直接。
- **不测**视觉呈现细节（CSS/布局）——本需求只到文案与命令块，`buildError` 的字符串断言已覆盖可证伪部分。
