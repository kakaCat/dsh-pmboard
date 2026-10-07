# 架构设计（REQ-261006201841-944d 归档校验与知识层覆盖度加固） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 状态：design · 窗口 session-95c36a7d · 2026-10-06
> 上下游：`requirement.md`（8 个功能点 / 6 条 D-x 裁定 / 7 条失败路径）、`prototypes/INDEX.md`（唯一权威原型）
> 读者：零上下文的执行者——只凭本文 + 需求文档就应能写出拆分计划

## TL;DR `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

本次改造把「归档声明」从**字符串前缀判定**升级为**按项目身份的文件系统判定**，并补上三条会响的读数：
知识层沉淀覆盖度（K13）、条目失效条件可判定性（K14）、存量归档只读核对（FR-8）。

四件事，边界清晰、互不依赖：

| # | 改什么 | 判据落在哪 |
|---|---|---|
| A | 归档提交的三道闸：合并去向存在且非空、说明书 `path#anchor` 可达、`path` 落白名单 | `SubmitArchive`（application）+ `assertArchiveMaterials`（形态，shared） |
| B | 归档产物：渲染 `archive.md`（含机器产物分区与 `queue.json` 摘要） | `renderArchiveManifest`（domain，纯函数）+ `SubmitArchive` 写盘 |
| C | 知识层两条新读数 + 降权排序 | `scripts/kb-probe.mts`（K13/K14 + 基线集合差）、`KnowledgeRepository`（索引排序） |
| D | 看板归档条来源标注（本仓 / 在别处 / 归属未知） | `/state` 端点派生 `origins`（server）+ `renderArchivedBar`（client） |

## 分层与职责边界 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

```
                shared/protocol.ts（形态判定，零 IO）
                  ├─ assertArchiveMaterials        形态：必填文档 / dir 形态 / mergedInto 前缀 / path#anchor 形态
                  └─ ARCHIVE_DOC_RULES（domain 再导出）  白名单唯一来源
                              ▲
                              │ 只判"写得对不对"
                              │
  application/use-cases/SubmitArchive.ts（判定 + 编排，唯一写路径）
                  ├─ applyRequirementWorkspaceRoot  根校正（复用既有唯一实现）
                  ├─ assertArtifactOpenable         目录/文档可打开（既有）
                  ├─ assertArchiveTargetsOpenable   ★新增：mergedInto 存在 + 非空 + 锚点可达
                  ├─ renderArchiveManifest          ★新增：archive.md 文本（纯函数）
                  └─ depositArchiveKnowledge        知识沉淀（既有）
                              ▲
                              │ 只判"磁盘上有没有"
                              │
  domain/requirement/archive-manifest.ts（★新增，纯函数：输入记录 → archive.md 文本）
  domain/knowledge/{entry,index-line,slug}.ts（既有，K14 与锚点计算复用）
                              ▲
                              │
  scripts/kb-probe.mts（K13 / K14 读数 + 基线集合差）· http/routers/stages.ts（origins 派生）· client/views/board.ts（三态渲染）
```

**职责边界一句话**：`shared` 只判**形态**（写得对不对），`application` 判**事实**（磁盘上有没有），
`domain` 只做**纯派生**（文本渲染、锚点计算、可判定性判定），`client` 只**呈现**（不自己判项目身份）。

## 现状病灶 `serves: FR-1, FR-2, FR-8`

