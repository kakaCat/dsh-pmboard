---
serves: FR-1, FR-2
---

# 反向验证记录：拿掉修复必红（REQ-261006170150-52cc · t-b5e9ee）

> 目的：证明 `tests/wake-after-confirm.test.ts` 的绿**是修复换来的**，而不是用例本身恒绿。
> 做法一律是「临时改坏 → 跑 → 记录原始输出 → 立即还原 → 再跑确认转绿」。

## 命令

```bash
npx vitest run tests/wake-after-confirm.test.ts
```

## 反向 ①：把收敛点的清位改回旧的 void 无 ref 调用

改法（`src/application/internal/confirm-settle.ts`）：把 `if (d.dialogRef !== undefined) { await … }`
临时短路成不进入（于是走回旧的 `void exitAwaitingConfirm(…无 ref…)`）。

原始输出（节选）：

```text
FAIL  tests/wake-after-confirm.test.ts > … > TC-11 UC-1：弹框在途 → 人晚答（带 ref）→ 停手位清、status 变、**不注入任何用户消息**就起一轮
AssertionError: 确认之后**没有任何用户消息被注入**；这里为 0 就是本次事故（状态变了、agent 不动）: expected [] to have a length of 1 but got +0
 Tests  1 failed | 1 passed (2)
```

判读：**TC-11 变红、且症状与事故逐字一致**（状态推进了，agent 那一拍被自己挡下 ⇒ inbox 里 0 条回合）。
TC-12 仍绿——它走的是 `AskConfirm` 通道自己的清位出口，不由这一处承担（故还有反向 ②）。

## 反向 ②：拿掉 `AskConfirm` 清位出口的 `onCleared` 接线

改法（`src/application/use-cases/AskConfirm.ts`）：把 `awaiting` 里
`onCleared: deps.notifyDrivable` 的注入临时改为恒不注入。

原始输出（节选）：

```text
FAIL  tests/wake-after-confirm.test.ts > … > TC-12 UC-3：否定作答 → 不落章、不推进，但照样起一轮（修前：什么都不发生）
AssertionError: 否定作答也是"等待结束"；这里为 0 就是"答完否定了、链也停着": expected [] to have a length of 1 but got +0
 Tests  1 failed | 1 passed (2)
```

判读：**TC-12 变红** ⇒ 那两行接线是承重的（`AskConfirm` 的否定作答 / 取消 / 降级 / 挂起收尾
四条清位出口，靠它才接得上链）。

## 还原核对

两次改坏都已还原；还原后：

```text
 ✓ tests/wake-after-confirm.test.ts  (2 tests) 24ms
 ✓ tests/dive-wake-e2e.test.ts        (5 tests)  6ms
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

还原核对方式：`grep -n "if (d.dialogRef !== undefined)" src/application/internal/confirm-settle.ts`
与 `grep -n "onCleared" src/application/use-cases/AskConfirm.ts` 各命中一处（原始形态），
且上表两组用例转绿。

## 结论

| 用例 | 拿掉哪一处会红 | 说明 |
|---|---|---|
| TC-11（肯定作答起轮） | 收敛点带 ref 的 await 清位 | 事故正脸：清位不先于推进、且不放开内存登记 |
| TC-12（否定作答也起轮） | 通道清位出口的 `onCleared` | 「等待结束」必须转成一次驱动请求，否则答完链还停着 |
