---
serves: FR-1, FR-2, FR-3, FR-4
---

# 后端设计 — 更新 vendor superpowers 分片到本地最新版 `serves: FR-3`

> 本需求的"后端"= **提示词分片的构建期生成链路与运行时取词链路**。没有 HTTP 服务、没有数据库、
> 没有业务实体改动。本文档把这条链路的关键逻辑、错误处理与预算/安全考量定死。

## 服务与接口实现 `serves: FR-3`

### 运行时取词（唯一入口，签名不变） `serves: FR-3`

```ts
// src/domain/prompt/index.ts
export function resolveStagePrompt(req: StagePromptRequest, library?: readonly Fragment[]): ResolvedPrompt
```

`resolveFragmentPlan(library, req)` 是纯核心（无 I/O、无 `Date.now`、无 `node:` 依赖，可单测）。本次**不新增、不修改**任何函数签名。

### 构建期生成（本次要重跑的脚本） `serves: FR-3`

| 脚本 | 职责 | 本次动作 |
|------|------|---------|
| `scripts/inline-prompt-fragments.mjs` | 读 `fragments/**.md` → 生成 `generated/fragments.ts`；并校验 vendor 镜像 | **重跑**（写盘） |
| `scripts/check-prompt-fragments.mjs` | 只读门禁：产物与源逐字节 + 镜像逐字节 | 跑（判据） |
| `scripts/dump-stage-prompts.mjs` | 导出 12 键注入基线快照 | **重跑**（写盘） |

### 服务端改动清单（精确到符号） `serves: FR-1`

| 文件 | 符号 / 区段 | 动作 |
|------|------------|------|
| `scripts/inline-prompt-fragments.mjs` | `VENDOR_MAIN_SKILLS` | **不改**（仍 3 项映射） |
| `src/domain/prompt/fragments/implementing/heavy.md` | 整份 | 覆盖为 v6.4.2 `executing-plans` 逐字节 |
| `src/domain/prompt/fragments/implementing/heavy/overrides.md` | 文件尾 | 追加「覆盖 10」（顺延既有最大编号 9） |
| `src/domain/prompt/generated/fragments.ts` | `GENERATED_FRAGMENTS` 中 `id: "implementing/heavy"` 记录 | 由生成器重写（**不得手改**） |
| `src/domain/prompt/budget.ts` | `DEFAULT_PROMPT_BUDGET` | **不改**（24000） |

## 数据流 `serves: FR-3`

```text
构建期（确定性，两次跑逐字节一致）
  fragments/**.md ─┐
                   ├─ readFragments() ─ parseFragmentId()（路径定元数据）
  vendor 镜像 ─────┘        │
                            ├─ typeRouteShells()：为 36 份类型档按 2 难度合成壳
                            ▼
                    buildFragmentsSource()（JSON.stringify 内联 text，整文件模板拼接）
                            ▼
                    generated/fragments.ts（129 条记录）
                            │  镜像校验 vendorMirrorProblems()：不一致 → exit 1
                            ▼
                    check-prompt-fragments.mjs（源/产物逐字节）

运行时（纯函数，不读盘、不联网）
  FRAGMENT_LIBRARY（内存常量）
        │  resolveFragmentPlan：回退链 ①(stage,difficulty,category) →② →③ →④，⑤(*,*,*) 恒并入
        │  expandIncludes()：展开 include 引用（类型档路由壳 → 节点档 + 类型档）
        │  applyBudget()：非 floor 按 priority 升序裁；floor 永不裁；连 floor 都超 → overBudget 结构化报出
        ▼
  assembleText()（非空片段以空行分隔）
        ▼
  注入文本 → h3-inject / capture-section / session-driver / node-input-package
```

### 关键不变式（本次必须保持） `serves: FR-3`

| 不变式 | 内容 | 判据 |
|-------|------|------|
| INV-1 取词唯一入口 | 注入点只调 `resolveStagePrompt`，不新写文案常量表 | 各注入点 import 不变 |
| INV-2 运行时不读盘 | `heavy.md` 内容在构建期内联进产物 | `generated/fragments.ts` 含全文 |
| INV-3 三段注入顺序 | 主档 → overrides → iron-rules | `prompt-tiers` ⑥ 断言 `fragmentIds` 顺序 |
| INV-4 floor 永不裁 | `priority='floor'` 的片段不被 `applyBudget` 移除 | `prompt-gates` 极小预算用例 |

## 关键逻辑 `serves: FR-1, FR-3`

### ① 镜像同步（本次最易错的逻辑） `serves: FR-1`

