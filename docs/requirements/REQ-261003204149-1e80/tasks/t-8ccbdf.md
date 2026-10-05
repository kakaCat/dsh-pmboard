# t-8ccbdf 注入与断点重算：pendingAction + dive armed·研发

> 需求：REQ-261003204149-1e80 reqboard_move 回退功能：补齐撤销语义与旧任务卡处置

## 在做什么
注入与断点重算：pendingAction + dive armed·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T13:22:09.756Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

回退后不再留着旧阶段的「下一步」：断点会按退回去的那个阶段重算，自动链也会停下来——不会出现「人已经退回去了、系统还在催你交验收」这种情况。

### 完成项

- 新增 resetInjectionAfterRollback 单点函数：断点按新阶段重算 + dive 解除并清 pausedReason
- 两侧入口在状态转移**之后**调用它（stampCheckpoint 按 req.status 现算，早一步会算成旧阶段）
- 核对 pendingActionFor 对 design 已有分支（未交设计 / 未确认设计各有指引），无需补
- t10 验收命令绿：tests/move-rollback.test.ts -t 注入
- 判别力自证：停用断点重算与 dive 解除 → 该用例必红，恢复后 5 例全绿；tsc 150 = 基线

### 改动文件

- `src/application/internal/rollback.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `src/http/routers/requirements.ts`
- `tests/move-rollback.test.ts`

### 下一步

联调段：核对断点重算与 dive 状态在两侧的一致性

---
