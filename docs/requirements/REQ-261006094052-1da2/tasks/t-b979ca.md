# t-b979ca 早退分支兑现推进：已落章 + 闸门全过则真推进·复核

> 需求：REQ-261006094052-1da2 确认门死锁：已落章未推进后 agent 无路可走

## 在做什么
早退分支兑现推进：已落章 + 闸门全过则真推进·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T01:51:39.578Z，窗口 session-9d5750ad-47dc-4178-b33e-b6531daea6a6）

复核段完成：门禁失败路径无偏离，后门回归用例成立。

### 完成项

- 核对闸门失败两条路径的返回体与改造前逐字一致（含仍有 N 份未登记）
- 核对 note 前缀保留已确认未重复弹框（FR-9/FR-11）
- 核对后门：kind=requirement 在 design 阶段重发确认被 G2 拦下（TC-9 断言状态不变 + gate_failure 在场）
- 核对 design-gate-messages TC-4 第 2 例修正后与新语义一致

### 改动文件

- `tests/confirm-advance-deadlock.test.ts`
- `tests/design-gate-messages.test.ts`

### 下一步

t3 结账后进入 t4/t5

---
