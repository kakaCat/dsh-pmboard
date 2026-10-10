# t-a1b2c6 RTM 引擎成包 reqboard-rtm·测试

> 需求：REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件

## 在做什么
RTM 引擎成包 reqboard-rtm·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-09T10:55:16.410Z，窗口 session-5eb1ddb9-73cd-416a-96e8-99d4420cf11c）

复核：搬迁等价性复核通过（行为面 + 内容面 + 依赖面）

### 完成项

- 内容面复核：28/28 逐字节一致（git blob 与现场哈希双向核对）
- 行为面复核：RTM 相关 8 文件 78 例全过；typecheck 0 error
- 依赖面复核：分层门禁 exit 0（reqboard-rtm 为 L0 零依赖包）
- 环境面记录：compat-regression 需要「脏 docs 分片」前提，干净 worktree 下必红（非本次引入）

### 改动文件

- `.worktrees/req-261009174713-7bc8/packages/reqboard-rtm/src`
- `.worktrees/req-261009174713-7bc8/src`
- `.worktrees/req-261009174713-7bc8/tests`
- `.worktrees/req-261009174713-7bc8/scripts/refactor-baseline.mts`

### 下一步

回父卡：t6 待关

---
