# pm-type-doc

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

doc 类型规格（同上形状）。

## 允许依赖（分层 `L0.5`）

pm-common · pm-type-kit

## 边界

只能依赖 pm-common 与 pm-type-kit。

## 测试

```bash
npx vitest run pm/pm-type-doc/tests
```

## 本类型规格一览

doc 类型规格（同上形状）。

规格值来自 pm-type-kit 的契约；新增/修改类型只改本包 `src/index.ts` 一处。
