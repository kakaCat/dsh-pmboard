---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件 · 设计
status: design
serves: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8, RF-9, RF-10, RF-11, RF-12, RF-13, RF-14, RF-15, RF-16, RF-17, RF-18, RF-19, RF-20, RF-21, RF-22, RF-23, RF-24, RF-25, RF-26, RF-27, RF-28
---

# 架构设计（REQ-261009174713-7bc8）

> 本文的包边界不是照搬目录名，而是**实测 import 边之后**定的：全仓 `src/**/*.ts` 逐文件解析 import 说明符（剔除注释里的路径字样），
> 得到目录级真实边、反向边清单、以及 domain 层的零出度叶子集合。三类硬证据决定了本设计：
> ① 6 处反向边（dive / client-types / plugin-config / stage-overview / jobs 兜底 / vendor）；
> ② `shared/protocol.ts` 反向 import 17 个 domain 模块 ⇒ 公共包必须「拆两半」；
> ③ 19 个工具目录之间零互相引用（唯一耦合是 3 个共享文件）⇒ 按类别拆包天然干净。

## 目标与总体方案 `serves: RF-6, RF-19, RF-20, RF-21, RF-22`

```
              dsh-pmboard（仓库根 · 聚合插件 · 唯一出产物）
              src/index.ts · http/ · adapters/ · wiring/ · 类型与工具注册表聚合
                                     |
  +---------+---------+---------+---------+---------+---------+---------+
  |         |         |         |         |         |         |         |
  v         v         v         v         v         v         v         v
 common    rtm      core    tool-    round-   workflow  client   command
 公共抽象  reqboard 域+用例  pmboard  driver  引擎适配  页面      /pm 命令面
 零依赖    引擎     +仓储   19 工具  回合驱动  +契约    自包含    →core+ds-
 (0 dep)  (0 dep)           (单包)   →core     →core    铁律      h-commands
  ^         ^         ^        ^        ^        ^        ^         ^
  |         |         |        |        |        |        |         |
  +----+----+----+----+--------+--------+--------+---------+---------+
       |         |
       |         +-- 类型层（L0.5）：type-kit（契约+注册表）+ 六类型包——core 只经
       |              注册表消费；走 feature 逻辑只落 type-feature，bug 只落 type-bug
       +------------ 单向依赖：下层 ← 上层；禁反向、禁横向

   类型包七件：pmboard-type-kit · pmboard-type-{feature,bug,doc,refactor,spike,chore}
   资产/开发侧包（零代码依赖，按路径读取）：pmboard-templates(38) · pmboard-skills(146)
                                          · pmboard-eval-suite(118) · pmboard-scripts(70)
```

**分层（唯一权威的依赖白名单）**：

| 层 | 包 | 允许依赖 |
|---|---|---|
| L0 公共层 | `pmboard-common` · `reqboard-rtm` | 无（仅 node 内置/无） |
| L0.5 类型层 | `pmboard-type-kit` | common |
| L0.5 类型层 | `pmboard-type-{feature,bug,doc,refactor,spike,chore}` | type-kit · common |
| L1 核心层 | `pmboard-core` | common · rtm · type-kit（**只经注册表接口**，不依赖具体类型包） |
| L2 工具层 | `tool-pmboard`（单包：`src/{intake,decompose,verify,collab}/` + `src/kit/` + `src/registry.ts`） | common · core |
| L2 运行层 | `pmboard-round-driver` · `pmboard-workflow` · `pmboard-client` · `command-pmboard` | common · core（command 另加 `@deepseek-ai/dsh-commands`） |
| L3 资产层 | `pmboard-templates` · `pmboard-skills` · `pmboard-eval-suite` · `pmboard-scripts` | 零代码依赖（被按路径读取） |
| L4 组合层 | 聚合根包 `dsh-pmboard` | 全部子包（并把六个类型包注入注册表） |

**与 packages/goal 的逐项对位**：

| goal | pmboard | 说明 |
|---|---|---|
| `goal/`（域+服务） | `packages/pmboard-core/` | 状态机/规则/用例/端口/仓储 |
| `tool-goal/`（模型面工具） | `packages/tool-pmboard/`（单包，包内按用途分目录） | 19 个 `reqboard_*` 工具（D-5 起工具层不再分包） |
| `goal-round-driver/`（回合驱动） | `packages/pmboard-round-driver/` | 与 `REQ-261009125641-c424` 的 DriveEngine 升级落点对齐 |
| `command-goal/`（斜杠命令面） | `packages/command-pmboard/` | `/pm`：显示本窗口状态 + 创建立项（D-3） |
| （goal 无对应物） | `pmboard-common` · `reqboard-rtm` · `pmboard-type-*` · `pmboard-workflow` · 四个资产包 | pm 侧特有的抽象底座、vendored 引擎、**需求类型层**、技术 workflow 面与资产项目 |

**与 goal 的一处刻意差异（用户已裁定 D-2）**：goal 各子包独立 tsdown 出 `lib/+types`；本轮子包是**源码 workspace 包**，只有聚合根包出 `dist/index.mjs` 与 `lib/client.js`。

## 模块改动地图 `serves: RF-7, RF-8, RF-9, RF-10, RF-11, RF-12, RF-18, RF-19, RF-20, RF-21, RF-22`

### 落位表（文件数为实测值） `serves: RF-7, RF-8, RF-9, RF-10, RF-11, RF-12, RF-18, RF-19, RF-20, RF-21, RF-22`

