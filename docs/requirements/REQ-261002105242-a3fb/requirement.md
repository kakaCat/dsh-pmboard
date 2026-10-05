# REQ-261002105242-a3fb 归档需求在看板失去入口：恢复「已归档」区，让历史需求的 DAG/任务仍可查看

> 档位：**轻档**（改动面限于 client 视图层，无新建模）· 类型：feature（缺陷修复族）

## TL;DR

**用户的疑问**：「pm 归档后，DAG 的数据会被收回吗？我看不到 DAG 的数据展示了。」

**结论：数据一条没被收回，丢的是入口。**

- 任务与文档仍在盘上：`docs/requirements/<REQ>/queue.json` 保留全部任务卡（实测 `REQ-261001213924-1441` = 39 张、`REQ-261001210304-0dfb` = 16 张、`REQ-261001170807-06fd` = 18 张）；`SubmitArchive` / 状态机只写 `archive`、`archivePath` 与知识层沉淀，**不删队列、不删文档**。
- 接口也没过滤：`GET /api/state` 用 `taskStore.listAll()` 返回**全部**任务（`src/http/routers/stages.ts:45`），`ready` 也照算。
- 详情渲染也没丢能力：`buildReqDetail` 对 `archived` 仍会渲染执行 Tab + `buildDagCanvas`（`src/client/views/stage-detail.ts:169-192`）。

**断点在于归档需求在看板上零卡片**：`toReqCards()` 直接 `filter(r => r.status !== 'archived' && r.status !== 'canceled')`（`src/client/views/board.ts:21`），泳道与列表两个视图都走它 ⇒ 没有卡可点 ⇒ 进不了详情 ⇒ DAG / 任务表 / 验收与归档记录全部无处可看。

```
归档动作（accepting --archived--> SubmitArchive）
   |
   +-- 台账：status=archived + archive/archivePath + 知识层沉淀
   +-- 盘上：docs/requirements/<REQ>/queue.json .... 39 张卡仍在（E1）
   +-- 接口：GET /api/state -> tasks 全量返回（E2）
                        |
             +----------+-----------+
             |                      |
     toReqCards 把 archived   buildReqDetail(archived)
     与 canceled 全滤掉        仍渲染 DAG + 任务表
             |                      |
             v                      v
   看板零卡片 -> 无入口  -------> DAG 就在这儿，但点不进去
```

## 一、可复核的证据

| # | 事实 | 复核方式 |
|---|------|----------|
| E1 | 归档不删任务数据 | `python3 -c "import json;print(len(json.load(open('docs/requirements/REQ-261001213924-1441/queue.json'))['tasks']))"` → `39` |
| E2 | 接口返回全量任务（不过滤需求状态） | `src/http/routers/stages.ts:45` `const tasks = await taskStore.listAll()` |
| E3 | 看板投影把归档/取消滤掉 | `src/client/views/board.ts:21`（`toReqCards`，泳道 + 列表共用） |
| E4 | 底部归档区**只活了一半**：样式在、渲染从未接上 | 样式 `src/client/styles/base.ts:185-195`（`.dsh-pm-archived-bar` / `-chip`）；全仓无渲染点；`tests/client-view.test.ts:76-86` 注释自陈「历史断言曾要求 dsh-pm-archived-bar——该渲染在基线里已不存在（CSS 残留）…归档条回归另议」 |
| E5 | 列表视图 `finished` 分组是死分支 | `src/client/views/board.ts:172-173` 本意收 `done + archived`，但 `cards` 已被 E3 过滤 ⇒ 该分组实际只剩 `done` |
| E6 | 会话节点面板默认视图确实没有 DAG，但数据在 | 归档后默认节点 = `archived` → `renderArchivedInfo` 只渲染归档材料（`src/client/node-panel.ts:303-319`）；流程图节点始终可点，点「实施」仍能挂出 DAG（`src/client/conversation-progress.ts:283-298`） |
| E7 | 僵尸归档按钮 | client 仍留 `archiveReq()`（`src/client/api.ts:157`）与 `archive-req` 分支（`src/client/board-mount.ts:625`），但服务端 `POST /req/archive` 已移除（`src/http/routes.ts:254`「REQ-9f4a44 归档自动化，无需人工触发」）⇒ 对 legacy `done` 需求点了必失败 |

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 归档区可见 | 单测：`buildBoard(makeState({ requirements: [archived, canceled, open] }))` | 输出含归档区容器与 `data-req="<archived.id>"`；且泳道内**不含**该 id（归档不进进行中泳道，语义不倒退） |
| A2 归档需求可进详情 | 单测：归档需求走 `open-req` 后 `buildReqDetail(req, tasks)` | 输出含 `.dsh-pm-dag-panel` 与任务表行；任务数 = `tasks` 传入数 |
| A3 归档详情只读 | 单测：`buildReqDetail(archivedReq, …)` | **不**含 `move-req` / `plan-approve` / `verify-pass` / `archive-req` 任一按钮 |
| A4 列表终态分组不再是死分支 | 单测：`buildListView` 传入 `done + archived` 混合 | 「已完成 N」计数含 archived，且 archived 行可见 |
| A5 僵尸入口清除 | `grep -rn "req/archive\|archiveReq" src/client` + 手工点一次 | 无残留调用；或保留但按钮不再渲染（二选一在设计阶段定，验收以「点了不会失败」为准） |
| A6 端到端 | 真机：`pnpm build:client` 后刷新看板 → 打开归档区 → 点 `REQ-261001213924-1441` | 执行 Tab 画出 DAG、任务表 39 行；页面无 404 / 无 alert |

