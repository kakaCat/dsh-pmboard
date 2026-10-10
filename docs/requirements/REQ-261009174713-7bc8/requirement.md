---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件
status: brainstorming
owner: session-5eb1ddb9-73cd-416a-96e8-99d4420cf11c
category: refactor
sides: [frontend, backend]
prototype_exempt: 纯物理重组——零可视变化，页面 DOM/样式/交互逐字不动（行为不变式 RF-2 覆盖），没有「长什么样」可画
# design_exempt 已移除（2026-10-09）：refactor 类型的设计文档集只有 architecture.md + migration.md，
# frontend.md / backend.md 不在该类型文档集内，写豁免会被 design_doc_incomplete 判为未知键。
created_at: 2026-10-09T17:47:13+08:00
source: 用户直接指令「pm按照 deepseek-harness/packages/goal 结构重构，把工具、页面、pm-round-driver、workflow 等都是一个项目，当一个插件」
---

# 需求说明（REQ-261009174713-7bc8）

> 状态：需求分析（brainstorming） · 窗口 session-5eb1ddb9 · 立据：2026-10-09
> 宣布路径：Architectural——改的是包拓扑与构建编排，不改任何运行时行为
> 编号规范：本仓条款号 refactor=RF-x，行为不变式与功能点共用一个编号序列，下游任务卡 requirement_refs 引用它

## TL;DR <!-- serves: RF-6 -->

一句话：**把 dsh-pmboard 从一个 560 文件的平铺单包，拆成 packages/ 下十九个子包——公共底座（common / rtm）+ 类型层（type-kit + feature/bug/doc/refactor/spike/chore 六包）+ 核心（core）+ 工具面单包（tool-pmboard，包内按用途分目录）+ 运行面四包（round-driver / workflow / client / command）+ 资产与开发侧四包（templates / skills / eval-suite / scripts）；仓库根包仍是唯一聚合插件，产物路径与宿主加载面一字不变；并补上 pm 的斜杠命令面 `/pm`（创建立项）。**

对标物：deepseek-harness `packages/goal/`——一个项目目录装 goal / tool-goal / goal-round-driver / command-goal 四个子包，各自 package.json + tsconfig + src + tests，对外当一个东西用。

## 项目背景与动机

**为什么现在做**：

1. **规模已过平铺临界点**：src/ 560 个 TS 文件（domain 84 / application 200 / tools 58 / client 131 / adapters 36 / http+repositories+wiring 40），tests/ 633 个测试文件，src 内部跨目录相对导入约 790 处。职责边界只有目录约定，没有物理强制——application 200 文件里混着用例、dive 回合驱动、gate、query、settings 五种职责。
2. **goal 已证明目标形态可行**：同一技术体系（cordis 插件 + tsdown + vitest）下，`packages/goal` 把核心服务、工具面、回合驱动器、命令面拆成四个子包各自演进。pm 侧的 dive/round-driver 与 goal-round-driver 本就是同源概念（REQ-261009125641-c424 的 Dive↔goal 对位已确认），结构对不齐，后续 DriveEngine 升级无处落位。
3. **边界违规无物理防线**：依赖方向 `tools/http/client → application → domain` 目前靠 code review 维持；拆包后由 package.json dependencies 强制，反向依赖在 install/typecheck 期就炸。

## 产品目标

- G1 （P0）**拆包不搬家**：十六个子包落位 + 测试随包迁移后，`pnpm install && pnpm build && pnpm test` 全绿，宿主加载行为逐字不变——可证伪：构建产物导出清单与基线 diff 为空、633+ 测试全数被发现且通过。
- G5 （P0）**公共能力有独立底座**：公共包 `pmboard-common` 承载「类型/协议帧/常量/错误基类/文本与标签」等零业务规则的抽象，位于依赖图底部，core 与全部子包依赖它——可证伪：`pmboard-common` 的 `package.json` 零 workspace 依赖 + 门禁断言其 src 不 import 任何兄弟包。
- G6 （P0）**资产型项目各自成包**：`vendor/reqboard` → `reqboard-rtm`；`templates` / `skills` → `pmboard-templates` / `pmboard-skills`（运行期读盘资产）；`eval-suite` / `scripts` → `pmboard-eval-suite` / `pmboard-scripts`——可证伪：包清单校验脚本列出 16 包；模板与 skill 解析到与迁移前逐字相同的文件清单。
- G2 （P0）**依赖方向物理强制**：依赖分层为 `common / rtm（底）← type-kit + 六类型包 ← core ← tool-pmboard / round-driver / workflow / client / command ← 聚合根包`；资产包零代码依赖。反向 import 在 typecheck 期报错——可证伪：门禁脚本 grep 断言 + 反向依赖用例必然失败。
- G7 （P0）**需求类型逻辑物理隔离**：feature / bug / doc / refactor / spike / chore 六类各自的「必填节 · 必交设计文档 · 条件阶段产物 · 模板映射 · 归档去向与说明书要求 · 提示词片段 · 中文标签」各归一包，走某类型逻辑时只落该类型的包——可证伪：核心层不再出现按类型的散落分支（`grep` 门禁）；六类型规格快照 dump 与迁移前逐字相同。
- G4 （P0）**pm 有斜杠命令面**：人在会话里敲 `/pm`（看本窗口状态）与 `/pm <需求名称>`（创建立项），宿主命令表出现 `/pm` ——可证伪：`/pm` 注册可见 + 敲命令后台账新增一条 REQ；宿主无 `commands` 服务时插件照常启动且响亮留痕（不静默）。
- G3 （P1）**与 goal 结构可对位**：子包命名、目录形状（src/tests/package.json/tsconfig）、README 约定与 packages/goal 逐字段对得上——可证伪：对位检查表逐项打勾。

## 非目标

- N1 **除命令面外不改任何运行时行为**：工具 schema、HTTP 路由、台账格式、页面 DOM 一律不动；唯一新增运行时面是 RF-16..RF-18 的斜杠命令面（用户 2026-10-09 裁定并入，见 D-3）。
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
| 命令面 | 宿主斜杠命令（`/pm`）：由 `ctx.commands.register` 注册、人在会话里输入触发的用户面 | 产品目标 G4 |
| 公共包 | `pmboard-common`：零业务规则的抽象底座（类型 / 协议帧 / 常量 / 错误基类 / 文本与标签），依赖图最底层 | 产品目标 G5 |
| 类型层 | `pmboard-type-kit`（契约与注册表）+ 六个类型包（`pmboard-type-<category>`）：每个类型包承载该类型的全部规格与该校验 | 产品目标 G7 |
| 类型规格 | 一个类型包导出的声明式数据 + 纯校验：必填节 / 必交设计文档 / 条件阶段产物 / 模板引用 / 归档去向 / 提示词片段 / 中文标签 | 产品目标 G7 |
| 资产包 | 承载数据/资产而非运行逻辑的包（`pmboard-templates` / `pmboard-skills` / `pmboard-eval-suite` / `pmboard-scripts` / `reqboard-rtm`） | 产品目标 G6 |

## 失败与并发路径

