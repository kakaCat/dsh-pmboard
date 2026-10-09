---
requirement_id: REQ-261008004324-81df
title: "红测试收口设计：A 类夹具跟进 + C 类环境基线"
status: design
owner: "session-f7cb40a8"
category: bug
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9, BUG-10, BUG-11]
---

# 设计说明（REQ-261008004324-81df）

> 读者：实施者与验收人。技术为主，每节标 `serves`。
> 本设计**只写怎么做**，不含任务表 / 拆分内容（属拆分阶段）。
> 定性来源：本窗口 4 组只读取证（干净 HEAD worktree 对照 + 逐文件 `npx vitest run`），
> 每条结论都有命令读数或 `文件:行` 依据；取证件原文见 `requirement.md` 与 `triage-evidence.md`。

## 目标与范围修正 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9, BUG-10, BUG-11 -->

**目标**：把「既有红」里属于测试夹具/断言滞后（A）与环境基线漂移（C）的部分修到绿，
每条改动带一句定性依据；定性为真缺陷的条目移出本需求并点名另案。

**范围修正（相对 `requirement.md` 的目标集，按 BUG-10 执行定性后收敛）**

| 类别 | 文件 | 失败用例 | 处置 |
|---|---|---|---|
| 本需求内修（A 类） | 22 | 38 | 改测试侧夹具/断言（逐条见表） |
| 本需求内修（C 类） | 6 | 8（另含 1 条文件级 collect 失败） | 改环境 / 生成物 / 基线 |
| 本需求内修汇总 | **28** | **46 + 1 文件级 + `pnpm kb:check` 1 条仓库门** | 见各节 |
| 移出本需求（另案） | 7 | 11 | 真缺陷/需改生产代码 → 另案点名清单 |
| 范围外（B 类技术债） | 5 | 10 | `requirement.md` N1 已排除 |

- 修正说明一：`requirement.md` 的 BUG-1..BUG-6 按**文件**给判据；定性后发现 3 个文件是
  「部分臂属真缺陷」（`triad-gate`、`e2e-triad-gate`、`template-address-injection`），
  故本设计按**臂**给判据，其余臂仍在本需求。
- 修正说明二：`requirement.md` 写「`isolate-node-context` 的 29 条非依赖用例恢复执行」是笔误——
  该文件共 29 条，其中 16 条依赖缺失宿主包（应显式 skip）、**13 条**恢复执行。以本设计为准。

## 复现口径（最小重现） <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9 -->

```bash
# ① 工作树（本需求现场；HEAD c49fd5e + 约 197 个在飞改动文件）
pnpm test                       # → 37 文件 / 67 用例红

# ② 干净 HEAD 对照（判定「既有红」的唯一口径）
git worktree add /tmp/probe-head HEAD --detach
ln -s "$PWD/node_modules" /tmp/probe-head/node_modules
cd /tmp/probe-head && pnpm test # → 42 文件 / 75 用例红（更红）
cd - && git worktree remove /tmp/probe-head --force

# ③ 单文件最小重现（每个待修文件的判据都是这一条）
npx vitest run tests/<file>     # 先记红读数 → 改 → 同命令转绿

# ④ vitest 之外的仓库门
pnpm kb:check                   # → [verify] 检测到 4 处漂移（exit 1）
npx tsx scripts/test-baseline.mts --check
                                # → 本次 68 / 基线 68；新增失败 11 / 不再失败 11
```

读数归因：**既有红 36 文件 / 66 用例**（工作树 37 文件里的 36 个在干净 HEAD 同样红，
4 组取证逐文件复跑确认，无一条属「在飞引入」）；**在飞新增 1 文件**（`skills-assets`，根因 `__pycache__`）。

## 定性协议（每个文件都必须走完，禁止「先改了看」） <!-- serves: BUG-10 -->

