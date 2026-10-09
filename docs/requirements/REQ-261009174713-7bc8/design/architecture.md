---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件 · 设计
status: design
serves: RF-1, RF-2, RF-3, RF-4, RF-5, RF-6, RF-7, RF-8, RF-9, RF-10, RF-11, RF-12, RF-13, RF-14, RF-15
---

# 架构设计（REQ-261009174713-7bc8）

> 本文的边界方案不是照搬目录名，而是**实测 import 边之后**定的：
> 全仓 `src/**/*.ts` 逐文件解析 import 说明符（剔除注释里的路径字样），得到目录级真实边与反向边清单。
> 6 处反向边决定了「哪些文件不能按名字直觉拆走」——它们是本设计的核心结论。

## 目标与总体方案 `serves: RF-6`

```
                       dsh-pmboard（仓库根 · 聚合插件 · 唯一出产物）
                       src/index.ts · http/ · adapters/ · wiring/ · gate-wiring.ts
                                        |
        +---------------+---------------+---------------+---------------+
        v               v               v               v               v
  pmboard-core    tool-pmboard   pmboard-round-   pmboard-        pmboard-client
  domain(84)      tools(58)      driver(9)        workflow(3+1)   client(130)
  shared(6)                      回合驱动编排     引擎适配+脚本    页面/DAG/面板
  application     → core          → core           → core          → core
  (200)                                                             (自包含铁律)
  repositories(20)
  stage-overview(1)
  plugin-config(1)
  vendor/reqboard(28)
  client/types.ts(1)
```

**唯一允许的依赖方向**：四个功能子包 → core；根包 → 全部子包。子包之间禁止横向 import，core 禁止 import 任何子包。

**与 packages/goal 的逐项对位**：

| goal | pmboard | 说明 |
|---|---|---|
| `goal/`（域+服务） | `packages/pmboard-core/` | 状态机/规则/用例/端口全在 core |
| `tool-goal/`（模型面工具） | `packages/tool-pmboard/` | 19 个 `reqboard_*` 工具（薄壳，只调 core 用例） |
| `goal-round-driver/`（回合驱动） | `packages/pmboard-round-driver/` | 与 `REQ-261009125641-c424` 的 DriveEngine 升级落点对齐 |
| `command-goal/`（斜杠命令面） | `packages/pmboard-workflow/`（本轮占位） | 命令面（V2.0）与技术 workflow 引擎面（本轮）不同物，命名不硬凑 |
| 每包 `package.json/tsconfig/src/tests` | 同形 | 子包 `private: true`，只被根包消费 |

**与 goal 的一处刻意差异（用户已裁定 D-2）**：goal 各子包独立 tsdown 出 `lib/+types`；本轮子包是**源码 workspace 包**，只有聚合根包出 `dist/index.mjs` 与 `lib/client.js`。理由见「关键决策与取舍」。

## 模块改动地图 `serves: RF-7, RF-8, RF-9, RF-10, RF-11, RF-12`

### 落位表（文件数为实测值） `serves: RF-7, RF-8, RF-9, RF-10, RF-11, RF-12`

| 目标位置 | 承接内容 | 文件数 | 迁移后包关系 |
|---|---|---|---|
| `packages/pmboard-core/src/` | `domain/`(84) · `shared/`(6) · `application/`(扣 dive 驱动面 9) · `repositories/`(20) · `stage-overview/`(1) · `plugin-config.ts`(1) · `dive-core/`(3，原 application/dive 的 round-state/applyDiveTransition/stage-configs) · `client-types.ts`(1，原 client/types.ts) | 117 | 依赖图底部，零子包依赖 |
| `packages/pmboard-core/vendor/reqboard/` | `vendor/reqboard/`(28) | 28 | 被 core 的 14 文件 + client 1 文件引用 |
| `packages/tool-pmboard/src/` | `src/tools/`(58) | 58 | → core |
| `packages/pmboard-round-driver/src/` | `application/dive/` 驱动面：round-driver · round-subscriptions · session-driver · wake-heartbeat · wake-liveness · wake-skip-trace · gate-prompt · idle-capture-actions · boundary-guard | 9 | → core |
| `packages/pmboard-workflow/src/` | `adapters/WorkflowEngineRunner.ts`(156 行) · `adapters/WorkflowSchemaAdapter.ts`(100 行) · `ports.ts`(WorkflowRunner/WorkflowStartInput/WorkflowRunOutcome 三个契约类型从 core 的 application/ports.ts 拆出) | 3 | → core（仅类型） |
| `packages/pmboard-workflow/scripts/` | `scripts/workflow-engine-smoke.ts` | 1 | → workflow 包 |
| `packages/pmboard-client/src/` | `src/client/` 扣 types.ts(1) | 130 | → core |
| 仓库根 `src/`（聚合根包） | `index.ts` · `gate-wiring.ts` · `http/`(17) · `adapters/`(35，扣两个 workflow 适配器) · `wiring/`(3) | 57 | → 全部子包 |

