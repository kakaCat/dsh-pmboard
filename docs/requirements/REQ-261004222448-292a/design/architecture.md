# 架构设计（REQ-261004222448-292a）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13, FR-14, FR-15 -->

> 本文档只写设计，不写拆分计划（拆分归 decomposing）。
> 需求文档：`docs/requirements/REQ-261004222448-292a/requirement.md`（15 条 FR）
> 原型（形态参照，非实现依据）：`prototype/detail-report.html`；现有实现底稿：`notes/current-implementation-takeaways.md`

## 目标与总体方案 `serves: FR-11, FR-1`

**问题**：详情页现在是"证据面"——6 个 Tab 按数据来源堆着、一页全量取数、整页 `innerHTML` 重绘。用户要在里面读到的六件事（为何做 / 解决什么 / 怎么做 / 做到哪 / 哪里缺 / 花了多少）散落各处，且打不开一屏。

**当前状况**：`/state` 只发摘要（B12 ⑥-①）；进详情 `GET /requirements/:id` 取全文，随后 `loadStageDetail` / `loadTokenTab` / `loadMarksBlock` 并发预取；SSE 一变就 `viewEl.innerHTML = buildReqDetail(...)` 整页替换；附件与主体混排在同一棵 DOM 里。

**设计方案**：把详情页改成**"常驻头部 + 六个同级 Tab"**，并把取数改成**三层**：

```
L0 首屏（1 个请求）  结论头 + 操作条 + 状态带（做到哪了 / 缺口 / 结果与成效）
        │
        ▼  用户点某个 Tab 才发请求
L1 Tab 视图（每 Tab 1 个端点，独立缓存 / 独立刷新 / 可分页）
   汇报 · 文档 · DAG · 对话 · Token · 提示词
        │
        ▼  点开某份正文才取
L2 明细（文档正文 / 提示词正文 / 验收证据）
```

**不这么做的后果**：① 一页全量取数在 agent 跑动期（台账高频变更）持续放大读放大与重绘；② 附件与主体同页会把"缺口/结论"挤到读不到的位置；③ 没有 Tab 边界，"哪块该重绘"无法界定，状态保持只能靠 capture/restore 打补丁。

## 模块改动地图 `serves: FR-1, FR-3, FR-6, FR-7, FR-8, FR-9, FR-10`

```
                     浏览器（client）
  ┌──────────────────────────────────────────────────────────────┐
  │ board-mount.ts  ── 视图状态机（board / req-detail）           │
  │      │                                                       │
  │      ├── views/report-head.ts        （新）结论头 + 操作条     │
  │      ├── views/report-band.ts        （新）状态带三格          │
  │      ├── views/report-tabs.ts        （新）Tab 容器 + 懒加载   │
  │      ├── views/trunk.ts              （新）汇报七条（抽取值）   │
  │      ├── views/docs-panel.ts         （新）文档 + 核验 + 门禁   │
  │      ├── views/dag-panel.ts          （新）复用 dag-view + 每步 │
  │      ├── views/dialogue-panel.ts     （新）一条流              │
  │      ├── token-info.ts               （改）加"每次调用均/缓存"  │
  │      └── node-panel-process.ts       （改）搬到提示词 Tab      │
  └───────────────┬──────────────────────────────────────────────┘
                  │  fetch（每 Tab 一条，切到才发）
  ┌───────────────▼──────────────────────────────────────────────┐
  │ http/routes.ts ── 新增 6 条只读路由（见 interfaces.md）        │
  │      │                                                        │
  │      ├── application/query/QueryReport.ts      （新·首屏）     │
  │      ├── application/query/QueryTrunk.ts       （新·抽取）     │
  │      ├── application/query/QueryDocs.ts        （新·聚合）     │
  │      ├── application/query/QueryDag.ts         （新·聚合）     │
  │      ├── application/query/QueryDialogue.ts    （新·会话抽文本）│
  │      ├── application/query/QueryPrompts.ts     （新·装配+留痕） │
  │      └── application/query/QueryStageDetail.ts （复核：可并入） │
  └───────────────┬──────────────────────────────────────────────┘
                  │  RequirementStore 端口（**双后端**）
  ┌───────────────▼──────────────────────────────────────────────┐
  │ repositories/  ShardedRequirementStore（json）│ SqliteRequirementStore │
  │                （同一端口、共享用例；新增读取必须两条腿都实现）  │
  └──────────────────────────────────────────────────────────────┘
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/client/board-mount.ts` | 改 | 详情视图改为「头部 + Tab 容器」；重绘改**分段替换**（只换变化段） | FR-11 | 详情页全部 |
| `src/client/views/report-*.ts` | 新 | 结论头 / 状态带 / Tab 容器 | FR-3, FR-4, FR-5 | 详情页 |
| `src/client/views/trunk.ts` | 新 | 汇报七条渲染（含 `来源` 标与「文档未提供该节」） | FR-1, FR-2, FR-14, FR-15 | 汇报 Tab |
| `src/client/views/docs-panel.ts` | 新 | 文档 15 份铺开 + 核验表 + 门禁留痕 | FR-7 | 文档 Tab |
| `src/client/views/dag-panel.ts` | 新 | 复用 `dag-mount` + 每步执行结果表 | FR-8 | DAG Tab |
| `src/client/views/dialogue-panel.ts` | 新 | 一条流（人机文本 + 系统消息）+ 回复框 | FR-6 | 对话 Tab |
| `src/client/token-info.ts` | 改 | 按阶段口径 + 每次调用均 / 缓存命中 / 优化点；从 Token Tab 移除系统提示词块 | FR-9, FR-10 | Token / 提示词 Tab |
| `src/client/node-panel-process.ts` | 改 | 三段（注入 / 规定vs实际 / 上下文）迁入提示词 Tab；`renderProcessFold` 从死代码变为被调用 | FR-9 | 提示词 Tab |
| `src/http/routes.ts` + `routers/*` | 改 | 新增 6 条只读路由 | FR-11 | host |
| `src/application/query/*` | 新 | 6 个查询用例（服务端聚合） | FR-1~FR-12 | host |
| `src/application/internal/injection-log.ts` | 改 | 留痕新增 `origin` / `delivered` / `text` | FR-9 | 读端 + 写端 |
| `src/adapters/AgentDeliverer.ts` | 改 | `createRoundMessage` 投递处补一条留痕 | FR-9 | host |
| `src/repositories/sqliteSchema.ts` + 分片格式 | 改 | 新字段落两处（双后端一致） | FR-9, FR-12 | host |
| `templates/design/*` + `templates/brainstorming/*` | 改 | 新增「关键决策与取舍」「技术方案与亮点」两节 | FR-13 | 文档模板 |

