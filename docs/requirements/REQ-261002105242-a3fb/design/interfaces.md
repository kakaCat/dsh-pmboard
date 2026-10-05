# REQ-261002105242-a3fb 接口设计 · 看板投影 / 归档条 / 只读操作条 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 全部是 **client 内部模块接口**（无 HTTP、无工具、无协议变更）。
> 原则：**新增参数一律可选、缺省 = 现状行为**；`toReqCards` 语义与签名**不变**（既有调用方与断言不动）；
> 不新增错误码、不抛异常；移除的接口是服务端端点已消失的残留（见第 5 节）。

## 1. 看板投影接口 `serves: FR-1, FR-3`

```ts
// src/client/views/board.ts
import type { BoardState, ReqCard } from '../types.ts'

/**
 * 进行中投影（**语义与签名均不变**）：archived / canceled 出局。
 * 内部改为经 toCard() 构造，字段口径与 toTerminalCards 完全一致。
 */
export function toReqCards(state: BoardState): ReqCard[]

/**
 * 终态投影（新增）：archived ∪ canceled，按 updatedAt 降序（最近归档在前）。
 * 与 toReqCards 共用同一 toCard()，**不再手写第二套字段映射**。
 */
export function toTerminalCards(state: BoardState): ReqCard[]

/** 卡片投影的唯一构造点（私有，不导出）：req + 该需求的 tasks → ReqCard。 */
function toCard(state: BoardState, req: RequirementRecord): ReqCard
```

**行为契约**：

| 输入 | `toReqCards`（不变） | `toTerminalCards`（新增） |
|------|---------------------|--------------------------|
| `status: archived` | 不出现 | 出现，排在最前（按 `updatedAt` 降序） |
| `status: canceled` | 不出现 | 出现 |
| `status: done` | **出现**（既有语义，归入验收泳道/列表完成组） | 不出现 |
| 其余进行中状态 | 出现，保持 `state.requirements` 原顺序 | 不出现 |
| `tasks` | 该需求任务子集 | 同上（同一 `toCard`，`totalCount` 必然一致） |
| 空需求数组 | `[]` | `[]` |

**不变量**（FR-5 的回归锚点）：对任一需求 `r`，`toReqCards ∩ toTerminalCards = ∅`，
且二者并集 = `{ archived, canceled, done, …进行中 }`——**归档不吞任务，也不吞需求**。

## 2. 归档条渲染接口 `serves: FR-1`

```ts
// src/client/views/board.ts
/** 归档条最多渲染的条目数（超出仅提示，分页不在本轮范围）。 */
export const ARCHIVED_CHIPS_MAX: number   // = 100

/**
 * 渲染看板底部「已归档」条（纯字符串，零 DOM、零 IO，可直接单测）。
 *
 * @param cards 终态卡片（来自 toTerminalCards，已按 updatedAt 降序）
 * @param limit 条目上限，缺省 ARCHIVED_CHIPS_MAX
 * @returns 无终态需求时返回 ''（不渲染空壳）；否则返回归档条 HTML
 */
export function renderArchivedBar(cards: readonly ReqCard[], limit?: number): string
```

**输出结构契约**（DOM 形态即接口，测试按这些钩子断言）：

```html
<div class="dsh-pm-archived-bar" data-archived-bar data-archived-count="21">
  <details class="dsh-pm-archived-fold">
    <summary class="dsh-pm-archived-label">🗄 已归档 21（点击展开回看 DAG / 任务）</summary>
    <div class="dsh-pm-archived-chips">
      <button type="button" class="dsh-pm-archived-chip"
              data-action="open-req" data-req="REQ-…" data-status="archived"
              title="<标题>">REQ-… · <标题><span class="dsh-pm-archived-count">39/39</span></button>
      ...
      <span class="dsh-pm-archived-label">另有 N 条未显示</span>   <!-- 仅超限时 -->
    </div>
  </details>
</div>
```

**逐条契约**：

| 项 | 契约 |
|----|------|
| 折叠态 | `<details>` **无 `open` 属性**：默认折叠，不占泳道空间 |
| 计数 | `data-archived-count` = 终态需求总数（= `cards.length`，非渲染条数）；summary 文案分别给出 archived / canceled 的条数（canceled = 0 时省略该段） |
| 条目动作 | 每条是 `<button data-action="open-req" data-req="<id>">`（**复用既有委托**，不新增事件类型） |
| 条目文案 | `<需求 id> · <标题>` + `doneCount/totalCount`（任务进度，证明 DAG 数据在） |
| canceled 视觉 | `data-status="canceled"` 沿用既有 CSS（删除线），不与 archived 混淆 |
| 转义 | id / 标题一律过 `esc()`（与 `renderReqCard` 同纪律，防 XSS） |
| 空输入 | `''`（页面不出现空归档条） |
| 超限 | 只渲染前 `limit` 条 + 「另有 N 条未显示」，不静默截断 |

## 3. 看板与列表接线 `serves: FR-1, FR-3`

```ts
// 签名不变，行为变化（唯一变化点 = 泳道视图追加归档条）
export function buildBoard(
  state: BoardState,
  now?: number,
  view?: BoardViewKind,          // 'lanes' | 'list'
  listOpts?: ListViewOpts,
  archived?: ReadonlySet<string>,
): string

// 签名不变，终态口径修正
export function buildListView(
  state: BoardState, now?: number, opts?: ListViewOpts, archived?: ReadonlySet<string>,
): string
```

