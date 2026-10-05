---
req: REQ-261003215944-9e04
doc: test-cases
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
---

# 测试用例设计 · 十四条断言怎么跑、看到什么算过（REQ-261003215944-9e04）

> **TL;DR**：原则**修前必红、修后必绿**。分三层：域层纯函数单测（`transitionDive`，零 IO）、
> 接线与门禁集成（真用例 + 假台账 + stub 会话服务）、命令行与人工观察（两条 curl + 侧栏肉眼）。
> A1–A14 每条至少一个用例；**修前不红的用例不算证据**（写进验收材料时要逐条交代）。

## 断言与用例对照（A1–A14 全覆盖） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

requirement.md 的 A1–A14 与本文用例的对应关系（**断言不因设计细化而放宽**）：

| 断言 | 量法（要求原文摘要） | 用例 | 层次 |
|---|---|---|---|
| A1 fork 开窗可用 | 返回新 `windowKey`；`parentSession` 指向源；文案不含「已打开」 | TC-1, TC-2, TC-5 | 集成 + 手工 |
| A2 席位可加 | `record.json.seats` 出现第二条；owner 不变；`status` 列两个 | TC-6 | 集成 |
| A3 授权按席位 | worker 推自己的卡通过；推阶段被拒；owner 两者皆过 | TC-8, TC-9 | 集成 |
| A4 本窗口可立第二项 | 不再 `REQBOARD_WINDOW_BOUND`；`second`/`handoff` 两分支之一 | TC-11, TC-12 | 集成 |
| A5 自主回合仍不许立项 | 无 `source.kind==='user'` → 拒；人说一句 → 过 | TC-13 | 集成 |
| A6 计划仍要人批 | 未批准 → `REQBOARD_PLAN_NOT_APPROVED`；批准后同调用成功 | TC-14 | 集成 |
| A7 不冒充人类 | 自署 `source.kind`；`grep sessionController.prompt` 零命中 | TC-3, TC-4 | 单测 + 静态 |
| A8 存量零回归 | 52 条折算单 owner、不写盘；`pnpm test` 与基线一致 | TC-34, TC-35, TC-36 | 集成 + 全量 |
| A9 dive 写入只有一处 | 两条 grep 只命中封装方法与它的单测 | TC-16 | 静态 |
| A10 推进弹框走同一方法 | 归零 + `healthy`，`activation` 未被改写 | TC-23, TC-26 | 单测 + 集成 |
| A11 不越权改意图 | 确认后仍 `disarmed`；留痕人机可辨 | TC-27, TC-28, TC-29 | 集成 |
| A12 读根与会话同源 | `state.workspaceRoot` == 会话工作区 | TC-30 | 集成 + 手工 |
| A13 非需求目录文档可打开 | 三条全 `openable:true`；右侧栏渲染正文 | TC-31, TC-33 | 集成 + 手工 |
| A14 新需求立即可打开 | 首次点击即开，不依赖再刷看板 | TC-32 | 集成 + 手工 |

## 开窗与会话分支用例 TC-1–TC-5 `serves: FR-1, FR-7, FR-8`

**测试目标**：`reqboard_open_window` 造出真会话、投递自署 kind、能力缺失时不撒谎。
夹具照 `tests/agent-deliverer.test.ts` 与 `tests/ask-confirm.test.ts` 的手法：假 store + stub 会话服务。

