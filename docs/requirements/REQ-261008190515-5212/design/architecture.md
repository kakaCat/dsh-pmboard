---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 架构设计 — 把 implementing 移出 vendor 镜像并改写自写实施档 `serves: FR-1`

> 本需求是**提示词底座替换 + 耦合点同批同步**：把一个节点的 heavy 主档从「上游原文逐字节镜像」
> 改成「本仓自写完整档」，并把镜像表 / 档案 / 断言 / 生成物 / 基线五处一次性对齐。
> 本文只回答「怎么改、改哪些文件、契约是什么」；任务拆分归 decomposing（拆分）阶段。
> `sides: []`——无端侧改动，不产界面，无 frontend.md / backend.md。

## 目标与总体方案 `serves: FR-1, FR-2`

**一句话**：`src/domain/prompt/fragments/implementing/heavy.md` 由 vendor 镜像
（20,405 字符）改写为**本仓自写完整档**（≤ 5,500 字符）；
`scripts/inline-prompt-fragments.mjs` 的 `VENDOR_MAIN_SKILLS` 由 3 项减为 2 项；
随之同步 ATTRIBUTION 档案、两处测试口径、生成物与 P1 基线。

**三条不变量**（改完必须仍成立）：

| 不变量 | 判据 |
|---|---|
| `vendor/superpowers/executing-plans/SKILL.md` 逐字节留档 | `wc -c` = **20405**；`diff -q` 与 git HEAD 无差异 |
| `resolveStagePrompt` 签名与返回结构不变 | `pnpm typecheck` 退出码 0；`tests/prompt-baseline.test.ts` 结构断言绿 |
| 分片优先级规则不变（heavy / overrides = floor） | `tests/prompt-tiers.test.ts` 「全部 floor」组绿 |

### 改动前后对照 `serves: FR-1, FR-5`

