---
req: REQ-261001124111-5d36
doc: architecture
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 架构设计 · 面板自刷新与陈旧可见（REQ-261001124111-5d36）

> **TL;DR**：把「面板数据」从**打开那一刻的快照**改成**面板自持的活窗口**——新增一个不依赖 React 的
> 刷新调度器（5 秒兜底轮询 + SSE 加速通道），面板头显示「数据时间」，失败时显示红色错误条（不再静默留旧快照），
> 切换需求先清空再拉，另加一枚构建戳用于「插件已更新，点此刷新」。**不动服务端数据契约、不动台账、不动面板结构。**

```
             现在（快照即真相）                          本设计（活窗口）
+-------------------------------------+     +-------------------------------------------+
| 打开面板 → GET /stages → 快照 X      |     | 打开面板 → 立即拉 + 每 5s 轮询 + SSE 事件  |
|   任务落库（不改 req.updatedAt）      |     |   → refresh('timer' | 'event')            |
|   SSE 没生效 / 页面跑旧 bundle        |     |   失败 → 保留旧数据 + 红条「显示的是旧数据」|
|        ↓                            |     |        ↓                                  |
|   永远停在 X（看起来「暂无任务」）     |     |   面板头「数据时间 HH:MM:SS」随刷新前进     |
+-------------------------------------+     +-------------------------------------------+
```

## 定案：面板为什么不刷新（`serves: FR-1, FR-3, FR-5`）

需求文档留了 A/B/C 三候选，本次以**文件时间戳 + 代码事实**定案（可复核，命令见下）。

| 候选 | 判定 | 证据 |
|---|---|---|
| **B 页面跑旧 bundle（主因）** | **成立** | `src/client/conversation-progress.ts` 源码 mtime = **10-01 10:57:31**（刷新触发修复写入源码）；`lib/client.js` 构建产物 mtime = **10-01 12:42:19**；用户截图落盘 = **12:40:37** —— 截图时**最新构建产物还没产出**。且面板快照≈12:04–12:06，而需求在 **12:25:26** 有过一次状态迁移（updatedAt 必变）：若页面跑的是含 `req.updatedAt` 依赖的当前代码，15 秒轮询必然触发一次重拉，面板不可能停在 12:05 |
| **A 任务级变化无兜底（放大器）** | **成立** | `src/application/use-cases/MoveTask.ts` 全文无任何 `updatedAt` 写入（`grep -c updatedAt` = 0）；`ExecuteTask.ts` 只写 `t.updatedAt`（368/411 行），不写 `r.updatedAt` → 任务增删/推进**不改** `req.updatedAt`，客户端那份「按 updatedAt 变化重拉」的 Effect 看不见它们，SSE 是**唯一**通路，SSE 一断即无限期旧快照 |
| **C 失败被吞（遮羞布）** | **成立** | `conversation-progress.ts:366-368`：错误态只在 `stageOverviewErr.length > 0 && stageOverview === null` 时渲染 → 已有旧快照时，**刷新失败被彻底吞掉**，用户看到的是"像没事一样的空面板" |

复核命令：

```
stat -f "%Sm %N" -t "%m-%d %H:%M:%S" src/client/conversation-progress.ts lib/client.js
grep -c "updatedAt" src/application/use-cases/MoveTask.ts        # 期望 0
sed -n '364,368p' src/client/conversation-progress.ts            # 期望 stageOverview === null 条件
```

已排除项（需求文档事实一，命令可复核）：`queue.json` 19 张卡、`/stages` 的 `stages[decomposing].body.tasks` 19 张、
`renderNodePanel` 用真实 payload 输出**不含**「暂无任务」且含 `<canvas id="np-dag-canvas">`。**病灶不在数据、不在渲染函数。**

## 改动落点（`serves: FR-1, FR-2, FR-3, FR-4, FR-5`）

