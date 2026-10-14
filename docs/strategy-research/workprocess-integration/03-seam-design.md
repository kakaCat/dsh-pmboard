# 接缝设计：workprocess 回合驱动器驱动 pm 的需求/子卡（待人裁定）

> 本文件是**接缝方案**（只设计、不改任何源码）。上游：[`01-facts.md`](./01-facts.md)（事实账）、[`02-options.md`](./02-options.md)（候选与推荐）。
> 人的口径（2026-10-12）：**驱动边界 = workprocess 驱动 pm 的需求/子卡**；**仓形态 = 四包收进 pm 仓（A1）**。
> 锚点约定：`WP = /Users/mac/Documents/ai/dsh/dsh-workprocess`；pm 仓内用仓根相对路径；跨仓用 `WP/…`；每条锚点 `sed -n` 可核。

## 一、真源与两条候选

### 候选 i：**投影**（pm 台账为真源，workprocess 只持回合运行态）—— 见 §六 #1 的推荐项

```
pm 台账（需求 / 父卡 / 子卡 / 状态 / 依赖）
   │  ① 纯函数投影（每拍重建，零 I/O）：projectWorkProcess(requirementId, tasks, runs) → WorkProcess 快照
   ▼
WorkProcess 快照 ──factsOf()──▶ WorkFacts ──decideWorkRound()──▶ RoundDecision（十态）
   │                                                                    │
   │                                                                    ▼ ② 写回只经 pm 用例（不直写 pm 存储）
   └──────────── 回合账 / 许可 / 去重记号 / closedAt 落 workprocess 记录（scope = requirementId）◀──┘
```

### 候选 ii：**参数化**（把驱动器的读/写抽成端口，pm 全部真源）

把 `TickDeps.domain`（`WP/workprocess-round-driver/src/index.ts:133-152`）从 `WorkprocessService` 换成 pm 侧端口（读 pm 台账 + 写 pm 用例 + 回合账落 pm），
于是进程里**只需要驱动器**，workprocess 的存储域 / 服务 / 审计 / 不变量伴生件都不必进宿主。

### 选定建议：**i 投影**。理由（逐条对事实）

| # | 理由 | 锚点 |
|---|---|---|
| 1 | 驱动器的输入**本来就是纯数据事实**、事实由纯函数算出——投影是它原生支持的接法，**驱动器内核一行不用改** | `WP/workprocess-round-driver/src/decide.ts:76-95`、`WP/workprocess-round-driver/src/index.ts:100-125` |
| 2 | pm 的项目面远大于 workprocess（需求状态机、人工门、三张卡片转移表、子卡角色不变量、验收/RTM/看板）——真源搬走等于**重写项目面** | `pm-core/src/protocol-domain.ts:144`、`pm-core/src/protocol-domain.ts:268-274`、`pm-core/src/domain/task/TaskStatus.ts:57`、`pm-core/src/domain/task/TaskStatus.ts:65-72`、`pm-core/src/protocol-domain.ts:1420-1421` |
| 3 | **回合账必须耐久且"按任务计"**（`rounds` × `effectiveCapOf`），这套 workprocess 已落地验证（含 block 门槛、收尾轮、去重记号、activation）；pm 侧现有运行态只有 `nextReady` / `pauseReason`，没有逐任务回合账 | `WP/workprocess-round-driver/src/index.ts:113-124`、`WP/workprocess-round-driver/src/index.ts:95`、`pm-core/src/application/use-cases/QueryRunStatus.ts:22`、`pm-core/src/application/use-cases/QueryRunStatus.ts:26` |
| 4 | 投影的一致性代价可控：纯函数 + **每拍重建** + 写回只经 pm 用例 + 不一致即对账告警（绝不静默） | `WP/workprocess-round-driver/src/index.ts:158` |
| 5 | ii 的代价是把 workprocess 的服务/审计/不变量伴生件全部作废（`audit()`、`asked()`、activation 都在服务面上），等于**只借决策树**，丢掉已验收的一半能力 | `WP/workprocess/src/service.ts:103`、`WP/workprocess/src/service.ts:107-115` |

⇒ ii 不是错，是**更激进的第二阶段**：等 i 跑通、确认 pm 侧不需要 workprocess 的存储/审计之后，再把 `TickDeps.domain` 换成 pm 端口。

## 二、映射表（pm ↔ workprocess）

