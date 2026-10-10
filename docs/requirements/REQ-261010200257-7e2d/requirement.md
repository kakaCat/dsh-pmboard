---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8]
sides: [backend]
---

# REQ-261010200257-7e2d · PM 双层 Goal 能力：复制 dsh-goal 内核 + round-driver 依赖反转

> ⚠️ 本需求为**手工建档**（2026-10-10 pm 插件故障无法走 reqboard_capture 立项流程），
> REQ id 按 `REQ-<yyMMddHHmmss>-<suffix>` 惯例手工铸造，未入台账。插件恢复后需补登记。

## TL;DR

- **是什么**：以 dsh-goal 的简单内核为底座，自建 PM 的两层 goal 能力（L1 阶段目标 + L2 任务目标），
  同时把 pm-round-driver 对 pm-core 的 12+ 处硬 import 反转为端口注入。
- **为什么现在做**：dsh 的 goal 很简单（objective + 4 phase + rounds 计数），而 pm-round-driver
  已 819 行、import 12+ 个 pm-core 内部模块——复杂度全在"依赖方向反了"：driver 向外伸手要实现，
  而不是其他模块向 driver 的契约靠拢。
- **得到什么**：一个零依赖、可独立单测的 goal 内核；一个只剩"预留/准入纪律 + 端口编排"的
  精简 driver；目标状态持久化进台账，driver 驱动权唯一。

## 一句话目标 + 可证伪判定标准

**目标**：PM 的 goal 能力分两层持久化——**L1 阶段目标**（大任务目标，挂需求台账，所有阶段
目标达成 ⇒ 需求具备收口条件）与 **L2 任务目标**（小任务目标 = dsh goal 内核的 pm 自实现，
挂任务卡）；driver 只判"是否继续"，goal 状态是它的一道判据，**驱动权唯一归 pm-round-driver**。

**判定标准（跑什么、看到什么算完成）**：

1. goal 内核零依赖：`grep -rn "^import" pm-goal/src/` 只命中相对路径（无 pm- 包名 / @deepseek-ai / node I/O），
   无 `pm-` 包名、无 `@deepseek-ai/*`、无 node 内置模块 I/O。
2. driver 瘦身：`round-driver.ts` 对 `pm-core/**` 的**实现模块** import 归零
   （只许剩下端口/纯契约/纯函数）；文件行数 ≤ 尺寸门禁（400 行，超标走 wake-skip-trace 同款拆分）。
3. `npx vitest run tests/goal-kernel.test.ts tests/round-driver-ports.test.ts`（新增）→ 全绿，
   含**反向演练**：往 goal 内核塞一个 pm-core import → 边界检查必红
   （复用 `scripts/package-boundary-check.mts` 口径）。
4. 驱动权唯一：goal phase=active 但 humanGate 打开 → 不起轮（测试断言）；goal 自身无任何
   订阅 `agent/status` 的代码路径（grep 断言）。
5. 阶段收口判据：需求下全部 StageGoal.state==='done' ⇒ `readyToClose(requirement)===true`；
   任一未达成 ⇒ false 且不触发任何自动状态迁移（人工门不越过）。
6. 回归零新增：`npx vitest run tests/dive-round-driver.test.ts tests/dive-round-state.test.ts
   tests/dive-rearm.test.ts tests/dive-manager-alignment.test.ts` → 失败数 ≤ 开工基线。
7. `npx tsc --noEmit 2>&1 | grep -c 'error TS'` → ≤ 开工基线，改动文件零新增。

## 背景与共识（2026-10-10 设计讨论裁定）

本需求由四轮设计讨论收敛而来，已裁定的前提：

- **C-1（方向）**：以 dsh goal 为基础搭建 PM 的 goal 能力，分两层——项目/阶段 goal（L1）与
  任务 goal（L2）；L2 就是 dsh goal 的同构物。
