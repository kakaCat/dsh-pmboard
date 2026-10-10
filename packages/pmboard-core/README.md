# pmboard-core

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

领域与用例层：domain（状态机与判定）、application（用例与内部装配）、repositories、dive-core；含类型注册表的消费端口。

## 允许依赖（分层 `L1`）

pmboard-common · reqboard-rtm · pmboard-type-kit

## 边界

依赖 pmboard-common · reqboard-rtm · pmboard-type-kit；不得反向依赖工具层、回合驱动、工作流、客户端与命令面。

## 测试

```bash
npx vitest run packages/pmboard-core/tests
```
