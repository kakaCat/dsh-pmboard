# pm-common

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

零依赖公共层：纯帧协议（protocol.ts）、错误码注册表、知识层操作清单等共享值与纯函数。

## 允许依赖（分层 `L0`）

（无：本包不得依赖任何 workspace 包）

## 边界

零 workspace 依赖（L0）；不得 import 任何兄弟包。

## 测试

```bash
npx vitest run pm/pm-common/tests
```
