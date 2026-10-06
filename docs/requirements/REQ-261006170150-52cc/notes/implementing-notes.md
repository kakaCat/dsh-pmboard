# 实施机制备忘（REQ-261006170150-52cc · 交接给续作窗口）

> 写于实施阶段第一次交接时（2026-10-06 17:3x）。本文件只写**接手必须知道的机制与现状**，
> 计划与验收口径仍以 `decomposition.md` + `design/*` 为准。

## 1. 子卡执行引擎在本 profile 不可达（重要）

台账在批准计划时留了一条系统评论：

> `[自动链停手] 子卡执行引擎不可达（subtask_engine_unreachable）：本次未落任何子卡。`
> `两条出路：① 改由本窗口自证过凭证门（reqboard_task_report 写 filesChanged 或 completed）；`
> `② 让 workflowEngine 可达（当前 profile 按设计不可达，重试无解）。`

因此 **`reqboard_task_run` 投递后子卡不会被执行**（实测：job 完成、4 张子卡仍全为 todo、attempt 0）。
本仓的既定出路是①：**由窗口自己做完并自证**。

### 每张父卡的收尾配方（实测可用的调用序）

1. 本窗口做卡的实现 + 跑该卡的 acceptance；
2. `reqboard_task_report(父卡, filesChanged=[...], completed=[...], summary=...)`；
3. 对**每张**子卡（dev/integrate/review/test 四张，id 见 `reqboard_task_tree`）：
   - `reqboard_task_report(子卡, filesChanged=[同父卡改动文件], completed=[该阶段做了什么], next_step=...)`
     ← 报告允许在 `todo` 态登记（实测通过）；
   - `reqboard_task_move(子卡, to=in_progress, reason=...)`；
   - `reqboard_task_move(子卡, to=done, reason=...)`。
   **子卡不允许 todo→done**（报错原文：`该角色合法边：todo→in_progress、in_progress→done…`）。
4. 四张子卡全 done 后：`reqboard_task_move(父卡, to=done)`（在此之前父卡被
   `REQBOARD_SUBTASK_GATE` 拒：`父卡不能收尾：仍有 4 张子卡未完成`）。
5. 子卡的 `联调` / `测试` 段在本需求多数卡上**无对应动作**（纯内部端口改动、无跨组件接口）——
   如实写「无接口可联调」/「回归面已跑」即可，不要编造联调动作。

## 2. 这份工作树正在被别的窗口并发修改（务必先读后写）

- 2026-10-06 17:20:46 有 **160 个 `src/**/*.ts` 一次性被重写**（同一 mtime），
  `src/application/ports.ts` 曾在两次读之间被整体替换（行数 1583 → 1342 → 1582）；
  同一时段另有别的窗口在跑 `vitest run tests/docs-panel tests/token-panel …`。
- 结论：**每次编辑前重读目标文件**（`read` 工具），编辑后 `grep` 复核落盘；
  不要相信几轮之前的读入缓存，也不要把别人的 WIP 一起提交。
- 因此**本轮不做 git 提交**（`ports.ts` 等文件混着其他需求的大段 WIP，选择性提交会把它们卷进来）。

## 3. 基线红与本次引入红的区分（验收时要如实分开）

| 判据 | 修前是否已红 | 证据 |
|---|---|---|
| `tests/layer-boundary.test.ts`（3 项） | **基线已红** | `.dsh-data/baseline-cases.txt` 已登记同名用例 |
| `tests/size-budget.test.ts`（多文件超 400 行） | **基线已红** | 实跑输出：offenders 含 `index.ts` 等存量文件 |
| 本次引入的红 | 无（已修） | `dialog-inflight-stop` 的 TC-9 断言随契约更新后转绿 |

## 4. t1（t-b85f4e）现状与偏差

- 代码：`src/application/internal/awaiting-confirm.ts`（`onCleared` / `notify` / 返回 `{cleared,notified}`）、
  `src/application/ports.ts`（`UseCaseDeps.notifyDrivable?`）。
- 用例：`tests/awaiting-clear-notice.test.ts`（TC-1×4 + TC-2 = 5 例全绿）；
  既有 `tests/dialog-inflight-stop.test.ts` 14 例全绿（TC-9 的 `toBeUndefined` 断言按新契约改为 `{cleared:false,notified:false}`）。
- 偏差（已在父卡汇报里登记）：实际改 4 个文件，比 footprint 声明的 3 个多 1 个**既有测试断言更新**。
- `design/interfaces.md` 把 `WakeHeartbeatDeps` 写在 `src/application/ports.ts` 名下，实际它在
  `src/application/dive/wake-heartbeat.ts`；t4 落字段时按真实文件位置改，并在 t9 的自评里登记这处设计文档偏差。

## 5. 剩余卡与建议顺序

`t3(t-74c612) → t5(t-cc3cee) → t2(t-0c7769，依赖 t1) → t4(t-9bbb25，依赖 t1+t3) → t6(t-b5e9ee) → t7(t-0808ec) → t8(t-44966a) → t9(t-02409e)`。
每张卡都按第 1 节的配方收尾（否则需求推不到验收）。

## 6. 第二窗口续作记录（session-426ba81b，2026-10-06 18:0x–18:3x）

### 已完成 5/9 张父卡（各自 acceptance 全绿，子卡链全 done）

