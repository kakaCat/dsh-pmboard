# t-cc4e2b 同类长文本工具接入同一约定 + 遍历覆盖用例·研发

> 需求：REQ-261002115204-ba52 长文本工具参数写法约定：防整轮失败的入参约束

## 在做什么
同类长文本工具接入同一约定 + 遍历覆盖用例·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T03:56:17.231Z，窗口 session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5）

这一步做完，「要写一段中文」的工具全部统一了口径——提交材料、弹框问题、改卡理由、立项摘要、断点原因这些字段都引用同一份写法约定，不再是各写各的；并且有一张清单加一条遍历用例盯着，将来新增同类字段漏接约定会被当场点出来。

### 完成项

- 7 个同类工具的长文本字段说明接入同一约定：SubmitTool（summary / evidence / change_note）、AskConfirmTool（question / evidence）、TaskMoveTool（reason / acceptance）、CaptureTool（summary / reason）、NoteInterruptionTool（reason）、TaskAdoptTool（reason）、RegenerateTool（reason）
- 各工具模块头补 provenance 说明，与 shared.ts 常量出处口径一致（只动注释，不动 schema）
- 遍历覆盖用例：npx vitest run tests/arg-guidance.test.ts -t 覆盖 → 2 passed（清单 15 条零缺项）
- 反向证伪用例：-t 反向 → 2 passed（未接约定的字段必被判缺）
- 全文件复跑：10 passed

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/AskConfirmTool/AskConfirmTool.ts`
- `src/tools/TaskMoveTool/TaskMoveTool.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/NoteInterruptionTool/NoteInterruptionTool.ts`
- `src/tools/AdoptTaskTool/TaskAdoptTool.ts`
- `src/tools/RegenerateTool/index.ts`

### 下一步

交复核段核对覆盖面与 schema 零变更，然后收 t3 父卡。

---
