---
serves: FR-1, FR-2, FR-3, FR-4
---

# 后端设计（REQ-261006170150-52cc）

> 端侧声明：`requirement.md` front-matter `sides: [backend]` ⇒ 本份为**条件必交**（无 frontend.md）。
> 改动面全在插件运行时（host 侧 TypeScript），无 HTTP 契约变更、无客户端改动、无数据层变更。

## 端侧声明与结论 `serves: FR-1`

| 项 | 结论 |
|---|---|
| 前端产物 | **无**（不新增控件、不改渲染、不改样式；`reqboard_status` 与看板投影键零变更） |
| HTTP 契约 | **无变更**（`/dashboard/api/reqboard/**` 的路由、请求体、返回体一字不动） |
| 工具契约 | **无变更**（`reqboard_*` 的参数与返回键不动；本需求不新增工具） |
| 数据层 | **无变更**（DDL/schema/回填/迁移脚本全为零，见 `data-model.md`） |
| 运行时行为 | **变更**（清位时机、清位即驱动、在途登记分档过期）——即本份文档的主体 |

## 后端改动面（行为级） `serves: FR-1, FR-2, FR-3`

| 改动面 | 修前行为 | 修后行为 |
|---|---|---|
| 确认收敛点的清位 | `void exitAwaitingConfirm(无 ref)`，真正清位落在 settle 之后 | 带 `dialogRef` 且 `await`，**先清位**再落章/推进 |
| 停手位被清 | 只写台账，不通知任何人 | 清位成功 ⇒ 回调 `onCleared` ⇒ 请求一次驱动（确认收敛点内推迟到 settle 末尾） |
| 在途登记的生命周期 | 无过期（`inFlightFor` 恒为"有人在答"） | 按 `suspend` 分档过期（30 / 60 分钟），过期即"无人等待" |
| 心跳对账清位 | 清完不通知（且过期永远不会命中） | 清完带 `onCleared` ⇒ 过期恢复即续跑 |
| 驱动放弃本拍 | 只在进程日志（`log.*`）里 | 追加有界诊断留痕 `[WAKE-SKIP]`（同因 60s 冷却，不写台账评论） |

## 并发、幂等与顺序 `serves: FR-2`

| 关注点 | 设计 |
|---|---|
| 重复清位 | `exitAwaitingConfirm` 幂等（同 ref 重复 / 未知 ref 零动作）；重复调用不产生第二条 `[Dive 恢复]` 评论 |
| 重复触发驱动 | 同一确认**最多一次**：推进成功走 `requirement-moved`（既有桥），否则走清位回调；两者由 `advanced` 互斥（INV-4） |
| 驱动侧的合并 | 复用既有 `requestDrive` 语义（同 agent 串行 + `requested` 标志）；本需求**不新增**调度设施 |
| 同需求多票 | 只有"本次这票就是当前停手位"（或已无在途）才清台账；否则保持等人（沿用 `stillWaiting`） |
| 写盘失败 | 沿用既有"永不抛 + 告警"；清位失败 ⇒ 不回调（不谎报"链路已接上"） |
| Node 单线程 | 无锁、无竞态窗口新增；过期判定是**惰性**的纯内存读 |
| 时钟 | 只用既有 `deps.clock.now()` / 注入的 `now`（域层与适配器不读系统时钟） |

## 无界面产物声明 `serves: FR-1`

本需求不改任何渲染或交互：无 `prototypes/*.html`、无 `design/frontend.md`、无客户端分片改动。
若后续评审认为必须动看板（例如展示"为什么没起轮"），应**另开 UI 需求**（`sides` 升级 + 交原型），不在本需求夹带。

## 观测面与运行前提 `serves: FR-4`

| 面 | 位置 | 能回答什么 |
|---|---|---|
| 诊断日志 | `~/.dsh/state/reqboard-capture-diag.log`（`captureDiag`） | `[WAKE-SKIP] reason=…`：这一拍为什么没起轮；`[WAKE-RX] agent/status=idle`：驱动有没有被请求 |
| 台账评论 | `comments.jsonl` | `[Dive 停手] …（ref=…）`（进入等待）/ `[Dive 恢复] 等待结束（出口=…）`（解除等待） |
| 心跳回执 | `wakeTick()` 的 `WakeTickResult` | `resumed[]`（过期恢复点名）/ `skipped[]`（仍有人在答） |
| 运行前提 | 宿主装配了 `dialogs`（在途登记表）与 `agents`（在线区） | 缺任一 ⇒ 按"未装配即旧行为"降级，不报错、不伪造 |

**排查手册（本需求交付的一部分）**：确认后没起轮时，按这个顺序看——
① 台账 `dive.driverHealth` 是不是仍 `awaiting-confirm:*`（是 ⇒ 有人/有残影在等，看 `inFlight` 是否已过期）；
② 诊断日志有没有 `[WAKE-SKIP]`（有 ⇒ 驱动被挡下，理由写在行内）；
③ `[WAKE-RX] agent/status=idle` 在确认**之后**有没有出现（没有 ⇒ 根本没请求驱动，回到 FR-2 的装配面）。
