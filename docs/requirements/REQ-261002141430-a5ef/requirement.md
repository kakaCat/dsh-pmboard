---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 需求说明（REQ-261002141430-a5ef）

> 面向：产品、开发、测试、用户——**写给人看**。核心原则：用户能看懂。
> **人读三件套**：TL;DR + ASCII 业务流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格，禁 ①②③ 内联枚举；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：**feature**（立项弹框所答；实质是行为缺口修复，改判见文末「待人工裁定」） ｜ 档位：**重档**（依据见文末「档位依据」） ｜ 立项：2026-10-02
> 窗口：`session-0dc94a2a-9c00-455b-ac58-f96624a21da2` ｜ 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

PM 弹框在途时，插件只拦了**写工具**（4 个），没有拦**自动链**：挂起确认一登记，agent 立刻继续跑、Dive 立刻起下一轮，屏幕上的框还等着人点。

结果是三件事同时发生：人在看框、agent 在产出、它的下一次写被 `REQBOARD_CONFIRM_PENDING` 打回——**空转烧回合，还会提前吃掉阶段回合上限**（`round-limit` 一到，需求自己停下来）。

本需求按用户裁定补齐：**有人工门禁弹框在途 → 自动链停手等人；作答到达 → 自动解除并续跑；没有弹框时一律不停**（非门禁自动流程照常跑完）。停手位必须落台账、可观测、不得被既有自动恢复路径抹掉，也不得把需求变成"没人叫醒"的静默停摆。

## 人工裁定（原话，2026-10-02 本窗口对话）

> 「我希望的人工门禁 agent 停止等用户确认，非门禁的时候自动完成任务，除非需要人来介入选择方向」

据此定下三条口径，本文全部 FR 由此推得：

| 情形 | 期望 | 本文落点 |
|---|---|---|
| 人工门禁弹框在途（等人裁决） | 自动链**停手**，等确认 | FR-1 / FR-2 |
| 人作答了 | **自动**续跑，不需要人再说"继续" | FR-3 |
| 没有弹框（非门禁自动流程） | **不停**，自动完成 | FR-1（假分支）+ FR-6 反向自检 |
| 需要人介入选方向 | 停（同"门禁在途"处理） | FR-5（投递前先停手） |

## 业务流程图

```
   agent 跑一轮 / Dive 起一轮
        │
        ▼
  ① 弹框投递（提交产物后的自动确认 / agent 调 ask_confirm / Dive 人工门框）
        │
        ├── 宽限内作答 ──► 同步落章 ──► 续跑 ✅（旧语义，本需求不改）
        │
        └── 超宽限 ──► 登记 ticket、立即返回 pending=true
                 │        └── 只拦写工具（4 个），**自动链一无所知**
                 ▼
  ② 修前状态：人看框 + agent 继续投回合 + 下一轮写被 REQBOARD_CONFIRM_PENDING 拒绝 ❌
                 │                                     └── 空转烧回合 → 撞阶段上限 → 需求自停
                 ▼
  ③ 本需求目标态：弹框在途 ⇒ 停手位落台账（不投下一回合 / 不派下一张牌）
                 │             └── 人可见：谁在等、等什么、怎么恢复
                 ▼
  ④ 作答到达（肯定 / 否定 / 需修改）或看板确认或 ticket 过期
                 │
                 ▼
  ⑤ 解除停手位（幂等 + 留痕）──► 回到停手前状态并自动续跑 ✅
                                   └── 不需要人再打一句"继续"
```

## 现状证据（可复核）