| 目标位置 | 承接内容 | 文件数 | 迁移后包关系 |
|---|---|---|---|
| `packages/pmboard-common/src/` | `shared/` 纯件 4（artifact-labels / build-stamp / dual-field / error-code-registry）+ `protocol.ts` 的**纯帧半** + `domain/` 零出度叶子中「类型/常量/文本/路径」子集（实测 33 个零出度叶子，逐条核验）+ 原 `client/types.ts`(1) | ≈26（[2a] 步逐条定档） | L0，零依赖 |
| `packages/reqboard-rtm/` | `vendor/reqboard/`(28) 原样搬迁 | 28 | L0，零依赖；被 core 14 文件 + client 1 文件引用 |
| `packages/pmboard-core/src/` | 余下 `domain/`（规则与状态机）+ `application/`(扣 dive 驱动面 9) + `repositories/`(20) + `stage-overview/`(1) + `plugin-config.ts`(1) + `dive-core/`(3：round-state / applyDiveTransition / stage-configs) + `board-summary.ts` + `protocol.ts` 的**域关联半** | ≈97 | L1 → common · rtm |
| `packages/tool-pmboard/src/`（单包） | `src/kit/`（shared.ts · render-summaries.ts · registry 契约类型）+ `src/intake/`（CaptureTool · CreateTool · StatusTool · MoveTool · ClearPauseTool · SkillInstallTool · KnowledgeTool）+ `src/decompose/`（DecomposeTool · TaskRunTool · TaskTreeTool · TaskMoveTool · TaskAmendTool · TaskReportTool）+ `src/verify/`（SubmitTool · AcceptSheetTool · AskConfirmTool）+ `src/collab/`（OpenWindowTool · BindTool · HandoffTool）+ `src/registry.ts`（`TOOL_REGISTRY`，留在包内） | 58 | L2 → common · core |
| `packages/pmboard-round-driver/src/` | `application/dive/` 驱动面：round-driver · round-subscriptions · session-driver · wake-heartbeat · wake-liveness · wake-skip-trace · gate-prompt · idle-capture-actions · boundary-guard | 9 | L2 → common · core |
| `packages/pmboard-workflow/src/` | `WorkflowEngineRunner.ts`(156 行) · `WorkflowSchemaAdapter.ts`(100 行) · `ports.ts`（三个契约类型从 core 的 ports 拆出） | 3 | L2 → common · core（仅类型） |
| `packages/pmboard-workflow/scripts/` | `workflow-engine-smoke.ts` | 1 | → workflow 包 |
| `packages/pmboard-client/src/` | `src/client/` 扣 types.ts(1) | 130 | L2 → common · core（自包含铁律） |
| `packages/command-pmboard/src/` | **新增**：`index.ts`（注册+降级） · `parse.ts` · `command.ts` · `render.ts` | 4（新增） | L2 → common · core · dsh-commands |
| `packages/pmboard-templates/` | `templates/`(38) 原样搬迁 | 38 | L3，零代码依赖 |
| `packages/pmboard-skills/` | `skills/`(146) 原样搬迁 | 146 | L3，零代码依赖 |
| `packages/pmboard-eval-suite/` | `eval-suite/`(118) 原样搬迁 | 118 | L3，零代码依赖 |
| `packages/pmboard-scripts/` | `scripts/`(70) 原样搬迁 | 70 | L3，零代码依赖 |
| `packages/pmboard-type-kit/src/` | **新增**：`RequirementTypeSpec` 契约 + `createTypeRegistry()` + 通用校验（类型枚举 / 必填节并集 / 快照序列化） | 3（新增） | L0.5 → common |
| `packages/pmboard-type-{feature,bug,doc,refactor,spike,chore}/src/` | **新增**：每包一份该类型的 `spec`（必填节 delta · 必交/条件设计文档 · 条件阶段产物 · 模板引用路径 · 归档去向与说明书要求 · 提示词片段 · 中文标签）+ 本校验纯函数 | 各 ≈3（新增） | L0.5 → type-kit · common |
| 仓库根 `src/`（聚合根包） | `index.ts` · `gate-wiring.ts` · `http/`(17) · `adapters/`(35，扣两个 workflow 适配器) · `wiring/`(3) · **`type-registry.ts`（注入六个类型包，唯一聚合点）** | ≈59 | L4 → 全部子包 |

### 为什么 dive 要**劈成两半**（关键结论） `serves: RF-9`

实测：从 core 侧真实 import `application/dive/` 的有 6 处，全部落在三个文件上：

| core 侧调用方 | 引用的 dive 文件 |
|---|---|
| `application/internal/confirm-advance-finish.ts` · `use-cases/AskConfirm.ts` | `dive/applyDiveTransition.js` |
| `application/internal/rearm.ts` | `applyDiveTransition.js` · `round-state.js` |
| `application/internal/support.ts` · `task-comment.ts` | `round-state.js` |
| `application/settings/resolve-settings.ts` | `stage-configs.js` |

dive 自身反向 import core 达 20+ 处（`internal/` 14、`use-cases/`、`ports`、`domain/`、`shared/`）。
⇒ 整目录搬进 `pmboard-round-driver` 会让 core ⇄ round-driver **包级成环**。

**解法（依赖倒置的最小形式）**：被 core 依赖的三个**纯态/纯配置**模块留在 core（`application/dive-core/`），驱动编排 9 文件进 round-driver 包。core 只认「态」，不认「driver」。

```
改前：application/dive/{12 文件}  ← core 6 处引用   →  core 20+ 处引用  （同包，环不可见）
改后：core: dive-core/{round-state, applyDiveTransition, stage-configs}
      pmboard-round-driver: {9 个驱动文件}  ──单向──→  core        （包级无环）
```

