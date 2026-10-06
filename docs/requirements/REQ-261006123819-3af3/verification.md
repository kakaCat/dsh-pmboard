# REQ-261006123819-3af3 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：六条 FR 全部落地，判据逐条可跑且已复跑：契约映射补齐并单点化、归档门改按需求状态判定、知识层自检 12 项全过、规范面绝对数字清零并新增 C-28 提交判据、证据模板带工作树指纹、本需求提交带需求 id。全量基线按 FR-2 新口径：本次失败 61 条 ≤ 基线 68 条，新增失败 0，tsc 退出码 0。已知缺口两条（如实登记）：① 部分改动与别窗口在飞改动逐文件交织，未纳入本次提交（清单见 t-f1a4c2 汇报与 reviews/review-log.md）；② 报告类模板仍无机械门禁（见 notes-fr6-template-gate-degradation.md）。

## 1. 验收列表

### v1-1 · 建立集合差基线判据与指纹采集

**验收内容**：【建立集合差基线判据与指纹采集】验收

**操作步骤**：
1. ① npx tsx scripts/test-baseline.mts --refresh → 输出含 HEAD 短哈希与 git diff --stat 摘要，两份基线文件落盘
2. ② npx tsx scripts/test-baseline.mts --check → exit 0 且输出「新增 0 / 消失 0」
3. ③ 反向 RV-5：mv docs/reviews/test-baseline.failures.txt /tmp/ → --check exit 1 且报「没有基线，先 refresh」（不得当作通过），还原后复绿
4. ④ 反向 TC-11：临时把一条已通过用例改成必失败 → --check exit 1 且「新增失败」栏点名该用例，还原后复绿
5. ⑤ npx tsx scripts/kb-probe.mts 的 K10 不报 test-baseline.mts 未归类——本卡在 src/domain/knowledge/operations.ts 的 EXTRA_ENTRIES 登记该脚本
6. ⑥ package.json 不在本卡改动面：三条脚本（baseline:check / baseline:refresh / commit:check）与 C-14 / C-28 的规范条目同批落 t6——否则 buildCoverage（src/domain/knowledge/operations.ts:207-210）会把新脚本算作覆盖缺口、findGaps 报缺失，kb:conventions 新红。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx scripts/test-baseline.mts --check → 本次失败 61 ≤ 基线 68、新增失败 0 / 不再失败 7；--refresh 写 docs/reviews/test-baseline.md + test-baseline.failures.txt（数字单点）；两种模式均打印工作树指纹 HEAD 917b39d + git diff --stat 摘要

**验收状态**：✓ 通过

---

### v1-2 · 工具登记面单点化并补齐 4 条缺失映射

**验收内容**：【工具登记面单点化并补齐 4 条缺失映射】验收

**操作步骤**：
1. ① npx vitest run tests/output-contract.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts → 全绿 exit 0（改动前 output-contract 为 4 failed）
2. ② registry.dir 与磁盘 src/tools 目录集合差集为空、registry.toolName 与 apply() 后 ctx.tools[].name 集合差集为空（测试内含断言）
3. ③ 反向 RV-1：从 TOOL_REGISTRY 删掉 TaskAdopt 一条 → output-contract 红并点名 TaskAdopt，还原后复绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：三文件 53 passed exit 0；RV-1 删 TaskAdopt → 红并点名，还原逐字节一致；registry.dir 与磁盘 27 目录差集空；12 个扫描器假阳性逐键登记并自净

**验收状态**：✓ 通过

---

### v1-3 · 放宽工厂扫描并把 bind/handoff 纳入契约覆盖

**验收内容**：【放宽工厂扫描并把 bind/handoff 纳入契约覆盖】验收

**操作步骤**：
1. ① 放宽后的正则扫到 ≥27 个工厂（改动前 25，漏 Bind/Handoff），断言随 TOOL_REGISTRY.length 走
2. ② npx vitest run tests/output-contract.test.ts → 全绿 exit 0
3. ③ 若报未声明键：按规则处置并把结论写进本卡汇报（纯声明对齐已修 / 已登记留债并说明理由）
4. ④ 近似预告（非判据）：Handoff 的 windowKey 疑似未声明，以本卡实测为准。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：工厂扫描 25 → 27，未登记差集空；正则与设计处方逐字一致；Handoff 的 8 个键实测为内部 helper 返回（假阳性已登记）

**验收状态**：✓ 通过

---

### v1-4 · 删除无写入者的归档时间字段与读取分支

**验收内容**：【删除无写入者的归档时间字段与读取分支】验收

