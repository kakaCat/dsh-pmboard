---
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# REQ-261004154937-2ca3 设计 · 架构（跨会话聚合口径）

## 目标与不变量（serves: FR-1, FR-2, FR-3）

**目标（可证伪）**：`tokenTotals(windowKey)` 的读数从「该窗口会话的累计用量」变为「该窗口会话 **+ 其全部后代子代理会话**的累计用量之和」；节点/任务/需求三级差值随之反映真实消耗，且**每一次读数都说明自己的完整度**（是否含取不到的后代）。

**必须同时成立的不变量**：
1. **缺失 ≠ 0**：任一成员取不到用量 → 不参与合计、快照标 `degraded`，**不补 0**；
2. **差值规则确定**：相邻快照的差值只依赖两份快照自身携带的信息（不读历史、不看时钟）；
3. **单窗口无子代理时数字与今天逐字相同**（回归零变化）；
4. **预算闸口径不变**（`maxCacheReadTokens` 仍读 `tokenUsage.totals.cacheReadTokens`）；
5. 快照仍是**同步可得的纯读数**（不引入 await 到下探快照的调用链上——见「取数策略」的取舍）。

## 取数链路（三段，各段都可单独失败并如实标注）（serves: FR-1, FR-3）

```
windowKey(agent id)
   |  ① 解析出本窗口的 session 对象（既有：agents.get(windowKey).session）
   v
本窗口 sessionId ──────────────┐
   |  ② 枚举：sessionPersistence.list() → 全部 header（id/parentSession/origin/delegationDepth）
   |     从本会话出发取 parentSession 传递闭包（含多层）→ 成员集合 M
   v
每个成员 m ∈ M ────────────────┐
   |  ③ 取数：sessionProjectionCache.cachedSnapshot(header_m, ['tokenUsage'])
   |       命中 → { asOfSeq, values.tokenUsage }（零日志读，可能陈旧）
   |       未命中 → 冷读兜底（读该会话日志，成本高）→ 失败则把 m 记进 degradedMembers
   v
totals = Σ 可得成员的四桶          （+ members[] 逐成员留痕 + degradedMembers[]）
```

**为什么是这条链路（可行性取证结论，见 requirement E-6）**：
- 枚举**零日志读**：`sessionPersistence.list()` 返回 `SessionPersistenceSnapshot{header, revision, eventCount?, sizeBytes?}`（`session-persistence/src/index.ts:201`）
- 取数**缓存命中零日志读**：`sessionProjectionCache.cachedSnapshot(meta, keys)` 返回 `{asOfSeq, values}`（`session-projection-cache/src/index.ts:161`；`ProjectionSnapshot` 定义在 `session-projection/src/index.ts:112`）
- 因此**常态路径零新增 IO**：只有「缓存没有该行」的后代才需要读日志。

## 归属规则：集合变化时的差值语义（serves: FR-2）

**这是本需求的核心决策，必须唯一且可测**。设上一次快照 `S1(M1, t1)`、本次 `S2(M2, t2)`：

| 情形 | 贡献 | 理由 |
|---|---|---|
| `m ∈ M1 ∩ M2` | `t2[m] − t1[m]` | 常规增量 |
| `m ∈ M2 \ M1`（新成员） | `t2[m]`（**它创建以来的全部**） | 子会话诞生于两次快照之间 ⇒ 它的全部消耗都发生在本阶段内，全额计入才不丢 |
| `m ∈ M1 \ M2`（消失成员） | `0`（**不记负值**） | 与既有 `subBuckets` 的「负分量截断为 0」同口径；消失通常是日志被移除/重命名，其最后一段增量**不可归属**，如实留白而不是把总数拉低 |
| `m ∈ degradedMembers(S1 或 S2)` | 该成员**整体不参与**本次差值；差值标 `degraded` | 缺失不补 0 的延续：宁可不精确，不许编造 |

**已知偏差（写进文档，不藏）**：
- 「新成员全额计入」在**它其实早于本阶段就存在、只是上次取数失败**时会**高估**——故这种情形由 `degraded` 标出来；
- 「消失成员记 0」会**低估**它最后一段增量；
- 本需求上线**之前**的历史快照没有 `members`（只有总数），其差值只能退化为「总数相减」并标 `degraded`（见 data-model 的兼容路径）。

**为什么不用「总数相减」一把梭**：`Σ_{M2} t2 − Σ_{M1} t1` 在数学上等于「常规增量 + 新成员全额 − 消失成员历史值」，最后一项会**把总数拉低**，而 `subBuckets` 的逐桶截断又会把它变成 0——静默失真。逐成员算虽然多几行，但**每一项都能指着规则解释**。

## 取数策略（缓存优先 + 有界兜底）（serves: FR-1, FR-3）

1. **常态**：只用 `cachedSnapshot`（零 IO）。命中即用，并记下 `asOfSeq` 作为该成员的水位。
2. **未命中**：走冷读兜底，但有**硬上限**（默认 `maxColdReads = 8` 个成员/次快照）与**时间预算**（默认 200ms）；超出即把剩余成员记进 `degradedMembers`，不拖慢主流程。
3. **本窗口会话**走既有 live 投影路径（`sessionProjections.stateOf(session,'tokenUsage')`）——它永远是最新的，不需要缓存。
4. 任何一段失败都**只影响完整度标注，不影响主流程**（与 `syncRTMYaml` 的「增强层失败不打断」同哲学）。

## 为什么这条升级为重档（serves: FR-5）

动的是**数据口径**（快照语义 + 差值规则），且新增了对 DSH 两个服务的依赖（`sessionPersistence` / `sessionProjectionCache`）。
按纪律这是单向升级：即便最终代码量不大，也不降回轻档——因为**口径错误的影响面**（判断"要不要继续投入"）远大于代码行数。

## 回归锚点（serves: FR-5）

- 单测四类：聚合（主 + 2 子）、多层血缘（≥2 层）、集合变化（新增全额 / 消失记 0）、缺失（不补 0 + degraded）；
- **兼容回归**：无子代理的窗口，数字与今天逐字相同（用既有夹具锁）；
- 真数据取证：真实窗口（`session-5c6b1a8b`：自身 141.1M + 14 子 85.3M）聚合值与独立复算一致，偏差须能按上表解释；
- 文案与文档断言：「含子代理」在场；闸门口径差异成文。

## 兼容与回滚（serves: FR-3, FR-4）

- **旧快照（无 members）**：新差值函数遇到缺 `members` 的一侧 → 退化为总数相减并标 `degraded`（不抛错、不阻断历史需求）。
- **服务不可得**（`sessionPersistence` / `sessionProjectionCache` 缺失）：退回今天的行为（只算本窗口会话）并在快照上标 `degraded: 'descendants-unavailable'`——**绝不假装聚合过**。
- **回滚**：`tokenTotals` 恢复为「只读本窗口会话」即可；快照多出来的 `members`/`degradedMembers` 字段是可选的，旧读法忽略它们不受影响。
- **无数据迁移**：不重写已落台账的快照；历史数字保持旧口径，由 FR-4 的时间分界文案交代。