| # | 事实 | 取证点 |
|---|---|---|
| 1 | 挂起确认**立即返回**，只登记 ticket，不写任何自动化状态 | `src/application/internal/pending-confirm.ts:106-117`（`suspendConfirm`） |
| 2 | 停手守卫只拦 4 个写工具，`reqboard_status` / `reqboard_confirm_receipt` 刻意不在列 | `src/application/internal/pending-guard.ts:27-32` |
| 3 | 回合投递准入 `readyToDrive` **不看**"本窗口有没有在途弹框" | `src/application/dive/round-driver.ts:109-112` |
| 4 | 可驱动判据只看 activation + driverHealth，停手位有天然落点 | `src/application/dive/round-state.ts:165-175`（`isDrivableRequirement`） |
| 5 | **同一 idle 拍里**弹框与起轮相邻：先弹人工门框，返回后立刻 `requestDrive` | `src/application/dive/session-driver.ts:320`（弹框）→ `:440`（起轮） |
| 6 | 提交产物后 fire-and-forget 弹框，只给 2 秒宽限 → 超时即走非阻塞挂起 | `src/application/internal/auto-confirm.ts:17`、`src/application/use-cases/SubmitArtifact.ts:160` |
| 7 | agent 侧显式带宽限的 `reqboard_ask_confirm` 走同一条非阻塞路 | `src/application/use-cases/AskConfirm.ts:197-207` |
| 8 | 作答后的"唤醒窗口"目前是**空实现**（预留接缝） | `src/application/internal/pending-confirm.ts:120-128`（`wake()` 函数体只有注释） |
| 9 | 实施期有"自动恢复"会自行置 `autoRun=true`——它会与"因弹框而停"打架 | `src/application/dive/round-driver.ts:266-289` |
| 10 | 实施链由 `autoRun` 门控（停链 = 置 false + 暂停原因） | `src/application/use-cases/AdvanceChain.ts:292`（`not_autorun`） |
| 11 | `rearmIfRecoverable` 把**任何** `driverHealth=paused` 当可恢复（看板「继续」会调用它） | `src/application/internal/rearm.ts:34,46` |
| 12 | `wake-heartbeat` 跳过不可驱动需求（停手位不会被心跳复位） | `src/application/dive/wake-heartbeat.ts:66` |
| 13 | 启动迁移对未盖章记录一律复位 `driverHealth=healthy` | `src/application/internal/migrate-dive-state.ts:71-73` |

复核命令：

- `grep -n "readyToDrive\|competingQueued" src/application/dive/round-driver.ts` —— 准入判据里没有任何"在途弹框"项（修前）
- `grep -rn "livePendingConfirm" src/application/dive src/application/use-cases/AdvanceChain.ts` —— 修前零输出：停手判据根本没进自动链

## 产品定义

| 问题 | 答案 |
|---|---|
| 这个能力是什么 | 把"有弹框在等人作答"这件事**接进自动链的准入判据**：在途即停手，作答即续跑 |
| 谁需要它 | 驾驶 reqboard 的 agent（少空转烧回合）、看板前的人（看得到"它在等人"）、维护者（停手/恢复语义单一源） |
| 对外契约 | ① 停手是**运行时可逆状态**，不是终态：不改 `activation`（人的意图）；② 停手期间自动链不产生新回合、不派新任务卡；③ 恢复**幂等**且必留痕；④ 无弹框时行为与改动前逐字一致 |
| 停手判据（单一源） | 本窗口存在**等待人作答的确认门弹框**：阻塞等待中，或已挂起 ticket（未作答 / 未过期 / 台账未落章）。挂起部分复用既有 `livePendingConfirm` |
| 失败语义 | 停手位写失败 → 响亮告警 + 留痕，**不得**静默降级成"继续跑"；恢复路径失败同理 |
| 本次改什么 | 停手位定义与落库、四条恢复出口、三条既有自动恢复路径的让位、Dive 门框投递前先停手、回归用例 |
| 本次不改什么 | 弹框交互与文案、落章/推进语义、`activation` 语义、写工具守卫名单、非门禁自动流程的推进速度 |

## 用户与角色

| 角色 | 关心什么 | 本次改动带来的变化 |
|---|---|---|
| 驾驶 reqboard 的 agent（主用户） | 弹框在途时我该不该继续干 | 停手期间不再被投回合，不再拿"写被拒"当日志；作答后自动拿到续跑回合 |
| 看板前的人 | 它到底是在跑还是在等人 | 停手原因进台账 comment（谁在等、等什么）；徽标复用既有「已暂停」（不新增文案） |
| 插件维护者 | 停手会不会变成新的静默停摆源 | 四条恢复出口 + 过期兜底 + 反向用例（过期必须恢复），"停了没人叫醒"被用例挡住 |

