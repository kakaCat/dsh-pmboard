# t-9aa25b 落库层收敛：landApprovedPlan 三入口共用 + 读数取真实记录·复核

> 需求：REQ-261002164800-d8f2 修复计划落库 refs 断链：门禁不对称 + 计划通道丢字段 + 无补写入口

## 在做什么
落库层收敛：landApprovedPlan 三入口共用 + 读数取真实记录·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T09:13:47.234Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

复核：设计与实现逐条对齐，两处偏离如实登记（创作路径未套同一包装层、看板入口留给 t4）

### 完成项

- 对照 design/interfaces.md：landApprovedPlan 入参出参（created/createdCount/unrefed/alreadyLanded/warning/rtm）与 LandingSource 枚举 —— 一致
- 对照 design/architecture.md 不变量一：落库编排单点达成（人工入口只剩一处调用点）
- 对照 design/data-model.md 读数口径：task_coverage 取自真实 TaskRecord（按 createdIds 过滤），covers_frs 等于卡上 refs —— 一致（用例断言）
- 对照 design/backend.md 尺寸约束：confirm-settle 392 行 ≤400（修前 439）
- 偏离 1（如实登记）：三入口「共用 landApprovedPlan」只对两条人工入口成立；Decompose 的创作路径仍直接调 landPlanTasks（它要落的 draft 不在批准计划里），共用的是取数点与落库函数
- 偏离 2（如实登记）：t3 只接线了批准弹框入口；看板批准入口的接线是 t4 的范围，本卡未越界

### 下一步

交测试子卡：跑本卡用例与全量基线

---
