# 独立评审报告 · REQ-261006211623-9dc1《需求/设计/拆分三面文档判据门禁加固》

> 评审人：独立复核者（未参与实现）· 日期 2026-10-06 · 工作树 `/Users/mac/Documents/ai/dsh/dsh-pmboard`（分支 `main`）
> 被复核对象：`docs/requirements/REQ-261006211623-9dc1/tests/t1..t4-*.md`（4 份实施证据）+ `docs/reviews/doc-quality-gates-2026-10-06.md`（复核材料）
> 纪律：本文只新增本文件；未调用任何 `reqboard_*` 工具；未改动任何仓库内其它文件（反向核验全部在 `/tmp` 合成树与内存副本中进行）。

---

## ① 复核范围与方式

| 读过的判断对象 | 用途 |
|---|---|
| `requirement.md`（8 FR + 验收标准 + D-1…D-6） | 判据的**标准侧** |
| `design/*.md`（7 份） | 判据的**声明侧**（函数/错误码/行号） |
| `tests/t1..t4-*.md`（4 份） | **被复核对象**（实施者自述读数） |
| `docs/reviews/doc-quality-gates-2026-10-06.md` | **被复核对象**（复核入口读数） |

方式：**不复述自述**。所有读数我自己跑；与文档不一致的一律以我跑到的为准并点名。
反向核验用两条路：① 另写一台 `/tmp/indep-review/drill.mts` 直接 import 真实实现（不经单测）；② 用 `/tmp` 合成树跑真脚本。**没有**改仓库里的任何一个字节。

---

## ② 我独立跑到的读数

### 2.1 题目指定的 7 组读数

| # | 命令 | 我拿到的 | 证据文件/需求声称 | 一致？ |
|---|---|---|---|---|
| 1 | `npx vitest run tests/clause-criteria.test.ts tests/sides-declaration.test.ts tests/doc-quality-gate.test.ts` | **3 passed / 31 tests**（10 / 10 / 11）· exit 0 | t1:14 同 | ✅ |
| 2 | `npx vitest run tests/clause-coverage-gate.test.ts tests/plan-depends-e2e.test.ts tests/plan-doc-table.test.ts tests/plan-footprint-tool-schema.test.ts` | **4 passed / 40 tests**（14 / 8 / 10 / 8）· exit 0 | t3:15 同 | ✅ |
| 3 | `npx vitest run tests/card-layer.test.ts tests/query-report.test.ts tests/dag-panel.test.ts tests/node-panel.test.ts` | **4 passed / 107 tests**（14 / 42 / 23 / 28）· exit 0 | t4:28 同 | ✅ |
| 4a | `npx tsx scripts/design-coord-probe.mts --specimen` | **exit 0**，标本 ①→exit 1 点名 `src/nope/x.ts`、②→exit 1 点名 `src/extra/new-module.ts`、③④⑤→exit 0 | t2:8-12 同 | ✅ |
| 4b | `npx tsx scripts/design-coord-probe.mts --req REQ-261006211623-9dc1` | **exit 0**，路径缺口 0 + 回写缺口 0；`--json`：`pathTokens 95 / exists 68 / whitelist 27 / filesChanged 10 / excludedTestPaths 6 / observations 50` | t2:14-17「缺口 路径 0 + 回写 0」✅；但「通报落点 **1**（非源码类 **1**）」与实测 10 / 6 不符 | ⚠️ 见偏离 D8 |
| 5 | `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` | **exit 1 · 缺口 1**：`6. [RTM 健康] FAIL … 缺 RTM 文件：rtm-accepting.yml（该状态 accepting 下应有）` | requirement.md:294 与 review:199 均声称「缺口 0；exit 0」 | ❌ **不一致（偏离 D1）** |
| 6a | `grep -c "requirement_sides_invalid" dist/index.mjs` | **1** | review:202「→ 1」 | ✅ |
| 6b | `grep -c "skip_integration_reason" dist/index.mjs` | **5** | review:202「→ 5」 | ✅ |
| 7 | design 声明符号抽样（见 2.3） | 24 项全部在源码中确有定义 | t1:45 声称「28 项全部命中」——样本不同，但**结论方向一致** | ✅ |
| 8 | 反向核验（见 ③） | 见 ③ | — | — |

**构建新鲜度**（我自己量的，证据文件没给）：
`dist/index.mjs` mtime `2026-10-06T22:17:11`、`lib/client.js` `22:17:13`，均**晚于**本需求最后改动的源码（`src/client/styles/report.ts` 22:13:32、其余 22:08:10）⇒ 产物不陈旧。
`lib/client.js` 含 `dsh-pm-np-chain-dot`（2 处），`dist/index.mjs` 含 `clause_criteria_warnings`(3) / `plan_doc_warnings`(3) / `requirement_section_missing`(1) / `plan_doc_task_table_incomplete`(2) / `DOC_QUALITY_RULES_SINCE`(2)。

### 2.2 整体验收标准逐条复跑

