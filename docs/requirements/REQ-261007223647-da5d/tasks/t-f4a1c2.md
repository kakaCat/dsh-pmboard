# t-f4a1c2 pending 票行组件·测试

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
pending 票行组件·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T16:25:40.818Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这一步做完，票行的每条判据都有读数：选择器在场、超时态在场、bundle 校验通过，且把一个词拼错就会立刻变红。

### 完成项

- 命令：npx vitest run tests/pending-ticket-row.test.ts tests/pending-confirm-band.test.ts tests/pending-band-wiring.test.ts tests/doc-root-badge.test.ts tests/pending-board.test.ts → 5 文件 51 例全绿
- 命令：npx tsc --noEmit → 退出码 0
- 命令：pnpm build:client（tsdown + wrap + verify）→ [verify-client] OK（bundle 784404 字节，关键符号齐全、样式归属章在场、CSS 分片完整）
- 反向验证（防假绿）：把重投按钮的 data-action 拼错一个词 → 立刻红 4 条（含「拼错即红」契约那条），已还原
- 卡上判据逐条对齐：行内倒计时元素选择器在场 ✓；「去作答」「重投」两按钮选择器在场 ✓；超时票显示「已超时」态 ✓；build:client 输出 [verify-client] OK ✓

### 改动文件

- `src/client/views/pending-confirm.ts`
- `tests/pending-ticket-row.test.ts`

### 下一步

父卡收尾：四段子卡全 done 后由父卡 t-1ca419 汇报收口

---
