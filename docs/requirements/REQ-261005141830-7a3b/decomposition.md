---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 拆分计划（REQ-261005141830-7a3b）

> 需求源：`requirement.md`（FR-1~FR-11）；设计源：`design/`（architecture / data-model / interfaces /
> use-cases / test-cases / backend）。计划语言：**业务标题 + 技术细节下沉**；每卡可被新窗口零上下文接手。

## 目标与做法（一段人能读懂的话）

**目标**：多窗口分别在不同项目并行时不再串——判定与定位一律从项目 id（DSH 宿主 `workspace.id`）起步，
路径降为定位与兜底。

**做法**：补一层项目身份映射 `session → projectId → workspaceRoot`（根挂在项目上），
把「这条记录声明的根是多少」这一处判断换成"由 `projectId` 带出"；
**既有 27 处根解析调用点一行不改**（读侧 `applyRequirementWorkspaceRoot` 12 处、写侧
`ensureWritableProjectRoot` / `assertWritableRequirementProject` 15 处，它们早已收敛在同一入口）。

## 一、代码改动盘点

**新增 4 个文件**

| 文件 | 内容 |
|---|---|
| `src/application/internal/project-identity.ts` | 纯函数 `projectIdOfWindow` / `rootOfProject` / `sameProjectOf`（全仓唯一判据） |
| `src/adapters/WorkspaceRegistryProjectPort.ts` | `workspaceRegistry.list()` 的唯一 I/O 实现（数字 id 归一、坏条目跳过、抛错吞掉） |
| `tests/project-identity.test.ts` | 单测（T-01~T-21） |
| `tests/project-identity.e2e.test.ts` | 三窗口端到端（E-01~E-04） |

**修改 18 个文件**（按层）

| 层 | 文件 | 改动 |
|---|---|---|
| 契约 | `src/shared/protocol.ts` | `RequirementRecord.projectId?`（可选） |
| 契约 | `src/application/ports.ts` | `ProjectRegistryPort` / `ProjectEntry` 声明 |
| 摘要 | `src/domain/requirement/RequirementSummary.ts` | `SUMMARY_KEYS` 加 `projectId`；`factsOf`/`summarize` 转出 |
| 用例 | `src/application/use-cases/CreateRequirement.ts` / `CaptureRequirement.ts` | 立项写 `projectId`；未归属写评论标注 |
| 用例 | `src/application/use-cases/BindSeat.ts` / `HandoffOwner.ts` | 两侧 `projectId` 校验 → `REQBOARD_CROSS_PROJECT_SEAT` |
| 用例 | `src/application/use-cases/ExecuteTask.ts` | 子代理 prompt 根 / 凭证根改取需求项目的根 |
| 内部 | `src/application/internal/support.ts` | 新增 `rootOf`；四个根解析入口改读它（语义加性） |
| 内部 | `src/application/internal/knowledge-bootstrap.ts` | 自举去重键换 `projectId`（无 id 回路径） |
| 驱动 | `src/application/dive/session-driver.ts` / `round-driver.ts` | idle 拍归属比 `projectId`；起轮仍按席位/窗口 |
| 仓储 | `src/repositories/ShardedRequirementWriter.ts` / `SqliteRequirementWriter.ts` | 落 `project_id` |
| 仓储 | `src/repositories/sqliteRows.ts` / `sqliteSchema.ts` | 列映射 + 建表列 + 幂等 `ALTER TABLE ADD COLUMN` |
| 仓储 | `src/repositories/ShardedRequirementStore.ts` / `SqliteRequirementStore.ts` | `filter.projectId` 过滤分支 |
| 适配器 | `src/adapters/ArtifactSync.ts` | `partitionByProject` 分区键换 `projectId`（保留 `others`/`unattributed` 桶） |
| 适配器 | `src/adapters/SessionWindowOpener.ts` | `sessionIds → id` 解析抽成共用实现并复用 |
| 组合根 | `src/index.ts` | 装配 `ProjectRegistryProjectPort`；`sessionWorkspace` 扩成 `sessionProject` |
| 路由 | `src/http/routers/shared.ts` / `requirements.ts` | 读根解析改用 `sessionProject`；响应加 `projectSource` |