| requirement.md 验收项 | 我跑到的 | 结论 |
|---|---|---|
| `pnpm templates:check` | `模板 25 份：OK 25 / FAIL 0；缺口 0；观察 6`；`需求模板 6 类：OK 6 / FAIL 0；双向漂移 0`；**exit 0** | ✅ 兑现（:292） |
| `pnpm prompts:verify` | `[check-prompt-fragments] OK`；**exit 0** | ✅ 兑现（:293） |
| `req-doc-validate --req 本需求` → 缺口 0 / exit 0 | **缺口 1 / exit 1** | ❌ **未兑现（:294）** |
| `design-coord-probe --specimen` → exit 0 | exit 0 | ✅ 兑现（:295） |
| `reverse-drill-matrix --group hard` → 8/8 | **未跑**（该脚本会临时改写真实文件；工作树里 `src/client/styles/report.ts` 正被并发窗口编辑，t4:59 自述）→ 判**无法核验**，不记为通过 | ⚠️ 无法核验（:296） |
| 11 个测试文件全绿 | 我按题面跑的三批共 **178 例全绿**；`tests/design-coord-probe.test.ts`、`tests/plan-footprint.test.ts` 未跑 | ✅ 部分核验（:297） |
| 三条反向演练 | 见 ③，**逐条自己跑过** | ✅ 兑现（:298） |
| `pnpm kb:check` K1 既有红 | 未跑（超出题面给定的 7 组；不记为通过也不记为偏离） | ⚠️ 未核验（:300） |

### 2.3 设计声明 → 源码存在性（我自选的样本，未照抄 t1 那批）

24 项里 23 项**文件位置与设计声明完全一致、行号为「偏 9 行」**（见偏离 D3），全部真实存在：

```
CLAUSE_CRITERIA_WINDOW  → src/application/internal/clause-criteria.ts:44   (=40)
clauseDefinitionOf      → src/application/internal/clause-criteria.ts:74   （模块私有，符合设计）
clauseCriteriaHints     → src/application/internal/clause-criteria.ts:122
CLAUSE_VALUE_ANCHOR     → src/domain/workflow/EvidenceAnchor.ts:36
sidesDeclarationGap     → src/application/internal/category-doc-sets.ts:152
frontmatterList         → src/application/internal/category-doc-sets.ts:100
hasRootSection          → src/application/internal/category-doc-sets.ts:303
unrefedKeys             → src/application/internal/plan-refs.ts:99
planKeysIn              → src/application/internal/content-trace.ts:147
chainMissingOf          → src/application/query/QueryDag.ts:67             （模块私有，符合设计）
zeroOverlapDependencyWarnings → src/application/internal/plan-deps-check.ts:82
declaredFiles           → src/application/internal/conflict-check.ts:28
planDocTaskTableMissing → src/application/internal/plan-doc-table.ts:52
planDocColumnWarnings   → src/application/internal/plan-doc-table.ts:63
loadSymbolSet           → scripts/design-coord-probe.mts:529
classifySymbols         → scripts/design-coord-probe.mts:543
runSpecimen             → scripts/design-coord-probe.mts:732
buildReport             → scripts/design-coord-probe.mts:642
isSourceLanding         → scripts/design-coord-probe.mts:273
SOURCE_LANDING_PREFIXES → scripts/design-coord-probe.mts:270
checkWriteback          → scripts/design-coord-probe.mts:462
classifyPaths           → scripts/design-coord-probe.mts:391
scanRequirement         → scripts/design-coord-probe.mts:580
preflight               → scripts/design-coord-probe.mts:565
```
（`preflight` / `buildReport` 首轮 `grep` 各命中一个同名符号——`src/repositories/migrationGate.ts:211` 的局部变量、`scripts/prompt-path-probe.mts:256` 的同名函数；定点复查后确认 `design-coord-probe.mts:565` / `:642` 才是设计所指，非缺失。）

### 2.4 存量读数：三份文档给了三组互不相同的数，我拿到第四组

我用 `--req <REQ> --json` 逐份跑完**全部**有 `design/` 的需求后聚合：

| 来源 | 有 design/ | 绿 | 红 | 路径缺口 | 回写缺口 | 排除落点 |
|---|---|---|---|---|---|---|
| `requirement.md:287`（D-5） | 78 | 18 | 60 | — | — | — |
| `review:141`（§2.2） | 78 | 18 | 60 | 149 | 458 | — |
| `t2:31-36` | 78 | 19 | 59 | 117 | 422 | 1048 |
| **我实测（79 份）** | **79** | **19** | **60** | **125** | **466** | **1204** |

四组两两不同，**没有任何一组互相相等**。t2:38-46 的「最红 5 份」表还可被单独证伪：其声称按回写缺口排的 5 份里**漏掉了 `REQ-261002161439-277d`（回写缺口 44、排除 149）**——按同一口径它应排第 2。我复跑到的 6 份最红（口径与 t2 表完全同构）：

