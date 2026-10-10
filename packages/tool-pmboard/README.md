# tool-pmboard

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

工具层单包：19 个 reqboard_* 工具的 registry 与实现（kit / intake / decompose / verify / collab）。

## 允许依赖（分层 `L2`）

pmboard-common · pmboard-core

## 边界

依赖 pmboard-common · pmboard-core；registry 的 factoryFile 用包内相对路径。

## 测试

```bash
npx vitest run packages/tool-pmboard/tests
```
