# t-ffa853 AskConfirm 改走 requestGate 且陈旧票清理分门·复核

> 需求：REQ-261006164732-6503 拆分阶段批准门重复弹框：自动弹框与 agent 显式弹框并存并覆写审批台账

## 在做什么
AskConfirm 改走 requestGate 且陈旧票清理分门·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-06T09:27:56.061Z，窗口 session-d210345f-6bd2-4a05-be59-e859c70b86c5）

复核段完成：接线与返回体形状逐条一致；一处清理归属偏离设计（迁到建门处）已如实登记并给出实测依据。

### 完成项

- 对照设计 I-2 调用点表：AskConfirm 一行按「先 requestGate、opened 才投递」落地——该行无偏离；adopted_ticket 例外已在代码与用例中写明理由
- 对照设计 I-3：reused 返回体只用既有键（pending / ticket / note），未新增返回键——用「键集」断言可核
- 对照设计 I-5 与 B-3 的**归属修正**（如实登记）：清理动作由 AskConfirm 迁到 gate-request 建门分支。原设计把清理写在 AskConfirm，但登记已收进 requestGate；留在原地会被 adopt 分支跳过（实测 TC-10b 当场红）
- 对照设计 A-4/FR-4 的前置：仍由 t6 的落章前提把关（本卡只保证不再产生第二道门）
- 独立复跑 9 套件 94 例全绿 + npx tsc --noEmit 0 错
- 口径修正复核两条：TC-10 改写为复用语义（旧名「覆盖旧记录」）、新增 TC-10b 锁异门清理——均为必要修正，非放宽

### 下一步

父卡 t-aa311c 收尾；t6 落地「门仍 open ∧ 仍在来源阶段」两个前提。\n

---
