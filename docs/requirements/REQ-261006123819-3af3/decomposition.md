# 拆分计划（REQ-261006123819-3af3）

> 目标 + 做法一句话：把审计报告前 5 条优化项 + 1 条轻量约束，按"先立度量、再改判据、最后收尾提交"
> 拆成 8 张卡分 4 批落地，每张卡都能用一条命令判绿。

## 编号口径

覆盖对照靠编号跨文档拉齐；引用必须能在对方文档里查到——查不到 = 悬空引用，等同于没写。

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款（本需求 FR-1～FR-6） |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（D-1～D-6） |
| TC-x | design/test-cases.md 用例表 | 测试用例（TC-1～TC-21，RV-1～RV-7 为反向证伪） |
| t-x | 本文档任务表 | 任务 |

**本需求不使用 I-x / P-x / C-x / S-x / T-x / UC-x / M-x 编号**，理由（不是遗漏，是设计已声明的边界）：

- `design/interfaces.md` 首节明确「**不改任何 `reqboard_*` 对外工具的参数、返回或错误码**」，
  也没有 HTTP API 变更 ⇒ 没有可编号的对外接口（I-x 空）。
- 本需求**零界面新增**：`design/frontend.md` 只把既有但不可达的「已归档」分支变成可达，
  零新页面、零新组件、零样式改动（P-x / C-x 空）。
- **每个 FR 都有真实代码落点**，故「接口」「页面/模块」两列填**具体文件路径 + 设计文档章节**，
  便于执行者直接定位，而非编号跳转。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 建立集合差基线判据与指纹采集 | FR-2, FR-6 | design/interfaces.md「回归基线契约」+ scripts/test-baseline.mts（新）、docs/reviews/test-baseline.md（新）、docs/reviews/test-baseline.failures.txt（新）、package.json | — | D-3 | implement | backend | — | M | 见下方 t1 验收标准 | dev,review（skipIntegration） |
| t2 | （落库后回填） | 工具登记面单点化并补齐 4 条缺失映射 | FR-1 | design/data-model.md「FR-1 新增的登记表」+ src/tools/registry.ts（新）、tests/output-contract.test.ts、tests/tools-dispatch.test.ts、tests/apply-wiring.test.ts | — | — | implement | backend | — | M | 见下方 t2 验收标准 | dev,review（skipIntegration） |
| t3 | （落库后回填） | 放宽工厂扫描并把 bind/handoff 纳入契约覆盖 | FR-1 | design/backend.md「FR-1 的两步实施规则」+ tests/output-contract.test.ts、src/tools/registry.ts、src/tools/BindTool/BindTool.ts、src/tools/HandoffTool/HandoffTool.ts | — | — | implement | backend | t2 | S | 见下方 t3 验收标准 | dev,review（skipIntegration） |
| t4 | （落库后回填） | 删除无写入者的归档时间字段与读取分支 | FR-3 | design/frontend.md「目录与包结构」+ src/domain/status/ArchivedMoment.ts（新）、src/shared/protocol.ts、src/client/types.ts、src/client/views/panels/docs.ts、src/client/views/verification.ts、src/client/node-panel.ts、src/application/query/QueryDocs.ts | — | D-2, D-5 | implement | fullstack | — | M | 见下方 t4 验收标准 | （按 feature 默认：含联调） |
| t5 | （落库后回填） | 知识层条目/索引/根因修复与生成页压行 | FR-4 | design/architecture.md「收敛 3/收敛 4」+ docs/knowledge/entries/kb-0043.md、docs/knowledge/entries/kb-0048.md、docs/knowledge/INDEX.md、docs/knowledge/design-tokens.md、src/application/use-cases/DepositKnowledge.ts、src/adapters/KnowledgeRepository.ts、src/domain/knowledge/generate.ts、scripts/kb-probe.mts | — | — | implement | backend | — | M | 见下方 t5 验收标准 | dev,review（skipIntegration） |
| t6 | （落库后回填） | 规范面改写口径并新增 C-28 提交判据 | FR-2, FR-4, FR-5 | design/interfaces.md「规范条目 C-14/C-15 最终文案」+ docs/knowledge/conventions.md、docs/knowledge/operations.tsv、docs/guides/acceptance-sheet-workflow.md、src/domain/knowledge/operations.ts | — | D-3 | doc | doc | t1, t5 | M | 见下方 t6 验收标准 | （doc 默认：研发+复核） |
| t8 | （落库后回填） | 证据模板带工作树指纹并登记降级 | FR-6 | design/interfaces.md「FR-6 的证据文档契约」+ templates/implementing/test-evidence.md、templates/accepting/verification.md | — | D-4 | doc | doc | t1 | S | 见下方 t8 验收标准 | （doc 默认：研发+复核） |
| t7 | （落库后回填） | 提交判据脚本与本需求收尾提交 | FR-5 | design/interfaces.md「命令接口」+ scripts/commit-check.mts（新）、package.json | — | D-1 | implement | backend | t1, t2, t3, t4, t5, t6, t8 | S | 见下方 t7 验收标准 | dev,review（skipIntegration） |