| 维度 | 改前（实测） | 改后（目标） |
|---|---|---|
| implementing/heavy 主档 | vendor `executing-plans` 逐字节镜像，20,405 字符 | 本仓自写完整档，≤ 5,500 字符 |
| 解析后注入文本长度 | **23,852** 字符 | ≤ 7,500 字符（判定线上限 8,000） |
| 24,000 预算下余量 | 148 | ≥ 16,500 |
| `VENDOR_MAIN_SKILLS` 项数 | 3（implementing / accepting / archived） | 2（accepting / archived） |
| overrides 条目数 | 10 条 + 1 行 kb 判据 | 2 条 + 1 行 kb 判据 |
| 注入里出现的上游产物路径 | `scripts/task-start`、`scripts/task-done`、`docs/superpowers/plans/…` | 全部消失（自写档改为本仓工具与文档） |
| vendor 原文 | 留档 | **留档**（不变，只切断镜像注入关系） |

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-6`

| # | 文件 | 动什么 | 服务 |
|---|---|---|---|
| 1 | `scripts/inline-prompt-fragments.mjs` | `VENDOR_MAIN_SKILLS` 删 `implementing` 项；头注释追加 2026-10-08 裁定与理由 | FR-1 |
| 2 | `src/domain/prompt/fragments/implementing/heavy.md` | 整篇改写为自写完整档（章节骨架见下） | FR-2 |
| 3 | `src/domain/prompt/fragments/implementing/heavy/overrides.md` | 10 条收编为 2 条（映射表见下），编号连续 | FR-3 |
| 4 | `src/domain/prompt/vendor/superpowers/ATTRIBUTION.md` | §2 角色列 executing-plans 改「留档原文，不再注入」；§3 镜像清单 3 项 → 2 项 | FR-4 |
| 5 | `tests/prompt-tiers.test.ts` | 同源 `VENDOR_MAIN_SKILLS` 副本删 `implementing`；④ 镜像组由 3 节点变 2 节点 | FR-1 |
| 6 | `tests/kb-prompt-wiring.test.ts` | 「镜像档 heavy.md 仍与 vendor 原文一致」抽样断言：`implementing` 退出镜像档名单 | FR-4 |
| 7 | `scripts/prompt-path-probe.mts` | 删死条目（`scripts/task-start` 与 `scripts/task-done` 的允许条目）；`docs/superpowers/` 条目理由改为「design/heavy/overrides.md 引用」 | FR-4 |
| 8 | `src/domain/prompt/generated/fragments.ts` | 重跑生成器（不手改） | FR-4 |
| 9 | `tests/fixtures/stage-prompts-baseline-p1.json` | 重刷 P1 基线（只有 `implementing/heavy` 一键变） | FR-4 |
| 10 | `docs/architecture/project-manual.md` | 新增「机制备忘：本仓实施模式（任务卡 + 子代理）」+ 变更记录一行 | FR-6 |

**刻意不动**（写进边界，防范围蔓延）：

- `tests/stage-prompts.test.ts` 的 `HEAVY_ELEMENTS.implementing`：自写档**保留** `The Task Loop` /
  `Common Rationalizations` 两个纪律骨架节名（与 brainstorming 自写档保留 `Three Paths` / `Red Flags` 同构），
  断言无需改；
- `src/domain/prompt/fragments/implementing/light.md`、`light/overrides.md`、`common/iron-rules.md`；
- `vendor/` 下 14 份原文（含 `executing-plans` 本身）；
- 任何 `reqboard_*` 工具代码与门禁逻辑。

## 镜像关系变更（唯一映射表） `serves: FR-1, FR-4`

映射表有**两处副本**（脚本 + 测试），必须同批改；分叉会让"门禁说的"与"测试信的"不是同一件事。

| 节点 | vendor skill | 改后状态 |
|---|---|---|
| `implementing` | `executing-plans` | **移出映射**（自写档；上游原文留档不注入） |
| `accepting` | `verification-before-completion` | 保留（上游原文含本仓照不了的 inline 措辞，但无同类语义冲突） |
| `archived` | `finishing-a-development-branch` | 保留 |

**不在映射内**（自写档，不做逐字断言）：`brainstorming`（2026-10-08 裁定）、
`design`（2026-09-21 裁定）、`decomposing`（上游无对应 skill）、`implementing`（本次裁定）。

**违反后果**（两条独立信号同时红）：

1. `node scripts/check-prompt-fragments.mjs` → 打印 `heavy.md ↔ vendor 原文不一致` → `exit 1`；
2. `tests/prompt-tiers.test.ts` ④ → `expect(fragmentById('implementing/heavy').text).toBe(vendorText('executing-plans'))` 失败。
   注意：④ 组按映射表遍历，**移出映射后该断言自动不再覆盖 implementing**——这正是移出映射必须与改写同批的原因，
   否则"移出映射"这一步会把镜像断言静默撤掉，留下无人看守的空档。

## 自写档章节骨架 `serves: FR-2, FR-6`

`implementing/heavy.md` 的 H2 骨架（**纪律骨架节名沿用上游英文**，本仓内容中文）：

| # | 节 | 内容要点 | 预算（字符） |
|---|---|---|---|
| 0 | 开篇 `> 本档是本仓自写完整档…` | 一句话说清与上游原文的关系（留档在哪、为何不注入） | ≤ 300 |
| 1 | `## 本仓实施模式` | 任务卡 + 子代理：一张父卡一条子卡链、子卡按 `dev → integrate → review → test` 段推进；与上游 inline 模式的差异只在此处说一次 | ≤ 800 |
| 2 | `## 开工：取卡` | `reqboard_task_move(to=in_progress)` 返回卡全文（title / description / acceptance / implementation / context），照卡执行，不凭记忆、不二次创作；开工先查 `reqboard_kb` | ≤ 700 |
| 3 | `## The Task Loop` | 三步循环：照卡执行 → 自证（跑卡上的验收命令、读输出）→ 汇报；构建新鲜度（改了 `packages/pages/*/src` 必须重建）；卡的三要素（在做什么 / 解决什么问题 / 得到什么结果） | ≤ 1,300 |
| 4 | `## 子代理：派发与复核` | 父卡开工自动展开子卡链；派发纪律（子代理拿到的是自包含的卡，不共享主窗口上下文）；复核 = `review` 段子卡 + 门禁；预算与停链见 `docs/architecture/subtask-request-budget.md`；段落机制见 `docs/architecture/subtask-stage-template.md`（**引用不复述**，防机制漂移） | ≤ 900 |
| 5 | `## 完工汇报` | `reqboard_task_report`（做了什么 / 完成项 / 改动文件 / 下一步）；它是 done 凭证门的前置 | ≤ 600 |
| 6 | `## 遇门：弹框与征询` | 范围变更 / 方案取舍 → `reqboard_ask_confirm`；普通信息征询 → `ask_user_question`（宿主工具，非 `reqboard_*`） | ≤ 500 |
| 7 | `## Common Rationalizations` | 本仓版常见借口表（"我记得卡里写了什么" / "验收命令肯定能过" / "这一步跳过汇报" 一类） | ≤ 700 |
| 8 | `## 交棒：下一步 accepting` | `reqboard_submit(kind=verification)`；未获批准不得进入 | ≤ 200 |
| — | 合计 | — | **≤ 5,500** |

