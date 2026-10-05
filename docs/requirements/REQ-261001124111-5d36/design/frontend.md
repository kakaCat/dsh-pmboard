---
req: REQ-261001124111-5d36
doc: frontend
serves: FR-1, FR-2, FR-3, FR-4, FR-5
---

# 前端设计 · 面板自刷新与陈旧可见（REQ-261001124111-5d36）

> **TL;DR**：客户端只做四件事——**挂上调度器**（展开即拉 + 5 秒轮询 + SSE 加速）、**头部加数据时间**、
> **加两条可见提示**（刷新失败红条 / 插件已更新）、**切换需求先清空**。DOM 只在面板头与内容之间**插三处**，
> 既有区块、类名、折叠结构一律不动。

## 客户端落点总览（`serves: FR-1, FR-2, FR-3, FR-4, FR-5`）

| 文件 | 角色 | 关键改动 |
|---|---|---|
| `src/client/panel-refresh.ts`（新增） | 刷新调度器（纯逻辑） | `createPanelRefresh()`：立即拉 + 周期 + 事件触发 + 在飞去重 + 失败/陈旧记账 |
| `src/client/conversation-progress.ts` | 面板宿主（React 槽位组件） | 用调度器替换两处刷新 Effect；展开 `start()` / 关闭 `stop()`；`reqIdForStage` 变化先清空；新增 `np-reload` 点击委托 |
| `src/client/node-panel.ts` | 面板 HTML 渲染（纯字符串） | `renderHead` 增数据时间；新增 `renderFreshnessBar()`；`NodePanelInput` 增 `freshness` / `buildNotice` |
| `src/client/styles/node-panel.ts` | 面板样式 | 新增 4 个类：`.dsh-pm-np-fresh`（+`.is-stale`）、`.dsh-pm-np-fresh-err`、`.dsh-pm-np-build-notice` |
| `scripts/wrap-client.mjs` | 客户端构建包裹 | 注入 `window.__DSH_PM_BUILD__`（`sha256(lib/client.cjs)` 前 12 位） |

## DOM 增量与类名（`serves: FR-2, FR-3, FR-5`）

```
<div class="dsh-pm-np" data-stage="decomposing" data-state="...">
  <div class="dsh-pm-np-req">…REQ pill + 标题…</div>
  <div class="dsh-pm-np-head">
    <span class="dsh-pm-np-head-state">已拆分</span>
    <span class="dsh-pm-np-head-title">待拆分</span>
    <span class="dsh-pm-np-head-time">36 分钟前</span>
    + <span class="dsh-pm-np-fresh" data-fetched-at="1790830000000" data-stale="0" data-refresh-ms="5000">数据时间 12:46:40</span>   ← 新增（FR-2）
    <button class="dsh-pm-np-board-entry">项目看板 ↗</button>
  </div>
  + <div class="dsh-pm-np-build-notice" role="status" data-action="np-reload">插件已更新（S1 → S2），点此刷新</div>  ← 新增（FR-5，按需）
  + <div class="dsh-pm-np-fresh-err" role="alert" data-last-ok="…">刷新失败：timeout · 显示的是 12:45:02 的旧数据</div>  ← 新增（FR-3，按需）
  <details class="dsh-pm-np-fold">ℹ️ 基础信息 …</details>
  <div class="dsh-pm-np-sec-label">📊 DAG 层级</div> …
</div>
```

三条纪律：① 新增元素**只在需要时出现**（缺省不渲染 → 既有断言与视觉零变化）；
② 「数据时间」永远在面板头（一行，不换行、不遮挡 `项目看板 ↗`）；
③ 失败红条与版本提示**不覆盖**内容，插在头部与内容之间，纯文本 + 左侧竖条，不用弹窗/遮罩。

## 样式落点（`serves: FR-2, FR-3, FR-5`）

| 类 | 视觉 | 约束 |
|---|---|---|
| `.dsh-pm-np-fresh` | 11px、次级灰（复用面板既有 `--dsw-text-secondary` 口径） | 不新增色值 |
| `.dsh-pm-np-fresh.is-stale` | 转警示态（沿用面板既有警示红/橙） | 与「失败红条」同色系，避免第三套颜色 |
| `.dsh-pm-np-fresh-err` | 浅底 + 左侧 3px 竖条 + 深色文字，`font-size: 12px` | 不遮挡、不浮动、不吸顶 |
| `.dsh-pm-np-build-notice` | 同款浅底 + 可点击（下划线/箭头） | hover 有反馈；不自动消失（人点了才走） |

样式统一写进 `src/client/styles/node-panel.ts`（面板样式唯一落点，不改 `styles.ts` 汇聚层）。

## 事件委托与交互（`serves: FR-1, FR-5`）

- 复用 `conversation-progress.ts` 既有模式：`document` 级 `click` 委托监听（`data-action` 路由），
  因为面板是 `dangerouslySetInnerHTML` 注入的字符串 HTML，React 事件挂不上。
- 新增 `data-action="np-reload"` → `location.reload()`（唯一动作；**不自动 reload**）。
- 既有两个委托监听（`np-switch-view` 切 tab、`open-doc` 开文档）保持不变；`np-switch-view` 的
  `[hidden]` 切换逻辑不动（泳道/DAG 两 pane 的显隐仍由它管）。
- 轮询/事件刷新只改 `stageOverview` 状态，**不重挂** DAG canvas 之外的实例（Canvas 挂载 effect 已按
  `[detailOpen, selectedStage, stageOverview]` 依赖重挂，本需求不改它，只在数据变化时才重挂）。

## 文案与无障碍（`serves: FR-2, FR-3, FR-5`）

| 元素 | 文案 | 无障碍 |
|---|---|---|
| 数据时间 | `数据时间 12:46:40`（无数据：`数据时间 —`） | `title="面板每 5 秒自动刷新"`；`data-stale` 供样式与测试选择 |
| 刷新失败 | `刷新失败：<原因> · 显示的是 12:45:02 的旧数据` | `role="alert"`（读屏即时播报） |
| 版本提示 | `插件已更新（S1 → S2），点此刷新` | `role="status"` + `data-action="np-reload"`；键盘可达（渲染为 `<button>` 或带 `tabindex` 的可点区域） |
| 加载中 | `详情加载中…`（沿用既有文案，不新增） | 既有实现不变 |
