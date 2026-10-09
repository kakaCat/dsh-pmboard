# t-ecb91d 收编 note_interruption 为 task_amend(op=interruption) + 守卫 op 化（U2）·研发

> 需求：REQ-261008020552-4aa0 reqboard 体检第六批激进精简与结构减负（21→19 + task_move/submit 瘦身）

## 在做什么
收编 note_interruption 为 task_amend(op=interruption) + 守卫 op 化（U2）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/interruption-checkpoint.test.ts tests/interruption-dedupe.test.ts tests/arg-guidance.test.ts tests/task-amend-tool.test.ts` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T19:10:01.123Z，窗口 session-b5a0dac9-3c67-4034-9638-dde9b50134e6）

U2 研发完成：note_interruption 收编为 task_amend(op=interruption)，工具面 20→19；判据①零命中 ✓、判据③守卫分流行为测试绿 ✓；矩阵 82 过 / 3 红全为基线登记项（test-baseline.failures.txt:30-32，MoveRequirement checkpoint 面，别窗口在飞需求 REQ-261008011118-defe 的未提交改动所致，与本批零交集）

### 完成项

- TaskAmendTool.ts 扩 op=interruption：枚举 5 op/REQUIRED_OF[interruption]=[reason]/output 加 interruption 子 schema（平移）/分派 noteInterruption 回显 op
- 守卫按 op 分流：op=interruption 跳过 assertNoPendingConfirm（原工具无此前置），其余 op（含未知 op）维持先守卫后分派
- summary.ts 迁入 noteInterruptionSummary（逐字）为 op=interruption 分支；render-summaries.ts 删除迁出函数
- 删除 src/tools/NoteInterruptionTool/ 目录；registry −1 条（19 条）+ responseSources 加 NoteInterruption.ts；src/index.ts 与 tools/index.ts 摘除
- shared.ts 删 LONG_TEXT_STYLE_ONLY_FIELDS 的 note_interruption 行（task_amend.reason 条目语义覆盖）；StageActions.ts 删条目
- boundary-guard TASK_AMEND_OP_STAGES 加 interruption:undefined（对齐原表内 undefined 全阶段放行）
- D-3：NoteInterruption.ts 3 处 reject 前缀 + tool 留痕字面量改 'reqboard_task_amend'；protocol.ts:1363 / interruption.ts:145 注释改写
- README 删 note_interruption 行、task_amend 行改 5 op、计数 20→19（README×3 + package.json）
- 测试：interruption-checkpoint 壳层用例改打 defineTaskAmendTool（bp.tool 断言改新值）；arg-guidance 删映射；tools-schema 工厂清单 15→14；task-amend-tool 加 op=interruption 壳层用例 + 守卫分流行为测试（判据③）

### 改动文件

- `src/tools/TaskAmendTool/TaskAmendTool.ts`
- `src/tools/TaskAmendTool/prompt.ts`
- `src/tools/TaskAmendTool/summary.ts`
- `src/tools/render-summaries.ts`
- `src/tools/registry.ts`
- `src/tools/index.ts`
- `src/index.ts`
- `src/tools/shared.ts`
- `src/domain/stage/StageActions.ts`
- `src/application/dive/boundary-guard.ts`
- `src/application/use-cases/NoteInterruption.ts`
- `src/shared/protocol.ts`
- `src/application/internal/interruption.ts`
- `README.md`
- `package.json`
- `tests/interruption-checkpoint.test.ts`
- `tests/arg-guidance.test.ts`
- `tests/tools-schema.test.ts`
- `tests/task-amend-tool.test.ts`
- `src/tools/NoteInterruptionTool/（整目录删除）`

### 下一步

联调子卡：契约面与装配面复跑

---
