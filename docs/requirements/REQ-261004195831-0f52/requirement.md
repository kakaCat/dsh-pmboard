---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5]
sides: [frontend]
---

# 需求说明（REQ-261004195831-0f52 看板需求详情页打不开：/state 改摘要后未按需取全文）

> 本文档面向：产品、开发、测试、用户——**写给人看，不是写给代码看**。

## TL;DR

- **这是什么**：项目看板点开**任一**需求详情即报错、详情区不渲染——详情页当前完全不可用。
- **为什么现在做**：B12 阶段⑥-①（REQ-261002161439-277d）已把 `GET /state` 改成只下发**摘要**（不再带 comments/artifacts/plan/archive），而客户端详情视图仍在读摘要记录的**本体字段**；「进入详情时按需取全文」这半边接线从未落地。这是功能级回归，不是新能力缺失。
- **做完得到什么**：点开任一需求 → 详情正常显示评论 / 文档记录 / 验收 / 归档 / 时间线；数据在**进入详情那一刻**取（首屏仍然是 0 次详情请求，A9 载荷治理成果不倒退）。

## 复现步骤（最小重现）

1. 打开 GUI `http://127.0.0.1:19387` → 看板（dsh-pmboard）面板。
2. 在任一泳道卡片上单击（`data-action="open-req"`），或从会话面板「项目看板 ↗」定位进详情。
3. **预期**：详情页显示该需求的 8 态进度点、6 个 Tab、评论、产物。
   **实际**：控制台 `Uncaught TypeError: Cannot read properties of undefined (reading 'length')`（栈顶 `client.js:3010`，即 `renderComments(req.comments)`），详情内容不渲染。
4. 离线最小重现（本仓 vitest 为 node 环境、无 jsdom，故用纯函数复现）：构造一条 `RequirementSummary` 形状的记录（`{id,title,status,blocked,createdAt,updatedAt,version,commentCount,artifactCount,category}`，**无 comments**）调 `buildReqDetail(summary, [], Date.now())` → 同一个 `TypeError: Cannot read properties of undefined (reading 'length')`（已在 brainstorming 阶段实测一次，作为本需求起点证据）。

## 根因

```
 用户点开需求卡（open-req / 深链 / 会话面板定位）
        │
        ▼
 render() case 'req'                        （src/client/board-mount.ts）
        │
        ├── 现状 ─ state.requirements  ← /state 自 B12 ⑥-① 起只回摘要
        │              │
        │              └─▶ buildReqDetail(summary)
        │                        │
        │                        └─▶ renderComments(req.comments)
        │                                  └─▶ undefined.length   ✗ TypeError（详情页整块不渲染）
        │
        └── 本需求 ─ api.fetchRequirement(id) ─▶ GET /requirements/:id（服务端已实现）
                          │
                 ┌────────┼──────────┐
                 ▼        ▼          ▼
              加载中    404 未找到   其它失败
                 │        │          │
                 └────────┴────┬─────┘
                               ▼
                 全文 RequirementRecord ─▶ 评论/产物/验收/归档/时间线 ✓
```

