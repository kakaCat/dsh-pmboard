# REQ-261001210304-0dfb 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：会话节点面板 DAG「刷新即回初始态」已修复。① 视图选择（方向/关键路径/只看主线/钉住/滚动）改为按 canvasId::需求id 记忆，重建时回填、工具条同步、滚动还原、切换需求不串档；② 「数据时间 / N 分钟前」等随时间变化的值移出注入字符串，改由渲染后补丁写入，使数据未变时 __html 逐字节相同、React 不再重设整段 innerHTML。六套用例 102 条全绿、全量失败数 = 基线、tsc 本次文件零错误、client 构建 verify 通过；探针已从「复现缺陷」翻转为「证明已修」。唯一未自动化项是真实浏览器里 ≥2 个轮询周期下的观感确认（A4），已给出 5 步手测清单。

## 1. 验收列表

### v1-1 · 建立 DAG 视图状态记忆表（契约先行）

**验收内容**：【建立 DAG 视图状态记忆表（契约先行）】验收

**操作步骤**：
1. npx vitest run tests/dag-view-state.test.ts 全绿，其中 A1-1（合并写、拷贝隔离、非法滚动值按 0、容量 16 FIFO 淘汰、clearByPrefix）与 A5（np-dag-canvas::REQ-A 写 {dir:horizontal, focus:true} 后读 np-dag-canvas::REQ-B === undefined）两条用例通过
2. npx tsc --noEmit -p tsconfig.json 对本卡新增文件无新增错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）

**验收状态**：✓ 通过

---

### v1-2 · 挂载接缝按记忆回填并同步工具条与滚动

**验收内容**：【挂载接缝按记忆回填并同步工具条与滚动】验收

**操作步骤**：
1. npx vitest run tests/dag-view-state.test.ts 中 A1-2/A1-3 通过：同一 canvas 连续两次 mountDagCanvas({stateKey:'k'})，中间 patch({dir:'horizontal',crit:true,focus:true,pinned:'t-b'})，第二次 viewer.state() === {horizontal,true,true,'t-b'}，且 [data-dag-dir="horizontal"] 带 is-on、[data-dag-dir="vertical"] 不带，wrap.scrollTop 恢复为记忆值
2. npx vitest run tests/dag-view.test.ts 全绿（不传 opts 的既有语义与断言不变）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）

**验收状态**：✓ 通过

---

### v1-3 · 面板易变字段出注入字符串（稳定钩子 + 补丁）

**验收内容**：【面板易变字段出注入字符串（稳定钩子 + 补丁）】验收

**操作步骤**：
1. npx vitest run tests/panel-freshness-render.test.ts tests/panel-hydrate.test.ts 全绿：① 仅 freshness.fetchedAt 差 5000 的两次 renderNodePanel 输出逐字节相同（含 dsh-pm-dag-panel 段），且输出不含 '数据时间' 与具体时间戳
2. ② hydrateFreshness 后 [data-dsh-pm-fresh-slot] 文本为 '数据时间 HH:MM:SS'、data-fetched-at 正确、超阈值带 is-stale，且该元素宿主未被替换
3. ③ hydrateRelTimes 在固定 now 下产出「刚刚」「5 分钟前」「YYYY-MM-DD」
4. ④ hydrateNodePanel({tab:'list'}) 后泳道 pane 无 hidden 且 list 页签带 is-active。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）

**验收状态**：✓ 通过

---

### v1-4 · 会话面板与需求详情接线（key 作用域 + 清理）

**验收内容**：【会话面板与需求详情接线（key 作用域 + 清理）】验收

**操作步骤**：
1. npx vitest run tests/panel-refresh-wiring.test.ts tests/client-view.test.ts tests/node-panel.test.ts 全绿
2. 静态复核通过（可复核命令：grep -n "stateKey" src/client/conversation-progress.ts src/client/board-mount.ts 命中两处，形态分别为 PANEL_DAG_CANVAS_ID + '::' + reqId 与 'dag-canvas::' + req.id
3. grep -n "hydrateNodePanel\|writeDagViewState\|clearDagViewState" src/client/conversation-progress.ts 分别命中调用点）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）

