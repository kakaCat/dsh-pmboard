<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

# 架构设计（REQ-261006175040-12d4 看板卡面门读数修复）

> 一句话：把「门状态从哪来」从**卡面事后推断**改成**服务端读侧有界投影**——判定下沉 `domain` 纯函数，
> 装配收在 `shared/board-summary` 一处，客户端只渲染（D-2）。

## 1. 目标与总体方案 `serves: FR-1, FR-2, FR-6`

改动前的因果链（缺陷）：`GET /state` 自 B12 阶段⑥-① 起只下发**摘要**（`artifacts`/`plan`/`verification`/
`archive` 属 `BIG_FIELD_KEYS`，一律不下发），而卡面仍从这四个字段算门状态 ⇒ 每条需求都算成「四门缺失」。

```
改动前                                          改动后
------                                          ------
台账 artifacts.json ──┐                        台账 artifacts.json / plan.json / archive.json
台账 plan.json      ──┤  (不下发)                     │  索引构建读一次（进程内缓存）
                     ↓                               ↓
              GET /state 摘要                   domain/artifact/GateReadings.ts（纯判定）
                     │                               ↓
        卡面 computeGateStatuses(req.artifacts)  shared/board-summary.ts（装配一次）
                     ↓                               ↓
            四门恒红 + 产物 0/6 + 无按钮        GET /state 摘要（+ gates/planState/archivePrepared）
                                                     ↓
                                            卡面只渲染读数（不再推断）
```

三条设计目标：
1. **事实一致**：卡面每一处门状态都能追到台账的产物登记与落章（FR-1 / FR-3 / FR-5）。
2. **不许回涨**：`/state` 的**每请求**读放大保持为 0，载荷增量 ≤ 5%（FR-2 / FR-7）。
3. **读不到 ≠ 缺失**：读数不可得时**不下发键**，卡面不渲染，而不是渲染成红色（FR-6）。

## 2. 决定落点的既有约束 `serves: FR-2, FR-6`

| 约束（既有，不改） | 出处 | 对本设计的后果 |
|---|---|---|
| `domain` 层不许 import `shared` | `docs/architecture/live-card-single-source.md:16` | 门判定写成**入参结构化**的 domain 纯函数，门清单由调用方传入 |
| 门清单与分类生效门的唯一事实源 | `src/shared/protocol.ts`（`ARTIFACT_CONFIRM_GATES`、`flowProfileFor`） | 装配层读它，**不另抄一份门表** |
| 摘要不得带无上界大字段 | `RequirementSummary.BIG_FIELD_KEYS` | 只补有界读数：≤ 5 门 × 3 字段 + 2 枚标量 |
| 「缺失 ≠ 0」 | 本仓一贯口径（token / paused / advanceAlert 同款） | 不可得 ⇒ **键不出现**，不补默认值 |
| 契约测试的**四条**实现必须同形（InMemory / 分片 / SQLite / 假 SQL 只读） | `tests/reqboard/store-contract.test.ts` | 契约测试即本次的防漂移网：少更新任何一条产出路径 ⇒ 同形断言红（见 §6） |
| 客户端不许写过滤/推断口径 | `docs/architecture/live-card-single-source.md` §2 | 客户端 `computeGateStatuses` **删除**（不是保留备胎） |

