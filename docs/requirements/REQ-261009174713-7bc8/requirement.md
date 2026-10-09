---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件
status: brainstorming
owner: session-5eb1ddb9-73cd-416a-96e8-99d4420cf11c
category: refactor
sides: [frontend, backend]
prototype_exempt: 纯物理重组——零可视变化，页面 DOM/样式/交互逐字不动（行为不变式 RF-2 覆盖），没有「长什么样」可画
design_exempt: frontend.md=界面结构/组件树/令牌一字不改，设计面由 architecture.md 的包边界图承载; backend.md=运行时行为面不变，设计面由 architecture.md 的依赖方向与构建拓扑承载
created_at: 2026-10-09T17:47:13+08:00
source: 用户直接指令「pm按照 deepseek-harness/packages/goal 结构重构，把工具、页面、pm-round-driver、workflow 等都是一个项目，当一个插件」
---

# 需求说明（REQ-261009174713-7bc8）

> 状态：需求分析（brainstorming） · 窗口 session-5eb1ddb9 · 立据：2026-10-09
> 宣布路径：Architectural——改的是包拓扑与构建编排，不改任何运行时行为
> 编号规范：本仓条款号 refactor=RF-x，行为不变式与功能点共用一个编号序列，下游任务卡 requirement_refs 引用它

## TL;DR <!-- serves: RF-6 -->

一句话：**把 dsh-pmboard 从一个 560 文件的平铺单包，拆成 packages/ 下五个源码 workspace 子包（core / tools / round-driver / workflow / client），仓库根包仍是唯一聚合插件，产物路径与宿主加载面一字不变。**

对标物：deepseek-harness `packages/goal/`——一个项目目录装 goal / tool-goal / goal-round-driver / command-goal 四个子包，各自 package.json + tsconfig + src + tests，对外当一个东西用。

## 项目背景与动机

**为什么现在做**：

1. **规模已过平铺临界点**：src/ 560 个 TS 文件（domain 84 / application 200 / tools 58 / client 131 / adapters 36 / http+repositories+wiring 40），tests/ 633 个测试文件，src 内部跨目录相对导入约 790 处。职责边界只有目录约定，没有物理强制——application 200 文件里混着用例、dive 回合驱动、gate、query、settings 五种职责。
2. **goal 已证明目标形态可行**：同一技术体系（cordis 插件 + tsdown + vitest）下，`packages/goal` 把核心服务、工具面、回合驱动器、命令面拆成四个子包各自演进。pm 侧的 dive/round-driver 与 goal-round-driver 本就是同源概念（REQ-261009125641-c424 的 Dive↔goal 对位已确认），结构对不齐，后续 DriveEngine 升级无处落位。
3. **边界违规无物理防线**：依赖方向 `tools/http/client → application → domain` 目前靠 code review 维持；拆包后由 package.json dependencies 强制，反向依赖在 install/typecheck 期就炸。

## 产品目标

- G1 （P0）**拆包不搬家**：五个子包落位 + 测试随包迁移后，`pnpm install && pnpm build && pnpm test` 全绿，宿主加载行为逐字不变——可证伪：构建产物导出清单与基线 diff 为空、633+ 测试全数被发现且通过。
- G2 （P0）**依赖方向物理强制**：子包间只允许 `tools / round-driver / workflow / client → core` 与 `聚合根包 → 全部子包`，反向 import 在 typecheck 期报错——可证伪：门禁脚本 grep 断言 + 反向依赖用例必然失败。
- G3 （P1）**与 goal 结构可对位**：子包命名、目录形状（src/tests/package.json/tsconfig）、README 约定与 packages/goal 逐字段对得上——可证伪：对位检查表逐项打勾。

## 非目标