1. **复现**：`npx vitest run tests/<file>`，记首条读数与断言位置 `tests/<file>:<行>`。
2. **归属**：在干净 HEAD worktree 单跑同文件（口径见上）。HEAD 也红 = 既有红（在范围内）；
   HEAD 绿 = 在飞引入（点名，不动）。
3. **定性**：先找「当前语义的事实源」——`src/` 现形态，或引入它的需求文档 / commit。
   - 事实源与实现一致、与测试期望不一致 ⇒ 夹具/断言滞后 → **改测试侧**（改动旁注明依据的需求 id）。
   - 事实源与实现不一致（门禁未接线、字段丢了、写入器丢失）⇒ **真缺陷 → 另案**，禁改断言转绿。
   - 失败因环境缺失 / 生成物陈旧 ⇒ **改环境或基线**（每条理由非空）。
4. **落账**：五列表 `文件 | 桶 | 首条读数 | 定性 | 依据`，一条一行。
   判据：每行的「依据」必须是命令读数、需求 id 或 `文件:行` 之一。

## 另案点名清单（按 BUG-10 移出本需求） <!-- serves: BUG-10 -->

| 文件 | 移出用例 | 定性 | 依据（生产侧根因） | 另案要做什么 |
|---|---|---|---|---|
| `tests/triad-gate.test.ts` | 「拆分出口：卡缺三要素→拒」「单卡结单：卡缺三要素→拒」 | 真缺陷·门禁零调用方 | `content-gate-triad.ts` 只被测试 import，`MoveTask.ts` / `MoveRequirement.ts` 里 `grep -c triad` = 0；人路径 `requirements.ts:219-226` 也只跑 `assertReqTransition` + `assertArtifactGates` | 把三要素门接进 `MoveTask` done 预检与人路径出口 |
| `tests/e2e-triad-gate.test.ts` | 「卡被改坏（删一节）→ 出口门禁拦下」 | 同上 | 同上 | 同上 |
| `tests/doc-sync.test.ts` | 唯一用例 | 断言面缺失（语义搬迁） | `MoveRequirement` 返回体只有 success/requirement_id/from/to/status(/rollback)，`doc_sync_warning` 仅由 `SubmitVerification.ts:484` 产出；且 `brainstorming→design` 是人工门（`RequirementStatus.ts:118`） | 裁定：断言语义迁到 submit 路径，或补 move 侧出口面 |
| `tests/template-address-injection.test.ts` | TC-9（:75）、TC-11（:169） | 真缺陷·注入点未接线 | `CaptureGuidanceDeps.address`（`gate-wiring.ts:124`）是死参数（`index.ts:872` 白传），全文件仅 line 48/95 用过；`capture-section.ts` 无 address 相关 import，而 `session-driver.ts:325` 注释称同源折入 | 二选一：把 address 折进 capture guidance 段；或正式退役该注入点并同步注释与断言 |
| `tests/t7-legacy-tolerance.test.ts` | 唯一用例 | 真缺陷（生产判定未跟枚举） | `round-state.ts:306-315` 旧相位分支 `phase!=='paused'`，而 `protocol.ts:1429` 现行枚举为 idle/active/paused；`docs/reviews/test-baseline.reverse.notes.md:22` 已标 src-debt | 改 `round-state.ts` 的相位判定（改生产） |
| `tests/failure-handling.test.ts` | 唯一用例 | 真缺陷（回退路径旁路） | `ExecuteTask.ts:653-656` 内联「🔧 修复」先退回 todo + bump attempt，导致 `AdvanceChain.ts:632` 的 `rollbackSubtask` 在 `failure-handling.ts:63` 因 `status!=='in_progress'` 早退，`revisions(rollback)` 与失败评论不落 | 删内联块改调 `rollbackSubtask`（勿动测试） |
| `tests/interruption-checkpoint.test.ts` | 3 条 | 真缺陷（断点写入器丢失） | `MoveRequirement.ts:237` 只剩注释、无 `stampCheckpoint` 调用；唯一调用在 `rollback.ts:76`（仅回退），与契约 `interruption.ts:117` / `protocol.ts:1361` 不符 | 在 `MoveRequirement.ts:240` 处补 `stampCheckpoint(...)` |

