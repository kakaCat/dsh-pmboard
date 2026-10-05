---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8]
---

# 看板卡片显示会话运行中动效（泳道图 + 列表）

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**重档**（依据见文末「档位依据与单向升级」） ｜ 立项：2026-10-04
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 立项依据：用户原话「项目看板可以看到会话框在工作，就像左侧会话框 agent 工作的时候有一个圆圈的功能，在泳道图和列表上展示」。

## TL;DR

一句话：**把左侧会话列表那个「转圈 = 正在干活」的状态，搬到看板的泳道卡与列表行上——哪条需求此刻有窗口在跑，一眼可见。**

- 左栏已有这个能力：会话行 `node.running === true` → `StateDot state='ongoing'` → 转圈动画（`status.running` = 「进行中」）。
- 看板目前**完全没有**运行态：卡面只有窗口 chip（谁绑的）、进度条、token，看不出「此刻在不在跑」。
- 关键发现：运行态**客户端已经全量拿得到**（`ctx.sessions.list` 快照里每行有 `running`，且 host 经 `api-session/status` 全量推送）——
  因此本需求**纯客户端实现，不新增任何 host 接口、不改台账数据模型**。

**做**：泳道卡 + 列表行显示运行中指示（与侧栏同语义）；实时增隐；不可得时诚实不显示。

**不做**：不改台账/协议；不在归档条与详情页铺开（本期只做用户点名的泳道图 + 列表）；不替代「阻塞 / 暂停 / ready」等既有标记。

## 现状 → 目标

```
 今天                                        本需求后

 左栏会话列表                       ✓        左栏会话列表                       ✓
  ├ session-A  ⟳ 进行中（转圈）                ├ session-A  ⟳ 进行中（转圈）
  └ session-B  · 空闲                          └ session-B  · 空闲

 项目看板（泳道 / 列表）             ✗        项目看板（泳道 / 列表）             ✓
  ├ REQ-1 [窗口 w-1a2b] 进度 3/5               ├ REQ-1 [窗口 w-1a2b] ⟳ 进度 3/5
  └ REQ-2 [窗口 w-9c8d] 进度 0/4               └ REQ-2 [窗口 w-9c8d]  ·  进度 0/4
     ↑ 看不出有没有窗口在跑                       ↑ 一眼看出哪条在跑

 数据来源（今天未接线）：ctx.sessions.list.getSnapshot().byId[<sessionId>].running
                        + host 推送 api-session/status(sessionId, running) → 全量、实时
```

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 泳道卡出现运行中指示 | 让某需求绑定的窗口跑一个回合，刷新看板后读 DOM | 该卡内出现 `[data-running="true"]` 元素；同泳道其它需求卡**不出现** |
| A2 列表行出现同款指示 | 切到列表视图，读同一需求所在行 | 该行出现 `[data-running="true"]`，与泳道卡同判据（同一映射函数） |
| A3 结束即消失（实时） | 回合结束后不刷新页面，观察 ≤2s | 指示消失，无需手动刷新；`sessions.list` 订阅生效 |
| A4 人工建卡不误报 | 打开一条 `sourceSessionId` 缺失的需求卡 | 不渲染运行中指示，也不渲染空壳 |
| A5 多席位任一在跑即显示 | 需求含 `seats=[owner, worker]`，仅 worker 在跑 | 卡面显示运行中（映射函数含全部席位） |
| A6 无关会话抖动不重绘 | 只让**没绑任何需求**的会话切换 running，统计 `render()` 次数 | 看板重绘次数**不增加**（只在相关集合变化时重绘） |
| A7 服务不可得时诚实 | 假投影里 `sessions.list` 缺失 / `byId[sid].running` 缺字段 | 不显示指示、不抛错、控制台零 `error`（不伪造、不猜 `false` 之外的任何东西） |
| A8 既有渲染不回归 | `npx vitest run tests/client-view.test.ts tests/board-attach.test.ts` | 全绿：新增参数带默认值，旧调用点与快照断言不变 |
| A9 动效偏好被尊重 | 系统开启「减少动态效果」后打开看板 | 指示为**静态环**（不旋转），语义不丢 |
| A10 构建 / 类型 / 测试达标 | `pnpm typecheck`、`pnpm build:client`、`pnpm test` | 见「验收（怎么跑）」的命令与阈值 |

