---
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 架构设计 — 更新 vendor superpowers 分片到本地最新版 `serves: FR-1`

> 面向零上下文执行者：本文给出**变更全貌 + 强制约束 + 风险**。落地步骤（任务表）属拆分阶段，本文不写。

## 目标与总体方案 `serves: FR-1`

把仓内 `src/domain/prompt/vendor/superpowers/` 的 14 份上游原文从 **v6.3.0** 升到本地已有的 **v6.4.2**，并保证注入链路不被这次升级打断。

### 上游基线对照（本次换代的唯一事实） `serves: FR-1`

| 项 | 仓内现值（v6.3.0） | 本地新值（v6.4.2） |
|----|-------------------|-------------------|
| 上游仓库 | `https://github.com/obra/superpowers.git` | 同 |
| commit | `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` | `8ca22dba9a94f28898bbce59f2537ff4d87c747d` |
| tag | `v6.3.0` | `v6.4.2` |
| 本地路径 | `/Users/yunpeng/.claude/skills/superpowers`（历史抓取机） | `/Users/mac/Documents/ai/skills/superpowers` |
| 抓取时点 | 2026-09-17 22:42:44 CST | 本次（按执行当日填） |

### 14 份原文的差异实测（8 份字节不同 + 6 份完全一致） `serves: FR-1`

下表是**实测字节/行数**（本地 = v6.4.2，仓内 = v6.3.0）。「注入影响」列决定这份文件是否真的改变 agent 行为——这是本设计的核心判断。

| skill | 本地字节 | 仓内字节 | 本地行 | 仓内行 | 本仓角色 | 注入影响 |
|-------|--------:|--------:|------:|------:|----------|---------|
| executing-plans | 20405 | 2305 | 373 | 64 | **heavy 主 skill（implementing）** | **是（唯一）** |
| brainstorming | 17548 | 15456 | 285 | 250 | 留档不注入 | 否 |
| writing-plans | 10335 | 7053 | 204 | 171 | 留档不注入 | 否 |
| test-driven-development | 9578 | 9015 | 330 | 320 | 留档（未注册分片） | 否 |
| subagent-driven-development | 32577 | 32339 | 568 | 568 | 留档（未注册分片） | 否 |
| writing-skills | 26623 | 26360 | 681 | 679 | 留档（未注册分片） | 否 |
| using-superpowers | 3192 | 3108 | 65 | 63 | 留档（未注册分片） | 否 |
| requesting-code-review | 2977 | 2956 | 95 | 95 | 留档（未注册分片） | 否 |
| verification-before-completion | 3646 | 3646 | 120 | 120 | heavy 主 skill（accepting） | 否（未变） |
| finishing-a-development-branch | 7781 | 7781 | 225 | 225 | heavy 主 skill（archived） | 否（未变） |
| dispatching-parallel-agents | 6078 | 6078 | 167 | 167 | 留档（未注册分片） | 否 |
| receiving-code-review | 6203 | 6203 | 205 | 205 | 留档（未注册分片） | 否 |
| systematic-debugging | 9465 | 9465 | 283 | 283 | 留档（未注册分片） | 否 |
| using-git-worktrees | 6813 | 6813 | 167 | 167 | 留档（未注册分片） | 否 |

**结论**：14 份都要同步（档案一致性），但**只有 executing-plans 会改变注入行为**——它镜像进 `fragments/implementing/heavy.md`。

### 为什么其余 13 份不改变注入行为（已逐项验证，不是推断） `serves: FR-1`

`FRAGMENT_LIBRARY` 实测 **129 条**，构成 = 节点难度档 12（6 节点 × light/heavy）+ `brainstorming/heavy-extra` 1 + 难度 overrides 7（5 份 heavy + 2 份 light）+ `common/iron-rules` 1 + 类型档 36 + 类型档路由壳 72 = 129。**没有任何一条对应附属 vendor skill**。

镜像映射 `VENDOR_MAIN_SKILLS`（`scripts/inline-prompt-fragments.mjs`）只有 3 项：`implementing→executing-plans`、`accepting→verification-before-completion`、`archived→finishing-a-development-branch`。`brainstorming` / `design` / `decomposing` 的 heavy 是本仓自写档，**不在镜像口径内**（2026-10-08 / 2026-09-21 用户裁定）。

## 模块改动地图 `serves: FR-1, FR-2`

### 硬约束：镜像契约（本设计最重要的一条） `serves: FR-1`

`scripts/inline-prompt-fragments.mjs` 的 `vendorMirrorProblems()` 要求：映射内 `fragments/<stage>/heavy.md` 与 `vendor/superpowers/<skill>/SKILL.md` **逐字节相等**（`actual !== expected` 即报错）。

