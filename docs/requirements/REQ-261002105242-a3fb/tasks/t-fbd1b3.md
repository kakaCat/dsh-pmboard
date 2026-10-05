# t-fbd1b3 接线看板两个视图：泳道挂归档条、列表终态分组复活

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
接线看板两个视图：泳道挂归档条、列表终态分组复活

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：ui
- 端侧：frontend

## 得到什么结果
npx vitest run tests/archived-entry.test.ts 中 A1-2、A2、A4 由红转绿（A1-1/A1-3/A1-4/A6 保持绿）；npx vitest run tests/client-view.test.ts 全绿，其中「excludes archived and canceled from lanes」与 toReqCards 断言保持通过（归档不进进行中泳道的语义不倒退）。

## 实施方案（implementation）
src/client/views/board.ts：buildBoard 内 const archivedBar = view === 'list' ? '' : renderArchivedBar(toTerminalCards(state))，并把它拼在 ${body} 之后、.dsh-pm-board 收尾之前（泳道视图才有归档条，列表视图不重复给入口）；buildListView 内 active = toReqCards(state).filter(c => c.req.status !== 'done')，finished = [...toReqCards(state).filter(c => c.req.status === 'done'), ...toTerminalCards(state)]，两段仍各自 byThen 排序、active 在前，分组标题文案改为「已完成 / 已归档 N」。tests/archived-entry.test.ts 追加 A1-2（buildBoard 输出按 data-archived-bar 切两段：段前不含归档需求 id，段内含该 id）与 A2（buildReqDetail(archivedReq, 3 张任务) 含 dsh-pm-dag-panel、3 个 data-task 行、统计「总任务 3」）与 A4（buildListView 传 done+archived+canceled ⇒ 分组标题含「已完成 / 已归档」且归档、取消行可见）。

## 上游产出摘要（dependsSummary）
- 定死终态投影与归档条渲染契约（纯函数 + 复活既有 CSS）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T03:01:27.674Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

这一步做完，什么变了：归档需求从"看板上彻底消失"变成"看板底部一条默认折叠的已归档条、点开即回看"。泳道视图给入口、列表视图给全表，两条路都通到同一张只读详情；这一条正是你上次问"数据是不是被收回"卡住的那一步。

### 完成项

- 看板泳道底部接上「已归档 N」折叠条：归档/取消需求第一次在看板上真的看得见、点得开（此前整页零入口）
- 列表视图的「已完成」死分支修复为「已完成 / 已归档」，归档与取消的需求也能在表格里被翻到
- 同一视图只给一个入口：泳道用归档条、列表用终态分组，不重复
- A1-2 / A2 / A4 三条判据由红转绿；既有 55 条回归无新增失败
- 修订 tests/client-view.test.ts 的泳道断言为「泳道段不含 + 归档条段含」（既守住旧语义，又锁住新入口）

### 改动文件

- `src/client/views/board.ts`
- `tests/client-view.test.ts`
- `tests/archived-entry.test.ts`

### 下一步

t3 终态只读（A3）、t4 僵尸入口清理（A5）；两者完成后 t5 做全量回归与浏览器核对

---
