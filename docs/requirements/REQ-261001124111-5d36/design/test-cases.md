---
req: REQ-261001124111-5d36
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 测试策略 · 面板自刷新与陈旧可见（REQ-261001124111-5d36）

> **TL;DR**：三层测试——① 纯逻辑单测（调度器，假计时器，**不需要 React/DOM**）；
> ② 渲染单测（真实 `/stages` 形状 payload + 新鲜度入参 → DOM 断言）；
> ③ 手工 E2E（真面板 + 另一窗口落库 + 断网 + 版本戳）。**每条断言都能被"改坏"证伪。**

## 测试策略与层级（`serves: FR-1, FR-2, FR-3, FR-4, FR-5`）

| 层级 | 覆盖 | 命令 | 期望 |
|---|---|---|---|
| 单元（调度器） | 周期、在飞去重、失败重试/计数、陈旧判定、stop 后不回写 | `npx vitest run tests/panel-refresh.test.ts` | 全绿；断言写死 5000/30000 的语义 |
| 单元（渲染） | 数据时间戳 / 陈旧警示 / 失败红条 / 版本提示 / 既有输出不破 | `npx vitest run tests/panel-freshness-render.test.ts` | 全绿；且**不传 freshness 时输出与改造前逐字节相同** |
| 单元（版本戳） | 戳一致性判定、缺失不误报 | `npx vitest run tests/panel-build-stamp.test.ts` | 全绿 |
| 单元（既有回归） | 面板既有结构断言不被本需求改写 | `npx vitest run tests/node-panel.test.ts tests/dag-view.test.ts` | 全绿（零改动口径） |
| 门禁 | 类型 + 层边界 + 客户端构建 | `pnpm typecheck && npx vitest run tests/layer-boundary.test.ts && pnpm build:client` | 全绿、构建产物生成 |
| **E2E（手工）** | 真面板 × 真落库 × 真断网 × 真版本戳 | 见下方「手工验收步骤」 | 每步有可观察结果 |

## 单测用例清单（`serves: FR-1, FR-2, FR-3, FR-4`）

`tests/panel-refresh.test.ts`（`vi.useFakeTimers()` + 注入 `setTimer/clearTimer/now`）：

| 编号 | 场景 | 断言 |
|---|---|---|
| TC-A | `start()` | 立即 1 次 `fetchOverview`；`advanceTimersByTime(5000)` → 第 2 次；再 5000 → 第 3 次 |
| TC-B | `intervalMs=0` | 只有 open 那次；`advanceTimersByTime(60000)` 仍为 1 次（回退开关有效） |
| TC-C | 在飞去重 | 第 1 次请求未 resolve 时 `refresh('event')` → **请求数仍为 1** |
| TC-D | 失败重试 | 第 1 次 reject → `failureCount=1`、`lastError` 非空、**不调用 `onData`**；下次 timer 仍发起请求 |
| TC-E | 成功清错 | 失败后再成功 → `failureCount=0`、`lastError` 清空、`fetchedAt` 前进 |
| TC-F | 陈旧跃迁 | `fetchedAt=t0`，`now` 前进 31 秒 → `stale=true` 且 `onChange` 被调用 |
| TC-G | `stop()` 后作废 | 在飞 promise 在 `stop()` 后 resolve → **不再**触发 `onData/onChange` |
| TC-H | 无数据即陈旧 | 从未成功（`fetchedAt` 缺失）→ `stale=true`（UI 不得声称"最新"） |

`tests/panel-freshness-render.test.ts`：

| 编号 | 场景 | 断言 |
|---|---|---|
| TC-I | 拆分节点 × 19 张卡（真实 payload 形状） | 输出**不含**「暂无任务」，含 `np-dag-canvas`，含 `data-fetched-at` |
| TC-J | 实施节点 × 19 张卡 | 泳道 6 列内出现卡片元素（≥12 个父卡） |
| TC-K | 陈旧 + 失败 | 含 `class="dsh-pm-np-fresh is-stale"`、`data-stale="1"`、`dsh-pm-np-fresh-err`（`role="alert"`）与旧数据时刻文案 |
| TC-L | 版本提示 | `clientStamp!==serverStamp` → 含 `dsh-pm-np-build-notice` + `data-action="np-reload"`；相等 → 不含 |
| TC-M | 兼容 | **不传** `freshness`/`buildNotice` → 输出与改造前逐字节相同（快照式断言） |

`tests/panel-build-stamp.test.ts`：`sha256(lib/client.cjs)` 前 12 位 == 内联戳（构建后自洽）；任一戳缺失 → 判定函数返回 `false`（不提示）。

## 自证有效（改坏必红）（`serves: FR-1, FR-3`）

| 故意破坏 | 必须转红的用例 |
|---|---|
| 把 `intervalMs` 默认改成 60000（超过 5 秒承诺） | TC-A |
| 让失败分支也调用 `onData`（把旧数据当新数据） | TC-D、TC-K |
| 去掉 `stop()` 代际作废 | TC-G |
| 把红条渲染条件改回「只有 `overview===null` 才显示」（即本次事故的写法） | TC-K |
| 切换需求时不先清空 | UC-3 对应的组件级断言（在 `panel-refresh` 侧 = 「`switch` 后首次 `onData` 前必须有一次 `onChange(loading)`」） |

## 手工验收步骤（`serves: FR-1, FR-2, FR-3, FR-5`）

1. **自动出现**：面板展开在「拆分」节点 → 另一窗口对同一需求执行一次任务推进 →
   **≤5 秒**面板计数/卡片变化；**不刷新页面**。（判据：录屏或前后截图对比）
2. **事实源一致**：`curl -s "http://127.0.0.1:19387/dashboard/api/reqboard/requirements/<REQ>/stages" | python3 -c "import json,sys;d=json.load(sys.stdin)['data'];s=[x for x in d['stages'] if x['stage']=='decomposing'][0];print(len(s['body']['tasks']))"`
   → 与面板显示数量一致（差值窗口 ≤1 个刷新周期）。
3. **失败可见**：DevTools 断网 ≥30 秒 → 出现红条与 `data-stale="1"`；恢复网络 ≤10 秒 → 红条消失、时间戳前进。
4. **不串档**：面板展开时切到另一需求窗口 → 先「详情加载中…」，随后只显示新需求卡片。
5. **版本提示**：改一行客户端源码 → `pnpm build:client` → 已打开的页面（不刷新）出现「插件已更新，点此刷新」；点击后提示消失。

## 回归风险与不破坏既有断言（`serves: FR-2`）

| 风险 | 缓解 |
|---|---|
| 新增 DOM 破坏既有面板断言 | `freshness`/`buildNotice` 缺省不渲染；`tests/node-panel.test.ts` 用例零改动即应保持全绿（TC-M 兜底） |
| 5 秒轮询造成请求压力 | 仅在 `detailOpen` 时轮询；在飞去重；`refreshMs: 0` 可关闭 |
| 新增 SSE 帧干扰既有消费者 | 命名事件帧，未注册者按 SSE 规范忽略；不新增 JSON 端点、不改既有返回体 |
| 版本提示误报（构建顺序不一致） | 戳基准统一为 `lib/client.cjs`；任一端不可得即不提示 |
