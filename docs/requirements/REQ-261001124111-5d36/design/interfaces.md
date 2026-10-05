---
req: REQ-261001124111-5d36
doc: interfaces
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 接口设计 · 刷新调度器 / 面板渲染入参 / 版本戳通道（REQ-261001124111-5d36）

> **TL;DR**：三个新契约——① `panel-refresh.ts` 的**纯逻辑调度器**（可注入计时器，能单测）；
> ② `renderNodePanel` 的**新鲜度入参**（时间戳 + 错误条 + 版本提示的 DOM 契约）；
> ③ 构建戳通道（bundle 内联常量 + 既有 SSE 的一帧 `event: build`）。**服务端 JSON 契约与台账字段零改动。**

## `src/client/panel-refresh.ts` —— 刷新调度器（`serves: FR-1, FR-2, FR-3`）

```ts
export type RefreshReason = 'open' | 'timer' | 'event' | 'switch'

export interface PanelFreshness {
  fetchedAt?: number       // 最近一次**成功**拉取的时刻（ms epoch）
  lastAttemptAt?: number   // 最近一次**尝试**的时刻
  intervalMs: number       // 轮询周期（默认 5000）
  staleAfterMs: number     // 陈旧阈值（默认 30000）
  failureCount: number     // 连续失败次数（成功后归零）
  lastError?: string       // 最近一次失败原因（≤120 字符，供 UI 直出）
  inFlight: boolean
  stale: boolean           // fetchedAt 缺失 或 now - fetchedAt > staleAfterMs
}

export interface PanelRefreshOptions {
  fetchOverview: () => Promise<StageOverview>   // 注入（生产 = api.fetchStageOverview(reqId)）
  onData: (overview: StageOverview, f: PanelFreshness) => void
  onChange: (f: PanelFreshness) => void         // 每次状态跃迁（含失败/陈旧）通知 UI
  intervalMs?: number                            // 默认 5000；**0 = 不轮询**（回退开关）
  staleAfterMs?: number                          // 默认 30000
  now?: () => number                             // 默认 Date.now（测试注入）
  setTimer?: (fn: () => void, ms: number) => unknown   // 默认 setInterval
  clearTimer?: (h: unknown) => void                    // 默认 clearInterval
}

export interface PanelRefresh {
  start(): void                                        // 立即 refresh('open') + 起周期
  stop(): void                                         // 停计时器并**作废在飞结果**（不再回调）
  refresh(reason: RefreshReason): Promise<void>        // 在飞则复用（不叠加、不排队）
  freshness(): PanelFreshness
  subscribe(f: (fresh: PanelFreshness) => void): () => void
}

export function createPanelRefresh(opts: PanelRefreshOptions): PanelRefresh
```

**语义（可证伪，逐条进单测）**：

| 场景 | 语义 |
|---|---|
| `start()` | 立即发一次请求（reason=open），随后每 `intervalMs` 发一次（reason=timer）；`intervalMs=0` 时只发 open 那一次 |
| 在飞去重 | 已有请求在飞时，`refresh()` **立即返回**且不发新请求（不排队、不叠加）；返回的是同一个 promise |
| 成功 | `fetchedAt=now()`、`failureCount=0`、`lastError` 清空、`onData(overview, f)`、`onChange(f)` |
| 失败 | **不发 `onData`**（保留上一次 overview 由调用方持有）、`failureCount++`、`lastError=String(err).slice(0,120)`、`onChange(f)`；下一次 timer 仍按周期重试（不退避，避免"越等越久"） |
| 陈旧 | `fetchedAt===undefined || now()-fetchedAt > staleAfterMs` → `stale=true`；陈旧跃迁时补一次 `onChange`（UI 才知道该转警示） |
| `stop()` | 清计时器 + 代际计数 +1 → 之后任何在飞响应**不得**再触发 `onData/onChange`（防"关面板后又被写回"） |
| 异常来源 | 网络错误、超时、非 2xx、`success:false`、JSON 解析失败 → 一律走失败分支，**不静默** |

## 面板渲染入参扩展（`serves: FR-2, FR-3, FR-5`）

`src/client/node-panel.ts`：

