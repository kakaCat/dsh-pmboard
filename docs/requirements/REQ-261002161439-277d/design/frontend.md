---
serves: FR-1, FR-4, FR-7
---

# 前端（看板载荷 · 摘要/详情分离 · 分页 · 按需拉取） serves: FR-1, FR-4, FR-7

> 客户端与 host 同仓，**同步重建**（`pnpm build:client`）。本条需求不分两次上线，避免"新 host 配旧 client"的中间态。

## 载荷契约变更 serves: FR-7

`GET /dashboard/api/reqboard/` 的响应（客户端 `BoardState`）字段变化：

| 字段 | 现状 | 改后 |
|------|------|------|
| `requirements` | 全部需求**全文**（含 33 条归档、含评论/产物/验收明细） | **热侧摘要** `RequirementSummary[]`（实测 156B/条，不含大字段） |
| `nextCursor` | 无 | 新增：`string \| undefined`（本页取完为 `undefined`） |
| `revision` / `tasks` / `ready` / `tokenTotals` / `workspaceRoot` / `homeDir` | — | **形状不变**（`tokenTotals` 仍由 host 从适配器算，摘要里不带） |

`fetchState()` 增加可选入参：`fetchState({ scope?: 'active' | 'archived'; limit?: number; cursor?: string })`。缺省 `scope='active'`、`limit=200`。

**为什么必须一起改**：`/state` 是 2.66MB 的唯一来源，host 侧再省，只要客户端仍旧解析全量契约，这个数字就一个字节都降不下来（A9）。

## 摘要与详情是两个类型 serves: FR-1, FR-7

`src/client/types.ts` 新增 `RequirementSummary`，与既有 `RequirementRecord` **并存且不互相赋值**：

- 现状客户端从 `state.requirements[]` 读到的字段，实测分两类：
  - **卡片/泳道/列表/时间线**只读标量：`views/board.ts` 读 `blocked` `category` `createdAt` `id` `sourceSessionId` `status` `title` `updatedAt`；`render/subtask-view.ts` 读 `autoRun` `advance` `id`；`render/dom-utils.ts` 读 `sourceSessionId`。
  - **详情类视图**（`views/artifacts.ts`、`views/verification.ts`、`stage-detail.ts`、`stage-panel.ts`）读大字段：`comments` `artifacts` `verification` `plan` `archive` `docLinks`。
- 因此：摘要只承载第一类 + 计数（`commentCount` / `artifactCount`）+ `version` + `advance` 的告警子集（`{pausedReason?, failureStreak?}`，`history` 不进摘要）。
- **两个类型刻意不互相兼容**：详情视图若被喂了摘要，`req.comments.length` 这类访问会**编译报错**（沿用本仓"宁可编译报错也不要静默降级"的纪律）。剩下的字段缺口由编译器逐个点名，不靠人肉巡检。

## 详情按需拉取 serves: FR-7

新增 `fetchRequirement(id): Promise<RequirementRecord>` → `GET /requirements/:id`。

渲染路径改为两段：

```
点击/深链 ?req=<id>
  ├─ 先用摘要渲染骨架（标题/状态/阶段条）——首屏不等详情
  └─ await fetchRequirement(id) → 用完整记录重渲染详情区（评论/产物/验收/计划）
```

- **首屏不触发详情请求**：`buildBoard` 只用摘要；只有进入需求详情/任务详情才拉（测试断言"首屏渲染 0 次详情请求"）。
- 详情请求失败 → 骨架保留 + 明确错误提示（**不**静默留白，也不假装详情为空）。

## 归档需求的按需拉取 serves: FR-4

- 归档需求不再随 `/state` 下发；归档页/深链走 `fetchRequirement(id)`（host 侧回落冷存）。
- 客户端**不需要知道**数据在热侧还是冷侧——冷读对客户端透明（这正是 `get(id)` 回落设计的价值）。
- 归档页列表用 `fetchState({ scope: 'archived' })` 拿摘要；点开再拉详情。归档条数增长不再影响首屏载荷。

## 分页与游标 serves: FR-7

- 游标是**不透明字符串**（客户端不得解析其内容）；host 侧保证同一 `scope`+`filter` 下游标稳定。
- 列表视图/归档页：滚动到底或"加载更多"按钮用 `nextCursor` 续页；`nextCursor === undefined` 表示到底。
- 刷新语义不变：SSE 事件或轮询到达时**重新拉第一页**（不带 cursor）——分页状态是视图局部状态，不进全局 store。
- 越界/过期游标**不抛错**：返回空页 + `nextCursor: undefined`（避免看板因游标失效整页报错）。

## SSE 与刷新契约不变 serves: FR-7

- `/events` 仍发命名帧 + 无名帧，载荷仍是 `{revision, kind}`；`event: build` 帧与面板刷新策略（`panel.refreshMs`）**原样不动**。
- 客户端现有的 20s 轮询兜底与 `panel-refresh.ts` 的新鲜度判定**不改**（那里的 `snapshot()` 是本地函数，与 host 同名不同物）。
- 刷新动作从"重新解析 2.66MB"变成"重新解析摘要页"，**不需要改刷新触发逻辑**。

## 扫描动作移出首屏 serves: FR-7

- `GET /` 不再触发 `syncAllReqArtifacts`（A10）。
- 产物自动发现改为：`POST /artifacts/scan`，由看板"刷新产物"按钮或进入需求详情时的显式动作触发。
- 客户端不做隐式扫描：**不允许**在 mount 时静默调 scan（那只是把每请求扫描改成每次打开页面扫描）。

## 构建与验证 serves: FR-7

| 步骤 | 命令 | 期望 |
|------|------|------|
| 重建客户端 | `pnpm build:client` | `[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整` |
| 整体构建 | `pnpm build` | 退出码 0，`dist/index.mjs` 与 `lib/client.js` 均有新产物 |
| 页面回归 | 打开既有 GUI 看板（**不新起服务**） | 看板/列表/泳道/需求详情/归档页均正常；需求详情能打开归档需求 |
| 载荷实证 | 看板 Network 面板或测试断言 | 首屏响应不含归档需求全文；字节数比改造前低一个数量级 |

**客户端改动文件**（依据实测字段读取点）：`src/client/types.ts`、`src/client/api.ts`、`src/client/board-mount.ts`、`src/client/views/board.ts`、`src/client/views/artifacts.ts`、`src/client/views/verification.ts`、`src/client/views/stage-detail.ts`、`src/client/stage-panel.ts`、`src/client/render/subtask-view.ts`。
