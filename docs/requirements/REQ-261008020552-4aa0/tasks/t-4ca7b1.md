# t-4ca7b1 task_move 描述结构减负 1265→≤630（U3）·复核

> 需求：REQ-261008020552-4aa0 reqboard 体检第六批激进精简与结构减负（21→19 + task_move/submit 瘦身）

## 在做什么
task_move 描述结构减负 1265→≤630（U3）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261008020552-4aa0/design/` 逐条核对；`npx vitest run tests/task-move-prompt-budget.test.ts tests/task-move-batch.test.ts tests/task-move-role.test.ts tests/subtask-budget.test.ts tests/chain-budget.test.ts tests/done-throttle-guidance.test.ts tests/done-throttle-message.test.ts tests/amend-acceptance.test.ts tests/legacy-compat-6749.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T19:22:15.097Z，窗口 session-b5a0dac9-3c67-4034-9638-dde9b50134e6）

U3 复核完成：diff 只含描述压缩与一处未用导入摘除，无偏离

### 完成项

- 逐行复核 TaskMoveTool diff：全部改动为描述字符串压缩 + 1 处未用导入摘除（MOVE_BATCH_DONE_MAX），无任何形状/逻辑/返回体改动
- 对照 design §5 映射表：description 每职能一句话 ✓；tasks/batchItemSchema 压短 ✓；budget 子字段压短 ✓；扁平四参保持 ✓（reason 的 LONG_TEXT_STYLE_NOTE 机械锁原样）
- 撤下细则之家核对：节流（throttleGuidance）、形状（readSubtaskBudgetArg 报错）、CAS（回执带当前窗口号）均在场且有门禁断言
- 与 HEAD 的 diff 中混杂的旧文本差异（如 ARG_NOTE→STYLE_NOTE）经辨认为前序批次未提交工作，本卡相对开工前工作树零行为变化
- 复核结论：**无偏离**（依据：上述逐项 + 16 文件 203 测试绿 + 门禁四条 + tsc 0 错）

### 下一步

测试子卡：全量回归 + 基线比对

---