**预算闭合**（判定线上限 8,000 字符）：

| 分片 | 改后字符 | 说明 |
|---|---:|---|
| `implementing/heavy.md` | ≤ 5,500 | 自写档 |
| `implementing/heavy/overrides.md` | ≤ 800 | 2 条 |
| `common/iron-rules.md` | 1,057 | **不动** |
| 组装分隔与类型档 | ≈ 300 | 路由壳拼接（`implementing/feature.md` 228 字符） |
| **合计** | **≤ 7,700** | < 8,000 ✅ |

## overrides 收编映射 `serves: FR-3`

自写档的正文已经写着本仓流程，补丁失去对象。逐条判据：**这条在说"本仓怎么做" → 并入正文；
这条在说"上游的某个东西在本仓不存在" → 留在 overrides**（正文自述不了"不存在的东西"）。

| 原条目 | 去向 | 理由 |
|---|---|---|
| 覆盖 1 任务来源 | 并入正文 §2 开工 | 本仓流程，正文自述 |
| 覆盖 2 汇报＝完工记录 | 并入正文 §5 | 本仓流程 |
| 覆盖 3 构建新鲜度 | 并入正文 §3 | 本仓门禁（`STALE_BUILD`） |
| 覆盖 4 附属按需片段 | **改写保留**（overrides 1） | 上游 5 个附属 skill（tdd / subagent-driven-development / git-worktrees / dispatching-parallel-agents / requesting-code-review）在本仓**只留档、不注册为分片**，不存在"挂载"动作——正文无法自述一个不存在的机制 |
| 覆盖 5 遇门用弹框 | 并入正文 §6 | 本仓流程 |
| 覆盖 6 交棒 | 并入正文 §8 | 本仓流程 |
| 覆盖 7 任务卡说人话 | 并入正文 §3 | 本仓门禁（`task_card_incomplete`） |
| 覆盖 8 汇报自检 | **保留**（overrides 2） | 机械细节（半角引号 → JSON 非法 → 整轮报废），放正文占预算 |
| 覆盖 9 原型与裁定对照 | 并入正文 §3 | 本仓流程 |
| 覆盖 10 新版四类不可执行项 | **删除** | 上游原文不再注入 → 四类"照不了的指令"根本不会出现。**这是本次换底的最大收益**（4 条补丁因"对象消失"而消失） |

**改后 overrides.md 结构**：`## 本仓覆盖条目（…）` 标题保留（⑥ 组断言 `覆盖上文` 在场），
条目编号重排为 1、2 连续，末行 `- [ ] 开工先查 reqboard_kb(kind='standard')…` 保留。
**判据**：`grep -c "覆盖 [0-9]" src/domain/prompt/fragments/implementing/heavy/overrides.md` = **2**。

