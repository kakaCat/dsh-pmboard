# 拆分计划：更新 vendor superpowers 分片到本地最新版

> **上游换代**：`v6.3.0`（commit `b36e0829…`）→ `v6.4.2`（commit `8ca22dba9a94f28898bbce59f2537ff4d87c747d`，本地 `~/Documents/ai/skills/superpowers`）。
> **本计划的事实基线已复核**：14 份原文里 **8 份字节不同 + 6 份完全一致**（早前需求/设计文档曾写「7 份有差异 + 7 份一致」，本次提交前已按实测改正为 8 + 6；`executing-plans` 20405 B vs 2305 B 是最大差异）。

## 目标

把仓内 `src/domain/prompt/vendor/superpowers/` 的 14 份上游原文升到 v6.4.2，并保证注入链路不断：镜像契约不破（`implementing/heavy.md` 与新原文逐字节一致）、生成物与源同步、基线快照与档案可追溯、既有门禁全绿。同时把新版引入的 3 处"本仓不可执行项"（8 处 `superpowers:*` 悬空 skill 引用、「Continuous execution 不暂停」、ledger 文件与 BASE sha/commit）用一条 overrides 显式收口——**不改上游原文**（镜像门禁的前提）。

## 做法

按"**先落原文 → 再同步镜像 → 再重跑产物 → 最后刷档案与基线**"的单向序推进（反序会让生成器产出旧文本）：

1. **t1** 14 份 vendor 原文整份复制（逐字节，不改写）；
2. **t2 / t3** 两条并行支线：`implementing/heavy.md` 镜像同步；overrides 追加「覆盖 10」收口新版冲突；
3. **t4** 重跑生成器产出 `generated/fragments.ts`（129 条记录，镜像齐了才能跑对）；
4. **t5** 更新 ATTRIBUTION 档案（来源表 + 14 行实测字节/行数）；
5. **t6 / t7** 随换源同步更新 3 处测试引用与 P1 基线快照（只 `implementing/heavy` 一键变）；
6. **t8** 全量回归与注入抽检（含预算上界与新版关键词命中）。

**唯一改变注入行为的只有 `implementing` 一个节点**（`executing-plans` 是 3 份 heavy 主 skill 之一）；`accepting` / `archived` 两份上游未变、镜像不动；`brainstorming` / `design` / `decomposing` 的 heavy 是本仓自写档，不受本次升级影响。

## 任务表

