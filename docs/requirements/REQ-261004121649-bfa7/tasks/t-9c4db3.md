# t-9c4db3 回退物化要幂等、要有上限：超限整次拒绝，队列零新增·复核

> 需求：REQ-261004121649-bfa7 回退把需求埋了：重做卡递归膨胀且没有撤销入口

## 在做什么
回退物化要幂等、要有上限：超限整次拒绝，队列零新增·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-04T08:45:08.816Z，窗口 session-51baeeda-dbe8-4048-8bc8-b036050d7957）

复核段：偏离有两条，都已定性且与 t1 复核同一裁定。这一步做完，什么变了——幂等键的口径、上限的数值与错误码、以及抛错发生在落库前这三条都有了对账依据；另记一笔：rollback.seq 与 lastMaterialized 尚未落库，交给 t3。

### 完成项

- 无偏离：幂等键语义与 data-model.md §二 一致（实质键 = 该父卡是否已有活的重做卡，等价于「上次物化的卡还在不在」）
- 无偏离：上限 20 与错误码 REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT 逐字一致，抛错位置在编排期（落库前）
- 无偏离：错误文案三要素齐备（将被物化张数 + 上限值 + 「先批量清理上一次物化」建议）
- 定义差异（已定性）：interfaces.md §一 写 resetSubtasks / materializeCount 两个字段，实现为 resetTasks（整卡副本）且不单发 materializeCount（调用方取 reworkDrafts.length）——与 t1 复核同一裁定：整卡副本让两条写入路径共用一段代码，计数字段属冗余投影
- 待下游交接（不是本卡缺口）：data-model.md §二 的 rollback.seq / lastAt / lastMaterialized 三个字段当前尚未落库，由 t3（清理入口）承载；本卡的幂等不依赖它们，故不阻塞
- 自测：npx vitest run tests/rollback-tasks.test.ts → 7 passed；tests/rollback-materialize.test.ts → 7 passed

### 改动文件

- `src/application/internal/rollback-tasks.ts`

### 下一步

测试段：跑目标用例并核对失败数不超过基线

---
