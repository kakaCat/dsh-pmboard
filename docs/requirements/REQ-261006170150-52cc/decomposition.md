# 拆分计划（REQ-261006170150-52cc）

> **目标**：修掉「人工门确认后 agent 不被唤醒」这条断链——
> 清位先于推进（FR-1）、清位即请求一次驱动（FR-2）、在途登记分档过期（FR-3）、断链可观测 + 回归锁（FR-4）。
> **做法**：9 张卡分 4 批。批次 1 立契约（等待位回调 + 在途 TTL + 放弃留痕，三者互不依赖）；
> 批次 2 接线（确认收敛点带 ref 清位 / 组合根与心跳装配）；批次 3 回归锁与交付面（端到端、兼容演练、文档收口）；
> 批次 4 自评与偏离登记。纯后端改动（`sides: [backend]`），无 UI 卡、无原型锚点。
> 本计划须**人批准**后才能落任务卡（`reqboard_decompose`）；批准后自动落库并进入实施。

## 编号口径

| 编号 | 出自 | 指什么 |
|---|---|---|
| FR-x | requirement.md 功能点表 | 需求条款 |
| D-x | requirement.md「讨论与裁定记录（D-x）」 | 需求阶段裁定 |
| / | design/interfaces.md | 端口与签名契约（本计划按文件名点名，不另编号） |
| UC-x | design/use-cases.md | 场景 |
| TC-x | design/test-cases.md | 用例 |

## 变更盘点（对照需求文档 + 设计一套）

**新增**

- `tests/awaiting-clear-notice.test.ts`（TC-1、TC-2）、`tests/confirm-settle-order.test.ts`（TC-3~TC-5）、
  `tests/awaiting-inflight-ttl.test.ts`（TC-6、TC-7）、`tests/heartbeat-awaiting-resume.test.ts`（TC-8、TC-9）、
  `tests/wake-skip-trace.test.ts`（TC-10）、`tests/wake-after-confirm.test.ts`（TC-11、TC-12）、
  `tests/awaiting-compat.test.ts`（兼容形态）。
- `docs/requirements/REQ-261006170150-52cc/evidence/legacy-recovery-drill.md`（存量恢复演练记录）、
  `docs/requirements/REQ-261006170150-52cc/evidence/README.md`（证据索引）、
  `docs/requirements/REQ-261006170150-52cc/reviews/implementation-review.md`（实施自评）。

**修改**

- `src/application/internal/awaiting-confirm.ts`——`AwaitingConfirmDeps.onCleared`、`ExitAwaitingInput.notify`、返回 `{cleared, notified}`。
- `src/application/ports.ts`——`UseCaseDeps.notifyDrivable?` 与 `WakeHeartbeatDeps.notifyDrivable?`（同一语义）。
- `src/application/internal/confirm-settle.ts`——`ConfirmDecision.dialogRef`；收敛点先带 ref、await 清位；末尾按 `advanced` 补发一次。
- `src/application/internal/pending-confirm.ts`——`ConfirmSubmitted.dialogRef` 透传。
- `src/application/use-cases/AskConfirm.ts`、`src/application/dive/gate-prompt.ts`——把各自 ref 交给收敛点。
- `src/adapters/PendingConfirmRegistry.ts`——在途登记分档过期（`suspend ? ttlMs : blockingTtlMs`）+ 惰性过期。
- `src/application/dive/wake-heartbeat.ts`、`src/application/dive/ReqboardDiveManager.ts`、`src/index.ts`——装配「清位即驱动」。
- `src/application/dive/round-driver.ts`——放弃本拍的有界留痕 `[WAKE-SKIP]`。
- `docs/architecture/confirm-gate-advance.md`、`docs/architecture/automation-chain-contract.md`、
  `docs/architecture/project-manual.md`——契约与手册收口。

**删除**

- 无源文件删除、无导出符号删除。**不动**：`src/application/gate/handlers/h4-resume.ts`（仍 skip）、
  `src/application/internal/pending-confirm.ts` 的 `wake()`（仍空实现）、票 TTL 与三档宽限语义、任何工具参数与返回键。

## 批次与依赖

