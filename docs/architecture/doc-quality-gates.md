# 文档质量判据门禁（需求条款 / 设计坐标 / 拆分落库）（contract）

> 来源：REQ-261006211623-9dc1（2026-10-06 立项 / 同日验收归档）。委派来源：产物质量体检（另一窗口只读审计）。
> 本文只写**会被别的需求引用**的契约与口径；执行期的裁决与偏差记录留在该需求的
> `docs/requirements/REQ-261006211623-9dc1/`（`tests/` 逐卡证据 · `reviews/independent-review.md` 独立评审
> · `docs/reviews/doc-quality-gates-2026-10-06.md` 复核材料）。

## 0. 一句话

三面（需求条款 / 设计坐标 / 拆分落库）的缺口**不是形状不够，而是判据缺位**：形状门禁全绿，
条款却可以毫无验收判据、`sides` 写错值被静默过滤、设计点名的路径实现后失效无人回写、
拆分卡上引用落库率只有 28%。本文是修完之后的**判据清单与边界**。

## 1. 八条判据总览

| # | 判据 | 唯一实现 | 强度 | 触发时点 | 反向演练载体 |
|---|---|---|---|---|---|
| FR-1 | 每条条款的定义行块内要有可核验判据（命令 / 断言 / 可读数 / 明确取值） | `application/internal/clause-criteria.ts`（词汇表在 `domain/workflow/EvidenceAnchor.ts`） | **软**（只提示不拦） | 需求文档提交 | `tests/clause-criteria.test.ts` |
| FR-2 | 设计文档点名的路径必须可达；**源码类**落点必须回写到该需求 `design/*.md` | `scripts/design-coord-probe.mts`（`--req` / `--specimen` / `--json`） | 硬（探针 exit 1） | 按需（**不进提交前清单**） | `--specimen` 5 例 + `reverse-drill-matrix --group hard` |
| FR-3 | feature / refactor 的 front-matter `sides` 必须显式且值域合法 | `category-doc-sets.sidesDeclarationGap` + `content-gate-wiring.sidesGateFailure` | 硬 | 需求文档提交 | `tests/sides-declaration.test.ts` |
| FR-4 | 新需求必须有「失败与并发路径」节 | `content-gate-wiring.docSectionGateFailure` | 硬（只对新需求） | 需求文档提交 | `tests/doc-quality-gate.test.ts` |
| FR-5 | 条款覆盖门禁**只认卡上** `requirement_refs` | `content-gate-wiring.assertClauseCoverageGate` | 硬 | 计划提交 / 落库 | `tests/clause-coverage-gate.test.ts` |
| FR-6 | 计划声明了子卡段却 0 子卡 → 看板标 `[链未生成]` | `query/QueryDag.ts` 与 `client/dag/progress-bar.ts`（两份逐字同源） | 硬（读数） | 看板渲染 | `tests/card-layer.test.ts`、`tests/query-report.test.ts` |
| FR-7 | 跳联调必须给理由；零交集依赖边建议给语义理由 | `shared/protocol.ts`（字段与硬拒）+ `plan-deps-check.zeroOverlapDependencyWarnings` | 硬 1 + 软 1 | 计划提交 / 创建 | `tests/plan-footprint-tool-schema.test.ts`、`tests/plan-depends-e2e.test.ts` |
| FR-8 | 计划文档任务表必须覆盖 `tasks[].key`（缺列只警告） | `application/internal/plan-doc-table.ts` + `submitPlanArtifact` | 硬 1 + 软 1 | 计划提交 | `tests/plan-doc-table.test.ts` |

## 2. 四条口径（会被别的需求引用）

### 2.1 存量不追溯按**需求创建时间**，不按"改了哪份文档"

`domain/workflow/DocQualityRules.ts` 的 `DOC_QUALITY_RULES_SINCE`（2026-10-06T12:00:00Z）是唯一判据点；
`createdAt` 早于它或不可得 → 两条硬门（FR-3 / FR-4）**不判**。为什么：

- 「失败与并发路径」**刻意不进 `CATEGORY_DELTAS`**：DELTA 会被拆分提交 / 设计门 / 文档自检复用到**存量需求**上，
  等于追溯（实测会让在飞老需求提交拆分计划时被新节拦住）。