| 病灶 | 位置 | 后果（实测） |
|---|---|---|
| 合并去向只比前缀 | `src/shared/protocol.ts:2088`（`target.startsWith(prefix)`），`SubmitArchive` 里 `existsSync` 零命中 | 申报的文档从未落盘也能归档（2 条真失效） |
| 说明书更新点是无锚点自由文本 | `assertArchiveMaterials` 只查 `path/section/summary` 非空 | 42 条里 22 条（任意级精确匹配口径）锚不到任何标题；`path` 可写 `CLAUDE.md` |
| 自检不查覆盖度 | `scripts/kb-probe.mts` 的 12 项逐项是格式/漂移/死链 | 6 条有归档材料的需求零沉淀，`pnpm kb:check` 仍 exit 0（就本项而言） |
| 失效条件无锚点 | `DepositKnowledge` 写死模板句 + 60 条里 58 条同句 | 「失效条件」= 永不过期 |
| `archive.md` 不是归档产物 | 只有 `3/80` 需求目录存在 `archive.md` | 归档结论不在需求目录里，人只能读台账 |
| 归档条不分来源 | `renderArchivedBar` 只渲染 id + 标题 | 跨项目 9 条点开空白，分不清「丢了」还是「在别处」 |

## 目标架构：三道闸 + 一份渲染物 + 两条读数 + 一处派生视图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

### 闸 1 · 合并去向（FR-1）`serves: FR-1`

- **根解析**：`rootOfRequirement(deps, record)`（`application/internal/support.ts`，既有唯一实现）——
  有 `projectId` 且项目表在位 → 项目条目 `path`（`by='project-id'`、`attributed=true`）；
  否则回落记录自带 `workspaceRoot`（`by='path-fallback'`、`attributed=false`）；两者都无 → `undefined`。
- **校正**：校验前调 `applyRequirementWorkspaceRoot(deps, record)`，使 `deps.docs` 的根指向**这条需求的**根。
  这是既有 27 个调用点共用的纪律（`SubmitArchive` 此前缺这一步）。
- **判定**：每个 `merged_into` 依次走 `assertArtifactOpenable(deps.docs, target)`（形态 + 越界 + 存在）
  + `deps.docs.stat(target).size > 0`（非空）。
- **拒绝消息**：必须含 `路径` + `生效根` + `判据来源（project-id / path-fallback）`——
  否则跨项目场景下"拒了但不知道在哪个根上找过"。

### 闸 2 · 说明书更新点（FR-2）`serves: FR-2`

- **形态**（shared，零 IO）：`manual_updates[].path` 必须是 `路径#锚点`；`#` 前部分落 `mergeTargets` 白名单；
  锚点非空；`section` 字段**废弃**（保留可选仅用于读侧兼容历史）。
- **事实**（application）：`#` 前路径存在且非空；锚点在目标文档的标题锚点集合里
  （复用 `src/domain/knowledge/slug.ts` 的 `listHeadingAnchors`）。
- **白名单不是第二份**：直接用 `ARCHIVE_DOC_RULES[category].mergeTargets`——与 `mergedInto` 同一份规则。

### 渲染物 · `archive.md`（FR-5 / FR-6）`serves: FR-5, FR-6`

- **纯渲染器** `renderArchiveManifest(input) → string`：输入是**已校验通过**的材料 + 目录实测读数
  （合并去向逐条存在性、机器产物分类、`queue.json` 摘要），输出是 Markdown 文本。
  纯函数 = 可单测、无 IO、无时间（时间戳由调用方注入）。
- **写盘在 use-case**：`deps.docs.write(<dir>/archive.md, text)`；内容相同 → 不写（幂等，mtime 不变）。
- **次序**：形态校验 → **渲染并写 `archive.md`** → 把 `archive.md` 并入 `docs` 清单 → 目录对账 →
  知识沉淀 → 写台账。渲染失败 = 整体拒绝、台账零写入（不制造半截状态）。
- **机器产物分区**：分类复用 `matchArchiveExemption`（`ARCHIVE_EXEMPTIONS` 是唯一豁免源），
  `queue.json` 摘要 = `任务数 / 依赖边数 / 就绪数 / 生成时间 / 字节数`；解析失败 → 只报体积 + 「无法解析」，**不抛错**。
- **不搬迁任何文件**（D-2）——`rtm-*` / `state/` 仍有既有读路径。

### 读数 · K13 / K14（FR-3 / FR-4）`serves: FR-3, FR-4`

