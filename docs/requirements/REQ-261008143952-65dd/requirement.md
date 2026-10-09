---
id: REQ-261008143952-65dd
title: 更新 vendor superpowers 分片到本地最新版
category: feature
status: brainstorming
created: 2026-10-08
sides: [frontend, backend]
prototype_exempt: 本需求为提示词分片更新，无界面改动；标 frontend 是因为 vendor 原文含前端提示（原型 / 组件树纪律），但不产生新的 UI 界面，故豁免原型
---

# 更新 vendor superpowers 分片到本地最新版

## 一句话目标与可证伪判定标准

**目标**：同步本地已更新的 superpowers skills（~/Documents/ai/skills/superpowers/skills/）到仓内 vendor 分片（src/domain/prompt/vendor/superpowers/），并核对每份 overrides.md 是否仍对准正确的 vendor 原文位置。

**判定标准**（可证伪）：
1. 运行差分脚本，14 份 SKILL.md 里原本 8 份 DIFF 的全部变成 SAME；
2. 每份 overrides.md 里引用"上文"的条目，能在对应 vendor 原文里找到被覆盖的原始措辞；
3. 跑 `npx vitest run tests/prompt-categories.test.ts`（类型轴）与 `npx vitest run tests/design-prompt-registration.test.ts`（design 注入）全过；
4. 任选一份更新量大的分片（如 executing-plans），用 resolveStagePrompt 取词验证注入文本确实包含新版关键段落。

## 边界（做什么、不做什么）

### 做什么

- **全量同步 14 份 vendor 原文**  
  把本地 `~/Documents/ai/skills/superpowers/skills/*/SKILL.md` 复制到 `src/domain/prompt/vendor/superpowers/*/SKILL.md`（8 份有差异 + 6 份完全一致），保持目录结构不变。

- **核对 7 份 overrides.md 的引用完整性**  
  逐份读 overrides.md 里「覆盖 N · XXX」的条目，对照更新后的 vendor 原文验证：
  - brainstorming/heavy/overrides.md（6+1 条）：「上文完整档是本仓流程」→ 新版 vendor 是否还有被覆盖的对应段落；
  - design/heavy/overrides.md（8 条）：「上文默认的 `docs/superpowers/plans/…`」→ 新版 vendor 路径是否仍存在；
  - implementing/heavy/overrides.md（9 条）：「上文说"读 plan 文件、按 bite-sized steps 执行"」→ 新版 vendor 是否仍有该主张；
  - accepting/heavy/overrides.md（7 条）：「上文要求"逐条核对需求"」→ 新版 vendor 是否仍有该措辞；
  - archived/heavy/overrides.md：「上文讲的是"合并分支 / 清理 worktree"」→ 新版 vendor 是否仍有该语义；
  - design/light/overrides.md、implementing/light/overrides.md：轻档 overrides 是否仍对准 vendor 原文。

  **核对方式**：对每条「覆盖 N」，在更新后的 vendor 原文里 grep 被覆盖的关键词（如 `docs/superpowers`、`plan 文件`、`逐条核对`），确认引用位置仍存在；若 vendor 原文已删除或改写该段，需修改 overrides.md 的措辞或删除该条覆盖。

- **更新后重建 fragments.ts 并验证注入**  
  vendor 原文更新后，执行构建命令 `pnpm run build`（会重新生成 `src/domain/prompt/generated/fragments.ts`），验证生成无报错、单测全过、注入文本含新版关键段落。

### 不做什么

- **不改 overrides.md 的覆盖逻辑**：只核对引用完整性，不新增/删除覆盖条目（除非 vendor 原文已不存在被覆盖的段落导致引用失效）；
- **不改类型档与难度档**：36 份类型分片（六节点 × 六类型）、light/heavy 档都是本仓自写，不动；
- **不改工具面接线**：reqboard_* 工具的 prompt.ts 与门禁逻辑不动，只更新 vendor 底座；
- **不改阶段边界**：本仓的六节点流水线（brainstorming → design → decomposing → implementing → accepting → archived）与 superpowers 的节点划分不一致（vendor 把设计并入 brainstorming、把拆分写在 writing-plans），边界冲突仍由 overrides.md 承载，不为了迁就 vendor 改本仓流程。

