# REQ-261002105242-a3fb 架构设计 · 归档需求的可回看入口 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 范围：只改 **client** 的看板渲染与详情操作条接缝（`views/board.ts` / `views/stage-detail.ts` /
> `views/verification.ts` / `board-mount.ts` / `api.ts` / `styles/base.ts`）。
> 服务端（`handleState` 全量返回任务）、数据层（`queue.json` 不删）、DAG 渲染与其布局算法一律不动。
>
> 条件文档说明：本需求是纯前端改动，`requirement.md` 未声明 front-matter `sides`，故不触发条件必交的
> `design/frontend.md`；客户端契约（签名 / DOM 钩子 / 事件委托）由本文与 `interfaces.md` 承载，
> 无后端侧改动（`design/backend.md` 同理不适用）。

## 问题与现状 `serves: FR-1, FR-3`

**问题**：归档 = 从人的视野里彻底消失。数据（`queue.json` 的 39/16/18 张卡）、接口（`listAll()` 全量返回）、
详情渲染能力（`buildReqDetail` 对 `archived` 照排执行 Tab + DAG）**三样都在**，唯一丢的是**入口**。

| 关注点 | 现状载体 | 归档后会发生什么 |
|--------|---------|-----------------|
| 看板泳道 | `toReqCards()`（`views/board.ts:21`）`filter(status !== 'archived' && !== 'canceled')` | 零卡片，两个视图都走这个投影 |
| 列表视图终态分组 | `buildListView` 的 `finished`（`views/board.ts:173`）收 `done \|\| archived` | 输入已被上一个投影滤过 ⇒ 该分组**永远只含 done**（死分支） |
| 归档区 | 样式 `styles/base.ts:185-195`（`.dsh-pm-archived-bar` / `-label` / `-chip`，`flex:none` + `border-top`） | 全仓无渲染点——CSS 与 `.dsh-pm-board`（flex column）早已为它留好位置，只是没人画 |
| 归档需求详情 | `renderActionBar`（`views/stage-detail.ts:228`） | 正常归档需求恰好无按钮，但**靠巧合**（switch 无 archived 分支）；`done` + 材料已备仍给 `archive-req`「归档」按钮 |
| 该按钮的落点 | 服务端 `POST /req/archive` 已移除（`http/routes.ts:254`，REQ-9f4a44 自动归档） | 点了必失败（404 → `window.alert`） |

```
归档动作（accepting --archived--> SubmitArchive）
   |
   +-- 台账：status=archived + archive/archivePath + 知识层沉淀
   +-- 盘上：docs/requirements/<REQ>/queue.json .... 39 张卡仍在
   +-- 接口：GET /api/state -> tasks 全量返回
                        |
             +----------+-----------+
             |                      |
     toReqCards 把 archived   buildReqDetail(archived)
     与 canceled 全滤掉        仍渲染 DAG + 任务表
             |                      |
             v                      v
   看板零卡片 -> 无入口  -------> DAG 就在这儿，但点不进去
```

**结论**：本需求不是"补数据"，是**补一条既能被人看见、又不会与进行中视图混淆的只读通道**。

## 总体方案 `serves: FR-1, FR-2, FR-3`

三层各管一件事，缺任一层都仍有洞：

1. **投影层**（`views/board.ts`）：抽出私有 `toCard(state, req)` 作为卡片投影的**唯一构造点**；
   `toReqCards`（进行中，语义与签名不变）与**新增** `toTerminalCards`（`archived ∪ canceled`，
   按 `updatedAt` 降序）都由它派生——两处投影共用一个字段口径，杜绝本仓反复吃过的"两份真相"。
2. **渲染层**（`views/board.ts` + `styles/base.ts`）：新增 `renderArchivedBar(cards, now, limit?)`，
   用 `<details>` **默认折叠**的归档条（复活既有 CSS 类名，只补 4 条新规则）；
   泳道视图在 `${body}` 之后追加，列表视图不追加（它自己有终态行，避免双入口重复）。
   同时把 `buildListView` 的 `finished` 改成 `done ∪ toTerminalCards`，**死分支复活**。
3. **详情层**（`views/stage-detail.ts` + `views/verification.ts`）：`renderActionBar` 对
   **终态（archived / canceled / done）一律早退返回空串**——不再依赖 switch 的巧合；
   归档需求点开后看到的是与归档前同源的只读详情（统计 + DAG + 任务表 + 验收/归档记录）。
   同时删掉服务端已移除端点的三个 client 残留（`api.archiveReq` / `case 'archive-req'` /
   `renderActionBar` 的 done 分支）与其提示文案。

