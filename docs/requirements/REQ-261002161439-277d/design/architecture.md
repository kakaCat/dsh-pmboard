---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 数据层架构（台账分片 · 读放大治理 · 存储端口化） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8

> 面向零上下文的执行者。本文只定**方向与结构**，不写代码、不排任务。
> 需求：`docs/requirements/REQ-261002161439-277d/requirement.md`（FR-1…FR-8、A1…A13）。

## 分层与依赖方向 serves: FR-1

数据层改造**不新增层**，只是把既有的 `adapters` 一层的实现换掉、把 `application/ports.ts` 的端口形状换掉：

```
tools/  http/  client/        ← 入口层（薄壳；95 处读点在此改造为异步定向读）
        │ 只调用例
application/                   ← 用例 + ports.ts（端口定义在这里，全异步领域语汇）
        │ 只用 domain 类型
domain/                        ← 新增：路径/摘要投影/日志编解码（纯函数、零 I/O）
        ▲ 实现端口（I/O 只在这里）
repositories/                  ← 新增：分片仓储 + 分片 Store 实现
```

硬纪律（沿用本仓既有）：

- 依赖方向不变：`tools/http/client → application → domain`；`repositories` 实现 `application/ports.ts`。
- `domain/` 零 I/O：路径拼接、摘要投影、日志行编解码都是纯函数，可单测。
- 端口**不泄漏存储细节**：签名里不出现文件名、JSON、SQL、路径；`RequirementStore` 只讲领域语汇。

## 数据根与物理布局 serves: FR-2, FR-3, FR-4

数据根从「单文件」改为「单目录」：`~/.dsh/reqboard/`（DSH 主目录内，插件卸载不删除，与现状同归属）。

```
~/.dsh/reqboard/
  meta.json                      # { schemaVersion, revision, migrations[] } —— 小标量，O(1) 写
  requirements/<REQ>/record.json      # 热记录：标量 + 小对象 + 计数（实测峰值 5038B）
  requirements/<REQ>/comments.jsonl   # append-only：评论
  requirements/<REQ>/history.jsonl    # append-only：状态流转 + 推进事件历史
  requirements/<REQ>/artifacts.json   # 产物登记（盖章会就地改 ⇒ 整份改写，单需求有界）
  requirements/<REQ>/plan.json        # 拆分计划
  requirements/<REQ>/verification.json# 验收材料（evidence / sheet / sheetHistory）
  requirements/<REQ>/archive.json     # 归档材料
  archive/<REQ>/…                     # 冷存：与热侧同构的目录（现状 33 条归档）
~/.dsh/dsh-reqboard.json         # 保留为**导出格式**（legacy v9 单册），运行时不读写
```

**索引不落盘**（见「读路径与索引」）：没有索引文件，就没有"索引与分片不一致"这个议题。

实测依据（当前真实台账，35 条需求）：单需求字段峰值 `comments` 65.4KB（144 条）· `verification` 71.0KB · `artifacts` 50.9KB（216 条）· `plan` 12.4KB · `statusHistory` 3.8KB；剔除这 5 类后热记录峰值 **5038B**、平均 2565B。

## 写路径 serves: FR-2

一次交互式变更只碰三处，且三处都与库容无关：

```
mutate(id, fn)
  ├─ 1. 重读该需求分片（不信任缓存）        O(单需求)
  ├─ 2. 应用变更器                        内存
  ├─ 3. 提交：先 append 日志行，再原子写 record.json，最后写 meta.json(revision)
```

- **提交点 = `record.json`**（rename 原子）。日志先写、记录后写，崩溃后「日志多一行而记录未更新」是唯一可能的中断态，读侧按记录里的**计数**（`commentCount` / `historyCount`）截断日志尾部即可，不需要额外恢复步骤。
- 原子写复用既有 `persistAtomic`（temp → fsync → rename），**不另造第二套**（本仓已在 `QueueRepository` 头部写死这条纪律）。
- 写放大：单次约 5KB（record）+ 1 行日志 + ~120B（meta），相对现状每次 2.66MB 全册，约 **1/500**；且不随需求条数与评论条数增长。

## 读路径与索引 serves: FR-1, FR-4

端口的读入口全部**定向**，不再有"整册同步快照"：

- `get(id)`：读 `requirements/<REQ>/` 下按需装配（record + 日志 + 外置大对象）→ 返回完整记录。
- `listSummaries(filter)`：走**内存索引**（`Map<id, RequirementSummary>`），零文件读。
- `head()`：返回 `meta.json` 的 `revision`。

内存索引在**首次 `listSummaries`** 时扫一遍 `requirements/*/record.json` 重建（沿用 `QueueTaskStore.buildIndexFromDisk` 的懒建先例：不在进程启动时无条件预读），此后由写路径增量维护。

**索引内存化是本设计对 FR-2 的一处收敛**：FR-2 写的是"只写被改动的需求分片**与索引**…保证索引与分片一致的提交顺序"。落地方案改为索引不落盘，理由有二：

