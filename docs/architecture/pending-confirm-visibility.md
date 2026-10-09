---
title: 弹框留痕与 pending 票可见性（L2 领域篇）
updated: 2026-10-08
source: REQ-261007223647-da5d
---

# 弹框留痕与 pending 票可见性（L2 领域篇）

> **TL;DR**：弹框与确认门是人与流水线的**唯一对话通道**。本篇记三条口径与它们的判据：
> ① **作答不丢**（留痕在作答到达那一刻落盘、等待死在工具预算之前、票丢了能如实查）；
> ② **内容说人话**（问项与文案只有一个事实源）；
> ③ **pending 看得见**（`/state` 投影 + 看板首屏横带 + 根来源红字）。
> 本页是维护入口；需求侧推理见 `docs/requirements/REQ-261007223647-da5d/`。

**来源**：REQ-261007223647-da5d（P1 弹框与确认门体验优化，2026-10-08 归档）。
现场出处：2026-10-07 连续取消 3 次弹框才完成立项；`reqboard_submit` 30s 超时把确认票 pc-a3d0aa 带走、
下游挂死约 30 分钟且人不知道有票在等。

## 1. 交互留痕（拒绝 / 取消 / 超时）

| 事实 | 内容 | 代码位置 |
|---|---|---|
| 文件 | `~/.dsh/state/capture-rejections.json`（ring buffer 50 条、原子写；损坏只告警不冒泡） | `src/adapters/CaptureRejectionFile.ts` |
| 条目 | `{ windowKey, at, title?, kind? }` | `src/application/internal/capture-rejections.ts` |
| 三类 | `reject`（点 ✖️ 不需要立项）/ `cancel`（作答被中止，`ASK_ABORTED`）/ `timeout`（宽限到点未作答） | 同上 |
| 旧数据 | **`kind` 缺省 = `reject`**——升级零迁移，旧文件一个字节都不改 | `interactionKindOf` |
| 作答到达即落盘 | `record()` 在**作答那一刻**调用，不依赖调用延续段活到收尾 | `CaptureRequirement.recordInteraction` |
| 失败纪律 | 留痕写入抛错**不阻断**「未立项」回执（留痕是增强，不是门槛） | 同上（try/catch） |

两条粘滞判据（同窗口、30 分钟 TTL）：

- **拒绝粘滞**：TTL 内有 `reject` → 不再弹框（回执说明「用户已于 … 选择不需要立项」）；
- **连续取消升级**：TTL 内 `cancel` 到 `CAPTURE_CANCEL_ESCALATION = 3` → 不再弹框，回执给两条替代路径
  （文字给四个取值调 `reqboard_create` / 到看板立项）。

> ⚠️ **已知口径缺口（待人裁决，未修）**：留痕**写入失败**时，回执仍写「已留痕，30 分钟内不再弹框」——
> 真实失败只经适配器 `onError` 进日志（`src/index.ts` 只告警）。若要让回执区分「已留痕 / 留痕失败」，
> 属产品文案裁决，另立卡。

## 2. 确认票超时不丢与重投

- **等待死在工具预算之前**：`askWithBudget`（`src/application/internal/ask-timed.ts`）按预算内等待，
  到点返回中性结果 —— **pending ≠ 错误**，回执说「等待超时」，不判成用户取消。
- **读口两个，缺一不可**（`PendingConfirmRegistry`）：
  - `pendingForWindow(windowKey)`：单窗口单票（agent 侧停手守卫与状态投影用）；
  - `pendingForRequirement(requirementId)`：**按需求跨窗口合并**（看板与重投端点用）。
    ⚠️ 本读口曾被漏实现 → 生产里 `POST /confirm/repost` **恒回 `unavailable`**（假通）。
    新增读路径时先确认它真的实现了，别只看声明的端口类型。
- **重投 = 如实查询**（HTTP `POST /dashboard/api/reqboard/confirm/repost`）三态：
  `still-open`（票还有效，附两条真能走的路）/ `gone`（已失效）/ `unavailable`（读口未装配）。
  **不伪造「已重弹」**——看板侧没有把弹框投进会话的通道。

