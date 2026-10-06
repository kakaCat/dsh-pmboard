---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 后端（host 侧）设计（REQ-261005154851-8512）

> 需求源：`requirement.md`（FR-1~FR-5）；`sides: [backend]`（本需求不改客户端，无 UI 改动、不交原型）。
> 架构与取舍见 `architecture.md`，签名与调用点见 `interfaces.md`，字段见 `data-model.md`，验收见 `test-cases.md`。

## 文件级改动清单 `serves: FR-1, FR-2, FR-3, FR-4`

| 文件 | 改动 | 类型 |
|---|---|---|
| `src/domain/requirement/RequirementSummary.ts` | `RequirementFacts` 加 `promptDifficulty?`；`factsOf` 多投影一枚键 | 修改（加性） |
| `src/application/internal/capture-section.ts` | 取词调用传 `declaredDifficulty`（映射后） | 修改（一行 + 导入） |
| `src/application/dive/session-driver.ts` | 同上，并补 `requirement{title,description}` | 修改 |
| `src/application/use-cases/IsolateNodeContext.ts` | `difficulty` 取值：调用方显式优先 → 否则按声明映射 | 修改 |
| `src/domain/prompt/difficulty-mapping.ts` | **不动**（四档→两档、取重不取轻） | — |
| `src/application/gate/handlers/h3-inject.ts` | **不动**（对照口径，本就正确） | — |
| `src/application/internal/injection-log.ts` | **不动**（`difficultyReasons` 已支持） | — |
| `tests/injection-difficulty.test.ts` | **新增**：四档映射 / 三处口径一致 / 无声明逐字不变 / 冲突取重 / facts 投影两形态 | **新增** |
| `scripts/injection-difficulty-probe.mts` | **新增**：同文本两种声明的取词对比（routeKey / fragmentIds / reasons），退出码 0/1 | **新增** |
| `src/client/**` | **不动** | — |

## 三处接线的执行时序 `serves: FR-2, FR-3`

```
每轮系统提示词装配（capture-section，同步）
  open facts（窗口绑定 + 开态需求）
      └─ promptDifficulty（本需求补进 facts 的那枚）
             └─ difficultyFromDeclaredPrompt → 'light' | 'heavy' | undefined
                    └─ resolveStagePrompt({ stage, category, requirement, declaredDifficulty? })
                           ├─ 文本推断档（inferDifficulty）
                           ├─ declared 与推断**取重不取轻**（heavierDifficulty）
                           └─ 命中层 ①→④ 取分片 + 第 ⑤ 层全局铁律恒并入
                                  └─ injectionLog.record({ difficulty, difficultyReasons })

dive 采集半（session-driver）——同一份 facts、同一个入口；**只留痕不投递**
节点隔离 / 输入包（isolateNodeContext）——调用方显式 difficulty 优先；否则用声明映射
```

三条钉子：

- **同源**：三处的声明档都来自 `RequirementFacts.promptDifficulty`（或同一映射函数），不各自读台账。
- **不猜**：缺省 / 非法 → 不传 → 回落现状（推断 → 默认 light）。
- **不新增算法**：只调既有 `resolveStagePrompt`（INV-1）。

## 装配与依赖 `serves: FR-3`

- **无新增服务注入**：`capture-section` / `session-driver` 用的 facts 由既有同步缝喂入；
  `isolateNodeContext` 已持有需求记录（文档与卡都从它取）。
- **不新增端口**：本需求不引入任何 I/O 能力，只在既有数据流上加一枚字段与三次传参。
- **不改定时/唤醒**：不触发额外轮次；dive 采集半的"只留痕不投递"性质不变。

## 错误处理与可观测 `serves: FR-2, FR-4`

| 情形 | 行为 | 留痕 |
|---|---|---|
| 无声明（存量） | 不传 `declaredDifficulty` → 推断/默认 | `difficultyReasons` 可为空 |
| 非法值（脏数据 / 大小写 / 空白） | 映射返回 `undefined` → 同上 | 同上（不报错、不猜） |
| 声明与推断冲突 | 取重不取轻 | reasons 同时给出两者与最终取值 |
| 需求记录读不到（隔离用例内） | 不传 `difficulty` → 默认 light；**不阻断**节点隔离 | 该路径无独立留痕（沿用输入包既有行为） |

**不新增错误码**：最差情况是"回落现状"，没有新的失败态。

## 性能与体量 `serves: FR-1`

| 项 | 事实 |
|---|---|
| 附加 I/O | **零**（字段本就在内存投影里；不读盘、不 await） |
| 同步缝载荷 | +1 枚短字符串（同 `category` 量级） |
| 文件体量 | 改动都在既有文件内的小切片（`RequirementSummary.ts` 与三处调用点各 1~3 行） |

## 静态门禁与旁路防护 `serves: FR-2, FR-3`

| 门禁 | 要求 | 兜底 |
|---|---|---|
| 取词唯一入口 | 三处调用点只能调 `resolveStagePrompt`，不得自造难度分支 | 代码审查 + `tests/injection-difficulty.test.ts` 的"三处口径一致"用例 |
| 难度映射单点 | 只用 `difficultyFromDeclaredPrompt` / `heavierDifficulty` | 新增用例断言四档全部映射正确 |
| 回归保护 | "无声明 → 分片 id 与改造前逐字相同" | 用例断言 `fragmentIds` 全等（而非只看 routeKey） |
| 同步缝口径 | 可选字段缺省时**键不出现** | 用例断言 `'promptDifficulty' in facts === false` |
| 生成物 | 改了 `src/` 后须重生成知识层 | `npx tsx scripts/kb-build.mts --write && pnpm kb:check`（kb C-13） |
