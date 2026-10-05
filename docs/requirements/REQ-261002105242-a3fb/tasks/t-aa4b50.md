# t-aa4b50 接线看板两个视图：泳道挂归档条、列表终态分组复活·研发

> 需求：REQ-261002105242-a3fb 归档需求在看板失去入口：恢复「已归档」区，让历史需求的 DAG/任务仍可查看

## 在做什么
接线看板两个视图：泳道挂归档条、列表终态分组复活·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T03:00:56.909Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

研发子卡完成：看板上第一次真的能看见归档需求了——泳道底部多出折叠的「已归档 N」条，点条目的 DAG 入口通了；列表视图的「已完成」死分支也收进了归档行。全程只接在渲染层，未动数据。

### 完成项

- buildBoard 在泳道视图追加 renderArchivedBar(toTerminalCards(state))，列表视图不追加（避免同视图双入口）
- buildListView 的 finished 改为 done ∪ toTerminalCards，分组标题改「已完成 / 已归档 N」——死分支复活
- tests/archived-entry.test.ts 的 A1-2 / A2 / A4 由红转绿
- 修订 tests/client-view.test.ts 的「归档/取消不进泳道」用例：判据从「整页不含」精确化为「泳道段不含 + 归档条段含」（既有语义不倒退，同时锁住新入口）

### 改动文件

- `src/client/views/board.ts`
- `tests/client-view.test.ts`
- `tests/archived-entry.test.ts`

### 下一步

复核子卡：核对泳道/列表两条入口与设计 §3 一致

---