- **服务端（已定契约，不改）**：`handleState`（[src/http/routers/stages.ts](../../../src/http/routers/stages.ts)）自 REQ-261002161439-277d 起只回 `listSummaries()`——`id / title / status / blocked / commentCount / artifactCount / category / sourceSessionId / workspaceRoot / version / createdAt / updatedAt`，**本体字段不再随首屏下发**；全文改由 `GET /requirements/:id` 提供（`handleRequirementDetail` 已实现，未命中回 404 `REQBOARD_NOT_FOUND`）。
- **客户端（缺陷所在）**：`render()` 的 `case 'req'`（[src/client/board-mount.ts](../../../src/client/board-mount.ts)）从 `state.requirements` 里找出记录**直接**交给 `buildReqDetail`；后者读 `req.comments`（[renderComments](../../../src/client/render/dom-utils.ts#L249) 的 `comments.length`、[stage-detail.ts:127](../../../src/client/views/stage-detail.ts#L127) 的 `req.comments.length`）→ 对 `undefined` 取 `.length` 抛错。同理危险的还有 `req.artifacts / plan / verification / archive`（多数点已用 `?? []` 兜住，但**详情页数据源本身取错了**，兜住也不显示任何本体内容）。
- **未收尾的证据**：客户端 `api.fetchRequirement(id)`（[src/client/api.ts](../../../src/client/api.ts)）**已经写好**，注释写明「进入详情时取」，但全仓 `src/` 无任何调用点；[types.ts:302](../../../src/client/types.ts#L302) 与 [tests/state-payload-client.test.ts](../../../tests/state-payload-client.test.ts) 都把「详情按需取数」标注为**收尾项/待办**。

## 产品定义

**一句话**：让详情页在「首屏只发摘要」的新契约下重新可用——进入详情时按需取该需求的全文，并以全文为唯一数据源渲染；取数途中与取不到时都给人看得懂的话。

| 痛点（实测） | 本次解决 |
|---|---|
| 点开任一需求即报错、详情区不渲染（详情页等于没有） | 进入详情按需取全文并渲染（FR-1） |
| 取数需要时间，这段等待不该是白板 | 加载态占位：在详情骨架内就地替换（FR-2） |
| 需求被删 / 换了工作区时，现在会**静默弹回看板**（人以为点错了） | 未找到/失败三态明确说清原因 + 给出路（FR-2） |
| 别的窗口改了台账，详情该跟着变；但 Tab / 阶段选中态 / 评论草稿不能被冲掉 | 刷新同步 + 交互态不丢 + 同 reqId 请求去重（FR-3） |
| 「服务端少给一个数组，前端就崩」这类脆弱面 | 缺数组按空处理，缺字段不抛错（FR-4） |

**与现状的区别**：

| 维度 | 现状 | 本次之后 |
|---|---|---|
| 详情数据源 | `state.requirements` 里的**摘要**（本体字段全缺） | `GET /requirements/:id` 的**全文**（按需、进详情才取） |
| 首屏开销 | 只有摘要（正确，B12 成果） | **不变**：首屏 0 次详情请求（现有用例继续守着） |
| 详情取不到时 | `if (!req) mode = board` **静默**弹回看板 | 加载 / 未找到 / 失败三态显式呈现，不静默改视图 |
| 缺字段鲁棒性 | `undefined.length` → 整页崩 | 缺数组按空渲染（「暂无评论」），不崩 |

## 用户与角色

| 角色 | 什么场景用 | 痛点（本次解决哪个） |
|---|---|---|
| 看板主人（本仓维护者 / PM） | 点卡看这条需求走到哪、评论文档验收在哪 | 点开即报错，什么都看不到（FR-1/FR-2） |
| 实施窗口 agent（靠看板交付面自检） | 提交验收材料前在详情页核对产物 / 验收 / 归档 | 详情不可用 → 只能靠命令与 JSON 自检（FR-1） |
| 旁观者（另一窗口只看不动） | 长时间停在某需求详情看进展 | 刷新后内容要跟得上台账，Tab 位置不能被冲掉（FR-3） |

## 功能点（需求条款）

### 功能点清单

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 进入需求详情按需取全文：详情各区的数据源是 `GET /requirements/:id` 的全文，首屏仍 0 次详情请求 | P0 |
| FR-2 | 取数三态显式呈现：加载中 / 未找到（404）/ 失败（含 hint），不白屏、不静默弹回看板 | P0 |
| FR-3 | 详情随台账刷新且交互态不丢：同一需求在途请求去重、内容随 revision/version 更新、Tab 与阶段选中与 DAG 状态保持 | P1 |
| FR-4 | 摘要/半残记录的防御性降级：本体数组缺失按空渲染，任何情况下详情不再抛 `TypeError` | P0 |
| FR-5 | 回归可证伪：新用例覆盖「摘要形状不崩 + 进详情恰 1 次详情请求 + 404 呈现」，C-12/C-14/C-15 全过 | P0 |

---

### FR-1: 进入需求详情按需取全文

**功能描述**：用户点开一条需求（或深链/看板定位进入详情）时，客户端调用 `GET /dashboard/api/reqboard/requirements/:id` 取该需求**全文**，并以全文作为详情页所有区段（评论、文档记录、产物、验收、归档、时间线）的**唯一**数据源。

**详细说明**：

- **使用场景**：看板泳道/列表点卡片、会话面板「项目看板 ↗」定位、页面加载时带 `?req=` 深链。
- **操作流程**：
  1. 用户触发打开详情 → 视图切到详情模式（进度点、Tab、操作条先出）。
  2. 客户端发起 1 次 `GET /requirements/:id`。
  3. 取到全文 → 用全文渲染；此后该需求的正文一律来自这份全文。
- **预期结果**：
  - 详情页显示该需求的评论条数与评论内容、文档记录、产物 chip、验收材料、归档材料、状态时间线。
  - **首屏（看板/泳道/列表）不因本改动新增任何详情请求**——`GET /state` 仍只拿摘要（守住 REQ-261002161439-277d 的 A9 成果）。
  - 详情页不再从 `state.requirements`（摘要）读取本体字段。
- **边界条件**：
  - 旧服务端（无 `/requirements/:id`）→ 按 FR-2 的失败态呈现（不假装有数据、不静默弹回看板）。
  - 同一需求重复进入详情（返回看板再点回来）→ 允许复用内存里已是当前版本的那份全文；不强制每次重取。
  - 任务详情页（`open-task`）不属于本 FR 的数据源切换范围（其 `req` 参数仅用于标题/来源窗口等摘要级展示）。

**验收标准**（可跑）：

1. `npx vitest run tests/req-detail-ondemand.test.ts` → 断言「进入详情」路径恰好发出 1 次 `/requirements/<id>` 请求，且渲染函数收到的记录是**全文形状**（含 `comments` 数组）。
2. 现有用例继续绿：`npx vitest run tests/state-payload-client.test.ts` → 首屏只打 `/state`、**0 次**详情请求。
3. 手工（GUI）：点开任一需求 → 详情正常显示；DevTools Network 中该需求只有 1 条 `requirements/<id>`（200），无报错。

---

### FR-2: 取数三态显式呈现（加载 / 未找到 / 失败）

**功能描述**：详情取数过程中的三种非成功结果都有明确、可读的界面，不白屏，也不静默把用户弹回看板。

**详细说明**：

- **使用场景**：网络慢（加载中）、需求已被删除或换了工作区（404 `REQBOARD_NOT_FOUND`）、服务端 500 / 超时。
- **操作流程**：打开详情 → 首帧为加载态 → 命中成功/404/其它错误各自呈现。
- **预期结果**：
  - **加载中**：详情骨架在位（进度点、Tab、标题等摘要级信息可先渲染），本体区段显示「加载中…」，不出现空白窗。
  - **未找到（404）**：显示「需求 <id> 不存在或已被删除」+ 可点的「← 看板」返回；**不**自动切回看板、不静默。
  - **其它失败**：复用现有 `buildError(原因, hint)` 口径把服务端给的原因与可复制命令呈现出来，并提供重试入口。
- **边界条件**：
  - 取数返回的 `id` 与当前请求的 `id` 不一致（乱序/过期响应）→ 丢弃该响应，不覆盖界面。
  - 用户在加载途中返回看板 → 到达的响应不得改写当前视图。
  - 失败文案不得吞掉错误码与 `hint`。

**验收标准**：

1. 单测：桩 404（`{success:false,code:'REQBOARD_NOT_FOUND'}`）→ 断言呈现「未找到」文案，且视图**仍处于详情态**（未被改成看板）。
2. 单测：桩 500 → 断言呈现错误原因与 hint（沿用 `buildError` 断言口径）。
3. 手工：DevTools 里对 `requirements/<id>` 请求设 offline/500 → 看到失败态与重试入口，页面不白屏。

---

### FR-3: 详情随台账刷新、交互态不丢、请求去重

**功能描述**：看板既有的刷新通道（SSE 台账事件、轮询、手动「刷新」）在详情页同样生效；重绘不得冲掉用户的交互位置；同一需求的在途请求不得叠加。

**详细说明**：

- **使用场景**：详情页开着，另一个窗口推进了这条需求（状态变化、评论、产物登记）。
- **操作流程**：SSE/轮询/手动刷新 → 取数 → 若该需求有变化则更新详情正文 → 重绘。
- **预期结果**：
  - 详情正文跟随台账更新（状态、评论新增、产物 chip、验收/归档材料）。
  - 重绘后仍停在用户选中的 Tab、选中的阶段节点；DAG 画布的视图状态（方向/开关/滚动）沿用既有记忆机制不丢。
  - 详情页在屏期间的重复触发（同一 tick 内 SSE + 轮询）**不产生叠加请求**：同一 `reqId` 在途只保留一个请求。
- **边界条件**：
  - 需求在期间被转到别的状态导致「当前阶段节点」不存在 → 回落到新的当前阶段，不报错。
  - 评论输入框里未提交的草稿：不得因重绘被清掉（重绘前取值、重绘后回填；与泳道滚动位置同款做法）。
  - 轮询间隔、SSE 订阅方式、`/state` 的取数频率一律不改。

**验收标准**：

1. 单测：连续两次触发刷新（同一 `reqId`）→ 断言只发出 1 次详情请求；`revision` 变化后再触发 → 断言发出第 2 次并更新渲染输入。
2. 单测：断言重绘保留「当前 Tab」与「当前阶段选中」的记忆键（沿用 `dag/view-state.ts` / `panel-hydrate.ts` 的既有桩法）。
3. 手工：详情页停在「时间线」Tab → 另一窗口给该需求加一条评论 → 页面自动更新且仍在「时间线」Tab，输入框草稿还在。

---

### FR-4: 摘要 / 半残记录的防御性降级

**功能描述**：任何把「摘要形状」或字段不全的记录喂给详情渲染的路径，都不得抛 `TypeError`：本体数组缺失按空数组处理，缺字段按缺省值渲染。

**详细说明**：

- **使用场景**：旧服务端 / 缓存里残留的摘要记录 / 未来契约再变时前端尚未跟上（本 bug 的直接回归面）。
- **预期结果**：
  - `renderComments(undefined)` 呈现「暂无评论」而不是抛错；评论计数为 0（或摘要的 `commentCount`，两者口径在设计阶段定死一处）。
  - `artifacts / plan / verification / archive / statusHistory / docLinks` 缺失时各区段呈现各自的空态，不抛错。
  - 详情渲染函数对**任何**输入都不抛异常（`buildReqDetail` 是纯函数，可被直接断言）。
- **边界条件**：
  - 参数本身为非数组（`null` / 对象）→ 同样按空处理（不因 `?? []` 漏掉 `null` 之外的脏数据而炸）。
  - 防御是**兜底**而不是掩盖：正常路径仍必须走 FR-1 的全文数据源；不得以「反正兜住了」为由继续用摘要渲染详情（验收 2 反向断言）。

**验收标准**：

1. 单测（回归本 bug）：用 `RequirementSummary` 形状调 `buildReqDetail` → **不抛错**，且输出含「暂无评论」。
2. 单测（反掩盖）：断言详情路径的渲染输入来自详情取数（全文），而不是 `state.requirements` 里的摘要记录（可用桩记录标记区分）。
3. 单测：`renderComments(undefined as any)` 返回空态字符串。

---

### FR-5: 回归用例与构建纪律

**功能描述**：本次修复带一条能证伪的回归用例，并按本仓约定重建 client bundle、跑类型检查与测试基线。

**详细说明**：

- **使用场景**：提交前自检。
- **预期结果**：
  - 新增用例覆盖：① 摘要形状不崩（FR-4-1）；② 进详情恰 1 次详情请求且输入为全文（FR-1）；③ 404 三态（FR-2）。
  - `pnpm build:client` → `[verify-client] OK …`（C-12）；`pnpm typecheck` 退出码 0（C-15）；`pnpm test` 失败数 ≤ 基线 106（C-14）。
- **边界条件**：不引入新依赖（无 jsdom/happy-dom），用例照 `tests/board-attach.test.ts` 的最小桩法写。

**验收标准**：

1. `npx vitest run tests/req-detail-ondemand.test.ts` 全绿（新增用例，含上面 3 条断言）。
2. `pnpm typecheck` 退出码 0；`pnpm build:client` 输出 `[verify-client] OK`。
3. `pnpm test` 失败数不高于基线 106（与 HEAD worktree 基线比对，新增用例全绿）。

---

## 接口与数据契约（feature 档要求）

- **对外入口（服务端已有，本次只接线）**：`GET /dashboard/api/reqboard/requirements/:id`
  - 入参：路径参数 `id`（如 `REQ-261004195831-0f52`）。
  - 成功：`{ success: true, data: { revision: number, requirement: RequirementRecord } }`（全文：comments/artifacts/plan/verification/archive/statusHistory 等）。
  - 未找到：`{ success: false, code: 'REQBOARD_NOT_FOUND' }`（客户端 `ApiError.code`）。
  - 其它失败：`{ success: false, error: string, hint?: string }`。
  - 调用方：客户端 `api.fetchRequirement(id)`（已存在）；**本次新增唯一调用点**在详情视图的数据层。
- **客户端数据契约（新增，内存态）**：
  - 详情正文来源 = 最近一次成功的 `RequirementRecord`（含其 `id`、`version`、响应 `revision`），只活在页面内存：不写 `localStorage/sessionStorage`、不入台账、不发额外请求。
  - 失效判据（设计阶段定死一处）：同一 `id` 且 `version` 未变 → 可直接复用；`version` 或 `revision` 变化 → 重取。
  - 不进 `BoardState` 类型（`state.requirements` 的「摘要 vs 全文」类型分层是 B12 已知收尾项，本次**不改**该字段类型）。
- **计数口径**：评论条数以全文 `comments.length` 为准；摘要的 `commentCount` 只用于**摘要形态**下的卡片/面板展示，两者不得在同一次渲染里混用（FR-4 边界）。
- **迁移与兼容**：不新增/不修改服务端接口与载荷；旧 bundle（未含本修复）行为与今天完全一致（即仍然崩），**不需要数据迁移**；回滚 = 还原本次客户端改动并重建 bundle。
- **错误语义**：404 与其它失败都落到 FR-2 的三态呈现；不静默、不吞错误码。

## 边界（不做什么）

1. **不做服务端与 `/state` 载荷改动**：摘要契约、分页（`limit/nextCursor`）、`tokenTotals` 派生、产物扫描端点一律不动——`GET /requirements/:id` 已存在且返回全文，本次只把客户端接上去。
2. **详情页不做整体重构**：不引入前端框架 / 虚拟滚动 / 全局 store / 持久化缓存；本次只做「进详情取全文 + 渲染源切换 + 三态呈现 + 缺字段防御」四件事。
3. **不动其它视图与既有数据**：看板/列表/任务总览/会话节点面板/工具 toolview 的取数路径不改；台账数据、产物文件、`docs/` 下既有需求文档一律不动。

## 非功能需求

- **请求量不倒退**：首屏 0 次详情请求（现有用例守着）；一次详情进入恰 1 次详情请求；同 `reqId` 在途去重（FR-3）。
- **无白屏、无闪烁**：加载态在原详情骨架内就地呈现，不出现「先空白再整页跳变」。
- **失败可诊断**：错误原因、错误码与 `hint` 原样呈现；控制台报错不得是未捕获异常。
- **可回滚**：改动集中在 client 侧，还原即回到现状，不产生需要清理的持久化痕迹。

## 验收标准（整体）

1. GUI 手工：点开任一需求（泳道卡 / 列表行 / 会话面板定位）→ 详情正常渲染，无控制台异常（FR-1）。
2. GUI 手工：评论 Tab 条数与内容、文档记录、验收/归档区段与该需求实际台账一致（FR-1）。
3. DevTools Network：打开详情只发 1 次 `requirements/<id>`；首屏加载**没有**该请求（FR-1/FR-3）。
4. GUI 手工：详情页停在某 Tab → 另一窗口改该需求 → 内容更新且 Tab 不跳（FR-3）。
5. 桩测试：404 呈现「未找到」且仍在详情态；500 呈现原因 + hint（FR-2）。
6. 单测：摘要形状调 `buildReqDetail` 不抛错并输出空态评论（FR-4）。
7. `npx vitest run tests/req-detail-ondemand.test.ts tests/state-payload-client.test.ts` 全绿；`pnpm typecheck` 退出码 0；`pnpm build:client` 输出 `[verify-client] OK`（FR-5）。

## 轻路径依据与升级（L3）

- **为什么可以走轻档**：改动面小且**无新决策点**——服务端接口与契约已存在（`GET /requirements/:id`，REQ-261002161439-277d 定稿），客户端取数函数已写好（`api.fetchRequirement`），缺的只是详情视图这一处**接线 + 三态 + 防御**；失效/去重策略照本仓既有先例（`dag/view-state.ts` 的内存记忆、`panel-hydrate.ts` 的「找不到就静默跳过」纪律）定死，不新增子系统、不改数据模型、不动台账。
- **已在本文档内闭合的决策**（不留到设计阶段扯皮）：① 详情正文一律来自全文，摘要只喂卡片；② 内存态缓存，键 = `{id, version, revision}`，不停留、不落盘；③ 失败不静默改视图；④ 缺数组按空、计数口径单处（全文 `comments.length`）。
- **单向升级信号**（出现任一条即停手升级为重档，不许反向降级）：
  - 要把详情全文放进持久化缓存 / 全局 store，或反过来改 `/state` 载荷与分页契约；
  - 要给详情页做结构重写（框架化、虚拟滚动、把详情拆成独立路由）；
  - 需要服务端新增端点或改 `REQBOARD_NOT_FOUND` 之外的错误码语义；
  - 出现第二个未定决策（如「离线也能看详情」这类新能力）。

## 依赖与约束

- **依赖（既有事实源）**：服务端 `handleState` / `handleRequirementDetail`（[src/http/routers/stages.ts](../../../src/http/routers/stages.ts)）；客户端 `api.fetchRequirement` / `ApiError`（[src/client/api.ts](../../../src/client/api.ts)）；详情渲染入口 `buildReqDetail`（[src/client/views/stage-detail.ts](../../../src/client/views/stage-detail.ts)）；视图切换与刷新通道（[src/client/board-mount.ts](../../../src/client/board-mount.ts)）。
- **约束（测试环境）**：本包 vitest 为 node 环境、不含 jsdom——用例照 [tests/board-attach.test.ts](../../../tests/board-attach.test.ts) 的最小 DOM 桩法写，不引入新依赖（[tests/state-payload-client.test.ts](../../../tests/state-payload-client.test.ts) 已给出 `vi.stubGlobal('fetch')` 记录请求集的现成范式）。
- **约束（本仓 C 系列）**：改 client 源码必须重建 bundle（C-12 `pnpm build:client`）、跑类型检查（C-15 `pnpm typecheck`）、提交前跑测试并与基线比对（C-14，基线 106 failed / 2807 passed）。
- **约束（不倒退）**：REQ-261002161439-277d 的「首屏 0 次详情请求」必须继续成立（现有用例是事实源，不许改断言放宽）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1 |
| FR-2 | ✅ 已接收 | t2 |
| FR-3 | ✅ 已接收 | t1 |
| FR-4 | 🔴 **未被接收** | — |
| FR-5 | 🔴 **未被接收** | — |

> 🔴 **未被接收（2 条）**：FR-4、FR-5

<!-- reqboard:marks:end -->
