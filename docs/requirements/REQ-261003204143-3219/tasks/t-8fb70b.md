# t-8fb70b 落地 answers 键共享常量并核对 schema 声明（修复卡）·复核

> 需求：REQ-261003204143-3219 修复 reqboard_capture 弹框答案契约：answers.workspace 未声明导致立项必炸

## 在做什么
落地 answers 键共享常量并核对 schema 声明（修复卡）·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-03T14:01:03.703Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

复核通过、无偏离：FR-3 三处改动与设计逐条相符，边界守住了（未碰并行窗口在制的 SubmitTool/RESPONSE_SOURCES/五问逻辑），相关测试 64 全绿

### 完成项

- 对照 design/design.md「FR-3 三处改动表」逐条核对：常量导出/类型派生/生成式 properties/键集断言，四项与设计逐字相符
- 对照边界核对：未碰 SubmitTool.auto_confirm、未碰 RESPONSE_SOURCES、未改弹框五问逻辑——diff 仅含设计声明的三文件
- 复跑 npx vitest run tests/capture-output-contract.test.ts tests/capture-tool.test.ts tests/tools-schema.test.ts → 64 tests 全绿
- 无偏离声明：改动范围、锚点保留、反向演练口径均与设计一致

### 改动文件

- `docs/requirements/REQ-261003204143-3219/tasks/t-8fb70b.md`

### 下一步

回归段（t-a71498）：三文件套件已绿，证据汇总进 t3 回归测试卡

---