### 逐卡验收标准（可证伪：跑什么、看到什么算过）

**t1**
1. `pnpm baseline:refresh` → 输出含 `HEAD` 短哈希与 `git diff --stat` 摘要；`ls -l docs/reviews/test-baseline.md docs/reviews/test-baseline.failures.txt` 两份都在。
2. `pnpm baseline:check` → exit 0，输出「新增 0 / 消失 0」。
3. 反向（RV-5）：`mv docs/reviews/test-baseline.failures.txt /tmp/` → `pnpm baseline:check` exit 1 且报「没有基线，先 refresh」（**不得当作通过**）；还原后复绿。
4. 反向（TC-11）：临时把一条已通过用例改成必失败 → `pnpm baseline:check` exit 1 且「新增失败」栏点名该用例；还原后复绿。

**t2**
1. `npx vitest run tests/output-contract.test.ts tests/tools-dispatch.test.ts tests/apply-wiring.test.ts` → 全绿、exit 0（改动前 output-contract 4 failed）。
2. `TOOL_REGISTRY.map(e => e.dir)` 与磁盘目录集合差集为空；`map(e => e.toolName)` 与 `apply()` 后 `ctx.tools[].name` 集合差集为空（测试内含断言）。
3. 反向（RV-1）：从 `TOOL_REGISTRY` 删掉 `TaskAdopt` 一条 → `output-contract` 红并**点名 `TaskAdopt`**；还原后复绿。

**t3**
1. 放宽后的工厂正则扫到 **≥27** 个工厂（改动前 25，漏 `Bind`/`Handoff`）——用例断言扫描下限，读数随 `TOOL_REGISTRY.length` 走。
2. `npx vitest run tests/output-contract.test.ts` → 全绿、exit 0。
3. 若报出未声明键：**纯声明对齐**（返回形状合理、只是 schema 漏写）⇒ 就地补 `output.schema.properties` 并复跑全绿；**真实契约问题**（返回形状本身该改）⇒ 登记进 `tests/output-contract.test.ts` 既有的「已知留债登记表」机制 + 在验收材料写明「留待独立需求」。**不许为了让测试变绿而删断言**。
4. 近似预告（非判据）：`Handoff` 的 `windowKey` 疑似未声明，以本卡实测为准。

**t4**
1. `grep -rn "archivedAt\|archivedBy" src/ tests/ scripts/` → **无输出**。
2. 门禁探针（读真实台账记录调 `buildGateVerdicts`）：`status=archived` 的记录 → `verdict: 'passed'`，且 `at` 等于该记录 `statusHistory` 里 `status='archived'` 事件的 `at`（设计期实测 87/87 可取值）。
3. `npx vitest run tests/query-report.test.ts tests/docs-panel.test.ts tests/node-panel.test.ts tests/client-view.test.ts tests/stage-detail.test.ts tests/acceptance-criteria.test.ts` → 全绿，且**至少一条用例走真实归档状态**而非夹具构造 `archivedAt`。
4. 反向（RV-3）：把 `archivedMomentOf` 改为恒返回 `undefined` → 门禁 `verdict` 仍 `passed` 但回执**不含 `at` 键**（断言"没有 `at: undefined`"）；反向（RV-4）：把判据改回 `a?.archivedAt !== undefined` → 门禁回到 `pending`。
5. `pnpm build:client` → `[verify-client] OK`（规范 C-12）。
6. `git diff --stat src/client/styles/` → **为空**（零样式改动，FR-3 的样式判据）。