### 为什么 dive 要**劈成两半**（本设计关键结论） `serves: RF-9`

实测：从 core 侧真实 import `application/dive/` 的有 6 处，全部落在三个文件上：

| core 侧调用方 | 引用的 dive 文件 |
|---|---|
| `application/internal/confirm-advance-finish.ts` · `use-cases/AskConfirm.ts` | `dive/applyDiveTransition.js` |
| `application/internal/rearm.ts` | `applyDiveTransition.js` · `round-state.js` |
| `application/internal/support.ts` · `task-comment.ts` | `round-state.js` |
| `application/settings/resolve-settings.ts` | `stage-configs.js` |

dive 自身反向 import core 达 20+ 处（`internal/` 14、`use-cases/`、`ports`、`domain/`、`shared/`）。
⇒ 若整目录搬进 `pmboard-round-driver`，core → round-driver 与 round-driver → core **包级成环**，依赖方向纪律当场失效。

**解法（依赖倒置的最小形式）**：把被 core 依赖的三个**纯态/纯配置**模块留在 core（归 `application/dive-core/`，或直接并入 `domain/dive/`），
驱动编排的 9 个文件进 `pmboard-round-driver`。core 只认「态」，不认「driver」——单向成立。

```
改前：application/dive/{12 文件}  ← core 6 处引用   →  core 20+ 处引用    （同包，环不可见）
改后：core: dive-core/{round-state, applyDiveTransition, stage-configs}
      pmboard-round-driver: {9 个驱动文件}  ──单向──→  core             （包级无环）
```

### 其余 5 处反向边（必须随迁移一起反转，否则包级成环） `serves: RF-7, RF-9, RF-11, RF-12`

| # | 反向边 | 数量 | 处理 | 类型 |
|---|---|---|---|---|
| 1 | `application/*` → `client/types.js`、`repositories/*` → `client/types.js` | 3 + 2 | `client/types.ts`(478 行) 迁 core，命名 `core/client-types.ts`；client 与 core 双向引用收敛为 client → core | 文件搬迁 |
| 2 | `application/use-cases/QueryRunStatus.ts` → `adapters/DshJobsAdapter.ts` | 1 | 该文件已支持调用方注入 `dshJobsAdapter`；把「缺省 new DshJobsAdapter(globalThis)」的兜底从 core 移除，改由装配侧（根包）经 ctx 注入 resolver（core 只留结构性接口） | 小幅改代码 |
| 3 | `application/use-cases/{AskConfirm,SubmitArtifact}.ts` → `plugin-config` | 2 | `plugin-config.ts` 只依赖 `node:os/path` + `domain/limits` + `domain/task/StageRouting`（无 cordis/schemastery import），整体迁入 core；根包与 http/wiring 改从 core 引 | 文件搬迁 |
| 4 | `application/query/{QueryStageDetail,QueryVerify}.ts` → `stage-overview/assembler.js` | 2 | `stage-overview/`（1 文件）迁 core | 文件搬迁 |
| 5 | `client/stage-panel.ts` → `application/internal/category-doc-sets.js`；`client/views/panels/verify.ts` → `vendor/...` | 1 + 1 | client → core 方向合法，保留；`category-doc-sets` 是否下沉 `shared/` 列为遗留问题（本轮不动，避免行为面扩大） | 不变 |

另：`domain ↔ shared` 双向依赖（domain→shared 6 处、shared→domain 25 处）在包内，不构成包级问题，本轮不拆（列入遗留问题）。

### workflow 包为什么偏薄 `serves: RF-10`

实测 `domain/workflow/`(15 文件) 被 **28 个 core 内部文件**引用（application 27 + http 1 + shared 1）。
若把它移进 `pmboard-workflow`，则 core → workflow；而 domain/workflow 自身 import 其它 domain 模块（`../text/fmt`、`../task/*`、`../status/Predicates`、`../errors`、`../actor`）⇒ workflow → core，**成环**。
⇒ 本轮：**引擎面进 workflow 包**（Runner + SchemaAdapter + 端口契约 + 烟测脚本），**规则面留 core**（`domain/workflow/` 原地不动）。
`WorkflowRunner/WorkflowStartInput/WorkflowRunOutcome` 三个类型从 `application/ports.ts` 拆到 `packages/pmboard-workflow/src/ports.ts`，core 侧的 `application/ports.ts` 改为 re-export —— 这样 workflow 包对 core 只剩「可选的类型引用」，V1.1 独立构建时零改动。

