# t-be3d40 挂起确认 TTL 与过期回执·测试

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
挂起确认 TTL 与过期回执·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/pending-confirm-ttl.test.ts → 全绿；并 pnpm test 失败数 ≤ 106（开工前基线）

## 汇报 1（2026-10-01T08:53:30.112Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

测试完成：tests/pending-confirm-ttl.test.ts 5 条全绿；全仓 pnpm test 106 failed（= 开工前基线）/ 2848 passed。

### 完成项

- 测试完成：tests/pending-confirm-ttl.test.ts 5 条全绿；全仓 pnpm test 106 failed（= 开工前基线）/ 2848 passed。

### 改动文件

- `src/adapters/PendingConfirmRegistry.ts`
- `src/domain/limits.ts`
- `tests/pending-confirm-ttl.test.ts`

---
