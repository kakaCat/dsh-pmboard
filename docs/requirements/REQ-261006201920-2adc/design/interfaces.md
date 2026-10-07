---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 接口与契约（REQ-261006201920-2adc）

> 本文档面向：开发、测试、验收。签名为**定死值**——拆分阶段按此写卡，不得在实施期自行改形。

## 域层新增签名 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```ts
// ── src/domain/task/Acceptability.ts（FR-1）───────────────────────────────
/** 命令的操作数仍是未替换占位符。命中即拒。 */
export const PLACEHOLDER_OPERAND: RegExp

/** 现有签名不变；新增一条分支：空话 → 占位符 → 无锚点。 */
export function checkAcceptance(key: string, acceptance: string): AcceptanceVerdict

// ── src/domain/task/SubtaskTemplate.ts（FR-1）─────────────────────────────
/** 声明式闭集：STAGE_ACCEPTANCE 里允许出现的全部尖括号 token。 */
export const ACCEPTANCE_PLACEHOLDERS: readonly string[]

/** 词表外的尖括号 token（非空 = 模板坏了，调用方据此响亮失败）。 */
export function unknownPlaceholders(text: string): string[]

export interface AcceptanceFillContext {
  requirementId: string
  taskId: string
  /** 父卡验收标准原文（测试文件/脚本名从这里提取）。 */
  parentAcceptance: string
}

/** 纯函数：把模板里的全部声明式 token 换成具体值；返回文本里不得再有尖括号 token（内部自检）。 */
export function fillStageAcceptance(template: string, ctx: AcceptanceFillContext): string

// ── src/domain/workflow/AcceptanceSheetSpec.ts（FR-3 / FR-4）──────────────
/** 裁决结果的**可复核锚点**词表（命令 / 路径 / 明确计数 / 证据介质）。 */
export const RESULT_ANCHOR: RegExp
/** 「只能人看」项的**事实形态**词表（现象词 / 截图 / 证据路径）。 */
export const HUMAN_FACT: RegExp
/** 系统缺口项的处置模板（已处置 / 确认无需 两义）。 */
export const DISPOSITION_TEMPLATE: RegExp

export interface SheetVerdictInput {
  itemId: string
  status: 'passed' | 'failed' | 'not_verifiable' | 'unverified'
  opinion?: string
  /** 仅当该次裁决构成「覆盖 agent 实测结果」时被读取（FR-3）。 */
  changeReason?: string
}

export interface SheetItemLike {
  // …既有字段逐一不变…
  /** 被人的覆盖取代的 agent 原文（FR-3）。 */
  resultSuperseded?: string
  /** 人覆盖 agent 实测结果的理由（FR-3）。 */
  resultChangeReason?: string
}

export interface ReworkTaskSpec {
  // …既有字段逐一不变…
  requirementRefs?: string[]
  prototypeRefs?: string[]
  decisionRefs?: string[]
  footprint?: CardFootprint
  acceptanceSource?: 'criterion' | 'origin' | 'synthesized'
}

/** 语义不变（入参/返回不变），但内部保证：返回规格的标准已过两道判据。 */
export function reworkSpecFor(item: SheetItemLike, sheet: SheetLike, tasks: readonly ReworkSourceTaskLike[]): ReworkTaskSpec

/** 语义收紧：未写处置 **或** 处置未命中模板的系统项都算「缺处置」。 */
export function dispositionMissingItems(sheet: SheetLike): string[]

/** 语义收紧：存在未处置的系统项 → false（不放行归档）。 */
export function isFullyDecided(sheet: SheetLike): boolean
```

## 应用层新增签名 <!-- serves: FR-2, FR-3 -->

```ts
// ── src/application/internal/verdicts.ts ─────────────────────────────────
export interface VerdictInput {
  itemId: string
  status: 'passed' | 'failed' | 'unverified'
  opinion?: string
  changeReason?: string
}

/** 新增错误码（VerdictError.code）：'result_change_reason_required'。 */
export function applyVerdicts(
  record: RequirementRecord,
  tasks: readonly TaskRecord[],
  version: number,
  verdicts: readonly VerdictInput[],
  actor: ActorRef,
  nowTs: number,
  commentId: () => string,
  snap?: TokenSnapshot,
): ApplyVerdictsResult

