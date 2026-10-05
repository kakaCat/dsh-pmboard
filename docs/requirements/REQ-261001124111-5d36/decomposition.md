---
req: REQ-261001124111-5d36
doc: decomposition
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 拆分计划 · 面板自刷新与陈旧可见（REQ-261001124111-5d36）

> **TL;DR**：6 张卡：① 刷新调度器（纯逻辑 + 单测）→ ② 面板新鲜度渲染（时间戳/红条/版本提示 + 单测）
> → ③ 组件接线（展开即拉 + 5 秒轮询 + SSE 加速 + 切换清空 + 配置开关）→ ④ 版本戳通道（bundle 内联 + SSE 一帧）
> → ⑤ 回归与端到端自检 → ⑥ 文档同步。**服务端 JSON 契约、queue.json、台账零改动**；无数据迁移。

```
t1 调度器（纯逻辑）──┐
                     ├──▶ t3 组件接线 ──┐
t2 新鲜度渲染 ────────┘                 ├──▶ t5 回归与 E2E 自检 ──▶ t6 文档同步
t4 版本戳通道 ──────────────────────────┘
```

## 改动盘点（`serves: FR-1, FR-2, FR-3, FR-4, FR-5`）

| 文件 | 动作 | 说明 | 卡 |
|---|---|---|---|
| `src/client/panel-refresh.ts` | 新增 | 刷新调度器（纯逻辑，注入计时器） | t1 |
| `tests/panel-refresh.test.ts` | 新增 | 调度器单测（假计时器，TC-A…TC-H） | t1 |
| `src/client/node-panel.ts` | 修改 | `renderHead` 加数据时间；新增 `renderFreshnessBar`；入参加 `freshness` / `buildNotice` | t2 |
| `tests/panel-freshness-render.test.ts` | 新增 | 渲染单测（真实 payload + 兼容性断言，TC-I…TC-M） | t2 |
| `src/client/styles/node-panel.ts` | 修改 | 4 个新类（`.dsh-pm-np-fresh` / `.is-stale` / `-fresh-err` / `-build-notice`） | t2 |
| `src/client/conversation-progress.ts` | 修改 | 接调度器（start/stop/切换清空/SSE 加速）+ `np-reload` 委托 + 传 `freshness` | t3 |
| `tests/panel-refresh-wiring.test.ts` | 新增 | 接线断言：`refreshMs=0` 不起周期、切换先清空、`np-reload` 委托存在 | t3 |
| `src/plugin-config.ts` | 修改 | 新增 `panel.refreshMs` / `panel.staleAfterMs`（`0` = 关闭轮询回退） | t3 |
| `scripts/wrap-client.mjs` | 修改 | 注入 `window.__DSH_PM_BUILD__`（`sha256(lib/client.cjs)` 前 12 位） | t4 |
| `src/http/routers/stages.ts` | 修改 | `handleEvents` 连接后补一帧 `event: build`（读不到 `lib/client.cjs` 就不发） | t4 |
| `tests/panel-build-stamp.test.ts` | 新增 | 戳判定：相等/不等/缺失三态 | t4 |
| `docs/architecture/project-manual.md` | 修改 | 记录「面板自刷新与陈旧可见」这一节新认知 | t6 |
| 删除 | — | 无 | — |

## 任务总览（`serves: FR-1, FR-2, FR-3, FR-4, FR-5`）

| key | 标题 | phase | side | 依赖 | 一句话 |
|---|---|---|---|---|---|
| t1 | 刷新调度器：纯逻辑 + 假计时器单测 | implement | frontend | — | 展开即拉 + 周期轮询 + 事件触发 + 在飞去重 + 失败/陈旧记账，零 React/DOM |
| t2 | 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示 | implement | frontend | t1 | 三处 DOM 增量 + 缺省不渲染（既有输出逐字节不变） |
| t3 | 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关 | implement | frontend | t1, t2 | 把调度器接进会话面板宿主，切换需求先清空 |
| t4 | 版本戳通道：bundle 内联戳 + SSE `event: build` 帧 | implement | fullstack | — | 插件更新后页面自己说出来「点此刷新」 |
| t5 | 回归与端到端自检：既有断言不破 + 手工 E2E 证据 | test | frontend | t3, t4 | 跑门禁 + 真落库/真断网/真版本戳三步留档 |
| t6 | 文档同步：项目手册记录新认知 | doc | doc | t5 | 归档材料的 manual_updates 来源 |

## 任务明细（`serves: FR-1, FR-2, FR-3, FR-4, FR-5`）