## 边界

1. **做**：`src/client` 侧新增「会话运行态读数 + 需求→会话映射」单点模块；把运行中指示渲染到**泳道卡**（`renderReqCard`）与**列表行**（`renderListCard`）；订阅 `sessions.list` 实现实时增隐；`prefers-reduced-motion` 降级；相应单测与样式分片。
2. **不做**：不改 host 侧任何接口 / 台账字段 / 数据模型（运行态不落盘、不进 `RequirementRecord`）；不新增 SSE 通道（复用既有 client store 订阅）。
3. **不做**：本期不在「已归档」底部条、需求详情页、DAG 节点、阶段面板上铺开运行中指示——用户点名的是泳道图与列表两处；其余位置待后续单独评估（避免一次改 8 个渲染点、回归面失控）。

## 产品定义

`dsh-pmboard` 的看板回答「项目有哪些事、各自到哪一步、谁在做」，但**答不了「此刻在不在动」**：

- 卡面 `dsh-pm-window` chip 只说明**绑定关系**（`sourceSessionId`），静态；
- `autoRun` 徽标只说明**机制开着**，不等于有回合在跑；
- 任务 `executions[].outcome === 'running'` 只说明**某次执行记录**的状态，且要展开详情才看得到。

DSH 客户端本就有**权威且实时**的运行态：

- 数据结构：`ctx.sessions.list` 是 `createSnapshotStore({ ids, byId, phase, projectionsBySession })`，每行含 `running: boolean`；
- 实时来源：host 经控制流推送 `api-session/status(sessionId, running)`，客户端 `handleSessionStatus` 落到同一个 store；
- 侧栏同源：侧栏会话行就是 `node.running` → `StateDot state='ongoing'`（文案 `status.running` = 「进行中」）。

本需求 = **把这个已有信号接到看板的卡面渲染上**，判据与侧栏逐字同源，不另造一套「谁在干活」的推断。

## 用户与角色

| 角色 | 今天的痛 | 本需求后拿到的 |
|------|----------|----------------|
| 盯多个窗口的人 | 只能去左栏逐个会话对，才知哪条需求在跑 | 看板一眼看到哪些需求正在被处理 |
| 判断「能不能插话」的人 | 不知道窗口是空闲还是在跑回合 | 转圈 = 忙；无转圈 = 空闲，可安心提新要求 |
| 排查「卡住了吗」的人 | 看板全静态，分不清「在跑」与「早停了」 | 运行态实时增隐，停摆立刻可见 |
| 开发 / 测试 | —— | 判据单点、可注入假投影、有可跑断言（A1–A10） |

## 功能点

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 客户端新增会话运行态读数单点（读 `ctx.sessions.list`，不新增 host 接口） | P0 |
| FR-2 | 需求 → 会话映射：席位权威 ∪ `sourceSessionId` 折算，任一在跑即视为在跑 | P0 |
| FR-3 | 泳道卡片显示运行中指示（与侧栏同语义：转圈） | P0 |
| FR-4 | 列表视图行显示同一指示（与泳道卡共用同一渲染单点） | P0 |
| FR-5 | 实时性：订阅会话 store，相关运行集合变化才重绘（无关抖动不重绘） | P0 |
| FR-6 | 诚实降级：读数不可得时不显示、不伪造、不抛错 | P0 |
| FR-7 | 动效与无障碍：`title` / `aria-label` 说明，`prefers-reduced-motion` 下静态环 | P1 |
| FR-8 | 生命周期与零回归：HMR 退订、默认参数兼容旧调用点 | P0 |

### FR-1: 会话运行态读数单点（纯客户端）

**详细说明**：
- **使用场景**：任何渲染点要问「这个会话在跑吗」。
- **数据来源**：`ctx.sessions.list.getSnapshot().byId[sessionId]?.running === true`。
  - `ctx.sessions` 已在插件 `inject` 列表中；投影范式与 `archivedSessionIds()` 同款（惰性 `window.__dshPmSessions` 读，服务可能晚于 `apply`）。