### 其余 5 处反向边（必须随迁移一起反转） `serves: RF-7, RF-9, RF-11, RF-12, RF-19`

| # | 反向边 | 数量 | 处理 | 类型 |
|---|---|---|---|---|
| 1 | `application/*` · `repositories/*` → `client/types.js` | 3 + 2 | `client/types.ts`(478 行纯类型) 下沉**公共包**（`pmboard-common`），client 与 core 双向引用收敛为单向 | 文件搬迁 |
| 2 | `application/use-cases/QueryRunStatus.ts` → `adapters/DshJobsAdapter.ts` | 1 | 该文件已支持调用方注入 `dshJobsAdapter`；「缺省 new」兜底从 core 移除，改由装配侧（根包）经 ctx 注入 resolver | 小幅改代码 |
| 3 | `application/use-cases/{AskConfirm,SubmitArtifact}.ts` → `plugin-config` | 2 | `plugin-config.ts` 只依赖 `node:os/path` + `domain/limits` + `domain/task/StageRouting`，整体迁 core | 文件搬迁 |
| 4 | `application/query/{QueryStageDetail,QueryVerify}.ts` → `stage-overview/assembler.js` | 2 | `stage-overview/`(1) 迁 core | 文件搬迁 |
| 5 | `client/stage-panel.ts` → `application/internal/category-doc-sets.js`；`client/views/panels/verify.ts` → `vendor/...` | 1 + 1 | client → core / client → rtm 方向合法，保留；`category-doc-sets` 下沉 `common` 列为遗留问题 L2 | 不变 |

另：`domain ↔ shared` 的双向依赖（domain→shared 6 处、shared→domain 25 处）**在本轮由公共包拆半收敛为单向**（见下节），这是 RF-19 的核心工作。

### workflow 包为什么偏薄 `serves: RF-10`

实测 `domain/workflow/`(15 文件) 被 **28 个 core 内部文件**引用；且它自身 import 其它 domain 模块（`../text/fmt`、`../task/*`、`../status/Predicates`、`../errors`、`../actor`）。
若整搬进 `pmboard-workflow` ⇒ core → workflow 与 workflow → core **成环**。
⇒ 本轮：**引擎面进包**（Runner + SchemaAdapter + 端口契约 + 烟测脚本），**规则面留 core**（`domain/workflow/` 原地不动）。
`WorkflowRunner/WorkflowStartInput/WorkflowRunOutcome` 从 core 的 `application/ports.ts` 拆到 `pmboard-workflow/src/ports.ts`，core 侧改为 re-export——workflow 包对 core 只剩「可选的类型引用」，V1.1 独立构建零改动。

## 公共包边界与 protocol 拆半 `serves: RF-19`

**实测依据**：

| 证据 | 数据 | 结论 |
|---|---|---|
| `shared/` 6 文件的出度 | `artifact-labels` / `build-stamp` / `dual-field` / `error-code-registry` = **0**；`board-summary` → 2 个 domain；`protocol` → **17 个 domain** | 前 4 个可直接进公共包；后 2 个必须拆半 |
| domain 层零出度叶子 | **33 个**（`actor` · `errors` · `limits` · `write-set` · `job-spec` · `artifact/ArtifactPath|GateReadings` · `knowledge/*`(4) · `prototype/ParityContracts` · `queue/queuePath|transitiveReduction` · `requirement/{ColdWrite,DocLocation,ReqboardPaths,Requirement,archive-exemptions}` · `stage/StagePromptSpec` · `status/ArchivedMoment` · `task/{RequirementRefs,ReworkPlaceholder}` · `template/types` · `text/{labels,pm-badge}` · `workflow/*`(6) · `prompt/generated/fragments` · `prompt/worktree-events`） | 公共包的候选池；**逐条核验「是否含业务规则」**后定档 |

**拆半规则（`protocol.ts` / `board-summary.ts`）**：

```
protocol.ts（现 1 文件，反向引 17 个 domain 模块）
   ├─ 纯帧/纯视图类型（IPC 帧、SSE 事件、视图 DTO 结构）      → pmboard-common/protocol.ts
   └─ 域关联视图（引用 RequirementStatus / TaskStatus / ArtifactSpec / …）→ pmboard-core/protocol-domain.ts
```

- 判据：`pmboard-common` 零 workspace 依赖；common 内**不得出现任何**指向 core/其它子包的 import（含 type-only，避免把环藏在类型层）；`pnpm typecheck` 全绿。
- 反例（禁止手法）：在 common 里 `export type { X } from 'pmboard-core'` 兜底——这等于把环留在类型层，门禁按「import 说明符来源」判定，会被拒。

## 工具层单包 `serves: RF-20`

**实测依据**：`grep` 跨工具目录 import 结果为空——19 个工具目录互不引用；唯一耦合是 3 个共享文件（全仓 30 处引用）。且全部工具只依赖 common + core ⇒ **分包零隔离收益、只增跨包 import 噪声**（用户 D-5 质疑「工具层需要怎么多包吗」，故收敛为单包）。

| 包内目录 | 工具 | 文件数 |
|---|---|---|
| `src/intake/` | CaptureTool · CreateTool · StatusTool · MoveTool · ClearPauseTool · SkillInstallTool · KnowledgeTool | 20 |
| `src/decompose/` | DecomposeTool · TaskRunTool · TaskTreeTool · TaskMoveTool · TaskAmendTool · TaskReportTool | 17 |
| `src/verify/` | SubmitTool · AcceptSheetTool · AskConfirmTool | 9 |
| `src/collab/` | OpenWindowTool · BindTool · HandoffTool | 8 |
| `src/kit/` | `shared.ts` · `render-summaries.ts` · registry 契约类型 | 3 |
| `src/registry.ts` | 聚合四目录 → `TOOL_REGISTRY`（**留在工具包内**，根包只消费） | 1 |

