# t-ff75d5 等待位契约：清位回调与 notify 开关·复核

> 需求：REQ-261006170150-52cc 修复：弹框作答后不唤醒 agent（确认推进后静默停摆）

## 在做什么
等待位契约：清位回调与 notify 开关·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T09:28:37.616Z，窗口 session-426ba81b-c952-4c52-8535-7e872ec0c69c）

复核等待位契约：回调恰一次、notify 开关、向后兼容与层边界都与设计对得上；复核中发现并补上一处心跳侧端口缺口。

### 完成项

- 逐条对照 design/interfaces.md：AwaitingConfirmDeps.onCleared、ExitAwaitingInput.notify、ExitAwaitingResult 三处形状一致
- 回调纪律复核：仅 cleared ∧ notify!==false ∧ 端口在场才回调；回调 try/catch，抛错只 warn 且不回滚清位
- 向后兼容复核：既有三个调用点（confirm-settle、gate-prompt、AskConfirm）均未传 onCleared，行为逐字不变
- 回归面复核：dialog-inflight-stop 14/14、ask-confirm-pending 13/13 全绿（作答后不投递的断言仍绿）
- 层边界复核：本卡改动只 import application 内部与 domain/shared 类型，无新增越层 import
- 缺口修复：卡里点名的 WakeHeartbeatDeps.notifyDrivable 未落，按卡补在 src/application/dive/wake-heartbeat.ts（对账清位的消费留给 t-9bbb25）
- 设计文档偏差登记：interfaces.md 把 WakeHeartbeatDeps 写在 src/application/ports.ts 名下，实际在 src/application/dive/wake-heartbeat.ts（供 t9 自评登记）
- 范围外观察（不动）：src/application/internal/subtask-evidence.ts 留有调试 console.log，属别窗口 WIP

### 改动文件

- `src/application/dive/wake-heartbeat.ts`

### 下一步

t-70dccb 测试段：跑两条 acceptance 命令并留下读数

---
