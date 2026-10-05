# 拆分计划：看板运行设置与可切换存储后端（REQ-261004103330-005f）

## 目标与做法

**目标**：把"运行期可调的三件事"（阶段回合上限 / 存储后端 / 系统档案）从代码搬进设置文件与看板，并让切换后端成为"装配期决策 + 人工确认 + Agent 执行 + 可回滚"的受控链路。共 17 条 FR（需求文档），7 份设计文档（design/）。

**做法**：先定契约（端口 + 纯函数 + DDL + 错误码映射），再写三个适配器（设置文件 / 系统记录 / SQLite），然后接线（装配期选后端、上限快照、挂路由），最后前端四屏 + 端到端演练。**契约定死再写实现**，每张实现卡 depends_on 契约卡。

**容量声明**：容量缺省 16 DU，`detailUnits = files×1 + anchors×0.5 + chars/2000`。下表 15 张卡**全部 ≤ 16 DU**，故**无超容量卡、无标记**。

## 改动盘点

### 新增（9 个源文件 + 8 个测试 + 1 个脚本 + 1 份笔记）

| 路径 | 归属卡 |
|---|---|
| `src/application/settings/resolve-settings.ts` | t1 |
| `src/application/settings/events.ts` | t1 |
| `src/repositories/sqliteSchema.ts` | t1 |
| `src/adapters/FileSettingsStore.ts` | t2 |
| `src/adapters/SystemRecordFile.ts` | t2 |
| `src/repositories/SqliteRequirementStore.ts` | t3 |
| `src/http/routers/settings.ts` | t8 |
| `src/client/settings-dialog.ts` | t11 |
| `src/client/styles/settings.ts` | t11 |
| `src/client/views/settings-limits.ts` | t12 |
| `src/client/views/settings-storage.ts` | t13 |
| `src/client/views/settings-records.ts` | t14 |
| `src/client/views/settings-general.ts` | t14 |
| `scripts/migrate-ledger-to-sqlite.ts` | t9 |
| `tests/reqboard/store-contract.test.ts`（改注册表） | t4 |
| `tests/reqboard/settings-file.test.ts` | t1 |
| `tests/reqboard/settings-init.test.ts` | t5 |
| `tests/reqboard/settings-router.test.ts` | t8 |
| `tests/reqboard/pending-confirm-consume.test.ts` | t7 |
| `tests/reqboard/sqlite-migrate.test.ts` | t9 |
| `tests/reqboard/settings-migrate-dispatch.test.ts` | t10 |
| `tests/reqboard/settings-e2e.test.ts` | t15 |
| `tests/client/settings-limits.test.ts` / `settings-storage.test.ts` / `settings-records.test.ts` | t12 / t13 / t14 |
| `docs/requirements/REQ-261004103330-005f/notes/baseline.md` | t15 |

### 修改（9 处）

| 路径 | 改什么 | 归属卡 |
|---|---|---|
| `src/application/ports.ts` | 新增 `SettingsStore` / `SystemRecordStore` 两个端口（`RequirementStore` 签名不动） | t1 |
| `src/http/envelope.ts` | `fail()` 的 code→status 映射补登 5 类新码（不补则全落 500） | t1 |
| `src/plugin-config.ts` | `PluginConfig` 增 `stageMaxRounds?` / `storage?` | t2 |
| `src/index.ts` | 装配期四步（读设置 → 选后端 → 初始化记录 → 挂路由）+ 上限快照安装器 | t5 / t6 |
| `src/repositories/migrationGate.ts` | 相 2 拆成 2a（`REQUIRES_SQLITE_MIGRATION`）/ 2b（既有 `REQUIRES_MIGRATION`），两套 message/hint 各自独立 | t5 |
| `src/application/dive/round-state.ts` | `roundLimitFor` 改读内存快照（**保持同步签名**） | t6 |
| `src/application/dive/stage-configs.ts` | 语义降级为"默认值表"（不再是唯一权威） | t6 |
| `src/adapters/PendingConfirmRegistry.ts` | `register()` 接 `target:'storage-action'` 且 `requirementId` 可空；新增 `consume()` | t7 |
| `src/http/routes.ts` | 挂载 settings 路由 + 注入 `windowOpener` / `crossWindowDeliver` | t8 |
| `src/client/api.ts` / `src/client/board-mount.ts` | 5 个 API 函数；页头「⚙ 设置」按钮接线（弹窗挂 `document.body`，事件不经容器委派） | t11 |

