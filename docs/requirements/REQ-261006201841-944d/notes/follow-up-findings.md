# 实施期发现（本需求范围外，如实登记不修）

> 记录人：实施窗口 session-95c36a7d · 2026-10-06
> 纪律：**发现了就登记，不在本需求里顺手改**（范围外改动会让本需求的验收证据失去边界）。
> 本文件同时承载**实施期变更记**（实施与已确认设计文档的偏差）：设计文档已过人确认，
> 不为小偏差回头改已确认产物（那会作废确认章、打断流水线），而是**在此逐条登记偏差与理由**。

## F-4（实施期变更记 · 与 design/frontend.md 的偏差）：选择器预算与设计阈值表冲突

- **冲突**：`design/frontend.md` 的阈值表要求给 `.dsh-pm-archived-id` 设 `font-size:10px`、给
  `.dsh-pm-archived-src-name` 设 `max-width:150px + ellipsis`，但**卡上硬约束是「新增选择器 ≤4 条」**，
  而这两条正是第 5、6 条——同一份设计文档的「新增选择器」表与「阈值表」自相矛盾。
- **实施取法**（已落地并自证）：**不新增这两条选择器**，改在既有 `.dsh-pm-archived-chip` 上用
  `white-space:nowrap` + `overflow:hidden` + `text-overflow:ellipsis` + `max-width:min(480px,100%)`
  达到同一**可观测目标**（chip 不折行、超长标题/项目名截断带省略号、chip 高度保持 24px）。
  新增选择器**恰好 4 条**（`.dsh-pm-archived-text` + `.dsh-pm-archived-src` 三态），与预算一致。
- **代价（不掩盖）**：原型 proto-geometry 里的观测量 `idFontSize=10` 与 `srcNameWidthCeiling=150`
  在生产 CSS 里**没有对应声明**（它们是原型的设计意图，不是实现事实）。下次改这一片时应当先裁定
  「预算优先还是阈值优先」，再同步设计文档与原型观测量。
- **证据**：`src/client/styles/base.ts` 的新增选择器计数 = 4；`board-archived-origins` 用例断言
  chip 不折行/截断/`data-src` 三态齐；`pnpm build:client` 通过且 bundle 内含新 class。

## F-5（实施期变更记 · 接线落点与任务卡字面不同）：origin 下传与两处详情接线

- **任务卡字面**：「`board-mount.ts` 1 处下传 `state.origins` 给 `renderArchivedBar`」。
- **实际**：`renderArchivedBar` 的调用点在 `board.ts` 的 `buildBoard` **内部**，故下传写在 `board.ts` 一处；
  `board-mount.ts` 的 2 处接线给了 `design/frontend.md` 指定的**两条详情路径**
  （`buildReqDetail` 与 `createReportShell`）。否则 FR-7 验收标准 2（点开出现「在别处」提示）在生产链路里是死代码。
- **证据**：`git archive HEAD` 洁净快照对照渲染 —— 缺省路径（不传 origin）**逐字节相同**
  （detail / shell 各 21212 bytes）；`buildReportShell(report,'trunk')` ≡ 传 `{}` ≡ 传 local（`toBe`）。

## F-6（本需求**自身**的缺陷，已修）：K13 判词说「全部有沉淀」——判决对、话术假绿

- **发现方式**：对 t6 的交付做**独立复核**（不采信子代理自述）——我先 `grep` 那 6 条需求在
  `docs/knowledge/entries/` 里有没有 `req:` 条目，实测**0 条**；而同一刻 `kb-probe` 打印
  `✅ K13 冷侧 23 条归档需求全部有 req: 知识条目`。
- **性质**：**判决没错**（按基线集合差，6 条缺口 ⊆ 基线 6 条 → 无新增 → 绿），
  错的是**判词**：只要有基线豁免，"无新增缺口"就被写成了"全部有沉淀"。
  这正是本需求要治的那类病——**报告说没事，事实不是**（与底稿里的「失效条件永不过期」「归档目录点开空白」同源）。
- **修复**：K13 的 else 分支按 `coverageGaps.length` 分两支——0 条才说"全部有"；
  否则逐字说清「仍有 N 条零沉淀（已登记为基线豁免、非新增）：<ids>」。
- **修复后实测**：
  `✅ K13 冷侧 23 条归档需求中仍有 6 条零沉淀（已登记为基线豁免、非新增）：REQ-260930215459-d718、…`
