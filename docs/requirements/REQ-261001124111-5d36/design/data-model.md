---
req: REQ-261001124111-5d36
doc: data-model
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 数据模型 · 面板新鲜度与状态机（REQ-261001124111-5d36）

> **TL;DR**：本需求**不新增任何服务端字段**。数据模型只有两块：① 客户端内存里的 `PanelFreshness`
> （时间 + 失败 + 陈旧判定，纯派生、不落盘）；② 面板视图状态机 `PanelState`（idle/loading/ready/error）。
> 服务端只多一帧**不带业务数据**的构建戳（`event: build`），用于「插件已更新」提示。

## 客户端状态模型（`serves: FR-1, FR-2, FR-3, FR-4`）

`PanelFreshness`（内存对象，随组件生命周期存在；**不写台账、不落盘、不进 localStorage**）：

| 字段 | 类型 | 来源 | 用途 | 缺省 |
|---|---|---|---|---|
| `fetchedAt` | `number?` | 成功拉取时的 `now()` | 面板头「数据时间」；陈旧判定基准 | 无（显示 `数据时间 —`） |
| `lastAttemptAt` | `number?` | 每次请求发出时的 `now()` | 诊断（多久没试过了）；不直接渲染 | 无 |
| `intervalMs` | `number` | `panel.refreshMs` 配置 | 轮询周期；`0` = 只拉一次 | 5000 |
| `staleAfterMs` | `number` | `panel.staleAfterMs` 配置 | 陈旧阈值（>30 秒转警示） | 30000 |
| `failureCount` | `number` | 连续失败计数（成功归零） | 诊断与文案强度 | 0 |
| `lastError` | `string?` | 失败原因截断 ≤120 字符 | 红条文案 | 无 |
| `inFlight` | `boolean` | 调度器内部 | 去重（在飞不发新请求） | false |
| `stale` | `boolean` | **派生**：`fetchedAt===undefined \|\| now()-fetchedAt > staleAfterMs` | 时间戳是否转警示 | false |

`PanelState`（面板视图的判别联合，唯一事实源 = 调度器回调 + `reqIdForStage`）：

| 状态 | 判定 | UI |
|---|---|---|
| `idle` | 面板未展开 | 不渲染面板 |
| `loading` | 已展开且本轮尚无成功数据（首拉 / **切换需求后**） | 「详情加载中…」；**不显示任何上一个需求的卡片** |
| `ready` | 至少成功过一次 | `renderNodePanel({overview, freshness})`；`freshness.stale` 时头时间戳警示，`lastError` 非空时叠加红条 |
| `error` | 已展开但**从未**成功（`fetchedAt` 缺失且有失败） | 红条「详情暂不可用：<err>」，不渲染空面板冒充「没有任务」（**本需求的核心反例**：空 ≠ 旧） |

## 状态转移表（`serves: FR-1, FR-2, FR-3, FR-4`）

| From → To | 触发 | 副作用 |
|---|---|---|
| `idle → loading` | 展开面板 | `start()`（立即 open 请求 + 起周期） |
| `loading → ready` | 首次成功 | `fetchedAt=t`、渲染 overview |
| `loading → error` | 首次失败 | 红条；**保留周期重试**（下个周期成功即进 ready） |
| `ready → ready` | 任意成功 | `fetchedAt` 前进、`failureCount=0`、清 `lastError`（红条消失） |
| `ready → ready(陈旧)` | 距 `fetchedAt` 超阈值，或一次失败 | 头时间戳 `data-stale="1"`；失败时叠加红条，**overview 不换**（宁可显示旧数据 + 明说旧） |
| `ready → loading` | **`reqIdForStage` 变化**（切换会话/需求） | 先清空 overview 再拉新数据（**不串档**，FR-4） |
| `* → idle` | 关闭面板 | `stop()`：清计时器 + 作废在飞响应 |

**不变量**：① 同时至多一个在飞请求；② `ready` 态的任何 UI 都在「有数据」或「明说这是旧数据」两者之一，
不存在「空面板 + 零提示」；③ 面板可见的数据必属当前 `reqIdForStage`。

## 常量与阈值（`serves: FR-1, FR-2`）

| 常量 | 值 | 依据 |
|---|---|---|
| 轮询周期 `refreshMs` | 5000 ms | 需求判定标准「≤5 秒」；本机实测 `/stages` <100ms / 87KB，代价可忽略 |
| 陈旧阈值 `staleAfterMs` | 30000 ms | 需求的「>30 秒未更新即转警示」；6 个周期都没成功 ⇒ 值得人看一眼 |
| 请求超时 | 8000 ms | 与既有 `/session/:id/progress` 轮询同口径（`AbortSignal.timeout(8000)`），不另立一套 |
| 失败重试 | 每周期一次（不退避） | 退避会让"越等越久才恢复"，与 FR-1 的 5 秒承诺冲突 |
| 版本提示去重 | 每个 SSE 连接一次 | 避免每次 `build` 帧都重排 DOM |

## 服务端数据契约不变式（`serves: FR-1, FR-5`）

| 契约 | 本需求是否改动 | 说明 |
|---|---|---|
| `GET /requirements/:id/stages`（`StageOverview`） | **不改** | 字段、形状、错误码一律不动；本次已实测其返回正确（19 张卡） |
| `GET /requirements/:id/stage/:stage` | **不改** | 同上 |
| `GET /`（`BoardState`）、`GET /session/:id/progress` | **不改** | 同上 |
| `docs/requirements/<REQ>/queue.json` | **不改** | 任务唯一存储；`layer/ready/edges` 派生口径不动 |
| 台账 `dsh-reqboard.json` | **不改** | 不加字段、不动 schema 版本 |
| `GET /events`（SSE） | **追加**一帧 `event: build` | 命名事件帧；未注册该事件的既有消费者按规范忽略 → 零影响；**不含任何业务数据** |
| 客户端 bundle 常量 | **追加** `window.__DSH_PM_BUILD__` | 构建期注入的字符串；不参与任何业务逻辑 |

## 版本戳数据形态（`serves: FR-5`）

| 项 | 形态 | 约束 |
|---|---|---|
| 戳值 | `sha256(lib/client.cjs)` 前 12 位十六进制（如 `a1b2c3d4e5f6`） | 两端**必须**同一输入文件同一算法，否则恒误报 |
| 客户端持有 | `window.__DSH_PM_BUILD__: string` | 由 `scripts/wrap-client.mjs` 注入；缺失（老 bundle）时**不显示**版本提示（不猜） |
| 服务端持有 | SSE `event: build` 帧 `{"stamp":"…"}` | 读不到 `lib/client.cjs` → 不发帧 |
| 判定 | `serverStamp && clientStamp && serverStamp !== clientStamp` → 提示 | 任一缺失 → 不提示（宁可漏报，不误报） |
| 动作 | 面板提示 + 用户点击 → `location.reload()` | **不自动 reload**（会打断正在输入的消息） |
