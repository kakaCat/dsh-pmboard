---
serves: FR-1, FR-3, FR-4
---

# 数据模型设计 — 更新 vendor superpowers 分片到本地最新版 `serves: FR-3`

> 本需求**无数据库、无 schema、无数据迁移**。这里的"数据"指三样构建期/测试期的结构化资产：
> ① 生成的分片记录；② 上游来源档案；③ P1 注入基线快照。三者的字段形态逐一定死。

## 新增/修改的数据结构 `serves: FR-3`

### ① `GeneratedFragment`（`src/domain/prompt/generated/fragments.ts`） `serves: FR-3`

**结构不变**（接口签名一字不改），只有一条记录的内容变：

```ts
export interface GeneratedFragment {
  readonly id: string                                  // 如 'implementing/heavy'
  readonly stage: string                               // 'brainstorming'|'design'|'decomposing'|'implementing'|'accepting'|'archived'|'*'
  readonly difficulty: string                          // 'light'|'heavy'|'*'
  readonly category: string                            // 'feature'|'bug'|'doc'|'refactor'|'spike'|'chore'|'*'
  readonly priority: number | 'floor'                  // floor 永不裁；数值越小越先被裁
  readonly text: string                                // md 正文逐字节内联（JSON.stringify 转义）
  readonly include?: readonly string[]                 // 仅类型档路由壳有：include-only，text 为空串
}
```

**本次变动的记录（2 条，同属 `implementing/heavy` 这一个注入键）**：

| 字段 | 变更前 | 变更后 | 说明 |
|------|-------|-------|------|
| `id` | `implementing/heavy` | 同 | 不变 |
| `stage` / `difficulty` / `category` | `implementing` / `heavy` / `*` | 同 | 由路径唯一决定，不受内容影响 |
| `priority` | `floor` | 同 | 由路径 `implementing/heavy.md` 决定 |
| `text` | 2305 字节（v6.3.0 executing-plans） | **20405 字节**（v6.4.2 executing-plans） | 逐字节等于新 vendor 原文 |
| `include` | 无 | 无 | heavy 主档不是壳 |

另一条变动记录是 `implementing/heavy/overrides`（`priority=floor`）：`text` 由 2929 变 4062 字节（新增「覆盖 10」，t3）。它与 `implementing/heavy` 落在**同一个注入键**里，故基线快照仍只有 `implementing/heavy` 一个键变（见下表）。

**记录总数不变：129 条**。构成（拆分与实施照此核对，条数错即说明误删/误增了分片）：

| 类别 | 条数 | 计算 |
|------|-----:|------|
| 节点难度档 | 12 | 6 节点 × (light + heavy) |
| heavy-extra 追加节 | 1 | `brainstorming/heavy-extra.md`（`priority=10`，只被同难度路由壳 include） |
| 难度 overrides | 7 | 5 份 `<stage>/heavy/overrides.md`（accepting/archived/brainstorming/design/implementing）+ 2 份 `<stage>/light/overrides.md`（design/implementing） |
| 全局铁律 | 1 | `common/iron-rules.md`（`(*,*,*)`，每次解析恒并入） |
| 类型档（③ 层） | 36 | 6 节点 × 6 类型 |
| 类型档路由壳（① 层） | 72 | 36 × 2 难度（`text` 为空串，只有 `include`） |
| **合计** | **129** | — |

### ② 上游来源档案（`src/domain/prompt/vendor/superpowers/ATTRIBUTION.md`） `serves: FR-1`

**不是代码结构，但是可复核的数据结构**——`tests/prompt-tiers.test.ts` 会断言其中的值。形态定死：

| 数据项 | 形态 | 本次值 |
|-------|------|-------|
| 仓库 | URL | `https://github.com/obra/superpowers.git`（不变） |
| 引用 | 分支/ref | `origin/main`（不变） |
| commit | 40 位 hex | `8ca22dba9a94f28898bbce59f2537ff4d87c747d`（原 `b36e0829c6d0140e93cfef2ca599b1b07d4a7797`） |
| tag | `v<主>.<次>.<修>` | `v6.4.2`（原 `v6.3.0`） |
| 许可 | 标识 | `MIT`（不变，含版权行） |
| 抓取时点 | 日期时间 + 时区 | 执行当日（原 `2026-09-17 22:42:44 CST`） |
| 抓取方式 | 命令原文 | `git show <ref>:skills/<name>/SKILL.md` |
| 核对 | 命令 + 期望输出 | `git log -1` = 新 commit；`git tag --list v6.4.2` = `v6.4.2` |
| 落盘清单 | 14 行表：skill / 字节数 / 行数 / 本仓角色 | 见 architecture.md 的差异实测表 |
| 镜像清单 | 3 行映射说明 | `implementing→executing-plans`；`accepting→verification-before-completion`；`archived→finishing-a-development-branch` |
| 许可原文 | MIT 全文代码块 | 不变 |

**一致性要求**：落盘清单的字节数/行数必须是**实测值**（`wc -c` / `wc -l`），与磁盘文件对得上；写错即档案失真（无门禁拦这一项，靠复核）。

### ③ P1 注入基线快照（`tests/fixtures/stage-prompts-baseline-p1.json`） `serves: FR-4`

形态：`Record<string, string>`，**键 12 个**（6 节点 × 2 难度），值为 `resolveStagePrompt({stage, difficulty})` 的 `text`（逐字，含空白与换行，不 trim）。

