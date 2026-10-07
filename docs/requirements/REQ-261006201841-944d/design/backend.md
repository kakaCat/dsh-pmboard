---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8]
---

# 后端设计（REQ-261006201841-944d 归档校验与知识层覆盖度加固） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 状态：design · 窗口 session-95c36a7d · 2026-10-06
> 上下游：`requirement.md`（8 个 FR / D-1～D-6 裁定 / F-1～F-7 失败路径）、`design/architecture.md`（分层与接线表）、
> `design/data-model.md`（类型契约）、`design/interfaces.md`（I-1～I-9，签名逐字照用）
> 读者：零上下文的执行者——本文只回答"怎么做"，不回答"分几步做"（拆分内容一律不在本文）
> 分层纪律一句话：`shared` 只判**形态**（零 IO）· `application` 判**事实**（磁盘上有没有）· `domain` 只做**纯派生** · `client` 只**呈现**

## TL;DR `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

本次后端改造就四件事，各自落点与判据如下：

| # | 改什么 | 判据落在哪 | serves |
|---|---|---|---|
| A | 归档提交三道闸（合并去向存在且非空 / `path#anchor` 锚点可达 / `path` 白名单） | `SubmitArchive`（application）+ `assertArchiveTargetsOpenable`（新建）+ `assertArchiveMaterials`（shared 形态） | FR-1, FR-2 |
| B | 归档渲染物 `archive.md`（含机器产物分区与 `queue.json` 摘要），渲染在写台账之前 | `renderArchiveManifest`（domain 纯函数）+ `SubmitArchive` 写盘 | FR-5, FR-6 |
| C | 知识层两条读数 K13 / K14 + INDEX 节内降权 + 沉淀源头不再产模板句 | `scripts/kb-probe.mts`、`KnowledgeRepository`、`DepositKnowledge` | FR-3, FR-4 |
| D | 看板归档条来源三态的服务端派生 + 存量只读核对脚本 | `/state` 的 `origins`（server）、`scripts/archive-ledger-audit.mts` | FR-7, FR-8 |

两条贯穿全篇的纪律：**判据单点**（取根 / 锚点 / 机器产物分类各自只复用一份既有实现）、**缺失 ≠ 0**（读不到就是读不到，不当代替值）。
本文只写后端面；I-9（`renderArchivedBar` 三态渲染）属前端面，由 `frontend.md` 承载，本文只冻结 `/state` 的 payload 契约。

## 服务与接口实现 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 编号 | 类型 | 名称 | 职责说明 | 输入 | 输出 | 调用方 | 依赖 | serves |
|---|---|---|---|---|---|---|---|---|
| S-1 | 函数 | `assertArchiveMaterials`（改） | 判归档材料的**形态**（`path#anchor`、`#` 前落白名单），保持零 IO | `category` (RequirementCategory\|undefined)、`archive` ({dir, docs[], mergedInto[], indexEntry, manualUpdates?[], manualNote?}) | `void`；违反 → `throw`（消息人读，调用方转 `REQBOARD_INVALID_INPUT`） | S-5 | `ARCHIVE_DOC_RULES`、`REQUIREMENT_DIR_PATTERN` | FR-1, FR-2 |
| S-2 | 函数 | `assertArchiveTargetsOpenable`（新建） | 判归档目标的**事实**（存在 / 非空 / 锚点可达），并把判据来源做成回执 | `deps` ({docs})、`record` ({projectId?, workspaceRoot?})、`inputs` ({mergedInto[], manualAnchors[{path, anchor}]}) | `ArchiveTargetsReport`（root / by / attributed / mergedInto[] / manualAnchors[]）；任一不过 → `throw` | S-5 | `assertArtifactOpenable`、`listHeadingAnchors`、`rootOfRequirement` | FR-1, FR-2 |
| S-3 | 函数 | `renderArchiveManifest`（新建） | 纯渲染：已校验材料 + 目录实测读数 → `archive.md` 文本 | `ArchiveManifestInput`（含 `ResolvedMergeTarget[]` / `MachineArtifactGroup[]` / 注入的 `renderedAt`） | `string`（Markdown；六节顺序即契约） | S-5 | 无 IO、无时钟、无环境变量 | FR-5, FR-6 |
| S-4 | 函数 | `isDecidableInvalidation`（新建） | 纯判定：失效条件文本是否含可判定锚点 | `text` (string) | `boolean` | S-6（沉淀自检）、S-7（K14）、单测 | 三类锚点正则 | FR-4 |
| S-5 | 服务 | `submitArchive`（改） | 归档**唯一写路径**：形态 → 根校正 → 可打开 → 三闸 → 渲染写盘 → 补登 → 对账 → 沉淀 → 写台账 | `args`（既有 7 键 + `unlisted_ack`）、`exec` | 工具返回体（增 `resolved_targets` / `archive_manifest`） | `reqboard_submit(kind=archive)` 工具壳 | S-1、S-2、S-3、S-6、`assertArtifactOpenable`、`applyRequirementWorkspaceRoot`、`reconcileArchiveDir`、`matchArchiveExemption` | FR-1, FR-2, FR-5, FR-6 |
| S-6 | 服务 | `depositArchiveKnowledge` / `buildDepositDraft`（改） | 归档即沉淀：失效条件改由 pointer / req **派生**（可判定），不再写模板句 | `ArchiveDepositInput`（既有） | `{deposited, id?, reason?}`；写失败抛错 | S-5 | `KnowledgePort.appendEntry`、S-4（自检式断言） | FR-4 |
| S-7 | 服务（CLI） | `scripts/kb-probe.mts` K13 / K14 + `--refresh-*`（改） | 新增两条读数：归档沉淀覆盖度、失效条件可判定性（**基线集合差**） | 无参 / `--json` / `--refresh-coverage` / `--refresh-unverifiable` | `findings` 增 K13 / K14 两行 + 退出码（0 全绿 / 1 有失败） | 维护者、`pnpm kb:check` | `ReqboardPaths`、`KB_PATHS.entriesDir`、`parseEntryDoc`、S-4 | FR-3, FR-4 |
| S-8 | 服务（CLI） | `scripts/archive-ledger-audit.mts`（新建） | FR-8 存量只读核对：按每条需求自己的根报真失效数与反例读数 | `--json` / `--out <path>` / `--ledger-root <dir>` | 人读报告 / JSON / 可选 Markdown；退出码 0 = 报告完成、2 = 台账不可达 | 人、验收材料 | `rootOfRequirement`、`listHeadingAnchors`、`ReqboardPaths` | FR-8 |
| S-9 | 接口 | `GET /`（看板 `/state`）增 `origins`（改） | 服务端**单点**派生归档条来源三态 | 既有 query（`scope` / `limit` / `cursor` / `session`） | 既有 payload + `origins`（键缺失 = 旧服务端） | 看板客户端 | `rootOfRequirement`、`sameProjectRoot`、`RequirementSummary.projectId/workspaceRoot` | FR-7 |
| S-10 | 函数 | `upsertIndexRow` + 节内排序（改） | INDEX 条目行**节内**按可判定性排序（降权，零字符增量） | `text` (string)、`row` (KbIndexRow) | 新索引文本（行文法与字符数不变） | S-6（写索引）、INDEX 刷新路径 | S-4、`parseIndexDoc` | FR-4 |
| S-11 | 常量 | `EXCLUDED` 增项（改） | 登记 S-8 脚本（**理由必填**），避免 K10「未归类」红 | `name` ('archive-ledger-audit.mts')、`reason` | 只读常量表 | K10（`buildCoverage` / `listUnclassified`） | 无 | FR-8 |

