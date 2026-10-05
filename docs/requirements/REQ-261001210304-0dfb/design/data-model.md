# REQ-261001210304-0dfb 数据模型设计 · 视图状态快照与记忆表 `serves: FR-1, FR-2, FR-4`

> 本文只描述 **client 内存**里新增的一个快照结构；不动台账 schema、不动 `StageOverview` 协议、不动队列文件。
> 一句话：新增一张"按画布 + 需求"索引的内存表，存用户在图上的选择，供重建时回填。

## 新增：视图状态快照 `DagViewSnapshot` `serves: FR-1, FR-2`

```ts
// src/client/dag/view-state.ts
import type { LayoutDir } from './dag-layout.js'

/** 面板里"用户做的选择"——重挂时要能一模一样地回到原位。 */
export interface DagViewSnapshot {
  /** DAG 布局方向（纵向 / 横向） */
  dir?: LayoutDir
  /** 「关键路径」开关 */
  crit?: boolean
  /** 「只看主线」开关 */
  focus?: boolean
  /** 悬停钉住的节点 id（null = 无钉住） */
  pinned?: string | null
  /** 当前激活视图页签：flow=DAG / list=泳道（仅实施节点有页签） */
  tab?: 'flow' | 'list'
  /** 画布外层滚动位置（.dsh-pm-dag-canvas-wrap） */
  scrollTop?: number
  scrollLeft?: number
}
```

| 字段 | 类型 | 必填 | 默认值 | 约束 / 说明 |
|------|------|------|--------|------------|
| `dir` | `'vertical' \| 'horizontal'` | 否 | `'vertical'`（= 现状缺省） | 复用 `dag-layout.ts` 的 `LayoutDir`，不新造枚举 |
| `crit` | `boolean` | 否 | `false` | |
| `focus` | `boolean` | 否 | `false` | |
| `pinned` | `string \| null` | 否 | `null` | 指向不存在的节点时无害（高亮查不到即不画） |
| `tab` | `'flow' \| 'list'` | 否 | `'flow'` | 只对实施节点有意义；拆分节点无页签时忽略 |
| `scrollTop` / `scrollLeft` | `number` | 否 | `0` | 非有限数或负数按 `0` 处理（写入口收敛） |

**为什么字段都是可选的**：写回与读取都是"部分更新"语义（页签点击只写 `tab`；`dispose` 写回时写 DAG 四项 + 滚动），
缺省值集中在 `mountDagCanvas` 的 initial 构造处，避免多处各写一份默认值（本仓"两份真相"教训）。

## 存储键与生命周期 `serves: FR-4`

| 项 | 规则 |
|----|------|
| 键 | `canvasId + '::' + requirementId`（例：`np-dag-canvas::REQ-261001210304-0dfb`、`dag-canvas::REQ-260930183951-eb6c`） |
| 未启用记忆 | 调用方**不传** `opts.stateKey` → 完全不读写记忆表（缺省行为 = 现状，需求详情与会话面板以外的旧路径零影响） |
| 写入时机 | ① `mountDagCanvas` 的 disposer（写回 `viewer.state()` 四项 + `wrap` 滚动）；② 页签点击处理器（只写 `tab`） |
| 读取时机 | `mountDagCanvas` 挂载前（构造 `initial`）；面板注入 HTML 后的补丁函数（读 `tab`） |
| 清理时机 | `reqId` 变化时清掉上一需求的键（`clear(canvasId + '::' + prevReqId)`）；面板关闭**不清**（重开继续看同一张图） |
| 测试入口 | `_resetDagViewState()`（仅测试用；生产代码不调） |

**键为什么含需求 id**：`#dag-canvas` / `#np-dag-canvas` 是**固定 canvasId**，同一块画布会承载不同需求的图；
不含需求 id 就会把 A 需求的横向/只看主线带到 B 需求（A5 用例锁死这条）。

## 容量、淘汰与不持久化 `serves: FR-4`

- **容量**：最多 16 条（`MAX_ENTRIES`），超出按插入顺序淘汰最旧一条（FIFO）。按键访问时刷新插入序，
  使"正在看的那条"不会被自己挤掉。
- **不持久化**：只在内存；页面重载（F5）后回初始态——这是需求「边界·不做」里明确接受的行为。
  不写 `localStorage`、不写台账、不经服务端。
- **不跨窗口**：记忆随会话所在页面实例存在；另一个浏览器标签打开同一看板互不影响。
- **无 schema 迁移**：不新增台账字段、不改 `DagState`（`dag/integration.ts` 的类型保持原样），
  因此没有旧数据回填问题；回滚即删除该模块与其调用点。

## 与既有 `DagState` 的关系 `serves: FR-1`

| 既有 | 新增 | 关系 |
|------|------|------|
| `DagState { dir, crit, focus, pinned }`（`dag/integration.ts`，viewer 内部状态） | `DagViewSnapshot` 的 DAG 四项 | **同名同义**，快照是它的可持久子集 + 滚动 + 页签；`createDagViewer` 的入参 `initial` 仍吃 `Partial<DagState>` |
| `DagViewer.state()` | 写回来源 | `dispose` 时用 `viewer.state()` 构造快照，**不新增 viewer 方法**、不改 `DagViewer` 契约 |

## 协议 / 台账零变更 `serves: FR-4`

- `StageOverview` / `StageTaskRef` / SSE 帧格式：**无变更**（一个字段都不加）。
- 台账 `RequirementRecord`：**无变更**。
- 队列文件 `queue.json`：**无变更**（视图状态从不回写队列）。
- 结论：本需求不产生任何需要迁移或版本兼容分支的数据形态。
