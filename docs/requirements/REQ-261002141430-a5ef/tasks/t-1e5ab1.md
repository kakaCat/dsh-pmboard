# t-1e5ab1 落地「在途弹框登记 + 停手位」契约·研发

> 需求：REQ-261002141430-a5ef 弹框在途即停手：PM 弹框出现时写 Dive 暂停态、作答后恢复

## 在做什么
落地「在途弹框登记 + 停手位」契约·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T06:33:09.876Z，窗口 session-0dc94a2a-9c00-455b-ac58-f96624a21da2）

这一步做完：新增「在途弹框登记 + 停手位」模块与登记表实现——自动链从此有一个同步可问的「有人在等吗」判据，弹框在途时能写下一个可观测、可幂等清除的停手位。

### 完成项

- 新增 AWAITING_CONFIRM_PREFIX 前缀常量（单点定义）
- enterAwaitingConfirm：先同步登记在途，再异步写 dive.driverHealth=paused + 留痕一条
- exitAwaitingConfirm：幂等清位回 healthy 并留痕（写明出口）
- dialogInFlightFor：纯内存同步判据，判据抛错按无在途放行（不静默停摆）
- isAwaitingConfirmStop 与 awaitingRefOf：台账侧谓词供心跳对账
- PendingConfirmRegistry 实现 DialogInFlightPort，与既有 ticket 表同实例
- 台账写失败：告警恰一次 + 日志，且拦截仍生效（拦截优先于台账美观）
- 回归用例 TC-9 两条断言：改动后绿

### 改动文件

- `src/application/internal/awaiting-confirm.ts`
- `src/adapters/PendingConfirmRegistry.ts`
- `src/application/ports.ts`
- `tests/dialog-inflight-stop.test.ts`

### 下一步

接线：把判据接到回合投递与实施链（t2/t3）

---