| 编号 | 对应 FR | 断言 | 前置 | 操作 | 期望 | 层次 |
|---|---|---|---|---|---|---|
| TC-1 | FR-1 | A1 | 窗口 A 已绑定 REQ-X 且至少一个已完成回合；stub `sessionController.fork` 返回 `session-b` | 在 A 调 `reqboard_open_window({ mode:'fork' })` | `success:true`；`windowKey` 以 `session-` 开头且 ≠ A；`parentSessionId === A`；落地一条席位 owner 记录（FR-2 接口） | 集成 |
| TC-2 | FR-1, FR-8 | A1 | 源会话**无**已完成回合，`fork` 抛 `session/fork-unavailable` | 同一调用；再以 `{ mode:'create' }` 重试 | 第一次 `code === 'REQBOARD_OPEN_WINDOW_UNAVAILABLE'` 且提示改用 `create`；第二次成功返回新 `windowKey`；两次返回文案 grep `已打开` **零命中** | 集成 |
| TC-3 | FR-7 | A7 | 目标会话已冷却（`agents.get()` 返回 `undefined`），stub `resolveAgent` 可 resume | 调内部投递（`resolveAgent` + `followup`）向该席位送底稿 | resume 成功；起一个回合；产生的 `user/message` 事件 `source.kind` 为自署值（如 `reqboard-open-window`），**全文无** `kind:'user'` | 集成 |
| TC-4 | FR-7 | A7 | 仓库工作树 | `grep -rn "sessionController.prompt" src/` | **零命中**（同一条断言写进测试：读 `src/**` 文本，命中即 fail——防止后续有人"顺手"用它唤醒窗口） | 单测（静态） |
| TC-5 | FR-8 | A1 | 未装配 `ctx.sessionController`（降级环境） | 调 `reqboard_open_window` | `success:false`；返回结构化降级信息（`fallback` 语义 + 可读 reason）；**不伪造**窗口、不发"已开窗"文案；台账零新增席位 | 单测 |

**反向证伪**：把 TC-3 的自署 `source.kind` 改成 `'user'` → TC-3 必红；这就是 FR-7 要挡的那条后门。

## 席位模型与按席位授权用例 TC-6–TC-10 `serves: FR-2, FR-3`

**测试目标**：`seats: WindowSeat[]` 的增删与授权判定（收敛 16 处 `bound[0]` 之后的行为）。
授权用例必须**先越权、再正权**成对出现，只测其一不算覆盖。

| 编号 | 对应 FR | 断言 | 前置 | 操作 | 期望 | 层次 |
|---|---|---|---|---|---|---|
| TC-6 | FR-2 | A2 | REQ-X 已有 owner = 窗口 A；真 `JsonLedgerRepository` | 在 B 调 `reqboard_bind({ role:'worker' })`；再在 A 调 `reqboard_status()` | `<dshHome>/reqboard/requirements/REQ-X/record.json` 的 `seats` 长度为 2；owner 项**逐字未变**；`status.seats` 与文件一致（不是只在返回体里） | 集成 |
| TC-7 | FR-2 | A2 | 同 TC-6 | ① 重复 `bind` 同一 `windowKey`；② 解绑 worker；③ 解绑 owner；④ 加到第 9 个席位 | ① 幂等，`seats` 长度仍 2；② 回落为 1；③ `REQBOARD_INVALID_INPUT`（owner 不可解绑）；④ `REQBOARD_SEAT_LIMIT` | 单测 |
| TC-8 | FR-3 | A3 | B 是 REQ-X 的 worker 席位；REQ-X 有卡 t-1、t-2，t-1 由 B 认领 | B 调 `reqboard_task_move({ task_id:'t-1', to:'in_progress' })`；再调 t-2 | 前者通过（`success:true`）；后者拒绝且**不得** `success:true`（任务越权码；现状同形拒绝为 `REQBOARD_NOT_BOUND_TO_WINDOW`，席位模型下须有等价码） | 集成 |
| TC-9 | FR-3 | A3 | 同 TC-8；另有窗口 A 是 owner | ① B 调 `reqboard_move`（推进阶段）；② A 调 `reqboard_move` 同一目标；③ A 调 `reqboard_task_move` 推 t-1 | ① 拒绝，`code === 'human_gate'` 或席位越权码（实施时钉住其一，测试写 `expect(code).toBe(X)`）；② 通过（owner 有阶段权）；③ 通过 | 集成 |
| TC-10 | FR-3 | A3 | 全仓工作树 | `grep -rn "bound\[0\]" src/`；再对 16 处逐点跑既有用例 | 零命中（或全部改为有语义的命名取值）；`boundSummariesOf` 升级为 `seatsOf` / `canWrite(seat, action)` 后既有 `reqboard_move`/`submit`/`ask_confirm` 用例全绿 | 单测（静态）+ 集成 |

