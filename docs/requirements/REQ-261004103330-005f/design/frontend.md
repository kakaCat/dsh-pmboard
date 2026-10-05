---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17]
sides: [frontend]
---

# 前端设计：看板运行设置弹窗（REQ-261004103330-005f）

> 界面基准：`docs/requirements/REQ-261004103330-005f/prototype/board-settings.html`（可点、四屏 + 确认门 + Agent 迁移各态）。
> 本文只写前端：DOM 结构、状态机、数据流、样式与响应式。**新增零第三方依赖**。
> 口径来源：`design/interfaces.md`（路由与 `api.ts` 函数名）、`design/data-model.md`（字段名）、`requirement.md` FR-5/10/11/17。

## 原型页面 <!-- serves: FR-5 -->

原型即交互稿：`docs/requirements/REQ-261004103330-005f/prototype/board-settings.html`（978 行，自包含、不进构建）。

| 直达态 | 参数 | 看什么 |
|---|---|---|
| 运行上限 | `?pane=limits` | 9 行阶段表、来源徽章、脏态与非法值标红 |
| 存储与数据库 | `?pane=storage&backend=sqlite` | 后端开关、旧库警示、交给 Agent 按钮 |
| 确认门 | `&confirm=migrate` | 二次确认框（五条动作清单 + 取消零副作用） |
| 迁移中/完成 | `&migrate=running` / `&migrate=done` | 五步清单、窗口键、结论与重启提示 |
| 系统记录 | `?pane=records` | 后端使用史时间线、路径档案、版本一致性核对 |
| 整屏走查 | `&flat=1` | 弹窗按内容自然展开（评审截图用） |

交互路径：看板页头 `⚙ 设置` → 弹窗；左菜单切四屏；屏 2 选 SQLite → 点「交给 Agent 处理」→ 确认门 → 确认后 `POST …/migrate` → 五步进度 → 完成态给重启提示；ESC / 点遮罩 / ✕ 关闭。

**实现时必须改的三处原型偏差**（原型是独立 HTML，不受本仓约束）：

1. **类名全部加 `dsh-pm-set-` 前缀**。原型用了 `.dlg` / `.card` / `.pane` / `.badge` / `.notice` / `.seg2` / `.agent-box` / `.tl` / `.kv` 等**无前缀**类名——与宿主 shell 同页会互相命中，违背本插件「`dsh-pm-` 前缀隔离」约定（见 `src/client/styles/base.ts` 头注与 `docs/knowledge/design-tokens.md` 的 121 组前缀）。
2. **阶段中文名与阶段集合以 client 常量为准**，不抄原型字面量：`STATUS_LABELS`（`src/client/render/dom-utils.ts:15`）里 `done`/`archived`/`canceled` 是「完成 / 归档 / 取消」，且泳道只有 6 个 `LANE_STATUSES`（`done` 并入验收泳道）；上限表列 **9 个阶段**，泳道头徽章只挂 **6 个泳道阶段**。
3. **不要自造 toast**。原型用浮层 toast；本插件没有 toast 组件，改成弹窗内 `dsh-pm-set-status`（`aria-live="polite"`）行内状态区，避免引入第二套视觉体系。

## 目录与包结构 <!-- serves: FR-5 -->

```
src/client/
├── settings/                    ← 本需求新增（弹窗自包含模块）
│   ├── types.ts                 视图模型类型（ResolvedRunSettings 的 client 侧窄投影等）
│   ├── model.ts                 纯函数：草稿/校验/脏态/焦点序/文案装配（零 DOM、零 IO）
│   ├── render/
│   │   ├── shell.ts             弹窗骨架 + 左菜单 + 确认门 DOM 字符串
│   │   ├── limits.ts            屏 1 运行上限（表格 + 保存条）
│   │   ├── storage.ts           屏 2 存储与数据库（开关 + 迁移卡四态）
│   │   ├── records.ts           屏 3 系统记录（时间线 + 路径档案 + 版本核对）
│   │   └── general.ts           屏 4 通用（只读运行信息）
│   └── controller.ts            挂载/DOM 事件委派/取数/轮询 dispose（唯一有副作用的文件）
├── styles/
│   ├── settings.ts              ← 新增 CSS 分片（预算 ≤380 行；超限则按下方「拆分触发线」再拆）
│   └── settings-agent.ts        ← 仅在需要时创建：确认门 + 迁移卡 + 时间线样式
├── styles.ts                    改动：CSS 拼接行追加 SETTINGS_CSS（+ 可选 SETTINGS_AGENT_CSS）
├── api.ts                       改动：追加 5 个函数（interfaces.md 已定名）
└── views/board.ts               改动：`buildBoard` 追加第 6 个可选参数（泳道头上限徽章）
```

