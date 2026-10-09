---
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 测试策略与用例设计 — 把 implementing 移出 vendor 镜像并改写自写实施档 `serves: FR-4`

> 本需求改的是"文本资产 + 它的四处同源记录"，测试的核心问题是：
> **换底之后注入链路还自洽吗？本仓模式写进去了吗？顺带有没有碰到别的东西？**
> 每条判据钉到具体命令与期望输出（跑什么、看到什么算过）。
> 测试分层：本需求**不新造测试文件**，全部复用既有门禁与测试——新检查器只会多一个会漂移的真相源。

## 测试策略总览 `serves: FR-1, FR-4`

| 层 | 目标 | 手段 | 失败意味着 |
|---|---|---|---|
| L1 契约层 | 源 / 产物 / 映射三者自洽 | `node scripts/check-prompt-fragments.mjs`（退出码） | 改了源没重跑生成器，或映射表与 heavy 档不同批 |
| L2 映射层 | 映射表两处副本一致，且实现"移出即不校验" | `tests/prompt-tiers.test.ts` ④ 组（2 节点） | 只改了脚本没改测试副本（或反之） |
| L3 基线层 | 注入文本逐字回归 + **影响面哨兵** | `tests/prompt-baseline.test.ts` + 12 键 P1 快照 | 越界改动（动了别的节点）；或改了未刷基线 |
| L4 行为层 | 自写档真写进去了 / 预算 / floor / 路径与工具名 | `tests/prompt-tiers.test.ts` ⑤⑥⑦、`tests/prompt-gates.test.ts`、`tests/prompt-path-probe.mts` | 自写档空转、预算超限、注入里出现不可达路径或未注册工具名 |
| L5 手工层 | 机制引用可达、语义可读（机器判不了"写得好不好"） | `test -f` + 人工通读 | 引用了不存在的领域篇；写成了"换个名字的 vendor 原文" |

**为什么 L3 是影响面哨兵**：P1 基线 12 键里只允许 `implementing/heavy` 一键变。
第二键变 = 改动越界（动了 `common/iron-rules` 或别的节点）——这正是本设计要防的
"顺手改一点"。

