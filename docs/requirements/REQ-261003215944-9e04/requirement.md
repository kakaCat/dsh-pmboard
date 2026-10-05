---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# DSH 会话分支驱动的 agent 自主立项与多窗口绑定

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**重档**（依据见文末「档位依据与单向升级」） ｜ 立项：2026-10-03
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 立项依据：本窗口已完成两路只读侦察（pmboard 绑定模型 + DSH 会话能力），全部结论带 file:line。

## TL;DR

一句话：**用 DSH 现成的会话分支（fork）给 pmboard 造"新窗口"，并把「一个需求 = 一个独占窗口」换成「一个需求 = 一个 owner + 若干席位」。**

今天有三处卡点，被折叠成了同一件事：

- 一个窗口只能有一条在飞需求（第二条连立项都立不了）；
- 一条需求只能绑一个窗口（`sourceSessionId` 单值，读取端 16 处 `bound[0]` 再折叠一次）；
- agent 想"自己开一个立项窗口"没有任何机械手段（只能靠人手动开新会话）。

**本需求做三件事**：`reqboard_open_window`（fork 开窗）、席位模型（一需求多窗口）、本窗口多项目共存。

**外加一件（用户追加裁定）**：把 Dive 的**状态转化 + 回合计数重置**收敛成一个封装方法，并让**推进弹框等**入口直接调它（FR-9 / FR-10）。

**不做两件事**：**不放宽 G0 立项门与 G3 计划批准门**（agent 只做文书、拍板永远归人）；不做 GUI 并列窗口（DSH 无此能力）。

## 现状 → 目标

```
 现状（一需求 = 一个独占窗口）              目标（一需求 = owner + 席位；窗口可被 fork 出来）

 窗口A ──绑定──▶ REQ-1                     窗口A(owner) ──┬──▶ REQ-1
   │                                                        ├─ 窗口B(worker)
   └─ 立第二条 REQ-2 ✘                                      
      REQBOARD_WINDOW_BOUND                窗口A ──fork──▶ 窗口C ──▶ REQ-2（C 当 owner）
      （CaptureRequirement.ts:121-124）      （sessionController.fork，新 session = 新 windowKey）

 agent 想开新窗口 ✘                         agent 调 reqboard_open_window → 侧栏出现新会话
 （无任何入口）                               + 自署 kind 投递底稿（人仍在新窗口拍板）
```

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 fork 开窗可用 | 在已绑定需求的窗口调 `reqboard_open_window({ mode:'fork' })` | 返回新 `windowKey`（`session-<uuid>`）；该会话出现在侧栏且 `parentSession` 指向源窗口；返回文案**不含**「已打开新窗口」 |
| A2 席位可加 | 对已有 owner 的需求调 `reqboard_bind({ role:'worker' })` | `<dshHome>/reqboard/requirements/<REQ>/record.json` 出现第二条 `seats`；原 owner 不变；`reqboard_status` 列出两个席位 |
| A3 授权按席位 | worker 席位依次调 `reqboard_task_move`（自己的卡）与 `reqboard_move`（推进阶段） | 前者通过；后者以 `human_gate` / 越权码拒绝；owner 席位两者都通过 |
| A4 本窗口可立第二项 | 已绑定在飞需求时调 `reqboard_capture` | **不再**返回 `REQBOARD_WINDOW_BOUND`；返回「本窗口第二个项目」或「已交给新窗口当 owner」两条分支之一 |
| A5 自主回合仍不许立项 | 在 fork 出的新窗口里，以**无** `source.kind==='user'` 的回合调 `reqboard_capture`；随后人在该窗口说一句话再调 | 前者 `REQBOARD_DIRECT_HUMAN_REQUIRED`；后者成功立项（G0 未被伸缩） |
| A6 计划仍要人批 | 计划已提交但未批准时调 `reqboard_decompose` | 仍 `REQBOARD_PLAN_NOT_APPROVED`；人在看板/弹框批准后同一调用成功 |
| A7 不冒充人类 | 开窗与跨窗口投递产生的全部 `user/message` 事件 | `source.kind` 全部为自署值（如 `reqboard-open-window`），**全文无** `kind:'user'`；`grep -rn "sessionController.prompt" src/` 零命中 |
| A8 存量零回归 | 对 39 条存量需求读 `reqboard_status` / 任务树，跑一遍既有套件 | 席位折算为单 owner（`sourceSessionId` 原值）、不写盘；`pnpm test` 与基线一致 |
| A9 dive 写入只有一处 | `grep -rn "roundsInStage *= *0" src/` 与 `grep -rn "activation *= *'" src/` | 除迁移模块（唯一豁免）外，**只命中封装方法本身**——今天两条 grep 分别命中 5 处与 6 处（含 `rollback.ts:72`） |
| A10 推进弹框走同一方法 | 在 `driverHealth=paused`（`reason` 以 `round-limit` 开头）时，人对推进弹框作答确认 | 落章推进后 `roundsInStage` 归零、`driverHealth` 复位 `healthy`，且 `activation` **未被改写**；确认前后各调一次 `reqboard_status` 可对照 |
| A11 不越权改意图 | 人主动 `reqboard_clear_pause`（`activation=disarmed` + `phase=idle`）后，再走推进弹框确认 | `activation` 仍为 `disarmed`（推进弹框**不得**代人选"继续"）；留痕 `createdBy.kind` 分别是 `agent` 与 `human`，可区分 |
| A12 读根与会话同源 | `curl -s http://127.0.0.1:19387/dashboard/api/reqboard/state` | 返回的 `workspaceRoot` **等于会话工作区**（不是插件宿主 cwd `~/.dsh/profiles/<profile>`） |
| A13 非需求目录文档可打开 | `curl -s -X POST …/docs/resolve -d '{"paths":["README.md","docs/knowledge/INDEX.md","docs/handoff/multi-window-collaboration-draft.md"]}'` | 三条**全部** `openable:true`（今天三条全 `not_found`）；随后右侧栏打开 `README.md` 渲染出正文，不出现「文件不存在，可能已被移动或删除」 |
| A14 新需求立即可打开 | 新建一条需求并立即点其「需求文档」 | 首次点击即打开（不依赖"再刷一次看板"），右侧栏不报 `workspace-file/not-found` |

