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

## 关键决策与取舍 `serves: FR-2, FR-13`

> 本节于实施期回填（2026-10-05）：设计定稿时模板还没有这一节，模板补节后按**实际落地情况**补写，
> 供详情页「汇报」Tab 抽取（FR-2）。每条都能在代码或用例里核到。

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 六条端点全是**只读聚合**，聚合在服务端算 | 否掉「前端拉全量、自己遍历算」 | 前端一旦遍历，「占比合计 == 总计」「缺口条数」这类口径就有了第二份实现；口径只能有一处 |
| 先定契约（六端点响应形状）再填实现 | 否掉「先实现、后统一形状」 | 同一个「缺口」在头部、文档页、对话页会长成三样，前端只能猜 |
| 「读不到」与「真的没有」用不同响应形状表达 | 否掉「一律返回空数组，让页面自己猜」 | 把 ENOENT 与「确实为空」渲染成同一句话，正是本次要修的诚实性缺陷 |
| 亮点必须给得出证据指针，指不出就单独标注「未提供证据」 | 否掉「让读者自己判断亮点真伪」 | 反应付靠的是**可核验**：形容词式自夸在页面上没有位置 |
| 文档缺节时如实显示「文档未提供该节」 | 否掉「回退用需求描述顶替」 | 一旦回退，缺节永远不可见，也没人会去补 |
| 注入留痕新增「是否真投递进会话」一列 | 否掉「有留痕 = 收到了」这一隐含假设 | 记录点里有一个只留痕、不投递；不区分就会把「没送出去」读成「已告知」 |
| 重做详情页，但不重写 DAG 画布与追溯矩阵 | 否掉「顺手把图形算法也重构」 | 本次要解决的是信息组织；画布不在问题范围内，重写只增加不可测面 |

### 实施期发现的两处追加（已声明，非静默改动）

- **注入留痕的第四处记录点**：设计只列了三处写入点，实施发现「每轮系统提示词装配」同样在写留痕；
  为不撒谎，来源枚举**加法式**扩一个值（`system-prompt`）。
- **「几件事等人」的口径**：契约注释写的是「红色缺口条数」，需求判定写的是「缺口条数」；
  按**需求条款**统一为缺口条数（产品口径优先，两个口径都钉在用例里防漂移）。

## 技术方案与亮点 `serves: FR-13, FR-14, FR-15`

> 工程读者视角的「怎么干的」。每条差异都指得出可核验处（文件 / 用例）。

| 项 | 内容 |
|---|---|
| 技术栈 | TypeScript（ESM，相对 import 带 `.js`）+ tsdown 打包；测试用 vitest，**无 jsdom**——client 渲染一律是「纯函数 → HTML 字符串」，渲染断言就是字符串断言；本次**不引入任何新依赖** |
| 模块划分 | `application/query/Query{Report,Trunk,Docs,Dag,Dialogue,Prompts,Token}.ts` 七个只读查询；`http/routers/panels.ts` 六条端点（形状校验与降级**一处实现**）；`client/views/report-{head,band,tabs}.ts` 详情壳；`client/views/panels/*.ts` 六个面板各自一个文件 |
| 设计模式 | 端口—适配器（六查询共用四个只读端口）；判别联合（`PanelResult<T> = T \| Degrade`）；纯函数渲染；ring buffer 留痕（容量有界 + 原子写） |
| 关键实现手法 | ① 降级信封统一四种原因，页面按因给不同文案；② Tab 懒加载 + 内存缓存键 `reqId::tab::revision`（同一版本内切回不重复请求）；③ Token 扩展**就地加列**（老列仍在，不判死刑）；④ 留痕正文超限截断并显式标注；⑤ 抽取端剥掉 `serves` 标注后按前缀匹配节名（与设计门禁共存） |
| 攻克的难点 | 设计门禁要求每个二级标题带 `serves` 标注，而页面按**字面节名**抽取——两者一度互相打架；靠「剥标注 + 前缀匹配 + 一级标题只认全等」化解（见 `src/application/query/QueryTrunk.ts`） |

**与常规做法的差异**（每条都指得出证据）

| 差异点 | 为什么 | 证据指针 |
|---|---|---|
| 「读不到」在**接口层**就有独立形状（`available:false` + 四种原因），不靠前端兜 | 让「诚实」成为类型约束，而不是文案纪律 | `src/shared/protocol.ts` 的 `Degrade`；`tests/report-routes.test.ts` |
| 无证据的「亮点」进**另一个容器**、另一套样式 | 让人一眼看出哪些是自夸、哪些可核验 | `src/client/views/panels/trunk.ts`（`data-hl-group="no-evidence"` / `data-evid="no"`）；`tests/trunk-panel.test.ts` |
| 抽取失败不回退、不生成叙述，摘要必须是**原文子串** | 杜绝「编一段听起来合理的话」 | `src/application/query/QueryTrunk.ts`；`tests/query-trunk.test.ts` |
| 留痕记「是否真投递」，旧条目显示「投递不可知」 | 修「有留痕 = 收到了」的错觉 | `src/application/internal/injection-log.ts`；`tests/injection-log.test.ts` |
| 六个面板各自一个文件、靠注册契约拼接，互不触碰 | 六张卡得以**并行实施**而不互相冲突（本次就是这么干的） | `src/client/views/report-tabs.ts` 的 `ReportTabDef` |
