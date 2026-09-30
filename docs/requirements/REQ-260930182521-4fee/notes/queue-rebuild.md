# 任务存储重建说明（queue.json）

## 发生了什么

2026-09-30 18:36–18:52 之间，本需求的**未跟踪文件**被外部清理删除，包括：

- docs/requirements/REQ-260930182521-4fee/ 下的 requirement.md、design/、decomposition.md
- docs/requirements/REQ-260930182521-4fee/queue.json（本需求**任务的唯一存储**）与 tasks/*.md
- tests/stage-colors.test.ts（本需求新增的测试）

同仓同期出现 REQ-000001 / REQ-000002 目录与大量 tests/* 改动，形态与 `git clean -fd`（清未跟踪文件）一致。

## 重建依据（不含推测性状态）

| 来源 | 用途 |
|------|------|
| 本需求台账（~/.dsh/dsh-reqboard.json） | 计划（plan.tasks：标题/实施方案/验收标准/依赖）、产物清单、workspaceRoot |
| 本会话工具回执 | 卡片 id、父子/阶段归属、依赖、状态推进时点 |
| 本会话汇报原文 | 各卡 lastReport（summary/completed/filesChanged） |
| 实跑测试输出 | 完工证据（tests/stage-colors.test.ts → 10 passed 等） |

重建结果**通过本仓 validateQueueFile（V-1..V-6）零 issue**，并经 QueueTaskStore + JsonQueueRepository 端到端读通：13 张卡（4 父卡 + 9 子卡）全部 done，3 层，ready 空。

## 与原始数据的差异（必须知道）

1. **statusHistory 全部标 `inferred: true`**：时间线由本会话操作记录回填，非原始写入事件。
2. **时间戳为近似值**（分钟级），不保证与原始事件逐毫秒一致。
3. **每张卡带一条 "rebuilt" 评论**说明本次重建（createdBy = system）。
4. 任务卡的修订记录（revisions）与执行会话 token 快照无法恢复，重建卡上相应字段缺省。

## 仍未完成

- 需求状态在台账里仍是 implementing（全部任务 done 的自动汇总未触发，因为没有走工具写路径）；下一次带 reqboard 工具的窗口做任一写操作（或看板点推进）即会结算到 accepting。
- 验收材料提交（reqboard_submit kind=verification）尚未做——需要带 reqboard 工具的窗口。
