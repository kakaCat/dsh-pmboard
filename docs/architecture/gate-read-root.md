# 读盘闸门的根解析（L2 领域篇）

> **TL;DR**：**读文档的闸门必须按「被核验需求所属项目的根」读盘**——**项目身份优先、路径兜底**
> （2026-10-05 起：记录带 `projectId` 就用项目条目上的 `path`，缺身份才回落记录自带的 `workspaceRoot`，
> 见下文「根从哪来」新节）。
> `deps.docs` / `deps.queueRepo` 是**宿主级、跨窗口共享**的单例，根会被别的窗口（另一个会话工作区）改掉；
> 若读盘前不按需求根再校正一次，同一条需求的两类操作就不同根——后果是**两个相反方向**的坏结果：
> 完整性门**误拦**（报「文件不存在」，需求卡死、只能人工绕过），其余读类门**静默放行**（漏放、零告警）。
> 修法只有一个：读盘前调用唯一收敛入口 `applyRequirementWorkspaceRoot(deps, req)`
> （内部统一从 `rootOfRequirement(deps, record)` 取根，见下节）。

## 为什么需要它（根因备忘）

```
   用例入口 agentIdFromExec
        │  syncWorkspaceRootFromExec(exec)        ← 会话 cwd = A
        ▼
   deps.docs.root = A            deps.queueRepo.root = A
        │
        ├── 写侧：SubmitArtifact / SubmitDesignArtifacts
        │        syncWorkspaceRootForRequirement(req)   ← 需求 workspaceRoot = B  ✔ 早已正确
        │
        └── 读侧：两个读盘闸门共 7 处调用点
                 必须 rd 前先 applyRequirementWorkspaceRoot(deps, req)  ✘ 曾经漏掉
```

**事故形态（两次真实发生）**：

| 时点 | 现象 | 证据 |
|---|---|---|
| 2026-09-30 18:4x（REQ-260930183951-eb6c） | 设计确认落章成功，自动推进被拦，报「requirement.md 不存在」——文件在盘上且 5 份设计产物章齐全，最后靠人工 `reqboard_move` 绕过 | 台账状态评论原文 |
| 2026-09-30 19:45（REQ-260930193929-897b **自身**） | 同一文案；该需求 `workspaceRoot` 与会话 cwd **相同**，仍复现 → 触发条件不是「跨工作区立项」，而是「单例根被别的窗口改过」 | 磁盘实测 requirement.md 13283 bytes 在盘上 |

## 契约：唯一收敛入口

| 项 | 内容 |
|---|---|
| 入口 | `applyRequirementWorkspaceRoot(deps, requirement)`（`src/application/internal/support.ts`） |
| 语义 | 取根走唯一取数处 `rootOfRequirement(deps, record)`：**有 `projectId` → 项目条目 `path`**；否则回落 `record.workspaceRoot`；两者都没有 → **no-op**（调用方按自己的兜底根写并标注）。取到就同时校正 `docs` 与 `queueRepo` 的根（两者必须同根） |
| 依赖面 | 结构化最小面 `WorkspaceRootTargets`（`docs` + `taskStore?: unknown`）——看板路由的 `ctx.deps` 只有 `docs`，不为一次鸭子探测伪造整个 `UseCaseDeps` |
| 容错 | 不抛错：`setWorkspaceRoot` 缺失（内存替身）由既有鸭子探测跳过 |
| 写侧 | `syncWorkspaceRootForRequirement` 委托同一实现——**读写只有一处校正逻辑** |
| 适用面（2026-10-08 起） | **RTM 门也吃 `deps.docs`**：三份同构门合并为 `application/gate/rtm-gates.ts` 后，`designGateCheck` / `taskCoverageGateCheck` / `acceptanceGateCheck` 由「传 `workspaceRoot` 字符串」改为「传 `DocRepository`」，故它们**同样受本页纪律约束**——调用前必须先 `applyRequirementWorkspaceRoot(deps, req)`（REQ-261008020617-088f RF-2） |

**必须接线的 7 处读盘调用点**（少一处即为旁路，静态断言会红）：