- **K13 归档沉淀覆盖度**：`有归档材料的需求 − 有 req: 条目的需求`，判据 = **实测缺口 ⊆ 基线集合**
  （`docs/knowledge/archive-coverage.baseline.txt`，现行 6 条）。新增缺口 → 红；已补齐 → 提示刷新。
  刷新口：`npx tsx scripts/kb-probe.mts --refresh-coverage`（**不新增 package.json 脚本**，避免 K10 覆盖度连锁）。
- **K14 失效条件可判定**：逐条判「失效条件」小节是否含可判定锚点（反引号字面量 / 路径 /
  命令 / `kb-NNNN` supersede 目标 / 带锚点的文件指针）。不可判定集合 ⊆
  `docs/knowledge/unverifiable.baseline.txt`（现行 58 条）；新增不可判定 → 红。
- **降权（FR-4）**：`INDEX.md` 的条目行**按可判定性排序**（可判定在前，unverifiable 沉底），
  **不改索引行文法、不加字符**——理由见下「风险 R-2」（INDEX 现 8190 字符 > 8000 预算）。
- **根因同步修**：`DepositKnowledge` 生成**可判定**的失效条件（由 pointer / req id 派生），
  从源头不再生产模板话（否则新条目会不断进 K14 基线）。
- **台账不可达**（无 `~/.dsh/reqboard`）→ K13/K14 记「读数不可得、不判」并在输出写明原因，**不报绿**。

### 派生视图 · 归档条来源（FR-7）`serves: FR-7`

- **服务端派生**：`GET /`（`src/http/routers/stages.ts`）在既有 payload 上新增
  `origins: Record<reqId, { kind: 'local' | 'elsewhere' | 'unknown'; projectId?: string; projectName?: string }>`。
  判据 = `rootOfRequirement` + `sameProjectRoot`（`application/internal/project-root.ts`，既有单点）。
- **客户端呈现**：`renderArchivedBar` 增参数 `origins`；缺该字段（旧服务端）→ **不渲染标注**（逐字降级）。
- **红线**：客户端**不得**自己比较路径字符串（判据只在服务端一处）。

## 接线表（改哪里 / 明确不改哪里） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/shared/protocol.ts` | 改 | `assertArchiveMaterials` 增 `path#anchor` 形态与 `path` 白名单判定（保持零 IO） |
| `src/application/internal/archive-targets.ts` | **新建** | `assertArchiveTargetsOpenable`（存在 / 非空 / 锚点可达 / 根来源回执） |
| `src/application/use-cases/SubmitArchive.ts` | 改 | 根校正 → 三道闸 → 渲染 `archive.md` → 清单补登 → 对账 → 沉淀 → 写台账 |
| `src/domain/requirement/archive-manifest.ts` | **新建** | `renderArchiveManifest` 纯渲染器 |
| `src/application/use-cases/DepositKnowledge.ts` | 改 | 失效条件改由 pointer / req 派生（可判定），不再写死模板句 |
| `src/domain/knowledge/invalidation.ts` | **新建** | `isDecidableInvalidation(text)` 纯判定（domain，零 IO） |
| `src/domain/knowledge/operations.ts` | 改 | `EXCLUDED` 增 `archive-ledger-audit.mts`（专项只读核对，非每次必跑） |
| `src/adapters/KnowledgeRepository.ts` | 改 | INDEX 条目行按可判定性排序（降权，零字符增量） |
| `scripts/kb-probe.mts` | 改 | K13 / K14 两项 + `--refresh-coverage` / `--refresh-unverifiable` |
| `docs/knowledge/archive-coverage.baseline.txt` | **新建** | K13 基线（6 条） |
| `docs/knowledge/unverifiable.baseline.txt` | **新建** | K14 基线（58 条） |
| `scripts/archive-ledger-audit.mts` | **新建** | FR-8 只读核对（按每条需求自己的 `workspaceRoot` 解析） |
| `src/http/routers/stages.ts` | 改 | `/state` 派生 `origins` |
| `src/client/views/board.ts` | 改 | `renderArchivedBar` 三态渲染 |
| `src/client/styles/base.ts` | 改 | 三态选择器（仅既有令牌，新增选择器 ≤4 条） |
| `src/client/types.ts` | 改 | `BoardState.origins` 类型（可选字段） |
| `src/client/board-mount.ts` | 改 | 1 处：把 `state.origins` 下传给归档条渲染（不新增事件类型） |
| `src/client/views/stage-detail.ts` | 改 | 1 处**可选**入参：详情视图渲染「在别处」提示块（缺省产物逐字节不变） |
| `src/client/views/report-tabs.ts` | 改 | 1 处**可选**入参：新壳 head 段渲染同一提示块（缺省逐字节不变） |
| **不改** | — | `ARCHIVE_DOC_RULES` 的白名单内容、`assertArtifactOpenable` 的判定顺序、豁免规则表、验收标准/原型门/测试基线 |