**t5**
1. `npx tsx scripts/kb-probe.mts` → **`0 项失败`**，exit 0（改动前 5 项失败：K1/K3/K5/K6/K10-C27）。
2. `pnpm kb:check` → exit 0，且无 `[drift]` 行。
3. `grep -c 'kb-conventions-c-22' docs/knowledge/INDEX.md` → ≥1；`grep -c 'kb-0043\|kb-0048' docs/knowledge/INDEX.md` → 2。
4. `INDEX.md` 字符数 **≤8000（含本次新增的 4 行）**——测得值，不是估算。
5. 根因用例：喂一条含 `·` 或 `→` 或超 140 字符的 `one_liner` → **不落盘条目文件**；沉淀路径对非法字符先清洗再截断（对照 `src/domain/knowledge/operations.ts` 的既有正确口径）。
6. 反向（RV-6/RV-7）：删掉 `INDEX.md` 里 kb-0043 行 → K5 红；删掉 c-22 行 → 本卡新增的「页面小节 ↔ 索引行」检查红；均还原后复绿。

**t6**
1. `grep -rn "≤ 98\|≤98\|≤ 197\|≤197\|基线 106\|当前 223" docs/knowledge/ docs/guides/ docs/architecture/` → **无输出**（规范性面清零）。
2. C-14 / C-15 段落内**不含绝对数字**，且含指向 `docs/reviews/test-baseline.md` 的指针。
3. `npx tsx scripts/kb-conventions-sync.mts --check` → exit 0；`npx tsx scripts/kb-probe.mts` → **K10 不再报 C-27 占位**（K11 对新增 C-28 通过）。
4. C-28 四要素齐备，其中「命令」为 `pnpm commit:check --req <REQ-id>`、「期望」含可对照锚点。
5. `grep -c 'kb-conventions-c-28' docs/knowledge/INDEX.md` → 1。
6. 历史面豁免复核（**如实登记，不是遗漏**）：`grep -rn "≤ 98\|基线 98" docs/requirements/ | wc -l` 仍非 0，且逐处确认都落在带日期的历史文档内。

**t7**
1. 未提交时 `pnpm commit:check --req REQ-261006123819-3af3` → **exit 1（FAIL）**；提交后 → **exit 0（OK）**（两个方向都验）。
2. `git log --oneline --grep=REQ-261006123819-3af3 | wc -l` → ≥1。
3. `git show --stat <本需求提交>` 的文件集合 ⊆ 本需求改动清单，**不含其他需求目录**；提交时按清单逐个 `git add`，**禁用 `git add -A`**。
4. 存量悬空如实登记：提交后 `git status --porcelain | wc -l` **仍非 0**（其他窗口在飞的改动），该缺口写进验收材料。

**t8**
1. `grep -n "工作树" templates/implementing/test-evidence.md templates/accepting/verification.md` → 两处都要求写 `HEAD` + `git diff --stat` 摘要。
2. `pnpm templates:check` → exit 0（只在既有节内加要求、不加节，故不触发模板节判据）。
3. 降级如实登记：在本需求验收材料写明「报告类模板今天**没有**机械门禁」（`scripts/template-gate-probe.mts:105-112` 显式登记为「无线上门禁」），**不冒充**为已被门禁保证。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 | interfaces.md「新增/修改的工具接口」（无对外变更）+ src/tools/registry.ts | src/tools/registry.ts、src/tools/BindTool、src/tools/HandoffTool | TC-1, TC-2, TC-3, TC-4；RV-1, RV-2 | t2, t3 | ✅ |
| FR-2 | interfaces.md「回归基线契约」+ scripts/test-baseline.mts | package.json、docs/reviews/test-baseline.*、conventions.md（C-14/C-15） | TC-10, TC-11, TC-12, TC-13；RV-5 | t1, t6 | ✅ |
| FR-3 | interfaces.md「归档门读数契约」+ src/domain/status/ArchivedMoment.ts | src/application/query/QueryDocs.ts、src/client/views/panels/docs.ts、src/client/views/verification.ts、src/client/node-panel.ts | TC-5, TC-6, TC-7, TC-8, TC-9；RV-3, RV-4 | t4 | ✅ |
| FR-4 | interfaces.md「知识层索引与条目契约」 | docs/knowledge/INDEX.md、docs/knowledge/entries/kb-0043.md、kb-0048.md、src/domain/knowledge/generate.ts、scripts/kb-probe.mts | TC-14, TC-15, TC-16, TC-17；RV-6, RV-7 | t5, t6 | ✅ |
| FR-5 | interfaces.md「命令接口」（commit:check）+ scripts/commit-check.mts | docs/knowledge/conventions.md（C-28）、docs/knowledge/operations.tsv | TC-20, TC-21 | t6, t7 | ✅ |
| FR-6 | interfaces.md「FR-6 的证据文档契约」+ scripts/test-baseline.mts（指纹输出） | templates/implementing/test-evidence.md、templates/accepting/verification.md | TC-18, TC-19 | t1, t8 | ✅ |
| **合计** | 4 个新增模块/脚本接口 | **36 个文件**（新增 6 / 改源码与脚本 12 / 改测试 9 / 改文档 9） | 21 条 TC + 7 条 RV | 8 张任务 | **6/6 条款有主** |

