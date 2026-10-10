# 代码地图（模块级）

> 生成物：由 `scripts/kb-build.mts` 从 `src/**/*.ts` 确定性抽取，**请勿手改**（改源码后重跑）。
> 全量符号（1173 条）在 `docs/knowledge/code-map.symbols.tsv`——机器索引、不进上下文，用 `reqboard_kb(kind='map', query='<符号>')` 检索。

## 模块总览 #modules

| 模块 | 文件 | 字符 | 导出符号 | 角色 |
|---|---|---|---|---|
| `pm/pm-client` | 140 | 1415874 | 981 | Dsh-pmboard client half — M3: 泳道看板 GUI（需求状态列 + 详情 + 待归类 + 会话跳转）。 |
| `src/http` | 17 | 193953 | 71 | dsh-pmboard/http/client-build — 客户端构建戳（REQ-261001124111-5d36 t4）——把「页面跑的是哪一版前端代码」变成可比较的事实。 |
| `src/adapters` | 34 | 184020 | 82 | dsh-pmboard/adapters/AgentDeliverer — 会话投递适配器（REQ-e3b6a0 t4 / FR-5）——**Dive专用投递实现**。 |
| `src` | 3 | 80656 | 12 | 本插件**自发事件**的 cordis 事件表声明（纯类型，零运行时）。 |
| `src/wiring` | 3 | 31255 | 27 | dsh-pmboard/wiring/not-ready — 未就绪态的接线点（REQ-261003191948-e94a · t4 / FR-1、FR-5、FR-6）。 |
| `src/__integration_test__` | 1 | 3611 | 0 | （无模块说明） |

## 导出最多的文件 #hot

- `pm/pm-client/src/api.ts` · 54 个导出
- `pm/pm-client/src/settings/storage.ts` · 30 个导出
- `pm/pm-client/src/types.ts` · 28 个导出
- `pm/pm-client/src/dag/edge-renderer.ts` · 26 个导出
- `pm/pm-client/src/edge-renderer.ts` · 26 个导出
- `pm/pm-client/src/toolviews/shared.ts` · 26 个导出
- `src/http/routers/settings-support.ts` · 24 个导出
- `pm/pm-client/src/card-types.ts` · 23 个导出
- `pm/pm-client/src/dag/card-types.ts` · 23 个导出
- `pm/pm-client/src/views/report-tabs.ts` · 23 个导出
- `pm/pm-client/src/render/dom-utils.ts` · 22 个导出
- `pm/pm-client/src/dag/progress-bar.ts` · 20 个导出
- `pm/pm-client/src/progress-bar.ts` · 20 个导出
- `pm/pm-client/src/views/board.ts` · 20 个导出
- `pm/pm-client/src/settings/model.ts` · 18 个导出
- `src/wiring/settings-assembly.ts` · 18 个导出
- `pm/pm-client/src/settings/records.ts` · 17 个导出
- `pm/pm-client/src/board-mount.ts` · 16 个导出
- `pm/pm-client/src/session-running.ts` · 16 个导出
- `pm/pm-client/src/settings/types.ts` · 16 个导出
