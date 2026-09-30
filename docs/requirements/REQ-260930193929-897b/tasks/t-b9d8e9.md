# t-b9d8e9 让七个读文档的闸门都走这个统一入口

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
让七个读文档的闸门都走这个统一入口

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
1) 定向用例（会话根 ≠ 需求根、文档在需求根）经四条通道均放行、无 gate_failure；2) `rg -n "checkDesignCompletenessGate|checkDesignDecompositionGate" src/` 的每个调用点在读盘前都有校正调用；3) `pnpm typecheck` 无新增错误。

## 实施方案（implementation）
按目录逐处插入校正调用（都在读盘之前）：src/application/use-cases/AskConfirm.ts:107；src/application/internal/confirm-settle.ts:101 与 :169；src/application/use-cases/ConfirmArtifact.ts:89 与 :191；src/http/routers/requirements.ts:43 与 :223（看板侧无会话上下文，根只由需求记录决定）。不改任何闸门判定规则与文案结构。验证：pnpm vitest run tests/design-gate-workspace-root.test.ts + pnpm typecheck。

## 上游产出摘要（dependsSummary）
- 把「按哪个工作区读文档」收敛成一个统一入口

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-09-30T12:31:33.505Z，窗口 session-a8201e1d-9d20-4697-aad0-927b83f54a3c）

读文档的闸门不再看「会话碰巧在哪」，而是看「这条需求自己的工作区在哪」。这一步做完，什么变了——跨工作区立项的需求，设计确认后能自动往下走，不再被自己的文档集闸门误拦；看板路径的判定也不再随「别的窗口最后动过的根」漂移。

### 完成项

- 7 处读盘调用点全部改为「先按需求工作区校正根、再读盘」：AskConfirm 早返回、confirm-settle 两处（拆分内容硬门 + 完整性门自动推进）、ConfirmArtifact 两处（工具确认）、看板路由两处（移动/确认后的自动推进）
- 看板路径不再依赖「最后一次会话残留的根」：ctx.deps 只有 docs，按最小依赖面传参复用同一收敛函数
- 未改任何闸门判定规则与文案结构、未改状态机与台账协议、未把 reqboard_move 纳入闸门（均为设计明确的边界）
- 验证：tsc 全量 213 条错误与基线逐条 diff 为空、改动文件零错误；全量 vitest 103 失败（基线 103，无新增），通过数 2627 → 2628
- 四张子卡（研发/联调/复核/测试）全部完成并各自留下完工记录

### 改动文件

- `src/application/internal/support.ts`
- `src/application/use-cases/AskConfirm.ts`
- `src/application/internal/confirm-settle.ts`
- `src/application/use-cases/ConfirmArtifact.ts`
- `src/http/routers/requirements.ts`

### 下一步

t3：写正反双向用例（含会话根≠需求根放行 + 需求根下真缺失仍拦），并补齐 t2 验收标准 1 的定向验证；t4：存量兼容与回滚说明。

---
