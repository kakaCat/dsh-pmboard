---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-8
---

# 数据模型（分片布局 · 摘要投影 · 关系型映射） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-8

> 本文定**字段、类型、约束、迁移映射与回滚**。字段一律用 `RequirementRecord` 现有名字（`src/shared/protocol.ts`），不新增同义字段。

## 逻辑模型与不变量 serves: FR-1, FR-3

**聚合根 = 需求**。一条需求的全部状态 = `~/.dsh/reqboard/requirements/<REQ>/` 一个目录；跨需求不存在需要原子提交的字段（唯一例外见「跨需求批量」）。

四条不变量（写路径必须维持，A4/A7/A12 断言）：

- **I-1 提交点唯一**：`record.json` 是唯一提交点；日志与外置对象先落盘，`record.json` 后落盘。任何时刻"记录里的状态"就是已提交状态。
- **I-2 计数截断**：日志（`comments.jsonl` / `history.jsonl`）的**有效前缀**由 `record.json` 里的计数（`commentCount` / `historyCount`）决定；超出计数的尾部行是未提交残留，读侧忽略。
- **I-3 冷侧只读**：`archive/` 下的需求不可写（`REQBOARD_COLD_IMMUTABLE`），只能整目录搬回热侧（归档回滚由人工操作）。
- **I-4 热记录有界**：`record.json` 体积**与日志行数、产物条数、验收条数无关**（实测峰值 5038B；设计上界 **8KB**）。

## 热记录 `record.json` serves: FR-2, FR-3

`RequirementRecord` 的**标量与小对象部分**；下列字段**不在**此文件：`comments` / `statusHistory` / `artifacts` / `plan` / `verification` / `archive`。

| 字段 | 类型 | 约束 | 说明 |
|------|------|------|------|
| `id` | string | `^REQ-(\d{12}-[0-9a-f]{4}\|[0-9a-f]{6})$` | 目录名同源 |
| `title` / `description` | string | 必填 | `description` 实测峰值 2.9KB，留在热记录 |
| `category` | enum | 六类之一 | 缺省 `feature` |
| `promptDifficulty` | enum | simple/standard/advanced/expert | 缺省 `standard` |
| `docBasePath` / `docLinks` | string / 小对象 | 可选 | 文档路径，不是文档本体 |
| `workspaceRoot` | string | 绝对路径；落库后不可变 | 项目维度锚点（台账是 profile 级） |
| `status` | enum | 主状态机九值 | 决定热/冷侧归属 |
| `blocked` / `blockedReason` / `paused` / `autoRun` | bool / string | 可选 | 卡片直接渲染 |
| `advance` | 对象 | **仅锁字段与告警字段**：`lockAt` `runId` `noopStreak` `failureStreak` `pausedReason` | `history` 外置到日志（无上界） |
| `dive` | 对象 | 可选 | 自动续跑状态（实测上限 0.3KB） |
| `tokenUsage` | 对象 | 可选 | 聚合值（实测上限 0.8KB）；缺失 ≠ 0 |
| `interruption` | 对象 | 可选，后写覆盖 | 断点，单对象 |
| `docSyncPending` | 数组 | 待同步标记 | 有成对销标规则，条数天然有界 |
| `acceptanceOverride` | 对象 | 可选 | 覆盖式通过留痕 |
| `reviewSessionId` / `sourceSessionId` / `archivePath` | string | 可选 | 窗口与归档锚点 |
| `version` | number | 每次成功写入 **+1**（适配器自增） | CAS 令牌 |
| `createdAt` / `updatedAt` | number | 毫秒 | — |
| `createdBy` / `updatedBy` | 对象 | `{kind, sessionId?}` | — |
| `commentCount` | number | 新增 | I-2 的截断依据；不是"统计字段"，是提交点的一部分 |
| `historyCount` | number | 新增 | 同上 |
| `artifactCount` | number | 新增 | 摘要投影与体积判据用 |

## 追加日志 serves: FR-3

两个文件都是 **JSON Lines**（一行一条 JSON，UTF-8，行尾 `\n`），只追加、不就地改。

| 文件 | 行形状 | 序 | 读取 |
|------|--------|----|------|
| `comments.jsonl` | `{seq, id, body, createdAt, createdBy?}` | `seq` 从 0 单调 +1 | 按 `seq < commentCount` 读；支持 `since` / `limit` |
| `history.jsonl` | `{seq, kind:'status'\|'advance', …}` | `seq` 从 0 单调 +1 | `kind:'status'` → `StatusEvent`；`kind:'advance'` → `AdvanceRecord` |

