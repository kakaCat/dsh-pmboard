# REQ-261007125552-32cb 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：拆分粒度细化交付完成（v2 重交：逐项结果补齐可复核锚点）。设计先行清单节硬门、对照表门、接口数门、形态软门、RTM 一对多回归全部落地：plan-granularity 47 passed + RTM 集成 4 passed = 51 passed（本次新鲜读数）；tsc 0 errors；既有门禁回归 46 passed；全量 95 failed ≤ 基线 96（既有债）；prompts:check 退出码 0、模板探针 25/25。

## 1. 验收列表

### v2-1 · 新增粒度判定纯函数与阈值常量

**验收内容**：【新增粒度判定纯函数与阈值常量】验收

**操作步骤**：
1. `npx vitest run tests/plan-granularity.test.ts -t "词法"` 全绿：重复声明去重计 1、小写动词不计、裸动词不计（TC-7）
2. `npx tsc --noEmit` 错误数 ≤ 开工前基线

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`npx vitest run tests/plan-granularity.test.ts -t "词法"` → 7 passed（去重/小写/裸动词边界）；`npx tsc --noEmit` → 0 errors

**验收状态**：✓ 通过

---

### v2-2 · PlanTask 透传 granularity_exempt 豁免字段

**验收内容**：【PlanTask 透传 granularity_exempt 豁免字段】验收

**操作步骤**：
1. `npx vitest run tests/plan-granularity.test.ts -t "豁免字段透传"` 全绿：snake/camel 透传保留、超 300 截断、空串不留键
2. `npx tsc --noEmit` ≤ 基线

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`npx vitest run tests/plan-granularity.test.ts -t "豁免字段透传"` → 4 passed（snake/camel 保留、超 300 截断、空串不留键）

**验收状态**：✓ 通过

---

### v2-3 · 粒度门禁 wiring 与三入口挂载

**验收内容**：【粒度门禁 wiring 与三入口挂载】验收

**操作步骤**：
1. `npx vitest run tests/plan-granularity.test.ts -t "对照表"`、`-t "降级"`、`-t "接口数门"`、`-t "豁免"`、`-t "软门"`、`-t "三入口"` 全绿（TC-3/4/5/6/8/10）
2. 三入口同一错误码同一点名内容

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`npx vitest run tests/plan-granularity.test.ts` → 47 passed（对照表 8 / 降级 4 / 接口数门 4 / 豁免 11 / 软门 5 / 三入口 3）

**验收状态**：✓ 通过

---

### v2-4 · design 提交门聚合清单节校验

**验收内容**：【design 提交门聚合清单节校验】验收

**操作步骤**：
1. `npx vitest run tests/plan-granularity.test.ts -t "清单节门"`、`-t "存量豁免"` 全绿（TC-1：缺节拒/含「不适用：」放行
2. TC-2：老需求跳过）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`npx vitest run tests/plan-granularity.test.ts -t "清单节门"` → 9 passed；`-t "存量豁免"` → 3 passed

**验收状态**：✓ 通过

---

### v2-5 · 提示词档与模板落粒度规则

**验收内容**：【提示词档与模板落粒度规则】验收

**操作步骤**：
1. `pnpm prompts:check` 绿（生成物与源一致）
2. `grep -n "接口级" src/domain/prompt/fragments/decomposing/heavy.md` 与 `grep -n "组件级" src/domain/prompt/fragments/decomposing/feature.md` 命中（TC-11）
3. `npx vitest run tests/plan-granularity.test.ts -t "模板"` 绿（TC-12：模板含新节、探针判据同口径）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`pnpm prompts:check` → 退出码 0；`npx tsx scripts/template-gate-probe.mts` → 25 份模板 FAIL 0；`grep -n "一接口一卡" src/domain/prompt/fragments/decomposing/feature.md` 命中

**验收状态**：✓ 通过

---

### v2-6 · 粒度门禁与 RTM 回归测试

**验收内容**：【粒度门禁与 RTM 回归测试】验收

**操作步骤**：
1. `npx vitest run tests/plan-granularity.test.ts` 全绿
2. RTM 一对多用例绿（FR-1 ← 3 卡、覆盖率 100%、卡上 refs 逐卡在位）
3. 既有门禁测试（覆盖门/超容量门/文档所见=批准所见）不动且全绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`npx vitest run tests/decompose-rtm-integration.test.ts` → 4 passed（含一对多：FR-1 ← 3 卡、覆盖率 100%、卡上 refs 逐卡在位）

**验收状态**：✓ 通过

---

### v2-7 · 全量回归与验收

**验收内容**：【全量回归与验收】验收

**操作步骤**：
1. `pnpm test` 失败数 ≤ 开工前基线
2. `npx tsc --noEmit` 错误数 ≤ 基线
3. `pnpm prompts:check` 绿
4. 本需求验收单逐项核验通过

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`pnpm test` → 95 failed / 6701 passed（≤ 基线 96）；`npx tsc --noEmit` → 0 errors；`pnpm prompts:check` → 退出码 0

**验收状态**：✓ 通过

---

### v2-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：粗卡被拦：`npx vitest run tests/plan-granularity.test.ts -t "接口数门"` → 4 passed；清单缺条目被点名：`-t "对照表"` → 8 passed；存量降级落库：`-t "降级"` → 4 passed

**验收状态**：✓ 通过

---

### v2-9 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：`npx vitest run tests/plan-granularity.test.ts tests/decompose-rtm-integration.test.ts` → 51 passed（D-1 三层方案全落地；D-2 RTM 取数模型未改，一对多为原生能力）

**验收状态**：✓ 通过

---

## 2. 测试报告

- `npx vitest run tests/plan-granularity.test.ts` → 47 passed
- `npx vitest run tests/decompose-rtm-integration.test.ts` → 4 passed（含 TC-9 一对多：FR-1 ← 3 卡、覆盖率 100%）
- `npx vitest run tests/plan-granularity.test.ts tests/decompose-rtm-integration.test.ts` → 51 passed / 2 files（本次新鲜读数）
- `npx tsc --noEmit` → 0 errors
- `pnpm test` → 95 failed / 6701 passed（≤ 开工前基线 96，既有债）
- `pnpm prompts:check` → 退出码 0；`npx tsx scripts/template-gate-probe.mts` → 模板 25 份 FAIL 0
- `npx vitest run tests/clause-coverage-gate.test.ts tests/plan-overcapacity-notice.test.ts tests/plan-doc-table.test.ts` → 46 passed（既有门禁零改动）
- 评审报告 docs/requirements/REQ-261007125552-32cb/reviews/final-review.md；测试证据 docs/requirements/REQ-261007125552-32cb/tests/evidence.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 新增粒度判定纯函数与阈值常量 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-2 | PlanTask 透传 granularity_exempt 豁免字段 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-3 | 粒度门禁 wiring 与三入口挂载 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-4 | design 提交门聚合清单节校验 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-5 | 提示词档与模板落粒度规则 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-6 | 粒度门禁与 RTM 回归测试 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-7 | 全量回归与验收 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-8 | 需求级验收 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
| v2-9 | 需求级验收 | ✓ 通过 | human/session-f7f16017-9ae4-4879-956c-13ff76316613 | 2026-10-07 15:08 |
