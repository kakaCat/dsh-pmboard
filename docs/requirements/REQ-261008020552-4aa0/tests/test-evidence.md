# 测试证据（REQ-261008020552-4aa0）

> 采集时间：2026-10-08；口径：命令 + 输出摘要（可复跑）。基线文件：
> `docs/reviews/test-baseline.failures.txt`（68 条）；本批判据 = **失败集合差为空**（C-14）。

## 一、工具面与零命中 <!-- serves: FR-1, FR-2, FR-5 -->

| 命令 | 输出摘要 |
|------|---------|
| `grep -rn "reqboard_archive_amend\|reqboard_note_interruption\|ArchiveAmendTool\|NoteInterruptionTool\|defineArchiveAmendTool\|defineNoteInterruptionTool" src tests README.md` | exit 1（零命中） |
| `ls src/tools \| grep -c Tool` | 19 |
| `grep -c "^    key: '" src/tools/registry.ts` | 19 |
| `grep -c "19 个" package.json README.md` | package.json 1 / README 3 |
| `npx vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts tests/apply-wiring.test.ts tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts tests/tools-render-coverage.test.ts` | 32 passed（注册名单 = 19） |

## 二、体量终测（同口径脚本：`defineXTool(stub deps)` 后递归求和 description） <!-- serves: FR-3, FR-4 -->

| 对象 | 基线 | 交付 | 预算 | 结论 |
|------|------|------|------|------|
| task_move（description + parameters 描述） | 1265 | `141 + 450 = 591` | ≤ 630 | ✅ 降 53% |
| submit `tasks[]` 子树（tasks 自身描述 + items 子树） | 1717 | `75 + 657 = 732` | ≤ 860 | ✅ 降 57% |
| `SUBMIT_PROMPT` | 1289 | 1289（未动） | ≤ 1300 | ✅ 不破 |

## 三、行为锁与门禁矩阵 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 命令 | 输出摘要 |
|------|---------|
| `npx vitest run tests/archive-amend.test.ts tests/archive-reconcile-e2e.test.ts tests/task-amend-tool.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts tests/output-contract.test.ts` | 63 passed |
| `npx vitest run tests/interruption-checkpoint.test.ts tests/interruption-dedupe.test.ts tests/arg-guidance.test.ts tests/task-amend-tool.test.ts` | 82 passed / 3 failed（3 条 = 基线登记红 `test-baseline.failures.txt:30-32`） |
| `npx vitest run tests/task-move-prompt-budget.test.ts tests/task-move-batch.test.ts tests/task-move-role.test.ts tests/subtask-budget.test.ts tests/chain-budget.test.ts tests/done-throttle-guidance.test.ts tests/done-throttle-message.test.ts tests/amend-acceptance.test.ts tests/legacy-compat-6749.test.ts` | 100 passed |
| `npx vitest run tests/submit-tasks-schema-budget.test.ts` | 8 passed |
| plan 门禁矩阵 + submit 相关面（15 文件，含 plan-granularity / plan-depends-e2e / plan-footprint* / plan-prototype-anchor-gate / canceled-coverage-gate / dual-field） | 167 passed |
| 门禁矩阵 + submit 面 + 契约面（17 文件） | 254 passed |
| `npx vitest run tests/message-hygiene.test.ts`（棘轮读数） | tools 74→66、domain/Footprint 21→20、application 533 持平（**零上升**） |

## 四、全量闸（C-11~C-15） <!-- serves: FR-5 -->

| 命令 | 输出摘要 |
|------|---------|
| `pnpm test` | 7149 passed / 15 failed / 27 skipped（608 文件：9 failed / 596 passed / 3 skipped） |
| `pnpm baseline:check` | 「本次失败 15 条 · 基线 68 条」/「差集：**新增失败 0** / 不再失败 53」/ tsc 0 条 |
| `pnpm typecheck`（tsc --noEmit） | 退出码 0，error TS 0 |
| `pnpm kb:build` | INDEX / design-tokens「内容一致」零漂移；code-map.symbols.tsv 重生成 |
| `pnpm kb:check` | ❌ K1 INDEX 10977>8000、❌ K3 conventions 223>200、❌ K14 kb-0064/0065 —— **非本批引入**，见 `notes/known-debt.md`（用户裁定登记交还） |

## 五、覆盖标注（covers） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

> 五张父卡 = 五个回滚单元；每张父卡下 4 段子卡链（U5 为 2 段）。每行给出该卡对应测试。

covers: t-5ae432（U1 父卡：archive_amend 收编）
covers: t-a96f5a（U1 研发）/ t-d8bccc（U1 联调）/ t-9c589b（U1 复核）/ t-836de1（U1 测试）—— 见 §三 archive 与 task-amend 矩阵（63 passed）+ §一 零命中
covers: t-aa5503（U2 父卡：note_interruption 收编 + 守卫分流）
covers: t-ecb91d（U2 研发）/ t-85c2d1（U2 联调）/ t-31466b（U2 复核）/ t-513d54（U2 测试）—— 见 §三 interruption 矩阵与守卫分流行为测试
covers: t-6b550f（U3 父卡：task_move 描述减负）
covers: t-7bc987（U3 研发）/ t-5e80c2（U3 联调）/ t-4ca7b1（U3 复核）/ t-cac417（U3 测试）—— 见 §二 体量终测（591 ≤ 630）与 §三 task-move-prompt-budget + 行为锁八件
covers: t-9f79be（U4 父卡：submit tasks[] 描述下沉）
covers: t-ac655f（U4 研发）/ t-e67903（U4 联调）/ t-4718f1（U4 复核）/ t-d0f548（U4 测试）—— 见 §二 子树 732 ≤ 860 与 §三 submit-tasks-schema-budget + plan 门禁矩阵
covers: t-0f675d（U5 父卡：同步面收尾）
covers: t-c6f2dd（U5 研发）/ t-95f252（U5 复核）—— 见 §一 19 口径与计数命中、§四 kb:build 零漂移

## 六、有意不做 <!-- serves: FR-5 -->

| 项 | 理由 |
|----|------|
| `pnpm build`（dist/ 重建） | 第五批复盘先例：避免影响并行窗口；新工具面重载后生效 |
| `git commit` | 工作树 289+ 改动属多条需求；本批回滚单元以文件组为单位（见 known-debt.md §四） |
