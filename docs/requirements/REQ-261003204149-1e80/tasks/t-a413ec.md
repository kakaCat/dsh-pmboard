# t-a413ec 数据契约：rollback / reworkOf 可选字段·复核

> 需求：REQ-261003204149-1e80 reqboard_move 回退功能：补齐撤销语义与旧任务卡处置

## 在做什么
数据契约：rollback / reworkOf 可选字段·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-03T12:59:55.913Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

复核段结论：字段与设计文档逐条对得上，没有偷偷多引入第三个字段；唯一的写法差异是类型引用形式，语义等价。

### 完成项

- 逐条对照 design/data-model.md：rollback 结构（from／to／at／by／reason）一致
- TaskRecord.reworkOf 为 string 且可选，与设计一致
- 未引入设计外的第三个字段（无 supersededAt 之类失效标记，复用既有清章口径）
- 一处等价写法：from／to 用 RequirementRecord['status'] 而非 RequirementStatus，类型等价且不依赖 import 形态
- 改动只落在 src/shared/protocol.ts；三处落点已逐一定位（RollbackMark 定义、rollback 字段、reworkOf 字段）

### 下一步

测试段：跑兼容性回归并留证

---