- **附带修掉一处脆断**：`tests/kb-invalidation.test.ts` 把「60 条」写死在断言里，
  别的窗口随后沉淀了第 61 条 `kb-0063.md` → 该用例变红，而它要钉的事实（存量条目**全部**不可判定）没变。
  已改为结构性判据：分母 ≥ 60 且 `不可判定数 === 条目总数`（脆弱数字正是 K14 基线要取代的东西）。
  修后 11/11 全绿。

## F-1（实现缺陷，存量）：同一需求二次 `archive_submit` 会「写成功却报失败」

- **现象**：对同一条已归档需求重复提交归档材料 → 抛 `COLD_IMMUTABLE`（"需求 REQ-xxx 已归档，冷侧只读"），
  但**前一次 mutate 已经把 archive 与评论写进台账**——即第二次调用报错，却并非什么都没发生。
- **最小复现**：`npx vitest run tests/kb-archive-deposit.test.ts -t 同源重复提交幂等`
  （用例名：`落地：归档 → 条目 + 索引行 > 同源重复提交幂等：id 复用、索引行不重复`）。
- **调用路径**：`InMemoryRequirementStore.applyMutation` ← `mutateIfPresent` ← `SubmitArchive.ts` 的
  **第二次** `mutateIfPresent`（产物登记那一处）。
- **根因（读码）**：第二次 `archive_submit` 里 `registerArtifact` 对已登记的同 `stage/kind/path` 返回 false
  （`isRegisteredArtifact = autoDiscovered !== true`）→ draft 零变化 → `isColdWriteExempt` 的两个触发键
  （`archive` / `artifacts`）都没变 → 冷侧只读拒写。
- **是不是本需求引入**：**不是**。`git archive HEAD`（`d0f01d6`）解到 `/tmp/pmboard-baseline` 跑同一批 7 个文件，
  同一条用例、同一错误、同一调用路径复现（仅行号 224 → 254）。
- **候选修复方向**（不得在本需求内实施）：第二次 mutate 前先判「是否真需要写」；或让冷侧豁免认
  「零变更 = 空操作」。**改测试断言去迎合等于掩盖真缺陷**，故本需求只登记。
- **影响面**：生产上任何「同一需求二次 `archive_submit`」都会踩到（补材料、重提的常见路径）。
- **建议**：另立 bug 需求承接（范围：`SubmitArchive` 的产物登记 mutate + 冷侧豁免判据）。

## F-2（判据边界，本次不覆盖）：`merged_into` 指向**目录**时不拒

- 闸 1 的判据是 `assertArtifactOpenable`（存在性/形态）+ `stat().size === 0`（非空）。
  若目标路径是一个**目录**，两者都不拒——「合并去向是一份文档」这层语义没有被校验。
- 本次**不覆盖**（改判据会波及所有登记路径的口径）；如实登记为已知边界，建议后续按需增强
  （判 `stat` 是否目录，或按扩展名白名单）。

## F-3（环境事实，非缺陷）：多窗口共用工作树使回归读数随时在动

- 本需求的改动前快照：**122 失败 / 6245 用例**；改动后全量：**463 失败 / 6478 用例**。
- 逐条归因后，**只有约 63 条**是本需求引入（旧形态 `manual_updates` 夹具，已由 t11 全部升级为契约新形态，
  当前 7 个文件 **111/111 全绿**）；其余 300+ 条集中在别窗口在飞的 `plan-footprint*` / `decompose-tools` /
  `accept-sheet*` / `handoff` / `move-rollback` 等文件上。
- 期间另有两起**同工作树干扰**：`tests/helpers/tool-deps.ts` 一度编译不过（后由该窗口补好）；
  `SubmitArchive.ts` 曾被注入 `reject('DEBUG_…')` 临时探针（会让整批 archive 用例瞬时全红，现已撤走）。
- 结论：本需求的回归判据只能按**改动前后两次自采的失败用例集合差 + 逐文件归因**判，
  **不刷测试基线**（`docs/reviews/test-baseline.*` 一字未改）。

## F-7（实施期变更记 · 计划清单漏列第 8 个旧形态夹具文件）

- **发现**：全量跑改动前后集合差时，`tests/application/use-cases.test.ts` 出现 1 条新红：
  `archive_submit：未列入清单的文件 → 默认拒绝` 期望 `REQBOARD_UNLISTED_ACK_REQUIRED`，
  实测得到 `REQBOARD_INVALID_INPUT`（消息以「说明书更新点…」开头）。
- **性质**：本需求 FR-2 收紧的**直接后果**——该文件的夹具仍用旧形态
  `manual_updates: [{ path, section, summary }]`，于是死在形态闸上，**根本没走到它自己那条未列闸门**。
  计划 1.3 的「7 个旧形态文件」清单漏了它。
