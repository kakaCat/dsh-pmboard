---
id: REQ-261008190515-5212
title: 把 implementing 移出 vendor 镜像并改写自写实施档
category: feature
status: brainstorming
created: 2026-10-08
sides: []
---

# 把 implementing 移出 vendor 镜像并改写自写实施档

## TL;DR

- **是什么**：把 `implementing` 从 vendor 镜像表移出，heavy 主档改写成本仓自写完整档（上游原文留档不注入）。
- **为什么**：上游新版 `executing-plans` 明说「不派子代理」，与本仓任务卡 + 子代理的实施模式相冲。
- **得到什么**：实施纪律与工具面同源，注入文本由 23,852 字符降到 8,000 以内。

## 一句话目标与可证伪判定标准

**目标**：把 `implementing` 从 `VENDOR_MAIN_SKILLS` 镜像表移出，并把
`src/domain/prompt/fragments/implementing/heavy.md` 从上游 `executing-plans` 的**逐字节镜像**
（实测 20,405 字节 / 373 行）改写成本仓**自写完整档**——只写本仓实际怎么实施
（任务卡怎么接、子代理怎么派与复核、完工怎么汇报、遇门怎么弹框）；上游原文留档、不注入。

**为什么现在做**：上游 v6.4.2 把 `executing-plans` 从 64 行重写成 inline 专版，
开头明说「no implementer subagent per task, no reviewer per task」——而本仓实施走的是
任务卡 + 子代理那条路。镜像的是**错的那份**，等于把「别用子代理」的纪律注进实施阶段。

**做完得到什么**：implementing 阶段注入文本从 23,852 字符降到 8,000 以内
（24,000 预算下余量从 148 回到 16,000+），且注入的是本仓流程；
`overrides.md` 现有 10 条「覆盖上游」补丁里，描述本仓流程而非覆盖上游的部分并入正文。

**判定标准（可证伪）**：

1. `node scripts/check-prompt-fragments.mjs` 退出码 0，且输出不含 `heavy.md ↔ vendor 原文不一致`；
2. `node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"`
   输出 `accepting,archived`（不再含 `implementing`）；
3. implementing/heavy 解析文本长度 < 8000（当前 23,852）——取 `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length`；
4. `npx vitest run tests/prompt-tiers.test.ts tests/stage-prompts.test.ts tests/prompt-baseline.test.ts` 全绿；
5. `wc -c src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` 仍为 `20405`（原文留档，逐字节未动）。

## 业务流程图

```
实施阶段 agent 开工（收到注入文本）
   │
   ├─(改前) 注入 = vendor executing-plans 原文 20,405 字节（inline 专版：不派子代理）
   │                    + overrides 10 条补丁（全是在给这段原文打补丁）
   │
   └─(改后) 注入 = 本仓自写完整档（任务卡怎么接 / 子代理怎么派与复核 /
   │                   完工怎么汇报 / 遇门怎么弹框 / 交棒去哪）
   │              + 残余 overrides（floor 层，只留真正"覆盖上游"的条目）
   │
   vendor/executing-plans/SKILL.md ──留档、不注入──▶ ATTRIBUTION.md 记录来源与许可
```

## 产品定义

**这是什么**：本仓（dsh-pmboard 插件）实施阶段注入文本的**换底**——把一个节点的 heavy 主档
从「上游原文逐字节镜像」改成「本仓自写完整档」，并同步镜像表、档案、测试断言、生成物与基线。

**核心价值**：提示词层终于能写明「本仓实施模式」。当前全仓搜不到任何「本仓实施模式」的明确记载，
而 implementing 注入的恰恰是主张 inline 执行、不派子代理的上游原文——agent 照注入的纪律执行，
与本仓实际流程（任务卡 DAG + 子代理链 + 完工汇报门）相冲，冲突只靠 10 条补丁在末端拦。
换底后实施纪律与工具面同源，预算也回归。

