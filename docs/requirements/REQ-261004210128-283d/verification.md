# REQ-261004210128-283d 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：看板泳道卡与列表行已能显示「绑定窗口正在跑回合」的转圈指示，与左侧会话列表同语义同判据；会话结束不刷新页面即消失；读数不可得时不显示也不伪造。\n实现为纯客户端（session-running.ts 读数与映射单点 + renderRunningDot 渲染单点 + board-mount 订阅与重绘门控）：零 host 接口、零台账字段、零数据模型改动。\n验证：三个用例文件 89 项全绿；typecheck 149 ≤ 223 基线；全量测试 98 failed ≤ 106 基线；build:client 校验通过；测试文档已补 18 条 covers 标注。\n已知缺口（如实报出）：TC-11a～TC-11e 的应用内 5 张截图未产出——agent 无浏览器操作能力，已在证据文件写明 6 步复现路径，待验收人执行。

## 1. 验收列表

### v1-1 · 接上会话运行态读数，判定「哪条需求在跑」

**验收内容**：【接上会话运行态读数，判定「哪条需求在跑」】验收

**操作步骤**：
1. pnpm typecheck 对改动文件零错误
2. 假投影 byId={a:{running:true},b:{running:false}} 下 isSessionRunning('a')===true 且 ('b')===false
3. sessions 缺失时三个导出函数均不抛，分别返回 false / 空集 / 可安全调用的 no-op 退订（由 t4 用例证明）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）

**验收状态**：✓ 通过

---

### v1-2 · 泳道卡与列表行显示运行中转圈

**验收内容**：【泳道卡与列表行显示运行中转圈】验收

**操作步骤**：
1. npx vitest run tests/client-view.test.ts 通过：传 running=new Set(['s-a']) 时输出含 data-running="true" 恰 1 次且 aria-label 非空
2. 省略 running 时输出不含 data-running 且与改动前基线逐字节一致
3. 同输入两次调用结果逐字节相等。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）

**验收状态**：✓ 通过

---

### v1-3 · 让转圈随会话实时亮灭，且不误触发重绘

**验收内容**：【让转圈随会话实时亮灭，且不误触发重绘】验收

**操作步骤**：
1. npx vitest run tests/board-attach.test.ts 通过：无关会话切换 running 时渲染计数不变
2. 相关会话切换 running 时渲染计数 +1 且输出与状态一致
3. dispose() 之后 store 再通知不触发渲染。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）

**验收状态**：✓ 通过

---

### v1-4 · 为运行中指示补齐自动化用例

**验收内容**：【为运行中指示补齐自动化用例】验收

**操作步骤**：
1. npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts 全绿，且 TC-01～TC-14 每条都能在用例名中定位。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）

**验收状态**：✓ 通过

---

### v1-5 · 跑通构建 / 类型 / 全量回归并留下人工证据

**验收内容**：【跑通构建 / 类型 / 全量回归并留下人工证据】验收

**操作步骤**：
1. pnpm typecheck 退出码 0 且错误数 ≤223
2. pnpm build:client 输出 [verify-client] OK
3. pnpm test 失败数 ≤106
4. 证据目录含 5 张截图（文件名含 TC 编号）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收

**验收内容**：E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**操作步骤**：
1. E2E 覆盖：**有**（存在跨组件跑通完整业务链路的场景用例）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）

**验收状态**：✓ 通过

---

## 2. 测试报告

- docs/requirements/REQ-261004210128-283d/evidence/verify-commands.md → 三道门禁：typecheck 149 错误（≤223 基线）、build:client [verify-client] OK、全量 vitest 98 failed / 4517 passed（≤106 基线）
- docs/requirements/REQ-261004210128-283d/evidence/running-indicator-render.html → 真实渲染函数产出：泳道恰 1 个转圈、列表恰 1 个、运行集合为空 0 个
- npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts → 89 passed (89)
- docs/requirements/REQ-261004210128-283d/tests/test-evidence.md → 测试证据 + TC↔文件落点表 + 18 条 covers 标注（5 父卡 + 13 子卡）
- docs/requirements/REQ-261004210128-283d/reviews/self-review.md → 自评审报告（10 项对抗式检查 + 2 处具名偏离）
- docs/requirements/REQ-261004210128-283d/verification.md → 验收四件套表 + 证据清单 + 已知缺口（TC-11a～TC-11e 应用内截图未产出，附 6 步复现路径）
- pnpm build:client → lib/client.js 389984 字节

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 接上会话运行态读数，判定「哪条需求在跑」 | ✓ 通过 | human/session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9 | 2026-10-04 21:45 |
| v1-2 | 泳道卡与列表行显示运行中转圈 | ✓ 通过 | human/session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9 | 2026-10-04 21:45 |
| v1-3 | 让转圈随会话实时亮灭，且不误触发重绘 | ✓ 通过 | human/session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9 | 2026-10-04 21:45 |
| v1-4 | 为运行中指示补齐自动化用例 | ✓ 通过 | human/session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9 | 2026-10-04 21:45 |
| v1-5 | 跑通构建 / 类型 / 全量回归并留下人工证据 | ✓ 通过 | human/session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9 | 2026-10-04 21:45 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9 | 2026-10-04 21:45 |
| v1-7 | 需求级验收 | ✓ 通过 | human/session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9 | 2026-10-04 21:45 |
