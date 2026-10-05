# t-80be1b 同类长文本工具接入同一约定 + 遍历覆盖用例·复核

> 需求：REQ-261002115204-ba52 长文本工具参数写法约定：防整轮失败的入参约束

## 在做什么
同类长文本工具接入同一约定 + 遍历覆盖用例·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T03:56:40.217Z，窗口 session-06ef20c5-9734-4ee9-b9b2-348ed3a652a5）

复核结论：覆盖面与设计一致、无偏离；并且实测证明这条覆盖不是走过场——只要有一个字段漏接约定，用例就会红并直接点名到「哪个工具的哪个字段缺哪条锚点」。7 个工具本段只动了模块头注释，参数结构未变。

### 完成项

- 对照 design/interfaces.md §2 覆盖清单逐项核对：15 条「工具.字段」全部命中三锚点——无偏离
- 实测证伪：把 reqboard_task_regenerate.reason 的约定短语摘掉 → TC-2 转红并点名「reqboard_task_regenerate.reason（缺 短句上限/「」代引号/拆多次调用）」；还原后 10 passed
- schema 零变更抽查：7 个工具文件本段只加模块头注释（provenance），参数 description 之外无任何结构性改动
- 覆盖/反向用例证据：-t 覆盖 → 2 passed；-t 反向 → 2 passed；全文件 10 passed

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/AskConfirmTool/AskConfirmTool.ts`
- `src/tools/TaskMoveTool/TaskMoveTool.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/NoteInterruptionTool/NoteInterruptionTool.ts`
- `src/tools/AdoptTaskTool/TaskAdoptTool.ts`
- `src/tools/RegenerateTool/index.ts`

### 下一步

父卡 t3 收尾；接着做 t4（实施片段 + C-16/C-17）。

---
