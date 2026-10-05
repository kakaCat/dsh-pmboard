# REQ-261003222428-3556 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：实施链可靠性硬化八卡全部完成：① 推进锁 30s 续租+runId 守卫（长跑 >15min 不再被抢锁双跑）② 批内写集分组真并行（未声明写集保守串行 ≡ 旧行为，maxParallelParents 首次兑现）③ depends_on 定性修正（链路正确，真缺口=agent 漏传，已补 doc↔tasks 一致性警告+端到端成链用例+构建指纹）④ 死代码清偿 3 文件 3 测试（约 600 行）⑤ N-1 wake 活性校验（死窗口转 paused 不刷 lastWakeAt）⑥ N-2 绑定改写唯一留痕入口+看板改绑入口（仅人）+静态断言 ⑦ N-3 催办按 kind 聚合+GROUP_CONFIRM_KINDS 成组确认+落章清单。全量回归 97≤98 基线零新增（净减一红），tsc 净减 6，契约文档三条缺口摘牌；三处偏离均已声明且有意图等价论证

## 1. 验收列表

### v1-1 · 推进锁续租心跳

**验收内容**：【推进锁续租心跳】验收

**操作步骤**：
1. 假时钟三用例全绿：① 心跳在跑+越过 advanceLockStaleMs → 二次 advanceRequirement 返回 locked 且原 run 不被接管
2. ② 心跳停+越过 stale → 接管成功（既有语义等价）
3. ③ 心跳遇 adv.runId≠自己时不覆写。命令：npx vitest run tests/advance-lock-heartbeat.test.ts

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-2 · 批内写集分组真并行

**验收内容**：【批内写集分组真并行】验收

**操作步骤**：
1. 桩 executeSubtask（deferred）三用例通过：① 两父卡写集无冲突→执行窗口重叠
2. ② 冲突对/未声明写集对→严格串行
3. ③ 并行组内一败→链暂停+成功卡 history 保留+失败卡 rollback 语义不变。命令：npx vitest run tests/advance-parallel.test.ts tests/advance-chain.test.ts（既有用例零改动通过=行为不变式 1）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-3 · depends_on 端到端复现+构建指纹

**验收内容**：【depends_on 端到端复现+构建指纹】验收

**操作步骤**：
1. npx vitest run tests/plan-depends-e2e.test.ts 通过：seed 需求+批准计划（t1→t2→t3 链式 depends_on）→ landApprovedPlan → 断言父卡 dependsOn 逐环成链且为真实 id
2. npx vitest run tests/tools-schema.test.ts 通过且 reqboard_status 回执含 plugin_build（schema 先声明后回执，按 REQ-261003204143-3219 纪律）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-4 · 死代码清偿（删四文件三测试）

**验收内容**：【死代码清偿（删四文件三测试）】验收

**操作步骤**：
1. grep -rn 「StartSubtaskChain|backgroundRunner|CheckpointManager|scheduleBatches」 src/ 输出零命中
2. npx tsc --noEmit 本需求文件零新错
3. pnpm test 失败数 ≤ 基线 98

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-5 · wake 活性校验（N-1）

**验收内容**：【wake 活性校验（N-1）】验收

**操作步骤**：
1. 死窗口桩用例通过：wake 返回不受理+driverHealth=paused+诊断评论+lastWakeAt 不刷新
2. 活窗口用例通过：行为同现状
3. npx vitest run tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts 零回归

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-6 · 绑定改写留痕+人工改绑入口（N-2）

**验收内容**：【绑定改写留痕+人工改绑入口（N-2）】验收

**操作步骤**：
1. npx vitest run tests/binding-trace.test.ts 通过：改绑留痕含 actor/at/from/to
2. 静态断言反向演练：助手外临时加 sourceSessionId 赋值→用例红→还原绿
3. agent 调改绑入口被 human_gate 拒绝

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-7 · 产物催办按 kind 聚合+成组确认（N-3）

**验收内容**：【产物催办按 kind 聚合+成组确认（N-3）】验收

**操作步骤**：
1. 用例通过：登记 5 份 task_detail→催办聚合 1 条
2. 一次成组确认→5 份全 confirmed
3. npx vitest run tests/artifact-gates.test.ts tests/pending-confirm-ttl.test.ts 零回归

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-8 · 全量回归+契约文档摘缺口