- **迁移半成品**：拆分按「骨架 → core → tools → round-driver → workflow → client → 测试 → 脚本」分步提交，每步 typecheck+test 绿才进下一步；任一步失败 `git checkout -- .` 整步回滚，不存在半迁移态进入主线。
- **import 重写漏改**：约 790 处 src 内相对导入 + 591 个测试文件的 `../src/...` 导入由 codemod 脚本机械重写，重写后 `tsc --noEmit` + 全量 vitest 双门拦截；漏网路径（字符串里的路径常量、dynamic import）由全仓 grep 清单逐一核销。
- **构建并发**：本轮只有聚合根包出产物，无多包构建竞态；vitest 单 config 改多 include 后仍是单进程模型，hermetic-guard 与文件锁行为不变。
- **运行期状态**：代码物理移动不触碰 `.dsh-data/` 台账与 `docs/requirements/` 文档——进行中的需求、挂起确认、验收单在迁移前后可继续读写，状态机迁移集合不变。
- **写路径**：kb:build / prompts:check / templates:check 等 55 个引用 src|tests 路径的脚本逐一改指新落点后，各自幂等重跑验证输出与基线一致。
- **命令面服务缺席**：宿主未提供 `commands` 服务（或版本不含 `register`）时惰性注入失败 → **不注册命令面、其余面照常可用**，并留一条 `pm command surface unavailable: <原因>` 日志（不抛、不静默）；19 个工具与 HTTP 面零影响。
- **命令面重复/并发立项**：本窗口已有进行中需求时 `/pm <名称>` 走 `CreateRequirement` 既有判据返回 `REQBOARD_WINDOW_BOUND` 文案（不新建第二条）；两会话同刻敲命令各自只创**自己窗口的**需求，窗口绑定判据是唯一收敛点，无共享写竞争。
- **命令面失败可重入**：handler 抛错 → 宿主命令回执 `kind:'error'`（不落半条需求）；创建失败（工作区不可用 → `REQBOARD_INVALID_WORKSPACE`）重敲同名命令即幂等重试。
- **资产包化后的解析失败**：`pmboard-templates` / `pmboard-skills` 包目录缺失或文件被删（发布漏带、安装不完整）→ 模板/skill 解析**响亮报错**（错误信息给出期望路径），不得静默回落到空模板或空 skill 列表；迁移前后对同一资产清单解析结果逐字一致（RF-23）。
- **公共包拆分的类型面**：`protocol.ts` 拆「纯帧类型（common）/ 域关联视图（core）」时若类型引用跨错层，tsc 当场报错（不引入运行期分支）；拆错即阻断在该步回滚，不允许带着双份类型定义往前走。
- **类型注册表缺项**：装配期若某类型包未注册（或注册表里缺 `feature` 等六类之一）→ **响亮报错并给出缺失类型名**，不回落「按 feature 兜底」；命令面/工具面此时拒绝创建该类型需求，而不是默默按默认类型落盘。
- **类型逻辑搬迁的判据漂移**：搬动「必填节 / 必交文档 / 归档去向」这类判据时，靠**六类型规格快照**（六类 × 阶段 × 文档集的 dump）逐字比对兜住，禁止只跑「测试绿」；快照 diff 非空即本步回滚。
- **提示词片段按类型切分**：片段的**运行期内联属性不变**（不新增读盘）；生成链改按类型出文件后，若某类型片段条数变化 → `prompts:check` 非零退出并点名缺失条数（不静默少片段）。

## 边界（不做什么）

