---
requirement_id: REQ-261008004324-81df
title: "reqboard 红测试收口：A 类夹具跟进 + C 类环境基线"
status: brainstorming
owner: "session-f7cb40a8"
category: bug
requirement_refs: [BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-9, BUG-10, BUG-11]
---

# 需求说明（REQ-261008004324-81df）

> 状态：需求分析（brainstorming） · 窗口 session-f7cb40a8 · 立据：2026-10-08
> 宣布路径：**Bounded**（改动收敛在测试夹具/断言、环境探针与生成物基线三类资产；
> 不动生产语义、不新增能力、不重构。若定性中冒出真缺陷，按 BUG-10 出另案，不在本需求就地改。）
> 排版纪律：并列项用列表或表格；图一律 ASCII 字符画，不用 mermaid。

## TL;DR

- **现象**：全仓 `pnpm test` 红 **37 文件 / 67 用例**；其中 **36 文件 / 66 用例是既有红**
  （干净 HEAD 更红：42 / 75，本窗口本次复跑 —— 不是任何单批引入），**1 文件是在飞新增**
  （`skills-assets`，根因是打包树里混入 `__pycache__` 环境产物，非语义）。
- **为什么现在做**：这批红里 25 个文件是「已提交的新语义已定、测试侧夹具/断言没跟上」，
  5 个文件是「环境与基线漂移」——两者都不需要动生产代码，却是全仓 `pnpm test` 永远红着的噪声，
  掩盖真回归（本次就有一条新红被噪声淹没）。
- **做完得到**：32 个目标文件全绿 + `pnpm kb:check` 退出码 0 + 回归基线集合差为空；
  每条改动带一句定性依据（禁「为绿而绿」），定性为真缺陷的条目有另案点名清单。

## 背景与动机

本需求是 **REQ-261007230908-5ccb（体检第 4 批）验收期间取证**的续作，不是新发现。
取证件随范围原样移入本目录：`triage-evidence.md`（§一结论 / §二复现口径 / §三 36 文件分桶 /
§六逐文件定位 / §七 vitest 外的两条仓库门 / §八 B 类逐项点名）。

用户裁定（2026-10-07 与 2026-10-08，两处原话见「讨论与裁定记录（D-x）」）：

> 只收 A 类（夹具/断言跟进）+ C 类（环境与基线），不动生产语义；B 类另案。

> 原 REQ-261008003615-b587（feature/expert）经人裁定取消：工作性质与 feature 档不符
> （无产品面、无接口面，却要交 6 份设计文档）……本需求为重建件，范围与原裁定一致。

代价（为什么值得单独立项修）：这些红**不区分真假**，于是真回归与夹具滞后共享同一片噪声——
本次实测就有一条在飞新增红（`skills-assets`）藏在其中；同时 `tests/isolate-node-context.test.ts`
因一个缺失的宿主包**整个文件 29 条用例一条都跑不到**（模块级 import 失败），是静默的覆盖损失。

## 缺陷条款（BUG-x）

每条独立成行；判据均为可执行命令或明确读数。

- **BUG-1: 门禁与文档质量新语义——4 个测试文件的夹具/断言跟进**
  （`artifact-openable`、`move-rollback`、`doc-sync`、`design-registration`；6 用例）
  判据：`npx vitest run tests/artifact-openable.test.ts tests/move-rollback.test.ts tests/doc-sync.test.ts tests/design-registration.test.ts` → 4 文件全绿；且补齐内容可核（如 `design-registration` 夹具的 5 份设计文档各自带文档级 `serves`）。
- **BUG-2: 人工门与出口三要素——2 个测试文件跟进**
  （`triad-gate`、`e2e-triad-gate`；6 用例）判据：`npx vitest run tests/triad-gate.test.ts tests/e2e-triad-gate.test.ts` → 绿；断言按现行人工门口径构造路径（不再以 agent 身份硬闯 `decomposing → implementing`）。
- **BUG-3: 文案与注入段——4 个测试文件跟进**
  （`capture`、`client-view`、`node-panel-styles`、`template-address-injection`；9 用例）
  判据：`npx vitest run tests/capture.test.ts tests/client-view.test.ts tests/node-panel-styles.test.ts tests/template-address-injection.test.ts` → 绿；断言引用的文案取自 `src/domain/text/labels.ts` 单点（不得在测试里复制新字面量）。
