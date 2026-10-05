---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-6, FR-7, FR-9, FR-10, FR-12, FR-13, FR-14, FR-15, FR-16, FR-17]
sides: [backend]
---

# 数据模型设计：运行设置与可切换存储后端（REQ-261004103330-005f）

## 设置文件 schema <!-- serves: FR-1, FR-2, FR-6 -->

路径：`<dshHome>/dsh-reqboard-settings.json`（`dshHome` 缺省 `~/.dsh`）。**惰性创建**：不存在 = 全默认，不建文件（FR-17）。

```ts
/** schemaVersion 只增不改：未知版本 → 全部走默认并记 settings-invalid（不按新格式猜读）。 */
interface RunSettingsFileV1 {
  schemaVersion: 1
  /** 只写被覆盖的阶段键；未出现的键走默认表。 */
  stageMaxRounds?: Partial<Record<RequirementStatus, number>>
  storage?: {
    backend?: 'json' | 'sqlite'
    sqlitePath?: string
  }
  updatedAt?: string
}
```

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| `schemaVersion` | `1` | 是 | `1` | 非 `1` → 整份回落到默认并记 `settings-invalid` |
| `stageMaxRounds.<stage>` | `number` | 否 | 见默认表 | 整数且 `1 ≤ n ≤ 10000`；非整数/越界 → 该键作废并记 `settings-invalid`（其余键仍生效） |
| `storage.backend` | `'json' \| 'sqlite'` | 否 | `json` | 只接受这两个字面量 |
| `storage.sqlitePath` | `string` | 否 | `~/.dsh/reqboard.sqlite` | 相对路径按 `dshHome` 解析；父目录不存在 → 建库时报错并给指引 |
| `updatedAt` | ISO 字符串 | 否 | — | 写入时由宿主盖章，读时忽略 |

**默认表**（保留在 `stage-configs.ts`，是**唯一**的默认来源，不复制第二份）：

| 阶段 | 默认上限 | 注 |
|---|---|---|
| `draft` / `done` / `archived` / `canceled` | 1 | 无自动化，改它不影响行为（保留在设置表以便整表对账） |
| `brainstorming` | 500 | |
| `design` | 200 | |
| `decomposing` | 100 | |
| `implementing` | 1000 | |
| `accepting` | 50 | |

**解析结果形状**（端口返回给路由与看板，每项都带来源）：

```ts
interface ResolvedRunSettings {
  stageMaxRounds: Record<RequirementStatus, { value: number; default: number; source: 'settings' | 'config' | 'env' | 'default' }>
  storage: {
    backend: { value: 'json' | 'sqlite'; source: 'settings' | 'config' | 'env' | 'default' }
    sqlitePath: string
    effective: 'json' | 'sqlite'      // 本进程实际在用的（≠ value 时表示"待重启生效"）
    restartRequired: boolean
  }
  problems: Array<{ key: string; reason: string; fellBackTo: string }>
}
```

## 系统记录 schema <!-- serves: FR-14, FR-15, FR-16, FR-17 -->

路径：`<dshHome>/dsh-reqboard-system.json`。**启动自动创建**（幂等，不覆盖）；只追加，`history` 上限 500 条。

