---
serves: FR-4, FR-5
---

# 测试策略与用例设计 — 更新 vendor superpowers 分片到本地最新版 `serves: FR-4`

> 本需求是"换文本资产"，测试的核心问题是：**换完之后注入链路还完整吗、上游保真吗、基线对得上吗。**
> 本设计把每一条判据钉到具体命令与期望输出（跑什么、看到什么算过）。

## 测试策略总览 `serves: FR-4`

四层，从"契约"到"行为"：

| 层 | 目标 | 手段 | 失败意味着 |
|----|------|------|-----------|
| L1 契约层 | 上游保真 + 产物同步 | `check-prompt-fragments.mjs`（exit code） | vendor/镜像/产物三者漂移 |
| L2 镜像层 | heavy ↔ vendor 逐字节 | `tests/prompt-tiers.test.ts` ④ | 只改了 vendor 没改镜像（本需求最可能的坑） |
| L3 基线层 | 注入文本逐字回归 | `tests/prompt-baseline.test.ts` + 12 键快照 | 改动影响面超出预期（多改了节点） |
| L4 行为层 | 类型轴 / 预算 / 工具名仍成立 | `tests/prompt-categories.test.ts`、`prompt-gates.test.ts` | 换文本撞破了既有门禁（预算超限、类型轴重复） |

**为什么 L3 是"影响面哨兵"**：基线只应有 `implementing/heavy` 一个键变。若出现第二个键变，说明改动越界（动了不该动的节点）——这正是本设计要防的。

## 功能测试用例 `serves: FR-4, FR-5`

| 用例 id | 断言 | 命令 | 期望 | serves |
|---------|------|------|------|--------|
| TC-1 | 14 份 vendor 原文与本地 v6.4.2 逐字节一致 | `for d in <14 skills>; do diff -q ~/Documents/ai/skills/superpowers/skills/$d/SKILL.md src/domain/prompt/vendor/superpowers/$d/SKILL.md; done` | 全部**无输出**（无差异） | FR-1 |
| TC-2 | 镜像逐字节一致（I-2 硬约束） | `node scripts/check-prompt-fragments.mjs` | stdout 含 `OK`、`exit 0`；**不得**出现 `heavy.md ↔ vendor 原文不一致` | FR-3 |
| TC-3 | 源/产物同步（改了 .md 必须重跑生成器） | 同上（TC-2 已覆盖 ①） | 无 `generated/fragments.ts 与 fragments/**.md 不一致` | FR-3 |
| TC-4 | `implementing/heavy` 镜像 === 新 executing-plans | `npx vitest run tests/prompt-tiers.test.ts` | ④ 组 3 条全绿（`implementing`/`accepting`/`archived`） | FR-3 |
| TC-5 | 14 份 ATTRIBUTION 记录齐全且为实测值 | `grep -c "v6.4.2\|8ca22dba9a94f28898bbce59f2537ff4d87c747d" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` | 命中新 tag 与新 commit | FR-1 |
| TC-6 | P1 基线逐字一致 | `npx vitest run tests/prompt-baseline.test.ts` | 12 键全绿（含 `implementing/heavy`） | FR-4 |
| TC-7 | **影响面哨兵**：只有 `implementing/heavy` 键变 | `git diff --stat tests/fixtures/stage-prompts-baseline-p1.json` 后逐键比对 | 变化的键只有 `implementing/heavy` | FR-4 |
| TC-8 | 类型轴回归（换文本不影响 36 份类型档） | `npx vitest run tests/prompt-categories.test.ts` | 160 条全绿；六类型两两不同、无孤岛 | FR-4 |
| TC-9 | 预算上界（floor 不被裁、不超预算） | `npx vitest run tests/prompt-gates.test.ts` | 「默认预算下全部组合 ≤ 24000」绿；`implementing/heavy/feature` = 23158 | FR-4 |
| TC-10 | 注入文本不含未注册工具名 | `npx vitest run tests/prompt-gates.test.ts tests/stage-prompts.test.ts` | 工具名门禁全绿（新版正文含 0 处 `reqboard_`） | FR-4 |
| TC-11 | 注入抽检：新版关键段落确实进了 implementing/heavy | `node -e "…resolveStagePrompt({stage:'implementing',difficulty:'heavy',category:'feature'})…"` | 文本含 `The Task Loop`、`Common Rationalizations`、`Continuous execution` | FR-5 |
| TC-12 | overrides 新条目为 floor、在原文之后 | `npx vitest run tests/prompt-tiers.test.ts`（⑥ 注入顺序组） | `fragmentIds` 顺序 = heavy → overrides → 类型档 → iron-rules | FR-2 |
| TC-13 | 生成幂等 | `node scripts/inline-prompt-fragments.mjs && git diff --exit-code src/domain/prompt/generated/fragments.ts` | 第二次运行后 `git diff` 为空（`exit 0`） | FR-3 |
| TC-14 | 全量回归（无意外连带失败） | `npx vitest run` | 全绿；**允许**为 6/7/8 三处「测试关键词与 ATTRIBUTION 断言」的有意更新 | FR-4 |

