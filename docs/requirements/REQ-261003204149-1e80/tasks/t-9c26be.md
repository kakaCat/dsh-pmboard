# t-9c26be 回退判定与状态机：RollbackSpec + 生成式转移表·联调

> 需求：REQ-261003204149-1e80 reqboard_move 回退功能：补齐撤销语义与旧任务卡处置

## 在做什么
回退判定与状态机：RollbackSpec + 生成式转移表·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-03T12:54:04.493Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

联调段结论：本卡没有可联调的接口，验证面是「调用方是否仍成立」——所有消费方都经同一个读取入口，导出形状没动，因此调用方零改动；唯一两处红是仓库既有失败，已用暂存对照证明与本卡无关。

### 完成项

- 核对状态机消费点：protocol 再导出、看板路由、confirm-settle、rollup、capture、confirm-artifact
- 调用方一律经 canReqTransition 与 REQ_TRANSITIONS 读取，导出形状未变 → 调用方零改动
- 类型检查 150 = 基线，无新增错误
- 代表性回归：reqboard 与 stage-boundary 全绿
- routes-rollup 2 例红经暂存对照确认为既有失败（/task/create 回执缺 data.id），与本卡无关

### 下一步

复核段：独立检查回退边完整性与人工门归属

---
