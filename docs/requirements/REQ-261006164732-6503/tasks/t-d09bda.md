# t-d09bda confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer·复核

> 需求：REQ-261006164732-6503 拆分阶段批准门重复弹框：自动弹框与 agent 显式弹框并存并覆写审批台账

## 在做什么
confirm-settle 落章两前提 + 首写不变 + recordStaleAnswer·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T09:57:41.602Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

复核段完成：两条前提与首写不变逐条一致，三条作答通道边界核对通过（无契约偏离，一处实现口径差异已登记）。

### 完成项

- 对照设计 A-4 两条前提：均已落地（尚未落章 ∧ 仍在来源阶段）；实现口径差异已如实登记（gateOpen 取台账可观测形式，因看板/文字证据通道无 ref）
- 对照设计 I-6 / FR-5：中性回执（confirmed:false + 说明）与只留痕（recordStaleAnswer 不写 checkpoint）均已落地
- 边界核对：首次作答（三条通道）不受影响——前提在首写前为真；已落章的重复确认由 AskConfirm 早退分支先拦（行为未变）
- 边界核对：recordStaleAnswer 不调 stampCheckpoint（无效作答不得带跑断点），与 recordDeclinedConfirmation 的区分成立
- 独立复跑 15 例全绿（4 新 + deadlock 11）+ 相邻 6 套件 61 例全绿 + npx tsc --noEmit 0 错
- 一处措辞不一致（非契约偏离）：设计 A-3 给「复用优先」的理由句不成立（两个分支都不弹框），真实理由是「一道门一条记录」——已登记待归档时改准

### 下一步

父卡 t-ac6dbe 收尾；t7 把迟到作答在后台续跑路径上也接到中性通道。\n

---
