# t-f2ff7b 确认票超时不丢与一键重投·联调

> 需求：REQ-261007223647-da5d P1：弹框与确认门体验优化

## 在做什么
确认票超时不丢与一键重投·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run tests/` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-07T16:06:59.929Z，窗口 session-3a744c5e-7560-408e-8db1-5f27fecc8150）

联调完成：重投查询端点接上，三条响应分支都有用例。

### 完成项

- POST /dashboard/api/reqboard/confirm/repost 接线完成（routes.ts 分发 + handleConfirmRepost 导出）
- 联调证据：tests/confirm-repost.test.ts 三条端点用例通过（still-open / gone / unavailable）

### 改动文件

- `src/http/routers/requirements.ts`
- `src/http/routes.ts`

### 下一步

复核子卡：核对设计 IF-4 与实现差异

---
