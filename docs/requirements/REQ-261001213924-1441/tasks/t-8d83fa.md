# t-8d83fa 加心跳兜底与唤醒链诊断·研发

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
加心跳兜底与唤醒链诊断·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T01:03:22.969Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

研发段：加一颗心跳——只去叫那些"该跑却没动静"的需求，叫不动就如实记下来。

### 完成项

- 新增 wake-heartbeat：tick() 对账；只在「可驱动 + 停滞超过 10 分钟」时唤醒（新建需求视为停滞，叫一次）
- 叫醒成功 → 记 lastWakeAt、连续失败计数归零；失败累计 3 次 → 只写运行时健康 paused(wake-undeliverable) 并留 [dive-diag] comment
- activation 在所有分支都不被改写；管理器 60s 跑一趟（unref，不吊住进程），并暴露 wakeTick() 供看板/诊断手动触发

### 改动文件

- `src/application/dive/wake-heartbeat.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-rearm.test.ts`

---
