# 接口设计（REQ-261006201841-944d 归档校验与知识层覆盖度加固） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 状态：design · 契约定死才能进拆分：签名 / 参数 / 返回 / 错误码在本文一次写全
> 分层纪律：`shared` 零 IO、`application` 判事实、`domain` 纯派生、`client` 只呈现

## TL;DR `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| # | 接口 | 动作 | 判定来源 |
|---|---|---|---|
| I-1 | `assertArchiveMaterials(category, archive)` | 改（仍零 IO） | 形态：`path#anchor` + `path` 白名单 |
| I-2 | `assertArchiveTargetsOpenable(deps, record, inputs)` | **新建** | 事实：存在 / 非空 / 锚点可达 + 根来源 |
| I-3 | `renderArchiveManifest(input) → string` | **新建** | 纯派生：archive.md 文本 |
| I-4 | `isDecidableInvalidation(text) → boolean` | **新建** | 纯判定：失效条件可判定性 |
| I-5 | `reqboard_submit(kind=archive)` 返回体 | 改 | 增 `resolved_targets` / `archive_manifest` 键 |
| I-6 | `kb-probe` K13 / K14 + 两个 `--refresh-*` flag | 改 | 集合差基线 |
| I-7 | `scripts/archive-ledger-audit.mts` | **新建** | FR-8 只读核对（CLI） |
| I-8 | `GET /`（`/state`）payload 增 `origins` | 改 | 服务端派生项目来源 |
| I-9 | `renderArchivedBar(cards, limit, origins)` | 改 | 客户端三态渲染 |

## 新增/修改的工具接口 `serves: FR-1, FR-2`

### I-1 `assertArchiveMaterials`（改：仍零 IO） `serves: FR-1, FR-2`

```ts
// src/shared/protocol.ts（既有函数，签名不变；判定内容扩充）
export function assertArchiveMaterials(
  category: RequirementCategory | undefined,
  archive: Pick<ArchiveRecord, 'dir' | 'docs' | 'mergedInto' | 'indexEntry' | 'manualUpdates' | 'manualNote'>,
): void   // 违反 → throw（message 为人读文案，调用方转 REQBOARD_INVALID_INPUT）
```

**新增判定（全部零 IO）**：

| 输入 | 判据 | 未过时的消息要素 |
|---|---|---|
| `manualUpdates[].path` | 恰好一个 `#`，两侧非空 | 写清「必须是 `路径#锚点` 形态」+ 原值 |
| 同上 | `#` 前部分命中 `ARCHIVE_DOC_RULES[category].mergeTargets` 前缀 | 写清白名单前缀清单 + 原值 + 该类型 note |
| `manualUpdates[].section` | 新提交**不许**依赖它成形态（有 `#` 即可；无 `#` 即拒） | 写清「section 已废弃，锚点写进 path」 |

**不改**：`dir` 形态、`requiredDocs` 缺项、`mergedInto` 的前缀判定（前缀仍是第一道，事实判定在 I-2）。

### I-2 `assertArchiveTargetsOpenable`（新建） `serves: FR-1, FR-2`

```ts
// src/application/internal/archive-targets.ts（新建）
import type { UseCaseDeps } from '../ports.js'

/** 根判定来源：与 rootOfRequirement 同源同值（不新造词）。 */
export type RootJudgement = 'project-id' | 'path-fallback'

export interface ResolvedMergeTarget {
  readonly path: string
  readonly root: string
  readonly by: RootJudgement | 'unknown'
  readonly ok: boolean
  readonly bytes?: number
  readonly reason?: 'missing' | 'empty'
}

export interface ResolvedManualAnchor {
  readonly path: string          // `#` 前的路径
  readonly anchor: string        // `#` 后的锚点
  readonly ok: boolean
  readonly reason?: 'path-missing' | 'path-empty' | 'anchor-missing'
}