**顺带合并进另案的两条次要技术债**（取证时发现，不阻塞本需求）：
`session-driver.ts:491` 注释写「记 warn」实为 `logger?.info`（logger 接口无 warn 能力，是静默的放大器）；
`gate-prompt.ts:220-223` 通道不可用分支零投递**且零日志**，与其注释及 `pm-capture-root.ts:208` 白名单第 4 条不符。

## BUG-1 门禁与文档质量新语义（3 文件 / 5 用例） <!-- serves: BUG-1 -->

机制：归档新增「合并去向须真实存在」、design→decomposing 恢复 G2 文档集门、
设计文档二次登记时 `isLegacy` 豁免失效（首登 artifacts 为空恰好吃到豁免）；
三处都是已提交语义，夹具没跟上。

| 文件 | 用例 | 改法（测试侧） | 依据 |
|---|---|---|---|
| `tests/artifact-openable.test.ts` | 1 | :146 之前补 `docs/guides/x.md` 落盘（`mkdirSync` + `writeFileSync`） | REQ-261006201841-944d FR-1；`SubmitArchive.ts:142-153` |
| `tests/move-rollback.test.ts` | 1 | 夹具补 `requirement.md`（六节）+ design 五份落盘，并把五份 design 产物（带 `confirmedAt`/`confirmedBy`）登记进 `artifacts` | REQ-2d1c74 FR-2；`MoveRequirement.ts:159-166` + `design-gates.ts:138-167` |
| `tests/design-registration.test.ts` | 3 | `writeDesign` 的 H1 改 `'# ' + n + ' <!-- serves: FR-1 -->'`（:74-77），:113 的 `risks.md` 同改 | REQ-260929210741-30ae FR-2；`SubmitDesignArtifacts.ts:100` |

回归：`npx vitest run tests/artifact-openable.test.ts tests/move-rollback.test.ts tests/design-registration.test.ts`
（期望 7/7 · 19/19 · 9/9）。

## BUG-2 人工门与出口三要素（2 文件 / 3 用例在本需求内） <!-- serves: BUG-2 -->

机制：`decomposing → implementing` 自 2026-09-14（REQ-31e11f 五门）即人工门，
而 `MoveRequirement` 的 actor 硬编码 `'agent'` ⇒ 工具路径**结构上不可达**；
「放行类」断言只需改走看板人路径。

| 文件 | 本需求内改法 | 依据 |
|---|---|---|
| `tests/triad-gate.test.ts` | 两条「放行」断言改走人路径：`post('/req/move', { id, to: 'implementing', actor: 'human' })` | 参照 `tests/artifact-gates.test.ts:417` |
| `tests/e2e-triad-gate.test.ts` | :117 同上改人路径 | `RequirementStatus.ts:118-120` |

其余 3 条（缺三要素拒 ×2 + 卡被改坏拒 ×1）见「另案点名清单」。

## BUG-3 文案与注入段（4 文件 / 7 用例在本需求内） <!-- serves: BUG-3 -->

机制：硬化语从系统段改到消息段并换措辞；卡面判据从「大字段存在」改为「服务端摘要读数」；
宽度基准由视口让位改为会话框；H4 已全面 Dive 化（永不投递）。