// ── src/application/internal/lazy-expand.ts ──────────────────────────────
// 对外签名全部不变（expandSubtasks / regenerateChain / resolveSubtaskStages / chainDiagnosis）；
// 变化只在 makeChild 内部：落库前回填 + 残留断言。
```

## 传输层契约（HTTP） <!-- serves: FR-3 -->

`POST /req/verdicts`

```jsonc
{
  "id": "REQ-261006201920-2adc",
  "version": 2,
  "verdicts": [
    {
      "itemId": "v2-3",
      "status": "passed",              // passed | failed | not_verifiable
      "opinion": "npx vitest run tests/x.test.ts → 12 passed",   // 可选
      "changeReason": "agent 跑的是旧分支，重跑后输出不同"        // 新增，可选
    }
  ]
}
```

| 情形 | 服务端行为 |
|---|---|
| `changeReason` 缺失且该次裁决构成覆盖 | **400**，code `result_change_reason_required`，文案给「可不覆盖 / 或补理由」两条路 |
| `changeReason` 缺失且**不构成**覆盖 | 正常裁决（不报错） |
| `changeReason` 非字符串 / 超长 | 按 `normalizeText(..., 1000)` 归一，超长截断 |

## 工具通道契约 <!-- serves: FR-3 -->

`reqboard_accept_sheet(requirement_id?, batch_size?, version?)` —— **入参签名不变**（不新增参数）。

覆盖理由由**补问**采集：对第一轮问答后会被判为覆盖的项，追加一轮问答，问题 id 形如 `<itemId>#change-reason`。
补问未作答 → 该项**不执行覆盖**，按「未覆盖」记录裁决；不因此拒绝整批。

## 错误码与拒绝文案 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 错误码 | 触发 | 文案必须包含 |
|---|---|---|
| （`invalid_input`，沿用 `checkAcceptance` 现有通道） | 命令操作数是占位符 | 占位符原文 + 「换成真实路径/编号」的修法 |
| `REQBOARD_STAGES_INVALID`（沿用） | 词表外 token / 回填后仍有残留 | 出问题的 token + 该登记到哪张词表 |
| `system_item_disposition_required`（沿用，语义收紧） | 系统项通过但处置未命中模板 | 两种合法写法各一例 + 该项 id |
| `invalid_input`（域层）/ `opinion_required`（传输层，沿用映射） | 人工项通过但文本 ≤6 字或无事实形态 | 该项 id + 「写现象 + 证据路径」的样例 |
| `result_change_reason_required`（新增） | 覆盖缺理由 | 两项选择：不覆盖 / 补理由 |
| 不放行归档（无新码，走既有门） | 存在未处置系统项 / 未复核项 | 点名该项 id + 处置办法 |

**文案纪律**：所有拒绝文案必须**给出修法**，不许只报「不允许」。

## 调用序与原子性 <!-- serves: FR-2, FR-3, FR-4 -->

1. **验收裁决**：整批**先校验、后落状态**——`applyVerdicts` 在改动任何 in-place 字段前完成全部前置校验，
   中途失败不留半批已改记录（既有不变量，本次沿用）。
2. **两存储顺序**：返工卡先写队列、需求记录后写台账（既有 I-11 契约，本次沿用）。
3. **返工卡**：规格构造（含判据与继承）在 domain 一次算完；应用层只做「生成 id + 写状态事件 + 落库」，不二次判定。
4. **覆盖**：判定与写入在同一次 `mutate` 内完成；覆盖被拒时**该批的其它项照常**（拒绝粒度是「这一次覆盖」，不是整批）。

## 兼容与开关 <!-- serves: FR-3 -->

- 既有回滚开关 `DSH_REQBOARD_NO_ITEM_RESULT` **语义不变**：开启时整段回到结构化绑定之前的行为，
  覆盖写入一并跳过（不写 `result`/`resultSource`/`resultSuperseded`/`resultChangeReason`）。
- 无新增环境变量开关：本次改动不再引入第二套开关（避免「开关组合」成为新的不可测面）。
