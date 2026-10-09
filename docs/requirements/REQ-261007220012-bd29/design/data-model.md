# 数据模型：本批**零数据模型变更**（REQ-261007220012-bd29）

> 结论先行：本需求是工具面（agent 可见 schema 槽位）精简，**不触碰任何持久化形状**。
> 本文件把「不变」逐条写清并给可复核读数——refactor 最该防的就是「重构顺手改了数据形状」。

## 不变项清单 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7 -->

| 对象 | 形状 | 本批是否变更 | 读数 |
|------|------|--------------|------|
| 需求台账热记录（record.json） | `RequirementRecord` 字段集 | **不变** | 本批未改 `src/shared/protocol.ts` 的任何类型字段（仅注释口径） |
| 台账追加日志（history / comments） | 事件形状 | **不变** | 本批无新增事件类型；确认/推进事件由既有 `confirm-settle.ts` 单点写 |
| 任务队列（queue.json） | `QueueFile` / `QueueTask` 字段集 | **不变** | 本批未动 `src/domain/queue/**` 与 `QueueRepository` |
| 挂起确认注册表 | ticket / target / kind / interruptedAt | **不变** | 取回执路径复用同一 registry（ask_confirm(ticket)） |
| 运行态 checkpoint（record.advance） | `runId / stepIndex / currentSubtaskId` | **不变** | run 节只**读**该字段（原运行态查询同一读点） |
| LD 版本常量 | `REQBOARD_SCHEMA_VERSION = 9` / `QUEUE_VERSION = 1` | **不变** | `tests/canceled-legacy-read.test.ts` 的零迁移断言（该文件本身为既存 flaky，断言项仍是这两常量） |

## 状态机不变项 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- **需求状态机**：`HUMAN_ONLY_REQ_TRANSITIONS` / `agentNextActions` 本批未改（唯一触碰是
  `StageActions.ts` 的工具名→阶段映射表，删旧名、补 `reqboard_task_amend`——那是**工具可用域**，
  不是状态迁移表）。
- **任务状态机**：`TaskMove` / `SUBTASK_TRANSITIONS` 本批未改；单卡展开只读不改状态。
- **非法迁移响应**：错误码与消息未改（`REQBOARD_INVALID_INPUT` 等原样）。

## 为什么「无迁移」成立 <!-- serves: FR-7 -->

工具名与 schema 槽位是**装配期**事实（registry → 宿主注册），不是盘上数据：
删工具不产生待迁移记录，改名不产生待回填字段。因此：

```
回滚单位 = 文件（git revert / git checkout 单文件）；数据侧无补偿动作。
```

证据：`migration.md` §数据层（不改表、不改 schema、无迁移）+ 本批未新增任何 `migrate-*` 脚本
（`tests/canceled-legacy-read.test.ts` 的「仓库不新增 migrate-* 脚本」断言项仍成立）。
