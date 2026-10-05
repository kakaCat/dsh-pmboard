# t-ec807b 收口：真数据取证 + 兼容回归 + 预算闸未动 + 构建基线

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
收口：真数据取证 + 兼容回归 + 预算闸未动 + 构建基线

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
./node_modules/.bin/tsx docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts 输出「聚合读数 vs 独立复算」且一致（或偏差能按 design/architecture.md 的已知偏差表解释并写明是哪一条）；pnpm test 的失败文件集合与开工前逐文件相同（贴 diff）；pnpm typecheck 错误数 ≤ 146；pnpm build 退出码 0 且 [verify-client] OK。

## 实施方案（implementation）
新增 docs/requirements/REQ-261004154937-2ca3/evidence/probe-lineage-live.mts：对真实数据根（~/.dsh/sessions）枚举一个样例窗口的血缘闭包、逐成员取数并求和，与「按日志独立复算」的结果对比，打印两个数字与偏差解释；跑全量回归与类型检查并与开工前基线做逐文件 diff；跑构建；所有输出写进 evidence/。

## 上游产出摘要（dependsSummary）
- 两级差值换口径，并把「含子代理 / 闸门不含 / 历史分界」写在明处

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T08:12:06.825Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，这条需求可以交验收：数字口径换成了真实的跨会话合计，漏掉的那 37.7% 被算进来了，而且口径差异、历史分界、已知偏差都写在明处。

### 完成项

- 真数据取证：聚合与独立复算逐字节一致（15 成员 / 226,420,316 tokens）
- 漏计被量化：改造前 141.1M，真实 226.4M，差 85.3M（约 37.7%）
- 兼容回归逐文件零差异；类型检查与基线持平
- 预算闸一条未改仍全绿；口径差异写在明处
- 构建通过，两份产物均含新口径

### 改动文件

- `docs/requirements/REQ-261004154937-2ca3/evidence/t4-evidence.md`

---
