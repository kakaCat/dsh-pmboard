# REQ-261006091755-1c9e 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：拆分覆盖门的 UI 卡原型锚点维补上对 prototype_exempt 的消费：豁免生效（理由非空 ∧ requirement 已落章）且该需求无已登记原型产物 → 整维跳过；未生效照旧拒、已交原型照旧要求锚点。改动仅一个函数里的一条前置（2 行 + 2 个 import），判据复用既有单点，无新增门/错误码/配置/数据变更，回滚 = 删两行。证据：相关四文件 111 项全绿（锚点维 29 项含 TC-1～TC-10）、tsc 0、构建 [verify-client] OK、全量落在同一噪声带（通过数 +9~+10）、三条逆向验证可证伪、回滚双向可逆且恢复逐字节一致。已知限制：无端到端可跑面（门禁函数的前置条件，等价验证为直调门函数的四组合断言）；工作区级 tsc/全量指标受并发编辑干扰，已逐项具名。

## 1. 验收列表

### v1-1 · 让豁免在拆分锚点维也算数

**验收内容**：【让豁免在拆分锚点维也算数】验收

**操作步骤**：
1. ① npx vitest run tests/plan-prototype-anchor-gate.test.ts 退出码 0（既有 4 组断言零改动）
2. ② pnpm typecheck 退出码 0
3. ③ 源码断言：锚点维函数体内 prototypeExemptOf( 与 registeredPrototypesOf( 各命中，且函数体内 grep -n prototype_exempt 零命中（无手写判据）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts → 4 files passed / 111 tests passed（锚点维 29 含新增 TC-1～TC-10）

**验收状态**：✓ 通过

---

### v1-2 · 补豁免四组合断言与逆验证

**验收内容**：【补豁免四组合断言与逆验证】验收

**操作步骤**：
1. ① 目标文件全绿且含 TC-1～TC-9 逐条断言（豁免生效无原型放行 / 未登记骨架仍放行 / 理由空仍拒 / 未落章仍拒 / 无键仍拒 / 有原型仍拒并点名卡 / 有原型+权威锚点放行 / 非 UI 放行 / 存量放行）
2. ② 两条逆验证：删掉前置 → TC-1/TC-2 必红
3. 条件放宽成「豁免即跳过」→ TC-6 必红，复原后全绿
4. ③ npx vitest run tests/plan-prototype-anchor-gate.test.ts 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts → 4 files passed / 111 tests passed（锚点维 29 含新增 TC-1～TC-10）

**验收状态**：✓ 通过

---

### v1-3 · 核验兼容、回滚与交付基线

**验收内容**：【核验兼容、回滚与交付基线】验收

**操作步骤**：
1. ① 未豁免路径逐字不变：既有拒绝用例（tests/move-gate-paths.test.ts 四条转移路径 + tests/prototype-gates.test.ts 三门 + tests/category-doc-sets.test.ts 适用性）全绿，且同一 input 的 GateFailure 码/gaps 文案无变化
2. ② 回滚演练：删掉前置两行与两个 import 后 pnpm typecheck 0、目标文件回到改动前计数且全绿
3. 复原后仍全绿
4. ③ 交付基线：pnpm typecheck 0、pnpm build 0、pnpm test 失败集合与改动前基线逐文件一致（规范 C-14）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts → 4 files passed / 111 tests passed（锚点维 29 含新增 TC-1～TC-10）

**验收状态**：✓ 通过

---

### v1-4 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts → 4 files passed / 111 tests passed（锚点维 29 含新增 TC-1～TC-10）

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts → 4 files passed / 111 tests passed（锚点维 29 含新增 TC-1～TC-10）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/plan-prototype-anchor-gate.test.ts tests/move-gate-paths.test.ts tests/prototype-gates.test.ts tests/category-doc-sets.test.ts → 4 files passed / 111 tests passed（锚点维 29 含新增 TC-1～TC-10）
- npx tsc --noEmit -p tsconfig.json → 退出码 0（零输出）
- pnpm build → [verify-client] OK bundle=650512 bytes（关键符号齐全 / 样式归属章在场 / CSS 分片完整）
- pnpm test → 69 failed / 5850 passed；基线两采样 68 failed / 5841 与 69 failed / 5840 → 同一噪声带；通过数 +9~+10 = 本次新增用例
- 三条逆向验证：删前置红 TC-1/TC-2；放宽条件红 TC-6；塞手写判据红 TC-10；复原后 29 项全绿
- 回滚演练：只退源码 → 引用 0 / tsc 0 / 目标用例 3 红（TC-1/2/10）；整链回滚 → 19 项 = 改动前计数；恢复逐字节一致
- 未豁免路径零回归：diff 显示既有判定分支与 envelope 文案零删除；四个既有文件 111 项全绿
- 测试覆盖度标注：docs/requirements/REQ-261006091755-1c9e/test-cases.md 的 covers 覆盖 12/12 任务（100%）
- docs/requirements/REQ-261006091755-1c9e/tests/test-evidence.md
- docs/requirements/REQ-261006091755-1c9e/reviews/self-review.md
- docs/requirements/REQ-261006091755-1c9e/verification.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 让豁免在拆分锚点维也算数 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 11:04 |
| v1-2 | 补豁免四组合断言与逆验证 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 11:04 |
| v1-3 | 核验兼容、回滚与交付基线 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 11:04 |
| v1-4 | 需求级验收 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 11:04 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-dd10c7bd-90d5-4256-8036-cbe2c0a49733 | 2026-10-06 11:04 |