## 根解析（唯一取数处，跨项目判据不许自造） `serves: FR-1, FR-7, FR-8`

```
record.projectId ──有且项目表在位──▶ 项目条目 path   → by=project-id, attributed=true
        │ 否则
record.workspaceRoot ──非空──▶ 归一化后的根         → by=path-fallback, attributed=false
        │ 否则
     undefined ──▶ 调用方按当前工作区兜底，并标注「归属未知」（不得冒充本仓）
```

三条纪律：① 缺失不猜；② 判据来源必须向外说（回执 / 拒绝消息 / 看板标注）；
③ **禁止**新增 `startsWith` / 字符串相等形态的项目判定（D-4）。

## 落地顺序（各自可验证、可回滚） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| 批 | 内容 | 怎么单独验证 | 回滚 |
|---|---|---|---|
| A | 闸 1 + 闸 2（合并在去向 / 说明书锚点 / 白名单） | 两条反向演练：假路径被拒并点名；假锚点被拒且原因区分 | 恢复前缀判定即回到旧行为（新提交面，无数据迁移） |
| B | `archive.md` 渲染 + 机器产物分区 + `queue.json` 摘要 | 一次归档提交后看 `archive.md`；重复提交 mtime 不变；原文件计数不变 | 停渲染即回旧行为（渲染物可删） |
| C | K13 / K14 + 基线与降权排序 | 删 K13 分支 → 对应用例红；构造两条条目验 K14；`pnpm kb:check` 与改动前**失败集合**比对 | 删两项检查 + 删两份基线（纯增量） |
| D | `origins` 派发 + 三态渲染 + FR-8 只读报告 | 三态渲染用例；对真台账跑一次只读核对并落报告 | 客户端缺字段逐字降级；脚本只读无副作用 |

批 A 与 B 同属归档写路径（同一份文件），必须同批落地；C / D 相互独立，可与 A/B 并行。

## 不做的架构改造 `serves: FR-1, FR-6, FR-7`

- **不给归档加人工门**：本次是把机械判据修可信，不是加人工程序。
- **不搬迁机器产物**：见 D-2；`machine/` 目录方案仅作呈现层分区。
- **不做跨项目读文件**：`origins` 只回答「在不在本仓 / 在哪个项目」，不去读别的项目工作区。
- **不重构 `RequirementRecord`/`RequirementSummary` 类型分层**（B12 收尾项属另一条线）——
  本次只在既有可选字段上追加 `origins`。

## 风险与对策 `serves: FR-1, FR-3, FR-4, FR-5`