```ts
export interface NodePanelInput {
  overview: StageOverview
  stage: StageKey
  requirement: { id: string; title: string; promptDifficulty?: string | null; category?: string }
  /** 新增（可选，缺省 = 不渲染任何新鲜度元素，既有调用方与既有断言不变） */
  freshness?: {
    fetchedAt?: number
    lastError?: string
    intervalMs: number
    staleAfterMs: number
    now?: number
  }
  /** 新增（可选）：客户端版本落后于服务端最新构建时的提示 */
  buildNotice?: { clientStamp: string; serverStamp: string }
}
```

**DOM 契约（类名 / 属性 / 文案固定，测试按此断言）**：

| 元素 | 标记 | 文案与条件 |
|---|---|---|
| 数据时间 | `<span class="dsh-pm-np-fresh" data-fetched-at="<ms 或空>" data-stale="0\|1" data-refresh-ms="5000">` | 有 `fetchedAt` → `数据时间 HH:MM:SS`；无 → `数据时间 —`；`data-stale="1"` 时加 `is-stale` 类（视觉警示） |
| 刷新失败 | `<div class="dsh-pm-np-fresh-err" role="alert" data-last-ok="<ms 或空>">` | 仅当 `lastError` 非空：`刷新失败：<err> · 显示的是 HH:MM:SS 的旧数据`（无成功记录时写「暂无可用数据」） |
| 版本提示 | `<div class="dsh-pm-np-build-notice" role="status" data-action="np-reload" data-client-build data-server-build>` | 仅当 `clientStamp !== serverStamp`：`插件已更新（<客户端> → <服务端>），点此刷新`；**不自动 reload**（会打断用户输入） |

渲染顺序（固定）：`renderHead`（含数据时间）→ 版本提示 → 刷新失败条 → 既有 `infoFold` / `implViews`。
`freshness` 与 `buildNotice` 都不传时，输出与改造前**逐字节相同**（既有 `tests/node-panel.test.ts` 不破）。

## 版本戳通道（`serves: FR-5`）

| 端 | 形态 | 计算口径 |
|---|---|---|
| 构建期（客户端内联） | `scripts/wrap-client.mjs` 在包裹后的 bundle 顶部注入 `window.__DSH_PM_BUILD__ = "<stamp>"` | `sha256(lib/client.cjs 内容)` 取前 12 位十六进制 |
| 运行期（服务端帧） | SSE 连接建立后补发 `event: build` + `data: {"stamp":"<stamp>"}` | 读 `<包根>/lib/client.cjs` 现算同口径哈希；**文件不可读 → 不发这一帧**（不声称） |
| 客户端比对 | 收到 build 帧：`stamp !== window.__DSH_PM_BUILD__` → 面板显示版本提示（每个连接只提示一次） | 相等 → 不显示、不占位 |

**为什么哈希算在 `lib/client.cjs` 而不是 `lib/client.js`**：`client.js` 由 `wrap-client.mjs` 写入，戳本身在它体内——
对自身内容取哈希是自指（写入后哈希必变）。选未被改写的输入文件 `client.cjs` 作共同基准，两端拿到同一个值。

**兼容性**：`event: build` 是**命名事件帧**，SSE 规范规定未注册的命名事件**不触发 `onmessage`** →
既有客户端（含旧页面、含 `es.onmessage` 用法）完全忽略它；`/stages`、`/`、`/events` 的既有可见形状零变化。

## 失败语义与错误码（`serves: FR-1, FR-3, FR-4`）

| 情形 | 服务端 | 客户端表现 |
|---|---|---|
| `/stages` 5xx / 网络断 / 超时（`AbortSignal.timeout(8000)`，与既有 `/progress` 轮询同口径） | 不变 | 保留旧 overview + 红条（含最后成功时刻），下个周期重试 |
| `success: false` 或 JSON 坏 | 不变 | 同失败分支，`lastError` 记「返回体不可用」 |
| 需求不存在（404） | 不变 | 同失败分支（面板显红条，不白屏） |
| 切换需求（`reqIdForStage` 变化） | 不变 | **先清空**（overview=null + loading）→ 拉新数据；期间显示「详情加载中…」，**不得**显示上一个需求的卡片 |
| 关闭面板 | 不变 | `stop()`；在飞响应作废 |
| `lib/client.cjs` 不可读 | 不发 build 帧 | 不显示版本提示（不猜测、不误报） |
