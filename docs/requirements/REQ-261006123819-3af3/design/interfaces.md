# 接口与契约设计（REQ-261006123819-3af3）· serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 契约先定死：本文件钉住**新增/修改的模块接口、命令接口、文件格式与判据**。
> 拆分阶段应能只凭本文件写出任务表，不需要再回读源码。

## 新增/修改的工具接口 <!-- serves: FR-1, FR-2 -->

本需求**不改任何 `reqboard_*` 对外工具的参数、返回或错误码**——六条 FR 都是仓库内部
判定面与文档面的整治。涉及"工具"的部分只有一处：`reqboard_task_regenerate` 等 4 个工具的
**契约检查覆盖**被补上（工具行为零变更）。

### `src/tools/registry.ts`（新增模块接口） <!-- serves: FR-1,FR-2 -->

```ts
export interface ToolRegistryEntry {
  key: string                     // 'TaskAdopt' —— output-contract 的扫描键
  factoryFile: string             // 'tools/AdoptTaskTool/TaskAdoptTool.ts'（src 相对）
  dir: string                     // 'AdoptTaskTool' —— tools-dispatch 目录清单派生源
  toolName: string                // 'reqboard_task_adopt' —— apply-wiring 名单派生源
  responseSources: readonly string[]  // 响应字面量所在全部文件（含 catch 内联返回）
}

export const TOOL_REGISTRY: readonly ToolRegistryEntry[]   // 27 条
```

**不变量（每条都有对应测试，见 `test-cases.md`）**：

| # | 不变量 | 判据 |
|---|---|---|
| I-1 | `TOOL_REGISTRY.map(e => e.dir)` 集合 == `readdirSync('src/tools')` 目录集合 | 集合相等，不等即红并打印差集 |
| I-2 | `TOOL_REGISTRY.map(e => e.toolName)` 集合 == `apply()` 后 `ctx.tools[].name` 集合 | 同上 |
| I-3 | 放宽正则扫到的工厂集合 ⊆ `TOOL_REGISTRY.map(e => e.key)` | 差集为空 |
| I-4 | 每个 `factoryFile` 可 import 且导出 `define<key>Tool` | `typeof === 'function'` |
| I-5 | 每个条目的 `responseSources` 拼起来能扫到 ≥1 个 return 键 | `keys.length > 0` |
| I-6 | 全部 return 键都被该工具的 `output.schema` 声明 | 差集为空 |

### 存放位置的决策依据 <!-- serves: FR-1 -->

`src/tools/registry.ts`（而非 `tests/` 内、也非 `src/tools/index.ts`）：

- 放 `tests/` 内 ⇒ 加工具的人只改测试，登记与实现分离，漂移面不变（现状正是如此）。
- 放 `src/tools/index.ts` ⇒ 该文件是宿主**导出面**，混入 27 条元数据会让两种职责同处。
- 独立文件 ⇒ 测试可直接 import 而不必启动宿主；加工具时在工具目录旁就能看到要填的字段。

## 删除的接口 <!-- serves: FR-3 -->

```ts
// src/shared/protocol.ts:983-984（删除）
archivedAt?: number
archivedBy?: ActorRef

// src/client/types.ts:144-145（删除，客户端镜像）
archivedAt?: number
archivedBy?: ActorRef
```

**兼容性**：两字段均可空，且真实数据 0 条写入 ⇒ 删除**不影响任何既有台账记录**，
不产生迁移。若存在窗口外消费方（未核实项），回滚 = 恢复这 4 行。

## 新增的纯函数接口 <!-- serves: FR-3 -->

```ts
// src/domain/status/ArchivedMoment.ts（新增）
/**
 * 需求进入 archived 的时刻。
 * @returns statusHistory 中最后一条 status==='archived' 事件的 at；
 *          取不到返回 undefined（调用方必须**整体省略**该键，不得发 undefined/null）。
 */
export function archivedMomentOf(req: { statusHistory?: readonly StatusEvent[] }): number | undefined
```

## 归档门读数契约 <!-- serves: FR-3 -->

`GateVerdict` 形状不变（`src/shared/protocol.ts`），只改取值：