因此 **FR-1 不是"复制 14 个文件"就完事**：把 `vendor/superpowers/executing-plans/SKILL.md` 换成 373 行的新版后，`fragments/implementing/heavy.md` **必须同步成同一份 373 行文本**，否则：

- `node scripts/check-prompt-fragments.mjs` → `exit 1`（镜像不一致）；
- `tests/prompt-tiers.test.ts` ④「heavy 主 skill 镜像逐字一致」→ 红。

同理，`accepting` / `archived` 两份上游未变（字节相同），其镜像**不需要动**。

### 改动清单（8 处，均已定位到符号） `serves: FR-1`

| # | 路径 | 动作 | 门禁依据 |
|---|------|------|---------|
| 1 | `src/domain/prompt/vendor/superpowers/<14 skill>/SKILL.md` | 覆盖为 v6.4.2 原文（8 份字节变） | FR-1 |
| 2 | `src/domain/prompt/fragments/implementing/heavy.md` | 覆盖为新 executing-plans（逐字节镜像） | 硬约束，见上 |
| 3 | `src/domain/prompt/generated/fragments.ts` | 重跑生成器产出 | `check-prompt-fragments` ① |
| 4 | `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` | 更新来源表 + 14 份字节/行数 + 角色表 | FR-1；`prompt-tiers` ⑥ |
| 5 | `src/domain/prompt/fragments/implementing/heavy/overrides.md` | 新增 1 条覆盖（新版三处不可执行项） | FR-2 |
| 6 | `tests/prompt-tiers.test.ts` | ①`HEAVY_ONLY.implementing` 换新版关键词；②ATTRIBUTION 断言换 v6.4.2 / 新 commit | FR-4 |
| 7 | `tests/stage-prompts.test.ts` | `HEAVY_ELEMENTS.implementing` 换新版关键词 | FR-4 |
| 8 | `tests/fixtures/stage-prompts-baseline-p1.json` | 重跑 `node scripts/dump-stage-prompts.mjs` | FR-4 |

### 第 5 项为什么必要：新版引入 3 处本仓不可执行项 `serves: FR-2`

新版 executing-plans 正文（373 行）相对旧版（64 行）新增了大量**本仓无法执行**的指令。它们不会让门禁变红（门禁只扫 `reqboard_*` 工具名与镜像字节），但会让 **agent 照纪律去调不存在的 skill / 建不存在的文件**——这正是本仓历史上的返工根因类型。

实测的三处冲突：

| 冲突 | 新版原文（实测） | 本仓事实 |
|------|----------------|---------|
| 悬空 skill 引用 | 正文引用 8 个 skill：`superpowers:using-git-worktrees`、`superpowers:systematic-debugging`、`superpowers:subagent-driven-development`、`superpowers:test-driven-development`、`superpowers:verification-before-completion`、`superpowers:writing-plans`、`superpowers:requesting-code-review`、`superpowers:finishing-a-development-branch` | 这些是**留档文件**，不是可 load 的 skill；本仓无 skill 加载机制 |
| 连续执行不暂停 | 第 27 行「**Continuous execution:** Do not pause to check in with your human partner between tasks」 | 本仓有确认门与交棒纪律（`reqboard_ask_confirm` + 「下一步」行），且门禁会在产物未确认时拒绝推进 |
| ledger 文件 + BASE sha | 要求在 ledger 文件记录、记录 BASE commit，含 `git commit` 语义 | 本仓用 `reqboard_task_report` 作为完工记录；不要求 agent 执行 git commit |

> **处理方式**：新增一条 overrides（priority=floor，永不被裁）显式收口这三项。**不改 vendor 原文**——上游原文必须逐字节保真（档案 + 镜像门禁的前提），本仓差异一律由 overrides 承载。这是本仓既有分层纪律（原文在前、本仓规则在后、冲突以本仓为准）。

## 数据结构变更 `serves: FR-3`

无数据库、无 schema、无迁移。唯一的"数据结构"是构建期生成物的**内容**：

- `GeneratedFragment` 接口**签名不变**（`id/stage/difficulty/category/priority/text/include?`）；
- 记录**条数不变**（129）；
- 变的只有 2 条记录的 `text`：`implementing/heavy`（2305 → 20405 字节）与 `implementing/heavy/overrides`（2929 → 4062 字节，新增覆盖 10）。两者同属 `implementing/heavy` 一个注入键，故基线 12 键里仍只有 `implementing/heavy` 一键变。

## 接口变更 `serves: FR-3`

`resolveStagePrompt(req, library?)` 的**签名与返回结构一律不变**（`text/fragmentIds/routeKey/hitLevel/charCount/trimmed/overBudget?`）。本需求是"换文本内容"，不是"改接口"。

