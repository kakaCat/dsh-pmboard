# t-4deef0 节流拒绝文案可执行化·测试

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
节流拒绝文案可执行化·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/done-throttle-message.test.ts → 全绿；并 pnpm test 失败数 ≤ 106（开工前基线）

## 汇报 1（2026-10-01T08:56:58.878Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

测试完成：tests/done-throttle-message.test.ts 3 条 + 既有 done-evidence 8 条全绿（后者按新文案更新了断言）；全仓 106 failed（= 开工前）不变。

### 完成项

- 测试完成：tests/done-throttle-message.test.ts 3 条 + 既有 done-evidence 8 条全绿（后者按新文案更新了断言）；全仓 106 failed（= 开工前）不变。

### 改动文件

- `src/domain/workflow/DoneEvidenceSpec.ts`
- `src/application/internal/support.ts`
- `tests/done-throttle-message.test.ts`
- `tests/domain/done-evidence.test.ts`

---
