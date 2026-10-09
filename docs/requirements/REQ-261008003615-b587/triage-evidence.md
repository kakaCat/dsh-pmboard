# 移交证据：仓库既有红测试取证（供本需求立项使用）

> 由 REQ-261007230908-5ccb（体检第 4 批）窗口在验收期间实测产出，2026-10-07。
> 本文件是**取证记录**，不是本需求的验收产物；本窗口已交棒，后续定性以本需求自己复跑为准。

## 一、结论（两句话）

- 全仓红灯**不是**体检第 4 批引入：干净 HEAD 更红（42 文件 / 75 用例），当前工作树 36 文件 / 66 用例。
- 用户裁定范围：**只收 A 类（夹具/断言跟进）+ C 类（环境与基线）**，不动生产语义；B 类另案。

## 二、对照口径（怎么复现）

```bash
# 当前工作树
pnpm test              # → 36 failed files / 66 failed tests

# HEAD 干净基线（不污染工作区）
git worktree add /tmp/pmboard-head HEAD --detach
ln -s "$PWD/node_modules" /tmp/pmboard-head/node_modules
cd /tmp/pmboard-head && pnpm test    # → 42 failed files / 75 failed tests
cd - && git worktree remove /tmp/pmboard-head --force
```

另：抽样 7 个失败文件在 HEAD 与工作树**计数逐字相同**（7 文件 / 15 用例），证明其成因为既有状态。

## 三、36 个失败文件与初步分桶