- **接口形态**：新增 `src/client/session-running.ts`，导出：
  1. `isSessionRunning(sid, access?)`：单会话判定；
  2. `runningSessionIds(access?)`：全部在跑的会话 id 集合（供重绘判据比对）；
  3. `subscribeSessionRunning(fn, access?)`：订阅 store，返回退订函数（服务/订阅能力缺失 → 返回 no-op 退订）。
- **边界条件**：服务缺失、`list` 缺失、`byId` 缺该行、`running` 非 `true` → 一律 `false`（**不猜、不抛**）。

**证据锚点**：`src/client/session-jump.ts:76-88`（client `sessions` 服务惰性投影）、`:99-104`（`archivedSessionIds` 同款范式）、`src/client/index.ts:29`（`inject` 已含 `sessions`）、`:69`；DSH 侧 `@deepseek-ai/dsh-api-session-controller` 的 `lib/types/client/sessions/service.js`（`projectList` 写 `byId[id].running`）、`lib/client.js`（`$on('api-session/status', …)` 全量推送）。

**验收标准**：
1. 假投影 `byId = { 'session-a': { running: true } }` → `isSessionRunning('session-a')` 为 `true`，`'session-b'` 为 `false`。
2. 假投影 `list` 缺失 → 三个函数都不抛，`isSessionRunning` 返回 `false`、`subscribe` 返回可安全调用的退订函数。
3. `grep -rn "reqboard" src/client/session-running.ts` → 零命中（不引入任何 host 依赖）。

### FR-2: 需求 → 会话映射（席位权威）

**详细说明**：
- **判据**：`running(req) = seats(req).some(s => isSessionRunning(s.windowKey))`；
  - `seats` 有值 → **以它为权威**（与 host `seatsOf` 同口径）；
  - `seats` 缺省（存量需求）→ 折算为单 owner `sourceSessionId`；
  - 两者皆无（人工建卡）→ `false`，不渲染空壳。
- **数据可达性**：`/state` 下发的是 `listSummaries()` 原样摘要，`seats` 在摘要里已有（`summarize()` 有则带）；客户端 `RequirementSummary` 类型需补 `seats?: WindowSeat[]`（**只补类型声明，不改服务端**）。
- **为什么不用「任务执行会话」当补充判据**：`tasks[].executions[].sessionId` 记录的**就是同一个绑定窗口的会话**，加入只会引入"历史执行记录残留"的误报面；本期不用（见边界 3）。

**证据锚点**：`src/domain/requirement/RequirementSummary.ts:70-72`（摘要已带 `seats`）、`:224`（`summarize` 有则带）、`src/application/internal/window.ts:37-40`（`seatsOf` 折算口径）、`src/http/routers/stages.ts:71-84`（`/state` 原样下发 `page.items`）、`src/client/types.ts:279-295`（客户端摘要类型现状缺 `seats`）。

**验收标准**：
1. 需求 `seats=[{owner,session-a},{worker,session-b}]`，仅 `session-b` 在跑 → 判为在跑（A5）。
2. 需求仅 `sourceSessionId=session-a`，在跑 → 判为在跑（存量路径）。
3. 需求两者皆无 → 判为不在跑，且卡面不出现任何运行中 DOM。
4. 映射函数对同一输入幂等（两次调用结果集合相等）。

### FR-3: 泳道卡片显示运行中指示

**详细说明**：
- **位置**：卡面窗口 chip 行（`renderReqCard` 的 `sessionChip` 处）——与「谁绑的」并排，「谁在跑」紧贴「谁绑的」。
- **形态**：内联 SVG 转圈环（track + arc），语义与侧栏 `StateDot state='ongoing'` 一致：1.5s 一圈、呼吸 dash；**14px** 以内不挤压既有 chip 行。
- **属性**：`class="dsh-pm-running" data-running="true" title="会话进行中（该需求绑定窗口正在执行回合）"`，容器带 `role="img"` + `aria-label`。
- **调用签名**：`renderReqCard(card, now, archived = NO_ARCHIVED, running = NO_RUNNING)`——**新参数带默认值**，既有调用点与快照断言逐字不破。

**证据锚点**：`src/client/views/artifacts.ts:121-161`（`renderReqCard`，`sessionChip` 在第 134 行）、`src/client/render/dom-utils.ts:95-124`（`sessionChipHtml` / `renderWindowChip`）、DSH 侧 `dsh-client-ui-primitives/lib/StateDot.module.css`（转圈视觉与 `prefers-reduced-motion` 降级）、`dsh-client-ui-workspace/lib/client.js:1417-1425`（侧栏 `node.running → ongoing`）。

