---
req_id: REQ-261003222428-3556
serves: FR-1, FR-2, FR-3, FR-6
---

# 数据模型（REQ-261003222428-3556）

> 本需求不改台账 schema 版本；落盘形状的变化只有两处**可选键新增**，旧读取方不受影响。

## 变更点 `serves: FR-2`

| 位置 | 变化 | 兼容 |
|---|---|---|
| `AdvanceRecord.batchId` | 新增可选字段（同批并行事件共享批次标识） | 可选键；旧数据无此键、旧读取方不读此键，均无影响 |

## 不变量（本需求刻意不改的形状） `serves: FR-1, FR-3, FR-6`

| 形状 | 说明 |
|---|---|
| `advance.lockAt / runId` | 字段不变；锁续租只是**刷新 lockAt 的值**，不是改结构（FR-1） |
| `TaskRecord.dependsOn` | 形状与语义不变；端到端用例守「计划 key → 真实 id 逐环成链」（FR-3） |
| `sourceSessionId` | 字段不变；改写路径收编留痕助手，不改存储形状（FR-6） |
| `driverHealth` | 取值集不增（paused 复用 wake-undeliverable 既有值）（FR-5） |
| `req.artifacts[].confirmedAt/Via/By` | 形状不变；成组只是**一次写多份**，不写新键（FR-7） |

## 回执形状新增（schema 均已先声明） `serves: FR-3`

| 回执 | 新增键 | 说明 |
|---|---|---|
| `reqboard_status` | `plugin_build` | 构建指纹 sha256(产物)[0:12]；未盖章整体省略 |
| `reqboard_submit(kind=plan)` | `dependency_warnings` | doc↔tasks 依赖不一致点名；仅在有时出现 |
| `reqboard_ask_confirm / confirm` | `stamped` | 落章清单；plan 分支省略 |