## 数据结构变更 `serves: RF-5`

不适用：本需求零数据模型变更。台账 `.dsh-data/reqboard-ledger.sqlite`、需求文档、`queue.json`、RTM 产物文件格式与路径全部不变（行为不变式 RF-5）。

## 接口变更 `serves: RF-1`

**宿主可见接口零变更**（RF-1）：`package.json` 的 `name` / `main: ./dist/index.mjs` / `types` / `exports` / `dsh.client` / `dsh.bundle` 逐字不变。

**新增/变更的内部接口**：

| 接口 | 变更 | 说明 |
|---|---|---|
| `packages/pmboard-core/src/ports.ts`（原 `application/ports.ts`） | M：移除 `WorkflowRunner` 系三个类型的定义，改为 `export type { ... } from 'pmboard-workflow'` | 唯一让 core 提到 workflow 的地方，且是类型 re-export |
| `pmboard-workflow/src/ports.ts` | A：承接三个 workflow 契约类型 | 见上 |
| core 的 jobs 解析口 | M：`QueryRunStatus` 不再自建 `DshJobsAdapter`，只接受注入 | 见反向边 #2 |

## 依赖关系 `serves: RF-15`

```
           +-----------------------------------------------------+
           |            dsh-pmboard（根包 / 组合根）               |
           |  index.ts · http/ · adapters/ · wiring/ · 构建配置    |
           +------+-----------+-------------+-------------+-------+
                  |           |             |             |
                  v           v             v             v
            tool-pmboard  pmboard-      pmboard-      pmboard-client
                          round-driver  workflow
                  |           |             |             |
                  +-----------+-------------+-------------+
                                  |
                                  v
                          pmboard-core（含 vendor）
```

**workspace 装配**（源码包，不出独立产物）：

- `pnpm-workspace.yaml`：`packages: ['packages/*']`（根包自身仍在根）。
- 子包 `package.json`：`{"name":"pmboard-core","private":true,"type":"module","exports":{".":"./src/index.ts","./*":"./src/*"}}`；`dependencies` 只写兄弟包名（`workspace:*`）+ 其真实第三方依赖（core 目前第三方依赖为 0）。
- 根 `package.json`：`dependencies` 增加五个 `workspace:*`；`@deepseek-ai/dsh-tools`、`yaml` 保持；devDependencies 不变。
- 根 `tsconfig.json`：`paths` 增 `pmboard-core` → `./packages/pmboard-core/src/index.ts`、`pmboard-core/*` → `./packages/pmboard-core/src/*`，其余四包同形（client 需要 DOM lib，根 tsconfig 已含 DOM）。
- `vitest.config.ts`：`resolve.alias` 增同名映射（与 tsconfig paths 同源），`include` 扩为 `['tests/**/*.test.ts','packages/*/tests/**/*.test.ts']`；`setupFiles` 与 `tests/stubs` 留根不动（全局夹具）。
- 门禁 `scripts/package-boundary-check.mts`（RF-15）：扫 `packages/*/src/**/*.ts` 的 import 来源，白名单 = 该包 `package.json` 的 dependencies + 相对路径 + `node:`/`react`；命中未声明包即退出码 1，接入 `commit:check`。

## 目录结构 `serves: RF-6`

```
dsh-pmboard/
  package.json                 # 聚合根包（name=dsh-pmboard，产物入口不变）
  pnpm-workspace.yaml          # + packages/*
  tsconfig.json                # + paths 映射
  vitest.config.ts             # + packages/*/tests include 与 alias
  tsdown.config.mjs            # host 入口仍 src/index.ts
  tsdown.client.config.mjs     # client 入口 → packages/pmboard-client/src/index.ts
  src/                         # 组合根：index.ts / http/ / adapters/ / wiring/ / gate-wiring.ts
  tests/                       # e2e + 集成 + stubs/ + setup/（全局夹具留根）
  packages/
    pmboard-core/       { package.json, tsconfig.json, README.md, src/, vendor/reqboard/, tests/ }
    tool-pmboard/       { package.json, tsconfig.json, README.md, src/, tests/ }
    pmboard-round-driver/{ package.json, tsconfig.json, README.md, src/, tests/ }
    pmboard-workflow/   { package.json, tsconfig.json, README.md, src/, scripts/, tests/ }
    pmboard-client/     { package.json, tsconfig.json, README.md, src/, tests/ }
```