## 依赖关系 `serves: FR-1, FR-3, FR-4`

```text
本地 v6.4.2 原文 (14 份 SKILL.md)
        │  逐字节复制
        ▼
vendor/superpowers/<skill>/SKILL.md  ──镜像门禁──▶  fragments/<stage>/heavy.md
        │                                                  │
        │                                        node scripts/inline-prompt-fragments.mjs
        ▼                                                  ▼
ATTRIBUTION.md（来源/字节/行数）                  generated/fragments.ts
                                                           │
                                                           ▼
                                            FRAGMENT_LIBRARY → resolveStagePrompt → 六节点注入
                                                           │
                                          node scripts/dump-stage-prompts.mjs
                                                           ▼
                                        tests/fixtures/stage-prompts-baseline-p1.json
```

依赖方向是**单向的**：先落 vendor 原文 → 再同步镜像 → 再重跑生成器 → 最后刷基线。任何一步反序都会让中间态门禁变红（可接受），但**生成器必须在镜像同步之后跑**，否则产出的是旧文本。

## 目录结构 `serves: FR-1`

沿用现有结构，不新增目录、不新增文件（只覆盖既有文件）。新增的 overrides 条目写进既有 `fragments/implementing/heavy/overrides.md`。

## 关键算法/流程 `serves: FR-1, FR-2, FR-3`

### 取词回退链（不变，但要理解为什么类型轴不受影响） `serves: FR-1`

`resolveFragmentPlan` 按 ①`(stage,difficulty,category)` → ②`(stage,difficulty,*)` → ③`(stage,*,category)` → ④`(stage,*,*)` → ⑤`(*,*,*)` 取首个命中层，⑤ 恒并入。

本次改动只动 ①/② 层里的 `implementing/heavy` 正文，**类型档（③ 层）与铁律（⑤ 层）一字不动**。因此 `tests/prompt-categories.test.ts` 的 160 条类型轴断言（「同一 (stage,difficulty) 下六类型两两不同」「36 份类型档无孤岛」）**预期保持全绿**——这是设计的可证伪预判，若变红说明改错了范围。

### 生成器如何把 vendor 变进产物 `serves: FR-3`

`readFragments()` 递归读 `fragments/**.md`（逐字节、不 trim），`parseFragmentId()` 按路径定元数据，再为 36 份类型档按难度合成 include-only 路由壳。`buildFragmentsSource()` 用 `JSON.stringify` 内联 `text`。

**纪律**：生成器只做整文件模板拼接，**不得对 md 内容做逐行变换**。新版 executing-plans 正文里含 ` ```dot ` 图与大量缩进，必须原样进 JSON 字符串（`JSON.stringify` 会正确转义换行）。

## 安全/性能考虑 `serves: FR-4`

### 注入预算：本次实测余量只有 842 字符（最大风险） `serves: FR-4`

`DEFAULT_PROMPT_BUDGET = 24000`（字符）。`heavy` 主档 `priority='floor'`，**永不裁剪**；超预算时 `applyBudget` 返回 `overBudget: {reason:'floor-exceeds-budget'}`（结构化报出，不静默降级）。

实测 `implementing/heavy` 注入（heavy + overrides + 类型档 + iron-rules）按类型：

| 类型 | 注入字符数 |
|------|----------:|
| feature | **23158** |
| bug | 23098 |
| refactor | 23099 |
| doc | 23096 |
| spike | 23089 |
| chore | 23057 |

**最大值 23158 ≤ 24000，通过，余量 842 字符（3.5%）**。`tests/prompt-gates.test.ts` 的「默认预算下全部组合 ≤ 24000」预期保持绿。

> **遗留风险（留给拆分阶段判断，本设计不展开）**：842 字符余量意味着 `implementing/heavy/overrides.md` 或 `common/iron-rules.md` 再长 842 字符就会撞破预算。若执行时 overrides 的新增条目导致超限，应按「失败要响亮」处理（报出而非静默裁铁律），并在设计层回去评估是否提高预算或精简 overrides。

### prompt injection 面（供应链） `serves: FR-4`

vendor 原文是**上游文本直接进 agent 上下文**。本次升级把 20405 字节的上游内容（旧版 2305 字节，**8.85 倍**）注入每个 implementing 阶段会话，其中含 ` ```dot ` 流程图与可执行语义的指令。信任边界 = 上游仓库 obra/superpowers（MIT，commit 固定）。

**缓解**：① commit/tag 固定并记录在 ATTRIBUTION（可追溯、可复现）；② overrides 作为 floor 层压在上游原文之后，冲突时以本仓为准；③ 上游文本不改变本仓门禁（门禁只看工具名与镜像字节）。

## 错误处理 `serves: FR-1, FR-3`

三处**响亮失败**（均不静默）：

