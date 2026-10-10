---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件 · 迁移设计
status: design
serves: RF-6, RF-7, RF-13, RF-14, RF-19, RF-20, RF-21, RF-22, RF-23, RF-24, RF-25, RF-26, RF-27, RF-28
---

# 迁移设计（REQ-261009174713-7bc8）

> 本需求是**代码物理位置迁移**：零数据迁移、零运行时行为变更（RF-1..RF-5 行为不变式）。
> 迁移的风险不在数据，在**半迁移态**与**路径引用漏改**——本文按「每步自成闭环、失败即整步回滚」设计。

## 迁移步骤 `serves: RF-6, RF-14`

七步，每步以「命令 + 通过条件」收口；任一步不达标即回滚该步（`git checkout -- .` + 清理未跟踪文件），不进下一步。

| 步 | 动作 | 通过条件（可执行） | 回滚 |
|---|---|---|---|
| [0] 基线 | 三份基线落 `.dsh-data/refactor-baseline/`：`dist` 导出名单（`node -e "import('./dist/index.mjs')…"`）· 19 工具注册名单（smoke 脚本打印）· `npx vitest run --reporter=json` 用例计数 | 三份文件非空且计数 ≥ 现值（工具 19 / 用例数为准） | 删目录 |
| [1] 骨架 | 建 `packages/{pmboard-core,tool-pmboard,pmboard-round-driver,pmboard-workflow,pmboard-client,command-pmboard}`（各 `package.json`/`tsconfig.json`/`README.md`）；改 `pnpm-workspace.yaml`、根 `package.json`（+六个 workspace 依赖 + `@deepseek-ai/dsh-commands@0.2.0-rc.1`）、根 `tsconfig.json`（+paths）、`vitest.config.ts`（+include/alias） | `pnpm install` 成功；`pnpm typecheck` 与 `pnpm test` 与基线一致（此步未移动任何业务代码） | `git checkout -- .` |
| [2a] 公共层先落 | 建 `pmboard-common` 与 `reqboard-rtm`：搬 `shared/` 纯件 + `domain/` 零出度叶子（逐条核验）+ `client/types.ts`；`protocol.ts` / `board-summary.ts` **拆两半**（纯帧与纯视图 → common，域关联 → core）；`vendor/reqboard` → `reqboard-rtm` | `pmboard-common` 零 workspace 依赖；门禁扫无兄弟包 import；`pnpm typecheck` 全绿 | `git reset --hard <步前 commit>` |
| [2b] codemod 搬迁 | 按 architecture.md 落位表 `git mv`；codemod 重写 import：同包内相对路径不动、跨包改包名 specifier（`pmboard-core/domain/...`）、测试的 `../src/...` 改包名 | `pnpm typecheck` 全绿（0 error）；`pnpm test` 全绿且用例数 ≥ 基线 | `git reset --hard <步前 commit>` |
| [2a2] 类型层 | 建 `pmboard-type-kit` + 六类型包；把 CATEGORY_DELTAS / ARCHIVE_DOC_RULES / 模板映射 / 类型片段 / 中文标签按类型搬入；根包 `type-registry.ts` 注入六 spec | **六类型规格快照**与基线逐字相同；注册表六类齐；类型包零 I/O | `git reset --hard <步前 commit>` |
| [2a3] core 类型逻辑单点化 | 核心层按类型散落的分支与大表改为「查注册表」 | core 内按类型字面量分支归零；快照仍逐字相同 | 同上 |
| [2c] 工具层单包 | `src/tools` 三个共享文件 → `src/kit/`；19 个工具目录 → 包内 intake/decompose/verify/collab 四目录；`registry.ts` 留包内 | `TOOL_REGISTRY` 聚合结果与基线逐字一致（19 名 + schema 哈希）；`npx vitest run packages/tool-pmboard/tests` 全绿 | `git reset --hard <步前 commit>` |
| [3c] 类型提示词片段 | 生成链改按类型出文件（六类型包各一份）+ core 组装改造 + `prompts:check` 加条数对数 | 六类型各 18 条 / 通用 21 条对数一致；`prompts:check` 绿 | `git reset --hard <步前 commit>` |
| [3] 反向边反转 | 6 处反向边按 architecture.md「其余 5 处反向边」+ dive 劈两半处理 | 边界门禁脚本雏形通过：无 core→子包 import | `git reset --hard <步前 commit>` |
| [3b] 命令面实现 | 新写 `packages/command-pmboard`（4 文件，非搬迁）：注册/降级 · 语法纯函数 · handler · 回执文案；根包 `index.ts` 接线（`applyCommandSurface`）；tsdown external 加 `@deepseek-ai/dsh-commands` | 命令面单测全绿（契约见 `design/interfaces.md` 测试契约节）；宿主 smoke：`/pm` 出现在命令表、`/pm <名称>` 后台账 +1 | `git reset --hard <步前 commit>` |
| [4] 测试随包 | 633 个测试按被测对象迁各包 `tests/`；`tests/stubs`、`tests/setup`、e2e 留根 | `npx vitest run --reporter=json` 用例数 = 基线；全绿 | 同上 |
| [5] 脚本与配置链 | 55 处 `scripts/*` 引用 + `kb/prompts/templates` 三条链改指新落点；`vendor` 路径引用核销 | `pnpm kb:check && pnpm prompts:check && pnpm templates:check` 全绿 | 同上 |
| [5b] 资产与开发侧包化 | `templates` → `pmboard-templates`、`skills` → `pmboard-skills`、`eval-suite` → `pmboard-eval-suite`、`scripts` → `pmboard-scripts`；改运行期解析根（`TemplateRoot` / `SkillAssets` / skill 检索脚本）与根包 `files` | 四包内容 `diff -r` 无输出；「模板 + skill + RTM 资产」三份清单与基线逐字相同；`pnpm pack` 产物含两个资产包；删一个模板文件时解析报错含其路径 | `git reset --hard <步前 commit>` |
| [6] 门禁与收口 | 新增 `scripts/package-boundary-check.mts`（接入 `commit:check`）+ 基线 diff 校验脚本 + 文档与各包 README | `pnpm build` 产出 `dist/index.mjs`/`lib/client.cjs`；三份基线 diff 为空；`pnpm verify:client` 通过 | 同上 |

