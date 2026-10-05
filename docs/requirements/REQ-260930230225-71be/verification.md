# REQ-260930230225-71be 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v5

**交付结论**：重交验收（v5）：自 v4 以来只补了测试与追溯，未改交付行为——① 新增端到端用例 tests/header-progress-e2e.test.ts（真实 Chrome 驱动探针整链，2 passed，断言可观察终态：退出码 0 / 每行 problems=NONE / rowRightOverflow=-12 / docOverflow=0 / PROBE PASS）；② 补齐机器可读追溯标注（decomposition.md §P-3.1 的「FR ↔ 台账任务 id」表 + tests/test-evidence.md §七 的 ## TC-N: covers/validates 段）并按真实触发点重刷 RTM，fr_to_tasks 与 fr_to_tests 均已非空、testing 覆盖 24/24。v4 里那条「追溯断链」在本次快照中已消失。交付本体仍是：流程图挂右侧工具组最左（utilities, order -20）、四档自适应（1000/780/600）、详情面板与会话框左边对齐。

## 1. 验收列表

### v5-1 · 抽出流程图模型与档位常量（契约卡）

**验收内容**：【抽出流程图模型与档位常量（契约卡）】验收

**操作步骤**：
1. 运行 ./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts -t TC-5 → 输出 1 passed
2. 运行 ./node_modules/.bin/tsc --noEmit -p tsconfig.json → 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

### v5-2 · 会话头部挂载点迁到模式标签后（注册卡）

**验收内容**：【会话头部挂载点迁到模式标签后（注册卡）】验收

**操作步骤**：
1. 运行 grep -q conversation.session.header.actions src/client/index.ts && ! grep -q header.utilities src/client/index.ts && echo OK → 输出 OK
2. 运行 pnpm build:client → 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

### v5-3 · 组件改为消费图表模型（视图接线卡）

**验收内容**：【组件改为消费图表模型（视图接线卡）】验收

**操作步骤**：
1. 运行 grep -q buildFlowChartModel src/client/conversation-progress.ts && grep -q dsh-pm-flow-node src/client/conversation-progress.ts && grep -q data-selected src/client/conversation-progress.ts && echo OK → 输出 OK
2. 运行 pnpm build:client → 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

### v5-4 · 流程图收缩与四档降级样式（样式卡）

**验收内容**：【流程图收缩与四档降级样式（样式卡）】验收

**操作步骤**：
1. 运行 grep -q @container src/client/styles/board.ts && grep -q FLOW_TIERS src/client/styles/board.ts && grep -q position: fixed src/client/styles/board.ts && pnpm build:client && echo OK → 输出 OK。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

### v5-5 · 六档视口探针与静态契约单测（回归门卡）

**验收内容**：【六档视口探针与静态契约单测（回归门卡）】验收

**操作步骤**：
1. 运行 ./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 输出 6 passed
2. 运行 ./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 行 DIAG（每行 problems=NONE）+ 末行 PROBE PASS，退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

### v5-6 · 兼容与回滚验证（无容器祖先降级）

**验收内容**：【兼容与回滚验证（无容器祖先降级）】验收

**操作步骤**：
1. 跑 ./node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback → 输出 DIAG fallback 行且 problems=NONE + 末行 PROBE PASS，退出码 0
2. 两张截图见 docs/requirements/REQ-260930230225-71be/evidence/README.md 所列路径（文件存在可打开）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

### v5-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

### v5-8 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed

**验收状态**：✓ 通过

---

## 2. 测试报告

- 命令+输出：./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts → 13 passed
- 命令+输出：./node_modules/.bin/vitest run tests/header-progress-e2e.test.ts → 2 passed（真实 Chrome，23.4s；无浏览器时响亮失败）
- 命令+输出：./node_modules/.bin/tsx scripts/header-progress-probe.mts → 6 行 DIAG（problems=NONE）+ PROBE PASS；--fallback → 5 行 DIAG + PROBE PASS
- 命令+输出：pnpm build:client → exit 0，verify-client OK
- 追溯（RTM 已重刷）：rtm-decomposing.yml 的 fr_to_tasks.FR-1 非空；rtm-accepting.yml 的 fr_to_tests.FR-1 = TC-1,TC-3,TC-5,TC-2,TC-4；coverage.testing = 24/24（100%）
- 标注落点：docs/requirements/REQ-260930230225-71be/decomposition.md（§P-3.1 FR↔台账任务表）与 docs/requirements/REQ-260930230225-71be/tests/test-evidence.md（§七 ## TC-1..TC-4 + covers/validates）
- 本轮记录：docs/requirements/REQ-260930230225-71be/reviews/review-round-4.md（两处门禁缺口的定位、修法、重刷结果与遗留读数问题）
- 验收材料与证据：docs/requirements/REQ-260930230225-71be/verification.md / evidence/README.md / evidence/wide-1280.png / evidence/narrow-480.png

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v5-1 | 抽出流程图模型与档位常量（契约卡） | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:28 |
| v5-2 | 会话头部挂载点迁到模式标签后（注册卡） | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:28 |
| v5-3 | 组件改为消费图表模型（视图接线卡） | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:28 |
| v5-4 | 流程图收缩与四档降级样式（样式卡） | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:28 |
| v5-5 | 六档视口探针与静态契约单测（回归门卡） | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:28 |
| v5-6 | 兼容与回滚验证（无容器祖先降级） | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:29 |
| v5-7 | 需求级验收 | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:29 |
| v5-8 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-a989385b-6ee0-4cbc-9b68-eeeca9a7b86c | 2026-10-02 15:29 |
