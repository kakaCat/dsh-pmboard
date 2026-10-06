---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7]
---

# 测试策略与用例（REQ-261005151245-54ae）

> 需求源：`requirement.md`（FR-1~FR-7）。每条用例都可跑、可证伪；命令一律给到文件级。
> 场景出处见 `use-cases.md`；端口与回执字段见 `interfaces.md` / `data-model.md`；文件级改动见 `backend.md`。

## 测试层级与载体 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 层级 | 载体 | 覆盖什么 |
|---|---|---|
| 纯函数单测 | `tests/open-window-inherit.test.ts`（新增） | `src/application/internal/window-inherit.ts` 的 `increasedWindowTitle` 三种形态与边界；`presetInheritanceOf` 三态（有 preset / 无 preset / 画像不可得） |
| 用例级单测 | 同上文件（同一需求一个测试文件） | `openWindow` / `handoffOwner` / `openMigrationWindow` 三入口的继承接线：读画像 → 建窗 → 继承 → 回执（T-01~T-15） |
| 工具壳契约 | `tests/open-window-tool.test.ts`、`tests/handoff-owner.test.ts`（均既有） | `title` 进 tool declaration；`inheritance` 进 output schema（`additionalProperties:false` 下未声明键会被整条拒收）；`reqboard_handoff` 回执带 / 不带该键两种形态 |
| HTTP 路由 | 主文件（函数级直调 `openMigrationWindow`） | 迁移开窗返回值含 `inheritance`，且 `title='set'`（显式语义名）；既有三码不变。**注意**：`tests/settings-storage.test.ts` 是客户端设置屏测试，不碰该路由（grep 零命中），故该断言并入主文件而非改它 |
| 回归 | 见「回归与基线」一节 | 开窗、交接、迁移三处既有契约逐字不破 |
| 类型与全量 | `pnpm build` / `pnpm typecheck` / `pnpm test` | 构建退出码 0；改动文件零新增类型错误（基线 223）；全量失败数 ≤ 106 |

## 用例表（主文件逐条可跑） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-7`

命令模板：`npx vitest run tests/open-window-inherit.test.ts -t "T-01"`。用例名以编号开头（`-t` 是子串过滤），故每条命令即编号本身。

