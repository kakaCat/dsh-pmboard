# T1 需求面判据复跑证据（REQ-261006211623-9dc1）

covers: t-fe268e, t-0170a5, t-b58f28, t-1e2ea1

> 本文件是任务卡 `t-fe268e`（复跑需求面三条判据并留反向演练证据）的交付物：
> 命令、读数、反向演练与一致性核对结论逐条落盘，供复核与验收直接引用。
> 采集日期 2026-10-06 · 采集窗口 session-b4188f2e · 卡覆盖条款 FR-1 / FR-3 / FR-4

## 1. 三条判据复跑（命令 + 读数）

```
$ npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts
 ✓ tests/clause-criteria.test.ts  (10 tests)
 ✓ tests/sides-declaration.test.ts (10 tests)
 ✓ tests/doc-quality-gate.test.ts  (11 tests)
 Test Files  3 passed (3) · Tests  31 passed (31)
```

- FR-1 条款判据软门禁：`tests/clause-criteria.test.ts` 10 例全绿（含「长条款块不假红」与「窗口是常量」）。
- FR-3 `sides` 硬门：`tests/sides-declaration.test.ts` 10 例全绿（含非法值 / 缺声明 / 空串 / 存量豁免 / 类型边界）。
- FR-4 失败与并发路径节：`tests/doc-quality-gate.test.ts` 11 例全绿（含 5 例走**真提交编排**的 e2e）。

## 2. 三条反向演练（逐条复现）

| # | 演练 | 命令 | 实测结果 |
|---|---|---|---|
| ① | 删掉条款判据锚点 | `npx vitest run tests/clause-criteria.test.ts -t "删掉判据"` → `2 passed`；另做**真文档副本**演练 | 副本原样缺口 0；把 FR-2 的判据删成一句形容词后 → 缺口变成 `FR-2`，提示原文点名该条款 |
| ② | 写 `sides: [doc]` | `npx vitest run tests/sides-declaration.test.ts -t "doc"` → `2 passed` | 拒，错误码 `requirement_sides_invalid`；混合写法 `[frontend, doc]` 同样拒 |
| ③ | 删「失败与并发路径」节 | `npx vitest run tests/doc-quality-gate.test.ts -t "缺|存量"` → `9 passed` | 新需求 → 拒 `requirement_section_missing`；**存量需求（createdAt 早于规则起点）放行**（不追溯） |

真文档副本演练的原始输出（①）：

```
① 原样：                 ← 无缺口
② 把 FR-2 的判据删成一句形容词后：FR-2
   提示：条款级判据缺口（不阻断提交）：1 条条款的定义行块内找不到可执行判据——FR-2…
```

> 附带确认：窗口由 12 行放宽到 40 行后，`REQ-261006123819-3af3` 的 FR-3 / FR-5 两处**假红消失**
> （原先它们的判据落在定义行 15 行之后，被 12 行上限误判成缺口）——这条修正是本卡复跑过程中发现的。

## 3. 设计 ↔ 实现一致性（28 项契约逐项命中）

对 `design/interfaces.md` §二 与 `design/data-model.md` 声明的函数、常量、字段与错误码逐项在 `src/**` 检索：

```
28 项全部命中（0 项缺失），抽样：
  clauseCriteriaGaps → src/application/internal/clause-criteria.ts
  sidesGateFailure / docSectionGateFailure → src/application/internal/content-gate-wiring.ts
  DOC_QUALITY_RULES_SINCE → src/domain/workflow/DocQualityRules.ts
  readPlanDocTaskTable → src/application/internal/plan-doc-table.ts
  depReasonsOf / REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED → src/shared/protocol.ts
  requirement_sides_invalid / requirement_section_missing / plan_doc_task_table_incomplete → artifact-gates 联合 + 门实现
  clause_criteria_warnings / plan_doc_warnings → SubmitTool 出参 schema + SubmitArtifact 接线
```

## 4. 结论与边界（如实登记）

- 三条判据在**源码与测试**层面均为真码真判，反向演练逐条可复现 ✓。
- **宿主生效性**：运行中的插件是本次会话启动时加载的那版；`pnpm build` 产物（`dist/index.mjs`）
  已含本批新码（`grep -c "requirement_sides_invalid" dist/index.mjs` > 0），但宿主需**重载插件**后
  新门才在会话里拦人。这一条由链尾卡 t5 统一核对并写进复核材料。
- 本卡未改动任何源码：卡的性质是「独立复跑 + 反向演练 + 留证据」，不是改写实现。

## 5. 全量读数（测试段收口 · 2026-10-06）

```
$ npx vitest run --reporter=json          # 全量
失败 71 条 · 基线 68 条 · 新增 11 · 不再失败 8
新增失败按文件：client-view 3 · error-code-inventory 2 · live-tasks-single-source 2 ·
artifact-openable 1 · canceled-legacy-read 1 · reqboard/settings-init 1 · typecheck 1
落在本批新增测试（clause-criteria / sides-declaration / doc-quality-gate / plan-doc-table / design-coord）上的失败：0 条

$ npx tsc --noEmit -p tsconfig.json
错误 3 条 · 基线 0 条（基线见 docs/reviews/test-baseline.md）
3 条全部落在并发窗口在制的测试文件：tests/query-docs-roots.test.ts、tests/report-degrade.test.ts（×2）
本批改动的文件：0 条类型错误
```

**归属与结论（如实登记，不粉饰）**：

- 本批新增测试 **0 条失败**；新增的 11 条与 3 条 tsc 错误**全部落在同工作树并发窗口在制的面**上
  （client 面板 / error-code 清单 / live-tasks 谓词 / docs 根解析 / report 降级面板），
  与本需求改动无交集（判读方法：失败用例集合差 + 逐文件归属）。
- **严格口径未满足**：`失败 71 > 基线 68`、`tsc 3 > 基线 0`。这不是本需求引入的，
  但按 C-14/C-15 的口径必须响亮报出，不能记成"通过"；链尾卡 t5 会在并发改动落地后重跑同一判据。
