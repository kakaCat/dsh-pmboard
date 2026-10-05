---
serves: FR-1, FR-2, FR-5, FR-6, FR-7, FR-8
---

# 接口契约（端口签名 · 错误码 · 端点 · 脚本 CLI） serves: FR-1, FR-2, FR-5, FR-6, FR-7, FR-8

> 签名与字段在这里**定死**，拆分阶段不得再改。错误码一律 `Object.assign(new Error(msg), { code })`（本仓既有约定）。

## 端口：`RequirementStore` serves: FR-1, FR-5

定义在 `src/application/ports.ts`。**全部方法返回 `Promise`**（现状 `snapshot()` 是同步整册返回，远端库无法实现它）。签名里不出现文件名、JSON、SQL、路径。

```ts
interface RequirementStore {
  // ── 读 ───────────────────────────────────────────────────────────
  /** 单条需求（含大字段装配）；热侧未命中回落冷侧；都不存在 → undefined。 */
  get(id: string): Promise<RequirementRecord | undefined>
  /** 摘要投影（零文件读，走内存索引）。 */
  getSummary(id: string): Promise<RequirementSummary | undefined>
  /** 按条件列出摘要；缺省 scope='active'（不含归档）。 */
  listSummaries(filter?: RequirementFilter): Promise<readonly RequirementSummary[]>
  /** 评论（按 seq 升序）；since 含起点，limit 缺省 200。 */
  listComments(id: string, opts?: { since?: number; limit?: number }): Promise<readonly CommentRecord[]>
  /** 状态流转 + 推进事件历史（按 seq 升序）。 */
  listHistory(id: string, opts?: { limit?: number }): Promise<readonly RequirementHistoryEntry[]>
  /** 全局版本（SSE 帧与"已落盘"指针用）。 */
  head(): Promise<LedgerHead>

  // ── 写 ───────────────────────────────────────────────────────────
  /** 新建（id 已存在 → REQBOARD_ALREADY_EXISTS，不覆盖）。 */
  create(input: NewRequirement, actor: ActorRef): Promise<RequirementRecord>
  /** 临界区内读-改-写；fn 返回 undefined = 无变更（不写盘、不 bump）。 */
  mutate(id: string, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult>
  /** CAS 变体：draft.version !== expectedVersion → REQBOARD_CONFLICT。 */
  mutateIf(id: string, expectedVersion: number, fn: (draft: RequirementDraft) => MutationOutcome | undefined): Promise<MutateResult>
  /** 追加评论（与 record.commentCount 同一次提交）。 */
  appendComment(id: string, comment: NewComment): Promise<{ version: number; commentCount: number }>
  /** **仅启动对账可用**（交互路径禁止调用）：一次覆盖多条需求的批量变更。 */
  sweep(reason: string, fn: (drafts: readonly RequirementDraft[]) => readonly string[]): Promise<SweepResult>
  /** **仅迁移脚本可用**：以导入结构整体重建（备份 + 原子替换由实现负责）。 */
  replaceAll(reason: string, next: ImportedLedger): Promise<void>

  // ── 订阅 ─────────────────────────────────────────────────────────
  subscribe(fn: (change: RequirementChange) => void): () => void
}
```

支撑类型（同名即契约，不得就地重定义）：

```ts
interface RequirementFilter {
  scope?: 'active' | 'archived' | 'all'   // 缺省 'active'
  ids?: readonly string[]
  status?: readonly RequirementStatus[]
  workspaceRoot?: string
  sourceSessionId?: string
  limit?: number          // 缺省 200，上限 1000
  cursor?: string         // 不透明游标（见 frontend.md §分页）
}
interface LedgerHead { revision: number; schemaVersion: number }
interface MutateResult {
  requirement: RequirementRecord   // 提交后的装配结果
  version: number
  revision: number
  changed: boolean
}
interface SweepResult { touched: readonly string[]; revision: number }
interface RequirementChange {
  kind: 'requirement-created' | 'requirement-updated' | 'requirement-moved' | 'comment-added' | 'ledger-replaced'
  requirementId: string
  revision: number
  summary: RequirementSummary
}
interface MutationOutcome { /** 显式声明"这次改了什么"（落盘分派用）；true=有变更 */ changed: boolean }
```

## `RequirementDraft` 与落盘分派 serves: FR-2, FR-3

**关键决策**：变更器拿到的 draft 是**装配后的完整需求**（字段与 `RequirementRecord` 同形，含 `comments` / `artifacts` / `verification` 等），变更器照旧就地改（`draft.comments.push(...)`）。

理由：现状 90 处 `mutate` 回调就是在改 `req.comments.push(...)` / `req.artifacts.push(...)`。若把 draft 收窄成"只有标量字段 + 一组窄方法"，这 90 处全部要重写——接口稳定性比"少装配几个字段"值钱得多。

提交时由适配器**按字段差异分派**（dirty-field dispatch），只写变化的文件：

