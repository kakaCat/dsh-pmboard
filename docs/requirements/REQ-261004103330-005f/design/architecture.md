---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17]
sides: [frontend, backend]
---

# 架构设计：运行设置与可切换存储后端（REQ-261004103330-005f）

## 目标与总体方案 <!-- serves: FR-1, FR-2, FR-6 -->

一句话：在**不改记录形态**的前提下，把"运行期可调的三件事"（阶段回合上限 / 存储后端 / 系统档案）从代码里搬到设置文件与看板上，并把"切换后端"做成一条**装配期决策 + 人工确认 + Agent 执行 + 可回滚**的受控链路。

三条贯穿全程的原则：

| 原则 | 含义 | 落在哪 |
|---|---|---|
| 配置 = 意志，记录 = 事实 | 设置文件只写"人想要什么"；系统记录只写"实际发生了什么" | FR-1 / FR-14 / FR-17 |
| 切换只在装配期 | 运行中绝不换存储实现（半途换 = 丢写） | FR-6 |
| 失败要响亮 | 档案设施坏了不阻断看板，但必须报出来；迁移失败一律回滚并报红 | FR-10 / FR-17 |

```
       ┌────────────────────── 组合根 src/index.ts（装配期） ──────────────────────┐
       │  ① 读设置（settings.json > plugin config > env > default）               │
       │  ② preflightLedger（迁移门扩展：库空/陈旧/NOT_READY）                     │
       │  ③ 按 backend 选实现：ShardedRequirementStore | SqliteRequirementStore    │
       │  ④ 初始化系统记录（不存在即建 + 首条 startup）                             │
       └───────┬───────────────────────────────┬─────────────────────────────────┘
               │                               │
      ┌────────▼────────┐             ┌────────▼─────────┐
      │ 端口 application │             │ HTTP 路由层       │
      │ SettingsStore    │             │  /settings*       │
      │ SystemRecordStore│             │  （薄层 + 信封）   │
      │ RequirementStore │             └────────┬─────────┘
      └────────┬─────────┘                      │
               │                                │
      ┌────────▼─────────┐             ┌────────▼─────────┐
      │ Dive 回合判定     │             │ client 设置弹窗   │
      │ roundLimitFor()  │◀── 内存快照 ─┤ 四屏 + 确认门     │
      └──────────────────┘             └──────────────────┘
```

## 模块改动地图 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

新增：

| 路径 | 职责 | 类型 |
|---|---|---|
| `src/application/settings/resolve-settings.ts` | 纯函数：优先级合并 + 校验 + 逐项来源标注 | 新增 |
| `src/application/settings/events.ts` | 系统记录事件类型与写入载荷构造（纯函数） | 新增 |
| `src/adapters/FileSettingsStore.ts` | 设置文件读写（原子替换 + 订阅） | 新增 |
| `src/adapters/SystemRecordFile.ts` | 系统记录追加写（幂等 + 失败降级） | 新增 |
| `src/repositories/SqliteRequirementStore.ts` | `RequirementStore` 的 SQLite 实现 | 新增 |
| `src/repositories/sqliteSchema.ts` | DDL 与迁移版本常量（`sqlite_schema_version`） | 新增 |
| `src/http/routers/settings.ts` | 5 条设置类路由 | 新增 |
| `src/client/settings-dialog.ts` + `src/client/styles/settings.ts` | 设置弹窗（四屏 / 确认门 / 迁移进度） | 新增 |
| `scripts/migrate-ledger-to-sqlite.ts` | 一次性迁移（备份→建库→迁移→校验→写设置） | 新增 |

修改：

| 路径 | 改动 |
|---|---|
| `src/application/ports.ts` | 新增 `SettingsStore` / `SystemRecordStore` 端口（`RequirementStore` 不动） |
| `src/plugin-config.ts` | `PluginConfig` 增 `stageMaxRounds?` 与 `storage?: { backend?, sqlitePath? }` |
| `src/index.ts` | 装配期：读设置 → 选后端 → 初始化系统记录 → 挂 settings 路由 |
| `src/application/dive/round-state.ts` | `roundLimitFor` 从静态表改为读**内存设置快照**（保持同步签名，见下） |
| `src/application/dive/stage-configs.ts` | 语义降级为"**默认值表**"，不再是唯一权威 |
| `src/repositories/migrationGate.ts` | 扩展第三种"未就绪"：SQLite 库空/陈旧（沿用既有三相范式） |
| `src/http/routes.ts` | 挂载 settings 路由 + 依赖注入 |
| `tests/reqboard/store-contract.test.ts` | `IMPLEMENTATIONS` 注册 SQLite 实现（`suites: ['read','write']`） |

## 存储后端选择与装配 <!-- serves: FR-6, FR-12, FR-17 -->

装配期顺序（**唯一**决定后端的地方）：