## 边界

1. **做**：`reqboard_open_window`（fork/create 开窗 + 自署 kind 投递 + 登记席位）、席位模型 `seats: WindowSeat[]` 与按席位授权、本窗口多项目共存（`REQBOARD_WINDOW_BOUND` 从"拒绝"改为"选择"）、**Dive 状态转化与回合重置的单一封装方法（FR-9）及其在推进弹框/看板继续等入口的接线（FR-10）**、**文档读路径根与会话同源（FR-11，现场报入的附带缺陷）**。
2. **不做**：**不放宽任何人工门**——G0（`requireDirectHuman`）与 G3（`planApproved`）保持原样，agent 只提供文书与开窗，"拍板"永远归人。取消人工门需另立 ADR 由人裁定，**不在本需求内**。
3. **不做**：不做 GUI 并列窗口（DSH 无 per-session URL、无 Host→Client 导航推送，只能建会话 + 当前页切过去）；不启用 `agentTeams` / `schedule`（本机未装载，改 profile 属基础设施变更，单独立项）；不做按卡租约与孤儿跨窗口回收（另立一期）。

## 产品定义

`dsh-pmboard` 今天的协作模型是**独占**：一个窗口对一条需求，同一窗口立第二条直接 `REQBOARD_WINDOW_BOUND`（`src/application/use-cases/CaptureRequirement.ts:121-124`）。

本需求把它换成**席位制 + 可分支**：

- 一条需求有一个 **owner**（推进阶段、把关闸门）与若干 **worker/observer**（领卡干活、只读跟随）；
- agent 可以用 **DSH 现成的会话 fork** 造出一个新窗口（不是自己造会话协议），把新项目或长任务交过去；
- 新窗口**天然是未绑定的**——因为 pmboard 的 `windowKey` 就是 root agent 的 id、也就是 session id（`src/adapters/SessionProbeAdapter.ts:79-85`）。

与现状的区别：不再需要"手动开新会话 + 重新描述一遍背景"；与"直接放开人工门"的区别：**门一道都不动**，只是把 agent 能做的部分（开窗、起草、投递、登记）做全。

## 用户与角色

| 角色 | 今天的痛 | 本需求后拿到的 |
|------|----------|----------------|
| 提需求的人 | 窗口被一条需求占住，第二条立项被拒 | 一个窗口可多项目；或让 agent 开一个新窗口当 owner |
| 想让长任务不占当前窗口的人 | `executorHint='fresh-window'` 只是一句文案，无机械保障 | `reqboard_open_window` 真的建会话并投底稿 |
| 并行推进的人 | 同一需求只有一条驱动链，第二个窗口是"外人" | 多席位合力；worker 可领卡干活、汇报 |
| 批准人（人） | —— | 人工门一道不少：G0/G3 仍由人拍板，只是文书由 agent 备好 |

