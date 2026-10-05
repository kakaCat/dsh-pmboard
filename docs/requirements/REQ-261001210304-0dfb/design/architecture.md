# REQ-261001210304-0dfb 架构设计 · 视图状态保活与面板 HTML 稳定化 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

> 范围：只改 **client** 的「会话节点面板」这段渲染/挂载接缝（含需求详情页同一挂载入口的一行接线）。
> 刷新策略（5s 兜底轮询 + SSE 加速）、`dag/*` 渲染与布局算法、服务端协议与台账一律不动。
>
> 条件文档说明：本需求是纯前端改动，`requirement.md` 未声明 front-matter `sides`，故不触发
> 条件必交的 `design/frontend.md`；客户端契约（签名 / DOM 钩子 / 补丁函数）全部由本文与
> `interfaces.md` 承载，无后端侧改动（`design/backend.md` 同理不适用）。

## 问题与现状 `serves: FR-1, FR-2, FR-3`

**问题**：面板每 ≤5 秒（+ 每个 SSE 任务事件）重建一次，而"用户在图上做的选择"**没有任何地方存**，
重建时只能吃写死的缺省值 → 滚动回顶、方向回纵向、两个开关熄灭、钉住丢失、页签回 DAG。

| 关注点 | 现状载体 | 刷新时会发生什么 |
|--------|---------|-----------------|
| 方向 / 关键路径 / 只看主线 / 钉住 | `dag/integration.ts` 的 viewer 闭包 state（`createDagViewer` 内） | `mountDagCanvas` 先 `dispose` 再按写死 `initial` 重建（`views/dag-view.ts:348`）→ 归零 |
| 页签 `[DAG]/[泳道]` | 注入 HTML 上的 `is-active` / `hidden` class | 整段 innerHTML 重建 → 回到模板态（DAG） |
| 外层滚动 | `.dsh-pm-dag-canvas-wrap` 的 `scrollTop/scrollLeft` | 元素被换掉 → 归零 |
| 面板 `__html` 身份 | `renderNodePanel` 字符串（含「数据时间 HH:MM:SS」+ `data-fetched-at`） | 每轮都不同 → React 每次重设整段 innerHTML |

```
一次轮询（现状）
 panel-refresh onData(新对象) → setOverview
   ├─► effect(stageOverview) 重跑 → mountDagCanvas → dispose + createDagViewer(写死 initial)   ⇒ ① 状态归零
   └─► React 重设 __html（因数据时间戳进字符串）→ canvas / wrap 元素重建                        ⇒ ② 滚动归零、页签回位
```

## 总体方案 `serves: FR-1, FR-2, FR-3, FR-4`

三层各管一件事，**重建频率下降 + 重建后果无害**两条一起成立才算修完：

1. **记忆层**（新增 `src/client/dag/view-state.ts`）：一张**内存**表，键 = `canvasId + '::' + 需求 id`，
   值 = 视图快照（`dir/crit/focus/pinned/tab/scrollTop/scrollLeft`）。纯函数、零 DOM、可单测（FR-1 / FR-2 / FR-4）。
2. **挂载层**（`views/dag-view.ts`）：`mountDagCanvas` 支持 `opts.stateKey` —— 挂载时按记忆回填 `initial`、
   **同步工具条按钮的 `is-on`**、`paint` 之后恢复滚动；`dispose` 时把 `viewer.state()` + 滚动写回记忆（FR-1 / FR-2）。
3. **注入层**（`node-panel.ts` + `panel-freshness.ts` + 新增补丁函数）：**易变字段出注入字符串**——
   新鲜度（数据时间/stale/data-*）与相对时间（「刚刚 / N 分钟前」）在 HTML 里只留稳定钩子
   （`data-dsh-pm-fresh-slot` / `data-dsh-pm-rel="<ts>"`），值由渲染后的 DOM 补丁填（FR-3）。

```
修后一次轮询
 panel-refresh onData(新对象) → setOverview
   ├─► 面板 __html：与上一轮**逐字节相同**（数据没变）→ React 不动 DOM        ⇒ 滚动/页签/canvas 都还在
   ├─► hydrate(root, freshness/now)：只补时间文本（不换元素）
   └─► 若数据真的变了（__html 变了）→ 整段重建，但：
         mountDagCanvas(stateKey)：initial = 记忆快照；工具条 is-on 按记忆同步；
         paint 后恢复 scrollTop/scrollLeft；页签按记忆恢复                       ⇒ 重建无感（FR-1/FR-2）
```

**为什么必须两条都做**：只做记忆层 → 每 5 秒重建一次（滚动恢复但会闪、DOM 反复销毁重建、页签需要额外恢复）；
只做注入层 → 任务真的推进时（数据变化）照样重置。两条叠加才是"刷新只换数据"。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

```
                    ┌──────────────────────────────────────────────┐
   写入(dispose) ──►│  dag/view-state.ts   记忆表（Map，内存，无盘） │◄── 写入(页签点击)
                    │  key = canvasId + '::' + reqId                │
                    └───────────────┬──────────────────────────────┘
                                    │ 读取(挂载)
                                    ▼
 conversation-progress.ts ──► tryMountDagCanvas(tasks, ready, canvasId, {stateKey})
   │                                   │
   │                                   ▼
   │                          views/dag-view.ts  mountDagCanvas
   │                             ├─ initial ← 记忆快照（无记忆 = 现状缺省）
   │                             ├─ 工具条 is-on ← viewer.state()
   │                             ├─ paint 后恢复 wrap.scrollTop/Left
   │                             └─ disposer → 写回 state + 滚动
   │
   └─► 注入 HTML 后：hydrateNodePanel(root, freshness, tab)
          ├─ panel-freshness.ts：稳定占位 + hydrateFreshness()
          ├─ node-panel.ts：相对时间稳定钩子 data-dsh-pm-rel
          └─ 页签 is-active/hidden ← 记忆中 tab

 board-mount.ts（需求详情）──► tryMountDagCanvas(reqTasks, reqReady, 'dag-canvas', {stateKey: 'dag-canvas::'+req.id})
```

