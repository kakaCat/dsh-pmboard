# t-cdb5b9 用例接入：工具侧与看板侧共用编排·研发

> 需求：REQ-261003204149-1e80 reqboard_move 回退功能：补齐撤销语义与旧任务卡处置

## 在做什么
用例接入：工具侧与看板侧共用编排·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T13:19:27.135Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

缺口合上了：回退现在两侧共用同一套编排——退回去时下游的确认会被如实作废、旧卡会被取消并物化重做卡。也就是说，从这一刻起「退了但没作废」那个窗口不再存在。

### 完成项

- 工具侧 MoveRequirement 接入编排：副本预演 → 任务先写 → 需求后写 → 回执带 rollback 四键
- 看板侧 handleReqMove 接入同一编排：异步铸 id 后交给同步编排口，落卡与撤销同序
- 回执双通道同形：两侧都产出 rollback 块，键集逐字相同
- 验收命令绿：tests/move-rollback.test.ts -t 双通道；grep 确认两侧各 ≥1 次调用同一编排
- 判别力自证：让工具侧不做编排 → 双通道用例必红（两侧立刻不一致）
- 过程中修正两处夹具问题并记录：断言需按需求 id 归一化；两侧必须共用同一 TaskStore 实例

### 改动文件

- `src/application/use-cases/MoveRequirement.ts`
- `src/http/routers/requirements.ts`
- `tests/move-rollback.test.ts`

### 下一步

联调段：核对看板侧回执形状与前端消费面

---