## 功能点

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | agent 调 `reqboard_open_window` 后，DSH 建出一个新会话，人看到侧栏多了一个可打开的新窗口 | P0 |
| FR-2 | 需求可加席位：owner 调 `reqboard_bind` 后，台账出现第二个席位，`reqboard_status` 列出全部席位 | P0 |
| FR-3 | 授权按席位判定：worker 能推自己的卡、不能推阶段；owner 两者皆可 | P0 |
| FR-4 | 已绑定需求的窗口再立项时，人可在"本窗口第二个项目"与"交给新窗口当 owner"之间选择，不再被拒 | P0 |
| FR-5 | agent 在新窗口预填立项底稿，人只在新窗口点一次确认；无人工回合时仍拒绝自主立项 | P1 |
| FR-6 | agent 在新窗口预写拆分计划，人一键批准；未批准时 `reqboard_decompose` 仍被拒 | P1 |
| FR-7 | 跨窗口投递一律自署 `source.kind` 并留痕，任何路径都不会冒充人类消息 | P0 |
| FR-8 | 开窗能力缺失或降级时不撒谎：明确告知"会话已创建，请到侧栏打开" | P0 |
| FR-9 | Dive 状态转化与回合计数重置收敛成一个封装好的方法，全仓只此一处写 `dive.*` | P0 |
| FR-10 | 推进弹框（确认→落章→推进）与看板「继续」等入口直接调这个封装方法，不再各自为零散写入 | P0 |
| FR-11 | 看板与右侧栏打开工作区文档不再报「文件不存在」：读路径根统一为会话工作区（附带缺陷，现场报入） | P0 |

### FR-1: 用 DSH 会话分支开一个新窗口

**详细说明**：
- **使用场景**：agent 判定「这条新工作该由一个新窗口当 owner」时（或用户说"开个新窗口做这个"）。
- **操作流程**：
  1. agent 调 `reqboard_open_window({ mode:'fork', atSeq? })`；`mode:'create'` 走全新空会话。
  2. pmboard 调 host 侧 `ctx.sessionController.fork({ sessionId, atSeq? })` → 新 `session-<uuid>`；`create` 走 `ctx.sessionController.create({ cwd, workspaceId, agentPreset })`。
  3. 返回新 `windowKey`；会话出现在侧栏（不承诺"已打开"）。
- **边界条件**：
  - 源会话无已完成回合 → `fork` 抛 `session/fork-unavailable`，pmboard 映射为 `REQBOARD_OPEN_WINDOW_UNAVAILABLE` 并提示改用 `mode:'create'`。
  - 冷会话（`agents.get()` 返回 undefined）不阻塞建窗，只影响后续投递（见 FR-7）。

**证据锚点**：`packages/api/session-controller/src/commands.ts:221-304`（fork 全流程）、`index.ts:414-416`（`@Remote('fork')`）、`types.ts:285-296`（create）、`types.ts:321-330`（SessionForkRequest/Value）。

**验收标准**：
1. 调 `reqboard_open_window({ mode:'fork' })` → 返回 `windowKey` 以 `session-` 开头，且该 id ≠ 源窗口。
2. 读该会话 header → `parentSession` = 源窗口 id；`inheritedEventCount` > 0。
3. 侧栏出现新会话条目（人工确认）。
4. 返回文案 grep「已打开」→ 零命中。

### FR-2: 席位模型与 reqboard_bind

**详细说明**：
- **数据形态**：`RequirementRecord` 新增可选 `seats?: WindowSeat[]`；`sourceSessionId` **保留为 owner 的锚点**，不动 39 条存量。
- **操作流程**：
  1. owner 调 `reqboard_bind({ role:'worker' })` → 追加席位（`windowKey` 缺省 = 调用窗口）。
  2. `reqboard_bind({ role, windowKey, remove:true })` 解绑；owner 席位不可被解绑（只能换绑）。
  3. `reqboard_status` 返回 `seats[]`。
- **边界条件**：同一 `windowKey` 重复加入幂等；owner 之外的席位加满上限（建议 8）后 `REQBOARD_SEAT_LIMIT`。

