<!-- serves: FR-2, FR-3, FR-4, FR-5, FR-6 -->

# 数据模型设计（REQ-261006175040-12d4 卡面门读数）

> 本需求**不动台账数据**：不新增字段、不改 schema、不写盘、无迁移。改的是**读侧投影**
> （`RequirementSummary`）与三个**派生读数**。

## 1. 变更面与非变更面 `serves: FR-2`

| 面 | 是否改 | 说明 |
|---|---|---|
| 台账分片文件（`record.json` / `artifacts.json` / `plan.json` / `verification.json` / `archive.json`） | **不改** | 读数全部派生自既有内容 |
| 台账 schema / 迁移脚本 | **不改** | 无 schema 版本变更；无回填 |
| SQLite 表结构（`SQLITE_SCHEMA_VERSION`） | **不改** | 只改从既有 parts 投影摘要的方式 |
| `RequirementSummary`（首屏载荷元素） | **改** | 新增三个可选键（下表） |
| `RequirementFacts`（同步缝窄投影） | **不改** | 它已有自己的 `artifacts` 事实子集，与看板载荷是两套有界投影 |
| `GET /requirements/:id`（详情全文） | **不改** | 详情页照旧按全量记录渲染 |

## 2. 新增字段契约 `serves: FR-2, FR-3, FR-4, FR-5`

| 字段 | 类型 | 必填 | 上界 | 缺省语义（键不出现时） | 消费点 |
|---|---|---|---|---|---|
| `gates` | `GateReading[]` | 否 | 生效门数 ≤ 5（feature 为 4） | **读数不可得** ⇒ 卡面不渲染 chips/派生行/确认按钮 | 卡面 chips、派生行、确认按钮 |
| `planState` | `'pending' \| 'approved' \| 'rejected'` | 否 | 枚举 | 无计划记录 / 不可得 ⇒ 不渲染计划 chip（该 chip 本就无「缺失」态） | 卡面 `planChip` |
| `archivePrepared` | `boolean` | 否 | 布尔 | 不可得 ⇒ 不渲染归档 chip | `archiveChip`、列表行「归档材料待补」 |

`GateReading` 形状（与客户端渲染一一对应）：

| 键 | 类型 | 说明 |
|---|---|---|
| `kind` | `ArtifactKind` | 门对应的产物种类（`requirement` / `design` / `decomposition` / `verification` / `archive` …） |
| `status` | `'confirmed' \| 'pending' \| 'missing'` | 三态，判定见 §3 |
| `count` | `number` | 该 kind 的产物条数（`design` 为份数，供「确认产物（全部 N 份）」文案；0 表示没有） |

不新增的字段（刻意）：`verificationSubmitted`——验收 chip 由 `gates` 里的 verification 门读数表达，
从而**避免**为了一个布尔去读 1.95 MiB 的 `verification.json`（见 `design/architecture.md` §4）。
`artifactCount` 保持原义（产物登记**条数**），不再被卡面当门状态用。

## 3. 三态判定（唯一实现） `serves: FR-1, FR-4`

判定下沉 `src/domain/artifact/GateReadings.ts`：`gateReadingsOf(confirmKinds, artifacts)`，零 IO、纯函数、
**入参结构化**（`{ kind: string; confirmedAt?: number }[]`，遵守「domain 不许 import shared」）。

| 条件 | 结果 |
|---|---|
| `artifacts` 里没有任何该 `kind` 的条目 | `missing`（红 ✗） |
| `kind === 'design'` 且该 kind 存在**任一**未落章（`confirmedAt` 缺省）条目 | `pending`（橙 ⏳，成组确认语义） |
| `kind === 'design'` 且全部已落章 | `confirmed`（绿 ✓） |
| 其他 kind：该 kind 的**首条**（登记唯一）已落章 | `confirmed` |
| 其他 kind：该 kind 的首条未落章 | `pending` |

`confirmKinds` 的来源：`flowProfileFor(category).confirmGates` → `ARTIFACT_CONFIRM_GATES[gateKey]`，
**顺序即数组顺序**（不排序、不去重）——卡面 chips 的位置必须稳定，否则人每次刷新都在重新找位置。

## 4. `planState` 与 `archivePrepared` 的取数口径 `serves: FR-5`

| 读数 | 输入 | 规则 |
|---|---|---|
| `planState` | `plan.json`（`approvedAt` / `rejectedAt`） | `approvedAt` 有值 ⇒ `approved`；否则 `rejectedAt` 有值 ⇒ `rejected`；否则 ⇒ `pending`；无计划对象 ⇒ 键不出现 |
| `archivePrepared` | `archive.json` 存在 **∨** 产物里有 `kind='archive'` | 真 ⇒ `true`（材料已备）；假 ⇒ `false`（待补）；不可得 ⇒ 键不出现 |

`archivePrepared` 的输入与 `domain/status/Predicates.closingGapOf` **同源**（归档记录 ∪ 归档产物），
因此看板列表行与既有领域谓词不会打架；两者的一致性由 parity 断言锁住（`design/test-cases.md`）。
两个读数**都不带正文**：`plan.tasks` / `verification.sheet` / `archive.docs` 一律不进摘要。

## 5. 缺省语义（缺失 ≠ 0） `serves: FR-6`

这是本需求最容易被写错的一格，逐形态写死：

| 形态 | 摘要里 | 卡面 | 为什么 |
|---|---|---|---|
| 旧服务端（摘要无这些键） | 键不出现 | 门相关块**整块不渲染**（既不红也不显示 `0/…`） | 读不到 ≠ 缺失（本次事故的教训） |
| 新服务端 + 需求从未登记任何产物 | `gates` 全 `missing`、`count: 0` | 四门红 ✗ + `门 0/4` | 这是**真实缺失**，必须红 |
| 新服务端 + 外置对象读取失败（IO/损坏被隔离） | 键不出现 + 告警 | 不渲染该块 | 数据不可用，不能冒充「没有」 |
| 无计划记录的任意阶段 | `planState` 不出现 | 无计划 chip | 无计划与不可得在渲染上同形（该 chip 无「缺失」态），已在类型注释里写明 |
| 归档需求但既无归档记录也无归档产物 | `archivePrepared: false` | 列表行显示「归档材料待补」 | 与 `closingGapOf === 'archive_missing'` 同判 |

## 6. 载荷与序列化口径 `serves: FR-2, FR-7`

- 序列化形态即普通 JSON 键，随 `/state` 的 `requirements[]` 下发；不带 `null`（缺省 = 无键）。
- 键集唯一事实源是 `SUMMARY_KEYS`（`src/domain/requirement/RequirementSummary.ts`）：
  `gates` / `planState` / `archivePrepared` 三个键必须同时出现在 `SUMMARY_KEYS` 里，
  `tests/reqboard/domain-summary.test.ts` 的「键集恰好等于 `SUMMARY_KEYS`」断言会强制同步。
- 估算载荷：约 230 B/条（4 门 × ~45 B + 2 枚标量 + 键名开销），60 条 ≈ 14 KB（占现载荷 ≤ 0.2%，实测口径见
  `design/architecture.md` §4）。
- **不允许**的做法（会被测试或评审打回）：把 `artifacts`/`plan`/`verification`/`archive` 本体塞回摘要；
  用 `count` 冒充门状态；给 `gates` 补一个「未知」三态值（缺省键本身就是未知的表达）。
