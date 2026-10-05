---
req: REQ-261002175818-80a8
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9
---

# 测试策略 · 十条断言怎么跑、看到什么算过（REQ-261002175818-80a8）

> **TL;DR**：原则**修前必红、修后必绿**。分五层：领域单测（纯函数，零 IO）、提交与门禁（真用例 + 假台账）、
> 端到端贯通（**自带反向证伪**）、批准两条路径、兼容缺省。测试文件名与 requirement.md §验收 **逐字一致**，
> 避免需求与设计两份真相。

## 断言与用例对照 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9`

requirement.md 的 A1–A7 与用例的对应关系（**A 断言全部保持可判，不因设计细化而放宽**）：

| 需求断言 | 用例 | 命令 |
|---|---|---|
| A1 体量可声明（落库逐字相同） | T7 | `npx vitest run tests/plan-footprint-propagation.test.ts` |
| A2 不许蒙门禁 | T4, T5 | `npx vitest run tests/plan-footprint.test.ts` |
| A3 超容量被算出（113 DU → 8 批） | T2, T6 | `npx vitest run tests/round-capacity.test.ts tests/plan-overcapacity-notice.test.ts` |
| A4 超容量不是错误 | T6 | `npx vitest run tests/plan-overcapacity-notice.test.ts` |
| A5 三处可见（返回体 / 文档标记 / 批准文本） | T6, T8 | `npx vitest run tests/plan-overcapacity-notice.test.ts` |
| A6 余量参考不冒充判据 | T9 | `npx vitest run tests/capacity-reference.test.ts` |
| A7 未声明不冒充 0 | T10 | `npx vitest run tests/plan-footprint-compat.test.ts` |

## T1–T4 · 领域单测（纯函数，零 IO） `serves: FR-2, FR-3`

**测试目标**：`src/domain/task/Footprint.ts` 的形状校验、路径下限、判定与批数——一台可穷举的算术机。

| 编号 | 被测 | 输入 | 通过条件 |
|---|---|---|---|
| T1 | `normalizeFootprint` | `undefined` / `null` / 合法三字段 / 缺字段 / `files:0` / `files:-1` / `files:1.5` / `files:'3'` / 未知键 / `files:100_001` | 前两者 → `undefined`（**未声明 ≠ 错误**）；合法 → 原样返回三字段；其余**逐个点名**抛 `FootprintError`，`code === 'REQBOARD_BAD_FOOTPRINT'` |
| T2 | `judgeFootprint` | `{100,20,6000}`（容量 16）、`{1,2,800}`、边界 `detailUnits === capacity` | `{100,20,6000}` → `detailUnits === 113`、`over === true`、`suggestedBatches === 8`；`{1,2,800}` → `2.4`、`over === false`、`suggestedBatches === undefined`；**等于容量 → `over === false`**（严格大于才超） |
| T3 | `declaredFilesFloorFrom` | 含 3 个 `src/…`+`tests/…` 路径的 implementation；重复路径；纯散文（无前缀）；`undefined` | 3 / 去重后仍 3 / 0 / 0——**下限是防缩水下界，不是完整性审计** |
| T4 | `assertFootprintFloor` | `files:1` + 3 路径；`files:3` + 3 路径；`files:5` + 3 路径；未声明 + 3 路径 | 第一条抛错且消息含「3」与修复指引；后三条均通过（**允许留余量**） |

**修前必红**：`Footprint.ts` 不存在时 import 失败即本层全红——先写用例再写实现。

## T5–T6 · 提交与门禁（真用例 + 假台账） `serves: FR-4, FR-5`

**测试目标**：`submitPlanArtifact` 的返回体与拒绝路径。夹具照 `tests/plan-mode.test.ts:23-99`
（真 `JsonLedgerRepository` + `stubDocFile('docs/requirements/<REQ>/decomposition.md')`，否则被可打开性门先拒）。

| 编号 | 场景 | 通过条件 |
|---|---|---|
| T5 | 声明缩水（`files:1`，implementation 点 3 个路径） | 抛错，`code === 'REQBOARD_BAD_FOOTPRINT'`，消息含实际计数；**台账零变更**（拒绝零副作用） |
| T5b | footprint 形状非法（缺 `anchors`） | 同上码；消息点名缺哪个字段 |
| T6 | 一张超容量卡 + 一张轻量卡 | `success === true`、`overCapacity.length === 1`（只含超容量那张）、`capacityNote.source === 'constant'`、`capacityNote.calibrated === false`；**轻量卡不出现在清单里**（不误报） |
| T6b | 超容量卡在计划文档里**没有**标记 | 抛门禁错，`code === 'plan_overcapacity_marker_missing'`，`gaps` 含该卡 key 与期望批数 |
| T6c | 标记在场但批数写错（写 `建议1批`，判定为 8） | 同 T6b（**批数必须相等**——这是"披露与判定不漂移"的可证伪点） |
| T6d | 标记正确（`⚠️超容量(建议8批)`） | 提交通过，返回体 `overCapacity` 非空 |
| T6e | `capacity.markerGate='warn'` + 无标记 | **不拒绝**，但返回体仍响亮给出 `gaps`（灰度开关不制造静默） |

## T7 · 端到端贯通（反向证伪） `serves: FR-1, FR-7`

