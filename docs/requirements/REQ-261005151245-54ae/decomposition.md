---
req_id: REQ-261005151245-54ae
requirement_refs: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
---

# 拆分计划（REQ-261005151245-54ae）

> 目标：把「开窗只造出一个空白会话」补成「新窗口像源窗口」——有标题、有模式、有模型，且失败如实回报。
> 做法：三块落地——① 契约与继承模块（端口加 3 个可选方法 + 纯函数/编排）
> ② 适配器三方法（读画像 / 写标题 / 写模型；`create` 透传 `agentPreset`）
> ③ 三入口接线（`open_window` / `handoff` 新建窗口 / 看板迁移开窗）与外壳（工具 schema、路由回执）。
> 容量：缺省 16 DU；`detailUnits = files×1 + anchors×0.5 + chars/2000`（单一源 `src/domain/limits.ts`）。**6 张卡均在容量内**。

## 改动盘点（对照设计文档逐份核对） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 类型 | 路径 | 设计出处 |
|---|---|---|
| 修改 | `src/application/ports.ts`（5 个类型 + `WindowCreateOptions.agentPreset` + 端口 3 个可选方法） | interfaces §端口 |
| 新增 | `src/application/internal/window-inherit.ts`（4 个导出：标题递增 / 读画像 / 模式三态 / 落定编排） | architecture §分层与职责边界、interfaces §内部模块 |
| 修改 | `src/adapters/SessionWindowOpener.ts`（新增 `readProfile` / `rename` / `selectModel`；`createRequestOf` 透传 `agentPreset`） | backend §适配器实现口径 |
| 修改 | `src/application/use-cases/OpenWindow.ts`（入参 `title`；流程改为读画像 → 建窗 → 继承 → 投递；值加 `inheritance`） | backend §用例接线顺序 |
| 修改 | `src/application/use-cases/HandoffOwner.ts`（`openTargetWindow` 返回 `{ windowKey, inheritance? }`） | interfaces §工具 `reqboard_handoff` |
| 修改 | `src/tools/OpenWindowTool/OpenWindowTool.ts`、`src/tools/OpenWindowTool/prompt.ts`（加 `title` 入参 + `inheritance` 回执 + 摘要三态 + 提示词） | interfaces §工具 `reqboard_open_window` |
| 修改 | `src/tools/HandoffTool/HandoffTool.ts`（output schema 加 `inheritance`） | interfaces §工具 `reqboard_handoff` |
| 修改 | `src/http/routers/settings-support.ts`（迁移开窗：读画像 + create 带 preset + 显式标题「台账迁移窗口」+ 回执加 `inheritance`） | interfaces §HTTP 迁移开窗 |
| 新增 | `tests/open-window-inherit.test.ts`（主用例集：纯函数 / 编排 / 适配器 / 三入口 / 兼容） | test-cases §测试层级与载体 |
| 修改 | `tests/handoff-owner.test.ts`（新增「新建窗口带回执 / 指定已有窗口不带」两条断言） | test-cases §测试层级与载体 |
| 新增 | `scripts/open-window-inherit-probe.mts`（六读数 + 三对相等 + 三段耗时；退出码 0/1） | test-cases §探针 |
| 新增 | `docs/requirements/REQ-261005151245-54ae/evidence/checks.md`、`docs/requirements/REQ-261005151245-54ae/evidence/live-check.md` | test-cases §取证与验收口径 |
| 修改 | `docs/knowledge/code-map.md`、`docs/knowledge/code-map.symbols.tsv`（**生成物**：新增模块后 `kb-build --write` 重生成） | backend §静态门禁与旁路防护 |
| 删除 | 无 | — |
| 不动 | `src/index.ts`（无需新服务注入）、`src/client/**`（`sides=[backend]`）、宿主 DSH 仓库 | architecture §接线表 |