## 3. 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 文件 | 类型 | 改动内容 | serves |
|---|---|---|---|
| `src/domain/artifact/GateReadings.ts` | 新增 | 三个纯函数：门三态判定、计划状态、归档材料是否已备（零 IO、入参结构化） | FR-1, FR-3, FR-5 |
| `src/shared/board-summary.ts` | 新增 | `boardSummaryOf(record)`：门清单 + domain 纯函数 + `summarize` 的唯一装配点 | FR-2 |
| `src/domain/requirement/RequirementSummary.ts` | 修改 | 入参/出口各加三个可选键；`SUMMARY_KEYS` 同步 | FR-2, FR-6 |
| `src/repositories/ShardedRequirementWriter.ts` | 修改 | 三处 `summarize(record)` → `boardSummaryOf(record)`（写侧手上就是装配态记录，0 额外 IO） | FR-2 |
| `src/repositories/ShardedRequirementStore.ts` | 修改 | `summarizeHot` / `coldSummaries` 补读三件外置对象后走 `boardSummaryOf` | FR-2, FR-6 |
| `src/repositories/SqliteRequirementStore.ts` | 修改 | `summarizeAt` / `ensureIndex` / `coldSummaries` 改走 `boardSummaryOf`（`lightRecordOfRow` 已注入 parts ⇒ **0 额外 IO**） | FR-2 |
| `src/repositories/RequirementShardRepository.ts` | 修改 | 补一个 `objectExists()` 存在性探针（区分「文件不存在 = 真没有」与「读失败 = 不可得」） | FR-6 |
| `src/client/types.ts` | 修改 | `GateReading` 类型 + 三个可选键（卡面消费面） | FR-1, FR-3 |
| `src/client/views/artifacts.ts` | 修改 | 删 `computeGateStatuses`；chips / 派生行 / 确认按钮 / `planChip` 改读读数 | FR-1, FR-2, FR-3, FR-4, FR-5 |
| `src/client/views/verification.ts` | 修改 | `verifyChip` / `archiveChip` 改读读数 | FR-5 |
| `src/client/views/board.ts` | 修改 | 列表行「归档材料待补」改用 `archivePrepared` | FR-5 |
| `tests/support/legacy-store-projection.ts` | 修改 | 4 处 `summarize(` 直出 → `boardSummaryOf`（`getSummary` / `listSummaries` / 冷侧 / 订阅广播） | FR-2, FR-7 |
| `tests/application/harness.ts` | 修改 | `InMemoryRequirementStore` 2 处 `summarize(` → `boardSummaryOf`（契约表内的实现之一） | FR-2, FR-7 |
| `tests/reqboard/domain-summary.test.ts` | 修改 | 键集断言 + 门读数投影用例 | FR-7 |
| `tests/card-face.test.ts` | 修改 | 夹具改摘要形状（带读数） | FR-7 |
| `tests/card-face-summary-shape.test.ts` | 新增 | **跨缝**：只喂摘要字段也能渲染出正确门状态；无读数则不渲染 | FR-7 |
| `tests/state-no-bigfield-read.test.ts` | 新增 | 读放大上界（桩计数：连续 3 次 `/state` 不新增大字段读） | FR-2, FR-7 |
| `scripts/card-gates-ui-shot.mts` | 新增 | 真渲染出图（三态卡面 before/after），E2E 行 | FR-7 |

删除项：客户端 `computeGateStatuses`（唯一副本，随 FR-1 一起删）。**不改**：写路径的落章/权限/门禁判定、
详情页取数（`GET /requirements/:id` 全量记录照旧）、台账字段与 schema（零新增字段、零迁移）。

## 4. 读放大预算（实测口径） `serves: FR-2, FR-7`

实测本体：本机台账热侧 **60 条**需求，四件外置对象的磁盘占用：

| 外置对象 | 合计 | 单条峰值 | 本次是否读 | 理由 |
|---|---|---|---|---|
| `record.json` | 191 KiB | — | 已在读 | 现有索引构建就在读它 |
| `artifacts.json` | 1202 KiB（在盘 59/60） | 77 KiB | **读** | 门三态 + `count` + 归档材料是否已备 |
| `plan.json` | 605 KiB | 43 KiB | **读** | `planState` 的「被退」只能从 `rejectedAt` 读出 |
| `archive.json` | 382 KiB | 36 KiB | **读** | 与 `closingGapOf` 的输入同源（存量可能只有归档记录、没有归档产物） |
| `verification.json` | 1950 KiB | 130 KiB | **不读** | 验收 chip 由 `gates` 里的 verification 门读数表达——`reqboard_submit(kind=verification)` 本就会登记 `kind=verification` 产物 |

结论与口径：

- **索引构建**一次性多读 2.19 MiB（≈ 原 191 KiB 的 11 倍字节量），**只发生在进程内索引建立时**；
  索引命中后每请求 **0 额外 IO**。
- **写路径 0 额外 IO**：`ShardedRequirementWriter` / `SqliteRequirementWriter` 广播时手上就是装配态记录
  （`finalRecord` / `record`），读数随投影顺带算出。
- **SQLite 实现 0 额外 IO**：`lightRecordOfRow(row, parts)` 已把 parts（含外置对象）注入轻记录，
  `ensureIndex` 的 `selectAllParts` 那一次全表读就够用。
- **冷侧**（`scope=archived|all`）才多读三件对象；看板首屏不取冷侧（`api.fetchState` 只带 `?session=`，
  `handleState` 的 `scope` 缺省为 `active`），故这部分不进首屏路径。
- **载荷**：每条约 230 B（4 门 × `{kind,status,count}` + 2 枚标量）× 60 ≈ **14 KB**，
  占现 `/state` 响应体（实测 9,325,744 B，其中 `tasks` 占 9482 KiB ≈ 99.6%）**≈ 0.15%**，满足 FR-7 的 ≤ 5%。
  同批实测的另一个口径也如实记录：需求摘要本身 600 B → 约 830 B（**+38%**），两个口径都要写进验收材料。
  基线读数与采集命令见 `evidence/payload-baseline.md`。