**删除**：无（本需求全部为加性或语义收窄，不删符号、不删字段、不删接口）。

**明确不改**：`src/client/**`（sides=[backend]）；`REQBOARD_SCHEMA_VERSION`（保持 9）；
共享单例 `docs`/`queueRepo` 的实例模型（不改成 per-window 实例）。

## 二、容量自查（口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 16 DU）

| 卡 | files | anchors | chars | detailUnits | 判定 |
|---|---|---|---|---|---|
| t1 身份底座 | 5 | 7 | 1100 | 9.05 | 不超 |
| t2 数据契约 | 9 | 4 | 1400 | 11.7 | 不超 |
| t3 根解析换源 | 2 | 5 | 1000 | 5.5 | 不超 |
| t4 立项定身份 | 3 | 4 | 900 | 5.45 | 不超 |
| t5 看板/扫描/知识层 | 7 | 5 | 1600 | 10.3 | 不超 |
| t6 Dive 归属 + 派席 | 5 | 7 | 1500 | 9.25 | 不超 |
| t7 可观测与文档 | 4 | 3 | 1200 | 6.1 | 不超 |
| t8 迁移与兼容 | 4 | 4 | 900 | 6.45 | 不超 |
| t9 E2E 与判别力自证 | 2 | 8 | 1000 | 7.0 | 不超 |

结论：**9 张卡全部 ≤ 16 DU，无需超容量标记**。

## 三、任务表

