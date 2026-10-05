# t-d2bc95 把 agent 事件订阅搬到 agent 作用域上·研发

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
把 agent 事件订阅搬到 agent 作用域上·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T01:01:46.970Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

研发段：每个 agent 的事件订阅改由它自己的作用域持有——agent 走了订阅就跟着注销。

### 完成项

- round-subscriptions 拆为 root 组（2 路）与 per-agent 组（6 路：status/pre-step/inbox*3/error/disposed）
- ReqboardDiveManager 经 agent/created 拿 agent，把 per-agent 六路注册到 agent.ctx，并按 agent id 记住解绑函数
- 拿不到 agent.ctx 时响亮失败：warn + 诊断日志 + 需求 comment 三者齐备
- 新增 [WAKE-RX] 接收证明（agent/status 到达即写诊断），把"订阅成立"与"事件送达"两件事分开观测

### 改动文件

- `src/application/dive/round-subscriptions.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-wake-wiring.test.ts`

---
