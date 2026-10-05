# REQ-261001210304-0dfb 接口设计 · 挂载接缝 / 记忆表 / 面板补丁 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 全部是 **client 内部模块接口**（无 HTTP、无工具、无协议变更）。原则：**新增参数一律可选，缺省 = 现状行为**，
> 既有调用方不改也能跑；不新增错误码、不抛异常（DOM 缺失/无画布时静默返回，与现状一致）。

## 1. 挂载接口：`mountDagCanvas` / `tryMountDagCanvas` `serves: FR-1, FR-2, FR-4`

```ts
// src/client/views/dag-view.ts
export interface MountDagOptions {
  /**
   * 视图状态记忆键。传了就启用记忆：挂载前按键回填 initial、dispose 时按键写回快照。
   * **不传 = 不启用记忆 = 现状行为**（仍用缺省 initial）。
   * 约定形态：`<canvasId>::<requirementId>`（键含需求 id，避免同一画布串档）。
   */
  stateKey?: string
}

// 签名扩展（第 4 参新增，前 3 参语义与顺序不变）
export function mountDagCanvas(
  tasks: DagTaskLike[],
  ready?: readonly string[],
  canvasId?: string,            // 缺省 'dag-canvas'
  opts?: MountDagOptions,
): DagViewer | undefined
```

```ts
// src/client/dag-mount.ts
export function tryMountDagCanvas(
  tasks: DagTaskLike[],
  ready?: readonly string[],
  canvasId?: string,
  opts?: MountDagOptions,       // 透传给 mountDagCanvas
): void
```

**行为契约（逐条可测）**：

| 输入 | 行为 |
|------|------|
| `opts` 缺省 / `opts.stateKey` 缺省 | 与改造前**逐字节同行为**：`initial = { dir:'vertical', crit:false, focus:false, pinned:null }`，不读写记忆表 |
| 传 `stateKey` 且记忆为空 | 用缺省 initial（首次打开 = 初始态） |
| 传 `stateKey` 且记忆有值 | `initial` 取记忆（缺省字段各自回落）；挂载后**工具条 `is-on` 与 `viewer.state()` 对齐**（方向、关键路径、只看主线三个按钮）；`paint()` 之后把 `wrap.scrollTop/scrollLeft` 恢复为记忆值 |
| 同名 canvasId 重复挂载（现状语义） | 仍先 `disposeDagCanvas(canvasId)` 再挂新的；**dispose 先写回快照再释放**（写回顺序是硬要求，否则丢最后一次改动） |
| 画布不在 DOM / 顶层卡为空 | 现状提前返回语义不变；若 `stateKey` 有值且旧实例存在，仍先 dispose（写回快照）——与"释放早于提前返回"的既有不变量一致 |
| 返回 | `DagViewer | undefined`（同现状，不新增返回形状） |
| 错误语义 | **不抛**。内部异常沿用 `tryMountDagCanvas` 的 `console.error` 兜底（现状） |

**调用方接线**：

```ts
// src/client/conversation-progress.ts（会话节点面板）
const key = PANEL_DAG_CANVAS_ID + '::' + reqId          // 例：np-dag-canvas::REQ-xxxx
tryMountDagCanvas(tasks, undefined, PANEL_DAG_CANVAS_ID, { stateKey: key })

// src/client/board-mount.ts（需求详情页，一行接线复用同一机制）
tryMountDagCanvas(reqTasks, reqReady, 'dag-canvas', { stateKey: 'dag-canvas::' + req.id })
```

## 2. 记忆表接口：`src/client/dag/view-state.ts`（新增） `serves: FR-1, FR-2, FR-4`

```ts
export interface DagViewSnapshot { dir?: LayoutDir; crit?: boolean; focus?: boolean; pinned?: string | null;
                                   tab?: 'flow' | 'list'; scrollTop?: number; scrollLeft?: number }

/** 读快照（不存在 → undefined）。返回**拷贝**，调用方改它不影响表内值。 */
export function readDagViewState(key: string): DagViewSnapshot | undefined

/** 合并写（部分字段更新；页签点击只写 tab）。非法值（非有限数/负滚动）按 0 处理；键写入时刷新插入序。 */
export function writeDagViewState(key: string, patch: DagViewSnapshot): void

/** 删一条（切换需求时清上一需求的键）。 */
export function clearDagViewState(key: string): void

/** 按前缀清（形如 `np-dag-canvas::`；用于一次性清掉某块画布的所有需求条目）。 */
export function clearDagViewStateByPrefix(prefix: string): void

/** 只读诊断（面板/测试观测当前条目数）。 */
export function dagViewStateSize(): number

/** 测试专用：清空整表。生产代码不得调用。 */
export function _resetDagViewState(): void
```