### I-1～I-9 的落点对照（签名逐字照用，本文只指落点） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 接口 | 落点文件 | 动作 | 本文件对应 | serves |
|---|---|---|---|---|
| I-1 | `src/shared/protocol.ts` · `assertArchiveMaterials` | 改（仍零 IO） | S-1 | FR-1, FR-2 |
| I-2 | `src/application/internal/archive-targets.ts` | **新建** | S-2 | FR-1, FR-2 |
| I-3 | `src/domain/requirement/archive-manifest.ts` | **新建** | S-3 | FR-5, FR-6 |
| I-4 | `src/domain/knowledge/invalidation.ts` | **新建** | S-4 | FR-4 |
| I-5 | `src/application/use-cases/SubmitArchive.ts` · 返回体 | 改 | S-5 | FR-1, FR-2, FR-5, FR-6 |
| I-6 | `scripts/kb-probe.mts` | 改 | S-7 | FR-3, FR-4 |
| I-7 | `scripts/archive-ledger-audit.mts` | **新建** | S-8 | FR-8 |
| I-8 | `src/http/routers/stages.ts` · `handleState` | 改 | S-9 | FR-7 |
| I-9 | `src/client/views/board.ts` · `renderArchivedBar` | 改 | **不由本文承载**（前端面）；本文只冻结 payload 里的 `origins` 契约 | FR-7 |

明确**不改**的三处（架构接线表「不改」行）：`ARCHIVE_DOC_RULES` 的白名单内容、`assertArtifactOpenable` 的判定顺序、`ARCHIVE_EXEMPTIONS` 的豁免规则表。
`DepositKnowledge` 的另两个改动点：`src/domain/knowledge/operations.ts` 的 `EXCLUDED`（S-11）、`src/adapters/KnowledgeRepository.ts` 的排序（S-10）。

## 数据流 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

### 流程 1 · 归档提交（`reqboard_submit(kind=archive)`） `serves: FR-1, FR-2, FR-5, FR-6`

```
reqboard_submit(kind=archive) ── 工具壳（既有）──▶ S-5 submitArchive(deps, args, exec)
  │
  ├─[前置] 入参规整 → 本窗口需求定位 → 状态 ∈ {archived, done}          ← 逐字不变
  │
  ├─[1] S-1 形态闸（零 IO）
  │      └─ 不过 → REQBOARD_INVALID_INPUT（台账零写入）
  ├─[2] applyRequirementWorkspaceRoot(deps, actual)   ← 根校正（唯一实现）
  ├─[3] assertArtifactOpenable(dir) + 清单内每份 docs[].path
  │      └─ 不过 → REQBOARD_FILE_MISSING / REQBOARD_ARTIFACT_NOT_OPENABLE（台账零写入）
  ├─[4] S-2 闸 1（mergedInto 存在且非空）+ 闸 2（锚点可达）
  │      └─ 任一不过 → 抛（消息含 路径 + 生效根 + 判据来源 + 原因）；台账零写入
  ├─[5] S-3 渲染 archive.md ──▶ docs.write(<dir>/archive.md)（内容相同不写）
  │      （渲染输入里的目录实测读数 = 写盘前**一次**遍历，结果在 [7] 复用）
  ├─[6] 补登 docs：{kind:'notes', path:'<dir>/archive.md'}
  ├─[7] 目录对账（三分类，复用 [5] 的遍历结果）+ unlisted_ack 闸门
  │      └─ 未列未声明 → REQBOARD_UNLISTED_ACK_REQUIRED（台账零写入）
  ├─[8] S-6 知识沉淀（先沉淀再记录；写失败抛错）
  ├─[9] 写台账：**唯一一次** mutateIfPresent（req.archive + reconcile + 评论）→ registerArtifact(archive)
  └─[10] 返回体：既有键 + resolved_targets + archive_manifest
```

**副作用清单**：

| 面 | 具体 | 说明 |
|---|---|---|
| 文件系统（写） | `<dir>/archive.md` 一个文件 | 新渲染物；不搬迁、不删除任何既有文件（D-2） |
| 文件系统（写，既有） | `docs/knowledge/entries/<id>.md` + `docs/knowledge/INDEX.md` | 归档即沉淀的既有行为；本次只改失效条件文本与索引节内排序 |
| 台账（写，既有） | `<REQ>/record.json` / `archive.json` 各一次 + `comments.jsonl` 追加一条 | 材料、对账结果、留痕 |
| 网络 / 通知 | 无 | 本次不新增任何对外调用 |

### 流程 2 · 知识层自检 K13 / K14 `serves: FR-3, FR-4`

```
npx tsx scripts/kb-probe.mts [--json]
  ↓
K13：读台账冷侧分片（<ledgerRoot>/archive/<REQ>/archive.json 存在性）
     读本工作区 docs/knowledge/entries/*.md 的 req: 头字段
     gaps = 有归档材料的需求 − 已沉淀的需求
     ├─ 台账不可达 → ok=true + detail「读数不可得、不判（原因：…）」（不报绿）
     ├─ gaps \ baseline 非空 → ok=false（点名缺哪几条 id）
     └─ baseline \ gaps 非空 → ok=true + 「已补齐 N 条，可 --refresh-coverage」
K14：逐条读 entries 的「## 失效条件」小节 → S-4 判定
     ├─ unverifiable \ baseline 非空 → ok=false（点名条目 id + 原文）
     └─ baseline \ unverifiable 非空 → ok=true + 「可 --refresh-unverifiable」
  ↓
退出码：0 = 全绿；1 = 有检查失败（语义不变）
```

### 流程 3 · 归档条来源三态（`/state` 的 `origins`） `serves: FR-7`

```
GET /（?session=<id>） → resolveDocRoot(deps, session) → { root, projectId }
  ↓ 取项目表快照一次：entries = deps.projectRegistry?.list()
  ↓ 逐条本页需求（page.items，RequirementSummary 自带 projectId / workspaceRoot）
      rootOfRequirement({projectRegistry:{list:()=>entries}}, summary)
      ├─ undefined            → kind='unknown'（标注「归属未知」，不冒充本仓）
      ├─ sameProjectRoot(root, docRoot.root) 为真 → kind='local'
      └─ 为真之外             → kind='elsewhere'（projectName = 该根目录末段名）
  ↓
payload 追加 origins（键缺失 = 旧服务端；客户端逐字降级、不渲染标注）
```

## 关键逻辑 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

### S-5 `submitArchive` 的新判定顺序（次序即语义） `serves: FR-1, FR-2, FR-5, FR-6`

**完整次序**（前置与收尾逐字不变，中间九步是本需求的新契约）：

1. **形态闸**：`assertArchiveMaterials(category, …)`（S-1）。零 IO，只判"写得对不对"。
2. **根校正**：`applyRequirementWorkspaceRoot(deps, actual)`（既有唯一实现）。不抛错（解析不到 = no-op），但它决定后面每一步在**哪个根**上探测。
3. **目录 / 文档可打开**：`assertArtifactOpenable(deps.docs, dir)` + 清单内每份 `docs[].path`（既有判定顺序不改）。
4. **闸 1 / 闸 2 事实判定**：`assertArchiveTargetsOpenable(deps, actual, {mergedInto, manualAnchors})`（S-2）。任一目标不过即抛（**原子**，不返回"部分通过"，I-10）。
5. **渲染 + 写盘 `archive.md`**：S-3 纯渲染 → `deps.docs.write`；内容相同不写（幂等）。渲染输入里的目录实测读数来自**写盘前一次遍历**，该结果在步骤 7 复用。
6. **补登 `docs` 清单**：把 `{kind:'notes', path:'<dir>/archive.md'}` 并入内存里的清单（纯内存，不写盘）。
7. **目录对账**：三分类（已列 / 豁免 / 未列）+ `unlisted_ack` 闸门（既有 `reconcileArchiveDir` 语义），**复用步骤 5 的遍历结果**，不第二次遍历。
8. **知识沉淀**：`depositArchiveKnowledge`（既有"先沉淀再记录、写失败即抛"）。
9. **写台账**：**唯一一次** `mutateIfPresent`（材料 + 对账结果 + 评论 + 时间戳）→ 再 `registerArtifact(archive)`。
10. **返回体**：既有键 + `resolved_targets`（S-2 的 report 逐字映射，不重算）+ `archive_manifest`（path / written / bytes）。