| 需求状态 | `archive` 门 verdict | `at` | `reason` |
|---|---|---|---|
| `status === 'archived'` | `passed` | `archivedMomentOf(req)`；取不到则**键省略** | 无 |
| 非 archived 且有 `archive.submittedAt` | `pending` | `archive.submittedAt` | `归档材料已提交，待归档确认` |
| 非 archived 且已到 accepting、无 `archive` | `pending` | 无 | `尚未提交归档材料` |
| 其余 | `not-reached` | 无 | 无 |

客户端消费契约（唯一判据来自服务端）：

```ts
// src/client/views/panels/docs.ts —— 签名变更
function archiveSection(a: ArchiveRecord, gate: GateVerdict | undefined): string
// 调用点 :910 —— 从同载荷的 gates 里取
const archiveGate = (d.gates ?? []).find(g => g.gate === 'archive')
... : archiveSection(d.archive, archiveGate)
```

**降级行为**：`gate` 为 `undefined`（端点未接线 / 旧服务端）时，不再断言"已归档"，
按「材料已备」呈现并保持 `data-archived="no"` —— **读不到不猜**（与本仓 `gate-read-root`
的「未判定」口径同源）。

## 回归基线契约 <!-- serves: FR-2 -->

### 口径变更（这是 FR-2 的实质） <!-- serves: FR-2 -->

| | 现状 | 改动后 |
|---|---|---|
| 判据形态 | **绝对计数上限**（`失败数 ≤ 基线 106`、`tsc ≤ 223`） | **失败用例集合差为空** |
| 数字住哪 | 散在规范（C-14/C-15 各一组）+ 需求卡（另一组，`≤98/≤197`） | 单点：`docs/reviews/test-baseline.md` + `test-baseline.failures.txt` |
| 过期后果 | 数字没人更新 ⇒ 上限比现状宽 ⇒ 形同虚设（实测 70≤98、0≤197） | 基线可一条命令刷新；口径不随数字过期 |

### 文件格式（两个文件，人读与机读分离） <!-- serves: FR-2 -->

**`docs/reviews/test-baseline.md`**（人读，**现行基线**，刷新即覆盖 + 追加历史表）：

```markdown
# 现行回归基线（test-baseline）

> 本文件是**现行**基线，不是历史快照；刷新会覆盖上半部分、只在「刷新历史」表追加一行。
> 历史需求目录（docs/requirements/**）里的基线数字是**当时的快照，不追改**。

## 现行基线（采集于 2026-10-06 12:xx）
- 工作树指纹：HEAD `5dff7e2` · `250 files changed, 15457 insertions(+), 1846 deletions(-)`
- vitest：`Test Files 39 failed | 466 passed | 3 skipped (508)`；`Tests 70 failed | 5932 passed (6024)`
- tsc：`退出码 0`，错误数 `0`
- 失败用例集合：见 `test-baseline.failures.txt`（70 条，逐条 `文件 :: 用例名`）
- 采集命令：`pnpm baseline:refresh`

## 判据（怎么算过）
- `pnpm baseline:check` → 输出差集为空、exit 0 ⇒ 本次改动零新增失败
- 差集非空 ⇒ 先逐条确认是否本次引入；**确认非本次引入**才允许 `pnpm baseline:refresh`（刷基线＝承认现状）

## 刷新历史
| 日期 | HEAD | 工作树指纹摘要 | 失败用例数 | tsc | 刷新人 | 理由 |
|---|---|---|---|---|---|---|
```

**`docs/reviews/test-baseline.failures.txt`**（机读，一行一条，已排序）：

```
tests/adapters/failure-alert.test.ts :: createFailureAlert：两条通道 + 永不抛 > 日志与来源会话各写一次，正文含告警内容
tests/application/repository.test.ts :: SystemClock / RandomIdFactory > RandomIdFactory：前缀与 6 位 hex 格式（与 protocol new*Id 同形）
...
```

**为什么机读文件单独一份**：集合差要逐条比对，70 条用例名塞进 markdown 表格既难机读也难 diff；
单独 txt 可 `diff`/`comm`，且刷新时的变更在 git diff 里一目了然。

### 命令接口 <!-- serves: FR-2, FR-6 -->

```bash
pnpm baseline:refresh   # = npx tsx scripts/test-baseline.mts --refresh
pnpm baseline:check     # = npx tsx scripts/test-baseline.mts --check
pnpm commit:check --req <REQ-id>   # = npx tsx scripts/commit-check.mts --req <REQ-id>
```

