# t-f677ce 抽统一收尾 finishConfirmAdvance 并接进推进单点·联调

> 需求：REQ-261007135258-331a 确认通道接线收敛：四条通道统一走「落章 + 推进 + 收尾」单点

## 在做什么
抽统一收尾 finishConfirmAdvance 并接进推进单点·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/confirm-advance-finish.test.ts` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T06:05:00.364Z，窗口 session-f22c57a8-ab6f-4822-806f-7f852cf43e7e）

联调段：四通道调用面接入单点，无第二份推进实现。

### 完成项

- 单点与四通道调用面接通（看板 / 文字证据改调 applyConfirmedAdvance）
- confirm-settle 弹框路径收尾改走同一实现

### 改动文件

- `src/application/internal/confirm-settle.ts`
- `src/http/routers/requirements.ts`
- `src/application/use-cases/ConfirmArtifact.ts`

---
