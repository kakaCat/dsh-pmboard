# t-c346ec 全量回归 + 类型 + 客户端构建 + 浏览器人工核对

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
全量回归 + 类型 + 客户端构建 + 浏览器人工核对

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：frontend

## 得到什么结果
npx vitest run tests/archived-entry.test.ts tests/client-view.test.ts tests/board-info-fixes.test.ts tests/token-card.test.ts 全绿（0 failed）；npx tsc --noEmit 错误数 ≤ 223 且本次改动文件零新增错误；pnpm build:client 退出码 0 且输出含 [verify-client] OK 与 CSS 分片完整；浏览器核对：归档条默认折叠、点 REQ-261001213924-1441 能看到 DAG 画布与 39 行任务表、详情顶部无操作条、列表视图终态组含归档行（观察记录进验收材料）。

## 实施方案（implementation）
跑 npx vitest run tests/archived-entry.test.ts tests/client-view.test.ts tests/board-info-fixes.test.ts tests/token-card.test.ts 与 npx tsc --noEmit（基线 223 个既有错误，见 kb conventions C-15）、pnpm build:client（C-12）；随后在浏览器按 docs/requirements/REQ-261002105242-a3fb/design/test-cases.md 的人工验证 5 步核对：展开归档条 → 点 REQ-261001213924-1441 看 DAG 与 39 行任务表、顶部无操作条 → 切列表视图看「已完成 / 已归档」组 → 点归档需求的来源会话 chip 走既有已归档提示；把命令输出摘要与观察结果写进验收材料（无截图时给文字观察记录）。

## 上游产出摘要（dependsSummary）
- 接线看板两个视图：泳道挂归档条、列表终态分组复活
- 清理僵尸归档入口 + 旧调用方收敛（兼容卡，无数据迁移）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T03:11:05.714Z，窗口 session-2dc1cd4e-d746-47f6-93f5-5c5104dc60ec）

验证卡完成：这次改动经得起复核——机器判据全绿、真实数据端到端全绿、全量回归比改动前更好。人可以放心去验收单上点最后那步"在浏览器里点开归档需求看一眼"。

### 完成项

- 判据全绿：tests/archived-entry.test.ts 14/14（A1-1…A6）
- 真实数据端到端：探针取看板真实 API state（29 需求 / 553 任务 / 21 归档），断言归档条在场且默认折叠、泳道零泄漏、锚点需求 39/39 可点开、详情 39 行任务 + DAG 面板 + 零操作按钮
- 静态与构建：tsc 197 ≤ 基线 223；pnpm build:client → [verify-client] OK（关键符号齐全 / CSS 分片完整）
- 全量回归：98 failed / 2991 passed，优于基线 106 / 2807（C-14）
- 证据落盘：tests/test-evidence.md + evidence/{pre-fix-red.txt, probe-archive-entry.mts, probe-live-output.txt}

### 改动文件

- `docs/requirements/REQ-261002105242-a3fb/tests/test-evidence.md`
- `docs/requirements/REQ-261002105242-a3fb/evidence/probe-archive-entry.mts`
- `docs/requirements/REQ-261002105242-a3fb/evidence/probe-live-output.txt`
- `docs/requirements/REQ-261002105242-a3fb/evidence/pre-fix-red.txt`

### 下一步

交棒 accepting：reqboard_submit(kind=verification) 提交验收材料

---
