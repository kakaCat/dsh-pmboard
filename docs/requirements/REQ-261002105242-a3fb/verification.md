# REQ-261002105242-a3fb 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：归档需求重新有了入口，且是"看得见、点得开、只读"的一条通路。

① 你最初的问题（"归档后 DAG 数据是不是被收回了"）已有机械答案：数据一条没少——553 张任务卡仍在 queue.json、接口全量返回，本次只把**入口**补回来。② 看板泳道底部新增默认折叠的「🗄 已归档 N（点击展开回看 DAG / 任务）」条，条目显示 done/total（锚点需求即 39/39），点开走既有 open-req 委托进详情；列表视图的「已完成 / 已归档」死分支同步修复。③ 归档/取消/历史完成需求的详情页一律只读：状态、进度点、DAG、任务表、验收与归档记录照常，但不出现任何点了会被拒的按钮。④ 顺带清掉三处僵尸 client 残留（归档请求封装、事件分支、done 的归档按钮）与把人引向不存在按钮的文案——服务端那个端点早已随 REQ-9f4a44 移除。⑤ 测试文档补齐 covers 标注：TC-1…TC-5 覆盖全部 5 张父卡 + 11 张子卡。

范围与兼容：仅 client 渲染层，零持久化变更、零数据迁移、不新增接口、不给 legacy done 开新状态机边；回滚即 git revert + pnpm build:client。

验证：判据 A1–A6 全绿（tests/archived-entry.test.ts 14/14，修前必红 11 failed / 3 passed 有留档）；用**真实看板数据**跑的端到端探针 exit 0（21 条归档、553 张任务，锚点需求 REQ-261001213924-1441 的 39 张卡全部渲染成 39 行任务表 + DAG 面板，顶部零操作条）；全量回归 98 failed / 2991 passed，优于基线 106 / 2807；tsc 197 ≤ 基线 223；pnpm build:client 通过 verify-client。内部自评见 reviews/self-review.md（4 项问题 + 4 项已知次优，含 1 项设计用例清单漏项与 1 项探针首版忽略分页）。

需人工确认的一步（无法由 agent 代替）：刷新看板后展开归档条、点开该需求，肉眼确认归档条默认折叠、DAG 与 39 行任务可见。

## 1. 验收列表

### v1-1 · 定死终态投影与归档条渲染契约（纯函数 + 复活既有 CSS）

**验收内容**：【定死终态投影与归档条渲染契约（纯函数 + 复活既有 CSS）】验收

**操作步骤**：
1. npx vitest run tests/archived-entry.test.ts 中 A1-1（含 data-archived-bar、data-archived-count、<details 段无 open 属性、chip 带 data-action="open-req"+data-req）、A1-3（2 条终态 + limit=1 ⇒ 含「另有 1 条未显示」
2. renderArchivedBar([]) ⇒ ''）、A1-4（1 archived + 1 canceled ⇒ summary 含「已归档 1」与「已取消 1」
3. canceled chip 带 data-status="canceled"）、A6（toReqCards 不含 archived/canceled 且仍含 done
4. toTerminalCards 只含 archived/canceled 不含 done
5. 两集合互斥且并集=全部需求
6. 终态 totalCount 等于其任务数）全部通过
7. 同一命令下 A1-2/A2/A4 仍失败（证明接线未做）
8. npx vitest run tests/token-card.test.ts tests/client-view.test.ts 全绿（toReqCards 语义未变）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

### v1-2 · 接线看板两个视图：泳道挂归档条、列表终态分组复活

**验收内容**：【接线看板两个视图：泳道挂归档条、列表终态分组复活】验收

**操作步骤**：
1. npx vitest run tests/archived-entry.test.ts 中 A1-2、A2、A4 由红转绿（A1-1/A1-3/A1-4/A6 保持绿）
2. npx vitest run tests/client-view.test.ts 全绿，其中「excludes archived and canceled from lanes」与 toReqCards 断言保持通过（归档不进进行中泳道的语义不倒退）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

### v1-3 · 详情页终态只读：archived / canceled / done 恒不渲染操作条

**验收内容**：【详情页终态只读：archived / canceled / done 恒不渲染操作条】验收

**操作步骤**：
1. npx vitest run tests/archived-entry.test.ts 中 A3 通过：archived、canceled（且 plan.approvedAt === undefined）、done（带 archive 材料）三态的 buildReqDetail 输出均不含 data-action="move-req"|"plan-approve"|"plan-reject"|"verify-pass"|"verify-rework"|"archive-req"，且不含 dsh-pm-action-bar
2. 修前 canceled+未批准计划会渲染 plan-approve（必红）。npx vitest run tests/board-info-fixes.test.ts 中「终态（archived）已无可用人工操作 → 不渲染空操作条」保持通过。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