| 编号 | 场景 | 期望 | 命令 |
|---|---|---|---|
| T-01 | 源 `title='登录重构'`，不传 `title` | `rename(child, '登录重构 (1)')`；`inheritance.title='set'`，`reasons` 不含该项 | `npx vitest run tests/open-window-inherit.test.ts -t "T-01"` |
| T-02 | 源 `title='登录重构 (2)'` | 子会话标题恰为 `'登录重构 (3)'`（半角括号 +1） | `npx vitest run tests/open-window-inherit.test.ts -t "T-02"` |
| T-03 | 源 `title='登录重构（3）'`（全角括号） | 子会话标题恰为 `'登录重构（4）'`（括号形态不变形） | `npx vitest run tests/open-window-inherit.test.ts -t "T-03"` |
| T-04 | 显式 `title='台账迁移窗口'`，且源有标题 | 子会话标题**恰为** `'台账迁移窗口'`（不递增、不加后缀） | `npx vitest run tests/open-window-inherit.test.ts -t "T-04"` |
| T-05 | 画像读到 `{}`（读成功、无标题），不传 `title` | **不调** `rename`；`inheritance.title='skipped'`；`reasons` 含 `标题：源会话无标题` | `npx vitest run tests/open-window-inherit.test.ts -t "T-05"` |
| T-06 | 源画像 `agentPreset='cordis'`，`mode='create'` | `create` 请求体含 `agentPreset:'cordis'`（与 `workspaceId`/`cwd` 同请求、不判互斥）；`inheritance.preset='set'` | `npx vitest run tests/open-window-inherit.test.ts -t "T-06"` |
| T-07 | 画像读到但无 `agentPreset` | `create` 请求体**不含**该键（不是 `undefined` 占位）；`inheritance.preset='skipped'`；`reasons` 含 `模式：源会话未登记 Agent 预设` | `npx vitest run tests/open-window-inherit.test.ts -t "T-07"` |
| T-08 | 源 `modelSelection.next={provider:'deepseek',model:'deepseek-reasoner',reasoningEffort:'high'}` | `selectModel(child,{provider:'deepseek',model:'deepseek-reasoner',reasoningEffort:'high'})` 逐字相等；`inheritance.model='set'` | `npx vitest run tests/open-window-inherit.test.ts -t "T-08"` |
| T-09 | 源 `modelSelection.next` 为 `null` | **不调** `selectModel`；`inheritance.model='skipped'`；`reasons` 含 `模型：源会话无模型选择读数` | `npx vitest run tests/open-window-inherit.test.ts -t "T-09"` |
| T-10 | `projections` 抛错 `Error('boom')`（画像读不到），不传 `title` | 开窗仍 `success:true`；**三项皆 `failed`**（`title` 也 `failed` —— 读不到 ≠ 源没有）；`reasons` 三条依次为 `标题：源会话画像不可得——读画像失败：boom`、`模式：…`、`模型：…` | `npx vitest run tests/open-window-inherit.test.ts -t "T-10"` |
| T-11 | `rename` 抛错 | `inheritance.title='failed'` + 原因 `标题：写标题失败：<原文>`；`model` 仍 `set`（**不短路**）；开窗成功 | `npx vitest run tests/open-window-inherit.test.ts -t "T-11"` |
| T-12 | `selectModel` 抛错 | `inheritance.model='failed'` + 原因 `模型：设模型失败：<原文>`；`title` 仍 `set`；开窗成功 | `npx vitest run tests/open-window-inherit.test.ts -t "T-12"` |
| T-13 | 端口不实现三个新方法（测试替身只有 fork/create），不传 `title` | 开窗成功；三项皆 `failed`，`reasons` 为 `标题/模式/模型：源会话画像不可得——未装配读画像能力（readProfile）`；既有用例逐字不破 | `npx vitest run tests/open-window-inherit.test.ts -t "T-13"` |
| T-14 | `fork` 路径 | preset 由宿主继承 → 画像有值时 `inheritance.preset='set'`，且**不额外读子会话**（断言 `projections` 只被调 1 次） | `npx vitest run tests/open-window-inherit.test.ts -t "T-14"` |
| T-15 | 迁移开窗（函数级直调 `openMigrationWindow`，假 deps + 假端口） | `create` 落点来自源项目；`rename` 收到**恰为** `台账迁移窗口`（显式语义名，不递增源标题）；返回值含 `inheritance` 且 `title='set'`；既有三码路径不变 | `npx vitest run tests/open-window-inherit.test.ts -t "T-15"` |

## 回归与基线 `serves: FR-6, FR-7`

三条命令与判据（外加需求文档点名的项目根回归与生成物自检）：

| 命令 | 判据 |
|---|---|
| `npx vitest run tests/open-window-tool.test.ts tests/handoff-owner.test.ts` | 全绿；既有断言逐字不破 |
| `npx vitest run tests/open-window-project-root.test.ts` | 全绿（`requirement.md` 判定标准 3 点名；基线口径不变） |
| `pnpm build` | 退出码 0（kb C-11：host `dist/` 与 client `lib/client.js` 都要有新产物） |
| `pnpm typecheck` | 改动文件零新增错误（HEAD 基线 223 个历史错误） |
| `pnpm test` | 失败数 ≤ 基线 106（见 `docs/requirements/REQ-261001110934-3766/evidence/full-test-comparison.txt`） |
| `npx tsx scripts/kb-build.mts --write && pnpm kb:check` | 退出码 0（kb C-13：新增 `src/application/internal/window-inherit.ts` 会改代码地图 `/ 符号表` 两个生成物，必须重生成后零漂移） |
| `npx vitest run tests/size-budget.test.ts` | 全绿（kb/门禁：新模块与改动后的适配器都 ≤400 行） |

既有断言逐字不破清单：

| 文件 | 逐字不破的断言 |
|---|---|
| `tests/open-window-tool.test.ts` | 窗口码 ≠ 源窗口且以 `session-` 开头；`parent_session_id` = 源窗口；服务缺失时响亮失败（不伪造窗口码）；`degraded_note` 含「请在侧栏打开」且**不含**「已打开」 |
| `tests/handoff-owner.test.ts` | 席位升降、`sourceSessionId` 同步、幂等、不变量 INV-1~3、半截交接防线、投递失败不回滚、回执四键，全部原样 |