| 卡 | 内容 | 关键读数 |
|---|---|---|
| t-b85f4e | 等待位契约：`onCleared` / `notify` / `{cleared,notified}` | `awaiting-clear-notice` 5/5；**本轮复核补齐了 `WakeHeartbeatDeps.notifyDrivable`**（卡面点名，原窗口漏落） |
| t-74c612 | 在途登记分档过期（挂起 30 / 阻塞 60 分钟） | `awaiting-inflight-ttl` 11/11；`pending-confirm-ttl` 5/5 |
| t-cc3cee | 驱动放弃的有界留痕 `[WAKE-SKIP]` | `wake-skip-trace` 8/8；`dive-human-gate-stop`+`chain-budget` 22/22 |
| t-9bbb25 | 组合根与心跳装配（清位即驱动 / 过期即恢复） | `heartbeat-awaiting-resume` 4/4；`dive-wake-e2e` 5/5 |
| t-0808ec | 兼容形态 + 存量恢复演练 | `awaiting-compat` 7/7；演练副本 sha256 前后相等；`config-defaults-parity` 7/7 |

### 新增文件（可直接复用）

- `src/adapters/dialog-inflight-expiry.ts`（分档 TTL 规则，独立成模块守 400 行门禁）
- `src/application/dive/wake-skip-trace.ts`（放弃留痕器，注入时钟/通道，L1 可测）
- `tests/awaiting-inflight-ttl.test.ts`、`tests/wake-skip-trace.test.ts`、
  `tests/heartbeat-awaiting-resume.test.ts`、`tests/awaiting-compat.test.ts`
- `docs/requirements/REQ-261006170150-52cc/evidence/legacy-recovery-drill.{mts,md}`（演练脚本 + 记录）

### ⛔ 未完成 4 张卡的阻塞点（重要）

`t-0c7769`（确认收敛点：带 ref 清位先于推进）必须改
`src/application/internal/confirm-settle.ts`；而该文件**正被 `REQ-261006164732-6503` 的窗口实时编辑**
（实测 17:56 / 18:05 / 18:30:50 三次改动，493 → 588 → 609 行，且尚未出现 `dialogRef`）。

`t-b5e9ee` / `t-44966a` 依赖 `t-0c7769`，`t-02409e` 依赖那两张 ⇒ **全部串在这一处**。

**用户裁定（本窗口弹框）**：等 6503 落地，再回来接。这与设计里
「6503 在先，后落者必须在对方的建门/落章结构上接清位 + 驱动，不得各写一套清位」一致。

**续作第一步**：确认 `confirm-settle.ts` 已安静（mtime 稳定 ≥5 分钟）且 `npx tsc --noEmit` 干净，
再开工 `t-0c7769`——照卡面三件事：
① `ConfirmDecision.dialogRef?`；② `applyConfirmDecision` 开头 `await exitAwaitingConfirm({ref, notify:false, reason:'board'})`
（无 ref 时保留旧 `void` 调用）；③ `finally` 里 `advanced !== true` 才 `deps.notifyDrivable?.(id)`；
再改 `AskConfirm.ts` / `gate-prompt.ts` 透传 `dialogRef`；新建 `tests/confirm-settle-order.test.ts`（TC-3/4/5）。

### 本窗口轮次的三条读数边界（验收时别再当"新回归"）

1. **全量失败数在涨，但不是本需求的**：实测 66 → 67 → 70 → 75（基线 68）。
   逐条追因的决定性证据：失败文件对本需求模块（`awaiting-confirm` / `wake-heartbeat` /
   `round-driver` / `wake-skip-trace` / `PendingConfirmRegistry` / `dialog-inflight`）的**引用计数全为 0**；
   我方 4 个新测试文件每次都全绿。成因是同一工作树上多窗口并发 WIP（含 `prompt-baseline`、
   `report-tabs`、`live-tasks-single-source`、`typecheck` 等）。
2. **tsc 的错误也在漂**：`verification-no-second-gate.test.ts`（未跟踪）→ `confirm-settle.ts`（半成品）
   → `client/views/panels/verify.ts`（未跟踪），每次都不是本需求的文件。
3. **基线机制的正确用法**：`npx tsx scripts/test-baseline.mts --check` 打印工作树指纹；
   确认"非本次引入"后**不 refresh 基线**、也不代改别窗口文件——本窗口全程照此执行。

### 收尾时别忘了

- 全量读数与 tsc 读数要在 `t-02409e` 自评里统一交代（该卡本就要求"全量回归与类型闸门读数齐"）。
- `t-02409e` 还要求**反向演练（拿掉修复必红）**记录在案——这是本需求唯一还没做的证据形态。


## 7. 收尾状态（2026-10-06 19:1x，session-426ba81b）

- **9/9 张父卡全部 done**（含 30 张子卡）：t-b85f4e / t-74c612 / t-cc3cee / t-9bbb25 / t-0c7769 /
  t-b5e9ee / t-0808ec / t-44966a / t-02409e。需求已自动进入 **accepting**。
- **交付读数**：本需求 7 个用例文件 **44 例全绿**；反向演练两次命中（拿掉修复必红）；
  存量恢复演练副本哈希前后相等。
- **验收材料已提交**（`kind=verification`）：验收单 **11 项**待人工逐项裁决。
  提交时弹框超时被中断（ticket `pc-b88376`，`interrupted=true`）——按纪律**不重弹**，请走看板验收页。
- **未达标项（已登记，交人判断）**：`tests/kb-generate.test.ts` 12/13，成因是别窗口 WIP 改了
  `src/domain/knowledge/generate.ts` 与 `docs/knowledge/code-map.*`，与本需求无因果。
- **仍需人复核的边界**：两处 test 卡（t-0808ec / t-b5e9ee）承载了演练脚本与 2 处 src 接线
  ——详见 `reviews/implementation-review.md` §2.4。
- 证据与自评：`tests/acceptance-evidence.md`（含 39 个任务的 covers 标注）、
  `reviews/implementation-review.md`、`evidence/README.md`。
