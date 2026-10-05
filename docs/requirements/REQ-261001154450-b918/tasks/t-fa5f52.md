# t-fa5f52 挂起确认 TTL 与过期回执·研发

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
挂起确认 TTL 与过期回执·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/pending-confirm-ttl.test.ts → 全绿；且对应源文件改动可在 git diff 中看到

## 汇报 1（2026-10-01T08:53:29.416Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

研发完成：挂起确认的有效期不再借用「文字证据窗口」（1 小时），改为自己的具名常量 LIMITS.pendingConfirmTtlMs = 30 分钟——陈旧挂起不再拖到把人挡在收尾门外。

### 完成项

- 研发完成：挂起确认的有效期不再借用「文字证据窗口」（1 小时），改为自己的具名常量 LIMITS.pendingConfirmTtlMs = 30 分钟——陈旧挂起不再拖到把人挡在收尾门外。

### 改动文件

- `src/adapters/PendingConfirmRegistry.ts`
- `src/domain/limits.ts`
- `tests/pending-confirm-ttl.test.ts`

---