**t1 刷新调度器：纯逻辑 + 假计时器单测**

- implementation：新建 `src/client/panel-refresh.ts`，按 `design/interfaces.md` 落
  `RefreshReason / PanelFreshness / PanelRefreshOptions / PanelRefresh / createPanelRefresh`。
  关键语义：`start()` 立即 `refresh('open')` 并起周期；`intervalMs=0` 只拉一次；在飞时 `refresh()` 立即返回且不发新请求；
  失败**不调** `onData`、`failureCount++`、`lastError` 截断 120 字符；成功清错并更新 `fetchedAt`；
  `stale = fetchedAt 缺失 || now()-fetchedAt > staleAfterMs`（跃迁时 `onChange`）；
  `stop()` 用代际计数作废在飞响应。计时器/时钟全部可注入（默认 `setInterval/clearInterval/Date.now`）。
- acceptance：`npx vitest run tests/panel-refresh.test.ts` 全绿且用例覆盖 TC-A…TC-H（周期 5000 语义、
  `intervalMs=0`、在飞去重、失败不回调 `onData`、成功清错、31 秒转 stale、`stop()` 后不回写、无数据即 stale）；
  `npx tsc --noEmit` 退出码 0；`npx vitest run tests/layer-boundary.test.ts` 仍绿（新文件零 import 服务端/领域层）。
- skipIntegration：true（纯函数模块，无外部接口可联调）

**t2 面板新鲜度渲染：数据时间 / 失败红条 / 版本提示**

- implementation：改 `src/client/node-panel.ts`——`NodePanelInput` 加可选 `freshness` / `buildNotice`；
  `renderHead` 内加 `<span class="dsh-pm-np-fresh" data-fetched-at data-stale data-refresh-ms>`（文案 `数据时间 HH:MM:SS`，无数据 `—`）；
  新增 `renderFreshnessBar()` 渲染 `dsh-pm-np-fresh-err`（`role="alert"`）与 `dsh-pm-np-build-notice`（`role="status"` + `data-action="np-reload"`）；
  渲染顺序：head → 版本提示 → 失败红条 → 既有内容。`src/client/styles/node-panel.ts` 加 4 个类（复用既有变量与警示色，不新增色值）。
- acceptance：`npx vitest run tests/panel-freshness-render.test.ts` 全绿，覆盖 TC-I…TC-M：
  19 张卡的真实 payload 渲染**不含**「暂无任务」且含 `np-dag-canvas`；陈旧态含 `is-stale` 与 `data-stale="1"`；
  失败态含 `role="alert"` 与「显示的是 … 的旧数据」；版本不等含 `np-reload`、相等不含；
  **不传 `freshness`/`buildNotice` 时输出与改造前逐字节相同**（兼容断言）；
  `npx vitest run tests/node-panel.test.ts` 仍全绿（既有断言零改动）。
- depends_on：t1

**t3 组件接线：轮询兜底 + SSE 加速 + 切换清空 + 配置开关**

- implementation：改 `src/client/conversation-progress.ts`——展开时 `createPanelRefresh({fetchOverview: () => fetchStageOverview(reqId), intervalMs, staleAfterMs, onData, onChange}).start()`，
  关闭时 `stop()`；`reqIdForStage` 变化时先 `setStageOverview(null)`（`loading`）再按新 id 重开（FR-4 不串档）；
  原「按 `req.updatedAt` 重拉」的 Effect 与 SSE Effect 改为**只调 `refresh('event')`**（SSE 降级为加速通道，不再承担唯一通路）；
  新增 `document` 级委托：`data-action="np-reload"` → `location.reload()`；
  改 `src/plugin-config.ts` 加 `panel?: { refreshMs?: number; staleAfterMs?: number }`（解析函数默认 5000/30000，`0` = 关闭轮询）。
- acceptance：`npx tsc --noEmit` 退出码 0；`pnpm build:client` 成功（`scripts/verify-client-build.mjs` 通过）；
  组件级断言（`tests/panel-refresh-wiring.test.ts`，静态 + 行为）：`refreshMs=0` 时 **不**建立周期计时器；
  切换 `reqId` 后首次 `onData` 之前必须先出现一次「清空/加载中」通知（不串档）；
  `np-reload` 委托存在且只调 `location.reload()`（不自动 reload）。
- depends_on：t1, t2

**t4 版本戳通道：bundle 内联戳 + SSE `event: build` 帧**