**失败时的台账写入状态**（每一步都问一句"台账是否已经动过"）：

| 步骤 | 失败形态 | 错误码 | 台账写入 | 磁盘写入 |
|---|---|---|---|---|
| 1 形态闸 | `path` 无 `#` / 白名单外 / `section` 撑形态 | `REQBOARD_INVALID_INPUT` | **零** | 零 |
| 2 根校正 | 不抛错 | — | **零** | 零 |
| 3 可打开 | 目录或清单文档不存在 / 伪路径 / 越界 | `REQBOARD_FILE_MISSING` / `REQBOARD_ARTIFACT_NOT_OPENABLE` | **零** | 零 |
| 4 闸 1 / 闸 2 | 目标不存在 / 0 字节 / 锚点不存在 | `REQBOARD_FILE_MISSING` / `REQBOARD_ARTIFACT_NOT_OPENABLE` / `REQBOARD_INVALID_INPUT` | **零** | 零 |
| 5 渲染写盘 | 只读目录 / 权限失败（IO） | 沿用既有 IO 抛错（不新增码） | **零** | 可能留半份 `archive.md`（见下注） |
| 6 补登 | 不抛错 | — | **零** | 零 |
| 7 对账闸门 | 目录内有未列且未声明 | `REQBOARD_UNLISTED_ACK_REQUIRED` | **零** | `archive.md` 已在盘上（渲染物，非事实源） |
| 8 知识沉淀 | `KnowledgePort` 抛错 | 既有码 | **零** | 可能已落 `entries/<id>.md` 而索引未写（K5 会报孤儿，既有事实） |
| 9 写台账 | 存储不一致 / IO | `REQBOARD_STORE_INCONSISTENT` 等既有码 | 已写 | — |

注：步骤 5 的"半份 `archive.md`"是**单文件覆盖写**的极端情形；渲染物不是事实源（FR-5 边界 3），下一次提交按幂等规则重写即自愈，且台账零写入保证"台账说归档了、目录里没有"这种半截**不会发生**。

**为什么渲染必须在写台账之前**（**D-2** 呈现层折叠的落点也在这里）：

- 台账是事实源。先写台账再渲染，渲染失败只剩两条路：留一条"台账说归档了、目录里没有 `archive.md`"，或静默吞掉渲染失败。
- `archive.md` 还要进 `docs` 清单，而清单是台账字段——若先写台账，补登只能变成**第二次写台账**（两份口径漂移的风险），正好违背"一次 mutate 落全套"。
- 这与既有纪律同源：「先沉淀再记录、写失败即抛」——**所有可能失败的动作都在唯一那次台账写之前完成**（R-4 / F-4 / FR-5 验收 3）。

**为什么"补登"必须在"对账"之前**：

- 对账会把"目录里有、清单里没有、又不命中豁免"的文件判成**未列**，并在 enforce 下拒绝本次提交。
- `archive.md` 不是豁免项（`ARCHIVE_EXEMPTIONS` 只收工具可重建物）——先渲染不补登，就是**自己渲染的文件把自己挡住**。
- 也不能把 `archive.md` 塞进豁免表：FR-6 的机器产物分区正是用同一张表分类，塞进去会让"结论文件"被折叠进机器产物区，自相矛盾。
- 对账的集合口径：分类输入 = 步骤 5 的遍历全集；`archive.md` 因已在 `docs` 清单里而计入"已列"，故不变量写作 `listed ∪ exempted ∪ unlisted = 遍历全集 ∪ {archive.md}`。

**其余取序理由**：

| 决定 | 理由 |
|---|---|
| 形态（S-1）先于事实（S-2） | `shared` 零 IO 门禁（A-1）；写得对不对是最便宜的判据，先拒掉不花一次盘探测 |
| 可打开（3）先于闸 1（4） | 目录不存在时"合并去向在哪个根下找"没有意义；也保证 `dir` 与清单文档的既有错误码先出口 |
| 闸 1 先于渲染（5） | 渲染输入要含每条合并去向的**存在性读数**，该读数只能来自闸 1 的 `ResolvedMergeTarget[]`（复用不重算，data-model 亮点 3） |
| 遍历只有一次 | 两次遍历就是两份口径（既有实现的教训），且对账结果本身就是"能不能提交"的判据 |

**`path#anchor` 的单点拆分**：`#` 的拆分只在 S-5 一处（首个 `#`，且形态闸已保证恰好一个），结果以 `manualAnchors[{path, anchor}]` 传给 S-2；渲染器与对账**不得**再拆一次（M-1）。

### 根解析与跨项目（`rootOfRequirement` 是唯一取数处） `serves: FR-1, FR-7, FR-8`

**三级顺序**（与 `rootOfRequirement` 逐条对齐，顺序即语义）：

| 优先级 | 输入 | 生效根 | `by` | `attributed` |
|---|---|---|---|---|
| ① | `record.projectId` 非空 **且** 项目表在位（条目带 `path`） | 项目条目 `path` | `project-id` | `true` |
| ② | 否则 `record.workspaceRoot` 非空 | 归一化后的根 | `path-fallback` | `false` |
| ③ | 两者都没有 | 调用方按**当前工作区**兜底 | `unknown`（I-2 取值域） | `false`（标注「归属未知」） |

**三条纪律**：① 缺失不猜（读不到就如实标"读不到"）；② 判据来源必须**向外说**（回执 / 拒绝消息 / 看板标注）；③ **禁止**新增 `startsWith` 或字符串相等形态的项目判定（**D-4**）。

**根校正为什么是必需的**：`deps.docs` / `queueRepo` 是**宿主级、跨窗口共享**的单例，根会被别的窗口改掉——既有实测：立项弹框停留 34 秒期间，另一窗口的 `reqboard_status` 把单例根改走。`SubmitArchive` 此前**缺**这一步，于是校验会去错误的目录找文档。

**拒绝消息三要素**（逐字照 I-2 的消息模板，缺一不可）：

| 要素 | 例 | 为什么必须有 |
|---|---|---|
| 路径 | `docs/architecture/pm-toolview-visualization.md` | 人要知道是哪一条申报不对 |
| 生效根 | `/Users/…/dsh-notice-webhook` | 跨项目场景下"在哪个根上找过"是唯一可复核信息 |
| 判据来源 | `by=project-id` / `by=path-fallback` | 根是怎么来的决定"该改申报还是该修项目归属" |
| 原因 | 不存在 / 是空文件〔0 字节〕/ 锚点不存在 | **缺失 ≠ 0**：没这条文件与有但是空壳是两种事实（FR-1 验收 2 的三态） |

**为什么不能"直接在本仓校验"**（本窗只读复跑，口径与 FR-8 同源）：

| 口径 | 37 个 `mergedInto` 目标里的缺失数 | 判定 |
|---|---|---|
| 按**本仓当前工作区**直接比 | **15 条**（涉 8 条需求） | 假红——这就是"拿邻居项目的根查本仓的货架" |
| 按**每条需求自己的 `workspaceRoot`** | **2 条**（…2084 的 `docs/architecture/pm-toolview-visualization.md`、…6e02 的 `docs/architecture/实施链调度.md`） | 真失效 |

15 与 2 的差，就是本次必须按项目身份解析的全部理由；FR-8 报告要**写明这个反例读数**（FR-8 验收 2）。