- N1 **不改任何运行时行为**：工具 schema、HTTP 路由、台账格式、页面 DOM 一律不动；发现顺带可改的一律忍住，另立需求。
- N2 **不做子包独立构建产物**：本轮子包是纯源码 workspace 包（TS paths），不出 lib/、不独立发布 npm；逐包 tsdown 出产物是 V1.1 候选。
- N3 **不搬进 deepseek-harness monorepo**：留在 dsh-pmboard 独立仓库，仓库根转 pnpm workspace。
- N4 **不动 dive/round-driver 的内部逻辑**：只搬文件与改 import，不改函数签名与行为（DriveEngine 升级是另一条需求 REQ-261009125641-c424 的事）。
- N5 **不动 .dsh-data / docs / templates 的内容**：运行期落盘路径与模板内容不变。

## 术语与措辞纪律

| 术语 | 定义（一句话） | 首次出现位置 |
|---|---|---|
| 子包 | packages/ 下有自己 package.json 的 workspace 包 | 产品目标 G1 |
| 聚合根包 | 仓库根的 dsh-pmboard 包，唯一被宿主加载、唯一出构建产物 | TL;DR |
| 源码 workspace 包 | 经 pnpm workspace + TS paths 直接引 .ts 源码、不出独立构建产物的子包 | 非目标 N2 |
| 行为不变式 | 重构前后必须逐字保持一致的可观测行为（RF-1..RF-5） | 行为不变式节 |

## 失败与并发路径

- **迁移半成品**：拆分按「骨架 → core → tools → round-driver → workflow → client → 测试 → 脚本」分步提交，每步 typecheck+test 绿才进下一步；任一步失败 `git checkout -- .` 整步回滚，不存在半迁移态进入主线。
- **import 重写漏改**：约 790 处 src 内相对导入 + 591 个测试文件的 `../src/...` 导入由 codemod 脚本机械重写，重写后 `tsc --noEmit` + 全量 vitest 双门拦截；漏网路径（字符串里的路径常量、dynamic import）由全仓 grep 清单逐一核销。
- **构建并发**：本轮只有聚合根包出产物，无多包构建竞态；vitest 单 config 改多 include 后仍是单进程模型，hermetic-guard 与文件锁行为不变。
- **运行期状态**：代码物理移动不触碰 `.dsh-data/` 台账与 `docs/requirements/` 文档——进行中的需求、挂起确认、验收单在迁移前后可继续读写，状态机迁移集合不变。
- **写路径**：kb:build / prompts:check / templates:check 等 55 个引用 src|tests 路径的脚本逐一改指新落点后，各自幂等重跑验证输出与基线一致。

## 边界（不做什么）

