# 测试策略与用例（REQ-261004121649-bfa7）

> serves: FR-1, FR-2, FR-3, FR-4

## 一、策略（serves: FR-1）

**主判据不是「回退后卡能跑」，而是「回退后卡不该多出来的没多出来」。**
故断言集中在三处：① 子卡身份是否保留；② 物化张数；③ 重复执行的增量。

新增用例文件：`tests/rollback-materialize.test.ts`（夹具用内存队列 + 台账替身，
不碰真实工作区——本次事故的教训之一就是"测试把文件写进了真实仓库"）。

## 二、用例（serves: FR-1, FR-2, FR-3, FR-4）

| 用例 | 输入 | 期望 | 服务 |
|---|---|---|---|
| 只物化顶层 | 6 张顶层卡 + 11 张子卡，执行一次回退 | 物化 **6** 张；11 张子卡**原地复位**且 `parentId`/`stageKind` 保留 | FR-1 |
| 子卡不升格 | 同上 | 队列里**没有** `parentId === undefined` 的原-子卡 | FR-1 |
| 不自动展开链 | 物化后取任一张重做卡 | `stages` 为 `[]`（或等价的"不展开"标记） | FR-2 |
| 幂等 | 同一回退执行两次 | 第二次 `materializeCount === 0`，队列张数不变 | FR-3 |
| 超限拒绝 | 构造 25 张将被物化的顶层卡 | 抛 `REQBOARD_ROLLBACK_MATERIALIZE_OVER_LIMIT`；**队列零新增**（前后张数相等） | FR-3 |
| 批量清理 | 先物化，再调清理入口 | 物化卡全部 `canceled`；父子关系还原；再清一次 `canceled === 0` | FR-4 |
| 仅人可操作 | agent 身份调清理入口 | `REQBOARD_HUMAN_GATE`，且队列零变化 | FR-4 |

## 三、可执行验收命令（serves: FR-1, FR-3, FR-4）

```bash
npx vitest run tests/rollback-materialize.test.ts -t "只物化顶层"      # FR-1
npx vitest run tests/rollback-materialize.test.ts -t "不自动展开链"    # FR-2
npx vitest run tests/rollback-materialize.test.ts -t "幂等"            # FR-3
npx vitest run tests/rollback-materialize.test.ts -t "超限"            # FR-3（须断言队列零新增）
npx vitest run tests/rollback-materialize.test.ts -t "批量清理"        # FR-4
```

**判别力要求**：每条用例都要能"在修复前变红"——尤其「只物化顶层」必须能在当前实现下
复现 17 → 56 的膨胀（否则它只是装饰）。
