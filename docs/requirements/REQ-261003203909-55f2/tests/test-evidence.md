# 测试证据 · REQ-261003203909-55f2

> 全部命令可复跑；原始输出在 `../evidence/`。

## 任务覆盖对照（covers）

| 任务 | 承接内容 | 覆盖它的测试 |
|---|---|---|
| t-e90451（t1 契约·父卡） | 四段登记 + 模板键 + 纯函数 | TC-1~TC-4（`tests/domain/subtask-template.test.ts` 22 用例）——covers: t-e90451 |
| t-dd2df0（t1·研发） | 枚举/模板/函数落地 | 同上（TC-1~TC-4）+ 反向演练 R-2——covers: t-dd2df0 |
| t-b30ccb（t1·复核） | 设计逐条核对 | 复核结论入 `tasks/t-b30ccb.md`；六表断言防回退——covers: t-b30ccb |
| t-b5f257（t1·测试） | 终态验收命令 | vitest 24/24 + tsc 基线（`../evidence/t7-tsc-count.txt`）——covers: t-b5f257 |
| t-8ee22c（t2 颜色） | 颜色族 +4 与用例 | `tests/card-types.integration.test.ts`（9 绿）+ `tests/integration/card-types.test.ts`（17 绿）+ R-2 演练——covers: t-8ee22c |
| t-aedabb（t3 接口） | schema/校验/落库 | TC-8/TC-9 五条（`tests/plan-mode.test.ts`）+ `tests/subtask-contract.test.ts` 8/8——covers: t-aedabb |
| t-e467da（t4 边界规则） | SCOPE_RULE 类型强制 + 规则 | TC-7 + 六表断言（`tests/execute-task.test.ts` 24/24）+ R-1 演练——covers: t-e467da |
| t-060df8（t5 manual 链行为） | awaiting-manual 分支 | TC-5/TC-6 五条（`tests/advance-manual-stage.test.ts`）——covers: t-060df8 |
| t-7a8e00（t6 规范） | C-19 条目 + fixtures | `pnpm run kb:check`（K10/K11 绿）+ `validate_eval_suite.py` PASS——covers: t-7a8e00 |
| t-723616（t7 总验收） | 验收电池 + 证据归档 | 本文件全部命令 + `../evidence/` 六份输出——covers: t-723616 |

## 验收电池（10 套件 129 用例 → 128 绿）

```bash
npx vitest run tests/domain/subtask-template.test.ts tests/subtask-template-acceptance.test.ts \
  tests/subtask-contract.test.ts tests/execute-task.test.ts tests/stage-colors.test.ts \
  tests/advance-manual-stage.test.ts tests/plan-mode.test.ts tests/lazy-expand.test.ts \
  tests/card-types.integration.test.ts tests/integration/card-types.test.ts
# → Test Files 1 failed | 9 passed (10)；Tests 1 failed | 128 passed (129)
# 唯一失败 = plan-mode「任务按计划逐项 done 后需求自动进验收」：task_move 回执
# requirement_status 为 undefined（rollup 回执形状）——与本需求零交集，开工前基线即红，
# 并发窗口在制（stash 对比法：摘除本需求全部改动后同套件失败集合相同）。
```
输出：`../evidence/t7-vitest-acceptance.txt`

## 类型检查

```bash
npx tsc --noEmit   # → 144 错误（文件行口径）≤ 会话起点基线 149；本需求全部触改文件零命中
```
输出：`../evidence/t7-tsc-count.txt`

## 端到端（UC-1：template 全链路）

```bash
npx vitest run tests/plan-mode.test.ts -t "TC-8" --reporter=verbose
# → ✓ template 一路落到队列卡：stages 为解析链 + template 冗余记录（UC-1）
npx vitest run tests/lazy-expand.test.ts   # → 17/17 绿（解析链 → 懒展开子卡链）
```
输出：`../evidence/t7-uc1-e2e.txt`、`../evidence/t7-lazy-expand-count.txt`

## 反向演练（登记强制真咬人）

- R-1：摘 `STAGE_SCOPE_RULE.e2e` → `tsc` 报 TS2741（`Property 'e2e' is missing`）→ `../evidence/r1-reverse-drill.txt`
- R-2：摘 `STAGE_TO_PHASE_COLOR.manual` → `tsc` 报 TS2741 → `../evidence/r2-reverse-drill.txt`
- 演练后均恢复（python 原位摘除/恢复，非 git checkout），恢复后套件复绿。

## manual 段链行为（TC-5/TC-6 · 5/5 绿）

```bash
npx vitest run tests/advance-manual-stage.test.ts
# TC-5 ① 停链 awaiting-manual + 清单落盘 + autoRun 不变 + 留痕齐 ② 幂等不重写清单
# TC-6 ① 骨架不改就汇报 → REQBOARD_SUBTASK_GATE 拒 ② 核对后更新 → 放行 ③ 非 manual 卡不受影响
```

## 知识层与测评套件

```bash
pnpm run kb:check      # → kb-probe 全部通过（11 项检查）；K7 零漂移
python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py   # → RESULT: PASS
```
输出：`../evidence/t7-kb-check.txt`
