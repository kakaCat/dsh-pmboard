# t-52cd3a 数据契约：rollback / reworkOf 可选字段·研发

> 需求：REQ-261003204149-1e80 reqboard_move 回退功能：补齐撤销语义与旧任务卡处置

## 在做什么
数据契约：rollback / reworkOf 可选字段·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T12:59:37.255Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

研发段做完：需求台账上多了一个「退过没」的标记，任务卡上多了一层「这是在重做哪张卡」的关系——两个字段都可选，旧数据不用搬家。

### 完成项

- RequirementRecord 新增可选 rollback 字段，并定义 RollbackMark 类型
- TaskRecord 新增可选 reworkOf 字段：重做卡指向被取代的旧卡
- 注释写明语义：rollback 是状态标记只存最近一次，历史归 statusHistory 与评论
- 类型检查 150 = 基线，无新增错误

### 改动文件

- `src/shared/protocol.ts`

### 下一步

联调段：核对两个字段对读取路径无破坏

---