| # | 风险 | 对策 |
|---|---|---|
| R-1 | **跨项目需求被本仓判据误拦**：`deps.docs` 是宿主级单例，根会被别的窗口改掉 | 每次提交前按该需求自己的记录校正根；拒绝消息带生效根；用例断言"另一个项目的目录零访问" |
| R-2 | **INDEX 已超预算**（实测 8190 > 8000）：FR-4 若给索引加字符会加重 K1 红 | 降权只做**节内排序**，零字符增量；基线计数写进 `kb-probe` 输出与条目页，不写进 INDEX |
| R-3 | 存量 22 条漂移锚点 / 6 条零沉淀 / 58 条模板失效条件被误当"本次必须修" | 三道闸只作用于**新提交**；存量一律只读报告（FR-8），基线集合差保证不产生新红 |
| R-4 | `archive.md` 渲染失败留下半截状态 | 渲染在写台账**之前**；写失败即整体拒绝；用例覆盖只读目录场景 |
| R-5 | `manualUpdates.section` 形态变更破坏读侧 | 读侧对旧形态**逐字保留渲染**（`path（旧：section）`）；用例钉住旧数据可渲染 |
| R-6 | 降权排序改变 INDEX 生成物 → `kb-build --check` 漂移 | 属预期：按 C-13 跑 `pnpm kb:build` 重生成后再比对；漂移本身就是要暴露的信号 |
| R-7 | K13/K14 在无台账环境（CI/别的机器）红 | 台账不可达 = **读数不可得、不判**，输出写明原因；不把"读不到"当"没做" |
| R-8 | 新增 `scripts/*.mts` 触发 K10 未归类红 | 在 `EXCLUDED` 登记脚本（必填理由），不新增规范条目（避免 INDEX 加字符） |

## 变更记（相对需求文档的更正） `serves: FR-3, FR-8`

1. **K13 编号（已在需求文档 D-1 记录）**：底稿要求"加 K12"，但 K12 已被
   `REQ-261006123819-3af3` 占用（页面小节 ↔ 索引行完整性）。本条落 K13，既有 K12 一字不改。
2. **「6 条章节漂移」不可复现（更正 D-5 的依据）**：本窗两种口径实测为 **22 条**
   （任意级标题归一化精确匹配）与 **14 条**（`section` 形如章节引用）。设计以
   **22 / 14 双读数**为准，底稿的 6 不作为基线。
3. **降权形态定案**：需求文档 FR-4 只写"标 `unverifiable` 并从 INDEX 降权"，未定形态。
   设计定案 = **节内排序降权 + K14 读数**，理由见 R-2（INDEX 已超预算，加字符会制造新红）。
4. **`archive.md` 的文档 kind 定案**：进归档 `docs` 清单用 `notes`（`ArchiveDoc.kind` 值域内既有值），
   不新增 kind，避免扩大 `ALL_ARTIFACT_KINDS` 的契约面。
5. **FR-6 的机器产物分类来源**：复用 `ARCHIVE_EXEMPTIONS`（不新写一份分类规则）——
   两套分类必然漂移（本仓既有教训）。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

| # | 决策 | 取舍 |
|---|---|---|
| A-1 | 形态判定留 `shared`，事实判定进 `application` | 保 `shared` 零 IO（分层门禁要求），代价是同一份材料要过两处 |
| A-2 | K13/K14 用**基线集合差**而非绝对数 | 不阻断存量、又能拦住新增；代价是多两份基线文件要维护 |
| A-3 | 降权只排序不加标记 | 不加字符（INDEX 已超预算）；代价是"降权"在索引里不如标签显眼，靠 K14 读数补 |
| A-4 | `origins` 走服务端派生 | 客户端零判断逻辑、判据单点；代价是 payload 多一个字段 |
| A-5 | FR-8 报告脚本进 `EXCLUDED` | 不触发 K10 覆盖度连锁；代价是它不进规范页（按需运行本就是它的定位） |

## 技术方案与亮点 `serves: FR-1, FR-3, FR-4, FR-8`

- **同一判据三处复用**：`rootOfRequirement`（取根）、`listHeadingAnchors`（锚点）、
  `matchArchiveExemption`（机器产物分类）——本次**不新写**任何一份对应实现。
- **反向演练可脚本化**：闸 1 / 闸 2 / K13 各自都有"拿掉修复即变红"的入口
  （`scripts/reverse-drill-matrix.mts` 的既有语汇），验收不靠人肉点。
- **存量与增量分离**：新提交收紧、存量只读报告——这是"不追溯改写历史台账"红线在架构上的落实方式。