- **BUG-4: 回执字段与状态推进读数——7 个测试文件跟进**
  （`auto-chain-approval`、`confirm-settle-plan-persist`、`plan-mode`、`t17-queue-e2e`、`t7-legacy-tolerance`、`decompose-tools`、`t11-decompose-queue-write`；11 用例）
  判据：`npx vitest run` 上述 7 文件 → 绿；每条先给出「字段/状态是有意改名，还是丢了」的定性句（丢了 = 真缺陷，走 BUG-10）。
- **BUG-5: 消息投递与台账写入——6 个测试文件跟进**
  （`dive-gate-prompt`、`dive-session-driver-wiring`、`failure-handling`、`interruption-checkpoint`、`handoff`、`adapters/failure-alert`；13 用例）
  判据：`npx vitest run` 上述 6 文件 → 绿；其中「期望 1 条消息、实得 0 条」的 3 条（dive-gate-prompt ×2 / dive-session-driver-wiring ×1）必须先证「消息真的没投出去还是夹具没接住」，禁止直接改断言。
- **BUG-6: 夹具细节与 ID 形态——2 个测试文件跟进**
  （`create-doc-location`、`application/repository`；3 用例）
  判据：`npx vitest run tests/create-doc-location.test.ts tests/application/repository.test.ts` → 绿；ID 形态（`REQ-<12位时间戳>-<4位hex>` vs `/^REQ-[0-9a-f]{6}$/`）先判「哪个才是现行意图」，判成真缺陷即出另案。
- **BUG-7: C 类·缺环境依赖与探针锚点——2 个文件**
  （`isolate-node-context` 文件级失败 + `zero-arg-binding` 4 用例）
  判据：`npx vitest run tests/isolate-node-context.test.ts tests/zero-arg-binding.test.ts` → 绿，或按**显式环境跳过**口径落地（skip 计数与依据可读、禁静默），且 `isolate-node-context` 里 29 条不依赖宿主包的用例恢复执行。
- **BUG-8: C 类·知识层生成物与基线——3 个文件 + 1 条仓库门**
  （`kb-generate`、`kb-invalidation`、`kb-operations` + `pnpm kb:check` 报 4 处漂移）
  判据：`pnpm kb:build && pnpm kb:check` → 退出码 0（`pnpm kb:build` 只在 `src/` 无他窗在飞结构改动时跑）；`npx vitest run tests/kb-generate.test.ts tests/kb-invalidation.test.ts tests/kb-operations.test.ts` → 绿；每条被刷新的基线带一句理由（条目数 63 → 71 这类差值必须解释）。
- **BUG-9: C 类·打包资产环境产物——1 个文件**
  （`skills-assets`：工作树红 / HEAD 绿，根因 `skills/ui-ux-pro-max/scripts/__pycache__/*.pyc` 三个文件混进打包树）
  判据：`npx vitest run tests/skills-assets.test.ts` → 绿；`skills/` 下不再有 `__pycache__`（或该目录已被打包排除口径覆盖并有断言锁住）。
- **BUG-10: 逐文件定性落账（禁为绿而绿）与另案移交**
  判据：32 个目标文件**逐个**有一句定性（夹具/断言滞后 → 改夹具；环境/基线 → 改环境或基线；真缺陷 → 出另案）+ 一句依据（命令读数或 commit/文档指向）；定性为真缺陷的条目进「另案点名清单」（文件 + 首条读数 + 理由），并从本需求目标集移出。`tests/canceled-legacy-read.test.ts` 属两条口径都红的**待定性**条目（HEAD 全量红 / 单跑绿；工作树单跑也红），先定性再归类。
- **BUG-11: 收口读数——目标文件全绿且基线集合差为空**
  判据：`npx tsx scripts/test-baseline.mts --check` → 差集为空、退出码 0（刷新须逐条写理由）；`pnpm test` 的剩余红全部有归属（B 类 / 他窗在飞 / 已出另案），逐条点名。

## 目标