| draft 中变化的字段 | 落盘动作 | 代价 |
|-------------------|---------|------|
| 标量 / `dive` / `advance`（锁与告警字段）/ `tokenUsage` / `interruption` / `docSyncPending` | 原子写 `record.json`（`version` +1） | ~5KB |
| `comments` 变长且原前缀未改 | 追加 `comments.jsonl` 尾部新增行 + `commentCount` | 1 行 |
| `comments` 前缀被改写（不允许，见下） | 整份重写 `comments.jsonl` + 告警 | 降级路径 |
| `statusHistory` / `advance.history` 变长且原前缀未改 | 追加 `history.jsonl` + `historyCount` | 1 行 |
| `artifacts` / `plan` / `verification` / `archive` 内容变化 | 整份原子写对应外置文件 | 单需求有界 |
| 什么都没变（`MutationOutcome.changed === false` 或深度比较相等） | **不写盘**（mtime 不变，A7 幂等判据） | 0 |

**变更器纪律（写进端口注释，代码级可查）**：`comments` / `statusHistory` / `advance.history` 三个数组**只允许追加**，不得删改已有元素；违反时适配器走整份重写降级路径并告警（不静默）。

**写路径的读代价（必须知道）**：装配 draft 要读该需求的 `record.json` + 两个日志 + 四个外置文件，最坏约 190KB（当前实测峰值：comments 65KB + verification 71KB + artifacts 51KB）。这是 O(单需求)，与库容无关；换来的是 90 处变更器不需要改。

## 错误码 serves: FR-5, FR-8

| 错误码 | 触发 | 附带字段 | 处置 |
|--------|------|---------|------|
| `REQBOARD_CONFLICT` | `mutateIf` 版本不匹配 | `requirementId` `currentVersion` | 重新 `getSummary` 取版本后重试（A6） |
| `REQBOARD_NOT_FOUND` | 目标需求不存在（写不隐式建档） | `requirementId` | 先 `create` |
| `REQBOARD_ALREADY_EXISTS` | `create` 撞 id | `requirementId` | 改用 `mutate` |
| `REQBOARD_COLD_IMMUTABLE` | 写冷侧（归档）需求 | `requirementId` | 归档需求不可写 |
| `REQBOARD_VALIDATION_FAILED` | 结构校验不通过（**不落盘、不隔离**） | `detail` | 按 detail 修数据 |
| `REQBOARD_CORRUPT_SHARD` | 分片 JSON 解析失败（已改名隔离） | `path` | 人工介入（其余需求不受影响） |
| `REQBOARD_REQUIRES_MIGRATION` | 数据根仍是 v9 单册（**沿用既有码**） | `file` | 跑 `migrate-ledger-v10 --apply` |
| `REQBOARD_IO_FAILED` | 读写失败（权限/磁盘） | `path` `cause` | 不降级、不静默 |

`REQBOARD_REQUIRES_MIGRATION` 的口径与现状**完全一致**（现状见 `JsonLedgerRepository.load` 的迁移门）：单册在场而无 v10 目录时**拒绝启动**，绝不静默起一个空台账——那是"600 条任务消失"那类事故的成因。

## HTTP 端点 serves: FR-7

前缀不变：`/dashboard/api/reqboard`。信封不变：`200 {success:true,data}` / `4xx|500 {success:false,error,code?}`。

| 端点 | 状态 | 契约 |
|------|------|------|
| `GET /`（`/state`） | **改** | 入参 `scope`（缺省 `active`）`limit`（缺省 200）`cursor`；返回 `{revision, requirements: RequirementSummary[], tasks[], ready, tokenTotals, nextCursor?, workspaceRoot, homeDir}`。**不再返回归档需求全文，不再触发产物扫描** |
| `GET /requirements/:id` | **新增** | 返回 `RequirementRecord`（热侧未命中回落冷侧；不存在 → 404 + `REQBOARD_NOT_FOUND`） |
| `POST /artifacts/scan` | **新增** | 显式触发产物自动发现扫描；返回扫描计数。从 `/state` 摘除（A10） |
| `GET /events`（SSE） | **不变** | `{revision, kind}` 命名帧 + 无名帧（双通道照旧） |
| 既有写端点（`POST /req/autorun`、`/verdicts`、`/requirements/...`） | **改内部** | 路径与响应形状不变；**接受可选 `expectedVersion`**：带了走 `mutateIf`（看板持有摘要里的 `version`），不带走 `mutate`（旧客户端兼容） |

**为什么写端点要支持 `expectedVersion`**：`version` 现在会随摘要下发到客户端，看板两个标签页同改一条需求是真实场景——带版本提交把"静默覆盖"变成"明确冲突"，这正是 FR-5 的意图落点。

## 95 处 `snapshot()` 读点的改造分类 serves: FR-1

实测分类（`grep -rn "snapshot()" src`，95 处）：