### v1-4 · 清理僵尸归档入口 + 旧调用方收敛（兼容卡，无数据迁移）

**验收内容**：【清理僵尸归档入口 + 旧调用方收敛（兼容卡，无数据迁移）】验收

**操作步骤**：
1. npx vitest run tests/archived-entry.test.ts tests/board-info-fixes.test.ts tests/client-view.test.ts 全绿，其中 A5 通过（'archiveReq' in api === false
2. done 详情无 archive-req
3. verification 文案不含「点「归档」」）
4. grep -rn "archiveReq\|archive-req" src 输出为空（零残留）
5. npx tsc --noEmit 无因删除导出而新增的错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

### v1-5 · 全量回归 + 类型 + 客户端构建 + 浏览器人工核对

**验收内容**：【全量回归 + 类型 + 客户端构建 + 浏览器人工核对】验收

**操作步骤**：
1. npx vitest run tests/archived-entry.test.ts tests/client-view.test.ts tests/board-info-fixes.test.ts tests/token-card.test.ts 全绿（0 failed）
2. npx tsc --noEmit 错误数 ≤ 223 且本次改动文件零新增错误
3. pnpm build:client 退出码 0 且输出含 [verify-client] OK 与 CSS 分片完整
4. 浏览器核对：归档条默认折叠、点 REQ-261001213924-1441 能看到 DAG 画布与 39 行任务表、详情顶部无操作条、列表视图终态组含归档行（观察记录进验收材料）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/token-card.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/token-card.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/archived-entry.test.ts → Tests 14 passed (14)，A1–A6 全绿；用例文件 tests/archived-entry.test.ts
- 修前必红基线：实施前同一命令为 11 failed / 3 passed，原始逐例清单 docs/requirements/REQ-261002105242-a3fb/evidence/pre-fix-red.txt
- 真实数据端到端探针：npx tsx docs/requirements/REQ-261002105242-a3fb/evidence/probe-archive-entry.mts → exit 0（21 条归档 / 553 张任务；锚点 REQ-261001213924-1441 = 39/39；详情含 dsh-pm-dag-panel + 39 行 data-task + 零操作按钮；泳道段零泄漏）；输出 docs/requirements/REQ-261002105242-a3fb/evidence/probe-live-output.txt
- 全量回归：npx vitest run → 98 failed / 2991 passed / 20 skipped（基线 kb conventions C-14：106 failed / 2807 passed）
- 类型检查：npx tsc --noEmit → 197 个错误（基线 223，改动文件零新增）
- 客户端构建（C-12）：pnpm build:client → [verify-client] OK bundle=335555 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- 残留检查：grep -rn "archiveReq|archive-req" src → 无输出（exit=1）
- 测试证据 + 用例↔任务卡 covers 对照（TC-1…TC-5，覆盖全部 16 张卡）：docs/requirements/REQ-261002105242-a3fb/tests/test-evidence.md
- 内部自评报告（含 4 项问题与 4 项已知次优）：docs/requirements/REQ-261002105242-a3fb/reviews/self-review.md
- 人工验证步骤与观察点：docs/requirements/REQ-261002105242-a3fb/design/test-cases.md 第「人工验证（浏览器）」节
- 任务卡完工记录：docs/requirements/REQ-261002105242-a3fb/tasks/t-f84476.md、docs/requirements/REQ-261002105242-a3fb/tasks/t-fbd1b3.md、docs/requirements/REQ-261002105242-a3fb/tasks/t-5074a4.md、docs/requirements/REQ-261002105242-a3fb/tasks/t-473ad6.md、docs/requirements/REQ-261002105242-a3fb/tasks/t-c346ec.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 定死终态投影与归档条渲染契约（纯函数 + 复活既有 CSS） | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:13 |
| v1-2 | 接线看板两个视图：泳道挂归档条、列表终态分组复活 | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:13 |
| v1-3 | 详情页终态只读：archived / canceled / done 恒不渲染操作条 | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:13 |
| v1-4 | 清理僵尸归档入口 + 旧调用方收敛（兼容卡，无数据迁移） | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:13 |
| v1-5 | 全量回归 + 类型 + 客户端构建 + 浏览器人工核对 | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:13 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:14 |
| v1-7 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:14 |
| v1-8 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec | 2026-10-02 11:14 |
