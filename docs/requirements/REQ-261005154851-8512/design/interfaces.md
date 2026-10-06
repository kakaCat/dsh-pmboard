---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 接口设计（REQ-261005154851-8512）

> 需求源：`requirement.md`（FR-1~FR-5）。本份定**签名、调用点入参、错误与兼容**；字段契约见 `data-model.md`。
> 全部改动**加性**：既有函数签名一律不变（只改调用点传了什么），唯一新增是 `RequirementFacts` 上一枚可选字段。

## 数据契约：`RequirementFacts`（`data-model.md` 同步） `serves: FR-1`

```ts
// src/domain/requirement/RequirementSummary.ts
export interface RequirementFacts {
  // …既有字段不动…
  /** 立项时人选的提示词难度（四档）；缺省 = 键不出现（不补默认值）。 */
  readonly promptDifficulty?: PromptDifficulty
}

export function factsOf(record: SummarizableRequirement): RequirementFacts
// 行为：record.promptDifficulty 存在 → 带上；缺省 → **不产生该键**（与 category 同款可选投影）
```

| 项 | 约定 |
|---|---|
| 可选性 | 可选；老记录无该键 → 读侧 `undefined` → 各调用点回落现状 |
| 类型 | `PromptDifficulty`（`simple \| standard \| advanced \| expert`，既有类型，不新增） |
| 同步缝 | 只一枚短字符串，不触同步载荷上限口径（同 `category`） |

## 唯一取词入口（既有，**签名不变**） `serves: FR-2, FR-3`

```ts
// src/domain/prompt/index.ts（不动签名，只被调用点传满）
export function resolveStagePrompt(req: StagePromptRequest, library?: readonly Fragment[]): ResolvedPrompt

export interface StagePromptRequest {
  stage: PromptStage
  category?: Category
  difficulty?: Difficulty            // 两档：调用方直给（最高优先）
  declaredDifficulty?: Difficulty    // 两档：声明档映射值（本需求要传满的就是它）
  requirement?: { title: string; description: string }   // 供文本推断
  budget?: number
}
```

优先级（既有语义，逐字引用实现）：① 显式 `difficulty`；② `declaredDifficulty` 与**文本推断档**取重不取轻
（`heavierDifficulty`）；③ 只有其一 → 用它；④ 都没有 → `DEFAULT_DIFFICULTY = light`。

## 三处调用点的入参（本需求改的就是这三行） `serves: FR-2, FR-3`

```ts
// ① 每轮系统提示词：src/application/internal/capture-section.ts:215
const declared = difficultyFromDeclaredPrompt(stageReq.promptDifficulty)   // 新增
const resolved = resolveStagePrompt({
  stage, category: stageReq.category,
  requirement: { title: stageReq.title, description: stageReq.description },
  ...(declared === undefined ? {} : { declaredDifficulty: declared }),       // 新增
})

// ② dive 采集半（只留痕不投递）：src/application/dive/session-driver.ts:283
const declared = difficultyFromDeclaredPrompt(stageReq.promptDifficulty)   // 新增
const located = resolveStagePrompt({
  stage, category: stageReq.category,
  requirement: { title: stageReq.title, description: stageReq.description }, // 新增（与①同源）
  ...(declared === undefined ? {} : { declaredDifficulty: declared }),       // 新增
})

// ③ 节点隔离 / 输入包：src/application/use-cases/IsolateNodeContext.ts:280
//    调用方给的 request.difficulty 优先（显式）；没有时按本需求声明的难度映射补上——
//    声明取不到 → 仍不传（回落默认 light，与改造前一致）
const declared = difficultyFromDeclaredPrompt(requirementRecord?.promptDifficulty)
const effective = request.difficulty ?? declared
buildNodeInputPackage({ stage, ...(effective === undefined ? {} : { difficulty: effective }), /* … */ })
```

| 调用点 | 入参变化 | 缺省行为 |
|---|---|---|
| ① 系统提示词 | 新增 `declaredDifficulty`（映射后两档） | 无声明 → 不传，与改造前**逐字相同** |
| ② dive 采集半 | 同上 + 补 `requirement` 文本 | 同上（且该处只留痕） |
| ③ 节点隔离 / 输入包 | 调用方显式 `difficulty` 优先；否则用声明映射值 | 两者都无 → 不传，默认 light |

**签名纪律**：三处都**不新增函数**、不改 `StagePromptRequest`；`difficultyFromDeclaredPrompt` 返回
`undefined`（未声明 / 非法）时一律**不传该键**，不填 `undefined` 占位。

## 留痕（既有通道，不新增字段） `serves: FR-4`

```ts
// src/application/internal/injection-log.ts（不动）
export interface InjectionLogInput {
  // …
  difficulty?: string            // 最终取词档（light / heavy）
  difficultyReasons?: string[]   // 取词依据（声明档 / 推断档 / 冲突取重）
}
```

要求（判据可 grep）：

1. 有声明时至少一条 `声明难度 {declared} → 取词档 {mapped}`（`resolveStagePrompt` 既有产出）；
2. 声明与推断**冲突**时，reasons 同时含两者与最终取值（既有 `heavierDifficulty` 分支已产出该文案）；
3. 无声明且推断不出 → `difficultyReasons` 可为空（不编造依据）。

## 错误语义与兼容 `serves: FR-1, FR-2, FR-3`

| 情形 | 行为 |
|---|---|
| `promptDifficulty` 缺省（存量需求） | 不传 `declaredDifficulty` → 与改造前逐字相同（同分片 id） |
| `promptDifficulty` 是非法字符串（脏数据） | `difficultyFromDeclaredPrompt` 返回 `undefined` → 同上，**不抛错**（读侧容错，与既有实现一致） |
| 需求记录读不到（隔离用例内） | 不传 `difficulty` → 默认 light（**不阻断**节点隔离：它是增强，不是门） |
| 声明与推断冲突 | 取重不取轻（既有语义），并在 reasons 里说明 |

**不新增 `REQBOARD_*` 错误码**：本需求没有新的失败态——最差情况就是"回落现状"。