**越权矩阵必须包含的负例**：observer 席位调 `reqboard_task_move` → 拒绝；非本需求窗口调 `reqboard_bind` → `REQBOARD_INVALID_INPUT`。

## 本窗口多项目共存与自主预立项/预拆分用例 TC-11–TC-15 `serves: FR-4, FR-5, FR-6`

**测试目标**：`REQBOARD_WINDOW_BOUND` 从"拒绝"变"选择"；G0/G3 两道门**一行不放宽**。

| 编号 | 对应 FR | 断言 | 前置 | 操作 | 期望 | 层次 |
|---|---|---|---|---|---|---|
| TC-11 | FR-4 | A4 | 窗口 A 已绑定在飞 REQ-X | A 调 `reqboard_capture({ onWindowBound:'second' })` 并完成四问 | **不再**返回 `REQBOARD_WINDOW_BOUND`；`success:true`；新需求 `sourceSessionId === A`；A 的 `reqboard_status` 同时列出两条 | 集成 |
| TC-12 | FR-4 | A4 | 同 TC-11 | A 调 `reqboard_capture({ onWindowBound:'handoff' })` | 先建新窗口；返回新 `windowKey`；新需求落在新窗口名下（新席位 owner = 新窗口），A 只留指针；A 不再是该需求席位 | 集成 |
| TC-13 | FR-5 | A5 | 在 fork 出的新窗口里，构造一个**无** `source.kind==='user'` 的自主回合 | ① 该回合调 `reqboard_capture`；② 随后人在该窗口说一句话、再调一次 | ① `REQBOARD_DIRECT_HUMAN_REQUIRED`（**G0 未伸缩**）；② 成功立项。`src/adapters/SessionProbeAdapter.ts:115-141` 的 diff **零改动** | 集成 |
| TC-14 | FR-6 | A6 | 计划已 `reqboard_submit(kind=plan)` 但未批准 | ① 调 `reqboard_decompose`；② 人经看板/弹框批准后同一调用 | ① `REQBOARD_PLAN_NOT_APPROVED`；② 成功落库任务卡。`Decompose.ts:96` 与 `protocol.ts:828` 的 `planApproved` 判据 diff 零改动；返回体含任务表与 `overCapacity` | 集成 |
| TC-15 | FR-5, FR-6 | A5, A6 | 新窗口与源窗口同 workspace | 在 fork 出的新窗口读 `docs/handoff/*.md` 底稿与 `docs/requirements/<REQ>/decomposition.md` | 底稿可见（同一 workspace，无额外挂载）；`requireDirectHuman` / `planApproved` 两处源码在本次 diff 中**未被放宽**（静态断言：对两文件做行级比对，出现放宽即 fail） | 单测（静态） |

## Dive 单一封装 `transitionDive` 用例 TC-16–TC-25 `serves: FR-9`

**测试目标**：域层纯函数 `src/domain/dive/transition.ts` 的 7 个事件 × 关键状态组合；
入参是**事件**不是散装赋值；`changed=false` ⇒ 调用方零写入。

```
  事件 → 纯函数 → { changed, next, comment? }
  arm / disarm-manual / pause-runtime / recover-auto
  / arm-explicit / advance-stage / confirm-advance
  非法事件（对当前状态不适用）→ changed:false（幂等写在纯函数里）
```

八处写入点（FR-9 的收敛对象，迁移模块是唯一豁免）：

| 写入点 | 现写什么 | 目标事件 |
|---|---|---|
| `src/application/internal/support.ts:629-632` | 立项置 armed + `roundsInStage:0` | `arm` |
| `src/application/use-cases/ClearPause.ts:74-83` | 人主动 disarmed + `phase:'idle'` + 清 `pausedReason` | `disarm-manual` |
| `src/application/dive/round-driver.ts:144-160` | 运行时故障**只写 `driverHealth`** | `pause-runtime` |
| `src/application/internal/rearm.ts:67-77`（`recoverHealth`） | 运行时暂停 → healthy；`round-limit*` → 归零 | `recover-auto` |
| `src/application/internal/rearm.ts:116-129`（`armExplicit`） | 人显式继续：armed + active + 清 pausedReason + 归零 | `arm-explicit` |
| `src/application/internal/token-usage.ts:293-300` | 阶段变了 → `roundsInStage=0` + `attempts=0` | `advance-stage` |
| `src/application/dive/round-driver.ts:209`（`persistAdmission`） | 准入计数 `roundsInStage = attempt.round` | `advance-stage` 之外的**准入**语义（见 TC-22b） |
| `src/application/internal/rollback.ts:72`（`resetInjectionAfterRollback`） | 回退后 `activation='disarmed'` + 清 `pausedReason` | `disarm-rollback`（设计期补入的第 8 个事件，见 TC-22c） |