| 闸门 | 调用点 |
|---|---|
| G2 完整性门 | `AskConfirm.ts` 早返回 · `confirm-settle.ts` 自动推进 · `ConfirmArtifact.ts` · 看板 `g2CompletenessFailure` |
| 拆分内容硬门 | `confirm-settle.ts` 落章前扫描 · `ConfirmArtifact.ts` · 看板确认前扫描 |

## 根错时各类门禁的行为（**方向不一致**是这条备忘的重点）

| 门禁 | 根错误时 | 性质 |
|---|---|---|
| G2 完整性门 | 报「requirement.md 不存在」 | **误拦**（fail-closed，需求卡死） |
| 拆分内容硬门 | `list(design/)` 读到空数组 → 扫描不到任何文档 | **静默放行**（fail-open） |
| FR 覆盖门 | 读不到 `requirement.md` → 提前 `return undefined` | **静默放行**（fail-open） |
| 需求文档格式门 | 同上 | **静默放行**（fail-open） |

⇒ **一处根因，三个门禁会静默失效**。「失效」比「误拦」危险：误拦会喊，静默放行不会。

## 回归门（改这里前后都要跑）

```
npx vitest run tests/design-gate-workspace-root.test.ts                 # 13 例：正反双向 + 存量 + 防旁路
npx vitest run tests/design-gate-workspace-root.test.ts -t "E2E"        # 2 例：真实 HTTP → 仓储 → 状态机，断言可观察终态
npx tsc --noEmit -p tsconfig.json                                       # 改动文件零新增错误
```

**判别力自证（重要）**：停用任一接线点，对应用例必须变红——否则用例是空过的。
实测：停用 `confirm-settle` 的校正 → 拆分内容硬门用例复现 fail-open；停用 `ConfirmArtifact` 的校正 →
静态断言精确点名「读盘前缺少根校正」。**该静态断言必须排除注释行**，否则「把调用注释掉」也能通过（实测踩过）。

## 变更须知（改这些地方会连带破坏什么）

- **新增任何读盘类闸门** → 必须先在读盘前调用收敛入口，并把调用点登记进上表；防旁路静态断言会拦漏。
- **用无根替身写这条链路的测试** → `tests/application/harness.ts` 的 `FakeDocs` **没有根概念、也没有 `setWorkspaceRoot`**，
  根校正会被鸭子探测静默跳过 → 断言**空过**（测试全绿但什么都没验证）。必须用「可换根」的读取器（真实 `FileDocRepository` 指向临时目录）。
- **为省事去掉反向用例** → 只验正向时，「把 `exists` 短路成 true」的假修复也能绿；反向用例是唯一防线。
- **改 `requirement.md` 的测试策略表** → E2E 覆盖读数（`e2eCoverageOf`）只认那一张表；但该文档已确认，
  平台**禁止在 implementing 阶段重交**（`REQBOARD_BAD_STATUS`，回退 brainstorming 会作废既有确认）——
  所以「补 E2E」要在 brainstorming 阶段就把行写进去，事后只能靠验收项写明理由。

## 写入侧的收口（REQ-261001203710-0fbf，2026-10-04）

> ⚠️ **本节结论已于 2026-10-05 被推翻**（REQ-261005123641-3982）：写侧现在是「**先按记录声明的根校正、再核验**」。
> 本节保留为历史决策与教训记录（含那次 51 个目录的污染事故），**现行口径见下面「写入侧的根解析（现行）」**。

上面那条「写入侧未校正」**已收口**，做法与读侧刻意不同——**只核验，不代为校正**：

| 问题 | 收口方式 |
|---|---|
| 写盘前根不对 | `ensureWritableProjectRoot(deps, record)` 核验「即将写入的根 = 记录声明的根」，不一致即抛 `REQBOARD_PROJECT_ROOT_MISMATCH`（**同时给两个绝对路径**），绝不静默写别处 |
| 判定散落在各调用点 | 下沉到「知道需求是谁」的共享写入器：文档侧 8 个（plan-landing / rtm-yaml / ReportTask / AmendTaskAcceptance / AdvanceChain / verification-doc-writer / SubmitVerification / SyncRequirementMarks）；队列侧 2 个收口包装 `mutateQueue` / `createManyQueue`（12 处队列写点已迁入） |
| 改造后再漏 | 静态门禁：`tests/project-scope.test.ts` 的「写盘覆盖」扫出所有工作区相对写盘点，名单外的新裸写**直接变红并点名 `文件:行`**（白名单与待偿清单都不许腐烂） |
| 记录的项目根本身是错的 | `capture` / `create` 的工作区回落由 `process.cwd()` 改为**优先取实际在用的工作区**——否则记录一出生就归属错项目，下游「按记录自己的项目写」必然写错 |