**测试目标**：`PlanTask.footprint` 活到队列卡上——**照抄 `tests/plan-mode.test.ts:137-165` 的手法**，不是 `plan-refs.test.ts`。

```
① 工具 execute 提交计划（带 footprint）
② 断言台账未被白名单丢：store.snapshot().requirements[0].plan.tasks.find(…).footprint
③ 真人批准走真 HTTP：await post('/req/plan/approve', { id })
④ await run(decompose, {})
⑤ 断言真 TaskStore 队列卡：queueTasksOf(REQ).find(…).footprint 三字段与计划逐字相同
```

**反向证伪（本用例的核心价值）**：从 `normalizePlanTasks` 白名单里删掉 `footprint` 一项 → 本用例**必须变红**。
本仓 `stages` 与 `requirement_refs` 都中过"只到协议层"的静默丢弃，本用例是同一条坑的会响的线。

## T8 · 批准两条路径的文本 `serves: FR-6`

| 编号 | 路径 | 通过条件 |
|---|---|---|
| T8a | 弹框批准（`reqboard_ask_confirm(target=plan)`） | `popupQuestion` 含超容量卡 key 与建议批数；长度 ≤ `LIMITS.popupQuestionMax`（220） |
| T8b | 弹框批准，**无**超容量卡 | `popupQuestion` **逐字节等于**改造前文本（新摘要为 `''` 时零影响——既有测试不受累） |
| T8c | 看板批准（`POST /req/plan/approve`） | 台账评论含 `超容量 N 张` 与各卡建议批数；**响应体形状不变**（不新增未消费字段） |
| T8d | 多张超容量卡（≥4） | 摘要压缩为 `t3(建议8批)、t7(建议3批)…` 且仍 ≤ 220 字符 |

## T9 · 余量参考（只读、不猜 0、带标注） `serves: FR-8`

| 编号 | 场景 | 通过条件 |
|---|---|---|
| T9a | 投影可得（`contextWindow: 64000`、`projectedTokens: 40000`） | 节点输入包出现「余量参考」节、`remainingTokens === 24000`、**同节含「参考值，非门禁判据」** |
| T9b | 投影不可得（服务未装配 / 无会话） | 该节**整节不出现**（返回 `''`），节点输入包其余部分**逐字节等于**改造前 |
| T9c | 只有 `contextWindow` 没有 `projectedTokens` | `remainingTokens` **缺席**（不猜 0） |
| T9d | 任务树顶层 | `contextPressure.source === 'projection'`、`remainingTokens` 正确、`note` 在场 |
| T9e | 适配器降级 | `agents.get` 抛错 / `stateOf` 抛错 → `source === 'unavailable'`、**不抛错**（照 `tokenTotals` 的 try/catch 口径） |

## T10 · 兼容与缺省（未声明 ≠ 0） `serves: FR-9`

| 编号 | 场景 | 通过条件 |
|---|---|---|
| T10a | 无 footprint 的计划提交 | `success === true`、`overCapacity` 为**空数组**（不是缺键）、**无任何门禁触发** |
| T10b | 旧台账任务卡 | 任务树回显 `footprintState === 'undeclared'`、**`footprint` 键不存在**（`expect(Object.prototype.hasOwnProperty.call(node,'footprint')).toBe(false)`——抄 `tests/reqboard/legacy-refs-compat.test.ts:28-43` 的断言手法） |
| T10c | 台账 schemaVersion | 仍为 `9`（未 bump） |
| T10d | 既有测试回归 | `tests/plan-mode.test.ts`、`tests/design-registration.test.ts`、`tests/output-contract.test.ts` 全绿 |

## 门禁与回归 `serves: FR-1, FR-3, FR-8`

```bash
# 本次新增六份（与 requirement.md §验收 同名）
npx vitest run tests/round-capacity.test.ts tests/plan-footprint.test.ts
npx vitest run tests/plan-footprint-propagation.test.ts tests/plan-overcapacity-notice.test.ts
npx vitest run tests/capacity-reference.test.ts tests/plan-footprint-compat.test.ts

# 尺寸（C-02：本次文件命中 0）与类型（C-15：不高于基线 223）
npx vitest run tests/size-budget.test.ts && pnpm typecheck

# 层边界（新领域模块必须零 import 外层）与输出契约（新键必须已声明）
npx vitest run tests/layer-boundary.test.ts tests/output-contract.test.ts

# 提示词片段（改了 fragments/**.md 就必须重生成并校验）
node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs && npx vitest run tests/prompt-gates.test.ts

# 全量回归：失败数不高于基线（当前 106 failed）
npx vitest run
```

**真实冒烟**（对齐立项时的那句话）：

1. 造一张 `{files:100, anchors:20, chars:6000}` 的卡 → `overCapacity` 命中、`suggestedBatches === 8`；
2. 造一张 `{files:1, anchors:2, chars:800}` 的卡 → `overCapacity` 为空（不误报）；
3. 删掉 2 的结果里的 `footprint` 再提交 → 照旧通过（A7）。

## 与验收材料的关系 `serves: FR-1, FR-4, FR-6`

验收阶段（`kind=verification`）的证据清单**直接引用本文件的六条命令与输出摘要**，
外加冒烟三条的实测数字（`detailUnits` / `suggestedBatches` 的真实值）。
凡修前未红的用例，必须在验收材料里说明原因——**"没红过"不算证据**。
