# pmboard-scripts

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

脚本资产包：预留位（`scripts/` 现仍在仓库根；本包为 t2 建骨架时按设计预留）。

## 允许依赖（分层 `L3`）

（无：本包不得依赖任何 workspace 包）

## 边界

零 import（资产包）。

## 测试

```bash
npx vitest run packages/pmboard-scripts/tests
```