- **错误语义**：任何入参都不抛。空串键 = 正常键（不做特殊处理）；容量上限 `MAX_ENTRIES = 16`，超出 FIFO 淘汰，
  读取命中会刷新插入序。
- **纯度**：零 DOM、零 IO、零计时器 → 可在 Node 环境直接单测（与 `panel-refresh.ts` 同款纪律）。

## 3. 面板补丁接口（易变字段出字符串） `serves: FR-2, FR-3`

```ts
// src/client/panel-freshness.ts
/** 稳定占位（注入字符串里只放这个；不含任何随时间变化的值）。 */
export function freshnessSpan(): string            // 改造：不再吃 NodePanelFreshness

/** 渲染后补值：填「数据时间 HH:MM:SS」/ is-stale / data-fetched-at / data-stale / title。 */
export function hydrateFreshness(root: ParentNode, f: NodePanelFreshness): void

// src/client/node-panel.ts
/** 相对时间钩子（注入字符串里只放稳定时间戳属性；文本由补丁填）。 */
export function relSlot(at: number): string        // → <span data-dsh-pm-rel="1700000000000"></span>
/** 渲染后补值：对所有 [data-dsh-pm-rel] 计算「刚刚 / N 分钟前 / 日期」。 */
export function hydrateRelTimes(root: ParentNode, now?: number): void

/** 面板补丁总入口（会话组件在注入 HTML 后调用一次）。 */
// src/client/panel-hydrate.ts（新增）
export function hydrateNodePanel(root: ParentNode, input: {
  freshness?: NodePanelFreshness
  tab?: 'flow' | 'list'
  now?: number
}): void
```

**契约**：

| 项 | 约定 |
|----|------|
| 幂等 | 重复调用无副作用（只改文本与属性，不插删元素、不换 canvas） |
| 找不到钩子 | 静默返回（阶段无该块时正常情况） |
| `now` | 可注入（测试固定时钟）；缺省 `Date.now()` |
| 不变量（A2 的判据） | 同一份 payload + 仅 `freshness.fetchedAt`/时钟不同 → `renderNodePanel` 输出**逐字节相同**；承载 DAG 的片段里**不含**任何时间戳文本 |
| 异常态例外 | 刷新失败红条（`dsh-pm-np-fresh-err`）与「插件已更新」按钮仍在字符串里（只在异常态出现，允许随状态变化重建），但它们**不得包含每轮都变的值**以外的内容 |

## 4. DOM 契约（稳定钩子，样式与探针依赖） `serves: FR-3`

| 钩子 | 位置 | 语义 |
|------|------|------|
| `[data-dsh-pm-fresh-slot]` | 面板头（原 `dsh-pm-np-fresh` 同位置，类名保留 `dsh-pm-np-fresh`） | 新鲜度补丁锚点 |
| `data-fetched-at` / `data-stale` / `data-refresh-ms` | 上述锚点元素 | **由补丁写**（不在字符串里），既有选择器语义不变 |
| `[data-dsh-pm-rel]="<ms>"` | 面板头「最近动态」、草稿「创建时间」、归档「已归档」 | 相对时间补丁锚点；属性值 = 原始毫秒时间戳（稳定） |
| `[data-action="np-switch-view"][data-view]` | 实施节点页签 | 不变；点击时把 `data-view` 写进记忆 |
| `.dsh-pm-dag-canvas-wrap` | 画布外层 | 滚动恢复/记录锚点（沿用既有类名） |

## 5. 受影响的既有测试与调用方 `serves: FR-5`

| 对象 | 影响 | 处置 |
|------|------|------|
| `tests/panel-freshness-render.test.ts` | 现断言"字符串含 `数据时间 <clock>`"（L70/L76/L95/L107/L109） | 改断言为"字符串含稳定占位、**不含**时间戳与 `数据时间`"；新增两轮 `__html` 逐字节相同用例；补值行为迁到 `tests/panel-hydrate.test.ts` |
| `tests/dag-view.test.ts` | 既有挂载/释放/事件委托用例（无 `opts` 路径） | 语义不变，应保持全绿（缺省 = 现状行为，是本次的兼容承诺） |
| `tests/node-panel.test.ts`、`tests/card-layer.test.ts`、`tests/stage-colors*.test.ts` | 用 `renderNodePanel` 但不涉新鲜度/相对时间文本 | 预期不受影响；若有断言命中旧文本，按同样口径改为钩子断言（实施时以实跑为准） |
| `src/client/conversation-progress.ts`、`src/client/board-mount.ts` | 调用方 | 按第 1 节接线；无其他调用方需要改 |
| 服务端 / 工具层 | 无 | 本需求不碰 host 侧任何接口 |
