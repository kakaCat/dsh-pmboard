# REQ-261006201508-5cb6 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：交付结论：把「工具清单」从四处手写收敛为一处事实源 + 两条派生校验——README 工具表 27 行六组、四处计数校准到 27、注册日志改为从 TOOL_REGISTRY 派生，新增两条守卫用例（8 用例）。三条逆验证各自按点名要求红并逐字节还原；零工具行为变更。两处例外照实报：工作区被另一处未提交改动并发编辑，typecheck 3 处与 output-contract 1 条为外来红，不在本需求改动面。

## 1. 验收列表

### v1-1 · 按登记面重写 README 工具表并校准计数

**验收内容**：【按登记面重写 README 工具表并校准计数】验收

**操作步骤**：
1. ① README 表内 reqboard_ 行数 = 27（grep -c 计数）
2. ② README 全文名字集合与 TOOL_REGISTRY 的 toolName 集合双向差集为空（comm -13 两条命令均无输出）
3. ③ grep -c reqboard_advance README.md 输出 0
4. ④ README.md 与 package.json 中「13 个」「21 个」命中数均为 0，且「27 个」在 README 出现 ≥3 次、在 package.json description 出现 ≥1 次
5. ⑤ 表内可见 archive_amend / handoff / skill_install / task_refs 四个工具名。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：README 工具表 27 行六组、三处计数与 package.json 描述校准到 27；表内行数 27、双向差集 0、幽灵名 0、旧计数 0；子卡 dev/review 各 1 段通过

**验收状态**：✓ 通过

---

### v1-2 · 让注册日志从登记面派生

**验收内容**：【让注册日志从登记面派生】验收

**操作步骤**：
1. ① grep -n '13 → 9' src/tools/index.ts 无输出
2. ② src/index.ts 的注册日志行含 TOOL_REGISTRY.length，且该行不含数字字面量 (13)
3. ③ pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：注册日志改为从 TOOL_REGISTRY 派生（工具面出口再导出登记面）；grep '13 → 9' 命中 0、字面量名单残留 0；apply-wiring 等三文件 53 用例绿；本卡两文件类型零错误

**验收状态**：✓ 通过

---

### v1-3 · 新增 README 工具面校验用例

**验收内容**：【新增 README 工具面校验用例】验收

**操作步骤**：
1. ① pnpm vitest run tests/readme-tool-face.test.ts 全绿
2. ② 逆验证：临时从 README 删掉 reqboard_kb 那一行 → 该用例红且失败消息含 reqboard_kb，还原后复绿
3. ③ 逆验证：临时加一行工具名 reqboard_advance → 红且消息点名该名，还原后复绿
4. ④ 用例源码内不出现字面量 27 作为断言常量。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：新增 tests/readme-tool-face.test.ts 5 用例：正向 5 passed；逆验证删 reqboard_kb 行 → 红且点名、加幽灵名 → 红且点名；两条均 md5 校验还原后复绿

**验收状态**：✓ 通过

---

### v1-4 · 新增注册日志派生校验用例

**验收内容**：【新增注册日志派生校验用例】验收

**操作步骤**：
1. ① pnpm vitest run tests/registry-log.test.ts 全绿
2. ② 逆验证：把 src/index.ts 的日志改回字面量 (13) 与 19 个名字 → 该用例红，还原后复绿
3. ③ pnpm typecheck 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：新增 tests/registry-log.test.ts 3 用例：真的执行 apply() 捕获注册日志行，断言 N 与名单都等于登记面；正向 3 passed；逆验证改回字面量 (13) → 红且点名 25 个缺失工具，还原后复绿

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：整体：27 个工具的名字、schema、返回体、错误码逐条未变（零行为变更）；文档四处计数与登记面一致；两条派生校验就位。两处例外照实报：typecheck（3 处）与 output-contract（1 条 archive_submit）为工作区外部在制改动的红，不在本需求改动面；T-11「README 可读性」属人工判据待验收人看

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1（先梳理再校准）：27 个工具的全景（6 组 + 阶段/闸门口径 + 漂移点）已在交付对话给出，随后 README 表与四处计数按登记面校准——判据「表内行数 27 / 双向差集 0」绿。D-2（feature / expert / 文档落 docs/requirements/<REQ>/）：实落 docs/requirements/REQ-261006201508-5cb6/（requirement + decomposition + design 五份 + tasks 四张 + reviews/tests 各一份），rtm-lifecycle.yml 的 category: feature 与台账 answers 一致

