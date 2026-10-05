# REQ-260930230225-71be 拆分计划 · 会话头部流程图挂载点迁移与四档自适应 serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 目标 + 做法（一段话）：把流程图从 `header.utilities` 挂到 `header.actions`（order 0，紧贴「标准模式」标签），
> 并把它的宽度交给四档 `@container` 契约（880 / 620 / 460）决定；配套抽出可离屏调用的图表模型
> （组件与探针共用）与六档视口探针，把「标题行被撑破」变成可复跑断言。纯前端展示层：接口、台账、数据零变更。

## P-1 · 改动盘点 serves: FR-1, FR-2, FR-3, FR-4

```
挂载点：  utilities(order 5)  ──迁移──►  actions(order 0)
                                    │
   模型层 flow-chart-model.ts ◄─────┼─────► 视图层 conversation-progress.ts（DOM 不变）
   （纯函数 + FLOW_TIERS 单一源）    │
                                    └─────► 样式层 styles/board.ts（收缩 + 四档 + 面板双模）
                                                    ▲
                              探针 probe.mts + 单测 test.ts（六档视口 × A1–A6）
```

| 类型 | 文件 | 改动 |
|------|------|------|
| 新增 | `src/client/flow-chart-model.ts` | `FLOW` 七节点、`FLOW_TIERS`、`FlowNodeModel` / `FlowChartModel` 类型、`buildFlowChartModel()` |
| 新增 | `scripts/header-progress-probe.mts` | 六档视口标本页 + headless Chrome 断言（A1–A6 + fallback 档） |
| 新增 | `tests/header-progress-responsive.test.ts` | TC-1..TC-6 静态契约与模型映射 |
| 修改 | `src/client/index.ts` | 槽位名 `utilities` → `actions`；`order: 5` → `0`；订正两处旧注释 |
| 修改 | `src/client/conversation-progress.ts` | 改为消费 `buildFlowChartModel()`；DOM/类名/点击行为不变；订正文件头旧注释 |
| 修改 | `src/client/styles/board.ts` | `min-width:0` / `max-width:64vw`；三段 `@container`；面板双模定位 |
| 删除 | — | 无（无死代码、无旧分支需要清理） |

**不做**：不碰 DSH 宿主（`ui-conversation` / `ui-agent-preset`）、不改进度接口与 `stages` 接口、
不动节点面板内容与 DAG 画布、不改看板页与列表视图、不引入 JS 宽度监听。

## P-2 · 任务 DAG serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

```
t1 契约卡（模型 + 常量）
 ├──► t3 视图接线卡（conversation-progress.ts）
 ├──► t4 样式卡（board.ts 四档 + 面板双模）
 └──┐
t2 注册卡（index.ts）─┴──► t5 回归门卡（探针 + 单测）──► t6 兼容与回滚验证卡
```

批次：**第一批** t1、t2（互不依赖，可并行）；**第二批** t3、t4（都依赖 t1）；**第三批** t5（依赖 t1–t4）；**第四批** t6。

## P-3 · 覆盖对照表（需求条款 ↔ 计划 key） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

门禁读取本表：每条 FR 都要有接收它的计划 key（落库后由任务卡接管）。六条 FR 全部有落点，无「本轮不做」条款。

| 需求条款 | 条款摘要 | 接收任务 |
|----------|----------|----------|
| FR-1 | 挂载点迁到模式标签之后 | t2, t3 |
| FR-2 | 标题行不再被撑破 | t4, t5 |
| FR-3 | 按标题行宽度分档降级（880 / 620 / 460） | t1, t4, t5 |
| FR-4 | 详情面板不越界 | t4, t5 |
| FR-5 | 宽屏视觉零回归 | t5, t6 |
| FR-6 | 可复跑的头部自适应探针 | t5, t6 |

### P-3.1 · 需求条款 ↔ 台账任务卡对照表（供 RTM 机器读，FR 单元格后紧跟任务 id） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

> 与 P-3 同源，但把**计划 key 换成了落库后的台账 id**：RTM 生成器读的就是这张表
> （`vendor/reqboard/src/rtm/parser.ts` 的 `parseDecompositionServes`：FR 单元格的下一个单元格必须是 `t-xxxxxx`）。
> 没有这张表，RTM 的 `fr_to_tasks` 会是空，验收单就会出现「FR 追溯断链」。

