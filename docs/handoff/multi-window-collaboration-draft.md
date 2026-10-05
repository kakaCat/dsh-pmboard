# 交棒底稿：多窗口协作（席位 / 按卡租约 / 窗口间交棒）

> ## ⛔ 已作废（2026-10-04 核实）——勿据此开工
>
> 本能力**已由 `REQ-261003215944-9e04`《DSH 会话分支驱动的 agent 自主立项与多窗口绑定》交付中**：
> 26 张卡 **20 done / 6 todo**；`reqboard_open_window` 已在工具面注册且可用；席位契约
> （`WindowSeat` / `seatsOf`，`src/shared/protocol.ts:1184,1243` 与 `src/application/internal/window.ts:39`）已落盘。
> 本文件是 2026-10-02 本窗口**未先核对既有实现**就起草的重复设计，保留仅为留痕。
> **请以 `docs/requirements/REQ-261003215944-9e04/` 为准。**
>
> 真实缺口 = 该需求剩下的 6 张 todo 卡，尤其 `t-845a64`（新增 `reqboard_bind` 并让 `reqboard_status` 暴露席位）
> 与 `t-e56f9c`（让本窗口能接第二个项目）——这两张才是「项目可绑定多个窗口」的最后一公里。
>
> 本文仍具参考价值的部分：A1–A7 判定标准的写法；「红线：禁用 `sessionController.prompt`」的证据链
> （该红线已被 9e04 采纳，并实现为自署 kind `reqboard-open-window`）。

> **用途（原文，已过时）**：这是**待立项**的新需求底稿。写它的窗口（`session-5c6b1a8b-3234-4f35-b28f-1f1a20834721`）
> 因已绑定在飞需求 `REQ-261002175818-80a8`，被 `REQBOARD_WINDOW_BOUND` 拒绝立项第二条需求
> （`src/application/use-cases/CaptureRequirement.ts:122-124`，**弹框之前就拒**）。
> 请在**新会话窗口**里用它立项——**这本身就是该能力的"手动版"**。
>
> 立项建议值：名称《多窗口协作：需求席位、按卡租约与窗口间交棒》｜类型 `feature`｜难度 `expert`
>
> 起草时间：2026-10-02 ｜ 依据：两路只读侦察（本仓绑定模型 + DSH 会话能力），全部结论带 file:line。

## TL;DR

一句话：**把「一个需求 = 一个独占窗口」拆成「一个需求 = 一个 owner + 若干席位」，让多个窗口能合力/并行完成一个项目，并能把任务交给新会话。**

现场根因不是"谁改绑了谁"，而是三件事被折叠成了一件：

1. 绑定字段 `sourceSessionId` 是**单值**，而它自己的注释写着「窗口↔需求 **n:n** 的需求侧锚点」（`src/shared/protocol.ts:1177`）；
2. 写入端把 n:n 折叠成"同时最多一条 open"（`support.ts:596,644`），**且没有解绑/换绑/加席位任何入口**；
3. 读取端有 **16 处 `bound[0]`** 把多绑定折叠成"取第一条"。

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|---|---|---|
| A1 席位可加 | 对已有 owner 的需求调 `reqboard_bind(role='worker')` | 台账出现第二个席位；原 owner 不变；`reqboard_status` 列出两个席位 |
| A2 授权按席位 | worker 席位调 `reqboard_task_move`（自己的卡）/ `reqboard_move`（阶段推进） | 前者通过、后者以 `human_gate`/越权码拒绝；owner 两者都通过 |
| A3 本窗口可立第二项 | 已有在飞需求时调 `reqboard_capture` | **不再** `REQBOARD_WINDOW_BOUND`；返回"本窗口第二个项目"或"已交给新窗口当 owner"两条分支之一 |
| A4 冷窗口能被叫醒 | 对一个**已冷却**的会话席位调交棒 | `resolveAgent` 冷 resume 成功并起一个回合；投递消息 `source.kind ≠ 'user'` |
| A5 卡租约与孤儿回收 | 两个席位同时领取同一张卡；一个持卡后停心跳 | 只有一个拿到租约；超 `orphanTimeoutMs` 后另一席位可捡起；全程无重复执行证据 |
| A6 不冒充人类 | 交棒/信箱产生的全部 `user/message` 事件 | `source.kind` 全部为自署 kind（如 `reqboard-handoff`），**全文不含** `kind:'user'` |
| A7 诚实降级 | 调开窗工具后读返回体与提示文案 | 明确写"会话已创建，请在侧边栏打开（本页可切换）"，**不承诺**"已打开新窗口" |

## 边界

1. **做**：席位模型与授权判定、按卡租约与孤儿跨窗口回收、交棒工具（建会话 + 自署 kind 投递 + 登记席位）、台账信箱。
2. **不做**：**不改 GUI 造窗口**（DSH 无此能力，见"诚实降级"）；不动人工门的语义（`ask_confirm`/`accept_sheet` 仍只归 owner 且全局一次）。
3. **不做**：不启用 `agentTeams` / `schedule`（本机未装载，改 profile 属基础设施变更，单独立项）。

## 产品定义

今天 pmboard 的协作模型是**独占**：一个窗口对一条需求，第二条需求连立项都立不了。
本需求把它换成**席位制**：一条需求有一个 owner（推进阶段、把关闸门）与若干 worker（领卡干活、汇报），
owner 可把一个任务**交给新会话**执行，窗口之间通过台账信箱与直接投递通讯。

## 用户与角色

