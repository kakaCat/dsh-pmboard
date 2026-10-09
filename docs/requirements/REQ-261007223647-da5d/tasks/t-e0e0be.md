# t-e0e0be pending 票首屏横带组件·测试

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
pending 票首屏横带组件·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T16:26:39.561Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，横带的三条判据都有读数，空票时「连容器都不出现」这条被断言钉住。

### 完成项

- 命令：npx vitest run tests/pending-confirm-band.test.ts tests/pending-band-wiring.test.ts tests/pending-ticket-row.test.ts → 3 文件全绿
- 命令：npx tsc --noEmit → 退出码 0
- 命令：pnpm build:client → [verify-client] OK（bundle 784404 字节，样式分片完整）
- 反向验证（防假绿）：让容器在空数组时也输出容器（去掉零渲染短路）→ 相关「空 → 零渲染」断言立刻变红（此变异已在 t9 组件用例的形态下可复现：空数组断言 toBe('')）
- 卡上判据逐条对齐：pending_confirms 非空 → Band 容器与逐行 TicketRow 在场 ✓；空 → 容器选择器不存在（空串）✓；build:client OK ✓

### 改动文件

- `tests/pending-confirm-band.test.ts`

### 下一步

父卡收尾：四段子卡全 done 后由父卡 t-2c33b8 汇报收口

---
