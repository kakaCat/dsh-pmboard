# 接口与错误语义 · REQ-261006092213-4f5b <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-6, FR-7 -->

> 契约先定死：签名、字段、错误码。契约定不死不许进拆分。

## 工具参数：`reqboard_submit(kind=verification)` 新增 `results` <!-- serves: FR-1 -->

落点：`src/tools/SubmitTool/SubmitTool.ts` 顶层 `properties`（该 schema 是
`additionalProperties:false`，未声明的键会被绑定层直接拒收——必须显式声明，
`footprint` / `prototypeRefs` 都栽过同一形态）。

```
results?: Array<{
  ref:        { kind: 'task', taskId: string }
            | { kind: 'requirement' }
            | { kind: 'prototype-compare', prototypePath: string }
            | { kind: 'decision-compare', decisionIds: string[] }
  result?:      string   // 命令 + 输出摘要，≤500 字符（超长截断）
  needsHuman?:  boolean  // true = 该项只能人看
  humanReason?: string   // needsHuman=true 时必填，非空
}>
```

约束（由 `matchStructuredResults` 单点判定，用例层不得重写）：

| 约束 | 违反时 |
|---|---|
| `results` 必须是数组，元素是对象 | `REQBOARD_INVALID_INPUT` |
| 每个 `ref` 必须指到一个**可预见项**（活卡顶层父卡 / 需求级 / 对照项） | `REQBOARD_RESULT_REF_INVALID` |
| 同一 `ref` 不得出现两次 | `REQBOARD_RESULT_REF_DUPLICATE` |
| 每项二选一：`result` 非空，或 `needsHuman:true` + `humanReason` 非空 | `REQBOARD_RESULT_EMPTY` |
| 全部可预见项都必须被交代 | `REQBOARD_RESULT_COVERAGE_MISSING` |

系统项（孤儿用例 / E2E 缺口 / 三方一致性 / 锚点失效 / 追溯断链）**不在可预见集合内**，
不参与逐项交代（提交时才由代码算出，agent 无从预见）。

另有两行**不是系统项、但同样不可预见**，也豁免（复核 R1/R2 点名补入）：`E2E 覆盖：**有**`
那一行（只在缺口时才带 `gapKind`）与**原型豁免说明行**（`prototype_exempt` 生效时的说明行，非对照项）。
它们与「需求级项」共用 `source.kind === 'requirement'`——豁免只能**按项**判，不能按 source 判。

## 返回体新增键 <!-- serves: FR-2 -->

`reqboard_submit(kind=verification)` 成功时新增：

| 键 | 含义 |
|---|---|
| `results_bound` | **真正改动了台账字段的项数**（= `applyStructuredResults` 的 `changed`；人填过的 `result` 受保护 → 命中但不计） |
| `results_matched` | 命中可预见项的条数（= `matched`；用于诊断「命中但没改动」） |
| `results_unmatched` | 无法归属的键：`unknown`（指不到任何东西）与兼容文本键（`evidence` 里 `id :: 结果`），**不再静默** |
| `results_out_of_scope` | **本版不含但确实存在**的键（返工续版的正常情形，见下），如实报告、**不拒** |
| `results_coverage` | `'complete'` \| `'legacy'`（未传 `results` 的老调用方） |

> 口径更正（复核 F4）：`bound`/`written` 曾是两个不同口径的计数，容易被取错。现定死
> **`results_bound` 取 `changed`**，另给 `results_matched` 作诊断，两个数都在返回体里，不靠猜。
>
> **返工续版口径（复核 R2）**：续版（`reworkOnly`）只带上一版的**未过项 + 未裁决项**，已通过的需求级项
> **不在本版里**；而 agent 是在**出单之前**提交材料的，无从知道本轮会出续版，只能按全量交代。
> 故 `unmatched` 必须再分类：调用方组装 `knownKeys` 后调 `splitUnmatched` —— `unknown` 才拒
> （`REQBOARD_RESULT_REF_INVALID`），`outOfScope` 进 `results_out_of_scope` 放行。
> **`knownKeys` 配方（四类，后两类按本轮实际产出条件化）**：
> ① 各**顶层父卡**键 `task:<id>`（始终）；② `requirement`（始终）；
> ③ 本轮产出的原型对照键 `prototype:<compare.path>`（仅原型路径存在时）；
> ④ 本轮产出的裁定对照键 `decision:<ids>`（仅 `decisionIds` 非空时）。
> ⚠️ **不要把 `knownKeys` 放宽成「全部活卡」**：子卡的父卡若不是活卡，放行该子卡 ref 后既没有父卡项
> `missing` 兜底、也没有别的门——那正是「子卡冒充父卡」的掩盖路径。对照项键同样不能无条件加入。
> **安全性**：漏交代仍被 `missing` 抓住（越界放行不让任何项免于交代）；把子卡结果当父卡交这类错误，
> 也会因父卡项 `missing` 被拒。
> **`applyStructuredResults` 的前置条件**：`conflict` 为空（它自己也守：非空则一个字段都不写）。

