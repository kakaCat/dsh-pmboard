# 16 个 workspace 包与分层（REQ-261009174713-7bc8）

> 本页是本次重构的**架构说明**：实现怎么分包、依赖方向怎么执法、加东西落在哪。
> 白名单唯一权威是 `scripts/package-boundary-check.mts` 的 `LAYERS`；跑 `node scripts/package-boundary-check.mts` 自检。

## 分组目录

两个**族**包按宿主布局分组（其余包仍平铺在仓库根）：

| 分组 | 包 | 宿主对应 |
|---|---|---|
| `goal/` | `pm-goal` · `pm-goal-round-driver` · `tool-pm-goal` | `packages/goal/{goal,goal-round-driver,tool-goal}` |
| `category/` | `pm-category-kit` + 六个 `pm-category-<cat>` | （本仓自有：需求类别规格族） |

工作区 glob：`goal/*` 与 `category/*`（见 `pnpm-workspace.yaml`）；tsconfig paths 与 vitest 别名同步指向分组路径。

## 分层与依赖方向 #layers

| 层 | 包 | 允许依赖 | 说明 |
|---|---|---|---|
| `L0` | `pm-common` · `reqboard-rtm` | （无） | 零依赖底座：纯帧协议/错误码注册表/知识层操作清单；RTM 引擎（自 vendor 搬入，内容零改动） |
| `L0.5` | `pm-category-kit`（分组 `category/`） | `pm-common` | **需求类别**层契约：`RequirementTypeSpec` + `createTypeRegistry`（构建即校验） |
| `L0.5` | `pm-category-{feature,bug,doc,refactor,spike,chore}`（分组 `category/`） | `pm-common` · `pm-category-kit` | 六个需求类别规格（必填节 delta / 必交与条件设计文档 / 条件产物 / 模板映射 / 归档去向 / 中文标签） |
| `L1` | `pm-core` | `pm-common` · `reqboard-rtm` · `pm-category-kit` · `pm-goal` | 领域与用例：`domain`（状态机/判定）、`application`（用例/内部装配/类型消费端口）、`repositories` |
| `L1` | `pm-goal` | —（零依赖） | PM goal 内核（**分组 `goal/`**）：Goal/StageGoal 纯状态机与判据 + 结构化存储端口契约（core 引用它，反向禁止） |
| `L2` | `tool-pm` · `tool-pm-goal`（分组 `goal/`）· `pm-goal-round-driver`（分组 `goal/`）· `pm-client` · `command-pm` | `pm-common` · `pm-core`（`tool-pm-goal` 另含 `pm-goal`） | 入口与适配：agent 工具（`tool-pm` 19 个 + `tool-pm-goal` 的 `reqboard_goal`）/ 回合驱动 / 前端渲染 / `/pm` 命令面 |
| `L3` | `pm-templates` · `pm-skills` · `pm-scripts` | （无 import） | 资产包：模板 / 技能 / 脚本位；运行期由插件主体包 `pm/` 以**双根**解析（包内优先） |

**依赖方向（硬纪律）**：只许向内（`L0 ← L4`），资产包零 import，`pm-category-kit` 是工具包唯一合法横向通路。

> **2026-10-11 退役 `pm-workflow`**（原 L2）：子卡执行只有团队一条真实路径（Agent Teams 派发，FR-11 路线 A），
> 引擎适配器（`WorkflowEngineRunner`）所桥接的 `ctx.workflowEngine` 被宿主 preset 的 `isolate: { workflowEngine: true }`
> 按设计隔离，profile 级插件永远取不到（实测子卡链连挂 4 次）。包、组合根装配、tsconfig/vitest 别名与边界清单已同步清除；
> `AdvanceChain` 的开工前守卫改判「执行面明确不可用」（= 团队服务 `available()===false`）并保留 `subtask_engine_unreachable` 码（台账历史可比）。
>
> **代码级收口（同批）**：`UseCaseDeps.workflow` 端口与 `WorkflowRunner`/`WorkflowStartInput`/`WorkflowRunOutcome` 类型、
> `ExecuteTask` 的引擎分支、`internal/workflow-script.ts`（脚本生成 + 契约断言）一并删除；
> 子卡执行只剩团队一条路（`ExecuteTask` 的显式拒绝分支兜底）。

