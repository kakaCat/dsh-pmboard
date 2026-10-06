# 架构设计（REQ-261006123819-3af3）· serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 本需求不新增子系统、不改运行时架构。它整治的是**判定面的自洽性**：
> 让已有门禁重新可信、让基线成为单一事实源、把死字段与死分支清掉。
> 核心是一张**逐文件改动地图**——拆分阶段据此做变更盘点。
>
> **读数时效声明**：本文所有"现状读数"采集于 2026-10-06 12:2x，并已按设计期的
> 复核结果修正（本仓多窗口共用工作树，读数会在几分钟内变化——这正是 FR-6 的动机）。
> 每处修正都注明"原审计读数 → 设计期复核读数"。

## 目标与总体方案 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

**一条主线**：仓库里"宣布通过/失败"的判据自身不可信，于是新增违规与存量噪声不可区分。

```
判定面的病灶                                 本次的动作
─────────────────────────────            ─────────────────────────────
① 三份手写清单漂移（27/18/26）      →     FR-1 单表 registry + 三方机器事实交叉校验
② 同一基线三个数（106/98/70）       →     FR-2 口径改"集合差"，数字单点落基线文件
③ 有读取者、无写入者的字段          →     FR-3 删字段，判据回到 status + statusHistory
④ 知识层自检红 + 孤儿条目会再生      →     FR-4 补条目/索引 + 修两处根因 + 压生成页行数
                ＋
⑤ 交付悬在工作树、读数无法界定      →     FR-5 提交纪律 / FR-6 证据带工作树指纹
```

**为什么按这个顺序**：FR-2 与 FR-5/FR-6 是"度量前提"——没有可信基线与冻结指纹，
其余改动的效果无法界定。设计期已亲身验证这一点：审计报告写完 20 分钟后，
知识层读数就从"6 项失败（含生成物漂移）"变成"5 项失败（漂移已被别的窗口消掉）"。

## 模块改动地图 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

### 新增文件（6） <!-- serves: FR-1,FR-2,FR-3,FR-4,FR-5,FR-6 -->

| 文件 | 职责 | FR |
|---|---|---|
| `src/tools/registry.ts` | 27 条工具登记表（key / factoryFile / dir / toolName / responseSources）——三份清单的唯一手写面 | FR-1 |
| `src/domain/status/ArchivedMoment.ts` | `archivedMomentOf(req)`：归档时刻的唯一判定点 | FR-3 |
| `scripts/test-baseline.mts` | `--refresh` / `--check`：采集读数、算集合差、打印工作树指纹 | FR-2, FR-6 |
| `scripts/commit-check.mts` | `--req <REQ-id>`：判定"这条需求的改动已提交"（C-28 的可跑判据） | FR-5 |
| `docs/reviews/test-baseline.md` | 现行基线（口径 + 摘要 + 刷新历史）——**唯一数字来源** | FR-2 |
| `docs/reviews/test-baseline.failures.txt` | 失败用例集合（一行一条，可 diff） | FR-2 |

### 修改：源码与脚本（12） <!-- serves: FR-1,FR-2,FR-3,FR-4,FR-5,FR-6 -->

