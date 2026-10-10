# command-pm

> REQ-261009174713-7bc8 拆分子包（t2 落骨架，t23 收口职责正文）。

## 职责

斜杠命令面：parse（/pm 文法）/ render（回执文案）/ applyCommandSurface（注册 /pm）。

## 允许依赖（分层 `L2`）

pm-common · pm-core

## 边界

依赖 pm-common · pm-core。

## 测试

```bash
npx vitest run command-pm/tests
```
