---
serves: FR-1, FR-2, FR-3, FR-4
---

# 测试证据（REQ-261006170150-52cc）

> 每条都可复跑。原始读数取自交付时刻；工作树指纹见本条末。

## 1. 本需求用例（7 个文件 / 44 例，全绿）

```text
$ npx vitest run tests/awaiting-clear-notice.test.ts tests/awaiting-inflight-ttl.test.ts \
                 tests/confirm-settle-order.test.ts tests/heartbeat-awaiting-resume.test.ts \
                 tests/wake-skip-trace.test.ts tests/wake-after-confirm.test.ts tests/awaiting-compat.test.ts

 ✓ tests/wake-skip-trace.test.ts            (8 tests)
 ✓ tests/awaiting-inflight-ttl.test.ts     (11 tests)
 ✓ tests/awaiting-clear-notice.test.ts      (5 tests)
 ✓ tests/heartbeat-awaiting-resume.test.ts  (4 tests)
 ✓ tests/awaiting-compat.test.ts            (7 tests)
 ✓ tests/confirm-settle-order.test.ts       (7 tests)
 ✓ tests/wake-after-confirm.test.ts         (2 tests)
 Test Files  7 passed (7)
      Tests  44 passed (44)
```

逐条对应 FR：

| FR | 用例 | 读什么 |
|---|---|---|
| FR-1 | `confirm-settle-order.test.ts` TC-3 | 写入序恰为 `[stop-cleared, status-changed]`（停手位先清、status 后变）；缺省无 ref 即旧行为 |
| FR-2 | `confirm-settle-order.test.ts` TC-4 / `awaiting-clear-notice.test.ts` / `heartbeat-awaiting-resume.test.ts` / `wake-after-confirm.test.ts` | 补发 0/1/1 次；回调抛错不外溢；过期对账恰 1 次；端到端"确认后不注入任何用户消息即起轮" |
| FR-3 | `awaiting-inflight-ttl.test.ts` TC-6/7 / `pending-confirm-ttl.test.ts` | 挂起 30 分钟 / 阻塞 60 分钟；过期即惰性摘除；票 TTL 语义零变化 |
| FR-4 | `wake-skip-trace.test.ts` TC-10 | 同因连续 5 拍恰 1 条、跨冷却窗再 1 条、异因互不影响、永不抛 |

## 2. 回归面（指名要求的两组）

```text
$ npx vitest run tests/ask-confirm-pending.test.ts tests/confirm-advance-deadlock.test.ts
 ✓ 24/24 passed        # t-0c7769 acceptance ②（旧语义零回归）

$ npx vitest run tests/dive-wake-e2e.test.ts
 ✓ 5/5 passed          # t-9bbb25 / t-b5e9ee acceptance（真装配零回归）

$ npx vitest run tests/dive-human-gate-stop.test.ts tests/chain-budget.test.ts
 ✓ 22/22 passed        # t-cc3cee acceptance ②（停机判据零变化）

$ npx vitest run tests/config-defaults-parity.test.ts
 ✓ 7/7 passed          # t-0808ec acceptance ③（不注入 = 现状）

$ npx vitest run tests/pending-confirm-ttl.test.ts
 ✓ 5/5 passed          # t-74c612 acceptance ②（票 TTL 零变化）
```

相关面另跑（均绿，未逐条列输出）：`confirm-settle-preconditions` 5/5、`dive-confirm-advance` 5/5、
`dialog-inflight-stop` 14/14、`confirm-group` 5/5、`artifact-group-confirm` 4/4、`gate-handlers` 16/16、
`apply-wiring` 7/7、`dive-wake-wiring` 10/10、`dive-wake-liveness` 3/3。

## 3. 反向验证（拿掉修复必红）

`evidence/wake-after-confirm-reverse.md`（原始输出 + 还原核对）。摘要：

| 拿掉哪一处 | 变红 | 原始症状 |
|---|---|---|
| 收敛点带 ref 的 `await` 清位 | `tests/wake-after-confirm.test.ts` TC-11 | `expected [] to have a length of 1 but got +0`（状态变了、agent 不动） |
| `AskConfirm` 的 `onCleared` 接线 | 同上 TC-12 | `expected [] to have a length of 1 but got +0`（答完否定了、链还停着） |

还原后复跑：`wake-after-confirm` 2/2 + `dive-wake-e2e` 5/5 = **7/7 绿**。

## 4. 存量恢复演练（真台账副本）

```text
$ npx tsx docs/requirements/REQ-261006170150-52cc/evidence/legacy-recovery-drill.mts
[A 零迁移] 文件数：645 → 645（相等=true）
[A 零迁移] 树哈希：3f18d75a… → 3f18d75a…（相等=true）
[A 零迁移] 本趟心跳：resumed=0 skipped=4 woken=0 notifyDrivable=0
[A 零迁移] 旧台账里处于等待停手位的需求数：0
[B 恢复能力] {"target":"REQ-261006164732-6503","stopWrittenBeforeExpiry":true,"resumed":true,
              "stopCleared":true,"recoveryComment":true,"notifyDrivableCalls":1}
EXIT=0
```

