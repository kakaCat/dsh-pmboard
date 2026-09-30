# REQ-260930183951-eb6c 接口设计 · 验收单自证失败修复 serves: FR-1, FR-2, FR-3, FR-4

> 本文件锁定四处签名/契约。**不新增错误码、不新增端口、不改裁决 API。**
>
> **重建说明**：2026-09-30 19:39 被并发写入者删除，此处按原稿重建（落章记录仍在 ledger，路径不变）。

## I-1 验收单任务投影（新增单点） serves: FR-1

```ts
// src/application/internal/sheet-tasks.ts（新增文件）
import type { TaskRecord } from '../../shared/protocol.js'

/** buildSheet 的 tasks 入参形状（对齐 domain SheetTaskLike 的最小子集）。 */
export interface SheetTaskInput {
  id: string
  title: string
  acceptance: string
  /** FR-1：子卡归属必须透传。丢它 = domain 侧二次过滤作废（本需求立项的直接成因）。 */
  parentId?: string
}

/**
 * 队列任务 → 验收单任务投影。
 * - 顺序与输入一致（验收项顺序即人读顺序）；
 * - `status === 'canceled'` 剔除（既有语义）；
 * - `parentId` 为空串 / undefined → **不写该键**（顶层卡只有一种形态，避免 '' 与 undefined 两态）。
 */
export function toSheetTasks(tasks: readonly TaskRecord[]): SheetTaskInput[]
```

- **输入**：`TaskStore.listByRequirement(reqId)` 的返回值（`readonly TaskRecord[]`）。
- **输出**：`SheetTaskInput[]`，长度 ≤ 输入长度。
- **抛错**：无（纯映射，不做 I/O）。
- **消费点**：`SubmitVerification` 的 `buildSheet({ tasks: toSheetTasks(targetTasks), … })`——原内联 `filter(...).map(...)` 投影删除。

## I-2 验收锚点存在性探针（新增） serves: FR-2

```ts
// src/application/internal/content-gate-wiring.ts（与 orphan / e2e / consistency 探针同址）
/**
 * 验收锚点失效清单。
 * - 护栏：工作区**没有 `tests/` 目录**时整段跳过（同 e2e「读数未知不追加」口径，裸夹具工作区不制造噪声）；
 * - 提取：对每个非 canceled 任务的 acceptance，用既有 workspacePathCandidates 取路径候选，
 *   再按测试文件正则 /^tests\/[\w./@-]+\.(?:test|spec)\.(?:ts|tsx|js|mjs)$/ 过滤；
 * - 判定：docs.exists(path) === false → 产出 "<标题或 id> → <path>"；
 * - 返回：去重 + 字典序排序（稳定输出，便于断言与逐字节比对）；无失效 → []。
 */
export function collectMissingAnchors(docs: DocsReader, tasks: readonly TaskRecord[]): string[]
```

- **端口**：只用既有 `DocRepository.exists(relPath)`（同步），**不新增端口**。
- **抛错**：无；探针读不到工作区的情形由 `docs.exists` 返回 `false` 表达。
- **不做**：不扫 `design/test-cases.md`（那是孤儿用例探针的职责），不扫 evidence（evidence 存在性另有硬拦）。
- **消费点**：`SubmitVerification` 在 `mutate` **之前**算好（`mutate` 回调是同步的），非空才透传。

## I-3 buildSheet 输入扩展与编号契约 serves: FR-2, FR-3

```ts
// src/domain/workflow/AcceptanceSheetSpec.ts —— 签名增量，旧调用方零改动
export interface SheetBuildInput {
  // …既有字段（sheetHistoryLength / prevSheet / tasks / evidence / orphanTestFiles /
  //   unverifiableItems / e2eCoverage / consistencyGaps / traceabilityGaps / generatedAt / generatedBy）不变
  /** FR-2：锚点失效清单（"<卡> → <路径>"）。非空 → 追加一条不阻断的可见提示项。 */
  anchorGaps?: readonly string[]
}
```

