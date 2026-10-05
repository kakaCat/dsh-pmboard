---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15, FR-16]
sides: [frontend, backend]
---

# 接口设计：运行设置与可切换存储后端（REQ-261004103330-005f）

## 新增端口：SettingsStore <!-- serves: FR-1, FR-3, FR-4 -->

`src/application/ports.ts`（与既有端口同处，不改既有签名）：

```ts
export interface SettingsStore {
  /** 生效设置（已合并默认与四级来源），每项带 source；problems 非空表示有键被作废。 */
  snapshot(): ResolvedRunSettings
  /** 读盘刷新快照（订阅/轮询/启动调用）；读失败 → 保留旧快照 + onWarn，不抛。 */
  refresh(): Promise<ResolvedRunSettings>
  /** 校验 + 原子写（临时文件 + rename），成功即刷新快照并广播；失败抛 SettingsWriteError。 */
  update(patch: RunSettingsPatch): Promise<ResolvedRunSettings>
  /** 订阅快照变更（PATCH 成功 / 文件被外部改动）；返回退订函数。 */
  subscribe(fn: (next: ResolvedRunSettings) => void): () => void
}

export interface RunSettingsPatch {
  stageMaxRounds?: Partial<Record<RequirementStatus, number>>
  /** 刻意不含 storage.backend：后端切换必须走确认门路由（见下） */
  storage?: { sqlitePath?: string }
}
```

| 方法 | 输入 | 输出 | 错误 |
|---|---|---|---|
| `snapshot` | — | `ResolvedRunSettings` | 无（纯内存） |
| `refresh` | — | 同上 | 不抛；失败走 `onWarn` |
| `update` | `RunSettingsPatch` | 同上 | `REQBOARD_SETTINGS_INVALID`（校验）/ `REQBOARD_IO_FAILED`（落盘） |
| `subscribe` | 回调 | 退订函数 | 无 |

## 新增端口：SystemRecordStore <!-- serves: FR-14, FR-15, FR-16 -->

```ts
export interface SystemRecordStore {
  /** 读全量（不存在 → 触发一次初始化后再读）。 */
  read(): Promise<SystemRecordV1>
  /** 追加一个事件 + 更新 counters/updatedAt；只追加不覆盖。幂等键：同 (event,at,plugin) 重复写被忽略。 */
  append(e: SystemEventInput): Promise<void>
  /** 刷新 stores 快照（条数/字节/陈旧判定）与 active（装配期与迁移后调用）。 */
  updateStores(patch: StoresSnapshot): Promise<void>
  /** 版本比对：当前版本 vs 记录里的版本 → 需要时写 upgrade 事件；返回一致性结论。 */
  reconcileVersion(current: PluginStamp, sqliteSchemaVersion: number): Promise<CompatResult>
}
```

失败语义：任何写失败**不抛给调用方主流程**（不阻断启动），但必须：写日志 + 在内存里累加 `droppedEvents`，由「系统记录」屏红字显示「记录不可写（原因）+ 已丢弃 N 条事件」。

## 新增实现：SqliteRequirementStore <!-- serves: FR-7, FR-8 -->

```ts
export interface SqliteRequirementStoreOptions {
  /** 库文件绝对路径（缺省 <dshHome>/reqboard.sqlite）。 */
  file: string
  /** 时钟（缺省 Date.now）。 */
  now?: () => number
  /** 告警（坏行剔除/IO 异常）。 */
  onWarn?: (message: string) => void
}

export class SqliteRequirementStore implements RequirementStore { /* 端口全量实现 */ }
```

- **端口不变**：方法与语义与 `ShardedRequirementStore` 逐条对齐（对照表见 `data-model.md`）。
- **打开方式**：`new DatabaseSync(file)`（`node:sqlite`）；打开时校验 `meta.sqlite_schema_version`，不匹配 → 抛 `REQBOARD_SQLITE_SCHEMA_MISMATCH`（由 FR-16 转为可读告警与重建指引）。
- **事务**：所有写方法用 `BEGIN IMMEDIATE … COMMIT`；异常 → `ROLLBACK` 后原样抛映射后的错误码。
- **订阅**：写事务提交后回调（与分片实现"提交后回调"时机一致）。

## 配置与解析函数 <!-- serves: FR-2, FR-6 -->