| 计划 key | 标题 | 阶段 | 端侧 | 依赖 | 实施方案 | 验收标准 | 工作量 |
|---------|------|------|------|------|----------|----------|--------|
| t1 | 同步 14 份 vendor 原文到 v6.4.2 | implement | backend | - | 把 `~/Documents/ai/skills/superpowers/skills/<skill>/SKILL.md` 逐份**原样复制**为 `src/domain/prompt/vendor/superpowers/<skill>/SKILL.md`。14 个 skill：brainstorming、dispatching-parallel-agents、executing-plans、finishing-a-development-branch、receiving-code-review、requesting-code-review、subagent-driven-development、systematic-debugging、test-driven-development、using-git-worktrees、using-superpowers、verification-before-completion、writing-plans、writing-skills。逐字节复制：不改写、不 trim、不补 front-matter。8 份内容变（executing-plans 20405B、subagent-driven-development 32577B、writing-skills 26623B、brainstorming 17548B、writing-plans 10335B、test-driven-development 9578B、using-superpowers 3192B、requesting-code-review 2977B），6 份不变。 | ① 差分脚本对 14 份逐份 `diff -q` 源与目标，**全部无输出**；② 目标文件字节数与本地源一致（`wc -c` 逐份相等） | files=14, anchors=2, chars=900 |
| t2 | 同步 implementing/heavy.md 镜像 | implement | backend | t1 | 把 t1 落盘的 `src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` **原样复制**为 `src/domain/prompt/fragments/implementing/heavy.md`（1 个文件，逐字节）。这是 `VENDOR_MAIN_SKILLS` 映射的硬约束：两份必须同批、同源。`accepting` / `archived` 的镜像**不动**（对应上游未变）。 | ① `node scripts/check-prompt-fragments.mjs` 输出 `OK` 且 exit 0（不得出现 `heavy.md ↔ vendor 原文不一致`）；② `diff -q` 两份 heavy/镜像无输出 | files=2, anchors=3, chars=600 |
| t3 | 新增 overrides「覆盖 10」收口新版冲突 | implement | backend | t1 | 在 `src/domain/prompt/fragments/implementing/heavy/overrides.md` 尾部（现最大编号为「覆盖 9」）追加 1 条「覆盖 10」，逐条点名新版 executing-plans 的 3 处本仓不可执行项：① 正文引用的 8 个 `superpowers:*`（using-git-worktrees / systematic-debugging / subagent-driven-development / test-driven-development / verification-before-completion / writing-plans / requesting-code-review / finishing-a-development-branch）是**留档文件、不是可 load 的 skill**，本仓无 skill 加载机制，不得尝试加载；② 第 27 行「Continuous execution: Do not pause to check in」**不适用**——本仓有确认门与「下一步」交棒纪律，遇门仍用 `reqboard_ask_confirm`；③ ledger 文件 / 记录 BASE sha / `git commit` 语义映射到本仓 `reqboard_task_report`，不要求 agent 执行 git commit。保持条目形状 `- [ ] **覆盖 N · <主题>**：上游怎么说 → 本仓怎么做`。 | ① `grep` 命中「覆盖 10」且三处冲突关键词（`superpowers:` / 不暂停 / ledger）均在条目内；② `npx vitest run tests/prompt-tiers.test.ts` 的 ⑥ 注入顺序组绿（heavy → overrides → 类型档 → iron-rules） | files=1, anchors=3, chars=900 |
| t4 | 重跑生成器产出 generated/fragments.ts | implement | backend | t2, t3 | 在镜像与 overrides 都落盘后跑 `node scripts/inline-prompt-fragments.mjs`，重写 `src/domain/prompt/generated/fragments.ts`。**不得手改产物**（构建期生成物，人工改动会被源/产物同步门禁判红）。预期 129 条记录不变，只有 2 条记录的 `text` 变：`implementing/heavy`（2305 → 20405 字节）与 `implementing/heavy/overrides`（2929 → 4062 字节，含新增覆盖 10）。 | ① 命令输出 `wrote src/domain/prompt/generated/fragments.ts (129 fragments,`；② `node scripts/check-prompt-fragments.mjs` exit 0；③ 再跑一次生成器后 `git diff --exit-code src/domain/prompt/generated/fragments.ts` 为空（幂等） | files=2, anchors=3, chars=700 |
| t5 | 更新 ATTRIBUTION.md 档案 | doc | backend | t1 | 更新 `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md`：commit 改 `8ca22dba9a94f28898bbce59f2537ff4d87c747d`、tag 改 `v6.4.2`、抓取时点改执行当日、抓取机路径改 `/Users/mac/Documents/ai/skills/superpowers`、核对命令与期望值同步；§2 落盘清单的 **14 行字节/行数改为实测值**（`wc -c` / `wc -l`）；§3 镜像关系说明里 executing-plans 的字节数更新（映射仍是 3 项，不变）。MIT 许可原文不动。 | ① `grep` 命中 `v6.4.2` 与 `8ca22dba9a94f28898bbce59f2537ff4d87c747d`；② 清单 14 行的字节数与 `wc -c src/domain/prompt/vendor/superpowers/<skill>/SKILL.md` 逐份相等 | files=1, anchors=3, chars=1200 |
| t6 | 更新三处测试引用 | test | backend | t4 | 换源必须同步的 3 处断言：① `tests/prompt-tiers.test.ts` 的 `HEAVY_ONLY.implementing` 由旧串 `['Load plan, review critically', 'When to Stop and Ask for Help']` 换成新版**实有**的 `['The Task Loop', 'Common Rationalizations']`（旧串在新版命中 0 次）；② 同文件的 ATTRIBUTION 断言组由 `v6.3.0` / `b36e0829…` 换成 `v6.4.2` / `8ca22dba…`；③ `tests/stage-prompts.test.ts` 的 `HEAVY_ELEMENTS.implementing` 换同一对新关键词。**选词约束**：新关键词不得出现在 `implementing/light.md`、`implementing/light/overrides.md`、`common/iron-rules.md`，否则 light 组会红。 | `npx vitest run tests/prompt-tiers.test.ts tests/stage-prompts.test.ts` 全绿（含 ⑤「light 不含 heavy 独有要素」与 ⑥ 注入顺序组） | files=2, anchors=2, chars=800 |
| t7 | 重刷 P1 基线快照 | test | backend | t4 | 跑 `node scripts/dump-stage-prompts.mjs` 重写 `tests/fixtures/stage-prompts-baseline-p1.json`（12 键：6 节点 × light/heavy）。**不得手改该文件**。预期只有 `implementing/heavy` 一键变；若出现第二个键变，说明改动越界（动了不该动的节点），须回查而非直接刷。 | ① `npx vitest run tests/prompt-baseline.test.ts` 全绿；② 逐键比对确认**只有 `implementing/heavy`** 的值变（影响面哨兵） | files=2, anchors=3, chars=500 |
| t8 | 全量回归与注入抽检 | test | fullstack | t5, t6, t7 | 收口验证：① 跑 `node scripts/check-prompt-fragments.mjs`（镜像 + 源/产物同步）；② 跑 `npx vitest run` 全量单测（重点看 160 条类型轴、预算上界、工具名一致、P1 基线）；③ 用 `resolveStagePrompt({stage:'implementing', difficulty:'heavy', category:'feature'})` 抽检注入文本含新版关键词 `The Task Loop` / `Common Rationalizations` / `Continuous execution`，且 `charCount` ≤ 24000（实测 23158）、`overBudget` 为 undefined；④ 人工过一遍 overrides「覆盖 10」的三条收口文案是否足以阻止 agent 尝试加载 `superpowers:*`（**行为层判据，只能人看**，如实标注）。 | ① 门禁 exit 0；② `npx vitest run` 全绿；③ 抽检输出含三个关键词、`charCount=23158`、无 `overBudget`；④ overrides 三条收口文案逐条在场并已人工复核 | files=1, anchors=4, chars=700 |