**为什么不代为校正（本需求踩过的坑，别再犯）**：第一版实现成「先按记录声明的根校正、再核验」，一次测试就把文件**重定向写进真实仓库**（51 个污染目录，已清理）。结论：读侧可校正（最坏读空、可重试），**写侧只许拒绝**——拿一个可能算错的声明去搬动写入，只会把错误放大。

## 写入侧的根解析（现行 · REQ-261005123641-3982，2026-10-05）

> **TL;DR**：**写入的根由「这条需求记录自己声明的 `workspaceRoot`」决定**（按需求 id 定位记录）。
> 进程内的共享根只是**缓存**——写前把它校正到声明根，校正失效才拒绝。
> 任何判定都**不得读共享根的当前值**：它记的是「最后一个调用的窗口」，不是「本次调用属于哪条需求」。

### 为什么改（与读侧同因，后果不同）

| 时点 | 现象 | 证据 |
|---|---|---|
| 2026-10-05 12:29:15（REQ-261005122915-9f90 立项） | 立项弹框停留 34 秒期间，另一窗口（工作区 `dsh-notice-webhook`）的 `reqboard_status` 把共享根改走 → 守卫读到「实际会写的根 = 别人的项目」→ 抛 `PROJECT_ROOT_MISMATCH`；**而记录已建、状态已推进到 brainstorming**（回执却是一句 Error） | 会话 tool 回执 @1791174555337；台账 `history.jsonl` 的 `draft`/`brainstorming` @1791174555304/.326 |
| 2026-10-05 12:31:35（REQ-261005122347-e07a 批准计划） | 同一误判落在「批准即落库」：计划已批准，任务卡**一张没落** | 批准回执 @1791174695611 |

根因一句话：**旧判定把「共享单例的当前值」当成了「本次要写入的根」**——读侧早已按记录校正，写侧只核验，
于是「缓存过期」被判成「错配」。多窗口并行（本项目常态）下必现。

### 现行契约

| 项 | 内容 |
|---|---|
| 唯一权威 | `RequirementRecord.workspaceRoot`（**按 REQ id 取记录**）；共享单例根**只作缓存**，不参与判定 |
| 入口 | `ensureWritableProjectRoot(deps, record, caller?)` 与 `assertWritableRequirementProject(deps, reqId, caller?)`——同口径、同一实现（`src/application/internal/support.ts`） |
| 写前动作 | `applyWorkspaceRoot(deps, declared)`：把 `docs` 与 `queueRepo` 的根校正到声明根（与读侧同一实现，读写只有一处校正） |
| 拒绝条件 | ① 声明根**绝对但不可用**（不存在 / 不可读）→ `REQBOARD_INVALID_WORKSPACE`（写侧**不降级**到调用方 cwd）；② 校正后仍不一致（校正失效，如端口没有 `setWorkspaceRoot`）→ `REQBOARD_PROJECT_ROOT_MISMATCH`（最后防线，给两个绝对路径） |
| 不判的情况 | 记录未声明根（存量）→ 回落 `caller.callerRoot` 并**标注**；无探针 / 读不回 / **相对写法**（变更记①：2026-10-05 裁决「宽容」）→ 不判（不谎报也不误拒） |
| 守卫时机 | 立项两条路径（`capture` / `create`）的守卫在**建档之前**——拒绝即台账零写入（旧顺序会「记录已建、回执却说未立项」） |

### 变更须知（改这里会连带破坏什么）

- **别再回到「只核验」**：多窗口并行下它必现误拒；写前校正才是与读侧一致的口径。
- **别拿共享根做判定输入**：新写盘点要判归属，只能从记录（或 `callerRoot`）取根。
- **相对写法不判**是刻意保留的（内存仓储把根报成 `.` 是合法用法；相对根在生产路径不出现——
  `process.cwd()` / 会话 cwd 恒为绝对）。想收紧它要先想清楚内存/抽象仓储怎么活。