```
REQ-261003215944-9e04  路径 15 / 回写 38 / 排除  29   ← t2 表第 1 行，逐字吻合
REQ-261002161439-277d  路径  8 / 回写 44 / 排除 149   ← t2 表缺失，应排第 2
REQ-261005105032-3b02  路径  3 / 回写 31 / 排除  64   ← t2 表第 2 行
REQ-261004222448-292a  路径  4 / 回写 28 / 排除  45   ← t2 表第 3 行
REQ-261001110934-3766  路径  4 / 回写 24 / 排除  26   ← t2 表第 4 行
REQ-261004103330-005f  路径  7 / 回写 20 / 排除  21   ← t2 表第 5 行
```
即 t2 的**逐份数字可复现，聚合数与排序表不可复现**——这是「聚合读数没跟着工作树走」的典型症状（工作树里需求目录集合在动：现在 79 份，比文档里的 78 多一份）。

### 2.5 条款判据语料：我用自己的口径重算（不复述 456/229）

按与实现**逐字同源**的定义位规则（`DEF_LINE_RE` + 标题前置 `**` 再匹配，即 `clause-criteria.ts:74-80` 的 `clauseDefinitionOf`）重扫：

```
$ npx tsx /tmp/indep-review/clauses.mts
与实现逐字同源的定义位口径：扫描 77 份 requirement.md；条款 466 条；无可核验判据 202 条（43.3%）
最集中的 5 份： REQ-261006170150-52cc 4/4 · REQ-261006130057-7a43 8/8 · REQ-261005143615-5ab1 5/5 …
```
`REQ-261006130057-7a43` = **8/8** 与 review:137 点名的「8/8」吻合 ✅；但总量（我 466 条 / 202 缺口 / 77 份 vs review:136 的 456 条 / 229 缺口 / 84 份）**对不上**——现盘 `requirement.md` 只有 80 份（`ls docs/requirements/*/requirement.md | wc -l` = 80），review 写 84 份。差异可归因于语料在动与计数口径差异，我**不能**判它是错，但这两组数不能同时被当成事实引用。

---

## ③ 反向核验记录（我亲手把输入改坏）

### ③.1 手段一：直接 import 真实实现（`/tmp/indep-review/drill.mts`，不经单测）

```
## A. FR-3 sidesGateFailure
A1 feature + sides:[doc]            → code=requirement_sides_invalid   ✓
A2 feature + sides:[frontend, doc]  → code=requirement_sides_invalid   ✓（混合写法同样拒）
A3 feature + 完全缺 sides           → code=requirement_sides_invalid   ✓
A4 feature + sides:[frontend]       → 放行 undefined                    ✓
A5 feature + sides:[]               → 放行 undefined（显式「无端侧改动」）✓
A6 存量(createdAt<规则起点) + [doc]  → 放行 undefined（不追溯）          ✓
A7 createdAt 不可得 + [doc]         → 放行 undefined（读数不可得不判）  ✓
A8 非 feature/refactor(chore)       → 放行 undefined                    ✓

## B. FR-4 docSectionGateFailure
B2 新 feature + 删掉「失败与并发路径」节 → code=requirement_section_missing ✓
B3 存量 feature + 删节                → 放行 ✓（不追溯）
B4 保留节写「不适用：…」              → 放行 ✓（保留节能被判，删节不能）

## C. FR-1 clauseCriteriaGaps（真 requirement.md 的内存副本 + /tmp 落副本）
C1 原文（一字未改）        → 缺口 0 条 []
C2 把 FR-2 整块正文换成一句形容词（判据锚点全删）→ 缺口 1 条 ["FR-2"]
C3 提示原文点名 FR-2 并给可照抄的修复示例（非空话）
C4 我删的块是 requirement.md:106..127（21 行块体，远小于窗口 40）

## D. FR-8 plan-doc-table
D1 完整表                             → found=true keys=["t1","t2"] uncovered=[]
D2 无任务表                           → found=false → missing=true（硬拒）
D3 表里删掉 t2 那一行                 → uncovered=["t2"]（硬拒，点名该 key）
D4 缺「验收标准/工作量/依赖」列        → 3 条 plan_doc_warnings，不拒（软判）
D5 表头词法漂移（列名改成「卡片key」） → found=false（硬拒，不静默放行）

## E. FR-7 zeroOverlapDependencyWarnings
E1 scripts/*.ts 两端零交集、无理由 → 1 条点名 ✓（判据不空转）
E2 同一对边 + dep_reasons 理由     → 0 条 ✓（有理由放行）
E3 两端有交集                      → 0 条 ✓（不误报）
E4 两端只写 src/** 的零交集边      → 0 条 ✗✗（**判据沉默**，见风险 R2）

## F. FR-6 chainMissing（8 例全对）
in_progress+未声明 stages → true(期望 true)   · in_progress+stages:[] → false
done+未声明 stages       → false              · done+stages:["dev"]  → true
done+stages:[]           → false              · todo+未声明         → false
canceled+stages:["dev"]  → false              · in_progress+有1子卡  → false
两份实现同源核对：application buildDagNodes → p1:true p2:true p3:false；
                  client chainMissing       → p1:true p2:true p3:false  （一致）
```

