---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17]
sides: [backend]
---

# 后端设计：运行设置与可切换存储后端（REQ-261004103330-005f） <!-- serves: FR-1 -->

本文只写**后端**：装配期、端口实现、迁移脚本、SQLite 表与锁、错误与降级、性能与安全。前端（设置弹窗四屏）见 `frontend.md`；数据契约以 `data-model.md` 为准，接口形状以 `interfaces.md` 为准。

三处贯穿实现的红线（后面各节反复引用）：

| 红线 | 含义 | 出处 |
|---|---|---|
| 配置 = 意志，记录 = 事实 | 设置文件只写人想要什么；系统记录只写实际发生了什么 | FR-1 / FR-14 / FR-17 |
| 切换只在装配期 | 运行中绝不替换 `deps.store` 单例 | FR-6 |
| 事实设施可坏，不可静默 | 系统记录写失败不阻断；迁移失败必回滚且响亮 | FR-10 / FR-17 |

## 服务与接口实现 <!-- serves: FR-1, FR-2, FR-6, FR-7, FR-10, FR-14, FR-17 -->

| 编号 | 类型 | 名称 | 职责说明 | 输入 | 输出 | 调用方 | 依赖 | serves |
|---|---|---|---|---|---|---|---|---|
| S-1 | 函数 | `resolveRunSettings` | 四级来源合并 + 校验 + 逐项标注 source（零 IO 纯函数） | `{ file?, config?, env?, defaults? }` | `ResolvedRunSettings` | 组合根、`FileSettingsStore.refresh` | `STAGE_CONFIGS`、`LIMITS` | FR-1, FR-2, FR-6 |
| S-2 | 服务 | `FileSettingsStore` | 设置文件读/原子写/内存快照/变更订阅 | 文件绝对路径、`config`、`env`、`now`、`onWarn` | 实现 `SettingsStore` 四个方法 | 组合根、settings 路由、Dive | S-1、`persistAtomic` | FR-1, FR-2, FR-3, FR-4 |
| S-3 | 服务 | `SystemRecordFile` | 系统记录初始化/追加/体检快照/版本比对 | 文件绝对路径、`now`、`onWarn` | 实现 `SystemRecordStore` 四个方法；写失败只累加 `droppedEvents` | 组合根、迁移脚本、settings 路由 | `persistAtomic`、S-9 | FR-14, FR-15, FR-16, FR-17 |
| S-4 | 函数 | `reconcileVersion` | 比对当前版本与记录里的版本 → 必要时写 `upgrade`；给一致性结论 | `PluginStamp`、`sqliteSchemaVersion` | `CompatResult` | 组合根（装配早期） | S-3 | FR-15, FR-16 |
| S-5 | 模块 | `SqliteRequirementStore` | `RequirementStore` 的 SQLite 实现（读侧 + 写侧 + 事务 + CAS） | `{ file, now?, onWarn? }` | 端口全量方法 | 组合根（backend=sqlite 时）、契约测试 | S-6 | FR-7, FR-8, FR-9 |
| S-6 | 模块 | `sqliteSchema` | DDL、`sqlite_schema_version` 常量、打开时的版本校验 | 无 / `DatabaseSync` | 建表语句、`openSqlite(file)` | S-5、S-7 | `node:sqlite` | FR-7, FR-9, FR-16 |
| S-7 | 脚本 | `migrate-ledger-to-sqlite` | 一次性迁移八步（备份→建库→建表→迁移→校验→写设置→退出码） | CLI 参数 | stdout 逐步进度 + 退出码 | 迁移 Agent 窗口（由 S-13 投递） | S-6、`persistAtomic` | FR-10, FR-13 |
| S-8 | 函数 | `installRunLimitSource` / `roundLimitFor` | 给同步热路径函数装上"内存快照读"来源；未安装回落默认表 | `() => LimitSnapshot \| undefined` / 阶段名 | `number` | 组合根（S-8 安装）、`round-driver`（S-8 读取） | `STAGE_CONFIGS` | FR-2 |
| S-9 | 函数 | `packageVersionOf` | 装配层读 `package.json.version` 并盖章（单一来源） | 产物文件 URL | `string`（读不到 → `0.0.0-unknown` + 响亮告警） | 组合根 | `node:fs`、`shared/build-stamp` | FR-15 |
| S-10 | 函数 | `preflightLedger`（**扩展**） | 三相启动扩到四相：新增"已选 sqlite 但库空/陈旧"未就绪 | `{ dataRoot, ledgerFile, backend, sqliteFile }` | `PreflightResult`（判别联合） | 组合根（既有调用点） | `node:fs`、S-6 | FR-12, FR-13 |
| S-11 | 接口 | `src/http/routers/settings.ts` | 6 条设置类路由（GET/PATCH settings、storage/request、switch、migrate、system） | HTTP 请求 | 信封 `{success,data}` / `{success:false,error,code}` | `routes.ts` 分发 | S-2、S-3、S-12、S-13、S-15 | FR-3, FR-4, FR-6, FR-10, FR-11, FR-14 |
| S-12 | 函数 | `resolveMigrationWindowTarget` | 解析迁移窗口落点（workspace 优先、cwd 兜底），拿不到**响亮失败** | `sessionId` | `WindowCreateOptions` 或抛 `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | S-13 | `WindowOpenerPort`、`deps.sessionWorkspace` | FR-10, FR-11 |
| S-13 | 服务 | `startLedgerMigration`（用例函数） | 开 Agent 窗口 + 投递迁移底稿；**不自己跑迁移** | `{ sessionId, requirementRoot }` | `{ windowKey, delivered }` 或抛 `window_open_failed` | S-11 | `windowOpener`、`crossWindowDeliver` | FR-10, FR-11 |
| S-14 | 函数 | `assertPathWithinHome` | 路径解析为绝对路径后校验落在 `dshHome` 内（防越界写） | 原始路径、`dshHome` | 归一绝对路径或抛 `invalid_input` | S-7、S-11 | `node:path` | FR-6, FR-10, FR-13 |
| S-15 | 服务 | `SettingsConfirmTickets` | **先落章、后执行**：建待确认票据（`sc-…`）→ 作答落章 → 消费即作废 | `{ action, windowKey, sessionId }` / `ticket` | 票据或 `confirmation_required` | S-11 | `PendingConfirmRegistry`（扩展）、`UserQuestionPort` | FR-11 |

### 组合根装配顺序（伪代码） <!-- serves: FR-6, FR-12, FR-17 -->

装配逻辑**不进** `src/index.ts` 主体：该文件已 860+ 行（C-02 的 400 行门禁是既有失败项，`src/wiring/not-ready.ts` 头注已立此纪律）。新增 `src/wiring/run-settings-root.ts`，组合根只加"调用 + 分叉"。

```
apply(ctx, config):                                        # src/index.ts:167（既有）
 ① dataRoot        = dshHomePath(config, 'reqboard')        # index.ts:188（既有）
    legacyLedger   = dshHomePath(config, LEDGER_FILE)       # index.ts:189（既有）
 ② settings = new FileSettingsStore({                       # S-2（新）
        file: dshHomePath(config, 'dsh-reqboard-settings.json'),
        config, env: process.env, now, onWarn: logger.warn })
    await settings.refresh()                                # 文件不存在 → 全默认（FR-17 惰性）
 ③ backend = settings.snapshot().storage.backend.value      # S-1 已给 value + source
    sqliteFile = settings.snapshot().storage.sqlitePath
    stamp = { version: packageVersionOf(), buildStamp: getBuildStamp() }   # S-9
 ④ preflight = preflightLedger({ dataRoot, ledgerFile: legacyLedger, backend, sqliteFile })   # S-10
    if (!preflight.ok) { enterNotReadyMode(ctx, preflight.failure, logger); return }           # wiring/not-ready.ts:41（既有）
    ※ 相 2/3 绝不建任何文件：系统记录初始化只在相 1 之后（未就绪态零数据面副作用，见 not-ready.ts 头注纪律 1）
 ⑤ store = backend === 'sqlite'
        ? new SqliteRequirementStore({ file: sqliteFile, now, onWarn: logger.warn })          # S-5（新）
        : new ShardedRequirementStore({ root: dataRoot, now, onWarn: logger.warn })           # index.ts:205（既有，逐字不变）
    void store.headAfterDrain().catch(...)                  # index.ts:215（既有：急加载 + 未就绪 503）
 ⑥ systemRecord = new SystemRecordFile({ file: dshHomePath(config,'dsh-reqboard-system.json'), now, onWarn })  # S-3
    await systemRecord.reconcileVersion(stamp, sqliteSchema.SCHEMA_VERSION)                   # S-4（先 upgrade）
    await systemRecord.updateStores(await snapshotStores(store, dataRoot, sqliteFile))        # FR-13 陈旧 + 分叉判定
    await systemRecord.append({ event:'startup', backend, source, requirements })             # 首条事实
 ⑦ installRunLimitSource(() => settings.snapshot().limits)                                   # S-8（FR-2 生效点）
 ⑧ workspaceRoot = process.cwd(); queueRepo/taskStore = ...                                  # index.ts:220-224（既有）
 ⑨ useCaseDeps = { ...既有, settings, systemRecord }                                          # index.ts:645（增两个字段）