命令锚点：`npx vitest run tests/client-view.test.ts tests/archived-entry.test.ts`、`pnpm build:client`（仓库规范 C-12：改 client 源码必须重建 bundle）。

## 产品定义

看板此前把「归档」当成**离场**：需求一旦 `archived`，就从人的视野里彻底消失。但归档的语义是「产出已并进项目文档、可以放回去当历史」，不是「删掉」。历史需求的价值恰恰在于**回看**：这张需求当时拆成了哪几张卡、依赖怎么排、验收材料与归档清单在哪。

因此本需求要建立的产品性质是：**归档 = 移出进行中视野，但始终可回看**。已归档需求必须在看板上有一个稳定、可预期的入口（底部「已归档」区），点开后看到的是**与归档前同源的只读详情**——同一份 `queue.json` 渲染出的同一张 DAG，不复制、不降级、不另存一份快照。

## 用户与角色

- **需求方（看板使用者）**：归档后想回看「当时怎么拆的、DAG 长什么样」，现在只能翻文件系统找 `queue.json`。期望在看板里直接点开。
- **会话用户**：会话里点流程图节点的行为已可用（E6），不改；本次只补齐看板侧入口。
- **插件维护者**：需要把「归档 ≠ 数据消失」写进可见行为，避免下一个需求再把它当 bug 报一遍（历史上 `REQ-261001124111-5d36` 已报过一次「DAG 不展示」）。

## 功能点

- **FR-1: 恢复看板「已归档」区**——归档 `archived` 与取消 `canceled` 的需求有稳定入口（底部区域，默认折叠/分页，条数受控）；条目可点开需求详情。入口数据独立于 `toReqCards` 的进行中投影，**不解除**「归档不进进行中泳道」的既有语义。
- **FR-2: 归档需求详情只读可回看**——详情页照常渲染执行 Tab（统计 + DAG Canvas + 任务表）与验收/归档区块；**不渲染任何会失败的人工操作按钮**（推进/批准计划/验收裁决/归档）。
- **FR-3: 列表视图终态分组修复**——`finished` 分组真正包含 `archived`（消除 E5 死分支），排序与分页对终态需求同样生效。
- **FR-4: 清理僵尸归档入口**——处理 client 侧 `archiveReq()` / `archive-req` 分支与服务端已移除端点的不一致（E7）：要么删除，要么按服务端契约改为不可达即不渲染；不留「点了必失败」的按钮。
- **FR-5: 回归保护**——新增断言锁住「归档需求的任务数据不因归档而消失」（A2 即此断言），防止后续投影改造再次误伤。

## 边界

**做**：

1. 看板「已归档」区（FR-1）+ 归档需求只读详情（FR-2）；
2. 列表视图终态分组修复（FR-3）与僵尸归档入口清理（FR-4）；
3. 上述行为的单测与端到端复核（A1–A6）。

**不做**：

1. **不动数据层**：不新增归档快照、不改 `queue.json` 格式、不做任何迁移（数据本来就在，问题只是看不见）；
2. **不改会话节点面板的默认节点行为**：归档会话默认仍显示归档材料（E6 现状即可用，点「实施」节点照样看 DAG），本次不新增 UI；
3. **不复活 `POST /req/archive`**：归档仍由验收通过自动完成（REQ-9f4a44），本次只清理 client 侧残留。

## 下一步

design —— 需求文档经人确认后进入设计阶段（本需求的第一个决策点：归档区在泳道/列表两视图里的落位形态与「只读详情」的按钮裁剪口径）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2 |
| FR-2 | ✅ 已接收 | t3 |
| FR-3 | ✅ 已接收 | t2 |
| FR-4 | ✅ 已接收 | t4 |
| FR-5 | ✅ 已接收 | t1、t5 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