| 编号 | 对应 FR | 断言 | 前置 | 操作 | 期望 | 层次 |
|---|---|---|---|---|---|---|
| TC-16 | FR-9 | A9 | 工作树 | `grep -rn "roundsInStage *= *0" src/ \| grep -v migrate-dive-state` 与 `grep -rn "activation *= *'" src/ \| grep -v migrate-dive-state` | 两条**只命中** `src/domain/dive/transition.ts` 与它的单测（`tests/dive-transition.test.ts`）；`migrate-dive-state.ts` 是唯一豁免 | 单测（静态） |
| TC-17 | FR-9 | A9 | `prev = { activation:'disarmed', phase:'idle', roundsInStage:5 }` 等组合 | `transitionDive(prev, { event:'arm' })` | `activation==='armed'`、`phase==='active'`、`roundsInStage===0`、`lastActiveAt` 被写；`changed:true` | 单测 |
| TC-18 | FR-9 | A9 | `prev = { activation:'armed', phase:'active', roundsInStage:3, pausedReason:'x' }` | `{ event:'disarm-manual' }` | `activation==='disarmed'`、`phase==='idle'`、`pausedReason===undefined`；`roundsInStage` 语义在测试里钉死（现状 `ClearPause` 不动它——不得顺手改语义） | 单测 |
| TC-19 | FR-9 | A9 | `prev.activation==='armed'`、`driverHealth` 健康 | `{ event:'pause-runtime', reason:'deliver-failed' }` | **只写** `driverHealth.state='paused'` + `reason` + `attempts+1`；`activation` **逐字不变**（这是 FR-9 的核心不变量，专设一条断言） | 单测 |
| TC-20 | FR-9 | A9 | ① `driverHealth.reason='round-limit(brainstorming:3)'`；② `reason='deliver-failed'`；③ `activation='disarmed' && phase==='idle'`（人按过 clear_pause） | 各调 `{ event:'recover-auto' }` | ① 复位 `healthy` **且** `roundsInStage=0`、`attempts=0`；② 复位 `healthy` 但 `roundsInStage` **不变**；③ `changed:false` **零写入**（人主动暂停永不被自动路径改写） | 单测 |
| TC-21 | FR-9 | A9 | `activation='disarmed' && phase='idle'`（人按过 clear_pause） | `{ event:'arm-explicit' }` | `armed` + `phase='active'` + 清 `pausedReason`；`round-limit*` 时归零；**唯一**能把 disarmed 改回 armed 的事件（其余事件在 `disarmed` 上的组合见 TC-24） | 单测 |
| TC-22 | FR-9 | A9 | 阶段确实变了（brainstorming → design），`driverHealth.attempts=2` | `{ event:'advance-stage' }` | `roundsInStage=0` + `driverHealth.attempts=0`；`activation` 不动；阶段没变时（同状态重放）`changed:false` | 单测 |
| TC-22b | FR-9, FR-10 | A9 | 准入语义：`roundsInStage=0`、`attempt.round=1` | 走 `round-driver` 的 `persistAdmission` 路径 | 仍**恰好一次**写成 1；第二次同 round 重放零写入（准入计数不得被"归零"语义误伤——`round-driver.ts:209` 的 `>=` 守卫保留） | 集成 |
| TC-22c | FR-9 | A9 | 需求回退（`reqboard_move(to=更早阶段)` 与看板 POST 两条路径各一次） | 触发回退 → 走 `disarm-rollback` 事件 | `activation='disarmed'`、`pausedReason` 清空、`roundsInStage` 不动；`comment.createdBy.kind` **如实**为 `human`（看板）/ `agent`（工具）；回退不变量 ④ 与产物撤销行为零回归 | 集成 |
| TC-23 | FR-9 | A10 | ① 阶段变了 + `driverHealth=paused(round-limit*)`；② 同阶段 + `driverHealth=paused(round-limit*)`；③ `activation='disarmed'` | 各调 `{ event:'confirm-advance' }` | ① 按 `advance-stage` 归零 + `attempts=0`；② 按 `recover-auto` 复位 `healthy` **并**归零；③ **`activation` 保持 `disarmed`**（红线：确认推进不得代人选"继续"） | 单测 |
| TC-24 | FR-9 | A9 | 非法事件矩阵：`disarm-manual` on 已 disarmed+idle；`arm-explicit` on 已 armed+healthy；`advance-stage` on 阶段未变；`pause-runtime` on `dive===undefined`；`disarm-rollback` on 已 disarmed；未知 event 字符串 | 逐个调用 | 全部 `changed:false`；`next` 与 `prev` 结构相等；**台账字节不变**（`store.snapshot()` 前后 `JSON.stringify` 相等） | 单测 |
| TC-25 | FR-9 | A9 | 任取 TC-17–TC-23 的合法输入 | 同一事件在同一 `prev` 上**连调两次** | 第二次 `changed:false`（幂等写在纯函数里，不是散在 mutate 内）；`comment` 不重复生成 | 单测 |