- 需求文档本身**无法在 accepting 阶段重交**（`submitRequirementArtifact` 要求 `brainstorming` 状态），
  所以"事后改需求文档对齐新口径"这条路不通——规则只能往前生效。

### 2.2 判据质量人定，机械层只判"有没有"（FR-1 为什么是软的）

条款判据的**质量**（"覆盖率 ≥ 90%" vs "界面不闪"）只有人能定；硬拦只会换来"写废话糊门禁"。
故 FR-1 只进提交回执 `clause_criteria_warnings`（非空才出键，与 `readability_warnings` 同形）。

扫描窗口 `CLAUSE_CRITERIA_WINDOW = 40`：数字只是兜底，真正边界是**文档结构**（下一条款定义行 /
层级不深于本条款的标题）。取 40 的原因是本需求自己的文档踩过假红：取 12 时判据落在定义行 15 行之后会被误判成缺口
（实测首锚点行距：中位 9 / p90 20 / 最大 38；取 12 会假红 30 条，取 40 当前 0 条假红——余量只剩 2 行，条款块更长时要重估）。

### 2.3 设计坐标探针是"按需判据"，不是提交前清单

它全仓跑必红（存量设计文档的历史失效坐标不追溯），所以：

- 登记在 `domain/knowledge/operations.ts` 的 `EXCLUDED`，**不新增 package.json script**、不挂 CI；
- 只在改动 / 复核某个需求时 `--req <REQ>` 手动跑；`--specimen` 证明判据不空转；
- **硬判据二只覆盖源码类落点**（`src/ scripts/ packages/ lib/`）：测试落点由 `design/test-cases.md` 的
  「实际文件」列与任务卡表达，要求它们也进「模块改动地图」= 逼人把机器生成的测试名手抄一遍；
  被排除的条数在 `--json` 的 `excludedTestPaths` 里如实登记，不静默少判。
- **它不判行号**：设计文档里对源码的 `文件:行` 引用漂了它照样报绿——本需求自己就踩过
  （`design/interfaces.md` 对探针的行号系统性偏 −9，见 §4 已知边界）。

### 2.4 条款引用的唯一通道是**卡上** `requirement_refs`

覆盖门禁的 `covered` 只来自 `rawTasks.flatMap(requirementRefsOf)`；计划文档的覆盖对照表
**不再是门禁依据**（降级为人读汇总 + 存量回填通道，见 `plan-refs.ts` 的文档兜底）。
三句理由：① 卡上 refs 是**下游唯一读点**（RTM `generateRTMData`、结单证据锚定、条款接收状态都只读
`TaskRecord.requirementRefs`）；② 文档表当门禁依据 = 门禁读 A、下游读 B ⇒ 造出"门禁绿、卡上全空"
的静默缺口（实测落库率 28%）；③ 门禁要收的是**落库那一刻的事实**。

## 3. 两条新增字段（调用侧要记住）

| 字段 | 位置 | 契约 |
|---|---|---|
| `skipIntegrationReason`（兼容 `skip_integration_reason`） | `tasks[]` | `skipIntegration: true` 时**必填**，缺了整份计划被拒（`REQBOARD_SKIP_INTEGRATION_REASON_REQUIRED`）；理由不落 `TaskRecord`（随 `PlanRecord.tasks` 可查） |
| `dep_reasons`（兼容 `depReasons`） | `tasks[]` | 入参是**字符串数组**（`["t2=理由"]`）并归一为 map：**map 形态会让 `defineSubmitTool` 抛 `JsonSchemaError`**（schema DSL 不支持未显式声明值的 map）；两端 `implementation` 声明的文件零交集且无理由 → 只进 `dependency_warnings`（建议，不拒） |

## 4. 已知边界（别当成"已覆盖"）