```ts
export interface PluginConfig {
  // …既有字段…
  /** 部署级默认上限（低于设置文件优先级）。 */
  stageMaxRounds?: Partial<Record<RequirementStatus, number>>
  /** 部署级默认后端（低于设置文件优先级）。 */
  storage?: { backend?: 'json' | 'sqlite'; sqlitePath?: string }
}
```

```ts
/** 纯函数：四级来源合并 + 校验 + 逐项 source 标注（零 IO，可单测）。 */
export function resolveRunSettings(input: {
  file?: RunSettingsFileV1
  config?: PluginConfig
  env?: Record<string, string | undefined>
}): ResolvedRunSettings

/** 语义变更：默认值仍来自 STAGE_CONFIGS，但可被设置覆盖（同步读内存快照）。 */
export function roundLimitFor(status: RequirementStatus | string): number
```

环境变量：`PMBOARD_STORAGE=json|sqlite`、`PMBOARD_STAGE_MAX_ROUNDS`（形如 `implementing=200,design=50`，解析失败该键作废并记 `settings-invalid`，不整份回退）。

## HTTP 路由 <!-- serves: FR-3, FR-4, FR-6, FR-10, FR-11, FR-14 -->

前缀沿用 `/dashboard/api/reqboard`，信封沿用 `{ success, data } | { success:false, error, code? }`。新增 `src/http/routers/settings.ts`：

### GET /dashboard/api/reqboard/settings <!-- serves: FR-3 -->

```json
{ "success": true, "data": {
  "plugin": { "name": "dsh-pmboard", "version": "0.1.0", "buildStamp": "7f3c1ab9d204" },
  "stageMaxRounds": { "implementing": { "value": 800, "default": 1000, "source": "settings" } },
  "storage": { "backend": { "value": "json", "source": "config" },
               "sqlitePath": "/Users/mac/.dsh/reqboard.sqlite",
               "effective": "json", "restartRequired": false },
  "system": { "exists": true, "updatedAt": "2026-10-04T10:31:12+08:00", "events": 5,
              "paths": { "settingsFile": "/Users/mac/.dsh/dsh-reqboard-settings.json",
                          "systemFile": "/Users/mac/.dsh/dsh-reqboard-system.json",
                          "shardDataRoot": "/Users/mac/.dsh/reqboard",
                          "sqliteFile": "/Users/mac/.dsh/reqboard.sqlite" } }
} }
```

**为什么必须带 `system.paths`（实现约束，2026-10-04 核查既有前端后补）**：右上角「打开配置文件」要打开的是**绝对路径**，而该路径只有系统记录知道（设置文件本身不知道自己叫什么）。因此 `GET /settings` 必须随响应回 `paths`，**不要让前端为此再拉一次 `/settings/system`**。

**FR-17 惰性创建下的按钮态**：设置文件尚未创建时，该按钮**不得**尝试打开一个不存在的路径（会得到"文档不存在"的误导报错），应显示为禁用态并给一句"尚未创建：首次保存上限或确认切库后生成"；文件出现后按钮自动可用（下一次 `GET /settings` 刷新）。

### PATCH /dashboard/api/reqboard/settings <!-- serves: FR-4 -->

请求：`{ "stageMaxRounds": { "implementing": 800 } }`。成功 `200` 回 `{ stageMaxRounds, restartRequired:false }`。
失败 `400`：`{ success:false, code:"invalid_input", error:"stageMaxRounds.implementing 需为 1–10000 的整数（收到 0）——改成范围内的整数后重试" }`。
**体里出现 `storage.backend` → `400`**，消息指向确认门路由（防止绕过 FR-11）。

### 人工确认留痕契约（FR-11 的代码级落点） <!-- serves: FR-11 -->

**先落章，后执行**——三个动作、两条规则：

| 动作 | 谁可调 | 语义 |
|---|---|---|
| `POST /settings/storage/request` | 看板（人）或 agent 工具（**仅提问**） | 建一条**待确认**记录 `{ action, ticket, expiresAt: +10min, requestedBy }`，并经既有 `UserQuestionPort` 把确认框推给人 |
| 作答通道：弹框作答 / 看板确认按钮 / 文字证据命中真实用户消息 | **只有人** | 落章 `{ kind:'human', at, channel:'board-confirm', sessionId, pluginVersion }`，票据转为**已落章·未消费** |
| `…/storage/switch`、`…/storage/migrate` | 路由内部 | **必须携带"已落章且未消费"的 ticket**；消费即作废（一次性）；缺失/过期/已消费 → `403 confirmation_required`（不开窗、不写设置、不写系统事件） |

