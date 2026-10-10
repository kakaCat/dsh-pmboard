# pmboard-round-driver

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

回合驱动（dive 劈两半的驱动面）：驱动循环与回合状态推进。

## 允许依赖（分层 `L2`）

pmboard-common · pmboard-core

## 边界

依赖 pmboard-common · pmboard-core。

## 测试

```bash
npx vitest run packages/pmboard-round-driver/tests
```