`commit:check` 是 **FR-5 的判据命令**：`git log --oneline --grep=<REQ-id>` 非空 ⇒ exit 0（`OK`），
空 ⇒ exit 1（`FAIL`）。它存在的原因是硬约束：规范条目（C-28）的「命令」必须满足
`validateOperationEntry` 的两条校验——以 `npx|pnpm|node|python3|tsx|bash` 起头、
且「期望」含可对照锚点（`operations.ts:275-276`、`:300-306`）。直接写 `git commit` 两条都不满足，**K10 必红**。

- `--refresh`：跑全量 vitest（JSON reporter）+ tsc，写两个基线文件，**并打印工作树指纹**。
- `--check`：采集当前读数 → 与基线算集合差 → 空则 exit 0，非空则打印差集（新增/消失各一栏）并 exit 1。
- **两种模式都输出工作树指纹**（`HEAD` 短哈希 + `git diff --stat` 摘要）——这一条同时服务 FR-6：
  「读数带指纹」从"靠人记得写"变成"工具自动带"。

**规范条目 C-14 / C-15 的最终文案（要点）**：

```
### C-14 提交前必须跑测试并与基线比对
- 时机：提交前
- 命令：`pnpm baseline:check`
- 期望：`退出码 0（失败用例集合差为空）`
- 基线：`docs/reviews/test-baseline.md`（现行基线的唯一数字来源；集合差口径，不是计数上限）
- 失败怎么办：差集非空先逐条确认是否本次引入；确认非本次引入才 `pnpm baseline:refresh` 并写明理由
```

（C-15 同构，判据为 `pnpm typecheck` + 基线文件里的 tsc 读数 + 改动文件零新增。）

### 历史引用的处置口径 <!-- serves: FR-2 -->

| 面 | 数量 | 处置 | 依据 |
|---|---|---|---|
| `docs/knowledge/conventions.md` C-14/C-15 | 5 行 | **改写**为口径 + 指针 | 规范性面：agent 开工第一站读它，它错就是判据错 |
| `docs/guides/acceptance-sheet-workflow.md:16` | 1 处 | **改写**示例（`68 failed ≤ 基线 106` → 集合差口径示例） | 规范性面：它是教人"怎么写验收证据"的指南，例子会被照抄 |
| `docs/requirements/**`（卡 / notes / rtm / verification） | 180 处 | **不追改** | 历史记录：写的是"当时的基线是 98"，改写它＝篡改证据（本仓「证据优先」铁律） |
| `docs/knowledge/entries/kb-0025.md` + `INDEX.md` 对应行 | 2 处 | **不追改** | 决策记录："全量 97≤98 基线零新增"是那条需求当时的事实陈述 |
| `docs/reviews/project-audit-2026-10-06.md` | 1 处 | **不追改** | 审计报告是带日期的读数快照 |

**因此 FR-2 的验收判据是 scoped 的**（这个收敛由设计阶段确定，需求文档 FR-2 验收标准 1 的
全仓 grep 在此被收窄——见 `architecture.md` 的「对已确认需求的收敛说明」）：

```bash
# 规范性面必须为 0
grep -rn "≤ 98\|≤98\|≤ 197\|≤197\|基线 106\|当前 223" docs/knowledge/ docs/guides/ docs/architecture/
# 历史面豁免（登记为已知事实，不是遗漏）
grep -rn "≤ 98\|基线 98" docs/requirements/ | wc -l    # 预期仍非 0，且每处都在带日期的历史文档里
```

## 知识层索引与条目契约 <!-- serves: FR-4 -->

### 索引行格式（单点：`src/domain/knowledge/index-line.ts`） <!-- serves: FR-4 -->

```
- <id> · <kind> · <one_liner> · → <relPath>
```

- 整行正则 `KB_INDEX_LINE_RE`（`:23-24`）：one_liner 段 `[^·→\n]{1,140}`。
- `isOneLiner`（`:63-65`）：长度 **1–140**，且**不含 `·` / `→` / 换行**。
- 整行 ≤ `KB_LIMITS.indexLineMax` = **200** 字符。
- 条目 front-matter 的 `one_liner` 用**同一函数**校验（`src/domain/knowledge/entry.ts:209-215`）——
  违规即 K6 的 `entry-header`。

