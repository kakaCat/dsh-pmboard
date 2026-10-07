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
- **违反症状**：测试红；线上表现为拆分计划提交被拒。（**条款层同族判据（2026-10-06 加固，只提示不拦）**：需求文档每条条款的定义行块内也要有可核验判据（命令 / 断言 / 可读数 / 明确取值）——判据质量人定，机械层只判「有没有」，故缺了不拒：进 `clause_criteria_warnings`（校验 `tests/clause-criteria.test.ts`，含「删掉锚点必须报警」的反向演练）。同批加固另有两条硬门：feature / refactor 的 `sides` 必须显式且值域合法（`tests/sides-declaration.test.ts`）、新需求必须有「失败与并发路径」节（`tests/doc-quality-gate.test.ts`；**刻意不进 CATEGORY_DELTAS**——进去会追溯存量需求）。）

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
- 命令：`pnpm baseline:check`
- 期望：`退出码 0（失败用例集合差为空）`
- 基线：`docs/reviews/test-baseline.md`（现行基线的唯一数字来源；判据是**失败用例集合差**，不是计数上限）
- 失败怎么办：差集非空先逐条确认是否本次引入；确认非本次引入才跑 `pnpm baseline:refresh`（= 承认现状）并写明理由；判据脚本见 scripts/test-baseline.mts

### C-15 改了源码必须跑类型检查 #c-15
- 时机：改动后
- 命令：`pnpm typecheck`
- 期望：`退出码 0（错误数与基线文件里的 tsc 读数一致）`
- 失败怎么办：按报错文件路径修（如 src/index.ts）；疑似历史存量错误 → 与基线文件里同刻的 tsc 读数比对确认非本次引入

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

### C-22 收录/更新上游 skill 资产必须重算指纹 #c-22
- 时机：改动后
- 命令：`node scripts/vendor-skills.mjs && node scripts/vendor-skills.mjs --check`
- 期望：`退出码 0（28 条 sha256 与磁盘一致、清单 7 项与一级目录一致、体积 ≤ 5MB）`
- 失败怎么办：指纹不一致 ⇒ 有人手改了包内资产（`--check` 会点名到文件），重跑收录脚本还原；上游换版本 ⇒ 显式 `--from <签出目录>` 替换 + 重跑本命令 + 在需求目录留变更说明（**禁止静默漂移**）；体积超限 ⇒ 检查裁剪清单，`tests/skills-assets.test.ts` 会一并变红。

### C-23 改了提示词片段必须重生成并校验（一条命令） #c-23
- 时机：提交前
- 命令：`pnpm prompts:check`
- 期望：`退出码 0`（两条脚本各打一行 OK；inline 失败即短路，不会跑到 check）
- 失败怎么办：`inline-prompt-fragments.mjs` 报产物不存在/写入失败 ⇒ 先单独跑 `node scripts/inline-prompt-fragments.mjs`；`check-prompt-fragments.mjs` 报「与 fragments/**.md 不一致」 ⇒ 有人只改了 src/domain/prompt/fragments/** 或只改了 src/domain/prompt/generated/fragments.ts，重生成前不许提交；报「heavy.md ↔ vendor 原文不一致」 ⇒ 把 vendor/superpowers/<skill>/SKILL.md 原样复制为 fragments/<stage>/heavy.md（逐字节）。

### C-24 模板与门禁必须同源（节名与必填节） #c-24
- 时机：改动后
- 命令：`pnpm templates:check`
- 期望：`退出码 0`（R1/R2 两条探针各打一行 OK，缺口 0）
- 失败怎么办：R1 点名某份模板缺必填节/缺 serves ⇒ 补 templates/**/*.md 正文（不是放宽门禁）；报「未登记占位符」 ⇒ 在 scripts/template-render-map.json 登记取值；R2 报「模板多一节 / 少一节」 ⇒ 对齐 templates/brainstorming/<category>.md 的 H2 与门禁必填节集合（真源 src/application/internal/category-doc-sets.ts），别改探针凑绿。

### C-25 模板探针的标本模式（人为改坏必红） #c-25
- 时机：改动后
- 命令：`pnpm templates:probe`
- 期望：`退出码 0`（每条标本都按预期判红，末尾 specimen OK）
- 失败怎么办：某条标本「没判红」 ⇒ 探针本身空转，先修探针再谈模板（改的是 scripts/template-gate-probe.mts 与 scripts/doc-section-parity.mts 的 specimen 分支）；标本报 ERROR（退出码 2） ⇒ 前置不可用（模板目录/渲染映射表读不出），先补环境。

