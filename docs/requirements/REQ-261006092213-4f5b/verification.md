# REQ-261006092213-4f5b 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v2

**交付结论**：第二次提交（宿主已换新构建）：这次由运行态机制产出，验收单每项带 agent 实测结果。
提交侧：结构化 results 逐项落章，漏项 / 坏 ref / 重复 / 空结果拒绝并点名到 ref，拒绝时台账零变更。
裁决侧：有结果即零输入通过（opinion 取该项 result），两者皆空记未复核；未复核不计入通过也不得归档（六处判据同口径）。
界面：看板逐项行展示实测结果并按台账原文预填，需人工项不预填且必填；详情页核验表来源三态齐。
兼容：老写法照旧可用，一行环境变量整段回滚，存量在册验收单不回写。
证据：七个相关用例文件 167 项全绿；全量 68 failed 低于基线 106；typecheck 退出码 0；客户端产物已重建。
如实披露：pnpm kb:check 仍退出 1——5 项 probe 失败均属其它未提交工作树；本需求造成的生成物漂移已消除（kb-build --check 零漂移）。

## 1. 验收列表

### v2-1 · 建结果匹配纯函数与体检（接口先行）

**验收内容**：【建结果匹配纯函数与体检（接口先行）】验收

**操作步骤**：
1. npx vitest run tests/result-binding.test.ts 退出码 0：断言 matchStructuredResults 对漏项返回 missing 非空、对坏 ref 返回 unmatched、对重复返回 duplicate、对既无 result 又无 needsHuman+reason 返回 invalid
2. applyStructuredResults 后 item.result 非空且 resultSource==='agent'。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/result-binding.test.ts → 30 passed：引用键按来源匹配（不依赖验收项 id）、六族体检、写入与来源标注、返工续版越界分类；经四轮独立复核定稿

**验收状态**：✓ 通过

---

### v2-2 · 提交侧：results 参数 + 逐项交代硬门 + 落结果

**验收内容**：【提交侧：results 参数 + 逐项交代硬门 + 落结果】验收

**操作步骤**：
1. npx vitest run tests/accept-sheet-tool.test.ts 退出码 0：带 results 提交后每个可预见项 result 非空且 resultSource==='agent'
2. 少给一项返回 REQBOARD_RESULT_COVERAGE_MISSING 且台账 revision 不变。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/accept-sheet-tool.test.ts → 29 passed：带 results 提交后 4 个可预见项 result 非空且 resultSource=agent（bound=4/matched=4/coverage=complete）；漏项回 COVERAGE_MISSING 且台账 revision 不变；坏 ref / 重复 / 空结果各自点名；独立复核两轮修掉并发丢版本

**验收状态**：✓ 通过

---

### v2-3 · 裁决口径与底线：零输入通过 / unverified / 放行判据

**验收内容**：【裁决口径与底线：零输入通过 / unverified / 放行判据】验收

**操作步骤**：
1. npx vitest run tests/accept-sheet-zero-input.test.ts 退出码 0：有结果的项只收 1 问、零输入记 passed 且 opinion===result
2. 无结果项零输入记 unverified 且不触发「全部通过并归档」确认
3. 人改文本时 resultSource==='human' 且 result 更新。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/accept-sheet-zero-input.test.ts tests/domain/req-b918-gates.test.ts → 9 + 17 passed：有结果只收 1 问、零输入记 passed 且 opinion===result；无结果记 unverified 且不弹归档；人改文本记 human；needsHuman 不吃 result 兜底；放行判据六处同口径

**验收状态**：✓ 通过

---

### v2-4 · HTTP 逐项裁决口径放宽与来源写入

**验收内容**：【HTTP 逐项裁决口径放宽与来源写入】验收

**操作步骤**：
1. npx vitest run tests/verdicts-http.test.ts 退出码 0：空 opinion 的通过请求 → 200 且该项 status==='passed'、opinion===item.result
2. 无 result 且空 opinion → unverified（不是 400）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/verdicts-http.test.ts → 6 passed：留空点通过 → 200 且 opinion 取台账 result；无结果留空 → unverified（不是 400）；人改文本 → result 更新且 human；存在未复核项时「验收通过」被拦；响应键集合与既有 400 报文未变

**验收状态**：✓ 通过

---

### v2-5 · 看板逐项行与详情页核验表（预填 + 旗标）

**验收内容**：【看板逐项行与详情页核验表（预填 + 旗标）】验收

**操作步骤**：
1. pnpm build:client 打印 [verify-client] OK
2. 字符串断言逐项行含 data-result-src 且预填值等于台账 result
3. 留空点通过不再被前端拦（附实测截图）
4. needsHuman 行使用 .dsh-pm-flag.verify-pending 类
5. 与 prototypes/verification-result.html#FR-3/#FR-4/#FR-5 逐屏对照并写明差异。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：pnpm build:client → [verify-client] OK bundle=654049；npx vitest run tests/stage-panel.test.ts → 61 passed（data-result-src 三态、预填=台账原文、needsHuman 不预填且必填、前端不拦留空通过）；实测截图 evidence/verification-sheet-1280.png；原型对照见 evidence/prototype-conformance.md

**验收状态**：✓ 通过

---

### v2-6 · 迁移与兼容：老写法、回滚开关、存量单据

**验收内容**：【迁移与兼容：老写法、回滚开关、存量单据】验收