### ③.2 手段二：`/tmp` 合成树跑真探针（FR-2）

```bash
T=$(mktemp -d /tmp/indep-review/synth2.XXXXXX)      # 绝不碰仓库文件
mkdir -p "$T/docs/requirements/REQ-999912312359-zzzz/design" "$T/scripts"

# ① 合成设计点名盘上不存在的坐标
design/interfaces.md: "模块改动地图：本需求改 src/review-x/broken.ts"
$ npx tsx scripts/design-coord-probe.mts --root "$T" --req REQ-999912312359-zzzz \
      --symbols "$PWD/docs/knowledge/code-map.symbols.tsv"
→ exit 1；FAIL 路径可达 src/review-x/broken.ts ← …/design/interfaces.md:2（既不在磁盘上，也不在白名单）

# ② 把坐标改成 $T 下真实存在的文件（scripts/real-module.mts）
→ exit 0

# ③ 三态之「不可用」
$ npx tsx scripts/design-coord-probe.mts --req NOT-A-REQ   → exit 2（不是 exit 0）
```

### ③.3 手段三：只跑现成单测的过滤用例（FR-5）

```
$ npx vitest run tests/clause-coverage-gate.test.ts -t "文档"   → 4 passed | 10 skipped
$ npx vitest run tests/card-layer.test.ts -t "反|未声明|solo"   → 6 passed |  8 skipped
```
源码侧独立确认「covered 唯一来源」：`src/application/internal/content-gate-wiring.ts:181`
`const covered = [...new Set(rawTasks.flatMap(requirementRefsOf))]`——**没有**任何文档表加入项；`planRefsFromDoc` 只出现在 `refsForLanding` 的存量回填通道里。

**判据不空转的结论（题目必答项）**：我至少对 **FR-1 / FR-2 / FR-3 / FR-4 / FR-6 / FR-8** 六条各做了一次「改坏输入 → 真变红、改回 → 真变绿」的双向核验（C1↔C2、合成树 ①↔②、A1↔A4、B2↔B1、F 组 8 例、D2/D3/D5↔D1）。它们不是空转。
**但有例外**：**FR-7 的零交集判据在真实数据上大面积空转**（E4，见风险 R2）——这是本次评审最实质的技术发现。

---

## ④ 偏离清单

> 编号约定：本节偏离用 **`D1`…`D8`（无连字符）**；第 ⑤ 节的裁定用 **`D-1`…`D-6`（带连字符）**——两者不是一回事。

### D1 ❌ 阻塞｜整体验收标准当下为假：`req-doc-validate` exit 1

- 声称：`requirement.md:294`「→ `缺口 0；exit 0`（9 项判据）」；`review:199`「**exit 0**：判据 9 项（实判 6 / 读数未知 3）；缺口 0」。
- 实测：`exit 1 · 缺口 1`，第 6 项 `[RTM 健康] FAIL … 缺 RTM 文件：rtm-accepting.yml（该状态 accepting 下应有）`。
- 归因（我自己查的台账，不是猜）：`~/.dsh/reqboard/requirements/REQ-261006211623-9dc1/record.json` 的 `status = "accepting"`、`createdAt = 1791292583740`；而该目录下只有 `rtm-brainstorming/design/decomposing/implementing/lifecycle.yml`，**没有 `rtm-accepting.yml`**。
- 附带：`rtm-lifecycle.yml` 仍写 `current_stage: decomposing / status: in_progress`（生成于 13:16、last_updated 13:59），与台账的 `accepting` 不一致。
- 性质：这不是实现代码错，而是「验收标准写成了**无条件**判据，而它实际是**时点/状态相关**读数」+「需求推进到 accepting 时没有生成该状态的 RTM」。但按文档字面，这条**当下不成立**。

### D2 ⚠️ 中｜存量读数三处互斥、t2 的排序表可被证伪

见 ②.4。要点：
- `requirement.md:287`（18绿/60红）≠ `t2:31-36`（19绿/59红）≠ `review:141`（18绿/60红，但路径 149 / 回写 458）≠ 我实测（19绿/60红 · 79 份，路径 125 / 回写 466 / 排除 1204）。
- `t2:38-46` 的「最红 5 份」表**漏掉 `REQ-261002161439-277d`（回写 44）**，而该表自称按缺口排。

### D3 ⚠️ 中｜设计文档对 `design-coord-probe.mts` 的行号引用**系统性偏 9 行**，而探针对此报「缺口 0」

`design/interfaces.md:51-63` 与 `design/architecture.md:63-65` 声明的行号 vs 我实测：

