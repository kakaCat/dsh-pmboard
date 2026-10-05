---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8]
sides: backend, frontend
---

# reqboard 数据层重构：台账分片 + 读放大治理 + 存储端口化

> 面向：产品、开发、测试——**写给人看**。核心原则：用户能看懂。
> **人读三件套**：TL;DR + ASCII 业务流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格，禁 ①②③ 内联枚举；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**重档（架构级）**（依据见文末「档位依据」） ｜ 立项：2026-10-02
> 窗口：`session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783` ｜ 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

reqboard 的全部运行时状态装在**一份 2.66 MB 的 JSON 单册**里（`~/.dsh/dsh-reqboard.json`，35 条需求、33 条已归档）。

- **写**：每次变更先 `structuredClone` 全册、改一处、再 `JSON.stringify` 整份覆盖写 → `revision` 已 2524，累计重写约 **6.7 GB**。
- **读**：`snapshot()` 深克隆 + 递归 `deepFreeze` 整册 2.66 MB，全仓 **95 处**调用点；且它是**同步**的。
- **传**：`GET /state` 每次把含 33 条归档需求的全文吐给客户端，**且每请求先扫一遍全部需求目录**。

本需求把数据层改成：**领域语汇的异步存储端口** + **按需求分片落盘** + **只增长大字段外置** + **归档热冷分层** + **乐观锁**，并让看板载荷变成增量/分页。数据库适配器**不在本次**，但本次定死的接口就是它将来插入的位置——端口零改动替换。

## 业务流程图

```
        现状（单册平铺 · 读写都 O(全库)）                目标（端口 + 分片 · 读写 O(单需求)）
  ┌────────────────────────────────────┐      ┌─────────────────────────────────────┐
  │ ~/.dsh/dsh-reqboard.json  2.66MB    │      │ 存储端口（领域语汇 · 全异步）        │
  │ 35 条需求（33 归档）全在热文件里      │      │  getRequirement(id)                 │
  │ comments 823KB · 证据 861KB · 产物… │      │  listSummaries(filter)   ← 摘要投影  │
  └──────────────┬─────────────────────┘      │  appendComment(id, c)   ← 只追不改  │
                 │ 每次变更                     │  mutate(id, expectedVersion)        │
                 ▼                             └──────────────┬──────────────────────┘
     structuredClone 全册 → 改一处                              │ 本次实现
     → JSON.stringify 整份 → 原子覆盖写                          ▼
     （revision 2524 ⇒ 累计重写 ≈6.7GB）           ┌─────────────────────────────────────┐
                 │                                │ 分片实现（本次）                     │
                 │ 每次读                          │  index.json（只留索引 + 摘要字段）    │
                 ▼                                │  requirements/<REQ>.json（热）       │
     深克隆 + deepFreeze 2.66MB                   │  requirements/<REQ>/comments.jsonl   │
     （95 处 snapshot() · 同步口）                 │  requirements/<REQ>/evidence.json    │
                 │                                │  archive/<REQ>.json（冷 · 33 条）    │
                 ▼                                └──────────────┬──────────────────────┘
     GET /state 全量 2.66MB → 客户端                               │ 下一需求（本端口零改动）
     （每请求先扫全部需求目录）                                      ▼
                                                  ┌─────────────────────────────────────┐
                                                  │ DB 适配器（Postgres/MySQL · 多机共享）│
                                                  └─────────────────────────────────────┘
```

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 写放大降到 O(单需求) | 夹具库 100 条需求，追加 1 条评论；注入 fs 写探针统计落盘字节 | 单次变更落盘字节 < 全库的 5%，且不随库容增长（100 条与 1000 条夹具的落盘量相等） |
| A2 读放大降到 O(单需求) | 注入 fs 读探针；调 `getRequirement(id)` / `listSummaries()` | `getRequirement` 读入字节不含其他需求分片；`listSummaries` 不读大字段文件 |
| A3 分片布局在场 | 迁移后列数据根目录 | 出现 `index.json` + `requirements/<REQ>.json`；归档需求只在 `archive/` 下 |
| A4 大字段外置 | 单需求灌 500 条评论 + 长证据后再测 | 热分片 `requirements/<REQ>.json` 字节有上界且**与评论条数无关**；评论全在 append-only 文件里可按序取回 |
| A5 归档热冷分层 | 对现状 33 条归档需求 | 不在热索引、不被 `listSummaries({active:true})` 返回、不参与热写；按 id **冷读仍能取回全文** |
| A6 乐观锁生效 | 两个写者持同一 `expectedVersion` 先后写同一需求 | 第二个返回结构化错误 `REQBOARD_CONFLICT`（含当前 version），且**第一个写入未被覆盖** |
| A7 幂等判据不变 | 重复调用同一写操作两次 | 第二次不写盘（文件 mtime 不变）；沿用 `QueueTaskStore` 同款"集合与内容都没变才提前返回"判据 |
| A8 工具面零回归 | `npx vitest run tests/` 全量 | 失败数 ≤ 基线 **106**，且新增用例全绿（20+ 个 `reqboard_*` 工具的输入/输出/错误码一字不变） |
| A9 客户端载荷降量 | 迁移后请求 `GET /state`（默认页） | 响应体不含归档需求全文；字节数相对现状 2.66 MB **下降 ≥ 一个数量级**；分页参数可取后续页 |
| A10 去掉每请求全目录扫描 | 注入探针统计 `syncAllReqArtifacts` 调用 | `GET /state` 触发次数为 **0**（改为显式端点或按需触发） |
| A11 可回滚 | `scripts/rollback-ledger.ts --apply` 后，用旧版读路径装载产物 | 用 v9 读路径能成功装载，需求条数与 id 集合与迁移前**完全一致** |
| A12 迁移幂等且可失败 | 连续跑两次迁移脚本；另跑一次中途失败注入 | 二次运行 0 变更；失败时原文件未被触碰且备份在场 |
| A13 类型与构建 | `pnpm typecheck` / `pnpm build` | 类型错误 ≤ 基线 **223**；构建退出码 0（C-11/C-15） |