| 路径（完整相对路径） | 内容（一句话职责） | 新增/改动 | 落此处的理由（为什么不放别处） |
|---|---|---|---|
| src/client/settings/types.ts | 弹窗视图模型类型 | 新增 | 只被 settings/ 内部与测试引用，不外泄到 views/ |
| src/client/settings/model.ts | 纯函数状态机（草稿/校验/焦点/文案） | 新增 | 与 `views/*` 同款「纯字符串/纯函数」纪律：Node 环境可直接单测 |
| src/client/settings/render/*.ts | 五个纯渲染器（含确认门） | 新增 | 与 `views/*` 同构；拆 5 文件是为满足 `tests/size-budget.test.ts` 的 400 行门禁 |
| src/client/settings/controller.ts | 挂载、事件委派、取数、轮询、dispose | 新增 | 唯一有副作用的文件，隔离在 `settings/` 内，不撑大 `board-mount.ts`（已 905 行且在尺寸白名单内） |
| src/client/styles/settings.ts | 弹窗样式分片（真令牌、`dsh-pm-set-` 前缀） | 新增 | 沿用 `styles/*` 分片 + `styles.ts` 拼接的既有机制（REQ-47939a t12） |
| src/client/api.ts | 5 个设置类请求函数 | 改动 | 沿用既有 `get/post/unwrap/ApiError`，不新增第二套错误处理 |
| src/client/views/board.ts | 泳道头显示阶段上限 | 改动 | 泳道渲染的唯一实现处；在别处补徽章会造成「两份泳道 HTML」 |
| src/client/board-mount.ts | 页头按钮、注入 deps、转交渲染刷新 | 改动（+≤25 行） | 它是唯一持有宿主容器与委派 switch 的地方 |

**尺寸纪律**：`tests/size-budget.test.ts` 要求 `src/**/*.ts` 单文件 ≤400 行（当前**存量失败**：20+ 个文件超标，如 `index.ts` 864 行、`application/ports.ts` 1198 行）。本需求新增文件**一律不得进白名单**；`styles/settings.ts` 超 380 行时按「骨架/四屏」与「确认门/迁移卡/时间线」拆两片。

## 组件结构 <!-- serves: FR-5 -->

```
S-0 设置层宿主 div.dsh-pm-set-host[data-dsh-pm-settings]   （挂 document.body，fixed inset:0，z-index:100）
├── S-1 遮罩 div.dsh-pm-set-mask（点击=关闭；仅弹窗打开时存在）
└── S-2 弹窗 div.dsh-pm-set-dlg[role=dialog][aria-modal=true][aria-labelledby]
    ├── S-3 头部（标题「设置」+ 原型期徽章不保留 + 版本号 span.dsh-pm-set-ver + 「打开配置文件」按钮 + ✕ 关闭）
    ├── S-4 左菜单 nav.dsh-pm-set-nav[role=tablist][aria-orientation=vertical]
    │   └── S-5 菜单项 button[role=tab][aria-selected][data-action=settings-pane][data-pane=limits|storage|records|general]
    │        └── 未保存角标 span.dsh-pm-set-nav-sub（「N 项未保存」/「N 项不合法」）
    └── S-6 内容区 div.dsh-pm-set-main
        ├── P-1 屏·运行上限 section[role=tabpanel][data-pane=limits]
        │   ├── C-1 阶段上限表 table.dsh-pm-set-table（9 行，每行 input[type=number] + 来源徽章 + 恢复默认）
        │   ├── C-2 保存条 div.dsh-pm-set-savebar（脏态时出现：撤销 / 保存）
        │   └── C-3 状态区 div.dsh-pm-set-status[aria-live=polite]（保存成功/失败文案）
        ├── P-2 屏·存储与数据库 section[data-pane=storage]
        │   ├── C-4 后端分段控件 div.dsh-pm-set-seg（JSON 分片 / SQLite，role=radiogroup）
        │   ├── C-5 路径与来源 dl.dsh-pm-set-kv（数据位置 / 生效来源徽章 / 生效时机）
        │   ├── C-6 迁移卡 div.dsh-pm-set-agent（四态：idle/running/done/failed）
        │   │   ├── C-6-1 五步清单 ol.dsh-pm-set-steps
        │   │   ├── C-6-2 窗口 chip（复用 sessionChipHtml 的按钮形态，data-action=jump-session）
        │   │   └── C-6-3 结论区 div.dsh-pm-set-result（done 绿 / failed 红）
        │   └── C-7 纪律提示 div.dsh-pm-set-notice（重启生效 / 拒绝服务 / 回滚）
        ├── P-3 屏·系统记录 section[data-pane=records]
        │   ├── C-8 记录文件卡（路径 / 写入者 / 更新时刻 / 本安装版本 / 版本字段）
        │   ├── C-9 后端使用史时间线 ol.dsh-pm-set-tl（事件 + 版本徽章 + 确认人徽章）
        │   ├── C-10 数据路径档案 dl（分片根 / 库 / 备份目录 / 旧单册 / 设置文件）
        │   └── C-11 版本一致性核对（当前版本 / 最近迁移版本 / 库 schema / 结论）
        └── P-4 屏·通用 section[data-pane=general]（只读运行信息）
└── S-7 确认门 div.dsh-pm-set-confirm[role=dialog][aria-modal=true]（同宿主内第二层，z-index:110）
    ├── S-7-1 标题 + 正文 ol.dsh-pm-set-cf-list（要做什么/动什么/不动什么）
    └── S-7-2 底部：留痕说明 + 取消 + 确认执行（primary）
