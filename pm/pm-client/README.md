# pm-client

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

前端渲染层（自 src/client 整体搬入，140 文件）：看板、舞台面板、样式与令牌。

## 允许依赖（分层 `L2`）

pm-common · pm-core

## 边界

依赖 pm-common · pm-core；react 由宿主提供（外部依赖）。

## 测试

```bash
npx vitest run pm/pm-client/tests
```