| 声明（设计） | 实际 | 偏差 |
|---|---|---|
| `interfaces.md:51` main :880 | `design-coord-probe.mts:889` | +9 |
| `interfaces.md:52` parseArgs :297 | :306 | +9 |
| `interfaces.md:53` preflight :556 | :565 | +9 |
| `interfaces.md:54` scanRequirement :571 | :580 | +9 |
| `interfaces.md:55` classifyPaths :382 | :391 | +9 |
| `interfaces.md:56` checkWriteback :453 | :462 | +9 |
| `interfaces.md:57` isSourceLanding :264 | :273 | +9 |
| `interfaces.md:58` loadSymbolSet :520 | :529 | +9 |
| `interfaces.md:59` classifySymbols :534 | :543 | +9 |
| `interfaces.md:60` buildReport :633 | :642 | +9 |
| `interfaces.md:61` runSpecimen :723 | :732 | +9 |
| `interfaces.md:63` SOURCE_LANDING_PREFIXES :261 | :270 | +9 |
| `architecture.md:65` extractCodeSymbols :498 | :507 | +9 |
| `interfaces.md:62` WHITELIST :147 | :147 | **0（正确）** |

偏差成因可定位：新增的「裸根名前缀」白名单规则块插在 `WHITELIST` 数组内部（`:147` 之后、`:261` 之前），恰好 9 行 ⇒ `:147` 未偏、其后全部 +9。
**同一事实两份说法**：`interfaces.md:60` 写 `buildReport :633`（错），而 `use-cases.md:48` 写「`:642`（退出码）」（对）。
**为什么这是偏离而不是小瑕疵**：FR-2 的判据只判「路径可达 + 源码类落点回写」，**不判文档里的行号**——所以本需求自己的设计文档坐标已经漂了 9 行，探针仍报 `缺口 0`（②.1 第 4b 行）。本需求要治的病是「设计里点名的坐标实现后失效且无人回写」；这里正是它的一个未覆盖子类（**行号失效**）。

### D4 ⚠️ 小｜客户端落点的行号引用同样已漂

- `design/frontend.md:87` 声称落点①在 `src/client/node-panel.ts:281-282`；实测该 `span` 在 `src/client/node-panel.ts:284`。
- `design/frontend.md:120` 与 `t4:20` 声称 `src/client/styles/report.ts:1158`；实测该规则在 `src/client/styles/report.ts:1156`（`color: #991b1b; font-weight: 600;`）。`t4:59` 自述该文件被并发窗口同时编辑——**规则本身还在**，漂的是行号。

### D5 ⚠️ 小｜`requirement.md` 的 FR-1 验收标准与实际用例数不同步

- `requirement.md:102`「`npx vitest run tests/clause-criteria.test.ts` → **9 passed**」；实测 **10 passed**（`t1:11` 也写 10）。文件数与总数（3 文件 / 31 例）一致，只有这一个数没跟上（多出来的正是 `review:40` 自述新增的「长条款块不假红」锁）。

### D6 ⚠️ 小｜复核材料的白名单条数写错

- `review:45`「命中书写法白名单（**8** 条，逐条写理由）」；`interfaces.md:62`「**9** 条」；实测 `scripts/design-coord-probe.mts:147` 起的 `WHITELIST` 数组体里 `match:` 恰好 **9** 条。
- ⇒ **interfaces.md 对、review 材料错**（`review` 是「复核入口」，读者会照它数）。

### D7 ⚠️ 小｜三处状态读数不一致

- `requirement.md:4` `status: brainstorming`（落盘时写死）· `rtm-lifecycle.yml` `current_stage: decomposing` · 台账 `record.json` `status: accepting`。
- 另：`requirement.md:292-300` 的「验收标准（整体）」**9 个复选框全是未勾选的 `- [ ]`**，而需求已推进到 accepting。

### D8 ⚠️ 小｜t2 的探针读数已不可复现（可解释，但仍不可复现）

- `t2:16`「通报落点 **1**（其中非源码类 **1** 条不服回写判据）」；我实测 `filesChanged 10 / excludedTestPaths 6`。
- 可解释：`docs/requirements/REQ-261006211623-9dc1/tasks/` 目录 mtime `22:18`，晚于 t2 的采集时点（22:08），任务卡文档是之后补的。⇒ 读数有时点性，文档未标注时点。

### 明确写出的「未发现偏离」

- FR-3 `sides` 硬门（A1–A8 八例全符合设计 `interfaces.md:69/72` 的口径，含存量豁免与 `createdAt` 不可得不判）；
- FR-4 必填节门（B1–B4；`category-doc-sets.ts:240` 注释确认刻意不进 DELTA，`doc-section-parity.mts:103/136` 登记为 optional 并指向该门）；
- FR-1 条款判据（C1–C4；窗口常量 `clause-criteria.ts:44` 确为 40；锚点正则 `EvidenceAnchor.ts:36` 与设计逐字一致，含「刻意不收裸数字」）；
- FR-5 单口径（`content-gate-wiring.ts:181` + 过滤用例 4 passed）；
- FR-6 分状态不对称（F 组 8 例全对；`QueryDag.ts:67-74` 与 `progress-bar.ts:200-207` 我逐行比对**逐字同源**，含注释里写明的非对称理由）；
- FR-8 任务表硬/软判（D1–D5）；
- FR-7 的判据本体（E1–E3）；
- 我自选的 24 个声明符号**全部存在**（②.3）；
- `pnpm templates:check` / `pnpm prompts:verify` 均 exit 0；`templates/brainstorming/refactor.md:9` 确实自带 `sides: []`；`feature.md:3` 为 `sides: [frontend, backend]`；
- 存量不追溯（D-5）：`git status --short docs/requirements/` 里**存量 `requirement.md` 改动 0 条、`design/` 改动 0 条**（改动只出现在 `rtm-*.yml` / `queue.json` 这类生成物上）。

