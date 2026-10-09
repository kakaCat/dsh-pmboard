---
serves: FR-1, FR-2, FR-4, FR-5
---

# 接口设计 — 把 implementing 移出 vendor 镜像并改写自写实施档 `serves: FR-1`

> 本需求**不改任何对外工具接口**（`reqboard_*` 全部不动、不增参数、不改返回结构）。
> 这里的「接口」指本仓提示词链路上的**契约边界**：分片源 → 生成物 → 注入文本 → 基线 / 档案 / 探针。
> 每一处定死形态与判据，拆分与实施照此对齐。

## 接口清单 `serves: FR-1, FR-2, FR-4, FR-5`

「接口 id」是本设计的引用键；**每一行都是一条可机器复核的契约**（跑什么、比什么）。

| 接口 id | 接口 | 方向 | 形态 | 变更类型 | serves |
|---------|------|------|------|---------|--------|
| I-1 | `VENDOR_MAIN_SKILLS` 映射表 → 镜像门禁 | 构建期校验 | 映射项数 3 → 2；不在映射内的 heavy 不做逐字断言 | 项删除 | FR-1 |
| I-2 | `fragments/implementing/heavy.md` → 注入文本 | 源文件 | 由 vendor 镜像改为本仓自写完整档（≤ 5,500 字符） | 内容重写 | FR-2 |
| I-3 | `fragments/**.md` → `generated/fragments.ts` | 构建期生成 | 内存重算与盘上产物逐字节相等 | 内容更新 | FR-4 |
| I-4 | 分片 id → 元数据（`parseFragmentId`） | 纯函数 | `implementing/heavy` 仍 `priority='floor'`、`stage='implementing'`、`difficulty='heavy'` | **无变更** | FR-5 |
| I-5 | 注入入口 `resolveStagePrompt(req)` | 纯函数调用 | 签名与返回结构（`text` / `fragmentIds` / `overBudget`）不变 | **无变更** | FR-5 |
| I-6 | 注入文本 → P1 基线快照 | 回归锁 | 12 键逐字相等；本次只允许 `implementing/heavy` 一键变 | 值更新 | FR-4 |
| I-7 | overrides → 三段注入顺序 | 组装规则 | `heavy` → `heavy/overrides` → 类型档 → `common/iron-rules` | **无变更**（条目数变） | FR-2 |
| I-8 | 上游来源 → ATTRIBUTION 档案 | 人读档案 | §2 角色列 + §3 镜像清单与映射表一致 | 值更新 | FR-1, FR-4 |
| I-9 | 注入文本 → 路径探针允许表 | 静态探针 | 注入里出现的路径 token 必须可达或显式允许 | 条目删除 + 理由更新 | FR-4 |

## 新增/修改的工具接口 `serves: FR-1`

### 结论：`reqboard_*` 工具面零改动 `serves: FR-1`

不新增、不删除、不改名任何 `reqboard_*` 工具；不新增参数；不改返回结构。
自写档里只出现**已注册**工具名（`reqboard_task_move`、`reqboard_task_report`、`reqboard_ask_confirm`、
`reqboard_submit`、`reqboard_kb`），`tests/prompt-gates.test.ts` 的「注入文本里的 `reqboard_*` ⊆ 注册集合」门禁预期保持绿。

## 删除的接口 `serves: FR-1`

| 被删对象 | 位置 | 为什么可以删 |
|---|---|---|
| `scripts/task-start` / `scripts/task-done` 路径允许条目 | `scripts/prompt-path-probe.mts` 的 allowlist | 这两个 token 只由 vendor `executing-plans` 原文（经 heavy.md 镜像）带入注入；换底后注入面 0 命中 → 条目成为死条目 |
| 上游四类"照不了的指令"补丁 | `implementing/heavy/overrides.md` 覆盖 10 | 覆盖对象（上游原文）不再注入，补丁失去标的（**删除即收益**，不是功能回退） |

**注意**：`docs/superpowers/` 允许条目**不删**——它仍被 `design/heavy/overrides.md`（覆盖 1）引用，
只是理由不能再写"heavy.md 与 vendor 原文逐字节锁定"。

