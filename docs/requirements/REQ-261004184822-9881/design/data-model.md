---
serves: [FR-1, FR-2]
---

# 数据模型设计（REQ-261004184822-9881 泳道滚动位置快照）

> 轻档：整份模型就是一条内存快照——不落盘、不进台账、不过网。

## LaneScrollSnapshot <!-- serves: FR-1, FR-2 -->

**用途**：记住看板泳道"用户滚到哪"——一条横向位置 + 每列一条纵向位置。

```typescript
/** 泳道滚动位置快照（会话内存，单条） */
interface LaneScrollSnapshot {
  /** .dsh-pm-lanes 的横向滚动位置（px） */
  scrollLeft: number
  /** 列内卡片区位置：key = 列的 data-lane，value = .dsh-pm-lane-cards 的 scrollTop（px） */
  lanes: Record<string, number>
}
```

| 字段 | 类型 | 必填 | 说明 | 约束 |
|---|---|---|---|---|
| `scrollLeft` | number | 是 | 泳道横向滚动位置 | 有限数且 ≥ 0；缺省 0 |
| `lanes` | Record<string, number> | 是 | 列内滚动位置，按 `data-lane` 索引 | 键取自当前 DOM 的列；值同 `scrollLeft` 的约束；键数 ≤ `LANE_STATUSES.length`（当前 6），硬上限 16 |

## 存储与生命周期 <!-- serves: FR-1, FR-2 -->

| 维度 | 设计 | 理由 |
|---|---|---|
| 载体 | 模块级**单条**变量（不做多键 Map） | 看板泳道是**全量视图**，不按需求 / 会话分片；多键只有"键写错"的风险，没有收益 |
| 键 | 无（隐含单例 `board::lanes`） | FR-2 的隔离靠"独立模块"实现，而不是靠键前缀——前缀可以被写错，模块边界不会 |
| 容量 | 1 条快照 + `lanes` 至多 6 键（硬上限 16，超出丢弃非当前 DOM 出现的列） | 有界，不随浏览时长增长 |
| 生命周期 | 模块加载即空；页面重载 / 重开看板回到最左 | FR-2：不写 `sessionStorage` / `localStorage`、不进台账（有 grep 断言锁定） |
| 清理 | 不主动清（进程内保留最后位置） | 语义是"我刚看到哪"；重载即失效，不需要清理时机 |

**与 view-state 的形似与神不似**：形（sanitize 口径、只读诊断出口）照 [`dag/view-state.ts`](../../../../src/client/dag/view-state.ts) 抄，神（键、生命周期、归属视图）完全不同——这是刻意保留的"同纪律、异数据"。

## 取值收敛（sanitize） <!-- serves: FR-1 -->

| 输入 | 结果 | 理由 |
|---|---|---|
| 有限且 > 0 的数 | 原值 | 正常路径 |
| `0` | `0` | 合法（用户在最左 / 列顶） |
| 负数 / `NaN` / `Infinity` / `undefined` | `0` | 真实 DOM 上不会取到负数；写入口收敛比读出口兜底更难漏（与 `dag/view-state.ts` 的 `sanitizeScroll` 同口径） |
| 超过新布局可滚动上限 | 不预先截断，赋值时由浏览器自然裁剪 | 数据变化后列数 / 内容长度会变，写死截断逻辑只会算错；浏览器赋值本身就会 clamp |
