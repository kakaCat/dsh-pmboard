# t-26d8eb 推进锁续租心跳·复核

> 需求：REQ-261003222428-3556 实施链可靠性硬化：锁心跳 + 批内真并行 + depends_on 落库丢失 + 死代码清偿 + 缺口 N-1~N-3

## 在做什么
推进锁续租心跳·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-03T15:42:54.114Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

复核通过：FR-1 四条设计点全符；两处声明——心跳起停位置改为外层包装（等价安全论证在案）、finally 守卫是同类顺带修复（已声明）；16 用例全绿

### 完成项

- 对照 design/architecture.md「FR-1 · 推进锁续租」逐条核对：心跳 30s/守卫 runId/进程死 stale 兜底/同步路径不变——四条全符
- 偏离声明（一处，有意）：设计写「driveChain finally 先停心跳再清锁」，实现改为心跳起停在 run 包装外层——因 runId 守卫使两序等价安全（注释已写明论证），且不动 driveChain 签名外的结构；意图（不越权）完全保留并更强（finally 也加了守卫）
- 超范围声明（一处，同类）：finally 清锁 runId 守卫是设计外新增——同属锁归属类缺陷（旧 run 收尾可清新 run 锁），开工时已向卡主声明
- 复跑：advance-lock-heartbeat 3 + advance-stale-lock 2 + advance-chain 11 = 16 全绿
- git diff --stat 说明：236 insertions 含并行窗口对本文件的在制改动，本卡增量 ≈ +42 行（心跳函数/守卫/run 包装）

### 改动文件

- `docs/requirements/REQ-261003222428-3556/tasks/t-26d8eb.md`

### 下一步

测试段（t-aab87d）：父卡终态验收命令

---