| 触发 | 报出形态 |
|------|---------|
| 镜像不一致（heavy.md ≠ vendor 原文） | `check-prompt-fragments` 打印字节数差异 + `exit 1`；`prompt-tiers` ④ 红 |
| 源/产物不同步（改了 .md 没重跑生成器） | `check-prompt-fragments` 打印首个差异偏移 + `exit 1` |
| vendor 原文字节非法（如未闭合代码块） | 生成器写盘后镜像检查失败 → `exit 1`；JSON.stringify 不受影响 |

**上游原文自身损坏**（本地 v6.4.2 文件有问题）属外部依赖失败：修上游或回退该份到 v6.3.0 并记录，不静默跳过。

## 配置项 `serves: FR-4`

| 配置 | 位置 | 本次是否改 |
|------|------|-----------|
| `DEFAULT_PROMPT_BUDGET = 24000` | `src/domain/prompt/budget.ts` | **不改**（23158 未超） |
| `VENDOR_MAIN_SKILLS`（3 项映射） | `scripts/inline-prompt-fragments.mjs` | **不改**（映射本身没变） |
| `STAGES` / `DIFFICULTIES` / `CATEGORIES` | 同上 | 不改 |
| `HEAVY_ONLY` / `HEAVY_ELEMENTS` | 两个测试文件 | **改**（换新版关键词） |

## 监控埋点 `serves: FR-4`

无新增埋点。既有的 `reqboard_status` 的 `run` 节与注入留痕（`injectionLog`）继续工作；本次不改注入记录的字段。

## 部署变更 `serves: FR-3`

无部署面变化。`generated/fragments.ts` 是**构建期内联**产物，随包发布；升级后需重建（`pnpm build`）才在安装态生效。**运行时不读盘**（这正是不用"运行时读 vendor 目录"的原因）。

## 文档更新清单 `serves: FR-1`

| 文档 | 更新点 |
|------|--------|
| `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` | commit/tag/抓取时点；14 份字节/行数表；§3 镜像关系说明（映射未变，但 executing-plans 字节数变） |
| `src/domain/prompt/fragments/implementing/heavy.md` | 整体被新原文替换 |
| `src/domain/prompt/fragments/implementing/heavy/overrides.md` | 新增 1 条覆盖 + 头部说明同步 |

## 遗留问题 `serves: FR-4`

1. **842 字符余量**：见「安全/性能考虑」。是否提高 `DEFAULT_PROMPT_BUDGET` 或精简 overrides，留给拆分阶段按实测决定。
2. **新版正文含 8 处悬空 skill 引用**：本设计用 overrides 收口；若执行时发现 overrides 不足以阻止 agent 尝试加载，需回到设计层评估是否在 overrides 中逐条点名。
3. **附属 11 份原文的"留档不注册"状态**：本次不动。若将来要把 `test-driven-development` 等注册为按需片段，属另一次需求（注册即需被路由命中，否则违反「无孤岛」门禁 4）。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3`

| 决策 | 选择 | 取舍 |
|------|------|------|
| 同步范围 | 14 份全量（含 11 份不注入的留档） | 换取档案与上游一致、ATTRIBUTION 数字可复算；代价是 4 份无关文件也进 diff |
| 镜像处理 | 同步 `implementing/heavy.md` 为新原文 | 这是门禁**强制**的，没得选；副作用是 implementing 注入文本骤增 8.85 倍 |
| 上游冲突处理 | 改 overrides，**不改 vendor 原文** | 保住"原文逐字节保真"这一前提；代价是 overrides 变长（吃 842 字符余量） |
| 是否改 `DEFAULT_PROMPT_BUDGET` | 不改 | 23158 未超限；改预算会放宽所有节点的闸门，属范围蔓延 |
| brainstorming / design / decomposing heavy | 不动 | 自写档，不在镜像映射；上游对应原文只作留档 |

## 技术方案与亮点 `serves: FR-1, FR-4`

1. **把"14 份同步"精确收敛成"1 份影响注入"**：靠实测 `FRAGMENT_LIBRARY` = 129 条 + 镜像映射只有 3 项，把改动影响面从"全部节点"缩到 implementing 一个节点，避免对 design/accepting/archived 做无谓改动。
2. **预算余量先算后改**：动手前实测出 23158 / 24000 / 余 842，把"会不会撞破 floor 预算"从猜测变成数字。
3. **分层纪律保住上游保真**：冲突一律由 overrides（floor）承载，vendor 原文保持逐字节——既满足镜像门禁，又让本仓规则始终压过上游。
4. **三处不可执行项显式点名**：把"agent 可能照上游去 load 不存在的 skill / 建 ledger / commit"这类隐性返工，转成 overrides 里可核对的条目。
