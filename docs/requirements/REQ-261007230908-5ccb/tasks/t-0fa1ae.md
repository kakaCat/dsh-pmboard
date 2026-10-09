# t-0fa1ae client toolviews 映射改从注册表派生·测试

> 需求：REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点）

## 在做什么
client toolviews 映射改从注册表派生·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-07T15:53:56.365Z，窗口 session-e21fb5e6-9b01-4369-9c11-aafd4e62e507）

t4 测试段：client 面 52/52 绿、build:client OK、typecheck 0，三判据全过

### 完成项

- 判据一：client 面 7 套件 52/52 绿（api-client / client-api-resolve / client-page-panel / client-page-register / toolviews-contract / tools-render-coverage / error-code-registry T5）
- 判据二：pnpm build:client 退出码 0 + verify-client OK（778062 bytes）
- 判据三：pnpm typecheck → 0 错
- 全仓失败项=他窗在飞文件所致，本卡相关套件零失败

### 下一步

t4 父卡收尾

---