## 功能测试用例 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 用例 id | 断言 | 命令 | 期望 | serves |
|---------|------|------|------|--------|
| TC-1 | 映射表只剩 2 项，且不含 implementing | `node -e "import('./scripts/inline-prompt-fragments.mjs').then(m=>console.log(Object.keys(m.VENDOR_MAIN_SKILLS).join(',')))"` | 输出恰为 `accepting,archived` | FR-1 |
| TC-2 | 测试侧同源副本与脚本一致（2 项） | `grep -n "executing-plans" tests/prompt-tiers.test.ts scripts/inline-prompt-fragments.mjs` | 两文件均 **0 命中**（`implementing:` 映射行已删） | FR-1 |
| TC-3 | 源 / 产物 / 映射三者自洽 | `node scripts/check-prompt-fragments.mjs` | `exit 0`；**不得**出现 `heavy.md ↔ vendor 原文不一致` 或 `与 fragments/**.md 不一致` | FR-4 |
| TC-4 | implementing 不再是镜像档 | `diff -q src/domain/prompt/fragments/implementing/heavy.md src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` | **有差异**（`diff -q` 输出 Files … differ，退出码 1）；改动前该命令**无输出** | FR-2 |
| TC-5 | vendor 原文逐字节留档 | `wc -c src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md`；`git diff --exit-code -- src/domain/prompt/vendor/superpowers/executing-plans/SKILL.md` | `20405`；`git diff` 空（`exit 0`） | FR-1 |
| TC-6 | 自写档含本仓流程要素 | 取 `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text`，断言含 `本仓实施模式`、`reqboard_task_move`、`reqboard_task_report`、`reqboard_ask_confirm`、`reqboard_submit(kind=verification)` | 全部命中 | FR-2, FR-6 |
| TC-7 | **影响面哨兵**：基线只 1 键变 | `git diff tests/fixtures/stage-prompts-baseline-p1.json` 后逐键比对 12 键 | 变化的键**只有** `implementing/heavy`（其余 11 键逐字节相等） | FR-4 |
| TC-8 | 注入体量与预算余量 | `node -e` 打印 `resolveStagePrompt({stage:'implementing',difficulty:'heavy'}).text.length` | `< 8000`（目标 ≤ 7,700；改前 23,852） | FR-5 |
| TC-9 | 基线回归锁绿 | `npx vitest run tests/prompt-baseline.test.ts` | 全绿（12 键键集合 + 逐字相等） | FR-4 |
| TC-10 | 映射 / floor / 顺序 / light 边界 | `npx vitest run tests/prompt-tiers.test.ts` | ④（2 节点）、⑤（light 不含 heavy 独有要素）、⑥（顺序）、⑦（floor 不被裁）全绿 | FR-1, FR-5 |
| TC-11 | 保留的两个纪律骨架节名在场 | `npx vitest run tests/stage-prompts.test.ts` | `HEAVY_ELEMENTS.implementing` = `['The Task Loop','Common Rationalizations']` 命中；`REQ_SPECIFIC.implementing` 命中 | FR-2 |
| TC-12 | overrides 收编到位 | `grep -c "覆盖 [0-9]" src/domain/prompt/fragments/implementing/heavy/overrides.md`；`grep -c "覆盖上文" …` | 条目数 `2`；`覆盖上文` ≥ 1 | FR-3 |
| TC-13 | 注入面路径与工具名合法 | `pnpm prompts:check` | `exit 0`（生成 + 门禁 + 路径探针三步全过） | FR-4, FR-5 |
| TC-14 | 档案与映射表一致 | `grep -c "heavy 主 skill" src/domain/prompt/vendor/superpowers/ATTRIBUTION.md`；`grep -c "不再注入" …` | `2`（accepting / archived）；`≥ 3`（brainstorming / writing-plans / executing-plans） | FR-4 |
| TC-15 | 项目文档新增实施模式记载 | `grep -n "本仓实施模式" docs/architecture/project-manual.md` | 命中新增节标题；且同文件「变更记录」含本需求号 | FR-6 |
| TC-16 | 生成幂等 | `node scripts/inline-prompt-fragments.mjs && git diff --exit-code src/domain/prompt/generated/fragments.ts` | 第二次运行后 `git diff` 为空（`exit 0`） | FR-4 |
| TC-17 | 类型检查不回归 | `pnpm typecheck` | `exit 0` | FR-4 |
| TC-18 | 全量回归（无意外连带失败） | `npx vitest run` | 全绿；**允许**的差异只有下表的**四处有意更新**与 P1 快照 | FR-4 |

### 有意更新（不是"改测试迁就代码"，是换底的必要同步） `serves: FR-4`

| 文件 | 位置 | 现内容 | 改为 | 依据 |
|------|------|-------|------|------|
| `tests/prompt-tiers.test.ts` | 同源 `VENDOR_MAIN_SKILLS` 副本 | 3 项（含 `implementing: 'executing-plans'`） | 2 项 | 与脚本唯一事实源同步 |
| `tests/prompt-tiers.test.ts` | ④ 镜像组 | 遍历 3 节点断言逐字节一致 | 遍历 2 节点（由映射表驱动，通常无需改代码） | 映射表已不含 implementing |
| `tests/kb-prompt-wiring.test.ts` | 「镜像档 heavy.md 仍与 vendor 原文一致」 | 抽样断言 `implementing/heavy.md` **不得**含 `判定标准挂可跑命令` | 把 `implementing` 从"镜像档"名单移除（自写档允许出现本仓收尾行） | 自写档不再是镜像档 |
| `scripts/prompt-path-probe.mts` | allowlist | 上游辅助脚本允许条目 + 理由引用"逐字节锁定" | 删条目；`docs/superpowers/` 条目理由改写 | 死条目 + 失实理由 |

