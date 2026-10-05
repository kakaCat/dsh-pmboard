# t-a377ac 回退判定与状态机：RollbackSpec + 生成式转移表·研发

> 需求：REQ-261003204149-1e80 reqboard_move 回退功能：补齐撤销语义与旧任务卡处置

## 在做什么
回退判定与状态机：RollbackSpec + 生成式转移表·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-03T12:53:31.208Z，窗口 session-a3e5e82b-b588-4c77-b458-9c2065eb0e87）

研发段做完：回退从「只能退回固定的一两个节点、且实施态要人点」变成「任意更早节点皆可退、由 agent 自行判断」，而判定规则全仓只有一处。

### 完成项

- RollbackSpec 落地：回退判定、阶段序、可退目标三件纯函数
- 状态机改生成式：前进边显式 + 回退边按序生成，漏键即编译报错
- 移除 implementing→design 人工门；回程四类人工门原样保留
- 19 例单测：真值表／可退目标／撤销作用域／转移表／人工门归属
- 判别力自证：回退目标恒为空时 5 条断言必红，恢复后全绿

### 改动文件

- `src/domain/requirement/RollbackSpec.ts`
- `src/domain/requirement/RequirementStatus.ts`
- `tests/rollback-domain.test.ts`

### 下一步

联调段：本卡只动 domain 纯函数与常量表，联调面为「调用方是否仍编译通过」

---