**验收标准**：
1. 加 worker 后 `record.json` 的 `seats` 长度为 2，owner 项逐字未变。
2. 解绑 worker 后长度回落为 1；再解绑 owner → `REQBOARD_INVALID_INPUT`。
3. `reqboard_status.seats` 与 `record.json` 一致（不是只在返回体里）。

### FR-3: 授权按席位判定（收敛 16 处 bound[0]）

**详细说明**：
- 把 `src/application/internal/window.ts` 的 `isWindowBound` / `openRequirementsFor` 升级为 `seatsOf(ledger, req)` / `canWrite(seat, action)`。
- `src/application/internal/binding-read.ts:39 boundSummariesOf` 与全仓 **16 处 `bound[0]`** 一并改造为按席位取用。
- 复用既有范式：`src/application/use-cases/ReportTask.ts:57-64 ownsTeamTask`（团队 Worker 早已按"身份 + 卡归属"授权）。

**验收标准**：
1. worker 席位调 `reqboard_task_move` 推自己的卡 → 通过；推别人的卡 → 拒绝。
2. worker 席位调 `reqboard_move`（阶段推进）→ `human_gate` / 越权码拒绝。
3. `grep -rn "bound\[0\]" src/` → 零命中（或全部改为有语义的命名取值）。

### FR-4: 本窗口多项目共存

**详细说明**：
- `REQBOARD_WINDOW_BOUND` 从"拒绝"改为"选择"：`reqboard_capture` 增加 `onWindowBound: 'second' | 'handoff'`。
  - `second`：本窗口作为第二条需求的 owner（席位模型允许）。
  - `handoff`：先 `reqboard_open_window` 再在新窗口立项，原窗口只留指针。
- **边界条件**：缺省行为需明确定义（建议缺省 = `second`，与 A4 一致），并写进节点纪律。

**验收标准**：
1. 已绑定需求时调 `reqboard_capture({ onWindowBound:'second' })` → `success:true` 且新需求 `sourceSessionId` = 本窗口。
2. `handoff` 分支 → 返回新 `windowKey`，且新需求落在新窗口名下。

### FR-5: 自主预立项（不破 G0）

**详细说明**：
- agent 在新窗口写入立项底稿（写进台账的 draft 或 `docs/handoff/*.md`），人在该窗口点一次确认即完成立项。
- **`requireDirectHuman` 一行都不放宽**：`src/adapters/SessionProbeAdapter.ts:115-141` 保持不变。
- 这个 FR 的价值是"把文书工作做全"，不是"绕过人"——写进文档以免实施时被误读为放宽门禁。

**验收标准**：
1. A5 的两条分支行为符合预期（无人工回合 → 拒；有 → 过）。
2. 底稿文件在 fork 出的新窗口可见（同一 workspace）。

### FR-6: 自主预拆分（不破 G3）

**详细说明**：
- agent 在新窗口把 `decomposition.md` 与任务表写好并 `reqboard_submit(kind=plan)`；人一键批准。
- **`planApproved` 一行都不放宽**：`src/application/use-cases/Decompose.ts:96` + `src/shared/protocol.ts:828` 保持不变。

**验收标准**：
1. A6 两条分支符合预期。
2. 提交返回体含任务表与 `overCapacity`（沿用既有拆分纪律）。

### FR-7: 跨窗口投递自署 kind + 留痕

**详细说明**：
- 投递用 `ctx.sessionController.resolveAgent(windowKey)`（**冷会话可 resume**）→ 自署 `source.kind`（如 `reqboard-open-window`）→ `agent.followup`（唤醒）或 `inject`（静默）。
- **红线**：禁止使用 `sessionController.prompt`；它无条件把消息标成 `{kind:'user'}`（`packages/api/session-controller/src/commands.ts:331-336`），会让本能力变成绕过 goal 与 pmboard 全部人工门的后门。
- 今天 pmboard 的真断点：`src/adapters/AgentDeliverer.ts:81-83` 用 `agents.get()`，对冷会话返回 `undefined`，于是只会说"窗口不在线"——本 FR 负责修掉它。

**验收标准**：
1. 对一个已冷却的会话席位投递 → resume 成功、起一个回合、`source.kind` = 自署值。
2. `grep -rn "sessionController.prompt" src/` → 零命中（可写进测试断言）。

### FR-8: 诚实降级与提示

**详细说明**：
- 开窗只做到"建会话 + 提示去侧栏打开 + 本页可切换"（client 侧 `src/client/session-jump.ts:110-120` 已有 `uiWorkspace.openSession` 用法）。
- 开窗协议不可用（无 `sessionController` 服务 / 降级环境）→ 明确返回 `fallback` 语义，不伪造"已开窗"。

