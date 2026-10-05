# t-e62d4f 接线看板两个视图：泳道挂归档条、列表终态分组复活·复核

> 需求：REQ-261002105242-a3fb 归档需求在看板失去入口：恢复「已归档」区，让历史需求的 DAG/任务仍可查看

## 在做什么
接线看板两个视图：泳道挂归档条、列表终态分组复活·复核

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
对照 `docs/requirements/<REQ>/design/` 逐条核对；`npx vitest run <相关测试文件>` → 全绿；无偏离时显式写明「无偏离」及依据

---
## 汇报 1（2026-10-02T03:01:06.232Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

复核结论：接线与设计 §1/§3 无偏离；唯一偏差是设计文档的既有用例清单漏了一条（client-view 的泳道断言），已按真实语义精确化修订并在记录里点名，不是"改测试迁就代码"。

### 完成项

- 对照 design/interfaces.md §3：泳道视图追加归档条、列表视图不追加（同一视图不重复给入口）——与文档逐字一致
- 对照 design/interfaces.md §1 与 data-model.md §3：列表 active / finished 口径改为 done ∪ 终态，两段各自 byThen 排序、active 在前，分组标题「已完成 / 已归档 N」
- 发现并处理一处**设计文档未列出的既有断言**：tests/client-view.test.ts「归档/取消不进泳道」原先断言整页不含这两个 id——归档条回归后必然红。按其真实语义修订为「泳道段（归档条之前）不含 + 归档条段含」，语义不倒退且更精确；这是设计文档用例清单的漏项（只列了两条），已在完工记录与验收材料中显式记账
- 跑 npx vitest run tests/archived-entry.test.ts：A1-2/A2/A4 由红转绿；A1-1/A1-3/A1-4/A6 保持绿
- 跑 npx vitest run tests/client-view.test.ts tests/token-card.test.ts：55 passed 全绿（含修订后的泳道断言）

### 改动文件

- `src/client/views/board.ts`
- `tests/client-view.test.ts`
- `tests/archived-entry.test.ts`

### 下一步

测试子卡：跑本卡改动相关的三份用例并给出结论

---