### 删除

无。本次不删除任何既有文件（`stage-configs.ts` 只降级语义，不删表）。

## 任务表

| key | 标题 | phase | side | depends_on | footprint(files/anchors/chars) | DU |
|---|---|---|---|---|---|---|
| t1 | 定契约：端口 + 设置解析纯函数 + SQLite DDL 常量 + 错误码映射 | implement | backend | — | 5 / 8 / 2400 | 10.20 |
| t2 | 设置文件与系统记录两个适配器（含自动初始化与失败降级） | implement | backend | t1 | 3 / 9 / 2600 | 8.80 |
| t3 | SQLite 适配器实现 RequirementStore 全端口 | implement | backend | t1 | 2 / 10 / 2800 | 8.40 |
| t4 | 把 SQLite 实现接入端口契约测试注册表 | test | backend | t3 | 2 / 6 / 1600 | 5.80 |
| t5 | 装配期选后端 + 系统记录初始化 + 迁移门拆两种未就绪 | implement | backend | t2, t3 | 4 / 9 / 2800 | 9.90 |
| t6 | 上限生效：同步快照 + 默认表降级 + 判定点停手 | implement | backend | t2 | 4 / 7 / 2400 | 8.70 |
| t7 | 挂起确认机制扩写：storage-action + 一次性 consume | implement | backend | t1 | 2 / 7 / 2000 | 6.50 |
| t8 | settings 路由五条（含票据 request 与消费） | implement | backend | t1, t2, t7 | 3 / 12 / 3200 | 10.60 |
| t9 | 迁移脚本八步 + 兼容与回滚 | implement | backend | t3, t5 | 3 / 10 / 3200 | 9.60 |
| t10 | 迁移开窗链路：windowOpener + crossWindowDeliver + 系统事件 | implement | backend | t8, t9 | 3 / 8 / 2400 | 8.20 |
| t11 | 设置弹窗骨架与入口（挂 body、左菜单、关闭语义、API 客户端） | ui | frontend | t8 | 4 / 8 / 2800 | 9.40 |
| t12 | 运行上限屏（表格 / 草稿态 / 校验 / 来源徽章 / 泳道上限） | ui | frontend | t11 | 3 / 9 / 2400 | 8.70 |
| t13 | 存储与数据库屏 + 确认门（四态机 / 票据 / 独立错误文案） | ui | frontend | t11, t7 | 3 / 11 / 2800 | 9.90 |
| t14 | 系统记录屏 + 通用屏（时间线 / 路径档案 / 版本核对 / 分叉红字） | ui | frontend | t11, t8 | 3 / 9 / 2400 | 8.70 |
| t15 | 端到端与反向演练 + 开工基线落盘 | test | fullstack | t5, t6, t9, t10, t12, t13, t14 | 2 / 10 / 2000 | 8.00 |

### 逐卡说明

**t1 定契约**（`requirement_refs: FR-1, FR-2, FR-3, FR-4, FR-6, FR-14, FR-15`）