## 产品定义

**这个「数据层」是什么**：reqboard 的**运行时状态**存储——需求记录、评论、状态流转历史、节点产物登记、验收材料、拆分计划、Dive/自动链状态、任务 DAG。

**它不是什么**（属主划清）：需求/设计/任务卡等 `.md` **文档**仍在项目工作区的文件系统里、仍归 git；任务 DAG 已在 per-REQ `queue.json`（v9 先例）。本需求只动**运行时状态**这一层。

**存储的物理归属**：数据根是 **DSH 主目录**（插件卸载不删除），不是项目工作区——台账是 **profile 级**的，一份数据里躺着来自多个工作区的需求（`RequirementRecord.workspaceRoot` 即项目维度）。

**目标形态（三层，本次落前两层）**：

| 层 | 内容 | 本次 |
|----|------|------|
| 端口 | `application/ports.ts` 的领域语汇接口，全异步，不泄漏 JSON/SQL 细节 | ✅ 定死 |
| 分片实现 | index + per-REQ 热分片 + append-only 大字段 + 冷存 | ✅ 落实现 |
| DB 适配器 | Postgres/MySQL，多机共享；端口零改动替换 | ❌ 另立需求 |

**端口契约（对外入口的输入/输出/错误，本次定死）**：

| 入口 | 输入 | 输出 | 错误 |
|------|------|------|------|
| `getRequirement(id)` | 需求 id | 单条需求（含全字段）或 `undefined` | — |
| `listSummaries(filter)` | `{active?, project?, limit?, cursor?}` | 摘要投影数组（**不含** comments/证据/产物明细）+ 下一页游标 | — |
| `mutate(id, expectedVersion, fn)` | 需求 id、期望版本、变更器 | 变更后的版本与差异 | `REQBOARD_CONFLICT`（版本不匹配） |
| `appendComment(id, comment)` | 需求 id、评论体 | 追加后的评论序号 | 需求不存在 |
| `head()` | — | 当前 `revision`（单调） | — |
| `subscribe(fn)` | 订阅回调 | 退订函数 | — |

**数据契约（新增或变更的字段/类型/默认值/版本兼容）**：