**留痕口径（必须在 TC-17–TC-25 里钉住，不许漂移）**：`arm-explicit` → `createdBy.kind==='human'`；
`recover-auto` → `'system'`；`disarm-rollback` → **按调用方**（看板 = `human`，`reqboard_move` = `agent`，见 TC-22c）；
其余按调用方传入（`arm` = 立项 agent；`pause-runtime` = 驱动侧）。
`disarm-manual` 的 kind 沿用调用方现值（现状 `ClearPause` 写 `agent` + `sessionId`），**本次不顺手改**——
改了会与 A11 的"人机可辨"对照口径打架（见 TC-29）。

## 推进弹框与看板入口接线用例 TC-26–TC-29 `serves: FR-10`

**测试目标**：`reqboard_ask_confirm` 落章推进与看板「继续」**直接调** FR-9 的方法；红线两条。
夹具照 `tests/ask-confirm-blocking.test.ts` / `tests/dialog-inflight-stop.test.ts`。

| 编号 | 对应 FR | 断言 | 前置 | 操作 | 期望 | 层次 |
|---|---|---|---|---|---|---|
| TC-26 | FR-10 | A10 | `driverHealth=paused`、`reason` 以 `round-limit` 开头、`activation='armed'`；确认前先 `reqboard_status()` 存一份 | 人对推进弹框作答确认（落章 + 推进） | `roundsInStage` 归零、`driverHealth` 复位 `healthy`、`attempts=0`；`activation` **逐字未改**；确认后 `reqboard_status()` 与确认前对照，只有上述字段变 | 集成 |
| TC-27 | FR-10 | A11 | 人先调 `reqboard_clear_pause`（→ `activation='disarmed'`, `phase='idle'`） | ① 再走推进弹框确认；② 看板按「继续」 | ① `activation` 仍为 `disarmed`（**推进弹框不得代人选"继续"**）；② 只有「继续」把它转 `armed`（`arm-explicit`） | 集成 |
| TC-28 | FR-10 | A11 | `dialogInFlight(requirementId) === true`（弹框在途） | 走 `confirm-advance` 与 `recover-auto` 两条自动路径 | 两条**都零写入**（`src/application/internal/rearm.ts:64` 的既有守卫语义不变）；不出现"框还在屏幕上、链已经跑起来" | 集成 |
| TC-29 | FR-10 | A10, A11 | 同 TC-26 与 TC-27 | 读两次动作产生的台账 comment | 两条留痕 `createdBy.kind` **不相等、可区分**：`arm-explicit`（人按继续）为 `'human'`；确认推进路径按调用方（弹框发起方）。测试**钉住**映射表，任何漂移必红 | 单测 |

