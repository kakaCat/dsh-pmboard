---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17]
sides: [frontend, backend]
---

# REQ-261004103330-005f · 看板运行设置：节点执行次数上限 + 数据库开关（含 SQLite 适配实现）

## TL;DR

- **是什么**：给看板加一个"app 系统设置"式的设置弹窗（左侧菜单 + 右侧内容区），管三件事：**节点执行次数上限**、**存储后端开关（JSON 分片 / SQLite）**、**系统记录**（版本档案 / 后端使用史 / 数据路径）。
- **为什么现在做**：阶段回合上限写死在 `stage-configs.ts`（改一次要发版）；存储层只做到"端口化（SQLite 就绪）"，**没有任何 SQLite 实现、没有开关**；切库这件事现在只能靠人肉跑命令。
- **得到什么**：上限在看板上改、下一回合生效；切库点一下（**人工确认后由 Agent 执行迁移与校验**）；出过什么事、数据在哪、哪个版本干的，系统记录里查得到。

## 一句话目标 + 可证伪判定标准

**目标**：把"运行期可调的东西"从代码里搬到设置文件与看板上，并让**切换存储后端**变成一条有据可查、可回滚的受控动作——上限可改、开关可控、Agent 干活、人来确认、系统记录留痕。

**判定标准（跑什么、看到什么算完成）**：

1. `npx vitest run tests/reqboard/settings-file.test.ts tests/reqboard/settings-router.test.ts`（新增）→ 全绿。
   含**来源顺序**三态用例：设置文件 > 插件配置 > 内置默认，逐项来源在响应里可读。
2. `npx vitest run tests/reqboard/store-contract.test.ts` → SQLite 实现已进 `IMPLEMENTATIONS` 注册表且 `suites: ['read','write']`，
   与内存替身、分片实现**同一份断言**全绿（现注册表只登记内存与分片，见「现状证据 E-4」）。
3. `npx vitest run tests/reqboard/sqlite-migrate.test.ts`（新增）→ 迁移 128 条后**条数与 id 全等**、抽样 5 条逐字段一致；
   注入中途失败 → 事务回滚、**源分片与设置文件逐字节未变**（反向演练：去掉回滚分支 → 用例必红）。
4. 上限生效（端到端）：把 `implementing` 上限改成 `5`，用假投递端口驱动一条需求 → `roundsInStage` 到 5 即停手且如实置 `driverHealth`
   （现状：停下前会一直续跑到 1000，见「现状证据 E-1」）。
5. 初始化语义：删掉两份文件后启动 → 系统记录**被自动创建**且含首条 `startup`；设置文件**仍不存在**；
   调一次上限后才出现（`npx vitest run tests/reqboard/settings-init.test.ts`，新增）。
6. 迁移门（拒绝服务）：`backend=sqlite` 且库为空、分片非空 → 启动进"未就绪"，HTTP 503 带可复制指引；
   **绝不返回空台账**（复用 `migrationGate` 的既有范式，见 E-5）。
7. `npx tsc --noEmit 2>&1 | grep -c 'error TS'` → ≤ 开工基线（开工时实测并写进任务卡），改动文件零新增。
8. 回归零新增：`npx vitest run tests/reqboard tests/application tests/http` → 失败数 ≤ 开工基线。

## 业务流程图

```
人 ──点看板右上角「⚙ 设置」──▶ 设置弹窗（左菜单 / 右内容区）
                                  │
        ┌─────────────────────────┼──────────────────────────┐
        │                         │                          │
  ① 运行上限               ② 存储与数据库               ③ 系统记录
  改数字 → 校验 1–10000     选 SQLite（只是选目标）       版本档案 / 后端使用史
        │                         │                      数据路径 / 陈旧库
   PATCH /settings          人工确认门（弹框）                  │
        │                         │ 确认                       │
  settings.json ──▶ 下回合生效  ┌──▼──────────────────┐         │
                              │ 开 Agent 窗口执行迁移 │         │
                              │ 备份→建库→迁移→校验→写设置 │──▶ 追加事件
                              └──┬──────────────────┘         │
                                 │ 成功                        │
                          人重启宿主 ──▶ 后端切换生效 ──────────┘
```

