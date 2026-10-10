# pmboard-eval-suite

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

资产包：评测套件（eval-suite/**）。

## 允许依赖（分层 `L3`）

（无：本包不得依赖任何 workspace 包）

## 边界

零 import（纯资产）。

## 测试

```bash
npx vitest run packages/pmboard-eval-suite/tests
```
