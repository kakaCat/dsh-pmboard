---
req_id: REQ-261004110201-f253
serves: FR-1, FR-2, FR-3, FR-4
---

# 测试策略（REQ-261004110201-f253）

> 四个新测试文件对应四条 FR；回归口径与既有全量基线比对。
> 每条 FR 都有「**正向生效** + **未配置即现状**」两面断言——后者是本需求最重要的不变量。

## 用例矩阵 `serves: FR-1, FR-2, FR-3, FR-4`

| 文件 | FR | 用例 | 断言要点 |
|---|---|---|---|
| `tests/stage-model-routing.test.ts` | FR-1 | 4 | ① 命中 `stageKind` → 脚本含 `provider/model`；② `stageKind@difficulty` 优先于 `stageKind`；③ **未配置 → 脚本与现状逐字节相同**；④ 非法路由表 → 装配期抛错并点名 |
| `tests/stage-telemetry.test.ts` | FR-2 | 4 | ① 收尾写 `outputCount/zeroOutput`；② `stageTelemetryOf` 按 stageKind 聚合（runs/时长/产出/零产出数）；③ 旧记录缺键 → 不计入零产出（未知≠零）；④ 无数据时回执**省略键** |
| `tests/zero-output-alert.test.ts` | FR-3 | 3 | ① 连续达阈值 → 一条结构化评论（stage/streak/threshold）；② 同一轮连续只告警一次（去重可推导）；③ 非零产出后重置、再次达阈值才再告警 |
| `tests/requirement-priority.test.ts` | FR-4 | 4 | ① priority 降序、同值 createdAt 升序（稳定）；② WIP 上限满 → `stopped='wip_limit'` + 原因点名在跑需求；③ 上限 0 → 不限（现状）；④ 无 priority → 视作 0 且顺序与现状一致 |

## 行为等价验证（未配置面） `serves: FR-1, FR-2, FR-3, FR-4`

| 面 | 等价判据 |
|---|---|
| 脚本生成 | 未传 `route` 时，生成字符串与改造前**逐字节相同**（快照断言） |
| 执行收尾 | 不传 `outputCount` 时，execution 形状与改造前相同（无新键） |
| 调度 | 无 priority + WIP=0 → `scanAndResume` 候选顺序与投递结果与改造前一致 |
| 回执 | 遥测无数据 → 键不存在（不是 `[]`、不是 `null`） |

## 回归口径 `serves: FR-1, FR-2, FR-3, FR-4`

```bash
npx vitest run tests/stage-model-routing.test.ts tests/stage-telemetry.test.ts \
               tests/zero-output-alert.test.ts tests/requirement-priority.test.ts
pnpm test        # 失败数 ≤ 基线（doc 中登记基线，逐文件 diff 归属）
npx tsc --noEmit # 归属本需求文件零错
```

## 反向演练（防线有效性） `serves: FR-1, FR-4`

| 演练 | 操作 | 期望 |
|---|---|---|
| 路由未命中回落 | 临时把路由表 key 写成不存在的 stageKind → 装配期抛错（而非静默不生效） | 红并点名非法键 |
| WIP 闸有效 | 上限置 1、在制 1 → 第二个需求不投递且原因点名 | `stopped='wip_limit'` |
| 零产出去重 | 连续 4 次零产出（阈值 2）→ 只告警 2 次（floor(4/2)） | 评论条数 = 2 |

## 不做（测试面边界） `serves: FR-1`

- 不测「弱模型质量是否下降」（那是模型评测，不是本需求）。
- 不测真实 LLM 调用（路由只到「脚本参数正确」为止，执行由引擎负责）。
