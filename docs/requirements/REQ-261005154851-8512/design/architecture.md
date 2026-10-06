---
serves: [FR-2, FR-3, FR-4]
---

# 架构设计（REQ-261005154851-8512）

> 需求源：`requirement.md`（FR-1~FR-5）。本份定「声明难度从哪来、在哪几处接上、口径怎么统一」。
> 字段契约见 `data-model.md`，签名与调用点见 `interfaces.md`，缓存与验收见 `test-cases.md`。

## TL;DR `serves: FR-2, FR-3`

一句话：**把"难度声明"这枚已有的事实，送到三个取词调用点上**——算法、映射表、分片库**都不动**。

- 唯一取词入口仍是 `resolveStagePrompt`（INV-1）；唯一映射仍是 `difficultyFromDeclaredPrompt` +
  `heavierDifficulty`（取重不取轻）。
- 唯一数据缺口：系统提示词缝的窄投影 `RequirementFacts` **没有** `promptDifficulty` ⇒ 先补它，
  三处接线才有同一份取值来源（避免各处自己从台账捞）。
- 无声明 / 非法声明时**行为逐字不变**（回落文本推断 → 默认轻档）。

## 三个取词调用点的现状（已核实） `serves: FR-2, FR-3`

| 调用点 | 出处 | 现状 | 处置 |
|---|---|---|---|
| 闸门注入 | `src/application/gate/handlers/h3-inject.ts:100` | **正确**：`difficultyFromDeclaredPrompt(requirement.promptDifficulty)` 后传 `declaredDifficulty` | **不动**（本需求只以它为对照口径） |
| 每轮系统提示词 | `src/application/internal/capture-section.ts:215` | 只传 `stage` / `category` / `requirement{title,description}` ⇒ 文本推断不出时回落 `DEFAULT_DIFFICULTY = light`（**病灶**） | 传 `declaredDifficulty` |
| dive 采集半（只留痕不投递） | `src/application/dive/session-driver.ts:283` | 只传 `stage` / `category` ⇒ 恒轻档，与上一行**留痕不一致** | 传 `declaredDifficulty`（+ requirement） |
| 节点隔离 / 节点输入包 | `src/application/use-cases/IsolateNodeContext.ts:280` ← `src/application/internal/node-settlement.ts:189` | `settle.difficulty` 在 `src/` 内**没有任何生产者**（全仓只有读取处）⇒ 实际恒缺省 light（**同类第二处**） | 在隔离用例内按 `requirementId` 取声明难度并映射 |

> 结论：本需求不是"补一行漏传"，而是**一条断链 + 一处潜伏的同病**——三处都要有同一个取值来源。

## 分层与职责边界 `serves: FR-1, FR-2, FR-3`

| 层 | 放什么 | 为什么 |
|---|---|---|
| `domain/requirement/RequirementSummary.ts`（改一行投影） | `RequirementFacts.promptDifficulty?` + `factsOf` 带上它 | 同步缝的窄投影是"注入组装能看到什么"的唯一边界；缺它则上层拿不到 |
| `domain/prompt/difficulty-mapping.ts` | **不动**（四档 → 两档、取重不取轻） | 语义早已定死，本需求只是把调用点接满 |
| `application/internal/capture-section.ts` | 从 facts 取声明难度 → 映射 → 传 `declaredDifficulty` | 每轮系统提示词的唯一装配处 |
| `application/dive/session-driver.ts` | 同上（该处只留痕） | 留痕与系统提示词必须同口径，否则留痕会被当证据误读 |
| `application/use-cases/IsolateNodeContext.ts` | 按 `requirementId` 取需求记录/画面 → 映射 → 传 `difficulty` | 该用例已持有需求上下文（文档与卡都从它取），在此收敛最自然 |
| `application/internal/injection-log.ts` | **不动**（`difficultyReasons` 已支持） | 留痕通道现成，不新增字段 |

## 决策与取舍 `serves: FR-2, FR-3`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 声明难度从哪取 | 在每个调用点各自从台账 `get()` 捞 | 先补进 `RequirementFacts`（同步缝），调用点只读它 | 两处自己捞 = 第二份真相；而且 `capture-section` 是**同步装配**，本就不能 await 台账读 |
| 第三处（隔离/输入包）怎么改 | 给 `settle.difficulty` 找一个上游生产者 | 在 `isolateNodeContext` 内按 `requirementId` 取 | `settle` 的构造散在闸门/驱动器多路，逐路补 = 多处漂移；隔离用例是**唯一**组装输入包的地方 |
| 无声明时怎么办 | 一律提到重档 | 保持现状（推断 → 默认轻档） | 存量需求大量无声明；一律提重会让纪律与事实脱钩（需求 D-x 决策表亦如此定） |
| 冲突怎么取 | 声明优先 | 取重不取轻（既有 `heavierDifficulty`） | 本仓既有语义：宁可多给纪律，不可少给 |
| dive 采集半要不要接 | 不接（它不投递） | 接 | 它产出的是**留痕**；留痕与真实注入不一致，等于给人一份错的证据 |

## 不做的架构改造 `serves: FR-3`

- 不动闸门路径（它是对的）；不新增取词入口或第二套难度表。
- 不改四档枚举与两档映射；不改分片库文案。
- 不追溯历史注入（已注入的回合不补发）。
- 不给 `settle` 增加新的必填字段（保持"缺省 = 回落现状"）。

## 风险与对策 `serves: FR-2, FR-3, FR-4`

| 风险 | 对策 |
|---|---|
| 同步缝字段膨胀 | 只增一枚可选字符串；缺省即**键不出现**（不补默认值） |
| 存量需求行为被改动 | 单测钉「无声明 → 分片 id 与改造前逐字相同」 |
| 三处口径再次分叉 | 三处都只调 `difficultyFromDeclaredPrompt` + `resolveStagePrompt`；单测断言三处 `routeKey` 档位一致 |
| 留痕仍看不出"凭什么" | 复用 `difficultyReasons`：声明与推断不一致时同时给出两者与最终取值 |

## 变更记（相对需求文档的补充） `serves: FR-3`

- 需求文档 FR-3 只点名了"dive 采集半"与"节点输入包"两处；核实后发现两处的成因**不同**：
  前者是"没传"，后者是"**没人给**"（`settle.difficulty` 无生产者）。本份据此把第三处的修法
  定为"在 `isolateNodeContext` 内按 `requirementId` 取"，理由是收敛点唯一（见决策表）。
- 需求文档已人确认并落章，本补充以本节留痕；实施与验收以本设计与 `interfaces.md` 为准。