```
批次 1（契约与独立面，可并行）
  t1 等待位回调/notify ──┐        t3 在途分档过期 ──┐        t5 放弃留痕
                         │                          │              │
批次 2（接线）           ▼                          ▼              │
  t2 收敛点带 ref 清位 ◀─┘        t4 组合根+心跳装配 ◀┘              │
        │                              │                            │
批次 3（回归锁与交付面）▼              ▼                            ▼
  t6 端到端回归锁 ◀── t2,t4   t7 兼容+存量演练 ◀── t3,t4   t8 文档收口 ◀── t2,t3,t5
        └──────────────┬───────────────┬───────────────┬────────────┘
批次 4（自评）         ▼
  t9 实施自评与偏离登记（依赖 t1~t8）
```

依赖安全序：全部 `depends_on` 只引用**本文档中更早出现**的 key（无前向引用）。

## 任务表

| 计划 key | 任务 id | 标题 | 覆盖条款 | 落点（设计条目 + 文件） | 原型锚点 | 关联 D-x | 阶段 | 端侧 | 依赖 | 工作量 | 验收标准 | 子卡段 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| t1 | （落库后回填） | 等待位契约：清位回调与 notify 开关 | FR-2 | interfaces 端口与签名 + `src/application/internal/awaiting-confirm.ts`、`src/application/ports.ts`、`tests/awaiting-clear-notice.test.ts` | — | D-1 | implement | backend | — | S · 6.1 DU | ① `npx vitest run tests/awaiting-clear-notice.test.ts` 退出码 0（真清位回调恰 1 次、`notify:false` 为 0 次、台账本非 awaiting 为 0 次、回调抛错不外溢）；② `npx vitest run tests/layer-boundary.test.ts` 全绿 | 默认 |
| t2 | （落库后回填） | 确认收敛点：带 ref 清位先于推进 + 补发条件 | FR-1, FR-2 | interfaces 确认收敛点 + `src/application/internal/confirm-settle.ts`、`src/application/internal/pending-confirm.ts`、`src/application/use-cases/AskConfirm.ts`、`src/application/dive/gate-prompt.ts`、`tests/confirm-settle-order.test.ts` | — | D-1 | implement | backend | t1 | M · 10.1 DU | ① 新用例全绿（写入序：停手位先清、`status` 后变；推进成功⇒补发 0 次、被门拦/抛错⇒1 次；第二票在场⇒停手位保持）；② `npx vitest run tests/ask-confirm-pending.test.ts tests/confirm-advance-deadlock.test.ts` 全绿 | 默认 |
| t3 | （落库后回填） | 在途登记分档过期（挂起 30 分钟 / 阻塞 60 分钟） | FR-3 | data-model 内存登记生命周期 + `src/adapters/PendingConfirmRegistry.ts`、`tests/awaiting-inflight-ttl.test.ts` | — | D-1 | implement | backend | — | S · 5.7 DU | ① 新用例全绿（`suspend:true` 越 30 分钟过期；`suspend:false` 30 分钟仍 true、越 60 分钟才 false；惰性删除 + `exit` 幂等）；② `npx vitest run tests/pending-confirm-ttl.test.ts` 全绿（票 TTL 零变化） | 默认 |
| t4 | （落库后回填） | 组合根与心跳装配：清位即驱动、过期即恢复 | FR-2, FR-3 | interfaces 组合根装配 + `src/application/dive/wake-heartbeat.ts`、`src/application/dive/ReqboardDiveManager.ts`、`src/index.ts`、`tests/heartbeat-awaiting-resume.test.ts` | — | D-1 | implement | backend | t1, t3 | M · 7.9 DU | ① 新用例全绿（过期在途⇒一趟 tick 后停手位清、`resumed` 含该需求、`notifyDrivable` 调 1 次；未过期⇒保持且 0 次）；② `npx vitest run tests/dive-wake-e2e.test.ts` 全绿 | 默认 |
| t5 | （落库后回填） | 驱动放弃本拍的有界留痕（\[WAKE-SKIP\]） | FR-4 | backend 观测面 + `src/application/dive/round-driver.ts`、`tests/wake-skip-trace.test.ts` | — | D-2 | implement | backend | — | S · 5.1 DU | ① 新用例全绿（同因连续 5 拍恰 1 条、跨冷却窗再 1 条、异因互不影响）；② `npx vitest run tests/dive-human-gate-stop.test.ts tests/chain-budget.test.ts` 全绿（停机判据零变化） | 默认 |
| t6 | （落库后回填） | 端到端回归锁：确认后无需人敲字即起轮 | FR-1, FR-2 | test-cases TC-11/TC-12 + `tests/wake-after-confirm.test.ts`、`tests/dive-wake-e2e.test.ts` | — | D-1 | test | backend | t1, t2, t4 | M · 6.75 DU | ① 该文件 2 例全绿（后台弹框超宽限后作答 / 否定作答 ⇒ inbox 收到 1 条 `source.kind='dive'` 回合消息）；② **反向验证**：把 `src/application/internal/confirm-settle.ts` 的清位改回旧的 `void` 无 ref 调用 ⇒ 该文件必红（记录输出后还原） | 默认 |
| t7 | （落库后回填） | 兼容形态与存量恢复演练（无数据迁移） | FR-3 | data-model 迁移与兼容 + `tests/awaiting-compat.test.ts`、`docs/requirements/REQ-261006170150-52cc/evidence/legacy-recovery-drill.md` | — | D-2 | test | backend | t3, t4 | S · 5.15 DU | ① `npx vitest run tests/awaiting-compat.test.ts` 全绿（三种装配形态：全缺省 / 只 `dialogs` / 只 `notifyDrivable`）；② 演练记录含命令 + 输出摘要 + 副本 sha256 前后相等；③ `npx vitest run tests/config-defaults-parity.test.ts` 全绿 | 默认 |
| t8 | （落库后回填） | 契约文档与排查手册收口 | FR-2, FR-3, FR-4 | architecture 与既有契约文档的关系 + `docs/architecture/confirm-gate-advance.md`、`docs/architecture/automation-chain-contract.md`、`docs/architecture/project-manual.md` | — | D-1 | doc | doc | t2, t3, t5 | S · 6.25 DU | ① 三份文档可 grep 到「清位先于」「清位即驱动」「分档过期」三处关键句；② `npx vitest run tests/kb-generate.test.ts` 全绿（若动导出符号先 `pnpm kb:build`）；③ 手册新增节写明本需求的认知增量 | 默认 |
| t9 | （落库后回填） | 实施自评与偏离登记 | FR-1, FR-2, FR-3, FR-4 | test-cases 可跑命令与期望 + `docs/requirements/REQ-261006170150-52cc/reviews/implementation-review.md`、`docs/requirements/REQ-261006170150-52cc/evidence/README.md` | — | D-2 | doc | doc | t1, t2, t3, t4, t5, t6, t7, t8 | S · 5.0 DU | ① 自评逐条列出 4 条 FR 的落点与判据读数，含「与设计不一致处」（无则写"无偏离"）；② 全量回归与类型闸门读数齐（`npx vitest run`、`npx tsc --noEmit -p tsconfig.json`）；③ 反向演练（拿掉修复必红）记录在案 | 默认 |

