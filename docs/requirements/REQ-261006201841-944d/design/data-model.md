# 数据模型设计（REQ-261006201841-944d 归档校验与知识层覆盖度加固） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 状态：design · 零 IO、零框架依赖：本文只定**类型与字段**，不定实现步骤

## TL;DR `serves: FR-1, FR-2, FR-5, FR-7`

本需求**不新增持久化实体、不改台账 schema、不做数据迁移**。新增的都是**派生类型**（判据结果、渲染输入、推送视图）：

| 类型 | 性质 | 承载 |
|---|---|---|
| `ManualUpdateAnchor` | 形态约定（不新增字段） | `manual_updates[].path` 的取值形态 `路径#锚点` |
| `ResolvedMergeTarget` | 判据结果（不落盘） | 闸 1 的逐条读数（路径 / 生效根 / 判据来源 / 存在性 / 字节数） |
| `ArchiveManifestInput` | 渲染输入（不落盘） | `renderArchiveManifest` 的入参 |
| `MachineArtifactGroup` | 派生分类（不落盘） | 机器产物分区（类别 / 数量 / 字节数 / `queue.json` 摘要） |
| `RequirementOrigin` | 推送视图（`/state` payload） | 归档条三态标注 |
| 基线文件两式 | **新文件**（纯文本，非台账） | K13 / K14 的集合差基线 |

## 新增/修改的数据结构 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

### 1. `manual_updates[].path` 的取值形态（不新增字段） `serves: FR-2`

```ts
/** 归档材料里的一条说明书更新点（既有类型，字段含义收窄）。 */
interface ManualUpdate {
  /** 取值形态：`<mergeTargets 白名单内的相对路径>#<该文档的标题锚点>`。
   *  例：docs/architecture/project-manual.md#机制备忘-收尾门的三条硬约束
   *  —— `#` 前部分同时受 mergeTargets 白名单与实际存在性约束。 */
  path: string
  /** **废弃字段**（保留仅为读侧兼容历史台账）：旧形态下的自由文本章节名。
   *  新提交一律不写；读侧渲染旧数据时形如 `path（旧：section）`。 */
  section?: string
  /** 这一节多了什么认知（≤500 字符）。 */
  summary: string
}
```

约束（逐条可测）：

| # | 约束 | 违反时的行为 |
|---|---|---|
| C1 | `path` 恰好含一个 `#`，且 `#` 两侧都非空 | 拒绝（形态，shared 判定） |
| C2 | `#` 前部分以 `ARCHIVE_DOC_RULES[category].mergeTargets` 的某个前缀开头 | 拒绝（白名单，shared 判定） |
| C3 | `#` 前部分指向的文件存在且非空 | 拒绝（事实，application 判定） |
| C4 | 锚点在该文件的标题锚点集合内（`listHeadingAnchors`） | 拒绝（事实，application 判定） |

### 2. `ResolvedMergeTarget`（闸 1 的逐条读数，不落盘） `serves: FR-1`

```ts
/** 判据来源（与 `ResolvedRequirementRoot.by` 同源同值，不新造词）。 */
type RootJudgement = 'project-id' | 'path-fallback'

interface ResolvedMergeTarget {
  /** 归一化后的目标路径（工作区相对）。 */
  readonly path: string
  /** 本次判据使用的生效根（绝对路径）。 */
  readonly root: string
  /** 生效根怎么来的——不标注就无法解释跨项目场景下的"在哪个根上找过"。
   *  `'unknown'` 只出现在 F-1 兜底态（记录既无 projectId 也无 workspaceRoot），
   *  与 `RequirementOrigin.by` / `ArchivedAuditRow.by` 同值域（三处同源，不各造一套）。 */
  readonly by: RootJudgement | 'unknown'
  /** 存在且字节数 > 0。 */
  readonly ok: boolean
  /** 实测字节数；不存在 → undefined（缺失 ≠ 0）。 */
  readonly bytes?: number
  /** 未通过时的原因（人读，进拒绝消息）；通过 → undefined。 */
  readonly reason?: 'missing' | 'empty'
}
```

**缺失 ≠ 0**：`bytes` 缺失与 `bytes === 0` 是两种事实（前者没这条文件，后者有但是空壳），
拒绝消息必须区分——这条纪律在 FR-1 的验收标准 2 里被三态覆盖。

### 3. `ArchiveManifestInput` / `MachineArtifactGroup`（渲染输入，不落盘） `serves: FR-5, FR-6`