export interface ArchiveTargetsReport {
  /** 本次判据使用的生效根（绝对路径）。 */
  readonly root: string
  readonly by: RootJudgement | 'unknown'
  /** false = 记录里既无 projectId 也无 workspaceRoot（存量 3 条形态）→ 按当前工作区兜底并标注。 */
  readonly attributed: boolean
  readonly mergedInto: readonly ResolvedMergeTarget[]
  readonly manualAnchors: readonly ResolvedManualAnchor[]
}

/**
 * 归档目标可打开性（闸 1 / 闸 2 的事实判定）。
 *
 * 前置（调用方负责，顺序不可换）：`applyRequirementWorkspaceRoot(deps, record)` —— 先把
 * `deps.docs` 的根校正到**这条需求自己的**根，再调本函数。
 *
 * 失败语义：**任一目标不通过即抛**（消息含 路径 + 生效根 + 判据来源 + 原因），
 * 不返回"部分通过"的结果——归档是原子承诺，不允许"一半并进去了"。
 */
export function assertArchiveTargetsOpenable(
  deps: Pick<UseCaseDeps, 'docs'>,
  record: { projectId?: string; workspaceRoot?: string },
  inputs: { mergedInto: readonly string[]; manualAnchors: readonly { path: string; anchor: string }[] },
): ArchiveTargetsReport
```

判定顺序（先形态、后存在、再锚点）：

1. `mergeTargets` 逐条 `assertArtifactOpenable(deps.docs, path)`（既有函数：伪路径/越界/不存在）→
   未过 → 抛 `REQBOARD_FILE_MISSING` / `REQBOARD_ARTIFACT_NOT_OPENABLE`（**复用既有码**）。
2. 逐条 `deps.docs.stat(path)?.size`：`undefined` → `missing`；`=== 0` → `empty`；
   （**注**：步骤 1 已对"不存在"抛 `REQBOARD_FILE_MISSING`，故 `missing` 分支实测不可达，
   保留为**防御性**分支——端口实现差异或步骤 1/2 之间发生删除时兜底；实现须在注释里写明这一点，
   不许当成"死代码"删掉：删了就等于把"两步之间被删"的竞态静默放行。）
   两者都抛 `REQBOARD_INVALID_INPUT`，消息形如：
   `归档材料被拒：合并去向 <path> 在生效根 <root>（by=<project-id|path-fallback>）下<不存在|是空文件>〔0 字节〕。补齐：先把结论真的写进那份文档，或改指向已存在的文档`。
3. 说明书锚点：路径不存在/空 → 同上两类原因；锚点不在 `listHeadingAnchors(deps.docs.read(path))` 里 →
   抛 `REQBOARD_INVALID_INPUT`，消息区分「锚点不存在」与「路径不在白名单」（后者由 I-1 在更早处抛）。

**错误码纪律**：本需求**不新增**错误码（`REQBOARD_FILE_MISSING` / `REQBOARD_ARTIFACT_NOT_OPENABLE` /
`REQBOARD_INVALID_INPUT` 三个既有码足够；`design-gates.ts` 的 `openableError` 联合类型不动）。

## 新增的纯函数接口 `serves: FR-5, FR-6, FR-4`

### I-3 `renderArchiveManifest`（新建，domain 纯函数） `serves: FR-5, FR-6`

```ts
// src/domain/requirement/archive-manifest.ts（新建；不 import node: / 第三方）
export interface ArchiveManifestInput { /* 见 design/data-model.md §3 */ }
export interface MachineArtifactGroup { /* 同上 */ }

/** 渲染归档说明书（Markdown 文本）。纯函数：不碰时钟、不碰文件系统、不读环境变量。 */
export function renderArchiveManifest(input: ArchiveManifestInput): string
```

输出结构（**顺序即契约**，用例逐节断言）：

```
# 归档结论（<REQ id> <title>）
> 归档目录 / 类型 / 渲染时刻（由输入注入）