## 任务表 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| key | 标题 | 层 | FR | 依赖 | DU |
|---|---|---|---|---|---|
| t1 | 契约与继承模块（端口三方法 + 标题递增 + 落定编排） | 契约/领域 | FR-1, FR-2, FR-3, FR-4, FR-5 | — | 7.10 |
| t2 | 适配器实现（读画像 / 写标题 / 写模型 / create 透传模式） | 适配 | FR-2, FR-3, FR-4 | t1 | 5.30 |
| t3 | 用例接线（`openWindow` 与 `handoffOwner` 新建窗口） | 用例 | FR-1, FR-5, FR-6 | t2 | 8.30 |
| t4 | 外壳接线（工具 schema / 一行摘要 / 迁移开窗路由） | 外壳 | FR-1, FR-5, FR-6 | t3 | 8.70 |
| t5 | 探针与机器自检（回归 + 构建 + 知识层生成物 + 尺寸门禁） | 验收 | FR-7 | t4 | 7.40 |
| t6 | 兼容卡与实机复核（旧调用方 / 旧替身 / 界面三处取证） | 兼容 | FR-5, FR-6, FR-7 | t5 | 4.80 |

## 依赖图

```
t1 契约+继承模块 ─▶ t2 适配器 ─▶ t3 用例接线 ─▶ t4 外壳接线 ─▶ t5 探针+机器自检 ─▶ t6 兼容+实机复核
```

## 容量核算（逐卡）

| key | files | anchors | chars | detailUnits | 上限 | 判定 |
|---|---|---|---|---|---|---|
| t1 | 3 | 6 | 2200 | 3 + 3.00 + 1.10 = **7.10** | 16 | 内 |
| t2 | 2 | 5 | 1600 | 2 + 2.50 + 0.80 = **5.30** | 16 | 内 |
| t3 | 4 | 6 | 2600 | 4 + 3.00 + 1.30 = **8.30** | 16 | 内 |
| t4 | 5 | 5 | 2400 | 5 + 2.50 + 1.20 = **8.70** | 16 | 内 |
| t5 | 4 | 5 | 1800 | 4 + 2.50 + 0.90 = **7.40** | 16 | 内 |
| t6 | 2 | 4 | 1600 | 2 + 2.00 + 0.80 = **4.80** | 16 | 内 |

无超容量卡 ⇒ 不需要 `⚠️超容量(建议N批)` 标记。

## 覆盖对照表（需求条款 ↔ 接收任务） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7`

| 需求条款 | 接收任务 |
|---|---|
| FR-1 | t1, t3, t4 |
| FR-2 | t1, t2 |
| FR-3 | t1, t2 |
| FR-4 | t1, t2 |
| FR-5 | t1, t3, t4, t6 |
| FR-6 | t3, t4, t6 |
| FR-7 | t5, t6 |

## 迁移与兼容（t6 承接） `serves: FR-5, FR-6`

| 面 | 口径 |
|---|---|
| 存量数据 | **无迁移**：不新增台账字段、不改 SQLite schema、无回填（data-model §无持久化 / 无迁移） |
| 旧调用方（不传 `title`） | 入参形状不变；回执**只增** `inheritance` 键，旧消费方忽略即可 |
| 旧测试替身（只有 `fork`/`create`） | 端口新方法**可选**：未实现 → 三项 `failed` + 「未装配…能力」原因，开窗照旧成功 |
| 措辞纪律 | `degraded_note` 与「建会话 ≠ 打开窗口」逐字不变；回执不出现「已打开」 |
| 回滚 | 回退插件构建即回到改造前（本需求零本地写入；已写定的标题/模型是宿主侧会话属性，不被回滚擦掉） |

## 验收口径（总） `serves: FR-7`

```bash
# 主用例集（T-01~T-15 + 纯函数 / 适配器 / 兼容分组）
npx vitest run tests/open-window-inherit.test.ts

# 既有契约回归（开窗四条 + 交接 + 项目根）
npx vitest run tests/open-window-tool.test.ts tests/handoff-owner.test.ts tests/open-window-project-root.test.ts

# 探针（六读数 + 三对相等；退出码 0）
npx tsx scripts/open-window-inherit-probe.mts

# 构建 / 类型 / 全量 / 知识层 / 尺寸
pnpm build && pnpm kb:check && npx vitest run tests/size-budget.test.ts
```

通过标准：主用例集全绿；回归零新增失败；探针退出码 0；`pnpm build` 退出码 0；
`pnpm typecheck` 改动文件零新增错误（HEAD 基线 223）；`pnpm test` 失败数 ≤ 106；
`pnpm kb:check` 退出码 0；实机三处（侧栏标题 / 模式芯片 / 模型选择器）观察记录落
`docs/requirements/REQ-261005151245-54ae/evidence/live-check.md`。
