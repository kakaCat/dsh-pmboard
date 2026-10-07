# 代码地图（模块级）

> 生成物：由 `scripts/kb-build.mts` 从 `src/**/*.ts` 确定性抽取，**请勿手改**（改源码后重跑）。
> 全量符号（3198 条）在 `docs/knowledge/code-map.symbols.tsv`——机器索引、不进上下文，用 `reqboard_kb(kind='map', query='<符号>')` 检索。

## 模块总览 #modules

| 模块 | 文件 | 字符 | 导出符号 | 角色 |
|---|---|---|---|---|
| `src/application` | 189 | 1588109 | 1170 | dsh-pmboard/application/gate — 门禁系统统一导出（REQ-260925212722-96e7） |
| `src/client` | 116 | 1303864 | 820 | Dsh-pmboard client half — M3: 泳道看板 GUI（需求状态列 + 详情 + 待归类 + 会话跳转）。 |
| `src/domain` | 83 | 493872 | 626 | dsh-pmboard/domain/prompt — 提示词加载路由唯一入口（REQ-422af1 t3，INV-1）。 |
| `src/http` | 17 | 186285 | 71 | dsh-pmboard/http/client-build — 客户端构建戳（REQ-261001124111-5d36 t4）——把「页面跑的是哪一版前端代码」变成可比较的事实。 |
| `src/tools` | 74 | 169564 | 69 | （无模块说明） |
| `src/adapters` | 32 | 164204 | 87 | dsh-pmboard/adapters/AgentDeliverer — 会话投递适配器（REQ-e3b6a0 t4 / FR-5）——**Dive专用投递实现**。 |
| `src/repositories` | 20 | 163636 | 89 | dsh-pmboard/repositories/atomicWrite — 原子写（REQ-261002161439-277d · t3 / FR-2）——**全仓唯一的 temp + fsync + rename 实现**。 |
| `src/shared` | 4 | 120007 | 205 | dsh-pmboard/shared/artifact-labels — 产物种类 / 节点文档文件名 → 中文名：唯一事实源（REQ-260922182638-0777 FR-1）。 |
| `src` | 3 | 76602 | 30 | 本插件**自发事件**的 cordis 事件表声明（纯类型，零运行时）。 |
| `src/wiring` | 3 | 30561 | 27 | dsh-pmboard/wiring/not-ready — 未就绪态的接线点（REQ-261003191948-e94a · t4 / FR-1、FR-5、FR-6）。 |
| `src/stage-overview` | 1 | 5330 | 4 | dsh-pmboard/stage-overview/assembler — 追溯数据装配（REQ-260926140539-457b FR-6）。 |
| `src/__integration_test__` | 1 | 3606 | 0 | （无模块说明） |

## 导出最多的文件 #hot

- `src/shared/protocol.ts` · 193 个导出
- `src/application/ports.ts` · 84 个导出
- `src/client/api.ts` · 52 个导出
- `src/domain/workflow/AcceptanceSheetSpec.ts` · 46 个导出
- `src/domain/status/Predicates.ts` · 43 个导出
- `src/application/internal/support.ts` · 36 个导出
- `src/application/internal/content-gate-wiring.ts` · 32 个导出
- `src/application/dive/round-state.ts` · 31 个导出
- `src/client/settings/storage.ts` · 30 个导出
- `src/domain/task/SubtaskTemplate.ts` · 30 个导出
- `src/client/types.ts` · 27 个导出
- `src/client/dag/edge-renderer.ts` · 26 个导出
- `src/client/toolviews/shared.ts` · 26 个导出
- `src/application/internal/content-trace.ts` · 24 个导出
- `src/application/settings/events.ts` · 24 个导出
- `src/domain/requirement/ReqboardPaths.ts` · 24 个导出
- `src/http/routers/settings-support.ts` · 24 个导出
- `src/application/query/QueryTrunk.ts` · 23 个导出
- `src/client/dag/card-types.ts` · 23 个导出
- `src/application/internal/content-gates.ts` · 22 个导出