| 现状形态 | 处数 | 改成 |
|---------|------|------|
| `const snap = …snapshot()` 取整册后按 id 找一条 | ~26 | `await store.getSummary(id)`（只要状态）/ `get(id)`（要详情） |
| `…snapshot().requirements.find(...)` 一行式 | 27 | 同上 |
| `snapshot()` 整册作为实参传给纯函数（如 `openRequirementsFor`） | 16 | 纯函数改收 `readonly RequirementSummary[]`，调用方 `await listSummaries(filter)` |
| `…snapshot().revision` | 3 | `(await store.head()).revision` |
| `…snapshot().requirements.filter/some` | 3 | `listSummaries(filter)` / `getSummary(id) !== undefined` |
| 结构化端口类型声明 `{ snapshot(): LedgerView }`（`window.ts` / `rtm-yaml.ts` / `boundary-guard.ts` / `verification-doc-writer.ts`） | 4 | 换成窄接口 `RequirementReader`（只含它们真正用到的方法） |
| 定义处（`ports.ts` / `JsonLedgerRepository.ts`） | 2 | 端口重写 / 实现删除 |
| `src/client/panel-refresh.ts` 的本地 `snapshot()` | 3 | **同名不同物**（本地函数），不在改造范围 |

三处**同步上下文**的硬骨头与处置（`h2-compact.ts:61` 的 `persistArtifacts ?? (() => deps.repo.snapshot().revision)`、`gate-wiring.ts:172` 的提示词段组装、`pm-capture-root.ts:151` 的窗口活动回调）见 `backend.md` §同步口的处置。

## 迁移与回滚脚本 CLI serves: FR-8

沿用既有 `scripts/migrate-ledger.ts` 的四模式与安全约定（写前备份、`state/server.pid` 存活时拒绝 `--apply`、`--force` 跳过探测、`--json` 机器可读报告）。**不改既有 v9 脚本**。

```
# 迁移：v9 单册 → v10 分片
node --import tsx/esm scripts/migrate-ledger-v10.ts \
  --file ~/.dsh/dsh-reqboard.json [--out ~/.dsh/reqboard] \
  [--dry-run | --apply | --verify | --rollback] [--json] [--force]

# 回滚：v10 分片 → legacy v9 单册（导出格式，可被旧版读路径装载）
node --import tsx/esm scripts/rollback-ledger-v10.ts \
  --root ~/.dsh/reqboard --out ~/.dsh/dsh-reqboard.json [--dry-run | --apply] [--json] [--force]
```

| 模式 | 行为 | 幂等判据 |
|------|------|---------|
| `--dry-run`（缺省） | 只报将发生的变更（逐需求、逐文件计数），不写任何文件 | — |
| `--apply` | 备份单册 → 建目录 → 逐需求落分片 → 写 `meta.json`（最后写，作为提交点） | 已是 v10 → 报 `already_v10`，**不重写任何文件** |
| `--verify` | 比对单册与分片：需求条数、id 集合、逐需求去重后内容等价 | — |
| `--rollback` | 把分片导回单册（等价于 `rollback-ledger-v10`） | — |

**提交点顺序**：`meta.json` **最后写**。崩在中途 → `meta.json` 仍是 v9（或不存在）⇒ 再次 `--apply` 从头重放，不产生半迁移态。

## 兼容与弃用 serves: FR-1, FR-8

| 项 | 处置 |
|----|------|
| `ReqboardRepository`（`read` / `snapshot` / `mutate(reason, fn)` / `replaceAll`） | **删除**：`snapshot()` 无异步等价物；整册 `mutate` 与"聚合根=需求"冲突。不做兼容壳（兼容壳会让 95 个读点永远改不完） |
| `LedgerView` / `MutableLedger` / `MutateResult`（旧形） | 删除或改名，避免与新 `MutateResult` 混淆 |
| `JsonLedgerRepository` | 删除（`persistAtomic` 迁至 `src/repositories/atomicWrite.ts`） |
| `LEDGER_FILE = 'dsh-reqboard.json'`（`src/index.ts`） | **保留常量**，语义降级为"legacy 导出文件名"，仅脚本与迁移门使用 |
| `tests/application/harness.ts` 的 `InMemoryRepo implements ReqboardRepository` | 改为 `implements RequirementStore`（**唯一**测试替身，改一处继续可用） |
| `queue.json` / `QueueTaskStore` / `TaskStore` | **不动**（另一次改造的成果，本次只对齐风格） |

## 调用纪律 serves: FR-1, FR-5

1. **禁止**在用例里 `await store.listSummaries()` 再从中"找一条"——那是把整册读法换个名字。按 id 就用 `getSummary(id)`。
2. **禁止**交互路径调用 `sweep`；它的白名单只有 `src/index.ts` 的启动对账与 `migrate-dive-state.ts`。
3. **禁止**在变更器里删改日志类数组的已有元素（只追加）。
4. 写路径一律经端口；**不允许**绕过端口直接读分片文件（现状"任务不得绕过 `TaskStore`"同款纪律）。