1. 落盘的单份索引必然是 O(需求条数) 的整体重写——那会让 A1 的"100 条与 1000 条夹具落盘量相等"不成立；
2. 索引是**派生数据**，落盘就多一份可能与分片不一致的真相；内存索引崩溃后重建即可收敛，反而消除了 FR-2 要防的那类不一致。

因此 FR-2 的意图（写放大与库容解耦、无索引/分片不一致）由"只写分片 + 内存索引"更强地满足。

## 大字段外置 serves: FR-3

按「是否只追加」分两类，治法不同——**不能一律当 append-only**：

| 字段 | 只追加？ | 落法 | 理由 |
|------|---------|------|------|
| `comments` | 是（只 push） | `comments.jsonl` | 高频、无上界，是主要增长源 |
| `statusHistory` / `advance.history` | 是（只 push） | `history.jsonl` | 无上界，且推进历史会持续增长 |
| `verification`（含 evidence / sheet / sheetHistory） | 否（返工会整份重交） | `verification.json` | 单需求有界（峰值 71KB），整份重写代价可接受 |
| `artifacts` | 否（确认时会**就地盖章** `confirmedAt`） | `artifacts.json` | 就地改 → 不能进 append-only 日志 |
| `plan` | 否（改计划会整份重交） | `plan.json` | 单需求有界（峰值 12.4KB） |
| `archive` | 否（归档材料一次性写入后基本只读） | `archive.json` | 单需求有界（峰值 2.4KB） |

**落地判据**：热记录 `record.json` 的体积**与评论/产物/验收条数无关**（A4）；大字段按需装配，端口返回的 `RequirementRecord` 形状与现状**逐字段一致**（调用方与看板类型零改动）。

## 热冷分层 serves: FR-4

- **热侧**（`requirements/`）：非归档需求。进内存索引，进 `/state` 默认载荷，可写。
- **冷侧**（`archive/`）：`status ∈ {archived, done}` 的需求。不进内存索引、不进默认载荷、**不可写**（写操作对冷侧需求返回 `REQBOARD_COLD_IMMUTABLE`）；按 id **可冷读**（`get(id)` 回落冷侧目录）。

冷读是必要的，不是可选优化：看板详情支持 `?req=<id>` 深链，归档需求也必须打得开（这正是现状 33/35 条归档需求仍被整包热传的原因）。

## 并发与乐观锁 serves: FR-5

端口提供两条写路径，**都在端口契约里写明原子性由适配器保证**：

| 入口 | 语义 | 适配器义务 | 用途 |
|------|------|-----------|------|
| `mutate(id, fn)` | 临界区内读-改-写（RMW） | JSON：写前重读 + 进程内串行队列；DB：事务 / `SELECT … FOR UPDATE` | 交互路径（现状 67 处单需求写） |
| `mutateIf(id, expectedVersion, fn)` | CAS：版本不匹配 → `REQBOARD_CONFLICT` | JSON：读后比对 `version`；DB：`UPDATE … WHERE id=? AND version=?` 影响行数为 0 即冲突 | 多写者上线后的写路径（A6 断言） |

**`version` 由适配器统一自增**，不再由调用点手工维护。实测：现状 90 处 `mutate` 回调中仅 **45 处**自增 `version`，其余写后版本陈旧——这使 `version` 今天**不能**作为可信 CAS 令牌。把自增收进适配器是 FR-5 成立的前提，也顺带修掉这半数的陈旧版本。

`revision`（全局单调）语义不变：`meta.json` 的单行写入成功后自增，作为 SSE 帧与"已落盘"指针。

## 数据库插入点 serves: FR-6

DB 适配器是「再实现一次 `RequirementStore`」，不是「再改一轮调用方」。为此本设计把三件事定死：

1. **无同步读**：全部端口方法返回 `Promise`（现状 `snapshot()` 是同步的，远端库不可能实现它）。
2. **无整册语义**：端口不出现"读全部需求"的通用入口；跨需求只留一个显式的批量入口（见下）。
3. **并发语义可映射**：`mutate` 的 RMW 与 `mutateIf` 的 CAS 都能一对一映射到行锁与 `WHERE version=?`（见 `data-model.md` 的关系型映射表）。

跨需求写**只有 2 处**（实测：`src/index.ts:188` 启动对账、`migrate-dive-state.ts:104` 启动一次性迁移），二者都是**启动期全表对账**、非交互路径。端口为此保留一个显式入口 `sweep(reason, fn)`，并在契约里写明「**仅启动对账可用**，交互路径禁止调用」；DB 适配器以事务实现它。

## 客户端载荷 serves: FR-7

| 端点 | 现状 | 改后 |
|------|------|------|
| `GET /state` | 全部需求（含 33 条归档）全文 + 全部任务 | **仅热侧摘要**（156B/条）+ 分页 + 全部任务；不再触发产物扫描 |
| `GET /requirements/:id` | 无 | 新增：单需求详情（含冷侧回落），详情视图按需拉取 |
| `POST /artifacts/scan` | 无（扫描藏在 `/state` 里，**每请求一次**全目录扫描） | 新增：扫描改为显式触发 |
| `GET /events`（SSE） | `{revision, kind}` | **不变**（客户端刷新契约零改动） |