**F-1 / F-2 的处置**：记录既无 `projectId` 也无 `workspaceRoot`（存量 3 条）→ ① 项目表未装配 / `list()` 抛错时回落记录自带 `workspaceRoot`（`by='path-fallback'`，如实标注）；② 两者都无 → 按当前工作区兜底并标 `attributed=false`、`by='unknown'`，看板显示「归属未知」（**D-6**），**不冒充本仓**。

**与 FR-8 脚本同源**：脚本用同一个 `rootOfRequirement`。脚本进程拿不到宿主项目注册表（`WorkspaceRegistryProjectPort` 只在装配期从宿主服务取），故一律走 ② 分支（记录自带 `workspaceRoot`），并在报告里如实标注「项目表不可达：判据来源 = 记录自带根」——判据仍是"记录自己的根"，而不是"当前工作区"，**D-4** 的红线不破。

### K13 归档沉淀覆盖度（S-7） `serves: FR-3`

**数据来源（两瓣，各自单点）**：

| 瓣 | 取数 | 口径 |
|---|---|---|
| 有归档材料的需求 | `<ledgerRoot>/archive/<REQ>/archive.json` **存在** | `ledgerRoot = ($DSH_HOME ?? ~/.dsh) + /reqboard`；路径经 `domain/requirement/ReqboardPaths`（`objectPath(root, id, 'archive', {cold:true})`），**不自己拼文件名** |
| 已沉淀的需求 | `docs/knowledge/entries/*.md` 的 `req:` 头字段 | 既有 `parseEntryDoc`；不读正文、不判质量 |

**口径决定（本窗只读实测，三个读数一起写死）**：

| 口径 | 有归档材料的需求 | K13 缺口 | 结论 |
|---|---|---|---|
| **只取冷侧**（`archive/` 分片有 `archive.json`） | **23** | **6**（d718 / 0fbe / 19b6 / 344a / b98d / b918） | **采用**：与 FR-3 结果 2 的 6 条逐条一致、可复现 |
| 冷侧 + 热侧（`requirements/` 分片也算） | 73 | 17 | 否掉：多出的 11 条里 8 条属 quantsys-v2，本仓 entries 本就不是它们的沉淀落点 |

- 热侧条数**如实报出但不判红**（输出一行"热侧另有 N 条 `archive.json`"）——与 **D-5**「口径没定死就会报错数」同一教训。
- **基线集合差**：`gaps \ baseline` 非空 → K13 红（点名缺哪几条需求 id）；`baseline \ gaps` 非空 → **通过**并输出「已补齐 N 条，可 `--refresh-coverage`」（不静默）。
- 基线文件 `docs/knowledge/archive-coverage.baseline.txt`：一行一条 id、**排序后**写入、`#` 注释写清"这份基线是什么、什么时候刷的、为什么刷"；**缺失文件 = 空基线 = 最严格档**（M-5，防"删掉基线即全绿"）。
- **台账不可达 = 读数不可得、不判**：台账根不存在 / `readdirSync` 抛错 → `available=false`，K13 `ok=true` 且 detail 写「读数不可得、不判（原因：台账根 `<path>` 不存在 / 不可读）」；**不得**输出"全部通过"的口径（F-5）。
- "台账存在但一条记录都没有"是**已知空集**（gap=∅，正常绿）——"空"与"读不到"是两件事，这正是缺失 ≠ 0 的应用。
- **只判覆盖度**（结论对不对归 K4 / K6 / K8）；**本需求不补齐**那 6 条沉淀（FR-3 边界 3）。
- **刷新 flag** `--refresh-coverage`：把实测 `gaps` 排序写入基线（承认现状），内容相同不重写（幂等）；**不进 `package.json`**（I-13，避免 K10 覆盖度连锁）。
- **编号**：本检查落 **K13**；既有 K12（页面小节 ↔ 索引行完整性）**一字不改**（**D-1**）。

### K14 失效条件可判定 + INDEX 降权（S-4 / S-10） `serves: FR-4`

**可判定锚点定义**（照 I-4 逐字，纯正则、零 IO、不做语法分析）：

| # | 锚点形态 | 例 |
|---|---|---|
| ① | 反引号字面量 | `` `src/x.ts` `` / `` `pnpm kb:check` `` / `` `kb-0043` `` |
| ② | 形如 `路径.扩展名` 的文件指针（含 `#锚点` 亦算） | `docs/architecture/project-manual.md#收尾门` |
| ③ | `supersede` / `被…取代` **+** 一个 `kb-NNNN` id | ``由 `kb-0043` supersede`` |

**读数与基线集合差**：口径与 K13 同款（`unverifiable \ baseline` 红 / `baseline \ unverifiable` 提示刷新），基线文件 `docs/knowledge/unverifiable.baseline.txt` 由 `--refresh-unverifiable` 生成。

**实测口径说明（与 architecture / interfaces 写的「58」差 2，按 **D-5** 的方式处理）**：

| 读数 | 数值 | 口径 |
|---|---|---|
| 不可判定条目（按 I-4 锚点定义） | **60 / 60** | 本窗只读复算（脚本口径预演）；实现后以 `--refresh-unverifiable` 的实测输出为准 |
| 其中同一模板句 | **58** | 53 条逐字「相关实现被重构、或该结论被新条目 supersede 时」+ 5 条无顿号变体 |
| 另 2 条 | 2 | 别的自由文本，同样没有锚点 |

结论：**「58」是同模板句条数，不是不可判定条数**；基线初值以脚本实测为准，报告同时给两个读数并注明口径（与 D-5「6 不可复现」同款处理，不采用未经复现的数当基线）。

**降权 = INDEX 节内排序（零字符增量）**：

- 同一分节内：可判定条目在前、`unverifiable` 沉底；同档内按 id 升序（顺序确定、可 diff）。
- **不改索引行文法**：`renderIndexLine` 的 `- <id> · <kind> · <一句话> · → <指针>` 逐字不变；**行数与字符数不变**。
- **理由（R-2）**：`INDEX.md` 现 **8190 字符 > 8000 预算**（K1 已红）。任何"加标记 / 加后缀"的降权都会加重 K1 红；排序是唯一零字符增量的降权。
- **K2 兼容**：`parseIndexDoc` 只校验**分节顺序**与行语法，**不校验节内顺序**（已读实现确认）→ 节内排序不会打红 K2。
- **可观测**：降权读数（不可判定条数、都是谁、失效条件原文）写在 **K14 输出与条目页**，不写进 INDEX。
- **落点**：排序在 `KnowledgeRepository` 的索引写路径（`upsertIndexRow` 之后按节重排）；`kb-build --check` 若因此报漂移，按 **C-13** 重生成后再比对（架构 R-6）。

**根因同步修（S-6）**：`buildDepositDraft` 的「## 失效条件」改为由 pointer / req **派生**，例：

```
`<pointer>` 被删除或改名时该结论随之失效（原结论：<indexEntry 摘要>）
```

- `pointer = mergedInto[0] ?? '<dir>/verification.md'`（既有口径）；派生式恒含反引号 → 恒命中锚点 ①，**新条目不会再进 K14 基线**（否则基线会一直涨，读数变噪声）。
- pointer 为空时回落 `` `docs/requirements/<REQ>/verification.md` ``，**绝不产出无锚点文本**；该项由单测钉住（构造"模板句"与"含锚点"两条，见 FR-4 验收 1）。
- 存量 60 条条目正文**一字不改**（FR-4 边界 2）：只加读数与排序。

### S-3 `archive.md` 渲染与机器产物分区 `serves: FR-5, FR-6`

**纯渲染器契约**：输入 `ArchiveManifestInput`（data-model §3：已校验材料 + `ResolvedMergeTarget[]` + `MachineArtifactGroup[]` + 注入的 `renderedAt` + `listedCount`），输出 Markdown 文本。

