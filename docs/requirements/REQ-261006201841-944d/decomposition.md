# 拆分计划（REQ-261006201841-944d 归档校验与知识层覆盖度加固）

> 状态：decomposing · 窗口 session-95c36a7d · 2026-10-06
> 依据：`requirement.md`（8 FR）· `design/architecture.md`（接线表 + 落地顺序 A/B/C/D）· `design/interfaces.md`（I-1～I-9 契约）· `design/test-cases.md`（TC-01～TC-56）
> 容量口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 **16 DU**（权重只在 `src/domain/limits.ts` 定义）

## 1. 代码层面变更盘点 `serves: FR-1`

### 1.1 新增（7 个文件）

| 文件 | 职责 |
|---|---|
| `src/application/internal/archive-targets.ts` | 闸 1/闸 2 的事实判定（存在 / 非空 / 锚点可达 + 根来源回执） |
| `src/domain/requirement/archive-manifest.ts` | `renderArchiveManifest` 纯渲染器（archive.md 文本） |
| `src/domain/knowledge/invalidation.ts` | `isDecidableInvalidation` 纯判定（失效条件可判定性） |
| `scripts/archive-ledger-audit.mts` | FR-8 存量归档只读核对（报告脚本） |
| `docs/knowledge/archive-coverage.baseline.txt` | K13 基线（冷侧 23 条已交材料 → 缺口 6） |
| `docs/knowledge/unverifiable.baseline.txt` | K14 基线（按锚点定义实测 60 条） |
| `docs/requirements/REQ-261006201841-944d/archive-reconcile-report.md` | FR-8 的只读核对报告产物 |

### 1.2 修改（精确到函数/段落）

| 文件 | 精确到函数/行段 |
|---|---|
| `src/shared/protocol.ts` | `assertArchiveMaterials`：增 `path#anchor` 形态判定 + `manualUpdates[].path` 白名单判定（仍零 IO） |
| `src/application/use-cases/SubmitArchive.ts` | 增根校正 → 闸 1/闸 2 → 渲染 `archive.md` 写盘 → 补登清单 → 对账 → 沉淀 → 写台账的新次序 |
| `src/application/use-cases/DepositKnowledge.ts` | 失效条件由 pointer / req id 派生（不再写死模板句） |
| `src/adapters/KnowledgeRepository.ts` | INDEX 条目行按可判定性排序（可判定在前、unverifiable 沉底） |
| `src/domain/knowledge/operations.ts` | `EXCLUDED` 增 `archive-ledger-audit.mts`（理由必填） |
| `scripts/kb-probe.mts` | 增 K13 / K14 两项检查 + `--refresh-coverage` / `--refresh-unverifiable` |
| `src/http/routers/stages.ts` | `/state` payload 增 `origins`（服务端派生三态 + `root`） |
| `src/client/types.ts` | `BoardState.origins` 可选字段 |
| `src/client/views/board.ts` | `renderArchivedBar(cards, limit, origins)` 三态渲染 |
| `src/client/styles/base.ts` | 三态选择器（新增 ≤4 条，仅既有令牌） |
| `src/client/board-mount.ts` | 1 处下传 `state.origins` |
| `src/client/views/stage-detail.ts` | 1 处**可选**入参：详情「在别处」提示块 |
| `src/client/views/report-tabs.ts` | 1 处**可选**入参：新壳 head 段同一提示块 |

### 1.3 既有测试的契约升级（不是放宽门禁）

7 个用旧形态 `manual_updates`（自由文本 `section`、`path` 无锚点）的文件必须同步升级：
`tests/acceptance-archive.test.ts`、`tests/archive-compat.test.ts`、`tests/archive-reconcile-e2e.test.ts`、
`tests/archive-reconcile.test.ts`、`tests/artifact-gates.test.ts`、`tests/kb-archive-deposit.test.ts`、
`tests/output-contract.test.ts`——把目标文档**真 stub 出来**并把锚点写进 `path`，**不放宽任何判据**。

### 1.4 删除

**零删除**。`ManualUpdate.section` 降为废弃可选字段（保留类型与读侧渲染，删了会让历史
`archive.json` 反序列化丢信息）；错误码零新增、零删除。

### 1.5 数据与迁移

**零 schema 变更、零迁移**：台账停 v10；新增全是派生类型与推送视图。回滚 = 各面独立停用
（闸面恢复前缀判定 / 渲染面停渲染 / 读数面删两项检查与基线 / 派生面客户端忽略新字段）。