## 一句话结论          ← indexEntry 原文逐字
## 合并去向            ← 逐条：路径 + 存在性读数（✅ 存在 <bytes> 字节 / ❌ 不存在）+ 生效根与判据来源
## 人读材料            ← docs 清单（kind 分组），计数与 machine 计数对照
## 机器产物（可重建，折叠） ← 一行一类：类别名 · 数量 · 体积；queue.json 附摘要（或「无法解析」）
## 说明书更新点        ← path#anchor + summary；旧形态渲染为 `path（旧：section）`
## 相关               ← 台账锚点（需求 id / 归档材料提交时间）
```

**幂等**：同一输入 → 同一文本（字节级）；调用方比对现有内容时**剔除由 `input.renderedAt` 派生的那一行**
（「渲染时刻：…」），其余逐字节相同则不写、保留盘上首次时刻（`archive_manifest.written=false`）。
不许拿整篇字节相等当幂等判据——那样每次提交都因时刻不同而重写，FR-5 验收标准 2 的 `written=false` 永远拿不到。

### I-4 `isDecidableInvalidation`（新建，domain 纯函数） `serves: FR-4`

```ts
// src/domain/knowledge/invalidation.ts（新建）
/**
 * 「失效条件」是否**可判定** = 文本含至少一个可判定锚点：
 *   ① 反引号字面量（`` `src/x.ts` `` / `` `pnpm kb:check` `` / `` `kb-0043` ``）；
 *   ② 形如 `路径.扩展名` 的文件指针（含 `#锚点` 亦算）；
 *   ③ `supersede` / `被…取代` + 一个 `kb-NNNN` id。
 * 纯函数：正则判定，零 IO；**不**依赖语法分析。
 */
export function isDecidableInvalidation(text: string): boolean
```

`DepositKnowledge` 生成的失效条件必须是可判定的（由 pointer / req id 派生，例：
`` `docs/architecture/<doc>.md#<anchor>` 被删除或改名，或该结论被 `kb-NNNN` supersede ``）。

## 工具返回体与自检 CLI `serves: FR-1, FR-2, FR-5, FR-6, FR-3, FR-4`

### I-5 `reqboard_submit(kind=archive)` 返回体（增键） `serves: FR-1, FR-2, FR-5, FR-6`

```ts
{
  success: true,
  requirement_id: string,
  status: string,
  required_docs: string[],
  reconcile: { /* 既有：三分类 + 闸门 */ },
  /** 新增：本次判据的生效根与逐条读数（供人复核"在哪个根上判的"）。 */
  resolved_targets: {
    root: string
    by: 'project-id' | 'path-fallback' | 'unknown'
    attributed: boolean
    merged_into: { path: string; ok: true; bytes: number }[]
    manual_anchors: { path: string; anchor: string; ok: true }[]
  },
  /** 新增：渲染物落点与是否本次写入（幂等可观测）。 */
  archive_manifest: { path: string; written: boolean; bytes: number },
  ...(unlisted.length > 0 ? { unlisted_files: string[]; warning: string } : {}),
  note: string,
}
```

`written: false` = 内容与盘上一致、未重写（幂等命中）；这是 FR-5 验收标准 2 的机器可读读数。

### I-6 `kb-probe` 新增两项检查与两个刷新 flag `serves: FR-3, FR-4`

```bash
npx tsx scripts/kb-probe.mts                    # 人读：新增 K13 / K14 两行
npx tsx scripts/kb-probe.mts --json             # 结构化：findings 里含 K13 / K14
npx tsx scripts/kb-probe.mts --refresh-coverage # 把实测缺口写成 K13 基线（承认现状）
npx tsx scripts/kb-probe.mts --refresh-unverifiable # 把实测不可判定条目写成 K14 基线
```

