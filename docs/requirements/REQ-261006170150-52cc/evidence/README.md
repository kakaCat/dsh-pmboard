---
serves: FR-1, FR-2, FR-3, FR-4
---

# 证据索引（REQ-261006170150-52cc）

> 本目录只放**可复核的原始读数**（命令 + 输出摘要 + 脚本）。结论与偏离登记在
> `../reviews/implementation-review.md`；过程备忘在 `../notes/implementing-notes.md`。

## 1. 目录内容

| 文件 | 是什么 | 怎么复核 |
|---|---|---|
| `legacy-recovery-drill.mts` | **存量恢复演练脚本**：只读真台账，全部 store 指向 mkdtemp 副本；Phase A 证零迁移、Phase B 在真实历史记录上造过期等待位证恢复可用 | `npx tsx docs/requirements/REQ-261006170150-52cc/evidence/legacy-recovery-drill.mts`（退出码 0 ⇔ 副本哈希前后相等） |
| `legacy-recovery-drill.md` | 上面那支演练的**记录**：命令、输出摘要、副本 sha256 前后值、Phase B 逐项断言 | 读记录；哈希判据是"同一次运行内前后相等"（台账是活的，绝对值会变） |
| `wake-after-confirm-reverse.md` | **反向验证记录**：两次"拿掉修复必红"的原始输出 + 还原核对 | 照记录里的改法复现；还原后 7/7 转绿 |

## 2. 用例读数在哪

本次修复的判据全部落在测试里（`npx vitest run <文件>`）：

| 文件 | 锁什么 | 读数（交付时） |
|---|---|---|
| `tests/awaiting-clear-notice.test.ts` | 清位回调恰一次 / `notify:false` 抑制 / 回调抛错不外溢 | 5/5 |
| `tests/awaiting-inflight-ttl.test.ts` | 在途登记分档过期（挂起 30 分钟 / 阻塞 60 分钟）与惰性摘除 | 11/11 |
| `tests/confirm-settle-order.test.ts` | 清位**先于**推进；补发条件（成功 0 / 被拦 1 / 抛错 1）；第二票在场不清位 | 7/7 |
| `tests/heartbeat-awaiting-resume.test.ts` | 过期对账：清位 + `resumed` + `notifyDrivable` 恰 1 次 | 4/4 |
| `tests/wake-skip-trace.test.ts` | `[WAKE-SKIP]` 有界留痕（同因 60s 冷却、异因互不影响） | 8/8 |
| `tests/wake-after-confirm.test.ts` | **端到端**：确认后不注入任何用户消息即起一轮（含否定作答） | 2/2 |
| `tests/awaiting-compat.test.ts` | 三种装配形态与旧行为一致且不抛 | 7/7 |

## 3. 与既有基线的分工（别把外部红读成本次红）

`npx tsx scripts/test-baseline.mts --check` 打的是**集合差**（不是数字上限），并附带工作树指纹。
交付时的工作树里同时有**别的窗口**在改（`REQ-261006164732-6503` 等），所以：

- **判据**：新增失败里，凡是"不引用本需求模块"的文件，都不是本需求引入的——
  实测用 `grep -c` 对每个失败文件数它与本需求模块（`awaiting-confirm` / `confirm-settle` /
  `wake-heartbeat` / `round-driver` / `wake-skip-trace` / `PendingConfirmRegistry`）的引用数，**全为 0**；
- **处置**：确认非本次引入后**不 refresh 基线**、也**不代改**别窗口文件；
- 逐条读数与归因见 `../reviews/implementation-review.md` §4。
