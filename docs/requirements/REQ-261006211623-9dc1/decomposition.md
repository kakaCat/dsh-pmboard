# 拆分计划（REQ-261006211623-9dc1）

> 目标：把已交付的三面文档判据（需求条款 / 设计坐标 / 拆分落库）**纳入台账并复跑取证**，
> 外加一处设计新定稿的真实改动（看板红标色值的无障碍合规）。
> 做法：五张卡——四张按面回归 + 一张链尾总门；判据实现本身已在本次交付中落盘，
> 卡的任务是**独立复跑、反向演练、把读数写进证据**，避免"实现者自证"。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款（本需求 FR-1…FR-8） |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定（本需求 D-1…D-6） |
| TC-x | design/test-cases.md 用例表 | 测试用例（本需求 TC-1…TC-18） |
| t-x | 本文档任务表 | 任务 |

本需求的设计文档没有 I-x / S-x / P-x / C-x / T-x 编号（接口契约按"函数名 + 文件:行"记账，
见 interfaces.md §二）——故「落点」列写真实文件路径，「接口」列写契约条目名。

## 改动盘点（对照需求文档 + 设计一套）

- **新增**：`src/application/internal/clause-criteria.ts`、`src/application/internal/plan-doc-table.ts`、
  `src/domain/workflow/EvidenceAnchor.ts`、`src/domain/workflow/DocQualityRules.ts`、
  `scripts/design-coord-probe.mts`；测试 `tests/clause-criteria.test.ts`、`tests/sides-declaration.test.ts`、
  `tests/doc-quality-gate.test.ts`、`tests/plan-doc-table.test.ts`、`tests/design-coord-probe.test.ts`；
  产物 `docs/reviews/doc-quality-gates-2026-10-06.md`、`prototypes/dag-chain-missing.html`。
- **修改**：`content-gate-wiring.ts`（两条门 + refs 单口径）、`category-doc-sets.ts`（sidesDeclarationGap）、
  `artifact-gates.ts`（三码联合）、`SubmitArtifact.ts`（四条接线）、`SubmitTool.ts`（入/出参 schema）、
  `prompt.ts`（工具 description 三条硬规则）、`protocol.ts`（skipIntegrationReason / dep_reasons）、
  `plan-refs.ts`（存量通道标注）、`plan-deps-check.ts`（零交集点名）、`QueryDag.ts` ⇄ `progress-bar.ts`
  （chainMissing 分状态）、模板与注入片段、`doc-section-parity` / `template-gate-probe` / `reverse-drill-matrix`。