- 分类法：按**流水线用途**（立项 / 拆分 / 验收 / 协作），与看板泳道、需求阶段语义同构——分类保留在**包内目录**。
- 契约：`TOOL_REGISTRY` 聚合结果与迁移前逐字一致（19 名 + schema 摘要哈希）；包整体只允许依赖 common + core。
- 禁止：目录之间横向 import（除 `kit/`）；工具包 import 根包（门禁拒绝）。

## 类型层设计 `serves: RF-25, RF-26, RF-27, RF-28`

**这一层是 D-5 新加的维度**：前四层按「职责」切，这一层按「需求类型」切——feature / bug / doc / refactor / spike / chore 各自的规格与校验各归一包。

```
   聚合根包（composition root）
        |  注入六个 spec
        v
  pmboard-type-kit  ←── RequirementTypeSpec 契约 + createTypeRegistry() + 通用校验
        ^  ^  ^  ^  ^  ^
        |  |  |  |  |  +-- type-chore     每个类型包导出：spec（声明式数据）+ 本校验纯函数
        |  |  |  |  +----- type-spike
        |  |  |  +-------- type-refactor
        |  |  +----------- type-doc
        |  +-------------- type-bug
        +----------------- type-feature

  pmboard-core：只 import type-kit 的**接口**（注册表按 category 查询），不 import 任何具体类型包
```

**六个类型包的规格内容（全部有现网出处，逐项点名，非新造）**：

| 规格项 | 现网出处 | feature | bug | doc | refactor | spike | chore |
|---|---|---|---|---|---|---|---|
| 必填节 delta | `category-doc-sets.ts` CATEGORY_DELTAS | 产品定义/用户与角色/功能点 | 复现步骤/根因/回归 | 目标读者/大纲 | 现状/目标结构/行为不变式 | 待答问题/结论 | 完成判据 |
| 必交设计文档 | 同上 | architecture·data-model·interfaces·test-cases·use-cases | — | — | architecture·migration | — | — |
| 条件设计文档（sides） | 同上 | frontend·backend | — | — | — | — | — |
| 条件阶段产物 | 同上 | prototype（sides 含 frontend） | — | — | prototype（同左） | — | — |
| 模板引用 | `domain/template/registry.ts` | brainstorming/feature.md + prototype.html | brainstorming/bug.md | brainstorming/doc.md | brainstorming/refactor.md + prototype.html | brainstorming/spike.md | brainstorming/chore.md |
| 归档去向 + 说明书要求 | `ARCHIVE_DOC_RULES`（ArtifactSpec） | architecture/guides + 必填 manual_updates | known-issues 系 + manual_note | docs 系 + manual_note | architecture/work-logs + manual_updates | research 系 + manual_updates | work-logs 系 + manual_note |
| 提示词片段 | `domain/prompt/generated/fragments.ts`（生成物） | 18 条 | 18 条 | 18 条 | 18 条 | 18 条 | 18 条 |
| 中文标签/描述 | `CATEGORY_ZH`（立项弹框选项文案） | 功能 | 缺陷 | 文档 | 重构 | 调研 | 维护 |

> 通用片段（category: "*"，**21 条**）不是任何类型的私产 ⇒ 留 core。类型包只装「该类型独有」的规格。

**实测现状（为什么值得单独成层）**：16 个文件含六类型字面量（`shared/protocol` · `application/internal/{category-doc-sets,plan-granularity,decision-gates,capture-mapping,content-gate-wiring}` · `use-cases/{SubmitVerification,SubmitArchive}` · `query/QueryReport` · `domain/{template/*,requirement/Requirement,prompt/*,artifact/ArtifactSpec}` · `client/*`），另有 22 个 `application/internal` 文件含 `category` 判据——**类型逻辑是目前最分散的一维**。

**边界与例外**：

- 类型包只装**声明式规格 + 纯校验**：不碰 I/O、不读盘、不渲染；模板资产留 `pmboard-templates`，类型包只声明路径（RF-28），装配期校验引用存在。
- 例外明确保留：① `ALL_REQ_CATEGORIES`（类型枚举与名称合法性）留 `pmboard-common`——它是类型系统的底层常量，不属于任何单一类型；② client 的类型标签渲染按注册表下发，不硬编码。
- 缺项失败面：注册表缺六类之一 → **响亮报错并给出缺失类型名**，不回落「按 feature 兜底」。

**提示词片段的切分（RF-27）**：现状是 `src/domain/prompt/fragments/<stage>/heavy.md` 经 `scripts/inline-prompt-fragments.mjs` 内联成 `generated/fragments.ts`（**运行时不读盘**）。改造后生成链**按类型输出**（六类型包各一份片段表 + core 留通用 21 条），core 组装 = 通用 + 注册表下发的类型片段；`prompts:check` 增加「按类型条数对数」。

## 资产包化与运行期解析 `serves: RF-22, RF-23`

```
                    改前                          改后
   templates/  ← TemplateRoot 按仓库根解析      packages/pmboard-templates/  ← 按包目录解析
   skills/     ← SkillAssets 按仓库根解析       packages/pmboard-skills/     ← 按包目录解析
   vendor/reqboard ← core 相对引用              packages/reqboard-rtm/       ← 包名引用
   eval-suite/ · scripts/  ← 开发期脚本按仓库根  packages/pmboard-{eval-suite,scripts}/ ← 按包目录
```

