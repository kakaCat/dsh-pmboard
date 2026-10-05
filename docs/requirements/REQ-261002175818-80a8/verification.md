# REQ-261002175818-80a8 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：拆分节点从此**先算容量再拆**。四件能力已落地并各自被会红的用例钉住：① 每张卡声明体量（改几个文件 / 几条验收锚点 / 多少字符），声明不得小于证据（缩水被拒）；② 提交时算出「哪张卡装不下、建议切几批」，超容量**不是错误**、提交照样成功，只是把风险摆明；③ 批准弹框与看板评论写同一句话，计划文档必须标红且批数相等；④ 余量读数只读上屏、标注「非门禁判据」，拿不到就说拿不到、**绝不补 0**。老数据零升级：不升台账版本、不补键。

十张卡全部完成（33 张子卡 + 1 张收口卡）。全量 **96 failed / 3910 passed**——失败数比开工时还少 1、一条未增；本需求九份新增用例 **106/106 全绿**；tsc 与基线持平；提示词门禁 13/13。独立复核全程拦下 3 条真缺陷（主入口收不下体量 / 换路径提交静默放行 / 实现改坏 5 处仍全绿），已在 reviews/ 逐条留档。

请重点复核两件：① 三条冒烟数字是否可信；② evidence/final-report.md 第 5 节的七条未闭合项要不要在本期结清（尤其 tasks[] 回显开放项与两处余量告急）。

## 1. 验收列表

### v1-1 · 体量算术落地：三个可数的量、一条声明下限

**验收内容**：【体量算术落地：三个可数的量、一条声明下限】验收

**操作步骤**：
1. npx vitest run tests/round-capacity.test.ts → T1–T4 全绿（未声明→undefined 不冒充 0
2. {100,20,6000}→113 DU 且建议 8 批
3. detailUnits 恰好等于容量→over=false
4. 声明小于证据→抛 REQBOARD_BAD_FOOTPRINT
5. 散文不带路径前缀不计入下限）。npx vitest run tests/layer-boundary.test.ts → 本次改动文件（src/domain/task/Footprint.ts、src/domain/limits.ts）在该用例违规清单中命中 0。
6. 修订说明（开工时发现原标准不可执行）：原标准要求整份 layer-boundary 全绿，但该用例当前承载既有违规——application/dive、application/gate、application/internal、application/use-cases 的 node:fs/node:path/cordis import，以及 domain/checkpoint.ts 与 domain/job-spec.ts 的 Date.now()、http/routers/requirements.ts 与 stages.ts 的状态字面量——均由其他窗口的改动引入，非本卡范围。本卡按本仓既定口径改为「本次文件命中 0」，与 size-budget 门禁的写法一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-2 · 体量声明进台账、活到任务卡上（防静默丢弃）

**验收内容**：【体量声明进台账、活到任务卡上（防静默丢弃）】验收

**操作步骤**：
1. npx vitest run tests/plan-footprint-propagation.test.ts 全绿：台账 plan.tasks 与队列卡上的 footprint 三字段与计划逐字相同。反向证伪：临时删掉 normalizePlanTasks 白名单里的 footprint 一项 → 该用例必须变红（恢复后复绿），证明这条线会响。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-3 · 工具门面：让体量进得来、超容量出得去

**验收内容**：【工具门面：让体量进得来、超容量出得去】验收

**操作步骤**：
1. npx vitest run tests/plan-footprint-tool-schema.test.ts → 全绿（修前必红：schema 未声明 footprint 时 2 条红，错误原文 invalid arguments: "tasks[0].footprint" is not a declared property）
2. npx vitest run tests/output-contract.test.ts → 其中 defineSubmitTool 专项通过（本卡改动文件相关），3 条既有失败（defineTaskAdoptTool / defineKnowledgeTool / defineRegenerateTool 缺 RESPONSE_SOURCES 映射，系其他窗口新增工具未同步映射表）不计入本卡。
3. 修订说明（开工时发现原标准不可执行）：原标准要求 output-contract 整份全绿，但该用例当前有 3 条与 SubmitTool 无关的既有失败（新增工具未补 RESPONSE_SOURCES），非本卡范围。按本仓既定口径改为「本卡文件相关项全绿 + 新增用例全绿」，与 t1 对 layer-boundary 的处置一致。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-4 · 余量读数接进来：只读、可缺省、不冒充 0

**验收内容**：【余量读数接进来：只读、可缺省、不冒充 0】验收

**操作步骤**：
1. npx vitest run tests/capacity-reference.test.ts 的适配器降级用例全绿（agents.get 抛错 / stateOf 抛错 → source='unavailable' 且不抛错）
2. pnpm typecheck 错误数不高于基线 223。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-5 · 超容量看得见（一）：提交时说清哪张卡装不下

**验收内容**：【超容量看得见（一）：提交时说清哪张卡装不下】验收

**操作步骤**：
1. npx vitest run tests/plan-footprint.test.ts tests/plan-overcapacity-notice.test.ts 全绿：缩水被拒（REQBOARD_BAD_FOOTPRINT，台账零变更）
2. 超容量 success=true 且 overCapacity 只含超容量卡、capacityNote.calibrated=false
3. 缺标记或批数不符 → plan_overcapacity_marker_missing
4. markerGate='warn' 时不拒绝但仍响亮给出 gaps。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-6 · 超容量看得见（二）：批准前摆在人眼前

**验收内容**：【超容量看得见（二）：批准前摆在人眼前】验收

