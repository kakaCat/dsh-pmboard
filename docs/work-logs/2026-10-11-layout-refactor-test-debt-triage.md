# 2026-10-11 平铺布局后的「判据债」triage（19 包重构 · Phase 0 收尾）

> 相关：[`2026-10-11-plugin-load-restore.md`](./2026-10-11-plugin-load-restore.md)（同一次平铺布局的装载事故）、
> [`../architecture/workspace-packages.md`](../architecture/workspace-packages.md) §装载形态 / §测试与文档落点。

## 一、这轮清完了什么

`pnpm test`：**45 红文件 / 67 红用例 / 7221 过 → 10 红 / 17 红 / 7398 过**（本文写就时实测）。
清掉的是**同一类**：代码搬进 19 个包，**判据还在按单包布局写**。

| 形态 | 例子（已修） |
|---|---|
| 多包扫描根 | `tests/helpers/error-code-scan.ts` 两处把 `pm/` 当"包目录"；`failure-alert`、`cross-window-delivery`、`prompt-error-codes`、`concurrency-limits` 扫根 `src/` |
| 直接路径 / 跳转串 | `repoPath('src/...')`、`join(SRC,'../pm-core/...')`（旧布局下 `src/` 与 `pm-core/` 同级，平铺后不同级） |
| 夹具路径 | `tests/fixtures/error-code-inventory.json` 全量旧路径 → 用仓库自带入口重生成（**纯路径更新，covered 零翻转**） |

顺带修掉**两个产品缺陷**（都不是改判据）：

1. **`conflict-check.PATH_RE` 从路径中段起匹配**：根列表只有 `src|packages|pm|scripts|tests|docs` 且无左边界
   ⇒ `改 pm-core/src/domain/task/Footprint.ts` 被截断成 `src/domain/task/Footprint.ts`。
   冲突门与零交集依赖建议**比的是文件身份**，包名丢了会把 `pm-core/src/x.ts` 与 `pm-client/src/x.ts` 当同一个文件。
   按其规格书 `pm-core/tests/path-extraction-scope.test.ts`（TC-1…TC-5）修：吃进现行包前缀 + 加左边界
   ⇒ 规格 **7/7**、受害方 `tests/plan-depends-e2e.test.ts` **9/9**。
2. **`pnpm prompts:check` 整条门禁是坏的**：`scripts/inline-prompt-fragments.mjs` 的
   `TYPE_FRAGMENTS_FILE/REL` 仍拼旧包名 `pm-type-<cat>/src/fragments.ts`（现行 `category/pm-category-<cat>/`）
   ⇒ 修后 exit 0，且重生成的 `pm-common/src/prompt/generated/fragments.ts` 与盘上**逐字节相同**。

另修两条**契约用例的驱动方式**（不是放松）：`UserQuestionsAdapter.askTimed` 自 **2026-10-08** 起刻意
**不透传宿主 `askTimed`**（改 `ask()` 与计时器本地竞速，理由见该文件注释），而 `confirm-repost` /
`capture-interactions` 仍用"假 `askTimed` 返回 pending"驱动超时 —— 那条路**已不会被调用**，
表现为退化成「名称为空」与挂死 5s。改为**假时钟驱动真实超时路径**，对用户契约的断言一字未改。

## 二、剩余 10 个：都在 10-06 记录的失败基线内 ⇒ **每个都要一次取舍**

命令：`npx vitest run <file>`（下列输出为实测首因）。