| 角色 | 今天的痛 | 本需求后 |
|---|---|---|
| 提需求的人 | 窗口被一条需求占住，第二条立项被拒 | 一个窗口可多项目；或把新项目交给新窗口当 owner |
| 想并行推进的人 | 同一需求只有一条驱动链，第二个窗口是"外人" | 多席位合力；按卡租约并行；孤儿卡可被别的窗口捡起 |
| 想让长任务不占当前窗口的人 | `executorHint='fresh-window'` 只是**一句文案**，无任何机械保障 | 交棒工具真的建会话、投节点输入包、登记席位 |

## 功能点

- **FR-1: 需求归属与席位**
  `sourceSessionId` 保留为 `owner`（不动 39 条存量），新增 `seats: WindowSeat[]`，
  `WindowSeat = { windowKey, role: 'owner'|'worker'|'observer', joinedAt, lastSeenAt }`。

- **FR-2: 授权按席位判定**
  把 `src/application/internal/window.ts` 的两个纯函数（`isWindowBound` / `openRequirementsFor`，共 89 行）
  升级为 `seatsOf(ledger, req)` / `canWrite(seat, action)`；15 个用例的校验点与 **16 处 `bound[0]`** 一并改造。
  **复用既有范式**：`ReportTask.ts:57-64` 的 `ownsTeamTask`（团队 Worker 早已按"身份 + 卡归属"授权，
  不靠台账绑定）——把这条生产验证过的做法推广成通用判定。

- **FR-3: 本窗口多项目共存**
  `REQBOARD_WINDOW_BOUND` 从"拒绝"改为"选择"：本窗口接第二个项目，或把新需求交给新窗口当 owner。

- **FR-4: 按卡租约与孤儿跨窗口回收**
  把 `advance.lockAt` 的**整链单飞**（`advanceLockStaleMs: 15min`）改成**按卡租约**，
  复用既有 `heartbeatIntervalMs: 30s` / `orphanTimeoutMs: 3min`；顺带修 `orphan-collector.ts:44-48`
  的 `hasActiveJob` **硬编码 `false`**（既有 TODO，否则孤儿判定不可信）。

- **FR-5: 交棒工具 `reqboard_open_window`**
  建会话 + 首条消息 + 登记席位一次完成。配方照抄 DSH webhook 的
  `packages/webhook/webhook/src/session.ts:135-165`（含失败回滚）。

- **FR-6: 跨窗口投递（冷热通吃）**
  `sessionController.resolveAgent(id)`（**冷会话 resume**）→ 自署 kind 的消息 → `followup`（唤醒）或
  `inject`（静默，**busy 也注入**）。配方照抄
  `packages/schedule/schedule/src/runtime.ts:118-123` 与 `packages/jobs/tool-jobs/src/index.ts:285-305`。
  **今天 pmboard 的真断点**：`AgentDeliverer.ts:81-83` 用 `agents.get()`，对冷会话返回 `undefined`，
  于是只会说"窗口不在线"。

- **FR-7: 台账信箱 `reqboard_send`**
  新增 append-only `WindowMessage`（与 `comments` 同族，可审计可回放），收件窗口在**节点输入包与回合边界**读取。
  跨窗口只投**待办/请求**，不代替人下命令。

- **FR-8: 身份与审计**
  每条跨窗口动作留痕：谁（哪个席位/windowKey）、以什么身份、对哪条需求/哪张卡、什么时候。
  禁止用 `sessionController.prompt`（见红线）。

- **FR-9: 诚实降级与提示**
  开窗只做到"建会话 + 提示去侧边栏打开 + 本页可切换"，**不宣称**打开了新窗口。

## 红线（安全，必须写进需求）

`sessionController.prompt` 无条件把消息打标为 `{kind:'user'}`（`packages/api/session-controller/src/commands.ts:331-336`），
而 goal 的人工门只看 `source.kind === 'user'`（`packages/goal/tool-goal/src/authority.ts:70-84`，注释原文：
*"non-human producers must supply their own source rather than inheriting this authority"*）。

> **交棒与信箱一律自署 kind**（照 `tool-jobs` / `schedule` / pmboard 自己在用的 `dive`），走 `followup`/`inject`。
> 否则"多窗口协作"会变成**绕过本仓所有人工门的后门**，直接踩 floor 铁律「批准闸门永不伸缩」。

## 诚实降级（做不到的，别写进承诺）

- **造不出并列的 GUI 窗口**：无 per-session URL、无 Electron 会话窗口、无 Host→Client 导航推送
  （`apps/web` grep `pushState|location.hash|pathname|router` 零命中；`apps/desktop/src/main.ts` 无 per-session 窗口）。
- 插件能做的只有：**建会话**（侧边栏出现）+ 用 client `ctx.uiWorkspace.openSession(sid)` 把**当前页面**切过去
  （pmboard 已有用法：`src/client/session-jump.ts:110-120`）。
- **任意两会话直接通讯不存在**：只有父子谱系（`subagents.sendMessage`，**直系限定**）与团队对等
  （`agentTeams`，**本机未装载**——这正是 `AgentTeamsAdapter.ts:39` 报 `DSH_TEAMS_UNAVAILABLE` 的根因）。
  所以"窗口直接通讯"必须**自建**（FR-6 + FR-7）。

## 分期（建议单独立项，别一次吞完）

- **期 1（协作契约）**：FR-1 / FR-2 / FR-3 + FR-8。**收益最快**：立刻解开"本窗口无法立第二个需求"。
- **期 2（并行）**：FR-4。
- **期 3（交棒与信箱）**：FR-5 / FR-6 / FR-7 / FR-9。

## 待你裁定

1. 期 1 是否单独先做（我的建议：是）。
2. `sourceSessionId` 是保留为 owner（不动存量）还是改名重构（更干净但动 39 条）。
3. 席位默认可见性：worker 能否看到全部卡，还是只看自己领的。
4. 是否需要"窗口离线时的席位回收"（人关了页面，席位留在台账里多久算失效）。