| 文件 | 改什么 | 服务的 FR |
|---|---|---|
| `src/client/panel-refresh.ts`（新增） | 纯逻辑刷新调度器：立即拉一次 + 5 秒轮询 + 事件触发 + 在飞去重 + 失败计数/退避 + 产出 `PanelFreshness`。零 React、零 DOM、零计时器副作用（计时器由调用方注入） | FR-1, FR-2, FR-3 |
| `src/client/conversation-progress.ts` | 用调度器替换现有两处刷新 Effect 的职责：展开 `start()`、关闭 `stop()`；SSE 退化为**加速通道**（收到事件调 `refresh('event')`）；`reqIdForStage` 变化时先清空 overview 再 `refresh('switch')` | FR-1, FR-3, FR-4 |
| `src/client/node-panel.ts` | `renderHead` 增「数据时间 HH:MM:SS」；新增 `renderFreshnessBar()` 渲染陈旧/失败提示；`NodePanelInput` 增可选 `freshness` | FR-2, FR-3 |
| `src/client/styles/node-panel.ts` | 四处样式：`.dsh-pm-np-fresh`、`.dsh-pm-np-fresh.is-stale`、`.dsh-pm-np-fresh-err`、`.dsh-pm-np-build-notice` | FR-2, FR-3, FR-5 |
| `src/plugin-config.ts` | 新增 `panel?: { refreshMs?: number; staleAfterMs?: number }`；`refreshMs: 0` = **关闭轮询**（一键回退旧行为） | FR-1 |
| `scripts/wrap-client.mjs` | 构建时把 bundle 内容哈希写成内联常量 `__DSH_PM_BUILD__`（前 12 位） | FR-5 |
| `src/http/routers/stages.ts` · `handleEvents` | SSE 连接建立后补一帧 `event: build` + `data: {"stamp":"…"}`（读 `lib/client.js` 现算哈希；**读不到就不发这帧**，不声称） | FR-5 |
| `tests/panel-refresh.test.ts`（新增） | 假计时器下的调度语义（周期、在飞去重、失败重试、陈旧判定） | FR-1, FR-2, FR-3 |
| `tests/panel-freshness-render.test.ts`（新增） | 真实 `/stages` 形状 payload 的面板渲染断言（19 张卡不出「暂无任务」+ 时间戳/错误条 DOM） | FR-1, FR-2, FR-3 |

**为什么新增一个纯模块而不是继续写在组件里**：现有刷新逻辑埋在 `useEffect` 里，既无法在 vitest 里跑（无 React/DOM 运行时），
也无法证伪「5 秒内必刷」；抽成纯函数后，周期/去重/失败重试/陈旧阈值全部可测（见 `test-cases.md`）。

## 运行时序（`serves: FR-1, FR-2, FR-3, FR-4`）

```
面板展开          refresh('open')      ──▶ GET /stages ──▶ 成功: overview=X, fetchedAt=t0  ──▶ 头「数据时间 t0」
   │                    ▲                                                                │
   │ 每 5s              │ refresh('timer')  （在飞则跳过，不叠加请求）                      │
   ├────────────────────┘                                                                │
   │                                                                                     │
   ├── SSE event(task-created|task-moved|task-updated) ──▶ refresh('event') ──▶ 新卡出现 ──┘
   │
   ├── 失败（超时/非 2xx/网络断） ──▶ 保留 X + lastError + lastAttemptAt
   │                                  └─▶ 红条「刷新失败，显示的是 t0 的旧数据」+ 头时间戳转警示
   │
   └── 切换需求 / 关闭面板 ──▶ 先清空（loading）→ stop() 或按新 reqId 重开（不串档）
```

## 为什么不做服务端推送 / WebSocket（`serves: FR-1`）

- 面板是**核对用的辅助监控**，5 秒延迟足够；代价换来的是一条常驻双向连接 + 重连状态机 + 心跳鉴权。
- SSE 已存在且**保留为加速通道**：事件到达即刷（通常 <1 秒），轮询只兜底「SSE 不在/断线/旧 bundle 无订阅」。
- 服务端不做任何主动推送改造：`/stages` 返回体、`queue.json`、台账字段**一律不动**（需求边界第 4 条）。

## 兼容 · 灰度 · 回滚（`serves: FR-1, FR-5`）

- **兼容**：新增 DOM 元素与 CSS 类，既有区块与类名不动 → `tests/node-panel.test.ts` 的既有断言不因本需求改口径；
  SSE 新增的是**命名事件帧**（`event: build`），既有客户端（含旧页面）按 SSE 规范忽略未知命名事件 → 零影响。
- **灰度**：`plugin.panel.refreshMs`（默认 5000）、`staleAfterMs`（默认 30000）；`refreshMs: 0` 关闭轮询 = 回退改造前行为。
- **回滚**：还原上表 7 个源文件 + 2 个测试文件即可，**无数据迁移、无台账字段、无产物格式变化**。
- **升级触发器复核**：本次未命中需求文档的三条升级条件——根因在客户端（非主机侧缓存）、
  未新增服务端推送通道、未改 `/stages` 契约（版本戳走既有 SSE 通道的一帧）；故**保持轻档**。
