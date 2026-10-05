# t-ef2c27 验收裁决收口：两问一批 + 去占位 + 系统项必处置·复核

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
验收裁决收口：两问一批 + 去占位 + 系统项必处置·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

对照 docs/requirements/REQ-261001154450-b918/design/ 逐条核对；npx vitest run tests/accept-sheet-tool.test.ts → 全绿

## 汇报 1（2026-10-01T08:52:18.472Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

复核完成：对照设计无偏离——通过三态判定、系统项拒绝、兼容回退三处均有用例覆盖；老调用方（看板/HTTP）读取路径不变。

### 完成项

- 复核完成：对照设计无偏离——通过三态判定、系统项拒绝、兼容回退三处均有用例覆盖；老调用方（看板/HTTP）读取路径不变。

### 改动文件

- `src/application/use-cases/AcceptSheet.ts`
- `src/domain/workflow/AcceptanceSheetSpec.ts`
- `src/domain/workflow/VerificationDoc.ts`
- `src/domain/errors.ts`
- `tests/accept-sheet-tool.test.ts`

---