`reqboard_accept_sheet` 返回体新增 `unverified`（未复核项数），其余键不变。

## 纯函数接口（domain，单点） <!-- serves: FR-1, FR-2 -->

新文件 `src/domain/workflow/ResultBinding.ts`：

```ts
/**
 * 硬门范围：该**项**是否属于「必须逐项交代」的可预见项。
 *
 * 入参是**项**而不是 `source`（复核 F9 更正，原文档写错）：系统项、`E2E 覆盖：有` 那一行、
 * 原型豁免说明行与「需求级项」共用 `source.kind === 'requirement'`，只看 source 无法区分，
 * 会让它们共用一个引用键、把结果写到错误的行上。识别口径逐字为：
 *   · 任务项 / 原型对照项 / 裁定对照项 → 可预见；
 *   · `requirement` 来源 → **仅当判据文本 === REQUIREMENT_LEVEL_CRITERION**（固定那一条）。
 */
export function isForeseeableItem(item: Pick<SheetItemLike, 'source' | 'gapKind' | 'criterion'>): boolean

/**
 * 匹配 + 体检。**全函数**：`results` 是原始工具参数，可能不是数组、元素可能是原始值，
 * 一律不抛异常、如实记进 `invalid`（复核 F2：数组形状判定归本函数单点；用例层可预检
 * 「未传 results」以走 legacy 分支，但不得复制逐项判定）。
 */
export function matchStructuredResults(
  items: readonly SheetItemLike[],
  results: unknown,
): {
  matched: number                 // 命中可预见项的条数
  unmatched: readonly string[]    // ref 指不到任何可预见项
  missing: readonly string[]      // 可预见项未被交代（**已去重**，元素 = 稳定描述文本）
  duplicate: readonly string[]    // 同一 ref 出现多次
  invalid: readonly string[]      // 形状非法（results 非数组 / ref 结构坏 / 元素是原始值）
  empty: readonly string[]        // 交代不完整（无 result 且无 needsHuman；needsHuman 缺理由）
  conflict: readonly string[]     // 验收单自身异常：两个可预见项共用同一引用键
}

/** 就地写入；返回 `matched`（命中条数）与 `changed`（真正改动字段的项数）。 */
export function applyStructuredResults(items: SheetItemLike[], results: unknown): { matched: number; changed: number }
```

**体检字段 → 错误码（逐条对应，A6 要求分别返回，不许靠字符串匹配文案）**：

| 体检字段 | 错误码 | 谁的问题 |
|---|---|---|
| `missing` | `REQBOARD_RESULT_COVERAGE_MISSING` | 调用方漏交代 |
| `unmatched` | `REQBOARD_RESULT_REF_INVALID`（**仅 `unknown` 部分**；`outOfScope` 放行） | 调用方 ref 写错 |
| `duplicate` | `REQBOARD_RESULT_REF_DUPLICATE` | 调用方重复交 |
| `invalid` | `REQBOARD_INVALID_INPUT` | 调用方形状非法 |
| `empty` | `REQBOARD_RESULT_EMPTY` | 调用方交代不完整 |
| `conflict` | `REQBOARD_STORE_INCONSISTENT` | **验收单自身**异常（非调用方之过） |

