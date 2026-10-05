---
req_id: REQ-261003222428-3556
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 迁移设计（REQ-261003222428-3556）

> refactor 迁移篇：协议/存量/回退。本需求零协议破坏，迁移负担集中在「行为默认不变」的证明上。

## 迁移路径 `serves: FR-1, FR-2, FR-5`

| 项 | 前 | 后 | 存量影响 |
|---|---|---|---|
| 推进锁 | 认领即死租约 | 在跑续租 | 无——`advance.lockAt/runId` 字段不变；在跑需求下次续租自然生效 |
| 批内执行 | 串行 | 声明写集才并行，**默认串行** | 无——存量卡写集全空（`scope: asScope({})`），行为 ≡ 现状 |
| wake 受理 | 恒成功 | 活性校验 | 死窗口需求从「假装健康」变「paused 等人」——是如实化，不是破坏 |
| 绑定改写 | 无留痕 | 留痕 + 人工改绑入口 | 无——只新增留痕，不改绑定语义 |
| 催办 | 逐条 | 按 kind 聚合 | 无——确认门语义不变 |

## 兼容性 `serves: FR-3, FR-6, FR-7`

- **协议**：TaskRecord / RequirementRecord / PlanTask 字段零变更；history 新增可选 `batchId`（可缺省，旧读取方不受影响）。
- **回执**：`reqboard_status` 新增 `plugin_build` 字段——按三方同源纪律**先声明 schema 再改回执**，
  并跑 output-contract 静态扫描（它现在管顶层键）+ 键集用例。
- **台账**：不新增必填键；`driverHealth=paused` 复用既有取值。

## 回退 `serves: FR-2, FR-4`

- FR-2 并行开关：移植模块保留 `parallel: false` 配置位（plugin config），一键回到纯串行——
  并行语义出事故时可不撤代码先关闸。
- FR-4 删除不可逆但有 git；删除前 FR-2 必须已合入并通过冲突/串行用例（顺序硬约束：t4 depends t2）。
- FR-1 无开关：续租是纯增强；若心跳自身故障，stale 接管兜底逻辑原样在（失败要响亮：心跳写锁失败记 warn 不吞）。

## 验证总口径 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

```bash
# 每批卡自带用例（见 architecture.md 各节）+ 交付时全量：
pnpm test   # 失败数 ≤ 文档基线 98，且本需求新增用例全绿
grep -rn "StartSubtaskChain\|backgroundRunner\|CheckpointManager\|scheduleBatches" src/ | wc -l  # → 0
```