## 产品定义

**是什么**：`dsh-pmboard` 的**运行设置面板**——看板内的一个设置弹窗，按"app 系统设置"的形态组织（左侧分类菜单、右侧内容区、右上角「打开配置文件」），把三类运行期决策收进同一处：每个需求阶段的自动续跑上限、台账数据的存储后端、以及这台机器上"发生过什么"的系统记录。

**核心价值**：
- 上限从"改代码发版"变成"看板上改、下回合生效"——卡住的需求当场放宽，跑飞的需求当场收紧。
- 切库从"人肉跑迁移脚本、心里没底"变成"点一下 → 人工确认 → Agent 备份迁移校验 → 重启生效"，且**失败了源数据分毫不动**。
- 回滚之后仍查得到"以前用过 SQLite、库在哪、谁在什么时候确认的"——没有这份记录，回滚等于抹掉历史。

**与现状的区别**：现状三件事都缺——上限写死（E-1）、无 SQLite 实现与开关（E-2/E-3）、无任何设置读写入口与系统档案（E-5/E-6）。

## 用户与角色

| 角色 | 什么场景用 | 痛点（现状） |
|---|---|---|
| 看板使用者（人 / PM） | 某需求在 implementing 空转、或想试点 SQLite | 上限改不了要发版；切库要自己跑脚本、还要判断库空不空 |
| 迁移 Agent（新窗口） | 人确认后执行"备份 → 建库 → 迁移 → 校验 → 写设置" | 没有这条链路，人得手工照文档操作，容易漏校验 |
| 宿主（插件运行时） | 装配期按设置选存储实现、启动时比对版本并记账 | 后端写死为 JSON 分片，换不了；升级历史无从查起 |
| 下游窗口 / 复盘者 | 排查"为什么这个库是旧的""上次是谁改的后端" | 无系统记录，只能靠翻 shell history 与猜 |

## 边界

- **不做**：任务队列（`docs/requirements/<REQ>/queue.json`）不切到 SQLite——它是跨窗口可见的协作产物，单独立项再说。
- **不做**：运行期热切换存储后端。后端只在装配期选定，改开关一律写设置文件 + **重启宿主**生效。
- **不做**：引入第三方 SQLite 驱动。只用 Node 内置 `node:sqlite`（`DatabaseSync`），前提 Node ≥ 22.5（本机实测 v25.6.1，带 experimental 警告，如实记录不隐藏）。
- **不做**：多用户 / 远程数据库 / 并发多进程写同一库——库是本机单文件，锁语义按单进程串行写队列设计。
- **不做**：改台账记录的对外形态与既有 HTTP 契约；本次只**新增**设置类路由与 `settings`/`system` 相关字段。
- 没写进上述边界的，即本次不做。

## 功能点（需求条款）

### 功能点总览

