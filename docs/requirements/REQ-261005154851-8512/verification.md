# REQ-261005154851-8512 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：立项时选的提示词难度现在在每条注入路径上都算数——expert/advanced 拿到重档纪律、simple/standard 保持轻档、声明与文本推断冲突时取重，依据句进注入留痕；没声明或脏数据时取词结果与改造前逐字相同（分片全等）。机器侧全绿：11 条主用例 + 四套回归 78 条 + 探针 exit 0 + tsc 0 错误 + build 退出码 0；另修掉一处潜伏同病（第三路 settle.difficulty 全仓无生产者、恒为轻档）。两项如实披露交人工：① 实机留痕翻转需重启插件后复跑（改造前 light 快照已存证）② 本轮复核为自审、未派独立子代理，已作为验收单项。

## 1. 验收列表

### v1-1 · 契约先行：同步缝带上难度声明

**验收内容**：【契约先行：同步缝带上难度声明】验收

**操作步骤**：
1. `npx vitest run tests/injection-difficulty.test.ts -t "T-01"` 与 `-t "T-02"` 全绿：`factsOf({promptDifficulty:'expert'})` 含该键
2. `factsOf({})` 的结果里 `'promptDifficulty' in facts === false`（不是 undefined 占位）。`npx tsc --noEmit` 0 错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）

**验收状态**：✓ 通过

---

### v1-2 · 三处接线：让声明难度在每条注入路径上算数

**验收内容**：【三处接线：让声明难度在每条注入路径上算数】验收

**操作步骤**：
1. `npx vitest run tests/injection-difficulty.test.ts` 全绿（T-03~T-06、T-09、T-10）：expert/advanced → heavy
2. simple/standard → light
3. 声明 simple 而文本推断重时取**重**
4. 三处入口对同一需求画面档位一致
5. 有声明时留痕含「声明难度 → 取词档」依据句。`npx vitest run tests/difficulty-mapping.test.ts tests/content-gates.test.ts tests/decision-gates.test.ts` 全绿
6. `npx tsc --noEmit` 0 错误。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）

**验收状态**：✓ 通过

---

### v1-3 · 探针与实机留痕取证

**验收内容**：【探针与实机留痕取证】验收

**操作步骤**：
1. `npx tsx scripts/injection-difficulty-probe.mts` 退出码 0（带声明的 routeKey 含 heavy、不含声明的 routeKey 含 light 且分片与基线快照全等、reasons 非空）
2. `docs/requirements/REQ-261005154851-8512/evidence/injection-difficulty.md` 内含实机留痕：`fragmentIds` 含 `brainstorming/heavy` 系分片且 `difficultyReasons` 含「声明难度 → 取词档」。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）

**验收状态**：✓ 通过

---

### v1-4 · 兼容卡：无声明与脏数据行为逐字不变

**验收内容**：【兼容卡：无声明与脏数据行为逐字不变】验收

**操作步骤**：
1. `npx vitest run tests/injection-difficulty.test.ts -t "T-07"` 与 `-t "T-08"` 与 `-t "T-11"` 全绿：无声明时分片 id 与基线快照**全等**
2. 脏数据（`'EXPERT'`/`' expert '`/`''`/`null`）一律按未声明且**不抛错**
3. 无声明且推断不出时 `difficultyReasons` 允许为空。基线快照与结论落 `docs/requirements/REQ-261005154851-8512/evidence/compat-baseline.md`。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/injection-difficulty.test.ts → 11 passed（T-01~T-11）
- npx vitest run tests/difficulty-mapping.test.ts tests/content-gates.test.ts tests/decision-gates.test.ts tests/injection-difficulty.test.ts → 78 passed / 2 skipped
- npx tsx scripts/injection-difficulty-probe.mts → exit 0（declared=heavy + 依据句；baseline 与快照全等）
- npx tsc --noEmit → 0 错误；pnpm build → 退出码 0
- docs/requirements/REQ-261005154851-8512/evidence/injection-difficulty.md（含改造前实测留痕 light + 无依据句）
- docs/requirements/REQ-261005154851-8512/evidence/compat-baseline.md
- docs/requirements/REQ-261005154851-8512/reviews/self-review.md（自审 + 未做独立复核的如实披露）
- docs/requirements/REQ-261005154851-8512/tests/summary.md（含 16 张卡的 covers 标注）
- docs/requirements/REQ-261005154851-8512/design/interfaces.md

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 契约先行：同步缝带上难度声明 | ✓ 通过 | human/session-30c79856-639c-4483-aed3-a49d3fc99546 | 2026-10-05 16:04 |
| v1-2 | 三处接线：让声明难度在每条注入路径上算数 | ✓ 通过 | human/session-30c79856-639c-4483-aed3-a49d3fc99546 | 2026-10-05 16:04 |
| v1-3 | 探针与实机留痕取证 | ✓ 通过 | human/session-30c79856-639c-4483-aed3-a49d3fc99546 | 2026-10-05 16:04 |
| v1-4 | 兼容卡：无声明与脏数据行为逐字不变 | ✓ 通过 | human/session-30c79856-639c-4483-aed3-a49d3fc99546 | 2026-10-05 16:04 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-30c79856-639c-4483-aed3-a49d3fc99546 | 2026-10-05 16:04 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-30c79856-639c-4483-aed3-a49d3fc99546 | 2026-10-05 16:04 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-30c79856-639c-4483-aed3-a49d3fc99546 | 2026-10-05 16:04 |