| 编号 | 目标 | 价值（解决什么问题/对谁的价值） | 衡量指标 | 目标值 |
|---|---|---|---|---|
| 目标-1 | 既有红里的 A 类（夹具/断言滞后）修到绿 | 让 `pnpm test` 的红只代表真问题 | 目标文件 vitest 读数 | 25 个 A 类文件全绿 |
| 目标-2 | 既有红里的 C 类（环境/基线）修到绿 | 消除「环境不对就红一片」的假信号 | 目标文件 + `pnpm kb:check` | 5 个 C 类文件全绿、`kb:check` 退出码 0 |
| 目标-3 | 在飞新增红（打包资产环境产物）清零 | 打包门恢复可用 | `skills-assets` 读数 | 1 文件绿 |
| 目标-4 | 每条定性有依据，真缺陷另案 | 防止「为绿而绿」把真缺陷改没 | 定性落账表 + 另案点名清单 | 32 文件逐条有句 + 清单成文 |
| 目标-5 | 基线可机械复核 | 下次改动有集合差判据，不靠数字 | `test-baseline.mts --check` | 差集为空、exit 0 |

## 非目标

- N1 **B 类技术债**（5 文件：`layer-boundary`、`live-tasks-single-source`、`message-hygiene`、
  `project-scope`、`size-budget`）——要改生产代码结构（拆 import、抽 `fmt`、拆文件、下沉判定），
  且面积跨需求、与他窗在飞编辑冲突；已由取证件 §八 逐项点名留档，另行立项。
- N2 新增功能与能力（本需求只让既有测试回到当前语义，不引入新行为）。
- N3 顺手重构（bug 档纪律：回归测试覆盖复现路径即止）。
- N4 追改 `docs/requirements/**` 里的历史基线数字（证据优先，历史快照不追改）。
- N5 替别窗收拾它自己的在飞改动（遇到即点名，不代改）。

## 边界（不做什么）

- **不修 B 类**：不动 `application/` 的越界 import、不抽 domain 的 `fmt`、不拆超 400 行文件、
  不改写盘点守卫、不改手写活卡判定。理由：改法都要动生产代码结构，与「不动生产语义」的裁定冲突，
  且 B 类文件多被他窗在飞编辑。
- **不为绿而绿**：定性为真缺陷的条目**禁止**改断言转绿——必须出另案并在清单里点名。
  理由：本需求存在的意义就是把噪声与真信号分开，改断言转绿恰好毁掉这个价值。
- **不动生产语义**：`src/` 下只允许「因环境/基线修复所必需」的最小改动
  （如恢复补丁登记、把宿主包依赖改成显式可跳过的形态）；任何改变运行时行为的改动都出另案。
- **不纳入他窗在飞引入的红**（除非根因是环境产物且修法非语义，见 BUG-9）：
  工作树含 196 个在飞改动文件，本需求只认「干净 HEAD 同样红」的既有条目。
- **不在 `src/` 半成品在飞时跑 `pnpm kb:build --write`**：冒烟口径是「生成物对齐当前 src」，
  在飞半成品会被一起吸收；跑之前先确认没人正在改 `src/` 结构。
- **不删节**：`triage-evidence.md` 原样保留（它是取证件，不是本需求的验收产物，不追改）。

## 验收标准

1. `npx vitest run <BUG-1..BUG-9 点名的每个文件>` → 全部通过，逐文件点名，不抽样。
2. `pnpm test` → 目标 32 文件不再出现在失败清单里；剩余红逐条有归属（B 类 / 他窗在飞 / 另案）。
3. `pnpm kb:check` → 退出码 0（`kb-build --check` + `kb-conventions-sync --check` + `kb-probe` 三段全过）。
4. `npx tsx scripts/test-baseline.mts --check` → 差集为空、退出码 0；若发生 `--refresh`，
   刷新历史表新增一行且理由非空。
5. 定性落账表 32 行齐；另案点名清单成文（可为空，但必须显式写「无」）。
6. 回归口径可复现：`git worktree add /tmp/pmboard-head HEAD --detach` + 软链 `node_modules`
   后跑 `pnpm test`，读数与本文档 §复现步骤 的 HEAD 行一致（±他窗在飞改动）。

## 改动位置

本需求无业务流程语义，改动落在**三类资产**上：

```
pnpm test ──▶ 【A 类：25 个测试文件的夹具/断言】 ──▶ 绿
          └─▶ 【C 类：5 个测试文件的环境/基线】   ──▶ 绿
pnpm kb:check ──▶ 【知识层生成物 + 基线数字】        ──▶ 退出码 0
```