| 文件 | 用例 | 改法（测试侧） | 依据 |
|---|---|---|---|
| `tests/capture.test.ts` | 1 | :157 断言改 `'沉默跳过等于'`（可另对 `captureGuidanceText` 断言 `'比沉默跳过安全'`） | 现行硬化语见 `volatile-notice.ts:354` / `capture-section.ts:387` |
| `tests/client-view.test.ts` | 3 | 夹具补服务端摘要读数：:500/503/505 加 `planState:'pending'/'approved'/'rejected'`；:524-530 加 `gates:[{kind:'verification',status:'pending',count:1}]`；:580 加 `archivePrepared:true` | REQ-261006175040-12d4 FR-1/FR-2/FR-5；`artifacts.ts:222-231`、`verification.ts:110-127` |
| `tests/node-panel-styles.test.ts` | 1 | :47 期望改 `'min(720px, calc(100% - 32px))'` | `node-panel.ts:68`；姊妹用例 `header-progress-responsive.test.ts:112` 已断言新值 |
| `tests/template-address-injection.test.ts` | 2（TC-10 两臂 :141/:149） | 改断 Dive-skip（H4 永不投递）；同契约已由 `gate-handlers.test.ts:90-101` 的 `expectDiveResumeSkip` 覆盖，可删臂 | `h4-resume.ts:13-29` |

TC-9 / TC-11 两臂见「另案点名清单」。**回归须顺跑** `tests/header-progress-responsive.test.ts`
（防宽度口径两处分叉）。

## BUG-4 回执字段与状态推进读数（6 文件 / 10 用例在本需求内） <!-- serves: BUG-4 -->

机制：批准同一调用内已 `advanceRequirement()`；`MoveTask` 回执为「既有 11 键」；
裁定门按需求创建时间对 feature 生效；落库路径已改 `landApprovedPlan`。

| 文件 | 用例 | 改法（测试侧） | 依据 |
|---|---|---|---|
| `tests/auto-chain-approval.test.ts` | 1 | :85-89 在 `seed()` 加**延迟 jobs 夹具**（`start` 捕获 spec 不跑，模式见 `concurrency-matrix.test.ts:90`）→ 断言 `implementing` + `autoRun=true` → 手跑捕获的 `spec.run()` → 断言 `accepting`；或删 :85-88 保留 :92 并改过时的文件头注释 | `confirm-settle.ts:700-706`（REQ-4842fe t10） |
| `tests/confirm-settle-plan-persist.test.ts` | 1 | :48-55 给 `h.deps.jobs` 打桩（`available`/`start`/`get`）→ 投递即返回，`autoRun` 保持 true | 同上；`harness.ts:858` 现无 jobs |
| `tests/plan-mode.test.ts` | 1 | :302 删该断言（需求态改读 `(await store.get(REQ_ID))!.status`，:311 已有同款） | `MoveTask.ts:127-140`；`legacy-compat-6749.test.ts:248,265` 锁死键集 |
| `tests/t17-queue-e2e.test.ts` | 1 | 夹具 `REQ_DOC` 补 `## 讨论与裁定记录（D-x）` 节 + 唯一真空态写法「本节无裁定」 | `decision-gates.ts:226-251`（REQ-261005105032-3b02 FR-8） |
| `tests/decompose-tools.test.ts` | 5 | ①:251 夹具塞一张未取消卡（或改断 `TASKS_REQUIRED` 路径）②:378 断言只留 `doc_path`/`implementation` ③:403 该断言迁至 verify_submit 用例 ④:516 改 `/REQBOARD_NO_BOUND_REQ/` ⑤:529 删断言 | ①`DecomposeSpec.ts:48-66`（REQ-261003204149-1e80 FR-4）③`SubmitVerification.ts:392-409` ④同文件 :73 口径 ⑤同 plan-mode |
| `tests/t11-decompose-queue-write.test.ts` | 1 | :114 断言改 `landApprovedPlan(`，并对 `approved-plan-landing.ts` 断言含 `landPlanTasks(` | REQ-261002164800-d8f2 `decomposition.md:69`；`confirm-settle.ts:646` → `approved-plan-landing.ts:169` |

`tests/t7-legacy-tolerance.test.ts` 见「另案点名清单」。
**备注（不阻塞）**：`src/client/toolviews/rows/task-move.ts:43,90` 仍读 `requirement_status`
（`TASK_MOVE` 契约无此键）→ 孤儿读，可选清理项，不在本设计范围。