**对既有挂起确认机制的扩写（实现约束，2026-10-04 核查 `PendingConfirmRegistry` 后补）**：现有 `register()` 只接 `target: 'artifact' | 'plan'` 且 `requirementId` 必填，并**只有 `settle`、没有一次性消费**。本需求必须扩两处：① `register()` 接受 `target: 'storage-action'` 且 `requirementId` 可空（存储开关是**宿主级**动作，不属于任何一条需求）；② 新增 `consume(ticket)`，语义 = 原子地"校验已落章 + 未过期 + 未消费"并把状态置为已消费（**并发两次调用只能成功一次**）。落章写入沿用 `settle` 既有形状（含 `channel:'board-confirm'`、`sessionId`、`pluginVersion`），不新造第二套记录。

**保证等级（如实写明，不夸大）**：本机 HTTP 无鉴权，任何本地进程都能打接口，因此这是**通道约定级**保证——**与全仓既有五道人工门同级**（路由层 actor 默认 `human`，见 `http/routers/requirements.ts` 的 artifact/plan 确认），**不是密码学证明**。我们能做且必须做的三件事：① **不提供任何 agent 工具入口**（agent 只能 ask、不能 save）；② 执行必须消费已落章票据；③ 留痕写明 `channel / sessionId / pluginVersion` 供审计——绕过工具直打接口者会留下 `confirmedVia:'board'` 的痕迹，可被复盘查出。

### POST /dashboard/api/reqboard/settings/storage/pick-path <!-- serves: FR-6 -->

> **2026-10-04 人要求**：「改路径」要**像操作系统那样**弹窗口选地址，而不是让人手打路径。
> 浏览器拿不到真实绝对路径（安全边界），所以真正的选择发生在**宿主进程**：
> macOS 原生「存储为」窗口（`osascript` + `choose file name`，返回 POSIX 绝对路径）。
> 之所以用「存储为」而非选目录：目标是**库文件路径**（含文件名），选目录对不上。

- 请求：`{}`（**无入参**——脚本是常量、参数只走 argv，shell 不参与，因此没有注入面）
- `200 { ok: true, path }`：选中
- `200 { ok: false, cancelled: true }`：人取消（**不是错误**；界面什么都不说）
- `501 path_picker_unavailable`：平台不支持 / `osascript` 不在 / 超时被杀 / 其它执行失败 →
  消息里明确「可以手动输入路径」
- 可注入：路由优先用 `deps.pickStoragePath`（测试注入假实现覆盖三态），缺省用 osascript 实现
- 超时：默认 10 分钟（人在窗口里可能想很久），超时**杀掉子进程**并按不可用处理

### POST /dashboard/api/reqboard/settings/storage/switch <!-- serves: FR-6, FR-11 -->

请求：`{ "backend": "sqlite" | "json", "ticket": "sc-…", "reason": "可选" }`（`ticket` 来自上表"已落章未消费"的确认票据）。
成功 `200`：`{ "backend":"sqlite", "restartRequired": true, "systemEvent":"backend-switched" }`。
失败：`400 invalid_input`（值非法）；`409 sqlite_not_migrated`（切 sqlite 但库还没数据 → 先走 migrate）。

### POST /dashboard/api/reqboard/settings/storage/migrate <!-- serves: FR-10, FR-11 -->

请求：`{ "ticket": "sc-…" }`。成功 `200`：`{ "windowKey":"session-9f4c21ab", "sessionId":"…", "task":"migrate-ledger-to-sqlite" }`。
失败：`403 confirmation_required`（无已落章票据）；`409 migration_in_progress`（已有迁移在跑）；`503 not_ready`（宿主未就绪）／`window_opener_unavailable`（开窗能力未装配）；`502 dispatch_failed`（底稿投递失败）。**任何失败路径都不写 `migration` 事件**（不伪造"已开始"）。

### GET /dashboard/api/reqboard/settings/system <!-- serves: FR-14, FR-15, FR-16 -->

查询 `?limit=50`（history 尾部条数，上限 500）。返回系统记录全量（含 `compat` 一致性结论）与 `droppedEvents`（写失败计数，便于屏上红字）。

