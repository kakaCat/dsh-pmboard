# t-e5fd69 点已归档窗口能回到那个会话：先取消归档、再打开·测试

> 需求：REQ-261002153446-c600 看板窗口 chip：已归档会话点击后取消归档并打开

## 在做什么
点已归档窗口能回到那个会话：先取消归档、再打开·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T07:40:34.019Z，窗口 session-4c565f55-a7af-4e7f-8b37-5033c0c2a255）

测试完成：已归档会话的跳转语义被单测锁死——顺序、失败不打开、无能力旧语义、未归档零副作用

### 完成项

- npx vitest run tests/session-jump.test.ts → 11 passed
- 断言时间线 ['unarchive:s-arch','selectPanel:null','openSession:s-arch'] 且返回 opened
- 断言恢复抛错 → restore-failed 且时间线不含 openSession
- 断言无 unarchiveSession 能力 → archived 且时间线为空

### 改动文件

- `tests/session-jump.test.ts`

### 下一步

交回父卡收尾

---