| 文件 | 改动 | FR |
|---|---|---|
| `src/shared/protocol.ts` | 删 `archivedAt` / `archivedBy` 两行（:983-984） | FR-3 |
| `src/client/types.ts` | 删客户端镜像两行（:144-145） | FR-3 |
| `src/client/views/panels/docs.ts` | `archiveSection` 增第二参数 `gate`；三处判据改用门禁读数（:847/:849/:868）；调用点传 `d.gates` 那条（:910） | FR-3 |
| `src/client/views/verification.ts` | 三处判据改用 `archivedMomentOf(req)` 与 `req.status`（:241/:242/:247） | FR-3 |
| `src/client/node-panel.ts` | `at = a.submittedAt`（:322，去掉 `?? a.archivedAt`） | FR-3 |
| `src/application/query/QueryDocs.ts` | `case 'archive'` 分支改按 `status` 判定 + `at` 取 `archivedMomentOf`（:669-690） | FR-3 |
| `src/application/use-cases/DepositKnowledge.ts` | **根因①**：`:70` 的 `input.indexEntry.slice(0,140)` 改为先清洗非法字符再截断（`·`/`→`/换行），与 `operations.ts:350` 的既有正确口径同源 | FR-4 |
| `src/adapters/KnowledgeRepository.ts` | **根因②**：`appendEntry` 在写 `entries/<id>.md`（:123）**之前**先校验 `one_liner`（`isOneLiner` / 试 `renderIndexLine`），杜绝"条目落盘、索引没写"的半成品 | FR-4 |
| `src/domain/knowledge/generate.ts` | **页内压行**：`renderDesignTokens`（:158-211）的颜色/变量节由"一行一条"改为一行多条，使 `design-tokens.md` 内容行 ≤199 | FR-4 |
| `src/domain/knowledge/operations.ts` | `EXTRA_ENTRIES` 增 `scripts/test-baseline.mts` 与 `scripts/commit-check.mts`（否则 K10 报"scripts/ 未归类"）；补 C-27 的「失败怎么办」占位 | FR-2, FR-4, FR-5 |
| `scripts/kb-probe.mts` | 新增一条 K 检查：**页面小节 ↔ 索引行**完整性（今天 C-22 漏行无任何门禁在管） | FR-4 |
| `vendor/reqboard/…` | **不动**（本次不涉及镜像侧） | — |

### 修改：测试（9） <!-- serves: FR-1,FR-2,FR-3,FR-4,FR-5,FR-6 -->

| 文件 | 改动 | FR |
|---|---|---|
| `tests/output-contract.test.ts` | 删手写 `RESPONSE_SOURCES`（:597 起），改由 `TOOL_REGISTRY` 派生；放宽工厂正则（:672）覆盖带第二参数的工厂 | FR-1 |
| `tests/tools-dispatch.test.ts` | 目录清单（:26）由 `TOOL_REGISTRY.map(e => e.dir)` 派生 | FR-1 |
| `tests/apply-wiring.test.ts` | 注册名清单（:114 与 `:159` 的 `toHaveLength(26)`）由 `TOOL_REGISTRY.map(e => e.toolName)` 派生 | FR-1 |
| `tests/query-report.test.ts` | 夹具（:826）去掉 `archivedAt/archivedBy`，走真实归档状态 | FR-3 |
| `tests/docs-panel.test.ts` | 夹具（:115-116）与断言（:364）改按门禁读数 | FR-3 |
| `tests/node-panel.test.ts` | 夹具（:40）去掉 `archivedAt` | FR-3 |
| `tests/client-view.test.ts` | 夹具（:590）改真实状态 | FR-3 |
| `tests/stage-detail.test.ts` | 夹具（:273）去掉两字段 | FR-3 |
| `tests/acceptance-criteria.test.ts` | 夹具（:147）去掉两字段 | FR-3 |

### 修改：文档与规范（8） <!-- serves: FR-1,FR-2,FR-3,FR-4,FR-5,FR-6 -->

| 文件 | 改动 | FR |
|---|---|---|
| `docs/knowledge/conventions.md` | 改写 C-14 / C-15 为"口径 + 指针"；新增 C-28「改动后必须提交」（含可跑判据命令）；补 C-27 的「失败怎么办」 | FR-2, FR-4, FR-5 |
| `docs/knowledge/operations.tsv` | c-14 行命令改 `pnpm baseline:check`；新增 c-28 行；跑 `--write` 重写 | FR-2, FR-5 |
| `docs/knowledge/INDEX.md` | 补 C-22、C-28、kb-0043、kb-0048 四行；**并压缩全文回到 ≤8000 字符（含这四行在内）** | FR-4 |
| `docs/knowledge/entries/kb-0043.md` / `kb-0048.md` | 修正 `one_liner`（kb-0043 现 154 字符 >140；kb-0048 含两个 `→`） | FR-4 |
| `docs/guides/acceptance-sheet-workflow.md` | 示例（:16）由 `68 failed ≤ 基线 106` 改为集合差口径示例 | FR-2 |
| `templates/implementing/test-evidence.md` | `## 环境` 节明确要求写入工作树指纹（HEAD + `git diff --stat` 摘要） | FR-6 |
| `templates/accepting/verification.md` | 同上（**注意**：该产物会被生成器全量覆写，见「FR-6 的降级登记」） | FR-6 |
| `package.json` | `scripts` 增 `baseline:refresh` / `baseline:check` / `commit:check` | FR-2, FR-5 |