`vendorMirrorProblems()` 逐项比较 `fragments/<stage>/heavy.md` 与 `readVendorSkill(skill)`，用 `!==` 做**字符串全等**（并打印 `Buffer.byteLength` 差异）。因此：

- 换 `vendor/superpowers/executing-plans/SKILL.md` → **必须**同批换 `fragments/implementing/heavy.md`；
- 两份必须**同一来源、同一批**复制（不能一份是本地 v6.4.2、另一份手改过）；
- 换行符、末尾空行、BOM 都参与全等比较（逐字节语义）。

### ② 生成器的确定性 `serves: FR-3`

`listFragmentFiles()` 递归后 `.sort()`；`readFragments()` 记录按 `id` 字典序；`buildFragmentsSource()` 一条记录一行（`size-budget` 有 400 行硬上限）。新版 executing-plans 正文含 ` ```dot ` 图与缩进，**必须原样**经 `JSON.stringify` 进字面量（生成器只做整文件模板拼接，**不得**做逐行缩进/替换）。

### ③ overrides 追加位置与编号 `serves: FR-2`

`implementing/heavy/overrides.md` 现最大编号为「覆盖 9」，新增为「覆盖 10」。新条目须点名的三处冲突（实测自新版正文）：

| 冲突 | 新版原文依据 | 本仓收口 |
|------|------------|---------|
| 8 处 `superpowers:*` 悬空引用 | 正文引用 `using-git-worktrees` / `systematic-debugging` / `subagent-driven-development` / `test-driven-development` / `verification-before-completion` / `writing-plans` / `requesting-code-review` / `finishing-a-development-branch` | 这些是**留档文件**不是可 load 的 skill；本仓无 skill 加载机制，不得尝试加载 |
| 「不暂停」 | 第 27 行 `Continuous execution: Do not pause to check in with your human partner between tasks` | 本仓有确认门与「下一步」交棒纪律；遇门（范围变更 / 方案取舍）仍用 `reqboard_ask_confirm`（既有覆盖 5 已部分承载，新条目需点明"不暂停"不适用于门） |
| ledger 文件 / BASE sha / commit | 正文要求 ledger 记录、记录 BASE commit、含 `git commit` 语义 | 完工记录用 `reqboard_task_report`（既有覆盖 2）；不要求 agent 执行 git commit |

### ④ 预算裁剪逻辑（本次临界） `serves: FR-4`

`applyBudget(fragments, budget)`：
1. `budget` 缺省/非法 → 不裁；
2. `assembleText(fragments).length <= budget` → 不裁；
3. 否则按 `priority` 升序（同优先级按 id 逆序）裁**非 floor**；
4. 仍超 → 返回 `floorOnly` + `overBudget: { reason: 'floor-exceeds-budget', floorChars, budget }`。

**实测**：`implementing/heavy/<category>` 最大 23158（feature）≤ 24000，**余量 842 字符**。若 overrides 新增条目把 floor 总量推过 24000 → 触发第 4 条分支（结构化报出，不静默裁铁律）。

### ⑤ 注入点是否需要改 `serves: FR-3`

**不需要**。四个注入点（`h3-inject`、`capture-section`、`session-driver`、`node-input-package`）都只传 `{stage, difficulty/declaredDifficulty, category, requirement…}`，不感知分片内容。本次换文本对它们是透明的。

## 错误处理 `serves: FR-3`

| 错误 | 触发点 | 报出形态 | 是否静默 |
|------|-------|---------|---------|
| 分片 id 含空路径段 | `parseFragmentId` | `throw new Error('分片 id 含空路径段：' + id)` | 否 |
| 未知节点目录 / 叶子名 | `parseFragmentId` | `throw`（列出合法值） | 否 |
| 类型档路由壳缺节点难度档 | `typeRouteShells` | `throw new Error('类型档路由壳缺少节点难度档：…')` | 否 |
| 类型档路由壳 id 冲突 | `readFragments` | `throw new Error('类型档路由壳 id 与已有分片冲突：…')` | 否 |
| 分片 id 重复 | `readFragments` | `throw new Error('分片 id 重复：' + id)` | 否 |
| vendor 原文缺失 | `readVendorSkill` | `throw new Error('vendor 原文缺失：' + file)` | 否 |
| 镜像不一致 | `vendorMirrorProblems` | 收集为 problems → 调用方打印 + `exit 1` | 否 |
| 源/产物不同步 | `check-prompt-fragments` | 打印首个差异偏移 + `exit 1` | 否 |
| 预算不足（连 floor 都超） | `applyBudget` | 返回 `overBudget` 结构（不裁 floor） | 否（结构化） |

**纪律**：本次改动**不新增**任何 `try/catch` 兜底、不新增降级路径。上游原文损坏属外部依赖失败 → 修上游或回退该份并记录（不静默跳过）。

## 数据库设计 `serves: FR-3`

**不适用**：本需求无数据库、无 schema、无迁移、无 SQL。唯一的持久化对象是仓库内的文本与生成产物（见 data-model.md），版本控制即其存储与回滚机制。

## 性能考量 `serves: FR-4`

| 维度 | 影响 | 数字 |
|------|------|------|
| 注入字符数 | `implementing/heavy/<category>` 由 5214（旧）→ **23158**（新，feature 口径） | ≤ 24000，余量 842 |
| token 成本 | 每次 implementing 注入多约 17900 字符 ≈ 显著上升 | 精确 token 由 `scripts/token-cost-report.mts` 可测 |
| 生成期 | 129 条记录、单文件内联，构建时间无实质变化 | — |
| 运行时 | 纯函数过滤 + 排序 + 字符串拼接，无 I/O | — |

> **本需求最大的性能代价就是注入体积**：`implementing` 阶段每次注入多出约 8.85 倍的 vendor 正文。
> 这是上游换版的直接后果（新版把 64 行扩到 373 行）。设计中**不做裁剪**（heavy 是 floor，裁了等于丢纪律），
> 但必须在验收材料里如实报出这个数字。

## 安全设计 `serves: FR-4`

**信任边界**：`vendor/superpowers/*/SKILL.md` 是**上游文本直接进 agent 上下文**——它是指令，不是数据。本次把 20405 字节（旧 2305 字节）注入每个 implementing 阶段会话，其中含可执行语义的步骤与 ` ```dot ` 流程图。

| 缓解措施 | 落地 |
|---------|------|
| 版本固定可追溯 | ATTRIBUTION 记录 repo / ref / 40 位 commit / tag / 抓取时点；`prompt-tiers` ⑥ 断言 tag 与 commit |
| 本仓规则压上游 | overrides 为 `priority='floor'`，位于原文**之后**，冲突以本仓为准（INV-3） |
| 门禁不受上游影响 | 门禁只扫 `reqboard_*` 工具名与镜像字节；上游文本无法改变门禁判定 |
| 不加载上游 skill | overrides 覆盖 10 明确"这些引用不是可 load 的 skill"（堵住"照上游去 load"的副作用） |
| 无运行时读盘 | 上游文本构建期内联，运行时不取网络/磁盘（缩小攻击面） |

**残留风险**：上游若在正文中夹带对本仓有害的指令（如"跳过确认门"），门禁**不会**自动发现（它只看工具名与字节）。此类风险靠 commit 固定 + 人工 review 上游 diff 缓解，本次已通过人工比对 8 份差异确认无此类内容。

## 关键决策与取舍 `serves: FR-1, FR-3, FR-4`

| 决策 | 选择 | 取舍 |
|------|------|------|
| 冲突改哪里 | 改 overrides，vendor 原文逐字节保真 | 满足镜像门禁与本仓分层纪律；代价是 overrides 变长吃 842 字符余量 |
| 是否裁 vendor 正文 | 不裁（heavy 是 floor） | 保住上游纪律完整性；代价是 implementing 注入体积 8.85 倍 |
| 是否调预算 | 不调（24000 够用） | 避免放宽所有节点闸门；代价是余量仅 3.5% |
| 生成器是否加变换 | 不加（只做整文件拼接） | 保持确定性与"md 逐字节内联"纪律 |
| 注入点是否改 | 不改 | 换文本对调用方透明，缩小改动面 |

## 技术方案与亮点 `serves: FR-3, FR-4`

1. **镜像契约当第一硬约束**：把"vendor 与 heavy 必须逐字节同批"写进后端设计的关键逻辑与错误处理两节，配判据函数与报错原文。
2. **不变式显式列出**：INV-1…INV-4 把"本次不该动的语义"变成可核对的清单（取词唯一入口、运行时不读盘、三段顺序、floor 不裁）。
3. **临界预算先算再做**：23158 / 24000 / 余 842 是实测值，让"overrides 还能写多长"可计算，并预设超限时的响亮失败路径。
4. **供应链安全写进设计**：点明上游文本 = 指令、构建期内联、门禁管不到指令语义，并把"无运行时读盘 + commit 固定"作为缓解，同时如实声明残留风险。
5. **性能代价不遮掩**：注入体积 8.85 倍增长与 token 成本上升写进性能节，不在设计里粉饰（对齐「失败要响亮」）。