| 视图 | 归档需求出现在哪 | 约束 |
|------|-----------------|------|
| `lanes`（默认） | **仅**底部归档条（`renderArchivedBar`） | 泳道内**不得**出现 archived / canceled 卡片（既有语义不倒退） |
| `list` | **仅**「已完成 / 已归档」表格分组（`finished = done ∪ toTerminalCards`） | 不追加归档条（同一入口不重复给两次） |
| 两者 | 条目点击后都进同一个 `buildReqDetail`（同源只读详情） | 归档条目 `cardActions(req) === ''`（既有实现，`done`/`archived` 均无卡面按钮） |

分组标题文案：`已完成` → **`已完成 / 已归档`**（计数含 done + archived + canceled）。
既有断言只要求包含子串 `已完成`，该文案不破坏它。

## 4. 详情操作条契约 `serves: FR-2`

```ts
// src/client/views/stage-detail.ts —— 签名不变，行为收敛为显式早退
export function renderActionBar(req: RequirementRecord): string
```

| `req.status` | 改造前 | 改造后 |
|---|---|---|
| `archived` | 恰好空（依赖 switch 无分支的巧合）；计划未批准时会渲染「批准计划」 | **恒为 `''`** |
| `canceled` | 可渲染「批准计划」（计划未批准时），语义荒谬 | **恒为 `''`** |
| `done` | 渲染 `archive-req`「归档」（**点了必 404**） | **恒为 `''`** |
| 其余在途态 | 不变 | 不变（draft…accepting 的按钮、计划裁决、验收裁决全部保留） |

**保留面（只读、无动作）**：状态胶囊、8 态进度点、概览 Tab、执行 Tab（统计 + `buildDagCanvas` + 任务表）、
时间线、追溯、Token、归档 Tab 的 `renderArchiveSection`。
判据：归档需求详情页**不含** `data-action="move-req" | "plan-approve" | "verify-pass" | "verify-rework" | "archive-req"` 任一。

## 5. 移除的接口 `serves: FR-4`

```ts
// src/client/api.ts —— 删除
// export function archiveReq(input: { id: string }): Promise<unknown>   // POST /req/archive 服务端已移除
```

| 残留点 | 位置 | 处置 |
|--------|------|------|
| `archiveReq()` 客户端函数 | `src/client/api.ts:157` | 删除（唯一调用方是下一行） |
| `case 'archive-req'` 事件分支 | `src/client/board-mount.ts:625` | 删除分支 |
| `done + archive + 未 archivedAt` → 按钮 | `src/client/views/stage-detail.ts:294` | 删除（由第 4 节早退统一覆盖） |
| 「请在详情头…点『归档』」提示 | `src/client/views/verification.ts:201` | 改为陈述事实（agent 走 `reqboard_submit(kind=archive)` 补齐材料） |

**兼容性**：`POST /req/archive` 的移除发生在 REQ-9f4a44（验收通过即归档），本改动只是让 client 不再挽留一个
不存在的端点。**不新增**任何接口来替代它；`archived` 的写入路径仍是 `accepting → archived`（自动）。
`canceled → archived` 虽有状态机边（`RequirementStatus.ts:68`），但**本轮不提供 UI 入口**（见 `use-cases.md` 非目标）。

## 6. DOM 契约与事件委托 `serves: FR-1, FR-2`

| 钩子 | 归属 | 契约 |
|------|------|------|
| `[data-archived-bar]` | 归档条根 | 泳道视图最多一个；`data-archived-count` 为总数 |
| `[data-action="open-req"]` + `[data-req]` | 归档 chip | 走 `board-mount` 既有 `case 'open-req'`：`mode = { kind: 'req', reqId }` 后重渲染 |
| `.dsh-pm-archived-fold` / `.dsh-pm-archived-chips` / `.dsh-pm-archived-count` | 样式钩子 | 新增选择器全部以 `.dsh-pm-archived-` 开头（与既有分片零冲突） |
| `[data-action="archive-req"]` | — | **全仓不得再出现**（服务端端点已删；A5 断言） |

事件委托**零新增**：归档条不引入新的 `data-action`，因此不需要改 `board-mount` 的 click 分发，
open-req 的既有分支天然支持归档需求（它只读 `el.dataset.req` 并切 `mode`）。

## 7. 错误语义与兼容 `serves: FR-2, FR-4, FR-5`

| 场景 | 语义 |
|------|------|
| 归档条为空 | 返回 `''`，不渲染空容器（无"暂无归档"占位——空态由泳道/列表自身的空态承担） |
| 归档需求点开时任务为 0 张 | 详情照常渲染，执行 Tab 显示「暂无任务」（既有空态），**不报错、不隐藏 Tab** |
| `state.requirements` 缺终态需求 | 与改造前完全一致（无归档条） |
| 需求 id 未在 state 中（陈旧深链） | `buildReqDetail` 由 `board-mount` 侧 `state.requirements.find` 决定；未命中走既有「需求不存在」路径（不新增错误码） |
| 服务端旧版（无 `archive` 字段） | 归档条只依赖 `status`/`title`/`updatedAt`/任务计数，缺字段不影响渲染 |
| 既有 `toReqCards` 调用方 | 语义不变（A6 断言 `done` 仍在进行中投影、archived 不在） |