| 资产 | 本次是否改动 | 说明 |
|---|---|---|
| 上游：`src/` 生产代码 | 否（例外见 BUG-7/BUG-8 的最小必要改动） | 改运行时行为一律出另案 |
| 【测试夹具/断言】`tests/**` | 是 | 25 个文件；只跟语义，不改门禁强度 |
| 【测试环境探针】`tests/isolate-node-context.test.ts` 等 | 是 | 缺失宿主包 → 显式环境跳过，不静默 |
| 【知识层生成物】`docs/knowledge/*` + TSV | 是 | `kb:build --write` 重生成后重跑 `--check` |
| 【回归基线】`docs/reviews/test-baseline.*` | 是 | 只在确认非本次引入时刷新，逐条写理由 |
| 下游：看板 / 工具面行为 | 否 | 本次不改任何工具回执契约 |

## 改动对比

| 项 | 修复前（缺陷行为） | 修复后（预期行为） | 说明 |
|---|---|---|---|
| 全仓 `pnpm test` | 37 文件 / 67 用例红，真假不分 | 目标 31 文件全绿；剩余红逐条有归属 | 既有红 36 + 在飞新增 1 |
| `tests/isolate-node-context.test.ts` | 模块级 import 失败 → 整文件 0 用例可跑 | 显式环境跳过（依据可读）或依赖就位；29 条非依赖用例恢复 | 覆盖损失最大的一条 |
| `tests/zero-arg-binding.test.ts` | 探针找不到含 `pnpm.patchedDependencies` 的仓库根 → 4 条红 | 锚点与现状对齐（恢复登记或按环境门退休并写理由） | 锚点全仓已不存在 |
| `tests/kb-*.test.ts` + `pnpm kb:check` | 生成物与基线不一致（如条目数 63 vs 71；漂移 4 处） | 重生成后读数一致、`--check` 退出码 0 | 每条基线更新带理由 |
| `tests/skills-assets.test.ts` | 打包树混入 3 个 `__pycache__/*.pyc` | 目录不存在或已被排除口径覆盖 | 在飞新增红，修法非语义 |
| 定性结论 | 无（红的成因靠记忆与转述） | 31 行定性落账 + 真缺陷另案点名清单 | 防「为绿而绿」 |

## 复现步骤

**环境**：仓库 `/Users/mac/Documents/ai/dsh/dsh-pmboard`，HEAD `c49fd5e`，工作树含 196 个在飞改动文件。

```bash
pnpm install

# ① 当前工作树（本需求要收的现场）
pnpm test
# → Test Files 37 failed | 568 passed | 3 skipped (608)
# → Tests      67 failed | 7071 passed | 22 skipped (7160)

# ② 干净 HEAD 对照（不污染工作区；证明「既有红」非本批引入）
git worktree add /tmp/pmboard-head HEAD --detach
ln -s "$PWD/node_modules" /tmp/pmboard-head/node_modules
cd /tmp/pmboard-head && pnpm test
# → Test Files 42 failed | 544 passed | 3 skipped (589)
# → Tests      75 failed | 6905 passed | 22 skipped (7021)
cd - && git worktree remove /tmp/pmboard-head --force

# ③ vitest 之外的仓库门
pnpm kb:check
# → [verify] 检测到 4 处漂移 → exit 1
#    docs/knowledge/code-map.md · code-map.symbols.tsv · design-tokens.md · design-tokens.classes.tsv
```

**读数归因（本次实测，2026-10-08）**

| 口径 | 失败文件 | 失败用例 | 说明 |
|---|---|---|---|
| 当前工作树 | 37 | 67 | 含在飞新增 1 文件 |
| 干净 HEAD | 42 | 75 | 其中 6 文件已在飞转绿（compat-regression / gate-aware-questions / hermetic-guard / panel-build-frame / panel-build-stamp / task-status-integration） |
| **既有红**（HEAD 同样红） | **36** | **66** | 与取证件 §三 的 36 文件清单一致 |
| **在飞新增**（HEAD 绿、工作树红） | 1 | 1 | `tests/skills-assets.test.ts`（`__pycache__` 环境产物） |

**证据附件**：取证件 `triage-evidence.md`（36 文件分桶 + 逐文件首条读数 + B 类逐项点名）；
本窗口本次复跑读数（§复现步骤 三组命令的输出摘要）；工作树指纹 HEAD `c49fd5e` + 196 改动文件。

## 根因

不是某一次提交的疏忽，而是**三类不同机制**叠加（每类都需各自定性）：