- 每条需求带 **`version: number`**（乐观锁用）；现 `RequirementRecord.version` 已在，语义由"内部计数"升格为"写入前置条件"。
- 全局 `revision` 保持单调递增，语义与现状一致（SSE 帧、客户端短路判据不变）。
- 大字段**不再内联**热记录：`comments` / `verification.evidence` / `verification.sheetHistory` / `artifacts` 明细改为外置 append-only；热记录保留**索引与计数**（如 `commentCount`、`artifactCount`）。
- 读侧**向后兼容**：热记录解析后，端口返回的 `RequirementRecord` 形状**与现状一致**（大字段按需装配），调用方与看板类型零改动。
- 存储布局带 `schemaVersion`，与现 `REQBOARD_SCHEMA_VERSION` 同源推进（v9 → v10）。

**迁移与回滚路径**：

1. 迁移前自动备份原单册；迁移脚本幂等（重复运行 0 变更）。
2. 旧版插件仍要能读 → 提供**一键导出 legacy v9 单册**（`dsh-reqboard.json`）+ 回滚脚本，A11 锁死等价性。
3. 迁移中途失败 → 原文件不被触碰，新布局目录可整体丢弃重来。

## 用户与角色

- **看板使用者（人）**：打开看板就要等一份 2.66 MB 载荷、且里面 33 条是早就归档的历史；他要的是"我现在这几条需求的状态"。本次让载荷变小变准。
- **实施 agent（同仓会话）**：每次工具调用（立项/推进/汇报）都触发一次整册重写；库越大每次动作越慢、且**并发写同一份文件**是静默丢数据的温床。本次让单次动作只碰自己那条。
- **插件维护者（本仓）**：95 处 `snapshot()` 是"整册同步快照"这一种读法的复制品；任何存储替换都要一次改 95 处。本次把读法收敛成少数几个领域语汇入口。
- **将来的 DB 适配器作者**（下一需求）：他要的是"实现这 6 个方法即可"，不被 JSON 布局或同步语义绑架。

## 功能点

- **FR-1: 存储端口收敛为领域语汇且全异步**——`ReqboardRepository` 由"整册 read/snapshot/mutate"收敛为按 id / 按条件的定向读 + 摘要投影 + append-only 入口，返回值一律 `Promise`；95 处 `snapshot()` 读点逐个改为定向读，**同步调用点**（`pm-capture-root.ts:151`、`gate-wiring.ts:172`、`h2-compact.ts:61`、`ArtifactSync.ts:159`）本次一并改造为异步链路；端口不出现 JSON/SQL/文件路径等存储细节
- **FR-2: 写路径按分片落盘，消除整册重写**——单次变更只写被改动的需求分片与索引；沿用既有原子写（temp + fsync + rename），并保证"索引与分片一致"的提交顺序（分片先、索引后；崩溃后可由索引重建扫描收敛）
- **FR-3: 只增长大字段外置为 append-only**——`comments`、`verification.evidence`、`verification.sheetHistory`、`artifacts` 明细改为按需求外置的 append-only 存储；热分片只留索引与计数，**其体积与这些大字段的条数无关**（A4 锁死）
- **FR-4: 归档需求热冷分层**——归档需求移出热索引与热写路径，默认列表不返回；按 id 仍可**冷读**取回全文；现状 33 条归档需求随迁移一并落冷存
- **FR-5: 乐观锁与结构化冲突错误**——写操作携带 `expectedVersion`，不匹配返回 `REQBOARD_CONFLICT`（含当前 version 与需求 id），**不静默覆盖**；端口就此具备多写者语义，但本次不承诺多写者上线、不做跨实例订阅
- **FR-6: 数据库就绪**——端口不泄漏存储细节（FR-1 是其前提）；本次给出到关系型 schema 的**字段级映射**与事务/并发语义（design 节点产出），使 DB 适配器是"再实现一次端口"而不是"再改一轮调用方"
- **FR-7: 客户端载荷增量 + 分页 + 去掉每请求全目录扫描**——`GET /state` 不再返回归档需求全文、支持分页/按需拉取；`syncAllReqArtifacts` 从 `/state` 上摘掉（改为显式端点或按需触发）；SSE 帧契约（`revision` + `kind`）保持不变，客户端同步重建
- **FR-8: 可回滚**——迁移前自动备份；提供 legacy v9 单册一键导出与回滚脚本，旧版插件读路径能装载导出的同一批需求（A11）；迁移脚本幂等且失败不触碰原文件（A12）

## 边界

**做**：

