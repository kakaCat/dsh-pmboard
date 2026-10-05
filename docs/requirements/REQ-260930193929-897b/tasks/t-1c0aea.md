# t-1c0aea 返工：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察·联调

> 需求：REQ-260930193929-897b G2 完整性闸门未按需求级 workspaceRoot 二次校正：文件在盘上却报 requirement.md 不存在

## 在做什么
返工：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察·联调

## 解决什么问题
承接自 需求级验收项；验收意见：改进（需修改）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-01T12:29:22.007Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

链路的四层（文档读取器 → 台账 → HTTP 端点 → 状态机）确认串得起来：请求样例与期望响应一致，放行/拦截/留痕/不误推进四类断点各有断言。这一步做完，什么变了——「端到端能跑通」从一句话变成了四层一起被一次运行穿过、且终态被逐项断言。

### 完成项

- 四层串通核对：真实 FileDocRepository（错根 A）→ JsonLedgerRepository（台账）→ createReqboardHandler（HTTP 端点）→ transitionRequirement（状态机）。E2E 正向一次运行同时穿过这四层，任一层断链断言即红
- 四类断点逐项核对：① 放行（HTTP 200 且 advanced=true 且无 gate_failure）；② 拦截（真缺文件时 advanced=false + code=design_doc_incomplete + gaps 准确）；③ 留痕（comments 含「看板一键确认产物」、statusHistory 非空）；④ 不静默/不误推进（反向场景状态留在 design）
- 请求样例与期望响应一致：`POST /dashboard/api/reqboard/req/artifact/confirm {id:'REQ-g2ws01', kind:'design'}` → 期望 200 + advanced=true；实测一致
- 命令与结果：`node_modules/.bin/vitest run tests/design-gate-workspace-root.test.ts -t "E2E"` → 2 passed；本文件全量 → 13 passed
- 联调结论：链路无断点。验收项的读数限制（只认 requirement.md 测试策略表）属**读数机制**问题，不属链路问题，已单独记录在 test-evidence 的「返工响应」节

### 改动文件

- `tests/design-gate-workspace-root.test.ts`

---