```

数据流：`controller` 取数 → `model` 归一 → `render/*` 出字符串 → `controller` 写 `host.innerHTML`（分层重绘：只重绘受影响的 pane）。

## 页面与组件（编号表） <!-- serves: FR-5 -->

| 编号 | 类型 | 名称 | 职责（动宾结构，含响应操作） | 数据来源（接口/状态/Props） | 新增/改动 | serves |
|---|---|---|---|---|---|---|
| S-0 | 容器 | 设置层宿主 | 承载弹窗与确认门，隔离宿主 `innerHTML` 重绘 | `document.body` 子节点 + `data-dsh-pm-settings` | 新增 | FR-5 |
| S-2 | 弹窗 | 设置弹窗 | 展示四屏之一，响应菜单切换/保存/关闭 | `settingsState`（controller 闭包） | 新增 | FR-5 |
| P-1 | 屏 | 运行上限 | 展示 9 阶段上限与来源，响应编辑/恢复默认/保存 | `fetchRunSettings()` + 本地 `drafts` | 新增 | FR-2, FR-3, FR-4 |
| P-2 | 屏 | 存储与数据库 | 展示后端与路径，响应切换意图与迁移发起 | `fetchRunSettings()` + `migrateState` | 新增 | FR-6, FR-10, FR-13 |
| P-3 | 屏 | 系统记录 | 展示使用史/路径/版本一致性，响应刷新与跳窗 | `fetchSystemRecord(limit)` | 新增 | FR-14, FR-15, FR-16 |
| P-4 | 屏 | 通用 | 展示只读运行信息（版本/指纹/schema/运行时） | `fetchRunSettings().plugin` + `fetchSystemRecord()` | 新增 | FR-15, FR-16 |
| C-6 | 组件 | 迁移卡 | 展示迁移四态与五步进度，响应「交给 Agent 处理」 | `POST …/storage/request`（取票据）+ `POST …/storage/migrate`（带 `ticket`）+ 轮询 | 新增 | FR-10, FR-11 |
| C-6-2 | 组件 | 迁移窗口 chip | 展示窗口码并跳转到该会话 | `sessionChipHtml` + `data-action=jump-session` | 新增（复用既有渲染） | FR-10 |
| C-9 | 组件 | 使用史时间线 | 展示事件流水（含以前用过的 SQLite） | `fetchSystemRecord().history` | 新增 | FR-14 |
| C-11 | 组件 | 版本一致性核对 | 展示版本/schema 是否匹配，不一致给重建指引 | `fetchSystemRecord().compat` | 新增 | FR-16 |
| S-7 | 弹窗 | 确认门 | 列出动作与影响，响应确认/取消 | 本地 `confirmKind` | 新增 | FR-11 |
| C-12 | 组件 | 泳道头上限徽章 | 在泳道头显示该阶段当前上限 | `buildBoard` 第 6 参 `limits` | 改动 | FR-2, FR-5 |

## 入口与挂载 <!-- serves: FR-5 -->

- **入口按钮**：`src/client/views/board.ts` 的 `.dsh-pm-head` 内、`刷新` 按钮**之前**插入
  `<button type="button" class="dsh-pm-btn" data-action="settings-open">⚙ 设置</button>`。
  落在 `buildBoard`（该函数是页头的唯一渲染处，`board.ts:151`）。
- **委派接入**：`board-mount.ts` 的 `onClick` switch 增 `case 'settings-open'`，调 `settings.open('limits')`（若已开则聚焦，不重开）。
  `settings` 是 `createBoardAttachment` 闭包内的**单例控制器**（`let settings: SettingsController | undefined`），首次点击时创建。
- **弹窗落点**：`document.body`，**不是** `container` 内部。理由（硬约束）：`render()` 执行 `viewEl.innerHTML = buildBoard(...)`，而 `viewEl === container`——任何挂在容器内的弹层都会被**每次 SSE 刷新/轮询重绘抹掉**。
- **幂等**：创建前先 `document.querySelector('[data-dsh-pm-settings]')?.remove()`（与 `injectStyles` 同款「先清同名残留」纪律，防 HMR/卸载残留双开）；`dispose()` 移除宿主并解绑监听。
- **关闭语义**（三条等价路径）：`✕`（`data-action=settings-close`）、点击遮罩（`S-1` 自身为 `e.target` 时）、`ESC`。
  若确认门开着，`ESC` **只关确认门**、不关设置弹窗（与原型 P9 一致）。关闭后焦点**回到触发按钮**（`⚙ 设置`）。
- **不引入路由**：弹窗不进 URL，不占用 `boardFocus`；最后打开的屏记 `sessionStorage['dsh-pmboard:settings-pane']`（命名与既有 `dsh-pmboard:view` / `dsh-pmboard:list` 同族，见 `board-mount.ts:81,97`）。

## 四屏职责 <!-- serves: FR-2, FR-5, FR-6, FR-14 -->

四屏共用「一屏一 section、只显示一个」的切换；`controller.showPane(name)` 做三件事：切 `aria-selected`、切 `hidden`、把 `dsh-pm-set-main` 的 `scrollTop` 归零。

### 屏 1 运行上限 <!-- serves: FR-2, FR-3, FR-4 -->

- 表格 9 行，行序固定为 `draft, brainstorming, design, decomposing, implementing, accepting, done, archived, canceled`；颜色点用 `--pm-c-<status>` 令牌（与泳道点同源）。
- 每行：阶段名 + `desc`（来自 `STAGE_CONFIGS[stage].description`，**不另写一份文案**）、`内置默认`、`上限`（唯一可编辑控件）、`当前来源`徽章、`恢复默认`。
- 徽章四态映射 `source`：`settings`→「设置文件」、`config`→「插件配置」、`env`→「环境变量」、`default`→「内置默认」；本地脏态额外一态「待保存」（`dsh-pm-set-badge new`）。
- `requiresConfirmation`/`autoExecute` 仅供参考展示：非 `autoExecute` 阶段整行加 `is-off`（灰字）+ 后缀「不自动跑」，但仍可编辑（保留整表对账，FR-5）。
- **「改小」的语义必须写在界面上**（这是最容易误解的方向）：屏 1 底部固定一行说明
  「改小**不会掐断正在跑的那一次**；从**下一次判定**起不再续跑」——避免人以为能立刻止血。
- **上游越界提示**（只读、不代跑动作）：当某需求 `req.dive.roundsInStage ≥ resolved.stageMaxRounds[req.status].value` 时，
  泳道头徽章（C-12）加 `is-over` 并在 `title` 写明「已达/超过上限：**下次判定即停手**」；需求详情同款提示。
  判据在 `buildBoard` 渲染期算（纯函数、可单测），数据全部来自既有 `state.requirements[].dive` 与 `resolved`，**不新增接口**。

### 屏 2 存储与数据库 <!-- serves: FR-6, FR-13, FR-17 -->

- 分段控件 `role="radiogroup"`，两个 `role="radio"` 按钮（JSON 分片 / SQLite），`aria-checked` 同步。
- 三段元信息：`数据位置`（`resolved.storage.sqlitePath` 或分片根，来自 `system.paths`）、`生效来源`（后端徽章）、`生效时机`（由 `restartRequired` 与服务端 `effective` 推出人话，见下）。
- **状态真源在服务端**，前端不自造：`value`=设置文件里的目标、`effective`=本进程在用、`restartRequired`=`value !== effective`。前端只多一个**本地意图** `pendingTarget`（选了但还没确认）。
  - `restartRequired === true` → 「待重启生效（当前进程仍是 {effective}）」
  - `pendingTarget === 'sqlite' && migrateState === 'idle'` → 「未生效：迁移完成 + 重启宿主后才切换」+ 徽章「待人工确认」
- 旧库警示（FR-13）：`system.stores.sqlite.stale === true` 时，在迁移卡内以橙字给出「检出旧库（N 条 · 日期，比当前分片旧 M 条）：先备份旧库再重建」。
- **完成态要如实归因第 5 步**：迁移 `done` 的结论区写明「第 5 步（写设置文件 `storage.backend = sqlite`）**已由 Agent 执行**」并给出设置文件路径，
  而不是含糊说"已保存设置"。与之配套的口径：`scripts/migrate-ledger-to-sqlite.ts` 的 `--write-settings` **缺省关**——
  只有人在确认门点了「确认执行」，宿主投递给 Agent 的任务才携带该参数（**确认 = 许可，不是默认开**）；未确认则脚本不会被调用，设置文件保持原样。
- 纪律提示三条（重启生效 / 迁移没做完就重启 → 拒绝服务 / 回滚不删源数据）直接取 `requirement.md` 的措辞。

### 屏 3 系统记录 <!-- serves: FR-14, FR-15, FR-16 -->

- 记录文件卡：`paths.settingsFile` / `paths.legacyLedger` / `updatedAt` / `plugin.version + buildStamp` / 「版本字段」说明。
- 时间线（`history` 倒序或正序由实现定，**默认正序**、与原型一致）：每条 = 时间 + 事件名 + 版本徽章 + `confirmedBy` 徽章（人已确认）+ 副行（窗口码 / 备份目录 / 原因 / 检出陈旧库）。
  - 事件名映射：`startup`→启动、`upgrade`→插件升级、`migration`→迁移到 SQLite、`backend-switched`→切换后端、`settings-invalid`→设置项作废。
- 路径档案：`paths.*` + `stores.shards` / `stores.sqlite`（条数、字节、`stale`）。
- 版本一致性核对（FR-16）：`compat.consistent === false` → 红字 + 「重建库」指引（文案由 `model.ts` 装配，不散落在 render）。
- **分叉提示（红字；本设计不做合并，界面不得出现"合并/同步"按钮或文案）**：
  当 `stores.shards.requirements > stores.sqlite.requirements` 时，屏顶红字「**库已陈旧：重启前请重跑迁移（会先备份旧库再全量重建）**」，
  并只给一个动作 —— 回屏 2 重新迁移（`data-action="settings-pane" data-pane="storage"`）。
  两个条数都在契约里，前端可自行比较；**revision 与时间戳不同量纲**（`stores.shards.headRevision` ≠ 时间），
  那一路由 host 判定并落在 `stores.sqlite.stale` / `staleReason` 上，前端**只呈现结论、不自行比 revision 与 `migratedAt`**。
- **写失败要响亮**（FR-17）：`GET /settings/system` 的 `droppedEvents > 0` 时，屏顶固定一条红字「记录不可写（原因）· 已丢弃 N 条事件」。
- 屏内提供「刷新」（`data-action=settings-refresh`）：轮询之外的人工兜底。

### 屏 4 通用 <!-- serves: FR-15, FR-16 -->

只读：插件版本（`plugin.version` + `buildStamp`）、台账 schema（`REQBOARD_SCHEMA_VERSION`）、`sqlite_schema_version`、设置文件路径与 `schemaVersion`、运行时提示（`node:sqlite` 为 experimental，如实展示不隐藏）。

## 状态管理 <!-- serves: FR-4, FR-6, FR-10 -->

单一状态对象（controller 闭包内 `let ui: SettingsUiState`），全部经 `model.ts` 的纯函数迁移；**没有任何全局 store**（理由：弹窗生命周期 = 挂载周期，跨组件共享需求为零）。

```ts
interface SettingsUiState {
  open: boolean
  pane: 'limits' | 'storage' | 'records' | 'general'
  loaded: boolean                  // 首帧数据是否已到
  resolved?: ResolvedRunSettings   // GET /settings 的 data
  system?: SystemRecordClientView  // GET /settings/system 的 data
  drafts: Record<string, string>   // 阶段键 → 输入框原始字符串（只放被改过的键）
  saving: boolean
  saveError?: string
  pendingTarget?: 'json' | 'sqlite'
  confirmKind?: 'migrate' | 'rollback'
  /** 待确认票据（POST /settings/storage/request 的返回）：只存内存，不落 localStorage/sessionStorage——刷新即失效，需重新确认 */
  consent?: { action: 'migrate' | 'switch'; ticket: string; expiresAt: number }
  migrate: { state: 'idle' | 'running' | 'done' | 'failed'; windowKey?: string; steps: number; error?: string }
  status?: { kind: 'ok' | 'err'; text: string }
  droppedEvents: number
}
```

### 本地草稿态与校验态 <!-- serves: FR-4 -->

- `drafts` 存**原始字符串**（不是 number）：才能把「空串 / `1e3` / `-5` / `10001`」如实判非法，而不是被 `Number()` 悄悄归一。
- 纯函数 `validateLimit(raw: string): { ok: true; value: number } | { ok: false; reason: string }`：
  合法 = 十进制整数字面量且 `1 ≤ n ≤ 10000`；`''`、`'  '`、`'1.5'`、`'0'`、`'10001'`、`'1e3'`、非数字字面量一律非法。
- `dirtyOf(state)` 返回 `{ dirty: string[]; invalid: string[] }`；据此：
  - 行加 `is-dirty` / `is-invalid`；`input` 加 `aria-invalid="true"` 与 `aria-describedby="dsh-pm-set-err-<stage>"`；
  - 错误文案 `<span id="dsh-pm-set-err-<stage>" class="dsh-pm-set-err">需 1–10000 的整数</span>`；
  - 菜单项角标「N 项未保存」/「N 项不合法」；
  - **保存键在 `invalid.length > 0` 时禁用**（`disabled` + `title` 指向第一个非法项）。
- 保存前不发请求；「撤销」= 清 `drafts` 并整表重绘（不触网）。
- 「恢复默认」= 从 `drafts` 删除该键并回填 `default` 值（**不**把 `default` 写进 `drafts`，否则会把默认值冻成显式设置，与 FR-17 冲突）。

### 请求态与失败回退 <!-- serves: FR-4, FR-6 -->

- `saving: true` 期间：保存/确认键 `disabled` 并加 `is-busy`（文案「保存中…」），输入框 `readonly`（不 `disabled`，避免焦点丢失）。
- `PATCH` 成功：用响应的新生效值替换 `resolved`，清 `drafts`，写 `status = {ok, '已保存 N 项 · 下一回合生效'}`，并调 `deps.onApplied(resolved)` 让看板重绘泳道头上限。
- `PATCH` 失败（`ApiError`）：**保留 `drafts` 与焦点**，`status = {err, err.message}`；若 `err.hint` 存在则渲染可复制命令块（复用 `dsh-pm-error-hint` 的既有样式口径，不新造）；保存键恢复可用（重试同一份草稿）。
- 取数失败：屏内错误 + 「重试」（`data-action=settings-refresh`），**不清空已显示数据**（陈旧数据 + 明示失败，优于白屏）。
- 切换后端（`POST …/storage/switch`，**体带 `ticket`**）：成功 → `status` 提示 + `pendingTarget` 归零 + 清 `consent` + 重取 `GET /settings`；`409 sqlite_not_migrated` → 自动把焦点切到迁移卡并提示先迁移；`403 confirmation_required` → 见「拒绝服务与错误呈现」的票据失效分支；失败 → 分段控件**回到服务端 `effective` 的状态**（不保留错误选中，避免"看起来切成功了"）。

### 迁移四态机 <!-- serves: FR-10 -->

```
idle ──点「交给 Agent 处理」──▶ requesting（POST /settings/storage/request；见"确认门"节）
requesting ──拿到 {action, ticket, expiresAt}──▶ confirm（本地弹框，票据存 ui.consent）
requesting ──请求失败──▶ idle（status 报错；不弹确认框——没有票据就不该让人确认）
confirm ──取消──▶ idle（零副作用：不发执行请求、不写任何字段、清掉 ui.consent）
confirm ──点「确认执行」──▶ 作答通道落章（票据转"已落章·未消费"）
落章成功 ──▶ running（POST …/migrate，**请求体带 ticket**；成功拿到 windowKey）
落章失败/超时 ──▶ confirm（留在确认框，清 ticket 提示重新确认，不调执行路由）
running ──轮询到 migration 事件 result=ok──▶ done
running ──轮询到 migration 事件 result=failed / 超时──▶ failed
failed ──点「重试」──▶ requesting（**必须重新走一次确认**：旧票据已消费/过期，重放必 403）
done ──点「重来一次」──▶ idle（仅重置前端态；设置文件不回退）
```

- **票据一次性**：`ui.consent.ticket` 在**执行请求发出后即视为已消费**（不论成败），从状态里清除；因此任何重试路径都从 `requesting` 重新开始。
- **本地有效期**：`expiresAt`（+10 分钟）到期前未点确认 → 前端主动作废（清 `consent`、关确认框、提示「确认已超时，请重新发起」），避免拿必然 403 的票据去撞服务端。
- **不持久化**：`consent` 不进 `localStorage`/`sessionStorage`（刷新后必须重新确认——票据语义上属于"这一刻的人"，跨刷新复用即等于把确认偷换成旧确认）。

- `running` 的五步进度**由系统记录驱动**（`history` 里最新 `migration.result`），**不靠前端计时器编造**：`steps` = 已出现的阶段数（0–5），没有中间事件时显示「执行中…」与已耗时。
- 进度刷新：`running` 时按 `migratePollMs = 3000` 轮询 `GET /settings/system?limit=5`；`done`/`failed` 立即停轮询。
- 超时：`running` 连续 `migrateTimeoutMs = 30 * 60 * 1000` 未见新事件 → 转 `failed`，文案「未见新进展，请打开窗口查看」，**不谎报成功**。

## 数据流 <!-- serves: FR-3, FR-4, FR-10 -->

```
打开弹窗 ─┬─ GET /settings          → resolved（上限生效值/来源、后端、版本）
          └─ GET /settings/system   → system（路径、使用史、stores、compat）