基线纪律：跑之前先在 HEAD 上取一次基线读数，本次不得高于它；出现新增失败即本次引入，当场修。

**E2E 读数的说明**：看板的「E2E 覆盖」指示读的是 **`requirement.md`** 里"层级含 E2E"的测试策略表行
（`e2eCoverageOf`）。本需求的需求文档已人确认、按平台规则不在 design 阶段重交，故该指示会显示"无"——
不是漏做，而是本需求的端到端验证由 **T-15 + 探针 + 实机三处复核**承担（下方「取证与验收口径」末两行）。

## 探针（假宿主 dry-run） `serves: FR-2, FR-3, FR-4, FR-7`

命令：`npx tsx scripts/open-window-inherit-probe.mts`；**退出码 0 是唯一判据**。

| 读数 | 含义 | 断言 |
|---|---|---|
| `source_title` | 假源会话标题（如 `登录重构`） | 基准读数 |
| `child_title` | 子会话被写定的标题 | `child_title === '登录重构 (1)'`（对 `source_title` 递增一次） |
| `source_preset` | 假源会话 `agentPreset` | 基准读数 |
| `child_preset` | `create` 请求体带出的 preset | `child_preset === source_preset` |
| `source_model` | 假源会话 `modelSelection.next` | 基准读数 |
| `child_model` | 子会话 `selectModel` 收到的选择 | 与 `source_model` 逐字相等（含 `reasoningEffort`） |

三对读数相等即「继承闭环」成立；任一不等、读数缺失或多出 → 非 0 退出。探针同时打印三段附加耗时（`requirement.md` NFR 的 P95 < 500ms 测量口径）。

## 判别力自证（停用即红） `serves: FR-1, FR-3, FR-4, FR-5, FR-7`

每条新接线点都要有「停用即红」的现场证明，否则用例是空过的：

| 停用什么 | 哪条必须变红 | 怎么取证 |
|---|---|---|
| `increasedWindowTitle` 的递增分支（命中 `(N)` 时原样返回） | T-02、T-03 | 临时停用 → 跑 `-t "T-02"` / `-t "T-03"` 记录红摘要 → 恢复 → 复跑绿 |
| `create` 请求体的 `agentPreset` 透传 | T-06 | 同上，`-t "T-06"` |
| `applyWindowInheritance` 内的 `selectModel` 调用 | T-08 | 同上，`-t "T-08"` |
| 「继承不短路」（`rename` 失败即提前 return） | T-11、T-12 | 同上，`-t "T-11"` / `-t "T-12"` |

做法：本地临时停用 → 期望对应用例红 → `git checkout` 恢复 → 确认 `git diff` 零残留。证据（命令 + 红/绿摘要）进验收材料。

## 取证与验收口径 `serves: FR-5, FR-6, FR-7`

| 跑什么 | 看到什么算过 |
|---|---|
| `npx vitest run tests/open-window-inherit.test.ts` | T-01~T-15 全绿；上一节四行「停用即红」各现场证明过一次 |
| `npx tsx scripts/open-window-inherit-probe.mts` | 退出码 0；打印六个读数且三对相等 |
| 回归五条 + `pnpm build` / `pnpm typecheck` / `pnpm test` / `pnpm kb:check` / `size-budget` | 回归全绿；build 退出码 0；改动文件零新增类型错误；全量失败数 ≤ 106；知识层零漂移；尺寸门禁过 |
| 实机复核（GUI：源窗口已是「创造模式 + 非默认模型」，标题「登录重构」） | 侧栏出现标题为「登录重构 (1)」的新会话；打开后**模式芯片**显示创造模式、**模型选择器**显示同一模型（含推理档） |

实机复核固定看三处：**侧栏标题 / 模式芯片 / 模型选择器**——各留一张截图或一段文字记录（写明观察时间与窗口码），落
`docs/requirements/REQ-261005151245-54ae/evidence/`；回执里的 `inheritance` 三项状态贴进同一份记录，便于对照「回执说的」与「界面看到的」。
