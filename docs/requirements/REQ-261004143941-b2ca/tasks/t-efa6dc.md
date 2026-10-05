# t-efa6dc 进度接口补需求累计 token（与节点同源、缺失即不发）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
进度接口补需求累计 token（与节点同源、缺失即不发）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
./node_modules/.bin/vitest run tests/session-progress.test.ts tests/progress-nodes-fallback.test.ts 全绿，逐条含：TC-3a 同一响应内 data.requirement.tokenTotal === Σ data.nodes[].tokens.total 且 > 0；TC-3b 需求无任何快照时 'tokenTotal' in data.requirement === false（不是 0）；TC-3c 兜底夹具（有任务执行差值、无 byStage）下 tokenTotal 含该差值。接口实测：curl -s http://127.0.0.1:19387/dashboard/api/reqboard/session/<sid>/progress | python3 断言 tokenTotal == Σnodes 且 > 0，打印两个数字。

## 实施方案（implementation）
在 src/http/routers/stages.ts 的 handleSessionProgress 里只装配一次 const tokenView = assembleRequirementToken(target, { tasks })；把 nodeTokensOf(req, tasks) 改成收视图的 nodeTokensOf(view)（同步纯投影，复用同一视图，避免两处各算一次）；const tokenTotal = totalTokens(tokenView.totals)，在 requirement 里按 ...(tokenTotal > 0 ? { tokenTotal } : {}) 写入（缺失≠0，0 不发键）。不改 assembleRequirementToken 的合计规则、不改 nodes 现有形状、不动任何存储。测试：tests/session-progress.test.ts 追加 TC-3a/3b/3c；tests/progress-nodes-fallback.test.ts 复用其兜底夹具断言 tokenTotal 含任务执行差值。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T06:55:55.183Z，窗口 session-65308960-767d-4e3a-852e-1b7a55660c3d）

这一步做完，会话进度接口开始吐出一个「这条需求累计烧了多少 token」的数：与流程图各节点同源（总数 === 各节点之和），且没有消耗时老实不发这个字段（不会显示成 0）。

### 完成项

- 进度接口在返回需求信息时一并给出累计 token（四桶之和）
- 累计数与流程图每个节点上的数字同源：只装配一次，总数 === 各节点之和，手算能对上
- 没有任何快照的需求不发该字段（缺失 ≠ 0），前端不会显示「🪙 0」
- 同时修正了记录级总计会漏掉「正在进行的阶段」的坑：真数据实测 12,650,950 变 25,321,586，差额正是仍在实施中的那一段
- 补了三条回归用例：自洽（有快照 + 执行差值）、缺席（无快照）、兜底（无节点快照但有任务执行差值）
- 证据落盘：evidence/t1-evidence.md、evidence/probe-live-progress.mts、evidence/t1-live-progress.txt

### 改动文件

- `src/http/routers/stages.ts`
- `tests/session-progress.test.ts`
- `tests/progress-nodes-fallback.test.ts`
- `docs/requirements/REQ-261004143941-b2ca/evidence/t1-evidence.md`
- `docs/requirements/REQ-261004143941-b2ca/evidence/probe-live-progress.mts`
- `docs/requirements/REQ-261004143941-b2ca/evidence/typecheck-baseline.txt`

### 下一步

t2：客户端把 tokenTotal 落模型并渲染成计数旁的常显徽章（窄档也有数，D 档只留数字）。

---