| 编号 | 功能 | 优先级 |
|---|---|---|
| FR-1 | 运行设置落进 `settings.json`，成为上限与目标后端的唯一持久化载体 | P0 |
| FR-2 | 阶段回合上限可配置：设置文件 > 插件配置 > 内置默认，1–10000 整数，下回合生效 | P0 |
| FR-3 | `GET /settings` 返回生效值 + 每项来源 + 默认值 | P0 |
| FR-4 | `PATCH /settings` 改上限：非法值 400 带指引，成功回落新生效值 | P0 |
| FR-5 | 看板「设置」弹窗：左菜单四屏，非法值当场拦、保存前不落盘 | P0 |
| FR-6 | 存储后端开关：`json` / `sqlite` + `sqlitePath`，装配期选定，写设置文件 + 重启生效 | P0 |
| FR-7 | SQLite 适配器实现 `RequirementStore` 全端口（含写侧、事务 RMW、CAS） | P0 |
| FR-8 | SQLite 实现进契约测试注册表，与既有实现同跑同一份断言 | P0 |
| FR-9 | 两种后端数据形态等价；`REQBOARD_SCHEMA_VERSION` 不升 | P0 |
| FR-10 | 一次性迁移由 Agent 窗口执行：备份→建库→迁移→校验→写设置，失败回滚 | P0 |
| FR-11 | 人工确认门：正反切换都必须人确认并留痕；Agent 不得自行改后端 | P0 |
| FR-12 | 迁移门：库空而分片非空 → 拒绝服务 + 可复制指引 | P0 |
| FR-13 | 陈旧库核对：目标库早于/少于当前分片 → 先备份旧库再重建 | P0 |
| FR-14 | 系统记录文件：路径档案 / 后端使用史 / 迁移回滚事件 / 计数 | P0 |
| FR-15 | PM 插件版本号落档：单一来源 `package.json.version`，写进系统记录顶层 | P0 |
| FR-16 | 升级检测与版本一致性核对：版本变更记 `upgrade` 事件；库 schema 不匹配即报警给重建指引 | P1 |
| FR-17 | 初始化语义：系统记录启动自动建；设置文件惰性建；库只在迁移时建；初始化失败不阻断但响亮 | P0 |

### 详细说明

**FR-1: 运行设置落进 settings.json**

- **谁 / 什么场景**：宿主装配期与看板设置页，都要读写同一份设置。
- **做什么**：`~/.dsh/dsh-reqboard-settings.json`（`schemaVersion: 1`）作为运行设置的唯一持久化载体；写入走"临时文件 + rename"原子替换。
- **看到什么结果**：文件损坏或字段非法时，接口返回**回落后的生效值并标注该来源为 `default`**，同时在系统记录里追加一条 `settings-invalid` 事件——**不静默假装文件没写坏**。
- **契约**：见「数据契约 §1」；路径可经插件配置 `dshHome` 覆盖（与既有 `dshHomePath` 同源）。

**FR-2: 阶段回合上限可配置**

- **谁 / 什么场景**：人发现某需求在某阶段空转或跑飞。
- **做什么**：设置文件里按阶段键（`draft/brainstorming/design/decomposing/implementing/accepting/done/archived/canceled`）给整数上限。
- **看到什么结果**：Dive 每次起轮前读一次上限，**下一个回合**按新值封顶；已在跑的回合不受影响（不打断正在执行的那一次）。取值非法（非整数 / <1 / >10000）一律拒绝。
- **解析顺序（端口承诺）**：设置文件 > 插件配置 `stageMaxRounds` > 内置默认（`STAGE_CONFIGS` 的那张表仍是**默认值的唯一来源**，不复制第二份）。

**FR-3: GET /settings**

- **谁 / 什么场景**：看板设置弹窗打开时。
- **做什么**：`GET /dashboard/api/reqboard/settings`。
- **看到什么结果**：返回 `{ plugin, stageMaxRounds: { <stage>: { value, source, default } }, storage: { backend: { value, source }, sqlitePath, effective, restartRequired }, system: { 摘要 } }`；`source ∈ settings|config|env|default`。看板据此显示"当前来源"徽章。

**FR-4: PATCH /settings**

- **谁 / 什么场景**：人在「运行上限」屏改数字并保存。
- **做什么**：`PATCH /dashboard/api/reqboard/settings`，体 `{ stageMaxRounds?: { <stage>: number } }`。
- **看到什么结果**：非法值 → `400 invalid_input`，消息给出"哪一项、允许范围、怎么改"；成功 → 返回新生效值。
- **刻意不接受** `storage.backend`：后端切换必须走 FR-11 的确认门路由（防止"顺手一个 PATCH 就把库换了"）。

**FR-5: 看板「设置」弹窗**