**模板改动不需要同步门禁**：`src/domain/template/registry.ts:85` 只登记 `relPath`、不登记章节清单
（已核实）；`accepting/verification.md` 的 `## 证据`/`## 验收项` 两节判据
（`scripts/template-gate-probe.mts:425-432`）保持不变——本次只在既有节内加要求，不加节。

## 依赖关系 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

```
FR-2（基线集合差）─┬─▶ FR-5（C-14 用新命令；commit-check 与基线脚本同族）
                   └─▶ FR-6（指纹由基线脚本顺带产出；证据模板要求写入）

FR-4（知识层）── 与 FR-2 在 INDEX 上**冲突**：FR-4 要压回 ≤8000，
                  FR-2/FR-5 各要往 INDEX 加指针行 ⇒ 压缩必须在"加完 4 行之后"达标

FR-1（契约登记面）── 独立，可并行
FR-3（死字段/死分支）─ 独立，可并行
```

**外部依赖与硬约束（均已实测）**：

| 约束 | 事实 | 出处 |
|---|---|---|
| 归档时刻可得 | 87 条 archived 记录 **87/87** 能从 `statusHistory` 取到时刻 | 设计期真实台账扫描 |
| C-28 的命令形态 | 命令必须以 `npx/pnpm/node/python3/tsx/bash` 起头，且「期望」须含锚点（`OK`/`退出码 N`/`passed`/`NONE`），否则 K10 判红 | `operations.ts:275-276`、`:300-306` |
| conventions.md 行数 | 现 **192** 行；`pageMaxLines`=200；C-28 约 6 行 ⇒ 198 行**刚好过**，但已越过页面自述的 180 行预警 | `budget.ts:19`、`conventions.md:72-76` |
| INDEX 预算 | 现 **10648** 字符 > 8000；本需求还要**加 4 行** | 设计期实测 |
| verification.md 会被覆写 | `renderVerificationDoc` 输出固定四节，窗口写入的字段在 `submit` 时被抹掉 | `VerificationDoc.ts:80-129`、`SubmitVerification.ts:362-371` |
| 报告类模板无门禁 | `review.md` / `test-evidence.md` 被显式登记为"无线上门禁" | `template-gate-probe.mts:105-112`、`:390-391` |

## 关键算法/流程 <!-- serves: FR-1, FR-3, FR-5 -->

### FR-3：归档态判定（三态，不合并） <!-- serves: FR-1,FR-3,FR-5 -->

```
                     req.status === 'archived' ?
                          ├── 是 ─▶ verdict=passed
                          │         at = archivedMomentOf(req)   ← 取不到则省略该键
                          └── 否 ─┬─ archive.submittedAt 存在 ─▶ verdict=pending
                                  │   reason=「归档材料已提交，待归档确认」
                                  └─ 已到 accepting ─▶ verdict=pending
                                      reason=「尚未提交归档材料」
                                      （22 条无清单需求落这一支——与上一支是不同状态）
```

**为什么必须分三态**：改动前只有两支，且第一支永不可达 ⇒ 87 条已归档需求全被显示成"待归档"；
而 22 条"真没交材料"与 64 条"交了待批"显示成同一句话，人无从分辨下一步该做什么。

### FR-1：登记面派生与三方交叉校验 <!-- serves: FR-1,FR-3,FR-5 -->

```
TOOL_REGISTRY（唯一手写面，27 条）
      ├──▶ dir 集合        ══ readdirSync('src/tools') 目录集合     （I-1）
      ├──▶ toolName 集合   ══ apply() 后 ctx.tools[].name 集合      （I-2）
      ├──▶ key 集合        ⊇  放宽正则扫到的工厂集合                 （I-3）
      └──▶ responseSources ─▶ returnKeys(...) ⊆ output.schema 声明键（I-5/I-6）
```

### FR-2 / FR-5：两条可跑判据 <!-- serves: FR-1,FR-3,FR-5 -->

