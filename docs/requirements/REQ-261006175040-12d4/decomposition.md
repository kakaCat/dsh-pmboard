<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

# 拆分计划（REQ-261006175040-12d4 看板卡面门读数修复）

## 目标与做法（一段人能读懂的）

把「卡面门状态从哪来」从**客户端事后推断**改成**服务端读侧有界投影**：门三态判定下沉到 domain 纯函数，
装配收在 `shared/board-summary` 一处，摘要多带三个有界键（`gates` / `planState` / `archivePrepared`），
客户端删掉自己的判定、只渲染读数。**不改台账数据、不改 schema、无迁移**；
回滚 = `git revert` + `pnpm build:client`。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（祈使 / 纠正 / 补充）——任务卡「关联 D-x」列与验收单「D-x 对照」项按它回取原话 |
| S-x | design/backend.md 服务与模块 | 服务 / 模块（本次按设计文档的模块改动地图编号） |
| UC-x | design/use-cases.md | 用户场景 |
| TC-x | design/test-cases.md | 测试用例 |
| t-x | 本文档任务表 | 任务 |

## 变更盘点（对照需求文档 + 设计一套）

- **新增**：`src/domain/artifact/GateReadings.ts`（门三态 / 计划状态 / 归档材料三纯函数）、
  `src/shared/board-summary.ts`（`boardSummaryOf` 装配单点）、
  `tests/gate-readings.test.ts`、`tests/card-face-summary-shape.test.ts`、`tests/state-no-bigfield-read.test.ts`、
  `scripts/card-gates-ui-shot.mts`。
- **修改**：`src/domain/requirement/RequirementSummary.ts`（三个可选键 + `SUMMARY_KEYS`）、
  `src/repositories/RequirementShardRepository.ts`（存在性探针）、
  `src/repositories/ShardedRequirementStore.ts`、`src/repositories/ShardedRequirementWriter.ts`、
  `src/repositories/SqliteRequirementStore.ts`、`src/client/types.ts`、`src/client/views/artifacts.ts`、
  `src/client/views/verification.ts`、`src/client/views/board.ts`，
  以及测试侧：`tests/reqboard/domain-summary.test.ts`、`tests/card-face.test.ts`、
  `tests/reqboard/store-contract.test.ts`、`tests/state-payload-client.test.ts`、
  `tests/support/legacy-store-projection.ts`、`tests/application/harness.ts`。
- **删除**：`src/client/views/artifacts.ts` 的 `computeGateStatuses`（客户端不再有门判定）；
  卡面派生行的「产物 N/M」与「N 门待确认」两段旧文案。

## 批次与依赖