## 关键算法/流程 `serves: RF-14`

**迁移流水线（每步独立可回滚，typecheck+test 绿才进下一步）**：

```
[0] 基线  三份基线落 .dsh-data/：dist 导出名单 · 19 工具注册名单 · vitest 用例计数
      |
[1] 骨架  建 packages/* 空壳 + workspace/tsconfig/vitest 改动（此时无代码移动，全绿）
      |
[2] codemod  按落位表 git mv 文件 → 重写 import 说明符（含 .js 后缀与 type-only）
      |          规则：① 同包内相对路径保持相对；② 跨包一律改包名 specifier（pmboard-core/…）
      |                ③ 测试文件的 ../src/… 改包名；④ 字符串里的路径常量单独列清单人工核销
      |
[3] 反转  6 处反向边按上表处理（dive 劈两半 / client-types 下沉 / plugin-config 下沉 /
      |    stage-overview 下沉 / QueryRunStatus 端口注入 / vendor 下沉）
      |
[4] 测试  633 个测试按被测对象迁各包 tests/；e2e 与 stubs/setup 留根
      |
[5] 脚本  55 处 scripts 引用 + kb/prompts/templates 三条链改指新落点
      |
[6] 门禁  新增 package-boundary-check + 产物/工具名单基线 diff 脚本
      |
[7] 收口  文档与 kb 条目更新；三份基线 diff 为空
```

**import 重写规则（codemod 的确定性部分）**：

| 原形态 | 新形态 |
|---|---|
| `from '../domain/text/fmt.js'`（同包内） | 不变（相对路径仍然有效） |
| `from '../domain/...'`（跨包，core→子包不可能出现） | 由门禁拒绝 |
| `from '../../domain/...'`（子包内引用 core） | `from 'pmboard-core/domain/...'`（保目录层级，减少 diff 噪声） |
| `from '../src/application/...'`（测试） | `from 'pmboard-core/application/...'` |
| 字符串常量里的 `src/...` | 抽清单人工核销（脚本无法判定语义） |

## 安全/性能考虑 `serves: RF-1`

- **性能面**：源码包方案不改变产物形态——tsdown 仍把子包源码内联进单一 `dist/index.mjs` 与 `lib/client.cjs`，运行时无额外模块解析（`external` 仍只有 cordis / dsh-tools / react）。
- **构建耗时**：预期持平（无新增构建步骤）；如回退 > 10% 按非功能需求记录并回退 alias 方案。
- **安全面**：无新增外部依赖、无网络/权限面改动；client 自包含铁律由 `verify-client-build.mjs` 继续把关（RF-4）。

## 测试策略 `serves: RF-13`

| 层 | 位置 | 内容 |
|---|---|---|
| 子包单测 | `packages/*/tests/` | 随被测对象迁移的既有测试（633 个按落位表分流） |
| 根 e2e/集成 | `tests/`（留根） | `e2e-close-chain` · `header-progress-e2e` · 跨包链路 · `stubs/` · `setup/hermetic-guard` |
| 新增：边界门禁 | `tests/package-boundary.test.ts` | 故意构造越界 import 必须被 `package-boundary-check` 拒（RF-15 判据） |
| 新增：产物基线 | `tests/build-artifact-baseline.test.ts` | dist 导出名单 + 19 工具注册名单与 `.dsh-data/` 基线 diff 为空（RF-1/RF-2 判据） |
| 发现数对账 | 验收证据 | `npx vitest run --reporter=json` 的用例总数 ≥ 迁移前基线（RF-13 判据） |

## 设计模式 `serves: RF-15`

- **依赖倒置的最小用法**：core 只认「态」（round-state / applyDiveTransition / stage-configs）与「端口」（JobsResolver），不认「driver」与「适配器实现」——这是拆包能保持单向的根本手法。
- **单一组合根**：所有 `new XxxAdapter(...)` 与 ctx 接线只在根包；子包内不出现 cordis Context 装配（client 的页面注册走既有 `dsh.client` 通道，属框架约定的例外）。

## 错误处理 `serves: RF-14`

- 迁移期任何一步失败 → `git checkout -- .` 回滚该步，不留半迁移态；codemod 脚本自身幂等（重复执行结果一致）。
- 边界门禁失败信息给出：越界文件、被引包名、该包允许的依赖清单、修复建议（改依赖声明或改落位）。
- 产物基线 diff 非空 → 视为 RF-1/RF-2 回归，阻断合并，输出逐行 diff。

## 配置项 `serves: RF-6`