- 不改包名 `dsh-pmboard`，不改 `main`/`exports`/`dsh` 配置块——宿主加载面冻结。
- 不引入新运行时依赖，不删除现有依赖（`@deepseek-ai/dsh-tools`、`yaml`）。
- 不为子包起 npm scope（如 @pmboard/*）——子包名用 `pmboard-core` 等平名，`private: true` 不发布。
- 不动 vendor/ 与 eval-suite/ 的内容（路径引用若断裂只改引用方）。
- 模板/文档体系豁免：本需求不改 `templates/` 任何文件内容；「改动对比」节的逐文件 diff 明细在设计文档 `design/architecture.md` 给全，本文只给结构级对比。
- 命令面 V1 只做两条：`/pm`（显示本窗口绑定与运行态摘要）与 `/pm <需求名称>`（创建立项）；不做拆分/推进/验收命令，不做交互式弹框立项（无弹框、直调用例），不做参数补全与命令别名。
- 分类包只**挪位置**：工具 schema、执行行为、注册名一律不变（RF-2 仍成立）；不借分类之机改任何工具的判据或文案。
- 资产包只**挪位置**：`templates/**`、`skills/**`、`eval-suite/**`、`scripts/**` 的内容一字不改（仅路径与引用方变化）；`vendor/reqboard` 内部代码同样只挪不改。
- 不做独立发布：十九个子包全部 `private: true`，仍只发根包（子包源码被 tsdown 内联；资产包随根包 `files` 一起发，见 RF-23）。
- 类型包只装**声明式规格 + 纯校验**：不装 I/O、不装读盘、不装渲染，也不复制 core 的判据实现；模板与提示词资产仍留资产包/生成链，类型包只声明「引用哪份」。
- 类型层不改判据语义：六类型的必填节、必交文档、归档去向一字不改（RF-26 的快照判据）；本次只挪位置、收敛入口。

## 验收标准

- [ ] `pnpm install && pnpm typecheck` 在仓库根全绿（覆盖 packages/*/src 与全部 tests）
- [ ] `pnpm build` 产出 `dist/index.mjs` 与 `lib/client.cjs`（包装后 `lib/client.js`），路径与 `package.json` main/exports 逐字不变
- [ ] `node -e "import('./dist/index.mjs').then(m=>console.log(Object.keys(m)))"` 的导出名单与迁移前基线逐字一致（基线先入 `.dsh-data/`）
- [ ] `pnpm test` 全绿，且 vitest 发现用例数 ≥ 迁移前基线（633 文件全数被发现，计数对账入验收证据）
- [ ] 宿主 smoke：dist/index.mjs 加载后注册的 19 个 reqboard_* 工具名单与基线 diff 为空
- [ ] 依赖方向门禁脚本（新增 `scripts/package-boundary-check.mts`）通过：packages/*/src 内无指向非声明依赖包的 import
- [ ] `pnpm kb:check && pnpm prompts:check && pnpm templates:check` 全绿（脚本链迁移验证）
- [ ] 宿主命令表出现 `/pm`（`ctx.commands.register` 被调用且 `name === 'pm'`、definitionId 唯一），敲 `/pm` 回执含本窗口绑定状态
- [ ] 会话里敲 `/pm 命令面烟测需求` 后，台账新增一条该窗口需求，回执给出 REQ id 与看板链接，`reqboard_status` 的 `bound=true`
- [ ] 宿主无 `commands` 服务时插件照常启动：`apply` 正常返回、命令面未注册、日志含 `unavailable` 字样（不抛错）
- [ ] 包清单校验：`ls packages` 恰好列出 19 个包，且与需求功能点表（RF-19..RF-28）的分类表逐项一致
- [ ] 类型层齐备：`pmboard-type-kit` + 六个类型包各导出合法 `RequirementTypeSpec`；注册表按六类逐项命中（缺项时装配响亮报错）
- [ ] 类型逻辑收敛：核心层内 `category === '…'` 形态的散落分支（迁移前 16 文件含类型字面量）在 `grep` 门禁下归零，仅保留类型枚举校验（common 内一处）
- [ ] 六类型规格快照：六类 × 阶段 ×（必填节 / 必交设计文档 / 条件产物 / 归档去向 / 模板引用）dump 与迁移前逐字相同
- [ ] 模板引用完整性：每个类型声明的模板路径在 `pmboard-templates` 内存在（缺项即拒），`pnpm prompts:check` 与 `templates:check` 全绿
- [ ] 公共包零依赖：`pmboard-common/package.json` 无任何 workspace 依赖；门禁扫其 src 无兄弟包 import（退出码 0）
- [ ] 资产解析等价：迁移前后各跑一次「模板清单 + skill 清单 + RTM 资产清单」dump，三份清单逐字相同（RF-23）
- [ ] 发布完整性：`pnpm pack` 产物内含 `packages/pmboard-templates` 与 `packages/pmboard-skills`（否则宿主运行期读不到资产，RF-23 判据）
- [ ] 工具分类等价：`TOOL_REGISTRY` 聚合结果与迁移前逐字一致（19 个工具名 + schema 摘要哈希）

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

### 场景 4：一句话立项（命令面）

人在会话里想开一条新需求的情况下，为了不起手就翻工具链，直接敲 `/pm 把 X 改成 Y`，实现了「命令回执给出 REQ id + 看板链接、台账立刻多一条本窗口 draft 需求」的结果。

## 业务流程

1. 维护者在 `packages/pmboard-<x>/src/` 改代码；
2. `pnpm typecheck`（根 tsconfig 经 paths 覆盖全部子包源码）拦截类型与越界导入；
3. `pnpm test`（vitest 多 include 覆盖各子包 tests/）拦截行为回归；
4. `pnpm build` 只在聚合根包出 `dist/index.mjs` + `lib/client.cjs`；
5. `pnpm pack` / 宿主加载——产物形状与今天逐字一致；
6. （命令面）人在会话敲 `/pm <名称>` → `command-pmboard` 解析语法 → 调 core 的 `CreateRequirement` 用例 → 回执 REQ id + 看板链接。

## 改动位置（整体流程图 · ASCII 字符画）

~~~
   现状：单包平铺（src/ 560 文件 · tests/ 633 文件 · 边界靠目录约定）

   +--------------------- dsh-pmboard（仓库根 = 唯一包） ---------------------+
   |  src/domain  src/application  src/tools  src/client  src/adapters ...   |
   |  tests/(633)  scripts/(55 处引用 src|tests)  tsdown x2  vitest x1       |
   +---------------------------------+---------------------------------------+
                                     |
                                     v
   【改动：仓库根转 pnpm workspace，src/tests 按职责物理拆入 packages/ 六子包；
            并新增 pm 斜杠命令面 /pm（对标 goal 的 command-goal）】
                                     ^^^
                          本次重构仅此环节（物理位置 + import 路径）
                                     |
                                     v
   下游不变面：宿主加载 dist/index.mjs · 页面加载 lib/client.js · .dsh-data 台账
   唯一新增面：【命令面 /pm】——ctx.commands.register 一条定义，handler 调 core 已有用例

   改动点：pnpm-workspace.yaml / package.json / tsconfig.json / vitest.config.ts /
          tsdown.config.mjs / tsdown.client.config.mjs / scripts/*.mts 路径常量 /
          全部 src 与 tests 文件的物理位置与相对导入
~~~

## 改动对比（整体）

| 项 | 变更类型 | 现状（改前原文） | 改动后（新原文） | 说明 / 影响面 |
|---|---|---|---|---|
| 仓库形态 | M | 单包：`"name": "dsh-pmboard"`，src/+tests/ 平铺 | pnpm workspace：根包 dsh-pmboard + packages/ 六子包 | 安装/构建入口不变 |
| 代码落点 | M | `src/{domain,application,tools,client,...}` | `packages/{pmboard-core,tool-pmboard,pmboard-round-driver,pmboard-workflow,pmboard-client,command-pmboard}/src/` + 根包留 http/adapters/wiring/index.ts | 逐文件映射表在 design/architecture.md |
| 测试落点 | M | `tests/*.test.ts`（633 文件） | 各子包 `tests/` + 根包留 e2e/集成 | vitest include 改多包 |
| 构建产物 | N | `dist/index.mjs` + `lib/client.js` | 不变（由行为不变式 RF-1 保证） | 宿主零感知 |
| 运行时行为 | N | 19 工具 + HTTP 路由 + 台账读写 | 不变（由行为不变式 RF-2/RF-3/RF-5 保证） | 除命令面外的红线 |
| 命令面 | A | 无（插件零命令注册，宿主命令表无 pm 入口） | `ctx.commands.register` 注册 `/pm`（显示 + 创建立项），落在 `packages/command-pmboard` | 唯一新增运行时面（用户裁定并入 D-3）；新增依赖 `@deepseek-ai/dsh-commands@0.2.0-rc.1` |

## 现状

- RF-1（不变式锚点）：宿主经 `package.json` 的 `main: ./dist/index.mjs` 加载 host 半、经 `dsh.client` + `lib/client.js` 加载页面半，插件导出 `name + apply`。
- RF-2（不变式锚点）：`apply` 注册 19 个 `reqboard_*` 工具，名单由 `TOOL_REGISTRY` 派生。
- RF-3（不变式锚点）：HTTP 面 `/dashboard/api/reqboard/*` JSON+SSE 路由由 `src/http/routes.ts` 注册。
- 边界纪律只有文字约定（`docs/architecture` 的 #layers），import 可任意穿越，实测 src 内跨目录相对导入约 790 处。
- dive 回合驱动（round-driver/session-driver/wake-* 12 文件）与 workflow（domain/workflow + WorkflowEngineRunner/SchemaAdapter + scripts/workflow-*）混在 application/domain/scripts 里，无独立演进单元。
- RF-16（现状锚点）：插件**零命令面**——`src/index.ts` 无任何 command 注册，宿主命令表里没有 pm 入口；人要立项只能走工具面（`reqboard_capture` 弹框 / `reqboard_create`）或看板。

## 目标结构（ASCII 结构图）

~~~
   改前（平铺单包）                     改后（16 子包 + 聚合根包）

   +------------------+          +================= dsh-pmboard（根·聚合插件·唯一出产物）=================+
   | dsh-pmboard      |          |  src/index.ts · http/ · adapters/ · wiring/ · plugin-config              |
   |  src/ (560)      |          |  + 工具注册表聚合（registry，唯一 import 四个类别包的地方）              |
   |  tests/ (633)    |          +===+========+========+========+========+========+========+========+======+
   |  vendor/         |              |        |        |        |        |        |        |        |
   |  templates/      |              v        v        v        v        v        v        v        v
   |  skills/         |        +---------+ +-------+ +------+ +--------+ +--------+ +-------+ +------+ +-------+
   |  eval-suite/     |        | common  | |  rtm  | | core | | tool-  | | tool-  | | round-| |work- | |client |
   |  scripts/        |        | 公共抽象 | |reqboard| |域+用例| |pmboard | |pmboard | |driver | |flow  | |页面   |
   +------------------+        | 零依赖  | | 引擎   | |+仓储  | | intake | |decompose| |回合驱动| |引擎适配| |自包含 |
                               +---------+ +-------+ +------+ | verify | | collab | +-------+ |+契约  | +-------+
   （tests 与 scripts 同样按包拆分）  ^         ^        ^     | collab | |  kit   |     ^      +-------+    ^
                                      |         |        |     +--------+ +--------+     |         |        |
                                      +---------+--------+-----+-----------+------------+---------+--------+
                                                      单向依赖：下层 ← 上层（禁反向、禁横向）

   类型层（L0.5，被 core 只经注册表消费）：
   +--------------+ +-------------+ +-------------+ +-------------+ +-------------+ +-------------+ +-------------+
   | type-kit     | | type-feature| | type-bug    | | type-doc    | | type-refactor| | type-spike | | type-chore  |
   | 契约+注册表   | | 规格+校验    | | 规格+校验    | | 规格+校验    | | 规格+校验     | | 规格+校验   | | 规格+校验    |
   +--------------+ +-------------+ +-------------+ +-------------+ +-------------+ +-------------+ +-------------+
     （每包：必填节 · 必交设计文档 · 条件阶段产物 · 模板引用 · 归档去向 · 提示词片段 · 中文标签）

   工具层（L2 单包，包内按用途分目录）：tool-pmboard/{intake,decompose,verify,collab}/ + kit/ + registry.ts
   命令面包：command-pmboard（→ common + core + dsh-commands）· 资产/开发侧包（零代码依赖，按路径读取）：
   pmboard-templates(38) · pmboard-skills(146) · pmboard-eval-suite(118) · pmboard-scripts(70)
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
| RF-6 | workspace 骨架 | 维护者 | 在拆包起点建 pnpm workspace 与六子包空壳（package.json/tsconfig/README，含 command-pmboard），看到 pnpm -r 能识别六包 | P0 | 目标结构图 | 新增 |
| RF-7 | pmboard-core 落位 | 维护者 | 把 domain/shared/application(扣 dive-round 与 workflow 域)/repositories 迁入 core 包，看到 core 零运行时依赖、被四方引用 | P0 | | 迁移 |
| RF-8 | tool-pmboard 落位 | 维护者 | 把 src/tools（58 文件、19 工具 + TOOL_REGISTRY）迁入工具包，看到注册表导出形状不变、工具测试在同包绿 | P0 | | 迁移 |
| RF-9 | pmboard-round-driver 落位 | 维护者 | 把 application/dive 的 round-driver/round-state/round-subscriptions/session-driver/wake-* 迁入回合驱动包，看到 dive 逻辑物理独立成包 | P0 | | 迁移；只搬不改逻辑 |
| RF-10 | pmboard-workflow 落位 | 维护者 | 把 domain/workflow、WorkflowEngineRunner/WorkflowSchemaAdapter、scripts/workflow-* 迁入 workflow 包，看到工作流引擎面独立成包 | P0 | | 迁移 |
| RF-11 | pmboard-client 落位 | 维护者 | 把 src/client（131 文件：页面/DAG/面板）迁入 client 包，看到自包含约束不破、verify:client 绿 | P0 | | 迁移 |
| RF-12 | 聚合根包收口 | 维护者 | 根包留 index.ts/http/adapters/wiring/plugin-config，import 改指子包，看到 dist/index.mjs + lib/client.js 产物落点不变 | P0 | | 修改 |
| RF-13 | 测试随包迁移 | 维护者 | 把 633 个测试按被测对象迁入各子包 tests/（e2e/集成留根），看到 vitest 发现数 ≥ 基线且全绿 | P0 | | 迁移 |
| RF-14 | 脚本与配置链迁移 | 维护者 | 修 55 处引用 src\|tests 的 scripts/* 与 vitest/tsdown/tsconfig 配置，看到 kb:check/prompts:check/templates:check 全绿 | P0 | | 修改 |
| RF-15 | 包级依赖方向门禁 | 维护者 | 新增 scripts/package-boundary-check.mts 并接入 commit:check，看到越界 import 被当场拒绝 | P1 | | 新增 |
| RF-16 | 命令面注册与降级 | 使用者/维护者 | 插件在宿主命令表注册 `/pm`，无 commands 服务时不注册也不抛、留痕 | P0 | | 新增 |
| RF-17 | `/pm <名称>` 创建立项 | 使用者 | 人敲 `/pm <需求名称>`，回执给 REQ id + 看板链接，台账多一条本窗口 draft 需求 | P0 | | 新增 |
| RF-18 | command-pmboard 子包落位 | 维护者 | 命令面代码落在 packages/command-pmboard，依赖仅 core + dsh-commands，单测同包 | P0 | | 新增 |
| RF-19 | 公共包 pmboard-common 落位 | 维护者 | 把「类型/协议帧/常量/错误基类/文本标签」抽成公共包并置于依赖图底部，看到 core 与全部子包都依赖它、它零依赖 | P0 | 目标结构图 | 新增 |
| RF-20 | 工具层单包化 | 维护者 | 19 个工具收进**一个** `tool-pmboard` 包（包内按用途分目录 + kit + registry），看到注册名与 schema 逐字不变 | P0 | | 新增 |
| RF-21 | RTM 引擎成包 | 维护者 | `vendor/reqboard`(28 文件) 迁 `packages/reqboard-rtm`，看到 core 与 client 改为从该包引用、引擎代码零改动 | P0 | | 迁移 |
| RF-22 | 资产与开发侧包化 | 维护者 | `templates`→pmboard-templates、`skills`→pmboard-skills、`eval-suite`→pmboard-eval-suite、`scripts`→pmboard-scripts | P0 | | 迁移 |
| RF-23 | 资产解析等价与发布完整 | 维护者 | 资产包化后模板/skill/RTM 资产解析到同一批文件，且 `pnpm pack` 带上资产包；缺资产时响亮报错 | P0 | | 新增 |
| RF-24 | 十九包依赖方向门禁 | 维护者 | 门禁按分层白名单校验十九包（common/rtm 零依赖；type-kit → common；六类型包 → type-kit+common；core → common+rtm+type-kit；tool-pmboard 与运行面四包 → common+core；资产包零代码依赖） | P0 | | 新增 |
| RF-25 | 类型层拆包 | 维护者 | 建 `pmboard-type-kit`（契约 + 注册表）与六个类型包，每包导出该类型的规格与校验 | P0 | 目标结构图 | 新增 |
| RF-26 | 类型逻辑单点化 | 维护者 | 核心层里按类型散落的分支与大表改为「查类型注册表」，六类型规格快照逐字不变 | P0 | | 新增 |
| RF-27 | 提示词片段按类型归属 | 维护者 | 按类型切分的提示词片段（实测每类 18 条 + 通用 21 条）随类型包走；生成链改按类型出文件，运行期内联属性不变 | P1 | | 修改 |
| RF-28 | 类型注册表与模板引用契约 | 维护者 | 类型包以声明引用模板路径（模板资产留 pmboard-templates）；引用完整性有门禁，注册表缺类或引用悬空即拒 | P0 | | 新增 |

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

### 斜杠命令面注册（RF-16）

**RF-16 命令面注册与降级**：维护者让插件在宿主命令表注册 `/pm`，看到宿主命令面出现 `/pm`；宿主没有 `commands` 服务时不注册、不抛错、留一条可读日志。

- 规则：命令定义 `definitionId = CommandDefinitionId('dsh-pmboard')`、`name = 'pm'`、`description`、`input.hint = '[<需求名称>]'`；注册走惰性注入（`ctx.inject(['commands'], …)`），不阻塞插件启动。
- 异常：`register` 抛错（宿主服务版本不含该方法）→ 捕获留痕 `pm command surface unavailable: <原因>`，插件其余面照常可用。
- **判据**：单测注入假 commands 服务断言 `register` 被调用且 `name === 'pm'`；注入缺席服务时 `apply` 正常返回且日志含 `unavailable` 字样（退出码 0）。

### 立项命令（RF-17）

**RF-17 `/pm <需求名称>` 创建立项**：人在会话敲 `/pm <需求名称>`，看到回执含新需求 id 与看板链接，台账多一条本窗口的 draft 需求。

- 规则：`/pm`（无参数）= 显示本窗口绑定与运行态摘要；`/pm <名称>` = 调 core 的 `CreateRequirement` 用例（类型缺省 feature、档位缺省 standard、文档落点回落 `docs/requirements/<REQ>/`）；回执渲染需求 id + 看板链接。
- 异常：本窗口已绑定进行中需求 → 回执 `REQBOARD_WINDOW_BOUND` 文案（不新建）；工作区不可用 → `REQBOARD_INVALID_WORKSPACE` 文案；名称为空/超长 → 用法提示（不落半条需求）。
- 后置条件：成功后需求出现在看板 draft 泳道、本窗口绑定该需求（与 `reqboard_create` 手工路径同判据）。
- **判据**：单测跑 handler 两次（成功 / 已绑定）断言台账条数与错误码；端到端敲 `/pm 烟测需求` 后 `reqboard_status` 的 `bound=true`。

### command-pmboard 子包落位（RF-18）

**RF-18 command-pmboard 子包落位**：维护者把命令面代码放进 `packages/command-pmboard`，看到依赖方向 `command-pmboard → core` 单一、命令面测试在同包 tests/ 下。

- 规则：包内只有命令定义 + 语法解析 + 回执渲染，业务判据一律在 core 用例；第三方依赖仅 `@deepseek-ai/dsh-commands`（rc 版本与宿主对齐）。
- 异常：不得 import 根包 adapters/wiring（依赖方向门禁拦截）；需要宿主能力（如 UserQuestions）时经 core 的 ports 注入。
- **判据**：`npx vitest run packages/command-pmboard/tests` 全绿；`scripts/package-boundary-check.mts` 对该包通过（无越界 import）。

### 公共包 pmboard-common 落位（RF-19）

**RF-19 公共包 pmboard-common 落位**：维护者把「类型 / 协议帧 / 常量 / 错误基类 / 文本与标签」抽成公共包，看到它位于依赖图底部、零子包依赖、被 core 与全部子包引用。

- 规则：承接 `shared/` 的纯件（`artifact-labels` / `build-stamp` / `dual-field` / `error-code-registry`）+ `domain/` 的**零出度叶子中无业务规则的部分**（类型、常量、文本、路径工具，实测 33 个零出度叶子中逐条核验）+ 原 `client/types.ts`（纯视图类型）。
- **已知硬点（实测）**：`shared/protocol.ts` 反向 import 17 个 domain 模块、`shared/board-summary.ts` 反向 import 2 个 ⇒ 二者必须**拆两半**：纯帧/纯视图类型进 `pmboard-common`，域关联部分留 `pmboard-core`；`domain ↔ shared` 的双向依赖（6 / 25 处）在此一步收敛为单向（common 为底）。
- 异常：拆分中若出现 common → core 的 import，tsc 当场报错；不允许用「类型 re-export 兜底」掩盖（那等于把环藏在类型层）。
- **判据**：`pmboard-common/package.json` 零 workspace 依赖；门禁扫其 `src` 无兄弟包 import；`pnpm typecheck` 全绿。

### 工具层单包化（RF-20）

**RF-20 工具层单包化**：维护者把 19 个工具收进一个 `tool-pmboard` 包（包内按用途分目录），看到宿主注册的 19 个工具名与 schema 逐字不变。

> 粒度裁定（D-5）：工具层**不再按类别拆成多个包**（用户质疑「工具层需要怎么多包吗」）——「分类」落在**包内目录**，包级只保留一个 `tool-pmboard`。

- 包内目录（分类保留、包数收敛）：

| 目录 | 工具 | 数量 |
|---|---|---|
| `src/intake/` | CaptureTool · CreateTool · StatusTool · MoveTool · ClearPauseTool · SkillInstallTool · KnowledgeTool | 7 |
| `src/decompose/` | DecomposeTool · TaskRunTool · TaskTreeTool · TaskMoveTool · TaskAmendTool · TaskReportTool | 6 |
| `src/verify/` | SubmitTool · AcceptSheetTool · AskConfirmTool | 3 |
| `src/collab/` | OpenWindowTool · BindTool · HandoffTool | 3 |
| `src/kit/` | `shared.ts` · `render-summaries.ts` · registry 契约类型 | — |
| `src/registry.ts` | 聚合四目录 → `TOOL_REGISTRY`（**留在工具包内**，根包只消费） | 1 |

- 实测依据：工具目录之间**零互相引用**（`grep` 跨工具 import 结果为空），唯一耦合是 3 个共享文件（全仓 30 处引用）⇒ 包内抽 `kit/` 即可。
- 异常：目录之间出现横向 import（除 `kit/`）→ code review 拒绝；`tool-pmboard` 包整体仍只允许依赖 common + core。
- **判据**：`TOOL_REGISTRY` 聚合结果与迁移前逐字一致（19 名 + schema 摘要哈希）；`npx vitest run packages/tool-pmboard/tests` 全绿。

### RTM 引擎成包（RF-21）

**RF-21 RTM 引擎成包**：维护者把 `vendor/reqboard`(28 文件) 迁成 `packages/reqboard-rtm`，看到 core 与 client 改从该包引用、引擎代码零改动。

- 规则：`reqboard-rtm` 位于依赖图底部（与 common 同层，二者互不依赖）；被 core 的 14 文件与 client 的 1 文件引用。
- 异常：引擎内部代码一字不改（只挪位置 + 改引用方）；引擎若引用 core 的 domain 类型，则该类型下沉 common（属 RF-19 的同一步）。
- **判据**：`grep -rn "vendor/reqboard" packages/ src/ | wc -l` = 0；`find packages/reqboard-rtm -name '*.ts' | sort | xargs shasum | shasum` 与迁移前 `vendor/reqboard` 的哈希一致；`pnpm typecheck` 全绿。

### 资产与开发侧包化（RF-22）

**RF-22 资产与开发侧包化**：维护者把 `templates` / `skills` / `eval-suite` / `scripts` 各自拆成包，看到四包内容零改动、引用方改指新落点。

- 规则：`pmboard-templates`(38 文件) 与 `pmboard-skills`(146 文件) 是**运行期读盘资产**（`adapters/TemplateRoot.ts`、`adapters/SkillAssets.ts` 解析）；`pmboard-eval-suite`(118) 与 `pmboard-scripts`(70) 是开发侧资产。
- 异常：资产包零代码依赖；运行期解析只改「根路径从哪来」，不改「选哪些文件」的规则（RF-23）。
- **判据**：四包内容与迁移前逐字节一致（`diff -r` 无输出）。

### 资产解析等价与发布完整（RF-23）

**RF-23 资产解析等价与发布完整**：维护者验证资产包化后模板/skill/RTM 资产仍解析到同一批文件，且发布产物带上资产包；缺资产时响亮报错。

- 规则：`TemplateRoot` / `SkillAssets` / skill 检索脚本的根路径解析改为「指向 `packages/pmboard-<asset>`」；解析结果的**文件清单与顺序**逐字不变；根包 `files` 增补资产包目录（否则宿主装完读不到）。
- 异常：资产缺失 → 报错信息含期望路径（不给空模板 / 空 skill 列表兜底）；这是**唯一被允许的运行期内部改动**（外部可观测行为不变，故 RF-1/RF-4 仍成立）。
- **判据**：迁移前后各 dump 一次「模板清单 + skill 清单 + RTM 资产清单」，三份逐字相同；`pnpm pack` 产物内含两个资产包；故意删一个模板文件时解析报错含其路径。

### 十六包依赖方向门禁（RF-24）

**RF-24 十六包依赖方向门禁**：维护者把分层白名单写进 `scripts/package-boundary-check.mts`，看到任一越界 import 被当场拒绝。

- 分层白名单（唯一权威）：`common` / `rtm`（零依赖）← `type-kit`（→ common）← 六类型包（→ type-kit + common）← `core`（→ common + rtm + type-kit）← `tool-pmboard` · `round-driver` · `workflow` · `client` · `command`（→ common + core，command 另加 `dsh-commands`）；资产包零代码依赖；聚合根包 → 全部。
- **判据**：`node scripts/package-boundary-check.mts` 退出码 0；自检用例逐层构造越界 import（「core → 类型包」「类型包 → core」「工具包内目录横向引用」「资产包引用代码包」四种）后重跑，必须逐条非零退出——四种各一例，共 4 例全拒。

### 类型层拆包（RF-25）

**RF-25 类型层拆包**：维护者建 `pmboard-type-kit` 与六个类型包，看到每个类型包导出该类型的完整规格、核心层只经注册表消费类型逻辑。

- 契约（`pmboard-type-kit`）：`RequirementTypeSpec` 声明式接口 + `createTypeRegistry(specs)` + 通用校验（类型枚举合法性、必填节并集校验、快照序列化）；类型包只导出 `spec` 常量与该校验纯函数。
- 六类型包的规格内容（**实测来源逐项点名**，全部有现网出处，不是新造）：

| 规格项 | 现网出处 | feature | bug | doc | refactor | spike | chore |
|---|---|---|---|---|---|---|---|
| 必填节 delta | `category-doc-sets.ts` CATEGORY_DELTAS | 产品定义/用户与角色/功能点 | 复现步骤/根因/回归 | 目标读者/大纲 | 现状/目标结构/行为不变式 | 待答问题/结论 | 完成判据 |
| 必交设计文档 | 同上 | architecture·data-model·interfaces·test-cases·use-cases | — | — | architecture·migration | — | — |
| 条件设计文档 | 同上（sides 触发） | frontend·backend | — | — | — | — | — |
| 条件阶段产物 | 同上 | prototype（sides 含 frontend） | — | — | prototype（同左） | — | — |
| 模板映射 | `domain/template/registry.ts` | brainstorming/feature.md + prototype.html | brainstorming/bug.md | brainstorming/doc.md | brainstorming/refactor.md + prototype.html | brainstorming/spike.md | brainstorming/chore.md |
| 归档去向与说明书 | `ARCHIVE_DOC_RULES` | architecture/guides + 必填 manual_updates | known-issues 系 + manual_note | docs 系 | architecture/work-logs + manual_updates | research 系 + manual_updates | work-logs 系 + manual_note |
| 提示词片段 | `domain/prompt/generated/fragments.ts` | 18 条 | 18 条 | 18 条 | 18 条 | 18 条 | 18 条（另有 `*` 通用 21 条留 core） |
| 中文标签/描述 | `CATEGORY_ZH`（立项弹框选项文案） | 功能 | 缺陷 | 文档 | 重构 | 调研 | 维护 |

- **判据**：六包各导出合法 spec；注册表按六类逐项命中；`npx vitest run packages/pmboard-type-*/tests` 全绿。

### 类型逻辑单点化（RF-26）

**RF-26 类型逻辑单点化**：维护者把核心层里按类型散落的分支与大表改为「查类型注册表」，看到六类型规格快照与迁移前逐字相同。

- 实测现状：16 个文件含六类型字面量（`shared/protocol` · `application/internal/{category-doc-sets,plan-granularity,decision-gates,capture-mapping,content-gate-wiring}` · `use-cases/{SubmitVerification,SubmitArchive}` · `query/QueryReport` · `domain/{template/*,requirement/Requirement,prompt/*,artifact/ArtifactSpec}` · `client/*`）；22 个 `application/internal` 文件含 `category` 判据。
- 规则：**判据主体**（必填节、必交文档、条件产物、归档去向、模板映射）改为经注册表查询；core 只保留「怎么用规格」（校验流程与门禁编排），不再持有「某类型要求什么」。
- 例外（明确保留）：① `ALL_REQ_CATEGORIES` 类型枚举与名称合法性校验留 `pmboard-common`（是类型系统的底层常量，非某类型业务）；② client 的类型标签渲染按注册表下发，不硬编码。
- **判据**：`grep -rn "category === '" packages/pmboard-core/src | wc -l` = 0；六类型规格快照（六类 × 阶段 × 五类规格项）dump 与迁移前逐字相同。

### 提示词片段按类型归属（RF-27）

**RF-27 提示词片段按类型归属**：维护者让按类型切分的提示词片段随类型包走，看到片段条数不变、运行期内联属性不变、`prompts:check` 全绿。

- 现状：`src/domain/prompt/fragments/<stage>/heavy.md` 经 `scripts/inline-prompt-fragments.mjs` 生成 `src/domain/prompt/generated/fragments.ts`（**运行时不读盘**，内联）；生成物里 `category: "*"` 21 条 + 六类型各 18 条。
- 规则：生成链改为**按类型输出**（六个类型包各自一份片段表 + core 保留通用片段）；core 的片段组装改为「通用片段 + 注册表下发的类型片段」。
- 异常：某类型片段条数变化 → `prompts:check` 非零退出并点名（不静默少片段）；片段内容一字不改。
- **判据**：`node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs` 退出码 0；六类型片段条数与迁移前逐项相同（各 18 条 + 通用 21 条）。

### 类型注册表与模板引用契约（RF-28）

**RF-28 类型注册表与模板引用契约**：维护者让类型包以声明方式引用模板路径，看到引用完整性有门禁、悬空即拒。

- 规则：类型包声明 `templates: { brainstorming: 'brainstorming/<type>.md', ... }`（**路径字符串**，不含 I/O）；真正的读盘仍在 `pmboard-templates` 资产包（RF-22/23 不变）——类型包不碰文件系统。
- 门槛：装配期校验「每个类型声明的模板路径在资产包内存在」；注册表缺六类之一或引用悬空 → 响亮报错（给出类型名 + 缺失路径）。
- **判据**：`templates:check` 全绿；故意把某类型模板路径改成不存在时，装配期报错含该路径。

~~~
改前：
  - src/ 560 文件平铺（domain/shared/application/tools/client/adapters/http/repositories…）
  - src/tools/ 58 文件（19 工具 + 3 共享文件）一个平包
  - vendor/reqboard · templates/ · skills/ · eval-suite/ · scripts/ 平铺仓库根
  - tests/ 633 文件平铺仓库根

改后：
  + 公共层：pmboard-common · reqboard-rtm
  + 核心层：pmboard-core
  + 类型层：pmboard-type-kit + pmboard-type-{feature,bug,doc,refactor,spike,chore}（走哪类逻辑就落哪个包）
  + 工具层：tool-pmboard（单包，包内 intake/decompose/verify/collab 目录 + kit + registry）
  + 运行层：pmboard-round-driver · pmboard-workflow · pmboard-client · command-pmboard
  + 资产/开发侧：pmboard-templates · pmboard-skills · pmboard-eval-suite · pmboard-scripts
  + 根包只剩组合根（index/http/adapters/wiring + 工具注册表聚合）+ e2e 测试
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
| RISK-6 | 命令面依赖/服务不匹配 | 宿主 `commands` 服务缺席或 rc 版本 API 不符，注册失败甚至拖垮插件启动 | P1 | 预防：惰性注入 + 注册异常捕获（不注册即降级）；依赖锁 `@deepseek-ai/dsh-commands@0.2.0-rc.1` 与宿主同版 |
| RISK-7 | 公共包拆不干净（类型环） | `protocol.ts` / `board-summary.ts` 的 domain 引用若拆错层，common → core 成环，类型层把环藏起来 | P0 | 预防：先出「shared→domain 引用逐条清单」再拆；门禁禁止类型 re-export 兜底；减轻：拆错则该步回滚，不带双份类型往下走 |
| RISK-8 | 发布漏带资产包 | 根包 `files` 未含 `packages/pmboard-templates|skills`，宿主装完运行期读不到模板/skill（本地开发不暴露） | P0 | 预防：`pnpm pack` 断言产物含两个资产包（进 CI/commit:check）；减轻：解析失败响亮报错并给出期望路径 |
| RISK-9 | 包数量膨胀的维护成本 | 19 包对 560 文件 src，跨包改动的 import 面从相对路径变为包名，单次改动触及面变大 | P1 | 减轻：工具层已收敛为单包（D-5）；分层白名单固定方向，按「层」而非「包」理解；逐包 README 写职责与允许依赖 |
| RISK-10 | 类型逻辑搬迁导致判据漂移 | 「必填节 / 必交文档 / 归档去向」搬进类型包时改坏语义，表面测试绿但门禁口径变了 | P0 | 预防：先 dump 六类型规格快照（六类 × 五类规格项）作为基线；判据逐字比对，diff 非空即回滚 |
| RISK-11 | 提示词片段生成链断裂 | 片段按类型切分要改生成脚本与 `prompts:check`，改错会静默少片段（提示词劣化不易被发现） | P1 | 预防：生成链先出「条数清单」基线（各类型 18 条 + 通用 21 条），生成后逐项对数；`prompts:check` 覆盖条数与逐字节一致 |

## 迭代计划

- **V1.0（本次迭代，P0/P1）**：十九子包拆分（公共层 common/rtm + 类型层 type-kit/六类型 + core + 工具层单包 + 运行面四包 + 资产/开发侧四包）+ 测试迁移 + 脚本链迁移 + 分层依赖门禁 + `/pm` 命令面（显示 + 创建立项），构建/测试/宿主行为三面全绿。
- **V1.0 排序说明**：公共层（RF-19/21）先落 → 类型层（RF-25/27，先出规格快照基线）→ core 类型逻辑单点化（RF-26/28）→ 工具层单包（RF-20）→ 运行面 → 资产包（RF-22/23）→ 门禁收口（RF-24）；每层落完即验证，避免 19 包一次性成型。
- **V1.1（下一迭代）**：子包独立 tsdown 构建出 lib/+types（goal 一比一形态）、逐包独立测试脚本。
- **V2.0（远期）**：命令面扩展（拆分 / 推进 / 验收命令、参数补全）；子包脱 private 独立发布评估。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 子包构建形态 | 每子包独立 tsdown 出 lib/（goal 一比一） | 源码 workspace 包，只有聚合根包出产物 | goal 在 harness monorepo 有统一构建编排与逐包发布诉求；pmboard 是独立仓库单插件，逐包构建的收益（独立发布）本轮不存在，成本（560 文件构建编排重做）真实存在——用户 2026-10-09 弹框裁定 |
| 仓库归属 | 搬进 deepseek-harness packages/pmboard | 留在 dsh-pmboard 仓库转 workspace | 搬迁要改 harness 侧装配与发布流程，影响面远超本次收益——用户裁定 |
| 子包粒度 | 每层一包（8 包细粒度） | 五包 + 聚合根包 | 对齐 goal 的四包职责形态（核心/工具/驱动/命令位由 workflow 占），过细粒度带来循环依赖治理成本——用户裁定 |
| client 归属 | client 留根包 | 独立 pmboard-client 包 | 用户点名「页面」是拆分对象；client 自包含、零耦合，拆出成本最低 |
| 命令面归属 | 另开一条 feature 需求（重构不夹带新功能） | 并入本重构需求 | 用户 2026-10-09 裁定原话「pm也需要一个斜杠命令面 ，创建立项」（D-3）——一次做完，代价是本需求范围含一个新增运行时面 |
| 子包粒度（二次裁定） | 六包（按职责） | 十六包：公共 + 核心 + 工具按类别五包 + 运行四包 + 资产/开发侧四包 | 用户 2026-10-09 原话「不同类型的项目也拆解成不同的包」+「分类对应一个包，还有公共包，抽离公共的能力，或者抽象能力」（D-4）——用户明确要求按「类型/分类」而非仅按职责分层，并单列公共包 |
| 公共包边界 | 继续把 `shared/` 留在 core 内 | 独立 `pmboard-common` + `protocol.ts` 拆两半 | 用户要求「抽离公共的能力，或者抽象能力」（D-4）；实测 protocol 反引 17 个 domain 模块，故必须拆半才能让 common 真正在底部 |
| 工具分类法 | 按工具数量均分 / 按实现层分 | 按流水线用途分四类（立项/拆分/验收/协作） | 用户原话「分类对应一个包」；用途分类与看板泳道、需求阶段语义同构，人找工具时按「我现在处于哪一步」就能定位 |
| 资产包化代价 | 资产原地不动（只拆代码） | templates/skills 也成包，同步改运行期解析 | 用户要求「不同类型的项目也拆解成不同的包」（D-4）；代价是把「运行期读盘根路径」纳入改动面，故单列 RF-23 用清单等价 + 发布完整两道判据兜住 |
| 拆分维度（二次追加） | 只按「职责层」拆（公共/核心/工具/运行/资产） | **再加一条「需求类型」维度**：六个类型各一包 | 用户原话「把功能，bug这个拆分成包，这样走那个类型逻辑就隔离开了」（D-5）——类型判据（必填节/必交文档/归档去向/模板/片段）是现网最分散的一维（16 文件含类型字面量、22 文件含 category 判据），隔离收益最大 |
| 工具层包数 | 五个包（kit + 四类别） | 收敛为**一个** `tool-pmboard`（包内按用途分目录） | 用户质疑「工具层需要怎么多包吗」（D-5）；实测工具目录之间零互引且都只依赖 common+core，分成五包只增加跨包 import 噪声，零隔离收益 |
| 模板资产归属 | 每个类型包自带该类型的模板文件 | 模板仍留 `pmboard-templates`，类型包只声明路径引用 | 模板是运行期读盘资产，散进六个类型包会让解析根变成「按类型多根」；类型包不碰 I/O 也保证它可在任意环境纯装配（判据 RF-28） |

## 技术方案与亮点

- **形态对标**：子包目录形状（package.json/tsconfig/src/tests/README）逐字段对齐 `packages/goal/*`，命名去 scope 用平名（独立仓库无 npm 组织）。
- **依赖方向物理化**：把 `docs/architecture` #layers 的文字纪律变成 package.json dependencies 的物理约束 + `scripts/package-boundary-check.mts` grep 门禁双保险。
- **零行为面改动的验证方法**：迁移前先把「dist 导出名单 / 19 工具注册名单 / vitest 用例计数」三份基线入 `.dsh-data/`，迁移后 diff 为空才算完——与常规「重构靠测试绿」不同，本条把**宿主可见面**也纳入 diff 基线（锚点：scripts/test-baseline.mts 既有基线机制复用）。
- 细节设计（依赖矩阵、逐文件映射、import 重写规则、tsconfig paths 方案）进 `design/architecture.md`。
- **命令面复用而非另起一套**：`command-pmboard` 只做「解析语法 → 调 core 既有用例 → 渲染回执」（对标 command-goal 的 198 行单文件形态），立项判据单点在 `CreateRequirement`（含 `REQBOARD_WINDOW_BOUND` / `REQBOARD_INVALID_WORKSPACE` 既有错误码），命令面不复制任何业务规则；宿主 `commands` 服务缺席时降级为「不注册 + 留痕」。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 RF | 判据 |
|---|---|---|---|---|
| D-1 | 用户指令「pm按照 packages/goal 结构重构…当一个插件」+ 立项弹框四问全选推荐项 | 本需求零可视变化 ⇒ 原型门走豁免，不交 `prototypes/*.html`；条件设计文档 frontend.md/backend.md 走 design_exempt，设计面由 architecture.md 承载 | 全部 | front-matter 的 `prototype_exempt` 与 `design_exempt` 经人确认 requirement 产物后生效，brainstorming→design 不再报 prototype_missing |
| D-2 | 立项弹框四问全选推荐项 | 五包 + 聚合根包 / 源码 workspace（只有根包出产物）/ 留在本仓库 / 测试随包迁移 | RF-6..RF-15 | 验收标准第 1、2、4 条 |
| D-3 | 用户原话「pm也需要一个斜杠命令面 ，创建立项」（design 阶段追加，弹框选项「并入当前重构需求」） | pm 增加斜杠命令面 `/pm`（显示 + 创建立项）**并入本重构需求**，落点 `packages/command-pmboard`（对标 goal 的 command-goal）；N1「不改运行时行为」收窄为「除命令面外不变」 | RF-16, RF-17, RF-18 | 验收标准命令面三条（`/pm` 注册可见 / 敲命令后台账新增 REQ / 无 commands 服务不抛）；本需求按 change_note 重交需求文档并重过确认门 |
| D-4 | 用户原话「不通过类型项目的也拆解成不同的包」→ 追加「分类对应一个包，还有公共包，抽离公共的能力，或者抽象能力」（brainstorming 阶段，弹框多选 A+C） | 拆分粒度从六包扩到**十六包**：① 资产型项目各自成包（`reqboard-rtm` / `pmboard-templates` / `pmboard-skills` / `pmboard-eval-suite` / `pmboard-scripts`）；② 工具面按用途分类成四包 + `tool-pmboard-kit`；③ 新增公共包 `pmboard-common` 抽离公共/抽象能力（`protocol.ts` 拆纯帧与域关联两半）；④ 资产包化带来的运行期解析改造单列 RF-23 | RF-19, RF-20, RF-21, RF-22, RF-23, RF-24 | 验收标准六条新增（包清单 16 / 公共包零依赖 / 资产清单等价 / 发布含资产包 / TOOL_REGISTRY 等价 / 分层门禁自检） |
| D-5 | 用户原话「把功能，bug这个拆分成包，这样走那个类型逻辑就隔离开了，工具层需要怎么多包吗」（brainstorming 阶段） | ① 新增**类型层**：`pmboard-type-kit` + 六个类型包（feature/bug/doc/refactor/spike/chore），承载该类型的必填节/必交文档/条件产物/模板引用/归档去向/提示词片段/中文标签；core 改为经注册表消费类型逻辑；② **工具层收敛为单包** `tool-pmboard`（分类落包内目录，撤销 D-4 的「工具四包 + kit」）；③ 模板资产仍留 `pmboard-templates`，类型包只声明引用 | RF-25, RF-26, RF-27, RF-28（并修订 RF-20、RF-24） | 验收标准七条（包清单 19 / 类型层齐备 / 类型逻辑收敛 grep / 六类型规格快照 / 模板引用完整性 / prompts 条数 / 分层门禁四例自检） |

## 版本记录

| 版本 | 日期 | 变更内容 | 提出人 | 状态 |
|---|---|---|---|---|
| v0.1 | 2026-10-09 | 初稿 | session-5eb1ddb9 | 草稿 |
| v0.2 | 2026-10-09 | 追加斜杠命令面 `/pm`（D-3，用户裁定并入）：六子包 + RF-16..RF-18 + G4 + 失败/并发路径与验收标准同步 | session-5eb1ddb9 | 草稿 |
| v0.3 | 2026-10-09 | 拆分粒度扩到十六包（D-4，用户裁定）：新增公共包与资产/类别包 —— G5/G6 + RF-19..RF-24 + 术语表/边界/失败并发/验收标准/风险（RISK-7..9）/迭代排序/决策同步 | session-5eb1ddb9 | 草稿 |
| v0.4 | 2026-10-09 | 增类型层、工具层收敛（D-5，用户裁定）：十九包 = 公共 + 类型层七包 + core + 工具单包 + 运行四包 + 资产四包 —— 新增 G7 + RF-25..RF-28，修订 RF-20/RF-24，同步失败并发/边界/验收标准/风险（RISK-10/11）/迭代排序/决策 | session-5eb1ddb9 | 草稿 |

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| RF-1 | ✅ 已接收 | t-62745e、t-636e76 |
| RF-2 | ✅ 已接收 | t-62745e、t-636e76 |
| RF-3 | ✅ 已接收 | t-636e76 |
| RF-4 | ✅ 已接收 | t-ad43c3 |
| RF-5 | ✅ 已接收 | t-636e76 |
| RF-6 | ✅ 已接收 | t-5d237b、t-160064 |
| RF-7 | ✅ 已接收 | t-906317 |
| RF-8 | ✅ 已接收 | t-765ef3 |
| RF-9 | ✅ 已接收 | t-155955 |
| RF-10 | ✅ 已接收 | t-08877c |
| RF-11 | ✅ 已接收 | t-ad43c3 |
| RF-12 | ✅ 已接收 | t-d62702、t-4ea8b0 |
| RF-13 | ✅ 已接收 | t-62745e、t-7358fc |
| RF-14 | ✅ 已接收 | t-481dac |
| RF-15 | ✅ 已接收 | t-ca6c4a |
| RF-16 | ✅ 已接收 | t-fe0a42 |
| RF-17 | ✅ 已接收 | t-fe0a42 |
| RF-18 | ✅ 已接收 | t-5d237b、t-fe0a42 |
| RF-19 | ✅ 已接收 | t-d62702、t-60bd0d、t-160064 |
| RF-20 | ✅ 已接收 | t-62745e、t-765ef3 |
| RF-21 | ✅ 已接收 | t-b7a400 |
| RF-22 | ✅ 已接收 | t-4238a0 |
| RF-23 | ✅ 已接收 | t-4238a0、t-636e76 |
| RF-24 | ✅ 已接收 | t-ca6c4a、t-636e76 |
| RF-25 | ✅ 已接收 | t-3b14a7、t-3ea341 |
| RF-26 | ✅ 已接收 | t-960cb2、t-cfd8ae |
| RF-27 | ✅ 已接收 | t-4e92b3 |
| RF-28 | ✅ 已接收 | t-3b14a7 |

> 无未接收条款（28 条全部有落点）。

<!-- reqboard:marks:end -->
