---
serves: [FR-1, FR-4]
---

# 前端设计（REQ-261004184822-9881 泳道滚动位置与列高）

> 面向：前端开发、UI、测试。只讲 DOM 契约、样式改动与交互路径；结构（不新增层级）是硬约束。

## DOM 契约（只读，不改结构） <!-- serves: FR-1 -->

```
.dsh-pm-board（flex column，height: 100%，overflow: hidden）
├── .dsh-pm-head（flex: none）
├── .dsh-pm-lanes（flex: 1，overflow-x: auto）                    ← 横向位置读/写点
│   └── .dsh-pm-lane[data-lane="<status>"]（一列，flex column）
│       ├── .dsh-pm-lane-head（列头，flex: none）
│       └── .dsh-pm-lane-cards（flex: 1，overflow-y: auto）        ← 列内纵向位置读/写点
└── .dsh-pm-archived-bar（flex: none）
```

| 选择器 | 用途 | 本次是否改动 |
|---|---|---|
| `.dsh-pm-lanes` | 泳道行；横向滚动容器 | 样式改（FR-4），类名与结构**不变** |
| `.dsh-pm-lane[data-lane]` | 一列；`data-lane` 是列内位置的记忆键 | 样式改（FR-4），`data-lane` 属性契约**不变** |
| `.dsh-pm-lane-cards` | 列内卡片区；纵向滚动容器 | 样式改（FR-4），**不新增包裹层** |

来源：[`src/client/views/board.ts`](../../../../src/client/views/board.ts) 的 `buildBoard`。

## 样式改动（列高铺满） <!-- serves: FR-4 -->

现状出处：[`src/client/styles/base.ts`](../../../../src/client/styles/base.ts) §泳道（`.dsh-pm-lanes` 行 92-95、`.dsh-pm-lane` 行 96-104、`.dsh-pm-lane-cards` 行 141）。

| 规则 | 现状 | 改为 | 理由 |
|---|---|---|---|
| `.dsh-pm-lanes` | `flex: 1; align-items: flex-start` | `flex: 1; min-height: 0; align-items: stretch` | 列拉伸到泳道行高（行高已是头部与归档条之间的剩余空间）；`min-height: 0` 允许行在矮窗口下收缩 |
| `.dsh-pm-lane` | `max-height: calc(100vh - 200px)` | **删除该行**，加 `min-height: 0` | 高度由拉伸决定；`100vh - 200px` 是随宿主布局漂移的魔术值——截图里正是它把列截短、下方留白 |
| `.dsh-pm-lane-cards` | `min-height: 24px; flex: 1; overflow-y: auto` | `min-height: 0; flex: 1; overflow-y: auto` | 矮窗口下列内可收缩到 0，不撑破看板；空列占位仍由 `.dsh-pm-lane-cards:empty::after` 提供 |

**几何口径**（验收照它看）：

```
看板可视区高度 H
├── .dsh-pm-head          约 56px（flex: none）
├── .dsh-pm-lanes         高度 = H − head − 归档条      ← 列高与之相等（直通到底）
└── .dsh-pm-archived-bar  折叠态约 40px（flex: none）
```

**硬约束**：不新增 DOM 层级、不新增 class、不引入 `overflow-y` 到 `.dsh-pm-board`（出现"整页纵向滚 + 列内滚"双滚动条即判不通过）。

## 交互路径 <!-- serves: FR-1 -->

| 交互 | 现状 | 本次之后 |
|---|---|---|
| 点「刷新」 | 位置归零 | 位置保持 |
| 20 秒轮询到时 | 位置归零 | 位置保持 |
| 另一窗口改台账（SSE） | 位置归零 | 位置保持 |
| 泳道 → 列表 → 泳道 | 归零 | 保持（离开泳道时的位置） |
| 泳道 → 需求详情 → 返回 | 归零 | 保持 |
| 浏览器刷新页面 | 归零 | 归零（接受：不落盘，见 FR-2） |

## 前端测试口径 <!-- serves: FR-1, FR-4 -->

- **自动化**（`tests/board-lane-scroll.test.ts`）：桩 DOM 断言位置往返与列隔离（TC-1~TC-3）、记忆隔离与不落盘（TC-4）、`attachBoard` 接线（TC-5）、样式静态断言（TC-6）。
- **手工**（GUI）：TC-7 三连刷 + 列内翻 + 拉矮窗口；证据为 `evidence/` 下截图。