| # | pm 侧（对象/字段/状态） | workprocess 侧 | 真源 | 说明 |
|---|---|---|---|---|
| 1 | 需求 `REQ-xxxx` | `workProcess.id` = `wp:<scope>`，`scope` = 需求 id | **pm** | workprocess 的归属域键直接用需求 id（一格一需求） |
| 2 | 需求 objective（标题 + 摘要） | `WorkProcess.objective` | **pm** | 投影时取需求标题/目标 |
| 3 | 需求阶段（`draft…archived`） | **不映射** | **pm** | workprocess 无需求级阶段；它只管 implementing 期卡执行的回合（见 §四） |
| 4 | **父卡**（role=parent） | `workStage`（`key`=父卡 id、`statement`=父卡标题、`doneCriteria`=父卡验收） | **pm** | 父卡是"一段可收口的边界"，与阶段同义 | 
| 5 | **子卡**（role=subtask，`stageKind ∈ dev/integrate/review/test`） | `workTask`（`objective`=子卡标题、`maxRounds`=卡面上限或策略回落） | **pm** | 一子卡 = 一任务 |
| 6 | 子卡状态 `todo/in_progress/done/canceled` | `workTask.phase` `active/paused/blocked/complete` | **pm** | **部分映射**：`blocked`/`paused` 在 pm 侧无对应状态（见下） |
| 7 | 父卡状态 `todo/in_progress/done` | `workStage.state` `pending/active/done` | **pm** | 直接对应（父卡转移表只有这三态） |
| 8 | 子卡依赖 DAG（`depends_on` / `nextReady`） | `workStage` 串行门（INV-5） | **pm** | **不映射**：pm 是 DAG、workprocess 是线性串行（见 §六 #2） |
| 9 | 收口政策（**pm 现无此字段**） | `WorkStage.closePolicy` `human/auto` | **pm（需新增）** | `auto` = 任务全 complete 后驱动器直接落 done；缺省 `human` |
| 10 | 回合上限（**pm 现无此字段**） | `WorkTask.maxRounds` | **pm（需新增）** | 缺省回落 `DEFAULT_MAX_ROUNDS=20` |
| 11 | ——（pm 无） | `rounds.tasks[id] = { rounds, grants }` | **workprocess** | 逐任务回合账 + 人追加预算份数（`resume` 一个 blocked 任务 +1 份） |
| 12 | Dive `armed` / `pause` | `activation` `armed/disarmed` | **合并** | 两套许可合成一套（见 §四） |
| 13 | ——（pm 无） | `asked.plan` / `asked.ask`（键 + 修订） | **workprocess** | "规划轮/收口确认只问一次"的耐久记号 |
| 14 | 子卡请求预算（`LIMITS.subtaskRequestBudget`） | ——（**不映射**） | **pm** | 口径不同：请求预算 ≠ 回合预算，两道闸并存、互不顶替 |
| 15 | 流程收口 `closedAt` | `WorkProcess.closedAt` | **workprocess** | 只表示"执行段跑完"；**需求归档仍走 pm 的人工门**（见 §六 #5） |

**不可映射项 / 需新增字段（本设计要人点头的地方）**

| 项 | 现状 | 建议 |
|---|---|---|
| `blocked` / `paused` 相位 | pm 子卡只有 `todo/in_progress/done/canceled` | 给 pm 卡面加 `blockedReason`（或策略表映射为 `in_progress` + 备注），**否则"被挡住"这件事在看板上会丢** |
| `closePolicy` | pm 无 | 父卡（=阶段）上加 `closePolicy: human｜auto`，缺省 `human`（对齐 pm"人工门在关键节点"的既有纪律） |
| `maxRounds` | pm 卡面已有 `max_rounds` 的说法（工具面接受）但无回合账 | 沿用卡面字段，账落 workprocess 侧 |
| DAG ↔ 串行 | pm 子卡有依赖 DAG | 见 §六 #2：**执行顺序仍由 pm 的 ready 集合定**，workprocess 只驱动"当前 ready 那张"的回合 |
| 请求预算 ↔ 回合预算 | 两套 | 并存，文档写明各自边界 |

## 三、端口清单（读 / 写 / 账 / 提示词 / 收尾）

