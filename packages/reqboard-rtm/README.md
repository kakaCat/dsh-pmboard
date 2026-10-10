# reqboard-rtm

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

RTM 引擎（自 vendor/reqboard 整体搬入，内容零改动）：需求追溯矩阵的生成与纯文件读写引擎。

## 允许依赖（分层 `L0`）

（无：本包不得依赖任何 workspace 包）

## 边界

零 workspace 依赖（L0）；引擎内部保持搬入时原样，不反向依赖上层。

## 测试

```bash
npx vitest run packages/reqboard-rtm/tests
```