- **回归门**：`npx vitest run tests/project-root-concurrency.test.ts tests/project-scope.test.ts`
  （并发串味 / 声明根是权威 / 声明根不可用 / 校正失效最后防线 / t8 写盘点静态门禁）。

## 已知缺口（2026-10-04 更新）

| 缺口 | 现状 | 影响 |
|---|---|---|
| ~~写入侧未校正~~ | ✅ **已收口**（见上节） | — |
| **单例并发** | 共享根仍是全局可变，但**判定已不再依赖它**（REQ-261005123641-3982）：写前按记录校正 → 邻居窗口互踩不再导致误拒 | 写入落在各自记录声明的根下；仍有「两写真交错时后校正者获胜」的固有属性——架构级「每窗口一实例」未做 |
| 真机交叉演练 | 只验证到「宿主重启加载新产物后，看板可见任务数 0 → 73」 | 未构造「在 A 项目会话里对 B 项目需求发起落库」的完整演练 |

## 面板读路径：同一条根纪律的第三处（2026-10-05，REQ-261005143615-5ab1）

**症状**：用户在**归档后**打开需求详情，「文档」Tab 里 25 行登记文档**整列写「文件缺失」并划线**——
磁盘上一份不少（`REQ-261005123641-3982` 现场）。

**根因**：面板六查询的存在性判定用的是**阅读会话的工作区根**；会话解析不到就回落插件宿主目录
（`legacy-cwd`，实测 `~/.dsh/profiles/<profile>`，那里没有 `docs/requirements/`），
于是**每一条**登记文档都被判 `file-missing`。与本文上半篇（读盘闸门）、以及
[需求详情页「工作汇报」](requirement-detail-report.md)里那条「按会话解析读根」是**同一族问题的第三处**：
会话根只回答「谁在看」，回答不了「这条需求的东西在哪」。实测本仓 60 个会话里只有 5 个能被宿主解析出工作区。

```
读详情页（?session= 可能解析不到 / 干脆没带）
      │
      ▼
候选根按序（只留真实存在的根）
  ① 需求自己声明的 workspaceRoot   ← 唯一权威：这条需求的东西在哪
  ② 阅读会话的工作区（?session=）  ← 只是"谁在看"
  ③ 组合根 cwd                    ← 兜底
      │
      ├─ 任一命中 → state=confirmed|pending + absPath（命中哪个根就用哪个根算绝对路径）
      ├─ 候选非空、逐根都没找到 → file-missing（诚实缺失，仍划线）
      └─ 候选为空（一个可用根都没有）→ unknown「未判定」：不划线、不注入 absPath
```

| 项 | 内容 |
|---|---|
| 端口 | `PanelQueryDeps.docRootsOf?(req)`（候选根，调用方按序去重 + 只留存在的根）与 `docsAt?(root)`（按根建仓储） |
| 判定 | `QueryDocs` 逐条按序 `exists`，首个命中即定状态与 `absPath`；`generated` / 原型 INDEX / 未登记设计行同根 |
| 三态 | `unknown`（判不了）**不是** `file-missing`（登记过但文件不在）——把未知写成缺失又是一种谎 |
| 投影 | `absPath` **读时算、不落库**（存绝对路径会在换机器 / 换 worktree 后全失效，多窗口还会互相覆盖） |
| 兼容 | 两口**缺省即旧单根行为**（无 `unknown`、无 `absPath`）⇒ 回滚 = 不注入两口，台账零迁移 |
| 判据 | `npx tsx docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.mts`（真台账 + 真磁盘：file-missing 25→0、25/25 absPath 与磁盘 0 分歧、真丢文件的需求仍 37/37 缺失、无根时 25 全未判定）；`npx vitest run tests/query-docs-roots.test.ts tests/query-docs-compat.test.ts tests/docs-panel-states.test.ts` |

