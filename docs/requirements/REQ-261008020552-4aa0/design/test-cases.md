---
doc: test-cases
requirement_id: REQ-261008020552-4aa0
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 测试用例：收编等价 + 减负双向判据

> 每条 TC 都是可跑命令 + 明确读数；RV 为反向证伪（防「判据空转 / 减过头」）。

## 用例表 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 编号 | 覆盖 | 命令 | 通过读数 |
|------|------|------|---------|
| TC-1 | FR-1 | `grep -rn "reqboard_archive_amend\|ArchiveAmendTool\|defineArchiveAmendTool" src tests README.md` | exit 1（零命中） |
| TC-2 | FR-1 | `npx vitest run tests/archive-amend.test.ts tests/archive-reconcile-e2e.test.ts tests/task-amend-tool.test.ts` | 全绿；e2e 含 `op=archive` 回显与 `success=true` 断言 |
| TC-3 | FR-2 | `grep -rn "reqboard_note_interruption\|NoteInterruptionTool\|defineNoteInterruptionTool" src tests README.md` | exit 1（零命中） |
| TC-4 | FR-2 | `npx vitest run tests/interruption-checkpoint.test.ts tests/interruption-dedupe.test.ts tests/arg-guidance.test.ts tests/task-amend-tool.test.ts` | 除 3 条基线登记红（test-baseline.failures.txt:30-32）外全绿 |
| TC-5 | FR-2 | `npx vitest run tests/task-amend-tool.test.ts -t 守卫按 op 分流` | 挂起确认期间 `op=interruption` → `success=true`；`op=refs` → `REQBOARD_CONFIRM_PENDING` |
| TC-6 | FR-3 | 体量脚本（`defineTaskMoveTool(stub deps)` 递归求和 description） | `141 + 450 = 591 ≤ 630`（基线 1265） |
| TC-7 | FR-3 | `npx vitest run tests/task-move-prompt-budget.test.ts` | 4 条全绿（体量 + 三条细则之家） |
| TC-8 | FR-3 | `npx vitest run tests/task-move-batch.test.ts tests/task-move-role.test.ts tests/subtask-budget.test.ts tests/chain-budget.test.ts tests/done-throttle-guidance.test.ts tests/done-throttle-message.test.ts tests/amend-acceptance.test.ts tests/legacy-compat-6749.test.ts` | 100 passed（行为锁） |
| TC-9 | FR-4 | 体量脚本（tasks[] 子树 = tasks 自身描述 + items 子树） | `75 + 657 = 732 ≤ 860`（基线 1717）；`SUBMIT_PROMPT=1289 ≤ 1300` |
| TC-10 | FR-4 | `npx vitest run tests/submit-tasks-schema-budget.test.ts` | 8 passed（体量 + 六条细则之家 + 形状不变式） |
| TC-11 | FR-4 | `npx vitest run tests/plan-granularity.test.ts tests/plan-depends-e2e.test.ts tests/plan-footprint-tool-schema.test.ts tests/plan-prototype-anchor-gate.test.ts tests/canceled-coverage-gate.test.ts tests/dual-field.test.ts tests/plan-footprint.test.ts` | 全绿（REQBOARD_TESTING_COVERAGE_GATE 等契约不受影响） |
| TC-12 | FR-5 | `npx vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts` | 全绿；注册名单 = 19 |
| TC-13 | FR-5 | `grep -c "19 个" package.json README.md` | package.json 1、README 3 |
| TC-14 | 全批 | `pnpm test` + `pnpm baseline:check` | 新增失败 **0**（15 条失败全在基线 68 条内） |
| TC-15 | 全批 | `pnpm typecheck`（tsc --noEmit） | 退出码 0、error TS 0 |
| TC-16 | 全批 | `pnpm kb:build`（生成物漂移） | INDEX/tokens「内容一致」零漂移 |

## 反向证伪（RV） <!-- serves: FR-3, FR-4 -->

| 编号 | 证伪目标 | 做法 | 期望 |
|------|---------|------|------|
| RV-1 | 减过头（细则从 schema 删了、回执里也没有） | `tests/task-move-prompt-budget.test.ts` 三条之家：调 `throttleGuidance` / `readSubtaskBudgetArg` 真实函数取 message | 缺任一句即红 |
| RV-2 | 减过头（submit 侧） | `tests/submit-tasks-schema-budget.test.ts` 六条之家：调 `zeroOverlapDependencyWarnings` / `assertGranularityGates` / `normalizeFootprint`+`assertFootprintFloor` / `normalizePlanTasks` / `assertClauseCoverageGate` / `validateTemplateRef`+`validateExplicitStages` | 缺任一条即红 |
| RV-3 | 没减够（描述长回去） | 两道预算门禁的字符上限断言 | 超 630 / 860 即红 |
| RV-4 | 形状悄悄改了 | 门禁的形状不变式（参数键集、双拼对、`additionalProperties:false`、footprint 三键） | 任一变化即红 |
| RV-5 | 合并遗漏面 | I-1~I-3 不变量（目录集合 / 注册名集合 / 工厂扫描） | 漏改任一面即红 |
| RV-6 | 消息卫生棘轮 | `npx vitest run tests/message-hygiene.test.ts` | 本批各层拼接计数相对开工前**零上升**（tools 74→66、domain/Footprint 21→20、application 533 持平） |

## 已知红（非本批，登记交还）

| 项 | 读数 | 出处 |
|----|------|------|
| `pnpm test` 15 条失败 | 全在基线 68 条内 | `docs/reviews/test-baseline.failures.txt` |
| `pnpm baseline:check` 差集 | 新增失败 0 / 不再失败 53 | 前五批未落账修复 |
| `pnpm kb:check` K1/K3/K14 | INDEX 10977>8000、conventions 223>200、kb-0064/0065 | `notes/known-debt.md` |