---

## ⑤ D-1 … D-6 逐条裁定

| 裁定 | 判 | 我的依据（可复核） |
|---|---|---|
| **D-1** 按底稿开工，8 条 FR 全部落地并各有反向演练 | **已兑现** | 8 条我各跑了一次改坏→变红：FR-1 ③.1-C2 · FR-2 ③.2-① · FR-3 A1 · FR-4 B2 · FR-5 ③.3(`-t 文档` 4 passed + `content-gate-wiring.ts:181`) · FR-6 F 组 · FR-7 E1 · FR-8 D2/D3/D5。**附注**：D-1 未声明「验收标准必须当下可复现」——但 `requirement.md:294` 那条当假，故 D-1 是「兑现但带一条不成立的验收项」（见 D1） |
| **D-2** 立项（feature / expert）并台账化、文档落盘、经 `reqboard_submit` 登记 | **已兑现** | `~/.dsh/reqboard/requirements/REQ-261006211623-9dc1/record.json` 存在（`status=accepting`、`category=feature`）；`artifacts.json` 15 191 B、`plan.json` 有 `tasks` + `approvedAt`；`requirement.md` 落盘且 8 条 FR 接收状态表全绿（`:315-322`）。**附注**：`prompt_difficulty` 我未在 record.json 的顶层键里逐一验（只读到 `promptDifficulty` 字段存在），不细判 |
| **D-3** 留「卡上必须有 refs」，删掉覆盖门禁的文档对照表通道 | **已兑现** | `content-gate-wiring.ts:181` `covered` 只来自 `rawTasks.flatMap(requirementRefsOf)`；`:153` 注释同口径；过滤用例 `-t 文档` 4 passed（含「只补文档表仍被拒」）；`planRefsFromDoc` 降级为 `refsForLanding` 的存量回填通道 |
| **D-4** 实现形态改为**按需求创建时间的提交期硬门**，刻意不进 `CATEGORY_DELTAS` | **已兑现** | `content-gate-wiring.ts:513`(节名常量) / `:529`(`docSectionGateFailure`，先过 `docQualityRulesApply`)；`category-doc-sets.ts:240-244` 注释明写「刻意不放进 DELTA」；`doc-section-parity.mts:103/136` 登记 optional 且理由指向本门；B2/B3 实测（新拒 / 存量放行） |
| **D-5** 两条硬门按 `DOC_QUALITY_RULES_SINCE`；探针按需 `--req`、不批量扫存量；未改任何存量文档 | **已兑现**（判据侧）／**其中一句读数不可复现** | `DocQualityRules.ts` 常量 + A6/A7/B3 实测；`operations.ts:190` 登记 `design-coord-probe.mts` 为按需判据；`package.json`/husky 里**查无**该脚本；存量 `requirement.md`/`design/` 改动 0 条。**但** D-5 的判据句「存量实测：78 个有 design/ 的需求 18 绿 / 60 红」不可复现（我 79 份 / 19 绿 / 60 红，且与 review、t2 三方互斥）→ 见 D2 |
| **D-6** 打回 `chainMissing` 的静默放松，改回分状态不对称判据 | **已兑现** | `QueryDag.ts:67-74` 与 `progress-bar.ts:200-207` 两份实现我逐行比对**逐字同源**；F 组 8 例全部符合「`in_progress` 未声明也算期望有链 / `done` 仅显式非空 `stages` / `stages:[]` 与 `todo` 永不标」；`buildDagNodes` 与 `chainMissing` 在同一批输入上给出相同结果 |

---

## ⑥ 风险与边界（我判断成立 / 被高估）

**R1 成立（高）· 宿主未重载则新门在会话里完全不拦人。**
`t1:58-60`、`t3:49-51`、`review:220-223` 自述此事。我能核到的是「产物已含新码且不陈旧」（②.1），**核不到**「运行中的宿主已加载新版」——这条在我的可见范围内是**不可核验**。风险量级：FR-3 / FR-4 两条硬门的**全部**证据都停留在单测与脚本层，没有任何一条是「真实会话里的提交被拦」的读数。若宿主仍是旧版，用户实际提交 `sides: [doc]` 不会被拒。

**R2 成立（高）· FR-7 零交集判据在真实数据上大面积空转（我的独立发现，文档未提）。**
`src/application/internal/conflict-check.ts:25` 的 `PATH_RE` 四根是 `packages|scripts|tests|docs`——**不含 `src/`**（`.mts` 扩展也不在扩展名表里）。实测：