## BUG-5 消息投递与台账写入（5 文件 / 10 用例在本需求内） <!-- serves: BUG-5 -->

机制：投递通道被有意删除（全面 Dive 化）＋驱动组装的**必填依赖没传**导致整拍静默零动作
（`logger.info` 是空函数，异常被吞）；依赖门是新语义；断点写入器丢失（后者另案）。

| 文件 | 用例 | 改法（测试侧） | 依据 |
|---|---|---|---|
| `tests/dive-gate-prompt.test.ts` | 2 | ①:260-262 改断 `deliveries` 为 0（通道已删）②:286-304 补 `taskStore:{listAll:async()=>[]}` 与 `requirementStore`（`peekFacts`） | `gate-prompt.ts:221,277`（`deliver` 已删、成死参）；`pm-capture-root.ts:98,122,173` 必填缺传 |
| `tests/dive-session-driver-wiring.test.ts` | 3 | `makeFr11Harness`（:134-152）补 `taskStore` + `requirementStore` | 同上；`session-driver.ts:487-492` 把 TypeError 吞成 info |
| `tests/handoff.test.ts` | 2 | :251、:333 之前把上游 t1 走完（`todo→in_progress→done`；done 前补一次带 `files_changed` 的 `task_report`） | 依赖门是已提交语义 `DependencyGateSpec.ts:1`（REQ-260929210741-30ae FR-4） |
| `tests/adapters/failure-alert.test.ts` | 2 | 删 `delivered` 断言（:48-50），:53-76 改断两次 `wire.log`：原始正文 + 含窗口信息的调试行 | `FailureAlert.ts:21-38`（f3c99c8 有意删 `deliver`/`popupInstructionFor`） |
| `tests/canceled-legacy-read.test.ts` | 1 | :315-318 改**真 await**（`try/catch` + 断言 load 结果），现写法 `await expect(async fn).not.toThrow()` 不 await 内部 promise | 该文件与 `QueueRepository.ts:226-228` 工作树与 HEAD 逐字节相同；`--pool=threads` 全绿、`-t 畸形 JSON` 恒绿 ⇒ 时序抖动 |

`tests/failure-handling.test.ts`（1）与 `tests/interruption-checkpoint.test.ts`（3）见另案。

## BUG-6 夹具细节与 ID 形态（2 文件 / 3 用例） <!-- serves: BUG-6 -->

| 文件 | 用例 | 改法（测试侧） | 依据 |
|---|---|---|---|
| `tests/create-doc-location.test.ts` | 2 | :71 改 `[CAPTURE_QUESTION_IDS.location, 'workspace_root']`；:83 改 `['workspace_root']`；**须与在飞 `CreateRequirement.ts:112-113` 的改名同批落**，否则口径二度漂移 | `CreateRequirement.ts:55` 注释：`workspace_root` 是工具有意新增的回落 id |
| `tests/application/repository.test.ts` | 1 | :81 改 `/^REQ-\d{12}-[0-9a-f]{4}$/`；`t-`/`e-`/`c-` 三条 6 位断言**保持不动** | `CHANGELOG-req-id-timestamp.md` 明写迁移与旧格式兼容；`protocol.ts:1923`、`RandomIdFactory.ts:46`、`protocol.ts:2231` 双格式兼容正则 |

## BUG-7 环境依赖与探针锚点（2 文件 / 4 用例 + 1 文件级） <!-- serves: BUG-7 -->

机制一：`tests/isolate-node-context.test.ts:11` 在**模块级** import 缺失的宿主包
`@deepseek-ai/dsh-session`（全仓 `node_modules` 与隔壁 `deepseek-harness` 都没有该包），
collect 阶段即失败 ⇒ 整文件 29 条一条都跑不到。
**改法**：删模块级 import，改为惰性解析 + `describe.skipIf(!HAS_DSH_SESSION)` 包住「路线 A」describe
（先例：`tests/decision-gates.test.ts:28` 的 `DSH_PMBOARD_INTEGRATION` + `:417` 的 `describe.skipIf`），
文件头写明依据与显式跑法（装回宿主包即自动跑）。
**判据**：29 条 = **13 条恢复执行 + 16 条显式 skip**（skip 计数可见，不做「跑绿了其实没跑」的错觉）。