10 webServer.inject → createReqboardHandler({ ...既有, settings, systemRecord, applicationDeps: useCaseDeps })
11 settings.subscribe(next => { installRunLimitSource(...) 刷新 + SSE 广播 })                  # FR-2 三路刷新之一
```

`settings` / `systemRecord` 走**依赖注入**而不是模块级单例：两者都是宿主级全局（`dshHome` 下），与"按需求校正工作区根"的那条链**无关**（见「安全设计 §路径校验」的冲突说明）。

## 关键逻辑 <!-- serves: FR-2, FR-7, FR-10, FR-16 -->

### S-1 resolveRunSettings：四级优先级与校验 <!-- serves: FR-1, FR-2, FR-6 -->

**功能**：把"设置文件 / 插件配置 / 环境变量 / 内置默认"四路合并成一份**带来源标注**的生效设置，并把每一个被作废的键如实记下来。

**处理步骤**：

1. 枚举全部 9 个阶段键（`draft / brainstorming / design / decomposing / implementing / accepting / done / archived / canceled`）。**枚举源是 `RequirementStatus` 的值域**，不是设置文件里的键——否则少写一个键就会在表里缺行。
2. 每个阶段按 `settings → config → env` 顺序取**第一个合法**候选（不是第一个存在的候选——存在但非法的候选被跳过并记 problem）。
3. 合法性判据（三选一即拒绝该候选）：整数、`≥ LIMITS.stageMaxRoundsMin(=1)`、`≤ LIMITS.stageMaxRoundsMax(=10000)`。新增这两个具名常量到 `domain/limits.ts`（本仓"魔法数字必须具名"纪律）。
4. 四级全不合法/缺省 → 取 `STAGE_CONFIGS[stage].maxRounds`，`source='default'`。**默认表仍是默认值的唯一来源**，`stage-configs.ts` 只降级语义、不搬数值。
5. `storage.backend` 与 `storage.sqlitePath` 同法四级解析；`sqlitePath` 相对写法按 `dshHome` 解析后经 S-14 校验。
6. 环境变量：`PMBOARD_STORAGE`（单值）、`PMBOARD_STAGE_MAX_ROUNDS`（`implementing=200,design=50`）。**解析失败只作废该键**并记 problem，不整份回退（与 interfaces.md 一致）。
7. 产出 `problems[]`：每项 `{ key, reason, fellBackTo }`。调用方（S-2）把每条 problem 写进系统记录的 `settings-invalid` 事件——**静默回落是最坏的形态**：人以为自己改了 300，实际还在跑 1000。

**边界条件**：

- 配置文件整份不存在 → 全部 `default`，`problems` 为空（**这不是错误**，是全新安装的正常态）。
- `schemaVersion` 非 `1` → 整份作废、全部走默认，并记**一条** problem（不按未知格式猜读）。
- `stageMaxRounds` 里出现值域外的阶段键（如 `"foo": 3`）→ 该键作废 + problem；其余键照常生效。
- 同一键在 file 与 config 都非法 → 只记**一条** problem，`fellBackTo` 标 `default`（记两条会让人以为是两个问题）。

**示例**：`file.stageMaxRounds.implementing = 800`、`config.stageMaxRounds.implementing = 300`、无 env → 结果 `{ value: 800, default: 1000, source: 'settings' }`；把 file 值改成 `0` → 结果 `{ value: 300, default: 1000, source: 'config' }` + 一条 problem（`implementing` 非法，回落到 config）。

**性能**：纯函数、O(阶段数)=O(9)，无 IO，单次 < 0.1ms。

### S-8 roundLimitFor 的同步快照改造 <!-- serves: FR-2 -->

**约束（决定实现形态的唯一事实）**：`roundLimitFor(status)` 是**同步**函数，调用点在 `src/application/dive/round-driver.ts:420` —— 位于"决策 → 排队点屏障（`await ports.checkpoint()`）"之间。端口是异步的，**不能**在这里 await。

**为什么不能改成 async**（三条，任一条都足以否决）：

1. 该处处于竞态栅栏内：`round-driver` 的设计是"判定全部同步取完快照，再进 await"，插入 await 会拉长"判定值 → 使用值"的窗口，与文件头注的竞态纪律（FR-1/FR-7）冲突。
2. 多个既有测试与 Goal 对齐逻辑按同步契约写（`tests/dive-round-state.test.ts:91` 直接断言返回值）。
3. 热路径每回合都调；`await` 版本会把一次磁盘读放大成每回合一次异步调度。

**实现形态**（新增 `src/application/dive/run-limit.ts`，纯内存、零 IO）：

```
let source: (() => Readonly<Record<string, number>> | undefined) | undefined
export function installRunLimitSource(fn) { source = fn }
export function resetRunLimitSource() { source = undefined }   // 仅测试