### 三个测试文件的**有意更新**（不是"改测试迁就代码"，是换源的必要同步） `serves: FR-4`

| 文件 | 位置 | 现内容 | 需改为 | 依据 |
|------|------|-------|-------|------|
| `tests/prompt-tiers.test.ts` | `HEAVY_ONLY.implementing` | `['Load plan, review critically', 'When to Stop and Ask for Help']` | 新版**实测不含**这两个串（各 0 次命中）；换成新版实有的小标题关键词（如 `The Task Loop` / `Common Rationalizations`） | 上游换版 |
| `tests/prompt-tiers.test.ts` | ATTRIBUTION 断言组 | 断言 `v6.3.0` + `b36e0829…` | 断言 `v6.4.2` + `8ca22dba…` | 上游换版 |
| `tests/stage-prompts.test.ts` | `HEAVY_ELEMENTS.implementing` | 同 `HEAVY_ONLY` 的两个旧串 | 同新版关键词 | 上游换版 |

> **关键词选取约束**（`prompt-tiers` ⑤ 同时断言"light 不含该关键词、heavy 含"）：所选关键词必须只出现在新版 heavy 正文里，**不得**出现在 `implementing/light.md`、`implementing/light/overrides.md` 或 `common/iron-rules.md` 中，否则 light 组会红。

### 关键词可用性实测（选词依据，非猜测） `serves: FR-4`

| 候选关键词 | 新版命中 | 旧版命中 | 可用 |
|-----------|:-------:|:-------:|:----:|
| `The Task Loop` | 1 | 0 | ✅ |
| `Common Rationalizations` | 1 | 0 | ✅ |
| `Continuous execution` | 1 | 0 | ✅ |
| `Load plan, review critically` | **0** | 1 | ❌（已失效） |
| `When to Stop and Ask for Help` | **0** | 1 | ❌（已失效） |

## 测试覆盖度统计 `serves: FR-4`

| FR | 覆盖用例 | 覆盖方式 |
|----|---------|---------|
| FR-1（全量同步 14 份） | TC-1、TC-5 | 逐份 `diff` + 档案值断言 |
| FR-2（核对 overrides 引用） | TC-12 | 注入顺序 + floor 优先级断言 |
| FR-3（重建 fragments.ts） | TC-2、TC-3、TC-4、TC-13 | exit code + 镜像断言 + 幂等 |
| FR-4（跑单测） | TC-6…TC-10、TC-14 | 基线 + 类型轴 + 预算 + 工具名 |
| FR-5（抽检注入文本） | TC-11 | 关键词命中 |

**覆盖缺口（如实声明）**：

1. **无"overrides 是否足以阻止 agent 照上游去 load 不存在的 skill"的自动化测试**——这是**行为层**判据，只能人看（跑一次 implementing 会话观察，或人工 review overrides 文案）。本设计用文字纪律承载（见 TC-11 的补充观察项），不假装有测试。
2. **无"上游原文是否有恶意/误导指令"的自动检测**——prompt injection 面靠 commit 固定 + 人工 review，自动化成本不划算。
3. **无跨版本回归**（不测 v6.3.0 与 v6.4.2 的行为差异）——本需求只保证"换版后既有门禁全绿"，不评估上游语义变更对 agent 行为的长期影响。

## 关键决策与取舍 `serves: FR-4`

| 决策 | 选择 | 取舍 |
|------|------|------|
| 判据形态 | 全部挂可跑命令 + 期望输出 | 让验收与实施对齐；代价是文档较长 |
| 基线是否重刷 | 重刷（只 1 键变） | 换取变更留痕与影响面哨兵；代价是 86KB 文件进 diff |
| 测试关键词来源 | 换成新版**实有**的子标题（已实测命中次数） | 避免"换了个也不存在的词"二次返工 |
| 是否加"引用完整性"自动化 | 不加 | 7 份 × 约 6 条 ≈ 42 处引用，脚本成本高于人工核对（需求阶段 D-2 裁定） |
| 行为层判据 | 承认只能人看，写进覆盖缺口 | 不把"人看"包装成"自动过"，对齐本仓「失败要响亮」纪律 |

## 技术方案与亮点 `serves: FR-4`

1. **影响面哨兵（TC-7）**：本需求最大的隐患是"顺手改多了"。用基线 12 键里"只应有 1 键变"把越界变成可检测的红。
2. **选词先实测再写死**：把候选关键词在新旧两版的命中次数列出来，避免又一次"钉死了一个不存在的串"——这恰是本次必须改测试的原因。
3. **覆盖缺口如实写**：三条缺口（overrides 行为效果、上游指令安全性、跨版本语义差异）明说测不了，交给人看；不制造"全绿即安全"的假象。
4. **测试更新当换源配套**：把三处测试改动写明"依据 = 上游换版"，与"改测试迁就实现"划清界限。