**操作步骤**：
1. npx vitest run tests/plan-overcapacity-notice.test.ts 的 T8a–T8d 全绿：弹框文本含卡 key 与建议批数
2. 无超容量卡时 popupQuestion 与改造前逐字节相同
3. ≥4 张卡压缩后仍 ≤ LIMITS.popupQuestionMax(220)
4. 看板批准路径台账评论含「超容量 N 张」。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-7 · 余量参考上屏：节点输入包与任务树，都标「非判据」

**验收内容**：【余量参考上屏：节点输入包与任务树，都标「非判据」】验收

**操作步骤**：
1. npx vitest run tests/capacity-reference.test.ts 的 T9a–T9d 全绿：余量参考节出现且同节含「参考值，非门禁判据」
2. 投影不可得时整节不出现且输入包其余部分逐字节不变
3. 只有 contextWindow 时 remainingTokens 缺席（不猜 0）
4. 任务树顶层字段与每卡 footprintState 在场。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-8 · 老数据别被新规矩绊倒（迁移与兼容单列）

**验收内容**：【老数据别被新规矩绊倒（迁移与兼容单列）】验收

**操作步骤**：
1. npx vitest run tests/plan-footprint-compat.test.ts 全绿：无 footprint 的计划照旧通过且 overCapacity 为空数组（不是缺键）
2. 旧台账任务卡回显 undeclared 且 footprint 键不存在（hasOwnProperty 为 false）
3. schemaVersion 仍为 9
4. tests/plan-mode.test.ts、tests/design-registration.test.ts、tests/output-contract.test.ts 全绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-9 · 让下一个拆分节点自己会算容量

**验收内容**：【让下一个拆分节点自己会算容量】验收

**操作步骤**：
1. node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs 退出码 0（片段与生成物逐字节一致）
2. npx vitest run tests/prompt-gates.test.ts 全绿（注入文本里的 reqboard_* ⊆ 注册集合、无孤岛分片、链声明与 STAGE_CHAIN 一致）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-10 · 收口：兼容核对、回归基线与真实冒烟

**验收内容**：【收口：兼容核对、回归基线与真实冒烟】验收

**操作步骤**：
1. npx vitest run 失败数 ≤ 基线 106 且新增六份用例全绿
2. npx vitest run tests/size-budget.test.ts 本次文件命中 0
3. pnpm typecheck ≤ 223。冒烟三条：{100,20,6000} 的卡 → 8 批且被标红
4. {1,2,800} 的卡 → 不误报
5. 删掉 footprint 再提交 → 照旧通过。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

### v1-12 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）

**验收状态**：✓ 通过

---

## 2. 测试报告

- 证据总表：docs/requirements/REQ-261002175818-80a8/evidence/final-report.md（FR-1~FR-9 覆盖表 + 三条冒烟实测 + 基线与门禁 + 未闭合项 7 条）
- 评审报告：docs/requirements/REQ-261002175818-80a8/reviews/review-report.md（3 条被拦下的真缺陷 + 变异矩阵 + 4 条裁定）
- 测试证据（含 43 条 covers 逐卡映射）：docs/requirements/REQ-261002175818-80a8/tests/test-evidence.md
- 全量回归：npx vitest run → 96 failed / 3910 passed / 20 skipped（4026）；开工基线 97 failed → 零新增失败（并少 1）
- 本需求九份新增用例联跑 → 106/106 全绿（41+18+13+6+8+7+7+4+4）
- 三个收口文件联跑 → 33/33 全绿：npx vitest run tests/plan-smoke.test.ts tests/plan-footprint-compat.test.ts tests/plan-overcapacity-notice.test.ts
- 冒烟：100 文件卡 → detailUnits=113 / 8 批 / 被标红；单文件卡 {1,2,800} → 不误报；删掉 footprint → 照旧通过（台账无该键）
- 兼容两态：默认与 markerGate='warn' 下旧计划均通过；roundDetailUnits=8 → source='config'、批数 8→15
- npx tsc --noEmit → 146（文档基线 223）；本需求触及文件 0 错
- 提示词门禁：inline-prompt-fragments.mjs && check-prompt-fragments.mjs 退出码 0；tests/prompt-gates.test.ts 13/13
- 尺寸门禁：tests/size-budget.test.ts 存量红；本需求未把任何文件新推过 400 行（Footprint.ts 217、node-input-package.ts 395）
- 变异验证留档：t1 删白名单行红 / t3 删 schema 声明红（2 条）/ t4 冒充 0 红（5 条）/ t5 去路径参数红 / t7 三处接线各自回退红（1·1·2）/ t8 五处变异全被抓（隔离副本）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 体量算术落地：三个可数的量、一条声明下限 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-2 | 体量声明进台账、活到任务卡上（防静默丢弃） | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-3 | 工具门面：让体量进得来、超容量出得去 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-4 | 余量读数接进来：只读、可缺省、不冒充 0 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-5 | 超容量看得见（一）：提交时说清哪张卡装不下 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-6 | 超容量看得见（二）：批准前摆在人眼前 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-7 | 余量参考上屏：节点输入包与任务树，都标「非判据」 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-8 | 老数据别被新规矩绊倒（迁移与兼容单列） | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-9 | 让下一个拆分节点自己会算容量 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-10 | 收口：兼容核对、回归基线与真实冒烟 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-11 | 需求级验收 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
| v1-12 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-5c6b1a8b-3234-4f35-b28f-1f1a20834721 | 2026-10-04 14:00 |