**与现状的区别**：不是"再补几条 overrides"，而是**把底座换掉**。
补丁密度本身就是判据——10 条覆盖条目全在给上游原文打补丁，说明底座不对。
这与本仓已有两次先例同构：`design`（2026-09-21）、`brainstorming`（2026-10-08）
先后移出镜像表改自写完整档，理由均为「vendor 流程与本仓阶段边界冲突」。
上游原文仍逐字节留档（来源与许可可追溯），只是不再进注入。

## 用户与角色

三问：谁用 / 什么场景用 / 解决什么痛点。本需求的"用户"是**提示词的读者与维护者**，按角色列：

| 角色 | 什么场景用 | 痛点（本次要解决的） |
|------|-----------|-------------------|
| 阶段执行 agent（implementing） | 进入实施阶段，收到注入文本后照纪律干任务卡 | 注入的是上游 inline 专版原文（明说"不派子代理"），与本仓每条链都派子代理的实际形态相反；照字面执行就是错 |
| 子代理（子卡执行者） | 被父卡派发执行一张子卡 | 提示词层没有任何"本仓怎么派、怎么复核"的记载，派发口径只能靠人临时交代，跨窗口不一致 |
| 维护者（开发者 / agent） | 上游换版后核对镜像、改断言、刷基线 | 不知道"14 份里哪几份真的进注入"；改动散在镜像表 / 档案 / 两处测试 / 生成物 / 基线五处，漏一处即红 |
| 提示词层读者（新窗口 / 交接窗口） | 读项目文档，判断本仓实施模式 | 全仓没有「本仓实施模式」的明确记载（只有本次需求文档提到 subagent-driven-development），无从选对 |

**核心场景**：

1. implementing agent 开工 → 读到的是任务卡怎么接、子代理怎么派与复核、完工怎么汇报、遇门怎么弹框；
2. 维护者改完源 → 跑生成器与门禁 → 生成物 / 基线 / 断言三处同批同步，不出现半更新状态；
3. 上游再发新版时，维护者只需判断「镜像表还剩哪几项」决定要不要重刷，不必每次全量重来。

## 功能点（FR）

- **FR-1: implementing 退出 vendor 镜像表**
  把 `implementing: 'executing-plans'` 从 `scripts/inline-prompt-fragments.mjs` 的
  `VENDOR_MAIN_SKILLS`（第 69 行）与 `tests/prompt-tiers.test.ts` 的同源副本（第 36 行）一并移除，
  并同步两处的头注释（注明 2026-10-08 裁定与理由）。
  **判据**：`node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"`
  输出 `accepting,archived`；`grep -c "implementing: 'executing-plans'" scripts/inline-prompt-fragments.mjs tests/prompt-tiers.test.ts` 均为 0。

- **FR-2: implementing/heavy 改写成本仓自写完整档**
  把 `src/domain/prompt/fragments/implementing/heavy.md` 改写成本仓自写完整档：
  保留上游迭代纪律骨架（任务循环 / 常见借口一类），正文只写本仓实际实施流程——
  任务卡来源（`reqboard_task_move(to=in_progress)` 返回卡全文）、完工记录（`reqboard_task_report`）、
  子代理怎么派与复核、遇门怎么弹框（`reqboard_ask_confirm`）、交棒（`reqboard_submit(kind=verification)`）。
  **判据**：`resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text` 同时含
  `reqboard_task_move` 与 `reqboard_task_report`；`diff -q` heavy.md 与
  `src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` **不相等**（不再是镜像）。

- **FR-3: 收编 overrides 里描述本仓流程的补丁**
  `src/domain/prompt/fragments/implementing/heavy/overrides.md` 现有 10 条「覆盖 N」中，
  描述本仓流程而非覆盖上游措辞的条目并入 FR-2 正文；真正"覆盖上游"的残余条目保留在 overrides 中，
  编号重排为从 1 起连续，且每条仍指向 vendor 原文里真实存在的被覆盖措辞。
  **判据**：`grep -c "覆盖 [0-9]" src/domain/prompt/fragments/implementing/heavy/overrides.md`
  输出 < 10 且编号连续；每条残余条目能在 `vendor/superpowers/executing-plans/SKILL.md` 里
  `grep` 到被覆盖的关键词（逐条人工核对，0 命中即该条已失效）。