**操作步骤**：
1. ① grep -rn "archivedAt\|archivedBy" src/ tests/ scripts/ → 无输出
2. ② 门禁探针读真实台账记录调 buildGateVerdicts：status=archived 记录 verdict='passed' 且 at 等于该记录 statusHistory 里 archived 事件的 at（设计期实测 87/87 可取值）
3. ③ npx vitest run tests/query-report.test.ts tests/docs-panel.test.ts tests/node-panel.test.ts tests/client-view.test.ts tests/stage-detail.test.ts tests/acceptance-criteria.test.ts → 全绿，且至少一条用例走真实归档状态而非夹具
4. ④ 反向 RV-3：archivedMomentOf 恒返 undefined → verdict 仍 passed 但回执不含 at 键（断言无 at: undefined）
5. 反向 RV-4：判据改回 a?.archivedAt !== undefined → 回到 pending
6. ⑤ pnpm build:client → [verify-client] OK（C-12）
7. ⑥ git diff --stat src/client/styles/ → 为空（零样式改动）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep 字段命中 0；真实台账 87/87 passed 且 at 相符；七文件 254 passed；RV-3/RV-4 实测后逐字节还原；build:client [verify-client] OK；本卡零样式改动

**验收状态**：✓ 通过

---

### v1-5 · 知识层条目/索引/根因修复与生成页压行

**验收内容**：【知识层条目/索引/根因修复与生成页压行】验收

**操作步骤**：
1. ① npx tsx scripts/kb-probe.mts → 0 项失败 exit 0（改动前 5 项失败 K1/K3/K5/K6/K10-C27）
2. ② pnpm kb:check → exit 0 且无 [drift] 行
3. ③ grep -c 'kb-conventions-c-22' docs/knowledge/INDEX.md ≥1 且 grep -c 'kb-0043\|kb-0048' docs/knowledge/INDEX.md = 2
4. ④ INDEX.md 字符数 ≤8000（测得值，含新增 4 行）
5. ⑤ 根因用例：喂含 · 或 → 或超 140 字符的 one_liner → 不落盘条目文件
6. 沉淀路径对非法字符先清洗再截断
7. ⑥ 反向 RV-6/RV-7：删 INDEX 里 kb-0043 行 → K5 红
8. 删 c-22 行 → 新增的完整性检查红
9. 均还原复绿。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：kb-probe 12 项全过（改前 7 项失败）；kb:check exit 0 零 [drift]；INDEX 7627 ≤8000；c-22=1、kb-0043/0048=2；RV-6/RV-7 实测；两处产出孤儿的根因各有用例

**验收状态**：✓ 通过

---

### v1-6 · 规范面改写口径并新增 C-28 提交判据

**验收内容**：【规范面改写口径并新增 C-28 提交判据】验收

**操作步骤**：
1. ① grep -rn "≤ 98\|≤98\|≤ 197\|≤197\|基线 106\|当前 223" docs/knowledge/ docs/guides/ docs/architecture/ → 无输出
2. ② C-14/C-15 段落内不含绝对数字且含指向 docs/reviews/test-baseline.md 的指针
3. ③ npx tsx scripts/kb-conventions-sync.mts --check → exit 0，且 npx tsx scripts/kb-probe.mts 的 K10 不再报 C-27 占位、K11 对 C-28 通过
4. ④ C-28 四要素齐备且命令为 pnpm commit:check --req <REQ-id>
5. ⑤ grep -c 'kb-conventions-c-28' docs/knowledge/INDEX.md = 1
6. ⑥ 历史面豁免复核：grep -rn "≤ 98\|基线 98" docs/requirements/ | wc -l 仍非 0 且逐处确认都在带日期的历史文档内（如实登记为已知事实，不是遗漏）。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：规范性面绝对数字 0（仅 kb-0025 历史项按设计豁免）；C-14/C-15/C-28 四要素齐、命令为 pnpm baseline:check 与 pnpm commit:check；新增 C-29 后 sync --check 零缺口零漂移；本轮唯一真回归已由全量基线抓到并修好

**验收状态**：✓ 通过

---

### v1-7 · 证据模板带工作树指纹并登记降级

**验收内容**：【证据模板带工作树指纹并登记降级】验收

**操作步骤**：
1. ① grep -n "工作树" templates/implementing/test-evidence.md templates/accepting/verification.md → 两处都要求写 HEAD 与 git diff --stat 摘要
2. ② pnpm templates:check → exit 0（只在既有节内加要求、未加节）
3. ③ 本需求验收材料写明「报告类模板无机械门禁」并指向 template-gate-probe.mts:105-112，不带任何「已被门禁保证」的表述。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：两模板既有节内均要求 HEAD + git diff --stat（grep 命中）；templates:check exit 0（OK 6 / FAIL 0）；降级登记文件明确「写了要求 ≠ 已被门禁保证」