```
① 解析 backend = settings.storage.backend ?? config.storage.backend
                 ?? env.PMBOARD_STORAGE ?? 'json'          → 记 source
   （设置文件 = `<dshHome>/dsh-reqboard-settings.json`；系统记录 = `<dshHome>/dsh-reqboard-system.json`；
     库文件缺省 = `<dshHome>/reqboard.sqlite`；三处路径都由 `dshHomePath()` 解析，不各写一份）
② preflightLedger 扩展判定：
     meta.json 在         → 相 1 正常（分片）
     backend=sqlite 且库有效 → 相 1 正常（sqlite）
     backend=sqlite 且库空/不存在 且分片非空 → 相 2 未就绪（REQBOARD_REQUIRES_SQLITE_MIGRATION）
     单册在、meta 不在    → 相 2 未就绪（既有 REQUIRES_MIGRATION）
     三者皆空             → 相 3 全新安装（正常启动，空数据）
③ 按 backend new 出实现 → 注入 routes / tools / dive
④ 系统记录（`<dshHome>/dsh-reqboard-system.json`）：不存在即创建，写 plugin + paths + active + 首条 startup
```

为什么**不做**运行时热切换（设计取舍，写明以免日后被"优化"掉）：`deps.requirementStore` 是**宿主级单例**，被 routes、13 个工具、Dive 驱动器、SSE 订阅同时持有；运行中替换会留下"旧实现仍在写、新实现已在读"的窗口——本仓踩过同类静默丢数据事故。切换只发生在装配期，是**结构性防线**，不是省事。

## 设置解析链与内存快照 <!-- serves: FR-1, FR-2, FR-6 -->

```
settings.json ─┐
plugin config ─┼─▶ resolveRunSettings()（纯函数）─▶ 生效值 + 每项 source
env vars ──────┤                                      │
内置默认表 ─────┘                                      ▼
                                          SettingsStore.snapshot()（内存快照）
                                                      │
                          ┌───────────────────────────┴────────────────────┐
                          ▼                                                ▼
             roundLimitFor(stage)（同步读快照）                GET /settings（异步读快照）
```

**关键约束：`roundLimitFor` 是同步函数**（`round-driver` 在回合判定的热路径上调用它），端口却是异步的。因此设计为：**装配期加载一次 → 内存快照 → 变更时刷新**，绝不在热路径上 await。

**上限下调的边界语义（口径决定，2026-10-04）**：若某需求 `roundsInStage` 已 ≥ 新上限 → **下一回合判定即停手**并如实置停手原因（"已达上限"），**不中断正在执行的那一回合**；若 `roundsInStage` < 新上限则照常续跑。三路刷新见下。

刷新触发：① `PATCH /settings` 成功后本进程内直接更新快照并广播；② 订阅设置文件变更（fs.watch 或轮询 mtime，轮询周期取既有 `panelSettings.refreshMs` 同量级），覆盖"人手改文件"的情形；③ 文件读取失败 → 保留上一份快照并**响亮告警**，绝不静默退回默认值（那会让上限突然从 300 变回 1000）。

## 系统记录写入点 <!-- serves: FR-14, FR-15, FR-16 -->

| 事件 | 写点 | 载荷要点 |
|---|---|---|
| `startup` | 装配期末尾 | backend / source / requirements 条数 / 检出陈旧库标记 |
| `upgrade` | 装配期早于 startup | from/to 版本 + 两侧构建指纹（**版本变更才写**） |
| `migration` | 迁移脚本结束 | result / 条数 / 耗时 / 备份目录 / 窗口键 / 确认人 |
| `backend-switched` | `POST /settings/storage/switch` 落章后 | from/to / reason / 确认人 / 是否保留源数据 |
| `settings-invalid` | 设置文件解析失败或字段非法 | 原因 + 回落后的来源 |

写入纪律：**只追加、不覆盖**；`history` 上限 500 条（超出丢最旧并在 `counters.truncated` 记数）；文件不存在 → 创建（FR-17）；写入失败 → 记日志 + 在「系统记录」屏可见的降级标记，**不抛断启动**。

## 初始化与失败处理 <!-- serves: FR-17, FR-12 -->

| 对象 | 初始化时机 | 文件已存在时 | 失败时 |
|---|---|---|---|
| 系统记录 | 装配期（自动） | 只追加/更新 `updatedAt`，不覆盖 | 不阻断启动；日志 + 屏上红字 + 丢弃计数 |
| 设置文件 | 首次 `PATCH` / 首次确认切库（惰性） | 合并写入（保留未提及的键） | `500`，消息含路径与原因，快照不变 |
| SQLite 库 | 迁移脚本内建库建表 | 先备份再重建（陈旧库） | 事务回滚；源分片与设置不动 |

## 迁移链路 <!-- serves: FR-10, FR-11, FR-13 -->