## I-1 映射表 → 镜像门禁 `serves: FR-1`

| 项 | 值 |
|----|----|
| 唯一映射源 | `scripts/inline-prompt-fragments.mjs` 的 `VENDOR_MAIN_SKILLS`（第 68~72 行） |
| 同源副本 | `tests/prompt-tiers.test.ts` 第 32~38 行（**同批改**，分叉即口径不一） |
| 改后内容 | `accepting → verification-before-completion`；`archived → finishing-a-development-branch` |
| 判据 | `node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"` → `accepting,archived` |
| 门禁函数 | `vendorMirrorProblems()` 返回空数组（`node scripts/check-prompt-fragments.mjs` exit 0） |
| 失败信号 | `[check-prompt-fragments] FAIL: heavy.md ↔ vendor 原文不一致` |

## I-2 heavy.md → 注入文本（本设计的硬约束） `serves: FR-2`

| 项 | 值 |
|----|----|
| 文件 | `src/domain/prompt/fragments/implementing/heavy.md` |
| 改前 | 与 `vendor/superpowers/executing-plans/SKILL.md` **逐字节相等**（20,405 字符，实测 `diff -q` 无输出） |
| 改后 | 本仓自写完整档，≤ 5,500 字符；`diff -q` 与 vendor 原文**必须有差异** |
| 必含关键词（纪律骨架，测试断言依赖） | `The Task Loop`、`Common Rationalizations` |
| 必含本仓措辞（测试断言依赖） | `reqboard_task_move`、`reqboard_task_report` |
| 必含结论行 | 「下一步：accepting —— 用 `reqboard_submit(kind=verification)` 交棒；未获批准不得进入」 |
| 不得含 | 半角双引号包裹的长引文（防注入文本本身触发长文本纪律误读）；上游 `scripts/task-start` / `task-done` / `docs/superpowers/plans/…` 路径 |
| 判据（可跑） | `node -e` 取 `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text`，断言含上述关键词且 `length < 8000` |

## I-3 分片源 → 生成物（构建期生成） `serves: FR-4`

| 项 | 值 |
|----|----|
| 生成命令 | `node scripts/inline-prompt-fragments.mjs` |
| 产出 | `src/domain/prompt/generated/fragments.ts`（不手改） |
| 约束 | 内存重算结果与盘上产物**逐字节相等** |
| 判据 | `node scripts/check-prompt-fragments.mjs` exit 0（不得出现 `generated/fragments.ts 与 fragments/**.md 不一致`） |
| 幂等 | 连跑两次，`git diff --exit-code src/domain/prompt/generated/fragments.ts` 第二次为空 |

## I-4 分片 id → 元数据（无变更，钉住防漂移） `serves: FR-5`

| 项 | 值 |
|----|----|
| 规则位置 | `scripts/inline-prompt-fragments.mjs` 的 `parseFragmentId` |
| `implementing/heavy` 解析结果 | `stage='implementing'`、`difficulty='heavy'`、`category='*'`、`priority='floor'` |
| `implementing/heavy/overrides` 解析结果 | 同上（三段 `overrides` → floor） |
| 为什么钉住 | 自写档若被误放到 `implementing/heavy-extra.md`（`priority=10`，可裁）或类型档槽，注入行为会变（预算紧张时被裁掉），而门禁不会报 |
| 判据 | `npx vitest run tests/prompt-tiers.test.ts` 「全部 floor」组绿 |

## I-5 注入入口 `resolveStagePrompt`（无变更，钉住签名） `serves: FR-5`

| 项 | 值 |
|----|----|
| 入参 | `{ stage, difficulty, category?, budget? }` |
| 返回 | `{ text, fragmentIds, overBudget? }` |
| 本需求影响 | **仅 `text` 的内容变化**（`implementing/heavy` 一段）；`fragmentIds` 顺序与集合不变 |
| 判据 | `pnpm typecheck` 退出码 0；`npx vitest run tests/prompt-baseline.test.ts` 的键集合断言绿 |

## I-6 注入文本 → P1 基线快照 `serves: FR-4`