- **FR-4: 档案、断言、生成物、基线同批同步**
  ① `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` §2 角色列把 executing-plans 由
  「heavy 主 skill：implementing」改为「留档原文，不再注入（2026-10-08 裁定）」，
  §3 镜像清单由 3 项改 2 项并注明理由；
  ② `tests/stage-prompts.test.ts` 的 `HEAVY_ELEMENTS.implementing` 换成自写档**实有**的要素关键词
  （旧串 `The Task Loop` / `Common Rationalizations` 若不再出现即须换）；`REQ_SPECIFIC.implementing`
  保留本仓工具化措辞；
  ③ `tests/kb-prompt-wiring.test.ts` 的「镜像档 heavy.md 仍与 vendor 原文一致」抽样断言随口径更新；
  ④ 重跑生成器刷新 `src/domain/prompt/generated/fragments.ts`，重刷 P1 基线
  `tests/fixtures/stage-prompts-baseline-p1.json`（implementing/heavy 一条）。
  **判据**：`node scripts/check-prompt-fragments.mjs` 退出码 0；
  `grep -n "不再注入" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` 命中 executing-plans 行；
  `npx vitest run tests/prompt-baseline.test.ts` 全绿。

- **FR-5: 注入体量与 floor 纪律不被破坏**
  implementing/heavy 解析文本 < 8000 字符；light 档与 `common/iron-rules` 不动；
  heavy 独有要素关键词不得出现在 light 档（否则 light 组会红）；
  节点内容与 overrides 仍是 floor（永不裁）；不新增运行时读盘（仍是构建期内联）。
  **判据**：`resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length < 8000`；
  `npx vitest run tests/prompt-tiers.test.ts` 全绿（含「light 不含 heavy 独有要素」与「全部 floor」两组）。

- **FR-6: 本仓实施模式明确记载**
  在 implementing 自写档内设「本仓实施模式」一节（workflow / 子代理：一张父卡一条子卡链、
  子卡怎么派、怎么复核、完工怎么汇报）；并在项目文档里同样写明该模式
  （落点由 design 节点定，候选 `docs/architecture/prompt-context-layering.md` /
  `docs/architecture/project-manual.md`），使提示词层与后来者可查。
  **判据**：`grep -n "本仓实施模式" src/domain/prompt/fragments/implementing/heavy.md` 命中；
  `grep -rn "子代理" docs/architecture/*.md` 至少命中一处新增记载。

## 失败与并发路径

### 失败路径

1. **移了源没移映射**（改动顺序错）：`node scripts/check-prompt-fragments.mjs` 报
   `heavy.md ↔ vendor 原文不一致` 并 exit 1。
   **看到什么**：门禁把自写档当作"漂移的镜像"拦下。
   **处理**：先把 `VENDOR_MAIN_SKILLS` 的 implementing 项移除，再改 heavy.md；两处必须同批。
2. **改了源没重跑生成器**：门禁①（内存重生成与盘上 `generated/fragments.ts` 逐字节比对）不一致，exit 1。
   **看到什么**：`[check-prompt-fragments] FAIL`。
   **处理**：重跑生成器；生成物与源同批提交，不留半更新状态。
3. **断言关键词选在 light 档也有的词上**：`prompt-tiers` 的「light 不含 heavy 独有要素」组红。
   **看到什么**：用例报 `<stage> light 不应含 heavy 独有要素「<kw>」`。
   **处理**：换词——新关键词不得出现在 `implementing/light.md`、`implementing/light/overrides.md`、
   `common/iron-rules.md`。
4. **P1 基线没刷**：`tests/prompt-baseline.test.ts` 报 `diff implementing/heavy`。
   **看到什么**：基线对比输出首处差异行。
   **处理**：重刷 P1 基线（`scripts/dump-stage-prompts.mjs` 产出），并在改动说明里写明是本次换底导致。
