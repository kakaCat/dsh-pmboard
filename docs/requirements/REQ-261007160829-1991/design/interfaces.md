---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 接口设计（REQ-261007160829-1991）

## 接口清单 `serves: FR-1, FR-2, FR-3, FR-4`

| 接口 id | 形态 | 职责 | serves |
|---|---|---|---|
| I-1 | 纯函数（域，新增） | `judgePassedVerdict` —— 一次「通过」裁决落到哪个状态、降级原因是什么 | FR-2 |
| I-2 | 纯函数（域，新增） | `isHumanAuthored` —— 该文本是不是人真的动手写的（与原文不同） | FR-3 |
| I-3 | 纯函数（域，既有） | `hasResultAnchor` —— 文本是否带可核验锚点（本需求**不改其词表**） | FR-1, FR-2 |
| I-4 | 域函数（既有，改行为） | `applyVerdicts` —— 逐项裁决；写降级原因；人工自填无锚点则拒绝 | FR-2, FR-3 |
| I-5 | 纯函数（域，既有，加桶） | `matchStructuredResults` —— 提交侧体检，新增 `unanchored` 桶 | FR-1 |
| I-6 | 用例函数（既有，加分支） | `bindStructuredResults` —— 把 `unanchored` 映射成拒绝码 | FR-1 |
| I-7 | 文案单点（新建模块） | `VerdictNotices` —— 形态提示常量 + 未复核回执文案（两条通道共用） | FR-2, FR-4 |
| I-8 | 工具回执（既有，改文案） | `reqboard_accept_sheet` 的 `note` 按真实原因分派 | FR-2 |
| I-9 | HTTP 回执（既有，改文案） | `POST /api/verdicts` 的 `note` 按真实原因分派 | FR-2 |
| I-10 | 错误码（新增两枚） | `REQBOARD_RESULT_UNANCHORED` / `REQBOARD_VERDICT_ANCHOR_MISSING` | FR-1, FR-3 |

## 新增/修改的内部接口 `serves: FR-1, FR-2, FR-3`

### I-1 judgePassedVerdict（新增，纯函数）`serves: FR-2`

```ts
export type UnverifiedReason = 'blank_pass' | 'anchor_missing'

/**
 * 一次「通过」裁决的落点判定。纯函数、零 IO、不写任何状态。
 * 输入与既有 applyVerdicts 的内联判定同参，输出把「状态 + 原因」一起给全。
 */
export function judgePassedVerdict(input: {
  item: Pick<SheetItemLike, 'result' | 'needsHuman' | 'gapKind' | 'criterion'>
  /** 裁决文本（人写的或从 item.result 取的），未给 = 无文本 */
  opinion?: string
}): { status: 'passed' | 'unverified'; reason?: UnverifiedReason }
```

- 返回 `{status:'passed'}`：文本带锚点，或该项是人工项（判据是事实形态，不走锚点判据）。
- 返回 `{status:'unverified', reason:'blank_pass'}`：无文本（`needsHuman` 为真，或该项无 `result`）。
- 返回 `{status:'unverified', reason:'anchor_missing'}`：文本非空、非人工项、非系统项、且 `hasResultAnchor` 为假。
- **错误语义**：不抛错（抛错属 I-4 的裁决入口）。

### I-2 isHumanAuthored（新增，纯函数）`serves: FR-3`

```ts
/** 文本非空且与该验项已有的 result 不同 = 人真的动手写了（与 isResultOverride 的「与原文不同」同口径）。 */
export function isHumanAuthored(item: Pick<SheetItemLike, 'result'>, opinion: string | undefined): boolean
```

### I-4 applyVerdicts（改行为）`serves: FR-2, FR-3`

签名**不变**（`requirement, tasks, version, verdicts, actor, at, idFactory, snapshot?`）。行为三处变化：

| 场景 | 今天 | 本需求之后 |
|---|---|---|
| `passed` + 文本带锚点 | `passed` | `passed`，`unverifiedReason` 缺席 |
| `passed` + 无文本 | `unverified`（无原因落账） | `unverified` + `unverifiedReason='blank_pass'` |
| `passed` + 文本非空、非人工项、无锚点、**非人工自填** | `unverified`（无原因落账） | `unverified` + `unverifiedReason='anchor_missing'` |
| `passed` + 文本非空、非人工项、无锚点、**人工自填** | `unverified`（静默） | **抛错** `REQBOARD_VERDICT_ANCHOR_MISSING`（当次提交不落库） |

- `status` 变为 `passed` / `failed` 时**清空** `unverifiedReason`（不残留）。
- `pending` / `not_verifiable` 不写该字段。
- **错误语义**：抛 `domainError(REQBOARD_VERDICT_ANCHOR_MISSING, …)`，文案点名 itemId 并给形态样例；调用方（弹框 / HTTP）`reject` 后台账零改动。

### I-5 matchStructuredResults（加桶）`serves: FR-1`