**验收状态**：✓ 通过

---

### v1-5 · 探针翻转 + 全量回归与构建验证

**验收内容**：【探针翻转 + 全量回归与构建验证】验收

**操作步骤**：
1. npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts 输出：A 段显示一轮刷新后状态仍为 {"dir":"horizontal","crit":true,"focus":true,"pinned":"t-b"}（不再回 vertical/false/false/null），B 段显示两轮 __html 逐字节相同 = true
2. npx vitest run tests/dag-view-state.test.ts tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-refresh.test.ts 全绿
3. npx tsc --noEmit -p tsconfig.json 对本次文件零新增错误
4. pnpm build:client 退出码 0 且 verify-client-build 通过。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts → exit 0：A-2 保持 {horizontal,true,true,'t-b'}、A-3 滚动 top=180 left=12 还原、B-1 两轮 __html 逐字节相同 = true（修前：vertical/false/false/null 且 B-1=false）
- npx vitest run tests/dag-view-state.test.ts tests/panel-hydrate.test.ts tests/panel-freshness-render.test.ts tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-refresh.test.ts → Test Files 6 passed / Tests 102 passed
- 全量回归 npx vitest run --reporter=dot → 98 failed / 2936 passed，失败数 = 开工前基线 98（仓库存量问题），无新增失败；通过数 +12 来自本需求新增用例
- npx tsc --noEmit -p tsconfig.json → 本次 8 个改动/新增源文件零错误（仓库 191 条历史错误非本次引入）
- pnpm build:client → 退出码 0；[verify-client] OK bundle=333950 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- 运行日志：docs/requirements/REQ-261001210304-0dfb/evidence/run-log.md
- 验收材料（A1–A7 逐条自检 + FR 交付 + 契约核验 + 兼容实测 + 两处已记录偏离）：docs/requirements/REQ-261001210304-0dfb/verification.md
- 测试证据（新增/迁移用例 + 单卡命令 + 红绿翻转三观察点 + 基线表 + 16 张任务卡的 covers 覆盖对照）：docs/requirements/REQ-261001210304-0dfb/tests/test-evidence.md
- 实施评审（逐卡对账 + 两处偏离 + 边界自检 + 风险遗留）：docs/requirements/REQ-261001210304-0dfb/reviews/implementation-review.md
- 未自动化项：A4 真实刷新节奏下的滚动/页签观感需人工在浏览器按 run-log §6 的 5 步确认（当前 GUI 需先 pnpm build:client 再刷新页面）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 建立 DAG 视图状态记忆表（契约先行） | ✓ 通过 | human/session-047f62a2-5b70-46df-b693-3b2e954f9aad | 2026-10-01 21:53 |
| v1-2 | 挂载接缝按记忆回填并同步工具条与滚动 | ✓ 通过 | human/session-047f62a2-5b70-46df-b693-3b2e954f9aad | 2026-10-01 21:53 |
| v1-3 | 面板易变字段出注入字符串（稳定钩子 + 补丁） | ✓ 通过 | human/session-047f62a2-5b70-46df-b693-3b2e954f9aad | 2026-10-01 21:53 |
| v1-4 | 会话面板与需求详情接线（key 作用域 + 清理） | ✓ 通过 | human/session-047f62a2-5b70-46df-b693-3b2e954f9aad | 2026-10-01 21:53 |
| v1-5 | 探针翻转 + 全量回归与构建验证 | ✓ 通过 | human/session-047f62a2-5b70-46df-b693-3b2e954f9aad | 2026-10-01 21:53 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-047f62a2-5b70-46df-b693-3b2e954f9aad | 2026-10-01 21:53 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-047f62a2-5b70-46df-b693-3b2e954f9aad | 2026-10-01 21:53 |