| 约束 | 判定 | 为什么 |
|---|---|---|
| 不碰时钟 | 不调 `Date.now()`（时刻由调用方注入） | domain 层门禁；纯函数可单测、可复现 |
| 不碰文件系统 | 不 import `node:` | 所有实测读数由 S-5 采集后喂入（I-12：渲染器不重复校验） |
| 只渲染台账信息 | 逐字来自输入（`indexEntry` 原文） | FR-5 边界 3：`archive.md` 是渲染物，**不是新的事实源** |

**输出结构（顺序即契约，照 I-3 六节）**：

| 节 | 内容 |
|---|---|
| `# 归档结论（<REQ id> <title>）` + 引言 | 归档目录 / 类型 / 渲染时刻 |
| `## 一句话结论` | `indexEntry` **逐字** |
| `## 合并去向` | 逐条：路径 + 存在性读数（✅ 存在 `<bytes>` 字节 / ❌ 不存在）+ **生效根 + 判据来源** |
| `## 人读材料` | `docs` 清单（kind 分组），计数与机器产物计数**对照** |
| `## 机器产物（可重建，折叠）` | 一行一类：类别名 · 数量 · 体积；`queue.json` 附摘要（或「无法解析」） |
| `## 说明书更新点` | `path#anchor` + summary；**旧形态**渲染为 `path（旧：section）` |
| `## 相关` | 台账锚点（需求 id / 归档材料提交时刻） |

**写盘与幂等（FR-5 验收 2 的机器可读口径）**：

- `deps.docs.write('<dir>/archive.md', text)`；**比对时剔除「渲染时刻」那一行**后逐字相等 → 不写，返回 `archive_manifest.written = false`（I-5）。
- 这是对 I-3「同一输入 → 同一文本」的落地规则：同一输入（含同一 `renderedAt`）恒同一文本；跨次提交只有时刻行不同，不算内容变更，故保留盘上首次时刻、mtime 不变。
- 渲染失败（只读目录 / 权限）→ 整体拒绝、**台账零写入**（F-4 / FR-5 验收 3）。

**机器产物分区（FR-6，**D-2**）**：

- 分类**只**用 `matchArchiveExemption`（`ARCHIVE_EXEMPTIONS[].id`：`rtm-reports` / `rtm-dir` / `ledger-mirror` / `runtime-state`），**不新写第二份分类规则**（两套分类必然漂移，架构变更记 5）。
- 一行一类（类别 · 数量 · 体积），**逐文件路径不铺开**（M-3）；`listedCount`（人读文档数）与机器计数对照呈现，人读面从 44% 噪声降到"一行一类"。
- **不搬迁、不删除**任何文件：`rtm-*` / `state/` / `queue.json` 位置与数量逐字不变（FR-6 验收 1 用 `find` 计数比对）。

**`queue.json` 摘要**（实测字段形状 `{generated_at, tasks[], edges[], ready[], layers[]}`）：

| 摘要字段 | 取数 | 缺失/坏数据的处理 |
|---|---|---|
| 任务数 | `tasks.length` | 解析失败 → `queueSummary = undefined` |
| 依赖边数 | `edges.length` | 同上 |
| 就绪数 | `ready.length` | 同上 |
| 生成时间 | `generated_at` 原文 | 字段缺失 → 不编时间（`generatedAt?: undefined`） |
| 字节数 | `deps.docs.stat('queue.json').size` | 恒可得（文件不存在则整块不出现） |

**解析失败 → 只报体积 + 「无法解析」，不抛错**：摘要是增益不是判据，坏 JSON 不得让一次合法归档失败（data-model §3 / I-3）。

**一次遍历**：机器产物分类与三分类对账共用**同一次**目录遍历结果（S-5 步骤 5 采集、步骤 7 复用），避免两次遍历 = 两份口径。

### S-8 FR-8 只读核对脚本 `serves: FR-8`

**CLI**（与既有 `scripts/req-doc-validate.mts` 同款参数语汇）：

```bash
npx tsx scripts/archive-ledger-audit.mts                      # 人读表格（默认台账）
npx tsx scripts/archive-ledger-audit.mts --json                # 结构化（CI / 验收材料）
npx tsx scripts/archive-ledger-audit.mts --out <path.md>       # 同时把报告写成 Markdown（默认不写）
npx tsx scripts/archive-ledger-audit.mts --ledger-root <dir>   # 指定台账根（副本上跑）
```

**只读契约（硬）**：

- 对台账只做 `readFileSync` / `readdirSync` / `existsSync`；**除 `--out` 指定的报告文件外零写**（默认不写任何文件）。
- **不追溯改写**任何历史台账或历史归档目录（**D-3** 的"只报告不追溯"）；不删除、不迁移、不补写。
- 跨项目目标只做 `existsSync`；判锚点漂移时需要读取目标文档的**标题**（只读），报告里如实标注"读取了别项目文档 N 次"，不去列别项目目录（FR-7 边界 1 的同一纪律）。

**输出必须含**（I-7）：

| 项 | 基线读数 | 口径要求 |
|---|---|---|
| 逐条失效 | `REQ id + 路径/section + 判据 + 生效根` | 生效根必写（否则无法复核） |
| 真失效数（合并去向缺失） | **2** | 按每条需求自己的根解析；37 个目标里 2 个 |
| 章节漂移**双读数** | **22**（任意级标题归一化精确匹配）/ **14**（`section` 形如章节引用：一、/ 第 N / 数字序号 / 全文·全篇） | 两个口径各自写清，并注明底稿的「6」两种口径都复现不出（**D-5**） |
| `manual_updates[].path` 本身缺失 | **1** | 与章节漂移分列 |
| 归属未知 | **3** | 无 `projectId` 也无 `workspaceRoot`，不冒充本仓（**D-6**） |
| 按当前工作区直接比会误判的条数 | **15** | **口径：目标条数**（37 个 `mergedInto` 目标里 15 个在本仓根下找不到，涉 8 条需求）；按需求条数口径是 8——报告写 15 时必须同时给口径 |

**退出口径**：**0 = 报告完成**（存量有失效不是脚本的错误——本次不追溯）；**2 = 台账不可达**（环境问题，与 `req-doc-validate.mts` 的 0/1/2 语汇一致）；**不用 1**（本脚本没有"判据失败"，只陈述事实）。

**`EXCLUDED` 登记（S-11）**：`{ name: 'archive-ledger-audit.mts', reason: '专项只读核对（存量归档声明 ↔ 磁盘事实），按需运行、非每次必跑' }`（理由必填，空理由会抛错）。

**为什么走 `EXCLUDED` 而不是 `EXTRA_ENTRIES`**：

| # | 理由 |
|---|---|
| ① | 它是**按需专项核对**，不是每次必跑的入口——K10 覆盖度的语义是"必跑入口必须有规范条目" |
| ② | 进 `EXTRA_ENTRIES` 会要求新增一条 `C-NN` 规范条目 + `package.json` 脚本 → 索引要追加一行 → **INDEX 已 8190 > 8000（K1 红）会再加重**（R-2） |
| ③ | 既有三条同款先例：`test-baseline.mts` / `commit-check.mts` / `req-doc-validate.mts`（"挂入口或按需，脚本本体不另立条目"） |

代价：不进规范页——与它的定位一致（I-14 / A-5）。

## 错误处理 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-8`

**不新增错误码**（I-11）：形态与事实两类拒绝复用 `REQBOARD_INVALID_INPUT` / `REQBOARD_FILE_MISSING` / `REQBOARD_ARTIFACT_NOT_OPENABLE`，未列文件复用既有 `REQBOARD_UNLISTED_ACK_REQUIRED`；`design-gates.ts` 的 `openableError` 联合类型**不动**。