```
pnpm baseline:check
   ├─ npx vitest run --reporter=json --outputFile=<tmp>   （取失败用例全名）
   ├─ npx tsc --noEmit                                     （取退出码与错误数）
   ├─ 采集工作树指纹：HEAD 短哈希 + git diff --stat 摘要
   └─ 差集 = 当前失败集合 △ 基线集合
         ├─ 空  ⇒ exit 0
         └─ 非空 ⇒ exit 1，分栏打印「新增失败」「不再失败」

pnpm commit:check --req <REQ-id>
   └─ git log --oneline --grep=<REQ-id>
         ├─ 非空 ⇒ exit 0（OK：该需求改动已提交）
         └─ 空   ⇒ exit 1（FAIL：改动仍在工作树）
```

**`commit:check` 为什么要存在**：C-28 必须在 `## 工程操作` 节里，而该节的每条都要求
**可跑判据命令**（命令以 runner 起头 + 期望含锚点）。`git commit` 本身不满足这两条，
会让 K10 判红。故把"已提交"这个事实做成一条可跑判据，C-28 挂它。

### FR-4：页内压行（生成页回到预算内） <!-- serves: FR-1,FR-3,FR-5 -->

```
renderDesignTokens（generate.ts:158-211）
   颜色 87 条 + 变量 87 条 由「一行一条」→「一行多条」
   ⇒ 列表项 203 → ≤182，内容行 ≤199（留余量）
   不改变：节名（#colors / #vars / #breakpoints / #classes）、
           数据完整性（87+87 全在）、确定性（同输入同输出）
```

## 对已确认需求的收敛说明 <!-- serves: FR-1, FR-2, FR-4, FR-6 -->

设计阶段发现**四处**需求文档写粗了的地方，此处收敛，并在设计确认时请人一并批准：

### 收敛 1（FR-2 验收标准 1）：全仓 grep → 规范性面 grep <!-- serves: FR-1,FR-2,FR-4,FR-6 -->

- 需求原文：「全仓其余引用改为指针」+ 验收 `grep … docs/` 命中数为 0。
- 实测分布：过期阈值共 **185 处**，其中 **180 处在 `docs/requirements/`（带日期的历史记录）**，
  规范性面仅 **6 处**（`conventions.md` C-14/C-15 共 5 行 + 指南示例 1 处）。
- **收敛为**：只改规范性面；180 处历史记录**不追改**——它们写的是"当时的基线是 98"，
  改写即篡改证据（本仓「证据优先」铁律）。豁免面显式登记，验收判据改为 scoped grep。

### 收敛 2（FR-1 范围）：补 4 条映射 → 另纳入 2 个此前完全无覆盖的工具 <!-- serves: FR-1,FR-2,FR-4,FR-6 -->

- 需求原文：「补齐 `RESPONSE_SOURCES` 缺项（TaskAdopt / Knowledge / Regenerate / SkillInstall）」。
- 实测：`Bind` / `Handoff` 因工厂带第二参数，**从未被契约门禁扫到**（覆盖为 0）。
  根因与"漏登记"完全同源，不一起修则 FR-1 的根因仍在。
- **收敛为**：FR-1 分两步——第一步补 4 条映射 + 建 registry（必绿）；
  第二步放宽正则并把 `Bind`/`Handoff` 纳入（若暴露既有声明漂移，按 `backend.md` 的处置规则执行）。

### 收敛 3（FR-4 范围）：只改条目文本 → 同时修两处**根因** <!-- serves: FR-1,FR-2,FR-4,FR-6 -->

- 需求原文：FR-4 = 生成物重生成 + 索引补齐 + 预算收敛。
- 实测根因（子代理取证）：孤儿条目**会再生**——
  - 根因①`DepositKnowledge.ts:70`：`input.indexEntry.slice(0, 140)` **只截长度、不清理 `·`/`→`**
    （对照 `operations.ts:350` 的正确口径是 `replace(/[·→\n]/g,' ')` 再截断）。
  - 根因②`KnowledgeRepository.appendEntry`：**先写 `entries/<id>.md`（:123）、后写索引行（:126-131）**，
    索引行渲染抛错 ⇒ 条目落盘、索引没写 = 孤儿。
- **收敛为**：FR-4 含这两处根因修复；并新增一条 K 检查覆盖"页面小节 ↔ 索引行"完整性
  （今天 C-22 那类漏行**无任何门禁在管**）。
- 另注：**不要试图靠"重跑归档沉淀"修孤儿**——`findSameOriginEntry` 依赖 `parseEntryDoc`，
  坏 `one_liner` 让它抛错 → catch 跳过 → 会分配**新 id**（kb-0059/0060），孤儿仍在。

