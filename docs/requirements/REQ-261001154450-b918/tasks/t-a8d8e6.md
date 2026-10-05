# t-a8d8e6 挂起确认 TTL 与过期回执·联调

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
挂起确认 TTL 与过期回执·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/pending-confirm-ttl.test.ts → 全绿（接口/契约路径）。对无接口的卡：同文件用例覆盖输入输出与错误语义

## 汇报 1（2026-10-01T08:53:29.667Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

联调完成：过期判定单点（(interruptedAt ?? createdAt) + ttl）不受影响；中止过的挂起从中止时刻重新计时，旧记录语义不变。

### 完成项

- 联调完成：过期判定单点（(interruptedAt ?? createdAt) + ttl）不受影响；中止过的挂起从中止时刻重新计时，旧记录语义不变。

### 改动文件

- `src/adapters/PendingConfirmRegistry.ts`
- `src/domain/limits.ts`
- `tests/pending-confirm-ttl.test.ts`

---