| key | 标题 | phase | side | depends_on | implementation（改哪些文件/步骤） | acceptance（跑什么 → 看到什么算过） |
|---|---|---|---|---|---|---|
| t1 | 立项目身份底座：注册表端口 + 三个纯函数 | implement | backend | — | 新增 `src/application/internal/project-identity.ts`（`projectIdOfWindow` / `rootOfProject` / `sameProjectOf` + `SameProjectVerdict`）；`src/application/ports.ts` 加 `ProjectRegistryPort` / `ProjectEntry`；新增 `src/adapters/WorkspaceRegistryProjectPort.ts`（命中/未装配/坏条目三态）；把 `src/adapters/SessionWindowOpener.ts` 的 `sessionIds → workspace.id` 解析抽成共用实现 | `npx vitest run tests/project-identity.test.ts -t T-01`（两会话各解出各自 id）→ 绿；`-t T-02`（未装配/抛错/未命中 → `undefined` 且不抛）→ 绿；`-t T-03`~`-t T-07`（同 id 异路径=同项目 / 异 id 同形路径=不同项目 / 缺 id 走兜底且 `attributed=false` / 两侧缺不猜 / `id→path`）→ 全绿 |
| t2 | 数据契约：`projectId` 字段、摘要投影、落库列与查询过滤 | implement | backend | — | `src/shared/protocol.ts` 加可选 `projectId`；`src/domain/requirement/RequirementSummary.ts` 的 `SUMMARY_KEYS` 加 `'projectId'` 并在 `factsOf`/`summarize` 转出；`src/repositories/ShardedRequirementWriter.ts` 与 `src/repositories/SqliteRequirementWriter.ts` 落 `project_id`；`src/repositories/sqliteRows.ts` 加列映射；`src/repositories/sqliteSchema.ts` 加列；`src/repositories/ShardedRequirementStore.ts` 与 `src/repositories/SqliteRequirementStore.ts` 加 `filter.projectId` 分支 | `npx vitest run tests/project-identity.test.ts -t T-08`（记录与摘要都带 `projectId`）→ 绿；`-t T-10`（同项目 3 条 / 另一项目 0 条）→ 绿；`-t T-16`（老库加列、旧行读 `undefined`、不丢数据）→ 绿；`pnpm typecheck` → 改动文件零新增错误 |
| t3 | 根解析换源：读写两侧由项目 id 带出根 | implement | backend | t1, t2 | `src/application/internal/support.ts` 新增内部 `rootOf(record, deps)`（有 `projectId` → 项目条目 `path`；否则回落 `workspaceRoot`，带 `attributed`/`by`）；`applyRequirementWorkspaceRoot`（12 处调用）、`syncWorkspaceRootForRequirement`、`ensureWritableProjectRoot`、`assertWritableRequirementProject`（15 处调用）改读它；**判定顺序与两个拒绝码逐字不变** | `npx vitest run tests/project-identity.test.ts -t T-13`（取根走项目条目、不读共享单例当前值）→ 绿；`-t T-14`（存量回落并标注）→ 绿；`-t T-15`（两者都缺 → 结构化失败码）→ 绿；`npx vitest run tests/design-gate-workspace-root.test.ts` → 零新增失败 |
| t4 | 立项定身份：写入 `projectId` 与未归属标注 | implement | backend | t1, t2 | `src/application/use-cases/CreateRequirement.ts` 与 `src/application/use-cases/CaptureRequirement.ts` 取窗口 `projectId` 写入记录；未命中则**不写**该键并在立项评论标注"未归属项目（按路径兜底）"；回执加 `projectId` / `projectSource` | `-t T-08` → 绿；`-t T-09`（无归属窗口不写 id 且评论含"未归属"）→ 绿；`-t T-11`（同项目另一窗口立项不被"本项目已有需求"拒）→ 绿；`-t T-12`（推进 1 条不动另 2 条）→ 绿 |
| t5 | 看板 / 扫描 / 知识层 / 子代理根一律按项目 | implement | backend | t2, t3 | `src/index.ts` 装配端口并把 `sessionWorkspace` 扩成 `sessionProject`（保留旧字段）；`src/http/routers/shared.ts` 与 `src/http/routers/requirements.ts` 读根解析改用 `sessionProject` 并加 `projectSource`；`src/adapters/ArtifactSync.ts` 分区键换 `projectId`（保留 `others`/`unattributed` 桶）；`src/application/internal/knowledge-bootstrap.ts` 去重键换 `projectId`；`src/application/use-cases/ExecuteTask.ts` 的 prompt 根与凭证根改取需求项目的根 | `-t T-10` → 绿；`npx vitest run tests/project-scope.test.ts` → 零新增失败（别人项目记录不被污染、写盘点名单同步）；`npx vitest run tests/project-identity.e2e.test.ts -t E-01`（三窗口互不越界）与 `-t E-02`（写入期间邻居改走单例根仍落本项目）→ 绿 |
| t6 | Dive 归属按项目、派席与交接拦跨项目 | implement | backend | t1, t2 | `src/application/dive/session-driver.ts`（与 `src/application/dive/round-driver.ts` 取需求处）在 idle 拍解析窗口 `projectId` 并比对归属，**起轮仍按席位 / `sourceSessionId`**；`src/application/use-cases/BindSeat.ts` 与 `src/application/use-cases/HandoffOwner.ts` 加两侧 `projectId` 校验并抛 `REQBOARD_CROSS_PROJECT_SEAT`（文案给两个 id 与各自根）；`remove=true` 不校验 | `-t T-17`（归属不等 → 零投递 + 留痕）→ 绿；`-t T-18`~`-t T-21`（跨项目派席/交接被拒且台账零改动、同项目异 session 成功、解绑不校验）→ 全绿；`-t E-03`（同项目双窗口起轮只 1 次）与 `-t E-04`（HTTP 返回跨项目码）→ 绿 |
| t7 | 判据可观测与项目文档更新 | doc | doc | t3, t4, t5, t6 | `src/application/internal/support.ts` 增判据来源（`project-id` / `path-fallback`）的统一构造，供各回执/评论/日志引用；跨项目命中与未归属的文案统一；更新 `docs/architecture/project-manual.md` 与 `docs/architecture/gate-read-root.md` 的根解析口径（项目 id 优先、路径兜底） | 触发一次跨项目拒绝 → 回执或评论含两侧 `projectId` 与判据来源；`pnpm kb:check` → 退出码 0（生成物零漂移 + 九项自检 + 覆盖度全过），若既有缺口则如实点名 |
| t8 | 迁移与兼容：存量记录与老 SQLite 库 | implement | backend | t2 | `src/repositories/sqliteSchema.ts` 加幂等 `ALTER TABLE … ADD COLUMN project_id`（同名列已存在即跳过）；`src/application/internal/support.ts` 的存量回落分支补 `attributed=false` 标注；新增 `docs/requirements/REQ-261005141830-7a3b/notes/rollback.md` 写回滚路径（去掉端口装配即回原行为） | `-t T-14` / `-t T-15` / `-t T-16` → 全绿；台账分布命令（`~/.dsh/reqboard/**/record.json`）仍列出存量记录且均可读写、未归属标注在场 |
| t9 | 三窗口端到端回归与判别力自证 | test | backend | t3, t4, t5, t6 | 新增 `tests/project-identity.e2e.test.ts`（真实 HTTP + 台账 + 假注册表：窗口 x/y 同项目 + 窗口 z 另一项目）；补"停用即红"证据：逐一停用 `rootOf` 的 id 分支、`sameProjectOf` 的 id 优先分支、看板过滤、Dive 归属比较、派席校验、立项写 id，各自对应用例必须变红并记录命令与红/绿摘要 | `npx vitest run tests/project-identity.e2e.test.ts` → E-01~E-04 全绿；`pnpm test` → 失败数 ≤ HEAD 基线；六条停用证据各有一份可复核输出 |