**验收状态**：✓ 通过

---

### v1-8 · 提交判据脚本与本需求收尾提交

**验收内容**：【提交判据脚本与本需求收尾提交】验收

**操作步骤**：
1. ① 未提交时 pnpm commit:check --req REQ-261006123819-3af3 → exit 1（FAIL）
2. 提交后 → exit 0（OK），两个方向都验
3. ② git log --oneline --grep=REQ-261006123819-3af3 | wc -l ≥1
4. ③ git show --stat <本需求提交> 的文件集合 ⊆ 本需求改动清单且不含其他需求目录
5. ④ 提交后 git status --porcelain | wc -l 仍非 0（其他窗口的在飞改动），该缺口如实写进验收材料。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：commit:check 两方向实测（FAIL exit 1 / OK exit 0）；git log grep = 1（917b39d）；越界文件 0；提交后 git status 仍 425 项 —— 未纳入提交的改动已逐文件登记

**验收状态**：✓ 通过

---

### v1-9 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：test-baseline --check → 61 ≤ 基线 68、新增失败 0 / 不再失败 7；tsc exit 0 / 0 错；A1–A7 矩阵与 31 条 covers 标注见 tests/acceptance-evidence.md

**验收状态**：✓ 通过

---

### v1-10 · 需求级验收

**验收内容**：本需求已豁免原型（理由：仅把既有但不可达的「已归档」状态变为可达；措辞与样式沿用现有分支，无新增视觉设计；时间取值契约在设计文档 interfaces.md 锁定（用户 2026-10-06 裁定豁免））

**操作步骤**：
1. 本需求已豁免原型（理由：仅把既有但不可达的「已归档」状态变为可达
2. 措辞与样式沿用现有分支，无新增视觉设计
3. 时间取值契约在设计文档 interfaces.md 锁定（用户 2026-10-06 裁定豁免））

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：通过

**验收状态**：✓ 通过

---

### v1-11 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1 只提交本需求改动（部分提交 + 缺口逐文件登记）；D-2 字段与三处分支已删（grep 0）；D-3 规范写口径 + 单点基线指针；D-4 只取「证据带指纹」；D-5 原型豁免（prototype_exempt 非空）；D-6 范围 = 前 5 条 + 指纹一条；D-7 只压索引标签（条目正文未改）；D-8 先按 hunk 级实测、据实测收窄为零风险子集

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/output-contract.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts → 3 passed / 53 passed，exit 0
- npx vitest run 六文件 + tests/archive-gate-wiring.test.ts → 7 passed / 254 passed，exit 0
- npx tsx scripts/kb-probe.mts → 全部通过（12 项检查），exit 0（改动前 7 项失败）
- pnpm kb:check → exit 0，无 [drift] 行；INDEX 7627 字符 ≤8000
- npx tsc --noEmit -p tsconfig.json → exit 0，error TS 0 条
- npx tsx scripts/test-baseline.mts --check → 本次失败 61 条 · 基线 68 条 · 新增失败 0 / 不再失败 7
- pnpm templates:check → exit 0（OK 6 / FAIL 0，双向漂移 0）
- pnpm commit:check --req REQ-261006123819-3af3 → OK（1 条提交 917b39d）exit 0；未提交方向 FAIL exit 1 已实测
- 真实台账门禁探针：分片 50 + JSON 37 = 87 条 archived 全部 verdict=passed 且 at 等于 archived 事件时刻
- grep -rn archivedAt|archivedBy src/ tests/ scripts/ → 命中 0
- docs/requirements/REQ-261006123819-3af3/tests/acceptance-evidence.md（A1–A7 矩阵 + 反向证伪 + 31 条 covers 标注）
- docs/requirements/REQ-261006123819-3af3/reviews/review-log.md（七卡复核结论 + 偏差处置 + 留待独立需求）
- docs/requirements/REQ-261006123819-3af3/notes-fr6-template-gate-degradation.md（报告类模板无机械门禁的降级登记）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 建立集合差基线判据与指纹采集 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-2 | 工具登记面单点化并补齐 4 条缺失映射 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-3 | 放宽工厂扫描并把 bind/handoff 纳入契约覆盖 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-4 | 删除无写入者的归档时间字段与读取分支 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-5 | 知识层条目/索引/根因修复与生成页压行 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-6 | 规范面改写口径并新增 C-28 提交判据 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-7 | 证据模板带工作树指纹并登记降级 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-8 | 提交判据脚本与本需求收尾提交 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-9 | 需求级验收 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-10 | 需求级验收 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
| v1-11 | 需求级验收 | ✓ 通过 | human/session-af0ee362-fa98-4396-a5d7-856681a42843 | 2026-10-06 14:28 |