**验收标准**：
1. 返回文案与节点纪律都写明"会话已创建，请在侧栏打开（本页可切换）"。
2. 服务缺失时返回结构化降级信息，`success:false` 且 reason 可读。

### FR-9: Dive 状态转化与回合计数重置收敛成一个封装方法

**功能描述**（用户裁定原文）：*"dive 状态转化和重置循环次数的一个方法给"*。

**详细说明**：
- **为什么要它**：今天"改 `dive.*`"这件事散在**八处**，各写一份，规则靠注释口口相传：

  | 写入点 | 写什么 |
  |---|---|
  | `src/application/internal/support.ts:629-632` | 立项置 `armed` + `roundsInStage:0` |
  | `src/application/use-cases/ClearPause.ts:74-83` | 人主动 `disarmed` + `phase:'idle'` + 清 `pausedReason` |
  | `src/application/internal/rearm.ts:67-77`（`recoverHealth`） | 运行时暂停 → `healthy`；`round-limit*` → 归零 |
  | `src/application/internal/rearm.ts:116-129`（`armExplicit`） | 人显式继续：`armed` + `phase:'active'` + 清 `pausedReason` + 归零 |
  | `src/application/internal/token-usage.ts:293-300` | 阶段变了 → `roundsInStage=0` + `driverHealth.attempts=0` |
  | `src/application/dive/round-driver.ts:209` | 准入计数：`roundsInStage = attempt.round` |
  | `src/application/internal/rollback.ts:72`（`resetInjectionAfterRollback`） | **需求回退时解除自动链**：`activation='disarmed'` + 清 `pausedReason` |
  | `src/application/internal/migrate-dive-state.ts:49-82` | 存量迁移归零（**唯一豁免**，只跑一次） |

  `recoverHealth` 与 `armExplicit` 就是两份同规则的手抄 —— 本次要消灭的正是这种"两处各看一套"。
  **第 7 处（rollback）另带一个待裁定问题**：回退可由 agent 经 `reqboard_move` 触发
  （见 `docs/architecture/requirement-rollback.md`「agent 明知需求描述不对也退不回去」），
  而 `activation` 按纪律只有人能改写（`src/shared/protocol.ts:1056`）。本需求的做法是
  **保留回退即解除自动链的既有不变量，但把归因显式化**（事件 `disarm-rollback` 记录 actor），
  是否进一步收紧为"人才能触发回退"留待人裁定（见设计文档决策点）。

- **做成什么**：域层纯函数 `transitionDive(prev, input)`（`src/domain/dive/` 下，零 import 外层，遵守 C-01），
  入参是**事件**而不是散装赋值：

  ```ts
  type DiveEvent =
    | 'arm'              // 立项：activation=armed, roundsInStage=0
    | 'disarm-manual'    // 人主动 clear_pause：disarmed + phase=idle
    | 'disarm-rollback'  // 需求回退：disarmed + 清 pausedReason（保留既有不变量，归因记 actor）
    | 'pause-runtime'    // 驱动失败/达上限：只写 driverHealth，绝不改 activation
    | 'recover-auto'     // 自动恢复：清运行时暂停；round-limit* 才归零
    | 'arm-explicit'     // 人显式「继续」：唯一可把 disarmed 改回 armed 的事件
    | 'advance-stage'    // 阶段推进：roundsInStage=0 + attempts=0
    | 'confirm-advance'  // 推进弹框落章后（FR-10）
  ```

- **返回值就是"要不要写盘 + 留什么痕"**：`{ changed, next, comment }`；`changed=false` 时调用方零写入（幂等写在纯函数里，不是散在 mutate 内）。
- **留痕人机可辨**：`comment.createdBy.kind` 由事件决定（`arm-explicit` = `human`，`recover-auto` = `system`，其余按调用方）。

**验收标准**：
1. 七处写入点里，除迁移模块外**全部改为调用它**（A9 的两条 grep 作证）。
2. 同一事件在同一状态下重复调用 → `changed=false`，台账字节不变。
3. 纯函数单测覆盖 7 事件 × 关键状态组合（含"事件对当前状态非法 → 零写入"）。

### FR-10: 推进弹框等入口直接调用这个封装方法

**功能描述**（用户裁定原文）：*"推进弹框等需要改动，这样可以直接用这个封装好的方法"*。

