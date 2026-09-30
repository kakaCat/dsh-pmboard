# REQ-260930182521-4fee 拆分计划 · 阶段色单一事实源与着色同源

> 目标 + 做法 + 改动盘点 + 任务表（批准后自动落库任务卡并进入实施）

## TL;DR

让 DAG 画布与泳道两个视图的任务卡颜色严格按「卡片所处阶段」展示：**色板收一处**（六阶段色值进 `STAGE_COLORS`，Canvas 与泳道 CSS 同源引用），**着色口径收一处**（着色 key 一律用 `laneOf` 推导的所处环节，与泳道列归属同源）。纯展示层改动，无台账/数据迁移。

```
改动后数据流：

  queue.json ──► laneOf(card, kids) ──┬──► 泳道卡片 data-status ──► CSS（由 STAGE_COLORS 插值）
                                      │
                                      └──► resolveTasks 派生 stageKey
                                                └──► renderCard 底色 = STAGE_COLORS[stageKey]
  单一色板：dag/card-types.ts · STAGE_COLORS（6 键 × {bg, fg}）
```

## 改动盘点

| 文件 | 动作 | 内容 |
|------|------|------|
| src/client/dag/card-types.ts | 改 | 新增 `STAGE_COLORS` + `TaskLaneKey` + `StageColor`；`getStatusBackgroundColor` / `getStatusTextColor` 改读它；删除错位的 STATUS_BACKGROUND_COLORS / STATUS_TEXT_COLORS |
| src/client/styles/node-panel.ts | 改 | 六状态卡片底色 + 列头色点/计数胶囊改为模板插值 `STAGE_COLORS`，不再硬编码色值 |
| src/client/dag/integration.ts | 改 | `resolveTasks` 派生 `copy.stageKey = laneOf(copy, copy.kids ?? [])` |
| src/client/dag/card-renderer.ts | 改 | `renderCard` 底色与 `cardHtml` 的 `data-status` 改用 `task.stageKey ?? task.status` |
| src/client/node-panel.ts | 改 | `renderSwimlane` 卡片 `data-status` 写 `laneOf(t, kidsOf(t.id))`；`renderDag`（保留函数）同行对齐 |
| tests/stage-colors.test.ts | 新增 | 色板唯一源 + 着色口径 + 兼容回落断言（4 卡全部在此收敛验收） |

## 色值契约（以 2026-09-24 泳道裁定色为准）

| 阶段 key | bg | fg |
|----------|----|----|
| todo | #fafafa | #c7c7cc |
| in_progress | rgba(0,113,227,.06) | #0071e3 |
| integrating | rgba(142,68,173,.07) | #8e44ad |
| testing | rgba(255,149,0,.08) | #ff9500 |
| in_review | rgba(233,30,99,.06) | #e91e63 |
| done | rgba(52,199,89,.08) | #34c759 |

## 覆盖对照表

| 需求条款 | 条款要点 | 接收任务 |
|----------|----------|----------|
| FR-1 | 六阶段色板单一事实源（Canvas 与泳道 CSS 同源，删除错位旧色板） | t1, t2 |
| FR-2 | 卡片着色状态改用 laneOf 推导，与泳道列归属同源 | t3 |
| FR-3 | 颜色一致性自动化断言（含存量回落兼容） | t4 |

## 任务表

| key | 标题 | phase | side | depends_on | serves |
|-----|------|-------|------|------------|--------|
| t1 | 六阶段色板收敛为单一常量源 | implement | frontend | — | FR-1 |
| t2 | 泳道样式与列头色点改由色板插值 | implement | frontend | t1 | FR-1 |
| t3 | 卡片着色改用 laneOf 推导（画布 + 泳道） | implement | frontend | t1 | FR-2 |
| t4 | 颜色一致性测试与兼容回落验证 | test | frontend | t2, t3 | FR-3 |

## 迁移与兼容

- **数据迁移**：无。`stageKey` 是内存派生字段，`queue.json` / 台账字段一字不改。
- **旧调用方**：`stageKey` 缺省时消费方回落原始 `status`；未知状态回落 todo 色。
- **回滚**：还原上表 5 个源文件 + 删测试文件，无数据风险。

## 下一步

implementing —— 提交后调 `reqboard_ask_confirm(target=plan)` 请人批准；批准即自动落库任务卡并开跑。