- **谁 / 什么场景**：人点看板右上角「⚙ 设置」。
- **做什么**：左菜单四屏——**运行上限** / **存储与数据库** / **系统记录** / **通用**；右上角「打开配置文件」（用既有 `openDoc` 打开设置文件）与关闭按钮；ESC / 点遮罩可关。
- **看到什么结果**：
  - 改数字未保存 → 行高亮、来源徽章变「待保存」、底部浮出保存条、左菜单项挂「N 项未保存」；
  - 填 0 / 10001 / 小数 → 当场标红并禁用保存键（**保存前不落盘**）；
  - 泳道头显示该阶段的当前上限，改上限后随之刷新。
- **形态原型**：`docs/requirements/REQ-261004103330-005f/prototype/board-settings.html`（本需求的界面基准）。

**FR-6: 存储后端开关**

- **谁 / 什么场景**：人想从 JSON 分片切到 SQLite（或切回来）。
- **做什么**：设置文件 `storage.backend ∈ {json, sqlite}` 与 `storage.sqlitePath`（默认 `~/.dsh/reqboard.sqlite`）。
- **看到什么结果**：装配期按"设置文件 > 插件配置 > 环境变量 > 内置默认"选定实现；改动只写设置文件并返回 `restartRequired: true`，**当前进程绝不半途换实现**。切回 JSON 时 SQLite 文件**只读保留、不删不动**。

**FR-7: SQLite 适配器**

- **谁 / 什么场景**：装配期选中 `sqlite` 时构造。
- **做什么**：`SqliteRequirementStore implements RequirementStore`，实现 `ports.ts` 全部方法：`get/listComments/listHistory/head/create/mutate/mutateIf/appendComment/sweep/replaceAll/subscribe` + `getSummary/listSummaries/listTriages/peekSummaries/peekFacts/headAfterDrain`。
- **看到什么结果**：`mutate` 的读-改-写在一个事务内完成；`mutateIf` 版本不匹配返回 `REQBOARD_CONFLICT`（**不静默覆盖**）；错误码沿用 `REQUIREMENT_STORE_ERROR` 那张表。
- **表结构**：与分片目录一一对应——`requirements`（标量 + 计数）、`comments`、`history`、`meta`（revision / triages）、`archived`（冷侧），大字段按需取回（对齐 `shardAssembly` 的装配语义）。

**FR-8: 契约测试同跑**

- **谁 / 什么场景**：任何一次 `pnpm test`。
- **做什么**：把 SQLite 实现注册进 `tests/reqboard/store-contract.test.ts` 的 `IMPLEMENTATIONS`，声明 `suites: ['read','write']`。
- **看到什么结果**：同一份断言同时跑内存替身、分片实现、SQLite 实现，三个全绿；**只用一个临时库文件，测试互不污染**。

**FR-9: 数据形态等价**

- **谁 / 什么场景**：迁移校验与回滚判据。
- **做什么**：两种后端对同一批记录产出**逐字段等价**的 `RequirementRecord`（含大字段、评论、历史、`dive`/`advance`/`artifacts`/`tokenUsage`）。
- **看到什么结果**：`REQBOARD_SCHEMA_VERSION` **维持 9 不升**（换后端不改记录形态）；等价性由 FR-8 的同一份断言 + FR-10 的抽样比对双证。

**FR-10: 一次性迁移（由 Agent 执行）**

- **谁 / 什么场景**：人在设置页点「交给 Agent 处理」并确认后。
- **做什么**：宿主开一个 Agent 窗口（复用 `reqboard_open_window`），投递任务：`scripts/migrate-ledger-to-sqlite.ts --from <分片根> --to <库文件>`；脚本按序执行**备份 → 建库建表 → 事务迁移 → 校验 → 写设置**。
- **看到什么结果**：面板显示窗口键（可跳转）与五步进度；成功后写 `storage.backend = sqlite` 并追加系统记录；失败则**回滚事务、源分片与设置文件不动**，面板变红并给续跑入口。重试同样要再过确认门。

**FR-11: 人工确认门**