## 2. 批次与依赖 `serves: FR-1, FR-3, FR-7`

```
批次 1（契约面，互不依赖，可并行）
  t1 形态契约（shared）        t5 可判定性纯判定 + 沉淀派生
        │                            │
批次 2（事实面）                      │
  t2 闸 1/闸 2（use-case 接线）       │
        │                            │
批次 3（产物面 / 读数面）             │
  t3 渲染器 ──▶ t4 写盘与清单补登     ├──▶ t6 K13/K14 + 基线
                                     └──▶ t7 INDEX 降权排序
批次 4（呈现面 / 核对面）
  t8 /state origins ──▶ t9 客户端三态 + 接线
  t10 FR-8 只读核对脚本（依赖 t2 的锚点口径）
批次 5（回归与证据）
  t11 既有用例契约升级 ──▶ t12 反向演练组 + 集合差比对 + 报告落盘
```

依赖纪律：被依赖者先定义，无前向引用；同批 `depends_on` 用本表 key 引用。

## 3. 任务表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 计划 key | 任务 | 端侧 · phase | 依赖 | 覆盖条款 | 原型锚点 | 关联 D-x | 验收标准（命令 + 判据） | 工作量 footprint / DU |
|---|---|---|---|---|---|---|---|---|
| t1 | 归档材料形态契约：`path#anchor` + 白名单 | backend · implement | — | FR-2 | — | D-4 | `npx vitest run tests/archive-materials-shape.test.ts` 全绿；无 `#` / 多 `#` / 白名单外三种形态被拒，消息含「路径#锚点」形态说明与白名单前缀清单 | 5 / 6 / 1600 → 8.8 |
| t2 | 闸 1/闸 2 事实判定与 `SubmitArchive` 接线 | backend · implement | t1 | FR-1, FR-2 | — | D-4, D-6 | `npx vitest run tests/archive-targets-gate.test.ts` 全绿；不存在路径被拒且消息含 **路径 + 生效根 + by** 三要素；0 字节与不存在两种原因可区分；跨项目记录对当前工作区零访问 | 8 / 8 / 2000 → 13.0 |
| t3 | `renderArchiveManifest` 纯渲染器 | backend · implement | t2 | FR-5, FR-6 | — | D-2 | `npx vitest run tests/archive-manifest-render.test.ts` 全绿；六个分节齐；机器产物一行一类且产量等于 `matchArchiveExemption` 分类；queue 摘要五项对得上；坏 JSON 不抛错；同输入逐字节相同 | 4 / 8 / 2000 → 9.0 |
| t4 | `archive.md` 写盘、幂等与清单补登 | backend · implement | t3 | FR-5, FR-6 | — | D-2 | `npx vitest run tests/archive-manifest-write.test.ts` 全绿；二次提交 `written=false` 且盘上内容逐字节不变；`archive.md` 进「已列」不触发未列闸门；写失败时台账零写入 | 3 / 6 / 1800 → 6.9 |
| t5 | 失效条件可判定性 + 沉淀侧派生 | backend · implement | — | FR-4 | — | — | `npx vitest run tests/kb-invalidation.test.ts` 全绿；模板句判 false、含锚点判 true；真实条目不可判定数 = 60（如实记录口径）；新沉淀条目判 true | 5 / 6 / 1600 → 8.8 |
| t6 | 知识层 K13 / K14 两项读数 + 两份基线 | backend · implement | t5 | FR-3, FR-4 | — | D-1, D-5 | `npx vitest run tests/kb-coverage-probe.test.ts` + `npx tsx scripts/kb-probe.mts --json`；缺口点名需求 id；台账不可达输出「读数不可得、不判」；冷/热口径不变；刷新幂等 | 6 / 8 / 2200 → 11.1 |
| t7 | INDEX 降权排序（零字符增量） | backend · implement | t5 | FR-4 | — | D-1 | `npx vitest run tests/kb-index-rank.test.ts` 全绿；可判定条目行序在前；INDEX 字符数不增；索引行文法不变（K2 绿） | 3 / 6 / 1600 → 6.8 |
| t8 | `/state` 派生 `origins` 三态 | backend · implement | — | FR-7 | — | D-4, D-6 | `npx vitest run tests/board-archived-origins.test.ts` 全绿；local / elsewhere / unknown 三态与 `root` 键齐；只算本页；无新增路径字符串比较 | 6 / 6 / 1800 → 9.9 |
| t9 | 归档条三态渲染 + 详情提示块接线 | frontend · ui | t8 | FR-7 | `prototypes/archive-source-label.html#FR-7` | D-2, D-4, D-6 | `npx vitest run tests/board-archived-origins.test.ts` 全绿；三态文本与 `data-src` 齐；缺 `origins` 逐字降级；详情提示块不传新参时输出逐字节不变 | 7 / 8 / 2400 → 12.2 |
| t10 | 存量归档只读核对脚本 + 报告 | backend · implement | t2 | FR-8 | — | D-3, D-5, D-6 | `npx vitest run tests/archive-ledger-audit.test.ts` + `npx tsx scripts/archive-ledger-audit.mts --json`；读数 2 / 22 / 14 / 1 / 3 / 15 逐条对得上；台账树 sha256 未变；台账不可达退出码 2 | 6 / 8 / 2400 → 11.2 |
| t11 | 既有用例契约升级（7 个旧形态文件） | fullstack · test | t2, t4, t5 | FR-1, FR-2, FR-5 | — | D-4 | 7 个文件全绿；**无放宽判据痕迹**（无新增 skip/todo、无删既有 expect）；旧形态读侧仍可渲染出 `section` 文本 | 10 / 6 / 2000 → 14.0 |
| t12 | 反向演练组 + 改动前后集合差 + 报告落盘 | fullstack · test | t10, t11 | FR-1, FR-3, FR-8 | — | D-3, D-5 | `npx tsx scripts/reverse-drill-matrix.mts --group archive` 三组全过；RV-1 被拒且源码逐字节还原、RV-2 删 K13 分支时指定用例变红、RV-3 读数与 sha256 对得上；改动前后失败集合差为空；`pnpm kb:check` 零新增红 | 4 / 8 / 2200 → 9.1 |

