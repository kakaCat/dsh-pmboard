# t-0d2a4f 子卡执行改先认领后执行并对并发派发说不·回归测试

> 需求：REQ-261008011118-defe 修复 reqboard 体检第五批中危 bug（M1 死字段/M3 批内节流/M4 两段写/M5 并发双跑）

## 在做什么
子卡执行改先认领后执行并对并发派发说不·回归测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 无新增失败（与基线比对，贴汇总输出）

---
## 汇报 1（2026-10-07T17:54:06.583Z，窗口 session-9574f815-da99-4e7f-9089-19c7795e1ed1）

回归：BUG-4 邻域 16 文件 / 142 用例全绿；顺带消掉前批另案（failure-handling 转绿）

### 完成项

- 回归读数：npx vitest run（子卡执行/调度/团队/预算邻域 16 文件）→ Test Files 16 passed / Tests 142 passed（无新增失败）
- 邻域选择依据：BUG-4 改的是子卡认领与失败归还 ⇒ 覆盖 (a) 执行用例与团队路径（execute-task / execute-subtask-team）、(b) 调度与锁/孤儿（advance-parallel / advance-agent-handle / advance-engine-precheck / advance-stale-lock / advance-lock-heartbeat）、(c) 队列顺序契约（t12）、(d) 子卡预算与阶段遥测（subtask-budget / stage-telemetry / zero-output-alert）、(e) 错误码三件套
- 附带收口（如实记档，非顺手重构）：本卡把 ExecuteTask 的内联失败回退块换成 failure-handling.rollbackSubtask，正是 REQ-261008004324-81df 设计里点名的另案「ExecuteTask.ts:653-656 内联回退吃掉 revisions(rollback) 与失败评论」——该另案项随之消失：tests/failure-handling.test.ts 由基线红转绿（8/8 passed）
- 全量 pnpm test 留到 t5 收口卡一次性采集

### 下一步

父卡 t-869f61 收尾：四张子卡全 done 后写父卡汇报并推进到 done

---
