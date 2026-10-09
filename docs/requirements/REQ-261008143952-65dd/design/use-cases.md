---
serves: FR-1, FR-2, FR-5
---

# 用例设计 — 更新 vendor superpowers 分片到本地最新版 `serves: FR-1`

> 本需求的"用户"有两类：**维护者**（同步上游版本的人/agent）与**阶段执行者 agent**（收到注入文本的人）。
> 逐个场景写清"谁 → 做什么 → 看到什么"，含失败分支。

## 场景总览 `serves: FR-1`

| 场景 id | 角色 | 触发 | 看到什么 | serves |
|---------|------|------|---------|--------|
| UC-1 | 维护者 | 发现上游发了新版，要把仓内 vendor 换过去 | vendor 14 份换新、门禁全绿、档案数字对得上 | FR-1 |
| UC-2 | implementing 阶段 agent | 进入实施阶段，收到注入文本 | 提示词含新版 inline 执行纪律 + 本仓覆盖条目 | FR-5 |
| UC-3 | 维护者 | 上游再发 v6.5.x，做增量同步 | 只有差异份进 diff；镜像与基线同步刷新 | FR-1 |
| UC-4 | 维护者 | 升级后发现某条 overrides 引用失效 | 结构化记录失效点，改写或删除该条覆盖 | FR-2 |
| UC-5 | 维护者 | 升级后门禁红 | 报错原文直接指出不一致的两份文件与字节数 | FR-3 |

## UC-1 维护者同步上游新版（顺利路径） `serves: FR-1`

**谁**：仓维护者（人或 agent）。
**什么场景**：本地 `~/Documents/ai/skills/superpowers` 已更新到 v6.4.2，仓内还是 v6.3.0。
**做什么 → 看到什么**：

```text
1. 取本地基线
   $ git -C ~/Documents/ai/skills/superpowers log -1 --format="%H %d"
     → 8ca22dba…  (tag: v6.4.2)
   $ git -C ~/Documents/ai/skills/superpowers tag --list | tail -1
     → v6.4.2

2. 逐份比对差异（先看清影响面，再动手）
   $ for d in <14 skills>; do diff -q <本地>/$d/SKILL.md <仓内>/$d/SKILL.md; done
     → 8 份有差异输出（其中 executing-plans 差异最大：20405 B vs 2305 B，373 行 vs 64 行）
     → 6 份无输出（完全一致）

3. 复制 14 份（含 6 份一致的，保持档案同批）
   → src/domain/prompt/vendor/superpowers/<skill>/SKILL.md 全部 = v6.4.2

4. 同步镜像（硬约束，不能漏）
   → fragments/implementing/heavy.md = 新 executing-plans（逐字节）
   → accepting / archived 的镜像不动（上游未变）

5. 重跑生成器
   $ node scripts/inline-prompt-fragments.mjs
     → "[inline-prompt-fragments] wrote src/domain/prompt/generated/fragments.ts (129 fragments, N bytes)"

6. 刷基线快照
   $ node scripts/dump-stage-prompts.mjs
     → tests/fixtures/stage-prompts-baseline-p1.json 更新（只 implementing/heavy 键变）

7. 同步三处测试引用 + ATTRIBUTION 档案
   → HEAVY_ONLY.implementing / HEAVY_ELEMENTS.implementing 换新版关键词
   → ATTRIBUTION 断言换 v6.4.2 / 8ca22dba…
   → ATTRIBUTION.md 的来源表与 14 行字节/行数表更新为实测值

8. 门禁与回归
   $ node scripts/check-prompt-fragments.mjs          → OK, exit 0
   $ npx vitest run                                   → 全绿
```

**成功判据**：第 8 步两条命令都通过；ATTRIBUTION 的字节数与 `wc -c` 实测一致。

## UC-2 implementing 阶段 agent 收到新版注入 `serves: FR-5`

**谁**：被 reqboard 注入的阶段执行 agent。
**什么场景**：需求进入 `implementing`，`resolveStagePrompt({stage:'implementing', difficulty:'heavy', category:'feature'})` 被调用。
**做什么 → 看到什么**：

```text
注入文本（三段顺序，共 23158 字符）：
  ① implementing/heavy          ← v6.4.2 executing-plans 原文（20405 B，floor 不裁）
     含："The Task Loop" / "1. Take the task" / "3. The completion contract"
         "Continuous execution: Do not pause to check in…"   ← 与本仓门禁冲突，见下
         "Rulings, not stalls." / ledger 记录 / 8 处 superpowers:* 悬空引用
  ② implementing/heavy/overrides ← 本仓覆盖条目（floor）
     既有 9 条 + 新增 1 条，把上游三处不可执行项逐条收口：
       · superpowers:* 不是可 load 的 skill（本仓无 skill 加载机制）
       · 「不暂停」不适用于本仓（有确认门与交棒纪律）
       · ledger 文件 → 映射到 reqboard_task_report；不要求 git commit
  ③ implementing/feature        ← 类型档（priority=10，可裁）
  ④ common/iron-rules           ← 全局铁律（floor，恒并入）
```

**agent 应当看到的行为**：照本仓任务卡执行（覆盖 1：任务来源 = `reqboard_decompose` 落库的卡），完工调 `reqboard_task_report`（覆盖 2），遇门用弹框（覆盖 5），交棒 `reqboard_submit(kind=verification)`（覆盖 6）。

**冲突处理判据**：上游原文与覆盖条目冲突时**以覆盖条目为准**（`priority='floor'` 且位于原文之后）。这是本仓既有分层纪律，不是本次新增。

