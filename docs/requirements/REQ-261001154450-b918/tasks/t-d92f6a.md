# t-d92f6a 批准计划后自动投递一次链·测试

> 需求：REQ-261001154450-b918 收尾门硬化 + 自动链默认开：验收盖章、归档缺尾、节流空转三修

## 在做什么
批准计划后自动投递一次链·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果

npx vitest run tests/auto-advance-note.test.ts → 全绿；并 pnpm test 失败数 ≤ 106（开工前基线）

## 汇报 1（2026-10-01T08:55:49.725Z，窗口 session-5c6e21ed-e2cd-4a84-a733-f2749361dcea）

测试完成：tests/auto-advance-note.test.ts 4 条全绿（未投递给原因 / 无原因不编 / 带 run id / 老形状不误报）；全仓基线不变。

### 完成项

- 测试完成：tests/auto-advance-note.test.ts 4 条全绿（未投递给原因 / 无原因不编 / 带 run id / 老形状不误报）；全仓基线不变。

### 改动文件

- `src/application/internal/auto-advance-note.ts`
- `src/application/internal/confirm-settle.ts`
- `tests/auto-advance-note.test.ts`

---
