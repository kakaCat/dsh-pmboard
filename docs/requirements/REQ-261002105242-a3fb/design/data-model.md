# REQ-261002105242-a3fb 数据模型设计 · 全是派生投影，零持久化变更 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 本需求**不新增、不修改任何落盘结构**：`queue.json`（任务唯一存储）、台账 `dsh-reqboard.json`
> （需求唯一存储）、协议 `shared/protocol.ts` 的类型一律不动。新增的全是 **client 侧内存投影与渲染模型**。

## 1. 结论：无持久化数据变更 `serves: FR-1, FR-5`

| 数据面 | 是否变更 | 依据 |
|--------|---------|------|
| `docs/requirements/<REQ>/queue.json` | **不变** | 任务在归档前后都不删（实测 39 / 16 / 18 张卡仍在），本需求只读它 |
| 台账 `RequirementRecord` | **不变** | 无新字段；`archive` / `archivePath` / `statusHistory` 一律沿用 |
| `TaskRecord` / `QueueFile` / `QUEUE_VERSION` | **不变** | 不碰任务 schema，不做版本升级 |
| `shared/protocol.ts` 的 `StageDetail` / `BoardState` | **不变** | 归档条数据全部来自既有 `state`（服务端已全量返回） |
| 服务端路由 / 工具 | **不变** | 不改 `handleState`（它本来就返回全量任务） |
| 知识层 / RTM / 归档材料 | **不变** | 本需求不写任何新文档产物（除自身需求目录） |

**因此：无数据回填、无迁移、无灰度开关、无 schema 版本变化。**
这也是本需求被判定为轻档的根据之一——问题不是"数据没了"，而是"视图层没画"。

## 2. 派生投影模型 `serves: FR-1, FR-3`

复用既有 `ReqCard`（`src/client/types.ts:274`），**不新增投影类型**：

| 字段 | 类型 | 来源 | 归档条用途 |
|------|------|------|-----------|
| `req` | `RequirementRecord` | `state.requirements` | 取 `id` / `title` / `status` / `updatedAt`（排序键） |
| `tasks` | `TaskRecord[]` | `state.tasks.filter(t => t.requirementId === req.id)` | 计数与详情同源 |
| `doneCount` | `number` | `tasks.filter(status === 'done').length` | chip 上的 `done/total` |
| `totalCount` | `number` | `tasks.length` | chip 上的 `done/total`；**A6 断言其等于真实任务数** |
| `readyIds` | `string[]` | `state.ready[req.id] ?? []` | 归档条不消费（保持形状一致，便于复用同一构造点） |
| `blocked` | `boolean` | `req.blocked \|\| tasks.some(t => t.blocked)` | 同上 |
| `tokenTotal?` | `number?` | `state.tokenTotals?.[req.id]` | 归档条不消费（缺省不渲染 0） |

**两个投影的关系**（唯一构造点，防两份真相）：

```
state.requirements
      |
      +-- filter(status ∉ {archived, canceled}) --> toCard --> toReqCards   （进行中，语义不变）
      |
      +-- filter(status ∈ {archived, canceled}) --> toCard --> sort(updatedAt desc) --> toTerminalCards
```

**派生不变量**（可断言，FR-5 回归锚点）：

1. 互斥且完备：`toReqCards ∪ toTerminalCards` 覆盖全部需求；两者交集为空；
2. `done` 恒在 `toReqCards` 侧（列表「已完成」组仍能收到它）；
3. 对任一终态需求，`totalCount === ` 其 `queue.json` 任务数（**归档不吞任务**）。

## 3. 渲染模型 `serves: FR-1, FR-3`

**归档条模型**（不落盘，仅字符串渲染参数）：

| 模型项 | 定义 | 渲染落点 |
|--------|------|---------|
| `total` | `cards.length` | `data-archived-count` |
| `archivedCount` | `cards.filter(status === 'archived').length` | summary「已归档 N」 |
| `canceledCount` | `cards.filter(status === 'canceled').length` | summary「· 已取消 M」（M = 0 时省略） |
| `shown` | `cards.slice(0, limit)`，`limit` 缺省 `ARCHIVED_CHIPS_MAX = 100` | chips |
| `hidden` | `cards.length - shown.length` | 「另有 N 条未显示」（N > 0 时） |

**列表终态组模型**：

| 变量 | 改造前 | 改造后 |
|------|--------|--------|
| `active` | `cards.filter(status ∉ {done, archived})` | `toReqCards(state).filter(status !== 'done')` |
| `finished` | `cards.filter(status ∈ {done, archived})`（archived 已被上游滤掉 ⇒ **恒为空的那半**） | `toReqCards(state).filter(done) ∪ toTerminalCards(state)` |
| 分组标题 | `已完成 N` | `已完成 / 已归档 N` |

排序沿用既有比较器：`active` / `finished` 各自 `byThen`（所选键 × 方向，同键则最近更新在前），
分组拼接顺序不变（进行中永远在前）。

## 4. 字段来源与不变量 `serves: FR-2, FR-5`

| 不变量 | 说明 | 由谁保证 |
|--------|------|---------|
| 归档需求详情与归档前同源 | 详情页消费 `state.requirements` + `state.tasks`，不读归档材料里的副本 | 无新数据源（本需求不加"归档快照"） |
| 只读由状态决定，不由数据决定 | `renderActionBar` 按 `req.status` 早退，与 `archive` 记录是否存在无关 | `interfaces.md` 第 4 节的终态表 |
| 任务计数与详情一致 | 归档条 chip 的 `done/total` 与详情执行 Tab 的统计卡**同一次过滤**产出 | 共用 `toCard`（第 2 节） |
| 不存在第二份任务真相 | 归档不复制任务、不写快照文件 | 直接读 `queue.json` 经 `toCard` |

## 5. 迁移与回滚 `serves: FR-4, FR-5`

| 项 | 结论 |
|----|------|
| 存量数据迁移 | **不需要**：台账与队列都不改；归档需求早已存在（当前 21 条 `archived`），改完即自动出现在归档条 |
| 兼容旧服务端 | 归档条只依赖 `status` / `title` / `updatedAt` / 任务计数（`state.tasks` 与 `state.ready` 既有字段），旧版服务端同样可渲染 |
| 兼容旧 client bundle | 部署是整包替换（`lib/client.js`），无新旧混跑窗口；服务端无契约变化，故无兼容矩阵 |
| 回滚路径 | `git revert` 本次 client 改动 + `pnpm build:client`（C-12）重建 bundle；**无任何数据需要还原**（这正是"零持久化变更"的收益） |
| 灰度 | 不需要（纯渲染层；风险由 A1–A6 断言与人工验证承担） |
| 遗留缺口（显式记账，非本需求引入） | `canceled → archived` 有合法状态机边但全站无 UI 入口；本轮不提供（见 `use-cases.md` 非目标），也不因本需求新增后端路径 |
