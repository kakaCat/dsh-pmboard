# t-e2a84a 给 PendingConfirmRegistry 加只读 findOpen·复核

> 需求：REQ-261006164732-6503 拆分阶段批准门重复弹框：自动弹框与 agent 显式弹框并存并覆写审批台账

## 在做什么
给 PendingConfirmRegistry 加只读 findOpen·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T09:18:50.436Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

复核段完成：对照设计逐条无偏离，5 套件 51 例全绿；两条观察转 t2 用例承载。

### 完成项

- 逐条对照设计 I-4 / G-2 / G-3：签名、只读约束、判定键（不含 windowKey）、open 判据（outcome === undefined）全部一致——无偏离
- 独立复跑 5 套件 51 例全绿（findopen 9 + TTL 5 + ask-confirm-pending 13 + pending-guard 20 + status-pending-confirm 4）
- 纯读核对：findOpen 体内 settle / register / markInterrupted 计数均为 0；createdAt 与 outcome 不被改写
- 观察一（非缺陷，转 t2 锁）：同键存在多条历史记录时 findOpen 返回最先登记的一条（Map 插入序），复用不会被后来者顶掉；「同门唯一」的强制点在 t2 的 requestGate，本层刻意不强制以免动 register 语义
- 观察二（转 t2 用例）：artifact 门必须显式传 kind——不带 kind 的查询 fail-closed 返回 undefined，防 plan 查询误命中 artifact 门

### 下一步

父卡 t-14f9c2 收尾；t2 的用例需锁「artifact 必传 kind」与「同键多记录取最早」。\n

---
