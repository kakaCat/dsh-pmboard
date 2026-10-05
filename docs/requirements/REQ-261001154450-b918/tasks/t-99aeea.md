# t-99aeea 节流拒绝文案可执行化·联调

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
节流拒绝文案可执行化·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/done-throttle-message.test.ts → 全绿（接口/契约路径）。对无接口的卡：同文件用例覆盖输入输出与错误语义

## 汇报 1（2026-10-01T08:56:58.293Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

联调完成：剩余毫秒由 domain 纯函数算出（doneThrottleRemainingMs），support 只负责取数与拼文案；老形状（拿不到剩余时间）退化为明确话术，不出现"剩余 0 秒"这类假精确。

### 完成项

- 联调完成：剩余毫秒由 domain 纯函数算出（doneThrottleRemainingMs），support 只负责取数与拼文案；老形状（拿不到剩余时间）退化为明确话术，不出现"剩余 0 秒"这类假精确。

### 改动文件

- `src/domain/workflow/DoneEvidenceSpec.ts`
- `src/application/internal/support.ts`
- `tests/done-throttle-message.test.ts`
- `tests/domain/done-evidence.test.ts`

---
