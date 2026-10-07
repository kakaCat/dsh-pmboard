# T3 拆分面判据复跑证据（REQ-261006211623-9dc1）

covers: t-7ac50a, t-c73735, t-ae34e6, t-4c577b

> 任务卡 `t-7ac50a`（复跑拆分面判据并留反向演练证据）的交付物。
> 覆盖条款 FR-5 / FR-7 / FR-8 · 采集日期 2026-10-06

## 1. 四条判据复跑（命令 + 读数）

```
$ npx vitest run tests/clause-coverage-gate.test.ts tests/plan-depends-e2e.test.ts \
    tests/plan-doc-table.test.ts tests/plan-footprint-tool-schema.test.ts
 ✓ tests/clause-coverage-gate.test.ts      (14 tests)
 ✓ tests/plan-doc-table.test.ts            (10 tests)
 ✓ tests/plan-depends-e2e.test.ts          ( 8 tests)
 ✓ tests/plan-footprint-tool-schema.test.ts ( 8 tests)
 Test Files  4 passed (4) · Tests  40 passed (40)
```

## 2. 三条反向演练（逐条复现 + 断言行）

| # | 演练 | 命令 | 实测 |
|---|---|---|---|
| ① | 卡上不写 `requirement_refs`、只补计划文档覆盖对照表 | `npx vitest run tests/clause-coverage-gate.test.ts -t 文档` → `4 passed` | **仍被拒**：`gaps` 逐条点名 `FR-1`、`FR-4`、`FR-7`（`tests/clause-coverage-gate.test.ts:58/92/111`）；卡上写了 refs 才放行 |
| ② | `skipIntegration: true` 但缺理由 | `npx vitest run tests/plan-footprint-tool-schema.test.ts -t 理由` → `2 passed` | 拒：`REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`（`tests/plan-footprint-tool-schema.test.ts:121`） |
| ③ | 计划文档无任务表 / 表未覆盖 `tasks[].key`；以及缺列 | `npx vitest run tests/plan-doc-table.test.ts` → `10 passed` | 硬判拒 `plan_doc_task_table_incomplete` 且**零副作用**（`tests/plan-doc-table.test.ts:105/107`）；缺「验收标准」/「工作量」/「依赖」列**不拒**，只进 `plan_doc_warnings`（非空才出键） |

判据语义（写成一句可被反驳的话）：

- FR-5：条款覆盖门禁的 covered **只**来自卡上 `requirement_refs`；计划文档的覆盖对照表**不再是门禁依据**
  （演练① 就是"只补文档表"必须仍红）——文档表降级为人读汇总 + 存量回填通道。
- FR-7：跳联调是**减法**，必须给理由才能砍掉联调段；零交集依赖边无理由只进建议清单（不拒）。
- FR-8：批准人读的是**文档**、落库读的是**数组**；两者不一致时拒绝，避免"批了空文档、落了另一批卡"。

## 3. 设计 ↔ 实现一致性（拆分面契约抽样）

| 契约 | 实现落点 |
|---|---|
| `skipIntegrationReason` | `src/shared/protocol.ts`（字段 + 归一 + 硬拒）、`src/tools/SubmitTool/prompt.ts`（调用即见） |
| `dep_reasons` | `src/shared/protocol.ts`（三形态归一为 map）、`src/application/internal/plan-deps-check.ts` |
| `zeroOverlapDependencyWarnings` | `src/application/internal/plan-deps-check.ts` |
| `readPlanDocTaskTable` / `planDocUncoveredKeys` / `planDocColumnWarnings` | `src/application/internal/plan-doc-table.ts` |

`design/interfaces.md` §三/§四 的入参（`dep_reasons` 是**字符串数组**，map 会让 `defineSubmitTool` 抛
`JsonSchemaError`）与出参（`plan_doc_warnings` 非空才出键）与实现一致。

## 4. 结论与边界（如实登记）

- 拆分面四条判据在源码与测试层面均为真码真判，三条反向演练逐条可复现 ✓。
- **已验证范围**：`requirement_refs` 单口径、跳联调理由、零交集依赖语法理由、任务表硬/软判。
- **未覆盖（如实登记）**：`dep_reasons` 与 `skip_integration_reason` 这两个**新字段**在**运行中的宿主会话**
  里进不了 `tasks[]`（宿主插件是会话启动时加载的那版，参数校验按旧 schema 拒收）——`pnpm build`
  产物已含新码，重载插件后生效；链尾卡 t5 复核 `dist` 与宿主同代。
- 本卡未改动任何源码。
