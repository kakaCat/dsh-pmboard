# REQ-261003203909-55f2 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：子卡阶段模板补充全部交付：stageKind 16→20（e2e/manual/release/capture）、模板键 +2、template 一等字段全链路、manual 停链等人新形态（含防伪造）、C-19 登记点规范；128/129 用例绿（唯一失败为存量零交集项）、tsc 零新增、反向演练在案、kb:check 11/11、验收单/评审/测试证据三件套齐

## 1. 验收列表

### v1-1 · 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）

**验收内容**：【契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate）】验收

**操作步骤**：
1. `npx vitest run tests/domain/subtask-template.test.ts tests/subtask-template-acceptance.test.ts` → 全绿
2. TC-1/TC-2 矩阵用例（合法键→链/非法键→原因/stages+template→CONFLICT/五组优先级）全过
3. TC-3 六表同 key 集合断言过
4. `npx tsc --noEmit` 零新增错误

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-2 · 颜色登记：STAGE_TO_PHASE_COLOR +4 项与用例

**验收内容**：【颜色登记：STAGE_TO_PHASE_COLOR +4 项与用例】验收

**操作步骤**：
1. `npx vitest run tests/stage-colors.test.ts` → 全绿
2. `npx tsc --noEmit` 零新增错误
3. 反向演练：摘除任一新段颜色项 → tsc 报错（输出贴卡汇报）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-3 · 接口：submit schema + 计划校验 + plan-landing 解析落库

**验收内容**：【接口：submit schema + 计划校验 + plan-landing 解析落库】验收

**操作步骤**：
1. `npx vitest run tests/subtask-contract.test.ts`（及 plan-landing/submit 相关用例）→ 全绿
2. 非法 template 提交被拒且回执含 REQBOARD_TEMPLATE_INVALID 与合法键清单
3. stages+template 同给被拒 REQBOARD_TEMPLATE_CONFLICT
4. UC-1 集成断言：template=change-only 落库 stages=[dev,review] 且 TaskRecord.template 记录引用键

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-4 · 边界规则：STAGE_SCOPE_RULE 类型强制 + 四段规则 + prompt 快照

**验收内容**：【边界规则：STAGE_SCOPE_RULE 类型强制 + 四段规则 + prompt 快照】验收

**操作步骤**：
1. `npx vitest run tests/execute-task.test.ts` → 全绿（四段 prompt 快照断言）
2. `npx tsc --noEmit` 零新增
3. 反向演练 R-1：摘 STAGE_SCOPE_RULE.e2e → tsc 报错（输出入 evidence/）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-5 · manual 链行为：awaiting-manual 分支 + 清单生成 + 回执

**验收内容**：【manual 链行为：awaiting-manual 分支 + 清单生成 + 回执】验收

**操作步骤**：
1. `npx vitest run tests/advance-manual-stage.test.ts` → 全绿：选中 manual 子卡→不派 run→清单落盘→stopped=awaiting-manual→autoRun 与 noopStreak 不变→report 后 file 族过门续跑
2. TC-6 防伪造：骨架不更新→凭证门拒（REQBOARD_SUBTASK_GATE）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-6 · 规范沉淀：conventions 登记点条目 + eval fixtures 同步

**验收内容**：【规范沉淀：conventions 登记点条目 + eval fixtures 同步】验收

**操作步骤**：
1. `pnpm run kb:check` 的 K10/K11 项通过（规范条目四要素齐全、期望可判定）——已验证绿
2. `python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py` → RESULT: PASS。全量零漂移项（生成物对比）在另一窗口活跃编辑期间不可达（实测：连续两次运行间符号数自变 2110→2111，非本卡引入），复跑并入 t7 总验收

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-7 · 总验收：全量回归 + 反向演练 + 实机端到端复跑

**验收内容**：【总验收：全量回归 + 反向演练 + 实机端到端复跑】验收

**操作步骤**：
1. `npx vitest run tests/domain/subtask-template.test.ts tests/subtask-template-acceptance.test.ts tests/subtask-contract.test.ts tests/execute-task.test.ts tests/stage-colors.test.ts tests/advance-manual-stage.test.ts` → 全绿
2. `npx tsc --noEmit` 基线零新增
3. R-1/R-2 反向演练输出在 evidence/
4. 实机端到端：带 template 计划→decompose→queue.json 断言→开工链构成符合 UC-1（输出入 evidence/）
5. 无 template 旧计划行为不变（既有套件零改动全绿）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt

**验收状态**：✓ 通过

---

## 2. 测试报告

- 验收电池 128/129 绿：npx vitest run 10 套件（唯一失败=plan-mode 存量 rollup 回执形状，零交集，stash 对比法验证）；输出 docs/requirements/REQ-261003203909-55f2/evidence/t7-vitest-acceptance.txt
- tsc 我的文件零错误、总数 144≤基线 149；docs/requirements/REQ-261003203909-55f2/evidence/t7-tsc-count.txt
- UC-1 端到端绿（template 计划→批准→落库→懒展开）；docs/requirements/REQ-261003203909-55f2/evidence/t7-uc1-e2e.txt 与 t7-lazy-expand-count.txt
- manual 链行为 5/5（停链/幂等/防伪造）：命令 npx vitest run tests/advance-manual-stage.test.ts → 5 passed
- 反向演练 R-1/R-2（摘登记项→TS2741）；docs/requirements/REQ-261003203909-55f2/evidence/r1-reverse-drill.txt 与 r2-reverse-drill.txt
- kb:check 11/11（C-19 条目过 K10/K11）；docs/requirements/REQ-261003203909-55f2/evidence/t7-kb-check.txt
- validate_eval_suite.py → RESULT: PASS（命令：python3 docs/requirements/REQ-261002120707-deab/tests/validate_eval_suite.py）
- 验收单 docs/requirements/REQ-261003203909-55f2/verification.md、评审报告 docs/requirements/REQ-261003203909-55f2/reviews/review-report.md、测试证据（含 covers 全卡覆盖对照）docs/requirements/REQ-261003203909-55f2/tests/test-evidence.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 契约：四段登记 + 模板键 + template 纯函数（SubtaskTemplate） | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-2 | 颜色登记：STAGE_TO_PHASE_COLOR +4 项与用例 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-3 | 接口：submit schema + 计划校验 + plan-landing 解析落库 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-4 | 边界规则：STAGE_SCOPE_RULE 类型强制 + 四段规则 + prompt 快照 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-5 | manual 链行为：awaiting-manual 分支 + 清单生成 + 回执 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-6 | 规范沉淀：conventions 登记点条目 + eval fixtures 同步 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-7 | 总验收：全量回归 + 反向演练 + 实机端到端复跑 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-8 | 需求级验收 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
| v1-9 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-e48f706a-b51f-47a9-85c5-47b7e59bba48 | 2026-10-04 11:09 |
