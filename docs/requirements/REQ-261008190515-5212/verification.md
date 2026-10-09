# REQ-261008190515-5212 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：implementing 已退出 vendor 镜像表：heavy 主档由上游镜像（20405 字节）改写为本仓自写完整档，注入文本 23852 → 4656 字符；档案、三处断言、生成物与 P1 基线同批对齐；项目说明书新增本仓实施模式机制备忘；上游原文留档不注入。全量失败数 = 开工前那 18 条（本需求引入 0 条），tsc 0 错。

## 1. 验收列表

### v1-1 · 让 implementing 退出 vendor 镜像表

**验收内容**：【让 implementing 退出 vendor 镜像表】验收

**操作步骤**：
1. ① `node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"` 输出恰为 `accepting,archived`
2. ② `grep -c "executing-plans" scripts/inline-prompt-fragments.mjs tests/prompt-tiers.test.ts` 两文件计数均为 0
3. ③ `npx vitest run tests/prompt-tiers.test.ts` 全绿（④ 组只剩 2 条）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-2 · 把实施阶段的 heavy 主档改写成本仓自写完整档

**验收内容**：【把实施阶段的 heavy 主档改写成本仓自写完整档】验收

**操作步骤**：
1. ① `node -e` 取 `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length` 读数 < 8000（改前 23852）
2. ② 注入文本同时包含 `The Task Loop`、`Common Rationalizations`、`reqboard_task_move`、`reqboard_task_report` 四个关键词
3. ③ `diff -q src/domain/prompt/fragments/implementing/heavy.md src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` 有差异（不再是镜像）
4. ④ `npx vitest run tests/stage-prompts.test.ts` 全绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-3 · 把 overrides 里描述本仓流程的补丁收编进正文

**验收内容**：【把 overrides 里描述本仓流程的补丁收编进正文】验收

**操作步骤**：
1. ① `grep -c "覆盖 [0-9]" src/domain/prompt/fragments/implementing/heavy/overrides.md` 输出 2
2. ② 该文件仍含 `覆盖上文`（`grep -c` ≥ 1）
3. ③ `npx vitest run tests/prompt-tiers.test.ts` 的 ⑥ 注入顺序组全绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-4 · 同步上游档案里的镜像关系

**验收内容**：【同步上游档案里的镜像关系】验收

**操作步骤**：
1. ① `grep -c "heavy 主 skill" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` 输出 2
2. ② `grep -n "不再注入" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` 命中 executing-plans 行
3. ③ `wc -c src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` 仍为 20405

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-5 · 把镜像档断言与路径探针口径同步到新事实

**验收内容**：【把镜像档断言与路径探针口径同步到新事实】验收

**操作步骤**：
1. ① `npx vitest run tests/kb-prompt-wiring.test.ts` 全绿
2. ② `grep -c "task-start" scripts/prompt-path-probe.mts` 输出 0
3. ③ `pnpm prompts:check` 退出码 0

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-6 · 重跑生成器并重刷 P1 基线

**验收内容**：【重跑生成器并重刷 P1 基线】验收

**操作步骤**：
1. ① `node scripts/check-prompt-fragments.mjs` 退出码 0
2. ② 逐键比对 12 键，只有 `implementing/heavy` 变（其余 11 键逐字节相等）
3. ③ `npx vitest run tests/prompt-baseline.test.ts` 全绿
4. ④ `pnpm typecheck` 退出码 0

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-7 · 在项目说明书里写明本仓实施模式

**验收内容**：【在项目说明书里写明本仓实施模式】验收

**操作步骤**：
1. ① `grep -n "本仓实施模式" docs/architecture/project-manual.md` 命中新增节标题
2. ② `grep -c "REQ-261008190515-5212" docs/architecture/project-manual.md` ≥ 1（变更记录行）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-9 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/kb-prompt-wiring.test.ts、tests/prompt-tiers.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/kb-prompt-wiring.test.ts、tests/prompt-tiers.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

### v1-10 · 需求级验收 · 三方一致性

**验收内容**：三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-1 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-6 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-1 实施缺失：没有任何任务卡接收它（设计好了没做）；FR-1 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**操作步骤**：
1. 三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-1 实施缺失：没有任何任务卡接收它（设计好了没做）
2. FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）
3. FR-3 实施缺失：没有任何任务卡接收它（设计好了没做）
4. FR-6 实施缺失：没有任何任务卡接收它（设计好了没做）
5. FR-1 实施缺失：没有任何任务卡接收它（设计好了没做）
6. FR-1 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：（待填写）

**验收状态**：⬜ 待验收

---

## 2. 测试报告

- node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))" → accepting,archived
- npx tsx -e 取 resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length → 4656（改前 23852）
- node scripts/check-prompt-fragments.mjs → exit 0；pnpm prompts:check → exit 0（生成 129 分片一致 + 镜像 OK + 路径探针缺口 0）
- npx tsx scripts/prompt-path-probe.mts --json --specimen → exitCode 0、whitePasses true、agentSurfaceScanned 60
- npx vitest run → 18 failed / 7152 passed（失败集合 = 开工前那 18 条）；pnpm typecheck → exit 0
- P1 基线逐键比对：12 键只 implementing/heavy 变（23852 → 4656），其余 11 键逐字节相等
- wc -c vendor/superpowers/executing-plans/SKILL.md → 20405；与本地上游 v6.4.2 checkout diff -q 无输出
- docs/requirements/REQ-261008190515-5212/tests/verification-evidence.md（7 节 + 26 张卡逐卡 covers 标注）
- docs/requirements/REQ-261008190515-5212/reviews/self-review.md（逐卡复核结论 + 三处主动发现 + 已知缺口）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 让 implementing 退出 vendor 镜像表 | ⬜ 待验收 |  |  |
| v1-2 | 把实施阶段的 heavy 主档改写成本仓自写完整档 | ⬜ 待验收 |  |  |
| v1-3 | 把 overrides 里描述本仓流程的补丁收编进正文 | ⬜ 待验收 |  |  |
| v1-4 | 同步上游档案里的镜像关系 | ⬜ 待验收 |  |  |
| v1-5 | 把镜像档断言与路径探针口径同步到新事实 | ⬜ 待验收 |  |  |
| v1-6 | 重跑生成器并重刷 P1 基线 | ⬜ 待验收 |  |  |
| v1-7 | 在项目说明书里写明本仓实施模式 | ⬜ 待验收 |  |  |
| v1-8 | 需求级验收 | ⬜ 待验收 |  |  |
| v1-9 | 需求级验收 · 孤儿用例 | ⬜ 待验收 |  |  |
| v1-10 | 需求级验收 · 三方一致性 | ⬜ 待验收 |  |  |
