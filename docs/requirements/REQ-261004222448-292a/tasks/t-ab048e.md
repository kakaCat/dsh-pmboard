# t-ab048e 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：frontend

## 得到什么结果
命令 pnpm test -- tests/report-shell 全绿；断言包含：首屏请求数不超过 2 且不含正文；未点过的 Tab 请求数返回 0；未激活面板的 token 选择器返回 null；模拟一次 revision 变更后滚动位置、展开态、当前 Tab 均不变；终态下动作按钮数返回 0；档二渲染不包含文档表、成本、提示词正文选择器。

## 实施方案（implementation）
新增三个视图文件：src/client/views/report-head.ts（结论头、窗口跳转按钮、操作条按钮与后果说明、终态只读）、report-band.ts（做到哪了、缺口、结果与成效三格）、report-tabs.ts（六个同级 Tab、角标数字、切到才请求、未激活面板不入 DOM、按需求与 Tab 与 revision 组成的内存缓存键）；改 src/client/board-mount.ts 为分段局部更新；档二收敛到同一数据模型，档一不改。

## 上游产出摘要（dependsSummary）
- 接线六条只读路由（分页 + 入参校验 + 降级）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-05T01:44:39.460Z，窗口 session-00af6c69-e55e-4878-8d4e-74056a439b01）

这一步做完，详情页的骨架站住了：一屏看到「现在怎么样、我该做什么」，下面六个同级 Tab 切到才取数；台账一变只换该换的那两块，滚动与展开态不再归零；打字不会因为重绘而丢。

### 完成项

- 壳落地：结论头与操作条、状态带三格、六个同级 Tab（默认汇报）
- 切到才请求、未激活面板不入产物、同一版本切回走缓存；台账变更只换头部与当前 Tab
- 只读态只留返回看板，不渲染任何写动作；窗口跳转与角色标注保留
- 两处评论框撞车修掉（按被点表单取值 + 草稿分槽 + 切走再切回不丢）
- 加载更早由壳统一合并去重并写回缓存；DAG 画布命令式挂载交给壳（幂等）
- 三处首屏数据缺口如实报出并另开补项（角标、评论列表、验收结论）
- 自测：壳 45 例全绿；相关 321 例全绿；typecheck 零错误；客户端构建 OK

### 改动文件

- `src/client/views/report-head.ts`
- `src/client/views/report-band.ts`
- `src/client/views/report-tabs.ts`
- `src/client/board-mount.ts`
- `src/client/api.ts`
- `src/client/styles.ts`
- `src/client/styles/report.ts`
- `tests/report-shell.test.ts`

### 下一步

六个 Tab 面板卡收口 + 首屏数据缺口补项

---
