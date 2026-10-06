# t-1c7ffb confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer·研发

> 需求：REQ-261006164732-6503 拆分阶段批准门重复弹框：自动弹框与 agent 显式弹框并存并覆写审批台账

## 在做什么
confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T09:57:32.391Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

研发段完成：落章前先问「这道门还算不算数」，被取代或已推进的作答只留痕，台账首写即事实。

### 完成项

- applyConfirmDecision 入口先算两条前提（尚未落章 ∧ 需求仍在该门来源阶段），任一不满足即中性化：只留痕、不落章、不推进、不抛
- 落章写入改「仅当为空时写」：产物 confirmedAt/证据、计划 approvedAt/证据——首写即事实
- 新增 sourceStageOfGate：来源阶段由 ARTIFACT_CONFIRM_GATES 反查，不另写映射表
- 新增 recordStaleAnswer：只写评论、不写 checkpoint（与 recordDeclinedConfirmation 语义相反，刻意分开）
- ConfirmDecisionOutcome 增超显式 stale 通道；AskConfirm 据此把回执组装成 confirmed:false（不谎报已确认）
- 新增 tests/confirm-settle-preconditions.test.ts 4 例：已落章不覆写（逐字节）/ 已推进零新时间戳+评论+1 / 四门来源阶段反查 / ask_confirm 通道回执 confirmed:false
- 如实登记一处实现口径：gateOpen 用「台账已落章」的可观测形式（设计写的是 ref 的 outcome）——看板与文字证据两条通道没有 ref，按 ref 判会把它们误判成门不 open
- 证据：15 例全绿（4 新 + deadlock 11）；npx tsc --noEmit 0 错

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `src/application/use-cases/AskConfirm.ts`
- `tests/confirm-settle-preconditions.test.ts`

### 下一步

复核段：核对两条前提与首写不变的边界（board / evidence 两条通道不受影响）。

---