| 错误类型 | HTTP 状态码 | 错误码 | 用户提示（要素） | 重试策略 | 降级方案 |
|---|---|---|---|---|---|
| `manual_updates[].path` 形态非法 | —（工具/CLI，无 HTTP） | `REQBOARD_INVALID_INPUT` | 原值 + 「必须是 `路径#锚点` 形态」+「`section` 已废弃」 | 不重试（改材料） | 无降级：形态不过即拒 |
| `path` 不在 `mergeTargets` 白名单 | — | `REQBOARD_INVALID_INPUT` | 原值 + 白名单前缀清单 + 该类型 `note` | 不重试 | 无降级 |
| 合并去向 / 锚点路径伪路径、越界 | — | `REQBOARD_ARTIFACT_NOT_OPENABLE` | normalized 路径 + 原因 | 不重试 | 无降级 |
| 合并去向不存在 | — | `REQBOARD_FILE_MISSING` | 路径 + 生效根 + `by` | 不重试 | 无降级（禁"读不到算通过"） |
| 合并去向是 0 字节文件 | — | `REQBOARD_INVALID_INPUT` | 路径 + 生效根 + `by` + 〔0 字节〕+ 补齐建议 | 不重试 | 无降级 |
| 锚点不在目标文档标题里 | — | `REQBOARD_INVALID_INPUT` | `path` + `anchor` + 「锚点不存在」（与"白名单外"**区分**两种消息） | 不重试 | 无降级 |
| 归档目录 / 清单文档不存在 | — | `REQBOARD_FILE_MISSING` | normalized 路径 | 不重试 | 无降级 |
| 目录内有未列且未声明 | — | `REQBOARD_UNLISTED_ACK_REQUIRED` | 未列文件清单 + 两种处置（收进清单 / 传 `unlisted_ack`） | 不重试 | 无降级 |
| `archive.md` 写盘失败（只读/权限） | — | 沿用既有 IO 抛错（不新增码） | 目标路径 + 「台账零写入」 | 不重试 | 无降级：整体拒绝（R-4） |
| K13 / K14 台账不可达 | — | 无（读数不可得） | 「读数不可得、不判（原因：…）」 | — | 不报绿、不报红；`ok=true` 但文案不是"全部通过" |
| FR-8 台账不可达 | — | 无（CLI 退出码） | 台账根路径 + 处置（传 `--ledger-root`） | — | 退出码 **2**，不产出报告 |
| 存量失效（报告事实） | — | 无 | 报告如实报数 + 「不追溯」 | — | 退出码 **0**（不是错误） |

**错误降级原则**（与需求「失败要响亮」一致）：

- 材料层错误（形态 / 事实）：**明确拒绝，零降级**——不许把"读不到"当"没问题"。
- 渲染失败：**响亮拒绝**，不退化成"先写台账"；台账零写入是硬约束。
- 读数不可得（台账不可达）：**大声说出原因**，既不报绿也不报红（`reading: 'unknown'` 的既有纪律）。
- 存量失效：**只陈述**（FR-8），不阻断、不追溯。

### 拒绝消息要素表（逐条可 grep 验收） `serves: FR-1, FR-2, FR-8`

| # | 触发 | 错误码 | 消息必须含 | 来源 |
|---|---|---|---|---|
| 1 | `path` 无 `#`，或 `#` 两侧有空 | `REQBOARD_INVALID_INPUT` | 原值 + 形态要求 + 「锚点写进 `path`」 | I-1 / S-1 |
| 2 | `#` 前部分不在白名单 | `REQBOARD_INVALID_INPUT` | 原值 + 白名单前缀清单 + 类型 `note` | I-1 / S-1 |
| 3 | 只写 `section` 不写锚点 | `REQBOARD_INVALID_INPUT` | 「`section` 已废弃，锚点写进 `path`」+ 原值 | I-1 / S-1 |
| 4 | 合并去向不存在 | `REQBOARD_FILE_MISSING` | 路径 + 生效根 + `by` + 补齐建议 | S-2 |
| 5 | 合并去向 0 字节 | `REQBOARD_INVALID_INPUT` | 路径 + 生效根 + `by` + 〔0 字节〕 | S-2 |
| 6 | 锚点路径缺失 / 空 | `REQBOARD_FILE_MISSING` / `REQBOARD_INVALID_INPUT` | `path` + `anchor` + 生效根 + `by` | S-2 |
| 7 | 锚点不在标题锚点集合 | `REQBOARD_INVALID_INPUT` | `path` + `anchor` + 「锚点不存在」 | S-2 |
| 8 | 目录 / 清单文档不存在 | `REQBOARD_FILE_MISSING` | normalized 路径 | `assertArtifactOpenable`（既有） |
| 9 | 未列未声明 | `REQBOARD_UNLISTED_ACK_REQUIRED` | 未列文件清单 + 两种处置 | `reconcileArchiveDir`（既有） |
| 10 | `archive.md` 写失败 | 既有 IO 码 | 目标路径 + 「台账零写入」 | S-5 步骤 5 |

### 既有用例被打红：契约升级，不是回归 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-8`

**事实（已数清的受影响面，预期为真）**：闸 1 / 闸 2 收紧会打红一批既有契约用例——这是**契约升级**，不是回归。

| 面 | 文件 | 症状 |
|---|---|---|
| 旧形态 `manual_updates`（自由文本 `section`、`path` 不带 `#`） | `tests/acceptance-archive.test.ts`、`tests/archive-compat.test.ts`、`tests/archive-reconcile-e2e.test.ts`、`tests/archive-reconcile.test.ts`、`tests/artifact-gates.test.ts`、`tests/kb-archive-deposit.test.ts`、`tests/output-contract.test.ts`（共 **7 个**） | 样例 `manual_updates: [{ path: 'docs/architecture/project-manual.md', section: '收尾门', summary: '…' }]` → 形态闸拒（无 `#`） |
| 闸 1 的假路径 `merged_into` | 同上批用例 | 目标多是 `mkdtemp` 临时根下的 `docs/architecture/...`，磁盘上并不存在 → 存在性判定拒 |
| 提交归档材料的更宽集合（含只写 `merged_into`） | `tests/e2e-b918-drill.test.ts`、`tests/board-info-fixes.test.ts`、`tests/closing-gap.test.ts`、`tests/acceptance-criteria.test.ts`、`tests/domain/req-b918-gates.test.ts`、`tests/reqboard/domain-summary.test.ts`、`tests/application/use-cases.test.ts` | 同上（存在性 / 形态两类） |

**三条处置口径（缺一不可）**：

| # | 口径 |
|---|---|
| ① | 这些用例**必须更新为新契约**：把目标文档真的 stub 出来（临时根下写盘/写目录）+ 把锚点写进 `path`（`docs/architecture/<doc>.md#<anchor>`，且该文档里有对应标题）。这是契约升级。 |
| ② | **不许**为了让它们过而放宽判据、加豁免旁路、或在用例里绕过校验（例如把 `merged_into` 改空、把渲染物塞进 `unlisted_ack` 兜住）。门禁只紧不松。 |
| ③ | 判据 = `pnpm baseline:check` 的**失败用例集合差为空**（与改动前基线比**集合差**，不比绝对数）；上表 7 个文件的每一处失败必须**逐条确认**属于「契约升级」还是「真回归」，结论写进验收材料。 |

## 数据库设计 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

### 台账 schema 与表（零变更） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

- 本需求**无新增表、无字段变更、无索引、无约束变更**：台账 schema 停 **v10**（`schemaVersion` 不变），`archive.json` 字段只增不减。
- 本需求没有任何 SQL / ORM 面：台账是**分片 JSON 文件**（`record.json` / `archive.json` / `plan.json` / `verification.json` / `artifacts.json` + `comments.jsonl` / `history.jsonl`）。
- 唯一的新增"持久化"都不是台账：

