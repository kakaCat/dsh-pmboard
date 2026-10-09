# t-eadc95 弹框通道限时等待 askTimed·研发

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
弹框通道限时等待 askTimed·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T16:01:03.373Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

研发完成：限时等待通道与安全边口径落地。

### 完成项

- ask-timed.ts：effectiveAskTimeout / assertAskTimeout / racePortAsk / askWithBudget 落地
- ports.ts 增 AskTimedResult 与可选 askTimed 签名
- LIMITS.askSafetyMarginMs 安全边

### 改动文件

- `src/application/internal/ask-timed.ts`
- `src/application/ports.ts`
- `src/domain/limits.ts`

### 下一步

联调子卡：适配器与装饰器接入

---
