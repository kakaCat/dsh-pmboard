# t-6c3cbd 看板 pending 票数据投影

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
看板 pending 票数据投影

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果

怎么验（可执行）：① 跑 `npx vitest run tests/pending-board.test.ts` → 退出码 0（16 例）；② 可 curl 查数据：GET http://127.0.0.1:19387/dashboard/api/reqboard/state?session=<会话id>，看返回 data.pending_confirms——有票时每项含 ticket / requirement_id / target / kind（可选）/ created_at / interrupted 六键，另带 remaining_ms 与 expires_at；无票时为 [] 且该键仍在下发物里；③ 公式读数：remaining_ms = TTL − (now − (interrupted_at ?? created_at))，TTL = 30 分钟（src/domain/limits.ts 的 pendingConfirmTtlMs）。

## 实施方案（implementation）
board /state 投影增 pending_confirms[]（复用 livePendingConfirm 同源口径，6 键）；无 pending → 空数组不省略键；remaining_ms 不落库（client 推导）。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T16:14:27.217Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这张卡做完，看板第一次能自己说「有人在你门口等着，还剩几分钟」——票在等不再只藏在会话里，陈旧票也不会把人钉在点不动的门上。

### 完成项

- 看板首屏拿得到「谁在门口等着」：/state 恒带 pending_confirms，有票给六键加剩余毫秒，无票给空数组
- 筛选口径只有一处实现：agent 侧 livePendingConfirm 与看板 pendingBoardRowsOf 共用 livePendingConfirmsOf
- 陈旧的票不占首屏：已落章 / 不是门 / 无可落章产物的票一律不列，台账查不到时保守留挂
- 顺带修好一处真假通：注册表补上 pendingForRequirement 后，看板「重投」端点从恒回 unavailable 变成真的能查到票
- 证据：tests/pending-board.test.ts 16 例（含路由端到端 5 例）；相关 13 个测试文件 106 例全绿；tsc --noEmit 0 错；公式断言反向验证（基准改回 created_at → 中止票那条变红）

### 改动文件

- `src/application/internal/pending-board.ts`
- `src/application/internal/pending-guard.ts`
- `src/adapters/PendingConfirmRegistry.ts`
- `src/http/routers/stages.ts`
- `tests/pending-board.test.ts`

### 下一步

下一张 ready 卡：t-02c55a open-doc 根解析诊断（FR-6）

---