| 项 | 规则 |
|---|---|
| 内容 | 四包内容一字不改（`diff -r` 无输出）；引擎代码同样只挪不改 |
| 解析根 | `adapters/TemplateRoot.ts`、`adapters/SkillAssets.ts`、skill 检索脚本、`scripts/*` 内的根路径改为「指向包目录」 |
| 选文件规则 | 不变（清单与顺序逐字相同）——这是 RF-23 的判据 |
| 发布 | 根包 `files` 增补 `packages/pmboard-templates`、`packages/pmboard-skills`（运行期读盘，必须随包发布）；`eval-suite`/`scripts` 属开发侧，不必发布 |
| 失败 | 资产缺失 → 抛错并给出**期望路径**；禁止回落空模板/空 skill 列表 |

## 数据结构变更 `serves: RF-5`

不适用：本需求零数据模型变更。台账 `.dsh-data/reqboard-ledger.sqlite`、需求文档、`queue.json`、RTM 产物格式与路径全部不变（行为不变式 RF-5）。

## 接口变更 `serves: RF-1, RF-2, RF-3`

**宿主可见接口**：`package.json` 的 `name` / `main` / `types` / `exports` / `dsh.client` / `dsh.bundle` 逐字不变（RF-1）；19 个工具注册名与 schema 不变（RF-2）；HTTP 路由集不变（RF-3）。

| 接口 | 变更 | 说明 |
|---|---|---|
| `ctx.commands.register` | **A**：注册 `/pm`（`definitionId='dsh-pmboard'`、`name='pm'`） | 唯一新增宿主可见接口；契约见 `design/interfaces.md` |
| `packages/pmboard-common/src/protocol.ts` | **M**：拆为「纯帧（common）/ 域关联（core）」两份 | protocol 的导出面在 common+core 合并后与迁移前等价 |
| `pmboard-workflow/src/ports.ts` | **A**：承接 `WorkflowRunner` / `WorkflowStartInput` / `WorkflowRunOutcome`；core 侧 re-export | 让 workflow 包对 core 只剩可选类型引用 |
| core 的 jobs 解析口 | **M**：`QueryRunStatus` 不再自建 `DshJobsAdapter`，只接受注入 | 见反向边 #2 |
| 资产解析根 | **M**：模板 / skill / 引擎按包目录解析 | 文件清单不变（RF-23），见 `design/interfaces.md` 资产解析契约节 |
| 工具注册表 | **M**：`TOOL_REGISTRY` 留在单包 `tool-pmboard` 内聚合四个目录 | 形状与迁移前逐字一致（RF-20） |
| `RequirementTypeSpec` + `createTypeRegistry()` | **A**：类型层契约（type-kit 导出），六个类型包各导出 spec | core 只经该接口消费类型逻辑（RF-25/26）；契约见 `design/interfaces.md` 类型规格契约节 |
| 类型包 → 模板的引用 | **A**：类型 spec 声明模板路径字符串；装配期校验存在性 | 模板资产仍留 `pmboard-templates`（RF-28） |

## 依赖关系 `serves: RF-15, RF-24`

workspace 装配（源码包，不出独立产物）：

- `pnpm-workspace.yaml`：`packages: ['packages/*']`。
- 子包 `package.json`：`{"name":"pmboard-common","private":true,"type":"module","exports":{".":"./src/index.ts","./*":"./src/*"}}`；`dependencies` 只写真实依赖（workspace 兄弟包 + 第三方）。
- L0 断言：`pmboard-common` 与 `reqboard-rtm` 的 `dependencies` 为空；资产四包的 `dependencies` 为空。
- L0.5 断言：`pmboard-type-kit` 只依赖 common；六类型包只依赖 type-kit + common——**core 不依赖任何具体类型包**（只依赖 type-kit 接口）。
- 根 `package.json`：`dependencies` +19 个 `workspace:*` + `@deepseek-ai/dsh-commands@0.2.0-rc.1`；`files` 增补两个运行期资产包。
- 根 `tsconfig.json`：`paths` 增 19 包映射；`vitest.config.ts` 增同名 alias 与 `packages/*/tests/**/*.test.ts` include。
- 装配点：根包 `src/type-registry.ts` 把六个 spec 注入 `createTypeRegistry()`，再把注册表交给 core（与工具注册表同处组合根，避免 core 依赖具体类型包）。
- 门禁 `scripts/package-boundary-check.mts`（RF-24）：按上表「分层白名单」扫 `packages/*/src/**/*.ts` 的 import 来源，命中未声明包即退出码 1；白名单唯一权威 = 本设计的依赖表。

## 目录结构 `serves: RF-6`

```
dsh-pmboard/
  package.json  pnpm-workspace.yaml  tsconfig.json  vitest.config.ts
  tsdown.config.mjs（host 入口仍 src/index.ts）  tsdown.client.config.mjs（client 入口 → 包）
  src/          # 组合根：index.ts · http/ · adapters/ · wiring/ · type-registry.ts
  tests/        # e2e + 集成 + stubs/ + setup/（全局夹具留根）
  packages/
    pmboard-common/   reqboard-rtm/      pmboard-core/
    pmboard-type-kit/ pmboard-type-feature/ pmboard-type-bug/ pmboard-type-doc/
    pmboard-type-refactor/ pmboard-type-spike/ pmboard-type-chore/
    tool-pmboard/     # 单包：src/{kit,intake,decompose,verify,collab}/ + src/registry.ts
    pmboard-round-driver/ pmboard-workflow/ pmboard-client/ command-pmboard/
    pmboard-templates/  pmboard-skills/   pmboard-eval-suite/ pmboard-scripts/
```

