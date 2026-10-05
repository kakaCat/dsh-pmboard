# 回归收口（REQ-261004065652-5c1c t9）

> 一次交付要能被**别人复跑**：本文件里的每条命令都可直接执行，结论都由命令输出说话。
> 判据口径：**新增失败 = 0**（工作区长期带大量存量失败，且多窗口在改同一棵树——比"失败数字"更可靠的是**失败名称集**）。

## 一、反向演练矩阵（护栏真的在拦）

命令：

```bash
npx tsx scripts/reverse-drill-matrix.mts          # 人读
npx tsx scripts/reverse-drill-matrix.mts --json   # 机器可读
```

脚本做三件事：逐个**拿掉**某条修复 → 跑该护栏的判据用例 → 从备份**逐字节还原**（sha256 校验，不一致立即中止）。
还原只用文件级备份，**刻意不用 `git checkout`/`stash`**——本工作区堆着多窗口未提交改动，那是破坏性操作
（2026-10-04 已经踩过一次，见 `AskConfirm.recovery-notes.md`）。

实测输出（2026-10-04，退出码 0）：

```
== 反向演练矩阵（拿掉修复 → 判据必须变红）==
✅ FR-4   投影读己所写（写路径不刷新快照）  →  红 5/应≥5  [tests/store-projection-ryow.test.ts]  如预期变红并已逐字节还原
✅ FR-1   上游致命错误不可重试（AUTH 落进 transient）  →  红 4/应≥4  [tests/dive-loop-breaker.test.ts]  如预期变红并已逐字节还原
✅ FR-3   内存闭锁 fail-closed（起轮前不看闭锁）  →  红 1/应≥1  [tests/dive-loop-breaker.test.ts]  如预期变红并已逐字节还原
✅ FR-5   人工门即停手（起轮前不看台账态的门）  →  红 6/应≥6  [tests/dive-human-gate-stop.test.ts]  如预期变红并已逐字节还原
✅ FR-8   断点留痕限流（窗口置 0）  →  红 2/应≥2  [tests/interruption-dedupe.test.ts]  如预期变红并已逐字节还原
✅ FR-10  引擎开工预检（预检关掉）  →  红 2/应≥2  [tests/advance-engine-precheck.test.ts]  如预期变红并已逐字节还原

[通过] 全部演练如预期变红，且源码逐字节还原。
```

各 FR 的护栏与判据一一对应：

| FR | 护栏 | 反向演练（拿掉什么） | 变红条数 |
|---|---|---|---|
| FR-4 | 写路径同源刷新窄投影 | 注释掉 `factsCache.set` | 5 |
| FR-1 | AUTH 类不可重试 + 全局闩 | `fatal = false`（AUTH 落进 transient） | 4 |
| FR-3 | 内存闭锁 fail-closed | 删掉 `readyToDrive` 里的闭锁判定 | 1 |
| FR-5 | 人工门即停手 | 短路 `humanGate` 检查 | 6 |
| FR-8 | 断点留痕限流 | 限流窗口置 0 | 2 |
| FR-10 | 引擎开工预检 | 短路预检 | 2 |

## 二、全量回归

```bash
npx vitest run --reporter=dot
```

2026-10-04 实测：

```
Test Files  48 failed | 311 passed | 3 skipped (362)
Tests       98 failed | 3635 passed | 20 skipped (3753)
```

### 为什么看「失败名称集」而不是「失败数字」

开工基线（2026-10-04 07:06，本需求动第一行代码之前）：`47 failed files / 97 failed / 3523 passed`。
交付后是 `48 / 98 / 3635`——数字上多了 1 条。为此做了一组**归因实验**（不是猜）：

1. 把本需求四个行为面（人工门检查 / 终态收手 / 启动对账 / 新事件）**逐个短路**重跑全量
   → 失败**名称集逐个无变化**；
2. 再把源码整体回到"t3 等价态"**并移走本需求新增的用例** → 仍是 `48 failed files / 98 failed`，与交付态**完全一致**。

⇒ 结论：**这 1 条差异不是本需求引入的**（套件基线自身漂移：同一份代码两次运行的汇总计数都出现过波动，
而失败名称集稳定）。本需求的交付判据是：

```bash
# 失败名称集与基线逐条比对 → 差异为空
comm -3 <(基线失败名称集) <(当前失败名称集)     # 实测：空
```

**通过数 +112** = 本需求新增用例（t1~t9 共 9 个新文件）+ 其它窗口同期新增的用例。

## 三、类型闸门

```bash
npx tsc --noEmit | grep -c 'error TS'
```

实测：**144** —— 与开工基线**持平**；本需求改动的全部文件零新增类型错误。

## 四、本需求新增的判据用例（全量里的位置）

| 文件 | 条数 | 对应 FR |
|---|---|---|
| tests/upstream-failure.test.ts | 16 | FR-1 / FR-2 / FR-8 |
| tests/provider-latch.test.ts | 8 | FR-1 |
| tests/human-gate.test.ts | 14 | FR-5 |
| tests/chain-budget.test.ts | 15 | FR-11（含 5 条驱动接线） |
| tests/store-projection-ryow.test.ts | 8 | FR-4 / FR-11 |
| tests/dive-loop-breaker.test.ts | 7 | FR-1 / FR-2 / FR-3 / FR-6 |
| tests/dive-abort-latch.test.ts | 5 | FR-3 / FR-6 |
| tests/dive-human-gate-stop.test.ts | 7 | FR-5 |
| tests/dive-terminal-reconcile.test.ts | 10 | FR-9 |
| tests/interruption-dedupe.test.ts | 9 | FR-8 |
| tests/advance-engine-precheck.test.ts | 6 | FR-10 / FR-11 |
| tests/ask-confirm-default-grace.test.ts | 7 | FR-7 |

## 五、脚本类证据

| 脚本 | 用途 | 判据 |
|---|---|---|
| `scripts/reverse-drill-matrix.mts` | 反向演练矩阵（本文件第一节） | 退出码 0 + 逐字节还原 |
| `scripts/reconcile-terminal-drill.mts` | 真台账副本上跑启动对账，逐文件 sha256 比对 | 退出码 0 = 零改写（见 `reconcile-drill.md`） |
