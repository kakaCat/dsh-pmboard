# 看板运行态指示（L2 领域篇）

> **TL;DR**：看板上「哪条需求正在被处理」不靠推断——**DSH 客户端本来就持有每个会话的运行态**
> （`ctx.sessions.list` 的 `byId[sid].running`，host 经 `api-session/status` 全量实时推送）。
> 泳道卡与列表行的转圈指示直接复用它，判据与左侧会话列表**同源**；拿不到读数时**不显示**，绝不近似推断。
> 一句话方法论：**接看板之前先找客户端已有的信号**，不要为展示新造 host 接口。

## 数据来源（唯一入口）

| 环节 | 事实 | 出处 |
|------|------|------|
| 运行态字段 | `byId[sessionId].running: boolean`（host 侧 = `agents.get(id)?.status === 'running'`） | DSH `dsh-api-session-controller` 的 `ClientSessions.projectList()` |
| 实时性 | host 经控制流推送 `api-session/status(sessionId, running)`，**全量**会话（非仅当前会话） | 同上 `ctx.remote.$on('api-session/status', …)` |
| 侧栏同源 | 左侧会话列表的转圈就是 `node.running` → `StateDot state='ongoing'`（文案「进行中」） | `dsh-client-ui-workspace` |
| 本仓入口 | `src/client/session-running.ts`：`isSessionRunning` / `runningSessionIds` / `subscribeSessionRunning` | 本仓 |

## 两个「在跑」信号怎么区分（2026-10-04 用户裁定）

看板卡面同时有两个容易混的信号，职责不同：

| 信号 | 是什么 | 判据 | 文案（2026-10-04 起） |
|------|--------|------|----------------------|
| ⟳ 圆圈 | **事实**：该需求绑定窗口此刻在跑回合 | 会话运行态 `byId[sid].running` | 无文字，`aria-label=会话进行中` |
| pill | **机制**：自动链开关的状态 | `autoRun` + `advance.pausedReason` + `failureStreak`（4 档） | `自动链` / `自动链·已暂停` / `自动链·熔断` / `手动` |

改名前两者都读作「运行中」——读者会把「机制开着」误读成「正在干活」。改名只动可见文案：三档统一加「自动链」前缀（手动档不加），
`kind`（`data-auto` 的值 = `running`/`paused`/`breaker`/`manual`）与档数（4 档）都不变——存量数据零改写。

## 判据：需求 → 会话（席位权威）

```
running(req) = (req.seats 有值 ? seats.any(windowKey 在跑) : sourceSessionId 在跑)
```

- `seats` **有值即权威**（含显式空数组 → 判不在跑），与 host `seatsOf()` 的折算口径同源；
- `seats` 缺省（存量需求）→ 折算单 owner `sourceSessionId`；
- 两者皆无（人工建卡）→ 不在跑，不渲染空壳；
- **不用**任务执行会话当补充判据：那是同一窗口的历史执行记录，纳入只会把「旧记录残留」误报成「正在跑」。

呈现位置（2026-10-04 用户裁定，**第二次调整后的最终形态**）：

| 视图 | 位置 | 理由 |
|------|------|------|
| 泳道卡 | **紧跟项目 ID**（顺序：`REQ-id ⟳ 分类 · 状态 chip…`） | 圆圈是**项目级**信号，挂在项目标识上最直白，读者不用去别处找 |
| 列表行 | **紧跟项目 ID**（ID 单元格内） | 与泳道卡同一邻接形状（`<ID></span><span class="dsh-pm-running">`），两处一眼可对照 |

> 演进：最初挂在窗口 chip 行（列表为标题列）→ 第一次调整到卡面顶部那行、紧邻自动链 pill →
> 第二次统一为**紧跟项目 ID**。位置契约由 `tests/client-view.test.ts` 的两条断言钉住，改位置会立刻红。

**边界：无绑定即不显示。** 圆圈的存在前提是「这条需求有绑定窗口」（`seats` 或 `sourceSessionId`）：

- 人工建卡（两者皆无）→ 不渲染（也不渲染空壳）；
- **撤掉 worker 席位不会让圆圈熄灭**——需求仍绑着 owner，圆圈继续按 owner 判定（这是 `owner 不可解绑、只能换绑`这条既有规则的自然结果）；
- 窗口离线 / 会话不在列表 / 已删除 → 读数判「不在跑」→ 不显示。

## 重绘门控（为什么不能直接订阅就重绘）

`ctx.sessions.list` 是整表重投影的 store：**任意**会话的任意变化都会通知（含其它窗口的 token/标题更新）。
不看门控就重绘 = 别的窗口每动一下就把看板整块 `innerHTML` 刷一遍。

门控两段（实现见 `src/client/board-mount.ts`）：

1. **相关集合收敛**：只取「当前页需求绑定的窗口」（席位 ∪ 来源窗口）∩ 在跑集合；
2. **集合相等比较**：与上一次渲染用过的集合逐个比对，相等 → 直接 return（零 DOM 操作）。

取舍：**不做局部 DOM patch**——两处渲染点 + 分页 + 排序 + 泳道重排，patch 的失效路径远多于一次门控重绘。

## 降级矩阵（红线：不伪造）

| 场景 | 行为 |
|------|------|
| 服务未注入 / `list` 缺失 / 无 `subscribe`（旧客户端） | 判「不在跑」、空集、no-op 退订；**不报错、不噪音** |
| `byId` 缺该行 / `running` 非布尔 | 判「不在跑」 |
| 需求无窗口绑定 | 不渲染指示，也不渲染空壳 |

**禁止的近似推断**（出现即缺陷）：`updatedAt` 距今阈值、`autoRun === true`、`advanceLockAt` 新鲜度、
`executions[].outcome === 'running'`。读数不可得的呈现 = **没有指示**，不是灰点、不是「未知」。

## 可复用教训

1. **客户端已有信号优先**：本次改动零 host 接口、零台账字段——因为运行态早已在客户端。
   新做「展示类」需求前，先花 10 分钟确认客户端服务里有没有现成的读数（`rg "getSnapshot" src/client` 是入口）。
2. **判据跨层必须同源**：客户端按 `seats` 判定时，折算口径必须与 host `seatsOf()` 一字不差，
   否则又会出现「看板说在跑、台账说没这个窗口」的两份真相。
3. **展示型订阅要先门控**：整表重投影的 store 通知频率远高于展示粒度；「订阅 + 比集合 + 变了才渲染」
   是本仓可复用的三件套（同款思路见《刷新不得打断读图》）。

## 回归探针

```bash
npx vitest run tests/client-session-running.test.ts   # 读数 / 降级 / 席位真值表（17 项）
npx vitest run tests/client-view.test.ts              # 两处视图渲染 + 零回归 + 样式契约（59 项）
npx vitest run tests/board-attach.test.ts             # 实时增隐 + 重绘门控 + 退订（13 项）
```

需求档案：`docs/requirements/REQ-261004210128-283d/`（含渲染快照证据 `evidence/running-indicator-render.html`，
浏览器打开即可看到转圈与「减少动效」降级效果）。