## 四、覆盖对照表（FR ↔ 计划 key）

| 需求条款 | 条款要点 | 接收任务 |
|---|---|---|
| FR-1 | 立项即定身份：写入 `projectId` | t2, t4 |
| FR-2 | 会话→项目 id 解析端口（不猜、不编） | t1, t4 |
| FR-3 | 项目 id → `workspaceRoot`（身份带出根） | t1, t3, t5 |
| FR-4 | 同一项目判据单点收敛（id 优先 / 路径兜底） | t1, t6 |
| FR-5 | 写侧按项目根校正共享根（fail-closed 不变） | t3 |
| FR-6 | 看板扫描与知识层自举按项目 id 分区 | t5 |
| FR-7 | Dive 归属按项目、起轮仍按窗口 | t6 |
| FR-8 | 存量兼容（路径兜底 + 未归属标注，不迁移） | t2, t8 |
| FR-9 | 判据可观测（回执/评论/日志说清判据） | t7, t9 |
| FR-10 | 同一项目下多条需求（按项目聚合、互不影响） | t2, t5 |
| FR-11 | 席位与换绑按项目校验（跨项目默认拒绝） | t6 |

## 五、批次与依赖（被依赖者先落，禁止前向引用）

```
第 1 批（契约先行，可并行）：t1 身份底座 ──┐
                              t2 数据契约 ──┤
第 2 批（换源与身份）：        t3 根解析换源（依赖 t1,t2）
                              t4 立项定身份（依赖 t1,t2）
                              t8 迁移与兼容（依赖 t2）
第 3 批（各判定面）：          t5 看板/扫描/知识层（依赖 t2,t3）
                              t6 Dive + 派席（依赖 t1,t2）
第 4 批（收口）：              t7 可观测与文档（依赖 t3,t4,t5,t6）
                              t9 E2E 与判别力自证（依赖 t3,t4,t5,t6）
```

## 六、边界与不做（与需求文档一致）

- 不改 DSH 宿主、不自铸项目 id（用宿主 `workspaceRegistry` 的 `id` + `path`）。
- 不做存量迁移、不升 schema 版本；无 `projectId` 一律路径兜底 + 如实标注。
- 不放宽起轮权（归属项目级、投递窗口级）；不提供跨项目派席的覆盖开关（D-9 裁定）。
- 不改客户端（sides=[backend]）；不改共享单例的实例模型。