```jsonc
{
  "brainstorming/light": "…",  "brainstorming/heavy": "…",
  "design/light": "…",         "design/heavy": "…",
  "decomposing/light": "…",    "decomposing/heavy": "…",
  "implementing/light": "…",   "implementing/heavy": "…",   // ← 本需求唯一变化的键（其解析含 heavy 与 heavy/overrides 两条记录）
  "accepting/light": "…",      "accepting/heavy": "…",
  "archived/light": "…",       "archived/heavy": "…"
}
```

| 键 | 本次是否变 | 原因 |
|----|-----------|------|
| `implementing/heavy` | **变** | 镜像换成 v6.4.2 executing-plans + 新增 overrides 条目 |
| 其余 11 键 | 不变 | 对应分片一字未动 |

**生成方式**：`node scripts/dump-stage-prompts.mjs`（幂等，连跑两次输出逐字节一致）。**不得手改**该文件。

### ④ 预算常量（`src/domain/prompt/budget.ts`） `serves: FR-4`

| 常量 | 值 | 本次 |
|------|----|------|
| `DEFAULT_PROMPT_BUDGET` | `24000`（字符） | **不改** |
| `isFloor(f)` | `f.priority === 'floor'` | 不改 |

**实测投影**（`implementing/heavy/<category>` 的注入字符数）：

| category | heavy + overrides + 类型档 + iron-rules |
|----------|---------------------------------------:|
| feature | 23158 |
| bug | 23098 |
| refactor | 23099 |
| doc | 23096 |
| spike | 23089 |
| chore | 23057 |

最大值 23158 ≤ 24000，**余量 842 字符**。

## 数据流与状态 `serves: FR-1, FR-3`

```text
[上游 v6.4.2 SKILL.md ×14]
        │ ① 逐字节复制（I-1）
        ▼
[vendor/superpowers/<skill>/SKILL.md]
        │ ② 镜像进 fragments（implementing 一份，I-2）
        ▼
[fragments/implementing/heavy.md]─────┐
[fragments/**/*.md 其余 125 条记录]    │ ③ 生成器内联（I-3）
        │                             │
        ▼                             │
[generated/fragments.ts  129 条记录]◀─┘
        │ ④ 内存常量（运行时不读盘）
        ▼
[FRAGMENT_LIBRARY] → resolveFragmentPlan（回退链 ①-⑤）→ applyBudget → assembleText
        │
        ▼
[注入文本 text / fragmentIds / charCount / overBudget]
        │ ⑤ 回归锁（I-5）
        ▼
[tests/fixtures/stage-prompts-baseline-p1.json  12 键]
```

**没有运行时状态机**：全链路是"构建期确定性变换 + 运行时纯函数"，不存在并发写入、不存在部分更新、没有需要回滚的持久状态。唯一的"状态"是仓库里的文件，回滚手段是 git revert。

## 迁移与回滚 `serves: FR-3`

**无数据迁移**（无 DB、无持久化状态）。回滚口径：

| 场景 | 回滚方式 | 影响 |
|------|---------|------|
| 更新后门禁红、定位不了原因 | `git revert` 本次提交 | 回到 v6.3.0 全量状态（vendor + 镜像 + 产物 + 基线 + 测试同批回滚） |
| 只想回退 executing-plans 一份 | 把该份 vendor 原文与 `fragments/implementing/heavy.md` **成对**回退到 v6.3.0 | 两份必须同批（镜像契约）；单退一份必红 |
| 基线快照刷错 | 重跑 `node scripts/dump-stage-prompts.mjs` | 幂等，可反复刷 |

**要点**：回滚的最小单位是"成对的 vendor 原文 + 镜像"，不是单个文件。ATTRIBUTION 的字节/行数表必须与回滚后的实际值一致（否则档案失真）。

## 关键决策与取舍 `serves: FR-3, FR-4`

| 决策 | 选择 | 取舍 |
|------|------|------|
| 生成物结构 | 不改 `GeneratedFragment`、不改 129 条 | 让"只换文本"的语义在数据层也成立，测试与调用方零适配 |
| 预算常量 | 维持 24000 | 实测 23158 未超；调预算会放宽全部节点闸门（范围蔓延） |
| 基线策略 | 显式重跑脚本、只 1 键变 | 换取"变更留痕"（diff 即证据）；代价是 86KB 快照进 diff |
| ATTRIBUTION 是否纳入门禁断言 | 参与（`prompt-tiers` ⑥ 断言 tag/commit） | 换取换源时"忘记改档案"会红；代价是换源必须同批改测试 |
| 是否新增持久化 | 不新增 | 全链路保持构建期确定性 + 运行时纯函数，不引入状态 | 

## 技术方案与亮点 `serves: FR-3`

1. **先算结构再改内容**：把"129 条记录构成"与"1 条 text 变"写清，执行者能一眼判断自己是否误删了分片（条数守恒是可核对的）。
2. **档案当数据管**：ATTRIBUTION 的 commit/tag/字节数进测试断言口径，把"文档性记录"变成"会红的数据"——这是本次换源不再漏更新的机制。
3. **回滚单位显式化**：点明"vendor 原文 + 镜像必须成对"，避免执行者只回退一份导致门禁红、误判为回滚失败。
4. **预算余量留数字**：842 字符余量写进设计，让"overrides 能不能再加"变成可计算的判断，而不是拍脑袋。