**迁移不触碰**：`.dsh-data/` 台账、`docs/requirements/**` 内容、`templates/**` 内容、`vendor/reqboard` 内部代码（仅位置）、插件 `package.json` 的 `name/main/types/exports/dsh` 块。

## 回滚路径 `serves: RF-6`

- **步内回滚**：每步一个 commit；失败 `git reset --hard <步前 commit>` 即回到上一个全绿态（工作树无半迁移残渣，因搬迁全部经 `git mv` 登记）。
- **整体回滚**：本次迁移不改数据、不改产物形状，`git revert` 迁移提交串即完全恢复；`dist`/`lib` 由 `pnpm build` 重建，无残留。
- **运行中回滚**：迁移期间插件仍可从既有 `dist/index.mjs` 运行（产物未变）；发布物在 [6] 步前不动。
- **不可回滚的项**：无（无数据迁移、无外部契约变更）。

## 兼容期行为 `serves: RF-1, RF-13`

| 面 | 兼容期行为 |
|---|---|
| 宿主加载 | 全程不变：`main`/`exports`/`dsh` 配置冻结，`dist/index.mjs` 与 `lib/client.js` 路径冻结（RF-1） |
| 插件运行 | 迁移中每一步构建产物均可用（源码包方案：产物仍是单文件内联） |
| 测试入口 | `pnpm test` 命令名不变；多包 include 后单个测试文件路径变化（`tests/x.test.ts` → `packages/<pkg>/tests/x.test.ts`），文档同步更新 |
| 脚本入口 | `pnpm kb:check` / `prompts:check` / `templates:check` / `baseline:*` 名称不变（改的是脚本内部路径） |
| 需求/台账数据 | 全程不变：无迁移、无版本升级（RF-5） |
| 命令面 | 新增：迁移落地前宿主命令表无 `/pm`；落地后出现。命令面缺席不影响工具面/看板面（降级路径，RF-16） |
| 资产路径 | 模板/skill 的**读盘根**从仓库根 `templates/`、`skills/` 变为 `packages/pmboard-templates`、`packages/pmboard-skills`；解析到的文件清单不变（RF-23）。发布物若漏带资产包，宿主运行期读不到 → 解析响亮报错 |
| 类型判据 | 六类型的**必填节 / 必交设计文档 / 条件产物 / 模板引用 / 归档去向**从 core 内的大表搬进六个类型包；对外可观测口径不变（RF-26 快照判据）。core 在装配期拿注册表，缺类即响亮报错 |

## 灰度与观测 `serves: RF-13`

无灰度面（本地构建型重构）。观测手段 = 三份基线 diff：
- dist 导出名单 diff 为空 → RF-1 成立；
- 19 工具注册名单 diff 为空 → RF-2 成立；
- vitest 用例计数 ≥ 基线且全绿 → RF-13 成立。

## 关键决策与取舍 `serves: RF-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么 |
|---|---|---|---|
| 迁移方式 | 一次性大搬迁（一次提交改完 1193 文件） | 七步流水线，每步全绿才进下一步 | 半迁移态不可运行；分步可定位失败面（typecheck 失败能立刻区分是 codemod 规则问题还是反向边问题） |
| import 重写 | 全改 `pmboard-core`（不带目录层级） | 保目录层级 specifier（`pmboard-core/domain/text/fmt.js`） | diff 最小、审查时能看出「原样搬家」；不带层级会让所有跨包 import 长得一样，漏改更难发现 |
| 路径常量 | 只靠 tsc 兜底 | 迁移前先出字符串路径全量 grep 清单 | 字符串里的 `src/...` tsc 不管，只能清单核销（RF-14 判据） |
| 反向边处理时点 | 与搬迁同步做 | 搬迁步 [2] 先过 typecheck，反转步 [3] 单独做 | 两类失败（漏改 vs 设计错）分开暴露，避免混在一起排查 |
| 命令面实现时点 | 并入搬迁步一起做 | 单独列步 [3b] | 命令面是**新写代码**，不是搬迁；与搬迁混在一起时「测试变红」无法区分是漏改还是新代码本身不对 |
| 分层落地顺序 | 19 包一次性成型 | 公共层 [2a] → 类型层 [2a2/2a3] → 主体搬迁 [2b] → 工具单包 [2c] → … → 资产包 [5b] | 依赖图自下而上落位；类型层属**判据搬迁**（风险最高），必须早于 core 单点化，否则无法区分「快照变了是搬错还是改错」 |

## 技术方案与亮点 `serves: RF-14`

- **每步可执行的通过条件**：不是「检查一下」，而是「typecheck 0 error / 用例数 = 基线 / 三链全绿 / diff 为空」四条机械判据。
- **基线先行**：步骤 [0] 在改动任何代码前先固化宿主可见面基线，把「重构没改坏」变成可 diff 的事实，而不是印象。
- **反向边清单是本迁移的设计资产**：6 处反向边逐条给处理方案与变更类型（搬迁 / 小幅改代码），执行者照单执行即可，不依赖对全仓的再理解。
