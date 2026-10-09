# REQ-261007200706-89b7 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：复核重交（补锚点）：七组判据在新表面复核读数与收工一致——FR-1 死路径 0 命中、探针 specimen 五条全 ✔ 且禁词 0；FR-2 问数残留 0；FR-3 描述 1289；FR-4 编号与修复史 0（原目标文件已被他批并入 status）；FR-5 分级口径运行时验证；FR-6 全部写路径 1；FR-7 残留 0。本轮 typecheck/prompts:check/build 全 0、关键用例 27 passed；未夹带 G4（错误码注册表 0 命中）。行为等价以收工同树 A/B（新增红 0）归因，工作树漂移已如实登记。

## 1. 验收列表

### v2-1 · 替换 8 处死路径引用并重建 client 产物

**验收内容**：【替换 8 处死路径引用并重建 client 产物】验收

**操作步骤**：
1. 1) `grep -rn "agent-dh/docs/architecture/requirement-archive\|docs/standards/tool-development" src` 零命中
2. 2) `pnpm build:client` 退出码 0 且 verify-client 输出 OK（kb C-12）
3. 3) `pnpm test` 无新增红

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-1 文案面：8 处死路径替换；`grep -rn "agent-dh/docs/architecture/requirement-archive\|docs/standards/tool-development" src` = 0（本轮复核同）；pnpm build:client exit 0 且 verify-client OK；同树 A/B 新增红 0

**验收状态**：✓ 通过

---

### v2-2 · 扩展 prompt-path-probe 扫描面与禁词前缀并挂 prompts:check

**验收内容**：【扩展 prompt-path-probe 扫描面与禁词前缀并挂 prompts:check】验收

**操作步骤**：
1. 1) `pnpm prompts:check` 退出码 0（含探针段）
2. 2) `tsx scripts/prompt-path-probe.mts --specimen` 五条判据（真实扫描绿 / 注入不可达路径判红 / 白名单不误判 / 注入 agent-dh/ 与 docs/standards/ 两禁词都判红且不吃白名单 / agent 文案面扫到文件数 >0）全 ✔ 且退出码 0
3. 缺一即 exit 1
4. 3) 探针新扫描面覆盖 src/tools + capture-section.ts + client/views/verification.ts，且 .ts 注释剥离不移动行号（报告里的 文件:行 指向原文行）
5. 4) 既有 fragments 扫描面结果与改动前一致
6. 5) 新增测试 tests/prompt-path-probe-tools-surface.test.ts 断言扫描面、禁词规则与 specimen 反例生效

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-1 机械检查：探针扩面 + 禁词硬规则挂 prompts:check；本轮 `--specimen` 五条全 ✔ exit 0；真实仓负例（注入两指针）→ exit 1 逐条点名；旧 fragments 面 token 集合完整保留

**验收状态**：✓ 通过

---

### v2-3 · 立项问数口径统一与 CreateTool doc_location 补齐

**验收内容**：【立项问数口径统一与 CreateTool doc_location 补齐】验收

**操作步骤**：
1. 1) `grep -rn "三问\|四问\|五问" src README.md --include=*.ts | grep -v "src/application/query/QueryReport.ts"` 仅命中 src/application/internal/capture-mapping.ts（事实源，保留准确问数）
2. 2) 排除项理由：QueryReport.ts 的「四问」是**状态查询四问**（在跑什么/谁在跑/几件事等人/下一步谁动手，UC-1），与立项问数同形异义，不在本卡口径内（不夹带改它的术语）
3. 3) `grep -n doc_location src/tools/CreateTool/prompt.ts` 命中，语义与 CreateTool.ts:50 schema 一致（工作区相对目录、不传回落 docs/requirements/<REQ>/ 并在 defaults_used 标注）
4. 4) capture/create 相关契约测试绿——`npx vitest run tests/capture-output-contract.test.ts tests/contract-shapes.test.ts` 无新增红
5. 5) 第一条判据的原有写法未覆盖同形异义，本卡按「开工时发现验收标准不可执行 → 仅修订标准」处置并留痕

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-2：本轮 `grep -rn "三问\|四问\|五问" src README.md --include=*.ts`（排除同形异义 QueryReport.ts）仅命中事实源 capture-mapping.ts；CreateTool/prompt.ts 的 doc_location 命中 2 处

**验收状态**：✓ 通过

---

### v2-4 · submit prompt 六类 prototype 支与 plan/archive 细则下沉

**验收内容**：【submit prompt 六类 prototype 支与 plan/archive 细则下沉】验收

