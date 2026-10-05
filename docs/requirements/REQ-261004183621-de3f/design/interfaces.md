---
serves: FR-1, FR-2, FR-3, FR-4, FR-6
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [backend]
---

# 设计 · 接口与数据契约（REQ-261004183621-de3f 归档清单对账）

## 提交入参新增 `unlisted_ack` `serves: FR-2`

`reqboard_submit(kind=archive)` 新增**可选**入参：

```ts
unlisted_ack?: Array<{ path: string; reason: string }>
```

| 项 | 契约 |
|---|---|
| 语义 | 对「未列且未豁免」文件的**显式豁免声明**（不写进 `docs`，但要留下理由） |
| 覆盖要求 | 必须覆盖当次全部未列文件；缺一个 → 拒绝（错误信息列出缺的那些） |
| `path` | 工作区相对路径，必须**确实出现在未列集合里**；否则拒绝（防"声明了不存在的文件"） |
| `reason` | 非空（≤200 字符）；空串 → 拒绝 |
| 上限 | ≤200 条（超过 → 拒绝，提示改为收进 `docs`） |
| 缺省 | 不传 = 无豁免（未列非空即拒，见 FR-2） |

## 提交返回体三份清单 `serves: FR-1, FR-2`

```ts
{
  success: true
  requirement_id: string
  status: 'archived' | 'done'
  required_docs: string[]
  // ↓ 新增：对账三分类（计数与明细）
  reconcile: {
    gate: 'enforce' | 'warn'
    listed: string[]
    exempted: Array<{ path: string; rule: string }>
    unlisted: string[]
    acknowledged: Array<{ path: string; reason: string }>
  }
  // ↓ 兼容保留（语义不变；来源改为同一次对账结果）
  unlisted_files?: string[]
  warning?: string
  note: string
}
```

- **集合不变量**：`listed ∪ exempted.paths ∪ unlisted ∪ acknowledged.paths` = 目录内文件全集；四者两两不相交（`acknowledged ⊆ unlisted` 除外——见下）。
- `acknowledged` 是 `unlisted` 的子集口径修正：被声明豁免的文件同时出现在 `unlisted`（事实：它没进清单）与 `acknowledged`（处置：已声明理由）。**不变量按"事实"表述**，`acknowledged` 只作处置记录。

## 补录入口（工具 + 看板共用用例） `serves: FR-4`

```ts
// src/application/use-cases/AmendArchiveManifest.ts
export interface AmendArchiveManifestInput {
  requirementId?: string          // 缺省 = 本窗口最近更新的需求（与 submitArchive 同口径）
  docs: Array<{ kind: 'requirement' | 'plan' | 'verification' | 'retro' | 'notes'; path: string }>
  reason: string                  // 必填；进需求评论留痕
}
export interface AmendArchiveManifestResult {
  requirementId: string
  appended: string[]              // 本次真正追加的路径
  skipped: Array<{ path: string; reason: 'already-listed' }>
  status: 'archived' | 'done'
}
export async function amendArchiveManifest(deps: UseCaseDeps, input: AmendArchiveManifestInput, exec: unknown): Promise<AmendArchiveManifestResult>
```

| 项 | 契约 |
|---|---|
| 工具 | `reqboard_archive_amend`（入参 `requirement_id? / docs / reason`；出参同上结果对象） |
| 看板路由 | `POST /dashboard/api/reqboard/requirements/:id/archive-amend`（body `{ docs, reason, sessionId }`），**内部调同一用例** |
| 状态守卫 | 非 `archived` / legacy `done` → `REQBOARD_BAD_STATUS` |
| 归属守卫 | 需求不属于本窗口（工具路径）→ `REQBOARD_NOT_BOUND_TO_WINDOW` |
| 幂等 | 已列 path → 进 `skipped`，不写盘（判据：台账写入序号不变） |
| 只追加 | 不提供删除/修改入口（历史不可改写） |

## 错误码与文案 `serves: FR-2, FR-4`

| 场景 | 码 | 文案要点（响亮：给路径 + 给两种处置） |
|---|---|---|
| 未列未豁免且未声明 | `REQBOARD_UNLISTED_ACK_REQUIRED` | 列出未列文件（前 8 条 + 总数）；两种处置：① 收进 `docs`；② 传 `unlisted_ack` 带理由 |
| `unlisted_ack` 覆盖不全 | 同上 | 明确"缺处置的文件：…" |
| `unlisted_ack[].path` 不在未列集合 | `REQBOARD_INVALID_INPUT` | 指出该 path 既不在未列集合、也不在清单 |
| `unlisted_ack[].reason` 为空 | `REQBOARD_INVALID_INPUT` | "豁免必须写理由" |
| 补录时需求非归档态 | `REQBOARD_BAD_STATUS` | 指出当前状态与合法状态 |
| 补录条目 path 已存在 | 非错误 | 进 `skipped`（幂等），如实回报不假装新追加 |

## 配置 `archive.unlistedGate` `serves: FR-6`

```ts
archive?: { unlistedGate?: 'enforce' | 'warn' }   // 缺省 'enforce'
```

| 值 | 行为 |
|---|---|
| `'enforce'`（缺省） | 未列未豁免且未声明 → 拒绝提交（零台账改动） |
| `'warn'` | 不拒绝；照常写对账结果与留痕（= 旧语义 + 更多信息） |
| 非法值（如 `'block'`） | **装配期抛错**：`archive.unlistedGate 只能是 enforce / warn：实际 …` |
| 解析函数 | `archiveGateSetting(config)`（与 `knowledgeSettings` 同文件同风格） |

## 豁免常量接口 `serves: FR-3`

```ts
// src/domain/requirement/archive-exemptions.ts
export interface ArchiveExemptionRule {
  readonly id: string
  readonly match: { readonly glob?: string; readonly dir?: string }
  readonly reason: string
}
export const ARCHIVE_EXEMPTIONS: readonly ArchiveExemptionRule[]
/** 输入：相对需求目录的路径（如 'rtm-implementing/t-ab12.yml'）；输出命中的规则（未命中 → undefined）。 */
export function matchArchiveExemption(relPath: string): ArchiveExemptionRule | undefined
```

**匹配语义（单点，写清以防各写一套）**：

| `match` | 语义 | 例子 |
|---|---|---|
| `glob: 'rtm-*.yml'` | 只比**文件名**（末段）通配 | `rtm-design.yml` 命中；`rtm-implementing/t-x.yml` **不**命中本规则 |
| `dir: 'rtm-*'` | 路径**任一段**以 `rtm-` 开头 | `rtm-implementing/t-x.yml` 命中 |
| `glob: 'queue.json'` | 文件名精确 | `queue.json` 命中 |
| `dir: 'state'` | 任一段等于 `state` | `state/x.json` 命中 |

- 判定顺序：按 `ARCHIVE_EXEMPTIONS` 数组顺序，首个命中即返回（结果含 `rule.id`，进返回体与留痕）。
- **不豁免**（显式负例，进单测）：`tasks/t-1.md`、`evidence/gates.txt`、`design/architecture.md`、`tests/test-evidence.md`、`reviews/x.md`、`requirement.md`。
