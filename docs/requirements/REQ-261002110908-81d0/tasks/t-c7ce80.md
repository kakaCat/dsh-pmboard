# t-c7ce80 同类长文本工具接入同一约定 + 遍历覆盖用例·测试

> 需求：REQ-261002110908-81d0 工具参数非法 JSON 致整轮失败：适配器容错 + 汇报短句约束

## 在做什么
同类长文本工具接入同一约定 + 遍历覆盖用例·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T04:07:28.323Z，窗口 session-be1bdc3d-1914-4fad-abc8-d7cacc5a7612）

测试段完成：覆盖用例与全量回归都跑过

### 完成项

- npx vitest run tests/arg-guidance.test.ts -t 覆盖 → 全绿
- npx vitest run 失败集合与基线逐一对齐

### 改动文件

- `src/tools/SubmitTool/SubmitTool.ts`
- `src/tools/AskConfirmTool/AskConfirmTool.ts`
- `src/tools/TaskMoveTool/TaskMoveTool.ts`
- `src/tools/CaptureTool/CaptureTool.ts`
- `src/tools/NoteInterruptionTool/NoteInterruptionTool.ts`
- `src/tools/AdoptTaskTool/TaskAdoptTool.ts`
- `src/tools/RegenerateTool/index.ts`
- `tests/arg-guidance.test.ts`

### 下一步

父卡可收尾

---
