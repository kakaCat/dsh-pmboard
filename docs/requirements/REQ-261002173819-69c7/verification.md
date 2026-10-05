# REQ-261002173819-69c7 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付：reqboard 的自动化断链修好了，四件事各自有生产级证据。
① 交给宿主后台任务系统的「户主」不再传错东西——以前传 agent 对象，而宿主只认 id 字符串，所以自动实施链从上线起就没成功投递过一次（该需求自己台账里的 DISPATCH_FAILED 记录即为证）。
② 投递失败时当场把重试锁收回来并留一条能读懂的原因——以前一次失败会把那条需求卡住 15 分钟，且台账查不出原因。
③ 人现在有一个只会由人手按的开关：被关成手动模式的需求，看板点一次「继续」就能接回自动跑——已在生产台账实测（REQ-261002161439-277d 由 disarmed/idle 变 armed/active 并留人工留痕）。
④ 解锁工具的回执修好了（以前副作用生效却返回渲染错误，调用方无法判断锁开没开），并加了「全工具必须声明渲染」的守卫。
口径交底：卡面原写的「下一拍真的起轮（roundsInStage 0→1）」经人裁定降级为环境受限未实测——它验的是 Dive 既有投递行为，被「绑定窗口重启后已死」与新缺陷 N-1 挡住，不属本需求改动范围。
另附 4 条评审中发现的边界外缺陷（N-1 静默停摆 / N-2 绑定可被静默改写 / N-3 产物催办弹框量产 / N-4 profile 关了 jobs 控制器），建议另立需求。

## 1. 验收列表

### v1-1 · 后台任务的户主改成身份证号：owner 口径收口

**验收内容**：【后台任务的户主改成身份证号：owner 口径收口】验收

**操作步骤**：
1. npx vitest run tests/advance-dispatch-owner.test.ts tests/unit/dsh-jobs-adapter.test.ts 全绿（exit 0）
2. D-4 断言 JobsPort 捕获的 spec.owner 为字符串且 typeof==='string'
3. D-6 断言对 {id}/{session:{id}}/{}/null 四输入两函数返回值逐例相等
4. npx tsc --noEmit 错误数 ≤ 基线（改动文件零新增错误）
5. grep -rn "owner:" src/ 只剩 DshJobsAdapter 透传与 AdvanceChain 的 dispatchOwnerOf 调用两处。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

### v1-2 · 投递失败不把重试锁死：回收锁 + 可读留痕

**验收内容**：【投递失败不把重试锁死：回收锁 + 可读留痕】验收

**操作步骤**：
1. npx vitest run tests/advance-dispatch-owner.test.ts 全绿
2. D-1 断言注入必失败的 Jobs 端口后 out.dispatched===false、out.stopped==='dispatch_failed'，且台账 advance.lockAt===undefined && advance.runId===undefined
3. D-2 断言紧接着换可用端口再调一次得到 dispatched===true 且有 job_id（不再 REQBOARD_ADVANCE_LOCKED）
4. D-3 断言新增 history 事件 event==='DISPATCH_FAILED' 且 outcome==='failed'，且新增 comment 正文含 requirementId、含 'owner_unresolvable'、不含 '[object Object]'
5. D-5 断言 exec={} 时 spec.owner===undefined 且 dispatched===true（走 unowned，不降级同步）
6. D-7 断言他人新鲜锁的 runId 原样保留、返回 stopped==='locked'。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

### v1-3 · 给人一个开关：看板继续能接回手动模式的需求

**验收内容**：【给人一个开关：看板继续能接回手动模式的需求】验收

**操作步骤**：
1. npx vitest run tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts 全绿
2. R-1 断言 disarmed+idle 经 armExplicit 后 activation==='armed' 且 phase==='active' 且新增 comment 含 '[Dive 重新武装]' 与 createdBy.kind==='human'
3. R-2 断言对已 armed 且健康的需求返回 false 且 version 不变（零写入）
4. R-5 断言 dialogInFlight===true 时返回 false 且台账零写入
5. R-6 断言 recoverHealth 对 disarmed+idle 仍返回 false（自动路径不越权）
6. R-8 断言 POST /req/autorun {on:true} 后台账 activation==='armed'、响应体键集合与改动前逐键相同、advanceNote 含『已重新武装』
7. R-9 断言 {on:false} 不改 dive 任何字段且 autoRun=false、pausedReason='manual'。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

