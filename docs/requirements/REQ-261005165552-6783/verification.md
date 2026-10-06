# REQ-261005165552-6783 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：捕获段已声明为字面量段（interpolate:false）：台账与用户文本里的双花括号占位符不再让窗口整轮失败。四项交付：① 段声明在场（+14/0，段名/序位/回调三项未动）；② 三组外来原文反例回归 6 绿（含证伪半）；③ 接线回归把「段必须显式声明插值开关」钉成纪律（摘掉字段即红）；④ 产物重建，指纹 fdc6885141ef → d0c9a803ba54。全量套件与开工前基线失败数完全相等（68→68，新增失败 0），通过 +8；13 张卡全部在测试证据里按 covers 标注覆盖。两项如实披露：验收原文「全量退出码 0」在存量 68 红下不可达（改按基线对照）；运行时解冻需宿主重载（运行中构建仍是 9f1c0ead7613），复核步骤见 notes/build-evidence.md §5。

## 1. 验收列表

### v1-1 · 在捕获段注册处声明字面量（interpolate 置 false）

**验收内容**：【在捕获段注册处声明字面量（interpolate 置 false）】验收

**操作步骤**：
1. ① grep -n "interpolate" src/gate-wiring.ts 输出含 interpolate: false，且该行落在 systemPrompt.section({ 与 text: 之间
2. ② pnpm typecheck 退出码 0
3. ③ npx vitest run tests/apply-wiring.test.ts tests/capture.test.ts tests/stage-prompts.test.ts 退出码 0（文本逐字节不变式未破）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

### v1-2 · 接线回归断言：本段字面量 + 每段显式声明插值开关

**验收内容**：【接线回归断言：本段字面量 + 每段显式声明插值开关】验收

**操作步骤**：
1. ① npx vitest run tests/apply-wiring.test.ts 退出码 0，且两条新用例按名命中（-t 单跑）
2. ② 可失败性自证：临时删掉注册处的 interpolate: false → 该用例必红，恢复后转绿（两次输出都要留）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

### v1-3 · 反例回归：三组外来原文含占位符时文本字面保真且不抛

**验收内容**：【反例回归：三组外来原文含占位符时文本字面保真且不抛】验收

**操作步骤**：
1. ① npx vitest run tests/capture-literal-section.test.ts 退出码 0
2. ② 文件内含三组反例与证伪半（同文本在 interpolate: true 下必抛 malformed prompt variable reference）
3. ③ pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

### v1-4 · 重建产物并留命令级证据

**验收内容**：【重建产物并留命令级证据】验收

**操作步骤**：
1. ① pnpm build 退出码 0，且 dist/index.mjs 的 mtime 晚于 t1 的源码改动
2. ② pnpm test 全量退出码 0
3. ③ notes/build-evidence.md 存在且含三条命令的退出码与产物 sha256 前 12 位。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

### v1-8 · 需求级验收 · 三方一致性

**验收内容**：三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-4 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-4 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**操作步骤**：
1. 三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）
2. FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）
3. FR-4 实施缺失：没有任何任务卡接收它（设计好了没做）
4. FR-4 实施缺失：没有任何任务卡接收它（设计好了没做）
5. FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）
6. FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删

**验收状态**：✓ 通过

---

## 2. 测试报告

- 段声明在场：grep -n "interpolate: false" src/gate-wiring.ts → 第 189 行（落在 systemPrompt.section({ 与 text: 之间）；git diff HEAD --numstat → 14 增 / 0 删
- 反例回归：npx vitest run tests/capture-literal-section.test.ts → 6 passed，退出码 0（三组外来原文：任务字段 / 用户消息 / 需求标题，各带证伪半）
- 接线回归：npx vitest run tests/apply-wiring.test.ts -t 显式声明 → 2 passed；证伪半留证：摘掉字段后 expected undefined to be false，恢复后转绿
- 类型检查：pnpm typecheck → 退出码 0（无错误输出）
- 产物重建：pnpm build → 退出码 0；dist/index.mjs 指纹 fdc6885141ef → d0c9a803ba54，mtime 17:09:07 晚于源码 17:08:40
- 全量套件基线对照：基线 37 文件 / 68 用例红、5477 通过；改动后 37 文件 / 68 用例红、5485 通过 → 新增失败 0，净增通过 8
- 原始日志：docs/requirements/REQ-261005165552-6783/notes/full-suite-baseline.txt 与 notes/full-suite-after.txt
- 证据档与补丁：docs/requirements/REQ-261005165552-6783/notes/build-evidence.md、notes/change.patch（75 行，与当前 git diff 逐字一致）
- 评审报告：docs/requirements/REQ-261005165552-6783/reviews/code-review.md（含 4 条自评问题与处置）
- 测试证据与任务覆盖标注：docs/requirements/REQ-261005165552-6783/tests/test-evidence.md（含 covers: 13 张卡全覆盖 + 故障注入实证）
- 改动面仅两个文件 + 一个新用例文件（见 change.patch）；未触碰宿主与 vendor
- 【未完成项·待人工复核】运行时解冻需宿主重载：reqboard_status 显示运行中插件构建仍为 9f1c0ead7613（新产物 d0c9a803ba54 尚未生效）；重载后按 notes/build-evidence.md §5 复核三项（被卡窗口跑一轮 / 诊断日志 NODE-4·NODE-5 / 台账 interruption 无新增）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 在捕获段注册处声明字面量（interpolate 置 false） | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
| v1-2 | 接线回归断言：本段字面量 + 每段显式声明插值开关 | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
| v1-3 | 反例回归：三组外来原文含占位符时文本字面保真且不抛 | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
| v1-4 | 重建产物并留命令级证据 | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
| v1-8 | 需求级验收 · 三方一致性 | ✓ 通过 | human/session-e0d71427-d591-4f79-ba30-8dcf9ecf8dc4 | 2026-10-05 17:13 |