- **退出码语义不变**：0 = 全绿；1 = 有检查失败。
- **K13 口径（实测定案）**：只取**冷侧** `<DSH_HOME>/reqboard/archive/<REQ>/archive.json`（实测 23 条已交材料
  → 缺口恰为 6，与基线一致）。把热侧 `requirements/` 的 `archive.json` 也算进来是 73 条 → 缺口 17
  （多出的多属别的项目，不该由本仓判红）；故**热侧只报数、不判红**，口径写进检查输出文案。
- **K13**：`gap \ baseline` 非空 → `ok=false`，`detail` 点名缺哪几条需求 id + 提示
  「补一条 `req: <id>` 的知识条目，或（确认无沉淀价值时）`--refresh-coverage` 承认现状」。
- **K14 口径（实测定案）**：按 I-4 的锚点定义实测 **60 条全部不可判定**；
  「58」是**同一模板句**条数（53 逐字 + 5 无顿号变体）。基线初值以 `--refresh-unverifiable` 实测为准，
  两个读数都要输出（口径不同、不许互相冒充）。
- **K14**：`unverifiable \ baseline` 非空 → `ok=false`，`detail` 点名条目 id 与它们的失效条件原文。
- **台账不可达**（无 `~/.dsh/reqboard`）→ 两项都 `ok=true` + detail 写明「读数不可得、不判（原因：…）」，
  **不得**输出"全部通过"的口径（与既有「读数未知不判」纪律一致，但必须说清）。
- 两个 flag **不进 package.json**（避免 K10 覆盖度连锁），刷新是例外动作。

### I-7 `scripts/archive-ledger-audit.mts`（新建 CLI） `serves: FR-8`

```bash
npx tsx scripts/archive-ledger-audit.mts                    # 读默认台账（<DSH_HOME|~/.dsh>/reqboard），打印人读表格
npx tsx scripts/archive-ledger-audit.mts --json              # 结构化（CI / 验收材料）
npx tsx scripts/archive-ledger-audit.mts --out <path.md>     # 同时把报告写成 Markdown 落盘（默认不写）
npx tsx scripts/archive-ledger-audit.mts --ledger-root <dir> # 指定台账根（副本上跑）
```

**只读契约（硬）**：脚本对台账只做 `readFileSync` / `readdirSync`；**任何写操作只允许写 `--out`**。
输出必须含：逐条失效（`REQ id + 路径/section + 判据 + 生效根`）、
`真失效数`（基线 2）、`章节漂移双读数`（22 / 14 及各自口径）、
`归属未知数`（3）、以及 **`按当前工作区直接比会误判的条数`（基线 15）**。

退出口径：**0 = 报告完成**（存量有失效不是脚本的错误——本次不追溯）；2 = 台账不可达（环境问题）。

## HTTP API 变更 `serves: FR-7`

### I-8 `GET /`（看板 `/state`）payload 增 `origins` `serves: FR-7`

```ts
// src/http/routers/stages.ts —— 既有 payload 追加一个键（非破坏性）
{
  revision, limit, requirements, tasks, ready, tokenTotals,
  workspaceRoot, sessionWorkspaceRoot, docsRootSource, projectSource, projectId, homeDir,
  /** 新增：需求 id → 来源三态（仅对本页 requirements 计算，有界）。 */
  origins?: Record<string, {
    kind: 'local' | 'elsewhere' | 'unknown'
    projectId?: string
    projectName?: string
    by?: 'project-id' | 'path-fallback' | 'unknown'
    /** 该需求的生效根（服务端派生的绝对路径；`unknown` 不发该键）。
     *  用途：点开「在别处」提示块时告诉人"目录在哪个项目根下"（原型 §3 的呈现要求）。
     *  为什么由服务端给：客户端拼路径 = 违反 D-4；**显示**服务端给的根不是"比较路径"，不触红线。 */
    root?: string
  }>,
}
```

派生规则（服务端一处）：