| 批 | 卡 | 依赖 |
|---|---|---|
| 1 | t1 domain 纯判定 | — |
| 2 | t2 摘要契约与装配单点 | t1 |
| 3 | t3 分片读侧接线 | t2 |
| 3 | t4 SQLite 与测试辅助接线 | t2 |
| 3 | t6 卡面渲染改造（客户端只渲染） | t2 |
| 4 | t5 四实现同形 + 载荷上界断言 | t3, t4 |
| 4 | t7 跨缝用例（改动前必红） | t6 |
| 4 | t8 读放大用例（桩计数） | t3 |
| 4 | t9 E2E 出图脚本 + 证据 | t6 |
| 5 | t10 兼容与回滚收口 | t5, t6, t9 |

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 新建 domain 门判定纯函数并补单测 | FR-1, FR-3, FR-5 | S-1 + src/domain/artifact/GateReadings.ts（新增）、tests/gate-readings.test.ts（新增） | — | D-2 | implement | backend | — | S | `pnpm vitest run tests/gate-readings.test.ts` 全绿：`gateReadingsOf` 三态齐全、design 多份有一份未落章即 `pending` 且 `count` 为份数、空 artifacts 全 `missing`；`planStateOf` 三态与 `undefined`；`archivePreparedOf` 两态（归档记录 ∨ 归档产物） | dev,review |
| t2 | （落库后回填） | 摘要补三个有界键并把装配收成单点 | FR-2, FR-6 | S-2 + src/domain/requirement/RequirementSummary.ts、src/shared/board-summary.ts（新增）、tests/reqboard/domain-summary.test.ts | — | D-2, D-6 | implement | backend | t1 | M | `pnpm vitest run tests/reqboard/domain-summary.test.ts` 全绿：键集恰好等于 `SUMMARY_KEYS`（三个新键在册）；`artifacts === undefined` ⇒ 出口**无** `gates`/`archivePrepared` 键（不是 `[]`、不是 `missing`）；`BIG_FIELD_KEYS` 一个都不出现 | dev,review |
| t3 | （落库后回填） | 分片读侧接线（含存在性探针） | FR-2, FR-6 | S-3 + src/repositories/ShardedRequirementStore.ts、src/repositories/ShardedRequirementWriter.ts、src/repositories/RequirementShardRepository.ts | — | D-2, D-6 | implement | backend | t2 | M | `pnpm vitest run tests/reqboard/store-contract.test.ts` 中分片实现的读套件全绿；索引构建后 `listSummaries()` 的 `gates` 与台账一致；登记/落章后读数即时刷新且**不新增** `readObject` 调用（写侧已有整条记录）；对象读失败 ⇒ 不下发读数 + `onWarn`，需求仍在索引里 | dev,review |
| t4 | （落库后回填） | SQLite 与两条测试辅助接线 | FR-2, FR-7 | S-4 + src/repositories/SqliteRequirementStore.ts、tests/support/legacy-store-projection.ts、tests/application/harness.ts | — | D-2 | implement | backend | t2 | S | `pnpm vitest run tests/reqboard/store-contract.test.ts tests/state-payload-client.test.ts` 全绿；SQLite 摘要带读数**且** `readObject` 调用增量为 0（`lightRecordOfRow` 已注入 parts）；假投影与 InMemory 的 `summarize(` 直出全部改走 `boardSummaryOf` | dev,review |
| t5 | （落库后回填） | 四实现同形与载荷上界断言 | FR-7 | S-5 + tests/reqboard/store-contract.test.ts、tests/state-payload-client.test.ts | — | D-2 | test | backend | t3, t4 | S | 读套件加同形断言：InMemory / 分片 / SQLite / 假 SQL 只读四条实现对含多份 design 产物的同一需求给出逐字段相等的 `gates`/`planState`/`archivePrepared`（人为让一条实现漏装配 ⇒ 必红）；载荷断言 `gates.length ≤ 5` 且与 `BIG_FIELD_KEYS` 无交集 | dev,review |
| t6 | （落库后回填） | 卡面渲染改为只读读数（删客户端判定） | FR-1, FR-3, FR-4, FR-5, FR-6 | S-6 + src/client/views/artifacts.ts、src/client/views/verification.ts、src/client/views/board.ts、src/client/types.ts、tests/card-face.test.ts | prototypes/card-gates.html#FR-1、prototypes/card-gates.html#FR-3、prototypes/card-gates.html#FR-4、prototypes/card-gates.html#FR-5、prototypes/card-gates.html#FR-6 | D-1, D-3, D-4, D-5, D-6 | ui | frontend | t2 | L | `pnpm vitest run tests/card-face.test.ts` 全绿：三态 chip 文案逐字对齐原型；派生行只出 `门 c/total`（不再有 `产物 N/M` 与「N 门待确认」）；`currentGateKind` 为 `pending` 才渲染确认按钮（design 文案带 `count`）；`planState`/`archivePrepared` 缺省时不渲染对应 chip；`grep -c computeGateStatuses src/client` 为 0 | dev,review |
| t7 | （落库后回填） | 跨缝用例：只喂摘要字段的渲染断言 | FR-1, FR-3, FR-6, FR-7 | TC-3 + tests/card-face-summary-shape.test.ts（新增） | prototypes/card-gates.html#FR-1、prototypes/card-gates.html#FR-3 | D-6 | test | frontend | t6 | S | `pnpm vitest run tests/card-face-summary-shape.test.ts` 全绿：四门全落章 ⇒ `✓需求文档 ✓设计文档 ✓拆分计划 ✗验收材料` + `门 3/4`；无读数 ⇒ chips/派生行/按钮整块不在 HTML 且**不出现** `✗` 与 `产物 0/6`；改动前必红已用 `git stash` 取证（取证输出入证据） | dev,review |
| t8 | （落库后回填） | 读放大上界用例（桩计数） | FR-2, FR-7 | TC-4 + tests/state-no-bigfield-read.test.ts（新增） | — | D-2 | test | backend | t3 | S | `pnpm vitest run tests/state-no-bigfield-read.test.ts` 全绿：预热 1 次后连续 3 次 `/state`，对 artifacts/plan/verification/archive 四件对象的读取增量 = 0；索引重建（`onLedgerReplaced`）后增量 = 1 次/条（不断言为 0，如实计） | dev,review |
| t9 | （落库后回填） | E2E 出图脚本与三态证据 | FR-7 | TC-13 + scripts/card-gates-ui-shot.mts（新增）、docs/requirements/REQ-261006175040-12d4/evidence/ | prototypes/card-gates.html#FR-1 | D-4 | test | frontend | t6 | M | `npx tsx scripts/card-gates-ui-shot.mts` 退出码 0（0 成功 / 1 有图不像话 / 2 环境不可用，不静默跳过）；PNG 落 evidence/ 且覆盖三态卡面 + 降级态；人看与 `prototypes/card-gates.html` 逐区块一致（锚点 5/5） | dev,review |
| t10 | （落库后回填） | 兼容与回滚收口 | FR-6, FR-7 | S-7 + docs/requirements/REQ-261006175040-12d4/evidence/compat-rollback.md（新增） | — | D-6 | test | backend | t5, t6, t9 | M | ① 模拟旧服务端（摘要无读数键）⇒ 卡面不出现 `✗`、`产物 0/6`、`门 0/N`，其余卡面照旧；② `pnpm build:client` 输出 `[verify-client] OK`；③ `pnpm typecheck` 退出码 0 且 `pnpm baseline:check` 失败用例集合差为空；④ 回滚演练：`git stash` 客户端改动后重建仍可启动看板（旧行为复现），证据入 compat-rollback.md | dev,review |

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | — | artifacts.ts（chip 渲染） | TC-2, TC-3 | t1, t6, t7 | ✅ |
| FR-2 | I-1（/state 契约） | board-summary.ts + 四实现 | TC-1, TC-4, TC-6 | t2, t3, t4, t5, t8 | ✅ |
| FR-3 | — | artifacts.ts（派生行） | TC-2, TC-3 | t1, t6, t7 | ✅ |
| FR-4 | POST /req/artifact/confirm（不改） | artifacts.ts（确认按钮） | TC-2 | t6 | ✅ |
| FR-5 | — | artifacts/verification/board.ts | TC-2 | t1, t6 | ✅ |
| FR-6 | I-2 / I-5（缺省语义） | 四实现 + 卡面降级 | TC-1, TC-3 | t2, t3, t6, t7, t10 | ✅ |
| FR-7 | — | 全部（防漂移网） | TC-3, TC-4, TC-5, TC-6, TC-13 | t4, t5, t7, t8, t9, t10 | ✅ |
| **合计** | 1 接口 | 8 模块/视图 | 6 类用例（T-1~T-14） | **7/7 条款有主** | ✅ |