## 前端 API 客户端 <!-- serves: FR-5 -->

`src/client/api.ts` 新增：`fetchRunSettings()` / `patchRunSettings(patch)` / `switchStorageBackend(backend, reason?)` / `startLedgerMigration()` / `fetchSystemRecord(limit?)`；沿用既有 `ApiError`（带 `message/hint`）与"信封解析"路径，不新增第二套错误处理。

## 迁移脚本 CLI <!-- serves: FR-10, FR-13 -->

```
npx tsx scripts/migrate-ledger-to-sqlite.ts \
  --from ~/.dsh/reqboard \
  --to   ~/.dsh/reqboard.sqlite \
  [--dry-run] [--write-settings]
```

| 参数 | 语义 | 缺省 |
|---|---|---|
| `--from` | 分片数据根 | 报错退出（不猜） |
| `--to` | 目标库文件 | `<dshHome>/reqboard.sqlite` |
| `--dry-run` | 只预检与打印计划，不写任何文件 | 关 |
| `--write-settings` | 校验通过后写 `storage.backend=sqlite`（**人确认后由 Agent 附带此参数**） | 关 |

stdout 打印结构化进度（每步一行，含条数与耗时），便于 Agent 汇报与看板展示。

## 错误码与失败语义 <!-- serves: FR-4, FR-10, FR-11, FR-12 -->

| 码 | 触发 | 语义与去向 |
|---|---|---|
| `invalid_input` | PATCH/switch 参数非法 | 400，消息含"哪一项、范围、怎么改" |
| `REQBOARD_SETTINGS_INVALID` | 设置文件字段非法 | 内部码；不阻断，作废该键并记 `settings-invalid` |
| `REQBOARD_SQLITE_SCHEMA_MISMATCH` | 库 schema 版本 ≠ 当前 | 启动期报警 + 给**重建库**指引；不许硬读旧表 |
| `REQBOARD_REQUIRES_SQLITE_MIGRATION` | 库空/不存在而分片非空 | 未就绪（HTTP 503），消息含可复制命令 |
| `REQBOARD_REQUIRES_MIGRATION` | 既有：单册在场未迁移 | 未就绪（HTTP 503），行为不变 |
| `REQBOARD_CONFLICT` | `mutateIf` 版本不匹配 | 沿用既有语义 |
| `migration_in_progress` | 已有迁移在跑 | 409，提示先等/先看窗口 |
| `confirmation_required` | 无"已落章未消费"票据就调 switch/migrate | **403**（对齐既有 `human_gate` 的 403 语义） |
| `window_opener_unavailable` | 开窗能力未装配（`windowOpener.available()=false`） | 503，指引"宿主未装配会话开窗能力" |
| `dispatch_failed` | 开窗成功但底稿投递失败 | 502，**不写 migration 事件**（窗口在、任务没到，如实说） |
| `window_open_failed` | 开 Agent 窗口失败 | 500，**不伪造"已开始"**（不写 migration 事件） |

**实现落点（必改）**：`src/http/envelope.ts` 的 `fail()` 里那张 code→status 映射表要补登 `confirmation_required → 403`、`REQBOARD_REQUIRES_SQLITE_MIGRATION → 503`、`window_opener_unavailable → 503`、`dispatch_failed → 502`、`migration_in_progress / sqlite_not_migrated → 409`——**不补就等于全部落 500**（与"失败要响亮、且要分得清"相悖）。

**两种"未就绪"必须区分（口径决定，2026-10-04）**：`REQBOARD_REQUIRES_SQLITE_MIGRATION`（已选 sqlite、库空而分片非空）→ 指引"点看板『交给 Agent 处理』或跑 `migrate-ledger-to-sqlite`"；`REQBOARD_REQUIRES_MIGRATION`（既有：单册在场、分片未迁移）→ 指引跑既有 `scripts/migrate-ledger-v10.ts`。**不得合并成一句"去迁移"**——两者要跑的是不同脚本、动的是不同数据。

**确认门与 `--write-settings` 的关系（口径决定，2026-10-04）**：一次人工确认覆盖五步，**包含第 5 步"写设置"**。`--write-settings` **默认关**只是"人手跑脚本时的安全缺省"；Agent 执行已被确认的任务时附带该参数。两者不矛盾：确认是**许可**，缺省关是**手动路径的保守值**——许可不等于默认。
