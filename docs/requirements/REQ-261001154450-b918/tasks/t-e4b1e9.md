# t-e4b1e9 验收裁决收口：两问一批 + 去占位 + 系统项必处置·联调

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
验收裁决收口：两问一批 + 去占位 + 系统项必处置·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/accept-sheet-tool.test.ts → 全绿（接口/契约路径）。对无接口的卡：同文件用例覆盖输入输出与错误语义

## 汇报 1（2026-10-01T08:52:18.258Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

联调完成：第二问缺失时回退取裁决问的自定义输入（兼容本机「选项或自定义二选一」的单问回执）；第二问 header 带 PM 标志；验收文档新增「◻ 未复核（未附实际结果）」状态标签。

### 完成项

- 联调完成：第二问缺失时回退取裁决问的自定义输入（兼容本机「选项或自定义二选一」的单问回执）；第二问 header 带 PM 标志；验收文档新增「◻ 未复核（未附实际结果）」状态标签。

### 改动文件

- `src/application/use-cases/AcceptSheet.ts`
- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/domain/workflow/VerificationDoc.ts`
- `src/domain/errors.ts`
- `tests/accept-sheet-tool.test.ts`

---