```
declaredFiles('改 src/x.ts 与 src/y.ts')      → []                      ← 全盲
declaredFiles('改 src/x.ts 与 scripts/a.ts')  → ["scripts/a.ts"]        ← 只有 scripts 那条可见
E4 两端只写 src/** 的零交集边 → zeroOverlapDependencyWarnings 返回 0 条  （判据沉默）
真实语料代理量（docs/requirements/*/decomposition.md 任务表行）：
  含 src/ 的行 530 条 → declaredFiles 一条都抽不到 429 条（81%）、能抽到 101 条
```
`plan-deps-check.ts:74-77` 把「抽不到 = 没有证据 = 不判定」写成了源码注释里的**诚实边界**，`interfaces.md:119` 也如实写了四根是什么——但**没有一处把「`src/**` 根本不在抽取口径内」这个后果说出来**。本仓的落点绝大多数是 `src/`，所以这条判据在多数真实计划上是沉默的。`review:184`「一端抽不到就沉默」低估了它的规模：不是边角情况，而是常态。

**R3 成立（中）· 条款判据窗口 40 的余量只剩 2 行。**
我用与实现同源的定义位口径量了首锚点距定义行的行距分布（80 份 `requirement.md`、140 个条款定义行，**这是我的启发式计数，不是 t1 的计数**）：

```
首锚点行距：中位 9 · p90 20 · 最大 38
首锚点落在 >12 行处（窗口取 12 会假红）：30 条     ← 支持 12→40 这次修正
首锚点落在 >40 行处（窗口取 40 仍会假红）：0 条    ← 余量 = 2 行
```
⇒ 「放宽到 40」这次修正**成立且有实测依据**；但 40 不是安全的整数，是**刚好压住当前最大值**的边界。任何一条 FR 的「详细说明」再长 3 行，就会静默变成新的漏报（漏报 = 判据沉默，不是红）。

**R4 成立（中）· 「探针不进提交前清单」把 FR-2 变成纯自愿判据。**
`operations.ts:190` 是唯一登记处；`package.json` / husky / scripts 全仓 `grep "design-coord-probe"` **零命中**（我跑的）。后果已在本需求身上发生：设计文档行号漂 9 行、probe 仍报绿（D3）。`requirement.md:112` 与 `:274-275` 把「不进清单、不新增 script」写成了**边界**（有理由：全仓跑会红一大批、INDEX 已超预算）——理由成立，但代价是这条硬判据**没有触发点**。

**R5 成立但被高估（低）· `src/client/styles/report.ts` 的并发编辑。**
`t4:59` 担心该改动被并发窗口冲掉。实测：那格规则**在**（`report.ts:1153-1156`），漂的只是行号（t4 的 1158 → 现在 1156）。⇒ 「改动被覆盖」的风险在本次没有发生；真实影响只是**证据里的行号会过期**。

**R6 成立（中）· 同工作树并发窗口污染「全量集合差」与「存量聚合读数」。**
不是理论风险，已被证实：需求目录集合在动（文档 78 份 → 现盘 79 份），直接导致 ②.4 的四方读数互斥、t2 排序表可被证伪（D2）。`review:204-218` 用「集合差 + 逐文件归属」处理失败用例是对的，但**存量聚合读数没有任何一种机制冻结语料快照**，于是每引用一次就多一组数。

**R7 成立（中）· 需求能推进到 `accepting` 而文档自检是红的。**
D1 的直接后果：台账 `status=accepting`，而 `req-doc-validate` 判 FAIL（缺 `rtm-accepting.yml`）。链路进入验收态的动作**不看**这 9 项自检。

**R8 观察（低，我判非偏离）· 圆点用了字面量色值。**
`src/client/node-panel.ts:281` `.dsh-pm-np-chain-dot { … background: #dc2626; … }` 是字面量，原型 `prototypes/dag-chain-missing.html:108` 用的是 `var(--destructive)`（`:24` 定义 `--destructive:#dc2626`）。数值同源、且同一规则里本来就有 `rgba(220,38,38,.4)`（= `#dc2626` 40%）。`t4:39` 声称「不新增色令牌、仅这三处」在**令牌文件**意义上成立。判：不构成色值漂移，仅登记。

**R9 无法核验（如实登记）**
- `npx tsx scripts/reverse-drill-matrix.mts --group hard` → 8/8：**未跑**（该脚本会临时改写真实文件，而工作树里 `report.ts` 正被并发窗口编辑）。这是 requirement.md:296 的验收项，我不能记它通过。
- 全量 `vitest run --reporter=json` 集合差（69 vs 基线 68）：**未跑**（题面只给定三批；且并发窗口在制改动持续污染，跑出来的集合差当下无归属价值）。
- `pnpm kb:check` 的 K1 既有红（`:300`）：**未跑**。
- 宿主是否已重载插件：**不可得**（见 R1）。

---

## ⑦ 结论

### 有条件通过

