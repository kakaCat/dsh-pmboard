# 拆分计划（REQ-261004121649-bfa7）

> 一句话目标 + 做法 + 改动盘点 + 任务表（批准后自动落库任务卡并进入实施）

## TL;DR

回退（退回上游阶段）**只作废该作废的**：只对**顶层父卡**物化重做卡、子卡**原地复位**且保留身份；重做卡**不自动展开子链**；物化**幂等 + 上限**（超限整次拒绝、队列零新增）；并提供**仅人可操作的批量清理入口**，让误物化能一次清掉。

```
   一次回退
      │
      ▼
  rollback.ts 物化段（唯一口径）
      ├─ 顶层父卡 → 物化重做卡（reworkOf=原卡，stages=[] 不展开链）
      ├─ 子卡     → 原地复位（保留 parentId / stageKind）
      └─ 物化前   → 幂等键 (需求, 卡, 回退序号) 命中即跳过；> 20 张即整次拒绝
      │
      ▼
  人：误物化？→ POST /req/rollback-cleanup（批量 canceled + 还原父子关系）
```

## 改动盘点

| 文件 | 动作 | 内容 |
|---|---|---|
| `src/application/internal/rollback.ts` | 改 | 物化段：只物化顶层父卡；子卡改为原地复位；产出 `resetSubtasks` 与 `materializeCount` |
| `src/application/internal/rollback-tasks.ts` | 改 | 复位子卡（保留 `parentId`/`stageKind`）；重做卡显式 `stages: []` |
| `src/application/use-cases/MoveRequirement.ts` | 改 | 落库顺序不变（任务先写、需求后写）；把 `rollback` 元信息（seq/lastAt/lastMaterialized）写进需求记录 |
| `src/http/routers/requirements.ts` | 改 | 新增 `POST /req/rollback-cleanup`（仅人闸门；批量取消 + 还原父子关系；回执可核对） |
| `src/application/internal/rollback-revocation.ts` | 改 | 清理入口复用其「撤章/回收」判定，不新造一套 |
| 错误码 | 新增 | `REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT`、`REQBOARD_UNKNOWN_ROLLBACK_SEQ` |
| `tests/rollback-materialize.test.ts` | 新增 | 7 条用例（见设计 test-cases.md），每条都要求「修复前可变红」 |

## 覆盖对照表

| 需求条款 | 条款要点 | 接收任务 |
|----------|----------|----------|
| FR-1 | 回退只物化顶层父卡的重做卡，子卡不得变成父卡 | t1, t5 |
| FR-2 | 新物化的重做卡不自动展开子卡链 | t4, t5 |
| FR-3 | 回退物化必须幂等，且有数量上限，超限响亮失败不落库 | t2, t5, t6 |
| FR-4 | 提供批量清理/撤销入口，让人能一次清掉误物化的卡 | t3, t5 |

## 任务定义（供覆盖门禁与实施者共用）

**key**: t1
**serves**: FR-1

**key**: t2
**serves**: FR-3

**key**: t3
**serves**: FR-4

**key**: t4
**serves**: FR-2

**key**: t5
**serves**: FR-1, FR-2, FR-3, FR-4

**key**: t6
**serves**: FR-3

## 任务表

| key | 标题 | phase | side | depends_on |
|-----|------|-------|------|------------|
| t1 | 回退只动物化该动的卡：子卡原地复位，不再升格成新父卡 | implement | backend | — |
| t2 | 回退物化要幂等、要有上限：超限整次拒绝，队列零新增 | implement | backend | t1 |
| t3 | 误物化能一次清掉：仅人的批量清理入口 + 可核对回执 | implement | backend | t1 |
| t4 | 重做卡物化即终态：不再自动展开子卡链 | implement | backend | t1 |
| t5 | 用「修复前必红」的用例钉死四条行为 | test | backend | t1, t2, t3, t4 |
| t6 | 老数据兜底与回执诚实性：没有回退序号的旧卡怎么匹配 | implement | backend | t1 |

## 风险

| 风险 | 影响 | 应对 |
|---|---|---|
| 物化规则是本仓核心回退路径 | 改错会波及所有回退 | 只在 `rollback.ts` 一处改；全量回归比对基线；`MoveRequirement` 的「任务先写、需求后写」顺序不动 |
| 子卡复位为 todo 是否够（而非重建） | 子卡产出需重新确认 | 复位保留身份、不引入新卡；这是与「升格」的关键差别，写入用例断言 |
| 清理入口误伤已完成卡 | 不可逆 | 仅人闸门 + 只针对该次回退物化的卡 + 不触碰 done 卡；回执给数字供核对 |
| 旧卡没有回退序号 | 无法精确匹配 | 兜底按 `reworkOf` + 标题前缀；**回执必须如实说明匹配方式**（不许假装精确） |

## 迁移与兼容

- **无字段新增到队列格式**：`rollback` 元信息挂在需求记录上；不改 `schemaVersion`，无需回填；
- **旧调用方**：`applyRequirementRollback` 的返回体只增字段（`resetSubtasks` / `materializeCount`），既有字段语义不变；
- **回滚**：还原物化段 + 删新用例；旧卡行为退回现状。

## 下一步

implementing —— 提交后调 `reqboard_ask_confirm(target=plan)` 请人批准；批准即自动落库任务卡并开跑。