- **谁 / 什么场景**：切到 SQLite 前、切回 JSON 前、迁移失败后重试前。
- **做什么**：看板弹二次确认框，逐条列出"要做什么 / 动什么 / 不动什么"，人选「确认执行」或「取消」。
- **看到什么结果**：确认后落章留痕（确认人、时间、**插件版本**、动作），写进系统记录 `history`；**取消则不开窗口、不写任何文件**。Agent 侧**没有任何**"自己改后端"的入口（代码级拒绝，不是靠提示词自律）。

**FR-12: 迁移门（拒绝服务）**

- **谁 / 什么场景**：已选 `sqlite` 但库是空的，而分片里有数据，此时启动宿主。
- **做什么**：装配期预检——库空 + 分片非空 → 进"未就绪"态。
- **看到什么结果**：HTTP 503 + 可复制指引（跑哪个脚本 / 用哪个按钮），**绝不静默起一个空台账**（对齐 `migrationGate.ts` 的既有范式与"600 条任务消失"事故教训）。

**FR-13: 陈旧库核对**

- **谁 / 什么场景**：机器上曾经迁过 SQLite、后来回滚了，库文件还留着旧数据。
- **做什么**：对比"库里的条数 / 迁移时刻"与"当前分片"，判定 `stale`。
- **看到什么结果**：设置页明示「检出旧库（N 条 · 日期，比当前分片旧 M 条）：先备份旧库再重建」；**禁止**把陈旧库当现状直接启用。

**FR-14: 系统记录文件**

- **谁 / 什么场景**：切换后端前后、排查问题、复盘。
- **做什么**：`~/.dsh/dsh-reqboard-system.json`（`schemaVersion: 1`，追加式）记四块：`paths`（实际解析到的路径 + 备份目录）、`active`、`stores`（各载体条数/字节/陈旧判定）、`history` + `counters`。
- **看到什么结果**：设置页「系统记录」屏能看到后端使用史时间线（含**以前用过的 SQLite**）与数据路径档案；记录只追加不裁剪。
- **契约**：见「数据契约 §2」与示例文件 `prototype/system-record.example.json`。

**FR-15: PM 插件版本号落档**

- **谁 / 什么场景**：任何一次启动、任何一次迁移。
- **做什么**：版本号单一来源 = `package.json` 的 `version`（运行时读取，不手写第二份），落进系统记录顶层 `plugin` 块（`name/version/buildStamp/sqliteSchemaVersion`）。
- **看到什么结果**：看板页头、「通用」屏、`GET /settings`、以及 `history` 每条事件都带版本，能回答"这次迁移是哪个版本的插件干的"。

**FR-16: 升级检测与版本一致性核对**

- **谁 / 什么场景**：插件升级后首次启动；或准备复用旧库时。
- **做什么**：启动时比对"当前版本 vs 记录里的版本"，不同即追加 `upgrade` 事件（from/to + 两侧构建指纹）并刷新顶层版本字段；再核对"库写入时的版本 / `sqlite_schema_version`"。
- **看到什么结果**：一致 → 绿字"旧库可直接用于重建"；不一致 → 报警并给**重建库**指引，**不许硬读旧表**（避免把数据读坏）。版本号变更**不得静默覆盖**，否则升级历史查不出来。

**FR-17: 初始化语义（谁建、何时建）**

- **谁 / 什么场景**：首次安装、插件升级后首次启动、以及"人第一次改设置"。
- **做什么**：按"这是**事实**还是**意志**"分三套策略——
  1. **系统记录 = 插件启动自动初始化**：装配期发现文件不存在即创建，写入 `plugin` / `paths` / `active` 与**首条 `startup` 事件**。理由：它记的是事实，"首次启动"本身就是第一条事实；惰性创建会让新装与刚升级时——最需要它的时刻——打开设置页什么都看不到。
  2. **设置文件 = 惰性创建**：不存在即全走默认值，**不建文件**；直到人第一次 `PATCH` 或第一次确认切换后端才落盘。理由：自动写默认值等于**把默认值冻进文件**——日后我们把 `implementing` 默认从 1000 调成 300，用户拿到的仍是被抄下来的 1000，且**分不清是人改的还是插件抄的**。
  3. **SQLite 库 = 迁移时建库建表**：不在装配期"顺手"建空库——那会让"空库 / 没迁移"的判定变含糊，正是 FR-12 要拦的最危险开局。`backend=sqlite` 而库不存在 → 按 FR-12 进未就绪并给指引。