编辑上限 ──▶ 本地 drafts（不发请求）──▶ 保存 ──▶ PATCH /settings ──▶ resolved' ──▶ onApplied(resolved')
                                                                    └─ 泳道头上限重绘（buildBoard 第 6 参）
切后端   ──▶ pendingTarget（本地）──▶ POST /settings/storage/request ──▶ {action:'switch', ticket, expiresAt}
                                          └─ 确认门（人点「确认执行」= 作答通道落章）
                                             └─ POST /settings/storage/switch（体带 ticket）──▶ 重取 GET /settings
迁移     ──▶ POST /settings/storage/request ──▶ {action:'migrate', ticket, expiresAt}
             └─ 确认门（落章）──▶ POST /settings/storage/migrate（体带 ticket）──▶ { windowKey, sessionId }
                                                                    └─ 轮询 GET /settings/system → 进度与结论
打开配置文件 ──▶ deps.openDoc(system.paths.settingsFile)
```

**票据是"先落章、后执行"的载体**：`request` 在**确认框弹出前**发出（没有票据就不该让人确认）；人点「确认执行」经作答通道落章后，才带同一张 `ticket` 调执行路由；票据**一次性**——所以上图的每一次执行都必须先经过一次 `request`。

- **`onApplied` 是看板与弹窗的唯一耦合点**：`board-mount` 收到后把 `resolved.stageMaxRounds` 存进闭包变量 `laneLimits` 并 `render()`；`buildBoard(state, now, view, listOpts, archived, laneLimits)` 据此渲染泳道头徽章（第 6 参可选，缺省不渲染 → 既有调用与测试逐字节不变）。
- 弹窗打开时也要 `onApplied`（首次进入即让泳道徽章亮起），保证「泳道上限」与「设置表」同源。

## 确认门（FR-11） <!-- serves: FR-11 -->

- 触发点三个：点「交给 Agent 处理」（`migrate`）、把后端切回 JSON（`rollback`）、失败后「重试」（`migrate`）。
- **DOM**：`S-7` 与弹窗同宿主、更高 z-index；`role="dialog"` `aria-modal="true"` `aria-labelledby="dsh-pm-set-cf-title"`；打开时焦点移到「确认执行」，关闭后焦点回到触发按钮。
- **文案由 `model.ts` 装配**（`confirmCopy(kind, ctx)` 纯函数，便于单测），内容分三段：要做什么（有序清单）、动什么/不动什么、留痕与生效条件。
  - `migrate`：备份分片（只增不删）→ 建库或先备份旧库再重建 → 只读源分片迁移 N 条 → 校验（条数 + 抽样 5 条）不过就不写设置 → 通过后写 `storage.backend=sqlite`；并注明「确认与执行都带版本号留痕：`dsh-pmboard {version}`」。
  - `rollback`：写 `storage.backend=json` → 库文件保留不删 → 分片恢复生效；注明「不需要 Agent 干活；重启后生效」。
- **取消零副作用**：只清 `confirmKind`、`pendingTarget` 与 `ui.consent`（**作废票据**，避免留着一张已弹过框的票据）并重绘，**不发执行请求、不动 `drafts`**（迁移卡保持 `idle`）；`status` 提示「已取消：未开窗口、未写任何文件」。
- **先落章、后执行（票据化，本轮已裁定）**：
  1. 弹框**前**：`POST /settings/storage/request` → 拿 `{ action, ticket, expiresAt }`（+10 分钟），存 `ui.consent`；
  2. 人点「确认执行」→ 走**作答通道落章**（票据转"已落章·未消费"）；落章失败/超时就**不调执行路由**，留在确认框并提示重新确认；
  3. 落章成功 → 立即带 `ticket` 调 `POST /settings/storage/switch` 或 `…/migrate`；**请求体缺 ticket / 票据过期 / 已消费 → 403 `confirmation_required`**；
  4. `consent` **只存内存**（不落 localStorage / sessionStorage）：刷新页面即失效，需重新走一次确认——票据属于"此刻的人"，跨刷新复用等于把确认偷换成旧确认。
- **留痕展示**：确认落章后，从 `GET /settings/system` 的 `history` 读 `confirmedBy`（`kind:'human'`、`at`、`channel:'board-confirm'`、`pluginVersion`）渲染为「人已确认」徽章 + `title` 明细；前端**不自己写留痕**（留痕由宿主在落章时落账，前端只显示事实）。
- **确认 = 许可，不是默认开**：`--write-settings` 缺省关；只有在本确认门点「确认执行」后，投递给 Agent 的迁移任务才带该参数——
  因此"设置文件被改写"这件事在时间上只可能晚于人工确认；取消路径下脚本不被调用、设置文件保持原样（前端也不预先乐观改写 `resolved`）。

## 迁移进度与窗口跳转 <!-- serves: FR-10, FR-11 -->

- 窗口 chip：复用 `sessionChipHtml({ sid: windowKey, label: '窗口 ' + windowCodeFromSessionId(windowKey), cls: 'dsh-pm-window', kind: '迁移 Agent 窗口', archived: false })`（`src/client/render/dom-utils.ts:95`）——它自带 `data-action="jump-session" data-sid`。
- **真的会跳转**：控制器自建委派（弹窗不在 `container` 内，接不到 `board-mount` 的委派），对 `data-action="jump-session"` 调 `deps.jumpToWindow(sid)`。
  `deps` 由 `board-mount` 注入，内部即 `handleSessionJump(sid)`（`board-mount.ts:249` 区域）→ `jumpToSession(windowServiceAccess(), sid)`（`session-jump.ts:118`）：它先 `layout.selectPanel(null)` 收掉本看板面板，再 `uiWorkspace.openSession(sid)` 打开目标会话——**两者缺一**就会"会话切了、画面还停在看板"。
- **失败要如实说**：`SessionJumpResult` 的五种返回值 `opened / archived / restore-failed / missing / unavailable` 都要出人话提示（复用 `jumpResultMessage`：`board-mount.ts:136`）。
  该函数在 `board-mount.ts` 内，控制器**不得直接 import**（`board-mount → settings/controller → board-mount` 会成环），故通过 `deps.jumpToWindow` 注入；`unavailable`（layout 未注入）必须显式提示，**静默即复现老毛病**。
- `running` 期间关掉弹窗：轮询停、任务照跑；重开弹窗时用 `GET /settings/system` 恢复四态（**状态不存内存**，只存服务端事实）。

## 拒绝服务与错误呈现 <!-- serves: FR-4, FR-12 -->

- **两种「未就绪」按 `code` 分流，不许合并成一句"去迁移"**（两件事的补救动作完全不同）：

| `code` | 触发 | 前端呈现（可复制命令 + 入口） |
|---|---|---|
| `REQBOARD_REQUIRES_SQLITE_MIGRATION` | 已选 SQLite、库空或不存在，而分片非空（FR-12） | 「**点『交给 Agent 处理』**」入口：`data-action="settings-open" data-pane="storage"` 直接开弹窗并落在屏 2 迁移卡；命令 `npx tsx scripts/migrate-ledger-to-sqlite.ts --from ~/.dsh/reqboard --to ~/.dsh/reqboard.sqlite` |
| `REQBOARD_REQUIRES_MIGRATION` | 既有：单册 `dsh-reqboard.json` 在场、分片未迁移 | 命令 `npx tsx scripts/migrate-ledger-v10.ts`（**既有路径**）；**不引导去 SQLite**、不出现「交给 Agent 处理」按钮 |

既有"未就绪"降级路由（`src/http/not-ready.ts`）已覆盖看板整体；本弹窗**不额外造错误页**，被打开时按同一张表分流，
命令块沿用 `dsh-pm-error-hint` 的可复制形态（服务端 `hint` 优先，前端不替它编命令）。
- `409 sqlite_not_migrated`：屏 2 内联提示 + 焦点移到「交给 Agent 处理」。
- **每个失败码各有独立文案，不许都显示"出错了"**：

| `code` | HTTP | 界面表现（互不相同的文案与去向） |
|---|---|---|
| `confirmation_required` | 403 | 「**确认已失效，请重新确认**」+ **清掉本地 `ui.consent`**，并把界面退回确认框前置态（`pendingTarget` 保留、需重新 `request`）；**不自动重试**（重放票据必 403，自动重试只会刷屏） |
| `migration_in_progress` | 409 | `running` 态 + 展示窗口 chip：「已有迁移在跑，先看该窗口」 |
| `window_opener_unavailable` | 503 | `failed` 态：「宿主当前不可开窗（能力未注入）；**未开始迁移、未写任何文件**」+「重试」 |
| `dispatch_failed` | 502 | `failed` 态：「任务投递失败（上游/宿主拒绝）；**未开始迁移**」+「重试」（与开窗失败区分：这一条是投递段出错，不是开窗段） |
| `window_open_failed` | 500 | `failed` 态：「开窗失败（原因）；**未开始迁移、未写任何文件**」+「重试」 |
| `sqlite_not_migrated` | 409 | 屏 2 内联 + 焦点移到迁移卡（引导先迁移，不是报错） |
- 校验类错误（`invalid_input`）：**服务端返回什么就显示什么**（哪一项/范围/怎么改），前端不再拼一份自己的规则文案；前端本地校验只是"提前拦"，两者不冲突（本地拦住的根本不会发请求）。

## 样式与主题 <!-- serves: FR-5 -->

- **只用真令牌**：`--pm-line` / `--pm-line-strong` / `--pm-bg-soft` / `--pm-radius{,-sm,-pill}` / `--pm-shadow-card` / `--pm-c-*` 八阶段色 + `--pm-c-danger` / `--pm-c-warn`（定义见 `src/client/styles/base.ts:9-45`）；文本色用宿主变量 `var(--dsw-text-primary, #222)` / `var(--dsw-text-secondary, #888)` / `var(--dsw-border, …)`。
- 原型里的 `--s-text` / `--s-line` / `--s-pill` / `--s-primary` 是原型**私有**变量，实现时**一律替换**为上面的 `--dsw-*` / `--pm-*`（近黑主按钮 → `.dsh-pm-btn.primary` 用既有 `var(--dsw-accent, #4a7dff)`，与全站主按钮同源）。
- **类名全部 `dsh-pm-set-` 前缀**，分段控件用 `dsh-pm-set-seg`（原型 `.seg2`）、卡片用 `dsh-pm-set-card`（原型 `.card`）、徽章用 `dsh-pm-set-badge`（原型 `.badge`）。
- 层级：`z-index` 现有最大 60（`styles/board.ts:157,198` 的浮层）；本需求取 **宿主 100 / 确认门 110**（不与既有浮层冲突，也不抢占宿主 shell 的 modal 层——shell 弹窗在 `body` 更后插入时仍在其上，属可接受）。
- 动画：`running` 圆点用 `@keyframes dsh-pm-set-pulse`（1.1s）；`prefers-reduced-motion: reduce` 时禁用动画。
- 弹窗内滚动只发生在 `.dsh-pm-set-main`（`overflow-y:auto`），遮罩层与弹窗本身不滚（防"滚到底穿帮看到看板"）。

## 响应式与可访问性 <!-- serves: FR-5 -->

- 断点取 `docs/knowledge/design-tokens.md:114-119` 的既有四档（1200 / 1180 / 880 / 768）：

| 断点 | 弹窗 | 左菜单 | 屏内表格 |
|---|---|---|---|
| ≥1200 | 1180×740 居中，圆角 16 | 纵向 208px | 5 列全显 |
| ≤1180 | `width: min(1180px, 96vw)`；菜单 184px | 纵向 | 5 列全显 |
| ≤880 | 全屏 sheet（`inset:0`，圆角 0） | 顶部横向可滚 tab 条（`aria-orientation="horizontal"`） | 隐藏「内置默认」列（值并入行 `title`） |
| ≤768 | 同全屏 sheet | 同上 | 表格转两行式：阶段名一行、`上限 + 来源 + 恢复默认` 一行（`<table>` 保留，靠 `display:block` 重排，**不删表头语义**） |

- 键盘可达：`Tab` 进弹窗 → 菜单项 ← ↑ ↓ →（`Home`/`End`）→ `Tab` 进内容区；输入框 `Enter` 不提交（避免误保存），保存只在按钮上；`ESC` 关确认门优先，其次关弹窗。
- 焦点管理：打开时聚焦菜单当前项；关闭时焦点回「⚙ 设置」；确认门打开时焦点进确认框、关闭后回**原触发按钮**（不是回弹窗首项）。
- ARIA：`role="dialog" aria-modal="true"` + `aria-labelledby`；菜单 `role="tablist"`/`role="tab"`/`aria-selected`/`aria-controls`；屏 `role="tabpanel"`/`aria-labelledby`；分段控件 `role="radiogroup"`/`role="radio"`/`aria-checked`；状态区 `aria-live="polite"`；非法输入 `aria-invalid` + `aria-describedby`。
- 不做焦点陷阱的**强**实现（不拦截外部点击）：仅做 `Tab` 循环（纯函数 `nextFocusIndex(current, count, shift)` 存 `model.ts` 便于单测），保持与宿主 shell 其它弹层的宽松度一致。

## 依赖与第三方库 <!-- serves: FR-5 -->

**零新增 npm 依赖**。复用清单（全部既有）：

| 复用对象 | 位置 | 用途 |
|---|---|---|
| `esc()` | `src/client/html.ts` | 所有动态文本转义（含事件里的 `reason` / `error` / 路径） |
| `fmt()` | `src/domain/text/fmt.js` | 文案插值（`board-mount.ts` 已如此使用） |
| `ApiError` / `get` / `post` / `unwrap` | `src/client/api.ts` | 请求与错误（带 `message`/`hint`） |
| `sessionChipHtml` / `windowCodeFromSessionId` | `src/client/render/dom-utils.ts:95,50` | 迁移窗口 chip 与窗口码 |
| `STATUS_LABELS` / `LANE_STATUSES` | `src/client/render/dom-utils.ts:15,41` | 阶段名与泳道集合（不另写字面量） |
| `handleSessionJump` / `jumpResultMessage` | `board-mount.ts:249,136`（经 deps 注入） | 跳迁移窗口与其失败人话 |
| `openDocInSidebar` / `resolveCurrentSessionId` | `src/client/open-doc.ts:104,30` | 「打开配置文件」 |
| `injectStyles` 机制 | `src/client/styles.ts` | 新 CSS 分片随插件样式表注入（`data-plugin` 归属章不变量不变） |

不引入：任何 UI 框架 / 组件库（本插件全部 `innerHTML` 字符串渲染）、`marked`（无 markdown 需求）、日期库（时间用既有 `fmtTime`）。

## 测试与可测性钩子 <!-- serves: FR-4, FR-5, FR-10 -->

- **纯函数直测**（Node 环境、零 DOM，与 `tests/client-view.test.ts` 同款）：
  - `validateLimit` / `dirtyOf`：合法与非法各 6 例（含 `''`、`'1e3'`、`'10001'`、`'1.5'`）。
  - `confirmCopy('migrate'|'rollback', ctx)`：清单条数、含版本号、取消文案。
  - `migrateReducer(state, event)`：`idle→requesting→confirm→running→done`、`running→failed`、超时转 failed 的分支。
  - **票据用例**（本轮新增契约）：`request` 失败不弹确认框；点确认落章失败 → 不产生执行请求；执行后 `consent` 必被清（一次性）；
    `expiresAt` 到期 → 前端主动作废并提示超时；`403 confirmation_required` → 清 `consent` 且**不自动重试**；
    以及「刷新后 `consent` 必为 undefined」（断言不写任何 Storage：`localStorage`/`sessionStorage` 均不被写入 `ticket`）。
  - `badgeOf(source)` / `whenText(resolved)`：四来源 + `restartRequired` 的人话映射。
- **渲染直测**（字符串断言）：`buildSettingsShell` / `buildLimitsPane` / `buildStoragePane` / `buildRecordsPane` / `buildConfirmDialog` 的关键片段（类名前缀、`role`/`aria-*`、`data-action`、`disabled` 条件）；泳道头上限徽章并入 `tests/client-view.test.ts` 的 `buildBoard` 用例（新增第 6 参渲染 + 缺省不渲染两条）。
- **委派可测性**：`data-action` 全量清单在 `model.ts` 导出常量 `SETTINGS_ACTIONS`，测试断言 render 产物里出现的 action 都在该清单内（防「渲染了但没人处理」的死按钮）。
- **不测**：真实 `fetch`、`EventSource`、`jumpToSession` 的宿主行为（属宿主集成，不在前端单测范围）。

## 与既有前端的接入差异与风险 <!-- serves: FR-5 -->

| # | 发现 | 影响 | 处理 |
|---|---|---|---|
| R1 | `render()` 直接写 `viewEl.innerHTML`，而 `viewEl === container` | 挂在容器内的弹窗会被每次重绘抹掉 | 弹窗挂 `document.body`（本设计 S-0） |
| R2 | 弹窗在 `container` 外 → 接不到 `board-mount` 的 click 委派 | 迁移窗口 chip 点了不跳 | 控制器自建委派 + `deps.jumpToWindow` 注入（不 import `board-mount`，避免成环） |
| R3 | `jumpResultMessage` 位于 `board-mount.ts` 而非 `session-jump.ts` | 直接 import 会形成环 | 经 deps 注入；**后续可考虑把它下沉到 `session-jump.ts`**（本需求不做，避免动无关文件） |
| R4 | 原型类名无 `dsh-pm-` 前缀、且用私有 `--s-*` 令牌 | 与 shell 冲突、与令牌纪律不符 | 实现时全量加前缀 + 换真令牌（原型偏差 1/样式节） |
| R5 | 原型阶段中文名与 `STATUS_LABELS` 不一致（完成/归档/取消 vs 已完成/已归档/已取消） | 同一阶段两种叫法 | 以 `STATUS_LABELS` 为准（原型偏差 2） |
| R6 | `tests/size-budget.test.ts` 存量失败（20+ 文件 >400 行） | 新文件可能再加超标 | 新文件逐个 ≤400 行；`styles/settings.ts` 设 380 行预算与预声明拆分线（不碰白名单） |
| R7 | `GET /settings` 的 `system` 块**不含** `paths.settingsFile` | 「打开配置文件」需要路径 | 点击时若 `system` 未加载则先 `fetchSystemRecord()`；**惰性创建**（FR-17）下文件可能不存在 → 按钮置灰 + 提示「改一次设置后才会生成」+ 提供复制路径。
**2026-10-04 修订（人实测「打开配置文件没有反应」后）**：置灰用 `aria-disabled="true"`，**不得**用 `disabled`（它不派发点击，点击就此变成死点击）；理由必须**在页面上看得见**（页头旁注「尚未创建」），不能只写在 `title` 里；点击时若处于尚未创建态，则跳到「通用」屏看整句解释。 |
| R8 | 迁移五步的**中间进度**在 `history` 里只有起止两条事实（`migration` 一条） | 无法如实显示 5 步逐条打勾 | 进度按「已发生的事实」渲染：`running` 期间显示「执行中…+ 已耗时」与窗口 chip，`done/failed` 一次性给结论；**不编造中间步骤百分比**（原型的分步打勾仅作视觉参考） |