1. **A 类 = 夹具/断言与已提交语义「同源纪律」的漏项**（25 文件 / 49 用例）。
   多个已提交特性改了回执字段、文案、门禁口径、注入段地址，而测试侧的夹具与断言没在同一批跟上。
   实证：`design-registration` 夹具的 5 份设计文档缺文档级 `serves`，而
   `src/application/internal/content-gate-wiring.ts` 已强制要求；`create-doc-location` 的
   `defaults_used` 已多出 `workspace_root` 键；`client-view` 徽章与 `capture` 文案已改名。
   **注意**：A 类里有 9 个文件（见下「待定性」）可能不是夹具滞后而是真缺陷，须逐条定性后再动手。
2. **C 类 = 环境与基线漂移**（5 文件 + 1 条仓库门）。
   ① `@deepseek-ai/dsh-session` 在本仓 `node_modules` 不存在，而测试在**模块级** import 它
   ⇒ 整个文件（29 条用例）collect 阶段就失败；② 仓库根 `package.json` 已无
   `pnpm.patchedDependencies`（HEAD 亦然），`patches/` 只剩 `dsh-ptc-runtime` 补丁，
   `node_modules` 也无该包 ⇒ 探针锚点与现状不符；③ `docs/knowledge/*` 生成物落后于 `src/`
   （符号 3394 vs 生成物 3200 行）⇒ `kb:check` 报 4 处漂移。
3. **在飞新增 = 环境产物混进打包树**（1 文件）。
   跑过 skill 的 Python 检索脚本后，`skills/ui-ux-pro-max/scripts/__pycache__/*.pyc` 留在树里
   （被 `.gitignore` 忽略故 `git status` 不可见），`skills-assets` 的体积门当场报红。
4. **一条待定性**：`tests/canceled-legacy-read.test.ts` 在 HEAD **全量**跑红 / **单跑**绿，
   在工作树单跑也红 ⇒ 既有「用例间污染」与在飞改动至少有一层；先定性再归类。

**待定性清单（疑似真缺陷，开工先判，别急着改断言）**：`dive-gate-prompt`、
`dive-session-driver-wiring`（期望 1 条消息实得 0 条）；`plan-mode`、`decompose-tools`、
`t17-queue-e2e`（回执字段与状态推进读数不符）；`artifact-openable`、`move-rollback`、`doc-sync`
（新门禁与夹具冲突）；`application/repository`（ID 形态）。

## 回归

- **回归命令**（每条修复都按「先红 → 后绿」跑同一命令，读数入定性行）：
  `npx vitest run <该文件>`；收口时 `pnpm test` + `pnpm kb:check` +
  `npx tsx scripts/test-baseline.mts --check`。
- **回归覆盖**：修复必须覆盖原复现路径本身（例如 `design-registration` 的夹具补齐后，
  「单份登记」「二次幂等」「部分新增」三条读数都要重跑），不得只让失败那条变绿。
- **禁顺手重构**：改夹具/断言时不动被测量的语义；发现语义本身有问题走 BUG-10 另案。
- **基线刷新纪律**：只有确认「非本次引入」才允许 `test-baseline.mts --refresh`，
  并在 `docs/reviews/test-baseline.md` 的刷新历史表新增一行、理由非空。
- **防复发**：`skills-assets` 类环境产物在本需求收口时确认清理口径；若清理靠手工，
  在回归里写明「打包前先确认 `skills/**/__pycache__` 不存在」。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| B 类是否随本需求一起收 | 一起收（一次清干净） | 排除、另案 | B 类要动生产代码结构且面积跨需求，与他窗在飞编辑冲突；用户原话「B 类另案」（D-1） |
| 真缺陷怎么办 | 就地改生产代码 | 出另案点名 | 「不动生产语义」是范围裁定的前提；就地改会让本需求变成无边界大修（D-1） |
| 在飞新增红（`skills-assets`）是否纳入 | 一律点名不做 | 纳入 C 类 | 根因是环境产物、修法非语义，且不修则 `pnpm test` 永远多一条红，噪声再次掩盖真回归 |
| 基线刷新方式 | 直接改断言/数字转绿 | 重生成 + 逐条写理由 | 用户原话「禁为绿而绿」；基线是「承认现状」的凭据，不是目标（D-1） |
| 需求分类 | 保持 feature（要交 6 份设计文档） | 取消重建为 bug | 用户裁定：工作性质与 feature 档不符（无产品面、无接口面）（D-2） |
| 是否先做 C 类 | 按文件序号做 | 先 C 后 A | C 类是环境/基线（不动语义、风险最低），且修好 C 才能让 A 的读数干净 |

