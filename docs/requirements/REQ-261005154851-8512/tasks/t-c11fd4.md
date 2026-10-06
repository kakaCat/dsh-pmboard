# t-c11fd4 探针与实机留痕取证·测试

> 需求：REQ-261005154851-8512 声明难度在系统提示词注入路径没接线：expert/advanced 需求被注入轻档纪律

## 在做什么
探针与实机留痕取证·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-05T07:57:24.314Z，窗口 session-30c79856-639c-4483-aed3-a49d3fc99546）

这一步做完，探针、类型、构建、回归四件都有可复核读数。

### 完成项

- npx tsx scripts/injection-difficulty-probe.mts → exit 0
- npx tsc --noEmit → 0 错误；pnpm build → 退出码 0（verify-client OK）
- vitest 四个相关套件 → 78 passed / 2 skipped

### 改动文件

- `docs/requirements/REQ-261005154851-8512/evidence/injection-difficulty.md`

---