**三条可复用的**：
① **判存在性先问「这是谁的根」**——会话根/进程 cwd 只能回答「谁在看」，需求声明根才回答「东西在哪」；
② **「根不在」与「文件不在」必须分开说**——前者只能说「未判定」，把两者合并就是新一轮谎报；
③ **绝对路径做读时投影**——显示与打开都用它，但台账里仍存相对路径，否则可移植性立刻归零。

## 根从哪来：项目身份优先、路径兜底（2026-10-05，REQ-261005141830-7a3b）

> **TL;DR**：**「哪个项目」与「文件在哪」从此分工明确**——身份回答归属（`projectId`），路径只回答位置。
> 映射链是 **`session → projectId → workspaceRoot`**：会话只解析出 `projectId`，**根挂在项目上**
> （`projectId` 里带着 `workspaceRoot`）；需求记录只记 `projectId`。

**为什么改**（原症状）：判据此前是**路径字符串比较** + 「进程内共享根的当前值」。
多窗口多项目并行时，共享根被邻居窗口改走 → 需求与产物被算到**别的项目**；
而同一项目换一种路径写法（软链 / 尾斜杠 / 相对）又会被判成两个项目。实测本项目自己发生过两次
（2026-10-05 12:29 立项弹框停留 34 秒被邻居 `reqboard_status` 改走共享根；2026-09-30 读侧同因误拦）。

```
窗口 session-x ─┐
窗口 session-y ─┼─▶ projectId = w-1 ─▶ 项目 w-1（workspaceRoot = /…/dsh-pmboard）
                └─（N 个窗口 → 1 个项目：同项目多窗口是常态）
```

| 项 | 内容 |
|---|---|
| 项目身份来源 | 宿主 `workspaceRegistry`：`sessionIds` 含本会话的那条 → `id`（= `projectId`）、`path`（= 该项目的工作区根）、`sessionIds` |
| 取根优先级 | ① `record.projectId` 命中项目条目 → 用条目 `path`（`by='project-id'`，`attributed=true`）；② 否则回落 `record.workspaceRoot`（`by='path-fallback'`，**必须标注未归属**）；③ 都没有 → 结构化失败（**不猜、不回落宿主目录**） |
| 同一项目判据 | 单点 `sameProjectOf`：两侧都有 `projectId` → 比 id（根不参与比较）；任一侧缺 → 路径形状比较 + 标注未归属 |
| 归属 vs 投递 | **归属是项目级**（同项目任一窗口都算本项目，可读 / 可写 / 可扫）；**起轮 / 投递 / 席位仍是窗口级**（`windowKey`）——`projectId` **不得**当窗口用，否则同项目两窗口会重复起轮 |
| 跨项目拦截 | 派席 / 交接 / 改绑前用 `requireSameProject` 核对两侧：跨项目拒 `REQBOARD_CROSS_PROJECT_SEAT`（HTTP 400），文案给两个 `projectId`、各自根与**判据来源**；`remove=true`（解绑）不校验 |
| 未归属（存量） | 不迁移、不拒写：按路径兜底并在回执 / 评论 / 日志里标注「未归属」；看板把「本项目 + 未归属」一起列出（老记录不消失） |
| 降级 | 宿主没有 workspace 注册表（或条目缺 `path`）→ 一律路径兜底 + 标注，功能不中断；判据「拿不到」时**不拦也不放行得含糊** |

**变更须知**：

- **新增任何判定「是不是同一个项目」的地方** → 必须走单点（`sameProjectOf` / `requireSameProject` /
  `partitionByProject` 的 `callerProjectId`），不许再各写一套路径比较。
- **别把 `projectId` 当窗口键**：投递 / 起轮 / 席位只认 `windowKey`；混用会让同项目多窗口重复起轮
  （本仓有专门用例：把驱动器的取需求改成按项目找 → `E-03` 立刻变红）。
- **别让共享单例的当前值参与判定**：写侧按记录校正、读侧按记录校正，校正失效才拒
  （见下面「写入侧的根解析（现行）」）。
- **回归门**：`npx vitest run tests/project-identity.test.ts tests/project-identity.e2e.test.ts tests/project-scope.test.ts`
  （身份判据 / 三窗口 E2E / 跨项目分区与写盘点静态门禁）。