**详细说明**：
- **使用场景**：人在推进弹框（`reqboard_ask_confirm` 的落章+推进、看板确认按钮）上确认后，需求该继续自动续跑。
- **今天的问题**：确认/推进路径里**没有任何 dive 处理**（`src/application/use-cases/AskConfirm.ts`、`ConfirmArtifact.ts`、`src/application/gate/*` 全零命中），
  续跑只能等 `round-driver.ts:407` 那一拍 `requirement-moved` 去补 —— 于是出现"人工门确认后不自动续跑"的观感。
- **改法**：确认推进后按事件调 FR-9 的方法：
  - 阶段变了 → `advance-stage`（归零 + attempts=0）；
  - 同阶段、`driverHealth=paused` → `recover-auto`（复位 `healthy`；`reason` 以 `round-limit` 开头才归零）。
- **红线（不许顺手做的事）**：`confirm-advance` **不得**改写 `activation`。把 `disarmed` 改回 `armed` 只有人能发起（`arm-explicit`，看板「继续」）。
  推进弹框是"确认这道门的产物"，不是"我同意自动跑"。
- **保留既有越权守卫**：弹框在途判据 `dialogInFlight`（`src/application/internal/rearm.ts:64`）语义不变。

**验收标准**：
1. A10：`round-limit` 暂停下确认推进 → 归零 + `healthy`，`activation` 未变。
2. A11：`disarmed+idle` 下确认推进 → 仍 `disarmed`；看板「继续」才转 `armed`。
3. 全部入口的留痕 `createdBy.kind` 可区分人/系统。

### FR-11: 文档读路径根与会话同源（现场报入的附带缺陷）

**功能描述**（用户裁定原文）：*"需求文档不能查看文件不存在，可能已被移动或删除　添加到本次需求里"*。

**现象**：在看板 / 右侧栏打开工作区文档时，DSH 文档预览报 **「文件不存在，可能已被移动或删除」**
（该文案对应 `workspace-file/not-found`，见 DSH `packages/client/ui-sidebar-documentpreview/src/client/locales.ts:27`）。

**已实测的根因（两条命令级证据）**：

| # | 命令 | 实测结果 |
|---|------|----------|
| 1 | `curl -s http://127.0.0.1:19387/dashboard/api/reqboard/state` | `data.workspaceRoot = /Users/mac/.dsh/profiles/desktop`（**插件宿主 cwd**）；而同一条需求的 `data.requirements[].workspaceRoot = /Users/mac/Documents/ai/dsh/dsh-pmboard`（**会话工作区**） |
| 2 | `POST …/docs/resolve` 传三条 | `docs/requirements/REQ-261003215944-9e04/requirement.md` → `openable:true`；`README.md` / `docs/knowledge/INDEX.md` / `docs/handoff/multi-window-collaboration-draft.md` → **全部 `not_found`** |

**机理**：服务端读根取自 `src/http/routers/artifacts.ts:54` 的 `resolve(ctx.deps.cwd ?? process.cwd())`，
即**插件宿主的工作目录**，而不是发起阅读的会话工作区。只有 `docs/requirements/<REQ>/…` 因为
**需求级 workspaceRoot 回退**（`artifacts.ts:114-126`）才被救回来 —— 所以"需求目录内的文档能开、目录外的一律判不存在"。
客户端同源：`src/client/open-doc.ts:68-77` 的 `absolutizeDocPath` 在没有需求段时回落到
`cachedWorkspaceRoot`（就是上表那个错误根），于是**把错的绝对路径交给右侧栏**，预览必然 `not-found`。

**诚实边界（未能复现的部分要写明）**：本需求文档自身那条路径，服务端判定是 `openable:true`（靠需求级回退），
故本次**没有**直接复现"点需求文档必炸"；能证明的是——**除需求目录外的所有工作区文档都打不开**，
且客户端在"需求段缺失"或"看板状态快照尚未收录该需求"时使用同一个错误根（A14 覆盖该时序）。

**修法（单一权威源）**：
- 服务端：读根改为**会话/需求工作区**（`state` 显式给出 `sessionWorkspaceRoot`，或由会话 id 取 header cwd），
  不再拿 `process.cwd()` 兜底；保留需求级回退作为第二跳而非唯一跳。
- 客户端：`absolutizeDocPath` 在无需求段时用**会话根**；**打开与预检必须同一个 classify**（禁止两套口径）。
- 诚实降级：取不到任何根时，**不要**拼一个必然不存在的绝对路径——按相对路径交出去并给出诊断。