每包形状对齐 goal：`package.json`（private）+ `tsconfig.json`（继承根）+ `src/` + `tests/` + `README.md`；资产包为 `package.json` + 内容目录（无 src）。

## 关键算法/流程 `serves: RF-14`

**分层落地流水线（每步独立可回滚，typecheck+test 绿才进下一步）**：

```
[0] 基线   三份基线入 .dsh-data/：dist 导出名单 · 19 工具注册名单 · vitest 用例计数
           另加两类基线：资产清单（模板/skill/RTM，路径+哈希）· **六类型规格快照**
           （六类 × 阶段 × 必填节/必交文档/条件产物/归档去向/模板引用）
     |
[1] 骨架   建 19 包空壳 + workspace/tsconfig/vitest 改动（无代码移动，全绿）
     |
[2a] 公共层  common（shared 纯件 + domain 叶子 + client-types + protocol 纯帧半）
            rtm（vendor 原样）；protocol/board-summary 拆半 ⇒ core 侧改引用
     |     门禁：common/rtm 零 workspace 依赖
[2a2] 类型层 建 type-kit（契约+注册表+通用校验）+ 六类型包（各导 spec）；把
           CATEGORY_DELTAS / ARCHIVE_DOC_RULES / 模板映射 / 类型片段 / 中文标签
           按类型搬入；根包 type-registry.ts 注入六 spec
     |     判据：六类型规格快照与基线逐字相同（本步是**判据搬迁**，风险最高，故
           先于 core 的类型逻辑单点化）
[2a3] core 单点化  核心层按类型散落的分支与大表改为「查注册表」
     |     判据：core 内按类型字面量的分支归零；快照仍逐字相同
[2b] 搬迁    按落位表 git mv + codemod 重写 import
[2c] 工具单包 tools 三个共享文件 → src/kit/；19 工具目录 → 包内四目录；registry 留包内
[3] 反向边   6 处（dive 劈两半 / jobs 端口注入 / plugin-config / stage-overview / …
            client-types 已在 2a 下沉）
[3b] 命令面  新写 command-pmboard（非搬迁）+ 根包接线 + tsdown external
[3c] 类型片段 生成链改按类型出文件（六类型包各一份）+ core 组装改造
     |     判据：各类型 18 条 / 通用 21 条对数一致；prompts:check 绿
[4] 测试     633 测试按被测对象迁各包 tests/；e2e 与 stubs/setup 留根
[5] 脚本     55 处 scripts 引用 + kb/prompts/templates 三链改指新落点
[5b] 资产包   templates/skills/eval-suite/scripts → 四包 + 改运行期解析根 + 发布 files
[6] 门禁     分层门禁 + 资产清单等价 + TOOL_REGISTRY 等价 + 类型快照等价 + pack 完整性
[7] 收口     文档与各包 README（19 份）；五类基线 diff 为空
```

**import 重写规则（codemod 的确定性部分）**：

| 原形态 | 新形态 |
|---|---|
| 同包内 `from '../domain/text/fmt.js'` | 不变（相对路径仍有效） |
| 子包内引用公共包 | `from 'pmboard-common/text/fmt.js'`（保目录层级，diff 最小） |
| 子包内引用 core | `from 'pmboard-core/application/...'` |
| 测试的 `../src/application/...` | 改包名 specifier |
| 字符串常量里的 `src/`、`vendor/`、`templates/`、`skills/` | 抽清单人工核销（脚本无法判定语义） |

## 关键算法/流程（命令面 handler） `serves: RF-16, RF-17`

```
  用户敲 /pm <名称>
        |
        v
  宿主 commands 服务派发 → handler(invocation)          [command-pmboard]
        |
        +-- parsePmCommand(invocation.rawInput)  ← 纯函数，文法表定死
        |        |
        |        +-- show    → queryState(deps, {}, {agent: invocation.agent})
        |        +-- create  → executeCreateRequirement(deps, {title, category:'feature',
        |        |                  prompt_difficulty:'standard'}, {agent: invocation.agent})
        |        +-- invalid → error 回执（用法提示，不落数据）
        |
        v
  render(result) → CommandResult{kind, text}  ← 文案逐字表（interfaces.md）
        |
        +-- 异常 → error 回执 + 插件日志（不吞）
```

## 安全/性能考虑 `serves: RF-1, RF-4`

- 产物形态不变：tsdown 仍把子包源码内联进 `dist/index.mjs` 与 `lib/client.cjs`；`external` 清单为 `@deepseek-ai/cordis` · `@deepseek-ai/dsh-tools` · `@deepseek-ai/dsh-commands` · `react`（client）。
- 资产包化后运行期多一层目录跳转（读盘路径解析），无运行时性能面差异（资产在启动/首次读取时解析）。
- client 自包含铁律由 `verify-client-build.mjs` 继续把关（RF-4）。

## 测试策略 `serves: RF-13, RF-16, RF-17, RF-18, RF-19, RF-20, RF-21, RF-22, RF-23, RF-24, RF-25, RF-26, RF-27, RF-28`