export function roundLimitFor(status) {
  const v = source?.()?.[status]
  if (typeof v === 'number') return v
  return getStageConfig(status)?.maxRounds ?? 10               // 未安装/未命中 → 既有逐字行为
}
```

- **停手判定在判定点，不在执行点**（已裁定口径）：本函数**只做"值比较"**——把"该阶段当前上限是多少"同步答出来。真正的停手动作发生在**回合判定处**（`round-driver.ts:420` 一带：`roundsInStage >= limit` → 走 `terminalBlock` 停手并**如实置停手原因**）。因此上限下调**不会打断正在执行的那一回合**：那一回合跑完，下一拍进判定点才停。把停手写进本函数（例如抛错/中止投递）会变成"执行点被打断"，与产品口径相反。
- **未安装 = 旧行为**：这让 `tests/dive-round-state.test.ts:91`（`implementing → 1000`、未知 → 10）保持绿，也让不经组合根的用例零改动。
- **刷新三路**：① `PATCH /settings` 成功后同拍换快照并广播；② 订阅设置文件（mtime 轮询，周期取既有 `panelSettings.refreshMs` 同量级）覆盖"人手改文件"；③ 启动加载一次。
- **失败不回落**：文件读取失败 → **保留上一份快照** + 响亮告警。悄悄退回默认值会让上限从 300 突然变回 1000，正是最难排查的一类故障。
- **全局状态如实声明**：该来源是**进程级**（不是会话级）。设置文件本就是 host-global（产品裁定"全局一份设置"），故同一 DSH 进程承载两个项目时上限共享是**有意**的；`installRunLimitSource` 由组合根安装一次，测试用 `resetRunLimitSource` 隔离。

### S-5 SqliteRequirementStore：事务边界与 CAS <!-- serves: FR-7, FR-9 -->

**打开与校验**（S-6）：

```
openSqlite(file):
  db = new DatabaseSync(file)                     # node:sqlite；同步 API，无连接池
  db.exec('PRAGMA journal_mode = WAL')            # 读不阻塞写；单进程 + 读多写少
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')           # 并发写让它失败，而不是静默交错
  v = db.prepare('SELECT value FROM meta WHERE key=?').get('sqlite_schema_version')
  v !== String(SCHEMA_VERSION) → throw { code: 'REQBOARD_SQLITE_SCHEMA_MISMATCH' }   # FR-16 转可读告警 + 重建指引
```

**写事务模板**（所有写方法的**唯一**形态）：

```
BEGIN IMMEDIATE      # 立刻取写锁：避免"先读后写"的锁升级失败；也让并发写尽早失败（busy_timeout 到点报错）
  …读-改-写…
COMMIT
异常 → ROLLBACK（未提交则忽略"无事务"错误）→ 映射错误码后原样抛
```

**逐方法事务边界**：

| 方法 | 边界 | 关键点 |
|---|---|---|
| `create` | 单事务 | `INSERT` 撞 UNIQUE → 捕约束错误 → `REQBOARD_ALREADY_EXISTS`（**不覆盖**） |
| `mutate` | 单事务 | 事务内 `SELECT` 装配 draft → 调 `fn(draft)`（**回调同步契约**，与 `QueueRepository.mutate` 同款：回调内不得 await）→ `undefined`/`{changed:false}` → 提交（无写入、不 bump revision、不广播） |
| `mutateIf` | 单事务 | CAS：`UPDATE requirements SET …, version = version + 1 WHERE id = ? AND version = ?`；`changes === 0` → 事务内补一次 `SELECT version` 取当前值 → `ROLLBACK` → 抛 `REQBOARD_CONFLICT`（**带当前版本**，不静默覆盖） |
| `appendComment` | 单事务 | 评论插入与 `requirements.comment_count + 1` **同一事务**（否则计数与明细漂移） |
| `sweep` | 单事务（**仅启动对账/迁移**） | 遍历全部 drafts，回调返回 ids；整批一次 revision bump |
| `replaceAll` | 备份 + 单事务 | 先 `VACUUM INTO '<file>.bak-<ts>'`，再 `DELETE` + 批量 `INSERT` |
| `get` / 读方法 | 无显式事务 | 单条 `SELECT` 本身原子；`get` 装配 = requirements 一行 + parts 至多 5 行 |
| 冷侧写入 | — | `isColdStatus(status)` → 抛 `REQBOARD_COLD_IMMUTABLE`（与分片实现同口径） |

**订阅与投影新鲜度**（照抄本仓 2026-10-03 事故的教训）：写事务**提交后**回调订阅者，并在**同一次提交**里刷新内存投影（`peekSummaries` / `peekFacts` 的字段源）。理由：`dive`/`advance` 是驱动判定字段，只建索引时填一次会导致"写进去读不出来"的四小时死循环（REQ-261004065652-5c1c FR-4）。`headAfterDrain` 直接返回 `head()` 并注明理由：本实现写在本进程同步完成、提交即落盘，不存在写后队列，故"排空"恒真——但**保留同拍刷新**以满足"读己所写"。

### S-7 迁移脚本八步与退出码 <!-- serves: FR-10, FR-13 -->

与 `data-model.md §迁移与回填算法` 逐步对齐（**不新增第九步**）：

| 步 | 动作 | 失败处理 |
|---|---|---|
| 1 | 解析参数：`--from`（必填，缺失即报错不猜）、`--to`（缺省 `<dshHome>/reqboard.sqlite`）、`--dry-run`、`--write-settings` | 缺 `--from` → usage → **exit 2** |
| 2 | 预检：源 `meta.json` 在？目标库在？在则做**陈旧判定**（条数/`migratedAt` vs 源） | 不过 → **exit 2**；`--dry-run` 到此打印计划 → **exit 0** |
| 3 | 备份分片目录 → `<dshHome>/backups/reqboard-<yyyyMMdd-HHmmss>/`（逐文件复制，**不改源**） | IO 失败 → **exit 4** |
| 4 | 目标库已存在 → 自身备份为 `<库文件>.bak-<ts>` → 删旧库（陈旧库不得当现状） | 同上 |
| 5 | 建库建表（S-6 的 DDL）+ 写 `meta.sqlite_schema_version = 1` | 同上 |
| 6 | **单事务**迁移：逐需求 `INSERT` requirements / comments / history / parts / archived；逐条校验 id 与 version | 事务内异常 → `ROLLBACK` → **exit 4** |
| 7 | 校验：条数相等 + 抽样 5 条逐字段深比较 | 不一致 → `ROLLBACK` → **exit 3** |
| 8 | 仅当 `--write-settings`：原子写 `storage.backend = sqlite` → 追加系统记录 `migration`(`result:'ok'`) | 写设置失败 → **exit 4**（库已就绪，但设置没落；如实报告，不谎报成功） |

**第 8 步的两个前置条件（同时成立才允许写设置文件）**：

1. **第 7 步校验通过**（条数 + 抽样逐字段）；
2. **票据已落章且未消费**——`--write-settings` 默认**关**是"手动路径的安全缺省"（人自己跑脚本时不会顺手切后端）；Agent 执行**已确认任务**时才附带该参数，而"已确认"这一事实由 S-15 的票据链落成（`POST /settings/storage/request` → 作答落章 → `migrate` 消费），见 `### 确认票据：先落章、后执行`。

