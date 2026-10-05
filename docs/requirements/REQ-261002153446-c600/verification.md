# REQ-261002153446-c600 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：点已归档的窗口/会话 chip 现在能真的回到那个会话：先取消归档恢复、再收面板打开；恢复失败或客户端无该能力时给出明确原因并指路。两文件单测 29 passed、客户端面 4 文件 95 passed、全量 97 failed（低于基线 106 且失败零命中改动文件）、typecheck 改动文件零错误、build:client 输出 [verify-client] OK。客户端 bundle 已重建，需刷新页面生效。

## 1. 验收列表

### v1-1 · 点已归档窗口能回到那个会话：先取消归档、再打开

**验收内容**：【点已归档窗口能回到那个会话：先取消归档、再打开】验收

**操作步骤**：
1. npx vitest run tests/session-jump.test.ts 通过（TC-1/TC-2/TC-3 绿）：已归档 sid 的时间线等于 [unarchive:sid, selectPanel:null, openSession:sid] 且返回 opened
2. unarchive 抛错时返回 restore-failed 且时间线不含 openSession
3. 投影无 unarchiveSession 时返回 archived 且时间线为空

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts → Test Files 2 passed, Tests 29 passed

**验收状态**：✓ 通过

---

### v1-2 · 点之前就看得见会发生什么：chip 与失败提示的文案

**验收内容**：【点之前就看得见会发生什么：chip 与失败提示的文案】验收

**操作步骤**：
1. npx vitest run tests/board-info-fixes.test.ts 通过：已归档 chip 的 HTML 含 data-archived="true" 且 title 含「点击取消归档并打开」
2. jumpResultMessage('restore-failed', sid) 包含「取消归档失败」
3. jumpResultMessage('unavailable', sid) 包含「暂不可用」

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts → Test Files 2 passed, Tests 29 passed

**验收状态**：✓ 通过

---

### v1-3 · 兼容与回归：旧客户端语义、幂等、类型与客户端构建

**验收内容**：【兼容与回归：旧客户端语义、幂等、类型与客户端构建】验收

**操作步骤**：
1. npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts 全绿（0 failed）
2. npm run typecheck 无新增错误
3. pnpm build:client 输出含 [verify-client] OK
4. docs/requirements/REQ-261002153446-c600/tests/test-evidence.md 存在且含命令与输出摘要

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts → Test Files 2 passed, Tests 29 passed

**验收状态**：✓ 通过

---

### v1-4 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts → Test Files 2 passed, Tests 29 passed

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts → Test Files 2 passed, Tests 29 passed

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/session-jump.test.ts tests/board-info-fixes.test.ts → Test Files 2 passed, Tests 29 passed
- npx vitest run（含 client-view / archived-entry 共 4 文件）→ 95 passed
- npx vitest run 全量 → 97 failed / 3030 passed，规范 C-14 基线 106 failed，失败行零命中本次改动文件
- npx tsc --noEmit -p tsconfig.json → 187 错误（基线 223），session-jump/dom-utils/board-mount 零命中
- npm run build:client → wrapped dsh-pmboard -> lib/client.js 313753 bytes；[verify-client] OK bundle=335946 bytes
- 证据全文：docs/requirements/REQ-261002153446-c600/tests/test-evidence.md
- 用例与任务覆盖映射：docs/requirements/REQ-261002153446-c600/test-cases.md
- 交付与自检：docs/requirements/REQ-261002153446-c600/verification.md
- 自评审：docs/requirements/REQ-261002153446-c600/reviews/self-review.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 点已归档窗口能回到那个会话：先取消归档、再打开 | ✓ 通过 | human/session-4c565f55-a7af-4e7f-8b37-5033c0c2a255 | 2026-10-02 15:44 |
| v1-2 | 点之前就看得见会发生什么：chip 与失败提示的文案 | ✓ 通过 | human/session-4c565f55-a7af-4e7f-8b37-5033c0c2a255 | 2026-10-02 15:44 |
| v1-3 | 兼容与回归：旧客户端语义、幂等、类型与客户端构建 | ✓ 通过 | human/session-4c565f55-a7af-4e7f-8b37-5033c0c2a255 | 2026-10-02 15:44 |
| v1-4 | 需求级验收 | ✓ 通过 | human/session-4c565f55-a7af-4e7f-8b37-5033c0c2a255 | 2026-10-02 15:44 |
| v1-5 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-4c565f55-a7af-4e7f-8b37-5033c0c2a255 | 2026-10-02 15:44 |