**验收标准**：
1. A12：`state.workspaceRoot` == 会话工作区。
2. A13：三条非需求目录文档全部 `openable:true`，且右侧栏能渲染出 `README.md` 正文。
3. A14：新建需求后**第一次**点「需求文档」即打开成功。

## 接口（对外入口）

| 入口 | 输入 | 输出 | 错误语义 |
|------|------|------|----------|
| `reqboard_open_window` | `{ mode:'fork'\|'create', atSeq?, title?, seed? }` | `{ success, windowKey, parentSessionId?, degradedNote }` | 无源会话/无完成回合 → `REQBOARD_OPEN_WINDOW_UNAVAILABLE`；通道不可用 → `fallback=board`（不伪造立项/开窗） |
| `reqboard_bind` | `{ role:'worker'\|'observer', windowKey?, remove? }` | `{ success, seats[] }` | 非法 role / 跨需求 / 解绑 owner → `REQBOARD_INVALID_INPUT`；超上限 → `REQBOARD_SEAT_LIMIT` |
| `reqboard_capture` | 新增 `onWindowBound?: 'second'\|'handoff'` | 既有 + 分支结果 | 其余错误语义不变；**不再**因本窗口已绑定而报 `REQBOARD_WINDOW_BOUND` |
| `reqboard_status` | 无 | 新增 `seats[]` | 无 |

### 内部单一写入口（FR-9，不给 Agent 暴露工具）

| 入口 | 位置 | 输入 | 输出 | 约束 |
|------|------|------|------|------|
| `transitionDive` | `src/domain/dive/transition.ts`（纯函数） | `(prev: RequirementDive, { event: DiveEvent, now, reason?, actor })` | `{ changed, next, comment? }` | 零 import 外层；非法事件 → `changed:false` 零写入 |
| `applyDiveTransition` | application 层用例 | `(deps, requirementId, event, opts)` | `{ changed }` | 幂等、永不抛、留痕；弹框在途时 `confirm-advance`/`recover-auto` 不写 |

**不新增 Agent 工具**：改"人的意图"（`activation`）只有人能发起，agent 侧零入口（沿用 `rearm.ts:105` 的既有纪律）。

## 数据契约

```ts
/** 需求席位（FR-2）：一条需求可以有多个窗口参与；owner 唯一。 */
export interface WindowSeat {
  /** 席位窗口（= root agent id = session id） */
  windowKey: string
  role: 'owner' | 'worker' | 'observer'
  joinedAt: string
  /** 最近一次活动（用于展示；不影响授权） */
  lastSeenAt?: string
}

// RequirementRecord 新增（全链可缺省）
seats?: WindowSeat[]
```

- **折算规则（读取端）**：`seats` 缺省时折算为 `[{ windowKey: sourceSessionId, role:'owner' }]`；**不落盘、不迁移**。
- **不 bump schemaVersion**：维持 `REQBOARD_SCHEMA_VERSION = 9`（`src/shared/protocol.ts:1384`），新增字段全部可缺省。

## 迁移与兼容

- 存量 39 条需求：`seats` 无值 → 读端折算为单 owner；`sourceSessionId` 原值不动，`record.json` 不被改写。
- 旧调用方：`reqboard_capture` 不传 `onWindowBound` 时走缺省分支，行为需在实施时钉死（建议 `second`）。
- 回滚路径：删除 `seats` 读取折算即回到现状；新增字段可缺省，回滚不需要数据迁移。

## 验收（怎么跑）

```bash
# 1. 类型与层边界
pnpm typecheck
# 期望：退出码 0；src/domain 仍零 import 外层

# 2. 单元/集成（含新增用例）
pnpm test
# 期望：全绿；新增 open-window / seats / 授权 / 自署 kind 用例在场

# 3. 构建门禁（host + client 都动）
pnpm build
# 期望：退出码 0；dist/ 与 lib/client.js 都有新产物

# 4. 知识层门禁（若改了知识层）
pnpm kb:check
# 期望：退出码 0

# 5. dive 写入收敛（FR-9 的机械作证）
grep -rn "roundsInStage *= *0" src/ | grep -v migrate-dive-state
# 期望：只命中 src/domain/dive/transition.ts 与它的单测（修前命中 5 处）
grep -rn "activation *= *'" src/ | grep -v migrate-dive-state
# 期望：同上——修前命中 6 处（含 rollback.ts:72），全部改为调用封装方法

# 6. 文档读根（FR-11）
curl -s http://127.0.0.1:19387/dashboard/api/reqboard/state | grep -o '"workspaceRoot":"[^"]*"'
# 期望：等于会话工作区（不是 ~/.dsh/profiles/<profile>）
curl -s -X POST http://127.0.0.1:19387/dashboard/api/reqboard/docs/resolve \
  -H 'content-type: application/json' -d '{"paths":["README.md","docs/knowledge/INDEX.md"]}'
# 期望：两条 openable:true（今天两条都 not_found）
```

