# t-a5aff0 达上限不再锁死：人一动就能继续·研发

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
达上限不再锁死：人一动就能继续·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T00:57:39.852Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

研发段：把"跑满了"和"坏掉了"都改成"停下等人"——不再把需求永久锁死。

### 完成项

- round-driver：disarm 只写 driverHealth（不改 activation）；teardown 不写任何状态
- round-driver：达上限写 driverHealth={paused, reason:round-limit:<阶段>}，comment 给出恢复路径
- rearm.ts 升级为 recoverHealth：运行时暂停清回 healthy；存量误停摆（disarmed+active）仍可恢复；人主动暂停/已健康一律零写入
- 看板「继续」入口沿用同一函数（旧名 rearmIfRecoverable 作为别名）

### 改动文件

- `src/application/dive/round-driver.ts`
- `src/application/internal/rearm.ts`
- `tests/dive-round-driver.test.ts`
- `tests/dive-rearm.test.ts`

---
