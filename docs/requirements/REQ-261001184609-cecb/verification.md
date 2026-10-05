# REQ-261001184609-cecb 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：**结论：验收不再要人填结果——agent 跑完自己落章，人只点通过。** 本轮按新格式重交：每项证据写成「<验收项> :: <命令 + 实际输出摘要>」，提交时逐项落进验收单；弹框/看板随后只问裁决。6/6 卡 done，基线 tsc 212 / pnpm test 106 零新增，新增 10 条用例全绿。

## 1. 验收列表

### v2-1 · 定契约：验收项带 result 与人工确认标记

**验收内容**：【定契约：验收项带 result 与人工确认标记】验收

**操作步骤**：
1. npx vitest run tests/verify-item-result.test.ts → 契约字段可读写
2. 旧验收单读 result 为 undefined（新增用例）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-2 · 材料即结果：提交验收材料时逐项绑定

**验收内容**：【材料即结果：提交验收材料时逐项绑定】验收

**操作步骤**：
1. npx vitest run tests/verify-item-result.test.ts → 绑定正确、不伪造、老写法不绑定（3 用例）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-3 · 弹框只问裁决：有结果就不逼人填

**验收内容**：【弹框只问裁决：有结果就不逼人填】验收

**操作步骤**：
1. npx vitest run tests/verify-item-result.test.ts → 有 result 提问数 1 且零输入可记 passed
2. needsHuman 题干含理由

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-4 · 兼容与迁移：旧单、旧调用方、回滚

**验收内容**：【兼容与迁移：旧单、旧调用方、回滚】验收

**操作步骤**：
1. npx vitest run tests/verify-item-result.test.ts → 旧单/旧写法两种兼容路径各一条用例通过

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-5 · 看板接线：展示结果与需人工确认

**验收内容**：【看板接线：展示结果与需人工确认】验收

**操作步骤**：
1. pnpm run build:client → 通过（[verify-client] OK）
2. 看板验收面板能看到 result 文本与需人工确认标记

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-6 · 回归：五项断言与基线不劣化

**验收内容**：【回归：五项断言与基线不劣化】验收

**操作步骤**：
1. npx vitest run tests/verify-item-result.test.ts → 5/5 绿
2. pnpm test 失败数 ≤ 106
3. npx tsc --noEmit 错误数 ≤ 212

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-7 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v2-8 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

## 2. 测试报告

- v1-1 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- v1-2 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- v1-3 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- v1-4 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- v1-5 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- v1-6 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- v1-7 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- v1-8 :: npx vitest run tests/verify-item-result.test.ts → 10 passed；pnpm test → 106 failed / 2866 passed（基线 106）；npx tsc --noEmit → 212（= 基线）
- pnpm run build:client → [verify-client] OK bundle=331279 bytes
- docs/requirements/REQ-261001184609-cecb/tests/test-evidence.md
- docs/requirements/REQ-261001184609-cecb/reviews/contract-sync-review.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 定契约：验收项带 result 与人工确认标记 | ⬜ 待验收 |  |  |
| v2-2 | 材料即结果：提交验收材料时逐项绑定 | ⬜ 待验收 |  |  |
| v2-3 | 弹框只问裁决：有结果就不逼人填 | ⬜ 待验收 |  |  |
| v2-4 | 兼容与迁移：旧单、旧调用方、回滚 | ⬜ 待验收 |  |  |
| v2-5 | 看板接线：展示结果与需人工确认 | ⬜ 待验收 |  |  |
| v2-6 | 回归：五项断言与基线不劣化 | ⬜ 待验收 |  |  |
| v2-7 | 需求级验收 | ⬜ 待验收 |  |  |
| v2-8 | 需求级验收 · E2E 覆盖 | ⬜ 待验收 |  |  |
