# t-df1ad9 把 agent 事件订阅搬到 agent 作用域上·复核

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
把 agent 事件订阅搬到 agent 作用域上·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T01:01:47.569Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

复核段：与宿主机制逐条对照，并把不一致处如实记下。

### 完成项

- 核对宿主：agent/created 载荷 { agent, source, signal }；agent.ctx 存在于 agent-loop/src/agent.ts:105
- 核对接线：index.ts:386-387 两个 attach 端口形状不变，组合根与工具面无破坏性改动
- 【重要发现，须人裁决】FR-3 的「agent/* 被 scope 过滤器丢弃」这一前提**未被宿主机代码证实**：scopeTarget 的过滤器对**未打标签**的 ctx 一律放行（packages/core/scope/src/index.ts:171-176），而本插件经 profile 以普通 loader 条目装载（~/.dsh/profiles/web/cordis.patch.yml 无 isolate/scope），其 ctx 未打标签；宿主自带的 goal-round-driver 也把 agent/status 挂在插件 ctx 上且在生产可用（packages/goal/goal-round-driver/src/index.ts:245,269）。宿主规范给出的搬到 agent.ctx 的理由是**生命周期归属**（agent 处置即注销），不是作用域过滤。本卡改动按后者成立，并新增 [WAKE-RX] 接收证明，使「事件没到」与「到了但驱动侧断」可从诊断日志区分。

### 改动文件

- `src/application/dive/round-subscriptions.ts`
- `src/application/dive/ReqboardDiveManager.ts`
- `tests/dive-wake-wiring.test.ts`

---