## 三个不变量（改代码时必须保住） `serves: FR-11, FR-12`

1. **首屏只有一个请求，且不含正文**——摘要接口 + 详情按需；任何"顺手多取一点"都算违规。
2. **未激活的 Tab 面板不在 DOM 里**（切到才渲染、才请求）——禁止"渲染全部再 CSS 隐藏"（那是本需求要修的旧病）。
3. **任何地方都不出现内层滚动条**——列表与正文一律铺开；长出由页面滚动或外层 `<details>` 承担。

## 服务端聚合（前端不做全量遍历） `serves: FR-4, FR-10`

| 聚合 | 输入（全部现有） | 输出 |
|---|---|---|
| 缺口清单 | 条款接收状态 + 产物登记 + 追溯断链 + 挂起确认 | `{items:[{severity,what,why,ref}], count}` |
| Token 按阶段 | `tokenUsage` + 任务执行快照 + `stage_telemetry` | 每阶段 调用/输入/输出/合计/占比/**每次调用均**/**缓存命中** |
| 优化点 | 上表 + `zeroOutputRuns` | 若干条「结论 + 依据数字 + 建议」 |
| 每步执行结果 | `TaskRecord.executions[]` + `lastReport` | 每张卡的 触发/起止/outcome/错误/证据/产出 |
| 门禁裁决 | `artifacts[].confirmedVia/confirmedEvidence` + `plan.*` + `verification.review*` | 五道门的 结论/方式/时间/理由 |

## 与现有模块的关系（能复用就复用） `serves: FR-7, FR-8, FR-9`

| 复用对象 | 用途 | 不改的部分 |
|---|---|---|
| `dag-view` / `dag-mount` | DAG Tab 的图 | 画布、悬停、钉住、关键路径、只看主线、视图状态记忆**一律保留** |
| `verification.ts`（`collectReqDocs` / `renderVerifySection` / `renderArchiveSection`） | 文档清单、核验表、归档对账 | 列与判定照抄 |
| `token-info.ts` 的按节点表 | Token 按阶段 | 列的语义不变（节点＝阶段），只加两列与优化点 |
| `node-panel-process.ts` 三段 | 提示词 Tab | "规定 vs 实际"的表达照搬 |
| `open-doc` / `jump-session` / `cardDoc` | 点开文档 / 跳会话 / 开卡文档 | 五态结果与已归档恢复逻辑不变 |
| `req-detail-store` / `dag/view-state` / `board-scroll` | 取数与视图状态 | 复用；局部更新后滚动记忆不再需要打补丁 |

## 范围外（本设计不做） `serves: FR-11`

- 不做测评证据展示（轨迹表 / 六维结论 / 终态对账）——归「测评证据对外接口」另立需求；
- 不重写 DAG 画布与追溯矩阵算法（只搬家 + 挂执行结果）；
- 不改台账 `queue.json` 结构与五道人工门语义；
- 不做移动端适配（只做窄 / 宽两档）。
