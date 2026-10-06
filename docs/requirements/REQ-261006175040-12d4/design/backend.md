<!-- serves: FR-2, FR-5, FR-6, FR-7 -->

# 后端设计（REQ-261006175040-12d4 卡面门读数修复）

> 改的是**读侧取数与投影**：三个 Store/Writer 实现必须给出**同形**的读数（契约测试即护栏）。
> 写路径的落章/推进/权限一律不动；台账零字段新增、零迁移。

## 1. 三个生产点与装配单点 `serves: FR-2`

| 生产点 | 现状 | 改动 | 额外 IO |
|---|---|---|---|
| `ShardedRequirementWriter.notify`（3 处：创建 / 装箱替换 / 提交点） | `summarize(finalRecord)` | 换 `boardSummaryOf(finalRecord)` | **0**（`finalRecord` 是装配态记录，含 `artifacts`/`plan`/`archive`） |
| `SqliteRequirementWriter` → `commitNotify` | 由 Store 侧从传入的**整条记录**投影 | 换 `boardSummaryOf(record)` | **0**（同上） |
| `ShardedRequirementStore.summarizeHot`（索引构建 + 未命中定点） | `summarize(record)`（热记录，无外置对象） | 先读 `artifacts`/`plan`/`archive` 三件，再 `boardSummaryOf` | **一次性 2.19 MiB / 60 条**（见 `architecture.md` §4） |
| `ShardedRequirementStore.coldSummaries` | `summarize(record)` | 同上（冷侧路径） | 仅在 `scope=archived\|all` 时发生 |
| `SqliteRequirementStore.summarizeAt` / `ensureIndex` / `coldSummaries` | `summarize(lightRecordOfRow(row, parts))` | 换 `boardSummaryOf(…)` | **0**（`lightRecordOfRow` 已注入 parts） |
| `tests/support/legacy-store-projection.ts`（假投影辅助） | 4 处 `summarize(` 直出 | 换 `boardSummaryOf` | 0（入参是全量记录） |
| `tests/application/harness.ts`（`InMemoryRequirementStore`，契约表内实现） | 2 处 `summarize(`（`getSummary` / 订阅广播） | 换 `boardSummaryOf` | 0 |
| `shared/board-summary.ts`（新增） | — | 门清单（`flowProfileFor` + `ARTIFACT_CONFIRM_GATES`）→ domain 纯函数 → `summarize` | 0 |

**实现清单以契约为准**：`tests/reqboard/store-contract.test.ts` 的表内实现共**四条**
（`InMemoryRequirementStore` / `ShardedRequirementStore` / `SqliteRequirementStore` / `FakeSqlReadOnlyStore`），
外加假投影辅助 `tests/support/legacy-store-projection.ts`——**五条产出路径全部要走 `boardSummaryOf`**，
漏一条同形断言即红（T-5 的口径见 `design/test-cases.md`）。

**单点纪律**：`boardSummaryOf` 是**唯一**能产出看板摘要的函数；`summarize` 退化为纯字段透传，
仍被 `factsOf` 与既有测试使用。任何生产点不得自己拼读数（契约测试会发现不一致）。

## 2. 索引与缓存的生命周期 `serves: FR-2`

| 事件 | 现状 | 改动后 |
|---|---|---|
| 首次 `/state` | 懒建索引（逐条读 `record.json`） | 懒建索引（逐条读 `record.json` + 三件外置对象） |
| 下一次 `/state`（20s 轮询） | 命中内存索引，0 IO | **不变**（0 IO） |
| 任何写（登记/落章/推进） | `notify` 用写侧记录刷新该条索引项与 factsCache | **不变**，且读数随写侧整条记录算出（0 额外 IO） |
| `onLedgerReplaced`（迁移/整册替换） | 索引与 factsCache 置空，下次重建 | **不变**（重建时多读三件对象，与首次同价） |

## 3. 读失败与「不可得」的判定 `serves: FR-6`

外置对象读取有三种结局，必须分开处理（FR-6 的机器判据就在这里）：

| 结局 | 判据 | 处置 | 卡面 |
|---|---|---|---|
| 文件不存在（ENOENT） | `readObject` 返回 `undefined` **且** `objectExists` 为 `false` | 视为「真没有」：`artifacts = []` / `plan = undefined` / `archive = undefined` | 真实缺失：门红 ✗ / 无计划 chip / `archivePrepared: false` |
| 读返回 `undefined` 但文件存在（JSON 损坏被隔离） | `objectExists` 为 `true` | **该读数不可得**：不下发 `gates`（或对应的 `planState`/`archivePrepared`）+ `onWarn` 点名需求与原因 | 不渲染该块（**不得**冒充缺失） |
| 读抛 IO 错 | 异常 | 同上（不可得 + 告警），**不得**把整条需求从索引剔除 | 不渲染该块 |

最后一行是刻意与既有行为区分的：既有实现在 `readRecord` 失败时把该需求**剔除出索引**（它会从看板上消失）。
读**外置对象**失败不具备同等严重性（标量与计数仍在），因此本次规定：读数不可得，需求仍在。

## 4. 验收 chip 与归档 chip 的取数（不读两件大文件） `serves: FR-5`

| chip | 取数来源 | 为什么不读对应大文件 |
|---|---|---|
| 「待验收材料 / 待人工审核」 | `gates` 里 `kind='verification'` 的读数（`missing` ⇒ 待验收材料，`pending`/`confirmed` ⇒ 待人工审核） | `reqboard_submit(kind=verification)` 本就登记 `kind=verification` 产物，语义等价；省掉 1.95 MiB 的 `verification.json` 读取 |
| 「计划待批 / 已批 / 被退」 | `plan.json` 的 `approvedAt` / `rejectedAt` | 「被退」只能从 `rejectedAt` 读出，无法由产物表达 |
| 「待归档材料 / 待归档」与列表行「归档材料待补」 | `archive.json` 存在 ∪ 产物含 `kind='archive'` | 与 `closingGapOf` **同源**，避免「看板说补过了、领域谓词说没闭环」两套判据 |

**parity 断言**（必须写进测试）：对同一批夹具，`archivePrepared === false` ⟺
`closingGapOf(req) === 'archive_missing'`（`status==='archived'` 时）。`closingGapOf` 本身**不改**，
服务端既有调用点（`application/internal/support.ts`）行为不变。

## 5. 客户端包与构建 `serves: FR-7`

- 客户端源码改动（`src/client/**`）后必须重建 bundle：`pnpm build:client`（C-12），
  并通过 `scripts/verify-client-build.mjs` 的「关键符号齐全 / 样式归属章在场 / CSS 分片完整」检查；
  发版前 `pnpm build`（C-11）。
- 本次**不新增客户端样式**：三态 chip、派生行、确认按钮、计划/验收 chip 的 CSS 全部沿用既有分片
  （`src/client/styles/board.ts` 等），因此不存在样式归属问题；派生行文案变化不涉及新类名。

## 6. 失败要响亮（实施时的硬要求） `serves: FR-2, FR-7`

- 读数不可得必须 `onWarn`，文案含**需求 id + 外置对象名 + 原因**（`ShardedRequirementStore.onWarn` 既有通道）。
- 索引构建的额外读**不得**静默吞错：单条失败只影响该条读数，其余需求照常入索引（禁止「一条坏 ⇒ 整页空」）。
- 实测复核不达标（载荷增量 > 5%、或索引构建出现每请求级读放大）时，处置是**回到本设计改取数**，
  不是放宽阈值或删断言（见 `design/test-cases.md` 第 4、6 条）。