## 生成物与基线刷新链 `serves: FR-4`

顺序固定，跳步即门禁红（每一步都可单独复跑，幂等）：

```bash
# ① 生成物：fragments/**.md → src/domain/prompt/generated/fragments.ts
node scripts/inline-prompt-fragments.mjs

# ② 源 / 产物同步 + 镜像门禁（改 .md 没重跑 ① 会在此 exit 1）
node scripts/check-prompt-fragments.mjs

# ③ P1 基线：六节点 × light/heavy 的注入文本逐字落盘（12 键）
node scripts/dump-stage-prompts.mjs

# ④ 一条命令跑全链：生成 + 门禁 + 路径探针
pnpm prompts:check
```

**影响面哨兵**：P1 基线 12 键里，只允许 `implementing/heavy` 一键变化。
其余 11 键（含 `implementing/light`）出现任何字节变化 → 改动越界，回到本文档核对改动地图。
判据：`git diff --stat tests/fixtures/stage-prompts-baseline-p1.json` 后逐键比对（见 test-cases TC-7）。

## 断言与档案同步 `serves: FR-4`

| 处 | 现状 | 改后 | 为什么必须同批 |
|---|---|---|---|
| `tests/prompt-tiers.test.ts` ④ | 按映射表遍历 3 节点断言逐字节一致 | 遍历 2 节点 | 映射表副本不移 → 断言仍要求 implementing 与 vendor 一致，必红 |
| `tests/prompt-tiers.test.ts` 同源副本 | 3 项（含 implementing） | 2 项 | 与脚本分叉 → 门禁与测试口径不一 |
| `tests/kb-prompt-wiring.test.ts` | 断言 `implementing/heavy.md` **不得**含 `判定标准挂可跑命令`（镜像档特征） | 从镜像档名单移除 `implementing` | 自写档允许出现本仓收尾行；不改则该断言锁死自写档 |
| `scripts/prompt-path-probe.mts` | 上游辅助脚本的允许条目 + 理由引用"逐字节锁定" | 删该条目；`docs/superpowers/` 条目理由改写 | 死条目留库 = 假真相源；理由失实 = 误导后来者 |
| `ATTRIBUTION.md` §2 / §3 | executing-plans = 「heavy 主 skill：implementing」；镜像 3 项 | 「留档原文，不再注入（2026-10-08 裁定）」；镜像 2 项 | 档案是本仓对上游来源的唯一承诺，不同批对齐即记录失实 |

## 依赖关系（改动顺序） `serves: FR-1, FR-4`

```text
① 映射表（脚本 + 测试副本）─┐
                            ├─▶ ④ 生成器 ──▶ ⑤ 门禁 ──▶ ⑥ P1 基线 ──▶ ⑦ 全链 pnpm prompts:check
② 自写档 heavy.md ──────────┤
③ overrides 收编 ───────────┘
                            └─▶ ⑧ 档案 / 路径探针 / kb 断言（互不阻塞，可并行）

⑨ 项目文档「本仓实施模式」 —— 独立于 ①~⑧（不参与注入，不影响门禁）
```

**先 ① 后 ②**：映射表未移出时改 heavy.md，门禁立刻报"镜像不一致"；
**先 ② 后 ①** 才是安全顺序的反面 —— 正确顺序是**①与②同批落地**，门禁只在两次落盘之间才可能红。

## 错误处理 `serves: FR-5`