| 条件 | `kind` |
|---|---|
| `rootOfRequirement` 解析成功 且 `sameProjectRoot(该根, 当前 docs 根)` 为真 | `local` |
| 解析成功但不同项目 | `elsewhere`（`projectName` = 该根末段名） |
| 解析不出（`undefined`） | `unknown`（**不冒充 local**） |

`projectName` 取该需求生效根的**目录末段名**（不查项目表也能给出可读来源；项目表命中时同时带 `projectId`）。

## 客户端接口 `serves: FR-7`

### I-9 `renderArchivedBar`（改：增第三参，向后兼容） `serves: FR-7`

```ts
// src/client/views/board.ts
export function renderArchivedBar(
  cards: readonly ReqCard[],
  limit: number = ARCHIVED_CHIPS_MAX,
  origins?: Readonly<Record<string, RequirementOrigin>>,  // 缺省 = 旧服务端 → 不渲染来源标注
): string
```

DOM 契约（原型 [archive-source-label.html](../../../prototypes/archive-source-label.html#FR-7) 定案）：

```html
<button type="button" class="dsh-pm-archived-chip" data-action="open-req" data-req="REQ-…"
        data-status="archived" data-src="local|elsewhere|unknown"
        [data-project="<项目名>"] title="<标题>[（<项目名>）]">
  REQ-<span class="dsh-pm-archived-id">…</span> ·
  <span class="dsh-pm-archived-text">标题</span>
  <span class="dsh-pm-archived-count">n/m</span>
  <span class="dsh-pm-archived-src" data-src="…">本仓 | 别处·<span class="dsh-pm-archived-src-name">项目名</span> | 归属未知</span>
</button>
```

- 既有 `data-action / data-req / data-status / title` **逐字保留**（不新增事件类型）。
- 三态一律由 `origins` 派生；`origins` 缺该 req 键 → 该条不渲染标注（逐字降级，等价旧行为）。
- 新增选择器仅 4 条（`.dsh-pm-archived-src` 三态 + `.dsh-pm-archived-text`），令牌全部既有。

## 删除的接口 `serves: FR-2`

**无删除**。`ManualUpdate.section` 降为**废弃可选字段**（保留类型与读侧渲染），
不删字段——删了会让历史 `archive.json` 反序列化丢信息（存量不可追溯）。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| # | 决策 | 取舍 |
|---|---|---|
| I-10 | `assertArchiveTargetsOpenable` **失败即抛**，不返回部分结果 | 归档是原子承诺；代价是调用方拿不到"哪些通过了"的中间读数（不需要） |
| I-11 | 不新增错误码，复用三个既有码 | 不扩大错误码面与客户端文案表；代价是消息必须自带原因区分（已写进契约） |
| I-12 | `renderArchiveManifest` 收 **已校验**的材料 | 渲染器不重复做校验（避免两套判据）；代价是调用顺序被钉死 |
| I-13 | K13/K14 刷新走 `kb-probe` flag，不进 package.json | 不触发 K10 覆盖度连锁；代价是刷新命令略长 |
| I-14 | FR-8 脚本进 `EXCLUDED` 而非 `EXTRA_ENTRIES` | 它是专项只读核对、非每次必跑；代价是不进规范页（定位如此） |
| I-15 | `origins` 只对本页需求计算 | 有界（≤ limit）；代价是翻页时每页各算一次（现算，缓存键将来若需要另立） |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-5, FR-7`

- **契约先行**：闸 1/闸 2 的每一条失败都有**唯一消息要素表**（路径 + 生效根 + 判据来源 + 原因），
  验收直接 grep 消息三要素即可判过。
- **幂等可观测**：`archive_manifest.written` 把"没重写"变成机器可读读数——不靠 mtime 肉眼比。
- **向后兼容是逐字的**：`renderArchivedBar` 第三参可选、`section` 不删、`origins` 缺键即旧行为，
  三处都有"旧输入 → 旧输出"的用例钉住。
