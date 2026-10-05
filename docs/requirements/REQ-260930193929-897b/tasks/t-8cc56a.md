# t-8cc56a 返工：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察

> 需求：REQ-260930193929-897b G2 完整性闸门未按需求级 workspaceRoot 二次校正：文件在盘上却报 requirement.md 不存在

## 在做什么
返工：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察

## 解决什么问题
承接自 需求级验收项；验收意见：改进（需修改）

## 得到什么结果
怎么验（可执行）：① `node_modules/.bin/vitest run tests/design-gate-workspace-root.test.ts -t "E2E"` → 期望 `2 passed`：E2E 正向断言 4 项可观察终态（HTTP 200 + advanced=true + 无 gate_failure；status=decomposing；statusHistory 非空；评论含「看板一键确认产物」），E2E 反向断言 advanced=false、gate_failure.code=design_doc_incomplete、status 留在 design；② `node_modules/.bin/vitest run tests/design-gate-workspace-root.test.ts` → 期望 `13 passed`；③ 读数限制：该项读数只认 requirement.md 的测试策略表，而该文档已确认且平台禁止在 implementing 阶段重交（REQBOARD_BAD_STATUS），故读数仍显示缺口——处置与理由见 docs/requirements/REQ-260930193929-897b/tests/test-evidence.md 的「返工响应」节。

---
## 汇报 1（2026-10-01T12:32:48.749Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

验收提的缺口补上了，且没有拿"读数"当挡箭牌：端到端用例真跑真断言，读数受限这件事被写清而不是抹平。这一步做完，什么变了——「多组件串联但只交了单元/集成测试」这条意见不再成立，而唯一剩下的障碍是一条明确的机制限制，处理方式与理由都已摆在验收人面前。

### 完成项

- 验收意见（v1-8 E2E 覆盖缺口）已兑现：补 E2E 两条，断言可观察终态（需求状态 / 状态迁移历史 / 推进留痕），另含反向「真缺文件不推进」
- 四条子卡（研发/联调/复核/测试）全部完成并各自留下完工记录；本次返工**未改任何产品代码**，只改测试与三份文档
- 读数限制未粉饰：E2E 项读数只认 requirement.md 的测试策略表，而该文档已确认且平台禁止在 implementing 阶段重交（REQBOARD_BAD_STATUS）→ 已撤回加节改动保持零漂移，改走验收项自带出口（通过 + 写明理由），理由可直接引用 tests/test-evidence.md 的「返工响应」节
- 验证：`-t "E2E"` → 2 passed；本文件 → 13 passed；全量 97 failed（与返工前持平、零新增）；类型 192 条（当前树基线），改动文件零错误
- A/B 归因实验：把根校正临时改为 no-op 后 design-completeness-gate.test.ts 仍 5 failed / 11 passed（一字不差）→ 该领域存量失败与本需求无关

### 改动文件

- `tests/design-gate-workspace-root.test.ts`
- `docs/requirements/REQ-260930193929-897b/tests/test-evidence.md`
- `docs/requirements/REQ-260930193929-897b/reviews/self-review.md`

### 下一步

重新提交验收材料（reqboard_submit kind=verification）；验收 E2E 项时请按「通过 + 写明理由」处置，理由见 tests/test-evidence.md 的「返工响应」节。

---
