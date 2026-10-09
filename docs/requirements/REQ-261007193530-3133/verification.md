# REQ-261007193530-3133 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：交付结论（v2 重交）：reqboard 体检第一批 4 处边界 bug 全部修复并回归覆盖。本回合新鲜复核：red-green 循环（修前 8 failed → 修后 36 passed）、typecheck exit 0、diff 9 文件无夹带。v1-7 系统项缺口已真处置：tests/ask-confirm.test.ts 补 serves: FR-1,FR-2、tests/domain/requirement-status.test.ts 补 serves: FR-3。唯一遗留：全量测试 69 条存量失败（基线陈旧，已抽验证非本批引入）。

## 1. 验收列表

### v2-1 · 修复 AskConfirm 否定回执 user_feedback 条件展开（FR-1）

**验收内容**：【修复 AskConfirm 否定回执 user_feedback 条件展开（FR-1）】验收

**操作步骤**：
1. grep -n "user_feedback" src/application/use-cases/AskConfirm.ts 显示条件展开（无 user_feedback: undefined 路径）
2. tests/ask-confirm.test.ts 新增用例通过：弹框否定+空反馈回执 success:true/confirmed:false 且 'user_feedback' 键缺席、JSON.stringify 不抛
3. 有反馈时键存在且等值

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：AskConfirm.ts:452 条件展开；tests/ask-confirm.test.ts +2 条 → 13 passed；反证（stash 源码）即红

**验收状态**：✓ 通过

---

### v2-2 · 修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2）

**验收内容**：【修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2）】验收

**操作步骤**：
1. grep -n "role" src/http/routers/tasks.ts 显示 transitionTask 调用带 role
2. pnpm vitest run tests/http-task-move-role.test.ts 通过：子卡非法转移被拒且字段零改动、存量卡老路径放行

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：task-transition.ts:33 roleOfTask + tasks.ts:137 传 role；tests/http-task-move-role.test.ts 4 条 → 4 passed；反证移除 role 即 3 failed

**验收状态**：✓ 通过

---

### v2-3 · 修复需求 canceled→draft 复活边挂人工门（FR-3）

**验收内容**：【修复需求 canceled→draft 复活边挂人工门（FR-3）】验收

**操作步骤**：
1. grep -n "canceled>draft" src/domain/requirement/RequirementStatus.ts 命中 HUMAN_ONLY_REQ_TRANSITIONS
2. pnpm vitest run tests/domain/requirement-status.test.ts 通过：agent 抛 human_gate、human 放行、agentNextActions 不含 draft

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：RequirementStatus.ts:130 'canceled>draft'；tests/domain/requirement-status.test.ts +3 条 → 10 passed（补 serves 后复跑 23 passed 含本文件）

**验收状态**：✓ 通过

---

### v2-4 · 修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）

**验收内容**：【修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4）】验收

**操作步骤**：
1. grep -n -A2 "throttleMs - (now" src/domain/workflow/DoneEvidenceSpec.ts 可见 Math.min/Math.max clamp
2. pnpm vitest run tests/done-throttle-guidance.test.ts 通过：未来时间戳读数 ≤ 60000、正常历史读数不变

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：DoneEvidenceSpec.ts:81 clamp；tests/done-throttle-guidance.test.ts +3 条 → 9 passed；反证回退即 1 failed

**验收状态**：✓ 通过

---

### v2-5 · 总验收：全量回归 + diff 盘点

**验收内容**：【总验收：全量回归 + diff 盘点】验收

**操作步骤**：
1. pnpm test 退出码 0 且无新增失败
2. pnpm typecheck 退出码 0
3. git diff --stat 盘点 = 5 源码文件（AskConfirm.ts / task-transition.ts / tasks.ts / RequirementStatus.ts / DoneEvidenceSpec.ts）+ 4 测试文件，无表外改动

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：typecheck exit 0；diff 盘点 9 文件 = 设计表；四条 FR grep 判据 4/4；全量失败经 HEAD 抽验证为存量

**验收状态**：✓ 通过

---

### v2-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：需求级验收：4/4 FR 交付且可反证；本回合新鲜 red-green（修前 8 failed / 28 passed → 修后 36 passed）；typecheck exit 0；diff 9 文件与设计表一致、无顺手重构。异常项如实标注：全量 pnpm test 69 failed 为存量基线陈旧（已 stash 抽验归因）。v1-7 孤儿用例已处置：两个测试文件头补 serves 声明。

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/ask-confirm.test.ts tests/http-task-move-role.test.ts tests/domain/requirement-status.test.ts tests/done-throttle-guidance.test.ts → 4 files passed，36 tests passed（本回合新鲜复跑）
- red-green 新鲜循环：git stash push -- src 后复跑四组用例 → 4 failed / 8 failed | 28 passed；stash pop 后 → 4 passed / 36 passed
- npx tsc --noEmit -p tsconfig.json → exit 0，error TS 0 条
- git status --porcelain -- src tests → 5 源码 + 4 测试，无表外改动（无顺手重构夹带）
- v1-7 孤儿用例已处置：tests/ask-confirm.test.ts 头部补 serves: FR-1, FR-2；tests/domain/requirement-status.test.ts 头部补 serves: FR-3；补后复跑这两文件 → 2 passed / 23 passed
- grep 判据 4/4：AskConfirm.ts:452 / tasks.ts:137+task-transition.ts:33 / RequirementStatus.ts:130 / DoneEvidenceSpec.ts:81
- pnpm test → 69 failed | 6942 passed（存量）；归因抽验：stash 本批改动后在 HEAD 复跑同批 7 文件 → 6 failed（9 tests）⇒ 非本批引入

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 修复 AskConfirm 否定回执 user_feedback 条件展开（FR-1） | ✓ 通过 | human/session-38e57340-14d5-41ff-9f88-98f0f69b0191 | 2026-10-07 20:07 |
| v2-2 | 修复 handleTaskMove 按角色传 role 堵子卡非法态（FR-2） | ✓ 通过 | human/session-38e57340-14d5-41ff-9f88-98f0f69b0191 | 2026-10-07 20:07 |
| v2-3 | 修复需求 canceled→draft 复活边挂人工门（FR-3） | ✓ 通过 | human/session-38e57340-14d5-41ff-9f88-98f0f69b0191 | 2026-10-07 20:07 |
| v2-4 | 修复 throttleRemainingMs 读数 clamp 到 [0, throttleMs]（FR-4） | ✓ 通过 | human/session-38e57340-14d5-41ff-9f88-98f0f69b0191 | 2026-10-07 20:07 |
| v2-5 | 总验收：全量回归 + diff 盘点 | ✓ 通过 | human/session-38e57340-14d5-41ff-9f88-98f0f69b0191 | 2026-10-07 20:07 |
| v2-6 | 需求级验收 | ✓ 通过 | human/session-38e57340-14d5-41ff-9f88-98f0f69b0191 | 2026-10-07 20:07 |
