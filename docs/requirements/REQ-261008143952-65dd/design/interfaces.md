---
serves: FR-1, FR-2, FR-3
---

# 接口设计 — 更新 vendor superpowers 分片到本地最新版 `serves: FR-1`

> 本需求**不改任何对外工具接口**（`reqboard_*` 全部不动）。这里的"接口"指本仓内部五条**契约边界**：
> 上游→vendor、vendor→镜像、镜像→产物、产物→注入、注入→基线。每一处定死形态，拆分与实施照此对齐。

## 接口清单 `serves: FR-1, FR-2, FR-3`

「接口 id」是本需求的引用键；**每一行都是一个可机器复核的契约**（跑什么命令、比什么字节）。

| 接口 id | 接口 | 方向 | 形态 | 变更类型 | serves |
|---------|------|------|------|---------|--------|
| I-1 | 上游原件 → vendor 落盘 | 文件复制 | 逐字节相等（`SKILL.md`） | 内容更新 | FR-1 |
| I-2 | vendor 原文 → heavy 镜像 | 镜像门禁 | 逐字节相等（`Buffer.compare === 0`） | 内容更新 | FR-1 |
| I-3 | fragments/**.md → generated/fragments.ts | 构建期生成 | 内存重算与磁盘产物逐字节相等 | 内容更新 | FR-3 |
| I-4 | 分片库 → 注入文本 | 纯函数调用 | `resolveStagePrompt(req)` 签名与返回结构不变 | **无变更** | FR-3 |
| I-5 | 注入文本 → P1 基线快照 | 回归锁 | 12 键逐字相等（含空白与换行） | 值更新 | FR-4 |
| I-6 | 上游来源 → ATTRIBUTION 记录 | 档案 | repo/引用/commit/tag/许可/抓取时点 + 字节行数表 | 值更新 | FR-1 |
| I-7 | 注入文本 → 覆盖条目 | 分层覆盖 | overrides 为 `priority='floor'`，恒在原文之后 | **新增条目** | FR-2 |

## 新增/修改的工具接口 `serves: FR-1`

### 结论：`reqboard_*` 工具面零改动 `serves: FR-1`

本需求不新增、不删除、不改名任何 `reqboard_*` 工具；不新增工具参数；不改返回结构。`tests/prompt-gates.test.ts` 的「注入文本里的 `reqboard_*` ⊆ 注册集合」门禁预期保持绿——新版 executing-plans 正文**不含** `reqboard_` 字样（实测 0 处），不会引入未注册工具名。

### I-1 上游原件 → vendor 落盘（逐字节） `serves: FR-1`

| 项 | 值 |
|----|----|
| 源 | `/Users/mac/Documents/ai/skills/superpowers/skills/<skill>/SKILL.md` |
| 目标 | `src/domain/prompt/vendor/superpowers/<skill>/SKILL.md` |
| 约束 | 逐字节相等；**不得**改写、不得 trim、不得补 front-matter |
| 份数 | 14（`brainstorming`、`dispatching-parallel-agents`、`executing-plans`、`finishing-a-development-branch`、`receiving-code-review`、`requesting-code-review`、`subagent-driven-development`、`systematic-debugging`、`test-driven-development`、`using-git-worktrees`、`using-superpowers`、`verification-before-completion`、`writing-plans`、`writing-skills`） |
| 复核 | 逐份 `diff -q <源> <目标>` 全部无输出 |

### I-2 vendor 原文 → heavy 镜像（**本设计的硬约束**） `serves: FR-1`

| 项 | 值 |
|----|----|
| 唯一映射表 | `scripts/inline-prompt-fragments.mjs` 的 `VENDOR_MAIN_SKILLS` |
| 映射内容 | `implementing` → `executing-plans`；`accepting` → `verification-before-completion`；`archived` → `finishing-a-development-branch` |
| 约束 | 映射内 `fragments/<stage>/heavy.md` 与 `vendor/superpowers/<skill>/SKILL.md` **逐字节相等** |
| 判据函数 | `vendorMirrorProblems()` 返回空数组 |
| 本次实际变动 | **仅 `implementing`**（新 executing-plans 20405 B）；`accepting` / `archived` 两份上游未变，镜像不动 |
| 不在映射内 | `brainstorming`（2026-10-08 裁定）、`design`（2026-09-21 裁定）、`decomposing`（上游无对应 skill）——其 heavy 为自写档，**不做**逐字断言 |

**违反后果**（两条独立门禁同时红）：
1. `node scripts/check-prompt-fragments.mjs` → stderr 打印 `fragments/implementing/heavy.md 与 vendor/executing-plans/SKILL.md 不一致（X vs Y bytes）` → `exit 1`；
2. `tests/prompt-tiers.test.ts` ④ → `expect(fragmentById('implementing/heavy').text).toBe(vendorText('executing-plans'))` 失败。

### I-3 fragments/**.md → generated/fragments.ts（构建期生成） `serves: FR-3`

| 项 | 值 |
|----|----|
| 生成命令 | `node scripts/inline-prompt-fragments.mjs` |
| 产出 | `src/domain/prompt/generated/fragments.ts` |
| 记录结构 | `GeneratedFragment { id: string; stage: string; difficulty: string; category: string; priority: number \| 'floor'; text: string; include?: readonly string[] }` |
| 记录条数 | **129**（不变）：节点难度档 12 + `brainstorming/heavy-extra` 1 + 难度 overrides 7 + `common/iron-rules` 1 + 类型档 36 + 类型档路由壳 72 |
| 幂等 | 同源两次运行产物逐字节一致 |
| 复核 | `node scripts/check-prompt-fragments.mjs` → `OK` + `exit 0` |
| 本次变化 | 2 条记录的 `text`：`implementing/heavy`（2305 → 20405 字节）与 `implementing/heavy/overrides`（2929 → 4062 字节）——同属 `implementing/heavy` 一个注入键 |

### I-4 分片库 → 注入文本（**无变更**） `serves: FR-3`

签名与返回结构一律不动（这是"换内容不换接口"的保证）：

```ts
resolveStagePrompt(
  req: {
    stage: PromptStage
    difficulty?: 'light' | 'heavy'     // 缺省由 requirement 文本推断
    category?: RequirementCategory     // 缺省 feature
    requirement?: { title: string; description: string }
    declaredDifficulty?: 'light' | 'heavy'
    budget?: number
  },
  library?: readonly Fragment[],
): {
  text: string
  fragmentIds: readonly string[]
  routeKey: string                     // '<stage>/<difficulty>/<category>'
  hitLevel: 1 | 2 | 3 | 4 | 5
  charCount: number
  trimmed: readonly string[]
  overBudget?: { reason: 'floor-exceeds-budget'; floorChars: number; budget: number }
}
```

**回退链不变**：①`(stage,difficulty,category)` → ②`(stage,difficulty,*)` → ③`(stage,*,category)` → ④`(stage,*,*)` → ⑤`(*,*,*)`（⑤ 恒并入）。本次只动 ①/② 层里 `implementing/heavy` 的正文。

`implementing/heavy/<category>` 的 `fragmentIds` 顺序（三段注入顺序，`prompt-tiers` ⑥ 锁定）：

```text
implementing/heavy  →  implementing/heavy/overrides  →  implementing/<category>  →  common/iron-rules
   （镜像原文，floor）        （覆盖条目，floor）          （类型档，priority=10）      （铁律，floor，恒并入）
```

### I-7 覆盖条目（overrides）契约 `serves: FR-2`

新增条目必须满足既有形状（`fragments/implementing/heavy/overrides.md`）：

| 项 | 契约 |
|----|------|
| 标题行 | `## 本仓覆盖条目（覆盖上文与本仓冲突之处；priority=floor，永不被裁）`（既有，不改） |
| 条目形状 | `- [ ] **覆盖 N · <主题>**：上游怎么说 → 本仓怎么做` |
| 编号 | 顺延既有最大编号（现最大为「覆盖 9」→ 新增为「覆盖 10」） |
| priority | `floor`（由路径 `implementing/heavy/overrides.md` 决定，恒不裁） |
| 位置语义 | 在 heavy 原文**之后**、类型档与 iron-rules 之前（`fragmentIds` 顺序见 I-4） |

## 删除的接口 `serves: FR-1`

**无删除**。本需求不删接口、不删分片、不删文件。14 份 vendor 文件全部保留（内容更新），129 条分片记录全部保留。

## HTTP API 变更 `serves: FR-3`

**不适用**：本需求无 HTTP 面改动。reqboard 宿主 API、SSE 推送、看板路由全部不动；`resolveStagePrompt` 是进程内纯函数，不经网络。

## 关键决策与取舍 `serves: FR-1, FR-2`

| 决策 | 选择 | 取舍 |
|------|------|------|
| 接口面收敛 | 明确"工具接口零改动"，把范围锁在 5 条内部契约 | 抽掉"要不要动工具"的讨论空间；代价是文档要写清 5 条契约的形态 |
| 镜像映射是否调整 | 不调整（仍 3 项） | 新增/删除映射项都会改变"哪些节点由上游驱动"的语义，属另一次需求 |
| 冲突承载位置 | overrides（floor），不动 vendor 原文 | 保上游逐字节保真（I-1/I-2 的前提）；代价是 overrides 增长吃预算余量 |
| 基线快照策略 | 显式重跑 `dump-stage-prompts.mjs` | diff 即变更留痕（脚本头声明的既有纪律）；代价是基线文件进 diff |

## 技术方案与亮点 `serves: FR-2, FR-3`

1. **契约化而非步骤化**：把"更新分片"落成 7 条可机器复核的接口（比字节、比 exit code、比 12 键文本），执行者不需要猜测"怎么算做对了"。
2. **I-2 单点定死最易踩的坑**：本需求最可能的失败是"只换了 vendor 没换镜像"。把它写成带判据函数名与报错原文的硬约束，而非一句提醒。
3. **I-4 明确声明"无变更"**：让拆分阶段不必为 `resolveStagePrompt` 造卡，避免把"换文本"误当"改接口"。
4. **I-7 用既有形状承载新冲突**：不发明第二套覆盖机制，顺延既有编号与形状，保持 overrides 文件可读、可核。