**操作步骤**：
1. npx vitest run tests/verify-item-result.test.ts 退出码 0：不带 results 的提交成功且 results_coverage==='legacy'
2. 置 DSH_REQBOARD_NO_ITEM_RESULT=1 后结构化绑定关闭、裁决回旧口径（evidence[0] 兜底恢复）
3. 存量 sheet 在提交前后快照相等。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/verify-item-result.test.ts → 15 passed：不带 results 提交成功且 coverage=legacy；文本键未命中进 results_unmatched；开关置 1 后提交吃 legacy 且裁决取 evidence[0]（先落章后翻开关的判别性用例）；存量单据进 sheetHistory 且逐字相等

**验收状态**：✓ 通过

---

### v2-7 · 更正过期口径并补机制备忘

**验收内容**：【更正过期口径并补机制备忘】验收

**操作步骤**：
1. grep -n "通过也必须填实际结果" docs/architecture/acceptance-sheet.md 无命中
2. pnpm kb:check 退出码 0。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep -n 通过也必须填实际结果 docs/architecture/acceptance-sheet.md → 零命中（退出码 1）；架构篇补齐硬门范围 / 两层响亮 / 回滚开关 / 六处判据纪律，说明书新增机制备忘一节；npx tsx scripts/kb-build.mts --check → 零漂移

**验收状态**：✓ 通过

---

### v2-8 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：全量 pnpm test → Tests 68 failed | 5933 passed，68 ≤ 基线 106（失败项均为其它未提交工作树）；npx tsc --noEmit → 退出码 0；8 条 FR 全部有落点、无未接收条款；未达成项：pnpm kb:check 仍退出 1，5 项 probe 失败属他方工作树（已在材料中如实披露）

**验收状态**：✓ 通过

---

### v2-9 · 需求级验收

**验收内容**：与原型对照截图（含差异说明）

**操作步骤**：
1. 与原型对照截图（含差异说明）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v2-10 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1 人只做审核员→result 由 agent 落、status 只由人的通道写；D-2 不造执行引擎→只加参数与落章；D-3 提交时一次闭环→硬门与落章同在 submit(kind=verification) 一次调用；D-4 ref 与验收项来源同构→四类 kind，不依赖项 id；D-5 零输入通过→有 result 即 passed 且 opinion 取 result；D-6 含两屏→看板逐项行 + 详情页核验表 + 原型登记；D-7 硬门逐项交代、系统项豁免→六族体检 + 点名到 ref

**验收状态**：✓ 通过

---

### v2-11 · 需求级验收 · 孤儿用例

**验收内容**：孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/accept-sheet-tool.test.ts、tests/result-binding.test.ts、tests/verify-item-result.test.ts。请补 serves: 声明，或说明为何无需映射；通过时意见须写明处置方式。

**操作步骤**：
1. 孤儿用例（缺映射）：以下测试文件未在文件头声明覆盖的条款/卡——tests/accept-sheet-tool.test.ts、tests/result-binding.test.ts、tests/verify-item-result.test.ts。请补 serves: 声明，或说明为何无需映射
2. 通过时意见须写明处置方式。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/result-binding.test.ts tests/accept-sheet-tool.test.ts tests/accept-sheet-zero-input.test.ts tests/verdicts-http.test.ts tests/verify-item-result.test.ts tests/domain/req-b918-gates.test.ts tests/stage-panel.test.ts → 7 files / 167 passed
- pnpm test（全量）→ Test Files 37 failed | 468 passed (508)、Tests 68 failed | 5933 passed (6023)，失败数 ≤ 基线 106（失败项均为其它未提交工作树）
- npx tsc --noEmit -p tsconfig.json → 退出码 0（零输出）
- pnpm build:client → [verify-client] OK bundle=654049 bytes, 关键符号齐全, 样式归属章在场, CSS 分片完整
- docs/requirements/REQ-261006092213-4f5b/evidence/verification-sheet-1280.png（看板逐项行五形态实测截图，2 倍图）
- docs/requirements/REQ-261006092213-4f5b/evidence/prototype-conformance.md（FR-3/FR-4/FR-5 逐屏对照 + 6 条差异 + 复核修点表）
- docs/requirements/REQ-261006092213-4f5b/reviews/review-log.md（三张高风险卡的独立复核记录与处置）
- docs/requirements/REQ-261006092213-4f5b/tests/acceptance-evidence.md（A1–A9 实测矩阵 + 32 张卡 covers 标注 + 运行态说明）
- 宿主运行构建指纹 plugin_build=9b5da9a303aa（新构建已生效，本单为运行态产出）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v2-1 | 建结果匹配纯函数与体检（接口先行） | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-2 | 提交侧：results 参数 + 逐项交代硬门 + 落结果 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-3 | 裁决口径与底线：零输入通过 / unverified / 放行判据 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-4 | HTTP 逐项裁决口径放宽与来源写入 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-5 | 看板逐项行与详情页核验表（预填 + 旗标） | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-6 | 迁移与兼容：老写法、回滚开关、存量单据 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-7 | 更正过期口径并补机制备忘 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-8 | 需求级验收 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-9 | 需求级验收 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:09 |
| v2-10 | 需求级验收 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:03 |
| v2-11 | 需求级验收 · 孤儿用例 | ✓ 通过 | human/session-851897de-d884-4ab8-b689-160d66853eb4 | 2026-10-06 12:09 |