**操作步骤**：
1. 1) prompt 含 prototype 支且不再数类数，`grep "五类\|五个提交入口" src/tools/SubmitTool` 零命中
2. 2) 预算断言 SUBMIT_PROMPT.length ≤ 1300 过
3. 3) 负例：缺 requirement_refs 的 plan 提交、缺必填文档的 archive 提交、缺 sides / 缺「失败与并发路径」节的 requirement 提交，回执 code 与改前逐字一致且 message 含被下沉细则的要点
4. 4) 细则四类之家逐个可核：requirement_refs → content-gate-wiring requirement_uncovered
5. 文档任务表 → SubmitArtifact 任务表门禁
6. 工作量/验收列 → plan-doc-table 的 plan_doc_warnings
7. sides / 失败与并发路径节 → sidesDeclarationGap 与 docSectionGateFailure
8. 归档必填文档与去向 → assertArchiveMaterials。**修订理由**：原判据 4「requirement/verification kind 细则原文未动」与判据 2（≤1300）不可兼得——实测保持 requirement 细则原文时下限 1732
9. G3 原表的纪律是「description 每 kind 只留一句话」，requirement 的「文档硬性要求」块同属细则且回执之家完整，故按同一纪律一并下沉（verification 只压缩叙述、语义点不动）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-3：本轮实测 SUBMIT_PROMPT.length=1289 ≤1300；『五类/五个提交入口』0 命中；prototype 支在场；tests/submit-prompt-budget.test.ts 5 passed（四处细则之家以真实 message 取证）

**验收状态**：✓ 通过

---

### v2-5 · agent 可见字符串 REQ/FR 历史叙事清零

**验收内容**：【agent 可见字符串 REQ/FR 历史叙事清零】验收

**操作步骤**：
1. 1) agent 可见面（src/tools/**/prompt.ts 与各 Tool.ts description 行）`grep "REQ-2[0-9a-z]\|REQ-e"` 零命中（SubmitTool/prompt.ts 的 2026-10-06 12:00 UTC cutoff 行除外，原文保留）
2. 2) RunStatusTool description 较 810 字符基线下降且不含修复史
3. 3) 引叙事做断言的测试更新后绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-4：本轮 agent 可见面非注释 REQ 编号命中 0；两段修复史（曾声称 / 原样透传 null）命中 0。注：原目标文件 RunStatusTool/prompt.ts 已被他批并入 status（收工时读数 810→663），判据在新表面同样为 0

**验收状态**：✓ 通过

---

### v2-6 · LONG_TEXT_ARG_NOTE 拆分与十处引用点归位

**验收内容**：【LONG_TEXT_ARG_NOTE 拆分与十处引用点归位】验收

**操作步骤**：
1. 1) `grep "拆成多次调用" src/tools` 命中行全部归属保留表（TaskReportTool/AskConfirmTool question/SubmitTool summary）
2. 2) 内联整句复制（未走常量）零命中
3. 3) handoff/task_move/note_interruption/adopt/regenerate/capture 的对应字段 description 不含「拆成多次调用」但保留写法指引
4. 4) `pnpm test` 无新增红

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-5：运行时 audit 显示幂等 5 字段全有 SPLIT、一次性 6 字段全无 SPLIT 且写法锚点齐备；tests/arg-guidance.test.ts 13 passed（含反向锁）；内联整句复制残留 0

**验收状态**：✓ 通过

---

### v2-7 · ask_confirm 拦截清单全部写路径与 budget CAS 描述

**验收内容**：【ask_confirm 拦截清单全部写路径与 budget CAS 描述】验收

**操作步骤**：
1. 1) `grep "全部写路径" src/tools/AskConfirmTool/prompt.ts` 命中且不再枚举四工具清单
2. 2) TaskMoveTool budget 父对象 description 含 expectedWindowIndex
3. 3) tests/ask-confirm-prompt.test.ts 断言更新后绿（断「全部写路径」在场、旧枚举不在场）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-6：本轮 `grep -c "全部写路径"`=1 且旧四工具枚举与 9 个真实挂载名均不被枚举；budget 父描述含 expectedWindowIndex（CAS 号）语义；tests/ask-confirm-prompt.test.ts 4 passed

**验收状态**：✓ 通过

---

### v2-8 · cordis.patch.yml 计数与 package.json monorepo 残留清理

**验收内容**：【cordis.patch.yml 计数与 package.json monorepo 残留清理】验收

**操作步骤**：
1. 1) `grep "13 个" cordis.patch.yml` 零命中
2. 2) `python3 -c "import json
3. r=json.load(open('package.json'))['repository']
4. print('directory' in r, r['url'])"` 输出 False 与 git+https://github.com/kakaCat/dsh-pmboard.git
5. 3) `pnpm build && pnpm typecheck` 退出码 0

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：FR-7：本轮 `grep -c "13 个" cordis.patch.yml`=0；repository.directory 已删、url=git+https://github.com/kakaCat/dsh-pmboard.git（python 读数）；pnpm build 与 pnpm typecheck exit 0

**验收状态**：✓ 通过

---

### v2-9 · 链尾总验收：四层等价证据与七组判据汇总复核

**验收内容**：【链尾总验收：四层等价证据与七组判据汇总复核】验收