## 迁移与回滚 serves: FR-8

```
迁移：dsh-reqboard.json(v9 单册)  ──migrate-ledger-v10──▶  reqboard/ 目录(v10 分片)
回滚：reqboard/ 目录(v10 分片)     ──rollback-ledger-v10──▶  dsh-reqboard.json(v9 单册)
```

- 迁移脚本沿用既有 `scripts/migrate-ledger.ts` 的四模式约定（`--dry-run` / `--apply` / `--verify` / `--rollback`）、写前备份、以及 `state/server.pid` 存活时拒绝 `--apply`（防内存态覆盖磁盘）。**不改既有 v9 脚本**，新增 v10 脚本。
- 迁移**幂等**：已是 v10 时 `--apply` 报 `already_v10` 且不重写任何文件。
- 回滚产出的 v9 单册必须能被**旧版读路径**装载同一批需求（A11 断言条数与 id 集合一致）。

## 文件结构变更清单 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8

| 文件 | 动作 | 职责（一句话） |
|------|------|---------------|
| `src/domain/requirement/ReqboardPaths.ts` | 新增 | 数据根 / 分片 / 日志 / 冷存路径的**单一事实源**（纯函数） |
| `src/domain/requirement/RequirementSummary.ts` | 新增 | 摘要类型 + 「记录 → 摘要」投影（纯函数） |
| `src/domain/requirement/Journal.ts` | 新增 | 日志行编解码 + 「按计数截断」的纯函数 |
| `src/repositories/atomicWrite.ts` | 新增 | `persistAtomic` 的新家（从 `JsonLedgerRepository` 迁出，全仓唯一原子写） |
| `src/repositories/RequirementShardRepository.ts` | 新增 | 分片目录 I/O 唯一入口：原子写、追加、冷存、坏文件隔离 |
| `src/repositories/ShardedRequirementStore.ts` | 新增 | 实现 `RequirementStore` 端口：内存索引、乐观锁、订阅广播 |
| `src/application/ports.ts` | 修改 | 换端口形状（`RequirementStore` + 摘要 + 错误码）；删 `snapshot()` |
| `src/shared/protocol.ts` | 修改 | `REQBOARD_SCHEMA_VERSION` 9 → 10 |
| `src/index.ts` | 修改 | 装配新 store；`LEDGER_FILE` 降级为导出格式常量 |
| `src/http/routers/stages.ts` | 修改 | `/state` 改摘要 + 分页；摘掉每请求产物扫描 |
| `src/http/routers/requirements.ts` | 修改 | 新增 `GET /requirements/:id` 详情端点 |
| `src/http/routers/*.ts`、`src/application/**`、`src/tools/**`、`src/wiring/**` | 修改 | 95 处 `snapshot()` 读点 + 90 处 `mutate` 调用点适配新端口 |
| `src/adapters/ArtifactSync.ts` | 修改 | 不再接收整册快照；改为按需求驱动 |
| `src/client/api.ts`、`types.ts`、`board-mount.ts`、`views/*` | 修改 | 摘要/详情分离、分页、详情按需拉取 |
| `src/adapters/JsonLedgerRepository.ts` | 删除 | 单册仓储退役（`persistAtomic` 已迁出；legacy v9 的读写只留在脚本里） |
| `scripts/migrate-ledger-v10.ts` | 新增 | v9 单册 → v10 分片（四模式 + 备份 + 幂等） |
| `scripts/rollback-ledger-v10.ts` | 新增 | v10 分片 → legacy v9 单册导出 |

**删除的代价（必须提前知道）**：`JsonLedgerRepository` 这个类被 **90 个文件**引用（其中 **43 处** `new` 构造、41 处在 `tests/`）。类型引用（72 个测试文件）随端口改名机械替换；`tests/application/harness.ts` 里的 `InMemoryRepo implements ReqboardRepository` 是**唯一**测试替身，端口一改它必须同步改（改一处，替身继续可用）。

## 不做什么 serves: FR-6

1. **不实现 DB 适配器**：无驱动、无连接池、无 DDL 迁移器；只交端口与关系型映射。
2. **不引入 ORM / 查询构建器**：端口是领域语汇，不是 SQL 语汇。
3. **不改任务存储**：`queue.json` + `QueueTaskStore` 保持原样（模式对齐由本设计示范，不在本次重写）。
4. **不改文档仓储**：`docs/` 下的 `.md` 仍在项目工作区、仍归 git。
5. **不承诺多写者上线**：`mutateIf` 的 CAS 语义与 `REQBOARD_CONFLICT` 就绪，但跨实例订阅、连接管理不在本次。
6. **不改 SSE 帧契约**：`{revision, kind}` 与命名/无名双帧照旧。