- **处置**：按 t11 同一手法升级（目标文档真 stub 出来、锚点写进 `path`：`docs/architecture/workflow-stages.md#workflow`），
  **判据一字未放宽**（仍断言拒绝、第二段仍断言通过且保留 unlisted 警告）；改后 21/21 全绿。
- **证据**：`npx vitest run tests/application/use-cases.test.ts` → 1 file / 21 passed。
- **教训**：旧形态夹具的清单不能只按计划文档抄，应当用「全量跑 + 集合差」反查——
  本次正是靠集合差才把它捞出来（否则它会以「本次引入的新红」形态留在验收材料里）。

## F-8（实施期变更记 · design/test-cases.md 的 TC-52 命令不可复现）

- **冲突**：`design/test-cases.md` TC-52 要求「`npx vitest run tests/kb-coverage-probe.test.ts -t TC-30` 失败」，
  但该测试文件的用例名是 `① … ⑦` 形态，**不含任何 `TC-NN` 字样** ⇒ 按字面执行会命中 0 条用例，
  得到「没有覆盖」而不是「断言失败」——正是 TC-52 自己明令禁止的假绿形态。
- **实施取法**：RV-2 的判据命令改用**真实用例名** `-t '冷侧有归档材料但无 req'`（= 用例①），
  实测「注释掉 K13 分支 → 1 failed 且点名用例；还原后复跑 → 0 failed」。
- **不改已确认产物**：`design/test-cases.md` 已过人确认，故**不回改**（回改会作废确认章、打断流水线），
  只在此登记偏差；下次修订该设计文档时应把 TC-29～TC-35 与用例名对齐（二者留一）。
- **证据**：`npx tsx scripts/reverse-drill-matrix.mts --group archive` 的 RV-2 段（退出码 1、红例 1、还原后复绿）。

## F-9（实施期发现 · **已修**：本需求 t10 的自有类型缺陷）

- **现象**：孤立严格 tsc 跑 `scripts/archive-ledger-audit.mts` 报 3 条错：
  `TS2353`（第 230 行 `totals` 字面量写了 `missingTargetsOnFallbackRoot`）与
  `TS2339`（第 233 行读该键）——因为 `interface AuditReport.totals` **漏登记了这个键**，
  而它确实在输出里、RV-3 也断言它。
- **为什么一直静默**：`tsconfig.json` 的 include 不含 `scripts/**`，`tsx` 运行又不做类型检查 ⇒
  `npx tsc --noEmit -p tsconfig.json` 看不见它。
- **处置（本需求内，属自有交付物）**：给 `AuditReport.totals` 补上该键（含注释说明漏登记成因），
  **不改任何输出行为**；改后孤立严格 tsc 只剩 `TS5097`（`.ts` 后缀 import）——那是全仓 `scripts/**` 的既有形态，非本文件特有。
- **证据**：`npx vitest run tests/archive-ledger-audit.test.ts` → 5/5；真台账副本复跑 `totals` 七项读数一字未变。

## F-10（环境事实 · 别窗口新沉淀使 K14 出现新红，本次**不刷基线隐藏**）

- **读数**：t12 收尾时 `pnpm kb:check` 的失败集从改动前的 `{K1, K3, K7, K9, K10}` 变为
  `{K1, K7, K14}`（K3/K9/K10 已由别窗口修好、K7 是生成物漂移存量）。
- **K14 新红的成因**：别窗口在 2026-10-06 21:30 沉淀了 `kb-0064`（`req: REQ-261006201649-cc89`），
  其「失效条件」仍是模板句「相关实现被重构、或该结论被新条目 supersede 时」⇒ 被判不可判定、
  且不在本需求登记的 61 条基线里 ⇒ 点名新缺口**正是 K14 的设计行为**（新沉淀必须可判定）。
- **为什么**不跑 `--refresh-unverifiable`**：刷基线 = 把这条新缺口写成「已知豁免」从而隐藏它——
  那正是本需求要治的假绿形态（同 FR-3 边界 1「本需求不补齐 6 条沉淀，只让缺口可见」的口径）。
- **处置**：保持红并如实登记；两条出路均需人/该窗口动手——① 该窗口把 `kb-0064` 的失效条件写成可判定锚点；
  ② 人裁决后登记为基线豁免（跑 `npx tsx scripts/kb-probe.mts --refresh-unverifiable`）。
- **归因证据**：`kb-0064` 的 `req:` 不是本需求；本需求**零新增知识条目**。