```ts
interface SystemRecordV1 {
  schemaVersion: 1
  updatedAt: string
  plugin: { name: string; version: string; buildStamp: string; sqliteSchemaVersion: number; recordedAt: string }
  paths: { shardDataRoot: string; sqliteFile: string; settingsFile: string; legacyLedger: string; backupDirs: string[] }
  active: { backend: 'json' | 'sqlite'; since: string; source: 'settings' | 'config' | 'env' | 'default' }
  stores: {
    shards: { exists: boolean; requirements: number; bytes: number; headRevision: number }
    sqlite: { exists: boolean; requirements: number; bytes: number; migratedAt?: string; stale: boolean; staleReason?: string; writtenBy?: { pluginVersion: string; buildStamp: string } }
  }
  history: SystemEvent[]
  counters: { migrations: number; migrationsFailed: number; rollbacks: number; upgrades: number; truncated: number; lastStartupAt: string; lastMigrationAt?: string }
  compat: { checkedAt: string; consistent: boolean; currentPluginVersion: string; lastMigrationBy?: { pluginVersion: string; at: string } }
}

type SystemEvent =
  | { at: string; event: 'startup'; backend: 'json' | 'sqlite'; source: string; requirements: number; detected?: { staleSqlite?: boolean }; plugin: PluginStamp }
  | { at: string; event: 'upgrade'; from: PluginStamp; to: PluginStamp; detectedBy: 'startup-compare'; note?: string; plugin: PluginStamp }
  | { at: string; event: 'migration'; from: 'json'; to: 'sqlite'; result: 'ok' | 'failed'; requirements: number; durationMs: number; backupDir?: string; windowKey?: string; error?: string; confirmedBy?: ConfirmStamp; plugin: PluginStamp }
  | { at: string; event: 'backend-switched'; from: 'json' | 'sqlite'; to: 'json' | 'sqlite'; reason?: string; keptOtherStore: boolean; confirmedBy?: ConfirmStamp; plugin: PluginStamp }
  | { at: string; event: 'settings-invalid'; key: string; reason: string; fellBackTo: string; plugin: PluginStamp }

interface PluginStamp { version: string; buildStamp: string }
interface ConfirmStamp { kind: 'human'; at: string; channel: 'board-confirm'; sessionId?: string; pluginVersion: string }
```

契约示例（可直接对照实现）：`docs/requirements/REQ-261004103330-005f/prototype/system-record.example.json`。

## SQLite 表结构 <!-- serves: FR-7, FR-9 -->

与分片目录**一一对应**（分片：`requirements/<id>/record.json` + `comments.jsonl` + `history.jsonl` + `meta.json` + 冷侧 `archive/`）。

| 表 | 主键 | 主要列 | 对应分片物 |
|---|---|---|---|
| `requirements` | `id TEXT` | `title, status, category, prompt_difficulty, version INTEGER, created_at, updated_at, source_session_id, autorun INTEGER, blocked INTEGER, workspace_root, doc_base_path, comment_count INTEGER, history_count INTEGER, big_fields TEXT(JSON)` | `record.json`（标量 + 计数；大字段按需） |
| `comments` | `(req_id, seq)` | `id, body, created_at, created_by TEXT(JSON)` | `comments.jsonl` |
| `history` | `(req_id, seq)` | `kind, status, at, reason, by TEXT(JSON), token_snapshot TEXT(JSON)` | `history.jsonl` |
| `parts` | `(req_id, key)` | `value TEXT(JSON)` | 外置大字段（`description` / `dive` / `advance` / `artifacts` / `tokenUsage`） |
| `meta` | `key TEXT` | `value TEXT` | `meta.json`（`revision` / `triages` / `schemaVersion`） |
| `archived` | `id TEXT` | 同 `requirements`（冷侧只读） | `archive/` 冷侧 |

索引：`requirements(status, updated_at DESC, id ASC)`（对齐 `listSummaries` 的排序契约）、`requirements(category)`、`comments(req_id, seq)`、`history(req_id, seq)`。

**写语义**：`mutate` / `mutateIf` / `create` / `appendComment` / `sweep` / `replaceAll` 各自在**单个事务**内完成；`mutateIf` 的 `version` 不匹配 → 回滚并抛 `REQBOARD_CONFLICT`（带当前版本）。冷侧写入 → `REQBOARD_COLD_IMMUTABLE`。

## 两种后端的等价性对照 <!-- serves: FR-9 -->

