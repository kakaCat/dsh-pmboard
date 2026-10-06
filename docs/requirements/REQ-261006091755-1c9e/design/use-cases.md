---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 用户场景（REQ-261006091755-1c9e）

> 编号 UC-x；测试用例与被测对象引用它。本文档只写**多角色 / 多分支**场景，重复需求文档已写的不再抄。

## 场景总览 `serves: FR-1`

| 场景 | 角色 | 触发 | 完成标志 | serves |
|---|---|---|---|---|
| UC-1 豁免生效、无原型：拆分放行 | 实施 agent | 对已豁免原型的 UI 需求提交/落库拆分计划 | 不再出现 `prototype_anchor_missing`，前端卡正常落库 | FR-1 |
| UC-2 豁免未落章 / 理由空：仍然拒 | 裁决人 | agent 想在未确认需求文档时自己豁免 | 仍按 `prototype_anchor_missing` 拒，文案与今天一致 | FR-2 |
| UC-3 豁免了但真交了原型：仍要求锚点 | 裁决人 / 实施 agent | 豁免生效，但产物簿里有已登记原型 | 卡缺锚点仍被拒并点名该卡；补权威锚点即放行 | FR-3 |
| UC-4 非 UI 需求 / 存量需求：完全不受影响 | 维护者 | 跑既有回归 | 判定与改动前逐字节一致 | FR-1, FR-2 |
| UC-5 判据只此一处 | 后来实现者 | 读锚点维代码 | 只见 `prototypeExemptOf(` 一处，无手写豁免判据 | FR-4 |

## UC-1 豁免生效、无原型：拆分放行 `serves: FR-1`

- **用例角色**：实施 agent（持已批准计划落卡）。
- **前置条件**：需求 `sides` 含 frontend；`requirement.md` front-matter 有 `prototype_exempt: <理由>`；
  产物簿里 `kind=requirement` 条目 `confirmedAt` 已写（人已确认需求文档）；**没有任何已登记 prototype 产物**。
- **交互流程**：
  1. agent 调 `reqboard_submit(kind=plan)`（或 `reqboard_decompose`）→ 覆盖门运行；
  2. 维① FR 落点通过 → 进入维②；
  3. 维② 前置判定命中（豁免生效 ∧ 已登记原型 == 0）→ 返回 `undefined`；
  4. 计划正常提交/落库，前端卡 `side=frontend` 无需锚点。
- **异常流**：
  - 若目录里躺着**未登记**的原型骨架（自动发现補登 `autoDiscovered: true`）→ 仍命中跳过（判据是"已登记"）；
  - 若该需求另有 FR 无卡接收 → 维① 先报 `requirement_uncovered`（与本次改动无关）。
- **后置条件**：需求进入下一阶段，卡面 `side` 如实声明 frontend。
- **完成标志**：同场景不再返回 `prototype_anchor_missing`（TC-1、TC-2 断言）。

## UC-2 豁免未落章 / 理由空：仍然拒 `serves: FR-2`

- **用例角色**：裁决人（守豁免这道门的最终 authority）。
- **前置条件**：`prototype_exempt` 理由为空；或理由非空但 requirement 产物 `confirmedAt` 缺省。
- **交互流程**：
  1. 提交/落库计划 → 覆盖门运行；
  2. 维② 前置判定**不**命中（豁免不生效）→ 照旧逐卡判定；
  3. 卡缺锚点 → `prototype_anchor_missing`，gaps 点名卡 key 与补写位置。
- **异常流**：`prototype_exempt` 键根本不存在 → 同未豁免处理。
- **后置条件**：台账零写入（拒绝发生在落库前）。
- **完成标志**：拒绝码与 gaps 文案与改动前**逐字一致**（TC-3～TC-5 断言）。

## UC-3 豁免了但真交了原型：仍要求锚点 `serves: FR-3`

- **用例角色**：裁决人（豁免 = 不强制，不等于免检）。
- **前置条件**：豁免生效；产物簿里有 ≥1 条已登记 prototype（`autoDiscovered !== true`）。
- **交互流程**：
  1. 维② 前置判定第二项为假（已登记原型 ≠ 0）→ 不跳过；
  2. 逐卡判定照旧：卡缺锚点 → 拒；锚点指向权威路径 → 放行。
- **异常流**：INDEX 缺失 / 权威条数 ≠ 1 → 行为与今天一致（降级为只判形态，不静默跳过）。
- **后置条件**：交付物质量约束不下降。
- **完成标志**：TC-6 断言仍拒且点名该卡；TC-7 断言补权威锚点即放行。

## UC-4 非 UI 需求 / 存量需求：完全不受影响 `serves: FR-1, FR-2`

- **用例角色**：维护者（跑回归的人）。
- **前置条件**：需求 `sides` 不含 frontend；或 `artifacts` 为空（存量/直种需求）。
- **交互流程**：走既有最早的两条放行分支（`applies === false` / `isLegacy`）。
- **异常流**：无。
- **后置条件**：与本次改动无关的判定路径一个字节都没变。
- **完成标志**：既有用例全绿（`tests/plan-prototype-anchor-gate.test.ts` 的非 UI / 存量断言 + `tests/move-gate-paths.test.ts`）。

## UC-5 判据只此一处 `serves: FR-4`

- **用例角色**：后来实现者（准备再改这条门的人）。
- **前置条件**：读 `assertUiCardPrototypeAnchors` 的实现。
- **交互流程**：看到前置里只有 `prototypeExemptOf(...)` 与 `registeredPrototypesOf(...)` 两个调用。
- **异常流**：若有人手写 `frontmatter['prototype_exempt']` 判空 → 源码锚点断言变红（TC-10）。
- **后置条件**：豁免语义只有一处答案。
- **完成标志**：`grep -n "prototypeExemptOf(" src/application/internal/content-gate-wiring.ts` 命中且无第二处手写判据。

## 用例 ↔ 条款对照 `serves: FR-1`

| 条款 | 覆盖用例 |
|---|---|
| FR-1 | UC-1 |
| FR-2 | UC-2 |
| FR-3 | UC-3 |
| FR-4 | UC-5 |
| （回归）FR-1, FR-2 | UC-4 |

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 豁免的边界 | 豁免 = 交付物免检 | 豁免 = 不强制交，交了仍合格 | D-2 裁定；保住"有原型就得指向权威原型"这条质量线 |
| 未落章的处理 | 有理由即生效 | 必须 requirement 产物已落章 | 防止 agent 自己给自己发豁免（既有 presence 门的口径） |
| 目录里有骨架 | 当作"已交原型" | 不算（自动发现補登 ≠ 登记） | 与 presence 门同口径；避免"一份没人填的骨架"污染判定 |

## 技术方案与亮点 `serves: FR-1`

- **场景全部落在同一函数**：四个分支（跳过 / 未生效拒 / 有原型拒 / 非 UI 放行）都由 `assertUiCardPrototypeAnchors` 一处表达，实施者不需要跨文件推理（可核验指向：`tests/plan-prototype-anchor-gate.test.ts` 的 describe 块）。