### 收敛 4（FR-4 预算处置）：调预算 → 页内压行 <!-- serves: FR-1,FR-2,FR-4,FR-6 -->

- 设计初稿曾拟"为生成页单列预算 `generatedPageMaxLines`"。**取证后推翻**：
  - 200 行是**书面契约**：`REQ-261001110934-3766/design/architecture.md:68`、
    `data-model.md:17`、`docs/knowledge/glossary.md:27`、`conventions.md:59`；
  - 且被单测钉死：`tests/kb-generate.test.ts:178-180` 断言 `KB_PAGE_MAX_LINES === 200`；
  - 仓库明文 doctrine：FR-6 原话「**超限须拆页而不是硬塞**」（`REQ-261001143526-8475/requirement.md:117`），
    页内已有 Top-N 截断先例（`GROUP_TOP = 24`，注释明写"页面预算 200 行；全量在 TSV 里"）。
  - **无任何"调预算"先例**（`git log -S"pageMaxLines"` 只有 baseline 一条）。
- **收敛为**：采用**页内压行**（颜色/变量一行多条）——生成器 3 行改动、零信息损失、
  不动任何契约与单测。放弃"调预算"（那会同时改 4 处契约 + 1 处单测，正是"为了变绿而放宽"）。

### FR-6 的降级登记（需求文档已预置的条款） <!-- serves: FR-1,FR-2,FR-4,FR-6 -->

需求文档 FR-6 验收标准 3 写明：「若模板层无自检，则本 FR 降级为『仅落两份文件』
并在验收材料里写明降级」。**取证结论：确实无自检**——

- `templates/implementing/test-evidence.md` 与 `review.md` 被显式登记为「无线上门禁」
  （`template-gate-probe.mts:105-112`、`:390-391`）；
- 实测一份真实产物 `REQ-260930230225-71be/verification.md`：`grep -c "环境\|HEAD\|commit"` = **0**；
- `verification.md` 由 `renderVerificationDoc` 输出**固定四节**，窗口写进去的字段在 `submit` 时被抹掉。

**故 FR-6 按降级执行**：模板加要求（人读到就会写）+ 本需求验收材料实证带指纹 +
**在验收材料里如实写明"无机械门禁"**。把"报告类模板加门禁"登记为后续需求候选，
不在本需求内做（它要动 `template-gate-probe.mts` 的模板分类，属门禁改造）。

## 错误处理 <!-- serves: FR-1, FR-3, FR-4, FR-5 -->

| 场景 | 行为 | 依据 |
|---|---|---|
| registry 指向不存在的文件 | 测试红、打印路径（不静默跳过） | 失败要响亮 |
| `archivedMomentOf` 取不到时刻 | 门禁**省略 `at` 键**，仍判 passed | 绑定层无损 JSON 铁律（`ClearPause.ts:9`） |
| 客户端取不到归档门读数 | 按「材料已备」呈现，`data-archived="no"` | 读不到不猜（`gate-read-root` 同源） |
| 基线文件缺失 | `baseline:check` exit 1 报"没有基线，先 refresh" | 不把"缺基线"当通过（RV-5） |
| `one_liner` 非法 | 写条目文件**之前**就拒绝（根因②修复后） | 不再产出孤儿 |
| conventions.md 超 200 行 | K3 红；按页面自述判据把 `## 工程操作` 整节搬到 `operations.md` | `conventions.md:75-76` |

## 测试策略 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

- **契约**：TC-1～TC-4（FR-1 三文件全绿 + 差集为空）。
- **真实数据探针**：TC-5 读真实台账记录调 `buildGateVerdicts`——证明"87 条真实归档记录都判对"。
- **脚本判据**：TC-10/TC-11（`baseline:check` 的 0/1 退出码 + 反向必红）。
- **自检**：TC-14～TC-17（`kb-probe` 0 项失败 + 反向 K6 必红 + 新增的索引完整性检查必红）。
- **根因回归**：新增用例覆盖"非法 `one_liner` 不得落盘条目文件"与"沉淀时自动清洗非法字符"。
- **过程证据**：TC-18～TC-21（指纹字段 + `commit:check` + git 历史可查）。
- **反向证伪**：RV-1～RV-7 逐门独立变红（RV-7 = 删掉 INDEX 里 C-22 行 → 新增的索引完整性检查必红）。

