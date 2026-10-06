# t-aa311c AskConfirm 改走 requestGate 且陈旧票清理分门

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
AskConfirm 改走 requestGate 且陈旧票清理分门

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
① npx vitest run tests/ask-confirm-pending.test.ts tests/pending-guard.test.ts 全绿；② 新增断言：同门连调两次 ⇒ pending_confirms 计数不变且两次 ticket 相同；③ 异门实例：旧票 outcome 非空、新票在场、票表计数为 1。

## 实施方案（implementation）
改 src/application/use-cases/AskConfirm.ts：① 请求路径改走 requestGate——reused 时返回 {success:true, confirmed:false, advanced:false, pending:true, ticket:<原票>, note:'该确认已有一道门在等…'}（不新增返回键）；already-settled 时沿用既有早退返回体与措辞（含「未重复弹框（FR-9/FR-11）」）；opened 时保持既有登记 + 弹框 + 赛跑逻辑不变。② AskConfirm.ts:242 的「登记新票前把同窗口旧票一律 settle」改为分门：同门（同 requirementId+target+kind）跳过（保留给 requestGate 复用），异门仍 settle（防窗口被钉死）。③ evidence 文字路径保持直接落章，但落章改由 confirm-settle 的前提检查把关（t6 提供）。

## 上游产出摘要（dependsSummary）
- 新增 gate-request.ts 建门唯一入口（复用→早退→新建）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-06T09:28:06.443Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

t4 完成：两条确认通道都走同一处建门判定，同门重发只复用不开新框；清理随建门动作落位。

### 完成项

- AskConfirm 请求路径先过建门唯一入口，三条分支语义落定（reused / already-settled / opened）
- 带 adopted_ticket 时不判定（投递方自己的门），修掉「投递被自己的门判成 reused 而永不投递」的死结
- 异门陈旧票清理迁到 gate-request 建门分支（留在 AskConfirm 会被 adopt 分支跳过）
- 跨通道联调用例钉死核心现场：自动弹建门 → agent 再请求 ⇒ reused、同一张票、票表 1 条
- 口径修正两条（TC-10 → 复用语义、新增 TC-10b）；9 套件 94 例全绿、tsc 0 错
- 研发 t-7539a9 / 联调 t-8070c0 / 复核 t-ffa853 三张子卡均完成；一处清理归属偏离设计已如实登记

### 改动文件

- `src/application/use-cases/AskConfirm.ts`
- `src/application/internal/gate-request.ts`
- `tests/gate-request-uniqueness.test.ts`
- `tests/ask-confirm-blocking.test.ts`

### 下一步

下一步 t6（依赖 t4）：confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer；t5 可与其余卡并行。

---