| 端口 | workprocess 侧落点 | pm 侧落点（新增或复用） | 方向 |
|---|---|---|---|
| **读快照**（事实） | `factsOf(process, sessionKey?, fallbackMaxRounds, taskRounds?)` | **新增纯函数** `projectWorkProcess(requirementId, tasks, runs) → WorkProcess`（零 I/O，放 pm-core 的 domain/application 层） | pm → workprocess |
| **决策** | `decideWorkRound(input)` → `RoundDecision`（穷尽十态：drive / plan-stage / start-stage / ask-stage-done / close-stage / ask-close / close-process / block-task / wait-human / hold） | 不改 | 纯函数 |
| **一拍** | `tickWorkprocess(deps, scope, sessionKey?)` | 新增 `deps.domain` 的适配实现（下两行） | —— |
| **写动词** | `service.ts` 的 17 个写动词：`createProcess` / `defineStages` / `startStage` / `editObjective` / `closeStage` / `createTask` / `editTask` / `pauseTask` / `resumeTask` / `blockTask` / `completeTask` / `clearTask` / `discardProcess` / `closeProcess` | **逐动词对表**到 pm 用例（`AdvanceChain.advanceRequirement`、`ExecuteTask`、`Decompose`、任务状态推进等）——**写回只经用例，不直写 pm 存储** | workprocess 决策 → pm |
| **回合账** | `roundsStarted` / `taskRounds` / `observeRound` + `effectiveCapOf` | 不改（落 workprocess 存储域，`scope`=需求 id） | workprocess 内部 |
| **许可与记号** | `activation` / `setActivation` / `asked` / `markAsked` | 与 pm 的 Dive `armed/pause` 合并（§四） | 双方 |
| **提示词文本** | `roundDeliveryOf` / `planDeliveryOf` / `wrapupDeliveryOf` / `askDeliveryOf`（四类投递文案） | **投递由 pm 现有投递器执行**（推荐，避免两套预约机制；见 §六 #4） | workprocess → pm 投递器 |
| **内存闸** | `TickDeps.stagePlanAsked` / `humanAskAsked`（进程内存态） | 改为读**耐久**记号 `asked`（`WP/workprocess/src/service.ts:113-115`） | —— |
| **配置** | `WorkRoundDriverConfig`（`tick` / `drive` / `defaultMaxRounds` / `close` / `disarmOnResume` / `blockedAfterRounds`） | pm 的装载 patch 提供 | —— |
| **插件面** | driver 的 `inject = ['agents','sessions','workprocess']` | 收进 pm 仓后由 `pm/cordis.patch.yml` 装载（A1 五条行） | —— |

## 四、与 pm 现有自动链的关系（逐项处置）

| 现有物 | 处置 | 依据 |
|---|---|---|
| `reqboard_task_run`（父卡 → 子卡链 → 团队派发） | **换掉"谁决定下一拍"**：推进职责交给 workprocess 驱动器；工具保留为"起链"入口（人或 agent 触发一次） | `pm-core/src/application/use-cases/AdvanceChain.ts:716`、`pm-core/src/application/use-cases/QueryRunStatus.ts:67` |
| `QueryRunStatus`（run 节 `nextReady` / `pauseReason`） | **保留为项目侧只读读数**（看板展示），不再是驱动源——避免两套 tick | `pm-core/src/application/use-cases/QueryRunStatus.ts:22`、`pm-core/src/application/use-cases/QueryRunStatus.ts:26` |
| Dive（`armed`/`pause` + 内存闭锁/退避/准入） | **许可语义与 `activation` 合并成一套**；失败退避/闭锁若要留，作为 pm 侧"投递健康闸"并入 `GateFacts`（注意 workprocess 现在只留三道**真有产出方**的闸，没产出方的闸不留字段） | `pm-core/src/application/dive-core/round-state.ts:12-23`、`WP/workprocess/src/service.ts:107-109`、`WP/workprocess-round-driver/src/decide.ts:34-48` |
| 团队派发（唯一执行面） | **保留**：`workTask` 的一轮里调用它执行那张子卡 | `pm-core/src/application/use-cases/ExecuteTask.ts:496` |
| 需求级固定阶段 + 人工门（`move` / `ask_confirm` / 验收单 / 归档） | **不动**：workprocess 不碰需求级状态 | `pm-core/src/protocol-domain.ts:268-274` |
| 子卡请求预算（请求次数软门禁） | **保留**：与回合预算并存，两道闸各自管自己的口径 | `docs/architecture/subtask-request-budget.md:23` |

## 五、废弃清单（与本次收编一并处置；本卡只列，不动手）

| 类 | 内容 | 锚点 |
|---|---|---|
| 包删除（保持不复活） | `goal/*`（51 文件）与 `pm-workflow/`（9 文件）的工作树删除 | `docs/strategy-research/workprocess-integration/01-facts.md:214` 起 |
| 活代码旧名 | **17 个**仍 `import pm-goal*` 的文件（pm/src 3 个、pm-core src 5、pm-core tests 5、tests 3、tool-pm tests 1） | `docs/strategy-research/workprocess-integration/01-facts.md:255` 起 |
| **回合契约归属处**（新增，关键） | `pm-core/src/application/dive-core/round-state.ts:12-23`：「回合契约（预留形状/来源判定/逐字比对/失败退避/内存闭锁）**归属 goal**」的转发 import 与 re-export 要改成 **workprocess 的定义处** | `pm-core/src/application/dive-core/round-state.ts:12-23` |
| 驱动器槽位（换血） | `pm/src/adapters/goal-round-lifecycle.ts`、`pm/src/adapters/goal-round-ports.ts` 两个文件整体换成 workprocess 驱动器 + 投影/写回适配 | `pm/src/adapters/goal-round-lifecycle.ts:22-28`、`pm/src/adapters/goal-round-ports.ts:23` |
| 配置面旧名 | `tsconfig.json:96-118`、`vitest.base.mts:135-142`、`vitest.config.ts:19` 三组 `goal/*` 映射 | `docs/strategy-research/workprocess-integration/01-facts.md:267` 起 |
| 分层白名单 | `scripts/package-boundary-check.mts:37/39/45` 的 `pm-goal` 行 | `docs/strategy-research/workprocess-integration/01-facts.md:277` |
| 构建注释 | `pm/tsdown.config.mjs:20-21` 把 goal 家族算作内联对象的注释 | `pm/tsdown.config.mjs:20-21` |