- implementation：`src/application/ports.ts` 新增 `SettingsStore`（`snapshot/refresh/update/subscribe`）与 `SystemRecordStore`（`read/append/updateStores/reconcileVersion`）；新增 `src/application/settings/resolve-settings.ts` 实现四级来源合并与校验（1–10000 整数、逐项 `source` 标注）、`src/application/settings/events.ts` 定义 5 类系统事件载荷构造；新增 `src/repositories/sqliteSchema.ts` 放 DDL 与 `sqlite_schema_version=1`；改 `src/http/envelope.ts` 的 `fail()` 补登 `confirmation_required→403`、`REQBOARD_REQUIRES_SQLITE_MIGRATION→503`、`window_opener_unavailable→503`、`dispatch_failed→502`、`migration_in_progress/sqlite_not_migrated→409`。
- acceptance：`npx vitest run tests/reqboard/settings-file.test.ts` 全绿（含"设置文件>插件配置>env>默认"四态与越界/非整数被拒）；`npx tsx -e "…resolveRunSettings…"` 打印逐项 source；`npx tsc --noEmit 2>&1 | grep -c 'error TS'` ≤ 开工基线。

**t2 两个适配器**（`FR-1, FR-14, FR-17`）

- implementation：新增 `src/adapters/FileSettingsStore.ts`（临时文件 + rename 原子写、mtime 轮询刷新、损坏回落并记 `settings-invalid`）；新增 `src/adapters/SystemRecordFile.ts`（不存在即初始化、只追加、`history` 上限 500、写失败降级计数不阻断）；改 `src/plugin-config.ts` 加 `stageMaxRounds?` / `storage?`。
- acceptance：`npx vitest run tests/reqboard/settings-init.test.ts` 全绿——断言"删掉两份文件后启动 → 系统记录被自动创建且含首条 `startup`；**设置文件仍不存在**"；写失败（只读目录）→ 进程不抛、`droppedEvents` 增长。

**t3 SQLite 适配器**（`FR-7, FR-9`）

- implementation：新增 `src/repositories/SqliteRequirementStore.ts`，用 `node:sqlite` 的 `DatabaseSync` 实现 `RequirementStore` 全端口：`get/listComments/listHistory/head/create/mutate/mutateIf/appendComment/sweep/replaceAll/subscribe` + `getSummary/listSummaries/listTriages/peekSummaries/peekFacts/headAfterDrain`；写方法用 `BEGIN IMMEDIATE`；`mutateIf` 版本不符 → `REQBOARD_CONFLICT`；冷侧写 → `REQBOARD_COLD_IMMUTABLE`；schema 不符 → `REQBOARD_SQLITE_SCHEMA_MISMATCH`；DDL 复用 `src/repositories/sqliteSchema.ts`。
- acceptance：`npx vitest run tests/reqboard/store-contract.test.ts` 中 SQLite 实现的 read+write 两套件全绿；`node -e` 打开临时库跑一次 `mutate` 后 `get` 读回一致。

**t4 契约测试接入**（`FR-8, FR-9`）

- implementation：改 `tests/reqboard/store-contract.test.ts` 的 `IMPLEMENTATIONS` 注册 `SqliteRequirementStore`（`suites: ['read','write']`）；新增临时库夹具（`tests/reqboard/sqlite-harness.ts` 同级 helper）保证用例互不污染、结束即删。
- acceptance：`npx vitest run tests/reqboard/store-contract.test.ts` → 三个实现（内存 / 分片 / SQLite）同一份断言全绿，注册表自检行不再标 ⏳。

**t5 装配期选后端 + 初始化 + 迁移门**（`FR-6, FR-12, FR-17`）

- implementation：改 `src/index.ts` 装配期四步（解析 backend → `preflightLedger` 扩展 → `new` 出实现 → 初始化系统记录）；改 `src/repositories/migrationGate.ts` 把相 2 拆成 2a/2b 两套独立 message/hint；扩展 `tests/reqboard/migration-gate.test.ts`。
- acceptance：`npx vitest run tests/reqboard/migration-gate.test.ts` 全绿且断言两码的 message/hint **互不出现**；构造"已选 sqlite + 库空 + 分片非空"→ HTTP 503 且响应含 `migrate-ledger-to-sqlite` 指引。

**t6 上限生效**（`FR-2`）