## 功能点

- **FR-1: 有待作答的人工门禁弹框在途时自动链停手，没有弹框时一律不停**——判据单一源：本窗口存在等待人作答的确认门弹框（阻塞等待中，或挂起 ticket 未作答/未过期/台账未落章）。为真 ⇒ ① Dive 不投递下一回合；② 实施链不派发下一张任务卡。为假 ⇒ 行为与改动前**逐字一致**：该跑就跑完，不因本条变慢，也不因本条多弹一次框。
- **FR-2: 停手位落台账、可观测、不改人的意图**——停手时必须写结构化状态（`dive.driverHealth.state='paused'` + 结构化 reason 前缀，如 `awaiting-confirm:<ticket>`；实施期同时置 `advance.pausedReason` 并保留停手前的 `autoRun` 原值）并追加一条台账 comment：在等谁、等什么、怎么恢复。`dive.activation` **一字不改**（沿用 REQ-261001213924-1441 FR-5 纪律）；看板不新增文案（复用既有「已暂停」徽标）。
- **FR-3: 作答到达即自动解除停手并续跑，不需要人再说"继续"**——解除出口四条：弹框作答（肯定 / 否定 / 需修改）、看板确认、人显式取消、ticket 过期。解除必须**幂等**（重复解除零写入）、**必留痕**，并**回到停手前状态**（停手前 `autoRun=true` 则恢复 true；停手前为 false 不得被本条恢复成 true）。落点：`pending-confirm.ts` 现有 `wake()` 空实现就是这条的接缝，不得只写注释。
- **FR-4: 停手位不得被既有自动恢复路径抹掉，也不得变成静默停摆**——① `rearmIfRecoverable` / `recoverHealth` 在"弹框仍在途"时不得清除停手位（不得把它当基础设施误停摆）；② `wake-heartbeat` 已天然跳过不可驱动需求，用例固化即可；③ 实施期自动恢复（`round-driver.ts:266-289`）在弹框在途时跳过；④ **反向兜底**：必须有周期性检查处理 ticket 过期（含进程重启后登记表已空），过期即恢复——停手位**不得**跨重启存活到"没人叫醒"。
- **FR-5: Dive 自弹人工门框与起轮不得同拍并存**——门框在**投递前**先写停手位，使同一 idle 拍的 `requestDrive` 不再投出下一回合；弹框通道不可用的**降级路径不得写停手位**（否则没有人在作答 = 永久停手）。
- **FR-6: 回归用例（修前必红）+ 反向自检**——至少五条断言：在途时不投回合/不派卡（修前红）；作答后自动续跑（修前红）；无弹框时自动流程照跑、回合投递次数与改动前一致（**反向自检**，守住"非门禁不停"）；「继续」/`rearm` 不得在弹框在途时清掉停手位（修前红）；ticket 过期后必须恢复（修前无此路径）。新增用例随 C-14/C-15 基线跑。

## 边界

| 类别 | 内容 |
|---|---|
| 做 | FR-1…FR-6；改动面集中在 `src/application/dive/`（round-driver、session-driver/gate-prompt、round-state）、`src/application/internal/`（pending-confirm、pending-guard、rearm、auto-confirm）、`src/application/use-cases/`（AskConfirm、AdvanceChain 的准入判定）、新增回归用例 |
| 不做 | ① **不改弹框通道与交互**：`questions.ask` 的调用形状、选项文案、题干长度纪律一律不动；② **不改落章/推进语义**：`applyConfirmDecision`、`confirm-settle` 的产物章与阶段推进不动；③ **不改 `activation` 语义与写守卫名单**：立项仍置 armed、`reqboard_clear_pause` 仍是唯一 operator 解锁口；被拦的仍只有那 4 个写工具 |
| 不做（续） | ④ **不改看板渲染与文案**：不加新徽标/新面板（复用既有「已暂停」+ 台账 comment）；若需专门文案另立项；⑤ **不把 capture 五问 / accept_sheet 的阻塞弹框纳入判据**：这两条路径期间 agent 在工具内等待（不满足投递前提），本需求不为它们新增登记；若实测发现阻塞期间 status 会转 idle（=`readyToDrive` 成立），当场升级并回补本条；⑥ 不顺手改阶段上限（`maxRounds`）与回合计数语义 |