| # | 文件 | 实测证据 | 处置选项 | 倾向 |
|---|---|---|---|---|
| 1 | `tests/e2e-triad-gate.test.ts`、`pm-core/tests/triad-gate.test.ts` | `expected [Function] to throw error matching /task_card_incomplete/ but got '转移 decomposing → implementing 是人工闸门，仅…'` | ①承认新优先级（人工门先于任务卡门）→ 改判据；②恢复旧顺序 | 需产品裁定 |
| 2 | `tests/size-budget.test.ts` | `超标文件（未在白名单内）：client/api.ts = 674 行 / client/conversation-progress.ts = 453 行`（阈值 400） | ①出拆分任务（真正的债）；②白名单（须写明"谁负责拆"） | **拆文件**（白名单会烂） |
| 3 | `pm-core/tests/layer-boundary.test.ts` | 层归类写死 `rel(p).startsWith('domain/')` = 单包模型 ⇒ 新布局命中 **0** 个文件（自检 `≥20` 红） | ①改判到"包内层"模型；②**退役**（`scripts/package-boundary-check.mts` 已在管分层：20/20） | 倾向②，先确认覆盖等价 |
| 4 | `pm-core/tests/skills-assets.test.ts` | `expected [] to include 'pm-skills'`——读**根** `package.json` 的 `files`；现根是 workspace 根（无 `files`），资产改由 `dist` 打包 | ①断言改到 `pm/package.json` 的打包面；②退役该断言 | 需确认打包面事实 |
| 5 | `pm-core/tests/template-address-injection.test.ts` | 该场景 `sink.entries` 为空 ⇒ `charCount > 0` 红（H2 注入没发生） | 查注入装配为何不落痕（可能随 `pm-round-driver` 退役带走） | 需产品查因 |
| 6 | `pm-core/tests/interruption-checkpoint.test.ts` | 交棒后 `r.interruption` 为 `undefined` | 断点补写已并入 `reqboard_task_amend op=interruption` ⇒ 用例应改走新入口 | 改判到新入口 |
| 7 | `pm-core/tests/doc-sync.test.ts` | `reqboard_move 未执行：… 的「讨论与裁定记录（D-x）」节未就位：… requirement.md 不存在` | 门禁新增"节在场地"要求 ⇒ fixture 补该节，或确认门禁是否过严 | 需确认门禁口径 |
| 8 | `pm-core/tests/dive-session-driver-wiring.test.ts` | `expect(infos.some(m => m.includes('dive session driver registered'))).toBe(true)` 实得 `[]` | 装配点已搬 `pm-core`（`pm-round-driver` 退役）⇒ 改判读数或补日志 | 需产品查因 |
| 9 | `pm-core/tests/t7-legacy-tolerance.test.ts` | `expected true to be false` | 语义断言，需读该需求口径 | 需产品裁定 |

> 说明：10-06 基线 = `docs/reviews/test-baseline.md` 及 `…failures.txt`；上表每一条都在其中，
> 即**都不是**这次平铺布局新引入的，而是被布局重构**暴露**出来的既有病。

## 三、未纳入提交的共享改动（与他人工作树 WIP 纠缠）

| 文件 | 排除原因 |
|---|---|
| `pm/src/adapters/goal-round-ports.ts` | 含 +33 行未提交的 goal 端口 WIP（本轮的 `openTasksOf` 收敛只占 3 行） |
| `pm-common/src/protocol.ts` | +10 行是 goal 身份/授权三元组 WIP（本轮只改 1 行注释） |
| `scripts/reverse-drill-matrix.mts` | 17/17 行是 `round-driver → goal-round-driver` 的 WIP |
| 根 `package.json` | 全是 WIP（改名 `dsh-pmboard-workspace`、描述、devDeps 重排） |
| `goal/pm-goal/tests/goal-strict.test.ts` | **未跟踪**的 WIP 测试文件（本轮只修其 3 个类型错） |
| `pm-core/tests/live-tasks-single-source.test.ts` + `tests/fixtures/canceled-literal-baseline.json` | 依赖上表第 1 项（适配层收敛才能让守卫绿）⇒ 随那笔 WIP 一起入库 |

## 四、建议

立一条 **bug/chore 需求**收第二节那 10 条：每条先定"承认现状（改判据）"还是"改实现"，再动手。
其中 **#3（layer-boundary）、#4（skills-assets）** 大概率是"改判/退役"，可以在需求内先定掉；
**#2（size-budget）** 是确凿的实现债，需要独立拆分卡。
