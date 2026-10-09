# t-03aeb3 给批量收尾加非子卡 done 上限 N=3·复核

> 需求：REQ-261008011118-defe 修复 reqboard 体检第五批中危 bug（M1 死字段/M3 批内节流/M4 两段写/M5 并发双跑）

## 在做什么
给批量收尾加非子卡 done 上限 N=3·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/REQ-261008011118-defe/design/` 逐条核对；`npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-07T17:40:00.778Z，窗口 session-9574f815-da99-4e7f-9089-19c7795e1ed1）

复核：对照设计 §BUG-2 逐条核对——无偏离（判定点/计数/拒绝形状/不改项/文案全部落位）

### 完成项

- 对照 design/fix-design.md §BUG-2 逐条核对：① 判定点在 gateOne（:694）且位于 done 凭证门（:666-686）之后、parentStarts 计数之前；② 计数条件 = to==='done' && role!=='subtask'（role 在 :616 由 roleOf 算出，早于判定，作用域正确）；③ 上限单点常量（:100 MOVE_BATCH_DONE_MAX = 3，文档/代码无第二份数字）；④ 拒绝形状 = rejectPlan + REQBOARD_BULK_CLOSE + throttleRemainingMs=60000，顶层 guidance 由既有装配产出（用例断言已覆盖）—— 结论：无偏离
- 不改的东西核对：DoneEvidenceSpec 本卡零触碰（工作树该文件的 diff 是前批 M6 clamp 在飞改动）；跨批节流/单卡路径/父子链收尾豁免/MOVE_BATCH_MAX 均未动（既有 3 条断言 + 27 用例全绿）
- 口径边界核对：GateContext 按**需求分组**创建（每需求每批一个 Map），故同名多需求同批时各需求各算 3 张；自动链 FINALIZE_PARENT 走 finalizeParent（不经 gateOne），不受上限影响
- 复核读数：npx vitest run tests/done-throttle-guidance.test.ts tests/task-move-batch.test.ts → 2 文件 / 27 用例全绿

### 下一步

回归阶段：跑批量/队列/契约邻域测试集（task-move-batch、t12 顺序契约、legacy-compat、error-code、output-contract）

---
