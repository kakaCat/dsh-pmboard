---
serves: FR-1, FR-2, FR-6
---

# 用例设计 — 把 implementing 移出 vendor 镜像并改写自写实施档 `serves: FR-1`

> 本需求的"用户"是**提示词的读者与维护者**：进入实施阶段的 agent（读注入文本执行任务卡）、
> 被派发的子代理、维护者（上游换版 / 改断言 / 刷基线）、后来者（查"本仓怎么实施"）。
> 下面每条 UC 都写清：谁、什么场景、看到什么、失败分支停在哪。

## 场景总览 `serves: FR-1, FR-2`

| UC | 角色 | 场景 | 类型 | serves |
|----|------|------|------|--------|
| UC-1 | 维护者 | 把 implementing 换底（顺利路径：映射表与自写档同批） | 主流程 | FR-1, FR-2 |
| UC-2 | implementing 阶段 agent | 开工，读到自写档并照它执行任务卡 | 主流程 | FR-2, FR-6 |
| UC-3 | 子代理 | 被派发执行一张子卡，按档内纪律汇报 | 主流程 | FR-2 |
| UC-4 | 后来者 | 查"本仓实施模式是什么"，从项目文档找到答案 | 主流程 | FR-6 |
| UC-5 | 维护者 | 改完发现门禁红（三种红灯的定位路径） | 失败分支 | FR-4, FR-5 |
| UC-6 | 维护者 | 上游再发新版时判断"要不要跟着动" | 边界分支 | FR-1 |

## UC-1 维护者把 implementing 换底（顺利路径） `serves: FR-1, FR-2`

**前置**：需求已确认；`pnpm prompts:check` 当前绿。

**操作流程**：

1. 改映射表：`scripts/inline-prompt-fragments.mjs` 的 `VENDOR_MAIN_SKILLS` 删 `implementing` 项，
   同步 `tests/prompt-tiers.test.ts` 的同源副本（两处同批，分叉即口径不一）；
2. 改写 `fragments/implementing/heavy.md` 为自写档（按 architecture.md 的 9 节骨架，≤ 5,500 字符）；
3. 收编 `fragments/implementing/heavy/overrides.md`：10 条 → 2 条，编号连续；
4. 同步档案与探针：`ATTRIBUTION.md` §2 角色列 + §3 清单；`prompt-path-probe.mts` 删死条目；
5. 跑链：`node scripts/inline-prompt-fragments.mjs` → `node scripts/check-prompt-fragments.mjs`
   → `node scripts/dump-stage-prompts.mjs`；
6. 比对影响面：`git diff tests/fixtures/stage-prompts-baseline-p1.json`，确认**只 1 键变**；
7. 全量验证：`npx vitest run` + `pnpm typecheck`；
8. 写文档：`docs/architecture/project-manual.md` 新增「机制备忘：本仓实施模式」+ 变更记录一行。

**预期结果**：

- `VENDOR_MAIN_SKILLS` 打印 `accepting,archived`；
- `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length` < 8000（改前 23,852）；
- `pnpm prompts:check` 退出码 0；`npx vitest run` 全绿；
- vendor 原文 `wc -c` 仍为 20405。

**边界条件**：

- 若先改 heavy.md 再改映射表：中间态门禁必红（镜像不一致）——**这不是错误，是设计要的响亮失败**；
- 若 overrides 收编后剩余条目数 ≠ 2：回到 architecture.md 的收编映射表逐条重判（哪条属于"本仓流程"）。

## UC-2 implementing 阶段 agent 开工读到自写档 `serves: FR-2, FR-6`

**前置**：需求进入 implementing；父卡已展开子卡链。

**操作流程**：

1. agent 收到注入文本 = `implementing/heavy.md` + `heavy/overrides.md` + `common/iron-rules.md`；
2. 读「本仓实施模式」节：知道自己是**任务卡 + 子代理**这条路上的执行者（不是上游 inline 模式的执行者）；
3. `reqboard_task_move(to=in_progress)` 取到卡全文（title / description / acceptance / implementation / context）；
4. 照卡执行 → 自证（跑卡上验收命令、读输出）→ `reqboard_task_report` 汇报；
5. 遇范围变更 / 方案取舍 → `reqboard_ask_confirm`；普通信息征询 → `ask_user_question`；
6. 全部卡完成 → 「下一步：accepting —— 用 `reqboard_submit(kind=verification)` 交棒」。

**预期结果**：

- 注入文本里**不再出现** `scripts/task-start` / `scripts/task-done` / `docs/superpowers/plans/…`
  （上游产物路径 0 命中）；
- 注入文本里出现本仓工具名（`reqboard_task_move` / `reqboard_task_report` / `reqboard_ask_confirm`）；
- 23,852 → ≤ 7,700 字符，24,000 预算下余量从 148 回到 ≥ 16,300。

**边界条件**：

- 上游附属 skill（tdd / subagent-driven-development 等）在注入文本里只以"留档不注册、不得尝试加载"出现
  （overrides 1）——agent 不得因"加载不了"停手；
- 若 agent 在档内找不到"某件事该怎么做"：那是**档的缺口**，不是可以自由发挥的许可——按
  `reqboard_ask_confirm` 问人，并在汇报里登记缺口。

## UC-3 子代理执行一张子卡 `serves: FR-2`

**前置**：父卡已开工，子卡链已展开；本次被派发的是 `dev` 段的子卡。

**操作流程**：