## 装载形态 #loading

> 2026-10-11 定案（对齐宿主装载层 `resolveBundleDir` + `bundlePatchPaths` 的实际读法）。

- **插件主体包 = `pm/`**，它是**装载清单的唯一事实源**（`main` / `exports`（含 CJS `default` 条件）/ `dsh.bundle.patch` / `dsh.client`），
  也是聚合发布单元（`dist/index.mjs` 与 `lib/client.js` 由它产出）。
- **profile 以 `link:<仓库>/pm` 安装本插件**；装载层先读该包的 `package.json` 找 patch 文件，再按 `dsh.profile.bundles` 里的名字解析入口。
- **仓库根只当 private workspace 根**（`scripts` + `devDependencies`），**不持插件清单**——两份清单就是两份事实源，
  2026-10-10 与 10-11 两次「插件整体不装载」都出在这里（现象：`reqboard_*` 工具与看板路由全不注册，宿主只在 stderr 打一行 skip）。
- 另一条独立断链：入口 `pm/dist/index.mjs` 静态 `import "yaml"`（按设计留外部）⇒ 仓库根 `node_modules/` 缺失时入口直接
  `ERR_MODULE_NOT_FOUND`。**清单齐全 ≠ 起得来**，两道都要。
- 回归锁：`tests/plugin-manifest.test.ts`（清单 + 内联两道 + 「根不持清单」）。
- 各子包 `package.json` 为 `private` + `exports` 指向 `src`。

## 需求类型层 #type-layer

六个 `pm-category-<cat>` 包各自导出一份 `RequirementTypeSpec`；`pm-category-kit` 的 `createTypeRegistry` **构建即校验**
（缺字段即抛，不静默兜底）。加一个需求类型三步：

1. 新建 `category/pm-category-<cat>`（`src/index.ts` 一份 spec + `tests/spec.test.ts`）；
2. 在 `pm/src/type-registry.ts` 装配一行（缺类装配期即抛）；
3. 跑 `node scripts/package-boundary-check.mts` 与全量测试。

## 测试与文档落点 #layout

- 测试随包：`<pkg>/tests/**`（分组包即 `goal/*/tests`、`category/*/tests`）；仓库级/集成/守卫类留 `tests/**`。
  实测归属（2026-10-11）：各包 `tests/` 合计 **553** 个用例文件，根级 `tests/` **77** 个——后者不属于任何包，
  故根入口**必须**继续覆盖它们（把根入口改成纯 `pnpm -r test` 会静默漏跑这 77 个）。
- **共享基座只有一份**：`vitest.base.mts`（沙箱 `workerExecArgv` / 绝对路径别名 / `setupFiles` / `env` / `exclude` / `poolOptions`）。
  根 `vitest.config.ts` 与各包 `vitest.config.mts` 都从它取，各自只声明 `test.include`（根另加 `test.root`）。
  为什么禁止各包自抄：argv 走样时 `hermetic-guard` 只能证"拦得住"，证不了"配置同源"；别名走样会直接造成假红。
- **两级入口**（包自治与根门禁并不冲突）：
  - 包内自跑 / 自检：`cd <pkg> && pnpm test` · `pnpm typecheck`
    （各包 `scripts.test = vitest run`、`scripts.typecheck = tsc --noEmit -p tsconfig.json`；有 `tests/` 的包必须有前者，由 `tests/package-test-wiring.test.ts` 钉住）。
  - 根门禁：`pnpm test`（632 个用例文件）· `pnpm typecheck`（聚合覆盖 20 包 + 根级 `tests` + `scripts`）。
    2026-10-11 实测：聚合 **9s**；若改成 `pnpm -r typecheck && tsc -p tsconfig.json` 需 **31s**（22s + 9s）且覆盖不增
    ——故根入口**保留聚合**：编排不是目的，覆盖才是。
- 各包职责/允许依赖见各包自己的 `README.md`。
