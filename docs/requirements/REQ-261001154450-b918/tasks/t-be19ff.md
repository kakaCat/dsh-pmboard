# t-be19ff 收尾闭环可见：closingGap + 看板红标 + 下一步·测试

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
收尾闭环可见：closingGap + 看板红标 + 下一步·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/closing-gap.test.ts → 全绿；并 pnpm test 失败数 ≤ 106（开工前基线）

## 汇报 1（2026-10-01T08:58:08.233Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

测试完成：tests/closing-gap.test.ts 5 条全绿；client-view 52 条通过；全仓 106 failed（= 开工前）不变。

### 完成项

- 测试完成：tests/closing-gap.test.ts 5 条全绿；client-view 52 条通过；全仓 106 failed（= 开工前）不变。

### 改动文件

- `src/domain/status/Predicates.ts`
- `src/application/internal/support.ts`
- `src/client/views/board.ts`
- `tests/closing-gap.test.ts`

---
