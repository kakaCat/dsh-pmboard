# t-f38dec 接上会话运行态读数，判定「哪条需求在跑」·复核

> 需求：REQ-261004210128-283d 看板卡片显示会话运行中动效（泳道图 + 列表）

## 在做什么
接上会话运行态读数，判定「哪条需求在跑」·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T13:31:53.360Z，窗口 session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9）

复核段：读数模块的降级、席位口径与不伪造三条纪律逐条对照设计核过，未发现缺陷。

### 完成项

- 逐行复核 session-running.ts 的降级路径：服务缺失 / list 缺失 / getSnapshot 返回 undefined / byId 缺行 / running 非布尔 五种情形均不抛
- 复核席位口径与 host seatsOf 一致：seats 有值即权威（含显式空数组），缺省折算 sourceSessionId
- 复核不伪造红线：模块内无 updatedAt / autoRun / advanceLockAt 任何近似推断
- 复核判据单点：running 判定与需求映射各一个函数，渲染层只接布尔

---
## 汇报 2（2026-10-04T13:36:51.038Z，窗口 session-3e67edb8-3dbd-4f70-a09f-03dadea5f2a9）

复核段：读数模块与设计逐条对照无实质偏离；两处偏离均已具名（一处增补函数、一处实现取严），无行为差异。

### 完成项

- 对照 design/interfaces.md 逐条核对：isSessionRunning / runningSessionIds / subscribeSessionRunning / requirementRunning 四个契约函数签名与语义一致
- 对照 design/data-model.md 真值表 6 行逐行核对：席位任一在跑 / 席位全空闲 / 缺省折算单 owner / 无关会话 / 人工建卡 / 显式空 seats 全部一致
- 对照 design/architecture.md 三条不变量核对：运行态只读不写（无落盘、无缓存副本）、判据单点、无关会话不重绘
- 跑 6 个受影响测试文件：108 项全绿（含既有无回归断言）
- 偏离 1（增补，非契约变更）：额外导出 relevantSessionIds / sameRunningSet / runningAmong 三个门控辅助函数——architecture.md 描述了「相关集合收敛」行为但未点名函数
- 偏离 2（实现取严）：renderReqCard / renderListCard 的运行态参数实现为布尔（= architecture.md「渲染层只接布尔」），interfaces.md 签名写的是集合；集合→布尔的映射收在 buildBoard / buildListCard 一处，避免两个视图各写一份映射

---
