# REQ-261007095750-9f48 验收文档

> 自动生成于 reqboard_submit(kind=verification) · 验收单 v1

**交付结论**：口径扩根修复交付完成：PATH_RE 补 src 与 .mts（唯一取数口改一处，两处判据同时生效）。权威读数（v2 忠实口径）：含 src 卡可抽取率 56.6% → 99.6%；零交集建议 165 → 331；冲突门 7 → 57（新命中 50）；依赖边残余盲区 33.7%。四条功能点各有证伪红-绿闭环，本需求引入回归失败 0 条。独立评审「有条件通过、阻塞项 0」，C1–C4 已逐条处置。两个待决问题交验收人裁定：① 文件级口径是否改「区域级」（已知 ≥2 条过严/截断误报）；② 是否加左边界断言（现 vendor 路径被截成 src/**）。

## 1. 验收列表

### v1-1 · 路径抽取口径扩根（唯一取数口改一处）

**验收内容**：【路径抽取口径扩根（唯一取数口改一处）】验收

**操作步骤**：
1. npx vitest run tests/path-extraction-scope.test.ts 全绿（TC-1…TC-5）
2. grep -n "src" src/application/internal/conflict-check.ts 命中 PATH_RE 所在行且扩展名表含 mts
3. grep -rn "function declaredFiles" src/ 只输出一处
4. 证伪：把根改回四根后该文件至少 2 例失败（贴输出摘要），改回后恢复绿

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/path-extraction-scope.test.ts → 7 passed；证伪：根改回四根 → 4 例失败，还原后逐字节一致；grep export function declaredFiles( 全仓恰好 1 处；tsc 本卡文件 0 错

**验收状态**：✓ 通过

---

### v1-2 · 两处判据接线并各自补可证伪用例

**验收内容**：【两处判据接线并各自补可证伪用例】验收

**操作步骤**：
1. npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts 全绿
2. 证伪：把 PATH_RE 的 src 根去掉后重跑 → 两条新用例必须红（贴输出摘要）
3. 冲突门拒绝码为 REQBOARD_FILE_CONFLICT
4. 补上依赖后不再冲突

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx vitest run tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts → 2 passed / 19 tests；证伪：去掉 src 根 → 恰好 3 条新用例红；端到端拒码 REQBOARD_FILE_CONFLICT 且落库 0 张；独立评审确认 fixture 改动属合法适配

**验收状态**：✓ 通过

---

### v1-3 · 真实数据读数（扩根前后对照）并留证据

**验收内容**：【真实数据读数（扩根前后对照）并留证据】验收

**操作步骤**：
1. 跑 `npx tsx docs/requirements/REQ-261007095750-9f48/tests/readings.mts` → 输出含四项读数：含 src 卡数（≈251）、可抽取率（改前 ≈56.6% / 改后 ≥99%）、零交集建议条数（改前/改后）、冲突门命中数（改前/改后）与新命中数
2. 再用 `grep -c "两端点名" docs/requirements/REQ-261007095750-9f48/tests/real-data-readings.md` 与 `grep -n "不回溯" 同文件` 确认证据文件里写了新命中的判定档位与「主路径不回溯、回退重拆会重判」的限定
3. 文件内必须贴该命令与输出摘要。

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：npx tsx docs/requirements/REQ-261007095750-9f48/tests/readings.mts → 含 src 卡 251 · 可抽取 142(56.6%)→250(99.6%) · 零交集 165→331 · 冲突门 7→57（新命中 50）；grep 确认证据含三档判定表与「不回溯」限定（回退重拆会重判）

**验收状态**：✓ 通过

---

### v1-4 · 文档边界同步与收口读数（C-11/C-14/C-15）

**验收内容**：【文档边界同步与收口读数（C-11/C-14/C-15）】验收

**操作步骤**：
1. grep -n "src/ 盲区" docs/architecture/doc-quality-gates.md 不再出现未修表述且改写为已覆盖 + 判据入口
2. 说明书机制备忘含口径变更与扩根前后读数
3. npx tsc --noEmit -p tsconfig.json 本需求文件 0 错
4. pnpm build 退出码 0 且 dist/index.mjs 与 lib/client.js 均更新
5. 全量集合差逐条归因、本需求引入 0 条

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：grep 领域篇 0 处未修表述、边界表 4 行已更新；说明书含更正后读数；pnpm build exit 0；tsc 本需求 0 错；集合差新增 11 条均属并发窗口面、本需求 0 条

**验收状态**：✓ 通过

---

### v1-5 · 需求级验收

**验收内容**：需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**操作步骤**：
1. 需求级：交付结论可复核（证据齐全、与设计一致、无范围蔓延）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：需求级四项逐条有读数：新用例可证伪（两条红-绿闭环，独立评审复跑确认）；真实数据对照齐（v2 忠实口径）；tsc 本需求 0 错；领域篇不再列该盲区为未修。已知代价（文件级口径、≥2 条过严/截断误报）与两个待决问题已响亮报出

**验收状态**：✓ 通过

---

### v1-6 · 需求级验收

**验收内容**：与裁定对照（逐条说明如何落实）

**操作步骤**：
1. 与裁定对照（逐条说明如何落实）

**预期结果**：上述步骤全部执行成功，输出与「验收内容」描述一致即通过

**实际结果**：D-1 单口径扩根已兑现（只改 PATH_RE 一行、两消费者共用、测试断言零交集建议未自建正则）；D-2 单独立项已兑现（独立台账；9dc1 仍 archived 且写入时间更早）；D-3 已知边界升格为待修缺陷已兑现（先修 + 附扩根前后真实读数 + 领域篇改为已覆盖）

**验收状态**：✓ 通过

---

## 2. 测试报告

- npx vitest run tests/path-extraction-scope.test.ts tests/concurrency-limits.test.ts tests/plan-depends-e2e.test.ts tests/doc-gate-e2e.test.ts → 4 passed / 34 tests（7·10·9·8）
- 证伪① 口径扩根：根改回四根 → tests/path-extraction-scope.test.ts 4 例失败；还原 → 7 passed 且逐字节一致（独立评审复跑：还原 PATH_RE → 3 文件 7 条红）
- 证伪② 两处判据：去掉 src 根 → 恰好 3 条新用例红；还原 → 19 passed 逐字节一致
- 端到端：executeDecompose 两卡同写同一 src 文件且互无依赖 → 拒 REQBOARD_FILE_CONFLICT、落库 0 张
- npx tsx docs/requirements/REQ-261007095750-9f48/tests/readings.mts → 含 src 卡 251 · 可抽取 56.6% → 99.6% · 零交集 165→331 · 冲突门 7→57 · 新命中 50 · 依赖边 279 条中 94 条仍不判
- npx tsc --noEmit -p tsconfig.json → 本需求改动文件 0 错（存量 1 条属并发窗口在制）
- pnpm build → exit 0；dist/index.mjs 与 lib/client.js 重建；[verify-client] OK（独立评审另用内容级证据核对 dist 含新口径）
- C-14 集合差：失败 70 vs 基线 68，新增 11 条全部属并发窗口面，本需求引入 0 条
- 独立评审：docs/requirements/REQ-261007095750-9f48/reviews/independent-review.md（506 行，有条件通过、阻塞项 0；含双向核验与 sha256 自证）
- 逐卡证据：docs/requirements/REQ-261007095750-9f48/tests/t1-t2-extraction-and-wiring-evidence.md
- 逐卡证据：docs/requirements/REQ-261007095750-9f48/tests/real-data-readings.md（v2 按评审 C1/C2/C4 更正，含 §7 按验收标准的自证）
- 逐卡证据：docs/requirements/REQ-261007095750-9f48/tests/t4-doc-sync-and-gates.md
- 可复跑脚本：docs/requirements/REQ-261007095750-9f48/tests/readings.mts（不被 vitest 收集、不进 scripts/ 按需清单）
- 文档同步：docs/architecture/doc-quality-gates.md 边界表 4 行、docs/architecture/project-manual.md 机制备忘（更正后读数）
- 评审 C1–C4 处置：C1 改忠实复算并更正「下界/上界」写反；C2 「49 条全真」收敛为「两端点名 50/50、至少 2 条过严/截断误报」；C3 两处代码/测试注释改「冲突族唯一」（requirement.md 两处在 accepting 态无法重交，差异已列明）；C4 两条新边界已登记
- 脚手架缺陷（顺带发现并处置）：立项无条件生成骨架原型 + 假权威 INDEX，而本需求 sides: [] 无 UI；已删除两份文件并留证于 docs/requirements/REQ-261007095750-9f48/tests/scaffolding-skeleton-note.md
- t3 验收标准已按 acceptance-not-executable 门修订：改为给出 readings.mts 命令 + 两条 grep 断言（原写法只列「文件含某些数」）

## 3. 文档完整性检查

✓ 9 类文档齐全

## 4. 验收结果

| 编号 | 验收项 | 状态 | 验收人 | 验收时间 |
|---|---|---|---|---|
| v1-1 | 路径抽取口径扩根（唯一取数口改一处） | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 10:24 |
| v1-2 | 两处判据接线并各自补可证伪用例 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 10:24 |
| v1-3 | 真实数据读数（扩根前后对照）并留证据 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 10:24 |
| v1-4 | 文档边界同步与收口读数（C-11/C-14/C-15） | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 10:24 |
| v1-5 | 需求级验收 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 10:24 |
| v1-6 | 需求级验收 | ✓ 通过 | human/session-b4188f2e-7f77-48c3-8bbc-be5a0ee890d2 | 2026-10-07 10:24 |
