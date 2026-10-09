---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件 · 迁移设计
status: design
serves: RF-6, RF-7, RF-13, RF-14
---

# 迁移设计（REQ-261009174713-7bc8）

> 本需求是**代码物理位置迁移**：零数据迁移、零运行时行为变更（RF-1..RF-5 行为不变式）。
> 迁移的风险不在数据，在**半迁移态**与**路径引用漏改**——本文按「每步自成闭环、失败即整步回滚」设计。

## 迁移步骤 `serves: RF-6, RF-14`

七步，每步以「命令 + 通过条件」收口；任一步不达标即回滚该步（`git checkout -- .` + 清理未跟踪文件），不进下一步。

| 步 | 动作 | 通过条件（可执行） | 回滚 |
|---|---|---|---|
| [0] 基线 | 三份基线落 `.dsh-data/refactor-baseline/`：`dist` 导出名单（`node -e "import('./dist/index.mjs')…"`）· 19 工具注册名单（smoke 脚本打印）· `npx vitest run --reporter=json` 用例计数 | 三份文件非空且计数 ≥ 现值（工具 19 / 用例数为准） | 删目录 |
| [1] 骨架 | 建 `packages/{pmboard-core,tool-pmboard,pmboard-round-driver,pmboard-workflow,pmboard-client}`（各 `package.json`/`tsconfig.json`/`README.md`）；改 `pnpm-workspace.yaml`、根 `package.json`（+五个 workspace 依赖）、根 `tsconfig.json`（+paths）、`vitest.config.ts`（+include/alias） | `pnpm install` 成功；`pnpm typecheck` 与 `pnpm test` 与基线一致（此步未移动任何业务代码） | `git checkout -- .` |
| [2] codemod 搬迁 | 按 architecture.md 落位表 `git mv`；codemod 重写 import：同包内相对路径不动、跨包改包名 specifier（`pmboard-core/domain/...`）、测试的 `../src/...` 改包名 | `pnpm typecheck` 全绿（0 error）；`pnpm test` 全绿且用例数 ≥ 基线 | `git reset --hard <步前 commit>` |
| [3] 反向边反转 | 6 处反向边按 architecture.md「其余 5 处反向边」+ dive 劈两半处理 | 边界门禁脚本雏形通过：无 core→子包 import | `git reset --hard <步前 commit>` |
| [4] 测试随包 | 633 个测试按被测对象迁各包 `tests/`；`tests/stubs`、`tests/setup`、e2e 留根 | `npx vitest run --reporter=json` 用例数 = 基线；全绿 | 同上 |
| [5] 脚本与配置链 | 55 处 `scripts/*` 引用 + `kb/prompts/templates` 三条链改指新落点；`vendor` 路径引用核销 | `pnpm kb:check && pnpm prompts:check && pnpm templates:check` 全绿 | 同上 |
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

## 技术方案与亮点 `serves: RF-14`

- **每步可执行的通过条件**：不是「检查一下」，而是「typecheck 0 error / 用例数 = 基线 / 三链全绿 / diff 为空」四条机械判据。
- **基线先行**：步骤 [0] 在改动任何代码前先固化宿主可见面基线，把「重构没改坏」变成可 diff 的事实，而不是印象。
- **反向边清单是本迁移的设计资产**：6 处反向边逐条给处理方案与变更类型（搬迁 / 小幅改代码），执行者照单执行即可，不依赖对全仓的再理解。