- implementation：改 `scripts/wrap-client.mjs`——读 `lib/client.cjs` 算 `sha256` 前 12 位，注入
  `window.__DSH_PM_BUILD__ = "<stamp>"`；改 `src/http/routers/stages.ts` 的 `handleEvents`——连接建立后补
  `event: build` + `data: {"stamp":"…"}`（读包根 `lib/client.cjs` 现算同口径哈希；读不到 → **不发帧**，不声称）；
  客户端收到 build 帧时与内联戳比对，不等 → 通过 `buildNotice` 显示「插件已更新（S1 → S2），点此刷新」（每个连接只提示一次）。
- acceptance：`node scripts/verify-client-build.mjs` 通过且 `lib/client.js` 内含 `__DSH_PM_BUILD__`；
  `npx vitest run tests/panel-build-stamp.test.ts` 全绿（相等→不提示 / 不等→提示 / 任一端缺失→不提示）；
  `curl -N -m 3 http://127.0.0.1:19387/dashboard/api/reqboard/events | head -5` 能看到 `event: build` 帧；
  既有 JSON 端点返回体逐字段不变（`curl .../stages` 的键集合与改造前一致）。
- skipIntegration：false（跨客户端/服务端一处接口，需联调）

**t5 回归与端到端自检：既有断言不破 + 手工 E2E 证据**

- implementation：跑全量门禁与测试；按 `design/test-cases.md`「手工验收步骤」逐步取证据（真落库 ≤5 秒出现、
  断网红条与恢复、切换不串档、改一行客户端源码后 `pnpm build:client` → 已打开页面出现「插件已更新」）；
  证据落 `docs/requirements/REQ-261001124111-5d36/evidence/`（命令 + 输出摘要 + 截图路径）。
- acceptance：`npx vitest run` 全绿（含既有 `node-panel` / `dag-view` 用例零改动）；`pnpm typecheck` 退出码 0；
  5 条手工验收步骤各有留档证据（缺任一条即本卡不通过）；「改坏必红」抽查一次（注释掉轮询 → `panel-refresh.test.ts` 转红）。
- depends_on：t3, t4

**t6 文档同步：项目手册记录新认知**

- implementation：更新 `docs/architecture/project-manual.md`——新增/追加一节「需求面板的刷新与陈旧可见」：
  为什么任务级变化不能只靠 `req.updatedAt`、为什么 SSE 只能是加速通道、陈旧为什么必须可见；
  并在需求目录内补 `retro`/结论指针（供归档材料 `manual_updates` 引用）。
- acceptance：`docs/architecture/project-manual.md` 含该节且内容与 `design/architecture.md` 的定案一致（人工核对）；
  该节引用的文件路径全部存在（`ls` 逐个通过）；归档材料可直接引用本节作为 `manual_updates`。
- depends_on：t5

## 条款覆盖对照表（`serves: FR-1, FR-2, FR-3, FR-4, FR-5`）

| 需求条款 | 接收任务 |
|---|---|
| FR-1 面板级自动刷新，无需刷新页面 | t1, t3, t5 |
| FR-2 数据时间可见（陈旧不再隐形） | t2, t3, t5 |
| FR-3 刷新失败要响亮 | t1, t2, t3 |
| FR-4 需求切换与重开不残留 | t3, t5 |
| FR-5 客户端版本陈旧可见 | t4, t5 |

## 迁移与兼容（**不单列卡的理由**）（`serves: FR-1, FR-5`）

本需求无数据迁移、无台账字段、无产物格式变化，因此不设迁移卡；兼容性由两张卡内的**可证伪断言**承接：

| 兼容面 | 承接卡 | 断言 |
|---|---|---|
| 既有面板输出（不传新入参） | t2 | TC-M 逐字节相同 + `tests/node-panel.test.ts` 零改动全绿 |
| 旧页面（不认识 `event: build`） | t4 | SSE 命名事件帧未被注册即忽略；既有 JSON 端点键集合不变 |
| 想一键回退 | t3 | `panel.refreshMs = 0` → 不建立周期计时器（回退到"打开拉一次"） |

## 风险与回滚（`serves: FR-1, FR-3`）

| 风险 | 缓解 / 判据 |
|---|---|
| 5 秒轮询造成请求压力 | 仅 `detailOpen` 时轮询；在飞去重（TC-C）；`refreshMs: 0` 可关；实测单次 `/stages` <100ms |
| 陈旧判定阈值过敏感 | 阈值走配置（默认 30 秒 = 6 个失败周期），只改视觉不改数据 |
| 版本戳误报（构建顺序） | 戳基准统一 `lib/client.cjs`；任一端不可得即不提示（TC 覆盖） |
| 回滚 | 还原上表 9 个源文件/脚本即可，无数据迁移 |