## 六、待人裁定（请人勾选；每条写明裁定后的下一步动作）

| # | 裁定项 | 选项 | 裁定后下一步 |
|---|---|---|---|
| **#1** | 真源与接法 | ☐ **i 投影（推荐）** ☐ ii 参数化（只借决策树，改 `TickDeps.domain` 为 pm 端口） ☐ 先 i 后 ii 分两步 | i ⇒ 按本文件 §三 建"投影器 + 写回适配"；ii ⇒ 先改驱动器端口再谈投影 |
| **#2** | 子卡 DAG 与阶段串行怎么合 | ☐ **一子卡 = 一 workTask，执行顺序仍由 pm 的 ready 集合定（推荐）** ☐ 一条子卡链 = 一个阶段的 task 数组（顺序即链序） | 选①⇒ 投影器要把 `nextReady` 折进阶段事实；选②⇒ 需要一个"链 ↔ 阶段"的映射规则 |
| **#3** | `blocked`/`paused` 与 `closePolicy` 在 pm 侧的落点 | ☐ **给 pm 卡面加字段（`blockedReason`、`closePolicy`，推荐）** ☐ 不加字段、用现有状态近似表达 | 选①⇒ 先做 pm 侧的领域字段与显示；选②⇒ 写清近似规则与丢失的信息 |
| **#4** | 投递与许可归谁 | ☐ **投递用 pm 现有投递器、许可与 Dive 合并（推荐）** ☐ 用 workprocess 自带的 `tick`/`drive` 投递、Dive 退役 | 选①⇒ 适配层只取文案与决策；选②⇒ 要先把 pm 现有预约/准入机制拆掉 |
| **#5** | 需求级固定阶段是否保持，流程收口与需求归档的关系 | ☐ **保持（workprocess 只管 implementing 期卡执行；归档仍走 pm 人工门，推荐）** ☐ 需求级也交给 workprocess 拆 | 选①⇒ 接缝只画在"卡执行"这一层；选②⇒ 需要重画 pm 的需求状态机与人工门 |

## 七、自查（锚点能否解析）

判据与 [`01-facts.md`](./01-facts.md) 的自查节同口径（锚点只认正文、代码块内的示例不算）：

```bash
# 锚点自查：在 dsh-pmboard 仓根跑
WP=/Users/mac/Documents/ai/dsh/dsh-workprocess
DOC=docs/strategy-research/workprocess-integration/03-seam-design.md
awk '/^```/ {inb = !inb; next} !inb' "$DOC" \
  | grep -oE '`[^`]*:[0-9]+(-[0-9]+)?`' | tr -d '`' | sed "s|^WP/|$WP/|" | sort -u \
  | { fail=0; n=0
      while IFS= read -r a; do
        f="${a%:*}"; ln="${a##*:}"; rng=$(printf '%s' "$ln" | tr '-' ',')
        case "$f" in */*|*.*) ;; *) echo "SKIP(非路径) $a"; continue;; esac
        n=$((n+1))
        [ -f "$f" ] || { echo "MISSING FILE $a"; fail=1; continue; }
        [ "${ln##*-}" -le "$(wc -l < "$f")" ] || { echo "OUT OF RANGE $a"; fail=1; continue; }
        sed -n "${rng}p" "$f" | grep -q '[^[:space:]]' || { echo "EMPTY LINE $a"; fail=1; }
      done
      echo "checked=$n fail=$fail"
      [ "$fail" = 0 ] && echo "anchors ok" || echo "anchors FAILED"
    }
```

**本次输出（2026-10-12 写完本文件时，退出码 0）**：

```
checked=33 fail=0
anchors ok
```

> 33 条锚点 = 本仓 22 条 + `WP` 仓 11 条，逐条核对文件在、行号在范围内、该行非空。
> 指向 `01-facts.md` 的锚点 4 处，另行人工核对无误。