**判定顺序**（刻意的）：形状 → 命中 → 重复 → 交代完整性。先判「指不到项」再判「没给结果」——
否则「ref 写错又忘填结果」会被报成「没给 result」，把 agent 引向错误的修法。


`ref` 的稳定描述文本（用于点名）：`task:t-xxxx` / `requirement` /
`prototype:<path>` / `decision:<id,id>`——点名字符串与 `itemSourceTitle` 同源风格，
但**不依赖项 id**（项 id 此时还不存在）。

## 裁决口径：会话弹框 <!-- serves: FR-3, FR-6 -->

| 项的状态 | 弹框问几问 | 说明 |
|---|---|---|
| 有 `result` 且 `needsHuman !== true` | **1 问**（通过 / 改进 / 其他） | 人零输入 |
| `needsHuman === true` | 2 问（第 2 问题干含 `humanReason`） | 唯一要人填的分支 |
| 无 `result`（系统项、老写法项） | 2 问 | 人填或留空记 `unverified` |

`resultOf` 取值顺序（唯一实现，在 `AcceptSheet.ts`）：
**第 2 问自填 → 第 1 问自填 → `item.result`**；三者皆空 ⇒ `unverified`。
**去掉** `it.evidence[0]` 兜底（回滚开关开启时才恢复）。

## 看板 HTTP：逐项裁决 <!-- serves: FR-4, FR-6 -->

`POST /dashboard/api/reqboard/req/verdicts`（`src/http/routers/verdicts.ts`）：

| 现状 | 改成 |
|---|---|
| 第 199 行硬拦：`passed` 且 `opinion` 为空 → 400 `通过的验收项必须填写实际结果` | `passed` 且 `opinion` 为空 → **允许**，服务端用 `item.result` 兜底；两者皆空才记 `unverified` |
| `failed` / `not_verifiable` 必须写意见 | 不变 |
| 人的意见只写 `opinion` | 若 `opinion` ≠ `item.result` ⇒ 同时写 `result = opinion`、`resultSource='human'` |

前端同口径：`client/board-mount.ts` 的 `missingOpinion` 拦截**删除**（不再把必填推给人），
输入框预填 `item.result`。

## 应用层变更点 <!-- serves: FR-6, FR-7 -->

| 文件 | 改动 |
|---|---|
| `application/use-cases/SubmitVerification.ts` | 读 `results`；算可预见集合；跑硬门；组装后调 `applyStructuredResults`（替换现在的 `bindItemResults` 主路径） |
| `application/use-cases/AcceptSheet.ts` | `resultOf` 去兜底；`finalizeIfAllPassed` 放行判据加 `unverified`；返回体加 `unverified` |
| `application/internal/verdicts.ts` | 裁决写入 `result` / `resultSource`（人改结果路径） |
| `domain/workflow/AcceptanceSheetSpec.ts` | `applyVerdicts` 的 `passed` 校验放宽为「opinion 或 result 非空」 |
| `domain/workflow/VerificationDoc.ts` | 「实际结果」列改用 `result`（无则回落到 `opinion`），并标来源 |
| `http/routers/verdicts.ts` | 路由层预校验放宽（见上表） |

## 错误码约定 <!-- serves: FR-2 -->

- 新增 4 个：`REQBOARD_RESULT_COVERAGE_MISSING` / `REQBOARD_RESULT_REF_INVALID` /
  `REQBOARD_RESULT_EMPTY` / `REQBOARD_RESULT_REF_DUPLICATE`。
- **不删除**既有码：`REQBOARD_INVALID_INPUT` / `REQBOARD_EVIDENCE_MISSING` /
  `verification_prototype_compare_missing` 等行为不变。
- 每个拒绝消息必须含①缺什么②缺哪些（点名到 ref）③怎么补——三段式（与
  `envelope()` 既有口径一致）。

## 与既有接口的兼容 <!-- serves: FR-6, FR-7 -->

- `reqboard_submit(kind=verification)` 旧参数（`summary` / `evidence`）语义不变，仍必填。
- `reqboard_accept_sheet` 的参数（`batch_size` / `version`）与分批语义不变。
- 台账结构不变（见 data-model.md），故 `reqboard_status` / 看板投影无需改形状。