| 端口方法 | 分片实现 | SQLite 实现 | 等价判定 |
|---|---|---|---|
| `get` | 装配 record + 大字段按需读 | `requirements` + `parts` 装配 | 逐字段深比较（契约测试） |
| `getSummary` / `listSummaries` | 内存索引（懒建）+ 游标分页 | SQL 查询 + 同一对 encode/decode 游标 | 排序契约 `updatedAt DESC, id ASC` 一致 |
| `listComments` / `listHistory` | JSONL 顺序读 + `since`/`limit` | `WHERE req_id=? AND seq>=? ORDER BY seq` | 同序同限 |
| `head` / `headAfterDrain` | `meta.json` revision（后者等写队列排空） | `meta.revision`（事务提交即已落盘） | 语义一致：`headAfterDrain` 返回"已落盘"的 revision |
| `mutate` / `mutateIf` | 写前重读 + 进程内串行队列 | 单事务 + `version` 条件更新 | 原子性与 CAS 语义一致 |
| `subscribe` | 写提交后回调 | 写事务提交后回调 | 回调时机一致（提交后） |
| `peekSummaries` / `peekFacts` | 内存投影（可能略旧） | 内存投影（同款） | 允许略旧，不许为空导致的判定错误 |

## 版本与兼容 <!-- serves: FR-9, FR-15, FR-16 -->

| 版本号 | 载体 | 本次取值 | 变更含义 |
|---|---|---|---|
| `REQBOARD_SCHEMA_VERSION` | 台账**记录形态** | **维持 9** | 换后端不改记录，故不升 |
| `sqlite_schema_version` | SQLite 库（`meta` 表 + 系统记录） | `1` | 表结构变更时才 +1；不匹配 → FR-16 报警并给重建指引 |
| `dsh-pmboard` 插件版本 | `package.json.version`（唯一来源） | `0.1.0` | 启动比对写 `upgrade` 事件 |
| 设置文件 / 系统记录 `schemaVersion` | 各自文件头 | `1` | 未知版本 → 回落默认并记 `settings-invalid`（设置）／跳过未知字段（记录） |

## 迁移与回填算法 <!-- serves: FR-10, FR-12, FR-13 -->

```
migrate-ledger-to-sqlite --from <分片根> --to <库文件> [--dry-run]

① 预检：源 meta.json 在？目标库在？（在 → 标记 stale 判定：库里 migratedAt 与条数对比源）
   分叉检测（口径决定，2026-10-04）：若 `shards.requirements > sqlite.requirements`
   或分片 `headRevision` 晚于库的 `migratedAt` → 标记库 `stale`，**明确提示"会先备份旧库再全量重建"**，
   **绝不静默合并**两侧数据。
② 备份：<dshHome>/backups/reqboard-<yyyyMMdd-HHmmss>/  ← 复制分片目录整体（只增不删）
③ 建库：若目标已存在 → 先把它自身备份为 <库文件>.bak-<时间戳>，再重建（陈旧库不得当现状）
④ 建表：执行 sqliteSchema 的 DDL，写 meta.sqlite_schema_version = 1
⑤ 迁移：单事务内逐需求导入 requirements/comments/history/parts/archived；逐条校验 id 与 version
⑥ 校验：条数相等 + 抽样 5 条逐字段深比较（不一致 → 全部回滚、exit 3）
⑦ 写设置：仅在第 ⑥ 步通过后写 storage.backend = sqlite
⑧ 退出码：0 成功 / 2 预检不过 / 3 校验不过（已回滚）/ 4 IO 失败
```

回填策略：**全量重建**（不做增量对账）。理由：本次是"切换后端"而非"双写同步"，增量会引入两套时钟与冲突解决，收益为零；全量重建 + 事务 + 抽样校验已经把"数据一致性"这条锁住了。

重试口径（口径决定，2026-10-04）：失败重试一律**以当前分片为准全量重建**（算法本就是全量重建，天然覆盖"重试前分片又被写了新需求"的情形）；旧库与旧备份保留，面板明示"将重建"。

回滚策略：分片目录在任何路径下**只读**；回滚 = 把设置改回 `json` + 重启，无需数据操作。