**一次人工确认覆盖全部五步**（备份 → 建库 → 迁移 → 校验 → 写设置），不存在"迁移要确认、写设置再确认一次"的两道门；但也**不存在**"没确认就能写设置"的路径。

退出码：`0` 成功 / `2` 预检不过（含 dry-run 正常结束）/ `3` 校验不过（已回滚）/ `4` IO 失败 / `1` 未预期异常。

**两条实现纪律**：

- **非交互**：脚本由 Agent 窗口执行，任何分支都不得等人输入（没有 `readline`、没有确认提示）。`--write-settings` 是"人已在看板确认过"的**显式凭据**，由 Agent 附带。
- **回滚保证**：第 3/4 步的备份与第 6 步的事务是两条独立的回滚路径——备份保证"源与旧库都在"，事务保证"新库不半成品"。第 6 步之后源分片**仍未被写过一次**（只读）。

### S-10 preflightLedger：两种"未就绪"必须各自独立 <!-- serves: FR-12, FR-13 -->

`preflightLedger` 从三相扩到四相，**两种失败不是同一件事**，文案与指引必须各写各的（**不许共用一句**）：

| 相 | 触发条件 | 码 | 文案与指引（各自独立实现） |
|---|---|---|---|
| 相 2a | 已选 `sqlite`、目标库不存在或为空，而分片目录非空 | `REQBOARD_REQUIRES_SQLITE_MIGRATION` | 指引跑 **`scripts/migrate-ledger-to-sqlite.ts`**（或点看板「交给 Agent 处理」）；`migrationHint` 内联真实 `--from/--to` 路径 |
| 相 2b | legacy 单册在场、数据根未迁移（`meta.json` 缺） | `REQBOARD_REQUIRES_MIGRATION`（既有） | 指引跑 **`scripts/migrate-ledger-v10.ts`**；文本与既有实现**逐字不变**（既有测试与用户记忆锚在那句话上） |
| 相 1 | `meta.json` 在（json）／库有效（sqlite） | — | 正常启动；**仍未就绪态零文件副作用** |
| 相 3 | 三者皆空（全新安装） | — | 正常启动（空数据本来就该是空的）；首条 `startup` 记 `requirements: 0` |

**实现纪律**：两套 `message`/`hint` 各自独立构造（各有一个唯一构造点），禁止抽成"共用模板 + 参数"——两条指引要跑的是**两个不同脚本**，共用模板迟早会把 sqlite 的指引抄给单册那条（反之亦然）。降级路由（`wiring/not-ready.ts`）只搬 `failure`，不重新拼文案。

### S-4 reconcileVersion：版本比对 <!-- serves: FR-15, FR-16 -->

**功能**：启动时回答两件事——"这次是不是升级了？""旧库还作不作数？"

**处理步骤**：

1. 读系统记录（不存在 → 调用方先初始化，写 `plugin` 三件套 + 首条 `startup`）。
2. `last = record.plugin`；若 `last.version !== current.version || last.buildStamp !== current.buildStamp` → 追加 `upgrade` 事件（`from` / `to` 各带 `{version,buildStamp}`、`detectedBy:'startup-compare'`），**并刷新** 顶层 `plugin`。
3. **不得静默覆盖**：即使版本没变，刷新 `recordedAt` 也必须走"读-改-写 + 追加事件"的同一路径；直接覆盖顶层会抹掉升级历史（FR-16 的判据就是靠这条历史）。
4. 一致性核对：`record.stores.sqlite.sqliteSchemaVersion`（库写入时版本）与当前 `SCHEMA_VERSION` 比对 → `consistent: boolean`；同时带出 `lastMigrationBy`（哪个插件版本做的迁移）。
5. 结论落 `compat` 块并返回：`consistent=false` → 启动期**报警**（日志 + 看板红字）+ 给**重建库**指引（重跑 S-7 并先备份旧库）；**绝不**让新版本硬读旧表（宁可拒绝服务，也不把数据读坏）。

**边界**：库不存在（`backend=json` 或尚未迁移）→ `consistent=true`、`note` 说明"无库可核对"；记录里的 `plugin` 缺失（手工删过字段）→ 视同首见，写 `upgrade` 事件但 `from` 用 `{version:'unknown'}`（**不编造**）。

### S-3 系统记录初始化语义 <!-- serves: FR-14, FR-17 -->

| 对象 | 时机 | 已存在时 | 失败时 |
|---|---|---|---|
| 系统记录 | 装配期**相 1 之后**自动创建 | 只追加事件 + 更新 `updatedAt`/`stores`/`active`，**不覆盖** `history` | **不阻断启动**：日志 + `droppedEvents++` + 「系统记录」屏红字「记录不可写（原因）· 已丢弃 N 条事件」 |
| 设置文件 | **惰性**（首次 `PATCH` / 首次确认切库） | 合并写入（保留未提及的键） | PATCH 返 500（含路径与原因）；**快照不变**（不半生效） |
| SQLite 库 | **迁移时**（S-7 第 5 步） | 先备份再重建（陈旧库） | 事务回滚；源分片与设置不动 |

**为什么系统记录必须自动建、设置文件必须惰性建**：判据是"事实 vs 意志"。首次启动本身就是第一条事实；而自动写默认值等于把默认值冻进文件——日后我们把 `implementing` 默认从 1000 调成 300，用户拿到的仍是被抄下来的 1000，且分不清是人改的还是插件抄的。

**幂等**：初始化必须是"读-若缺失-写"而不是"无条件写"；并发启动（同进程重入）由 S-3 内部串行队列保证（照 `InjectionLogFile` 的 `queue` 形态）。

## 数据流 <!-- serves: FR-4, FR-10 -->

### 流 A：PATCH /settings → 内存快照 → Dive 生效 <!-- serves: FR-2, FR-3, FR-4 -->

```
人点保存（前端已本地校验 1–10000）
  ↓ PATCH /dashboard/api/reqboard/settings  { "stageMaxRounds": { "implementing": 800 } }
步骤 1：routes.ts 分发（新增分支：method+sub === 'settings'）        # src/http/routes.ts:190 区域
  ↓
步骤 2：S-11 校验（application 侧再校验一次，不信客户端）
  ├─ 体里出现 storage.backend → 400 invalid_input（消息指向 /settings/storage/switch）   # FR-11 代码级防线
  ├─ 阶段键不在 9 阶段枚举 / 值非整数 / 越界 → 400 invalid_input（消息含"哪一项、范围、怎么改"）
  └─ 通过 → 继续
步骤 3：S-2 update(patch)
  ├─ 读旧文件（不存在 → 空对象）→ 合并（保留未提及键）→ 校验 → persistAtomic(tmp+fsync+rename)
  ├─ 读回 → S-1 resolveRunSettings → **原子替换内存快照** → 广播订阅者
  └─ 写盘失败 → 抛 REQBOARD_IO_FAILED（快照不变）
步骤 4：订阅者（同拍）
  ├─ S-8：installRunLimitSource 的源读到新快照 → roundLimitFor('implementing') === 800
  └─ SSE：向所有窗口推一帧 revision + kind='settings-changed'（看板徽章刷新）
步骤 5：路由回 200 { stageMaxRounds: {implementing:{value:800,source:'settings'}}, restartRequired:false }
  ↓
步骤 6（下一拍的**判定点**）：round-driver.ts:420 limit = roundLimitFor(req.status) → 800
  ├─ roundLimitFor 只取值（值比较），不改状态、不中止任何投递
  └─ roundsInStage ≥ limit → terminalBlock：**停手发生在判定点**，如实置停手原因
     ※ 正在执行的那一回合不受影响：它跑完，下一拍进判定点才停（上限下调的既有语义）

【副作用】
- 文件系统：<dshHome>/dsh-reqboard-settings.json 一次原子写
- 内存：设置快照 + 上限来源（进程级）
- 登记：若本次有 problems（其他键非法）→ 追加 settings-invalid 事件（不是本次改动造成的也报，如实）
```