```
修复后（泳道视图）
  buildBoard
    ├─ toReqCards(state)      -> 泳道（进行中，语义不变）
    ├─ toTerminalCards(state) -> renderArchivedBar
    │      <details class="dsh-pm-archived-bar">
    │        🗄 已归档 21 · 已取消 0（点击展开回看 DAG / 任务）
    │        [REQ-…-1441 · 标题 · 39/39] [REQ-…-0dfb · …] ...
    │      </details>
    └─ 点条目 -> data-action="open-req"（既有委托，零新事件）
                   -> mode = { kind:'req', reqId }
                   -> buildReqDetail(req, tasks)   ⇒ DAG + 任务表照旧
```

**为什么三层都要做**：只做投影+渲染 → 详情页仍可能给终态需求渲染出会失败的操作按钮（FR-2 不满足）；
只做详情 → 依然没有入口（FR-1 不满足）；只修列表 → 泳道（默认视图）仍然找不到归档需求（FR-3 片面）。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4`

```
                       state.requirements（全量，含归档）
                                  |
                 +----------------+----------------+
                 |                                 |
        toReqCards(state)                  toTerminalCards(state)  [新增]
        （status != archived/canceled）    （archived ∪ canceled，updatedAt desc）
                 |                                 |
    +------------+-------------+                   +--> renderArchivedBar()  [新增]
    |                          |                             |
 泳道（lanes）          列表（list）                    .dsh-pm-archived-bar
    |                          |                       <details>默认折叠
    |              finished = done ∪ terminal          chips: data-action="open-req"
    |                          |                             |
    +--------------------------+-----------------------------+
                               |
                    board-mount 事件委托（既有 'open-req'）
                               |
                    buildReqDetail(req, tasks)
                               |
                     renderActionBar(req)  [改：终态早退 '']
                               |
                    [删] api.archiveReq / case 'archive-req' / done 分支文案
```

| 模块/文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/client/views/board.ts` | 改 | 抽 `toCard`；新增 `toTerminalCards`；新增 `renderArchivedBar` + `ARCHIVED_CHIPS_MAX`；`buildBoard` 在泳道视图追加归档条；`buildListView` 的 `finished` 改为 `done ∪ toTerminalCards`，分组标题改「已完成 / 已归档」 | FR-1, FR-3 | 看板两个视图 + 既有 `toReqCards` 调用方（语义不变） |
| `src/client/views/stage-detail.ts` | 改 | `renderActionBar` 终态早退 `''`；删 `done + archive` 的 `archive-req` 分支；更新函数头注释 | FR-2, FR-4 | 需求详情页操作条 |
| `src/client/views/verification.ts` | 改 | `renderArchiveSection` 里 `done` 的提示从「请在详情头…点『归档』」改为「历史遗留 done：由窗口 agent 补齐材料，无人工按钮」 | FR-4 | 归档 Tab 文案 |
| `src/client/board-mount.ts` | 改 | 删 `case 'archive-req'` 分支 | FR-4 | 事件委托 |
| `src/client/api.ts` | 改 | 删 `archiveReq()` 导出（服务端端点已移除） | FR-4 | 无其他调用方（删前全仓 grep 确认） |
| `src/client/styles/base.ts` | 改 | 归档条区段补 4 条规则：`.dsh-pm-archived-fold`、`.dsh-pm-archived-chips`、`.dsh-pm-archived-chip` 的 button reset（`border:0; cursor:pointer`）+ hover、`.dsh-pm-archived-count` | FR-1 | 样式分片（C-12 需重建 client bundle） |
| `tests/archived-entry.test.ts` | 新增 | A1–A3 + A6 回归断言（归档区、只读详情、归档需求任务不丢） | FR-1, FR-2, FR-5 | 新增用例 |
| `tests/board-info-fixes.test.ts` | 改 | 「已完成且材料已备 → 给 archive-req」改为「**不给**任何操作按钮 + 文案不再指向按钮」 | FR-4 | 既有用例（编码了僵尸行为） |
| `tests/client-view.test.ts` | 改 | `:579` 的 `toContain('data-action="archive-req"')` 翻转；补一条归档条/列表终态断言 | FR-3, FR-4 | 既有用例 |

## 只读详情口径 `serves: FR-2`

**规则**：`renderActionBar(req)` 在 `req.status ∈ {archived, canceled, done}` 时**立即返回 `''`**。
理由不是美观，而是**正确性**：