### 关键词可用性（保留骨架节名的依据，非猜测） `serves: FR-2`

| 关键词 | 现 heavy（vendor 原文）命中 | 改后自写档是否保留 | 用途 |
|--------|:---:|:---:|---|
| `The Task Loop` | 1 | ✅ 保留为节名 | `HEAVY_ELEMENTS` / `HEAVY_ONLY` 锚点 |
| `Common Rationalizations` | 1 | ✅ 保留为节名 | 同上 |
| `reqboard_task_move` | 0（原文无本仓工具） | ✅ 新增（正文 §2） | `REQ_SPECIFIC` 锚点 |
| `reqboard_task_report` | 0 | ✅ 新增（正文 §5） | `REQ_SPECIFIC` 锚点 |

> **选词约束**（⑤ 组同时断言"light 不含该关键词、heavy 含"）：上述关键词**不得**出现在
> `implementing/light.md`、`implementing/light/overrides.md`、`common/iron-rules.md`。
> `The Task Loop` / `Common Rationalizations` 现状已在 light 侧 0 命中（light 组现为绿），保留即安全。

## 测试覆盖度统计 `serves: FR-1, FR-5`

| FR | 覆盖用例 | 覆盖方式 |
|---|---|---|
| FR-1 退出镜像表 | TC-1, TC-2, TC-5, TC-10 | 直接断言 + 门禁 |
| FR-2 改写自写档 | TC-4, TC-6, TC-11 | 取词断言 + 差异断言 |
| FR-3 收编 overrides | TC-12 | 计数 + 标题在场 |
| FR-4 档案/断言/生成物/基线同步 | TC-3, TC-7, TC-9, TC-13, TC-14, TC-16, TC-17, TC-18 | 门禁 + 基线 + 幂等 |
| FR-5 体量与 floor | TC-8, TC-10, TC-13 | 长度断言 + floor 组 |
| FR-6 实施模式记载 | TC-6, TC-15 | 档内取词 + 文档 grep |

**未覆盖（诚实登记）**：

- **"自写档读起来是不是真的讲清了本仓流程"**：机器判不了。出口 = L5 人工通读 +
  确认门（人在设计/实施后读一次）；本设计不假装能自动判语义质量。
- **注入文本对 agent 行为的实际影响**：需要真实跑一条实施链才有读数，超出本需求范围（
  立项依据里的收益是"字符数与纪律一致性"，不是"效率提升多少"）。

## 关键决策与取舍 `serves: FR-4`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 是否新造检查器 | 写一个"自写档必须有 N 节 / 每节必须含工具名"的专用检查器 | 复用既有门禁与测试 | 新检查器 = 新的会漂移的真相源；已有断言覆盖了"空转"风险 |
| 镜像断言的替代 | 加一条 `expect(heavy).not.toBe(vendor)` | 不加 | 弱断言（改一个字即绿）无信息量；价值由关键词 + 长度 + 手工通读守 |
| 影响面哨兵 | 直接重刷基线（12 键全量） | 重刷 + 逐键比对（只 1 键可変） | 不比对会把越界改动静默固化 |
| 全量回归范围 | 只跑 4 个相关测试文件 | 加跑 `npx vitest run` 全量 | 生成物内联的是全库文本，越界风险不止在 4 个文件；全量成本低于一次误提交 |

## 技术方案与亮点 `serves: FR-4, FR-5`

- **判据全部可跑**：18 条用例，每条都有命令 + 期望输出，没有"收敛""更清晰"这类形容词判据。
- **一条命令跑主链**：`pnpm prompts:check`（生成 + 门禁 + 路径探针）覆盖 TC-3 / TC-13 / TC-16 的同源部分。
- **哨兵先于重刷**：先看 diff 再决定刷不刷基线——顺序反了，哨兵就失效。