- **删除**：无源码删除（骨架占位原型 `prototypes/detail.html` 已移除，见 `prototypes/INDEX.md` 说明）。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 复跑需求面三条判据并留反向演练证据 | FR-1, FR-3, FR-4 | `src/application/internal/clause-criteria.ts`、`tests/clause-criteria.test.ts`、`tests/sides-declaration.test.ts`、`tests/doc-quality-gate.test.ts` | — | D-1, D-4 | test | backend | — | S | 跑 `npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts` → 三文件全绿（10 + 10 + 11 例）；三条反向演练逐条复现：① 删掉某条 FR 的判据锚点 → 提示点名该 FR；② 写 `sides: [doc]` → 拒 `requirement_sides_invalid`；③ 删「失败与并发路径」节（新需求）→ 拒 `requirement_section_missing`，存量需求放行 | dev,review |
| t2 | （落库后回填） | 复跑设计坐标探针并留存量读数 | FR-2 | `scripts/design-coord-probe.mts`、`tests/design-coord-probe.test.ts` | — | D-5 | test | backend | — | S | `npx tsx scripts/design-coord-probe.mts --specimen` → exit 0（5/5 标本按预期，其中标本①内部 exit 1 并点名）；`npx tsx scripts/design-coord-probe.mts --req REQ-261006211623-9dc1` → **exit 0、缺口 0**（本需求自己的设计文档必须过自己的探针）；`npx vitest run tests/design-coord-probe.test.ts` → 19 passed；存量读数（78 个有 design/ 的需求：18 绿 / 60 红，路径缺口 149、回写缺口 458、排除测试落点 1143）如实写进证据，并写明"存量不追溯、按需 `--req` 跑" | dev,review |
| t3 | （落库后回填） | 复跑拆分面判据并留反向演练证据 | FR-5, FR-7, FR-8 | `src/application/internal/plan-doc-table.ts`、`src/application/internal/content-gate-wiring.ts`、`tests/clause-coverage-gate.test.ts`、`tests/plan-depends-e2e.test.ts`、`tests/plan-doc-table.test.ts`、`tests/plan-footprint-tool-schema.test.ts` | — | D-3 | test | backend | — | M | 跑 `npx vitest run tests/clause-coverage-gate.test.ts tests/plan-depends-e2e.test.ts tests/plan-doc-table.test.ts tests/plan-footprint-tool-schema.test.ts` → 全绿；三条反向演练复现：① 只补计划文档覆盖对照表、卡上不写 `requirement_refs` → **仍被拒**（gaps 点名 FR-1/FR-4/FR-7）；② `skipIntegration: true` 缺理由 → 拒 `REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`；③ 计划文档无任务表 / 表未覆盖 `tasks[].key` → 拒 `plan_doc_task_table_incomplete`，缺列只进 `plan_doc_warnings` | dev,review |
| t4 | （落库后回填） | 红标色值按无障碍定稿并重建客户端 | FR-6 | `src/client/styles/node-panel.ts`、`src/client/styles/subtask.ts`、`src/client/styles/report.ts` | `prototypes/dag-chain-missing.html#FR-6` | D-6 | ui | frontend | — | S | ① 三处样式改为定稿色值 `#991b1b` on `rgba(220,38,38,.10)`（`grep -n "991b1b" src/client/styles/node-panel.ts src/client/styles/subtask.ts src/client/styles/report.ts` → 命中 3 处，与 `design/frontend.md` §六 一致；现状琥珀 `#a86a00` ≈3.9:1 不达标）；② `pnpm build:client` → `[verify-client] OK`（关键符号齐全 / 样式归属章在场 / CSS 分片完整）；③ `npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts` → 全绿（红标判据四态 + 防腐烂回归）；④ 与权威原型 `prototypes/dag-chain-missing.html#FR-6` 逐条对照：红标 = 圆点 + 「链未生成」文字（不只靠颜色），与原型判据说明一致，差异写进任务汇报 | dev,review |
| t5 | （落库后回填） | 复跑三条总门并把复核材料与实现对齐 | FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8 | `docs/reviews/doc-quality-gates-2026-10-06.md`、`docs/requirements/REQ-261006211623-9dc1/design/test-cases.md` | — | D-2 | review | doc | t1, t2, t3, t4 | S | `pnpm templates:check` → 模板 25 份 OK 25、需求模板 6 类双向一致、exit 0；`pnpm prompts:verify` → 逐字节一致；`npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` → 缺口 0、exit 0；`npx tsx scripts/reverse-drill-matrix.mts --group hard` → 8/8、exit 0（还原逐字节 + sha256）；`pnpm test` 与 `docs/reviews/test-baseline.failures.txt` 做**集合差并逐条归因**（同工作树并发窗口的在制改动不算本次引入）；`pnpm build` 后确认 `dist/index.mjs` 含本批新码（如 `grep -c "requirement_sides_invalid" dist/index.mjs` > 0）并写明宿主需重载插件才生效；把上述读数与"文档 ↔ 实现一致性"核对结果写进 `docs/reviews/doc-quality-gates-2026-10-06.md` | review |

- 一个任务只干一件事，标题动词开头。
- 本需求**实现已在交付时落盘**：t1–t3 是"独立复跑 + 反向演练 + 留证据"（不是改写实现），
  t4 是设计新定稿的真实代码改动，t5 是链尾总门与复核材料对齐。