- **看到什么结果**：
  - 自动初始化**幂等**：文件已存在则只追加/更新 `updatedAt`，绝不覆盖既有内容；只写事实，不改变任何运行行为。
  - 全新安装（既无分片也无库）仍是"正常启动"（沿用 `preflightLedger` 三相的第三相），首条 `startup` 记 `requirements: 0`，看板不报错。
  - 初始化失败（权限/磁盘）**不阻断插件启动**——看板不能因为档案设施坏掉就整体不可用；但必须**响亮**：写日志，且在「系统记录」屏红字显示「记录不可写（原因）」与「已丢弃 N 条事件」。
- **判定（可跑）**：删掉两份文件后启动 → 系统记录**被自动创建**且含首条 `startup`；设置文件**仍不存在**（断言文件不存在）；调一次上限后才出现。

## 数据契约

### 1. 设置文件 `~/.dsh/dsh-reqboard-settings.json`

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|
| `schemaVersion` | `1` | 是 | `1` | 结构版本；未知版本 → 按默认值生效并记 `settings-invalid` |
| `stageMaxRounds` | `Record<stage, number>` | 否 | 空对象 | 仅覆盖写进来的键；值须为 1–10000 整数 |
| `storage.backend` | `'json' \| 'sqlite'` | 否 | `json` | 目标后端（**写入前必须过人工确认门**） |
| `storage.sqlitePath` | `string` | 否 | `~/.dsh/reqboard.sqlite` | 相对路径按 `dshHome` 解析 |
| `updatedAt` | `string` (ISO) | 否 | — | 最后一次写入时间 |

### 2. 系统记录 `~/.dsh/dsh-reqboard-system.json`

| 块 | 内容 | 写点 |
|---|---|---|
| `plugin` | `name / version / buildStamp / sqliteSchemaVersion / recordedAt` | 每次启动（版本变更时先记 `upgrade`） |
| `paths` | `shardDataRoot / sqliteFile / settingsFile / legacyLedger / backupDirs[]` | 装配期（实际解析值） |
| `active` | `backend / since / source` | 后端切换与启动 |
| `stores` | `shards{...}`、`sqlite{... , stale, staleReason}` | 启动 + 每次迁移后 |
| `history[]` | `startup / upgrade / migration / backend-switched / settings-invalid`，各带 `plugin` 与 `confirmedBy` | 对应动作发生时 |
| `counters` | `migrations / migrationsFailed / rollbacks / upgrades / lastStartupAt / lastMigrationAt` | 随事件更新 |

完整示例见 `docs/requirements/REQ-261004103330-005f/prototype/system-record.example.json`。

### 3. 兼容与迁移

- 台账记录形态**不变**，`REQBOARD_SCHEMA_VERSION` 维持 9；两库并存期间以"设置文件里的 `backend`"为唯一生效判据。
- **新文件，但初始化策略不同**（见 FR-17）：系统记录**启动自动创建**（不存在即写 `plugin`/`paths`/首条 `startup`）；设置文件**惰性创建**（不存在 = 全默认，不建文件；人第一次改动才落盘）。
- 删掉任一份文件都**不报错、不影响既有需求数据**：系统记录会被重建（历史随之丢失，这是"档案文件"的固有代价，已在 FR-14 的保留策略里写明）。
- 旧调用方零改动：既有工具与 HTTP 路由签名不动。

## 接口契约