**关键时序**：改上限**不**触碰任何需求记录、不重置 `roundsInStage`、不打断在跑的回合。判据是"下一个回合才读"——已经在跑的那一次不受影响（"不打断正在执行的那一次"是产品口径）。

### 流 B：确认 → 迁移 → 重启 <!-- serves: FR-6, FR-10, FR-11, FR-12, FR-13 -->

```
步骤 1：人在看板选 SQLite（**仅前端状态**，不写任何文件）         # FR-6："选目标"≠"切后端"
步骤 2：点「交给 Agent 处理」→ 前端 POST /settings/storage/request
        → S-15 建票据 sc-…（+10min）→ UserQuestionPort 推确认框（复用 PendingConfirmRegistry）
步骤 3：人作答（弹框 / 看板确认按钮 / 文字证据命中）→ **落章**（human + at + sessionId + pluginVersion）
        —— 这一步才产生"人已确认"这一事实；未作答时票据保持"未落章"
步骤 4：前端 POST /settings/storage/migrate { sessionId, ticket:"sc-…" }
        ├─ 票据缺失/过期/**已消费** → 403 confirmation_required（**不开窗、不写设置、不写事件**）
        ├─ 消费票据（一次性作废）后继续
        ├─ sessionId 缺失 / 解析不出落点 → 400 / 503（不静默用宿主目录）
        ├─ 目标库陈旧 → 计划里明确"先备份旧库再重建"（FR-13），不拦（拦的是"当现状启用"）
        └─ 已有迁移在跑（进程内标记 + 系统记录最近一条 migration 未收尾）→ 409 migration_in_progress
步骤 5：S-12 解析落点 → S-13 开窗
        target = windowOpener.resolveSourceProject?.(sessionId) ?? (sessionWorkspace(sessionId) → { cwd })
        target === undefined → 抛 REQBOARD_OPEN_WINDOW_UNAVAILABLE（**绝不在宿主目录静默建窗**）
        outcome = await windowOpener.create(target)      # 用 create 不用 fork：迁移不需要对话前缀，也避开"无完整回合"
        outcome.ok === false → 500 window_open_failed（**不写 migration 事件**——不伪造"已开始"）
步骤 6：S-13 投递底稿
        { message } = crossWindowDeliver.createMessage({ text: 迁移任务底稿, kind: 'ledger-migration' })
        sent = await crossWindowDeliver.deliver(outcome.windowKey, message)
        ├─ delivered=false → 如实回 { delivered:false, reason }；窗口已开不回滚；**仍不写 migration 事件**
        └─ delivered=true  → 追加 migration-requested 留痕（可选轻事件），回 { windowKey, delivered:true }
        ※ 消息必须**自署** source.kind：绝不用会话控制器的 prompt 入口（那会把来源标成 user，等于插件冒充人）
步骤 7：Agent 窗口跑 S-7（八步）→ 校验通过 → 写设置 + 追加 migration(result:'ok')
步骤 8：看板轮询 GET /settings（看 storage.backend.value）与 GET /settings/system（看 history 尾部）显示进度与结论
步骤 9：人重启宿主 → 装配期 ⑤ 按新 backend 选 S-5 → ⑥ active 更新 → 生效

【副作用（按步骤）】
- 步骤 5：新会话（DSH 侧）
- 步骤 6：一条自署消息（无来源伪造）
- 步骤 7：备份目录 + 新库（+ 旧库备份）+ 设置文件 + 系统记录事件
- 步骤 9：内存中换成 S-5；分片目录从此只读
```

**组件职责边界**：宿主只**开窗与投递**；脚本只**搬数据与校验**；设置文件里 `backend` 的写入只发生在**校验通过之后**（把"校验没过却已切换"从设计上排除）。这条边界是 FR-10 的核心，实施时不得为了"少一跳"把迁移塞回路由进程。

## 错误处理 <!-- serves: FR-3, FR-4, FR-10, FR-12, FR-16 -->

### 错误码落地层级与 HTTP 映射 <!-- serves: FR-3, FR-4, FR-6, FR-10, FR-12, FR-16 -->

**分层纪律**：application/adapter 抛**带 code 的 Error**（`Object.assign(new Error(msg), { code })`），HTTP 层只在 `src/http/envelope.ts:38` 的 `fail()` 一处映射状态码——**新增映射必须加在那一处**，不许在路由里各自 `if`。