## 失败与并发路径

### 失败路径

1. **vendor 原文引用位置失效**：overrides.md 里「上文说……」引用的段落在新版 vendor 原文里已删除或改写。  
   **看到什么**：grep 引用关键词时返回空，或返回位置与 overrides.md 描述不符。  
   **处理**：记录该条覆盖的原意图，若 vendor 新版仍有类似语义但换了措辞，改写 overrides.md 的引用文本；若 vendor 新版彻底删除该主张，评估该条覆盖是否仍需保留（可能变成正文纪律，不再是"覆盖"）。  
   **半成品清理**：已复制的 vendor 原文保留（因为是只读验证在前、写入在后），overrides.md 未修改不提交。

2. **overrides.md 覆盖条目过时**：vendor 原文已按本仓诉求改写（如新版 executing-plans 主推 inline 执行，本仓 overrides 说的「不许 inline」可能已不适用）。  
   **看到什么**：overrides.md 说「覆盖上文的 XXX」，但新版 vendor 原文里 XXX 已不存在或已改成本仓诉求。  
   **处理**：对比新旧版 vendor 原文的变更意图，若新版已内建本仓诉求，删除该条 overrides；若仍有冲突但换了形态，改写 overrides 措辞。  
   **半成品清理**：已删除的 overrides 条目回滚（git checkout），待全部核对完再统一提交。

3. **构建失败**：vendor 原文有语法错误（如未闭合的代码块、非法 front-matter）导致 fragments.ts 生成失败。  
   **看到什么**：`pnpm run build` 报错，错误信息指向某个 SKILL.md 的行号。  
   **处理**：定位报错的 SKILL.md，手工修复后重新构建；若本地 superpowers 原始文件就有问题，记录并提醒用户。  
   **半成品清理**：修复后的 SKILL.md 与生成的 fragments.ts 一起提交；若无法修复，回滚该份 SKILL.md 到旧版。

4. **单测失败**：vendor 原文更新后，类型轴单测 / design 注入单测跑红（可能是 vendor 原文引入了与本仓类型档冲突的措辞）。  
   **看到什么**：`npx vitest run` 报错，错误信息指向某个 fragment id 或类型档。  
   **处理**：读单测断言定位冲突点，在 overrides.md 里补一条覆盖，或调整本仓类型档措辞避让。  
   **半成品清理**：补的 overrides 条目或改的类型档一起提交；若无法解决，回滚引起冲突的 vendor 原文。

### 并发与重复

- **幂等性**：vendor 原文复制是幂等的（14 份文件全量覆盖，重复执行结果相同）；fragments.ts 生成是幂等的（构建脚本读同一批 SKILL.md，输出确定）；overrides.md 核对是只读操作（不改文件，只记录引用失效的条目）。
- **并发场景**：本需求无并发写入（只有一个执行窗口），不存在两个 agent 同时更新 vendor 原文的情况。
- **重复执行**：若中途失败（如构建报错），回滚已复制的 vendor 原文、删除生成的 fragments.ts，重新执行；若已提交，用 git revert 回滚后重新执行。

### 状态机非法迁移

本需求无状态机（vendor 原文更新是文件操作，不涉及状态迁移）。不适用。

## sides 与端侧条件必交文档

- **sides**: `[frontend, backend]`  
  vendor 分片是提示词底座，影响六个阶段的注入文本（brainstorming / design / decomposing / implementing / accepting / archived），既有前端提示（原型 / 组件树）也有后端提示（接口 / 数据层），故标两端都改。

- **端侧条件必交文档**（design 阶段核对）：  
  本需求为 feature + [frontend, backend]，design 阶段需交：
  - `design/architecture.md`（架构影响：vendor 原文是六节点的提示词底座）
  - `design/interfaces.md`（接口清单：overrides.md 是本仓工具面的接线口径）
  - `design/data.md`（数据影响：vendor 原文更新是否影响 fragments.ts 生成的分片库结构）
  - `design/frontend.md`（前端影响：vendor 原文含原型 / 组件树的纪律）
  - `design/testing.md`（测试策略：单测覆盖注入文本、overrides 引用完整性）