## 3. 看板 pending 票（`/state` 投影 → 首屏横带）

**服务端**（`GET /dashboard/api/reqboard/state` 的 `pending_confirms`，**键恒在**）：

| 键 | 含义 |
|---|---|
| `ticket` / `requirement_id` / `target` / `kind?` / `created_at` / `interrupted` | 契约六键 |
| `interrupted_at?` | 阻塞等待被中止的时刻（也是过期基准） |
| `expires_at` / `remaining_ms` | `(interrupted_at ?? created_at) + TTL` 与剩余毫秒（**读时算，不落库**） |

- **只有「仍然有意义」的票才下发**，三条谓词**单点**在 `livePendingConfirmsOf`
  （`src/application/internal/pending-guard.ts`，agent 侧 `livePendingConfirm` 与看板共用同一份）：
  ① 台账已落章 → 不列；② 不是一道门（如 `kind=prototype`）→ 不列；③ 没有可落章产物 → 不列。
  台账查不到该需求 → **保守留挂**（不静默释放）。
- `remaining_ms = TTL − (now − (interrupted_at ?? created_at))`，`TTL = LIMITS.pendingConfirmTtlMs = 30 分钟`。
- 无票 → `[]`（**不省略键**：老客户端读不到键与「确实没有票」必须可区分）。

**客户端**（`src/client/views/pending-confirm.ts` + `board-mount.ts` 接线）：

| 形状 | 口径 |
|---|---|
| 横带 | **有票才渲染**；无票零渲染（连容器都不出，不占首屏）；取数失败 → 一行红字 |
| 票行 | 形状与文案对齐权威原型 `prototypes/detail.html#FR-5`：🔔 · 「门名 · REQ-id」· 「剩余 mm:ss」· 「去作答」/「重投弹框」 |
| 超时态 | 到零切「已超时」+「票仍有效，可一键重投」（**超时 ≠ 作废**，行与按钮都不消失） |
| 倒计时 | 本地每秒递减（`tickPendingCountdowns`），**不轮询**；有票行才起表，没行停表，`dispose` 释放 |
| 两个按钮 | 「去作答」= 跳该需求的既有确认区（不另造第二个作答入口）；「重投弹框」= 调 `/confirm/repost` 并原样展示回话 |

## 4. 判据（可跑）

| 断言 | 命令 |
|---|---|
| 留痕三类 + 阈值升级 + 旧文件零迁移 | `npx vitest run tests/capture-interactions.test.ts tests/compat-matrix.test.ts` |
| 作答到达即落盘（**真盘**：临时目录真 JSON，直接读盘断言） | `npx vitest run tests/capture-rejection-persistence.test.ts` |
| 等待超时回中性结果 / 越界报错 | `npx vitest run tests/ask-timed.test.ts tests/confirm-repost.test.ts` |
| `/state` 六键 + 公式 + 陈旧票不列 + 重投端到端 | `npx vitest run tests/pending-board.test.ts` |
| 票行文案与原型对齐 / 横带三态 / 接线 / 端到端 | `npx vitest run tests/pending-ticket-row.test.ts tests/pending-confirm-band.test.ts tests/pending-band-wiring.test.ts tests/pending-band-e2e.test.ts` |
| 可 curl 复核 | `GET /dashboard/api/reqboard/state?session=<id>` → `data.pending_confirms`；`POST /dashboard/api/reqboard/confirm/repost` → `data.action` |

## 5. 改这里要注意什么

- **别为了「多显示一张票」放宽三条谓词**：不在门的票、没有可落章产物的票，人点了看板也答不了——
  列出来只会把人钉在一张点不动的票上。
- **别把倒计时改成轮询**：失效时刻是绝对时刻，本地递减与再取一次等价；票的增减由既有 SSE / 20s 轮询驱动重绘。
- **`remaining_ms` 不进台账**：它是读时派生量，落库就有了第二份真相。
- **超时态不许隐藏行**：现场事故正是"票还挂着、人却不知道"——超时更要显眼。
