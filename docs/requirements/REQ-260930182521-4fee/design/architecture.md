# REQ-260930182521-4fee 架构设计 · 阶段色单一事实源 serves: FR-1, FR-2

> 把「阶段 → 颜色」与「卡片 → 着色阶段」两处分叉各收敛为一个事实源；纯展示层改动，不动数据与布局。

## A-1 · 现状（两套色板 + 两个口径） serves: FR-1, FR-2

```
                 ┌─────────────────────────────┐
  queue.json ──► │ 泳道 renderSwimlane          │ 列归属 = laneOf(t,kids)  ✅按环节
  (status/链)    │  卡片 data-status = t.status │ 着色   = 原始 status     ❌口径分叉
                 └──────────────┬──────────────┘
                                │ CSS 硬编码色板 A（node-panel.ts 235-240）
                 ┌──────────────┴──────────────┐
                 │ DAG Canvas renderCard        │ 着色   = getStatusBackgroundColor(t.status)
                 │                              │ 色板 B（card-types.ts 109-116）❌与 A 错位
                 └─────────────────────────────┘
```

| 分叉点 | 位置 | 后果 |
|--------|------|------|
| 色板 A ≠ 色板 B | styles/node-panel.ts vs dag/card-types.ts | integrating/testing/in_review 三色两视图语义颠倒 |
| 着色 key = 原始 status | node-panel.ts:215 / card-renderer.ts:148 | 卡站在「测试中」列却显「开发中」色 |

## A-2 · 目标架构（两个单一事实源） serves: FR-1, FR-2

```
dag/card-types.ts                      dag/progress-bar.ts
  STAGE_COLORS（6 阶段 × {bg,fg}）        laneOf(card,kids) → 环节 key
      │ 唯一色板                              │ 唯一着色口径
      ▼                                       ▼
┌─────────────┐  插值 CSS   ┌──────────────────────────┐
│ styles/     │ ◄────────── │ 泳道卡片 data-status       │
│ node-panel  │             │ = laneOf 结果              │
└─────────────┘             └──────────────────────────┘
      ▼                                       ▲
┌─────────────┐  getStatusBackgroundColor     │ resolveTasks 派生
│ card-render │ ◄────────── (task.stageKey ?? task.status)
│  (Canvas)   │             stageKey 由 integration.ts 用 laneOf 写入
└─────────────┘
```

- **色板事实源**：`STAGE_COLORS` 定义在 card-types.ts（DAG 模块已被样式层以外多处引用，放这里改动最小）；node-panel.ts 是 TS 模板字符串，可直接 import 插值，CSS 不再硬编码色值。
- **口径事实源**：着色 key 一律走 `laneOf`（既有导出，含 todo/solo/done 回落），任何渲染路径不得直接用原始 status 决定底色。

## A-3 · 改动文件清单 serves: FR-1, FR-2, FR-3

| 文件 | 改动 | serves |
|------|------|--------|
| src/client/dag/card-types.ts | 新增 STAGE_COLORS（泳道裁定色）；STATUS_BACKGROUND_COLORS/STATUS_TEXT_COLORS 改为从它派生 | FR-1 |
| src/client/styles/node-panel.ts | 六状态卡片底色 + 列头色点/计数胶囊改由 STAGE_COLORS 插值 | FR-1 |
| src/client/dag/integration.ts | resolveTasks 派生 stageKey = laneOf(t, kids) | FR-2 |
| src/client/dag/card-renderer.ts | renderCard 底色取 task.stageKey ?? task.status；cardHtml 的 data-status 同理 | FR-2 |
| src/client/node-panel.ts | renderSwimlane 卡片 data-status 写 laneOf 结果（renderDag 保留函数顺带对齐同一行） | FR-2 |
| tests/stage-colors.test.ts（新增） | 色值唯一源 + 着色口径一致性断言 | FR-3 |

## A-4 · 色板取值裁定（以 2026-09-24 泳道裁定色为准） serves: FR-1

Canvas 侧（色板 B）向泳道侧（色板 A）对齐，而非反向——色板 A 经两轮用户验收裁定（2026-09-23/24），且列头色点/计数胶囊已按它落地；反向方案会让泳道整列换色，视觉变化面更大。具体色值见 data-model.md D-1。
