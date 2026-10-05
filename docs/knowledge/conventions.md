# 代码规范（项目知识层 · 规范页）

> **TL;DR**：本仓的硬纪律**每条都有一条能跑的校验**——"违反了会红在哪"写在规则里。
> 用本页的方式：改造前先扫一遍规则名，改完把相关 `校验：` 命令跑一遍（这就是"自证"）。
> 新增规则时，**必须挂一条真实存在的校验目标**（目录/测试/脚本），否则 `kb-probe` 会失败（C-09）。

## 规则清单 #rules

### C-01 层边界只许向内 #c-01

- **一句话**：`domain` 不得 import `node:` / 框架 / 上层模块；`application` 只依赖 domain 与 shared 的类型。
- **校验**：`npx vitest run tests/layer-boundary.test.ts`
- **违反症状**：测试红并打印"越界 import：文件 → 说明符"。

### C-02 宿主单文件不超过 400 行 #c-02

- **一句话**：`src/**/*.ts` 单文件行数 ≤400（白名单必须带理由且仍超限，防止门禁被软化）。
- **校验**：`npx vitest run tests/size-budget.test.ts`
- **违反症状**：测试红并给出超限文件与行数。

### C-03 注入预算不裁保底 #c-03

- **一句话**：提示词片段超预算时只能裁非 floor 片段；连 floor 都装不下 → 返回结构化 `overBudget`，**不得静默裁剪**。
- **校验**：`npx vitest run tests/prompt-gates.test.ts`
- **违反症状**：测试红（floor 片段缺席或未报超限）。

### C-04 客户端构建纪律 #c-04

- **一句话**：client 代码引入的裸 npm 包必须打进 bundle；产物缺关键符号 / 样式分片被截断 → **阻断构建**。
- **校验**：`pnpm build:client`
- **违反症状**：非零退出，打印缺失符号或分片截断位置。

### C-05 样式表必须自带归属章 #c-05

- **一句话**：注入的样式表必须带 `data-plugin` 归属章，且注入发生在模块工厂执行期；被删要能自愈。
- **校验**：`npx vitest run tests/client-styles-ownership.test.ts`
- **违反症状**：测试红（认领被抢 / 删除后不回 / 重复插表）。

### C-06 产物闸门不可绕过 #c-06

- **一句话**：未确认产物不得推进阶段；计划未批准不得落库任务——由代码级拒绝兜底，不是提示。
- **校验**：`npx vitest run tests/artifact-gates.test.ts`
- **违反症状**：测试红；线上表现为 `reqboard_move` 返回 `artifact_not_confirmed`。

### C-07 条款与章节必须被接收 #c-07

- **一句话**：需求条款（FR-N）必须被任务卡接收、设计章节必须带 `serves:` 标注，否则门禁拦下。
- **校验**：`npx vitest run tests/content-gates.test.ts`
- **违反症状**：测试红；线上表现为 `requirement_uncovered` / `design_orphan`。

### C-08 验收标准必须可执行 #c-08

- **一句话**：任务卡的验收标准必须含可执行锚点（命令/断言），空话会被打回。
- **校验**：`npx vitest run tests/acceptance-criteria.test.ts`
- **违反症状**：测试红；线上表现为拆分计划提交被拒。

### C-09 知识层自检 #c-09

- **一句话**：知识索引与页面必须守住预算（索引 ≤8000 字符/200 行、页面 ≤200 行），
  且**无死链、无孤儿、无过期、生成物零漂移、每条规范都挂真实校验**。
- **校验**：`npx tsx scripts/kb-probe.mts`
- **违反症状**：非零退出，逐条列出问题（行号 / 条目 id / 漂移文件）。

### C-10 生成物不可手改 #c-10

- **一句话**：`docs/knowledge/code-map.md`、`design-tokens.md` 与两份 `.tsv` 是生成物，改源码后重跑生成器。
- **校验**：`npx tsx scripts/kb-build.mts --check`
- **违反症状**：非零退出并指出首个差异行。

## 工程操作 #operations

> 时机四档：**开工前**（认清接口与边界）· **改动后**（重生成 / 构建 / 自检）· **提交前**（测试与基线比对）· **发版前**（构建、类型、镜像同步）。
> 本节条目由 `scripts/kb-conventions-sync.mts` 按**覆盖清单**生成骨架（命令与期望自动填），「失败怎么办」由人补全；
> 覆盖度由 `kb-probe` 的 **K10** 检查——必跑项漏进本节即门禁红（不含"警告放过"）。
> **拆页判据**：本页 >180 行预警、>200 行（K3 红）时，把本节整体搬到 `docs/knowledge/operations.md`，
> 索引行指针改指新页（`operations.md#c-nn`），并在 `KB_PAGE_PATHS` 增加 `operations`。

### C-11 发版前必须构建（host + client） #c-11
- 时机：发版前
- 命令：`pnpm build`
- 期望：`退出码 0，且 dist/（host）与 lib/client.js（client）都有新产物`
- 失败怎么办：先看 tsdown 的首个 error 行；client 侧失败多为样式分片问题 → 见 C-12 的修复路径

### C-12 改了客户端源码必须重建 bundle #c-12
- 时机：改动后
- 命令：`pnpm build:client`
- 期望：`[verify-client] OK … 关键符号齐全, 样式归属章在场, CSS 分片完整`
- 失败怎么办：缺归属章 → 见 C-05；分片截断 → 检查 src/client/styles/base.ts 等分片是否以模板字符串收尾

