# REQ-261008143952-65dd 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：vendor/superpowers 14 份原文由 v6.3.0 升到 v6.4.2（commit 8ca22dba…），8 份字节变、6 份不变。唯一改变注入行为的是 implementing 节点：executing-plans 20405 字节镜像进 fragments/implementing/heavy.md。新版引入四类本仓不可执行项（8 个 superpowers:* 悬空引用、上游 scripts/task-start/done、Continuous execution 不暂停、ledger/BASE/commit），一律由新增 overrides「覆盖 10」收口，上游原文保持逐字节保真。连锁同步：生成物 129 条、ATTRIBUTION 档案、三处测试引用、P1 基线（只 implementing/heavy 一键变）。实测代价：implementing/heavy/feature 注入 5214 → 23852 字符（预算 24000，余量 148）。门禁与路径探针 exit 0，本需求范围 269 条测试全绿，tsc 0 错误。全量单测 18 条红为仓库既有状态（HEAD 干净 worktree 同批 22 条），本需求零新增失败。三处需人知情：① 为消除探针门禁回归，改了计划外文件 scripts/prompt-path-probe.mts（仅按既有先例登记两个确定脚本名）；② 设计文档「126 条」「唯一 1 条记录变化」两处数字实测为 129 条与 2 条，已按事实更正（未改设计决策）；③ 全量单测开工前基线未采集，改用 HEAD worktree 等价基线归因。

## 1. 验收列表

### v1-1 · 同步 14 份 vendor 原文到 v6.4.2

**验收内容**：【同步 14 份 vendor 原文到 v6.4.2】验收

**操作步骤**：
1. ① for 循环对 14 份逐份 diff -q 源与目标，全部无输出
2. ② 目标文件字节数与本地源一致（wc -c 逐份相等）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-2 · 同步 implementing/heavy.md 镜像

**验收内容**：【同步 implementing/heavy.md 镜像】验收

**操作步骤**：
1. ① node scripts/check-prompt-fragments.mjs 输出 OK 且 exit 0（不得出现 heavy.md 与 vendor 原文不一致）
2. ② diff -q 两份无输出

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-3 · 新增 overrides「覆盖 10」收口新版冲突

**验收内容**：【新增 overrides「覆盖 10」收口新版冲突】验收

**操作步骤**：
1. ① grep 命中「覆盖 10」且三处冲突关键词（superpowers: 悬空引用 / 不暂停 / ledger）均在条目内
2. ② npx vitest run tests/prompt-tiers.test.ts 的 ⑥ 注入顺序组绿（heavy → overrides → 类型档 → iron-rules）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-4 · 重跑生成器产出 generated/fragments.ts

**验收内容**：【重跑生成器产出 generated/fragments.ts】验收

**操作步骤**：
1. ① 命令输出 wrote src/domain/prompt/generated/fragments.ts (126 fragments,
2. ② node scripts/check-prompt-fragments.mjs exit 0
3. ③ 再跑一次生成器后 git diff --exit-code 产物为空（幂等）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-5 · 更新 ATTRIBUTION.md 档案

**验收内容**：【更新 ATTRIBUTION.md 档案】验收

**操作步骤**：
1. ① grep 命中 v6.4.2 与 8ca22dba9a94f28898bbce59f2537ff4d87c747d
2. ② 清单 14 行的字节数与 wc -c src/domain/prompt/vendor/superpowers/<skill>/SKILL.md 逐份相等

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-6 · 更新三处测试引用

**验收内容**：【更新三处测试引用】验收

**操作步骤**：
1. npx vitest run tests/prompt-tiers.test.ts tests/stage-prompts.test.ts 全绿（含 ⑤「light 不含 heavy 独有要素」与 ⑥ 注入顺序组）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-7 · 重刷 P1 基线快照

**验收内容**：【重刷 P1 基线快照】验收

**操作步骤**：
1. ① npx vitest run tests/prompt-baseline.test.ts 全绿
2. ② 逐键比对确认只有 implementing/heavy 的值变（影响面哨兵）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-8 · 全量回归与注入抽检

**验收内容**：【全量回归与注入抽检】验收

**操作步骤**：
1. ① 门禁 exit 0
2. ② npx vitest run 全绿
3. ③ 抽检输出含三个关键词、charCount=23158、无 overBudget
4. ④ overrides 三条收口文案逐条在场并已人工复核

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-10 · 需求级验收

**验收内容**：本需求已豁免原型（理由：本需求为提示词分片更新，无界面改动；标 frontend 是因为 vendor 原文含前端提示（原型 / 组件树纪律），但不产生新的 UI 界面，故豁免原型）

**操作步骤**：
1. 本需求已豁免原型（理由：本需求为提示词分片更新，无界面改动
2. 标 frontend 是因为 vendor 原文含前端提示（原型 / 组件树纪律），但不产生新的 UI 界面，故豁免原型）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-11 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-12 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/prompt-tiers.test.ts、tests/stage-prompts.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/prompt-tiers.test.ts、tests/stage-prompts.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

## 2. 测试报告

- node scripts/check-prompt-fragments.mjs → OK: generated/fragments.ts 与 fragments/**.md 一致；heavy.md ↔ vendor 原文逐字节一致（exit 0）
- npx tsx scripts/prompt-path-probe.mts → OK 路径可达 + 禁词前缀：token 40 个，禁词命中 0；缺口 0（exit 0）
- npx vitest run 6 个文件（prompt 五件套 + 探针）→ Test Files 6 passed，Tests 269 passed
- node scripts/inline-prompt-fragments.mjs → wrote generated/fragments.ts (129 fragments)；连跑两次 sha256 相同（幂等）；条数守恒 129=HEAD 基线
- 基线哨兵：baseline-p1.json 逐键比对只有 implementing/heavy 变，其余 11 键逐字未变
- 注入抽检：charCount=23852 ≤ 24000、overBudget=undefined、四关键词在场、fragmentIds 顺序正确
- npx tsc --noEmit → exit 0
- 全量 npx vitest run → 18 failed / 7154 passed；同批 11 文件在 HEAD 干净 worktree 为 22 failed → 既有状态，本需求零新增失败
- 评审报告：docs/requirements/REQ-261008143952-65dd/reviews/self-review.md
- 测试证据（含 §10 逐卡 covers 标注 31 行）：docs/requirements/REQ-261008143952-65dd/tests/verification-evidence.md
- 任务卡文档：docs/requirements/REQ-261008143952-65dd/tasks/（8 父卡 + 23 子卡）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 同步 14 份 vendor 原文到 v6.4.2 | ⬜ 待验收 |  |  |
| v1-2 | 同步 implementing/heavy.md 镜像 | ⬜ 待验收 |  |  |
| v1-3 | 新增 overrides「覆盖 10」收口新版冲突 | ⬜ 待验收 |  |  |
| v1-4 | 重跑生成器产出 generated/fragments.ts | ⬜ 待验收 |  |  |
| v1-5 | 更新 ATTRIBUTION.md 档案 | ⬜ 待验收 |  |  |
| v1-6 | 更新三处测试引用 | ⬜ 待验收 |  |  |
| v1-7 | 重刷 P1 基线快照 | ⬜ 待验收 |  |  |
| v1-8 | 全量回归与注入抽检 | ⬜ 待验收 |  |  |
| v1-9 | 需求级验收 | ⬜ 待验收 |  |  |
| v1-10 | 需求级验收 | ⬜ 待验收 |  |  |
| v1-11 | 需求级验收 | ⬜ 待验收 |  |  |
| v1-12 | 需求级验收 · 孤儿用例 | ⬜ 待验收 |  |  |
