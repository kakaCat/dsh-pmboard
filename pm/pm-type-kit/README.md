# pm-type-kit

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

类型层契约：RequirementTypeSpec 与注册表 createTypeRegistry（构建即校验，缺字段即抛，绝不静默兜底）。

## 允许依赖（分层 `L0.5`）

pm-common

## 边界

只能依赖 pm-common。

## 测试

```bash
npx vitest run pm/pm-type-kit/tests
```
