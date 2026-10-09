# 测试证据（REQ-261007193530-3133）

> 命令 + 输出摘要逐条留档。执行环境：dsh-pmboard 工作树（HEAD c49fd5e + 本批 9 文件改动），2026-10-07。

## E-1 本批四组回归用例 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```bash
npx vitest run tests/ask-confirm.test.ts tests/http-task-move-role.test.ts \
  tests/domain/requirement-status.test.ts tests/done-throttle-guidance.test.ts
```

输出摘要：

```
 ✓ tests/ask-confirm.test.ts                      (13 tests)
 ✓ tests/http-task-move-role.test.ts              (4 tests)
 ✓ tests/domain/requirement-status.test.ts        (10 tests)
 ✓ tests/done-throttle-guidance.test.ts           (9 tests)
 Test Files  4 passed (4)
      Tests  36 passed (36)
```

## E-2 反证（回退修复即红） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 操作 | 命令 | 输出摘要 |
|------|------|---------|
| FR-1 还原为 `user_feedback: undefined` | `npx vitest run tests/ask-confirm.test.ts` | `1 failed | 12 passed`（否定+空反馈用例红） |
| FR-2 移除 `role: roleOfTask(task, tasks)` | `npx vitest run tests/http-task-move-role.test.ts` | `3 failed | 1 passed`（子卡非法态被放行） |
| FR-4 还原 `left = throttleMs - (now - h.at)` | `npx vitest run tests/done-throttle-guidance.test.ts` | `1 failed | 8 passed`（90000 > 60000） |
| 恢复全部修复 | 同 E-1 | 36 passed（见 E-1） |

## E-3 类型检查 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```bash
npx tsc --noEmit -p tsconfig.json
# exit=0 · error TS 0 条
```

## E-4 改动盘点 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```bash
git status --porcelain -- src tests
```

```
 M src/application/internal/task-transition.ts     ← FR-2 roleOfTask 单源
 M src/application/use-cases/AskConfirm.ts         ← FR-1 条件展开
 M src/domain/requirement/RequirementStatus.ts     ← FR-3 canceled>draft
 M src/domain/workflow/DoneEvidenceSpec.ts         ← FR-4 clamp
 M src/http/routers/tasks.ts                       ← FR-2 传 role
 M tests/ask-confirm.test.ts                       ← FR-1 用例
 M tests/domain/requirement-status.test.ts         ← FR-3 用例
 M tests/done-throttle-guidance.test.ts            ← FR-4 用例
?? tests/http-task-move-role.test.ts               ← FR-2 新建用例
```

= 5 源码 + 4 测试，与设计文档「文件结构」表逐条一致，无表外改动。

## E-5 全量测试与基线归因 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```bash
pnpm test            # Test Files 39 failed | 548 passed | 3 skipped；Tests 69 failed | 6942 passed
pnpm baseline:check  # [差集] 新增失败 10 / 不再失败 9；真新增集中在 artifact-openable / canceled-legacy-read /
                     # client-view / kb-generate / kb-invalidation / kb-operations / live-tasks-single-source
```

归因抽验（撤掉本批全部改动）：

```bash
git stash push -u -- src tests
npx vitest run tests/artifact-openable.test.ts tests/canceled-legacy-read.test.ts tests/client-view.test.ts \
  tests/kb-generate.test.ts tests/kb-invalidation.test.ts tests/kb-operations.test.ts tests/live-tasks-single-source.test.ts
# Test Files 6 failed | 1 passed；Tests 9 failed | 134 passed
git stash pop
```

结论：这批失败在**不含本批改动**的 HEAD 上同样失败，且失败点位于本批未触碰的文件 ⇒
非本批引入，属基线文件陈旧（建议由对应负责人 `--refresh` 处置）。

## E-6 任务覆盖标注（covers） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

每张任务卡由哪条证据覆盖（覆盖 = 有可复核命令/读数，而非"做过"）：

**FR-1 链 → E-1 / E-2（tests/ask-confirm.test.ts）**

- covers: t-876170
- covers: t-6fb120
- covers: t-809d15
- covers: t-695159
- covers: t-6a5410

**FR-2 链 → E-1 / E-2（tests/http-task-move-role.test.ts）**

- covers: t-b6ca79
- covers: t-b5037d
- covers: t-ad3a7b
- covers: t-004546
- covers: t-49f561

**FR-3 链 → E-1（tests/domain/requirement-status.test.ts）**

- covers: t-db8f7a
- covers: t-08a7b8
- covers: t-7a5a29
- covers: t-7e524f
- covers: t-d158f0

**FR-4 链 → E-1 / E-2（tests/done-throttle-guidance.test.ts）**

- covers: t-a5ca0d
- covers: t-22315b
- covers: t-b8ef70
- covers: t-e5540a
- covers: t-dab9cc

**总验收链 → E-3（typecheck）/ E-4（diff 盘点）**

- covers: t-68c6fb
- covers: t-601a53

## E-7 grep 判据 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```
src/application/use-cases/AskConfirm.ts:452   ...(userFeedback.length > 0 ? { user_feedback: userFeedback } : {}),
src/http/routers/tasks.ts:137                 role: roleOfTask(task, tasks),
src/application/internal/task-transition.ts:33 export function roleOfTask(task: TaskRecord, tasks: readonly TaskRecord[]): TaskRole
src/domain/requirement/RequirementStatus.ts:130  'canceled>draft',
src/domain/workflow/DoneEvidenceSpec.ts:81    const left = Math.max(0, Math.min(throttleMs, throttleMs - (now - h.at)))
```