| 现状巧合 | 反例（今日真能发生） |
|---|---|
| archived 无 `move` 分支、`plan` 已批准、不在 accepting、非 done ⇒ 恰好空 | archived 但 `plan.approvedAt === undefined` ⇒ 渲染「批准计划」，点了必被状态机拒 |
| `done` 无 move 分支 | canceled 且计划未批准 ⇒ 同样渲染「批准计划」，语义荒谬 |

**保留的部分**（都不含会失败的动作）：状态胶囊 / 进度点 / 执行 Tab（统计 + DAG + 任务表）/
时间线 / 追溯 / Token / 归档 Tab 的 `renderArchiveSection`（目录、文档清单、合并去向、索引、说明书更新点）。
即：**能看的一律保留，能点的动作一律不给**。

## 僵尸入口清理 `serves: FR-4`

`POST /req/archive` 已由 REQ-9f4a44 移除（归档在 `accepting → archived` 时自动完成），
但 client 三处残留仍在（`api.archiveReq` → `case 'archive-req'` → `done` 分支按钮），
且 `renderArchiveSection` 的文案还把人往那个按钮上引。清理口径：

1. 删按钮渲染分支与事件分支、删 `api.archiveReq`（删前 `grep -rn "archiveReq\|archive-req" src` 必须只剩待删三处）；
2. `done` 的归档文案改为陈述事实（**由窗口 agent 走 `reqboard_submit(kind=archive)` 补齐材料**），
   不再给"人点这里"的指引；
3. **不新增状态机边**：`done` 是 legacy 死态（`RequirementStatus.ts:67` `done: []`），本需求不复活它，
   也不为一个不再进入的状态新开人工出口。

## 备选方案与取舍 `serves: FR-1, FR-3`

| 方案 | 做法 | 判断 |
|------|------|------|
| **A（本次）** | 泳道底部折叠归档条（复活既有 CSS）+ 列表终态分组修复 + 详情终态只读 | ✅ 改动集中在 1 个视图模块 + 1 个样式分片 + 2 处文案/清理；默认视图（泳道）直接可见；折叠态零空间成本 |
| B 只修列表视图 | 让 `finished` 收 archived，泳道不动 | ❌ 泳道是默认视图，归档需求仍"看不见"；入口只在分页第 N 页，等于没解决 |
| C 独立「归档」页签/页面 | 新增第三个视图（切换器加一档） | ❌ 动视图框架 + 分页/排序/焦点/深链全要重做，属重档；本次不做（若归档条条目数失控再议） |
| D 恢复一个"归档"泳道 | 在 `LANE_STATUSES` 末尾加 archived 泳道 | ❌ 与「归档不进进行中泳道」的既有裁定冲突，且会与 accepting 泳道的 done 语义打架 |
| E 归档快照落盘 | 归档时把任务复制一份存档 | ❌ 数据本来就在；新增副本只会制造"两份真相"，直接违反本需求边界「不动数据层」 |

## 风险与边界 `serves: FR-2, FR-4, FR-5`

| 风险 | 判断 | 处置 |
|------|------|------|
| 改 `buildBoard` 输出可能撞既有整段断言 | 既有测试大量 `toContain`/`not.toContain`，逐字节比对类断言主要在队列/服务端侧 | 新增断言**只加不删**；归档条容器带 `data-archived-bar` 便于精确定位；跑全量 `client-view` 用例比对 |
| 归档条条目数随历史增长 | 折叠态零空间成本，但 chips 全量渲染有 DOM 成本 | `ARCHIVED_CHIPS_MAX = 100` 截断 + 「另有 N 条未显示」提示；分页列入非目标 |
| 终态早退口径误伤 `done` 的既有提示 | `done` 的归档材料按钮本就 404 | 同步改 `renderArchiveSection` 文案（见上节），并由 A5 断言锁「整页无 `archive-req`」 |
| 深链/焦点指向归档需求 | `requestBoardFocus` 按 `[data-req]` 定位，归档 chip 带同一属性 | 归档 chip 复用 `data-req`；A1 断言其存在 |
| 删除 `api.archiveReq` 影响别处 | 全仓调用方只有 `board-mount.ts` 一处 | 删前 grep 三处、删后 `pnpm typecheck` 零新增错误 |
| 把"归档区"做成第二个真相源 | 若另写一套字段映射 | 强制经 `toCard` 派生（同一函数产出 `ReqCard`），A2/A6 断言 `totalCount === tasks.length` |
