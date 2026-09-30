# REQ-260930182521-4fee 数据模型 · 色值契约与兼容 serves: FR-1, FR-2

> 无台账/queue.json 变更；本文件钉死六阶段色值契约与派生字段的生命周期。

## D-1 · 六阶段色值表（唯一事实源内容） serves: FR-1

| 阶段 key | 中文 | bg（卡片底色） | fg（主色：色点/胶囊/文本） |
|----------|------|----------------|-----------------------------|
| todo | 待开始 | #fafafa | #c7c7cc |
| in_progress | 开发中 | rgba(0,113,227,.06) | #0071e3 |
| integrating | 联调中 | rgba(142,68,173,.07) | #8e44ad |
| testing | 测试中 | rgba(255,149,0,.08) | #ff9500 |
| in_review | 待复核 | rgba(233,30,99,.06) | #e91e63 |
| done | 已完成 | rgba(52,199,89,.08) | #34c759 |

取值来源：styles/node-panel.ts 235-240（卡片底色）与 186-199（列头色点/计数胶囊），即 2026-09-24 用户验收裁定色；Canvas 侧旧值（#fff4e5/#e8f9ed/#f3e5ff 等）作废。

## D-2 · 派生字段契约（CardData.stageKey） serves: FR-2

| 字段 | 类型 | 约束 | 生命周期 |
|------|------|------|----------|
| stageKey | string（六值之一） | 可选；仅由 resolveTasks 用 laneOf 写入 | 内存派生，随每次 paint 重算，不落 queue.json/台账 |

队列原始数据（status/parentId/stageKind）一字不改；stageKey 与泳道列 key 同词同源，任何一处改 laneOf 口径，两视图同时跟随。

## D-3 · 迁移与回滚 serves: FR-1, FR-2

- **数据回填**：无（纯展示层）。
- **开关/灰度**：不需要；色值变化即全部生效，验收以截图对比为准。
- **回滚路径**：git revert 本需求触及的 6 个文件即可，无数据风险；旧常量已删除无残留引用（FR-3 测试兜底）。