- **C-2（自实现）**：**复制** dsh goal 内核代码自实现，不 import 宿主包。依据：
  ① application 层禁 `@deepseek-ai/*` 运行时 import（层边界门禁，`round-state.ts` 头注）；
  ② pm-round-driver 已是 dsh-goal-round-driver 的自实现先例（`round-driver.ts` 头注）。
- **C-3（驱动权）**：冲突不在模型，在驱动权。goal 只当"状态源"（答 active 与否），不当
  "第二个驱动者"。pm-round-driver 是唯一 idle 驱动点；goal 状态与 humanGate/chainBudget
  并列为判据输入。
- **C-4（依赖方向）**：当前 pm-round-driver import 12+ 个 pm-core 实现模块是反的；
  目标是 driver 只依赖"抽象端口 + 纯数据契约"，pm-core 在外层实现并注入（DIP）。

### 遗留裁决点（本需求实施前需人裁）

| 编号 | 问题 | 建议倾向 |
|---|---|---|
| D-1 | L2 任务目标的判据与任务卡现有 `acceptance` 是否同一物？ | **复用**：goal 判据 = acceptance，goal 只加"人话陈述 + 达成位"，不造第二份真相 |
| D-2 | L1 阶段目标落点：`requirement.goals[]` 新字段 vs 挂产物确认章推导？ | **新字段**：显式、可单测；推导会让判定发散 |
| D-4 | 阶段目标"达成位"由谁写：agent 自证（任务汇报联动）还是纯人工门？ | **agent 提议 + 人工门落章**：对齐五道人工门不可越过的既有纪律 |

## 业务流程图 <!-- serves: FR-4 -->

```
agent idle（唯一驱动拍，pm-round-driver）
   │
   ▼
latch? → 退避? → 人工门? → 预算? → 【goal 还 active 吗?】（新增判据，FR-4）
   │                                   │
   │                          active ──┴── complete/paused/blocked
   │                             │              │
   ▼                             ▼              ▼
 不起轮                        起轮          停在这一拍：
 （既有纪律不变）          （预留→投递→准入）  L2 done → 任务卡收口
                                              L1 全 done → 需求具备收口条件
                                              （仍过人工门，FR-6）
```

## 功能需求

### FR-1 · goal 内核（L2 任务目标）自实现 <!-- ref: design/architecture.md#fr-1 -->

**独立成包** `pm-goal`（零依赖纯函数；core 引用它，反之禁止），复制 dsh goal 的最小内核：
`TaskGoal { objective, phase: active|paused|blocked|complete, taskId }`（**不含回合计数**：唯一权威 = `dive.roundsInStage`，2026-10-10 收敛裁定）
+ `transitionGoal()` 纯状态机。命名隔离为 `TaskGoal`（不与宿主 goal / 本会话 goal 工具混淆）。
禁 import 任何 pm 包实现模块、`@deepseek-ai/*`、node I/O。

### FR-2 · 阶段目标（L1）持久化进需求台账

需求记录新增 `goals[]`：`StageGoal { stage, statement, doneCriteria[], state }`，每主阶段一条。
持久化纪律沿用本仓口径：台账唯一真相、幂等写、变更走纯函数 transition（对齐
`domain/dive/transition.ts` 单一来源纪律）、进 `RequirementFacts` 投影的只许有界标量
（goal 的 statement 不进城，只带 `doneCount/totalCount` 这类计数；缺失 ≠ 0）。

### FR-3 · L2 与任务卡的挂载关系

任务卡开工 → 建 TaskGoal（判据复用卡片 `acceptance`，D-1 待裁确认）；卡完成 → goal complete；
中断 → paused + 原因。一拍只投一张 ready 子卡（实施链串行），"当前 goal = 当前在跑卡的 goal"
天然成立；切卡时先 complete/pause 旧 goal 再建新 goal。

### FR-4 · 驱动权唯一：goal 状态降级为判据

`round-driver.drive()` 在 humanGate 之后、起轮之前新增一道判据：`goalPhaseFor(taskId)`。
goal 内核**不得**订阅 `agent/status`、不得持有投递端口。测试断言：goal=active +
humanGate.open=true ⇒ 不起轮。