**编号契约（FR-3，替换原 `taskCount + N` 预留位方案）**：

```
id = 'v' + version + '-' + n        n ∈ [1, items.length]，连续、无空洞
```

**项顺序（锁定，编号据此分配）**：

| 序号 | 类别 | 触发条件 | gapKind |
|---|---|---|---|
| 1..k | 任务项（顶层父卡） | 恒有 | — |
| k+1 | 需求级验收 | 恒有 | — |
| … | 孤儿用例 | `orphanTestFiles` 非空 | `orphan` |
| … | 验收项不可照着验 | `unverifiableItems` 非空 | — |
| … | E2E 覆盖 | `e2eCoverage !== undefined` | 缺口时 `e2e` |
| … | 三方一致性 | `consistencyGaps` 非空 | `consistency` |
| … | **锚点失效（新增）** | `anchorGaps` 非空 | `consistency`（复用，不新增枚举值） |
| … | FR 追溯断链 | `traceabilityGaps` 非空 | `traceability` |

**锚点项契约**：`source = { kind: 'requirement' }`、`status = 'pending'`、`evidence = [...input.evidence]`，criterion 模板：

```
验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——{list}。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。
```

其中 `{list}` = `anchorGaps.slice(0, 6).join('；')`（与既有多值项的截断口径一致）。

**返工续版（reworkOnly）**：沿用既有语义（只带上一版 `failed` + `pending` 项，已过项保留结论不重验），编号按同一规则连续重排。

## I-4 需求级项标题单点（新增） serves: FR-4

```ts
// src/domain/workflow/AcceptanceSheetSpec.ts
/**
 * 需求级来源的验收项显示标题（单点，三处调用方共用）。
 * 缺省 = 普通需求级项；系统项按 gapKind（必要时叠加 criterion 前缀）区分，避免表格里多行同名。
 */
export function requirementItemTitle(
  criterion: string,
  gapKind?: 'e2e' | 'orphan' | 'consistency' | 'traceability',
): string
```

| `gapKind` | criterion 附加判据 | 返回 |
|---|---|---|
| `undefined` | 不以 `验收项不可照着验` 开头 | `需求级验收` |
| `undefined` | 以 `验收项不可照着验` 开头 | `需求级验收 · 不可照着验` |
| `e2e` | — | `需求级验收 · E2E 覆盖` |
| `orphan` | — | `需求级验收 · 孤儿用例` |
| `traceability` | — | `需求级验收 · 追溯断链` |
| `consistency` | 以 `验收锚点失效` 开头 | `需求级验收 · 锚点失效` |
| `consistency` | 其它（三方一致性） | `需求级验收 · 三方一致性` |

**三处调用点（硬编码 `'需求级验收'` 全部删除）**：

| 调用点 | 现状 | 改后 |
|---|---|---|
| `SubmitVerification.ts`（生成 verification.md 的项投影） | `src.kind === 'task' ? 标题 : '需求级验收'` | 需求级分支 → `requirementItemTitle(it.criterion, it.gapKind)` |
| `application/internal/verification-doc-writer.ts`（裁决后回填） | 同上 | 同上（两处必须同源，否则提交时与回填后标题不一致） |
| `application/use-cases/AcceptSheet.ts`（弹框 header） | `source.kind === 'requirement' ? '需求级验收' : …` | 同上（弹框里也要能分辨是哪类缺口项） |

## I-5 不阻断语义与降级 serves: FR-1, FR-2, FR-3, FR-4

- **无新错误码**：`collectMissingAnchors` 不 reject、不抛业务错误；锚点失效只是**可见项**，与孤儿用例 / 追溯断链同构。
- **降级方向一律"不阻断主流程"**：探针拿到空清单 → 不追加项；`toSheetTasks` 对缺字段宽容（可选键）。
- **失败要响亮但不拦路**：失效锚点必须出现在验收面上（不允许静默），是否放行由人在验收单上裁决（通过须写处置说明，enforcement 由既有 `applyVerdicts` 承担）。