| 边界 | 事实 | 影响 |
|---|---|---|
| FR-7 的 `src/` 盲区 | **已覆盖（REQ-261007095750-9f48，2026-10-06）**：`PATH_RE` 的根补 `src`、扩展名补 `mts`，两处判据（文件冲突门 + 零交集建议）共用同一口径。判据入口：`src/application/internal/conflict-check.ts:28` 的 `PATH_RE` + `declaredFiles`；复跑 `npx vitest run tests/path-extraction-scope.test.ts`、`npx tsx docs/requirements/REQ-261007095750-9f48/tests/readings.mts` | 真实数据实测（台账 68 需求 / 251 张含 `src` 卡，2026-10-07 快照）：可抽取率 **56.6% → 99.6%**；零交集建议 **165 → 331**；冲突门命中 **7 → 57**（新命中 50；"两端点名" 50/50 成立，但已知至少 2 条属过严/截断误报） |
| 冲突门是**文件级**判据（口径扩根后凸显） | 同一个文件即算冲突，不看是否同一段代码、也不区分"改"与"只读引用"；真实数据里"注册类"改动（都往 `src/index.ts` 加一行、都改同一个样式文件）会大量命中；实测 ≥1 条两端只是只读引用（纯文档卡也算） | 扩根后 7/68 需求出现冲突对，作者必须补 `depends_on` 或重划卡。**主路径不回溯**（`Decompose.ts:81-88` 幂等守卫先于冲突门），但**回退重拆会重判存量计划**。是否做"区域级"口径是**待决问题①**，见 `docs/requirements/REQ-261007095750-9f48/tests/real-data-readings.md` §4 |
| `PATH_RE` 无左边界断言 → vendor 路径被截断 | `vendor/reqboard/src/rtm/validator.ts` 会被抽成不存在的工作区路径 `src/rtm/validator.ts`（本轮新命中已实报 1 条）；`src/index.ts`、`src/stage-overview/assembler.ts` 与 vendor 下同名文件构成**跨目录碰撞面**，会误判为冲突 | **未修**（加左边界断言属批准计划外的范围变更，**待决问题②**）；已登记即可复核 |
| 依赖边的残余盲区 | 279 条依赖边里 **94 条（33.7%）** 因"至少一端没写文件路径"完全不判（`plan-deps-check.ts:94` 的诚实边界） | 修前该比例更高（`src` 不可见时 65.5%）；"不判"要显式说，别读成"没问题" |
| 需要宿主重载才生效 | 新门与新字段的代码在 `pnpm build` 产物里，但运行中的宿主按**会话启动时**加载的那版跑 | 重载前：会话内提交会按旧 schema 拒收两个新字段、新门不拦人。可复验：`grep -c skip_integration_reason dist/index.mjs` ≥1 且 `dist` mtime 晚于源码 |
| 设计行号漂移 | 探针只判路径可达，不判 `文件:行` 是否指对 | 改源码行数后，设计文档的行号引用会静默过期（本需求踩过，已修 + 见 §2.3） |
| 链路不卡自检 | 需求能推进到 accepting 而 9 项文档自检是红的 | 自检绿不是推进前提；验收材料里必须逐条列读数 |
| FR-2 无触发点 | 探针不进提交前清单、无 CI 挂钩 | FR-2 是"自愿判据"——它的价值靠"改动时按需跑"与 reverse-drill-matrix 兜 |

## 5. 可复核入口

```bash
npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts
npx vitest run tests/clause-coverage-gate.test.ts tests/plan-depends-e2e.test.ts tests/plan-doc-table.test.ts tests/plan-footprint-tool-schema.test.ts
npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts tests/node-panel.test.ts
npx tsx scripts/design-coord-probe.mts --specimen
npx tsx scripts/design-coord-probe.mts --req <REQ>
npx tsx scripts/req-doc-validate.mts --req <REQ>
npx tsx scripts/reverse-drill-matrix.mts --group hard
```

- 逐卡证据与读数：`docs/requirements/REQ-261006211623-9dc1/tests/t1..t5-*.md`
- 独立评审（含它自己跑的读数与未做项）：`docs/requirements/REQ-261006211623-9dc1/reviews/independent-review.md`
- 复核材料（含 C1–C6 逐条处置）：`docs/reviews/doc-quality-gates-2026-10-06.md`
- 存量读数（权威、带时点）：`docs/requirements/REQ-261006211623-9dc1/tests/t2-design-coord-evidence.md` §2