## 接口清单 ↔ 接收卡 key 对照表

设计文档 `design/interfaces.md`「接口清单」共 7 条，逐条给出接收卡（一对多合法）：

| 接口 | 接口名称 | 接收卡 key |
|------|----------|-----------|
| I-1 | 上游原件 → vendor 落盘（逐字节） | t1 |
| I-2 | vendor 原文 → heavy 镜像（逐字节） | t2 |
| I-3 | fragments/**.md → generated/fragments.ts | t4 |
| I-4 | 分片库 → 注入文本（签名无变更） | t8 |
| I-5 | 注入文本 → P1 基线快照 | t7 |
| I-6 | 上游来源 → ATTRIBUTION 记录 | t5 |
| I-7 | 注入文本 → 覆盖条目 | t3 |

> **左列必须与 `design/interfaces.md`「接口 id」列逐字相同**（只写 `I-1`，不带描述）——对照表门的 id 比对是字面相等，把描述并进第一格会导致「清单条目 I-1 没有卡接收」。

> **组件树段不适用**：`design/frontend.md` 的「组件树」节声明不适用（本需求不新增/修改任何 UI 组件），故无「组件树 ↔ 接收卡 key」对照表。

## 改动盘点

**新增**：无新增文件（全部为既有文件覆盖或追加）。

**修改**（8 处，与设计 `architecture.md` 改动清单逐一对应）：
- `src/domain/prompt/vendor/superpowers/` 下 14 份 `<skill>/SKILL.md`（8 份内容变）；
- `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md`（来源表 + 14 行字节/行数）；
- `src/domain/prompt/fragments/implementing/heavy.md`（镜像 = 新 executing-plans）；
- `src/domain/prompt/fragments/implementing/heavy/overrides.md`（追加「覆盖 10」）；
- `src/domain/prompt/generated/fragments.ts`（生成器重写，不得手改）；
- `tests/prompt-tiers.test.ts`（关键词 + ATTRIBUTION 断言）；
- `tests/stage-prompts.test.ts`（关键词）；
- `tests/fixtures/stage-prompts-baseline-p1.json`（生成器重写，不得手改）。

**删除**：无。

**不动**（明确声明，防越界）：
- `src/domain/prompt/budget.ts` 的 `DEFAULT_PROMPT_BUDGET = 24000`（实测 23158 未超）；
- `scripts/inline-prompt-fragments.mjs` 的 `VENDOR_MAIN_SKILLS`（仍 3 项）；
- 36 份类型档、6 份 light 档、`common/iron-rules.md`、四个注入点源码；
- `brainstorming` / `design` / `decomposing` 的 heavy（本仓自写档，不在镜像映射）；
- `accepting` / `archived` 的 heavy 镜像（对应上游未变）。

## 容量核算

口径（单一源 `src/domain/limits.ts`）：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 `roundDetailUnits = 16`。

**`files` 的记法**：按体量门禁口径取「implementation 里点到的去重路径数」与实际改动文件数的**较大者**——跑脚本的卡（t4 / t7）因此记 2（脚本 + 被重写的产物），只改 1 个文件的镜像卡 t2 记 2（源 + 目标，两者都是路径），都如实披露而非缩水。

**`chars` 的记法（显式声明，防误读为缩水）**：`chars` 只记**我方要写/要读的实施描述与自创改动量**，**不记**被整份复制进来的上游原文体积——t1/t2 是"上游文件的搬运"（内容零创作、命令一条），若把上游 10 万字节算进来任何一张搬运卡都会"超容量"，那是与实施形态无关的虚高。上游体积已在 t1/t2/t5 的验收标准里以**实测字节数**披露。

| 计划 key | files | anchors | chars | detailUnits | 是否超容量(16) |
|---------|------:|--------:|------:|------------:|:-------------:|
| t1 | 14 | 2 | 900 | 15.45 | 否 |
| t2 | 2 | 3 | 600 | 3.80 | 否 |
| t3 | 1 | 3 | 900 | 2.95 | 否 |
| t4 | 2 | 3 | 700 | 3.85 | 否 |
| t5 | 1 | 3 | 1200 | 3.10 | 否 |
| t6 | 2 | 2 | 800 | 3.40 | 否 |
| t7 | 2 | 3 | 500 | 3.75 | 否 |
| t8 | 1 | 4 | 700 | 3.35 | 否 |

**最大单卡 15.45 DU（t1）≤ 16，无需切卡、无需标红。** 合计 39.65 DU（8 张卡）。

> t1 逼近容量上限（15.45/16，余 0.55）：若执行期发现实际要动的文件数多于 14（例如上游新增 skill 目录），应把 t1 按"变/不变"两批切开，而不是硬塞。

## 依赖关系

```text
t1 同步 14 份原文
 ├─▶ t2 同步 heavy 镜像 ─┐
 ├─▶ t3 新增 overrides ─┤
 └─▶ t5 更新 ATTRIBUTION │
                          ▼
                    t4 重跑生成器
                     ├─▶ t6 更新测试引用 ─┐
                     └─▶ t7 重刷基线快照 ─┼─▶ t8 全量回归与抽检
                                          │
                              t5 ─────────┘
```

**每条依赖边的语义理由**（两端声明文件零交集，故逐边给出，避免被误判为"顺手都依赖一下"）：

- `t2 → t1`：t1 重建 vendor 原文，t2 读它做逐字节镜像；文件不同但**必须同批同源**，否则镜像门禁红。
- `t3 → t1`：t3 的三条收口文案必须对着**新版正文实测**写（旧版没有 `Continuous execution` 段），t1 未落盘就无法核对原文。
- `t4 → t2`：生成器内联的是 `fragments/**.md`，t2 未同步则产物仍是旧文本（生成器不报错，但产出错的文本）。
- `t4 → t3`：t3 追加的 overrides 是新分片内容，须由 t4 重跑才能进产物。
- `t5 → t1`：t5 的 14 行字节/行数表是对 t1 落盘文件的**实测**，t1 未完成则无可测对象。
- `t6 → t4`：t6 的断言对象是 `resolveStagePrompt` 的解析结果（读产物），产物未更新则新关键词不在文本里。
- `t7 → t4`：同 t6，基线快照是产物的函数。
- `t8 → t5`：t8 校验 ATTRIBUTION 档案与实测值一致，依赖 t5 已完成。
- `t8 → t6` / `t8 → t7`：t8 跑的就是 t6/t7 改过的测试与基线，未完成则全量回归无意义。

## 跳联调声明

本计划 8 张卡**全部无接口面**（改的是文本资产、构建产物与测试；无 HTTP 路由、无 `reqboard_*` 工具签名改动），故逐卡 `skipIntegration: true` 并给出理由——按"跳联调必须写理由"的纪律，理由逐卡写在 `tasks[].skipIntegrationReason`。

## 已知风险与执行期注意事项

1. **t1 逼近容量**：15.45/16 DU，见上。
2. **t2 是最易漏的一步**：只换 vendor 不换镜像会让 `check-prompt-fragments` 与 `prompt-tiers` ④ 同时红（报错原文点明两份文件与字节数）。
3. **t6 选词必须实测**：旧关键词在新版 0 命中，新关键词也不得出现在 light 侧（`prompt-tiers` ⑤ 双向断言）。
4. **t7 是影响面哨兵**：只应有 `implementing/heavy` 一键变；多键变 = 改动越界，须回查。
5. **预算余量只剩 842 字符**（23158/24000）：t3 新增的 overrides 若把 floor 总量推过 24000，会触发 `overBudget: floor-exceeds-budget`（结构化报出，不静默裁铁律）；届时按"失败要响亮"报出并回设计层评估，**不得**为塞进去而调预算或删铁律。
