---
req: REQ-261003191948-e94a
doc: architecture
serves: FR-1, FR-2, FR-3, FR-5, FR-6
---

# 架构设计 · 未就绪态：让装配失败自身可解释（REQ-261003191948-e94a）

> 面向：零上下文的执行者——只凭本文档 + `requirement.md` 就应能写出拆分计划。
> 语言强度按层：设计以技术语言为主，不必写成散文；每节必须回答"服务哪条功能点"。

## 现状：单相装配（全有或全无） `serves: FR-1`

`src/index.ts` 的 `apply()` 是**单相**的：从头跑到尾，中途任一异常 ⇒ fiber 失败 ⇒ 该 entry 的
所有 effect 被 dispose ⇒ 路由、工具、systemPrompt 段、客户端半边**一起消失**。

```
apply()
  ├─ initCaptureDiag                              ← 诊断通道在此建立
  ├─ assertLedgerMigrated(...)   ← 唯一前置断言，抛错点
  ├─ new ShardedRequirementStore / QueueTaskStore
  ├─ ctx.inject(['tools']) → 注册 13 个 reqboard_* 工具
  ├─ ctx.inject(['systemPrompt']) → 捕获引导段
  └─ ctx.inject(['webServer']) → webServer.register({kind:'prefix', path:'/dashboard/api/reqboard'})
```

关键事实：**抛错点在第 4 行，而路由注册在第 12 行**。于是失败时连"我失败了"都传不出去——客户端
请求 `/dashboard/api/reqboard/*` 落到 SPA 兜底 handler，得到 404。

## 目标形态：三相启动（正常 / 未就绪 / 装配失败） `serves: FR-1, FR-2`

```
apply()
  ├─ initCaptureDiag
  ├─ preflight = preflightLedger({ dataRoot, ledgerFile })
  │    ├─ ok:true  ─────────────▶ 相 1「正常」：装配照旧（逐字节不变）
  │    └─ ok:false ─┬─ code==='REQBOARD_REQUIRES_MIGRATION'
  │                 │     ─────────▶ 相 2「未就绪」：注册降级路由 → 留痕 → return（不抛）
  │                 └─ 其他 code ──▶ 相 3「装配失败」：照旧抛出（插件启动失败）
  └─ （正常相继续原有装配）
```

**为什么不吞掉全部异常**：统一降级会让真正的装配 bug 变成"插件看起来已加载"，把排查方向带偏。
三相里只有相 2 是本需求新增的，相 1 与相 3 行为必须逐字节不变（FR-1 只捕一个 code）。

## 关键结构决策 `serves: FR-1, FR-2, FR-3, FR-5, FR-6`

- **D-ARCH-1 · 预检函数取代裸断言，判据同源**
  在 `migrationGate.ts` 新增 `preflightLedger(options)`，返回判别联合而不是抛错；
  `assertLedgerMigrated` 改为**调用它并 rethrow**。两种用法共享同一份判定函数与同一份 hint 构造——
  绝不出现"抛错版说一套、预检版判另一套"的第二份真相。

- **D-ARCH-2 · 降级 handler 独立成模块**
  新增 `src/http/not-ready.ts`，导出 `createNotReadyHandler(failure)`。
  它挂在**同一个** `/dashboard/api/reqboard` 前缀上，对所有方法、所有子路径一律 503。
  为什么不复用 `createReqboardHandler`：后者**强制要求** `requirementStore` / `taskStore`（组合根显式断言），
  而降级态恰恰没有这些对象——复用会逼出"假存储"，正是迁移门要防的东西。

- **D-ARCH-3 · 信封与错误映射抽成单一源**
  把 `json` / `ok` / `fail` 从 `src/http/routes.ts` 抽到新模块 `src/http/envelope.ts`；
  `routes.ts` 与 `not-ready.ts` 都从它 import。理由：两处各写一份信封必然漂移（本仓有"两份真相"的教训）。
  同时 `fail()` 增加 `REQBOARD_REQUIRES_MIGRATION → 503`，并在响应体透出 `hint`。