## 产品定义

**这是什么**：本仓提示词分片的上游底座换代——把 `src/domain/prompt/vendor/superpowers/` 里的 14 份 superpowers 原文从 v6.3.0 升到本地已有的 v6.4.2，并保证注入链路不被这次升级打断。

**核心价值**：本仓六个阶段的注入文本有一部分直接来自上游原文（`implementing` / `accepting` / `archived` 三个节点是逐字节镜像）。上游一年内已从 v6.3.0 迭代到 v6.4.2，其中 `executing-plans` 被完全重写（64 行 → 373 行，引入 inline 执行模式、ledger 纪律、rulings not stalls）。停留在旧版的代价是：**agent 收到的是已过时的执行纪律**，而上游在这些版本里修掉的正是"执行期含糊、停顿、丢记录"这类问题。

**与现状的区别**：不是"再加一套提示词"，而是**换底座 + 补本仓覆盖**。上游原文逐字节保真（镜像门禁强制），本仓与上游的语义差异一律由 overrides（floor 层）承载——这样既不丢失上游的改进，也不让上游流程覆盖本仓的阶段边界（设计属 design 节点、任务卡来自 reqboard 等既有裁定）。

## 用户与角色

三问：谁用 / 什么场景用 / 解决什么痛点。本需求的"用户"是**两类非人类读者**（本仓流水线的 agent 与维护者），故按角色列痛点：

| 角色 | 什么场景用 | 痛点（本次要解决的） |
|------|-----------|-------------------|
| 阶段执行 agent（implementing） | 进入实施阶段，收到注入文本后照纪律执行任务卡 | 旧版 executing-plans 只有 64 行、按"独立会话 + 评审检查点"写，与本仓"当前会话连续执行任务卡"的实际形态不符；执行期缺少完成契约与决策留痕纪律 |
| 阶段执行 agent（accepting / archived） | 进入验收 / 归档阶段 | 这两节点的上游原文（`verification-before-completion` / `finishing-a-development-branch`）本次未变；但档案需与上游版本对齐，否则"本仓用的是哪一版"无从追溯 |
| 阶段执行 agent（brainstorming / design / decomposing） | 需求分析 / 设计 / 拆分 | 这三节点的 heavy 是本仓**自写档**，不受本次升级影响（上游对应原文只作留档）——**明确这点是为了防止误改** |
| 维护者（开发者 / agent） | 同步上游新版、核对 overrides、跑门禁 | ① 不清楚"14 份里哪几份真的影响注入"，容易全量乱改或漏改镜像；② 上游换版后测试里钉死的关键词与 ATTRIBUTION 记录会红，但没人知道该改哪几处；③ overrides 的引用可能随上游改写而失效，缺核对方法 |

**核心场景**：
1. 维护者同步 v6.4.2 → 逐份 `diff` 看清影响面 → 只对 `implementing` 同步镜像 → 生成器与基线刷新 → 门禁全绿（详见 design/use-cases.md UC-1）；
2. implementing 阶段 agent 收到新版 inline 执行纪律（`The Task Loop`、完成契约、Rulings not stalls）+ 本仓覆盖条目对三处不可执行项的收口；
3. 上游再发新版时，维护者先看"镜像 3 项是否变"决定是否重刷生成物与基线（UC-3），而不是每次全量重来。

## 功能点（FR）

- **FR-1: 全量同步 14 份 vendor 原文**  
  复制本地 `~/Documents/ai/skills/superpowers/skills/*/SKILL.md` 到 `src/domain/prompt/vendor/superpowers/*/SKILL.md`，保持目录结构。

- **FR-2: 核对 7 份 overrides.md 的引用完整性**  
  逐条读「覆盖 N · XXX」，grep 新版 vendor 原文验证引用位置仍存在；引用失效时记录并修复。

- **FR-3: 重建 fragments.ts 并验证构建**  
  执行 `pnpm run build`，检查生成无报错、fragments.ts 包含 14 份 vendor 原文。