| 门禁/测试 | 报什么 | 处置（不是"重试"） |
|---|---|---|
| `check-prompt-fragments.mjs` ② 镜像 | `fragments/implementing/heavy.md 与 vendor/executing-plans/SKILL.md 不一致` | 映射表没移出 → 补 ①，不要改 heavy.md 去迁就 vendor |
| `check-prompt-fragments.mjs` ① 生成 | `generated/fragments.ts 与 fragments/**.md 不一致` | 重跑生成器（步骤 ④） |
| `prompt-tiers` ④ | `implementing/heavy === vendor` 失败 | 断言组没按 2 节点改 → 补 ⑤/⑥ 处的同源副本 |
| `prompt-tiers` ⑤ | `implementing light 不应含 heavy 独有要素「The Task Loop」` | 骨架节名只写进 heavy.md，别落进 light / light-overrides / iron-rules |
| `prompt-baseline` | `diff implementing/heavy` | P1 基线没刷 → 跑 `node scripts/dump-stage-prompts.mjs` |
| `prompt-path-probe` | 路径不可达 / 未注册工具名 | 自写档里引用的文档路径必须真实存在（本设计引用两份 `docs/architecture/*.md`，均已核） |
| `pnpm typecheck` | tsc 报错 | 本需求不改 `.ts` 源码逻辑；报错只可能来自生成物未重跑 → 回到步骤 ④ |

## 文档更新清单 `serves: FR-6`

| 文档 | 章节 | 写什么 |
|---|---|---|
| `docs/architecture/project-manual.md` | 新增「机制备忘：本仓实施模式（任务卡 + 子代理）（2026-10-08，REQ-261008190515-5212）」 | 本仓实施模式一句话定义 + 一张父子卡流程图 + 与上游 inline 模式的差异 + 指针到 `fragments/implementing/heavy.md`；末尾挂「来源：REQ-261008190515-5212」 |
| `docs/architecture/project-manual.md` | 「变更记录」表新增一行 | 日期 / 变更 / 来源（照既有三列格式） |
| `docs/architecture/prompt-context-layering.md` | **不加** | 单一真相源：模式定义只在项目说明书一处，提示词档内自述；两处写必然漂移 |

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 自写档是否保留上游章节名 | 全部改成中文新节名（顺带改两处测试关键词） | 保留 `The Task Loop` / `Common Rationalizations` | 与 brainstorming 自写档保留 `Three Paths` / `Red Flags` 同构；改关键词要多动两处断言，收益只是名字好看 |
| 上游附属 skill 怎么处置 | 把 tdd / subagent-driven-development 注册成本仓分片，让子代理真能"挂载" | 只留档，overrides 里明确"不得尝试加载" | 注册即需被路由命中（否则违反"无孤岛"门禁）；本仓已有自己的子卡链与派发机制，不需要第二套 |
| 子代理机制的写法 | 在 heavy.md 里复述子卡链 / 预算机制 | 引用两份领域篇（`subtask-stage-template.md` / `subtask-request-budget.md`） | 复述必然漂移；引用让机制只有一处真相源 |
| 死条目（`scripts/task-*`） | 留着不管（探针不会因未命中报错） | 删掉 | 留下就是"看着像还有用"的假真相源；后来者会以为注入面仍存在该路径 |
| 「本仓实施模式」写在几处 | 项目说明书 + 提示词分层篇两处都写 | 只写项目说明书一处 | 两处写必然漂移；档内自述是执行者视角，不构成第二真相源 |

## 技术方案与亮点 `serves: FR-2, FR-6`

- **换底而非打补丁**：补丁密度（10 条全在给上游原文打补丁）是"底座不对"的判据；
  移出映射后 4 条补丁因对象消失而消失，3 条并入正文——不是"删了功能"，是"对象没了"。
- **判据全挂既有门禁**：验证不新造检查器，全部复用 `check-prompt-fragments.mjs` + 四个既有测试文件 + P1 基线，
  新检查器只会多一个会漂移的真相源。
- **机制引用而非复述**：自写档对子卡链 / 预算这类**有专门领域篇**的机制只给指针，
  把"文档也漂移"这条风险摁在源头。
- **预算收益可核算**：20,405 + 2,312 → ≤ 5,500 + ≤ 800，解析文本 23,852 → ≤ 7,700，
  余量 148 → ≥ 16,300。收益来源是**不注入那 20,405 字符**，不是调大 `DEFAULT_PROMPT_BUDGET`（哨兵运行时根本不裁剪）。
