# REQ-260930182521-4fee 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：DAG 画布与泳道双视图的任务卡颜色已按「卡片所处阶段」统一：六阶段色值收敛为单一事实源 STAGE_COLORS（泳道 CSS 由它插值、Canvas 取色读它），卡片着色 key 改用 laneOf 推导、与泳道列归属同源。测试为 10 项一致性断言 + 3 项端到端场景用例（共 13 项全绿，测试文档已标 covers 覆盖全部 13 张任务卡）。纯展示层改动，无数据迁移。注：任务存储曾被外部清理，已按真实执行记录重建并通过本仓校验（见 notes/queue-rebuild.md）。

## 1. 验收列表

### v2-1 · 六阶段色板收敛为单一常量源

**验收内容**：【六阶段色板收敛为单一常量源】验收

**操作步骤**：
1. pnpm vitest run tests/stage-colors.test.ts -t 色板 通过
2. grep 旧错位色值在 src/client 零命中。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-2 · 泳道样式与列头色点改由色板插值

**验收内容**：【泳道样式与列头色点改由色板插值】验收

**操作步骤**：
1. pnpm vitest run tests/stage-colors.test.ts -t 样式 通过：NODE_PANEL_CSS 含每个阶段 bg/fg。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-3 · 卡片着色改用 laneOf 推导（画布 + 泳道）

**验收内容**：【卡片着色改用 laneOf 推导（画布 + 泳道）】验收

**操作步骤**：
1. pnpm vitest run tests/stage-colors.test.ts -t 着色 通过：组 A stageKey=testing 且泳道同列
2. 组 B=in_review。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-4 · 颜色一致性测试与兼容回落验证

**验收内容**：【颜色一致性测试与兼容回落验证】验收

**操作步骤**：
1. pnpm vitest run tests/stage-colors.test.ts 全绿
2. 相关模块无回归
3. 兼容断言通过。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-8 · 需求级验收

**验收内容**：E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**操作步骤**：
1. E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

## 2. 测试报告

- 命令：pnpm vitest run tests/stage-colors.test.ts tests/stage-colors-e2e.test.ts → 13 passed（10 单元/集成 + 3 端到端）
- 命令：-t 色板 → 4 passed；-t 样式 → 1 passed；-t 着色 → 6 passed
- 命令：pnpm vitest run tests/card-layer.test.ts tests/card-face.test.ts tests/node-panel.test.ts tests/stage-panel.test.ts tests/client-subtask-view.test.ts → 41 passed，无回归
- 命令：grep -rn "fff4e5|e8f9ed|f3e5ff|STATUS_BACKGROUND_COLORS" src/client → NO_MATCH
- 命令：pnpm build → dist/index.mjs 1.10 MB、lib/client.js 313 KB，verify-client OK
- 端到端链路（走生产写/读与渲染入口）：QueueTaskStore.createMany → JsonQueueRepository 读回 → renderNodePanel 泳道 + buildDagData/cardHtml 画布 → 断言三处同色；用例文件 tests/stage-colors-e2e.test.ts
- 测试证据（含 E2E 段与 covers 标注）：docs/requirements/REQ-260930182521-4fee/tests/stage-colors-evidence.md
- 测试策略表（单元/集成 + E2E）：docs/requirements/REQ-260930182521-4fee/requirement.md
- 评审记录：docs/requirements/REQ-260930182521-4fee/reviews/design-review.md、reviews/implementation-review.md
- 界面验收路径：打开项目看板 → 实施节点 [DAG]/[泳道]，核对同一张卡两处同色且与所在列列头同色

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 六阶段色板收敛为单一常量源 | ⬜ 待验收 |  |  |
| v2-2 | 泳道样式与列头色点改由色板插值 | ⬜ 待验收 |  |  |
| v2-3 | 卡片着色改用 laneOf 推导（画布 + 泳道） | ⬜ 待验收 |  |  |
| v2-4 | 颜色一致性测试与兼容回落验证 | ⬜ 待验收 |  |  |
| v2-5 | 需求级验收 | ⬜ 待验收 |  |  |
| v2-8 | 需求级验收 | ⬜ 待验收 |  |  |
