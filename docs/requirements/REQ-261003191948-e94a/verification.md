# REQ-261003191948-e94a 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：迁移门拒绝装配时不再整条路由消失。宿主 apply 改为三相启动——命中迁移门即注册只回 503 的降级路由并正常返回（不抛），全端点回 503 + 错误码 + 代入真实路径的可复制迁移命令；错误到状态码的映射抽成唯一实现（http/envelope.ts）并新增 REQBOARD_REQUIRES_MIGRATION→503；客户端 unwrap 不再丢弃非 2xx 响应体，看板就地渲染原因与命令块。t1–t6 全部实现并自证：28 条定向用例全绿、全量 98 failed ≤ 基线 106、类型 150 ≤ 基线 223、构建 0 且 verify-client OK。自审另抓出并修复 3 条（诊断行未单行化、命令块缺样式、探针属性访问抛异常）。实施期间还实测暴露并修复了第二处真缺陷：三个任务读取入口绕过既有的工作区根收敛点 agentIdFromExec，导致插件重载后任务全部不可见（已修 + 修前必红 + 重启后实测恢复）。测试证据已按 covers: t-xxx 标注覆盖全部 10 张卡（真解析器预检 10/10）。

未完成并如实声明：7 张卡的 report/move 勾稽未完成。子卡凭证门要求 workflow run，而 workflowEngine 被 DSH agent preset 以 isolate: { workflowEngine: true } 刻意隔离在 delegation 组内，profile 级插件按设计取不到（配置级证据见证据文件 §5.2），四次重启均失败；这是环境/架构约束，非本次代码缺陷。t-5479a5（复核）与 t-3b4d8e（测试）两张子卡因此未开工，但其阶段工作已就地完成，产物为 reviews/self-review.md 与 tests/test-evidence.md。另：未做端到端「真实未就绪启动」冒烟（建议验收阶段补一次：造夹具→重启→curl /health 期望 503+hint）。两处计划外改动因 implementing 态无法重交计划、也无法再 decompose，已在证据文件 §5 显式申报。

## 1. 验收列表

### v1-1 · 给迁移门补只读预检与可复制迁移命令

**验收内容**：【给迁移门补只读预检与可复制迁移命令】验收

**操作步骤**：
1. npx vitest run tests/reqboard/migration-gate.test.ts 全绿
2. 新用例断言 preflightLedger 在「有单册无 meta.json」夹具下返回 ok:false 且 failure.code === 'REQBOARD_REQUIRES_MIGRATION'，另两个夹具返回 ok:true 且不抛错
3. 断言 failure.hint 含夹具真实 ledgerFile 与 dataRoot 全路径、含 migrate-ledger-v10.ts 与 --apply、不含子串 '<单册>' 与 '<数据根>'
4. 断言 assertLedgerMigrated 抛出的 message 与 preflightLedger().failure.message 逐字相等。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-2 · 抽出唯一信封模块并新增迁移门 503 映射

**验收内容**：【抽出唯一信封模块并新增迁移门 503 映射】验收

**操作步骤**：
1. npx vitest run tests/reqboard/degraded-startup.test.ts 全绿
2. 其中用例对 {code:'REQBOARD_REQUIRES_MIGRATION', message:'台账未迁移', hint:'node --import tsx/esm scripts/migrate-ledger-v10.ts --apply'} 调 fail(res, err) 后断言 res.statusCode === 503 且 JSON.parse(body).hint 等于传入 hint
3. 对不带 hint 的 REQBOARD_BRIDGE_NOT_READY 断言 statusCode === 503 且响应体不含 hint 键
4. npx vitest run tests/kb-route.test.ts tests/isolation-router.test.ts 与改动前同样全绿（信封搬迁零回退）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-3 · 新增未就绪 HTTP handler

**验收内容**：【新增未就绪 HTTP handler】验收

**操作步骤**：
1. npx vitest run tests/reqboard/degraded-startup.test.ts 全绿
2. 用例断言 GET /state、GET /health、POST /req/create、GET /nope 四条均得 statusCode 503（显式断言 !== 404）
3. 四条 body 均满足 success === false 且 code === 'REQBOARD_REQUIRES_MIGRATION' 且 error 与 hint 非空
4. GET /events 一条断言 res.end 恰好被调用一次且未写 text/event-stream 头
5. mkdtempSync 夹具在四条请求后断言不存在 requirements/ 目录与 meta.json。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-4 · 接线降级启动分叉并双通道留痕

**验收内容**：【接线降级启动分叉并双通道留痕】验收