**验收标准**：
1. 在跑需求 → 卡内 `[data-running="true"]` 命中 1 个；`aria-label` 非空。
2. 不在跑 → 零命中，且卡面 DOM 与改动前逐字节一致（快照/断言可证）。
3. 归档态 / `blocked` / `paused` 卡：指示**独立呈现**（不被这些既有 class 的置灰逻辑吃掉）。

### FR-4: 列表视图行显示同一指示

**详细说明**：
- **位置**：列表行标题列（与 `dsh-pm-list-title`、token 徽标同排）——列表行没有独立 chip 行，标题列是唯一的稳定锚点。
- **单点纪律**：泳道卡与列表行**共用同一个渲染函数**（`renderRunningDot(running)`），两处只传布尔值——禁止各写一份 SVG（本仓反复吃过的「两份真相」）。
- **调用签名**：`renderListCard(card, now, archived = NO_ARCHIVED, running = NO_RUNNING)`，默认值同上。

**证据锚点**：`src/client/views/board.ts:316-369`（`renderListCard` 现状）、`:105-160`（`buildBoard` 泳道构造）、`src/client/render/dom-utils.ts`（新增 `renderRunningDot` 落此，与 `sessionChipHtml` 同层）。

**验收标准**：
1. 同一需求在泳道与列表两处**同时**出现/消失（同判据、同渲染片段）。
2. `grep -c "dsh-pm-running" src/client/**` → 渲染片段只在一处定义（另一个文件只引用）。
3. 列表分页/排序切换后指示仍跟随正确行（不串行）。

### FR-5: 实时性（订阅 + 相关集合变化才重绘）

**详细说明**：
- **接线**：`createBoardAttachment` 内订阅 `subscribeSessionRunning(...)`；回调里计算「当前页需求的运行集合」，与上一次快照**做集合相等比较**，不同才 `scheduleRender()`。
- **为什么必须去抖**：`sessions.list` 的 store 在**任意**会话的任何列表/活动变化时都会通知（含无关会话的 token/标题更新）；无脑重绘 = 看板被别的窗口刷屏式重绘。
- **退订**：与 `unsubEvents` / `pollTimer` 同处 `dispose()`；HMR 重挂载不叠加监听（沿用 `window.__dshReqboardClient?.dispose()` 既有纪律）。
- **与既有刷新并存**：SSE（台账 revision）+ 轮询照旧；本订阅只负责**运行态**这一路信号，不取代也不改写它们。

**证据锚点**：`src/client/board-mount.ts:287`（`archivedSids()` 实时读取范式）、`:340-352`（`render()` 与 `buildBoard` 调用点）、`:461-465`（SSE → `fetchAll`）、`tests/session-jump.test.ts:40-70`（假服务投影的既有测试范式）。

**验收标准**：
1. 在跑 → 停：**不刷新页面**，≤2s 内指示消失（A3）。
2. 无关会话 running 抖动：`render()` 计数不变（A6，用可注入的计数探针断言）。
3. `dispose()` 后：store 再通知**不**触发渲染（无泄漏，可单测）。

### FR-6: 诚实降级（不显示 ≠ 撒谎）

**详细说明**：
- 服务/字段不可得 → **不渲染指示**（而不是渲染灰色占位或"未知"）；
- 不抛错、不 `console.error` 噪音（沿用 `archivedSessionIds` 的静默降级纪律）；
- 禁止用「本地时间戳 / 最近 updatedAt」之类的近似信号**伪造**运行态（宁可没有）。

**证据锚点**：`src/client/session-jump.ts:99-104`（不可得 → 空集，静默）、本仓铁律「失败要响亮」的边界：**能力不可得**属降级而非失败，但绝不允许**伪造**。

**验收标准**：
1. 假投影缺 `sessions` → 看板正常渲染，零指示，控制台无 error（A7）。
2. 代码中不存在「按 `updatedAt` 距今 < N 秒 = 在跑」这类推断（`grep` 可证零命中）。

### FR-7: 动效与无障碍

