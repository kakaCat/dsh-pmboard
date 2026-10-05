# t-cc716c 把 agent 事件订阅搬到 agent 作用域上·联调

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
把 agent 事件订阅搬到 agent 作用域上·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-02T01:01:47.285Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

联调段：用真实 cordis Context 验证注册位置与注销行为。

### 完成项

- agent/created → agent.ctx 恰好拿到六路；把 agent/status 发在插件 root 上无人接（证明没挂在插件 ctx）
- agent/disposed → 六路全部注销，之后再发状态不再处理（假件会真的摘监听器，不空转）
- 负例三者齐备：warn 命中 agent.ctx、诊断日志命中 [WAKE-FAIL]、需求 comment 命中 [dive-diag]

### 改动文件

- `src/application/dive/round-subscriptions.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-wake-wiring.test.ts`

---
