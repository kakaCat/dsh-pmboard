<!-- serves: FR-6, FR-8 -->
# 数据模型（REQ-261006130057-7a43）

> 覆盖 4 要求：明确「是否改表 / 改 schema、迁移方式与回滚」。结论先行：**不改**。

## 结论：不改表、不改 schema、无迁移 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

本轮是**呈现层优化 + 只读消费既有数据**：

- 台账（queue.json / SQLite）零字段变更；`RequirementRecord` / `TaskRecord` / `VerificationSheet`
  形状不动。
- RTM YAML（`rtm-*.yml`）只读消费，不写新文件、不改生成器。
- 协议层只**加可选字段**（`tabCounts.verify`、对话响应 `page`、新端点响应），旧记录/旧服务端
  天然兼容（缺省 = 没有，见 interfaces.md §兼容矩阵）。

## 数据源映射表（每面板从哪来） `serves: FR-6, FR-8`

| 面板/区块 | 数据源（唯一事实源） | 读法 |
|---|---|---|
| 验收 RTM 列表 | `req.verification.sheet`（逐项）+ `rtm-accepting.yml` 的 `acceptance_tracking`（FR 维度） | QueryVerify 读台账 + readRTM；对齐键 `rtmTraceIdOf` |
| 覆盖链 chip | `fr_to_design / fr_to_tasks / fr_to_tests`（rtm-design/decomposing/accepting.yml） | stage-overview/assembler 既有 `assembleTraceability()` 复用 |
| 材料摘要/历史 | `req.verification`（提交材料 + `sheetHistory`） | 台账直读 |
| 对话消息流 | 会话事件 + 评论（服务端归一为 `DialogueItem`，过滤 tool/reasoning） | 端点加 `before/limit` 游标 |
| 头部/状态带/进度带 | `ReportResponse`（head/progress/gaps/actions/outcome） | 形状不动，只改 render |
| DAG | 任务卡（现有画布数据流） | 零改动（D-3） |

## 观测量（proto-geometry）形状 `serves: FR-4, FR-8`

原型 `prototypes/detail.html` 的 geometry 注释块与实施探针共用同一形状（§3.1）：

```json
{"observations":[{"name":"tabsTop","value":1041,"unit":"px","at":{"width":1280,"state":"inflight"}}]}
```

- 字段：`name` / `value` / `unit ∈ px | count | ratio` / `at.width`（显式窗口宽）/
  `at.state ∈ inflight | terminal`。
- **禁阈值字段**：threshold/max/min/limit/expected/tolerance/budget/target/pass/fail 一律不出现
  （D-10 纪律：观测量只记实测，判定在测试断言里做）。
- 本需求的观测量集（原型 v1.5 实测，1280 宽 inflight）：`tabsTop=1041`、`headHeight=133`、
  `bandHeight=185`、`verifyTabIndex1Based=5`；实施后探针复测同名量做 before/after 对照
  （原型值含导览区，探针按真实页面口径另测，不混用）。

## 回滚 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

- **无数据回填**，回滚不碰台账：纯代码回滚 = `git revert` + `pnpm build:client`（C-12）
  + `pnpm build`（C-11）。
- 新增端点 `verify` 与可选字段天然向后兼容：回滚前端后新端点无人调用；回滚服务端后
  新前端走 degraded 分支（interfaces.md §兼容矩阵），**任意半回滚状态都不白屏**。
- docs 面板核验节的删除只在前端：服务端 `DocsResponse.verification` 保留，回滚即恢复。
