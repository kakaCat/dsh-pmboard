# t-ffa854 全量回归与反向演练证据（回归测试卡）·研发

> 需求：REQ-261003204143-3219 修复 reqboard_capture 弹框答案契约：answers.workspace 未声明导致立项必炸

## 在做什么
全量回归与反向演练证据（回归测试卡）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T14:06:03.548Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

研发段完成：修订口径的四文件套件 95 tests 全绿；唯一相关红归属他窗在制；全量回归零新增失败

### 完成项

- 四文件套件全绿：capture-output-contract + capture-tool + tools-schema + capture-hook = 95 tests passed（4 文件）
- capture.test.ts 红（1 条）归属并行窗口 REQ-261003204149-1e80 在制改动，非本需求引入
- git diff --stat：capture-mapping.ts 与 CaptureTool.ts 两文件改动（含历史累计），本需求增量 = 共享常量+类型派生+生成式 properties
- pnpm test 全量 98 failed 与说明书基线一致，零新增

### 改动文件

- `docs/requirements/REQ-261003204143-3219/tasks/t-ffa854.md`

### 下一步

复核段（t-577017）核对证据完整性

---