- **子卡段**：t1–t3（阶段 `test`）与 t5（阶段 `review`）按阶段兜底即"研发/复核/测试"，**本就不落联调段**，
  故无需 `skipIntegration`；t4（阶段 `ui`）按 feature 默认链会含联调段，本卡声明 `skipIntegration: true`
  （纯样式色值改动，无接口面）。
- ⚠️ **两个新字段当前进不了 `tasks[]`**：`skip_integration_reason` 与 `dep_reasons` 已在本批源码与
  `pnpm build` 产物（`dist/index.mjs`）里声明，但**运行中的宿主插件是本次会话启动时加载的那版**，
  参数校验按旧 schema 拒收这两个键。故 t5 的四条依赖边语义理由**暂时只写在本文档**（见下），
  重载插件后重交同一份计划即可把它们写进 `tasks[]`；t5 的验收里含"确认 dist 与宿主同代"一项。
  t5 的四条边理由（两端文件零交集但确有时序约束）：t1=复跑读数是 t1 的产物，上游一改证据即过期；
  t2=探针读数随探针实现变化；t3=拆分面判据改动直接改变本卡读数；t4=前端色值与客户端产物改动后
  客户端测试与重建读数必须一并复跑。

## 覆盖对照

| 需求条款 | 接口（interfaces） | 页面/模块（frontend/backend） | 测试用例（test-cases） | 接收任务 | 完整性 |
|---|---|---|---|---|---|
| FR-1 条款判据软门禁 | `clauseCriteriaGaps` / `clauseCriteriaHints`（clause-criteria.ts） | SubmitArtifact 接线 + `clause_criteria_warnings` | TC-1, TC-4 | t1, t5（2） | ✅ |
| FR-2 设计坐标探针 | `scripts/design-coord-probe.mts` CLI（`--req/--specimen/--json`） | 探针 + operations.ts EXCLUDED 登记 | TC-2, TC-16 | t2, t5（2） | ✅ |
| FR-3 `sides` 硬门 | `sidesDeclarationGap` / `sidesGateFailure` | category-doc-sets + content-gate-wiring | TC-3, TC-5 | t1, t5（2） | ✅ |
| FR-4 失败与并发路径节 | `docSectionGateFailure` / `FAILURE_CONCURRENCY_SECTION` | DocQualityRules + 模板 feature/refactor | TC-6, TC-5 | t1, t5（2） | ✅ |
| FR-5 拆分引用单口径 | `assertClauseCoverageGate` / `requirementRefsOf` | content-gate-wiring + plan-refs | TC-7, TC-18 | t3, t5（2） | ✅ |
| FR-6 子卡链看板标红 | `chainMissingOf` ⇄ `chainMissing`（两份同源） | node-panel / stage-detail / panels/dag 三处出口 | TC-9, TC-10 | t4, t5（2） | ✅ |
| FR-7 依赖与联调理由 | `skipIntegrationReason` / `dep_reasons` / `zeroOverlapDependencyWarnings` | protocol.ts + plan-deps-check | TC-12, TC-14 | t3, t5（2） | ✅ |
| FR-8 文档所见=批准所见 | `readPlanDocTaskTable` 及其三条纯函数 | plan-doc-table + SubmitArtifact 接线 | TC-13, TC-15 | t3, t5（2） | ✅ |
| **合计** | 8 条契约 | 8 个模块面 | 16 条 TC 引用 | 5 个任务 | 8/8 条款有主 |

- 覆盖不齐不许批：8 条 FR 全部有接收任务；`t5` 是链尾总门（覆盖全 8 条，review 段）。
- 设计文档的 TC-8 / TC-11 / TC-17 等未逐条对应到单卡：它们由 t1–t4 各自面内复跑覆盖，
  TC 表与卡的对应关系见上（每行给两例），不做"一 TC 一卡"的机械绑定。
