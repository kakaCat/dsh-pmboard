/**
 * SQLite 库结构（REQ-261004103330-005f FR-7 / FR-9）——**唯一**的 DDL 与库版本常量。
 *
 * ## 为什么要单独一个文件
 *
 * 驱动 `node:sqlite` 目前是 experimental：API 可能变。把 DDL、PRAGMA、库版本常量收敛到这一处，
 * 升级驱动时只改这里；散在适配器里则要逐处找。
 *
 * ## 版本与台账版本是**两件事**
 *
 * - `REQBOARD_SCHEMA_VERSION`（= 9）描述**记录形态**，换后端不改记录，故本次不升版；
 * - `SQLITE_SCHEMA_VERSION`（= 1）描述**库表结构**，表结构变了才 +1。
 *
 * 两者不同步是刻意的：混成一个版本号后，"换了后端"与"改了字段"就再也分不开，
 * 而 FR-16 的一致性核对正是要分辨这两件事。
 *
 * @module dsh-pmboard/repositories/sqliteSchema
 */

/** 库表结构版本（写进 `meta.sqlite_schema_version`；不匹配 → 报警并给重建指引）。 */
export const SQLITE_SCHEMA_VERSION = 1

/** 打开库时统一应用的 PRAGMA（WAL：读写并发更好；foreign_keys：约束真的生效）。 */
export const SQLITE_PRAGMAS: readonly string[] = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
]

/**
 * 建表语句（`IF NOT EXISTS`：可重复执行，天然幂等）。
 *
 * 与分片目录的一一对应关系见 `design/data-model.md`；`parts` 承载外置大字段
 * （`description` / `dive` / `advance` / `artifacts` / `tokenUsage`），避免把大 JSON
 * 塞进 `requirements` 行里导致摘要查询被拖慢。
 */
export const SQLITE_DDL: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS requirements (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     status TEXT NOT NULL,
     category TEXT,
     prompt_difficulty TEXT,
     version INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     source_session_id TEXT,
     autorun INTEGER NOT NULL DEFAULT 0,
     blocked INTEGER NOT NULL DEFAULT 0,
     project_id TEXT,
     workspace_root TEXT,
     doc_base_path TEXT,
     comment_count INTEGER NOT NULL DEFAULT 0,
     history_count INTEGER NOT NULL DEFAULT 0
   )`,
  `CREATE TABLE IF NOT EXISTS parts (
     req_id TEXT NOT NULL,
     key TEXT NOT NULL,
     value TEXT NOT NULL,
     PRIMARY KEY (req_id, key)
   )`,
  `CREATE TABLE IF NOT EXISTS comments (
     req_id TEXT NOT NULL,
     seq INTEGER NOT NULL,
     id TEXT NOT NULL,
     body TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     created_by TEXT NOT NULL,
     PRIMARY KEY (req_id, seq)
   )`,
  `CREATE TABLE IF NOT EXISTS history (
     req_id TEXT NOT NULL,
     seq INTEGER NOT NULL,
     kind TEXT NOT NULL,
     status TEXT NOT NULL,
     at INTEGER NOT NULL,
     reason TEXT,
     by TEXT NOT NULL,
     token_snapshot TEXT,
     -- 行级**权威原件**（整行 JSON）。为什么必须有它：history 是两种行的合流
     -- （status 行 + advance 行），而 advance 行的 event/outcome/durationMs/detail/
     -- parentId/subtaskId **在既有列里放不下**；把它塞进 reason 之类是语义重载，
     -- 读表的人会以为那是"原因"。结构化列保留作镜像（供查询与 NOT NULL 约束），
     -- 读侧以本列为准、缺列时才退回结构化列（见 sqliteRows.historyLineOfRow）。
     payload TEXT,
     PRIMARY KEY (req_id, seq)
   )`,
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY,
     value TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS archived (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     status TEXT NOT NULL,
     category TEXT,
     prompt_difficulty TEXT,
     version INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     source_session_id TEXT,
     autorun INTEGER NOT NULL DEFAULT 0,
     blocked INTEGER NOT NULL DEFAULT 0,
     project_id TEXT,
     workspace_root TEXT,
     doc_base_path TEXT,
     comment_count INTEGER NOT NULL DEFAULT 0,
     history_count INTEGER NOT NULL DEFAULT 0
   )`,
  // 排序契约（端口承诺）：updatedAt 降序、同刻按 id 升序——与 shardPaging 的游标口径同源。
  'CREATE INDEX IF NOT EXISTS idx_requirements_order ON requirements (status, updated_at DESC, id ASC)',
  'CREATE INDEX IF NOT EXISTS idx_requirements_category ON requirements (category)',
  'CREATE INDEX IF NOT EXISTS idx_comments_req ON comments (req_id, seq)',
  'CREATE INDEX IF NOT EXISTS idx_history_req ON history (req_id, seq)',
]

/** 表名清单（测试与体检用；与上面的 DDL 一一对应）。 */
export const SQLITE_TABLES: readonly string[] = ['requirements', 'parts', 'comments', 'history', 'meta', 'archived']

/**
 * **增量补列**（REQ-261005141830-7a3b t2 · FR-8）：`CREATE TABLE IF NOT EXISTS` 只建新表，
 * **不会**给已存在的表加列——而插入语句是按 `HOT_COLUMNS` **显式列名**写的。
 *
 * 后果实测（2026-10-05，本需求复核用的破坏性探针）：老库（建表时没有 `project_id`）配本次代码，
 * **读得到**（缺列读回"没有这个键" = 未归属），但**任何写入都失败**：
 * `table requirements has no column named project_id` —— 不补列 = 存量库升级后变只读。
 *
 * 故打开库时逐条补，判据是 `PRAGMA table_info`（列已存在即跳过，**不靠捕获错误**：
 * 捕获 "duplicate column" 会把真正的建表错误一并吞掉）。
 * 表名与列名都是本文件里的常量（不来自外部输入），拼进 PRAGMA/DDL 是安全的。
 */
export const SQLITE_COLUMN_MIGRATIONS: readonly { table: string; column: string; ddl: string }[] = [
  { table: 'requirements', column: 'project_id', ddl: 'ALTER TABLE requirements ADD COLUMN project_id TEXT' },
  { table: 'archived', column: 'project_id', ddl: 'ALTER TABLE archived ADD COLUMN project_id TEXT' },
]

/** `meta` 表里的保留键（键名写错会静默读到 undefined，故具名）。 */
export const SQLITE_META_KEYS = {
  /** 全局版本（SSE 帧与"已落盘"指针用）。 */
  revision: 'revision',
  /** 分诊记录（与分片的 `meta.json` 同源）。 */
  triages: 'triages',
  /** 库表结构版本。 */
  schemaVersion: 'sqlite_schema_version',
} as const

/** 库表结构不匹配时抛的码（由调用方映射成可读告警 + 重建指引）。 */
export const SQLITE_SCHEMA_MISMATCH = 'REQBOARD_SQLITE_SCHEMA_MISMATCH'

/**
 * 库表结构是否与当前实现一致。
 *
 * 故意**不做**自动升级：表结构变化意味着数据搬家，自动改表在用户不知情时动的是唯一一份数据。
 * 不一致时如实报警并给"重建库（迁移）"的指引。
 */
export function sqliteSchemaMatches(stored: unknown): boolean {
  return typeof stored === 'number' && stored === SQLITE_SCHEMA_VERSION
}
