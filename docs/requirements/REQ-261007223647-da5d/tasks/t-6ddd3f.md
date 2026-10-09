# t-6ddd3f 确认票超时不丢与一键重投·研发

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
确认票超时不丢与一键重投·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-07T16:06:59.665Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

研发完成：立项等待走预算内通道，超时不再被判成取消。

### 完成项

- CaptureRequirement 两段等待接入 askWithBudget（预算内等待 + pending 中性回执）
- 新增 tests/confirm-repost.test.ts：等待超时中性回执 + 对照成功路径

### 改动文件

- `src/application/use-cases/CaptureRequirement.ts`
- `tests/confirm-repost.test.ts`

### 下一步

联调子卡：路由与处理器接线

---
