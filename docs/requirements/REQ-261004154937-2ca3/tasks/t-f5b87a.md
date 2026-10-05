# t-f5b87a 定死契约与差值规则：快照带成员、差值逐成员算

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定死契约与差值规则：快照带成员、差值逐成员算

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
./node_modules/.bin/vitest run tests/lineage-delta.test.ts 全绿：TC-1a 主+2 子 → totals == 主+子1+子2 且 totals === Σmembers[].totals；TC-1b 主+0 子 → 与自身逐字相同；TC-1c 三层血缘 depth 0/1/2；TC-1d fork 窗口（delegationDepth:0 且非 subagent）不算后代；TC-2a 同名成员相减；TC-2b 新成员全额；TC-2c 消失成员记 0 不记负；TC-2d seq 缺失该成员不参与且标 degraded；TC-2e 旧快照缺 members 退化为总数相减并标 legacy-snapshot 不抛错。红态自证：关掉聚合 → TC-1a 红；新成员改成只算增量 → TC-2b 红；红绿输出存 evidence/。

## 实施方案（implementation）
① src/shared/protocol.ts 的 TokenSnapshot 增可选字段 scope（'self'|'self+descendants'）、members（[{sessionId, depth, seq?, totals}]）、degradedMembers、degradedReason，并补恒等式辅助（totals === Σmembers[].totals）；② 新增 src/domain/token/lineage.ts：纯函数 descendantsOf(headers, rootId)（按 parentSession 传递闭包，判据 delegationDepth≥1 或 origin==='subagent'，fork 窗口不算）+ deltaSnapshots(start, end)（五态规则，按 sessionId 索引不按下标；任一侧缺 members 退化 subBuckets 并标 legacy-snapshot；source='unavailable' 返回空桶）；③ 新增 tests/lineage-delta.test.ts 覆盖 TC-1a~d 与 TC-2a~e。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T07:59:48.402Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，「谁算后代、两次快照之间怎么算消耗」成了可单测的纯规则，后面接服务和换口径都只是照它接线。

### 完成项

- 快照契约扩展四个可选字段（旧快照照样能读）
- 两条纯函数：后代闭包 + 五态差值，零 IO 可单测
- 13 条用例 + 既有 39 条全绿；全量失败集合与基线逐文件相同
- 三条关键规则各自实测能红（红态输出存档）
- 复核段修正两处不诚实的降级标签，并补了脏成员防御

### 改动文件

- `src/shared/protocol.ts`
- `src/domain/token/lineage.ts`
- `tests/lineage-delta.test.ts`

---
