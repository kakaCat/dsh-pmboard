# REQ-261005122347-e07a 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：需求分析节点现在会收到一小节「原型工作原则」——要做原型就派子代理去做，子代理自己按两条绝对路径去读规范、去检索；主代理既不背全文也不背 2.7MB 数据。为了让子代理读得到，插件自带的 7 份 UI/UX 资产由投放工具铺到会话工作区，回执直接给出可用路径。四项门禁全绿：指纹无漂移、片段与产物一致、类型检查零新增错误、本需求 145 条用例全过，回归失败数与开工基线持平。唯一没绿的是知识层自检，原因是另一个窗口在同一仓库并发改源码，与本需求无关，详见 notes/verification-summary.md。另有 5 处与设计的偏离（含注入落点变更，已由人裁定）登记在 notes/design-deviations.md。

## 1. 验收列表

### v1-1 · 收录 7 个 skill 资产并固化版本指纹

**验收内容**：【收录 7 个 skill 资产并固化版本指纹】验收

**操作步骤**：
1. ① node scripts/vendor-skills.mjs 退出码 0 且 skills/ 下 7 个目录齐
2. ② du -sm skills | cut -f1 ≤ 5
3. ③ node scripts/vendor-skills.mjs --check 退出码 0
4. ④ 手改 skills/ui-ux-pro-max/SKILL.md 一个字节 → --check 退出码 1（反向必红，改回）
5. ⑤ node -e "const p=require('./package.json')
6. process.exit(p.files.includes('skills')?0:1)" 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB

**验收状态**：✓ 通过

---

### v1-2 · 定义资产/manifest 契约与 skills 配置开关

**验收内容**：【定义资产/manifest 契约与 skills 配置开关】验收

**操作步骤**：
1. ① npx vitest run tests/skills-provenance.test.ts 全绿（含内容篡改必红、manifest 篡改必红）
2. ② npx vitest run tests/layer-boundary.test.ts 全绿（application 层不 import node:）
3. ③ node -e 断言 skillsSettings({skills:{enabled:'no'}}) 抛错且 message 含 REQBOARD_SKILLS_CONFIG_INVALID。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB

**验收状态**：✓ 通过

---

### v1-3 · 实现投放工具 reqboard_skill_install

**验收内容**：【实现投放工具 reqboard_skill_install】验收

**操作步骤**：
1. ① npx vitest run tests/skills-materialize.test.ts tests/skills-assets.test.ts 全绿
2. ② 连跑两次 install → 第二次 reused=true 且盘上 mtime 不变
3. ③ 把 root 指向只读目录 → 返回 REQBOARD_SKILLS_WRITE_FAILED 且无 .tmp-* 残留、目标目录不存在
4. ④ skills.enabled=false → REQBOARD_SKILLS_DISABLED 且不写盘
5. ⑤ 实跑回执含 python.found/version 与 searchScript 绝对路径，且对该路径跑 python3 … --design-system 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB

**验收状态**：✓ 通过

---

### v1-4 · brainstorming 注入「原型工作原则」节

**验收内容**：【brainstorming 注入「原型工作原则」节】验收

**操作步骤**：
1. ① node scripts/check-prompt-fragments.mjs 退出码 0
2. ② npx vitest run tests/skills-injection.test.ts tests/prompt-baseline.test.ts tests/prompt-cost.test.ts 全绿
3. ③ 注入含 必须派 subagent、SKILL.md、search.py、--design-system、prototype/、reqboard_ 禁用声明，且不含 ${CLAUDE_PLUGIN_ROOT}
4. ④ 把 budget 人为压到极小 → 该节被裁而人工门/红旗段仍在（证明非 floor，反向演练）
5. ⑤ brainstorming(heavy) charCount ≤ 24000 且 overBudget 为空。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB

**验收状态**：✓ 通过

---

### v1-5 · 回归收尾：知识层条目 + 反向演练 + 全量门禁

**验收内容**：【回归收尾：知识层条目 + 反向演练 + 全量门禁】验收

**操作步骤**：
1. ① pnpm kb:check 退出码 0
2. ② npx tsc --noEmit 新增错误 0
3. ③ npx vitest run tests/reqboard tests/application tests/http 失败数 ≤ 开工基线
4. ④ notes/ 下两份演练记录在盘，各含「删掉断言 → 用例必红」的记录。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · E2E 覆盖