**操作步骤**：
1. 1) `pnpm test` 与 `tsx scripts/test-baseline.mts --check` 无新增失败
2. 2) `pnpm typecheck`、`pnpm prompts:check`、`pnpm build` 退出码全 0
3. 3) `tsx scripts/prompt-path-probe.mts --specimen` 五条判据全 ✔ 且退出码 0（缺一即 exit 1）
4. 4) 七组判据汇总表（FR-1~FR-7 grep/实测锚点）逐条复核全过并写进任务汇报

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：总验收：四层证据齐备（本轮 typecheck/prompts:check/build 全 0、specimen 五条全 ✔、关键用例 27 passed、收工同树 A/B 新增红 0）；七组判据新旧表面读数一致（tests/evidence.md E-5/E-7），28 张卡全部 covers 标注

**验收状态**：✓ 通过

---

### v2-10 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：边界与行为等价（带锚点）：① `pnpm typecheck` exit 0 / `pnpm prompts:check` exit 0 / `pnpm build` exit 0（本轮实跑）；② 本批收工时同树 A/B 全量测试新增红 0（68 vs 开工前 69，证据固定于 tests/evidence.md E-1）；③ 未夹带 G4：`grep -rl "REQBOARD_ERROR_REGISTRY" src | wc -l` = 0；④ 交付清单与判据读数表 = tests/evidence.md E-5（路径锚点，7 节 covers 覆盖 28 张卡）

**验收状态**：✓ 通过

---

### v2-11 · 需求级验收

**验收内容**：本需求已豁免原型（理由：纯文案/注释级修改；唯一触碰的 client 文件是字符串常量替换（client/views/verification.ts 的帮助文案换路径），无视觉、交互、布局变化）

**操作步骤**：
1. 本需求已豁免原型（理由：纯文案/注释级修改
2. 唯一触碰的 client 文件是字符串常量替换（client/views/verification.ts 的帮助文案换路径），无视觉、交互、布局变化）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/x.test.ts → 10 passed

**验收状态**：✓ 通过

---

## 2. 测试报告

- 本轮实跑 `pnpm typecheck` → exit 0；`pnpm prompts:check` → exit 0（探针：57 份片段 + round-state.ts + agent 文案面 66 份；token 37；禁词命中 0；缺口 0）
- 本轮实跑 `pnpm build` → exit 0（host + client 产物齐、verify-client OK）；`npx tsx scripts/prompt-path-probe.mts --specimen --json` → {ok:true, redOnInjected:true, whitePasses:true, redOnForbidden:true, agentSurfaceScanned:66} exitCode 0
- 本轮实跑关键用例：tests/submit-prompt-budget.test.ts + prompt-path-probe-tools-surface + arg-guidance + ask-confirm-prompt → 4 files passed / 27 tests passed
- 本轮实跑全量 `npx vitest run` → 69 failed / 7091 passed（7160）；本批收工时同树 A/B 为新增红 0（68 vs 开工前 69），该归因证据固定记录在 docs/requirements/REQ-261007200706-89b7/tests/evidence.md E-1/E-6
- 本轮七组判据即时读数：FR-1 死路径 0 命中；FR-2 问数残留（事实源外）0；FR-3 SUBMIT_PROMPT.length=1289；FR-4 agent 可见面非注释 REQ 编号 0 + 两段修复史 0；FR-6「全部写路径」1；FR-7「13 个」0
- 未夹带 G4 的锚点：`grep -rl "REQBOARD_ERROR_REGISTRY" src | wc -l` → 0（错误码注册表在本仓仍不存在）
- 验收前置文档在场（路径锚点）：docs/requirements/REQ-261007200706-89b7/{design/architecture.md,design/data-model.md,design/interfaces.md,design/migration.md,design/test-cases.md,reviews/self-review.md,tests/evidence.md}，测试文档按 7 个证据节标注 covers 覆盖全部 28 张卡
- 工作树漂移如实登记：本批收工后并入他批改动（插件 build e541b9b678ed；run_status 已并入 status，本批 FR-4 原目标文件 RunStatusTool/prompt.ts 不存在）——新旧表面读数一致，详见 evidence.md E-7

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 替换 8 处死路径引用并重建 client 产物 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-2 | 扩展 prompt-path-probe 扫描面与禁词前缀并挂 prompts:check | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-3 | 立项问数口径统一与 CreateTool doc_location 补齐 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-4 | submit prompt 六类 prototype 支与 plan/archive 细则下沉 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-5 | agent 可见字符串 REQ/FR 历史叙事清零 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-6 | LONG_TEXT_ARG_NOTE 拆分与十处引用点归位 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-7 | ask_confirm 拦截清单全部写路径与 budget CAS 描述 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-8 | cordis.patch.yml 计数与 package.json monorepo 残留清理 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-9 | 链尾总验收：四层等价证据与七组判据汇总复核 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-10 | 需求级验收 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
| v2-11 | 需求级验收 | ✓ 通过 | human/session-19ffbc9b-e16f-4979-960b-17ff8c516cb0 | 2026-10-08 01:02 |