5. **预算余量没回来**：文本仍 > 8000 字符。
   **看到什么**：判定标准 3 的输出超限。
   **处理**：说明 overrides 没真正收编——回到 FR-3 把描述本仓流程的条目并入正文。

**写路径半成品谁清理**：半成品 = 「源改了、生成物/基线没跟上」。清理责任人是本次改动的执行者，
清理动作 = 重跑生成器与基线刷新并让门禁与单测全绿；`vendor/` 目录下的 14 份原文全程只读、不参与清理。

### 并发与重复

- 本需求是单窗口单人的构建期改动，无并发写者；重复执行幂等——生成器与基线刷新同输入同输出，
  门禁脚本可反复跑、无副作用。
- 若两个窗口同时改同一份 heavy.md：后写者覆盖先写者，由 `node scripts/check-prompt-fragments.mjs`
  在提交前暴露（生成物与源不一致即红），不产生静默的半更新。

### 状态机非法迁移

不适用：本需求只改构建期提示词源与产物，不引入运行时状态机。

## 边界（不做什么）

- **不动 `accepting` / `archived` 两个仍在镜像表内的节点**——上游对应原文（`verification-before-completion` /
  `finishing-a-development-branch`）与本仓流程无同类冲突，无改动依据；
- **不动 vendor 14 份原文**——移出的是**镜像映射**，不是原件；`vendor/` 继续逐字节留档
  （ATTRIBUTION 的来源与许可承诺，判据 5 就是这条）；
- **不删 overrides 机制本身**——真正"覆盖上游"的残余条目仍需要 floor 层承载；
- **不动 `implementing/light.md` 与 `common/iron-rules.md`**——本次只换 heavy 底座；
- **不改任何门禁 / 任务卡 / 工具面代码**——本需求只改提示词源、档案、两处测试断言、生成物与基线；
- **不顺带改其它节点的自写档**（brainstorming / design / decomposing）——它们的裁定已生效，不借本次扩大范围；
- **不调 `DEFAULT_PROMPT_BUDGET`（24000）**——哨兵在运行时根本不裁剪，调大不解决问题，省下 2 万字符才是解。

## 讨论与裁定记录（D-x）

本节无裁定

## 非功能需求

- **注入体量**：implementing/heavy 解析文本 < 8000 字符（当前 23,852）；
  24,000 预算下余量 ≥ 16,000。测量方法：`resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length`。
- **兼容**：存量需求不受影响——镜像表、档案、断言、生成物、基线同批改，`pnpm typecheck` 退出码 0；
  `npx vitest run tests/prompt-baseline.test.ts` 全绿（P1 基线重刷后逐字节相等）。
- **无运行时读盘**：注入文本仍由构建期内联进 `generated/fragments.ts`，运行时不读 `vendor/`。
- **floor 不变**：节点内容与 overrides 仍为 floor（永不裁），极小预算下主档仍在 fragmentIds。

## 验收标准（整体）

1. 从镜像表移除 implementing（FR-1）→ `VENDOR_MAIN_SKILLS` 打印 `accepting,archived`；
2. 改完 heavy.md 与 overrides.md（FR-2 / FR-3）→ 注入文本里能读出「任务卡怎么接、子代理怎么派与复核、
   完工怎么汇报、遇门怎么弹框」，且 `diff` 与 vendor 原文不相等；
3. 同步 ATTRIBUTION / 两处测试断言（FR-4）→ `grep` 命中「不再注入」，`stage-prompts` 与
   `kb-prompt-wiring` 相关组全绿；
4. 重跑生成器与基线（FR-4）→ `node scripts/check-prompt-fragments.mjs` 退出码 0，
   `npx vitest run tests/prompt-tiers.test.ts tests/stage-prompts.test.ts tests/prompt-baseline.test.ts` 全绿；