```
人 ──点「交给 Agent 处理」──▶ 确认门弹框（列出五步与影响）──取消──▶ 结束（零副作用）
                                   │ 确认（落章：人/时间/插件版本）
                                   ▼
                  宿主 POST /settings/storage/migrate
                                   │ windowOpener.create/fork（实现 = SessionWindowOpener）
                                   │ crossWindowDeliver.createMessage + deliver
                                   │ （实现 = AgentDeliverer；与 reqboard_open_window 的 seed_text 同路）
                                   ▼
   Agent 窗口：备份分片 → 建库建表 → 事务迁移（只读源）→ 校验（条数 + 抽样 5 条）
                                   │                         │
                          校验不过 ─┘                         └─ 校验通过 → 写设置 backend=sqlite
                                   ▼                                        ▼
                     回滚事务 / 源与设置不动                      追加 migration 事件（ok）
                                   ▼                                        ▼
                     面板报红 + 续跑入口                     面板给「重启宿主生效」
```

**为什么路由不直接调 `openWindow` 用例**（实测约束，2026-10-04 核实）：`openWindow(deps, input, exec)` 内部有 `deps.session.requireLiveDriver(exec)`，而 HTTP 路由没有 agent exec 上下文，调不通。故路由直接用**端口**开窗与投递（`WindowOpenerPort` + `CrossWindowDeliveryPort`），与 `reqboard_open_window` 的 `seed_text` 走同一条路；`create` 时**必须**给出项目落点（`workspaceId` 优先、其次 `cwd`），拿不到就响亮失败——绝不在宿主目录静默建窗。

**先落章、后执行（FR-11 的代码级落点）**：确认框由 `UserQuestionPort` 推出，人作答后**作答通道**才落章（`{kind:'human', channel:'board-confirm', sessionId, pluginVersion}`）；`switch` / `migrate` 必须消费"已落章且未消费"的一次性票据，否则 `403 confirmation_required`。关键不对称：**agent 只能 ask、不能 save**——它的工具层没有任何落章能力。

保证等级如实说明：本机 HTTP 无鉴权，故这是**通道约定级**保证（与全仓既有五道人工门同级，路由层 actor 默认 `human`），不是密码学证明；我们能做且必须做的是"不提供 agent 入口 + 执行消费已落章票据 + 留痕可审计"。

组件职责边界：宿主只**开窗与投递**（不自己跑迁移）；迁移脚本只**搬数据与校验**（不改设置文件以外的任何状态）；设置文件的写入由脚本在**校验通过后**执行（把"校验没过却已切换"这种半成品状态从设计上排除）。

## 兼容与回滚 <!-- serves: FR-6, FR-9, FR-12 -->

- 台账记录形态不变，`REQBOARD_SCHEMA_VERSION` 维持 **9**；后端差异只体现在存储层。
- 两库并存期间以"设置文件里的 `backend`"为**唯一生效判据**；另一侧只读保留，不做双写（双写会引入一致性议题，且本次无此需求）。
- 回滚 = 切回 `json` + 重启；分片目录从未被修改过，因此回滚**不需要数据操作**。
- 风险登记：`node:sqlite` 处于 experimental 阶段（API 可能变），故 DDL 与访问收敛在 `sqliteSchema.ts` 一处，便于升级时单点替换。

## 依赖与风险 <!-- serves: FR-7, FR-8, FR-10 -->

| 风险 | 影响 | 处置 |
|---|---|---|
| `node:sqlite` experimental | API 变动 | 集中在 `sqliteSchema.ts`；契约测试挡住语义漂移 |
| 单进程串行写 | 多进程同库并发写 | 边界内不做；库文件加写标记，检测到并发写即报错 |
| 迁移中途进程被杀 | 库半成品 | 迁移在单事务内；重跑先删半成品库（备份保留） |
| 上限快照不刷新 | 改了不生效 | 三路刷新（PATCH 广播 / 文件轮询 / 启动加载）+ 「改动对下一回合生效」的界面文案 |
| 系统记录写坏 | 档案丢失 | 追加写 + 上限 500 + 失败响亮；记录可丢，看板不可瘫 |

## 验收口径 <!-- serves: FR-1, FR-2, FR-7, FR-8, FR-10, FR-12, FR-17 -->

```
npx vitest run tests/reqboard/store-contract.test.ts          # SQLite 实现 read+write 两套件全绿
npx vitest run tests/reqboard/settings-file.test.ts           # 优先级/校验/原子写/损坏回落
npx vitest run tests/reqboard/settings-init.test.ts           # 系统记录自动建；设置文件惰性建
npx vitest run tests/reqboard/sqlite-migrate.test.ts          # 迁移等价 + 失败回滚（反向演练）
npx vitest run tests/reqboard/migration-gate.test.ts          # 迁移门三态（既有用例扩展）
npx tsc --noEmit 2>&1 | grep -c 'error TS'                    # ≤ 开工基线
```

期望：以上命令退出码 0；失败回滚用例在**移除回滚分支**后必须变红（反向演练）。