### C-13 改了知识层内容必须重生成并自检 #c-13
- 时机：改动后
- 命令：`pnpm kb:check`
- 期望：`退出码 0（生成物零漂移 + 九项自检 + K10 覆盖度全过）`
- 失败怎么办：生成物漂移 → 先跑 `pnpm kb:build`；覆盖缺口 → 跑 scripts/kb-conventions-sync.mts 的 --write 补骨架

### C-14 提交前必须跑测试并与基线比对 #c-14
- 时机：提交前
- 命令：`pnpm test`
- 期望：`退出码可为 1（仓库既有失败），但失败数 ≤ 基线 106 且新增用例全绿`
- 基线：`npx vitest run` 先在 HEAD worktree 上跑一次取失败数（当前基线 106 failed / 2807 passed），本次不高于它即算过
- 失败怎么办：与 HEAD 基线比对（见 docs/requirements/REQ-261001110934-3766/evidence/full-test-comparison.txt）；出现新增失败即本次改动引入

### C-15 改了源码必须跑类型检查 #c-15
- 时机：改动后
- 命令：`pnpm typecheck`
- 期望：`退出码 0（改动文件零错误；index.ts 等历史错误另计）`
- 基线：`npx tsc --noEmit` 先在 HEAD worktree 上跑一次取错误数（当前 223 个），本次不高于它即算过
- 失败怎么办：按报错文件路径修（如 src/index.ts）；疑似既有历史错误 → 与 HEAD 基线对比确认非本次引入

### C-16 改了提示词片段必须重生成产物 #c-16
- 时机：改动后
- 命令：`node scripts/inline-prompt-fragments.mjs`
- 期望：`退出码 0 且 src/domain/prompt/generated/ 下产物被更新`
- 失败怎么办：片段语法/围栏错误 → 检查 src/domain/prompt/fragments/ 下对应 .md 的代码围栏与占位符

### C-17 重生成后必须校验片段与产物一致 #c-17
- 时机：改动后
- 命令：`node scripts/check-prompt-fragments.mjs`
- 期望：`退出码 0（片段与产物一致，且 heavy.md 与 vendor 原文一致）`
- 失败怎么办：不一致 → 先跑 C-16 重生成；heavy.md 与 vendor 不一致 → 重新内联后再提交

### C-18 发版前必须同步镜像仓库 #c-18
- 时机：发版前
- 命令：`bash scripts/sync-to-github.sh`
- 期望：`退出码 0，脚本输出显示镜像仓库收到新提交`
- 失败怎么办：看脚本输出的 git 错误行；权限/凭证问题检查远端配置与 ~/.dsh/.credentials.yaml

### C-19 新增 stageKind 必须完成登记点全表 #c-19
- 时机：改动后
- 命令：`npx tsc --noEmit && npx vitest run tests/domain/subtask-template.test.ts tests/execute-task.test.ts tests/card-types.integration.test.ts`
- 期望：`退出码 0（五表 Record 类型强制使漏登记 = 编译错；用例含六表同 key 集合断言）`
- 失败怎么办：按登记表逐处补——① `SubtaskTemplate.ts` 四表（KINDS/LABELS/ACCEPTANCE/EVIDENCE_KIND）② `card-types.ts` 的 `STAGE_TO_PHASE_COLOR` ③ `ExecuteTask.ts` 的 `STAGE_SCOPE_RULE` ④ AdvanceChain 行为分支（仅当新段有特殊链行为，如 manual 的停链等人）⑤ eval-suite fixtures（默认链变更时同步并跑 validate_eval_suite.py）⑥ 模板键新增时同步 SubmitTool schema 描述。自动跟随（无需登记但要知道）：workflow 脚本 schema 族（派生自 EVIDENCE_KIND）、客户端徽标（STAGE_LABELS 单点）与 DAG 排序（deriveTaskFields 自 STAGE_KINDS 派生，REQ-261003203909-55f2 修复前是硬编码四段）

### C-20 工程操作：npx tsx scripts/reverse-drill-matrix.mts #c-20
- 时机：改动后
- 命令：`npx tsx scripts/reverse-drill-matrix.mts`
- 期望：`[通过]` + 退出码 0；六条护栏逐条显示"红 N/应≥M"且"已逐字节还原"
- 失败怎么办：❌没变红 ⇒ 该护栏空转，回去补判据用例（对照 tests/store-projection-ryow.test.ts）；还原失败 ⇒ 脚本已中止，用备份手工核对，禁止 git checkout（工作区多窗口未提交）。

### C-21 工程操作：npx tsx scripts/reconcile-terminal-drill.mts #c-21
- 时机：改动后
- 命令：`npx tsx scripts/reconcile-terminal-drill.mts --src <台账副本路径>`
- 期望：`[通过] 对账对台账副本零改写` + 退出码 0；输出里"改动/新增/删除"三项全为 0
- 失败怎么办：三项有非 0 ⇒ 对账真的改动了台账，查 src/application/internal/reconcile-terminal-dive.ts 是否绕过了冷侧守卫；演练只在副本上跑。

## 怎么用这份清单 #howto

| 时机 | 动作 |
|---|---|
| 开工前 | 扫一遍规则名，挑出本次会碰到的 2–3 条 |
| 改完 | 把这几条的 `校验：` 命令各跑一遍，输出摘要进任务汇报 |
| 新增纪律 | 在 `#rules` 下加 `### C-NN` 小节 + 一条**真实存在**的校验目标，然后跑 C-09 |
| 校验失效 | 如果某条命令已经跑不动了，**先修校验再改规则**——没有校验的规则等于没有 |