- **FR-4: 跑单测验证注入文本**  
  执行 `npx vitest run tests/prompt-categories.test.ts tests/design-prompt-registration.test.ts`，确认类型轴与 design 注入单测全过。

- **FR-5: 抽检注入文本含新版关键段落**  
  调用 `resolveStagePrompt({ stage: 'implementing', difficulty: 'heavy', category: 'feature' })`，验证返回文本包含新版 executing-plans 的「inline 执行模式 / ledger 纪律 / 四种停止条件」段落。

## 验收口径（可执行）

**命令与期望输出**：

1. **差分验证**：
   ```bash
   for d in brainstorming dispatching-parallel-agents executing-plans finishing-a-development-branch receiving-code-review requesting-code-review subagent-driven-development systematic-debugging test-driven-development using-git-worktrees using-superpowers verification-before-completion writing-plans writing-skills; do
     diff -q ~/Documents/ai/skills/superpowers/skills/$d/SKILL.md src/domain/prompt/vendor/superpowers/$d/SKILL.md && echo "SAME $d" || echo "DIFF $d"
   done
   ```
   **期望**：14 份全部输出 `SAME <skill>`。

2. **引用完整性验证**（示例：brainstorming/heavy/overrides.md 覆盖 2）：
   ```bash
   grep -n "docs/requirements/REQ-xxxxxx/requirement.md" src/domain/prompt/vendor/superpowers/brainstorming/SKILL.md
   ```
   **期望**：找不到该路径（vendor 原文用的是 `docs/superpowers/specs/…`），证明 overrides.md 覆盖 2「落盘路径」引用仍有效（vendor 原文还在说错误的路径，本仓仍需覆盖）。

3. **构建验证**：
   ```bash
   pnpm run build 2>&1 | grep -E "error|failed"
   ```
   **期望**：无 error / failed 输出。

4. **单测验证**：
   ```bash
   npx vitest run tests/prompt-categories.test.ts tests/design-prompt-registration.test.ts 2>&1 | tail -5
   ```
   **期望**：最后一行含 `Test Files  2 passed (2)` 或 `Tests  XXX passed`。

5. **注入文本抽检**（验证新版 executing-plans 的关键段落已注入）：
   ```bash
   node -e "import('./src/domain/prompt/index.js').then(m => {
     const r = m.resolveStagePrompt({ stage: 'implementing', difficulty: 'heavy', category: 'feature' });
     const has = ['inline execution', 'ledger', 'ruling'].every(kw => r.text.toLowerCase().includes(kw));
     console.log(has ? 'PASS: 新版关键段落已注入' : 'FAIL: 缺新版关键词');
   })"
   ```
   **期望**：输出 `PASS: 新版关键段落已注入`。

