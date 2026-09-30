# REQ-260930182521-4fee 测试策略 · 颜色一致性 serves: FR-3

> 全部走纯函数/DOM 字符串断言，Node 环境可跑，不依赖浏览器；测试文件 tests/stage-colors.test.ts（新增）。

## T-1 · 测试矩阵 serves: FR-3

| 用例 | 断言 | 对应验收口径 |
|------|------|--------------|
| TC-1 色板六键齐全 | STAGE_COLORS 含且仅含六个 TaskLaneKey，bg/fg 均非空 | 色板事实源存在 |
| TC-2 取色函数同源 | getStatusBackgroundColor(s) === STAGE_COLORS[s].bg（六阶段逐一） | FR-1 |
| TC-3 CSS 同源 | NODE_PANEL_CSS 文本包含每个阶段的 bg 与 fg 值（证明泳道 CSS 由常量插值，无第二套硬编码） | FR-1 |
| TC-4 泳道着色=列归属 | 组 A：renderSwimlane 输出中该卡 data-status="testing" 且落在 data-col="testing" 列内 | FR-2 |
| TC-5 DAG 着色=列归属 | 同一 fixture 经 resolveTasks 后 stageKey === 'testing'；cardHtml 的 data-status="testing" | FR-2 |
| TC-6 回落 | todo 卡 / 无子卡 done 卡 / solo 卡：stageKey === 原始 status；未知状态取色回落 todo | 兼容 |

## T-2 · Fixture 设计 serves: FR-3

最小队列（三组，分别喂 TC-4/TC-5 与 TC-6）：

- **组 A（链在测试）**：父卡 P（status=in_progress）+ 子卡 dev=done / integrate=done / review=done / test=in_progress → laneOf(P) = testing
- **组 B（链在复核）**：父卡 Q（status=in_progress）+ 子卡 dev=done / integrate=done / review=todo / test=todo → laneOf(Q) = in_review
- **组 C（回落）**：todo 卡、无子卡的 done 存量卡、显式 solo 卡 → stageKey === 原始 status

## T-3 · 验收命令 serves: FR-3

```bash
pnpm vitest run tests/stage-colors.test.ts   # 期望：10 个用例全绿
pnpm vitest run                              # 期望：全量回归无【本次引入的】新红
```

人工验收（需求文档 L1-2）：刷新 GUI，父卡链推进到「测试」→ 泳道卡片/列头色点/DAG 节点三处同为橙系。
