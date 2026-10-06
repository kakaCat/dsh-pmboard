# t-44ede1 三处接线：让声明难度在每条注入路径上算数·测试

> 需求：REQ-261005154851-8512 声明难度在系统提示词注入路径没接线：expert/advanced 需求被注入轻档纪律

## 在做什么
三处接线：让声明难度在每条注入路径上算数·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T07:56:20.657Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这一步做完，声明档位这件事有 11 条用例盯着，四档映射与门禁套件都没被碰坏。

### 完成项

- vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）
- vitest run difficulty-mapping + content-gates + decision-gates → 78 passed / 2 skipped
- npx tsc --noEmit → 0 错误

### 改动文件

- `tests/injection-difficulty.test.ts`

---