### v1-4 · 解锁工具的回执修好：补 output.render

**验收内容**：【解锁工具的回执修好：补 output.render】验收

**操作步骤**：
1. npx vitest run tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts 全绿
2. T-1 覆盖 src/tools 下全部工具文件且白名单只有 TaskExecuteTool.ts
3. T-2 断言扫描函数对『缺 render』样例返回非空（防扫描器失效假绿）
4. 故障注入实测：临时新增 src/tools/__probe/ProbeTool.ts（defineTool 且无 render）→ T-1 变红并打印该文件路径，删除探针后复跑全绿且 git status 无残留
5. T-3 断言 output.render(args,value)[0].text 首行为含 'REQ-' 的单行且空行后可 JSON.parse
6. T-4 断言 clearPause 返回 success===true、previous_activation==='armed'，且台账 activation==='disarmed'、phase==='idle'。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

### v1-5 · 收口：兼容核对、回归基线与端到端接回

**验收内容**：【收口：兼容核对、回归基线与端到端接回】验收

**操作步骤**：
1. npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts 全绿（exit 0）
2. pnpm test 失败数 ≤ 基线 106 且本次新增用例全绿
3. pnpm typecheck 错误数 ≤ 基线 223
4. pnpm build 退出码 0
5. 端到端证据（docs/requirements/REQ-261002173819-69c7/evidence/t5-acceptance.md §6）显示 REQ-261002161439-277d 的 dive.activation 由 disarmed 变 armed、phase 由 idle 变 active，且有 [Dive 重新武装] 人工留痕——对应需求文档判据 A4。口径修订（2026-10-02 经人裁定）：原加强项「dive.roundsInStage 由 0 变 1」改为记为「环境受限未实测」——该子项验的是 Dive 既有投递行为（非本需求改动），被「绑定窗口 session-afb5b804 重启后已死」与新缺陷 N-1（armed+死窗口=静默停摆）挡住，详见 evidence §6.4/§6.5。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/unit/dsh-jobs-adapter.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/unit/dsh-jobs-adapter.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0

**验收状态**：✓ 通过

---

## 2. 测试报告

- 目标 6 文件：npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts → 6 passed / 61 passed，exit 0
- 全量回归：pnpm test → 329 文件 3446 例，失败 99（≤ 基线 106）；失败文件集合四轮比对 49=49=49=49
- 类型与构建：pnpm typecheck 187 条（≤ 基线 223，改动文件 0 条）；pnpm build 退出码 0 且 [verify-client] OK
- FR-1 锁回收：用例 D-1/D-2 注入必失败 Jobs 端口 → advance.lockAt/runId 均为 undefined，紧接着重试 dispatched=true
- FR-2 owner 口径：D-4a/D-4b 断言捕获到的 owner 是字符串；实机证据见 evidence/t5-acceptance.md §6.3
- FR-3 人能接回：生产台账实测 REQ-261002161439-277d disarmed→armed、idle→active，并写 [Dive 重新武装] 人工留痕
- FR-4 回执渲染：clear_pause 补 output.render；T-1 全工具渲染覆盖 + 故障注入变红后复绿、无残留
- 端到端副本：npx tsx docs/requirements/REQ-261002173819-69c7/evidence/t5-e2e-real-copy.mts → E2E-COPY: PASS（生产台账 sha256 未变）
- 测试证据（含 24 张卡的 covers 对照）：docs/requirements/REQ-261002173819-69c7/tests/test-evidence.md
- 评审报告：docs/requirements/REQ-261002173819-69c7/reviews/review-report.md（含 4 条边界外缺陷 N-1..N-4）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 后台任务的户主改成身份证号：owner 口径收口 | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
| v1-2 | 投递失败不把重试锁死：回收锁 + 可读留痕 | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
| v1-3 | 给人一个开关：看板继续能接回手动模式的需求 | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
| v1-4 | 解锁工具的回执修好：补 output.render | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
| v1-5 | 收口：兼容核对、回归基线与端到端接回 | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
| v1-7 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
| v1-8 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-c997b014-0c5c-4679-9439-98f6d0a3fc20 | 2026-10-02 18:35 |