## 技术方案与亮点

- **复用既有机械，不另起一套**：收口判据直接用 `scripts/test-baseline.mts --check` 的
  **集合差**口径（不依赖会过期的失败计数），不新造基线工具。
- **定性落账表**：把取证件的「逐文件定位表」升级为「文件 → 桶 → 首条读数 → 定性 → 依据」五列，
  定性句与修复同一批落地——这是本需求唯一的新增产物形态。
- **两条仓库门与 vitest 同批收口**：`pnpm kb:check` 与 `pnpm test` 一起判，
  避免「测试绿了但生成物仍漂移」的半绿状态。
- **与他窗共存的口径**：以「干净 HEAD 是否同样红」为归属判据（而非谁的提交），
  在飞改动只做点名不做代改。
- 与常规做法的差异：多数「修红测试」需求按文件清单推进；本需求按**成因分桶**推进，
  并把「真缺陷另案」写成硬条款（BUG-10），否则边界会在第一次遇到真缺陷时失控。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | reqboard 会话捕获留痕 c-724500（2026-10-07，人经五问弹框确认）：「用户裁定：只收 A+C 低成本批次，不动生产语义；B 类另行处置。」 | 范围 = 既有红里的 A 类（夹具/断言跟进）+ C 类（环境与基线）；B 类技术债与「改生产语义」的修法一律排除 | BUG-1, BUG-2, BUG-3, BUG-4, BUG-5, BUG-6, BUG-7, BUG-8, BUG-10 | 本文档「边界（不做什么）」前两条 + BUG-10 的另案点名清单；验收标准 2 的「剩余红逐条有归属」 |
| D-2 | reqboard 代理立项留痕 c-93ea74（2026-10-08）：「原 REQ-261008003615-b587（feature/expert）经人裁定取消：工作性质与 feature 档不符（无产品面、无接口面，却要交 6 份设计文档）……本需求为重建件，范围与原裁定一致。」 | 本需求按 **bug** 档推进：必交设计文档 0 份、不交原型；范围与原 feature 件一致 | BUG-1, BUG-7, BUG-8, BUG-11 | 本文档 front-matter `category: bug`；验收标准 1–4 全部为可执行命令读数，无产品/接口面条款 |

## 修订记录

| 日期 | 修改内容 | 修改人 |
|---|---|---|
| 2026-10-08 | 初稿：范围承接取证件 A+C、按 bug 档重建、补 11 条 BUG 条款与 D-x 落账 | session-f7cb40a8 |

## 目标文件清单（本次实测，2026-10-08）

> 来源：`pnpm test` 全量输出解析（工作树 HEAD `c49fd5e` + 196 在飞改动文件）。
> 「HEAD 红」= 干净 HEAD worktree 同一文件是否也红（判定归属的唯一口径）。
> 「定性」列是**开工时必须逐条钉住**的一句结论，现列出取证件的初判，未定性前不得改断言。