### FR-5 · round-driver 依赖反转（瘦身）

> 已实施（2026-10-10）：三处实现 import（queue-access / rearm / diag-log）→ 本地等价 + `diag`/`rearm` 端口；
> 白名单守卫见 `pm-round-driver/tests/round-driver-imports.test.ts`。


现状 12+ 处硬 import（rearm / interruption / upstream-failure / transition / queue-access /
RequirementSummary / Predicates / diag-log 等）逐一下沉：实现逻辑留 pm-core，driver 侧只留
端口接口与纯数据契约。已端口化的判据（humanGate/chainBudget/dialogInFlight/providerLatch）
保持不动作为范例。目标：driver 文件对 `pm-core/**` 的 import 只剩 type-only 与纯函数模块。

### FR-6 · 人工门纪律保持

goal 的 active 语义不等于"无脑续跑"：五道人工门（代码级 human_gate）优先于 goal 判据；
goal complete 不自动迁移需求/任务状态，只使需求"具备收口条件"（`readyToClose()` 为真），
迁移仍走既有 `reqboard_move` 人工门路径。

### FR-8 · 阶段目标完成 → 唤醒下一节点弹框

StageGoal 落章 done 后，**下一阶段的人工门框必须在有限拍内被人看到**。不新造弹框机制：
落章 → `requirementMoved` 通知（既有订阅桥）→ 下一 idle 拍 `gate-prompt` 门状态投影发现
新阶段的门该开 → 主动弹框（复用既有三件套：`gate-prompt` 有边界重弹 / `awaiting-confirm`
在途停手位 / `pending-confirm` 作答后唤醒）。goal 内核零依赖纪律不破——弹框不在
`domain/goal/` 内，全靠事件 + 门投影传导。终段特判：最后一个 StageGoal done ⇒
`readyToClose()=true`，弹**收口确认门**而非下一阶段门。验收：StageGoal 落章后下一个
idle 拍内弹出新阶段门框（复用 gate-prompt 测试 harness 断言），且弹框在途时自动链停手。

### FR-7 · 持久化纪律

goal 相关写入：幂等（同值重写零写入）、乐观锁 revision、台账评论留痕（goal 建立/达成/
放弃各一条）；driver 的 `DriverState` 维持内存态不落盘（既有纪律，本需求不破坏）。

## 实施状态（2026-10-10）

P1–P4 已完成（内核独立成包 + 判据接线 + 台账/投影/读写 + 生产接线），
`tool-pm-goal` 已落包未接线；FR-8 弹框联动与卡生命周期自动钩子待做。
详见 `design/architecture.md` §6.1/§6.2（含三处落点修正与存量红声明）。

## 非目标（本需求不做）

- 不改 dsh 宿主 goal 本身；不删除宿主 goal-round-driver（pm 窗口不启用它即可）。
- 不做 goal 的 UI 看板面（后续需求）。
- 不迁移存量需求的历史数据（goals[] 缺省缺失 = 未启用，老需求行为逐字不变）。
- 不改五道人工门的任何判定逻辑。

## 风险与对冲

| 风险 | 对冲 |
|---|---|
| 复制 = 分叉，宿主 goal 演进不跟进 | 内核仅 4 phase + 计数，漂移风险极低；头注如实声明复制源与日期 |
| 依赖反转触动面大（12+ 处 import） | 分阶段收编，每阶段回归零新增为门禁；已端口化判据作为模板 |
| 第二份真相（goal 状态 vs 任务卡状态） | D-1 复用 acceptance；goal 达成位由任务状态机**派生**而非独立维护 |
| pm 插件故障期手工建档与台账脱节 | 本文档头注声明；插件恢复后第一件事补登记并回填 REQ id 引用 |

## 验收材料（届时提交）

- 新增测试清单与全绿输出；反向演练红/绿证据
- `git diff --stat` 摘要；round-driver.ts 行数前后对比；import 清单前后对比
- 本文件「判定标准」1–7 逐条证据