| 层 | 位置 | 内容 |
|---|---|---|
| 子包单测 | `packages/*/tests/` | 随被测对象迁移的既有测试（633 个按落位表分流） |
| 根 e2e/集成 | `tests/`（留根） | 跨包链路 + `stubs/` + `setup/hermetic-guard` |
| 新增：分层门禁 | `tests/package-boundary.test.ts` | 四种越界（core → 类型包 / 类型包 → core / 工具包内目录横向引用 / 资产包引用代码包）各一例，全被拒（RF-24） |
| 新增：类型层单测 | `packages/pmboard-type-*/tests/` + `packages/pmboard-type-kit/tests/` | 六份 spec 合法性与逐项取值；注册表按六类命中、缺类响亮报错；spec 的模板引用在资产包内存在（RF-25/28） |
| 新增：类型规格快照 | `tests/type-spec-snapshot.test.ts` | 六类 × 阶段 × 五类规格项 dump 与基线逐字相同（RF-26，防判据漂移） |
| 新增：类型片段对数 | `tests/prompt-fragment-count.test.ts` | 六类型各 18 条 + 通用 21 条；`prompts:check` 覆盖逐字节一致（RF-27） |
| 新增：产物与工具基线 | `tests/build-artifact-baseline.test.ts` | dist 导出名单 + `TOOL_REGISTRY` 聚合哈希与基线 diff 为空（RF-1/2/20） |
| 新增：资产清单等价 | `tests/asset-manifest-baseline.test.ts` | 模板 / skill / RTM 三份清单（路径+哈希，排序稳定）与基线逐字相同（RF-21/23） |
| 新增：公共包零依赖 | `tests/common-package-purity.test.ts` | common 无 workspace 依赖、src 无兄弟包 import（RF-19） |
| 新增：命令面单测 | `packages/command-pmboard/tests/` | 注册/降级/文法表/创建/已绑定拒绝（契约见 `interfaces.md`） |
| 发布完整性 | `commit:check` | `pnpm pack` 产物含两个运行期资产包（RF-23） |

## 设计模式 `serves: RF-15`

- **依赖倒置的最小用法**：core 只认「态」（dive-core 三模块）与「端口」（JobsResolver / WorkflowRunner 契约），不认驱动与适配器实现——拆包保持单向的根本手法。
- **抽象下沉**：公共包承载「类型 / 协议帧 / 常量 / 错误基类」——零业务规则判定标准 = 「删除它只影响编译，不影响任何判据」。
- **单一组合根**：所有 `new XxxAdapter(...)`、ctx 接线、工具注册表（包内）消费、**六个类型 spec 的注册表注入**、命令面接线只在根包。
- **数据与执行分离（类型层）**：类型包是「纯数据 + 纯校验」，core 是「怎么用规格」——判据随包走、执行留 core，这样加一个需求类型 = 加一个包（不动 core）。

## 错误处理 `serves: RF-14, RF-23, RF-25, RF-28`

- 迁移期每步失败 → `git reset --hard <步前 commit>`；codemod 幂等。
- 分层门禁失败 → 给出越界文件、被引包名、该包允许的依赖清单、修复建议。
- 资产缺失 → 抛错含期望路径（不静默回落）。
- 类型注册表缺类 / 类型 spec 的模板引用悬空 → 装配期抛错，信息含**类型名 + 期望路径**；禁止回落「按 feature 兜底」。
- 基线 diff 非空（dist 导出 / 工具聚合 / 资产清单 / 六类型规格快照）→ 视为 RF-1/2/20/23/26 回归，阻断合并并输出逐行 diff。

## 配置项 `serves: RF-6, RF-23`

| 配置 | 变更 | 说明 |
|---|---|---|
| `pnpm-workspace.yaml` | A：`packages: ['packages/*']` | 仓库根转 workspace |
| 根 `tsconfig.json` `paths` / `vitest.config.ts` | A/M：19 包映射 + 多包 include | 源码包解析与测试发现 |
| `tsdown.client.config.mjs` `entry` | M：`packages/pmboard-client/src/index.ts` | client 半入口 |
| 根 `package.json` `files` | M：+ `packages/pmboard-templates` · `packages/pmboard-skills` | 运行期资产必须随包发布（RF-23） |
| 根 `package.json` `dependencies` | A：+ 19 workspace + `@deepseek-ai/dsh-commands` | 命令面依赖 + 类型层注入 |
| 插件配置 `PluginConfig` schema | N：不变 | 宿主侧配置契约冻结 |

## 监控埋点 `serves: RF-5`

不适用：零运行时行为变更（命令面为新增面，无观测诉求）。

## 部署变更 `serves: RF-1, RF-23`

- 发布形态：仍只发根包；`files` 增补两个运行期资产包目录（漏带即宿主运行期读不到资产，RISK-8）。
- 宿主安装与加载路径零变更；`dist/index.mjs` / `lib/client.js` 落点冻结。
- 新增运行时依赖 `@deepseek-ai/dsh-commands@0.2.0-rc.1` 保持 external（避免内联第二份命令注册表）。

## 文档更新清单 `serves: RF-6`

| 文档 | 更新点 |
|---|---|
| `README.md` | 架构段改为 19 包分层图（含类型层）；开发命令与新目录 |
| `docs/architecture*.md`（kb `kb-architecture-layers` 源） | #layers 图补「包级物理强制」与 19 包职责表；新增「需求类型层」一节 |
| 各子包 `README.md`（19 份） | 职责 / 允许依赖 / 测试命令 / 边界；类型包另写「本类型规格一览」 |
| `CHANGELOG.md` | 拆包与命令面条目 |

## 遗留问题 `serves: RF-15`

