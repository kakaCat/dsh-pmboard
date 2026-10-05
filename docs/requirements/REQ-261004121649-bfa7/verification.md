# REQ-261004121649-bfa7 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：四条 FR 全部落地且有可复跑证据：回退只物化顶层父卡（子卡原地复位保留身份）、重做卡物化即终态（stages 空链）、幂等与上限（超限整次拒绝且队列零新增）、仅人批量清场入口（回执给 canceled / restoredLinks 两个可核对数字，并如实声明匹配方式）。用例 22 条全绿；8 处判别力是把实现真的改坏、看着用例变红、再改回验证的。全量回归 96 failed / 4018 passed，失败数与开工基线逐字相等。构建已更新（指纹 8948924043c7）。

## 1. 验收列表

### v1-1 · 回退只动物化该动的卡：子卡原地复位，不再升格成新父卡

**验收内容**：【回退只动物化该动的卡：子卡原地复位，不再升格成新父卡】验收

**操作步骤**：
1. 1) `npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层"` → 全绿：6 张顶层卡 → 物化 6 张
2. 11 张子卡**原地复位**且 `parentId`/`stageKind` 保留
3. 2) 判别力（A/B）：在当前实现下该用例**必红**（能复现 17 → 56 的膨胀）
4. 3) `npx vitest run` 失败数 ≤ 开工基线。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

### v1-2 · 回退物化要幂等、要有上限：超限整次拒绝，队列零新增

**验收内容**：【回退物化要幂等、要有上限：超限整次拒绝，队列零新增】验收

**操作步骤**：
1. 可执行验收（三条，逐条可复跑）：
2. 1) 幂等：`npx vitest run tests/rollback-materialize.test.ts -t "重复回退两次"` → 1 passed
3. 该用例真跑两次回退（第一次产物落进队列后跑第二次），断言第二次 `reworkDrafts.length === 0`、队列净增为 0。
4. 2) 超限整次拒绝：`npx vitest run tests/rollback-materialize.test.ts -t "上限"` → 4 passed
5. 构造 21 张待物化顶层卡（上限 `ROLLBACK_MATERIALIZE_LIMIT = 20`，见 `src/application/internal/rollback-tasks.ts`），断言抛出错误码 `REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT`，且 `many.every(t => t.status === 'done')` 仍成立（= 队列一个字未改，因为拒绝发生在落库前的编排期）。
6. 3) 文案含数字与建议：同一用例内断言 `String(err.message)` 同时 `toContain('21')` 与 `toContain('20')`
7. 边界不误拒由 `-t "上限"` 内「正好 20 张 → 放行」一条覆盖。
8. 可查数据（看板）：`GET /dashboard/api/reqboard/state` 或需求详情页 → 队列任务数在超限拒绝前后相等。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

### v1-3 · 误物化能一次清掉：仅人的批量清理入口 + 可核对回执

**验收内容**：【误物化能一次清掉：仅人的批量清理入口 + 可核对回执】验收

**操作步骤**：
1. 1) `npx vitest run tests/rollback-materialize.test.ts -t "批量清理"` → 全绿：物化卡全部 `canceled`、父子关系还原
2. 再清一次 `canceled === 0`
3. 2) agent 身份调该接口 → `REQBOARD_HUMAN_GATE` 且队列零变化
4. 3) 回执含 `canceled` 与 `restoredLinks` 两个可核对数字。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

### v1-4 · 重做卡物化即终态：不再自动展开子卡链

**验收内容**：【重做卡物化即终态：不再自动展开子卡链】验收

**操作步骤**：
1. 1) `npx vitest run tests/rollback-materialize.test.ts -t "不自动展开链"` → 全绿：重做卡 `stages` 为 `[]`（或等价「不展开」标记），开工后**不新增子卡**
2. 2) 判别力：把 `stages: []` 去掉后该用例必红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

### v1-5 · 用「修复前必红」的用例钉死四条行为

**验收内容**：【用「修复前必红」的用例钉死四条行为】验收

**操作步骤**：
1. 1) `npx vitest run tests/rollback-materialize.test.ts` → 7 条用例全绿
2. 2) **判别力自证**：把物化规则临时退回现状（子卡也物化）→ 「只物化顶层」必红并打印膨胀后的张数
3. 3) `npx vitest run` 失败数 ≤ 开工基线。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

### v1-6 · 老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配

**验收内容**：【老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配】验收

**操作步骤**：
1. 1) 造一条无 `rollback` 元信息的旧卡（只有 `reworkOf`）→ 清理入口能匹配并取消，且回执里 `matchedBy: "reworkOf+title-prefix"`（**如实说明匹配方式**）
2. 2) 造一条既无 `reworkOf` 也无前缀的卡 → 不取消、回执里列入 `skipped` 并说明原因
3. 3) `npx tsc --noEmit` 错误数 ≤ 基线。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）

**验收状态**：✓ 通过

---

## 2. 测试报告