## 讨论与裁定记录（D-x）

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|------|----------|------|---------|------|
| D-1 | 2026-10-08 勘察阶段："brainstorming 的 vendor 原文已是本仓自写完整档，为什么还要更新 vendor 目录里的 SKILL.md？" | 更新：vendor 目录存的是"原始 superpowers 官方版本"，用于留档与对比；本仓注入的 heavy.md 是自写档，两者并存。overrides.md 的"上文"指的是 heavy.md（本仓自写档），不是 vendor/brainstorming/SKILL.md。本仓 brainstorming/heavy.md 开头注释写明「vendor 原文留档 `src/domain/prompt/vendor/superpowers/brainstorming/SKILL.md`（不再作为 heavy 主 skill 注入）」——vendor 目录是历史存档，不参与实际注入，但要保持与上游同步供对比。 | FR-1 | vendor/superpowers/ 目录存在且包含 14 份 SKILL.md，与本地 ~/Documents/ai/skills/superpowers/skills/ 内容一致 |
| D-2 | 2026-10-08 需求分析："overrides.md 的引用完整性核对，是逐条人工 grep，还是写自动化脚本？" | 人工 grep：7 份 × 平均 6 条 = 约 42 条引用，写脚本成本高于人工逐条核对。design 阶段写测试策略时评估是否值得自动化；若后续需频繁更新 vendor，再投自动化。本次是首次全量同步，引用点数量可控；若发现引用失效较多或 vendor 更新频率高，design 阶段再列「引用完整性自动化测试」任务。 | FR-2 | 7 份 overrides.md 的每条「覆盖 N」都能在对应 vendor 原文里 grep 到被覆盖的关键词 |
| D-3 | 2026-10-08 需求分析："新版 executing-plans（373 行）与旧版（64 行）差异巨大，是否要重写 implementing/heavy.md 与 implementing/heavy/overrides.md？" | 不重写：implementing/heavy.md 是本仓自写档（含 reqboard_task_move / reqboard_task_report 等本仓工具面接线），新版 executing-plans 的 inline 执行纪律可选择性吸收（如 ledger / ruling），但不全盘替换。overrides.md 核对引用完整性即可，不因 vendor 大改而重构。本仓流水线（六节点）与 superpowers 流水线（brainstorming + writing-plans + executing-plans）本就不一致；vendor 更新是为了吸收其最佳实践（如 ledger 记录、ruling 决策留痕），不是为了复刻其流程。 | FR-1, FR-2 | implementing/heavy.md 与 implementing/heavy/overrides.md 保持本仓自写档结构，只更新 vendor/superpowers/executing-plans/SKILL.md |
| D-4 | 2026-10-08 立项后提交："需求声明了 frontend 端侧但无界面改动，为什么豁免原型？" | 豁免：本需求更新的是提示词分片（vendor 原文含前端提示：原型 / 组件树纪律），不产生新的 UI 界面，无需交原型。标 frontend 是为了在 design 阶段触发 frontend.md（说明 vendor 原文里前端纪律的影响），不是为了做 UI。原型是给「会产生界面产物」的需求用的；提示词分片更新虽影响前端提示词注入，但它本身不是界面，不需要画原型。 | FR-1 | requirement.md front-matter 包含 `prototype_exempt: <理由>` 且本条 D-4 裁定已落账 |

## 原型（本需求无 UI，跳过）

本需求为纯后端改动（提示词分片更新），无界面产物，不交原型。

## 外部依赖与假设

**依赖**：
- 本地 `~/Documents/ai/skills/superpowers/skills/` 目录存在且包含最新版 14 份 SKILL.md；
- 仓内构建命令 `pnpm run build` 可用，且会重新生成 `src/domain/prompt/generated/fragments.ts`；
- 单测命令 `npx vitest run` 可用。

**假设**：
- 本地 superpowers 分片的更新是向前兼容的（不会引入破坏性变更导致本仓 overrides.md 全部失效）；
- vendor 原文更新后，本仓的类型档（36 份）与难度档（light/heavy）不需要跟着改（它们是本仓自写，不依赖 vendor 原文）。

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| overrides.md 引用失效超过 50% | 需大量改写 overrides，工作量翻倍 | 中 | design 阶段先抽检 3 份 overrides（brainstorming / design / implementing）核对引用完整性，评估失效比例后再决定是否全量更新 |
| 新版 vendor 原文引入与本仓类型档冲突的措辞 | 单测跑红，需调整类型档或补 overrides | 低 | 先跑单测，若失败则定位冲突点，在 overrides.md 里补一条覆盖优先于改类型档 |
| 构建失败（vendor 原文有语法错误） | 无法生成 fragments.ts，注入链路断裂 | 低 | 复制前先在本地 superpowers 仓库验证 SKILL.md 无语法错误；若仓内构建失败，手工修复后提 issue 给 superpowers 上游 |
| 新版 vendor 原文过长导致注入超 budget | agent 在某些阶段收到裁剪后的提示词，关键纪律丢失 | 中 | design 阶段列「注入文本长度」验证任务，抽检 6 个阶段的 resolveStagePrompt 返回值，若 `trimmed > 0` 则评估是否需要精简 vendor 原文或提高 budget |

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t-3619e8、t-e49c68、t-283c99 |
| FR-2 | ✅ 已接收 | t-4d5077 |
| FR-3 | ✅ 已接收 | t-e49c68、t-4649ba |
| FR-4 | ✅ 已接收 | t-e97596、t-e30c47、t-a9fc97 |
| FR-5 | ✅ 已接收 | t-a9fc97 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