| 文件 | 性质 | 谁写 | 幂等口径 |
|---|---|---|---|
| `docs/knowledge/archive-coverage.baseline.txt` | K13 基线（一行一条需求 id） | `kb-probe --refresh-coverage` | 内容相同不重写 |
| `docs/knowledge/unverifiable.baseline.txt` | K14 基线（一行一条条目 id） | `kb-probe --refresh-unverifiable` | 内容相同不重写 |
| `docs/requirements/<REQ>/archive.md` | **渲染物**（不是事实源） | S-5（归档提交时） | 剔除时刻行比对，相同不写 |

### 索引 / 约束 / 不变量 `serves: FR-2, FR-3, FR-4, FR-5, FR-6`

| 类型 | 对象 | 规则 | 理由 |
|---|---|---|---|
| 集合差基线 | K13 / K14 两份基线文件 | 一行一条 id、排序写入、`#` 注释；**缺失 = 空基线** | 集合差可比、diff 可读；防"删掉基线即全绿"（M-5） |
| 不变量 | 归档目录分类 | `listed ∪ exempted ∪ unlisted = 遍历全集 ∪ {archive.md}` | 与既有单测不变量同款，只是多了本次渲染物 |
| 不变量 | `docs` 清单 | `archive.md` 恰好一条（重复提交不重复追加） | 补登前先查清单里是否已有同 path |
| 契约 | INDEX 行语法 | 逐字不变、字符数不变 | K1 预算已超（R-2）；K2 只校验分节顺序 |

### 兼容性与迁移 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7`

| 面 | 旧 | 新 | 兼容策略 |
|---|---|---|---|
| 台账 schema | v10 | v10（**不变**） | **零迁移** |
| `manualUpdates.section` | 自由文本必填 | 废弃（可选） | 写侧不再接受无锚点形态；**读侧/渲染**对旧值逐字保留（`path（旧：section）`）；字段**不删**（删了历史 `archive.json` 反序列化丢信息） |
| `mergedInto` | 前缀判定 | 逐条存在性判定 | 只作用于**新提交**；存量 37 条只读报告（FR-8），不改写 |
| `INDEX.md` | 按 id 序 | 节内可判定优先 | 行文法与字符数不变（K2 不校验节内顺序）；降权读数写在 K14 输出 |
| `/state` payload | 无 `origins` | 增 `origins` | 客户端缺键 → 不渲染标注（逐字降级） |
| 既有测试 | 旧形态/假路径 | 新契约 | 见「错误处理 §既有用例被打红」：7 个文件 + 更宽集合必须改，判据是**失败集合差为空** |

**回滚口径**（逐面可单独回退，均无数据迁移）：

| 面 | 回滚动作 | 副作用 |
|---|---|---|
| 闸 1 / 闸 2 | 恢复前缀判定 + 去掉锚点/非空探测 | 只影响新提交面；存量一字不动 |
| 渲染物 | 停渲染 | `archive.md` 是渲染物，可直接删；台账无对应必填字段 |
| K13 / K14 + 排序 | 删两项检查 + 两份基线 + 排序改动 | 纯增量，删掉即回旧行为 |
| `origins` | 客户端忽略新字段（服务端多一个键无害） | 旧渲染逐字恢复 |

**台账停 v10：无迁移脚本、无回滚脚本**——本需求一个字都不改存量记录（这是"不追溯改写历史台账"红线在数据面的落实）。

## 性能考量 `serves: FR-1, FR-3, FR-4, FR-7, FR-8`

| 指标 | 量级 / 目标 | 做法与依据 |
|---|---|---|
| 闸 1 的 per-target 探测 | `mergedInto` ≤ 10（既有 `slice(0,10)`），每条约 1 次 `exists` + 1 次 `stat` ⇒ **≤ 20 次同步 syscall** | 同目录小文件，与既有 `assertArtifactOpenable` 同量级 |
| 闸 2 的文档读取 | 按 `#` 前路径**去重**后每份读一次 ⇒ ≤ 去重后文档数 | `listHeadingAnchors` 一次读全文；同一文档 N 条锚点只读一次 |
| 目录遍历 | **一次**（机器产物分区 + 三分类对账复用同一份结果） | 两次遍历 = 两份口径（既有实现的教训） |
| `/state` 的 `origins` | 只对**本页** requirements 计算（有界：≤ `limit`，默认 200）；**零额外读盘** | `RequirementSummary` 自带 `projectId` / `workspaceRoot`（不需 `st.get`）；判据 `rootOfRequirement` + `sameProjectRoot` |
| 项目表调用 | 每请求 `projectRegistry.list()` **一次**（不是每条一次） | 取一次快照，塞进 `{ projectRegistry: { list: () => snapshot } }` 的 deps 视图；判据仍是 `rootOfRequirement` 单点 |
| K13 / K14 | O(台账分片数 + entries 数)：实测 23 个冷侧分片 + 60 条条目，纯 `readdir` / `readFile` | 单命令、退出码语义不变 |
| FR-8 脚本 | O(37 冷侧记录 + 目标 `existsSync` + 少量文档读) | 只读、按需运行 |

**瓶颈分析**：唯一可感知的是闸 2 读一份大文档（如 `project-manual.md`）——按路径去重后每份一次；归档是**低频**动作（每次需求收尾一次），不在热路径上。`/state` 的增量是纯字符串派生（每页 ≤ 200 次），相对该端点既有的 `tokenTotals` 逐条 `st.get` 可忽略。

**优化空间（不在本次）**：`origins` 若将来需要缓存，缓存键应是 `(revision, session 项目根)`；本次现算即可（I-15）。

## 安全设计 `serves: FR-1, FR-2, FR-8`

### 输入校验与路径越界 `serves: FR-1, FR-2`

| 参数 / 字段 | 判据 | 拒绝示例 | 理由 |
|---|---|---|---|
| `merged_into[]` / `manual_updates[].path`（`#` 前部分） | 先过既有 `assertArtifactOpenable`：空串 / 反斜杠 / `..` 段 / brace 通配 / 工作区外 | `../../etc/passwd`、`docs/{a,b}.md` | 防路径遍历与伪路径（既有实现逐字不改） |
| `manual_updates[].path` 形态 | 恰好一个 `#`、两侧非空 | `docs/x.md`（无 `#`） | 无锚点的自由文本无法机械核验（FR-2 的根因） |
| `manual_updates[].path` 白名单 | `#` 前部分命中 `ARCHIVE_DOC_RULES[category].mergeTargets` | `CLAUDE.md#x` | 防"自创平行文档体系"（**与 `mergedInto` 同一份白名单，不新增第二份**） |
| `dir` | `REQUIREMENT_DIR_PATTERN` | `docs/requirements/foo` | 既有 |

### 只读与最小权限 `serves: FR-3, FR-4, FR-8`

- FR-8 脚本对台账**只读**，唯一允许的写是 `--out`（默认不写）；不删、不改、不迁移任何历史文件（**D-3**）。
- K13 / K14 只读台账与 entries；除两个 `--refresh-*` flag 外零写。刷新是**显式例外动作**（确认差集非本次引入之后才刷，与既有 `baseline:refresh` 同一纪律）。
- `archive.md` 写盘只写需求目录内一个文件；不触碰目录外路径（`deps.docs` 的越界判定仍在）。

### 拒绝消息的信息面 `serves: FR-1, FR-2, FR-8`

