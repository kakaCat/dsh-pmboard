# t-cfb2d4 误物化能一次清掉：仅人的批量清理入口 + 可核对回执·联调

> 需求：REQ-261004121649-bfa7 回退把需求埋了：重做卡递归膨胀且没有撤销入口

## 在做什么
误物化能一次清掉：仅人的批量清理入口 + 可核对回执·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-04T08:51:33.299Z，窗口 session-51baeeda-dbe8-4048-8bc8-b036050d7957）

联调段：写入清单的与读清单的是同一份东西。这一步做完，什么变了——两条回退路径（窗口回退、看板回退）物化出来的卡，都能被同一个清场入口按同一份清单清掉，不会出现「从窗口退的能清、从看板退的清不掉」这种分叉。

### 完成项

- 写入侧同源：会话侧 MoveRequirement.ts:120 与看板侧 requirements.ts:180 都从同一个 taskPlan.reworkDrafts 取 id 写清单
- 读取侧同源：清场入口读的正是 rollback.lastMaterialized（RollbackCleanup.ts:83），没有第二套「哪些算这次物化的」判定
- 回执形状对齐设计 §三：canceled 与 restoredLinks 两个可核对数字（RollbackCleanup.ts:127-128）
- 契约变更点一次盘全：RollbackMark 新增的两个字段只有 rollback.ts 写入、rollback-cleanup.ts 读取，无第三个消费点
- 自测：tests/rollback-cleanup.test.ts → 11 passed（含端到端：一次回退 → 记清单 → 清场只清这批）

### 下一步

复核段：对照 interfaces.md §三 逐条核对（含「仅人」落地方式的人工裁定）

---
