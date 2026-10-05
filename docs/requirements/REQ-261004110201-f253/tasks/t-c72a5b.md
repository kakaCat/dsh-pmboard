# t-c72a5b 全量回归 + 文档同步

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
全量回归 + 文档同步

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：backend

## 得到什么结果
pnpm test 失败数 ≤ 基线且本需求新增用例全绿；npx tsc --noEmit 归属本需求文件零错；docs/architecture/project-manual.md 变更记录补行、docs/architecture/automation-chain-contract.md（如涉及自动链调度）同步优先级/WIP 说明

## 实施方案（implementation）
① 跑 pnpm test 并与基线 diff 归属；② 更新 project-manual.md 变更记录（路由表/遥测/优先级/WIP 四点）；③ 如自动链调度契约页受影响则同步一段

## 上游产出摘要（dependsSummary）
- 兼容与迁移验证（未配置即现状）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T04:07:26.995Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

这一步做完：这次加的三项开关写进了说明书与自动链契约（以后有人问「能不能换模型/看成本/排优先级」有据可查），知识层生成物也按规范重生成并自检通过

### 完成项

- 全量回归：pnpm test → 97 failed / 3742 passed（≤ 基线 98；失败文件数 47 = 基线文件数），本需求新增用例全在绿侧
- 知识层同步（工程规范要求的重生成）：pnpm run kb:build 后 pnpm run kb:check 11/11 全过（此前 2 处符号表漂移，因新增 StageRouting/StageTelemetry 两个源文件）
- 说明书同步：project-manual.md 新增机制备忘「工作流的三项可配开关」+ 变更记录补行（路由/遥测/零产出告警/优先级与在制上限，逐条带判据命令）
- 契约页同步：automation-chain-contract.md 新增 §七「调度与观测」（priority / maxInFlightRequirements / stage_telemetry / zeroOutputAlertThreshold / stageRouting 五项，逐条注语义与判据），原可复核入口顺延为 §八
- npx tsc --noEmit：总错误 144（开工时 150，净减 6），归属本需求文件零错（唯一 index.ts 一条为既有 ctx.emit 类型问题）
- 诚实声明：harness 提示里提到的 agent-dh/scripts/wiki_probe.py 在本仓不存在，故以 pnpm run kb:check（本仓知识层自检入口，11 项）替代作死链/漂移检查

### 改动文件

- `docs/architecture/project-manual.md`
- `docs/architecture/automation-chain-contract.md`
- `docs/knowledge/code-map.symbols.tsv`
- `docs/knowledge/INDEX.md`
- `docs/knowledge/design-tokens.md`
- `docs/knowledge/design-tokens.classes.tsv`
- `docs/knowledge/code-map.symbols.tsv`
- `docs/requirements/REQ-261004110201-f253/tasks/t-c72a5b.md`

### 下一步

联调 → 测试 → 复核 → 关闭；随后提交验收材料

---
## 汇报 2（2026-10-04T04:07:40.299Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

联调段完成：四项新能力在说明书与契约页都有据可查、判据命令可跑，知识层自检 11/11 通过

### 完成项

- 文档覆盖交叉核对：四项新能力关键词在两份项目文档中均命中（说明书 5 处 / 自动链契约 4 处），不存在「代码有、文档无」
- 知识层自检复跑：pnpm run kb:check → 11/11 全过（生成物零漂移）
- 文档与实现一致性抽查：说明书表格里的每一条判据命令都指向本需求真实存在的测试文件（五文件均已在全量绿侧）

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-c72a5b.md`

### 下一步

测试段：需求级终态回归

---
## 汇报 3（2026-10-04T04:08:41.414Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

测试段完成：46 新用例绿、全量 97≤基线零新增、tsc 净减、知识层自检全过

### 完成项

- 本需求五文件合跑：46/46 全绿（路由 18 / 遥测 10 / 零产出 5 / 优先级 6 / 等价面 7）
- 全量 pnpm test：97 failed ≤ 基线 98（失败文件数 47 = 基线），本需求零新增失败
- npx tsc --noEmit：总错误 144（开工 150，净减 6），归属本需求文件零错
- pnpm run kb:check：11/11 全过（生成物零漂移）
- 测试段结论：三项判据（≤基线 / tsc 归属零错 / 知识层自检）全部成立

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-c72a5b.md`

### 下一步

复核段：需求级逐条核对设计

---
## 汇报 4（2026-10-04T04:08:49.271Z，窗口 session-2fc47d7e-39bb-4ed1-8ed0-513c04168d69）

复核通过：八卡证据齐、四条设计承诺逐字对上；两处偏离已声明（看板首键排序、摘要两标量），另如实说明 wiki_probe 缺位改用 kb:check

### 完成项

- 八卡逐条核对：t1 契约 ✓ t2 路由注入 ✓ t3 产出数写入 ✓ t4 遥测读模型+回执 ✓ t5 零产出告警 ✓ t6 优先级+WIP ✓ t7 兼容等价面 ✓ t8 收口 ✓ —— 每卡 acceptance 均有可跑命令与实测输出
- 设计承诺终核：路由两级命中且未配不注入 ✓ 遥测按子卡阶段派生且无数据省略键 ✓ 零产出去重 floor(streak/threshold) 且未知即断 ✓ 优先级降序+在制=新鲜锁 ✓ —— 四条与 design/architecture 逐字对应
- 偏离总账（两处，均已在卡面声明）：① 看板排序把 priority 设为**首键**、保留既有状态分组次序（调度侧严格按设计的 (-priority, createdAt)）；② 摘要新增 priority/advanceLockAt 两个有界标量（排序与在制判定发生在摘要投影之后）
- 诚实声明：harness 提示的 wiki_probe.py 在本仓不存在，以本仓知识层自检 kb:check（11 项）替代；本条已写进 t8 汇报

### 改动文件

- `docs/requirements/REQ-261004110201-f253/tasks/t-c72a5b.md`

### 下一步

关闭本卡，需求进验收

---