| 需求条款 | 接收任务 | 计划 key |
|----------|----------|----------|
| FR-1 | t-a463b1 | t2 注册卡 |
| FR-1 | t-c60f21 | t3 视图接线卡 |
| FR-2 | t-d281b6 | t4 样式卡 |
| FR-2 | t-7a9405 | t5 回归门卡 |
| FR-3 | t-a4d8f7 | t1 契约卡 |
| FR-3 | t-d281b6 | t4 样式卡 |
| FR-3 | t-7a9405 | t5 回归门卡 |
| FR-4 | t-d281b6 | t4 样式卡 |
| FR-4 | t-7a9405 | t5 回归门卡 |
| FR-5 | t-7a9405 | t5 回归门卡 |
| FR-5 | t-b817a1 | t6 兼容与回滚卡 |
| FR-6 | t-7a9405 | t5 回归门卡 |
| FR-6 | t-b817a1 | t6 兼容与回滚卡 |

## P-4 · 任务表（逐卡实施方案 + 可证伪验收） serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6

| key | 标题 | phase / side | depends_on |
|-----|------|--------------|------------|
| t1 | 抽出流程图模型与档位常量（契约卡） | implement / frontend | — |
| t2 | 会话头部挂载点迁到模式标签后（注册卡） | implement / frontend | — |
| t3 | 组件改为消费图表模型（视图接线卡） | implement / frontend | t1 |
| t4 | 流程图收缩与四档降级样式（样式卡） | ui / frontend | t1 |
| t5 | 六档视口探针与静态契约单测（回归门卡） | test / frontend | t1, t2, t3, t4 |
| t6 | 兼容与回滚验证（无容器祖先降级） | test / frontend | t5 |

### t1 · 抽出流程图模型与档位常量 serves: FR-1, FR-3

- 实施方案：新增 `src/client/flow-chart-model.ts`，导出 `FLOW`（七节点与序）、`FLOW_TIERS`
  （`token: 880, link: 620, label: 460`）、类型 `FlowNodeModel` / `FlowChartModel`、
  纯函数 `buildFlowChartModel(input)`（状态 → 四态、分类 → skipped、`nodes[]` → token、`progress` → countText）；
  同卡建立 `tests/header-progress-responsive.test.ts` 并写 TC-5 模型映射用例。本卡不改既有文件。
- 验收（可证伪）：`./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts -t TC-5`
  → `1 passed`（7 种 status 的 state 序列、skip、token、countText、`currentKey=null` 全绿）；
  `./node_modules/.bin/tsc --noEmit -p tsconfig.json` 退出码 0。

### t2 · 会话头部挂载点迁到模式标签后 serves: FR-1

- 实施方案：改 `src/client/index.ts` —— 槽位名改为 `conversation.session.header.actions`、`order: 0`，
  `id` / `inject` / 组件不动；订正该处与文件头两处旧注释（旧注释称「模式选择器在 utilities、order 10」，与事实不符）。
- 验收（可证伪）：`grep -q "conversation.session.header.actions" src/client/index.ts
  && ! grep -q "header.utilities" src/client/index.ts && echo OK` → 输出 `OK`；`pnpm build:client` 退出码 0。

### t3 · 组件改为消费图表模型 serves: FR-1, FR-3

- 实施方案：改 `src/client/conversation-progress.ts` —— 内联的状态推导改为调 `buildFlowChartModel()`，
  渲染标记与契约保持设计 I-2：类名 `.dsh-pm-flow-node` / `.dsh-pm-flow-dot` / `.dsh-pm-flow-meta` /
  `.dsh-pm-flow-label` / `.dsh-pm-flow-token` / `.dsh-pm-flow-link` / `.dsh-pm-cprog-inline-count`、
  属性 `data-state` / `data-selected`、节点点击打开面板的行为全部不变。
- 验收（可证伪）：`grep -q buildFlowChartModel src/client/conversation-progress.ts
  && grep -q dsh-pm-flow-node src/client/conversation-progress.ts
  && grep -q data-selected src/client/conversation-progress.ts && echo OK` → `OK`；`pnpm build:client` 退出码 0。