## 判定标准（可证伪）

判定标准挂可跑命令；仓库既有约定见 `reqboard_kb(kind='standard')` 的 C-14（测试与基线比对）、C-15（改动文件零类型错误）、C-11（发版前构建）。

| # | 判定 | 命令 / 观察点 | 修前 | 修后 |
|---|---|---|---|---|
| D1 | 弹框在途时不投回合、不派卡 | `npx vitest run tests/dialog-inflight-stop.test.ts` | **红**（照投） | 绿 |
| D2 | 作答到达后自动续跑，无需人再说"继续" | 同上用例：作答 → 断言续跑被触发且停手位已清 | **红**（`wake()` 空实现） | 绿 |
| D3 | **非门禁不停**（反向自检） | 同上用例：无弹框 → 回合投递次数/派卡数与改动前基线一致 | 绿（守住） | 绿（不得回归） |
| D4 | 停手位不被 `rearm`/看板「继续」在弹框在途时清掉 | 同上用例 + `npx vitest run tests/dive-rearm.test.ts` | **红**（任何 paused 都可恢复） | 绿 |
| D5 | ticket 过期即恢复，不产生静默停摆 | 同上用例：推进时钟越过 TTL → 断言恢复 | **红**（无此路径） | 绿 |
| D6 | 改动文件零类型错误（C-15） | `pnpm typecheck 2>&1 \| grep -E "round-driver\|pending-confirm\|rearm\|gate-prompt"` | — | 0 条 |
| D7 | 全量测试不高于基线（C-14） | `pnpm test`：失败数 ≤ 基线 106，且新增用例全绿 | — | 通过 |
| D8 | 端到端（人工，需 `pnpm build` 后重载插件，C-11） | 在 armed 需求上提交产物、**不点**弹框 → 观察 agent 停手（起轮不再发生、`reqboard_status` 写明在等确认）；随后点「确认」→ 无需额外输入即自动续跑 | 照跑（空转撞上限） | 停手 → 确认后自动续跑 |

## 档位依据（重档）

- **不是单点改动**：停手位要在**四个消费面**同时成立——回合投递准入、实施链派卡准入、Dive 自弹门框的投递时序、以及作答/过期两条恢复路径；任一面漏掉都会表现为"看起来停了其实在跑"或"停了没人叫醒"。
- **有第二个未定决策**：回收语义（哪些既有自动恢复路径必须让位、过期兜底谁来做、停手位是否跨重启存活）。按轻档的单向升级纪律，出现第二个未定决策即升级为重档——**已升级，不回退**。
- **要动状态机语义**：新增"因等人而暂停"这一种 `driverHealth` 原因及其恢复契约，与 REQ-261001213924-1441 FR-5「只有人能改写 activation」并存而不冲突。
- **回归风险高**：9 处既有代码依赖"paused 即可恢复"或"autoRun=false 就自动恢复"的弱判据，改动后必须靠反向用例守住"非门禁不停"。

## 待人工裁定（确认时请一并给意见）

- **类型是否维持 feature**：本次实质是行为缺口修复（bug 的文档集：复现步骤 / 根因 / 回归，比 feature 的产品定义 + 5 份设计文档更贴）。立项弹框所答为 feature，本文已按 feature 必填节撰写；**改类型是人的决定，agent 不自行改**。
- **停手位是否跨插件重启存活**：本文取"不存活"（重启后按无在途记录恢复，宁可再生一次空转，也不要永久静默停摆）。若你更希望"重启后仍停着等人"，请在确认时说明——这会改变 FR-4 ④ 与启动迁移（`migrate-dive-state.ts:71-73`）的口径。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t3、t6 |
| FR-2 | ✅ 已接收 | t1、t4、t7 |
| FR-3 | ✅ 已接收 | t1、t6、t4、t5 |
| FR-4 | ✅ 已接收 | t6、t7、t5 |
| FR-5 | ✅ 已接收 | t6、t4 |
| FR-6 | ✅ 已接收 | t6、t7 |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
