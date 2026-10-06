# t-d358cb 补 U1~U9 用例与“同门唯一”探针·研发

> 需求：REQ-261006164732-6503 拆分阶段批准门重复弹框：自动弹框与 agent 显式弹框并存并覆写审批台账

## 在做什么
补 U1~U9 用例与“同门唯一”探针·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-06T10:06:29.429Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

研发段完成：同门唯一有了可跑探针，U1~U9 各有落点且新增一条把「首写不变」变成承重墙的用例。

### 完成项

- 新增 scripts/gate-inflight-probe.mts：用真 registry + 真 requestGate 跑开门时序，打印「当前在等的门」（ref / target / createdAt / 谁能答）并断言 A1 复用同一张票 / A2 同门唯一 / A3 异门清理
- 脚本头如实声明：门是**进程内**结构，跨进程脚本读不到活宿主的门——所以探针是模型级；要看活宿主走 reqboard_status / 看板
- tests/gate-request-uniqueness.test.ts 补 U1~U9 索引表（九条判据分别落在哪个文件），不重复造同一断言
- 新增 U6 承重用例「部分落章：已盖过的不被改写、未盖的补上」——前提检查只拦整门已落章，部分已盖时挡在覆写前的只有首写不变
- 修正该用例的装配缺口：落章后的 RTM 同步要读任务 ⇒ 补 deps.taskStore
- 证据：gate-request 10 例 + confirm-settle 5 例 + stale-answer 2 例 + status 4 例 = 21 例全绿；探针 exit 0

### 改动文件

- `scripts/gate-inflight-probe.mts`
- `tests/gate-request-uniqueness.test.ts`
- `tests/confirm-settle-preconditions.test.ts`

### 下一步

复核段：核对探针断言与 U1~U9 索引的真实性（不虚报覆盖）。

---