**详细说明**：
- `title` 写明「会话进行中（绑定窗口正在执行回合）」；容器 `role="img"` + `aria-label`，读屏可闻；
- 尊重 `@media (prefers-reduced-motion: reduce)`：不旋转，改成**静态半环**（语义不丢）；
- 颜色走主题令牌（`currentColor` + 既有 `--dsw-*`），不写死十六进制，暗色主题下可读。

**证据锚点**：DSH `StateDot.module.css`（`@keyframes dsh-state-dot-spin` / `dash`、`prefers-reduced-motion` 分支）、`src/client/styles/board.ts`（样式分片归属章纪律，见 C-05/C-12）。

**验收标准**：
1. 系统「减少动态效果」开启 → 环不旋转，元素仍在（A9）。
2. 暗色主题下对比可辨（人工确认，截图入 evidence）。

### FR-8: 生命周期与零回归

**详细说明**：
- 新参数一律**带默认值**（`NO_RUNNING = new Set()`），所有既有调用点（泳道、列表、测试夹具、详情页复用的 `renderReqCard`）零改动即编译通过；
- `dispose()` 退订；重复 `apply` 不叠加；
- 样式分片遵守归属章与 CSS 分片完整性（`pnpm build:client` 的 `verify-client-build` 断言）。

**证据锚点**：`src/client/board-mount.ts`（dispose 段）、`src/client/index.ts:113-123`（HMR dispose）、`scripts/verify-client-build.mjs`（关键符号 + 样式归属章 + 分片完整）。

**验收标准**：
1. `pnpm typecheck` 错误数 ≤ 基线（223），改动文件零错误（C-15）。
2. `pnpm build:client` 输出 `[verify-client] OK`（C-12）。
3. `pnpm test` 失败数 ≤ 基线 106，新增用例全绿（C-14）。

## 接口（对外入口）

本需求**不新增任何对外 HTTP / 工具接口**。变更面全部在客户端渲染层：

| 入口 | 变更 | 兼容性 |
|------|------|--------|
| `buildBoard(state, now, view, listOpts, archived, running?)` | 末尾新增可选参数 `running: ReadonlySet<string>` | 省略 = 空集，行为与今天逐字一致 |
| `renderReqCard(card, now, archived?, running?)` | 末尾新增可选参数 | 同上 |
| `renderListCard(card, now, archived?, running?)` | 末尾新增可选参数 | 同上 |
| `renderRunningDot(running: boolean): string` | **新增**渲染单点（泳道 + 列表共用） | 纯函数，零 IO |
| `src/client/session-running.ts` | **新增**模块：`isSessionRunning` / `runningSessionIds` / `subscribeSessionRunning` | 服务不可得 → 全降级为「不在跑」/no-op |

错误语义：**无错误码**——读数不可得不是失败，是「不显示」。禁止新增 `alert` / 弹框。

## 数据契约

| 项 | 内容 |
|----|------|
| 读（运行态） | `ctx.sessions.list.getSnapshot().byId[sessionId]?.running`；`true` = 在跑；**缺失 ≠ false 之外的任何东西**，一律按不在跑处理 |
| 读（需求侧） | `RequirementSummary.sourceSessionId?: string`、`RequirementSummary.seats?: WindowSeat[]`（**客户端类型需补 `seats` 声明**，服务端已在发） |
| 写 | **无**。运行态不入台账、不落盘、不进 `RequirementRecord`、不新增 SSE 帧 |
| 版本兼容 | 旧客户端无 `sessions.list` → 无指示（不报错）；旧服务端不发明细 `seats` → 折算单 owner，行为与今天一致 |

## 迁移与兼容

- **无数据迁移**：不新增字段、不改 schema，`record.json` 与 SQLite 均零改动。
- **无接口迁移**：不新增/不改 host 路由，回滚 = 回退本次客户端改动（`lib/client.js` 重建即恢复）。
- **降级矩阵**：

| 环境 | 表现 |
|------|------|
| 新客户端 + 新服务端（正常） | 泳道 + 列表实时显示运行中 |
| 新客户端 + 旧服务端（摘要无 `seats`） | 按 `sourceSessionId` 单 owner 判定，仍可用 |
| 旧客户端 + 新服务端 | 无指示（旧 bundle 未含本功能），其余零回归 |

