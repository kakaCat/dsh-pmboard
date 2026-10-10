# pmboard-workflow

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

工作流引擎适配：WorkflowEngineRunner 与 WorkflowSchemaAdapter。

## 允许依赖（分层 `L2`）

pmboard-common · pmboard-core

## 边界

依赖 pmboard-common · pmboard-core。

## 测试

```bash
npx vitest run packages/pmboard-workflow/tests
```