**接线静态断言**：`src/application/use-cases/AskConfirm.ts`、`src/application/use-cases/ConfirmArtifact.ts`、`src/application/gate/*`
修前对 `dive` **零命中**（本次已核实），修后必须出现对封装方法的调用、且**不得**出现对 `req.dive.*` 的直接赋值。

## 文档读路径根用例 TC-30–TC-33 `serves: FR-11`

**测试目标**：服务端读根与会话同源、客户端 `absolutizeDocPath` 不再用错根、打开与预检同一 classify。

| 编号 | 对应 FR | 断言 | 前置 | 操作 | 期望 | 层次 |
|---|---|---|---|---|---|---|
| TC-30 | FR-11 | A12 | 服务在 19387 端口运行；会话工作区 = `/Users/mac/Documents/ai/dsh/dsh-pmboard` | `curl -s http://127.0.0.1:19387/dashboard/api/reqboard/state \| grep -o '"workspaceRoot":"[^"]*"'` | 等于**会话工作区**，不是插件宿主 cwd `~/.dsh/profiles/<profile>`；`src/http/routers/stages.ts:103` 的 `deps.cwd ?? process.cwd()` 与 `artifacts.ts:54` 的同一兜底一并改为会话/需求根 | 集成 + 手工 |
| TC-31 | FR-11 | A13 | 同 TC-30 | `curl -s -X POST http://127.0.0.1:19387/dashboard/api/reqboard/docs/resolve -H 'content-type: application/json' -d '{"paths":["README.md","docs/knowledge/INDEX.md","docs/handoff/multi-window-collaboration-draft.md"]}'` | 三条**全部** `openable:true`（今天三条全 `not_found`）；`docs/requirements/<REQ>/requirement.md` 仍靠需求级回退可开（第二跳保留，不是唯一跳） | 集成 + 手工 |
| TC-32 | FR-11 | A14 | 新建一条需求，看板状态快照**尚未**收录它（"需求段缺失"时序） | 立即点该需求的「需求文档」 | **首次点击即打开**（不依赖"再刷一次看板"）；右侧栏不报 `workspace-file/not-found`；客户端此时用**会话根**而非错误根 | 集成 + 手工 |
| TC-33 | FR-11 | A13 | 客户端单测环境（`setDocWorkspaceContext` 已注入会话根 + 需求根表） | 对 `absolutizeDocPath` 传 ① `README.md`（无需求段）② `docs/requirements/REQ-X/a.md`（有需求段、表内有根）③ 表内无该需求 ④ 未注入任何根 | ① 用会话根拼；② 用需求根拼；③ 回落会话根；④ **原样返回相对路径**（不拼一个必然不存在的绝对路径）+ 诊断；且打开与预检走**同一个** classify（两套口径即 fail） | 单测 |

**人工观察补充**：右侧栏打开 `README.md` 要**渲染出正文**（不是空壳、不是错误卡），才算 A13 过。

## 存量兼容与零回归用例 TC-34–TC-36 `serves: FR-2, FR-3, FR-8, FR-9`

| 编号 | 对应 FR | 断言 | 前置 | 操作 | 期望 | 层次 |
|---|---|---|---|---|---|---|
| TC-34 | FR-2, FR-3 | A8 | 存量需求（`seats` 无值，2026-10-04 实测 52 条） | 逐条 `reqboard_status()` 与任务树；比对 `record.json` 字节 | 席位折算为单 owner（`windowKey = sourceSessionId`）；**不写盘**（文件 mtime 与内容逐字不变）；授权判定与今天一致 | 集成 |
| TC-35 | FR-2 | A8 | 同 TC-34 | 读 `REQBOARD_SCHEMA_VERSION` | 仍为 `9`（`src/shared/protocol.ts:1384`，**未 bump**）；新增字段全部可缺省 | 单测 |
| TC-36 | FR-1–FR-11 | A8 | 工作树 | `pnpm test` 与 `pnpm typecheck` | `pnpm test` 失败数与基线一致（新增用例全绿）；`pnpm typecheck` 退出码 0；`src/domain` 仍零 import 外层（层边界门禁） | 全量 |