**操作步骤**：
1. npx vitest run tests/reqboard/degraded-startup.test.ts 全绿
2. 用例在「有单册无 meta.json」夹具下调用分叉逻辑断言不抛错、ctx.inject 只被以 ['webServer'] 调用一次（且从未以 ['tools'] 或 ['systemPrompt'] 调用）、logger.error 实参含 'REQBOARD_REQUIRES_MIGRATION' 且含 hint、captureDiag 写入行含同一 code 与 hint 且不含换行
3. 另一用例注入非迁移门失败断言 enterNotReadyMode 未被调用且异常照旧抛出
4. grep src/index.ts 断言 'REQBOARD_REQUIRES_MIGRATION' 出现次数为 0（分叉只按 preflight.ok 判定，不散落错误码字面量）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-5 · 客户端数据层透出服务端错误体

**验收内容**：【客户端数据层透出服务端错误体】验收

**操作步骤**：
1. npx vitest run tests/api-client.test.ts 全绿
2. 用例一 mockFetchOnce(503, {success:false, error:'检测到 legacy 单册但数据根尚未迁移', code:'REQBOARD_REQUIRES_MIGRATION', hint:'node --import tsx/esm scripts/migrate-ledger-v10.ts --apply'}) 后断言 rejects 抛出的 ApiError.message 等于服务端 error（显式断言 !== 'HTTP 503'）、code 与 hint 逐字相等
3. 用例二 mockFetchOnce(503) 空体断言 message === 'HTTP 503' 且 hint === undefined。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-6 · 看板报错区渲染可复制的迁移命令

**验收内容**：【看板报错区渲染可复制的迁移命令】验收

**操作步骤**：
1. pnpm build:client 退出码 0 且输出含 '[verify-client] OK'
2. 新增断言（可写在 tests 或 build 后 node 校验）调用 buildError('检测到 legacy 单册', 'node --import tsx/esm scripts/migrate-ledger-v10.ts --apply') 的返回串同时含 message 与 hint 全文，且 buildError('x') 的返回串不含 'dsh-pm-error-hint'
3. grep src/client/board-mount.ts 断言 catch 分支把 ApiError.hint 传给了 buildError。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-7 · 迁移与兼容回归 + 纪律核验

**验收内容**：【迁移与兼容回归 + 纪律核验】验收

**操作步骤**：
1. npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts 三条全绿（退出码 0）
2. pnpm typecheck 报错数 ≤ 223 且与 HEAD 基线比对结果写入 docs/requirements/REQ-261003191948-e94a/evidence/ 下的证据文件
3. npx vitest run 失败数 ≤ 106 且同文件里逐项列出「新增失败 = 0」
4. 已迁移与全新安装两个夹具的 preflightLedger 均返回 ok:true 且响应体不含 hint 键。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿

**验收状态**：✓ 通过

---

## 2. 测试报告

- 定向回归：npx vitest run tests/reqboard/migration-gate.test.ts tests/reqboard/task-read-root-sync.test.ts tests/reqboard/degraded-startup.test.ts tests/api-client.test.ts → 4 files / 28 tests 全绿
- 构建：pnpm build → 退出码 0；[verify-client] OK bundle=337435 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- 类型：npx tsc --noEmit -p tsconfig.json → 150 error（基线 223）；改动文件过滤 0 条
- 全量：npx vitest run → 98 failed / 3337 passed（C-14 基线 106 / 2807，失败数不高于基线）
- 修前必红：回退 TaskTree.ts 的 agentIdFromExec → tests/reqboard/task-read-root-sync.test.ts 1 failed；还原即 2 passed
- 任务覆盖标注（供 RTM 覆盖度门禁读取，真解析器预检 10/10）：docs/requirements/REQ-261003191948-e94a/tests/test-evidence.md
- 自审报告（含 3 条复核发现 F1 诊断行未单行化 / F2 命令块无样式 / F3 探针属性访问抛异常，均已修）：docs/requirements/REQ-261003191948-e94a/reviews/self-review.md
- 证据与计划外改动申报：docs/requirements/REQ-261003191948-e94a/evidence/verification-evidence.md
- 引擎不可达的四次失败现场：docs/requirements/REQ-261003191948-e94a/advance-log.md
- 两张未开工子卡的阻塞说明：docs/requirements/REQ-261003191948-e94a/tasks/t-5479a5.md 与 tasks/t-3b4d8e.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 给迁移门补只读预检与可复制迁移命令 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-2 | 抽出唯一信封模块并新增迁移门 503 映射 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-3 | 新增未就绪 HTTP handler | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-4 | 接线降级启动分叉并双通道留痕 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-5 | 客户端数据层透出服务端错误体 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-6 | 看板报错区渲染可复制的迁移命令 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-7 | 迁移与兼容回归 + 纪律核验 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
| v1-9 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-44207972-0dfc-41f4-89c0-01681149cd30 | 2026-10-03 20:30 |