```ts
export interface ResultMatchReport {
  byKey: ReadonlyMap<string, SheetItemLike>
  keys: readonly string[]
  unmatched: readonly string[]
  duplicate: readonly string[]
  invalid: readonly string[]
  empty: readonly string[]
  conflict: readonly string[]
  /** 新增：命中了项、也有 result 文本，但文本没有可核验锚点（非人工项才判）。 */
  unanchored: readonly string[]
}
```

- 入桶条件（三者同时成立）：命中了可预见项 → `needsHuman !== true` → 该项不是系统项（`gapKind` 为空）→ 文本非空 → `!hasResultAnchor(文本)`。
- 元素文案：`<ref 标签>（结果没有可核验锚点：需要一条命令 + 读数 / 一个文件路径 / 一个明确计数）`。
- **不改既有桶的语义与判定顺序**（形状 → 冲突 → 重复 → 交代完整性 → 指不到项 → 漏项），`unanchored` 排在最末。

### I-6 bindStructuredResults（加分支）`serves: FR-1`

- 新增分支位置：**在 `missing`（漏项）之后**。
- 理由（取舍要写清）：`missing` 是「覆盖面没交齐」的结构问题，`unanchored` 是「交上来的质量不够」；两者互斥（漏项根本不在 `unanchored` 里），本仓既有口径是结构性优先，故先报结构。
- 拒绝码 `REQBOARD_RESULT_UNANCHORED`，回执四段式（what/why/how）与既有 `refuse` 同形，`how` 给可照抄样例 `npx vitest run tests/x.test.ts → 10 passed`。

### I-7 VerdictNotices（新建，文案单点）`serves: FR-2, FR-4`

```ts
// src/domain/workflow/VerdictNotices.ts
/** 弹框第 2 问题干与回执补法共用同一句形态要求——两处各写一份必然漂移。 */
export const ACCEPT_RESULT_FORM_HINT =
  '可核验形态：一条命令 + 读数 / 一个文件路径 / 一个明确计数（例：npx vitest run tests/x.test.ts → 10 passed）'

/** 未复核汇总（两条通道共用）：区分「没写」与「写了但不认」。 */
export function unverifiedSummaryOf(items: readonly {status: string; unverifiedReason?: UnverifiedReason}[]): string

/** 按真实原因给补法；无原因（老数据）时用中性措辞。 */
export function unverifiedAdviceOf(reason?: UnverifiedReason): string
```

- `unverifiedSummaryOf` 输出形状：`1 项未复核（无锚点 1、未写结果 0）`；无未复核项时返回空串。
- `unverifiedAdviceOf('anchor_missing')` → `给结果补一个可核验锚点（命令 + 读数 / 路径 / 明确计数）后重交`。
- `unverifiedAdviceOf('blank_pass')` → `补上实际结果后重交`。
- **实现在 domain**（纯字符串逻辑、无 IO），弹框与 HTTP 都调它。

## HTTP API 变更 `serves: FR-2, FR-3`

### POST /api/verdicts `serves: FR-2, FR-3`

- 请求体**不变**：`{id, version, verdicts:[{itemId,status,opinion?,changeReason?}]}`。
- 响应：`note` 由 `unverifiedSummaryOf` + `unverifiedAdviceOf` 拼出（今天是一句写死的「未复核 N 项」）。
- 新增一种**拒绝**：人工自填文本无锚点 → HTTP 400，错误码 `REQBOARD_VERDICT_ANCHOR_MISSING`，台账零改动。看板客户端对 reject 既有 `window.alert` 展示路径，故本轮**不需要**改前端即可让人看到原因。

## 错误码 `serves: FR-1, FR-3`

| 错误码 | 触发 | 台账影响 |
|---|---|---|
| `REQBOARD_RESULT_UNANCHORED` | 提交 `kind=verification` 时某普通项 result 无锚点 | 零改动（验收单不生成 / 不更新） |
| `REQBOARD_VERDICT_ANCHOR_MISSING` | 裁决时人自填的文本无锚点 | 零改动（当次裁决不落库） |

两枚码都进既有的错误码注册处与 `interfaces.md` 的表（本仓「错误码是工具面语义、口径单点在 domain」的既有分工）。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4`

- **为什么拒绝而不是继续降级（D-3 范围 ①+②）**：静默降级是本需求的病根；对**人刚刚写下的**文本，拒绝能让他当场改，且看板既有 reject 展示路径让它「响亮」而**不必改前端**。
- **为什么只在「人工自填」时拒绝**：零输入通过（文本取自 `item.result`）时拒绝会把 agent 的历史欠账转嫁给人；那条路由 FR-1 在源头治理 + FR-2 留原因。
- **为什么不加线上字段区分人工自填**：`opinion !== item.result` 已能就地判定（与 `isResultOverride` 同源），加字段等于让客户端多一份真相。
- **为什么 `unanchored` 排在 `missing` 之后**：与既有「结构性优先」的报错顺序一致，避免同一批错误来回两次往返。