## 客户端侧的根来源诊断与红字徽章（2026-10-08，REQ-261007223647-da5d）

前面的小节讲的是**服务端读盘**按哪个根；这一节讲**客户端把相对文档路径拼成绝对地址**时用了哪个根、
以及"拿不准"怎么让人看见（现场：面板显示 `./dsh` 下的地址，文件其实在需求自己的工作区里）。

| 事实 | 内容 | 位置 |
|---|---|---|
| 三级根顺序（未变） | 需求级根（`reqRoots[reqId]`，读与写同根）→ 会话工作区 → 服务端下发 `workspaceRoot`；都没有 → **原样返回相对路径**（不拼一个必然不存在的绝对路径） | `src/client/open-doc.ts` |
| 来源四态 | `req-root` / `session-root` / `server-root` / `none`（`none` = 已是绝对路径，或无根可回落） | `DocRootSource` |
| 取值单点 | 解析逻辑收在 `absolutizeDocPathWithSource(path)`，返回「地址 + 来源」**同源得出**；`absolutizeDocPath` 是它的薄壳（签名与返回行为逐字兼容） | 同上 |
| 只读诊断 | `peekLastRootSource()`（不触发解析、不改缓存）；UI 优先用**视图自带**的来源读数，避免被别的解析污染 | 同上 |
| 面板红字 | 文档位置行在 `rootSource ≠ req-root` 时追加「⚠ 地址可能不准（根来源：X）」（`data-doc-root-source` 供断言），**打开行为不变** | `src/client/req-doc-location.ts` |

**判据**：`npx vitest run tests/open-doc-root-source.test.ts tests/doc-root-badge.test.ts tests/doc-location-panel.test.ts`
（四态取值 / 串会话缓存下需求级根命中**绝不退到会话根** / 视图来源优先 / 旧调用方逐字兼容 / 红字出现条件）。

**变更须知**：① 需求级根命中就是命中，不许"顺手"再回落一次会话根（反向验证：把顺序改成会话根优先 → 2 条用例立刻红）；
② 红字是**展示层增强**，不要顺手改成"拒绝打开"或"自动改写地址"——它的职责只是不静默；
③ 手搓视图（有 `abs`、无 `rootSource`）按"地址已由权威方拼好"处理，别给可信地址添噪音。

## 来源

- REQ-260930193929-897b（读盘闸门按需求级 `workspaceRoot` 二次校正；含本需求自身 19:45 的现场复现）
- **REQ-261001203710-0fbf（写入侧收口：唯一口径 + 写盘守卫「只核验不重定向」+ 判定下沉 + 静态覆盖门禁；由 20:21 现场事故立项——`queue.json` 与任务卡被写进另一个工作区）**
- **REQ-261005123641-3982（写侧判定口径重定：按需求 id 定位记录、写前校正、守卫前置；由 12:29 立项误拒与 12:31「批准了但没落库」两起现场立项；本节同时推翻上一条的「只核验」取舍）**
- **REQ-261005143615-5ab1（面板读路径第三处：详情页文档存在性判定按需求自身工作区 + `unknown` 三态 + `absPath` 读时投影；由「归档后整列文件缺失」现场立项）**
- **REQ-261005141830-7a3b（根从哪来：项目身份优先、路径兜底——映射链 `session → projectId → workspaceRoot`、
  同一项目判据单点、归属项目级 vs 起轮窗口级、跨项目派席/交接/改绑拦截；由 2026-10-05 12:29 立项误拒与
  2026-09-30 读侧误拦同因立项）**
- 前置事故与留痕：REQ-260930183951-eb6c；写侧先例：REQ-260929210741-30ae FR-6
- **REQ-261007223647-da5d（客户端侧根来源诊断与红字徽章：`absolutizeDocPathWithSource` 四态读数 +
  `peekLastRootSource` + 面板「地址可能不准（根来源：X）」；由 2026-10-07「面板地址落到 ./dsh、文件其实在文档位置」现场立项）**
- 物证：`docs/requirements/REQ-260930193929-897b/notes/evidence-misplaced-decomposition.md`；
  本条的现场对账：`docs/requirements/REQ-261005143615-5ab1/evidence/t5-reconcile.md`