- **D-ARCH-4 · `index.ts` 只做分叉，不承载降级逻辑**
  `index.ts` 已达 606 行（C-02 的 400 行门禁早已是既有失败项），本需求**不得**再加逻辑进去。
  降级动作收进 `src/wiring/not-ready.ts` 的 `enterNotReadyMode(ctx, failure, logger)`，
  `index.ts` 只增加"预检 + 分叉"约 6 行。

- **D-ARCH-5 · 降级分叉必须在任何写盘动作之前**
  `preflightLedger` 是纯读（`existsSync` 两次），不建目录、不写文件。
  `enterNotReadyMode` 只注册路由与写日志，**不触碰数据根**——保证"空册不会被探路坐实"。

## 文件结构 `serves: FR-1, FR-2, FR-3, FR-5, FR-6`

| 路径 | 职责（一句话） | 新增/改动 |
|---|---|---|
| `src/repositories/migrationGate.ts` | 迁移门：新增 `preflightLedger` 与 `hint` 构造；`assertLedgerMigrated` 改为同源 rethrow | 改动 |
| `src/http/envelope.ts` | HTTP 信封与错误→状态码映射的**唯一**实现（`json` / `ok` / `fail`） | 新增 |
| `src/http/not-ready.ts` | 未就绪 handler：任何子路径回 503 + 结构化原因 | 新增 |
| `src/http/routes.ts` | 改从 `envelope.ts` 取 `json/ok/fail`；删本地副本 | 改动 |
| `src/wiring/not-ready.ts` | `enterNotReadyMode`：注册降级路由 + 双通道留痕 | 新增 |
| `src/index.ts` | 预检 + 三相分叉（≤6 行） | 改动 |
| `src/client/api.ts` | `unwrap` / `fetchReqFile` 解析非 2xx 错误体；`ApiError` 增 `hint` | 改动 |
| `src/client/render/dom-utils.ts` | `buildError(message, hint?)` 渲染可复制命令块 | 改动 |
| `src/client/board-mount.ts` | 把 `ApiError.hint` 传给 `buildError` | 改动 |
| `tests/reqboard/degraded-startup.test.ts` | 未就绪装配与 hint 的验收用例 | 新增 |
| `tests/reqboard/migration-gate.test.ts` | 追加：`preflightLedger` 与 `assertLedgerMigrated` 同源 | 改动 |
| `tests/api-client.test.ts` | 追加：非 2xx 错误体透出 | 改动 |

## 组件边界 `serves: FR-2, FR-3`

- `preflightLedger` 只回答"能不能装配"，不知道 HTTP、不知道 ctx——纯函数 + 两次 `existsSync`。
- `createNotReadyHandler` 只回答"未就绪时怎么回话"，不知道台账、不认识业务码以外的领域。
- `enterNotReadyMode` 是唯一的接线点：`ctx.inject(['webServer'])` + 日志。它不知道信封长什么样。
- 客户端 `unwrap` 只负责"把服务端说的话原样带上来"，不做业务分支——降级文案由服务端决定，客户端不猜。

这样切分的收益：三块各自可单测（纯函数 / 纯 handler / 假 ctx），互不依赖，符合"单元可独立理解与测试"。

## 失败与留痕语义 `serves: FR-5, FR-6`

| 情形 | 插件状态 | HTTP | 留痕 |
|---|---|---|---|
| 未迁移（本次新增相） | **已加载**（degraded） | 全端点 503 + `code` + `hint` | `logger.error` 一条 + `captureDiag` 一条（含 code 与 hint） |
| 其他装配异常 | **启动失败** | 404（现状不变） | 由 DSH Loader 报（现状不变） |
| 正常 | 已加载 | 200 | 现状不变 |

刻意保留的不对称：只有**已判定为可行动**的失败才进入降级相。"未知失败"仍然响亮地失败在启动期。

## 不做什么 `serves: FR-1`

- 不改 DSH 核心「装配失败 ⇒ 客户端 bundle 不参与启动图」（`dsh-client-modules` 按 `entry.fiber` 过滤）——
  跨仓，且这正是本需求要**绕开**而不是修改的行为：只要 apply 不抛，客户端半边自然加载。
- 不做通用装配异常降级框架（预检只覆盖迁移门，见 `requirement.md` §边界）。
- 不新增 HTTP 前缀、不加端点、不改 SSE 帧形状、不 bump schemaVersion。