**验收状态**：✓ 通过

---

### v1-7 · 需求级验收 · 三方一致性

**验收内容**：三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**操作步骤**：
1. 三方一致性（做什么 × 怎么做 × 实际做了什么）：以下对不上——FR-2 实施缺失：没有任何任务卡接收它（设计好了没做）。请补设计、补实施、或显式登记为不做。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/readme-tool-face.test.ts tests/registry-log.test.ts → Test Files 2 passed / Tests 8 passed
- npx vitest run tests/apply-wiring.test.ts tests/tools-dispatch.test.ts → 11 passed（工具注册名单与目录仍与登记面一致）
- npx vitest run tests/output-contract.test.ts → 42 条中 1 条红：archive_submit 说明书更新点校验报「path 必须为路径#锚点形态」。归属为外部在制改动（同刻 tsc 报 src/application/use-cases/SubmitArchive.ts 第 206 行 Cannot find name manualUpdateLabelOf），不在本需求改动面
- README 表内 reqboard_ 行数 = 27（grep -c '^| `reqboard_' README.md）
- 双向差集 0 条：README 全文反引号包裹的工具名集合 == src/tools/registry.ts 的 toolName 集合
- grep -c reqboard_advance README.md = 0（幽灵名已删）；grep -c '13 个|21 个' README.md package.json = 0 / 0
- 逆验证 A（删一行）：临时删掉 README 里 reqboard_kb 那一行 → 红，消息「表内缺行：reqboard_kb」；md5 还原逐字节一致后复绿 5 passed
- 逆验证 B（加幽灵名）：临时加一行 reqboard_advance → 红，消息「README 多：reqboard_advance」与「表内多行：reqboard_advance」；还原后复绿
- 逆验证 C（日志写死）：把 src/index.ts 注册日志临时改回字面量 (13) 与 2 个名 → 红，消息「日志写 13 个 / 登记面 27 条」并点名 25 个缺失工具；md5 还原逐字节一致后复绿 3 passed
- git status --short 改动面：README.md / package.json / src/index.ts / src/tools/index.ts（改造）+ tests/readme-tool-face.test.ts / tests/registry-log.test.ts（新增）
- npx tsc --noEmit：3 处错误全在外部在制文件（SubmitArchive.ts / client/views/panels/docs.ts / tests/helpers/tool-deps.ts），本需求 6 个改动文件零错误
- docs/requirements/REQ-261006201508-5cb6/tests/test-evidence.md：环境指纹（HEAD d0f01d6 / 同刻工作树 156 条脏条目）+ 命令原文 + 逐项读数 + 三条故障注入记录 + 14 张卡的 covers 标注（14/14）
- docs/requirements/REQ-261006201508-5cb6/reviews/self-review.md：八维度逐项结论 + 4 条问题清单（2 条本需求内已修、2 条记账不认领）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 按登记面重写 README 工具表并校准计数 | ✓ 通过 | human/session-be51186a-1e9c-49ba-8c20-144c14c224aa | 2026-10-06 20:55 |
| v1-2 | 让注册日志从登记面派生 | ✓ 通过 | human/session-be51186a-1e9c-49ba-8c20-144c14c224aa | 2026-10-06 20:55 |
| v1-3 | 新增 README 工具面校验用例 | ✓ 通过 | human/session-be51186a-1e9c-49ba-8c20-144c14c224aa | 2026-10-06 20:55 |
| v1-4 | 新增注册日志派生校验用例 | ✓ 通过 | human/session-be51186a-1e9c-49ba-8c20-144c14c224aa | 2026-10-06 20:55 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-be51186a-1e9c-49ba-8c20-144c14c224aa | 2026-10-06 20:55 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-be51186a-1e9c-49ba-8c20-144c14c224aa | 2026-10-06 20:55 |
| v1-7 | 需求级验收 · 三方一致性 | ✓ 通过 | human/session-be51186a-1e9c-49ba-8c20-144c14c224aa | 2026-10-06 20:55 |
