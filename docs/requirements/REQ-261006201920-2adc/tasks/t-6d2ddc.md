# t-6d2ddc 域层契约：占位符判据与声明式回填器·研发

> 需求：REQ-261006201920-2adc 让验收不再形式合规：堵住占位符验收与空事实裁决

## 在做什么
域层契约：占位符判据与声明式回填器·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T12:37:33.859Z，窗口 session-e3d59f51-cb6c-463b-9a13-9ddf9325067a）

研发段交付：占位符判据与声明式回填器已落盘，目标命令 37 例全绿，改动面 214 行（3 改 1 新）。

### 完成项

- 目标命令全绿：npx vitest run tests/acceptance-placeholder.test.ts tests/domain/subtask-template.test.ts → 2 files / 37 tests passed，exit 0
- git diff --stat 摘要：Acceptability.ts +38、SubtaskTemplate.ts +111、subtask-template.test.ts +65，合计 214 行新增；新增未跟踪文件 tests/acceptance-placeholder.test.ts
- 占位符判据落点唯一：PLACEHOLDER_OPERAND 常量 + checkAcceptance 分支（空话 → 占位符 → 无锚点）
- 回填器落点唯一：ACCEPTANCE_PLACEHOLDERS 闭集 + unknownPlaceholders + fillStageAcceptance（纯函数，产物自检零残留）
- 本卡子卡验收标准自身就带 <本卡改动涉及的测试文件> 占位符——实测复现了本需求要修的形态（t2 修）

### 改动文件

- `src/domain/task/Acceptability.ts`
- `src/domain/task/SubtaskTemplate.ts`
- `tests/acceptance-placeholder.test.ts`
- `tests/domain/subtask-template.test.ts`

### 下一步

进入 t1 联调段：核对域层导出签名与 design/interfaces.md 是否逐字一致

---