### 本次要补的 4 行（内容已验，可直接采用） <!-- serves: FR-4 -->

| 位置 | 行 |
|---|---|
| `INDEX.md` 规范节（c-21 之后、c-23 之前） | `- kb-conventions-c-22 · standard · 收录/更新上游 skill 资产必须重算指纹 · → conventions.md#c-22`（81 字符） |
| `INDEX.md` 规范节（节尾） | `- kb-conventions-c-28 · standard · 改动后必须提交 · → conventions.md#c-28` |
| `INDEX.md` 决策节（kb-0042 与 kb-0044 之间） | `- kb-0043 · decision · 插件包自带 7 份 UI/UX skill 资产（含可检索主 skill）；子代理读不到包内路径，故由 reqboard_skill_install 投放到会话工作区并回执绝对路径；需求分析节点只注入一小节「原型工作原则」（可裁、只进重档）。 · → entries/kb-0043.md`（one_liner 121 字符 / 整行 167） |
| `INDEX.md` 决策节（kb-0047 与 kb-0049 之间） | `- kb-0048 · decision · 把「是不是同一个项目」从路径比较换成项目 id 相等（session/projectId/workspaceRoot）；看板、扫描、知识层自举与子代理根一律按项目身份定位，跨项目派席与交接当场拒绝。 · → entries/kb-0048.md`（one_liner 99 / 整行 145；把原文的 `→` 换成 `/`） |

**同时要改的条目正文**：`entries/kb-0043.md` 的 `one_liner` 现 **154 字符 > 140**；
`entries/kb-0048.md` 现恰 140 字符但**含两个 `→`**（且尾部被截成 `…存量 74 `）。两处 front-matter 值与上表一致。

### 预算硬约束（跨 FR 冲突，必须一起解） <!-- serves: FR-4 -->

```
INDEX.md 现状：10648 字符（K1 上限 8000）  ⇒ 需砍 ≥2648 字符
本需求还要往 INDEX 加 4 行                ⇒ 压缩必须在"加完 4 行之后"仍 ≤8000
同时 conventions.md 现状 192 行（上限 200）⇒ C-28 约 6 行 → 198 行，刚好过，但已越过页面自述的 180 行预警
```

**`conventions.md` 若加到 200 行**：按页面自述判据（`conventions.md:75-76`），应把 `## 工程操作` 整节
搬到 `docs/knowledge/operations.md` 并加入 `KB_PAGE_PATHS`。**本次预计 198 行，不触发**，
但实施时必须复测（若 C-14/C-15 改写后比原条目更长，可能触发拆页）。

### 新增的 K 检查（补门禁盲区） <!-- serves: FR-4 -->

今天**没有任何门禁**校验"页面小节 ↔ 索引行"完整性（K5 只枚举 `entries/*.md`，不覆盖
`kb-conventions-c-*`）——C-22 漏行因此长期无人发现。本次在 `scripts/kb-probe.mts` 增一条检查：
`conventions.md` 的每个 `### C-NN` 小节都必须在 `INDEX.md` 有对应行、且每条索引行的锚点可达。

## FR-6 的证据文档契约（含降级登记） <!-- serves: FR-6 -->

### 模板契约 <!-- serves: FR-6 -->

`templates/implementing/test-evidence.md` 的 `## 环境` 节（现有文案：`（分支 / commit / 依赖版本——没有环境的「跑通了」不可复现。）`）
改为**强制字段**：

```markdown
## 环境

> 采集时间：YYYY-MM-DD HH:mm · HEAD `<短哈希>` · 工作树：`<git diff --stat 摘要>`
> （没有工作树指纹的「跑通了」不可复现——本仓多窗口共用工作树，读数会随并发写入失效）
```

`templates/accepting/verification.md` 的 `## 证据` 节加同款要求。

### 降级登记（需求文档 FR-6 验收标准 3 已预置该条款） <!-- serves: FR-6 -->

**取证结论：报告类模板今天没有任何机械门禁。**

