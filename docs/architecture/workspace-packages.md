# 19 个 workspace 包与分层（REQ-261009174713-7bc8）

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
| `L1` | `pm-goal` | —（零依赖） | PM 双层 goal 内核（**分组 `goal/`**）：TaskGoal/StageGoal 纯状态机与判据 + 结构化存储端口契约（core 引用它，反向禁止） |
| `L2` | `tool-pm` · `tool-pm-goal`（分组 `goal/`）· `pm-goal-round-driver`（分组 `goal/`）· `pm-round-driver` · `pm-workflow` · `pm-client` · `command-pm` | `pm-common` · `pm-core`（`tool-pm-goal` 另含 `pm-goal`） | 入口与适配：agent 工具（`tool-pm` 19 个 + `tool-pm-goal` 的 `reqboard_goal`）/ 回合驱动 / 工作流引擎适配 / 前端渲染 / `/pm` 命令面 |
| `L3` | `pm-templates` · `pm-skills` · `pm-eval-suite` · `pm-scripts` | （无 import） | 资产包：模板 / 技能 / 评测 / 脚本位；运行期由根包以**双根**解析（包内优先） |

**依赖方向（硬纪律）**：只许向内（`L0 ← L4`），资产包零 import，`pm-category-kit` 是工具包唯一合法横向通路。
根包是**聚合发布单元**（`dist/` 与 `lib/` 由根包产出），各子包 `package.json` 为 `private` + `exports` 指向 `src`。

## 需求类型层 #type-layer

六个 `pm-category-<cat>` 包各自导出一份 `RequirementTypeSpec`；`pm-category-kit` 的 `createTypeRegistry` **构建即校验**
（缺字段即抛，不静默兜底）。加一个需求类型三步：

1. 新建 `category/pm-category-<cat>`（`src/index.ts` 一份 spec + `tests/spec.test.ts`）；
2. 在根包 `src/type-registry.ts` 装配一行（缺类装配期即抛）；
3. 跑 `node scripts/package-boundary-check.mts` 与全量测试。

## 测试与文档落点 #layout

- 测试随包：`packages/<pkg>/tests/**`；仓库级/集成/守卫类留 `tests/**`；`vitest.config.ts` 的 `include` 覆盖两处，
  并为 `tests/` · `src/` · `scripts/` 三个前缀配置别名（测试搬迁后 import 不需要改）。
- 各包职责/允许依赖/测试命令见 `packages/<pkg>/README.md`（19 份）。