- implementation：改 `src/application/dive/round-state.ts` 让 `roundLimitFor` 读模块级内存快照（**保持同步签名，不插 await**）；改 `src/application/dive/stage-configs.ts` 为默认值表；在 `src/index.ts` 装"启动加载 + PATCH 广播 + 文件变更轮询"三路刷新；扩展 `tests/dive-round-state.test.ts`。
- acceptance：`npx vitest run tests/dive-round-state.test.ts` 全绿且**保留**"未安装快照 = 默认 1000/10"这条既有断言；把 `implementing` 上限改成 3、`roundsInStage=3` → 下一回合判定停手且停手原因含"已达上限"。

**t7 挂起确认机制扩写**（`FR-11`）

- implementation：改 `src/adapters/PendingConfirmRegistry.ts`——`register()` 接受 `target:'storage-action'` 且 `requirementId` 可空；新增 `consume(ticket)`（原子校验"已落章 + 未过期 + 未消费"并置已消费，并发只成功一次）；新增 `tests/reqboard/pending-confirm-consume.test.ts`。
- acceptance：`npx vitest run tests/reqboard/pending-confirm-consume.test.ts` 全绿——同一 ticket 两次 `consume` 只第一次成功；过期 ticket 拒绝。

**t8 settings 路由**（`FR-3, FR-4, FR-12, FR-14`）

- implementation：新增 `src/http/routers/settings.ts` 实现 `GET /settings`（含 `system.paths`）、`PATCH /settings`（拒收 `storage.backend`）、`POST /settings/storage/request`（发一次性票据）、`POST /settings/storage/switch`（消费票据）、`GET /settings/system`；改 `src/http/routes.ts` 挂载并注入依赖；新增 `tests/reqboard/settings-router.test.ts`。
- acceptance：`npx vitest run tests/reqboard/settings-router.test.ts` 全绿；`curl -X PATCH …/settings -d '{"stageMaxRounds":{"implementing":0}}'` → 400 且消息含"1–10000"；不带票据打 `switch` → 403 `confirmation_required`。

**t9 迁移脚本与兼容回滚**（`FR-10, FR-13, FR-16`）

- implementation：新增 `scripts/migrate-ledger-to-sqlite.ts`（八步：预检含分叉检测 → 备份 → 重建旧库前先备份 → 建表 → 单事务迁移 → 条数与抽样校验 → 校验通过才写设置 → 退出码 0/2/3/4）；新增 `tests/reqboard/sqlite-migrate.test.ts`（含反向演练：移除回滚分支 → 用例必红）。
- acceptance：`npx vitest run tests/reqboard/sqlite-migrate.test.ts` 全绿；`--dry-run` 不改任何文件（对比 mtime 与内容哈希）；注入第 3 步失败 → 源分片与设置文件逐字节未变。

**t10 迁移开窗链路**（`FR-10, FR-11`）

- implementation：在 `src/http/routers/settings.ts` 的 migrate 分支里用 `applicationDeps.windowOpener.create({cwd|workspaceId})` + `crossWindowDeliver.createMessage/deliver` 投递底稿（**不用要求 live driver 的 `openWindow` 用例**）；失败三态 `window_opener_unavailable`/`window_open_failed`/`dispatch_failed` 如实回报且不写 `migration` 事件；新增 `tests/reqboard/settings-migrate-dispatch.test.ts`。
- acceptance：`npx vitest run tests/reqboard/settings-migrate-dispatch.test.ts` 全绿——三种失败下系统记录文件文本内**不含** `migration` 事件；成功下含窗口键。

**t11 设置弹窗骨架与入口**（`FR-5`）

- implementation：新增 `src/client/settings-dialog.ts`（挂 `document.body`、左菜单四屏切换、ESC/遮罩/✕ 关闭、键盘可达）、`src/client/styles/settings.ts`（复用 `--pm-*` 令牌与 `dsh-pm-` 前缀，**不新增第二套视觉体系**）；改 `src/client/api.ts` 加 5 个函数、改 `src/client/board-mount.ts` 接线页头按钮。
- acceptance：`npx vitest run tests/client/settings-dialog.test.ts`（或既有 client 测试）全绿；手测：点页头「⚙ 设置」弹窗出现、四屏可切、ESC 与遮罩可关、关闭后重开状态一致。