> **本表「接收任务」列刻意不写「（数量）」**：读端 `planKeysIn`（`src/application/internal/content-trace.ts:147-152`）
> 按 `[，,、\s|]` 切分后，只剥掉 token **首尾**的括号再校验 `^[A-Za-z][A-Za-z0-9_-]{0,39}$`；
> 写成 `t4（1）` 会变成 `t4（1` ⇒ **整格判不出任何 key**，写成 `t2, t3（2）` 只会认出 `t2`。
> 实测证据：本计划提交前，看板 `clause_receive_status` 把 FR-3 报成 `unreceived`
> （因该格为 `t4（1）`），其余五条只认出了逗号前的第一个 key。
> 而 `templates/decomposing/decomposition.md:59` 恰恰要求「一格一个编号，括号里是数量」——
> **模板与读端不一致**，本次按读端口径写纯 key，数量移入本行合计。该不一致已在
> `design/architecture.md` 的收敛说明之外单列，建议另立需求修（属模板/读端同源问题，C-24）。

## 覆盖完整性规则

1. **每行三格不许空**：本表 6 行全部有内容——「接口」列填新增模块/脚本，「页面/模块」列填被改文件，
   「用例」列填 TC/RV 编号，「接收任务」列填计划 key。无一行需要写 "— + 理由"。
2. **反向也要查**：`design/` 7 份文档声明的 serves 集合 = {FR-1…FR-6}，无未被认领的条款；
   每个 FR 都有接收任务（见上表「接收任务」列），无孤儿条款。
3. **本计划不含设计二次创作**：全部 8 张卡的落点与验收标准都逐条引自已确认的 `design/` 文档；
   凡设计未覆盖处，本计划**不自行发明**（如遇冲突退回 design 改计划重新批准）。

### 设计期已登记的四处收敛（人已在 design 确认门一并批准）

| # | 收敛 | 依据 |
|---|---|---|
| 1 | FR-2 验收从"全仓 grep 清零"收窄为"规范性面清零 + 历史面显式豁免" | 185 处过期阈值里 180 处在带日期的历史记录内 |
| 2 | FR-1 扩 2 个此前完全无覆盖的工具（bind/handoff） | 两工厂带第二参数，从未被契约门禁扫到 |
| 3 | FR-4 扩两处根因修复（`DepositKnowledge` 只截长不清洗、`appendEntry` 先写条目后写索引） | 不修则孤儿条目持续再生 |
| 4 | FR-4 预算处置改为**页内压行**（不调预算） | 200 行是 4 处书面契约 + 1 处单测钉死的 |

### 并发写冲突的规避（本仓多窗口共用同一工作树）

四类共享文件**各只归一张卡**，避免两张卡同时改同一文件：

| 共享文件 | 归属卡 | 说明 |
|---|---|---|
| `docs/knowledge/INDEX.md` | t5 | 四行新增与全文压缩都在 t5 内一次完成（含 c-28 行），t6 只复验 |
| `docs/knowledge/conventions.md` | t6 | C-14/C-15 改写、C-28 新增、C-27 补写都在 t6 内 |
| `src/domain/knowledge/operations.ts` | t6 | `EXTRA_ENTRIES` 两条（test-baseline / commit-check）与 C-27 一并处理 |
| `package.json` | t1 | `baseline:check` / `baseline:refresh` / `commit:check` 三条脚本一次加齐 |