1. `src/application/ports.ts`：收敛 `ReqboardRepository` 为领域语汇 + 全异步，新增摘要投影与 append-only 入口（FR-1、FR-5）
2. 新分片适配器：`index.json` + `requirements/<REQ>.json` + 大字段 append-only + `archive/` 冷存（FR-2、FR-3、FR-4）
3. 95 处 `snapshot()` 读点与同步调用点改造；`ArtifactSync` 的每请求全目录扫描从 `/state` 摘除（FR-1、FR-7）
4. 迁移与回滚脚本：v9 单册 → 新布局（备份 + 幂等 + legacy 导出反向）（FR-8）
5. 客户端：`/state` 增量 + 分页 + 归档不热传，客户端 bundle 重建（FR-7）
6. 到关系型 schema 的字段级映射与事务/并发语义（design 节点产出，FR-6）
7. 测试：写/读放大探针、乐观锁冲突、迁移幂等、回滚等价、零回归（A1–A13）

**不做**：

1. **不实现数据库适配器**：不含任何 SQL 驱动、连接池、DDL 迁移器——只把接口与映射定死，DB 适配器另立需求
2. **不改业务规则与状态机**：`domain/` 的状态转移、五道人工门、闸门语义、提示词注入零改动
3. **不改文档仓储**：`docs/` 下的 requirement/design/tasks 等 `.md` 仍在项目工作区、仍归 git，不进存储层
4. **不重做任务 DAG**：`queue.json` 与 `QueueTaskStore` 已是分片先例，本次只对齐端口风格与读法，不重写任务存储
5. **不改工具面对外契约**：20+ 个 `reqboard_*` 工具的输入/输出/错误码一字不变（A8 锁死）
6. **不承诺多机并发上线**：乐观锁语义就绪即可；跨实例变更订阅（SSE 跨进程失效）、连接管理不在本次
7. **不引入 ORM / 查询构建器**：端口是领域语汇，不是 SQL 语汇
8. **不动归档流程与看板归档页**：归档动作与归档材料流程照旧，本次只改"归档数据存在哪"

## 档位依据（重档 · 架构级）

- **重档判据**：改的是**组件之间怎么接**——存储端口的形状、95 处读点的读法、数据契约（新增 `version` 语义、大字段外置）、以及到 DB 的插入点；不是"在既有流程上加个 flag"。
- **影响面实测**：`snapshot()` 95 处（32 处 `.requirements.find`、3 处取 `revision`）、`.mutate(` 90 处、客户端载荷一整套、外加一次性数据迁移。
- **为什么不能拆成小步先止血**：单册 JSON 的读写放大是**结构性**的——只把归档搬走，95 处同步整册读仍在，接库时还要再改一轮；端口形状必须一次定死（FR-6 的理由）。
- **为什么本次不直接上 DB**：迁移 + 95 读点 + 客户端 + 换存储**同时**做，风险集中在一个需求里，且失败时回滚面过大。分片实现先把接口跑通，DB 适配器复用同一套验收。
- **单向升级信号**（出现任一即停手拆需求，不硬塞）：① 需要改 `reqboard_*` 工具的对外错误码；② 需要在本需求内引入 SQL DDL / 驱动；③ 需要跨实例订阅或连接池；④ 发现文档仓储也必须迁进存储层。
- **不可降级理由**：接口一旦维持"同步整册快照"，任何远端库都无法在该接口后落地——降级等于把 FR-6 作废。
- **批准闸门**：本文件落盘 → `reqboard_submit(kind=requirement)` 登记 → `reqboard_ask_confirm(target=artifact, kind=requirement)` 请人确认；**未获批准不得进入设计**。

## 下一步

design —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入设计。

设计节点需交齐（feature 全档 + 本需求声明了 `sides: backend, frontend`）：
`architecture.md`、`data-model.md`、`interfaces.md`、`test-cases.md`、`use-cases.md`、`frontend.md`、`backend.md`。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t2、t3、t4、t8 |
| FR-2 | ✅ 已接收 | t3、t5 |
| FR-3 | ✅ 已接收 | t5、t1 |
| FR-4 | ✅ 已接收 | t4、t5 |
| FR-5 | ✅ 已接收 | t2、t8、t5 |
| FR-6 | ✅ 已接收 | t2、t4、t5、t11 |
| FR-7 | ✅ 已接收 | t11、t9 |
| FR-8 | ✅ 已接收 | t6、t7 |

> 无未接收条款（8 条全部有落点）。

<!-- reqboard:marks:end -->