无超容量卡（全部 DU < 16 容量），故计划文档不含 `⚠️超容量` 标记。

### 3.1 UI 卡的原型锚点与裁定 `serves: FR-7`

| 计划 key | 原型锚点（protoRefs） | 关联裁定（decisionRefs） |
|---|---|---|
| t9 | `prototypes/archive-source-label.html#FR-7` | D-2（呈现层折叠不搬迁）、D-4（按项目身份定位）、D-6（归属未知不冒充本仓） |
| t1 / t2 | — | D-4（跨项目按 `projectId`/`workspaceRoot` 定位） |
| t3 / t4 | — | D-2（机器产物只做呈现层折叠） |
| t6 / t7 | — | D-1（K13 编号；既有 K12 一字不改） |
| t10 / t12 | — | D-3（只报告不追溯）、D-5（22/14 双读数）、D-6（归属未知） |

原型引用指向 `prototypes/INDEX.md` 的权威路径（`archive-source-label.html`），不指向任何 superseded 版本。

## 4. 每卡验收口径总览 `serves: FR-1, FR-2`

**全部可跑、无空话**（逐卡 command + 判据写在任务卡 acceptance 里）：

- 闸 1/闸 2：`npx vitest run tests/archive-targets-gate.test.ts tests/archive-materials-shape.test.ts`
- 渲染物：`npx vitest run tests/archive-manifest-render.test.ts tests/archive-manifest-write.test.ts`
- 知识层：`npx vitest run tests/kb-invalidation.test.ts tests/kb-coverage-probe.test.ts` + `npx tsx scripts/kb-probe.mts --json`
- 看板：`npx vitest run tests/board-archived-origins.test.ts`
- 核对脚本：`npx vitest run tests/archive-ledger-audit.test.ts` + `npx tsx scripts/archive-ledger-audit.mts --json`
- 反向演练：`npx tsx scripts/reverse-drill-matrix.mts --group archive`
- 回归：改动前后两次自采失败集合差为空（`npx vitest run --reporter=json` 前后两跑）+ `pnpm kb:check`、
  `npx tsx scripts/req-doc-validate.mts --req REQ-261006201841-944d`

## 5. 边界校验 `serves: FR-1`

- 每张卡**可被独立验收**：一个新窗口零会话历史、只凭任务卡 + 设计文档即可开工（卡内含文件、步骤、命令）。
- 本阶段**不二次创作设计**：与设计矛盾时退回设计改计划，不在拆分阶段私改设计。
- 红线自查面：diff 文件集合 ⊆ 本计划 1.1/1.2/1.3 清单；不碰验收标准、原型门、测试基线文件
  （`docs/reviews/test-baseline.*` 一字不改）。
