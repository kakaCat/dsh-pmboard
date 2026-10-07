---
serves: [FR-2]
---

# 数据模型说明（REQ-261007165643-4275）

> 本需求为 spike（只读调研），**不新增、不修改任何数据模型**。本文件为验收文档齐备性而设。

## 调研涉及的既有数据模型（只读） <!-- serves: FR-2 -->

| 模型 | 位置 | 调研发现 |
|------|------|---------|
| 需求台账（分片日志） | ShardedRequirementWriter | H3：跨进程交错时「追加→提交点」协议会误收编别进程未提交行 |
| 任务队列台账 | QueueTaskStore | H3：进程内队列，跨进程 lost update 无防护 |
| 实施链检查点 | CheckpointManager | M1：writeCheckpoint 无调用方，stepIndex/currentSubtaskId 为死字段 |
| 挂起确认票据 | pending_confirms | 健康：阻塞/回执/落章链路自洽（FR-3 §3.6） |

## 变更 <!-- serves: FR-2 -->

无。
