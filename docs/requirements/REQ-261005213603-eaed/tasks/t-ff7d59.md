# t-ff7d59 定义判据契约与客户端类型声明

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定义判据契约与客户端类型声明

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：fullstack

## 得到什么结果
① npx vitest run tests/client-session-running.test.ts 退出码 0，且含真值表断言：缺键 / null / 字符串 / NaN / Infinity → false；恰好 now-15min → false；未来时间 → true；显式 staleMs=1000 生效；成因优先级 session > run；都不成立 → undefined；requirementBusy 与 requirementRunningMark 在四组输入下结论恒一致。② pnpm typecheck 退出码 0。③ grep -n "advanceLockStaleMs" src/client/session-running.ts 命中，且同文件内不存在 15 * 60_000 一类 stale 字面量（第二处口径 = 缺陷）。

## 实施方案（implementation）
改 src/client/session-running.ts：新增导出 —— RunningCause('session'|'run')、RunningMark{cause}、RequirementRunShape{advanceLockAt?}、requirementRunInFlight(req, now, staleMs = LIMITS.advanceLockStaleMs)（typeof number + Number.isFinite 守卫，(now - lock) < staleMs，与 host AdvanceChain 同运算符）、requirementRunningMark(req, isRunning, now, staleMs?)（先会话判据返回 {cause:'session'}，再锁判据返回 {cause:'run'}，都不成立返回 undefined）、requirementBusy(...)（薄包装 = mark !== undefined）。阈值只引用 src/domain/limits.ts 的 advanceLockStaleMs，不复制字面量。改 src/client/types.ts：RequirementRecord 补可选键 advanceLockAt?: number（带注释：缺失 = 没有 run 在跑）。旧导出 requirementRunning / runningSessionIds / subscribeSessionRunning / relevantSessionIds / sameRunningSet / runningAmong 完全不动。验证：npx vitest run tests/client-session-running.test.ts 真值表（TC-1～TC-10）；pnpm typecheck。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T15:27:10.287Z，窗口 session-dd10c7bd-90d5-4256-8036-cbe2c0a49733）

t1 完成：判据契约与类型声明就位，子卡链（研发/复核/测试）三段全绿

### 完成项

- 判据契约落地：requirementRunInFlight / requirementRunningMark / requirementBusy + RunningMark 类型
- 客户端类型补 advanceLockAt?: number（扁平键，缺失即不在跑）
- 阈值单一来源：只引用 LIMITS.advanceLockStaleMs，文件内无第二处 stale 字面量
- 旧导出零回归：requirementRunning 等 6 个既有导出未动
- 三条子卡链全部走完：研发 → 复核 → 测试，各有独立汇报
- 证据：真值表 28 项全绿；pnpm test 68 failed = 基线 68（零新增）；typecheck 退出码 0
- 披露：模块头注「不伪造」段同步更新，让注释与代码不再互相矛盾

### 改动文件

- `src/client/session-running.ts`
- `src/client/types.ts`
- `tests/client-session-running.test.ts`

### 下一步

t2：把 mark 接进 renderRunningDot 与两处视图映射

---