**验收内容**：【全量回归+契约文档摘缺口】验收

**操作步骤**：
1. pnpm test 失败数 ≤ 98 且本需求新增用例全绿
2. docs/architecture/automation-chain-contract.md §5 三条缺口摘牌（注明关闭于本需求+判据）
3. docs/architecture/project-manual.md 变更记录补行

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/advance-lock-heartbeat.test.ts、tests/advance-parallel.test.ts、tests/artifact-group-confirm.test.ts、tests/binding-trace.test.ts、tests/dive-wake-liveness.test.ts、tests/plan-depends-e2e.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/advance-lock-heartbeat.test.ts、tests/advance-parallel.test.ts、tests/artifact-group-confirm.test.ts、tests/binding-trace.test.ts、tests/dive-wake-liveness.test.ts、tests/plan-depends-e2e.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归

**验收状态**：✓ 通过

---

## 2. 测试报告

- t1 锁续租（FR-1）：npx vitest run tests/advance-lock-heartbeat.test.ts → 3/3 全绿（心跳续租越过 advanceLockStaleMs 仍 locked、心跳死 lockAt 停原地、他人 runId 双不越权）；advance 一族 29 用例零回归
- t2 批内真并行（FR-2）：npx vitest run tests/advance-parallel.test.ts → 4/4 全绿（无冲突两子卡执行窗口重叠=真并行、冲突对严格串行、未声明写集保守串行≡旧行为、组内一败→暂停+成功保留+失败回滚）；concurrency-limits 跨卡既有用例零改动转绿
- t3 依赖一致性防线+构建指纹（FR-3）：npx vitest run tests/plan-depends-e2e.test.ts → 4/4 全绿（带 depends_on 落库逐环成链为真实 id、doc↔tasks 漏传点名警告、无表格不误报、plugin_build 回执+schema 同源）
- t4 死代码清偿（FR-4）：grep -rn 「StartSubtaskChain|backgroundRunner|CheckpointManager|scheduleBatches」 src/ → 生产零命中；删除后 pnpm test 失败清单与基线逐文件 diff exit 0
- t5 wake 活性校验（FR-5/N-1）：npx vitest run tests/dive-wake-liveness.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts → 29 全绿（死窗口 3 次后 driverHealth=paused 且 lastWakeAt 不刷新；活窗口行为逐字不变）
- t6 绑定改写留痕+人工改绑入口（FR-6/N-2）：npx vitest run tests/binding-trace.test.ts → 5/5 全绿；反向演练：window.ts 临时注入 .sourceSessionId= → 静态断言红并点名 window.ts:192 → 还原绿
- t7 催办聚合+成组确认（FR-7/N-3）：npx vitest run tests/artifact-group-confirm.test.ts → 4/4 全绿（5 份 task_detail 聚合为 1 条、一次成组确认 5 份全 confirmed、stamped 列出 5 份路径、design 成组语义零回归）
- 全量终态：pnpm test → 97 failed / 3523 passed（≤ 说明书基线 98）；失败清单与基线 diff 唯一变化 = tests/execute-task.test.ts 由红转绿，本需求零新增失败
- 类型检查：npx tsc --noEmit → 总错误 144（开工时 150，净减 6）；归属本需求文件零错
- 契约文档摘牌：docs/architecture/automation-chain-contract.md §5 三条缺口（N-1/N-2/N-3）全部标注「已关闭」并附关闭方式与判据命令；docs/architecture/project-manual.md 变更记录补行
- 证据与评审文档：docs/requirements/REQ-261003222428-3556/tests/test-evidence.md（九节可复跑证据+任务覆盖对照）、docs/requirements/REQ-261003222428-3556/reviews/review-report.md（八卡核对+三处偏离总账+定性修正记录）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 推进锁续租心跳 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-2 | 批内写集分组真并行 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-3 | depends_on 端到端复现+构建指纹 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-4 | 死代码清偿（删四文件三测试） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-5 | wake 活性校验（N-1） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-6 | 绑定改写留痕+人工改绑入口（N-2） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-7 | 产物催办按 kind 聚合+成组确认（N-3） | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-8 | 全量回归+契约文档摘缺口 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-10 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
| v1-11 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69 | 2026-10-04 11:00 |