| 项 | 值 |
|----|----|
| 快照文件 | `tests/fixtures/stage-prompts-baseline-p1.json`（12 键 = 六节点 × light/heavy） |
| 产出命令 | `node scripts/dump-stage-prompts.mjs`（逐字、不 trim） |
| 本次允许变化 | **仅** `implementing/heavy` 一键（23,852 → ≤ 7,700 字符） |
| 判据 | `npx vitest run tests/prompt-baseline.test.ts` 全绿；`git diff` 后逐键比对只 1 键变 |
| 口径 | 快照是"设计允许的变化必须显式更新"的锁，不是"不许变"的锁 |

## I-7 overrides → 三段注入顺序（无变更） `serves: FR-2`

| 项 | 值 |
|----|----|
| 顺序 | `implementing/heavy` → `implementing/heavy/overrides` → 类型档 → `common/iron-rules` |
| 本次变化 | overrides 条目数 10 → 2；顺序与 floor 属性不变 |
| 约束 | overrides 首行仍须含「覆盖上文」（⑥ 组断言） |
| 判据 | `npx vitest run tests/prompt-tiers.test.ts` ⑥ 组绿 |

## I-8 上游来源 → ATTRIBUTION 档案 `serves: FR-1, FR-4`

| 项 | 值 |
|----|----|
| 文件 | `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` |
| §2 落盘清单·角色列 | executing-plans 由「**heavy 主 skill**：implementing」改为「**留档原文，不再注入**（2026-10-08 裁定：上游 inline 执行模式与本仓任务卡 + 子代理模式冲突）」 |
| §3 镜像关系 | 由 3 项改 2 项，并追加一行「implementing→executing-plans 于 2026-10-08 移除」 |
| 不动 | §1 来源表（repo / commit / tag / 许可 / 抓取时点）、§4 MIT 原文、14 行字节/行数 |
| 判据 | `grep -n "不再注入" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` 命中 executing-plans 行；`grep -c "heavy 主 skill" …` = 2 |

## I-9 注入文本 → 路径探针允许表 `serves: FR-4`

| 项 | 值 |
|----|----|
| 探针 | `scripts/prompt-path-probe.mts`（`pnpm prompts:check` 的第三步） |
| 判据 | 注入文本里出现的路径 token 必须磁盘可达，或命中显式 allowlist |
| 本次处置 | 删 `scripts/task-start` / `scripts/task-done` 条目；`docs/superpowers/` 条目保留、理由改为「design/heavy/overrides.md 覆盖 1 引用」 |
| 自写档新增路径 | 只引用真实存在的 `docs/architecture/subtask-stage-template.md`、`docs/architecture/subtask-request-budget.md`（落笔前须 `test -f` 复核一次） |
| 判据 | `pnpm prompts:check` 退出码 0 |

## 关键决策与取舍 `serves: FR-1, FR-5`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 对外接口 | 加一个"自写档模式"开关（按配置切换镜像 / 自写） | 直接换底，无开关 | 上游 inline 模式与本仓流程冲突是**语义冲突**，不是灰度问题；留开关 = 留一条永远没人验证的路径 |
| 镜像断言 | 移出映射后对 implementing 改断言为"与 vendor 不相等" | 不写该断言 | "不相等"是弱断言（随便改一个字就绿），没有信息量；自写档的价值由关键词与长度判据守 |
| 契约边界命名 | 只写「不改工具接口」一句话 | 列 9 条 I-x 契约边界 | 拆分阶段要按接口面造卡；"不改"也是契约，不写下来等于没定 |

## 技术方案与亮点 `serves: FR-1, FR-4`

- **接口清单即拆分对照表**：I-2 / I-3 / I-6 / I-8 是四处必须同批落地的写点，
  拆分阶段的对照表逐条核对时，这两份清单（接口 + 改动地图）就是粒度单位。
- **死条目显式登记**：把"删掉的那两条允许条目"写进本文档，而不是静默删——
  后来者 grep 不到它时能查到"为什么没有"。
- **无对外变更**：本需求零新增 API、零 schema 变更，回滚 = `git revert`（见 data-model.md）。
