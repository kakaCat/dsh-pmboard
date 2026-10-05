---
title: 需求级回退通道
updated: 2026-10-04
source: REQ-261003204149-1e80 / REQ-261004121649-bfa7
---

# 需求级回退通道

> 一句话：**回退不是"改一个状态字段"，而是一笔有账可查的原子事务**。
> 本文记录它的机制与不变量——改这条通道前请先读完。

## 为什么需要它（改造前的五个缺口）

| 缺口 | 后果 |
|---|---|
| 产物门只查"出发节点"的必备产物 | 半途回退被 `missing_artifact` 拒死——**最需要退的时候退不动** |
| 回退不改产物簿与计划批准 | 退回去后旧章仍在，凭它可一路推回上游 ⇒ **人工门被架空** |
| 旧任务卡原地不动 | 重拆被 `REQBOARD_ALREADY_DECOMPOSED` 拒死；二次实施又跑旧卡 |
| 工具侧与看板侧各写一遍 | 只改一处 ⇒ 两侧行为分叉 |
| `implementing → design` 是人工门 | agent 明知需求描述不对也退不回去 |

## 机制（四件事，一次做完）

```
reqboard_move(to=<更早阶段>)  或  看板 POST /req/move
        │  isRollback(from,to) ?
        ▼
  ① 闸门让路：产物门与确认门对**回退方向**豁免（前进方向一字不动）
  ② 撤销：stagesAfter(to) 内的产物撤章、计划批准收回、标下游待同步、写 rollback 留痕
  ③ 卡处置：未取消旧卡 → canceled（附 rollback 修订）+ 物化重做卡（reworkOf 指向旧卡）
  ④ 重算：断点按**新阶段**重算 + dive 自动链置 disarmed
        └─ 两侧共用 `applyRequirementRollback`（application/internal/rollback.ts）
```

## 物化的边界：只到顶层、有上限、能撤销（REQ-261004121649-bfa7）

上面第 ③ 件事（卡处置）真的出过事故：一次回退把 **17 张卡炸成 73 张**，而且**没有撤销入口**。
现行口径是三条硬边界，改这条通道前必须一并守住：

| 边界 | 规则 | 为什么 |
|---|---|---|
| **只物化顶层父卡** | `parentId` 非空的子卡**原地复位**（status 回 todo、保留 `parentId`/`stageKind`），不物化成新父卡 | 子卡被升格后一开工又按模板展开子链，名字递归成「…·研发·研发」——实测 17 → 73 的根因 |
| **物化即终态** | 重做卡显式 `stages: []`（判据是 `!== undefined`，`[]` = 明确不要链） | 缺省会让新卡一开工就展开子链，又长一层 |
| **幂等 + 上限** | 已有活的重做卡指向该父卡即跳过；单次物化 > `ROLLBACK_MATERIALIZE_LIMIT`（20）**在落库前**整次拒绝 | 超限先落库再让人发现 = 队列被污染；编排期抛错才谈得上「队列零新增」 |

**物化清单与清场入口**（同一需求新增）：

- `requirement.rollback` 增记 `seq`（第几次回退）与 `lastMaterialized`（本次物化出的卡 id）；
  写入点是 `recordRollbackMaterialized`，会话侧与看板侧两条回退路径同款调用；
- **清单只在真的物化了卡时才覆盖**：第二次回退物化 0 张时保留上一批清单，
  否则上一批误物化的卡就**再也清不掉**（那正是本需求要消灭的处境）；
- 清场入口 `POST /dashboard/api/reqboard/req/rollback-cleanup`（body `{ id, rollbackSeq }`）：
  按清单批量置 `canceled` + 按 `reworkOf` 反查原卡还原 `parentId`，回执给 `canceled` / `restoredLinks`
  两个可核对数字。**不碰 done 卡**；再清一次为 0（幂等）；序号对不上即 `REQBOARD_UNKNOWN_ROLLBACK_SEQ`；
- **「仅人」的落地方式**：本入口**不注册任何 agent 工具**（代码级拒绝 = 工具面不存在，
  与看板改绑同款纪律）。设计初稿曾写「agent 调用返回 `REQBOARD_HUMAN_GATE`」——那条做不到也测不出，
  HTTP 调用方身份在服务端无法辨别；
- **旧数据兜底**：没有 `lastMaterialized` 的存量记录按「`reworkOf` 非空 **且** 标题带 `[重做] `
  前缀」匹配，回执**如实声明** `matchedBy: reworkOf+title-prefix` 并逐条给 `skipped` 原因；
  实测 0fbf 的 56 张里仅 17 张两者齐备（另 39 张是子卡膨胀产物、无 `reworkOf`、早已 canceled）。
  序号校验**只管记过序号的记录**——缺 `seq` 的 2 条存量若一律拒绝，兜底路径就永远走不到。

## 三条不变量（改动时的红线）

1. **回退放宽的只有方向**：五道人工门的数量与前进语义不得改动；退回去再往上走**必须重新过门**
   （`plan.approvedAt` 会被收回，`decomposition` 的章会被撤）。
2. **事故 B 的防线不得削弱**：非回退态"已有未取消任务即拒绝重拆"仍然成立；
   守卫只在 `rollback.to === 当前阶段` 这一个窄判据下放行。
3. **编排顺序即原子性**：`applyRequirementRollback` 必须**先算卡计划、后改需求**——
   反过来的话，卡处置一抛错，需求侧的章与批准就已经被撤了。

## 涉及文件

- `domain/requirement/RollbackSpec.ts`——回退判定与阶段序（唯一实现处；状态机的回退边由它生成）
- `application/internal/rollback-revocation.ts`——撤销语义
- `application/internal/rollback-tasks.ts`——旧卡处置与重做卡物化（含「只物化顶层」分流与上限）
- `application/internal/rollback.ts`——编排单点（含 `resetInjectionAfterRollback`、`recordRollbackMaterialized`）
- `application/internal/rollback-cleanup.ts`——清场的**纯判定**（匹配 / 跳过 / 父子还原）
- `application/use-cases/RollbackCleanup.ts`——清场的**落库编排**（先任务后需求）
- `http/routers/requirements.ts`——`POST /req/rollback-cleanup` 入口（仅人，无 agent 工具）
- `application/internal/artifact-gates.ts`——方向性豁免（`isRollback` 一处）
- `domain/workflow/DecomposeSpec.ts`——回退态放行重建

## 测试与判别力要求

- `tests/move-rollback.test.ts`（端到端 TC 矩阵 ≥16 例，含双通道对拍）
- `tests/rollback-materialize.test.ts`（物化边界：只顶层 / 不展开链 / 幂等与上限 / 重复回退两次）
- `tests/rollback-cleanup.test.ts`（清场边界：精确匹配与幂等 / 不碰 done / 序号校验 / 旧数据兜底 / 父子还原）
- 判别力：**撤掉任一处修复，对应用例必须变红**（本仓纪律：只测"能跑"等于没测）
- 验收材料与逐条证据见 `docs/requirements/REQ-261003204149-1e80/tests/evidence.md`
  与 `docs/requirements/REQ-261004121649-bfa7/tests/test-evidence.md`