## 自动化门禁与人工观察分工 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-9, FR-10, FR-11`

```bash
# ① 类型与层边界（transitionDive 必须零 import 外层）
pnpm typecheck                       # 期望：退出码 0

# ② 本次新增（与 requirement.md §验收 同名；文件名实施时可微调，语义不可少）
pnpm test -- tests/dive-transition.test.ts            # TC-17–TC-25
pnpm test -- tests/dive-confirm-advance.test.ts       # TC-23, TC-26–TC-29
pnpm test -- tests/open-window.test.ts tests/self-signed-kind.test.ts   # TC-1–TC-5
pnpm test -- tests/seat-model.test.ts tests/seat-authorization.test.ts  # TC-6–TC-10
pnpm test -- tests/window-bound-choice.test.ts tests/self-capture-gate.test.ts tests/plan-approval-gate.test.ts  # TC-11–TC-15
pnpm test -- tests/doc-read-root.test.ts tests/client-doc-root.test.ts  # TC-30–TC-33
pnpm test -- tests/seat-legacy-compat.test.ts         # TC-34–TC-35

# ③ dive 写入收敛（FR-9 的机械作证）
grep -rn "roundsInStage *= *0" src/ | grep -v migrate-dive-state
grep -rn "activation *= *'" src/ | grep -v migrate-dive-state
# 期望：只命中 src/domain/dive/transition.ts 与它的单测

# ④ FR-7 红线
grep -rn "sessionController.prompt" src/     # 期望：零命中

# ⑤ FR-3 收敛
grep -rn "bound\[0\]" src/                   # 期望：零命中

# ⑥ 全量回归
pnpm test                             # 期望：失败数不高于基线
```

**只能人看的**（自动化测不了，必须进验收材料的人工观察清单）：

1. 侧栏真的出现新会话条目，点进去是**新的**对话（不是当前窗口换了标题）。
2. 右侧栏打开 `README.md` 渲染出**正文**，无「文件不存在，可能已被移动或删除」。
3. 弹框在屏幕上时，链**没有**偷偷跑起来（TC-28 的肉眼版）。

## 覆盖度统计 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11`

| 需求条款 | 测试用例 | 覆盖状态 |
|---|---|---|
| FR-1 用 DSH 会话分支开新窗口 | TC-1, TC-2, TC-5 | ✅ |
| FR-2 席位模型与 `reqboard_bind` | TC-6, TC-7, TC-34, TC-35 | ✅ |
| FR-3 授权按席位判定 | TC-8, TC-9, TC-10, TC-34 | ✅ |
| FR-4 本窗口多项目共存 | TC-11, TC-12 | ✅ |
| FR-5 自主预立项（不破 G0） | TC-13, TC-15 | ✅ |
| FR-6 自主预拆分（不破 G3） | TC-14, TC-15 | ✅ |
| FR-7 跨窗口投递自署 kind | TC-3, TC-4 | ✅ |
| FR-8 诚实降级与提示 | TC-2, TC-5 | ✅ |
| FR-9 `transitionDive` 单一封装 | TC-16–TC-25（含 TC-22b/22c）, TC-36 | ✅ |
| FR-10 推进弹框等入口接线 | TC-26–TC-29 | ✅ |
| FR-11 读路径根与会话同源 | TC-30–TC-33 | ✅ |

**缺口与已知诚实边界**：A9 的 grep 会额外命中 `src/application/internal/rollback.ts:72`（回退后 disarm）——
它是第 8 个写 `activation` 的点，设计期已处置为事件 `disarm-rollback`（TC-22c）。
但**它带来一个未定决策**：回退可由 agent 经 `reqboard_move` 触发，而纪律说 `activation` 只有人能改
（`src/shared/protocol.ts:1056`）。本设计选"保留回退不变量 + 如实记 actor"，是否需要进一步收紧为"人才能触发回退"，
见 `architecture.md` 的「待裁定决策点」——**请在设计确认时一并裁定**。