**t12 运行上限屏**（`FR-2, FR-5`）

- implementation：新增 `src/client/views/settings-limits.ts`（九行表格、草稿态 dirty map、1–10000 即时校验与保存键禁用、来源徽章、恢复默认、保存前后端往返）、追加 `src/client/styles/settings.ts`；新增 `tests/client/settings-limits.test.ts`。
- acceptance：`npx vitest run tests/client/settings-limits.test.ts` 全绿——输入 `0`/`10001`/`1.5` 均标红且保存键禁用；保存后徽章由「待保存」变「设置文件」，泳道头上限同步刷新。

**t13 存储与数据库屏 + 确认门**（`FR-6, FR-10, FR-11, FR-13`）

- implementation：新增 `src/client/views/settings-storage.ts`（后端开关、五步清单、`idle→requesting→confirm→落章→running→done/failed` 四态机、`consent` 只存内存、403/502/503/409/500 各独立文案、跳转用注入的 `jumpToWindow`）、追加样式；新增 `tests/client/settings-storage.test.ts`。
- acceptance：`npx vitest run tests/client/settings-storage.test.ts` 全绿——`consent` 不落 `localStorage`；403 后清票据且**不自动重试**；六类错误各命中独立文案；`failed` 后「重来一次」必须重新走确认。

**t14 系统记录屏 + 通用屏**（`FR-14, FR-15, FR-16, FR-17`）

- implementation：新增 `src/client/views/settings-records.ts`（后端使用史时间线、数据路径档案、版本一致性核对、分叉 stale 红字，**不提供"合并"按钮**）与 `src/client/views/settings-general.ts`（版本/构建指纹/schema/运行时；「打开配置文件」在文件不存在时禁用并说明）；新增 `tests/client/settings-records.test.ts`。
- acceptance：`npx vitest run tests/client/settings-records.test.ts` 全绿——`shards.requirements > sqlite.requirements` 时出现"库已陈旧：重启前请重跑迁移"红字；设置文件不存在时按钮禁用且提示"尚未创建"。

**t15 端到端与反向演练**（`FR-1, FR-2, FR-7, FR-10, FR-11, FR-12, FR-17`）

- implementation：新增 `tests/reqboard/settings-e2e.test.ts` 串起三条端到端（上限改到 5 → 假投递驱动到 5 即停手；确认门 → 票据 → 迁移 → 设置写入；未迁移重启 → 503 指引）+ 三条反向演练；把开工基线写进 `docs/requirements/REQ-261004103330-005f/notes/baseline.md`。
- acceptance：`npx vitest run tests/reqboard/settings-e2e.test.ts` 全绿；三条反向演练**逐条**验证"移除对应处置后该用例必红"；`npx vitest run tests/reqboard tests/application tests/http` 失败数 ≤ 基线。

## 依赖图（批次）

```
批次 1：t1（契约）
批次 2：t2、t3、t7            ← 三个适配器/机制，均只依赖 t1
批次 3：t4、t5、t6、t8        ← t4←t3；t5←t2,t3；t6←t2；t8←t1,t2,t7
批次 4：t9、t10、t11          ← t9←t3,t5；t10←t8,t9；t11←t8
批次 5：t12、t13、t14         ← 均←t11（t13 另←t7）
批次 6：t15（端到端，等全部）
```

## 风险与回滚

| 风险 | 处置（落在哪张卡） |
|---|---|
| `node:sqlite` experimental | DDL 与访问收敛在 `sqliteSchema.ts`（t1/t3） |
| 同步热路径不能 await | 快照 + 安装器，绝不改签名（t6） |
| 共享单例根被别的窗口改 | 设置/记录走 `dshHome` 绝对路径、构造期定型（t2/t5） |
| 迁移半途失败 | 单事务 + 校验不过即回滚（t9） |
| 回滚需求 | 切回 `json` + 重启即可；分片目录全程只读（t9/t13） |