## UC-3 上游再发新版（增量同步路径） `serves: FR-1`

**谁**：维护者。
**什么场景**：半年后上游发 v6.5.0，仓内已是 v6.4.2。
**做什么 → 看到什么**：

1. 第 2 步 `diff` 只列出真正变化的份数（可能比本次少）；
2. **判断是否触及镜像 3 项**：若 `executing-plans` / `verification-before-completion` / `finishing-a-development-branch` 有变 → 必须同步对应 `heavy.md`；若只有留档 11 份变 → 只更新档案与 ATTRIBUTION，**注入行为不变**；
3. 重跑生成器 + 基线的必要性**由镜像是否变化决定**：镜像没变 → 生成物与基线理论上不变（仍跑一次确认 `git diff` 为空）；
4. ATTRIBUTION 的 tag/commit/字节行数表按新实测值更新。

**这条路径的价值**：把"每次上游更新都要全量重刷"降级为"先看镜像 3 项有没有变"。本次已把该判据写进 architecture.md 的差异表（「注入影响」列）。

## UC-4 overrides 引用失效（失败分支） `serves: FR-2`

**谁**：维护者。
**什么场景**：升级后逐条核对 overrides 时，发现某条引用的上游措辞在新版里已不存在。
**做什么 → 看到什么**：

```text
现象：overrides 写「覆盖 N · 上文说『读 plan 文件、按 bite-sized steps 执行』」，
      但新版正文已改写成别的表述（grep 命中 0 次）。

处理（三选一，逐条判断并记录）：
  a. 新版仍有同义主张、只是换了措辞 → 改写 overrides 的引用文本（保留覆盖意图）
  b. 新版已内建本仓诉求（不再冲突）   → 删除该条覆盖
  c. 新版彻底删除该主张（无事可覆盖） → 删除该条覆盖

记录：结论写进本次需求的验收材料（哪些条改了、为什么）。
```

**半成品处理**：已删除的条目用 `git checkout` 回滚，待全部核对完再统一提交（避免中途形态混杂）。

**本次实测结论**：7 份 overrides 的引用**仍有效**——因为它们的「上文」指本仓自写 heavy 档（`brainstorming` / `design` / `decomposing`）或未变的上游（`accepting` / `archived`），不随 executing-plans 换代而失效。唯一需要**新增**条目的是 implementing（新版引入 3 处新冲突）。

## UC-5 门禁红时的定位（失败分支） `serves: FR-3`

**谁**：维护者。
**什么场景**：改完跑门禁，红了。
**做什么 → 看到什么**：

| 报错原文（实测形态） | 含义 | 处置 |
|---------------------|------|------|
| `[check-prompt-fragments] FAIL: heavy.md ↔ vendor 原文不一致： - fragments/implementing/heavy.md 与 vendor/executing-plans/SKILL.md 不一致（X vs Y bytes）` | 只换了 vendor 没换镜像 | 把新原文原样复制为 `fragments/implementing/heavy.md` |
| `FAIL: generated/fragments.ts 与 fragments/**.md 不一致（首个差异偏移 N）` | 改了 .md 没重跑生成器 | `node scripts/inline-prompt-fragments.mjs` |
| `tests/prompt-tiers.test.ts ④` 失败 | 镜像漂移（同第一条） | 同上 |
| `tests/prompt-tiers.test.ts ⑤/` stage-prompts 关键词失败 | 测试关键词仍是旧版的串 | 换成新版实有子标题（见 test-cases.md 选词约束） |
| `tests/prompt-baseline.test.ts` 某键 diff | 基线未刷，或改动越界 | 先确认变化键是否只有 `implementing/heavy`；是 → 重跑 dump 脚本；多键变 → 回查是否误改其他分片 |
| 预算门禁红（`charCount > 24000` 或 `overBudget`） | overrides 新增内容撞破余量 | 报出而非静默；回设计层评估精简 overrides 或调预算 |

**要点**：每条报错都自带"哪两份文件 / 哪个偏移 / 哪个键"，**不需要猜**。

## 关键决策与取舍 `serves: FR-1, FR-2`

| 决策 | 选择 | 取舍 |
|------|------|------|
| 同步顺序 | 先 vendor → 再镜像 → 再生成器 → 后基线 | 中间态可能门禁红（可接受），但保证每步的输入已就绪 |
| 一致的 6 份是否也复制 | 复制 | 保持"vendor 目录 = 上游某一版全量"的语义；代价是无关文件进 diff |
| 冲突承载 | overrides（floor），不动上游原文 | 保上游逐字节保真；代价是 overrides 增长 |
| 增量路径是否自动化 | 不自动化，写判据（UC-3） | 上游更新频率低（本次 v6.3.0→v6.4.2 隔约 8 天，但策略是人工触发）；脚本成本高于收益 |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-5`

1. **先看清影响面再动手**：UC-1 的第 2 步（逐份 `diff`）与 architecture.md 的「注入影响」列配合，把"14 份全量换"与"只有 1 份影响注入"同时说清，避免无谓改动。
2. **把最可能的坑写成硬约束**：镜像契约（I-2）在 UC-1 第 4 步、UC-5 报错表里两次点名，且带判据函数名与报错原文。
3. **失败分支给到"报错原文 → 处置"对照**：UC-5 让定位不依赖经验，六类失败各有对应动作。
4. **增量路径降级判据**：UC-3 把"镜像 3 项是否变"作为要不要重刷的开关，为将来省事。
5. **显式处理上游与本仓的语义冲突**：UC-2 把"agent 可能照上游去 load 不存在的 skill"转成新增覆盖条目，而不是假设 agent 会自行分辨。