端到端（人工观察）：

1. 窗口 A 绑定 REQ-X；调 `reqboard_open_window` → 侧栏出现新会话 B。
2. 在 B 里说话并 `reqboard_capture` → 立项成功，B 成为新需求 owner；A 仍是 REQ-X owner。
3. 对 REQ-X 调 `reqboard_bind({role:'worker'})`（在 B 的窗口）→ A 的 `reqboard_status` 列出两个席位。
4. B 以 worker 身份推 REQ-X 的一张卡 → 通过；推 REQ-X 的阶段 → 拒绝。

## 红线

1. **人工门永不伸缩**：G0（`requireDirectHuman`）、G3（`planApproved`）本需求一行不改；要改需另立 ADR 由人裁定。
2. **不自署 `source.kind` 就不许跨窗口投递**；`sessionController.prompt` 全仓禁用（`commands.ts:331-336` 会把消息标成 `kind:'user'`）。
3. **诚实降级**：造不出并列窗口就直说，不许宣称"已打开新窗口"。

## 档位依据与单向升级

- 走**重档**的依据：本需求要**改数据模型**（新增 `seats`）、**要动架构**（授权判定从"窗口绑定"改为"席位授权"，牵动 15 个用例与 16 处 `bound[0]`），两条都命中 L3 的升级信号。
- 单向升级：实施中若再出现"要不要放开某道人工门"这类新决策点，**停下升级**，不得就地决定。

## 批准闸门

下一步：design（只写设计文档）—— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入。

## 修订记录

| 时间 | 来源 | 改了什么 |
|------|------|----------|
| 2026-10-03 | 立项（本窗口侦察） | 初版：FR-1..FR-8（fork 开窗 / 席位 / 本窗口多项目 / 自主预立项与预拆分不破门 / 自署 kind / 诚实降级） |
| 2026-10-03 | **人工门反馈（未确认）**：*"dive 状态转化和重置循环次数的一个方法给，推进弹框等需要改动，这样可以直接用这个封装好的方法"* | 新增 **FR-9**（`transitionDive` 单一封装：状态转化 + 回合计数重置，收敛七处散写）、**FR-10**（推进弹框/看板继续等入口直接调用它）；补 A9–A11 断言、内部单一写入口表、验收 grep；边界明确"不新增 Agent 工具、`activation` 仍只由人改写" |
| 2026-10-03 | **人工门反馈（未确认）**：*"需求文档不能查看文件不存在，可能已被移动或删除　添加到本次需求里"* | 新增 **FR-11**（附带缺陷：读路径根须与会话同源）；补 A12–A14 断言；写清两条命令级证据、机理（`artifacts.ts:54` 用插件宿主 cwd）与诚实边界（未能复现"点需求文档必炸"，能证的是非需求目录文档全灭 + 客户端同源错根） |
| 2026-10-03 | 设计阶段的机械核查（`grep` 实测） | FR-9 的写入点由**七处**订正为**八处**：补 `src/application/internal/rollback.ts:72`（需求回退解除自动链）；新增事件 `disarm-rollback`；A9 补上"修前 grep 命中 5 处 / 6 处"的基线读数；并如实标出「回退可由 agent 触发」与「activation 只有人能改」之间的待裁定张力 |

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t4 |
| FR-2 | ✅ 已接收 | t1、t3 |
| FR-3 | ✅ 已接收 | t3、t2 |
| FR-4 | ✅ 已接收 | t6 |
| FR-5 | ✅ 已接收 | t7 |
| FR-6 | ✅ 已接收 | t7 |
| FR-7 | ✅ 已接收 | t5 |
| FR-8 | ✅ 已接收 | t4 |
| FR-9 | ✅ 已接收 | t8、t9、t10 |
| FR-10 | ✅ 已接收 | t11 |
| FR-11 | ✅ 已接收 | t12、t13 |

> 无未接收条款（11 条全部有落点）。

<!-- reqboard:marks:end -->