5. 量体量（FR-5）→ implementing/heavy 文本 < 8000 字符，预算余量 ≥ 16,000；
6. 查记载（FR-6）→ 档内「本仓实施模式」节在场，项目文档至少一处新增记载；
7. 查留档（全域约束）→ `wc -c vendor/superpowers/executing-plans/SKILL.md` = 20405。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| vendor 原文处置 | 删掉 `vendor/superpowers/executing-plans/SKILL.md` | 留档、不注入 | ATTRIBUTION 承诺 14 份逐字节留档、来源与许可可追溯；两次先例同样只改镜像关系不删文件 |
| 落地形态 | 继续用 overrides 给上游原文打补丁 | 自写完整档 + 收编 | 补丁已到 10 条且全在给上游打补丁，补丁密度说明底座不对；单条补丁改不动"inline 专版"的整体口径 |
| 范围 | 顺手把 accepting / archived 一并自写 | 本次只动 implementing | 那两个节点上游原文未变、无冲突依据；范围一旦扩大就变成"重写全部提示词层"，本期做不完也验不了 |
| 预算问题 | 调大 `DEFAULT_PROMPT_BUDGET`（24000） | 换底省字符 | 哨兵运行时根本不裁剪，调大不解决问题；省下 20,249 字符才是收益来源 |
| 实施模式记载 | 只写在需求文档里 | 档内 + 项目文档两处 | 提示词层要能"选对"，靠需求文档查不到；档内是执行者必读，项目文档是后来者入口 |

## 技术方案与亮点

需求阶段只拍板口径，不展开设计（架构 / 接口 / 数据模型属 design 节点）：

- **口径 1**：`VENDOR_MAIN_SKILLS` 是镜像关系的**唯一映射源**，`tests/prompt-tiers.test.ts` 持同源副本——
  两处必须同批改（分叉即门禁与测试口径不一）；
- **口径 2**：自写档与上游原文的关系照 `brainstorming` 先例——原文留档、heavy.md 自写、
  残余覆盖仍走 overrides（floor 层压在主档之后）；
- **口径 3**：验证走**既有**门禁与测试（`check-prompt-fragments.mjs` + 三个测试文件 + P1 基线），
  不新造检查器——新检查器多一个会漂移的真相源。

## 依赖与约束

**依赖**：

- `scripts/inline-prompt-fragments.mjs` 的 `VENDOR_MAIN_SKILLS`（强依赖：镜像关系的唯一源）；
- 构建期生成器与门禁脚本 `scripts/check-prompt-fragments.mjs`（强依赖）；
- P1 基线由 `scripts/dump-stage-prompts.mjs` 产出（强依赖：改源后必须重刷）；
- 上游原文 `vendor/superpowers/executing-plans/SKILL.md`（只读依赖：改写自写档时需对照其纪律骨架）。

**约束**：

- `vendor/` 下 14 份原文逐字节不改（留档承诺）；
- 五道人工门与产物门禁不变（本需求不得夹带流程改动）；
- 本仓六节点流水线不变（不为迁就上游改流程）；
- 判定标准必须挂可跑命令：`node scripts/check-prompt-fragments.mjs`、`npx vitest run`、
  `pnpm typecheck`（本仓 C-14 / C-15 口径）。

## 原型（本需求无 UI，跳过）

本需求 `sides: []`（无端侧改动）：改的是构建期提示词源与档案，不产生界面产物，不交原型。
`prototypes/` 下的 `detail.html` / `INDEX.md` 是立项时幂等落盘的 capture 骨架，**不登记、不作权威**。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-1a2d1e |
| FR-2 | ✅ 已接收 | t-124acb |
| FR-3 | ✅ 已接收 | t-22daf4 |
| FR-4 | ✅ 已接收 | t4、t5、t-089b64、t-83bb63、t-16b1c4 |
| FR-5 | ✅ 已接收 | t2、t-124acb、t-16b1c4 |
| FR-6 | ✅ 已接收 | t-ed16b0 |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