```ts
interface ArchiveManifestInput {
  readonly requirementId: string
  readonly title: string
  readonly category: RequirementCategory
  /** 渲染时刻（由调用方注入；渲染器**不碰时钟**——纯函数）。
   *  **幂等口径**：调用方比对"盘上内容 vs 新渲染内容"时**剔除本文本中由 `renderedAt` 派生的那一行**
   *  （「渲染时刻：…」），其余逐字节比较；相同则不写、保留盘上首次时刻。否则每次提交都因时刻不同而重写。 */
  readonly renderedAt: number
  /** 一句话结论（indexEntry 原文，逐字进渲染物）。 */
  readonly indexEntry: string
  /** 归档目录（工作区相对）。 */
  readonly dir: string
  /** 清单（kind + path）。 */
  readonly docs: readonly { readonly kind: string; readonly path: string }[]
  /** 合并去向 + 逐条存在性读数（闸 1 的结果，直接复用、不重算）。 */
  readonly mergedInto: readonly ResolvedMergeTarget[]
  /** 说明书更新点（含旧形态，原样呈现）。 */
  readonly manualUpdates: readonly ManualUpdate[]
  readonly manualNote?: string
  /** 机器产物分区（由目录实测分类派生）。 */
  readonly machine: readonly MachineArtifactGroup[]
  /** 人读文档数（分区标题里的对照数字）。 */
  readonly listedCount: number
}

interface MachineArtifactGroup {
  /** 类别名（对应 `ARCHIVE_EXEMPTIONS[].id`：`rtm-reports` / `rtm-dir` / `ledger-mirror` / `runtime-state`）。 */
  readonly rule: string
  /** 人读类别名（渲染用）。 */
  readonly label: string
  readonly count: number
  readonly bytes: number
  /** 逐文件路径**不铺开**（人读面只到"一类一行"）；供机器复核的文件清单不写进 archive.md。 */
  readonly queueSummary?: QueueSummary
}

/** 台账镜像摘要（`queue.json`）；解析失败 → undefined，渲染为「无法解析，仅报体积」。 */
interface QueueSummary {
  readonly tasks: number
  readonly edges: number
  readonly ready: number
  /** `generated_at` 原文（缺失 → undefined，不编时间）。 */
  readonly generatedAt?: string
  readonly bytes: number
}
```

### 4. `RequirementOrigin`（`/state` 推送视图） `serves: FR-7`

```ts
/** 归档条来源三态。`unknown` = 既无 projectId 也无 workspaceRoot（存量 3 条）——**不许冒充本仓**。 */
type OriginKind = 'local' | 'elsewhere' | 'unknown'

interface RequirementOrigin {
  readonly kind: OriginKind
  /** 目标项目 id（项目表命中时才有）。 */
  readonly projectId?: string
  /** 目标项目名（= 该项目根的末段名；`elsewhere` 时必填，供人扫读）。 */
  readonly projectName?: string
  /** 判据来源，进诊断（与 `RootJudgement` 同源同值）。 */
  readonly by?: RootJudgement | 'unknown'
  /**
   * 该需求的生效根（**服务端派生**的绝对路径；`unknown` 时不发该键）。
   *
   * 用途：点开「在别处」提示块时告诉人「目录在哪个项目根下」——这是原型 §3 的呈现要求。
   * 为什么要服务端给而不是客户端拼：客户端拼路径 = 违反 D-4（跨项目按身份定位，不退回路径字符串运算），
   * 且客户端没有判据来源。**显示**一个服务端给的根不是"比较路径"，不触红线。
   */
  readonly root?: string
}

// BoardState 增量（可选字段：旧服务端缺该键 → 客户端逐字降级、不渲染标注）
interface BoardState {
  origins?: Record<string, RequirementOrigin>
}
```

三条约束：① `unknown` 必须有别于 `local` 的**可读文本**（不得用灰色冒充默认）；
② `elsewhere` 必带 `projectName`；③ 客户端**不得**自行比较路径字符串派生 `kind`。

### 5. 基线文件两式（纯文本，非台账） `serves: FR-3, FR-4`

```
docs/knowledge/archive-coverage.baseline.txt   # K13：每行一条「有归档材料但零沉淀」的需求 id（现 6 行）
                                               # 口径 = **只取冷侧** `<DSH_HOME>/reqboard/archive/<REQ>/archive.json`
                                               # （实测 23 条已交材料 → 缺口恰为 6：d718/0fbe/19b6/344a/b98d/b918）；
                                               # 热侧 requirements/ 的 archive.json 只报数、不判红
                                               # （冷+热 = 73 → 缺口 17，多出的多属别的项目，不该由本仓判）
docs/knowledge/unverifiable.baseline.txt       # K14：每行一条「失效条件不可判定」的条目 id
                                               # 初值以 `--refresh-unverifiable` 实测为准：
                                               # 按 I-4 的锚点定义实测 **60 条全部不可判定**；
                                               # 「58」是**同一模板句**的条数（53 逐字 + 5 无顿号变体），
                                               # 两个读数都要在检查输出里出现（口径不同，不许互相冒充）
```

格式纪律（与 `docs/reviews/test-baseline.failures.txt` 同款）：