- 消息只含**路径 / 生效根 / 判据来源（`by`）/ 原因**，不含他项目文件内容、不含台账原文。
- 跨项目只回答"在不在"：不去列别项目目录、不去读别项目文档正文（FR-7 边界 1 的同一纪律；FR-8 判锚点时读标题是唯一例外且如实标注）。
- 不新增错误码（I-11）：错误码面与客户端文案表不扩大，代价是**原因必须写在消息里**（已写进上面的要素表）。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| # | 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|---|
| B-1 | `archive.md` 渲染放在写台账前还是后 | 先写台账再渲染 | 渲染在写台账**之前** | 台账是事实源，先写就会留"台账说归档了、目录里没有"的半截（R-4 / F-4 / FR-5 验收 3） |
| B-2 | `archive.md` 进 `docs` 清单的 kind | 新增 `manifest` kind / 让它走豁免表 | 复用 `notes` | 不扩 `ALL_ARTIFACT_KINDS` 契约面（架构变更记 4）；进豁免表会与 FR-6「机器产物分区」自相矛盾 |
| B-3 | 幂等判定含不含渲染时刻 | 每次重写（时刻必变）/ 不注入时刻 | 比对**剔除时刻行**，相同不写 | 同时满足 FR-5 验收 2（mtime 不变）与"何时渲染过"这一事实（I-3 / I-5 的 `written:false`） |
| B-4 | K13 的「有归档材料」范围 | 冷侧 + 热侧（73 → 缺口 17） | **只取冷侧**（23 → 缺口 6） | 与 FR-3 结果 2 的 6 条逐条一致、可复现；热侧多出的 11 条里 8 条属别的项目（本仓 entries 不是它们的落点） |
| B-5 | K14 的降权形态 | 索引行加 `[unverifiable]` 标记 | **节内排序**（可判定在前） | `INDEX.md` 现 8190 字符 > 8000 预算，加字符会加重 K1 红（R-2）；K2 不校验节内顺序，排序安全 |
| B-6 | 失效条件只加读数还是也改源头 | 只加读数 | **同时改** `DepositKnowledge` 由 pointer 派生 | 不改源头，新条目会持续进 K14 基线（基线永远在涨，读数变噪声） |
| B-7 | FR-8 脚本的归类 | `EXTRA_ENTRIES`（进规范页） | `EXCLUDED`（必填理由） | 按需专项核对、非每次必跑；进白名单要新增 `C-NN` + 索引行 → 加重 K1（I-14 / A-5） |
| B-8 | 项目身份判在客户端还是服务端 | 客户端比较路径字符串 | 服务端派生 `origins`，客户端零判断 | 判据单点（**D-4** 禁新增字符串比较型项目判定）；`renderArchivedBar` 缺键即旧行为 |
| B-9 | 存量失效（37 条）怎么办 | 本次一并补写 / 提交期回溯翻旧账 | 只读报告（FR-8），只对新提交设闸 | 补写是内容工作且需人裁决（需求「边界」第 1 条）；**D-5** 要求口径可复现，报告正好承担这件事 |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

**技术栈与关键依赖**：

| 依赖 | 版本 | 用途 | 为什么选它（不选的替代方案） |
|---|---|---|---|
| TypeScript + `DocRepository` 端口（不直接 `node:fs`） | 仓内既有 | 一切盘上探测与写盘 | 分层纪律：`shared` 零 IO、`application` 只经端口（层边界门禁） |
| `listHeadingAnchors`（`domain/knowledge/slug.ts`） | 既有 | 闸 2 的标题锚点集合 | 与知识层 K4 死链、`reqboard_kb` 取节**同一实现**；新写一套 slug 必然漂移（FR-2 边界 3） |
| `matchArchiveExemption` / `ARCHIVE_EXEMPTIONS` | 既有 | FR-6 机器产物分类 | 豁免表是机器产物分类的唯一来源；两套分类必然漂移（架构变更记 5） |
| `rootOfRequirement` / `applyRequirementWorkspaceRoot` | 既有 | 跨项目取根与根校正 | 27 个调用点共用的唯一取数处；换判据只改一处（**D-4** 的落地前提） |
| `ReqboardPaths` | 既有 | 台账分片路径 | 不自己拼文件名（拼错会静默产生"新文件"，读侧看不到旧评论就是这类事故） |
| `isDecidableInvalidation`（本次新增纯函数） | 本次 | K14 判定 + 沉淀派生自检 | 判定与读数同源，避免"报告一套、门禁一套"（FR-8 边界 3） |

**模块划分**：

| 模块 / 文件 | 职责 |
|---|---|
| `src/shared/protocol.ts` | 只判形态（`path#anchor` + 白名单），保持零 IO |
| `src/application/internal/archive-targets.ts`（新建） | 只判事实（存在 / 非空 / 锚点可达）+ 判据来源回执 |
| `src/application/use-cases/SubmitArchive.ts` | 编排与**唯一写路径**（次序即语义） |
| `src/domain/requirement/archive-manifest.ts`（新建） | 纯渲染（无 IO、无时钟） |
| `src/domain/knowledge/invalidation.ts`（新建） | 纯判定（可判定锚点） |
| `scripts/kb-probe.mts` · `src/adapters/KnowledgeRepository.ts` · `src/application/use-cases/DepositKnowledge.ts` | 两条读数、节内降权、源头不再产模板句 |
| `scripts/archive-ledger-audit.mts`（新建） · `src/http/routers/stages.ts` | 存量只读报告、`/state` 的 `origins` 派生 |

**设计模式**：**纯函数 + 端口**（domain 只做纯派生，IO 全在 application 经端口）；**单点判据 + 三处消费**（`ResolvedMergeTarget[]` 同时喂拒绝消息、`archive.md` 渲染、FR-8 报告，三处不可能出现三个口径）。

**关键实现手法**：

1. **次序即语义**：所有可能失败的动作都在唯一那次台账写之前；`archive.md` 的补登排在对账之前，避免"自己渲染的文件把自己挡住"。
2. **一次遍历两处消费**：目录实测结果同时供机器产物分区与三分类对账，杜绝两份口径。
3. **零字符增量降权**：靠节内排序而非标记，绕开 INDEX 预算的硬约束。
4. **口径与读数一起写**：15（目标条数）/ 8（需求条数）、22 / 14（章节漂移两口径）、58（同模板句）/ 60（不可判定）——凡有多口径处一律双写并注明（**D-5** 的教训）。

**攻克的难点**：

1. **"在哪个根上判的"无法自证** → 把判据来源（`by` / `attributed`）做成回执与拒绝消息的一等字段，跨项目场景下人不需猜。
2. **存量与增量混在一起** → 只对新提交设闸，存量走只读报告，用**基线集合差**而不是绝对数，"不追溯"与"拦住新增"同时成立。
3. **降权 vs 索引预算的死结** → 排序替代标记 + 读数外置（K14 输出与条目页），把一个会加重 K1 红的动作变成零字符增量。

**与常规做法的差异**：

| 差异 | 常规做法 | 本方案 | 为什么 | 可核验指向（文件 / 测试 / 评审） |
|---|---|---|---|---|
| 归档校验 | 只判字符串前缀 | 按需求自己的根做文件系统判定（存在 + 非空 + 锚点） | 前缀判不出"文档从未落盘"（实测 2 条真失效） | `src/application/internal/archive-targets.ts`；反向演练"改假路径 → 被拒并点名" |
| 项目归属 | 拿当前工作区当默认 | 三级取根 + 归属标注，解析不出就「归属未知」 | 按本仓直接比会误判 15 条（真失效 2 条） | `rootOfRequirement`；FR-8 报告的双读数 |
| 自检口径 | 绝对条数（会阻断存量） | 基线**集合差** | 不阻断存量、又能拦住新增（A-2） | `kb-probe` K13 / K14 两行 + 两份基线文件 |
| 降权 | 加标签 / 加后缀 | 节内排序（零字符增量） | `INDEX.md` 已 8190 > 8000，加字符加重 K1 红 | `KnowledgeRepository.upsertIndexRow` + K1 / K2 读数 |
| 归档结论的落点 | 只留台账（人要读 JSON） | 归档时渲染 `archive.md` 进需求目录 | 归档是"最后一个可信承诺"，结论该留在需求目录里 | `renderArchiveManifest`；FR-5 验收 1/2/3 |