- **序与计数的关系**：`commentCount = N` 表示有效行是 `seq ∈ [0, N)`。追加一行后，先写日志（`seq = N`）、再写 `record.json`（`commentCount = N+1`）。
- **崩溃残留**：若日志有 `seq = N` 而记录仍是 `N`，该行为未提交，读侧忽略；下一次追加沿用 `seq = N` 覆盖写这一行（追加前先按计数截断文件尾巴，这是唯一允许的"回退文件长度"动作，且只回退未提交部分）。
- **压缩**：`comments.jsonl` 行数达到 `commentCount` 的 2 倍时才需要压实（正常路径不会出现，只有在多次崩溃残留后触发）。

## 外置大对象 serves: FR-3

四个文件都是**整份原子写**（temp → fsync → rename），单需求有界：

| 文件 | 内容 | 写入时机 | 实测峰值 |
|------|------|---------|---------|
| `artifacts.json` | `StageArtifact[]` | 登记 / **就地盖章** `confirmedAt` | 50.9KB（216 条） |
| `plan.json` | `PlanRecord`（含 `tasks[]`） | 提交计划 / 批准 / 退回 | 12.4KB |
| `verification.json` | `{summary, evidence[], submittedAt, submittedBy, sheet?, sheetHistory[]}` + 审核字段 | 提交验收 / 裁决 / 返工重交 | 71.0KB |
| `archive.json` | `ArchiveRecord` | 归档材料提交 | 2.4KB |

**为什么 `artifacts` 不进追加日志**：产物登记后会在人工确认时就地写 `confirmedAt` / `confirmedVia` / `confirmedEvidence`——"只追加"不成立。硬塞进日志会立刻产生"同一事实两处存"（本仓明确禁止的形态）。

## 摘要投影 `RequirementSummary` serves: FR-1, FR-4

看板首屏载荷的元素类型，**与 `RequirementRecord` 是两个不同类型**（编译器强制区分：摘要不可喂给详情视图）。

| 字段 | 来源 | 消费点（实测） |
|------|------|---------------|
| `id` `title` `status` `category` | 记录 | 卡片 / 泳道 / 列表 / 时间线 |
| `blocked` `paused` `autoRun` | 记录 | 卡片角标 |
| `createdAt` `updatedAt` | 记录 | 排序与新鲜度 |
| `sourceSessionId` | 记录 | 窗口 chip |
| `promptDifficulty` `workspaceRoot` `docBasePath` | 记录 | 面板头部 |
| `version` | 记录 | 客户端 CAS 写回 |
| `commentCount` `artifactCount` | 记录 | 卡片计数徽标（**不读日志与明细**） |
| `advanceAlert` | 记录投影 | `{pauseReason?, failureStreak?}`——subtask 徽标只读这三项，`history` 不进摘要 |

实测摘要单条 **156B**；`listSummaries()` 走内存索引，零文件读。

## 冷存与状态边界 serves: FR-4

- 进冷侧：`status ∈ {archived, done}`（现状 33/35 条）。归档动作后目录从 `requirements/` 搬到 `archive/`。
- 冷侧不进内存索引、不进 `/state` 默认载荷；`listSummaries({scope:'archived'})` 显式请求时才扫冷侧目录名（只读目录项，不读内容）。
- `get(id)` 先在热侧找，未命中再回落冷侧（详情深链可用）。
- 写路径命中冷侧 → `REQBOARD_COLD_IMMUTABLE`（响亮拒绝，不静默无操作）。

## 版本与 revision 语义 serves: FR-5

| 名字 | 作用域 | 存储 | 递增者 | 用途 |
|------|--------|------|--------|------|
| `version` | 单条需求 | `record.json` | **适配器**（每次成功写入 +1） | CAS：`mutateIf` 的期望值；A6 |
| `revision` | 全局 | `meta.json` | 适配器（`record.json` 落盘成功后 +1） | SSE 帧、"{已落盘}"指针、客户端短路 |
| `schemaVersion` | 全局 | `meta.json` | 迁移脚本 | v10 |

现状对照：`version` 今天由**调用点手工自增**，实测 90 处 `mutate` 回调中仅 45 处自增，其余写后版本陈旧 ⇒ 不能作 CAS 令牌。本设计把自增收进适配器（FR-5 的前提）。

## 关系型映射 serves: FR-6

DB 适配器要落的表结构（下一需求实现，本次定死形状）：