| 方法 | 路径 | 体 / 查询 | 成功 | 失败 |
|---|---|---|---|---|
| GET | `/dashboard/api/reqboard/settings` | — | `200 { plugin, stageMaxRounds, storage, system }` | — |
| PATCH | `/dashboard/api/reqboard/settings` | `{ stageMaxRounds? }` | `200 { stageMaxRounds, restartRequired:false }` | `400 invalid_input`（含范围与改法） |
| POST | `/dashboard/api/reqboard/settings/storage/switch` | `{ backend, reason? }` | `200 { backend, restartRequired:true }` | `400`（值非法）／`409`（迁移未完成） |
| POST | `/dashboard/api/reqboard/settings/storage/migrate` | `{}` | `200 { windowKey, sessionId }` | `409`（已有迁移在跑）／`503`（未就绪） |
| GET | `/dashboard/api/reqboard/settings/system` | `?limit=` | `200 { plugin, paths, active, stores, history, counters, compat }` | — |

**新增端口**（`src/application/ports.ts`）：

- `SettingsStore`：`read()`（合并默认后的生效值 + 每项来源）、`update(patch)`（校验 + 原子写）、`subscribe(fn)`。
- `SystemRecordStore`：`read()`、`append(event)`（追加 + 计数 + `updatedAt`）、`snapshot()`。
- `RequirementStore` 新增第二个生产实现 `SqliteRequirementStore`（端口不变，只加实现）。

## 迁移与回滚路径

```
JSON 分片（生效）                    SQLite（目标）
   │                                    │
   │ ① 人点确认 ──▶ Agent: 备份分片 ────▶ ~/.dsh/backups/reqboard-<时间戳>/
   │ ② 建库建表 ─────────────────────────▶ ~/.dsh/reqboard.sqlite
   │ ③ 事务迁移 128 条 ──────────────────▶ 只读源分片，不改不删
   │ ④ 校验条数 + 抽样逐字段 ─── 不过 ──▶ 回滚事务、不写设置、报红
   │ ⑤ 写设置 storage.backend=sqlite
   ▼
人重启宿主 ──▶ SQLite 生效
   │
   └─ 回滚：设置页切回 json（同样过确认门）──▶ 重启 ──▶ 分片重新生效
                                              库文件与备份保留不删
```

- **可回滚**：单向切换随时可逆，源数据在任何失败路径下都不被修改。
- **不可逆点**：无（备份与库都保留；设置文件可改回）。

## 场景总览

| 场景 | 触发 | 现状 | 由哪条 FR 解决 |
|---|---|---|---|
| S1 | 需求在 implementing 空转，想收紧上限 | 上限写死 1000，改要发版 | FR-1/2/4/5 |
| S2 | 想试点 SQLite | 无实现、无开关 | FR-6/7/8/9 |
| S3 | 试点后想回滚 | 无人确认门、无回滚路径 | FR-6/11 |
| S4 | 切库后忘了迁移就重启 | 空台账风险（历史事故） | FR-12 |
| S5 | 以前迁过 SQLite，库是旧的 | 无从判断库新不新 | FR-13/14 |
| S6 | 排查"上次是谁改的后端、哪个版本" | 无任何档案 | FR-14/15 |
| S7 | 插件升级后是否还能用旧库 | 无版本核对 | FR-16 |
| S8 | 迁移中途失败 | 手工跑脚本，失败半途而废 | FR-10 |
| S9 | 新装 / 刚升级，想确认"现在用哪个后端、数据在哪" | 无任何档案，只能猜 | FR-14/15/17 |
| S10 | 默认值日后被我们调整，用户却还吃旧值 | 无设置文件时天然正确；一旦自动抄写默认值就会冻住 | FR-17 |

## 现状证据（E）

