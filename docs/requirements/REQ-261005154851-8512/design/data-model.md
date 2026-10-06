---
serves: [FR-1]
---

# 数据模型设计（REQ-261005154851-8512）

> 需求源：`requirement.md`（FR-1）。本份只讲**一枚字段**：它从哪来、怎么投影、缺省时怎么办、是否落盘。
> 签名与调用点见 `interfaces.md`；本需求**不动持久化结构**。

## 变更总览 `serves: FR-1`

| 载体 | 变更 | 性质 |
|---|---|---|
| `RequirementRecord.promptDifficulty` | **不动**（立项时就写进台账，`simple/standard/advanced/expert`） | 既有 |
| `RequirementSummary`（看板摘要） | **不动**（`SUMMARY_KEYS` 早已含 `promptDifficulty`） | 既有 |
| `RequirementFacts`（同步缝窄投影） | **新增** `promptDifficulty?: PromptDifficulty` | 本需求唯一契约变更 |
| `factsOf()` | 多投影一枚短字符串（可选） | 投影函数 |
| 台账 schema / SQLite 列 / 分片文件 | **不动**（字段早已存在） | — |

## `RequirementFacts.promptDifficulty` 字段级契约 `serves: FR-1`

| 项 | 约定 |
|---|---|
| 类型 | `PromptDifficulty` = `simple \| standard \| advanced \| expert`（复用既有类型，不新增枚举） |
| 必填性 | **可选**：缺省时**键不出现**（不写 `undefined` 占位——JSON 化会被丢掉，写与不写必须同形） |
| 来源 | `record.promptDifficulty`（立项写入；修复/迁移不改它） |
| 缺省语义 | **不是**"默认 standard"，而是"未知" ⇒ 调用点回落文本推断 → 默认轻档（与改造前逐字相同） |
| 是否有界 | 有界：一枚短字符串（同步缝载荷口径同 `category`） |

**投影规则（与 `category` 同款，逐字对齐既有写法）**：

```ts
...(record.promptDifficulty !== undefined ? { promptDifficulty: record.promptDifficulty } : {}),
```

| 入参形态 | 结果 |
|---|---|
| `promptDifficulty: 'expert'` | 结果含 `promptDifficulty: 'expert'` |
| `promptDifficulty: undefined`（存量） | 结果**不含**该键 |
| 其他字段（title/description/status…） | 逐字不变 |

## 为什么必须进 `RequirementFacts` 而不是各处自己读台账 `serves: FR-1`

| 方案 | 结论 | 理由 |
|---|---|---|
| 进 `RequirementFacts`（**采用**） | ✅ | ① `capture-section` 是**同步**装配（系统提示词缝），本就不能 await 台账读写；② 三处调用点拿到的是**同一份**取值来源（避免第二份真相） |
| 各调用点自己 `store.get(id)` | ❌ | 同步缝里做不到（要 async）；且三处各读一遍 = 三份口径 |
| 把 `promptDifficulty` 塞进 `RequirementSummary` 之外的旁路（如全局缓存） | ❌ | 新增一层状态与失效面，收益为零 |

## 无持久化 / 无迁移 `serves: FR-1`

| 项 | 结论 |
|---|---|
| 台账字段 | **不新增**：`record.json` / SQLite / 摘要键集（`SUMMARY_KEYS`）零改动 |
| 数据回填 | **不涉及**：存量需求本来就有（或本来就没有）该字段，读侧容错即可 |
| 生成物 | 若同步缝形状有快照类测试，仅需同步断言（见 `test-cases.md` 回归项） |
| 回滚 | 回退构建即可：本需求零写入，唯一风险是"注入档位回到改造前"（无数据残留） |

## 兼容与边界 `serves: FR-1`

- 读侧一律**容错**：缺省 / 非法值 → 视为"未声明"（`difficultyFromDeclaredPrompt` 返回 `undefined`），**不抛错、不猜档**。
- 写入侧不变：立项弹框（四问）与 `capture-mapping` 的 `CAPTURE_DEFAULTS.difficulty = standard` 口径**不动**。
- 边界值：`'EXPERT'`（大小写）、`' expert '`（空白）、`''`（空串）、`null` 一律按未声明处理（既有映射实现即按白名单匹配）。