| 桶 | 文件 | 失败用例 | HEAD 红 | 首条读数（截断） | 定性（初判，待逐条钉住） | 承接条款 |
|---|---|---|---|---|---|---|
| A | `tests/adapters/failure-alert.test.ts` | 2 | 是 | expected [ …(2) ] to have a length of 1 but got 2 | 消息投递与台账写入断言滞后（先证消息是否真的没投出） | BUG-5 |
| A | `tests/application/repository.test.ts` | 1 | 是 | expected 'REQ-261008004637-6dbe' to match /^REQ-[0-9a-f]{6}$/ | 夹具细节 / ID 形态（先判哪个才是现行意图） | BUG-6 |
| A | `tests/artifact-openable.test.ts` | 1 | 是 | reqboard_archive_submit 未执行：产物登记被拒：文件不存在（normalized=docs/guides/x.md）  | 夹具/断言滞后于已提交门禁新语义（可打开性 / D-x 节 / serves） | BUG-1 |
| A | `tests/auto-chain-approval.test.ts` | 1 | 是 | expected 'accepting' to be 'implementing' // Object.is equality | 回执字段与状态推进读数不符（先判改名还是丢了） | BUG-4 |
| A | `tests/capture.test.ts` | 1 | 是 | expected '📋 PM · 项目捕获（reqboard · 本窗口 session-a…' to contain '不许沉默' | 文案/徽章/地址段已改名，断言未跟 | BUG-3 |
| A | `tests/client-view.test.ts` | 3 | 是 | expected '\n    <div class="dsh-pm-board">\n   …' to contain '计划待批' | 文案/徽章/地址段已改名，断言未跟 | BUG-3 |
| A | `tests/confirm-settle-plan-persist.test.ts` | 1 | 是 | expected false to be true // Object.is equality | 回执字段与状态推进读数不符（先判改名还是丢了） | BUG-4 |
| A | `tests/create-doc-location.test.ts` | 2 | 是 | expected [ 'location', 'workspace_root' ] to deeply equal [ 'location' | 夹具细节 / ID 形态（先判哪个才是现行意图） | BUG-6 |
| A | `tests/decompose-tools.test.ts` | 5 | 是 | expected [Function] to throw error matching /REQBOARD_ALREADY_DECOMPOS | 回执字段与状态推进读数不符（先判改名还是丢了） | BUG-4 |
| A | `tests/design-registration.test.ts` | 3 | 是 | reqboard_submit(kind=design) 被内容校验门禁拒绝：architecture.md（文档级 serves 缺失：H | 夹具/断言滞后于已提交门禁新语义（可打开性 / D-x 节 / serves） | BUG-1 |
| A | `tests/dive-gate-prompt.test.ts` | 2 | 是 | expected [] to have a length of 1 but got +0 | 消息投递与台账写入断言滞后（先证消息是否真的没投出） | BUG-5 |
| A | `tests/dive-session-driver-wiring.test.ts` | 3 | 是 | expected [] to have a length of 1 but got +0 | 消息投递与台账写入断言滞后（先证消息是否真的没投出） | BUG-5 |
| A | `tests/doc-sync.test.ts` | 1 | 是 | reqboard_move 未执行：docs/requirements/REQ-ds1234/requirement.md 的「讨论与裁定记 | 夹具/断言滞后于已提交门禁新语义（可打开性 / D-x 节 / serves） | BUG-1 |
| A | `tests/e2e-triad-gate.test.ts` | 2 | 是 | 转移 decomposing → implementing 是人工闸门，仅人可操作（REQBOARD_HUMAN_GATE） | 断言按旧口径硬闯人工门（门已收紧） | BUG-2 |
| A | `tests/failure-handling.test.ts` | 1 | 是 | expected [] to deeply equal [ 'rollback' ] | 消息投递与台账写入断言滞后（先证消息是否真的没投出） | BUG-5 |
| A | `tests/handoff.test.ts` | 2 | 是 | reqboard_task_move 未执行：任务 t-d136d3 的上层依赖未完成——t-5a153b（todo）协议层加时间线字段。先 | 消息投递与台账写入断言滞后（先证消息是否真的没投出） | BUG-5 |
| A | `tests/interruption-checkpoint.test.ts` | 3 | 是 | expected undefined not to be undefined | 消息投递与台账写入断言滞后（先证消息是否真的没投出） | BUG-5 |
| A | `tests/move-rollback.test.ts` | 1 | 是 | reqboard_move 未执行：design → decomposing 的设计文档集：requirement.md 不存在（无法核验文 | 夹具/断言滞后于已提交门禁新语义（可打开性 / D-x 节 / serves） | BUG-1 |
| A | `tests/node-panel-styles.test.ts` | 1 | 是 | expected '\n/* ===== Apple 风设计令牌（本面板私有） ===== *…' to contain 'min(720p | 文案/徽章/地址段已改名，断言未跟 | BUG-3 |
| A | `tests/plan-mode.test.ts` | 1 | 是 | expected undefined to be 'decomposing' // Object.is equality | 回执字段与状态推进读数不符（先判改名还是丢了） | BUG-4 |
| A | `tests/t11-decompose-queue-write.test.ts` | 1 | 是 | expected '/**\n * 确认裁决应用（REQ-260924213231-b1c4 …' to contain 'landPlan | 回执字段与状态推进读数不符（先判改名还是丢了） | BUG-4 |
| A | `tests/t17-queue-e2e.test.ts` | 1 | 是 | expected 'brainstorming' to be 'design' // Object.is equality | 回执字段与状态推进读数不符（先判改名还是丢了） | BUG-4 |
| A | `tests/t7-legacy-tolerance.test.ts` | 1 | 是 | expected true to be false // Object.is equality | 回执字段与状态推进读数不符（先判改名还是丢了） | BUG-4 |
| A | `tests/template-address-injection.test.ts` | 4 | 是 | expected 0 to be greater than 0 | 文案/徽章/地址段已改名，断言未跟 | BUG-3 |
| A | `tests/triad-gate.test.ts` | 4 | 是 | expected [Function] to throw error matching /task_card_incomplete/ but | 断言按旧口径硬闯人工门（门已收紧） | BUG-2 |
| C | `tests/isolate-node-context.test.ts` | 0（文件级） | 是 | Failed to load url @deepseek-ai/dsh-session (resolved id: @deepseek-ai | 环境缺失（宿主包不在 / 补丁锚点已不存在） | BUG-7 |
| C | `tests/kb-generate.test.ts` | 1 | 是 | expected [ …(13) ] to deeply equal [] | 生成物与基线数字漂移（重生成 + 逐条写理由） | BUG-8 |
| C | `tests/kb-invalidation.test.ts` | 1 | 是 | 不可判定条数应等于条目总数（存量口径：全部不可判定）: expected 63 to be 71 // Object.is equality | 生成物与基线数字漂移（重生成 + 逐条写理由） | BUG-8 |
| C | `tests/kb-operations.test.ts` | 1 | 是 | expected [ …(14) ] to have a length of 12 but got 14 | 生成物与基线数字漂移（重生成 + 逐条写理由） | BUG-8 |
| C | `tests/skills-assets.test.ts` | 1 | 否 | expected [ …(3) ] to deeply equal [] | 打包树混入环境产物（__pycache__），非语义 | BUG-9 |
| C | `tests/zero-arg-binding.test.ts` | 4 | 是 | 向上未找到含 pnpm.patchedDependencies 的仓库根 package.json | 环境缺失（宿主包不在 / 补丁锚点已不存在） | BUG-7 |
| 待定 | `tests/canceled-legacy-read.test.ts` | 1 | 是 | expected false to be true // Object.is equality | 两条口径都红（HEAD 全量红 / 单跑绿；工作树单跑也红），先定性再归类 | 待定性（BUG-10） |
| B | `tests/layer-boundary.test.ts` | 3 | 是 | application/ 出现越界 import： | 真实技术债（需改生产代码结构），另案 | —（N1 范围外） |
| B | `tests/live-tasks-single-source.test.ts` | 2 | 是 | 检测到基线之外的新手写活卡判定（新增即红）；请改调 `domain/status/Predicates.ts` 的单点，或在清单里登记基线条 | 真实技术债（需改生产代码结构），另案 | —（N1 范围外） |
| B | `tests/message-hygiene.test.ts` | 3 | 是 | domain 仍有拼接式消息，请改用 fmt： | 真实技术债（需改生产代码结构），另案 | —（N1 范围外） |
| B | `tests/project-scope.test.ts` | 1 | 是 | 以下工作区相对写盘点既未受守卫保护、也未在豁免/待偿清单里——请把判定下沉到该写入器，或写清理由： | 真实技术债（需改生产代码结构），另案 | —（N1 范围外） |
| B | `tests/size-budget.test.ts` | 1 | 是 | 超标文件（未在白名单内）： | 真实技术债（需改生产代码结构），另案 | —（N1 范围外） |

合计：A 类 25 文件 · C 类既有红 5 文件 · 待定性 1 文件 · 在飞新增 1 文件（skills-assets，已归 C 类）＝ 目标 32 文件；B 类 5 文件为范围外。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| BUG-1 | ✅ 已接收 | t1、t-31ef1e |
| BUG-2 | ✅ 已接收 | t2、t-62c5ea |
| BUG-3 | ✅ 已接收 | t3、t-6056de |
| BUG-4 | ✅ 已接收 | t4、t5、t-0f4ab9、t-e1cf86 |
| BUG-5 | ✅ 已接收 | t6、t7、t-734554、t-effc81 |
| BUG-6 | ✅ 已接收 | t8、t-82178d |
| BUG-7 | ✅ 已接收 | t9、t-09e7b1 |
| BUG-8 | ✅ 已接收 | t10、t-eebb66 |
| BUG-9 | ✅ 已接收 | t11、t-79ed13 |
| BUG-10 | ✅ 已接收 | t12、t-24ffdf、t-93c7cf |
| BUG-11 | ✅ 已接收 | t13、t-93c7cf |

> 无未接收条款（11 条全部有落点）。

<!-- reqboard:marks:end -->