- **E-1 上限写死**：`src/application/dive/stage-configs.ts:27-102` 的 `STAGE_CONFIGS` 硬编码 `maxRounds`；消费点 `src/application/dive/round-state.ts:208`（`roundLimitFor`）与 `src/application/dive/round-driver.ts:420`。
- **E-2 后端写死**：`src/index.ts:194` 直接 `new ShardedRequirementStore({ root: dataRoot })`，无分支、无开关。
- **E-3 无 SQLite 实现**：全仓 `grep -rn 'sqlite' src` 只命中注释与文档；`src/repositories/` 下无 sqlite 文件。
- **E-4 契约测试注册表**：`tests/reqboard/store-contract.test.ts` 的 `IMPLEMENTATIONS` 现登记内存替身与分片实现（另有只读假 SQL 替身），SQLite 实现待入场。
- **E-5 迁移门范式可复用**：`src/repositories/migrationGate.ts`（三相启动：正常 / 未就绪 / 全新安装）——FR-12 按同一范式扩一种失败。
- **E-6 无设置入口**：`src/http/routers/` 只有 artifacts / injection / isolation / knowledge / requirements / shared / stages / tasks / verdicts，无 settings；client 侧无设置页。
- **E-7 运行时前提**：本机 `node -v` = v25.6.1，`node -e "require('node:sqlite')"` 可用（仅 experimental 警告）。

## 已定决策与待裁定项

**已由用户确认（2026-10-04 四问）**：节点口径 = 需求阶段；作用域 = 全局一份设置；数据库开关 = 只切台账、写设置 + 重启生效、附一次性迁移；驱动 = Node 内置 `node:sqlite`。

**按推荐采纳、请在确认门一并裁定**：

1. 人工确认通道 = **看板弹框确认**（复用既有确认门范式落章留痕），而非"设置页手动勾选"。
2. 系统记录文件名 = `~/.dsh/dsh-reqboard-system.json`（与 `dsh-reqboard.json` / `dsh-reqboard-settings.json` 同族）。
3. 「系统记录」屏提供**原始 JSON 查看/导出**入口（排查用，成本极低）。

**本轮反馈处理（2026-10-04，确认门未通过时的用户意见原文「按照插件自动初始化还是如何处理」）**：

用户问的是**初始化语义**（这两份文件谁建、什么时候建）。已裁定为 FR-17 的三套策略：系统记录**启动自动建**、设置文件**惰性建**、库**迁移时建**；失败不阻断但响亮。判据是"事实 vs 意志"——自动初始化只许写事实，不许替人写意志（否则默认值被冻进文件、且无法区分来源）。

**流程路径说明**：本需求改动面大（新增子系统 + 动装配 + 新增数据契约），**不走轻档**——按重档写全：接口、数据契约、迁移与回滚、可跑判定标准均已在上文给出。

## 原型（界面基准）

- `docs/requirements/REQ-261004103330-005f/prototype/board-settings.html`（四屏 + 确认门 + Agent 迁移各态；`?flat=1` 整屏展开，`?pane=` / `?confirm=` / `?migrate=` 直达各态）
- `docs/requirements/REQ-261004103330-005f/prototype/system-record.example.json`（系统记录契约示例）
- 预览图：`preview-limits.png` / `preview-storage.png` / `preview-agent-idle.png` / `preview-confirm.png` / `preview-agent-running.png` / `preview-agent-done.png` / `preview-records.png` / `preview-general.png`

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | 🔴 **未被接收** | — |
| FR-2 | 🔴 **未被接收** | — |
| FR-3 | 🔴 **未被接收** | — |
| FR-4 | 🔴 **未被接收** | — |
| FR-5 | 🔴 **未被接收** | — |
| FR-6 | 🔴 **未被接收** | — |
| FR-7 | 🔴 **未被接收** | — |
| FR-8 | 🔴 **未被接收** | — |
| FR-9 | 🔴 **未被接收** | — |
| FR-10 | 🔴 **未被接收** | — |
| FR-11 | 🔴 **未被接收** | — |
| FR-12 | 🔴 **未被接收** | — |
| FR-13 | 🔴 **未被接收** | — |
| FR-14 | 🔴 **未被接收** | — |
| FR-15 | 🔴 **未被接收** | — |
| FR-16 | 🔴 **未被接收** | — |
| FR-17 | 🔴 **未被接收** | — |

> 🔴 **未被接收（17 条）**：FR-1、FR-2、FR-3、FR-4、FR-5、FR-6、FR-7、FR-8、FR-9、FR-10、FR-11、FR-12、FR-13、FR-14、FR-15、FR-16、FR-17

<!-- reqboard:marks:end -->