## 测试策略

| 层级 | 覆盖对象 | 手段 / 用例 |
|------|----------|-------------|
| 单测 | 运行态读数、需求→会话映射、订阅与退订、降级 | `tests/client-session-running.test.ts`（新增，纯函数 + 假投影，node 环境） |
| 组件渲染 | 泳道卡 / 列表行出现与消失、默认参数不破 | `tests/client-view.test.ts`、`tests/board-attach.test.ts`（回归 + 新增断言） |
| 构建与类型 | 客户端 bundle、样式分片、类型不回归 | `pnpm build:client`（C-12）、`pnpm typecheck`（C-15）、`pnpm test`（C-14） |
| E2E（**人工浏览器**，非自动化） | 真实会话在跑 → 看板指示出现；回合结束 → 不刷新页面即消失；动效偏好降级 | 打开看板 + 让绑定窗口跑一个回合，人工观察并截图（evidence） |

## 验收（怎么跑）

1. 单测（新增 + 回归）：
   - `npx vitest run tests/client-session-running.test.ts`（新增：读数/映射/订阅/降级）
   - `npx vitest run tests/client-view.test.ts tests/board-attach.test.ts`（回归：泳道 + 列表渲染、挂载与 dispose）
2. 类型（C-15）：`pnpm typecheck` → 退出码 0，总错误数 ≤ 223 基线，改动文件零错误。
3. 客户端构建（C-12）：`pnpm build:client` → `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整`。
4. 全量测试（C-14）：`pnpm test` → 失败数 ≤ 106 基线，新增用例全绿。
5. 人工（A1/A3/A9，截图入 evidence）：
   - 让某需求绑定窗口跑一个长回合 → 看板卡面出现转圈；回合结束不刷新页面 ≤2s 内消失；
   - 系统开启「减少动态效果」→ 为静态环；
   - 暗色主题下可辨。

## 红线

- **不伪造运行态**：不可得即不显示；禁止用时间戳 / `updatedAt` / `autoRun` 近似推断。
- **不动 host**：不新增接口、不改台账字段、不改数据模型。
- **一处定义**：转圈 DOM 与判据各自**只能有一处实现**，泳道与列表共用。
- **零回归**：既有渲染签名默认值兼容，`client-view` / `board-attach` 断言不改判据即应通过。

## 档位依据与单向升级

**判重档**（不走轻档）：

1. **有新决策点**（轻档的第一个排除项）：① 判据取「席位 ∪ 来源窗口」还是叠加任务执行会话；② 实时重绘的去抖口径；③ 呈现位置与视觉形态。三条都需拍板，已在本文件写明取向。
2. **有跨层判据**：客户端判据必须与 host `seatsOf` 折算口径**逐字同源**，否则「看板说在跑、台账说没这个窗口」又成两份真相。
3. **有可测量的性能约束**：无关会话抖动不得触发看板重绘（A6），需要专门的重绘计数断言。

**单向升级**：实施中若发现 (a) 需要 host 侧新增运行态接口、(b) 需要改台账/协议字段、(c) 需要在 ≥3 个额外渲染点铺开——**立即停手升级重谈**，不在此需求内自行扩大。

**不降级**：本文档已按重档产出，实施中不得反向降为轻档。

## 批准闸门

本节点（brainstorming）产物 = 本文件。下一步：**design** —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入设计阶段。

## 修订记录

| 版本 | 时间 | 变更 |
|------|------|------|
| v1 | 2026-10-04 | 首版：立项后完成只读侦察（pmboard 客户端渲染链 + DSH 会话运行态来源），定 8 条 FR 与 A1–A10 判定标准 |

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t4 |
| FR-2 | ✅ 已接收 | t1、t4 |
| FR-3 | ✅ 已接收 | t2、t5 |
| FR-4 | ✅ 已接收 | t4、t2 |
| FR-5 | ✅ 已接收 | t4、t3 |
| FR-6 | ✅ 已接收 | t1、t4 |
| FR-7 | ✅ 已接收 | t2、t5 |
| FR-8 | ✅ 已接收 | t4、t5、t3 |

> 无未接收条款（8 条全部有落点）。

<!-- reqboard:marks:end -->