### C-26 提示词注入面里的路径指针必须可达 #c-26
- 时机：改动后
- 命令：`npx tsx scripts/prompt-path-probe.mts`
- 期望：`退出码 0` + 输出 `[prompt-path-probe] OK 路径可达…缺口 0`
- 失败怎么办：FAIL 行逐条点名 `<token> ← 文件:行` ⇒ 该指针指向的文件不存在（多为模板/文档改名或迁移）：把指针改成真实路径；若它确实是「由需求自己生成、当下不存在」的产物名或外部路径，才在 scripts/prompt-path-probe.mts 的 WHITELIST 登记并写清理由。报 ERROR（退出码 2） ⇒ 工作区根或扫描目标缺失，确认在仓库根执行；另外 `--specimen` 必须绿（否则判据空转）。

### C-27 工程操作：pnpm prompts:verify #c-27
- 时机：改动后
- 命令：`pnpm prompts:verify`
- 期望：`退出码 0（命令成功）`
- 失败怎么办：先看 C-16 / C-17——改了提示词片段却没重生成产物是这条命令最常见的失败；跑 `node scripts/inline-prompt-fragments.mjs` 重生成后再复跑，产物与片段的对应关系见 `scripts/check-prompt-fragments.mjs` 的清单（REQ-261006123819-3af3 FR-4 补齐原骨架占位）
### C-28 改动后必须提交 #c-28
- 时机：提交前
- 命令：`pnpm commit:check --req <REQ-id>`
- 期望：`退出码 0（打印 OK，且该需求 id 至少有一条提交）`
- 失败怎么办：按本次改动文件集合 `git add <文件>` 后提交，提交信息含需求 id（如 REQ-261006123819-3af3）；**不要**提交别的窗口的在飞改动；判据脚本见 scripts/commit-check.mts（REQ-261006123819-3af3 FR-5）
### C-29 全量测试入口 #c-29
- 时机：提交前
- 命令：`pnpm test`
- 期望：`退出码 0 或 1（仓库存量失败），逐条与基线文件比对看新增`
- 失败怎么办：判据不在这里——按 C-14 的集合差口径逐条确认是否本次引入（REQ-261006123819-3af3 FR-2）

### C-30 改了详情页外观必须比对逐组件快照 #c-30
- 时机：改动后
- 命令：`npx tsx scripts/report-style-snapshot.mts --check`
- 期望：`退出码 0；报告逐组件给「键数 / 不同键数」，不同键数全 0（28 个采样条件）`
- 失败怎么办：差异会点名 `组件 · 选择器 · 属性 · 基线值 → 现值`。是**有意的**外观改动 → 跑一次 `--write` 显式更新基线并在提交说明写清；是漏改/改到别处 → 回滚那一处（分片见 `src/client/styles/report/manifest.ts` 的 `shard`）。**不许**用 `--write` 把差异盖掉（那等于关掉判据）。先确认门禁真的会红：同脚本加 `--self-test`

### C-31 组件样式只许住自己的分片 #c-31
- 时机：改动后
- 命令：`npx tsx scripts/report-style-ownership.mts`
- 期望：`退出码 0；组件越界 0 处 / 公共层含具体组件取值 0 处 / 未登记 0 处`（另附 10 个 DOM 根实检与清单完整性）
- 失败怎么办：输出会点名「它属于谁」。组件专属规则搬回它的分片（谁住哪看 `src/client/styles/report/manifest.ts`）；跨 ≥2 组件的成组规则留公共层；跨组件零件要写进 `scripts/report-style-ownership.mts` 的**逐条带理由**白名单。改分片文本时注意：分片结尾是一段悬挂的段落头注释，追加内容要插在它**之前**（否则整批规则落进注释里失效）。先确认门禁真的会红：同脚本加 `--self-test`

### C-32 要看 token 花在哪儿就出报表 #c-32
- 时机：改动后
- 命令：`pnpm cost:report`
- 期望：`退出码 0；按阶段 / 按轮的 token 与费用读数（数字来源同「Token」Tab 的汇总口径）`
- 失败怎么办：读数与页面不符 → 先跑 C-31 的同源门禁；脚本本身见 `scripts/token-cost-report.mts`（改动它要同步 `docs/knowledge/operations.tsv`）






## 怎么用这份清单 #howto

| 时机 | 动作 |
|---|---|
| 开工前 | 扫一遍规则名，挑出本次会碰到的 2–3 条 |
| 改完 | 把这几条的 `校验：` 命令各跑一遍，输出摘要进任务汇报 |
| 新增纪律 | 在 `#rules` 下加 `### C-NN` 小节 + 一条**真实存在**的校验目标，然后跑 C-09 |
| 校验失效 | 如果某条命令已经跑不动了，**先修校验再改规则**——没有校验的规则等于没有 |