- 不改包名 `dsh-pmboard`，不改 `main`/`exports`/`dsh` 配置块——宿主加载面冻结。
- 不引入新运行时依赖，不删除现有依赖（`@deepseek-ai/dsh-tools`、`yaml`）。
- 不为子包起 npm scope（如 @pmboard/*）——子包名用 `pmboard-core` 等平名，`private: true` 不发布。
- 不动 vendor/ 与 eval-suite/ 的内容（路径引用若断裂只改引用方）。
- 模板/文档体系豁免：本需求不改 `templates/` 任何文件内容；「改动对比」节的逐文件 diff 明细在设计文档 `design/architecture.md` 给全，本文只给结构级对比。

## 验收标准

- [ ] `pnpm install && pnpm typecheck` 在仓库根全绿（覆盖 packages/*/src 与全部 tests）
- [ ] `pnpm build` 产出 `dist/index.mjs` 与 `lib/client.cjs`（包装后 `lib/client.js`），路径与 `package.json` main/exports 逐字不变
- [ ] `node -e "import('./dist/index.mjs').then(m=>console.log(Object.keys(m)))"` 的导出名单与迁移前基线逐字一致（基线先入 `.dsh-data/`）
- [ ] `pnpm test` 全绿，且 vitest 发现用例数 ≥ 迁移前基线（633 文件全数被发现，计数对账入验收证据）
- [ ] 宿主 smoke：dist/index.mjs 加载后注册的 19 个 reqboard_* 工具名单与基线 diff 为空
- [ ] 依赖方向门禁脚本（新增 `scripts/package-boundary-check.mts`）通过：packages/*/src 内无指向非声明依赖包的 import
- [ ] `pnpm kb:check && pnpm prompts:check && pnpm templates:check` 全绿（脚本链迁移验证）

## 用户分析

| 用户角色 | 特点 | 痛点 |
|---|---|---|
| pmboard 维护者（本窗口后续开发者） | 同时改 host/client/工具三面 | 560 文件平铺，找代码靠记目录约定；dive 与 workflow 混在 application 里，改一处牵动全包测试 |
| pmboard 集成者（DSH 宿主侧） | 只关心 dist/index.mjs + lib/client.js | 无（本需求对其零影响，这是硬约束） |

## 用户与角色（用户分析）

- **维护者**：负责本需求全部动作——拆包、改导入、迁测试、修脚本；验收时确认行为不变式逐条成立。
- **集成者**：不感知本需求；其行为面（宿主加载、页面展示）由行为不变式 RF-1..RF-5 兜底。

## 核心场景

### 场景 1：定位回合驱动器代码

维护者在「要改 dive 回合驱动逻辑」的情况下，为了只动回合驱动相关代码，进入 `packages/pmboard-round-driver/src/`，实现了「一个包就是全部相关代码，测试也在同包 tests/ 下」的结果。

### 场景 2：新增一个 reqboard 工具

维护者在「要加第 20 个工具」的情况下，为了不改无关模块，只在 `packages/tool-pmboard/` 内新增工具目录并登记 registry，实现了「工具面变更物理局限于工具包」的结果。

### 场景 3：验证没改坏宿主行为

维护者在「拆分完成后」的情况下，为了确认宿主无感知，跑构建产物导出 diff + 19 工具注册名单 diff + 全量测试，实现了「三组 diff 全空才敢合并」的结果。

## 业务流程

1. 维护者在 `packages/pmboard-<x>/src/` 改代码；
2. `pnpm typecheck`（根 tsconfig 经 paths 覆盖全部子包源码）拦截类型与越界导入；
3. `pnpm test`（vitest 多 include 覆盖各子包 tests/）拦截行为回归；
4. `pnpm build` 只在聚合根包出 `dist/index.mjs` + `lib/client.cjs`；
5. `pnpm pack` / 宿主加载——产物形状与今天逐字一致。

## 改动位置（整体流程图 · ASCII 字符画）

~~~
   现状：单包平铺（src/ 560 文件 · tests/ 633 文件 · 边界靠目录约定）

   +--------------------- dsh-pmboard（仓库根 = 唯一包） ---------------------+
   |  src/domain  src/application  src/tools  src/client  src/adapters ...   |
   |  tests/(633)  scripts/(55 处引用 src|tests)  tsdown x2  vitest x1       |
   +---------------------------------+---------------------------------------+
                                     |
                                     v
   【改动：仓库根转 pnpm workspace，src/tests 按职责物理拆入 packages/ 五子包】
                                     ^^^
                          本次重构仅此环节（物理位置 + import 路径）
                                     |
                                     v
   下游不变面：宿主加载 dist/index.mjs · 页面加载 lib/client.js · .dsh-data 台账

   改动点：pnpm-workspace.yaml / package.json / tsconfig.json / vitest.config.ts /
          tsdown.config.mjs / tsdown.client.config.mjs / scripts/*.mts 路径常量 /
          全部 src 与 tests 文件的物理位置与相对导入
~~~

## 改动对比（整体）

| 项 | 变更类型 | 现状（改前原文） | 改动后（新原文） | 说明 / 影响面 |
|---|---|---|---|---|
| 仓库形态 | M | 单包：`"name": "dsh-pmboard"`，src/+tests/ 平铺 | pnpm workspace：根包 dsh-pmboard + packages/ 五子包 | 安装/构建入口不变 |
| 代码落点 | M | `src/{domain,application,tools,client,...}` | `packages/{pmboard-core,tool-pmboard,pmboard-round-driver,pmboard-workflow,pmboard-client}/src/` + 根包留 http/adapters/wiring/index.ts | 逐文件映射表在 design/architecture.md |
| 测试落点 | M | `tests/*.test.ts`（633 文件） | 各子包 `tests/` + 根包留 e2e/集成 | vitest include 改多包 |
| 构建产物 | N | `dist/index.mjs` + `lib/client.js` | 不变（由行为不变式 RF-1 保证） | 宿主零感知 |
| 运行时行为 | N | 19 工具 + HTTP 路由 + 台账读写 | 不变（由行为不变式 RF-2/RF-3/RF-5 保证） | 本需求的红线 |

## 现状

- RF-1（不变式锚点）：宿主经 `package.json` 的 `main: ./dist/index.mjs` 加载 host 半、经 `dsh.client` + `lib/client.js` 加载页面半，插件导出 `name + apply`。
- RF-2（不变式锚点）：`apply` 注册 19 个 `reqboard_*` 工具，名单由 `TOOL_REGISTRY` 派生。
- RF-3（不变式锚点）：HTTP 面 `/dashboard/api/reqboard/*` JSON+SSE 路由由 `src/http/routes.ts` 注册。
- 边界纪律只有文字约定（`docs/architecture` 的 #layers），import 可任意穿越，实测 src 内跨目录相对导入约 790 处。
- dive 回合驱动（round-driver/session-driver/wake-* 12 文件）与 workflow（domain/workflow + WorkflowEngineRunner/SchemaAdapter + scripts/workflow-*）混在 application/domain/scripts 里，无独立演进单元。

## 目标结构（ASCII 结构图）

~~~
   改前                                改后
   +------------------+                +------------------ dsh-pmboard（根·聚合插件·唯一出产物）
   | dsh-pmboard      |                |  src/index.ts · http/ · adapters/ · wiring/ · plugin-config
   |  src/ (560)      |                +----+-------+--------+---------+----------+
   |  tests/ (633)    |                     |       |        |         |          |
   +------------------+                     v       v        v         v          v
                                    +-------+ +----+---+ +--+-------+ +-+-------+ +-----------+
                                    | core  | | tool-  | | round-   | |workflow | | client    |
                                    |domain | |pmboard | |driver    | |domain/  | |页面/DAG/  |
                                    |shared | |19 工具 | |dive 回合 | |workflow | |面板(自包含)|
                                    |app/   | |+registry| |驱动+wake| |+引擎适配| |           |
                                    |repos  | |        | |          | |+workflow| |           |
                                    |ports  | |        | |          | |脚本     | |           |
                                    +-------+ +--------+ +----------+ +---------+ +-----------+
                                    依赖方向：四子包 → core；聚合根包 → 全部子包；禁反向、禁横向
~~~

每个子包形状对齐 goal：`package.json`（private）+ `tsconfig.json`（继承根）+ `src/` + `tests/` + `README.md`。

## 行为不变式

- **RF-1 宿主加载面不变**：`package.json` 的 `name`/`main`/`types`/`exports`/`dsh` 块逐字不变；`pnpm build` 产物 `dist/index.mjs`（含 d.ts）与 `lib/client.js`（wrap 后）落点不变。验证：构建产物导出名单与基线 diff 为空。
- **RF-2 工具面不变**：19 个 `reqboard_*` 工具的注册名、schema 描述、执行行为逐字不变。验证：smoke 脚本对比注册名单基线；现有工具测试全绿。
- **RF-3 HTTP 面不变**：`/dashboard/api/reqboard/*` 路由集与响应包络不变。验证：现有 http 层测试全绿。
- **RF-4 页面行为不变**：client 自包含约束不破（src/client 无 bare npm 导入），`scripts/verify-client-build.mjs` 保持硬门；页面注册、DOM 结构、SSE 消费逻辑逐字不变。验证：client 层测试全绿 + verify:client 通过。
- **RF-5 数据面不变**：台账（.dsh-data）、需求文档（docs/requirements）、模板读取的运行期路径与格式不变。验证：kb:check / templates:check / baseline:check 全绿。

## 数据对象关系（E-R / 数据契约）

不变——本需求不触碰任何数据模型、台账 schema、文档格式；仅代码物理位置变化。依据：N1/N5 非目标 + 行为不变式 RF-5。

## 功能点（需求条款）

| 编号 | 功能点 | 用例角色 | 描述（谁 · 什么场景 · 做什么 · 看到什么结果） | 优先级 | 配图 | 备注 |
|---|---|---|---|---|---|---|
| RF-6 | workspace 骨架 | 维护者 | 在拆包起点建 pnpm workspace 与五子包空壳（package.json/tsconfig/README），看到 pnpm -r 能识别五包 | P0 | 目标结构图 | 新增 |
| RF-7 | pmboard-core 落位 | 维护者 | 把 domain/shared/application(扣 dive-round 与 workflow 域)/repositories 迁入 core 包，看到 core 零运行时依赖、被四方引用 | P0 | | 迁移 |
| RF-8 | tool-pmboard 落位 | 维护者 | 把 src/tools（58 文件、19 工具 + TOOL_REGISTRY）迁入工具包，看到注册表导出形状不变、工具测试在同包绿 | P0 | | 迁移 |
| RF-9 | pmboard-round-driver 落位 | 维护者 | 把 application/dive 的 round-driver/round-state/round-subscriptions/session-driver/wake-* 迁入回合驱动包，看到 dive 逻辑物理独立成包 | P0 | | 迁移；只搬不改逻辑 |
| RF-10 | pmboard-workflow 落位 | 维护者 | 把 domain/workflow、WorkflowEngineRunner/WorkflowSchemaAdapter、scripts/workflow-* 迁入 workflow 包，看到工作流引擎面独立成包 | P0 | | 迁移 |
| RF-11 | pmboard-client 落位 | 维护者 | 把 src/client（131 文件：页面/DAG/面板）迁入 client 包，看到自包含约束不破、verify:client 绿 | P0 | | 迁移 |
| RF-12 | 聚合根包收口 | 维护者 | 根包留 index.ts/http/adapters/wiring/plugin-config，import 改指子包，看到 dist/index.mjs + lib/client.js 产物落点不变 | P0 | | 修改 |
| RF-13 | 测试随包迁移 | 维护者 | 把 633 个测试按被测对象迁入各子包 tests/（e2e/集成留根），看到 vitest 发现数 ≥ 基线且全绿 | P0 | | 迁移 |
| RF-14 | 脚本与配置链迁移 | 维护者 | 修 55 处引用 src\|tests 的 scripts/* 与 vitest/tsdown/tsconfig 配置，看到 kb:check/prompts:check/templates:check 全绿 | P0 | | 修改 |
| RF-15 | 包级依赖方向门禁 | 维护者 | 新增 scripts/package-boundary-check.mts 并接入 commit:check，看到越界 import 被当场拒绝 | P1 | | 新增 |

## 功能点明细

（本需求是结构重构，明细节按模板精简：无界面/交互/视觉逻辑，逐文件迁移映射表与 import 重写规则在设计文档 `design/architecture.md` 给全。每条给定义行 + 规则与异常 + 变动对比要点。）

### 工作区骨架（RF-6）

**RF-6 workspace 骨架**：维护者在拆包起点建 pnpm workspace 与五子包空壳（各自 package.json/tsconfig/README），看到 `pnpm -r` 识别五包、根包 name/main/exports 不动。

- 规则：子包 `private: true`、平名无 scope；tsconfig 继承根 compilerOptions，只写 include/paths。
- 异常：workspace 循环引用在 `pnpm install` 期即炸——装不上就是边界画错，回到设计文档改边界。

### pmboard-core 落位（RF-7）

**RF-7 pmboard-core 落位**：维护者把 domain/shared/application（扣除 dive-round 与 workflow 域）/repositories 迁入 core 包，看到 core 不依赖任何兄弟子包、被四方引用。

- **技术逻辑**：core 是依赖图底部；application/ports.ts 端口定义随 core 走，adapters 留根包（实现端口 + 触碰 node:，属组合根职责）。
- **已知耦合须在设计阶段解开**：round-driver 现居 application/dive 且可能回引 use-cases；domain/workflow 归 workflow 包后，core 内残留引用须逐一核销（grep 清单入设计文档）。
- **后置条件**：`packages/pmboard-core/src` 内不出现指向 `tool-pmboard`/`pmboard-round-driver`/`pmboard-workflow`/`pmboard-client` 的 import。

### tool-pmboard 落位（RF-8）

**RF-8 tool-pmboard 落位**：维护者把 src/tools（58 文件、19 工具 + TOOL_REGISTRY）迁入工具包，看到 `TOOL_REGISTRY` 导出形状不变、19 个工具注册名逐字不变（RF-2）。

- 规则：工具只做参数与错误映射的薄壳职责不变；依赖方向 `tool-pmboard → pmboard-core`，不依赖 round-driver/workflow/client。
- 异常：工具测试里对 adapters 的直接引用属越界——测试随被测对象走，跨层测试留根包 e2e。
- **判据**：`npx vitest run packages/tool-pmboard/tests` 全绿；smoke 脚本打印的 19 个 `reqboard_*` 注册名单与 `.dsh-data/` 基线 diff 为空（退出码 0）。

### pmboard-round-driver 落位（RF-9）

**RF-9 pmboard-round-driver 落位**：维护者把 application/dive 的 round-driver/round-state/round-subscriptions/session-driver/wake-* 迁入回合驱动包，看到 dive 回合逻辑物理独立成包、行为零改动。

- **功能逻辑**：迁移候选清单 = round-driver.ts / round-state.ts / round-subscriptions.ts / session-driver.ts / wake-heartbeat.ts / wake-liveness.ts / wake-skip-trace.ts / boundary-guard.ts / applyDiveTransition.ts / gate-prompt.ts / idle-capture-actions.ts / stage-configs.ts；最终归属以设计阶段的依赖矩阵为准（纯工具性文件可留 core）。
- **技术逻辑**：只搬文件 + 改 import，函数签名与行为零改动（N4）；驱动器装配点（wiring/pm-capture-root.ts 的 assembleDiveSessionDriver）留根包。

### pmboard-workflow 落位（RF-10）

**RF-10 pmboard-workflow 落位**：维护者把 domain/workflow、WorkflowEngineRunner/WorkflowSchemaAdapter、scripts/workflow-* 迁入 workflow 包，看到工作流引擎面独立成包、宿主侧调用点签名不变。

- 规则：domain/workflow 的纯规则与 WorkflowEngineRunner 的 I/O 适配同包但分层目录保留（domain/ 与 adapters/ 子目录），为 V1.1 独立构建预留边界。
- 异常：workflow 烟测脚本（scripts/workflow-engine-smoke.ts）随包迁移后命令入口在根 package.json 保留别名。

### pmboard-client 落位（RF-11）

**RF-11 pmboard-client 落位**：维护者把 src/client（131 文件：页面/DAG/面板）迁入 client 包，看到自包含约束不破、verify:client 绿、产物 `lib/client.js` 落点不变（RF-4）。

- **技术逻辑**：client 包保持零 bare npm 导入铁律（tsdown.client.config.mjs 注释的 2026-09-16 事故）；tsdown.client.config 的 entry 改指 `packages/pmboard-client/src/index.ts`，external 仍只有 react/react-jsx-runtime。
- **后置条件**：`node scripts/verify-client-build.mjs` 通过；产物 `lib/client.cjs → wrap → lib/client.js` 链路不变。

### 聚合根包收口（RF-12）

**RF-12 聚合根包收口**：维护者在根包留 index.ts/http/adapters/wiring/plugin-config，import 改指子包，看到 `dist/index.mjs` 导出名单与基线 diff 为空（RF-1）。

- 规则：根包是唯一组合根——所有 `new XxxAdapter(...)` 与 ctx 接线只在根包；子包不出现 cordis Context 接线代码（client 的页面注册除外，它走既有 `dsh.client` 通道）。
- 异常：tsdown external 清单（cordis、dsh-tools）不变；子包被内联进产物是预期行为（单插件单产物）。

### 测试随包迁移（RF-13）

**RF-13 测试随包迁移**：维护者把 633 个测试按被测对象迁入各子包 tests/（e2e/集成留根），看到 vitest 发现用例数 ≥ 基线且全绿。

- **规则**：测试落到「被测对象所在包」的 tests/；跨包 e2e/集成（如 e2e-close-chain、header-progress-e2e）留根 tests/；tests/stubs 与 tests/setup（hermetic-guard、react 垫片）是全局夹具，留根并由 vitest config 统一引用。
- **异常**：vitest 单 config 多 include 后若出现同名 test 文件冲突，以包目录为天然命名空间消解，不改测试内容。

### 脚本与配置链迁移（RF-14）

**RF-14 脚本与配置链迁移**：维护者修 55 处引用 src|tests 的 scripts/* 与 vitest/tsdown/tsconfig 配置，看到 `pnpm kb:check && pnpm prompts:check && pnpm templates:check` 全绿。

- 规则：迁移前先出全量 grep 基线清单（`grep -rl "src/\|tests/" scripts`），迁移后逐条核销；路径常量集中处（如 tsconfig paths）单点改。
- 异常：templates/ 内容不动（N5）；模板里如出现 src 路径字样属文档描述而非路径引用，逐条人工甄别。

### 包级依赖方向门禁（RF-15）

**RF-15 包级依赖方向门禁**：维护者新增 `scripts/package-boundary-check.mts` 并接入 `commit:check`，看到越界 import 被当场拒绝。

- 规则：门禁白名单 = 各子包 package.json 声明的依赖；实现用 grep/AST 扫 `packages/*/src` 的 import 来源前缀，命中未声明包名即非零退出。
- 后置条件：故意写一条越界 import 的验证用例（门禁自检）必须被拒。

### ④ 变动对比（结构级，逐文件级在 design/architecture.md）

~~~
改前：
  - src/application/dive/round-driver.ts 等 12 文件混在 application/ 下
  - src/tools/ 58 文件与 http/adapters 同包并列
  - tests/ 633 文件平铺仓库根

改后：
  + packages/pmboard-round-driver/src|tests 独立成包
  + packages/tool-pmboard/src|tests 独立成包
  + packages/pmboard-core / pmboard-workflow / pmboard-client 同形
  + 根包只剩组合根（index/http/adapters/wiring）+ e2e 测试
~~~

## 非功能需求

- 构建耗时回退 ≤ 10%：迁移前后各跑 3 次 `pnpm build` 取中位数对比（源码包方案预期无显著变化）。
- typecheck 耗时回退 ≤ 20%：`tsc --noEmit` 中位数对比（paths 映射增多允许小幅回退）。

## 风险评估

| 编号 | 风险名称 | 场景描述 | 风险级别 | 如何规避 |
|---|---|---|---|---|
| RISK-1 | import 重写遗漏 | 790 处 src 内相对导入 + 591 测试文件的路径引用有漏改，运行期才炸 | P0 | 预防：codemod 机械重写 + tsc 全量门；减轻：全仓 grep 残留清单逐一核销 |
| RISK-2 | 隐式路径耦合 | 55 个 scripts、templates、docs、kb 里字符串形式的 src/tests 路径断裂 | P0 | 预防：迁移前出全量 grep 基线清单；减轻：kb:check/prompts:check/templates:check 三连验证 |
| RISK-3 | client 自包含被破坏 | 拆包后 client 误引 workspace 兄弟包里的 npm 依赖，宿主 seed 表解析不到 | P1 | 预防：verify-client-build.mjs 保持硬门；client 包只许依赖 core 的纯类型 |
| RISK-4 | 循环依赖 | round-driver↔use-cases、workflow↔application 存在互引，拆包后成环 | P0 | 预防：设计阶段先出依赖矩阵，必要时把共享契约下沉 core/ports；typecheck 期成环即炸 |
| RISK-5 | 迁移期与其他窗口并行改动冲突 | 拆分进行中另一窗口在平铺结构上开发，合并即冲突 | P1 | 减轻：拆分窗口内冻结主线其他改动，分步快速提交 |

## 迭代计划

- **V1.0（本次迭代，P0/P1）**：五子包拆分 + 测试迁移 + 脚本链迁移 + 依赖方向门禁，构建/测试/宿主行为三面全绿。
- **V1.1（下一迭代）**：子包独立 tsdown 构建出 lib/+types（goal 一比一形态）、逐包独立测试脚本。
- **V2.0（远期）**：command-pmboard（斜杠命令面，对标 command-goal）；子包脱 private 独立发布评估。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 子包构建形态 | 每子包独立 tsdown 出 lib/（goal 一比一） | 源码 workspace 包，只有聚合根包出产物 | goal 在 harness monorepo 有统一构建编排与逐包发布诉求；pmboard 是独立仓库单插件，逐包构建的收益（独立发布）本轮不存在，成本（560 文件构建编排重做）真实存在——用户 2026-10-09 弹框裁定 |
| 仓库归属 | 搬进 deepseek-harness packages/pmboard | 留在 dsh-pmboard 仓库转 workspace | 搬迁要改 harness 侧装配与发布流程，影响面远超本次收益——用户裁定 |
| 子包粒度 | 每层一包（8 包细粒度） | 五包 + 聚合根包 | 对齐 goal 的四包职责形态（核心/工具/驱动/命令位由 workflow 占），过细粒度带来循环依赖治理成本——用户裁定 |
| client 归属 | client 留根包 | 独立 pmboard-client 包 | 用户点名「页面」是拆分对象；client 自包含、零耦合，拆出成本最低 |

## 技术方案与亮点

- **形态对标**：子包目录形状（package.json/tsconfig/src/tests/README）逐字段对齐 `packages/goal/*`，命名去 scope 用平名（独立仓库无 npm 组织）。
- **依赖方向物理化**：把 `docs/architecture` #layers 的文字纪律变成 package.json dependencies 的物理约束 + `scripts/package-boundary-check.mts` grep 门禁双保险。
- **零行为面改动的验证方法**：迁移前先把「dist 导出名单 / 19 工具注册名单 / vitest 用例计数」三份基线入 `.dsh-data/`，迁移后 diff 为空才算完——与常规「重构靠测试绿」不同，本条把**宿主可见面**也纳入 diff 基线（锚点：scripts/test-baseline.mts 既有基线机制复用）。
- 细节设计（依赖矩阵、逐文件映射、import 重写规则、tsconfig paths 方案）进 `design/architecture.md`。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 RF | 判据 |
|---|---|---|---|---|
| D-1 | 用户指令「pm按照 packages/goal 结构重构…当一个插件」+ 立项弹框四问全选推荐项 | 本需求零可视变化 ⇒ 原型门走豁免，不交 `prototypes/*.html`；条件设计文档 frontend.md/backend.md 走 design_exempt，设计面由 architecture.md 承载 | 全部 | front-matter 的 `prototype_exempt` 与 `design_exempt` 经人确认 requirement 产物后生效，brainstorming→design 不再报 prototype_missing |
| D-2 | 立项弹框四问全选推荐项 | 五包 + 聚合根包 / 源码 workspace（只有根包出产物）/ 留在本仓库 / 测试随包迁移 | RF-6..RF-15 | 验收标准第 1、2、4 条 |

## 版本记录

| 版本 | 日期 | 变更内容 | 提出人 | 状态 |
|---|---|---|---|---|
| v0.1 | 2026-10-09 | 初稿 | session-5eb1ddb9 | 草稿 |