1. 子代理拿到**自包含**的卡（不共享主窗口上下文）：卡上有 title / 验收 / 实施方案；
2. 照卡改文件、跑卡上的验收命令、读输出；
3. 完成后汇报（做了什么 / 改动文件 / 下一步），由链上 `review` 段与门禁复核。

**预期结果**：

- 复核由 `review` 段子卡 + 门禁承担（不是"作者自己看一眼"）；
- 卡的三要素（在做什么 / 解决什么问题 / 得到什么结果）齐备，否则被 `task_card_incomplete` 拦下。

**边界条件**：

- 子卡请求预算到顶（软上限，见 `docs/architecture/subtask-request-budget.md`）：**先停下、再汇报**，
  由 owner 放行后继续，不得自行续跑；
- 段落集合与判定见 `docs/architecture/subtask-stage-template.md`（档内只引用不复述，避免机制漂移）。

## UC-4 后来者查「本仓实施模式」 `serves: FR-6`

**前置**：新窗口 / 新维护者问「本仓实施到底怎么跑」。

**操作流程**：

1. 读 `docs/architecture/project-manual.md` 的「机制备忘：本仓实施模式（任务卡 + 子代理）」节；
2. 顺指针读 `src/domain/prompt/fragments/implementing/heavy.md`（执行者视角的完整纪律）；
3. 需要机制细节（子卡链、请求预算）时读对应的领域篇。

**预期结果**：**不需要读需求目录**就能答出本仓实施模式；答案唯一（只有一处定义），
不出现"文档 A 说 inline、文档 B 说子代理"的自相矛盾。

**边界条件**：本设计**刻意不在** `docs/architecture/prompt-context-layering.md` 重复该节——
两处写必然漂移；若后来者在该篇找不到，那是设计选择，不是遗漏（该篇只讲分层投递，不讲实施模式）。

## UC-5 门禁红的三种定位路径（失败分支） `serves: FR-4, FR-5`

**场景 A：`heavy.md ↔ vendor 原文不一致`**

1. `node scripts/check-prompt-fragments.mjs` 打印 `[check-prompt-fragments] FAIL: heavy.md ↔ vendor 原文不一致` → `exit 1`；
2. 判断：**映射表没移出**（不是 heavy.md 写错了）；
3. 处置：补 UC-1 步骤 1（脚本 + 测试副本两处），**不要**把 heavy.md 改回去迁就 vendor；
4. 停在哪：链不往下走（生成物与基线不刷），直到自洽。

**场景 B：`implementing light 不应含 heavy 独有要素「The Task Loop」`**

1. `npx vitest run tests/prompt-tiers.test.ts` ⑤ 组红；
2. 判断：骨架节名漏进了 light 侧（`light.md` / `light/overrides.md` / `common/iron-rules.md` 之一）；
3. 处置：把该节名只留在 heavy 档；
4. 停在哪：light 组不绿不提交。

**场景 C：`diff implementing/heavy`（基线不匹配）**

1. `npx vitest run tests/prompt-baseline.test.ts` 报 diff；
2. 判断：P1 基线没重刷（或重刷时连别的键一起变了）；
3. 处置：先 `git diff` 逐键看**变了几键**——只 1 键 → 重刷；多于 1 键 → **先查越界**，
   不要直接重刷（重刷 = 把缺陷固化）；
4. 停在哪：影响面确认后才重刷。

## UC-6 上游再发新版时的判断路径 `serves: FR-1`

**前置**：`~/Documents/ai/skills/superpowers` 更新到新 tag。

**操作流程**：

1. 先看 `VENDOR_MAIN_SKILLS` 还剩哪几项（改后 = `accepting` / `archived`）；
2. 只有被映射的节点才需要"逐字节镜像同步 + 断言更新 + 基线重刷"；
3. `implementing` 已不在映射内 → 上游 executing-plans 再怎么改，**都不影响本仓注入**；
4. 但上游原文仍要留档同步（ATTRIBUTION 的来源表与字节/行数表），这是"档案保真"而非"注入保真"。

**预期结果**：维护成本与"映射了几项"成正比，而不是与"上游有多少 skill"成正比。

**边界条件**：若上游新版把 `executing-plans` 拆成两份 skill，**本仓不跟着拆**——
本仓的映射只按"六节点是否需要 vendor 主 skill"决定，不按上游目录结构决定。

## 关键决策与取舍 `serves: FR-1, FR-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 场景覆盖 | 只写 UC-1（维护者）+ UC-2（执行者） | 加 UC-3/4/5/6 | 本需求的"用户"有四类，且失败分支（门禁红）是最高频的真实路径 |
| 失败分支写法 | 写"重试即可" | 写清"哪种红灯 = 哪个前提没做" | 本仓红线：禁"应该没问题"式收尾；红灯必须能定位到一个具体前提 |
| 后来者的入口 | 让后来者读需求目录 | 项目说明书一处 + 档内指针 | 需求目录是过程材料，不是长期读物；说明书才是"新窗口开工"入口 |

## 技术方案与亮点 `serves: FR-2, FR-6`

- **一条主流程 + 三条红灯定位**：UC-1 覆盖理想路径，UC-5 把三种最常见的红灯变成可照抄的定位动作。
- **上游演进与本仓演进解耦**：UC-6 定义的判断路径让"映射了几项"成为唯一维护成本变量。
- **模式记载单点**：UC-4 与 architecture.md 的「文档更新清单」同口径——只写一处，防漂移。