- 诚实标注：以上是**磁盘字节与解析前估算**；实施后必须按 `design/test-cases.md` 的第 4、6 条实测复核
  （读放大用桩计数，载荷用同批需求改动前后对比），读数不达标的处置是**回到本设计改取数**，不是放宽阈值。

## 5. 数据流与失败处理 `serves: FR-2, FR-6`

取数顺序（每条需求一次）：`record.json`（标量 + 计数）→ `artifacts.json` / `plan.json` / `archive.json`
（三件，可并发）→ `boardSummaryOf` 投影 → 入内存索引。

失败处理（逐条，**响亮且不伪装**）：

| 情形 | 处置 | 卡面表现 |
|---|---|---|
| 外置对象文件不存在（ENOENT） | 按「真没有」传入空值（`[]`） | 四门红 ✗（真实缺失）——这是新需求该有的样子 |
| 读对象抛 IO 错 / JSON 损坏被隔离 | `objectExists` 探针确认文件确实存在过 ⇒ 该读数**不可得**：不下发键 + `onWarn` 告警 | 不渲染该块（不冒充缺失） |
| 摘要完全不理解该需求（现有路径） | 维持既有行为（告警 + 从索引剔除该条） | 该需求不在看板上（既有口径，本次不动） |

## 6. 防漂移网 `serves: FR-7`

| 漂移形态 | 锁法（可跑） |
|---|---|
| 某个实现忘了装配读数 | `tests/reqboard/store-contract.test.ts` 的读套件加**同形断言**：契约表内四条实现（InMemory / 分片 / SQLite / 假 SQL 只读）对同一条需求给出逐字段相等的 `gates`/`planState`/`archivePrepared`；假投影辅助（`tests/support/legacy-store-projection.ts`）另有一条出口断言 |
| 测试侧辅助仍用旧投影 | `legacy-store-projection.ts`（4 处）与 `harness.ts` 的 InMemory（2 处）的 `summarize(` 直出必须一并改走 `boardSummaryOf`，否则同形断言必红（已列入 §3 模块改动地图） |
| 客户端又长回自己的判定 | `tests/card-face.test.ts` + 新增跨缝用例只喂摘要字段；客户端源码里不再有 `req.artifacts` 读法（可 grep 断言） |
| 「读不到」被当成「缺失」 | 跨缝用例的第二组断言：不带读数的摘要 ⇒ 既不出 `✗` 也不出 `产物 0/6` |
| 摘要偷偷回涨（大字段回填） | `domain-summary.test.ts` 的 `BIG_FIELD_KEYS` 断言 + 键集恰好等于 `SUMMARY_KEYS` |
| 读放大偷偷回涨 | `tests/state-no-bigfield-read.test.ts` 桩计数 |

## 7. 兼容、迁移与回滚 `serves: FR-6, FR-7`

- **零 schema 变更、零台账字段、零迁移脚本**：读数是从既有产物/计划/归档**派生**的，一个字节都不写盘。
- **旧服务端 + 新客户端**：摘要没有读数键 ⇒ 卡面按 FR-6 不渲染（不报错、不空白整卡）。
- **新服务端 + 旧客户端**：多出三个键，旧客户端不读它们（`SUMMARY_KEYS` 只用于服务端断言与投影）。
- **契约变更的同步点**：`SUMMARY_KEYS` 是摘要键集的唯一事实源，`domain-summary.test.ts` 的
  「键集恰好等于 `SUMMARY_KEYS`」断言会强制同步更新——漏改即红，不靠人记得。
- **回滚**：`git revert` 本次源码改动 + `pnpm build:client` 重建客户端 bundle；台账零改动，
  无需数据修复。回滚后回到「四门恒红」的旧行为，但**不会**产生坏数据。

## 8. 边界裁决（写死，不再议） `serves: FR-3, FR-4, FR-5, FR-6`

1. 客户端**删除** `computeGateStatuses`，不留第二份判定（口径只能有一份）。
2. 派生行**只留** `门 已确认/生效门总数`；既有第二段「N 门待确认」删除（与 ⏳ chips 重复，实际同时最多一门待确认）。
3. 「确认产物」按钮的**在场条件**只看读数：当前门 `status === 'pending'`；`missing` / `confirmed` 一律不渲染
   （不给点了必被拒的假按钮）。份数文案取该门读数的 `count`。
4. 不改三态 chip 配色（实测对比度绿 2.76:1 / 橙 3.39:1 / 红 3.81:1 均低于 4.5:1，属新的视觉语言决策，另立项）。
5. 列表行「归档材料待补」改读 `archivePrepared`；`closingGapOf` 的服务端用法**不动**，两者输入同源
   （归档记录 ∪ 归档产物）并有 parity 断言。