机制二：`tests/zero-arg-binding.test.ts` 守护的对象**已整体消失**——
`patches/` 目录不存在；根 `package.json` 无 `pnpm.patchedDependencies`（HEAD 亦然）；
当前依赖是 `@deepseek-ai/dsh-ptc-runtime@0.2.0-rc.1`（`dsh-tools` 的传递依赖），
其 `lib/` 只有 `index.js` 与 `types/`，无被守护的 `lib/process.js`。
**改法（推荐 A）**：按「守护对象已消失」退休该文件的 4 条环境断言，改为一条显式声明式断言
（根 `package.json` 无 `pnpm.patchedDependencies` 且 `patches/` 不存在 ⇒ 该补丁已随上游升级移除），
文件头注明依据与时点。
**备选 B（需人批准）**：若确认新包仍需零参绑定修复 → 恢复 `pnpm.patchedDependencies` + `patches/`——
属生产依赖配置改动，超「不动生产语义」范围。

## BUG-8 知识层生成物与基线（3 文件 / 3 用例 + 1 条仓库门） <!-- serves: BUG-8 -->

机制：生成物落后于 `src/`（符号 3394 vs 库 3200 行；`kb:check` 报 4 处漂移）；
两条断言的前提已被**进步**推翻（新条目带锚点、白名单新增入口）。

**步骤**（顺序不可颠倒；前置：确认无他窗正在改 `src/` 结构，否则 `--write` 会把半成品一起吸收）：

```bash
npx tsx scripts/kb-build.mts --write   # 重生成生成物（会改 docs/knowledge/*）
pnpm kb:check                          # 期望 exit 0（当前 4 处漂移）
npx vitest run tests/kb-generate.test.ts tests/kb-invalidation.test.ts tests/kb-operations.test.ts
```

| 文件 | 用例 | 改法 | 依据 |
|---|---|---|---|
| `tests/kb-generate.test.ts` | 1 | 重生成后应 `diverged = []`（库内 13 行是「同名同文件签名不符」= 陈旧签名）；若重生成后仍非空 ⇒ 抽取口径真分歧 → 转另案 | 断言 `:106`；`kb:check` 漂移读数 |
| `tests/kb-invalidation.test.ts` | 1 | 断言改**结构判据 + 集合差**：分母 ≥ 60，且「不可判定集合」与基线集合一致；不再要求「全部不可判定」（71 条中 63 条不可判定，8 条新条目带锚点是 K14 的进步） | 断言 `:119-121` |
| `tests/kb-operations.test.ts` | 1 | `:73` 长度 12 → 14，并点名新增两条 `npx tsx scripts/report-style-snapshot.mts`、`npx tsx scripts/report-style-ownership.mts` | 测试自带纪律「每加一条都要同步长度」；`buildCoverage` 实测 14 条 |

每条被刷新的基线必须在 `docs/reviews/test-baseline.md` 刷新历史表写非空理由。

## BUG-9 打包资产环境产物（1 文件 / 1 用例） <!-- serves: BUG-9 -->

机制：跑过 skill 的 Python 检索脚本后，`skills/ui-ux-pro-max/scripts/__pycache__/*.pyc`
（3 个文件）留在树里；`.gitignore` 忽略它但 **`package.json` 的 `files: ["skills"]` 会把它打进包**
⇒ 体积门报红且是真泄漏。

**改法**：① 删 `skills/ui-ux-pro-max/scripts/__pycache__/`；② 防复发：在
`skills/ui-ux-pro-max/.npmignore` 写 `__pycache__/`（子目录 `.npmignore` 在 `files` 白名单下仍生效；
若实测不生效则收窄 `files` 到具体 glob）。
**判据**：`npx vitest run tests/skills-assets.test.ts` 绿 **且** `pnpm pack --dry-run 2>&1 | grep -c pycache` = 0。

