# pm-category-refactor

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

refactor 类型规格（同上形状）。

## 允许依赖（分层 `L0.5`）

pm-common · pm-category-kit

## 边界

只能依赖 pm-common 与 pm-category-kit。

## 测试

```bash
npx vitest run pm-category-refactor/tests
```

## 本类型规格一览

refactor 类型规格（同上形状）。

规格值来自 pm-category-kit 的契约；新增/修改类型只改本包 `src/index.ts` 一处。