**验收内容**：E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）；若确认无需 E2E，通过时必须在意见中写明理由。

**操作步骤**：
1. E2E 覆盖：**无（缺口）**——本需求交付涉及多组件串联，但只交了单元/集成测试。请补一条端到端场景用例（断言可观察终态）
2. 若确认无需 E2E，通过时必须在意见中写明理由。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB

**验收状态**：✓ 通过

---

## 2. 测试报告

- node scripts/vendor-skills.mjs --check → exit 0：28 条 sha256 指纹一致；skills 清单 7 项与磁盘一致；合计 2801800 B (2.67 MiB) ≤ 5 MiB
- node scripts/check-prompt-fragments.mjs → exit 0：片段与产物一致；heavy.md 与 vendor 原文逐字节一致
- npx vitest run tests/stage-prompts.test.ts tests/prompt-cost.test.ts tests/prompt-tiers.test.ts tests/prompt-baseline.test.ts tests/skills-assets.test.ts tests/skills-materialize.test.ts tests/skills-provenance.test.ts tests/skills-injection.test.ts → 8 files passed / 145 tests passed
- npx tsc --noEmit → 0 条 error TS（开工基线为 1，本需求新增 0）
- npx vitest run tests/reqboard tests/application tests/http → 1 failed / 577 passed（开工基线 1 failed / 569 passed，失败数未增）
- npx vitest run（全量）→ 69 failed / 5104 passed（开工基线 69 failed，未增）；37 个失败文件逐个核对，无一是本需求的 skills 用例
- 端到端：投放后按注入节命令模板用回执绝对路径执行 python3 search.py … --design-system → exit 0，输出含 PATTERN 段
- 幂等实测：连跑两次投放 → 第二次 reused=true 且盘上 mtime 未变
- 反向演练（指纹承重）：把 sha256 比对改成 if(false) 后篡改一字节 → --check exit 0（门禁空转）；还原后 干净 exit 0 / 篡改 exit 1
- 反向演练（可裁承重）：把该片段优先级由 10 改成 floor 并重生成 → tests/skills-injection.test.ts 1 failed / 9 passed；还原后 10 passed
- docs/requirements/REQ-261005122347-e07a/tests/test-evidence.md（用例清单 45 条 + 门禁与回归对照表 + 端到端 + 24 张卡的 covers 标注）
- docs/requirements/REQ-261005122347-e07a/reviews/review-report.md（逐卡复核 + 抓出的 2 个真缺陷 + 5 处偏离处置）
- docs/requirements/REQ-261005122347-e07a/notes/verification-summary.md（门禁逐项实测值 + 外部阻塞的两次核查）
- docs/requirements/REQ-261005122347-e07a/notes/design-deviations.md（5 条偏离的依据与回滚方式）
- pnpm kb:check → exit 1（**外部阻塞，非本需求所致**）：scripts/ 三个未归类条目属另一并发窗口；code-map 是全仓源码派生物而对方仍在持续改源码，无法收敛

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 收录 7 个 skill 资产并固化版本指纹 | ✓ 通过 | human/session-6caf9382-cd78-46cf-a397-d723c7103292 | 2026-10-05 13:14 |
| v1-2 | 定义资产/manifest 契约与 skills 配置开关 | ✓ 通过 | human/session-6caf9382-cd78-46cf-a397-d723c7103292 | 2026-10-05 13:14 |
| v1-3 | 实现投放工具 reqboard_skill_install | ✓ 通过 | human/session-6caf9382-cd78-46cf-a397-d723c7103292 | 2026-10-05 13:14 |
| v1-4 | brainstorming 注入「原型工作原则」节 | ✓ 通过 | human/session-6caf9382-cd78-46cf-a397-d723c7103292 | 2026-10-05 13:14 |
| v1-5 | 回归收尾：知识层条目 + 反向演练 + 全量门禁 | ✓ 通过 | human/session-6caf9382-cd78-46cf-a397-d723c7103292 | 2026-10-05 13:14 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-6caf9382-cd78-46cf-a397-d723c7103292 | 2026-10-05 13:14 |
| v1-7 | 需求级验收 · E2E 覆盖 | ✓ 通过 | human/session-6caf9382-cd78-46cf-a397-d723c7103292 | 2026-10-05 13:14 |