**容量核算**（口径 `files×1 + anchors×0.5 + chars/2000`，容量 16 DU）：t1 6.1 · t2 10.1 · t3 5.7 · t4 7.9 ·
t5 5.1 · t6 6.75 · t7 5.15 · t8 6.25 · t9 5.0 —— **合计 58.05 DU，无超容量卡**（故计划内不出现 `⚠️超容量` 标记）。

## 边界校验（不超范围、卡可独立验收）

| 检查项 | 结论 |
|---|---|
| 是否只改设计圈定的面 | 是：改动文件与 `design/architecture.md`「改动清单」逐一对应，无计划外文件 |
| 是否有卡夹带设计二次创作 | 否：设计未覆盖的事项（如改动看板、复活投递路径）**不做**，需要就退回设计阶段 |
| 每卡可否独立验收 | 可以：每卡自带可跑命令与期望，且不依赖会话历史（新窗口只凭卡 + 设计即可开工） |
| 是否含 UI 卡 | 否（`sides: [backend]`）：任务表「原型锚点」列全为 `—`，无原型对照判据 |
| 迁移与兼容是否有专卡 | 有：t7（零数据迁移 + 三形态兼容 + 存量恢复演练） |
| 接口/契约卡是否先行 | 是：t1 立契约，t2/t4 的实施卡 `depends_on` 它 |