| # | 问题 | 处理 |
|---|---|---|
| L1 | `domain ↔ shared` 双向依赖 | 本轮由公共包拆半收敛为单向（RF-19）；残余的「域关联协议」留在 core，V1.1 视需要再下沉 |
| L2 | `client/stage-panel.ts` 引 core 的 `application/internal/category-doc-sets` | 方向合法但层次跳级；下沉 `common` 列入 V1.1 |
| L3 | `pmboard-workflow` 仅 3 文件 + 1 脚本 | `domain/workflow/`(15) 因成环留 core；V1.1 评估切分 |
| L4 | 子包独立构建产物（goal 一比一）未做 | V1.1 候选 |
| L5 | `vendor/` 路径字样散落在脚本/测试中 | 迁移步骤 [5] 全量 grep 清单覆盖 |
| L6 | 命令面 V1 文法固定（无子命令 / 补全 / 弹框立项） | 需求「边界」节显式收窄；V2.0 扩展 |
| L7 | `/pm <名称>` 类型/档位取缺省 | 要选类型走工具面 `reqboard_capture` |
| L8 | 19 包对 560 文件 src，跨包改动的 import 面变大 | 按「层」而非「包」组织心智；逐包 README 写清允许依赖（RISK-9 减轻）；工具层已收敛为单包 |
| L9 | `ALL_REQ_CATEGORIES` 等类型枚举留 common，与类型包形成「枚举在 common、规格在类型包」两处 | 本轮刻意保留（枚举是类型系统常量，不是某类型业务）；V1.1 评估是否由 type-kit 统一导出 |
| L10 | 新增一个需求类型 = 新增一个包 + 根包注入一行（有仪式成本） | 这是隔离的代价；README 写明「加类型三步」，V1.1 评估用配置文件生成骨架 |

## 关键决策与取舍 `serves: RF-6, RF-19, RF-20, RF-22`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| dive 归属 | 整目录进 `pmboard-round-driver`（名字直觉） | 劈两半：态留 core、驱动进包 | 实测 6 处 core→dive 反向边，整搬必成包级环 |
| workflow 归属 | `domain/workflow/` 一并进包 | 规则留 core，引擎面进包 | 28 处 core 内部引用 + domain 内依赖 ⇒ 整搬成环 |
| 子包构建 | 逐包 tsdown 出 lib/+types | 源码 workspace 包 | 用户裁定 D-2；独立发布诉求本轮不存在 |
| 公共包边界 | 继续把 `shared/` 留在 core 内 | 独立 `pmboard-common` + `protocol.ts` 拆两半 | 用户要求「抽离公共的能力，或者抽象能力」（D-4）；protocol 实测反引 17 个 domain 模块，不拆半则 common 落不到底部 |
| 工具分类法 | 按数量均分 / 按实现层分 | 按流水线用途四类 + kit | 用户原话「分类对应一个包」；与看板泳道、需求阶段同构，按「我现在处于哪一步」即可定位 |
| 工具注册表位置 | 新建 `tool-pmboard-registry` 包 | 落聚合根包 | registry 必然 import 四个类别包；放独立包会让「叶子包」反向依赖类别包，落组合根最干净 |
| 资产包化代价 | 资产原地不动 | templates/skills 也成包 + 改运行期解析根 | 用户要求 D-4；代价是把「运行期读盘根」纳入改动面，故单列 RF-23 用清单等价 + 发布完整两道判据兜住 |
| 发布物 | 子包随包发布 | 只发根包（产物内联 + 资产包随 files） | 宿主加载面冻结（RF-1） |
| 命令面归属 | 另开 feature 需求 | 并入本重构需求 | 用户裁定 D-3；命令面本就需要与 `command-goal` 对位的子包 |
| 分层落地顺序 | 19 包一次性成型 | 自下而上：公共层 → **类型层** → 搬迁 → 工具单包 → 资产包 → 门禁 | 类型层是**判据搬迁**（风险最高），必须早于 core 的类型逻辑单点化，否则无法判断「快照变了是搬错还是改错」 |
| 类型层粒度 | 类型规格留在 core 里按 category 分支 | 六个类型各一包 + type-kit | 用户 D-5「走那个类型逻辑就隔离开了」；实测类型判据分散在 16 文件/22 处 category 判据，是当前最分散的一维 |
| 类型包依赖方向 | core → 六个类型包（core 直接 import） | core 只依赖 type-kit 接口，**聚合根包注入六个 spec** | 若 core 直接 import 类型包，新增类型要动 core；注入式让「加类型 = 加包 + 注入一行」 |
| 类型逻辑单点化程度 | 连 client 渲染与提示词组装也搬进类型包 | 只搬「判据数据」，渲染与编排留 core/client | 类型包不碰 I/O 与渲染，才能在任意环境纯装配；越界会把类型包变成第二个 core |
| 工具注册表位置（修订） | 上轮定为「落聚合根包」 | 改为**留在 `tool-pmboard` 包内** | 工具层收敛为单包后，registry 与工具同包最自然；根包只消费 `TOOL_REGISTRY`，少一层注入 |

## 技术方案与亮点 `serves: RF-13`

- **用实测 import 边定边界**：560 文件的目录级真实边 + 6 处反向边 + 33 个 domain 零出度叶子 + 工具目录零互引，全部是本次拆包的硬证据，不是命名直觉。
- **五类基线 diff**：dist 导出名单 / `TOOL_REGISTRY` 聚合哈希 / vitest 用例计数 / 资产清单（路径+哈希）/ **六类型规格快照**——把宿主可见面、资产面与判据面一起纳入重构验收。
- **门禁从文字纪律升为物理约束**：分五层白名单（L0 · L0.5 · L1 · L2 · L3 · L4），四种越界各有自检用例。
- **类型逻辑隔离到包**：加一个需求类型 = 加一个包 + 根包注入一行，core 一行不改（D-5 的目标形态）。
- **公开包「薄且可验证」**：`command-pmboard` 4 文件，契约（register 定义 / 文法表 / 回执文案）在 `interfaces.md` 逐字定死，单测对着表测。
- **对齐既有演进**：`pmboard-round-driver` 与 `REQ-261009125641-c424`（Dive → DriveEngine）落点重合。
