# 测试证据（REQ-261007220012-bd29）

> 命令 + 输出摘要逐条留档。执行环境：dsh-pmboard 工作树（HEAD c49fd5e + 本批改动 + 他条需求在飞改动），
> 2026-10-07 · 窗口 session-9a0e68f7。分批留痕另见 `../evidence/`（12 份阶段证据）。

## E-1 五处口径一致（FR-7） <!-- serves: FR-7 -->

```bash
grep -c "toolName: 'reqboard_" src/tools/registry.ts     # 21
find src/tools -maxdepth 1 -type d | grep -v '^src/tools$' | wc -l   # 21
grep -c 'toolsCtx.tools.register(' src/index.ts          # 21
grep -c '^| `reqboard_' README.md                        # 21
grep -c '21 个' package.json                             # 1
```

输出摘要：registry 21 / 磁盘目录 21 / register 21 / README 行 21 / package.json 含「21 个」。

## E-2 旧工具名零残留（FR-1~FR-5） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

```bash
grep -rl 'reqboard_task_execute|reqboard_confirm_receipt|reqboard_run_status|reqboard_task_status|
reqboard_task_refs|reqboard_task_adopt|reqboard_task_regenerate|TaskExecuteTool|ConfirmReceiptTool|
RunStatusTool|TaskStatusTool|TaskRefsTool|AdoptTaskTool|RegenerateTool|AdvanceTool' src/ | wc -l
```

输出摘要：`0`（含注释口径）。唯一豁免：`tests/fixtures/read-sites-v8-ledger.json`
（带 `__provenance` 的 v8 台账历史快照，改动它会伪造历史数据）。

## E-3 契约矩阵（FR-1~FR-7） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

```bash
npx vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts \
  tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts \
  tests/tools-schema.test.ts tests/arg-guidance.test.ts tests/error-code-matrix.test.ts
```

输出摘要：`Test Files 9 passed (9) / Tests 150 passed (150)`，exit 0。

## E-4 分批定向（各 FR 的可证伪判据） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

| 批 | 命令 | 输出摘要 |
|----|------|----------|
| S1 | `vitest run tools-dispatch apply-wiring tools-render-coverage task-run-contract` | 4 files / 20 tests passed |
| S2 | `vitest run ask-confirm-pending ask-confirm-blocking confirm-pending-guard output-contract` | 4 files / 65 tests passed |
| S3 | `vitest run run-status-tool task-status-integration task-status-ledger task-tree` | 4 files / 20 tests passed |
| S4 | `vitest run task-amend-tool adopt-task regenerate-chain backfill-task-refs apply-wiring registry-log output-contract tools-dispatch` | 8 files / 79 tests passed |
| S5 | `vitest run tools-dispatch output-contract apply-wiring task-run-contract` | 4 files / 53 tests passed |
| S6 | `vitest run open-window-tool handoff open-window-inherit` | 2 passed / 1 failed（handoff 2 例为 S1 基线既有依赖门红） |

## E-5 类型检查 <!-- serves: FR-1~FR-7 -->

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -cE "error TS"
```

输出摘要：`0`。

## E-6 全量回归（行为等价第二层） <!-- serves: FR-1~FR-7 -->

```bash
pnpm test
```

输出摘要（终值）：

```
Test Files  38 failed | 552 passed | 3 skipped (593)
Tests       68 failed | 6948 passed | 22 skipped (7038)
```

**差分口径**：本需求六个批次逐批与上一批做失败文件集合差分，**新增红 0**；
38 个失败文件全部为既存红（其它在飞需求：design-registration / layer-boundary / handoff
依赖门 / size-budget / zero-arg-binding 等）或既存 flaky（`canceled-legacy-read`、`settings-init`，
隔离复跑分别 15/15、17/17 通过）。**失败文件 ∩ 本需求触碰的测试文件 = 空集**（每批证据各有一条读数）。

## E-7 证据与回滚 <!-- serves: FR-1~FR-7 -->

- 阶段证据 12 份：`../evidence/`（S1 4 份 / S2 4 份 / S3 4 份，另 `t-084edc-s5.md`、`t-06c363-s6.md`、`t-34ec16-fr7.md`）。
- 回滚：每批独立文件集，`git checkout -- <file>` / `git restore` 单批文件即回滚；
  删除目录可由 HEAD（`git checkout HEAD -- src/tools/<X>Tool`）恢复；数据侧零补偿
  （见 `../design/data-model.md`）。

## 覆盖清单（covers：任务卡 ↔ 测试留痕）

> 每张任务卡（7 张父卡 + 26 张子卡）的验证来源：父卡看本批定向判据，子卡看各阶段证据文档
> （`../evidence/`）与复跑命令。逐卡标注如下。

### 父卡（各卡的 FR 判据见 §E-4 与本批定向命令）

covers: t-c21292
covers: t-38c7cd
covers: t-856177
covers: t-ef2395
covers: t-084edc
covers: t-06c363
covers: t-34ec16

### S1 子卡（证据 ../evidence/t-2727b0-dev.md / t-6bf013-integrate.md / t-0e87d2-review.md / t-b603b6-test.md）

covers: t-2727b0
covers: t-6bf013
covers: t-0e87d2
covers: t-b603b6

### S2 子卡（证据 ../evidence/t-14c8be-dev.md / t-2d1abf-integrate.md / t-5ad80b-review.md / t-b65d24-test.md）

covers: t-14c8be
covers: t-2d1abf
covers: t-5ad80b
covers: t-b65d24

### S3 子卡（证据 ../evidence/t-5251be-dev.md / t-b96bc1-integrate.md / t-38f407-review.md / t-7bb731-test.md）

covers: t-5251be
covers: t-b96bc1
covers: t-38f407
covers: t-7bb731

### S4 子卡（证据 ../evidence/t-b24703-dev.md / t-9e29b1-integrate.md / t-795d16-review.md / t-e7d151-test.md）

covers: t-b24703
covers: t-9e29b1
covers: t-795d16
covers: t-e7d151

### S5 子卡（证据 ../evidence/t-084edc-s5.md）

covers: t-10e826
covers: t-214c00
covers: t-c14abb
covers: t-92324a

### S6 子卡（证据 ../evidence/t-06c363-s6.md）

covers: t-92b152
covers: t-c170f8
covers: t-b46944
covers: t-f35be1

### t7 子卡（证据 ../evidence/t-34ec16-fr7.md）

covers: t-1bc4c0
covers: t-0a592d