| 事实 | 出处 |
|---|---|
| `review.md` / `test-evidence.md` 被显式登记为"无线上门禁" | `scripts/template-gate-probe.mts:105-112`、`:390-391` |
| 拆分/任务卡/验收至今没有门禁必填节集合 | `scripts/doc-section-parity.mts:27-33`、`:291` |
| `verification.md` 由生成器输出**固定四节**，窗口写入的字段在 `submit` 时被**全量覆写** | `src/domain/workflow/VerificationDoc.ts:80-129`、`src/application/use-cases/SubmitVerification.ts:362-371` |
| 实测一份真实产物：`grep -c "环境\|HEAD\|commit"` = 0 | `docs/requirements/REQ-260930230225-71be/verification.md` |

**故按需求文档预置条款降级执行**：模板加要求（人读到就会写）+ 本需求验收材料实证带指纹 +
**在验收材料里如实写明"无机械门禁"**。把"报告类模板纳入门禁"登记为后续需求候选
（它要动 `template-gate-probe.mts` 的模板分类，属门禁改造，超出本需求量级）。
**不冒充**：不把"模板里写了要求"说成"已被门禁保证"。

## 关键决策与取舍 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 基线判据形态 | 就地改数字（106→70、223→0） | 集合差 + 单点基线文件 | 就地改数字正是本次坏掉的方式：同一数字被复制到 28 份文档，一处变全仓过期（D-3） |
| 基线住哪 | 新建知识层页 `docs/knowledge/test-baseline.md` | `docs/reviews/` 下两个文件 | 知识层入口已超预算 10648>8000（FR-4 正要压回 8000），再挂新页会与 FR-4 相互抵消；且新知识层页需登记进 `KB_PAGE_PATHS`（5 页闭集）才能过自检，成本更高 |
| 机读与人文分离 | 全塞进一个 md | md（口径/历史）+ txt（失败用例集合） | 集合差要逐条 diff；md 表格既不便机读也不便看变更 |
| 采集靠脚本还是靠手 | 文档写命令，人手工贴数字 | `scripts/test-baseline.mts` 两模式 | 手贴就会再次漂移；脚本顺带把 FR-6 的指纹变成自动产物 |
| 客户端如何判"已归档" | 给载荷加 `status` 字段由客户端判 | 复用载荷**已有**的 `gates` 归档门读数 | 客户端复写判据＝第二个事实源；`gates` 已在 `DocsResponse` 必填字段里 |
| 归档门 `at` 取不到时 | `?? archive.submittedAt` | 省略 `at` 键 | 顶替＝把材料提交时刻谎报成归档时刻（D-2 的核心动机） |
| FR-4 的 tokens 超预算 | 调 `pageMaxLines` / 为生成页单列预算 | **页内压行**（颜色/变量一行多条） | 200 行是 4 处书面契约 + 单测 `KB_PAGE_MAX_LINES===200` 钉死的；页面无"一行一条"契约，压行零信息损失（详见 `architecture.md` 收敛 4） |
| C-28 的命令形态 | 命令直写 `git commit` | 挂可跑判据 `pnpm commit:check --req <id>` | K10 的四要素校验要求命令以 runner 起头 + 期望含锚点；直写 `git commit` 必红（`operations.ts:275-276`、`:300-306`） |
| INDEX 四行新增与压缩 | 先补行、压缩留待以后 | 压缩必须在"加完 4 行之后"仍 ≤8000 | 否则 FR-2/FR-4/FR-5 在同一文件上相互抵消，验收无法判定 |

## 技术方案与亮点 <!-- serves: FR-1, FR-2, FR-3, FR-6 -->

- **判据从"数字"变"差集"**：数字会过期，口径不会。这是本需求里唯一一处"改判定方法而非改数据"的
  设计，也是让 FR-2 不再复发（不再需要有人定期更新一堆数字）的关键。
- **一条命令同时服务两条 FR**：`baseline:check` 既是 FR-2 的判据，又通过输出工作树指纹服务 FR-6；
  避免为"证据带指纹"单独造一套机制。
- **豁免面显式登记而非静默跳过**：180 处历史引用在设计里写明"不追改 + 理由是历史证据"，
  并在验收里给出 scoped grep —— 不留下"到底改全了没有"的歧义。
- **降级不猜**：客户端拿不到归档门读数时按「材料已备」呈现而非断言已归档，与本仓
  `gate-read-root` 的「未判定」态同一口径。