## 5. 全量与类型闸门（**含未达标项**）

```text
$ npx tsx scripts/test-baseline.mts --check
[工作树指纹] HEAD 917b39d · 301 files changed · 含未跟踪共 497 个改动（其中未跟踪 196）
[基线] 本次失败 73 条 · 基线 68 条
[差集] 新增失败 12 / 不再失败 7
```

- 12 条新增失败分布在 8 个文件（client-view 3 / live-tasks-single-source 2 / report-tabs 2 /
  kb-generate / prompt-tiers / tools-dispatch / typecheck / compat-regression），
  **逐条 grep 其对本次改动模块的引用计数全为 0** ⇒ 外部并发窗口 WIP，非本需求引入。
- **未达标项（如实登记）**：`npx vitest run tests/kb-generate.test.ts` → **12/13**；
  失败项 `renderCodeMap 确定性与口径对齐`，成因是别窗口改了 `src/domain/knowledge/generate.ts` 与
  `docs/knowledge/code-map.*`；本需求该卡只改 `docs/architecture/*.md` 且未动导出符号。
- 类型闸门：`npx tsc --noEmit -p tsconfig.json` → **1 条**错误
  （`src/client/views/panels/verify.ts` TS2307，未跟踪文件，属别窗口 WIP）；本次改动文件 **0 条**。

## 6. 覆盖标注（每个任务卡 → 覆盖它的证据）

> 口径：**父卡与子卡都标**。同一张卡的 dev / integrate / review / test 子卡由同一组文件与读数覆盖
> （本仓子卡执行引擎在本 profile 不可达，按备忘 §1 的既定出路"由窗口自做并自证收尾"，故四段共享证据）。

### t-b85f4e 等待位契约：清位回调与 notify 开关

covers: t-b85f4e
covers: t-0a673c
covers: t-e6370d
covers: t-ff75d5
covers: t-70dccb
证据：`tests/awaiting-clear-notice.test.ts` 5/5；`tests/dialog-inflight-stop.test.ts` 14/14。

### t-74c612 在途登记分档过期

covers: t-74c612
covers: t-4a7137
covers: t-550e61
covers: t-e499f4
covers: t-293ef2
证据：`tests/awaiting-inflight-ttl.test.ts` 11/11；`tests/pending-confirm-ttl.test.ts` 5/5。

### t-cc3cee 驱动放弃本拍的有界留痕

covers: t-cc3cee
covers: t-191beb
covers: t-29c702
covers: t-158b79
covers: t-6c0ccd
证据：`tests/wake-skip-trace.test.ts` 8/8；`tests/dive-human-gate-stop.test.ts` + `tests/chain-budget.test.ts` 22/22。

### t-9bbb25 组合根与心跳装配

covers: t-9bbb25
covers: t-eda39d
covers: t-6fd170
covers: t-e1d79f
covers: t-438996
证据：`tests/heartbeat-awaiting-resume.test.ts` 4/4；`tests/dive-wake-e2e.test.ts` 5/5；`tests/apply-wiring.test.ts` 7/7。

### t-0c7769 确认收敛点：带 ref 清位先于推进 + 补发条件

covers: t-0c7769
covers: t-6524a2
covers: t-a5d71d
covers: t-a518ac
covers: t-faabca
证据：`tests/confirm-settle-order.test.ts` 7/7；`tests/ask-confirm-pending.test.ts` 13/13；`tests/confirm-advance-deadlock.test.ts` 11/11。

### t-b5e9ee 端到端回归锁

covers: t-b5e9ee
covers: t-1e7c7c
covers: t-68b0ac
covers: t-085b3d
证据：`tests/wake-after-confirm.test.ts` 2/2（含反向演练 `evidence/wake-after-confirm-reverse.md`）；`tests/dive-wake-e2e.test.ts` 5/5。

### t-0808ec 兼容形态与存量恢复演练

covers: t-0808ec
covers: t-792f6a
covers: t-b10216
covers: t-6780e4
证据：`tests/awaiting-compat.test.ts` 7/7；`tests/config-defaults-parity.test.ts` 7/7；
演练脚本 `evidence/legacy-recovery-drill.mts` 退出码 0（副本哈希前后相等）与记录 `evidence/legacy-recovery-drill.md`。

### t-44966a 契约文档与排查手册收口

covers: t-44966a
covers: t-2cd3c9
covers: t-1b5bd8
证据：三份文档关键句可 grep（`confirm-gate-advance.md` 2 处 / `automation-chain-contract.md` 2 处 /
`project-manual.md` 3 处）；**未达标项**：`tests/kb-generate.test.ts` 12/13（归因外部 WIP，见 §5）。

### t-02409e 实施自评与偏离登记

covers: t-02409e
covers: t-80f05b
covers: t-96afed
证据：`reviews/implementation-review.md`（逐条 FR 读数 + 5 项偏离）；`evidence/README.md`；
全量读数 §5；反向演练 §3。