- 一行一条 id，行尾换行，**排序后**写入（集合差可比、diff 可读）；
- 注释行以 `#` 开头（写清这份基线是什么、什么时候刷的、为什么刷）；
- **缺失文件 = 空基线**（不是"不判"）——空基线意味着"任何缺口都红"，这是最严格的一档；
- 刷新口是 `kb-probe` 的两个 flag，**不新增 package.json 脚本**（避免 K10 覆盖度连锁）。

### 6. K13 / K14 读数（检查输出，不落盘） `serves: FR-3, FR-4`

```ts
interface CoverageReading {
  /** 实测缺口（有归档材料的需求 − 有 req: 条目的需求）。 */
  readonly gaps: readonly string[]
  /** 生效基线。 */
  readonly baseline: readonly string[]
  /** 台账是否可达；false = 读数不可得（**不判**，不报绿）。 */
  readonly available: boolean
}

interface InvalidationReading {
  /** 实测不可判定条目。 */
  readonly unverifiable: readonly string[]
  readonly baseline: readonly string[]
  readonly available: boolean
}
```

判据（两处同款）：`gaps \ baseline` 非空 → 检查失败（新增缺口）；
`baseline \ gaps` 非空 → 检查**通过**但输出「已补齐，可刷新基线」提示（不静默）。

### 7. 存量只读核对的报告行（不落盘于台账） `serves: FR-8`

```ts
interface ArchivedAuditRow {
  readonly requirementId: string
  /** 该需求自己的生效根（`rootOfRequirement` 口径）。 */
  readonly root: string
  readonly by: RootJudgement | 'unknown'
  /** 合并去向里真失效的（按生效根解析）。 */
  readonly missingTargets: readonly string[]
  /** 说明书更新点里锚不到的（口径写在报告里：任意级标题归一化精确匹配）。 */
  readonly sectionDrift: readonly { readonly path: string; readonly section: string }[]
  /** `manual_updates[].path` 本身不存在的。 */
  readonly missingManualPath: readonly string[]
  /** 「按当前工作区直接比会误判」的对照读数（同一批材料在错误根上的失效数）。 */
  readonly naiveMissingCount: number
}
```

## 兼容性分析与迁移 `serves: FR-2, FR-3, FR-4, FR-7`

| 面 | 旧 | 新 | 兼容策略 |
|---|---|---|---|
| 台账 schema | v10 | v10（**不变**） | 零迁移；`archive.json` 字段只增不减 |
| `manualUpdates.section` | 自由文本必填 | 废弃（可选） | 读侧旧数据照旧渲染；写侧不再接受无锚点形态 |
| `mergedInto` | 前缀判定 | 逐条存在性判定 | 只作用于**新提交**；存量 37 条不改写（FR-8 只读报告） |
| 知识条目 | 「失效条件」自由文本 | 可判定性读数 + 索引降权排序 | 条目文件**内容一字不改**；只改 INDEX 的节内排序 |
| `INDEX.md` | 按 id 序 | 节内可判定优先 | 索引行文法与字符数不变（R-2） |
| `/state` payload | 无 `origins` | 增 `origins` | 客户端可选读取：缺键 → 不渲染标注（逐字降级） |

**回滚路径**：A 批恢复前缀判定即回旧行为（新提交面，无迁移）；B 批停渲染（渲染物可删）；
C 批删两项检查 + 两份基线 + 排序改动（纯增量）；D 批客户端忽略新字段即回旧渲染。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| # | 决策 | 取舍 |
|---|---|---|
| M-1 | `manualUpdates` **不加** `anchor` 新字段，锚点塞进 `path` | 契合底稿字面（`path#anchor`）且台账字段零扩张；代价是 `path` 不再纯路径，解析处必须单点 |
| M-2 | 判据结果类型（`ResolvedMergeTarget`）**不落盘** | 台账零迁移；代价是每次核对要重算（只读，成本可忽略） |
| M-3 | 机器产物分区**不逐文件铺开** | 人读面真的变干净；代价是 `archive.md` 不能替代 `find` 做清单核对（本来也不该） |
| M-4 | `bytes?: number` 用缺失表达"不存在" | 与全仓"缺失 ≠ 0"纪律一致；代价是消费方要判空 |
| M-5 | 基线**缺失 = 空基线** | 最严格档，防"删掉基线文件即全绿"；代价是首次落地必须先写基线 |
| M-6 | `unknown` 单独一态，不复用 `elsewhere` | 3 条存量记录确实无从归属，混进 `elsewhere` 就是编造来源 |

## 技术方案与亮点 `serves: FR-3, FR-4, FR-6, FR-7, FR-8`

- **零迁移**：本次所有新增都是派生类型与推送视图；台账 schema 停在 v10，不动一条存量记录。
- **缺失 ≠ 0 贯穿全篇**：`bytes` / `available` / `generatedAt` / `by` 全用"缺失"表达"不知道"，
  与"读数不可得、不判"的既有纪律同源。
- **同一读数三处消费**：闸 1 的 `ResolvedMergeTarget[]` 同时喂拒绝消息、`archive.md` 渲染、
  FR-8 报告——三处不可能出现三个口径。
