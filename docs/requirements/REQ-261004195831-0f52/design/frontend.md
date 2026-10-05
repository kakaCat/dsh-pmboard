---
serves: FR-1, FR-2, FR-3, FR-4
---

# 前端设计（REQ-261004195831-0f52） serves: FR-1, FR-2, FR-3, FR-4

> 本需求是**客户端取数路径修复**，不是视觉改造：DRY 于复用既有骨架与样式，只新增两个文件、
> 改动三处既有文件。原型页面不新增（详情页 DOM 结构与类名保持不变，故无新交互稿）。

## 目录与包结构 <!-- serves: FR-1, FR-3 -->

```
 /Users/mac/Documents/ai/dsh/dsh-pmboard/src/client/
 ├── req-detail-store.ts        （本需求新增：详情全文内存态 + 取数编排，纯逻辑无 DOM）
 ├── views/
 │   ├── detail-states.ts       （本需求新增：loading / missing / error 三个占位纯函数）
 │   ├── stage-detail.ts        （既有，改：buildReqDetail 入参兜底 + 评论计数口径）
 │   ├── stage-panel.ts         （既有，改：任务卡评论渲染同步兜底）
 │   └── board.ts               （既有，不改）
 ├── render/
 │   └── dom-utils.ts           （既有，改：renderComments 接受 undefined）
 ├── board-mount.ts             （既有，改：case 'req' 数据来源与三态分支；新增 retry-detail 委派）
 ├── board-scroll.ts            （既有，复用：评论草稿「重绘前取值/重绘后回填」范式）
 ├── dag/view-state.ts          （既有，复用不改：详情内 DAG 视图状态记忆）
 └── styles/
     └── base.ts                （既有，改：详情三态占位仅复用既有空态/错误类，必要时加 ≤3 条规则）
```

**落此处的理由**：

- `req-detail-store.ts` 放 `src/client/` 根（与 `board-scroll.ts` / `board-focus.ts` / `panel-hydrate.ts` 同级）：
  它是看板的**视图态服务**，不属于某个具体视图（详情与任务页都可复用其条目），也不进 `views/`（那里只放渲染纯函数）。
- `detail-states.ts` 放 `views/`：与 `stage-detail.ts` 同为「产出 HTML 字符串的纯函数」，
  分离出来是为了让三态文案可被单测直接断言（`stage-detail.ts` 已接近尺寸门禁上限）。
- 不新建 `components/` 目录：本包是命令式 DOM 渲染（无组件框架），沿用既有结构。

## 数据流 <!-- serves: FR-1, FR-2, FR-3 -->

```
 ① 打开详情
 用户点卡片（data-action="open-req"）/ 深链 ?req=<id> / 会话面板「项目看板 ↗」
        │
        ▼
 board-mount: mode = { kind: 'req', reqId }  ──▶  render()
        │
        ├─ 摘要（state.requirements）只用于：标题 / 状态 / 来源窗口 chip / 阶段骨架
        │
        ▼
 reqDetailStore.ensure(reqId, summary.version, state.revision)
        │
   ┌────┴──────────────────────────┬───────────────────────┐
   ▼                               ▼                       ▼
 loading 占位                  ready（全文）           missing / error 占位
 buildDetailLoading       buildReqDetail(record,…)   buildDetailMissing /
   │                            （评论/产物/验收/归档）  buildDetailError（+ 重试）
   └──────────── 条目变化 → onChange → render() ────────┘

 ② 详情在屏时的刷新（SSE 台账事件 / 20s 轮询 / 手动「刷新」）
 fetchAll() ──▶ state 更新 ──▶ render() ──▶ ensure(reqId, version, revision)
        │                                          │
        │                            same version & revision → 直接复用（0 请求）
        └────────────────────────── 变化了 → 1 次请求 → 替换条目 → 重绘
```

## 交互态保持 <!-- serves: FR-3 -->

重绘（`viewEl.innerHTML = …`）会重建详情 DOM，故以下状态按本仓既有「重绘前取值 / 重绘后回填」
范式保住（与泳道滚动位置、DAG 视图状态同款做法）：

| 交互态 | 存放处 | 重绘后行为 |
|---|---|---|
| 当前 Tab（概览/执行/时间线/归档/追溯/Token） | DOM `active` 类 | 重绘前读出 `data-tab-content` 的可见项，重绘后写回并同步 `.dsh-pm-tab.active` |
| 当前阶段节点选中（`activeStage`） | 闭包变量（既有） | 既有 `setStageNavActive(activeStage)` 继续生效 |
| DAG 画布（方向 / 关键路径 / 只看主线 / 滚动） | `dag/view-state.ts` 内存记忆（既有） | 不改，重绘后按 `stateKey='dag-canvas::<reqId>'` 恢复 |
| 评论输入框未提交草稿 | 重绘前后取值/回填（**本需求新增**） | 详情仍在同一 reqId 时回填 `input[data-role="comment-input"]` 的值与焦点 |
| 详情条目缓存 | `req-detail-store` 内存 `Map` | 跨重绘保留；换 reqId 各记各的；页面刷新清空 |

**边界**：切到**别的** reqId 时草稿不回填（避免把 A 需求的评论贴到 B 需求）；Tab / 草稿回填只
在「重绘前后都是详情且 reqId 未变」时发生，找不到元素即静默跳过（与 `restoreBoardScroll` 同纪律）。

## 样式改动 <!-- serves: FR-2 -->

- 三态占位**优先复用**既有类：`.dsh-pm-detail`（外壳）、`.dsh-pm-empty`（空态）、
  `.dsh-pm-error` / `.dsh-pm-error-hint-label` / `.dsh-pm-error-hint`（错误与 hint，`buildError` 已用）。
- 允许新增的样式上限：**≤3 条规则**（如 `[data-detail-state="loading"]` 的骨架微调），
  且只写在前端样式分片 `src/client/styles/base.ts` 的详情段内；**不得**引入新主题令牌、不得改既有类语义。
- 不改颜色/间距/字号的既有体系；不做动画（除既有 loading 文本）。

## 兼容与降级 <!-- serves: FR-2, FR-4 -->

| 情形 | 行为 |
|---|---|
| 旧服务端（无 `/requirements/:id`） | `error` 态：原因 + hint 原样呈现，不假装有数据 |
| 取数慢 | `loading` 占位于骨架内，Tab / 返回仍可点（不阻塞整个看板） |
| 用户取数途中点「← 看板」 | 到达的响应被丢弃（`reqId` 不再匹配当前视图），不改写视图 |
| 记录缺 `comments` / 本体字段 | 空态渲染（FR-4），不抛异常、不整块消失 |
| 极端：条目缓存满（>16 条需求来回看） | 淘汰最旧条目，下次进入重取（可接受） |
