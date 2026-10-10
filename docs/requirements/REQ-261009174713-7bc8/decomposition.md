---
req_id: REQ-261009174713-7bc8
title: 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件 · 拆分计划
status: decomposing
---

# 拆分计划（REQ-261009174713-7bc8）

> 目标：把平铺单包拆成 **19 个子包**（公共层 + 类型层 + core + 工具单包 + 运行面四包 + 资产四包），并新增 `/pm` 斜杠命令面。
> 做法：按 `design/architecture.md` 的十步流水线切 23 张卡，**自下而上**落位；每卡只改一类东西，验收一律「跑什么 + 看到什么」的行为等价证据（refactor 档要求）。

## 批次与依赖（依赖安全序，禁止前向引用）

```
批 1（基线·骨架）     t1 ──▶ t2 ──▶ t3
批 2（公共层）         t2 ──▶ t4 ──▶ t5 ；t2 ──▶ t6
批 3（类型层）         t4 ──▶ t7 ──▶ t8 ──▶ t9 ──▶ t10 ；t8 ──▶ t11
批 4（core 与运行面）  t5,t6 ──▶ t12 ──▶ t13 / t14 / t15 / t16 / t17 / t18
批 5（资产包）         t2 ──▶ t19
批 6（测试·脚本）      t13..t18 ──▶ t20 ──▶ t21（并入 t19）
批 7（验收·文档）      t21 ──▶ t22 ；t20 ──▶ t23
```

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（编号+文件） | 原型锚点（UI 卡必填） | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段（可选） |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 固化五类迁移基线 | RF-1, RF-2, RF-13, RF-20 | scripts/refactor-baseline.mts + tests/refactor-baseline.test.ts | — | D-4 | analysis | backend | — | 3 files / 4 anchors / 6.5 DU | npx tsx scripts/refactor-baseline.mts --write 退出码 0；.dsh-data/refactor-baseline 列出 5 份；npx vitest run tests/refactor-baseline.test.ts 全绿；工具名单含 19 项 | （按阶段兜底） |
| t2 | （落库后回填） | 建 19 个子包骨架与 workspace 装配 | RF-6, RF-18 | package.json + pnpm-workspace.yaml + tsconfig.json + vitest.config.ts + packages/*/package.json | — | D-2,D-4,D-5 | implement | fullstack | t1 | 4 files / 4 anchors / 7.0 DU | pnpm install 成功；ls packages | wc -l == 19；pnpm typecheck 0 error；pnpm test 用例数与基线一致 | （按阶段兜底） |
| t3 | （落库后回填） | 分层依赖方向门禁与自检 | RF-15, RF-24 | scripts/package-boundary-check.mts + tests/package-boundary.test.ts | — | D-4,D-5 | implement | backend | t2 | 3 files / 4 anchors / 6.5 DU | node scripts/package-boundary-check.mts 退出码 0；四种越界自检 4/4 被非零退出拒绝；pnpm commit:check 含该步 | （按阶段兜底） |
| t4 | （落库后回填） | 公共包 pmboard-common 落位 | RF-19, RF-12 | packages/pmboard-common/src/* + tests/common-package-purity.test.ts | — | D-4 | implement | backend | t2 | 6 files / 4 anchors / 8.0 DU | pmboard-common/package.json dependencies 为空；node scripts/package-boundary-check.mts 对该包退出码 0；npx vitest run tests/common-package-purity.test.ts 全绿 | （按阶段兜底） |
| t5 | （落库后回填） | protocol 与 board-summary 拆半 | RF-19 | packages/pmboard-common/src/protocol.ts + packages/pmboard-core/src/protocol-domain.ts | — | D-4 | implement | backend | t4 | 5 files / 3 anchors / 6.5 DU | grep -rn "pmboard-core" packages/pmboard-common/src | wc -l == 0；pnpm typecheck 0 error；pnpm test 用例数 ≥ 基线 | （按阶段兜底） |
| t6 | （落库后回填） | RTM 引擎成包 reqboard-rtm | RF-21 | packages/reqboard-rtm/** + 引用方 import | — | D-4 | implement | backend | t2 | 3 files / 3 anchors / 5.5 DU | grep -rn "vendor/reqboard" src packages | wc -l == 0；引擎 28 文件哈希与基线一致；pnpm typecheck 0 error | （按阶段兜底） |
| t7 | （落库后回填） | 类型层契约 pmboard-type-kit | RF-25, RF-28 | packages/pmboard-type-kit/src/{index,registry,validate}.ts | — | D-5 | implement | backend | t4 | 5 files / 4 anchors / 7.5 DU | npx vitest run packages/pmboard-type-kit/tests 全绿；注册表缺类抛错含 category；两次快照 dump 逐字相同 | （按阶段兜底） |
| t8 | （落库后回填） | 六个类型包规格落位 | RF-25 | packages/pmboard-type-{feature,bug,doc,refactor,spike,chore}/src/index.ts | — | D-5 | implement | backend | t7 | 6 files / 3 anchors / 8.0 DU | 六包 npx vitest run packages/pmboard-type-*/tests 全绿；六 spec 的 category 集合 == {feature,bug,doc,refactor,spike,chore} | （按阶段兜底） |
| t9 | （落库后回填） | 六类型规格快照测试 | RF-26 | tests/type-spec-snapshot.test.ts | — | D-5 | test | backend | t8 | 2 files / 3 anchors / 5.0 DU | npx vitest run tests/type-spec-snapshot.test.ts 全绿；故意改一处 rootSectionsDelta 后该测试必须失败（自检） | （按阶段兜底） |
| t10 | （落库后回填） | core 类型逻辑单点化 | RF-26 | packages/pmboard-core/src/application/internal/*（按类型分支处） | — | D-5 | implement | backend | t9 | 5 files / 3 anchors / 6.5 DU | grep -rn "category === '" packages/pmboard-core/src | wc -l == 0；npx vitest run tests/type-spec-snapshot.test.ts 仍全绿 | （按阶段兜底） |
| t11 | （落库后回填） | 类型提示词片段按类型切分 | RF-27 | scripts/inline-prompt-fragments.mjs + check-prompt-fragments.mjs + tests/prompt-fragment-count.test.ts | — | D-5 | implement | backend | t8 | 4 files / 4 anchors / 7.0 DU | node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs 退出码 0；六类型各 18 条 + 通用 21 条；pnpm prompts:check 全绿 | （按阶段兜底） |
| t12 | （落库后回填） | core 包落位与 import 重写 | RF-7 | packages/pmboard-core/src/**（domain/application/repositories/stage-overview/plugin-config/dive-core） | — | D-4 | implement | backend | t5, t6 | 6 files / 3 anchors / 7.5 DU | npx vitest run packages/pmboard-core/tests 全绿；pnpm typecheck 0 error；pnpm test 用例数 ≥ 基线 | （按阶段兜底） |
| t13 | （落库后回填） | 回合驱动包（dive 劈两半的驱动面） | RF-9 | packages/pmboard-round-driver/src/**（9 个驱动文件） | — | D-2 | implement | backend | t12 | 4 files / 3 anchors / 6.5 DU | npx vitest run packages/pmboard-round-driver/tests 全绿；node scripts/package-boundary-check.mts 对该包退出码 0；用例数 ≥ 基线 | （按阶段兜底） |
| t14 | （落库后回填） | jobs 兜底改端口注入 | RF-12 | packages/pmboard-core/src/application/use-cases/QueryRunStatus.ts + 根包装配 | — | D-4 | implement | backend | t12 | 3 files / 3 anchors / 5.5 DU | grep -rn "adapters/DshJobsAdapter" packages/pmboard-core/src | wc -l == 0；QueryRunStatus 注入/缺省两分支单测全绿 | （按阶段兜底） |
| t15 | （落库后回填） | 工具层单包 tool-pmboard | RF-8, RF-20 | packages/tool-pmboard/src/{kit,intake,decompose,verify,collab,registry.ts} | — | D-5 | implement | backend | t12 | 5 files / 4 anchors / 7.5 DU | TOOL_REGISTRY 聚合哈希与基线一致；npx vitest run packages/tool-pmboard/tests 全绿；ls packages/tool-pmboard/src 含 kit/intake/decompose/verify/collab/registry.ts | （按阶段兜底） |
| t16 | （落库后回填） | workflow 包与端口契约 | RF-10 | packages/pmboard-workflow/src/{ports.ts,WorkflowEngineRunner.ts,WorkflowSchemaAdapter.ts} | — | D-4 | implement | backend | t12 | 4 files / 3 anchors / 6.5 DU | core 的 ports.ts 中 WorkflowRunner 只出现 re-export 行；node packages/pmboard-workflow/scripts/workflow-engine-smoke.ts 退出码 0 | （按阶段兜底） |
| t17 | （落库后回填） | client 包与构建入口 | RF-11, RF-4 | packages/pmboard-client/src/** + tsdown.client.config.mjs | — | D-4 | implement | frontend | t12 | 4 files / 3 anchors / 6.5 DU | node scripts/verify-client-build.mjs 退出码 0；pnpm build 产出 lib/client.js；npx vitest run packages/pmboard-client/tests 全绿 | （按阶段兜底） |
| t18 | （落库后回填） | 斜杠命令面 command-pmboard | RF-16, RF-17, RF-18 | packages/command-pmboard/src/{index,parse,command,render}.ts + 根包接线 | — | D-3 | implement | backend | t12 | 5 files / 5 anchors / 8.0 DU | npx vitest run packages/command-pmboard/tests 全绿（注册/重复降级/无服务降级/文法表/创建/已绑定 ≥7 例）；宿主命令表含 pm；pnpm build 后加载 dist 不抛 | （按阶段兜底） |
| t19 | （落库后回填） | 资产四包化与发布完整性 | RF-22, RF-23 | packages/{pmboard-templates,pmboard-skills,pmboard-eval-suite,pmboard-scripts}/ + adapters/TemplateRoot.ts + SkillAssets.ts | — | D-4 | implement | fullstack | t2 | 5 files / 4 anchors / 7.5 DU | 四包 diff -r 与基线无输出；pnpm pack 产物含 pmboard-templates 与 pmboard-skills；删一个模板文件后解析报错含其路径；资产清单与基线逐字相同 | （按阶段兜底） |
| t20 | （落库后回填） | 测试随包迁移 | RF-13 | packages/*/tests/** + vitest.config.ts | — | D-4 | test | fullstack | t13, t14, t15, t16, t17, t18 | 4 files / 3 anchors / 6.5 DU | npx vitest run --reporter=json 用例总数 ≥ 基线且全绿；根 tests/ 只剩 e2e 与集成测试 | （按阶段兜底） |
| t21 | （落库后回填） | 脚本与配置链迁移 | RF-14 | package.json + scripts 链常量 + tsconfig paths + vitest alias | — | D-4 | implement | backend | t19, t20 | 5 files / 3 anchors / 7.0 DU | pnpm kb:check && pnpm prompts:check && pnpm templates:check 全绿；脚本内旧路径（src/application|src/tools|src/client）grep 计数 == 0 | （按阶段兜底） |
| t22 | （落库后回填） | 五类基线 diff 与宿主 smoke 验收 | RF-1, RF-2, RF-3, RF-5, RF-23, RF-24 | 五类基线 diff + 宿主 smoke 输出 | — | D-1 | test | fullstack | t21 | 4 files / 5 anchors / 7.5 DU | 五份 diff 全空（退出码 0）；smoke 输出 19 工具名与基线逐字一致；pnpm build && pnpm test 全绿 | （按阶段兜底） |
| t23 | （落库后回填） | 文档收口（19 份包 README 与架构篇章） | RF-6, RF-19 | README.md + docs/architecture + packages/*/README.md + CHANGELOG.md | — | D-4,D-5 | doc | doc | t20 | 4 files / 3 anchors / 6.5 DU | 19 个 packages/*/README.md 存在且含「允许依赖」节；README.md 含 19 包分层图；pnpm kb:check 全绿 | （按阶段兜底） |

- 一个任务只干一件事，标题动词开头。
- 落点写路径；UI 卡的原型锚点列为「—」（本需求零可视变化）。
- 卡间依赖零文件交集的边，语义理由见随卡提交的 `dep_reasons`。

## 接口清单 ↔ 接收卡 key（对照表）

| 接口 | 接收卡 key |
|---|---|
| `ctx.commands.register`（/pm 命令定义） | t18 |
| `pmboard-common/src/protocol.ts`（纯帧半，拆半） | t5 |
| `pmboard-workflow/src/ports.ts`（workflow 三契约类型） | t16 |
| core 的 jobs 解析口（去掉自建适配器，改注入） | t14 |
| 资产解析根（模板 / skill / RTM） | t19 |
| 工具注册表 `TOOL_REGISTRY` | t15 |
| `RequirementTypeSpec` + `createTypeRegistry()` | t7 |
| 类型包 → 模板引用（`spec.templates`） | t8 |

> 组件树 ↔ 接收卡 key：不适用——本需求零可视变化（页面 DOM/样式/交互逐字不动，行为不变式 RF-4 覆盖）。

## 容量与粒度自检

- 23 张卡全部 `detailUnits ≤ 16`（最大 t4/t8/t18 = 8.0 DU，容量缺省 16 DU）→ 无超容量卡。
- `footprint.files ≥ implementation` 里点到的路径数；单卡最多 6 个路径（>5 的 t4/t8/t12 为结构性搬迁卡，已在其卡上写 `granularity_exempt` 理由）。
- 每卡带 `requirement_refs`（RF-1..RF-28 全覆盖，无孤条款）；跨卡依赖零文件交集的边已写 `dep_reasons`。
- 联调面：本需求为结构搬迁 + 门禁改造，卡间无运行期接口可联调（各卡 `skipIntegration` 写理由），联调与宿主 smoke 集中在 t22。

## 风险与回滚

| 风险 | 兜底 |
|---|---|
| 判据搬迁漂移（类型层） | t1 先固化六类型规格快照；t9 逐字比对；t10 之后快照仍须一致 |
| import 重写漏改 | 每卡 `pnpm typecheck` 0 error + 用例数 ≥ 基线；t22 五类 diff 收口 |
| 发布漏带资产包 | t19 的 `pnpm pack` 断言 + 缺资产报错含期望路径 |
| 半迁移态 | 每卡独立提交、失败 `git reset --hard` 回退；顺序自下而上，下层未绿不进上层 |