- ① FR-1 只物化顶层：npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层" → 3 passed（6 顶层→物化 6、11 子卡原地复位且保留 parentId/stageKind、物化卡里不出现原子卡 id）
- ② FR-2 物化即终态：-t "不自动展开链" → 1 passed；-t "真的走一遍开工" → 1 passed（端到端走真实展开判据断言子卡 0 张，并附去掉 stages: [] 后会展开的反向对照）
- ③ FR-3 幂等与上限：-t "幂等" → 4 passed；-t "上限" → 4 passed（21 张超限抛 REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT、文案含 21/20/建议、队列零新增；正好 20 张放行）
- ③ 显式补「重复回退两次」：-t "重复回退两次" → 1 passed（真跑两次回退并把第一次产物落进队列，第二次物化 0 张、净增 0）
- ④ FR-4 需求文档点名的命令：npx vitest run tests/rollback-materialize.test.ts -t "批量清理" → 1 passed（回退物化→记清单→清场整链，再清一次为 0）
- ④ 清场套件：npx vitest run tests/rollback-cleanup.test.ts → 12 passed（精确匹配+幂等、不碰 done 卡、序号不存在即拒、旧数据兜底 matchedBy、无 reworkOf 逐条 skipped、父子关系还原、跨需求隔离）
- 接口核验（FR-4）：POST /dashboard/api/reqboard/req/rollback-cleanup 已注册（src/http/routes.ts），回执字段 id/rollbackSeq/canceled/restoredLinks/matchedBy/skipped/note（src/application/use-cases/RollbackCleanup.ts:37-45）
- 数据契约核验（FR-3/FR-4）：RollbackMark 新增 seq / lastMaterialized（src/shared/protocol.ts），写入点 src/application/internal/rollback.ts，两条回退路径同款调用（MoveRequirement.ts:120、requirements.ts:180）
- 兼容路径核验（老数据实测）：全仓 22 条需求中 20 条无 rollback、2 条为旧形状（只有 from/to/at/by，无 seq）——存量形状用例覆盖：缺 seq 按 1 计且走兜底，不被序号校验挡死
- 活体探针（只读，真实数据）：对 0fbf 真实队列 73 张（70 canceled + 3 done）跑兜底清场计划 → 将取消 0 张、跳过 3 张（全部因 done 不清理）、done 卡零误触 ✅；脚本 /tmp/probe-0fbf-cleanup.mts
- 判别力自证（变异实验，逐次改坏再还原）：去掉顶层分流 → 4 条红并打印「expected 17 to be 6」；去掉幂等守卫 → 2 条红；去掉 done 跳过 → 1 条红；去掉清单保留 → 1 条红；序号校验改严 → 1 条红；实验后 grep 零残留
- 全量回归：npx vitest run → 46 failed files / 344 passed；96 failed / 4018 passed / 20 skipped，失败数与开工基线 96 逐字相等，零新增失败；通过数由 4003 升至 4018（+15 全部为本轮新增）
- 类型检查：npx tsc --noEmit -p tsconfig.json → 211 条全量，本批 8 个改动文件零错误（基线 146→211 漂移全部落在别的窗口在途文件，见 t-37dc35）
- 构建：pnpm build 成功，dist/index.mjs 指纹 8948924043c7，新符号全部入包（rollback-cleanup / executeRollbackCleanup / lastMaterialized / REQBOARD_UNKNOWN_ROLLBACK_SEQ / reworkOf+title-prefix）
- ⚠️ 挂账（如实报，非本批缺陷）：运行中的宿主 15:14 启动，早于 dist 16:58 的构建，故本轮路由与行为尚未在活宿主生效——需重启 DSH 后做跨项目/清场实测；这也解释了本轮开头「工具面判定未绑定」的现象
- ⚠️ 挂账（设计文档已同步）：interfaces.md §三 原写「agent 调用返回 REQBOARD_HUMAN_GATE」，经人工裁定（方案 A）改为工具面不存在，无 agent 工具可调；该行已改写并在 t3 复核留痕
- 验收标准可执行性修订：t-b721a6 原验收只写断言词（无可执行操作），已用 reqboard_task_move(acceptance=...) 修订为逐条命令 + 可查数据（状态保持 done 不变）
- 测试覆盖标注：29 张活跃卡（6 父 + 23 子）全部在测试证据里标注 covers，已用脚本核对零缺失
- 评审报告：docs/requirements/REQ-261004121649-bfa7/reviews/self-review.md（6 条偏离定性 + 5 处自错 + 5 条风险挂账）
- 测试证据：docs/requirements/REQ-261004121649-bfa7/tests/test-evidence.md（7 节可复跑证据 + 29 条 covers 标注）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 回退只动物化该动的卡：子卡原地复位，不再升格成新父卡 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
| v1-2 | 回退物化要幂等、要有上限：超限整次拒绝，队列零新增 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
| v1-3 | 误物化能一次清掉：仅人的批量清理入口 + 可核对回执 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
| v1-4 | 重做卡物化即终态：不再自动展开子卡链 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
| v1-5 | 用「修复前必红」的用例钉死四条行为 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
| v1-6 | 老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
| v1-8 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-51baeeda-dbe8-4048-8bc8-b036050d7957 | 2026-10-04 17:01 |