## 配置项 <!-- serves: FR-2, FR-5 -->

| 配置 | 位置 | 值 | 说明 |
|---|---|---|---|
| `baseline:check` | `package.json` scripts | `npx tsx scripts/test-baseline.mts --check` | C-14 的判据命令 |
| `baseline:refresh` | `package.json` scripts | `npx tsx scripts/test-baseline.mts --refresh` | 刷基线（"承认现状"，需写理由进刷新历史表） |
| `commit:check` | `package.json` scripts | `npx tsx scripts/commit-check.mts` | C-28 的判据命令 |

**不新增任何"跳过/放行"开关**——本次所有判据都是收紧或等价。

## 关键决策与取舍 <!-- serves: FR-1, FR-2, FR-4, FR-5, FR-6 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| FR-4 的 tokens 超预算 | 为生成页单列预算 / 调 `pageMaxLines` | **页内压行**（颜色/变量一行多条） | 200 行是 4 处书面契约 + 1 处单测钉死的；调预算多处要同步改，正是"为了变绿而放宽"；而页面只被 `reqboard_kb` 当原文切片读，**无"一行一条"契约**（`tests/kb-generate.test.ts:119-138` 只断言含 `#colors` 与确定性） |
| FR-4 是否修根因 | 只手改两条 entry 让自检变绿 | 同时修 `DepositKnowledge` 与 `appendEntry` | 只改数据不改机制 ⇒ 下次沉淀再生成孤儿（且重沉淀会分配**新 id**，孤儿累积） |
| FR-5 的 C-28 命令形态 | 命令直接写 `git commit` | 挂可跑判据 `pnpm commit:check --req <id>` | K10 的四要素校验要求命令以 runner 起头 + 期望含锚点（`operations.ts:275-276`、`:300-306`）；直写 `git commit` 必红 |
| FR-5 落点 | 改 brainstorming 注入片段（"不要求 agent 执行 git commit"原文处） | 只落 `## 工程操作` 新条目 + 本需求自提交 | 那句原文是针对**设计文档落盘**说的，不是交付纪律；改片段要连带走 C-16/C-17 重生成与校验，属额外面。本需求对它是**收窄补充**而非推翻 |
| FR-6 是否加机械门禁 | 改 `template-gate-probe.mts` 把报告类模板纳入 | 模板加要求 + 实证带指纹 + **如实登记"无门禁"** | 需求文档 FR-6 已预置该降级条款；把报告类模板纳入门禁属门禁改造，超出本需求 5 条机械修复的量级 |
| 基线住哪 | 知识层新页（需改 `KbPageName` + `KB_PAGE_PATHS` 5 页闭集） | `docs/reviews/` 下两个文件 | 知识层入口已 10648 > 8000（正是 FR-4 要压回的），再挂新页与 FR-4 相互抵消 |
| INDEX 的四行新增 | 先补行、压缩留到以后 | **压缩必须在"加完 4 行之后"达标 ≤8000** | 否则 FR-2/FR-5/FR-4 三者在同一文件上相互抵消，验收无法判定 |

## 技术方案与亮点 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

- **判据的"形状"比"数字"重要**：FR-2 把绝对计数换成集合差，因此**基线数字过期不再等于判据失效**。
- **手写面越少、校验面越多**：FR-1 把手写清单从三份收敛为一份，同时用三方机器事实交叉校验。
- **删而不是补**：FR-3 删掉一个断过的字段，判据回到有真实写入者的 `status` / `statusHistory`，零迁移。
- **修根因而不是修数据**：FR-4 除了改两条坏 `one_liner`，还堵住"先写文件后写索引"与"只截长不清洗"
  两个产出孤儿的机制——否则条目会持续累积。
- **面对契约选择遵守而非绕过**：tokens 超预算时，200 行预算是书面契约 + 单测钉死的，
  本次选择压行而不是放宽——与仓库既有 doctrine（超限拆页/截断 + TSV 兜底）一致。
- **降级要留痕**：FR-6 在取证确认"报告类模板无门禁"后按需求文档预置条款降级，
  并在验收材料里写明降级——不把"人应该会写"包装成"已被门禁保证"。