**判定理由**：判据本体是真的。我对 FR-1 / FR-2 / FR-3 / FR-4 / FR-6 / FR-8 六条各做了「改坏 → 真变红 / 改回 → 真变绿」的双向核验（③.1–③.2），FR-5 有源码取数口 + 过滤用例双重确认；178 例指定用例全绿；声明符号全部存在；`templates:check` / `prompts:verify` exit 0；存量不追溯可核。**不存在阻塞性的实现缺陷**。

**但「交付即完成」不成立**：一条整体验收标准当下为假（D1），三组存量读数互斥且其一可被证伪（D2），设计文档自身行号系统性漂移而判据看不见（D3），另有一组「验收标准写成了无条件判据」的问题。

### 放行条件（建议按此顺序）

| # | 条件 | 对应 | 判据 |
|---|---|---|---|
| **C1** | 补 `rtm-accepting.yml`（或在 `requirement.md:294` 把该条改成带时点/状态条件的判据），并让「推进到 accepting」与这 9 项自检挂钩 | D1 / R7 | `npx tsx scripts/req-doc-validate.mts --req REQ-261006211623-9dc1` → `缺口 0；exit 0` |
| **C2** | 存量读数只保留**一组**并标注采集时点（或改为「随工作树变动、不承诺复现」）；修 `t2:38-46` 漏掉 `REQ-261002161439-277d` 的排序表；三处数字对齐 | D2 / R6 | 在 `t2` / `review:141` / `requirement.md:287` 三处引用同一组数，且能由一条命令重放 |
| **C3** | 更新设计文档里对 `design-coord-probe.mts` 与 client 源码的行号引用（或去掉行号只留文件）；修 `review:45` 的「8 条」→「9 条」 | D3 / D4 / D6 / R4 | `grep -nE 'design-coord-probe\.mts:[0-9]+' design/*.md` 的每一处都能 `sed -n '<行>p'` 取到被声明的符号 |
| **C4** | 把两条「不可核验」落成可核验证据或显式豁免：① 宿主已重载（会话层证据）；② `reverse-drill-matrix --group hard` 8/8 | R1 / R9 | 会话内提交 `sides:[doc]` 被拒的原始回执；`reverse-drill-matrix --group hard` exit 0 |
| **C5** | 对齐三处状态：`requirement.md:4` / `rtm-lifecycle.yml` / 台账 `record.json`；并同步 `requirement.md:292-300` 的复选框 | D7 | 三处 status 同值 |
| **C6** | FR-7 的 `src/` 盲区二选一：扩 `PATH_RE` 的四根，或在 `requirement.md` / `design/interfaces.md:119` 显式写出「`src/**` 不进抽取口径」这条边界（现在只写在 `plan-deps-check.ts:74-77` 的源码注释里） | R2 | `declaredFiles('改 src/x.ts')` 的行为与文档字面一致 |

**不建议**因 D1 判「不通过」：它是状态推进与措辞的耦合问题，不是判据失效；且 C1 是一条命令 + 一次提交即可闭合的事。

---

## 附录：本次评审的临时产物（不在仓库内）

```
/tmp/indep-review/drill.mts                      反向核验台（直接 import 真实实现）
/tmp/indep-review/drill-output.txt               运行落盘
/tmp/indep-review/window.mts                     条款判据窗口行距分布测量
/tmp/indep-review/clauses.mts                    条款判据语料重算
/tmp/indep-review/requirement.FR2-anchor-removed.md   删掉 FR-2 锚点的文档副本
/tmp/indep-review/jsons/*.json                   79 份需求的探针 --json 原始读数
```

## 自证：我只新增了本文件

```
$ git status --short docs/requirements/REQ-261006211623-9dc1/
?? docs/requirements/REQ-261006211623-9dc1/

$ git status --short --untracked-files=all docs/requirements/REQ-261006211623-9dc1/ | grep reviews
?? docs/requirements/REQ-261006211623-9dc1/reviews/independent-review.md

$ git status --short docs/requirements/REQ-261006211623-9dc1/reviews/
?? docs/requirements/REQ-261006211623-9dc1/reviews/
（未跟踪目录被折叠成一行；要看到文件名必须加 -uall，见上一条）

$ git status --short --untracked-files=all docs/requirements/REQ-261006211623-9dc1/ | grep -vc reviews
57
（57 条全部是本窗口开始前就存在的未跟踪文件：requirement.md / design/*.md / tasks/*.md / tests/*.md /
 prototypes/* / rtm-*.yml / queue.json——本次评审对它们一个字节都没动）
```

> 说明：整个 `REQ-261006211623-9dc1/` 目录在本窗口开始时即为**未跟踪**（`??`），故 `git status` 折叠显示为目录级一行；
> 用 `-uall` 展开后，`reviews/` 下**只有** `independent-review.md` 一个文件。
> 本次评审**未修改**任何已存在文件：存量 `requirement.md` 改动 0 条、`design/` 改动 0 条（④「未发现偏离」末条的命令）。