| 配置 | 变更 | 说明 |
|---|---|---|
| `pnpm-workspace.yaml` | A：`packages: ['packages/*']` | 仓库根转 workspace |
| 根 `tsconfig.json` `paths` | A：五包映射 | 源码包解析 |
| `vitest.config.ts` `include` / `alias` | M：多包 include + 包名 alias | 测试可跨包 import |
| `tsdown.client.config.mjs` `entry` | M：`packages/pmboard-client/src/index.ts` | client 半入口 |
| 插件配置 `PluginConfig` schema | N：不变 | 宿主侧配置契约冻结 |

## 监控埋点 `serves: RF-5`

不适用：零运行时行为变更，无新增观测诉求。

## 部署变更 `serves: RF-1`

- 发布形态不变：仍只发根包（`files` 需补 `packages/`，因为源码子包被 tsdown 内联进产物，发布物只需 `dist`/`lib`——落地时核验 `pnpm pack` 内容与今日一致）。
- 宿主安装与加载路径零变更。

## 文档更新清单 `serves: RF-6`

| 文档 | 更新点 |
|---|---|
| `README.md` | 架构段改为 packages/ 五包图；开发命令补 `pnpm -r` 相关 |
| `docs/architecture*.md`（kb `kb-architecture-layers` 源文件） | #layers 图与依赖方向补「包级物理强制」一段，并给五包职责表 |
| 各子包 `README.md` | 新增：职责 / 依赖方向 / 测试命令（对齐 packages/goal 每包 README） |
| `CHANGELOG.md` | 记录拆包条目 |

## 遗留问题 `serves: RF-15`

| # | 问题 | 处理 |
|---|---|---|
| L1 | `domain ↔ shared` 包内双向依赖（6 / 25 处） | 本轮不动；包内不成环，V1.1 视需要下沉 `shared` |
| L2 | `client/stage-panel.ts` 引 core 的 `application/internal/category-doc-sets` | 方向合法但层次跳级；下沉 `shared/` 列入 V1.1 |
| L3 | `pmboard-workflow` 本轮仅 3 文件 + 1 脚本，与 goal 的四包形态不对称 | 规则面（`domain/workflow/` 15 文件）因成环留在 core；V1.1 评估切分方案 |
| L4 | 子包独立构建产物（goal 一比一）未做 | V1.1 候选（见迭代计划） |
| L5 | `vendor/reqboard` 迁入 core 后，脚本/测试对 `vendor/...` 的路径引用需逐条核销 | 迁移步骤 [5] 的全量 grep 清单覆盖 |

## 关键决策与取舍 `serves: RF-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| dive 归属 | 整目录进 `pmboard-round-driver`（名字直觉） | 劈两半：态留 core、驱动进包 | 实测 6 处 core→dive 反向边，整搬必成包级环（本设计的硬证据） |
| workflow 归属 | `domain/workflow/` 一并进 workflow 包 | 规则留 core，引擎面进包 | 28 处 core 内部引用 + domain 内依赖 ⇒ 整搬成环 |
| 子包构建 | 逐包 tsdown 出 lib/+types（goal 一比一） | 源码 workspace 包 | 用户裁定 D-2；独立发布诉求本轮不存在 |
| client/types.ts | 留在 client 包，core 反向引 | 下沉 core | 消灭 5 处 core→client 反向边，client 单向依赖 core |
| QueryRunStatus 的 jobs 兜底 | core 继续 import 根包适配器 | 端口注入（装配侧提供） | core 不可依赖根包；行为面：调用方注入时逐字不变，缺省兜底由装配侧补齐 |
| 发布物 | 子包随包发布 | 只发根包（产物内联） | 宿主加载面冻结（RF-1） |

## 技术方案与亮点 `serves: RF-13`

- **用实测 import 边定边界**，而不是按目录名直觉：全仓 560 文件解析出目录级真实边 + 6 处反向边清单，反向边逐条给处理方案——这是「拆包不成环」的可核验依据（脚本 `/tmp/pmboard-dep-scan*.mjs` 逻辑将固化为 `scripts/package-boundary-check.mts` 的一部分）。
- **三份产物基线 diff**：dist 导出名单 / 19 工具注册名单 / vitest 用例计数，把「宿主可见面」也纳入重构验收（复用既有 `scripts/test-baseline.mts` 机制）。
- **门禁从文字纪律升为物理约束**：`docs/architecture` 的 #layers 文字 → `package.json` dependencies + grep 门禁，越界当场退出码 1。
- **对齐既有演进**：`pmboard-round-driver` 与 `REQ-261009125641-c424`（Dive → DriveEngine，参考 goal）的落点重合，拆包为那次升级先铺好物理边界。