| 模块/文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/client/dag/view-state.ts` | 新增 | 快照类型 + `read/write/clear/clearByPrefix/_reset`（内存 Map，容量上限 16，FIFO 淘汰） | FR-1, FR-2, FR-4 | 新增，无既有调用方 |
| `src/client/views/dag-view.ts` | 改 | `mountDagCanvas(tasks, ready?, canvasId?, opts?)`：按 `opts.stateKey` 回填 initial、同步工具条 `is-on`、恢复/写回滚动、dispose 写回快照；`opts` 缺省 = 现状行为 | FR-1, FR-2, FR-4 | 需求详情 + 会话面板两处挂载入口 |
| `src/client/dag-mount.ts` | 改 | `tryMountDagCanvas` 透传 `opts`（rAF 包装不变） | FR-1, FR-2 | 同上 |
| `src/client/panel-freshness.ts` | 改 | `freshnessSpan()` 改为渲染**稳定占位**；新增 `hydrateFreshness(root, f)`（填文本/`is-stale`/`title`/`data-*`） | FR-3 | 面板头与红条渲染 |
| `src/client/node-panel.ts` | 改 | 相对时间改为稳定钩子 `<span data-dsh-pm-rel="<ts>">`；新增 `hydrateRelTimes(root, now)` 由补丁填文本；`renderNodePanel` 出参新增可选 `now`（测试可注入） | FR-3 | 面板 HTML 字符串 |
| `src/client/conversation-progress.ts` | 改 | 挂载时传 `stateKey = PANEL_DAG_CANVAS_ID + '::' + reqId`；注入 HTML 后调 `hydrateNodePanel`（新鲜度 + 相对时间 + 页签恢复）；页签点击写记忆；`reqId` 变化时清上一需求的键 | FR-1, FR-2, FR-3, FR-4 | 会话节点面板 |
| `src/client/board-mount.ts` | 改 | 需求详情挂载处传 `{ stateKey: 'dag-canvas::' + req.id }`（一行接线，复用同一机制） | FR-4 | 需求详情页 DAG |
| `tests/dag-view-state.test.ts` | 新增 | 记忆表语义 + 二次挂载回填（A1/A5，修前必红） | FR-5 | 新增用例 |
| `tests/panel-hydrate.test.ts` | 新增 | 补丁函数：新鲜度/相对时间/页签在**不换元素**前提下被填对（A3） | FR-5 | 新增用例 |
| `tests/panel-freshness-render.test.ts` | 改 | 断言从「字符串含数据时间」改为「字符串含稳定占位且**不含**时间戳」+ 两轮 `__html` 逐字节相同（A2，修前必红） | FR-5 | 既有用例 |

## 备选方案与取舍 `serves: FR-3`

| 方案 | 做法 | 判断 |
|------|------|------|
| **A（本次）** | 记忆层 + 注入层易变字段出字符串 | ✅ 频率与后果一起治；改动集中在 3 个 client 模块 + 1 个新模块 |
| B 只做记忆层 | 只做状态回填与滚动恢复 | ❌ 每 5 秒仍整段重建 DOM（元素反复销毁、滚动set 时机易闪、页签要额外恢复），治标 |
| C 只做注入层 | 只让 `__html` 稳定 | ❌ 任务真推进（数据变）时依旧重置；FR-1/FR-2 无法满足 |
| D 面板自持 DOM 容器 | 把注入 HTML 换成 React 组件/自管子树，脱离 `dangerouslySetInnerHTML` | ❌ 动架构 + 触 `node-panel` 全部既有断言，属重档；本次不做（升级信号出现再议） |
| E 落盘持久化 | `localStorage` 记住视图状态 | ❌ 与需求「边界·不做」冲突（F5 回初始态可接受）；且引入跨会话脏状态 |

## 风险与边界 `serves: FR-3, FR-4`

| 风险 | 判断 | 处置 |
|------|------|------|
| 依赖"React 对 `__html` 逐字节相同则不动 DOM"这一行为 | react-dom 的 `dangerouslySetInnerHTML` 差异比较按 `__html` 字符串身份进行（不同才 `setInnerHTML`） | 由 A2 用例把"字符串稳定性"钉死；浏览器手测 A4 作为端到端确认（若实测不符，退回 FR-1/FR-2 的恢复路径兜底，仍满足 A1/A3/A4） |
| 恢复滚动时容器尺寸尚未定稿，被浏览器夹取 | 恢复动作在 `paint()`（同步设 canvas 宽高）之后执行 | 恢复值若被夹取，下一帧仍会由 `ResizeObserver` 触发 `paint`——在 design 里记录为**已知次优**，手测 A4 判定 |
| `pinned` 指向新数据里已不存在的节点 | `resolveHighlight` 查不到即不高亮 | 无害；无需清理逻辑 |
| 记忆表跨需求串档 | 键含需求 id；切换需求即换键 | A5 用例锁定；`reqId` 变化时额外清上一键（内存卫生） |
| 异常态（刷新失败 / 版本陈旧）仍会重建 | 红条与"插件已更新"只在异常态出现，不是每轮常有 | 明示为可接受：异常态下重建一次，FR-1/FR-2 保证不打断阅读 |
| 记忆表无限增长 | 面板关闭不清（重开可续看）→ 条目随需求数增长 | 容量上限 16 + FIFO 淘汰；面板重开命中同一键 |
