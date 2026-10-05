# t-91cdd0 开窗落回源项目（适配器 + 两个用例调用点）·测试

> 需求：REQ-261004150249-731e 交接owner是什么意思

## 在做什么
开窗落回源项目（适配器 + 两个用例调用点）·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-04T07:51:41.772Z，窗口 session-7503b8bb-43bf-45d8-b7c4-dcb7e73d5561）

测试段：落点解析与开窗验收全绿（新用例 6 条 + 既有开窗契约 7 条）。

### 完成项

- npx vitest run tests/open-window-project-root.test.ts → 6 passed
- npx vitest run tests/open-window-tool.test.ts → 7 passed
- npx tsc --noEmit → 本卡文件零错误

### 改动文件

- `tests/open-window-project-root.test.ts`

### 下一步

父卡收尾

---