| 表 | 主键 | 关键列 | 索引 | 映射来源 |
|----|------|--------|------|---------|
| `ledger_meta` | `id`(=1，单行) | `schema_version` `revision` `migrations_json` | — | `meta.json` |
| `requirements` | `id` | 热记录全部列（见上表）+ `comment_count` `history_count` `artifact_count` `version` | `(status)` `(workspace_root)` `(source_session_id)` `(updated_at)` | `record.json` |
| `requirement_comments` | `(req_id, seq)` | `id` `body` `created_at` `author_kind` `author_session` | `(req_id, created_at)` | `comments.jsonl` |
| `requirement_history` | `(req_id, seq)` | `kind` `status` `at` `author_kind` `author_session` `reason` `inferred` `token_snapshot_json` | `(req_id, at)` | `history.jsonl` |
| `requirement_artifacts` | `(req_id, seq)` | `stage` `kind` `path` `registered_at` `confirmed_at` `confirmed_via` `confirmed_evidence` `auto_discovered` `file_mtime` `file_size` | `(req_id, kind)` | `artifacts.json` |
| `requirement_plans` | `req_id` | `path` `summary` `tasks_json` `submitted_at` `approved_at` `approved_via` `rejected_at` `rejected_reason` | — | `plan.json` |
| `requirement_verifications` | `req_id` | `summary` `evidence_json` `submitted_at` `sheet_json` `sheet_history_json` `reviewed_at` `decision` `review_note` | `(decision)` | `verification.json` |
| `requirement_archives` | `req_id` | `ArchiveRecord` 全列（文档清单/合并去向/索引条目/说明书更新点） | — | `archive.json` |
| `triages` | `id` | 分诊记录全列 | `(status)` | `triages`（现状 0 条，仍要落表） |

**并发语义的映射（端口 → SQL）**：

| 端口入口 | SQL 实现 | 冲突信号 |
|---------|---------|---------|
| `mutate(id, fn)` | `BEGIN; SELECT … WHERE id=$1 FOR UPDATE; UPDATE …; COMMIT` | 行锁等待，无冲突 |
| `mutateIf(id, expectedVersion, fn)` | `UPDATE requirements SET …, version=version+1 WHERE id=$1 AND version=$2` | 影响行数 0 → `REQBOARD_CONFLICT` |
| `head()` | `SELECT revision FROM ledger_meta WHERE id=1` | — |
| `appendComment` | 与 `UPDATE requirements SET comment_count=comment_count+1` 同事务 | 计数与日志同事务提交 ⇒ 不需要 I-2 的截断规则 |
| `sweep` | 单事务内批量 `SELECT … FOR UPDATE` + `UPDATE` | — |

`revision` 用 `UPDATE ledger_meta SET revision = revision + 1 WHERE id = 1 RETURNING revision`（单行更新天然串行化，行锁即全局序）。

**落地要求**：DB 适配器启用后 I-1/I-2 由数据库事务替代——文件版的"提交点 + 计数截断"是分片适配器的实现细节，不是端口契约。

## v9 → v10 迁移映射 serves: FR-8

| v9 单册位置 | v10 落点 | 备注 |
|------------|---------|------|
| `schemaVersion: 9` | `meta.json.schemaVersion = 10` + `migrations.push({from:9,to:10,at,by})` | 留痕必须写入（v9 曾因 load 丢 `migrations` 出过事故） |
| `revision` | `meta.json.revision` | 原值带过，不重置 |
| `requirements[].comments` | `comments.jsonl`（按原数组顺序赋 `seq`） | 取回顺序与现状逐条一致 |
| `requirements[].statusHistory` | `history.jsonl`（`kind:'status'`） | — |
| `requirements[].advance.history` | `history.jsonl`（`kind:'advance'`） | `advance` 其余字段留在 `record.json` |
| `requirements[].artifacts` | `artifacts.json` | — |
| `requirements[].plan` / `verification` / `archive` | 同名外置文件 | 不存在则**不建文件**（缺失 ≠ 空对象） |
| `requirements[].` 其余字段 | `record.json` | 字段名不变 |
| `status ∈ {archived, done}` 的条目 | `archive/<REQ>/…` | 现状 33 条 |
| `triages` | `meta.json` 内或独立 `triages.json` | 现状 0 条；**保留原样带过**，不因"空"而丢键 |

迁移**幂等**判据：`meta.json.schemaVersion === 10` ⇒ `--apply` 报 `already_v10` 且不重写任何文件。

## 校验与拒绝 serves: FR-2, FR-5

| 情形 | 结果 |
|------|------|
| 分片 JSON 解析失败 | 改名 `<file>.corrupt-<ts>` + 告警；该需求从索引剔除（**只有解析失败才隔离**，校验失败不隔离） |
| `record.json` 缺 `id` 或 `id` 与目录名不符 | 拒绝加载该分片（丢弃 + 告警），不影响其他需求（沿用现有"坏条目丢弃并告警"哲学） |
| `mutate` 目标不存在 | `REQBOARD_NOT_FOUND`（写不隐式建档） |
| `mutateIf` 版本不匹配 | `REQBOARD_CONFLICT`（带 `requirementId` 与 `currentVersion`） |
| 写冷侧需求 | `REQBOARD_COLD_IMMUTABLE` |
| `create` 已存在同 id | `REQBOARD_ALREADY_EXISTS`（不覆盖） |