| 码 | 抛出层 | HTTP | 用户提示要点 | 降级/重试 |
|---|---|---|---|---|
| `invalid_input` | application（S-11 校验） | 400（既有映射） | 哪一项、允许范围、怎么改 | 不重试，改完重发 |
| `REQBOARD_SETTINGS_INVALID` | 纯函数 S-1 **不抛** | — | 内部码：作废该键 + 记 `settings-invalid` | 不阻断 |
| `REQBOARD_IO_FAILED` | S-2 / S-3 落盘 | 500 | 路径 + 原因 | 人重试；快照不变 |
| `REQBOARD_SQLITE_SCHEMA_MISMATCH` | S-6 打开时 | **503**（新增映射） | 版本不一致 + 重建库指引 | 人跑 S-7 重建 |
| `REQBOARD_REQUIRES_SQLITE_MIGRATION` | S-10 预检 | **503**（新增映射） | 可复制命令（真实路径内联） | 人跑迁移/点按钮 |
| `REQBOARD_REQUIRES_MIGRATION` | S-10（既有） | 503（既有映射） | 既有文本逐字不变 | 同上 |
| `sqlite_not_migrated` | S-11（switch 前置） | **409**（新增映射） | 先跑 migrate 再切 | 走 migrate |
| `migration_in_progress` | S-11 / S-13 | **409**（新增映射） | 已有迁移在跑，先看窗口 | 等或看系统记录 |
| `confirmation_required` | S-15（票据缺失/过期/**已消费**） | **403**（新增映射） | 需人在看板确认；给 `request` 入口 | 重新走确认门（票据一次性） |
| `window_opener_unavailable` | S-13（开窗服务未装配） | **503**（新增映射） | 宿主未装配开窗能力 | 可在项目内重试 |
| `dispatch_failed` | S-13（投递失败） | **502**（新增映射） | 窗口已开但底稿没投到（带原因） | 不写事件；可重发 |
| `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | S-12（落点解析不出） | **503**（新增映射） | 拿不到项目落点 | 在项目内重试 |
| `window_open_failed` | S-13 | 500（缺省映射） | 建会话失败（带原始原因） | **不写事件**，可重试 |
| `REQBOARD_CONFLICT` | S-5 CAS | 500（**保留既有语义**） | 版本不匹配，带当前版本 | 既有调用方行为不变 |

**必须在 `fail()`（`src/http/envelope.ts:53` 之前）里补登的映射**（**不补就全落 500**）：

| code | status |
|---|---|
| `confirmation_required` | 403 |
| `REQBOARD_SQLITE_SCHEMA_MISMATCH` | 503 |
| `REQBOARD_REQUIRES_SQLITE_MIGRATION` | 503 |
| `window_opener_unavailable` | 503 |
| `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | 503 |
| `dispatch_failed` | 502 |
| `migration_in_progress` | 409 |
| `sqlite_not_migrated` | 409 |

503 与既有的 `REQBOARD_REQUIRES_MIGRATION` 同语义（人工介入即可恢复，**绝不退化成 500/404**）；409/502 是今天该函数**完全没有**的分支。既有码的映射一律不动（`REQBOARD_CONFLICT` 仍落 500，保持既有调用方行为）。

### 失败降级纪律 <!-- serves: FR-10, FR-17 -->

| 失败 | 阻断？ | 理由与痕迹 |
|---|---|---|
| 系统记录写失败 | **不阻断** | 档案设施坏掉不能让看板整体不可用；日志 + `droppedEvents++` + 屏上红字 |
| 设置文件写失败 | **阻断该次 PATCH**（500） | 快照不变 = 不半生效；"写了一半"比"没写"更难查 |
| 设置文件解析失败 | 不阻断启动 | 全部回落默认 + `settings-invalid` 事件（**响亮**） |
| 快照刷新失败（轮询读到坏文件） | 不阻断 | **保留上一份快照** + 告警（绝不静默回默认值） |
| 迁移任一步失败 | 阻断迁移 | 事务 `ROLLBACK`；源分片与设置不动；**写 `migration(result:'failed')`** 但**开窗/投递失败不写任何 migration 事件**（区分"跑失败了"与"没开始"） |
| 预检未就绪（相 2） | 阻断装配（不抛） | `enterNotReadyMode` 注册 503 降级路由后 `return`：**绝不**静默起空台账，也**绝不**建任何文件 |

## 数据库设计 <!-- serves: FR-7, FR-9, FR-13 -->

### 表结构（DDL） <!-- serves: FR-7, FR-9 -->

与分片目录**一一对应**（`requirements/<id>/record.json` + `comments.jsonl` + `history.jsonl` + 大字段 + `meta.json` + 冷侧）。DDL 与版本常量收敛在 `src/repositories/sqliteSchema.ts` 一处（`node:sqlite` 处于 experimental，便于单点替换）。

```sql
CREATE TABLE IF NOT EXISTS requirements (
  id                TEXT PRIMARY KEY,
  title             TEXT NOT NULL,
  status            TEXT NOT NULL,
  category          TEXT,
  prompt_difficulty TEXT,
  version           INTEGER NOT NULL,          -- CAS 用
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  source_session_id TEXT,
  workspace_root    TEXT,
  doc_base_path     TEXT,
  autorun           INTEGER NOT NULL DEFAULT 0,
  blocked           INTEGER NOT NULL DEFAULT 0,
  comment_count     INTEGER NOT NULL DEFAULT 0,
  history_count     INTEGER NOT NULL DEFAULT 0,
  cold              INTEGER NOT NULL DEFAULT 0   -- 1 = 冷侧（只读）
);
CREATE TABLE IF NOT EXISTS parts (             -- 外置大字段（description/dive/advance/artifacts/tokenUsage）
  req_id TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
  PRIMARY KEY (req_id, key)
);
CREATE TABLE IF NOT EXISTS comments (
  req_id TEXT NOT NULL, seq INTEGER NOT NULL, id TEXT NOT NULL,
  body TEXT NOT NULL, created_at INTEGER NOT NULL, created_by TEXT NOT NULL,
  PRIMARY KEY (req_id, seq)
);
CREATE TABLE IF NOT EXISTS history (
  req_id TEXT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT,
  at INTEGER NOT NULL, reason TEXT, actor TEXT, token_snapshot TEXT,
  PRIMARY KEY (req_id, seq)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- revision / triages / sqlite_schema_version
```

### 索引与查询 <!-- serves: FR-7, FR-9 -->

| 索引 | 列 | 支撑的查询 | 为什么是这些列 |
|---|---|---|---|
| `idx_req_order` | `(status, updated_at DESC, id ASC)` | `listSummaries` 的排序契约与 keyset 分页 | 端口承诺"`updatedAt` 降序、同刻 `id` 升序"，索引顺序即游标顺序，避免排序临时表 |
| `idx_req_category` | `(category)` | 分类过滤 | 选择性中等，单独走索引即可 |
| `idx_req_cold` | `(cold, status)` | `scope='active'` 默认排除冷侧 | 冷侧是少数，避免全表 `status` 扫描 |
| `idx_comments` / `idx_history` | `(req_id, seq)`（主键已含） | `since`/`limit` 顺序读 | 复合主键天然有序，无需额外索引 |

不使用 FTS、不使用触发器：搜索与派生视图都在应用层（与分片实现口径一致，避免第二套语义）。

### 锁与 node:sqlite 用法 <!-- serves: FR-7, FR-9 -->

| 项 | 取值 | 理由 |
|---|---|---|
| 驱动 | `node:sqlite` 的 `DatabaseSync` | 边界内不引第三方；本机 v25.6.1 可用（experimental 警告如实保留） |
| 连接 | **进程内单连接**，不做池 | 本仓是单进程串行写模型；池会引入"谁持有写锁"的新议题 |
| journal | `WAL` | 读不阻塞写：看板轮询读与 Dive 写并发是常态 |
| 写锁 | `BEGIN IMMEDIATE` | 立刻拿写锁，杜绝"读→升级写锁"的 `SQLITE_BUSY` 与死锁 |
| 等待 | `busy_timeout = 5000` | 并发写（另一个进程/窗口）在 5s 后**报错**，而不是静默交错 |
| 外键 | `foreign_keys = ON` | 本次无外键引用（parts/comments/history 靠 req_id 逻辑关联），开启以备后续 |
| 语句 | `db.prepare()` 缓存常用语句（按 SQL 文本 Map） | 同步 API 下准备开销可测；写路径每回合都会跑 |
| 关闭 | `close()` 幂等；`onWarn` 记录 | 宿主卸载时释放；本仓不做"运行中重开" |

**statement 与回调的同步契约**：`mutate` 的 `fn(draft)` 必须是同步的（与 `QueueRepository.mutate` 同款）。任何"回调里 await 一次 IO"的写法都会把事务开在 await 之间——**事务跨越 await 是明令禁止**（WAL 下会长时间持写锁）。

## 性能考量 <!-- serves: FR-7, FR-12, FR-17 -->

| 指标 | 目标 | 约束来源 | 做法 |
|---|---|---|---|
| 首个看板请求载荷 | 不劣于分片实现（首屏 5416 B 量级） | kb-0018 的读放大治理成果不得回退 | `listSummaries` 只投影标量列，**绝不** join parts |
| `listSummaries` 单页 | P95 < 20ms（128 条需求） | 看板轮询周期 5s | keyset 分页（`LIMIT n+1` + 游标），复用 `shardPaging.ts` 同一对 encode/decode |
| 单需求装配 `get` | O(1)：1 行 + ≤5 行 parts | 端口契约 | 主键查询；comments/history 按需另读（列表页不读） |
| 单次写提交 | 1 事务；不整库重写 | 分片实现"重写 record.json"是 O(单条) | 只 UPDATE 变更列 + 命中行的 parts；`writeAmplificationWarnBytes` 告警沿用同名选项 |
| 启动预检 | < 50ms | 启动体验 | 分片条数走 `meta.json`（不扫目录）；库条数一条 `SELECT COUNT(*)`；均为 `existsSync` + 常数次查询 |
| 系统记录追加 | O(1) 文件重写（≤500 条，<200KB） | FR-14 保留上限 500 | 与 `InjectionLogFile` 同款：整份读-改-原子写；单条 <1KB |

**瓶颈预案**：`listSummaries` 在需求数上千后才可能成为瓶颈 → 那时才考虑 `covering index` 或分页缓存；**本次不做**（边界内）。

## 安全设计 <!-- serves: FR-6, FR-10, FR-11 -->

### 路径校验（防越界写） <!-- serves: FR-6, FR-10, FR-13 -->

| 输入 | 校验规则 | 拒绝示例 | 理由 |
|---|---|---|---|
| `storage.sqlitePath` | 解析为绝对路径（相对按 `dshHome`）后必须落在 `dshHome` 内；拒绝 `..` 段与解析后越界的符号链接 | `../../etc/passwd`、`/tmp/x.sqlite` | 防止"改一个设置就把库写到系统目录" |
| `--from` | 必须是含 `meta.json` 的**目录**，且落在 `dshHome` 内 | `/`、`~/.ssh` | 迁移要复制整目录，越界读本身即风险 |
| `--to` | 同 `sqlitePath`；父目录不存在 → **明确报错**（不静默 mkdir -p 到任意位置） | `~/../../root/x.db` | 与上同 |
| 备份目录 | 固定在 `<dshHome>/backups/reqboard-<ts>/`，时间戳由脚本生成（**不接受用户传入**） | `--backup-dir=/etc` | 备份写点不可被外部指定 |
| `GET /settings/system?limit=` | 整数、`1..500`，越界 → 400 | `limit=1e9` | 防止用查询参数放大读 |

**一处必须写明的冲突**：本仓有一条"按需求校正工作区根"的写入守卫链（`applyRequirementWorkspaceRoot` / `ensureWritableProjectRoot` / `assertWritableRequirementProject`，`support.ts:148/300/341`），因为 `deps.docs` 与 `queueRepo` 是**宿主级共享单例**，根会被别的窗口按需求级 `workspaceRoot` 改掉。**设置文件与系统记录不参与这条链**：它们固定在 `dshHome` 下按绝对路径读写，若被卷进按需求校正，A 窗口改一次上限就可能把文件写进 B 项目里（这正是 `PROJECT_ROOT_MISMATCH` 那道守卫要防的形态）。因此 S-2/S-3 的路径在**构造期**定型，此后不受任何 `setWorkspaceRoot` 影响。

### 确认票据：先落章、后执行 <!-- serves: FR-11 -->

FR-11 的**代码级落点**是一条一次性票据链，复用既有 `PendingConfirmRegistry`（`src/adapters/PendingConfirmRegistry.ts`）的挂起/结算机制，**不新造第二套**：

| 步 | 接口 / 动作 | 细节 |
|---|---|---|
| 1 | `POST /settings/storage/request` | 建待确认记录 `{ action:'storage-switch'\|'storage-migrate', ticket:'sc-…', expiresAt:+10min, requestedBy }`；经既有 `UserQuestionPort.ask`（`gate` 声明）推确认框。**注册表扩展**：`register()` 现在只接 `target:'artifact'\|'plan'` + 必填 `requirementId`，需扩为 `target:'settings'` + `action` + `requirementId?` + 可选 `ttlMs`（缺省仍 `LIMITS.pendingConfirmTtlMs=30min`，settings 票据传 10min，新增具名常量 `LIMITS.settingsConfirmTtlMs`） |
| 2 | 作答（三条通道任一） | ① 弹框作答；② 看板确认按钮；③ **文字证据命中真实用户消息**（复用 `SessionProbe.matchesRecentUserMessage`，`ports.ts:612`）。落章 `{ kind:'human', at, channel:'board-confirm', sessionId, pluginVersion }` → 票据状态 = **已落章·未消费** |
| 3 | `POST /settings/storage/switch` / `.../migrate` | 请求体**必须带 `ticket`**；先 `get(ticket, windowKey)`（未命中/过期 → 拒），再新增的 `consume(ticket, windowKey)` 标 `consumedAt`——**消费即作废（一次性）**。二次消费 / 未知 / 过期 → `403 confirmation_required`，且**不开窗、不写设置、不写 migration 事件** |
| 4 | 设置文件的写入（迁移第 5 步 / 第 8 步） | 只发生在「**票据已落章且未消费**」+「**第 ⑦ 步校验通过**」**两个条件同时成立**时；`--write-settings` 只是这条合取条件的显式携带方式 |

**保证等级必须如实写**（不许把它说成强保证）：本机 HTTP 路由**无鉴权**，且路由层 actor **默认 `human`**（对齐 `http/routers/requirements.ts:237/261` 的 artifact/plan 确认，落章时写 `approvedVia='board'` 同款事实）。因此这是**通道约定级**保证——与全仓既有五道人工门**同级**，**不是密码学证明**（本地任意进程都能发这个 HTTP 请求）。

我们能做、也必须做的三件事：① **不提供 agent 工具入口**（agent 只能 `ask`，没有任何 `save` 后端的工具）；② **执行消费已落章票据**（未落章/已消费一律 403，不靠调用方自觉）；③ **留痕可审计**（`confirmedVia:'board'` + `sessionId` + `pluginVersion` 进系统记录，事后查得出是谁在何时点的）。

### 确认门的代码级实现 <!-- serves: FR-11 -->

不靠提示词自律，靠三处**代码**：

1. `PATCH /settings` 的体里出现 `storage.backend` → **400 并指向 `/settings/storage/switch`**（不是忽略该字段——忽略会让调用方以为自己切成功了）。
2. `storage.backend` 的**唯一写点**是 `POST /settings/storage/switch`（要求**已落章未消费的票据**，写 `backend-switched` 事件，带 `confirmedBy`）与 S-7 的 `--write-settings`（**票据已落章** + 第 ⑦ 步校验通过）。`SqliteRequirementStore` 与迁移脚本的其它分支**既不读也不写**该字段。
3. `POST /settings/storage/migrate` 要求**已落章未消费的票据** + `sessionId` 且能解析出落点；任缺一项就**响亮失败**（顺带把"落点未知"这个更危险的问题前置拦下）。票据由 S-15 的 `request` 步建立、作答落章、执行时消费。

**为什么不给 agent 侧工具**：本次**不新增**任何 agent 工具改后端。agent 能做的只有"人确认后跑迁移脚本"，而后端字段由人确认的路由写。这条与"人工门永不伸缩"同源。

**设置文件写入的合取条件**（两个条件同时成立，缺一不可）：校验通过（S-7 第 7 步）+ 已确认（`confirmedBy` 留痕）。任缺其一 → 脚本不写 `storage.backend`，只如实报告"库已建好、设置未改"。

### 敏感信息与暴露面 <!-- serves: FR-11, FR-14 -->

| 项 | 处理 |
|---|---|
| 库文件 / 两份 JSON | 创建后 `chmod 0600`（同用户独占）；目录沿用 `dshHome` 既有权限 |
| 系统记录内容 | 只写**计数与路径/版本**，不写需求正文、不写评论、不写 token 明细（`history` 只带 `from/to/条数/耗时/备份路径`） |
| 新增路由的暴露面 | `settings*` 挂在**既有前缀** `/dashboard/api/reqboard` 之下，与既有看板路由同口径（本机回环 + 宿主会话），**不新增端口、不新增鉴权模型**；`migrate` 额外要求 `sessionId` |
| 日志 | 打印路径与错误原因；**不打印**需求正文（`onWarn` 文案里不带 body） |

## 兼容性 <!-- serves: FR-6, FR-9, FR-12 -->

### 与 REQBOARD_SCHEMA_VERSION = 9 的关系 <!-- serves: FR-9 -->

| 版本号 | 载体 | 取值 | 变更含义 |
|---|---|---|---|
| `REQBOARD_SCHEMA_VERSION` | 台账**记录形态** | **维持 9** | 换后端不改记录形态，故不升；两种后端装配出的 `RequirementRecord` 逐字段等价 |
| `sqlite_schema_version` | SQLite 库（`meta` 表）+ 系统记录 | `1` | 表结构变更才 +1；不匹配 → 503 + 重建指引 |
| 插件版本 | `package.json.version`（S-9 单一来源） | 现 `0.1.0` | 启动比对写 `upgrade` 事件 |
| 设置文件 / 系统记录 `schemaVersion` | 各自文件头 | `1` | 未知 → 设置全默认（记 `settings-invalid`）／记录跳过未知字段 |

**端口签名零改动**：`RequirementStore` / `TaskStore` / `DocRepository` 一个方法都不加不减；`SqliteRequirementStore` 是**新增实现**而非新端口。既有 13 个工具、全部 HTTP 路由的处理逻辑不变（只多挂一个 settings 路由）。

### 分叉检出与重建 <!-- serves: FR-13 -->

启动期刷新 `stores` 快照时做**两处比较**，任一不符即判分叉：

| 比较 | 左 | 右 | 判据 |
|---|---|---|---|
| 条数 | `stores.shards.requirements` | `stores.sqlite.requirements` | 不等 → 分叉 |
| 时间 | 分片 `headRevision` 对应的最近写入 | `stores.sqlite.migratedAt` | 分片晚于库的迁移时刻 → 分叉（库落后） |

检出结果：标 `stale: true` + 写 `staleReason`（谁比谁多/旧多少），并在**启动日志**与**系统记录**里给出同一句结论——「**重启前需重跑迁移**（全量重建）」。设置页按同一份数据渲染警示。

**算法纪律（已裁定）**：**不做静默合并、不做增量对账**——全量重建（S-7）是唯一算法。理由：本次是"切换后端"而非"双写同步"，增量会引入两套时钟与冲突解决，收益为零；而"把两份数据合起来猜哪个更新"正是丢数据的那类操作。分叉只**报告**，不自动修。

### 双库并存与回滚 <!-- serves: FR-6, FR-9, FR-12 -->

- **并存期判据**：只有 `settings.storage.backend` 指到的那一侧被**构造**；另一侧文件**根本不被打开**（无锁竞争、无双写）。这比"双写"简单且本次无一致性需求。
- **回滚路径**：切回 `json`（同样经确认门）→ 重启 → 分片重新生效。分片目录在迁移的**任何**路径下都未被写过，故回滚**不需要数据操作**；SQLite 文件与备份目录保留不删（系统记录的 `paths` 里可查）。
- **删文件的容错**（FR-17）：删系统记录 → 下次启动重建（历史丢失，属档案文件固有代价，屏上会显示"首次记录"）；删设置文件 → 全部回落默认，**不影响既有需求数据**。
- **不做**（边界）：队列 `queue.json` 不切库；不做运行中热切换；不引入第三方驱动。

## 实施顺序与验收锚点 <!-- serves: FR-7, FR-8, FR-10, FR-17 -->

| 序 | 落地物 | 验收锚点（可跑） |
|---|---|---|
| 1 | `limits.ts` 两个常量 + `resolve-settings.ts`（S-1） | `npx vitest run tests/reqboard/settings-file.test.ts` 全绿（四级优先级三态 + 非法键作废不整份回退） |
| 2 | `FileSettingsStore`（S-2）+ 路由 GET/PATCH（S-11 前两条） | 同上的路由用例：非法值 400 带范围、体里带 `storage.backend` → 400 |
| 3 | `run-limit.ts` + `round-state.ts` 改造（S-8） | `npx vitest run tests/dive-round-state.test.ts` 保持绿（**未安装 = 旧值 1000**）；新增用例：装上 800 → 800 |
| 4 | `sqliteSchema.ts` + `SqliteRequirementStore`（S-5/S-6） | `npx vitest run tests/reqboard/store-contract.test.ts`：注册表加 `suites:['read','write']` 一行后三实现全绿 |
| 5 | `SystemRecordFile` + `reconcileVersion`（S-3/S-4） | `npx vitest run tests/reqboard/settings-init.test.ts`：删两份文件后启动 → 记录**被建**且含 `startup`；设置文件**仍不存在**（断言不存在） |
| 6 | `migrationGate` 扩展（S-10）+ `envelope.ts` 映射 | `npx vitest run tests/reqboard/migration-gate.test.ts`：库空/陈旧/正常/全新四相各一例；503 带可复制命令 |
| 7 | 迁移脚本（S-7） | `npx vitest run tests/reqboard/sqlite-migrate.test.ts`：等价 + 失败回滚；**移除回滚分支后该用例必红**（反向演练） |
| 8 | 开窗与投递（S-12/S-13）+ migrate 路由 | 用例替身端口断言：落点不可得 → `REQBOARD_OPEN_WINDOW_UNAVAILABLE`；投递失败 → **不写** `migration` 事件 |

开工前先实测并记录 `npx tsc --noEmit 2>&1 | grep -c 'error TS'` 与 `npx vitest run tests/reqboard tests/application tests/http` 的失败数，作为"零新增"基线。