| 桶 | 文件 | 初判 | HEAD 对照 |
|----|------|------|-----------|
| C | `tests/isolate-node-context.test.ts` | 环境 / 基线漂移 | HEAD 同样红 |
| A | `tests/artifact-openable.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/auto-chain-approval.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/capture.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/client-view.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/confirm-settle-plan-persist.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/create-doc-location.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/decompose-tools.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/design-registration.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/dive-gate-prompt.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/dive-session-driver-wiring.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/doc-sync.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/e2e-triad-gate.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/failure-handling.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/handoff.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/interruption-checkpoint.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| C | `tests/kb-generate.test.ts` | 环境 / 基线漂移 | HEAD 同样红 |
| C | `tests/kb-invalidation.test.ts` | 环境 / 基线漂移 | HEAD 同样红 |
| C | `tests/kb-operations.test.ts` | 环境 / 基线漂移 | HEAD 同样红 |
| B | `tests/layer-boundary.test.ts` | 质量门禁抓到真实技术债（需改生产代码） | HEAD 同样红 |
| B | `tests/live-tasks-single-source.test.ts` | 质量门禁抓到真实技术债（需改生产代码） | HEAD 同样红 |
| B | `tests/message-hygiene.test.ts` | 质量门禁抓到真实技术债（需改生产代码） | HEAD 同样红 |
| A | `tests/move-rollback.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/node-panel-styles.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/plan-mode.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| B | `tests/project-scope.test.ts` | 质量门禁抓到真实技术债（需改生产代码） | HEAD 同样红 |
| B | `tests/size-budget.test.ts` | 质量门禁抓到真实技术债（需改生产代码） | HEAD 同样红 |
| A | `tests/skills-assets.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 绿 / 仅在飞面出现 |
| A | `tests/t11-decompose-queue-write.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/t17-queue-e2e.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/t7-legacy-tolerance.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/template-address-injection.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/triad-gate.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| C | `tests/zero-arg-binding.test.ts` | 环境 / 基线漂移 | HEAD 同样红 |
| A | `tests/adapters/failure-alert.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |
| A | `tests/application/repository.test.ts` | 断言或夹具滞后于已提交的新语义（待逐文件定性） | HEAD 同样红 |

**分桶是初步的**：A 桶每一条都要在动手前定性（是夹具滞后 → 改夹具；是真缺陷 → 出 B 类另案），
禁「为绿而绿」地改断言。C 桶里 `kb-*`、`skills-assets` 一类若靠刷基线转绿，必须逐条写理由。

## 四、B 类（明确不在本需求范围）

实证摘录：

```
application/dive/ReqboardDiveManager.ts -> @deepseek-ai/cordis       # 层边界越界 import
application/gate/acceptance-gate.ts -> node:fs/promises / node:path   # 同上
domain 仍有拼接式消息（message-hygiene 要求规则层为 0）
src 下存在单文件 > 400 行且不在白名单（size-budget）
```

这些要改生产代码（拆 import、下沉判定、拆文件），且相关文件多被他窗在飞编辑——遇到即点名，不做。

## 五、建议的起手式

1. 先 `reqboard_status` 确认本需求绑定，按 brainstorming 纪律补需求文档（范围就写 A+C，B 列非目标）；
2. 逐文件跑一次拿到当前读数，再按上表定性（每定一条写一句依据）；
3. 先做 C 桶里最硬的（缺包 / 探针），再做 A 桶夹具类——两者都不动生产语义，风险最低；
4. 收尾判据建议：目标文件全绿 + `git stash` 前后可复现 + 被刷新的基线逐条带理由。

## 六、逐文件初步定位（本窗口代做的机械部分，定性仍需本需求窗口裁定）

口径：A = 断言/夹具滞后于**已提交**的新语义（本批范围）；C = 环境/基线漂移（本批范围）；B = 真实技术债（不在范围）。
「疑似被测对象」由测试文件的 import 反查得出，只作定位起点；「首条失败读数」原样摘录，便于复跑核对。

| 桶 | 测试文件 | 疑似被测对象 | 首条失败读数 |
|----|---------|-------------|-------------|
| C | `tests/isolate-node-context.test.ts` | `src/domain/requirement/RequirementSummary.ts`、`src/domain/prompt/index.ts`、`src/adapters/NodeIsolationAdapter.ts` | Error: Failed to load url @deepseek-ai/dsh-session (resolved id: @deepseek-ai/dsh-sessio |
| A | `tests/artifact-openable.test.ts` | `src/adapters/ArtifactSync.ts`、`src/application/internal/design-gates.ts`、`src/adapters/FileDocRepository.ts` | Error: reqboard_archive_submit 未执行：产物登记被拒：文件不存在（normalized=docs/guides/x.md） —— 文档未落盘或路径 |
| A | `tests/auto-chain-approval.test.ts` | `src/application/use-cases/AskConfirm.ts`、`src/application/use-cases/AdvanceChain.ts`、`src/domain/text/labels.ts` | AssertionError: expected 'accepting' to be 'implementing' // Object.is equality |
| A | `tests/capture.test.ts` | `src/application/internal/capture-section.ts`、`src/application/internal/window.ts`、`src/shared/protocol.ts` | AssertionError: expected '📋 PM · 项目捕获（reqboard · 本窗口 session-a…' to contain '不许沉默' |
| A | `tests/client-view.test.ts` | `src/client/view.ts`、`src/client/types.ts`、`src/domain/limits.ts` | AssertionError: expected '\n    <div class="dsh-pm-board">\n   …' to contain '计划待批' |
| A | `tests/confirm-settle-plan-persist.test.ts` | `src/application/use-cases/AskConfirm.ts`、`src/domain/text/labels.ts` | AssertionError: expected false to be true // Object.is equality |
| A | `tests/create-doc-location.test.ts` | `src/adapters/FileDocRepository.ts`、`src/adapters/SystemClock.ts`、`src/adapters/RandomIdFactory.ts` | AssertionError: expected [ 'location', 'workspace_root' ] to deeply equal [ 'location' ] |
| A | `tests/decompose-tools.test.ts` | `src/adapters/SessionProbeAdapter.ts`、`src/shared/protocol.ts` | AssertionError: expected [Function] to throw error matching /REQBOARD_ALREADY_DECOMPOSED |
| A | `tests/design-registration.test.ts` | `src/adapters/FileDocRepository.ts`、`src/adapters/SystemClock.ts`、`src/adapters/RandomIdFactory.ts` | Error: reqboard_submit(kind=design) 被内容校验门禁拒绝：architecture.md（文档级 serves 缺失：H1 或 front-m |
| A | `tests/dive-gate-prompt.test.ts` | `src/domain/requirement/RequirementSummary.ts`、`src/application/dive/session-driver.ts`、`src/application/dive/gate-prompt.ts` | AssertionError: expected [] to have a length of 1 but got +0 |
| A | `tests/dive-session-driver-wiring.test.ts` | `src/wiring/pm-capture-root.ts`、`src/shared/protocol.ts` | AssertionError: expected [] to have a length of 1 but got +0 |
| A | `tests/doc-sync.test.ts` | `src/shared/protocol.ts` | Error: reqboard_move 未执行：docs/requirements/REQ-ds1234/requirement.md 的「讨论与裁定记录（D-x）」节未就位 |
| A | `tests/e2e-triad-gate.test.ts` | （未解析） | Error: 转移 decomposing → implementing 是人工闸门，仅人可操作（REQBOARD_HUMAN_GATE） |
| A | `tests/failure-handling.test.ts` | `src/application/use-cases/AdvanceChain.ts`、`src/application/use-cases/HandleFailure.ts`、`src/application/internal/rework-update.ts` | AssertionError: expected [] to deeply equal [ 'rollback' ] |
| A | `tests/handoff.test.ts` | `src/application/query/index.ts`、`src/shared/protocol.ts` | Error: reqboard_task_move 未执行：任务 t-ef19c3 的上层依赖未完成——t-278ad1（todo）协议层加时间线字段。先完成上层任务再认领（R |
| A | `tests/interruption-checkpoint.test.ts` | `src/domain/requirement/RequirementSummary.ts`、`src/application/use-cases/MoveRequirement.ts`、`src/application/use-cases/NoteInterruption.ts` | AssertionError: expected undefined not to be undefined |
| C | `tests/kb-generate.test.ts` | `src/domain/knowledge/generate.ts`、`src/domain/knowledge/types.ts` | AssertionError: expected [ …(13) ] to deeply equal [] |
| C | `tests/kb-invalidation.test.ts` | `src/domain/knowledge/invalidation.ts`、`src/application/use-cases/DepositKnowledge.ts`、`src/domain/knowledge/entry.ts` | AssertionError: 不可判定条数应等于条目总数（存量口径：全部不可判定）: expected 63 to be 71 // Object.is equality |
| C | `tests/kb-operations.test.ts` | `src/domain/knowledge/operations.ts` | AssertionError: expected [ …(14) ] to have a length of 12 but got 14 |
| B | `tests/layer-boundary.test.ts` | `src/domain/errors.ts`、`src/domain/requirement/RequirementStatus.ts`、`src/domain/task/TaskStatus.ts` | AssertionError: application/ 出现越界 import： |
| B | `tests/live-tasks-single-source.test.ts` | `src/domain/status/Predicates.ts` | AssertionError: 检测到基线之外的新手写活卡判定（新增即红）；请改调 `domain/status/Predicates.ts` 的单点，或在清单里登记基线条目并 |
| B | `tests/message-hygiene.test.ts` | （未解析） | AssertionError: domain 仍有拼接式消息，请改用 fmt： |
| A | `tests/move-rollback.test.ts` | `src/http/routes.ts`、`src/adapters/FileDocRepository.ts`、`src/application/internal/rollback.ts` | Error: reqboard_move 未执行：design → decomposing 的设计文档集：requirement.md 不存在（无法核验文档集策略与端侧/豁免声 |
| A | `tests/node-panel-styles.test.ts` | `src/client/styles/node-panel.ts` | AssertionError: expected '\n/* ===== Apple 风设计令牌（本面板私有） ===== *…' to contain 'min(720px, |
| A | `tests/plan-mode.test.ts` | `src/http/routes.ts`、`src/shared/protocol.ts` | AssertionError: expected undefined to be 'decomposing' // Object.is equality |
| B | `tests/project-scope.test.ts` | `src/application/internal/support.ts`、`src/application/use-cases/QueryKnowledge.ts`、`src/adapters/FileDocRepository.ts` | AssertionError: 以下工作区相对写盘点既未受守卫保护、也未在豁免/待偿清单里——请把判定下沉到该写入器，或写清理由： |
| B | `tests/size-budget.test.ts` | （未解析） | AssertionError: 超标文件（未在白名单内）： |
| A | `tests/skills-assets.test.ts` | `src/adapters/SkillAssets.ts`、`src/application/internal/skill-manifest.ts` | AssertionError: expected [ …(3) ] to deeply equal [] |
| A | `tests/t11-decompose-queue-write.test.ts` | `src/application/internal/plan-landing.ts`、`src/repositories/QueueRepository.ts`、`src/repositories/QueueTaskStore.ts` | AssertionError: expected '/**\n * 确认裁决应用（REQ-260924213231-b1c4 …' to contain 'landPlanTa |
| A | `tests/t17-queue-e2e.test.ts` | `src/adapters/FileDocRepository.ts`、`src/repositories/QueueRepository.ts`、`src/repositories/QueueTaskStore.ts` | AssertionError: expected 'brainstorming' to be 'design' // Object.is equality |
| A | `tests/t7-legacy-tolerance.test.ts` | `src/application/dive/round-state.ts` | AssertionError: expected true to be false // Object.is equality |
| A | `tests/template-address-injection.test.ts` | `src/application/internal/capture-section.ts`、`src/application/gate/handlers/h3-inject.ts`、`src/application/gate/handlers/h4-resume.ts` | AssertionError: expected 0 to be greater than 0 |
| A | `tests/triad-gate.test.ts` | `src/adapters/SessionProbeAdapter.ts`、`src/application/internal/content-gate-triad.ts`、`src/shared/protocol.ts` | AssertionError: expected [Function] to throw error matching /task_card_incomplete/ but g |
| C | `tests/zero-arg-binding.test.ts` | （未解析） | Error: 向上未找到含 pnpm.patchedDependencies 的仓库根 package.json |
| A | `tests/adapters/failure-alert.test.ts` | `src/adapters/FailureAlert.ts` | AssertionError: expected [ …(2) ] to have a length of 1 but got 2 |
| A | `tests/application/repository.test.ts` | `src/repositories/atomicWrite.ts`、`src/adapters/FileDocRepository.ts`、`src/adapters/SystemClock.ts` | AssertionError: expected 'REQ-261008000352-abe0' to match /^REQ-[0-9a-f]{6}$/ |

**C 桶三条的具体修法建议**（都不动生产语义）：

- `tests/isolate-node-context.test.ts`：依赖 `@deepseek-ai/dsh-session` 在本仓 `node_modules` 里不存在
  ⇒ 二选一：按宿主包缺失加**显式环境跳过**（写明跳过依据，禁静默），或把该依赖补进 devDependencies。
- `tests/kb-{generate,invalidation,operations}.test.ts`：三条都是**生成物/条目数与基线不一致**
  ⇒ 先跑知识层重建（`pnpm kb:build` 之类）再按新读数更新基线；**每条基线必须写理由**，禁「为绿而绿」。
- `tests/zero-arg-binding.test.ts`：探针「向上找不到含 `pnpm.patchedDependencies` 的仓库根」
  ⇒ 属探针的根定位逻辑在临时目录下失效，修探针（不是改断言）。

**A 桶里最像「新语义已定、只欠跟进」的几条**（供窗口先易后难）：

- `design-registration`：夹具 5 份设计文档缺 `serves`，而 `src/application/internal/content-gate-wiring.ts:443` 已强制要求 ⇒ 夹具补标注。
- `create-doc-location`：`defaults_used` 已多出 `workspace_root` 键 ⇒ 断言跟进（新键是第五问的产物）。
- `client-view` / `capture`：徽章与文案改名 ⇒ 断言跟进。
- `application/repository`：ID 形态断言 vs 实现 ⇒ 先判「哪个才是意图」，再决定改断言还是升级 B。

**需要警惕的几条（可能是真缺陷，别急着改断言）**：

- `dive-gate-prompt` / `dive-session-driver-wiring`：期望 1 条消息、实得 0 条 ⇒ 先查消息是否真的没投出去。
- `plan-mode` / `decompose-tools` / `t17-queue-e2e`：回执字段与状态推进读数与断言不符 ⇒ 先判字段是**有意改名**还是**丢了**。
- `artifact-openable` / `move-rollback` / `doc-sync`：新门禁（可打开性 / D-x 节）与夹具冲突 ⇒ 夹具补齐即可，但先确认门禁口径。

## 七、追加：两条**不在 vitest 名单里**的仓库门（同为既有红灯）

`pnpm test` 之外，本仓还有两条约定门。实测它们也红，且已用干净 HEAD 对照确认**非本批引入**：

| 门 | 读数 | 归属证据 | 建议动作 |
|----|------|---------|---------|
| `pnpm kb:check` | 4 处漂移：`docs/knowledge/code-map.md`、`code-map.symbols.tsv`、`design-tokens.md`、`design-tokens.classes.tsv` | 干净 HEAD worktree 上 `tsx scripts/kb-build.mts --check` **同样报 4 处**（HEAD 符号 3347 · 工作树 3394） | 跑 `npx tsx scripts/kb-build.mts --write` 重生成后重跑 `--check`；注意生成物会同时吸收他窗在飞符号 |
| `pnpm prompts:check` | **exit 0（通过）** | —— | 无需动作；但它会**先写后校验**，会顺手把 `src/domain/prompt/generated/fragments.ts` 与分片源对齐（本窗口实测重生成 1 行，内容来自他窗改的 `decomposing/heavy` §7 交棒文案） |

**纪律提醒**：`kb:build --write` 是「把生成物对齐到当前 src」，在执行窗口 src 半成品在飞时跑，会把半成品符号一起吸收——
跑之前先确认没有别人正在改 `src/` 结构；跑之后看 `git diff` 属正常现象（生成物本就该跟源走）。

## 八、B 类技术债逐项点名（**不在本需求范围**，此处只留档给未来需求）

实测时间 2026-10-07；均为**干净 HEAD 也红**（见 §二 对照口径）。列清是为了让未来那份需求不必重新取证。

### B1 层边界（`tests/layer-boundary.test.ts`，3 组违规）

| 组 | 违规 | 条数 |
|----|------|------|
| application/ 越界 import（只许依赖 domain 与 shared 的类型，I/O 走端口） | `dive/ReqboardDiveManager.ts → @deepseek-ai/cordis`；`gate/{acceptance,design,task-coverage}-gate.ts → node:fs/promises · node:path`；`internal/diag-log.ts`、`internal/rtm-health.ts → node:fs · node:path`；`use-cases/{Capture,Create}Requirement.ts → node:fs · node:path` | **15 条 / 8 文件** |
| domain/ 非确定性来源 | `domain/checkpoint.ts → Date.now()`、`domain/job-spec.ts → Date.now()` | 2 条 |
| http/ 内状态判断（应调 domain 判定函数） | `http/routers/{requirements,settings-support,settings,stages}.ts` | 4 文件 |

### B2 消息卫生（`tests/message-hygiene.test.ts`，3 组）

- **domain 拼接式消息**（要求规则层为 0）：12 个文件 / 约 114 处，重灾区
  `requirement/archive-manifest.ts`（24）、`task/Footprint.ts`（21）、`knowledge/entry.ts`（19）、
  `knowledge/index-line.ts`（14）、`task/StageRouting.ts`（9）、`knowledge/operations.ts`（8）、
  `prototype/ParityContracts.ts`（7）、`knowledge/generate.ts`（3）、其余 4 个文件 1~4 处。
- **棘轮**：`client` 98 → 615、`shared` 11 → 23（**上升**，规则要求只降不升）。
- **文案单点**：弹框选项与徽章文案必须引用 `domain/text/labels.ts`
  （点名 `client/views/panels/docs.ts`、`verify.ts` 等 2 处；host 与 client 各写一份会静默漂移）。

### B3 单文件 ≤400 行（`tests/size-budget.test.ts`）

**65 个文件超标且不在白名单**。最大 6 个：`application/ports.ts`=1816、
`index.ts`=1296、`application/internal/content-gate-wiring.ts`=1212、
`domain/workflow/AcceptanceSheetSpec.ts`=1072、`application/internal/support.ts`=1065、
`application/use-cases/MoveTask.ts`=1061。

### B4 工作区相对写盘点未受守卫（`tests/project-scope.test.ts`）

- `application/use-cases/EnsureKnowledgeLayer.ts:169  await docs.write(t.path, t.content)`
- `application/use-cases/SubmitArchive.ts:213  await deps.docs.write(manifestPath, manifestText)`

要求：把判定下沉到该写入器，或在豁免/待偿清单里写清理由。

### B5 活卡判定单源（`tests/live-tasks-single-source.test.ts`）

基线之外新增 2 处手写活卡判定（应改调 `domain/status/Predicates.ts` 的单点）：

- `src/client/views/report-band.ts:290  if (status === 'canceled') {`
- `src/client/views/report-head.ts:485  + (h.status === 'canceled' ? '已取消' : '已归档') ...`

清单文件：`tests/fixtures/canceled-literal-baseline.json`（复核命令见测试输出）。

> **为什么不把它们塞进那个 A+C 需求**：B1/B2/B3 的"修法"都要动生产代码结构（拆 import、抽 fmt、
> 拆文件），且 65 个超标文件与 114 处拼接消息是**跨需求面积**，混进一个"收口测试"的需求里
> 必然超范围；而且改它们会与他窗在飞编辑大量冲突。建议单独立项、按层分批。