## 容量自查（口径 = `domain/limits.ts`，容量 16 DU）

| 卡 | files | anchors | chars | detailUnits |
|---|---|---|---|---|
| t1 | 2 | 6 | 1200 | 5.60 |
| t2 | 3 | 7 | 1800 | 7.40 |
| t3 | 3 | 5 | 1600 | 6.30 |
| t4 | 3 | 4 | 1400 | 5.70 |
| t5 | 2 | 6 | 1500 | 5.75 |
| t6 | 5 | 9 | 2600 | 10.80 |
| t7 | 1 | 5 | 900 | 3.95 |
| t8 | 1 | 4 | 900 | 3.45 |
| t9 | 3 | 4 | 1500 | 5.75 |
| t10 | 3 | 6 | 1800 | 6.90 |

**无超容量卡**（全部 ≤ 16 DU），故计划文档不需要「⚠️超容量(建议N批)」标记。

## 边界（本阶段不做什么）

- 不写实现代码：本文件只定粒度、依赖与验收锚点。
- 不改设计与需求文档：实施中发现设计矛盾 ⇒ 退回设计改设计 + 重新提交并批准本计划，不在实施里私改。
- 不新增对外端点：门读数随既有 `/state` 摘要下发（T-7 断言首屏仍只打一个请求）。
- 不做配色调整（对比度那条另立项）、不做详情页取数改造。