## 回归测试落点 <!-- serves: BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9, BUG-10, BUG-11 -->

- **落点 = 原失败文件本身**，不新建测试文件；每条修复必须先跑出红读数、改后用同命令跑绿。
- 单文件命令：`npx vitest run tests/<file>`（逐文件点名，不抽样）。
- 断言对象按族固定：夹具滞后族断「读数/字段/文案现值」；人工门族断「人路径放行 / agent 路径被拒」；
  环境族断「skip 计数 + 依据在场」；基线族断「集合相等」。
- **顺跑防分叉**：`tests/header-progress-responsive.test.ts`（与 `node-panel-styles` 同口径）、
  `tests/legacy-compat-6749.test.ts`（与 `plan-mode`/`decompose-tools` 键集同源）。
- **抖动复核**：`canceled-legacy-read` 修好 await 后应稳定绿；
  `header-progress-e2e` 单跑两次均绿、基线脚本全量跑偶红 ⇒ 收口时若复现，单列抖动条目并说明，不阻塞。

## 收口验收口径（可执行） <!-- serves: BUG-10, BUG-11 -->

1. `npx vitest run <本需求 28 个文件逐一点名>` → 全部通过。
2. `pnpm test` → 28 文件不再出现在失败清单；剩余红逐条有归属（另案 7 文件 / 11 用例 + B 类 5 文件 / 10 用例）。
3. `pnpm kb:check` → 退出码 0（三段：`kb-build --check`、`kb-conventions-sync --check`、`kb-probe`）。
4. `pnpm typecheck` → 退出码 0（防测试侧改动带出类型错）。
5. `npx tsx scripts/test-baseline.mts --refresh` 后 `--check` → 差集为空、exit 0；
   刷新历史表新增一行且理由非空，**逐条解释**当前 11 条「新增失败」与 11 条「不再失败」的归属
   （新增失败里 9 条真新增 = 本需求收口的陈旧面、2 条顺序相关 = `canceled-legacy-read` / `header-progress-e2e`）。
6. 定性落账表 28 行齐 + 另案点名清单成文（7 文件 / 11 用例 + 2 条附带技术债）。

## 边界：不顺手重构、不做的事 <!-- serves: BUG-10 -->

- **不动生产语义**：本设计的改法全部落在 `tests/**`、`docs/knowledge/**`、`docs/reviews/test-baseline.*`、
  `skills/**/.npmignore` 与删环境产物；唯一例外是 BUG-7 的备选 B（需人批准）。
- **不改断言转绿**：另案 7 文件 / 11 用例**禁止**在本需求内改断言变绿，只允许在清单里点名。
- **不重建测试框架、不抽公共夹具**：即便多处夹具同型（如 design 五份 + serves），也各改各的。
- **不追改历史基线数字**（`docs/requirements/**` 里的快照）。
- **不替别窗收拾在飞改动**；`pnpm kb:build --write` 前先确认 `src/` 结构无在飞半成品。
- **不做 `requirement.md` 已排除的 B 类 5 文件**（层边界 / 消息卫生 / 尺寸门禁 / 写盘点 / 活卡单源）。

## 数据层与回滚 <!-- serves: BUG-11 -->

**不适用：本需求不改表、不改 schema、不迁移数据。** 唯一带「状态」的产物是
`docs/reviews/test-baseline.failures.txt` 与 `docs/knowledge/*` 生成物——
两者的回滚方式都是 `git checkout --` 回到改动前字节；
`pnpm kb:build --write` 的产物可随时重生成（幂等），无不可逆副作用。

## 修订记录 <!-- serves: BUG-11 -->

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：4 组只读取证定性 + 28 文件改法 + 另案点名 7 文件/11 用例 + 收口口径 | session-f7cb40a8 |