### t4 · 流程图收缩与四档降级样式 serves: FR-2, FR-3, FR-4

- 实施方案：改 `src/client/styles/board.ts` —— `.dsh-pm-cprog { min-width: 0; max-width: 100% }`、
  `.dsh-pm-cprog-inline { min-width: 0; max-width: 64vw }`、`.dsh-pm-flow` 保留 `overflow-x: auto`；
  用 `FLOW_TIERS` 插值写三段 `@container`（880 → 隐 token；620 → 隐连线与非当前节点名、节点 `min-width: 28px`；
  460 → 隐全部节点名、节点 `min-width: 24px`）；详情面板宽档 `absolute right: 0` +
  `width: min(420px, calc(100vw - 32px))`，窄档（≤620）`fixed top: 78px; right: 12px`。
  token 行的隐藏规则写在 board.ts，token.ts 不改。
- 验收（可证伪）：`grep -q "@container" src/client/styles/board.ts && grep -q FLOW_TIERS src/client/styles/board.ts
  && grep -q "position: fixed" src/client/styles/board.ts && pnpm build:client && echo OK` → `OK`。

### t5 · 六档视口探针与静态契约单测 serves: FR-2, FR-3, FR-4, FR-5, FR-6

- 实施方案：新增 `scripts/header-progress-probe.mts`（标本页复刻 `container-type: inline-size` 标题行几何，
  DOM 由 `buildFlowChartModel()` 按 I-2 类名生成；六档视口 1280/1024/900/768/640/480 量 A1–A6，
  每档输出 `DIAG` 行，末行 `PROBE PASS/FAIL`，找不到 Chrome 退出码 2）；
  在 `tests/header-progress-responsive.test.ts` 补齐 TC-1（挂载契约）、TC-2（`FLOW_TIERS` ↔ CSS 阈值逐一相等）、
  TC-3（收缩与兜底规则）、TC-4（面板双模）、TC-6（无需求 `return null` 分支仍在）。
- 验收（可证伪）：`./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts` → `6 passed`；
  `./node_modules/.bin/tsx scripts/header-progress-probe.mts` → 6 行 `DIAG`（每行 `problems=NONE`）
  + 末行 `PROBE PASS`，退出码 0。

### t6 · 兼容与回滚验证 serves: FR-5, FR-6

- 实施方案：探针加 `--fallback` 模式（标本页去掉 `container-type` 祖先），验证 D-4 的降级路径
  「不支持容器查询 → 全量渲染 + 内部滚动，行仍不溢出」；把回滚步骤写成可复跑说明
  （还原 `index.ts` 的槽位名与 order 即回到 utilities）；在本 GUI 刷新（`pnpm build:client` 后重载）后
  录 `evidence/` 下宽档、窄档各一张实机截图。
- 验收（可证伪）：`./node_modules/.bin/tsx scripts/header-progress-probe.mts --fallback`
  → `DIAG fallback … problems=NONE` + `PROBE PASS`，退出码 0；实机截图两张落在 `evidence/`。

## P-5 · 与设计的差异说明 serves: FR-3

- 设计 I-3 把 `styles/token.ts` 列为样式落点之一；本计划把 token 行的隐藏规则统一放在 `styles/board.ts`，
  **token.ts 不改**（该文件里已有 `white-space: nowrap` 等既有规则，无需追加）。档位阈值仍是单一源 `FLOW_TIERS`。
- 其余条款（挂载点、四档阈值 880/620/460、面板双模、DOM 契约不变）与设计逐条一致，无其他偏差。

## P-6 · 落地顺序与风险 serves: FR-5, FR-6

| 批次 | 卡 | 风险与对策 |
|------|----|-----------|
| 1 | t1、t2 | 独立可并行；t2 只改一行注册，回滚即还原 |
| 2 | t3、t4 | 都依赖 t1 的常量与类型；t3 要求 DOM 零变化（单测 TC-1/TC-5 守） |
| 3 | t5 | 探针找不到 Chrome 时退出码 2（响亮失败，不静默通过） |
| 4 | t6 | 兼容档与实机截图是验收证据来源 |

## 下一步

implementing —— 用 `reqboard_ask_confirm(target=plan)` 交棒请人批准；未获批准不得 `reqboard_decompose` 落库。
