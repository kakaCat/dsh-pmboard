# 拆分计划（REQ-261004222448-292a）

> 目标：把「需求详情页」从证据面改成**工作汇报**——常驻头部 + 六个同级 Tab、每 Tab 一个只读端点切到才取、一律铺开无内层滚动、局部更新不重置；后端只做只读聚合 + 会话文本抽取 + 留痕补记。
> 依据：`design/` 六份（architecture / interfaces / data-model / backend / test-cases / use-cases），需求 15 条 FR。
> 容量：缺省 16 DU；`detailUnits = files×1 + anchors×0.5 + chars/2000`。本计划**全部卡 ≤ 16 DU**，无超容量卡。

## 一、改动盘点（对照设计逐份）

| 设计文档 | 新增 | 修改 | 删除 |
|---|---|---|---|
| architecture.md | `client/views/report-head.ts` · `report-band.ts` · `report-tabs.ts` · `trunk.ts` · `docs-panel.ts` · `dag-panel.ts` · `dialogue-panel.ts` · `application/query/Query{Report,Trunk,Docs,Dag,Dialogue,Prompts}.ts` | `client/board-mount.ts`（头部+Tab+分段更新）· `client/token-info.ts`（按阶段+优化点，移出提示词块）· `client/node-panel-process.ts`（迁入提示词 Tab，`renderProcessFold` 由死代码变被调用）· `http/routes.ts` + `routers/*`（6 端点） | 详情页旧 Tab 骨架（`buildTabs`/`buildTabContents` 的 6 Tab 语义）→ 由 Tab 容器取代 |
| interfaces.md | 6 条只读端点 + 分页/降级信封 | `GET /requirements/:id/token`（加两列 + 优化点 + availability） | — |
| data-model.md | 留痕 3 字段（`origin`/`delivered`/`text`+`truncated`） | `application/internal/injection-log.ts` · `adapters/AgentDeliverer.ts`（轮次补记） | — |
| backend.md | `buildGaps` / `buildStageTokenTable` / `buildOptimizations` / `extractTrunk` / `buildDialogue` | 三处留痕写入点（h3-inject / session-driver / createRoundMessage） | — |
| test-cases.md | `scripts/req-report-probe.mts` + 3 组 vitest 断言 | 现有回归用例保持绿 | — |
| use-cases.md | — | 档二收敛到同一数据模型（`node-panel.ts` 不再自造取数） | 档一不改 |

## 二、任务表

| key | 标题 | phase | side | depends_on | footprint（files/anchors/chars → DU） |
|---|---|---|---|---|---|
| t1 | 定死接口与降级契约（六端点 + 信封类型） | implement | backend | — | 3 / 6 / 3000 → 7.5 |
| t2 | 注入留痕加 origin/delivered/text 并补三处写入 | implement | backend | t1 | 4 / 8 / 4500 → 10.25 |
| t3 | 服务端聚合查询：report / docs / dag / token 扩展 | implement | backend | t1 | 4 / 12 / 7000 → 13.5 |
| t4 | 会话文本抽取：dialogue 查询与过滤规则 | implement | backend | t1 | 2 / 8 / 4000 → 8 |
| t5 | 主干抽取：trunk 查询与既有节名匹配 | implement | backend | t1 | 2 / 7 / 4000 → 7.5 |
| t6 | 接线六条只读路由（分页 + 入参校验 + 降级） | implement | backend | t3, t4, t5, t2 | 3 / 12 / 6000 → 12 |
| t7 | 文档模板加「关键决策与取舍」「技术方案与亮点」 | doc | doc | — | 4 / 4 / 1500 → 6.75 |
| t8 | 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新 | implement | frontend | t6 | 5 / 12 / 8000 → 15 |
| t9 | 汇报 Tab（来源标 / 缺节 / 亮点反应付） | implement | frontend | t8, t5 | 2 / 9 / 5500 → 9.25 |
| t10 | 文档 Tab（文档铺开 + 核验 + 门禁留痕） | implement | frontend | t8, t3 | 2 / 8 / 6000 → 9 |
| t11 | DAG Tab（复用现有画布 + 每步执行结果） | implement | frontend | t8, t3 | 2 / 7 / 5000 → 8 |
| t12 | 对话 Tab（一条流 + 系统消息 + 回复框） | implement | frontend | t8, t4 | 2 / 7 / 4500 → 7.75 |
| t13 | Token Tab（按阶段 + 每次调用均 / 缓存命中 + 优化点） | implement | frontend | t8, t3 | 2 / 9 / 5500 → 9.25 |
| t14 | 提示词 Tab（三段 + 正文铺开 + 规定vs实际） | implement | frontend | t8, t2 | 3 / 9 / 6500 → 10.75 |
| t15 | 渲染断言·架构与降级（T-1~T-8、T-15~T-19） | test | frontend | t8 | 3 / 12 / 5000 → 11.5 |
| t16 | 渲染断言·内容与留痕（T-9~T-14、T-20~T-22） | test | frontend | t9, t10, t11, t12, t13, t14 | 4 / 11 / 5000 → 12 |
| t17 | 渲染探针 scripts/req-report-probe.mts（三档×两态） | test | frontend | t8, t9, t13 | 2 / 8 / 5000 → 8.5 |
| t18 | 迁移兼容核对 + 构建与知识层自检 | test | backend | t15, t16, t17 | 2 / 6 / 2500 → 6.25 |

**并行批次（DAG 层级）**：L0 = t1, t7 → L1 = t2, t3, t4, t5 → L2 = t6 → L3 = t8 → L4 = t9…t14（可并行）→ L5 = t15, t17 → L6 = t16 → L7 = t18。

## 三、逐卡 implementation / acceptance

### t1 定死接口与降级契约（backend）
**implementation**：在 `src/shared/protocol.ts` 落六端点的响应类型（`ReportResponse` / `TrunkResponse` / `DocsResponse` / `DagResponse` / `DialogueResponse` / `PromptsResponse` / `TokenResponseExt`）与统一降级信封 `Degrade`；在 `src/application/query/index.ts` 导出查询用例签名（仅签名，不实现）；`src/application/ports.ts` 确认所需只读端口（需求台账 / 队列 / 留痕 / 会话）。不改任何实现。
**acceptance**：`pnpm typecheck` 退出码 0；新增类型被后续卡引用且无 `any`；`grep -c "available: false" src/shared/protocol.ts` ≥ 1（降级信封形状存在）。

### t2 注入留痕加字段并补三处写入（backend）
**implementation**：`src/application/internal/injection-log.ts` 扩 `InjectionLogEntry`（`origin` 三值 / `delivered` / `text?` / `truncated?`），`injectionLogInputFromResolved` 带上 `origin` 与 `delivered`；三处写入点：`src/application/gate/handlers/h3-inject.ts`（`gate-h3`, delivered=true）、`src/application/dive/session-driver.ts`（`dive-node`, delivered=false）、`src/adapters/AgentDeliverer.ts` 的 `createRoundMessage`/`deliverMessage`（`dive-round`，按投递结果记 delivered 与失败原因）。`text` 超 8 000 字符截断并置 `truncated:true`。
**acceptance**：`pnpm test -- tests/injection-log` 全绿；新用例覆盖 ① `createRoundMessage` 投递后留痕 +1 且 `origin='dive-round'` ② 投递失败时 `delivered=false` 且带失败原因 ③ 超长正文被截断且 `truncated=true`；旧条目（无字段）读端返回 `origin='unknown'`、`delivered=null`。

### t3 服务端聚合查询（backend）
**implementation**：新增 `src/application/query/QueryReport.ts`（结论头 + 操作条 + 状态带；含 `buildGaps` 四类判定与 `verdictLine`）、`QueryDocs.ts`（文档铺开清单 + 核验 + 门禁裁决留痕 + 归档）、`QueryDag.ts`（图数据 + 每步执行结果，取 `TaskRecord.executions/lastReport`）、`QueryToken.ts`（在现有 `assembleRequirementToken` 上加 `perCallTokens`/`cacheHitPct`/`optimizations`/`availability`）。缺口、阶段聚合、优化点**全部服务端算**。
**acceptance**：单元测试断言 ① 缺口条数与 `clause_receive_status.unreceived` + 挂起确认数一致；② Token 各阶段占比合计 == 100%（浮点容差 0.5）；③ `optimizations` 每条含数字（正则 `\d`）；④ `totalTokens==0` 且无快照 → `availability='none'` 且不产出 0 值表。

### t4 会话文本抽取（backend）
**implementation**：新增 `src/application/query/QueryDialogue.ts`：用现有 `SessionProbeAdapter` 的两条读法（`snapshotEvents()` 优先，回落 `persistence.open→read()`）取事件；**保留** `user/message`（`source.kind==='user'`）与 `assistant/message` 的 text 块；**排除** `tool/call`、`tool/result`、reasoning 块、`run_code` 包裹内容与过程叙述；系统消息由 `statusHistory` / `interruption` / 交接 / `pending_confirms` / 验收裁决组装，措辞取原文，回填事件带 `inferred:true`；游标分页（默认 20）。
**acceptance**：单元测试断言 ① 产出里不含 `tool/call`/`tool/result`/`reasoning`/`run_code` 字样（反例断言）；② 时间序单调递增；③ `limit=20` 时返回 ≤20 且 `hasMore` 正确；④ 会话不可得 → `available:false`（不返回空数组冒充"没有对话"）。

### t5 主干抽取（backend）
**implementation**：新增 `src/application/query/QueryTrunk.ts` + 纯函数 `extractSection(text, heading)`：按写死的节名（需求文档 `## 产品定义` / `## 边界`；设计文档 `## 架构` / `## 关键决策与取舍` / `## 技术方案与亮点`）取节；七条各给 `source` 与 `summary`（**只截原文、不生成叙述**）；未命中 → `missing:'doc-section-missing'`；`highlight` 的 a 类自动事实（改动规模 / 测试数 / 覆盖度）由执行记录与产物算出，b 类人写条目 `evidence` 为空则原样返回空数组。
**acceptance**：单元测试断言 ① 缺节标本 → `missing` 且 `summary` 为空数组；② 有节标本 → 摘要文本是原文子串（`text.includes(summary)`）；③ **反例**：`req.description` 非空但文档缺节时，不得回退用 description 填充。

### t6 接线六条只读路由（backend）
**implementation**：`src/http/routes.ts` 增 6 条分支，新增 `src/http/routers/report.ts` 与 `panels.ts`（或并入既有 router）；`:id` 形状校验、`limit ≤ 50`、`windowKey` 必须属于该需求窗口集合；统一 `ok()/fail()` 与 `available:false` 降级；沿用现有路由的可选依赖注入方式。
**acceptance**：路由用例断言 ① 6 个端点各返回 200 与信封形状；② `limit=1000` → 400；③ 非法 `:id`（含 `../`）→ 400 且不触碰文件系统；④ 端口未装配时返回 `available:false, reason:'port-unavailable'`（不是 500、不是 `0 条`）。

### t7 文档模板加两节（doc）
**implementation**：`templates/design/architecture.md`（及适用的设计模板）加「关键决策与取舍」「技术方案与亮点」两节骨架；`templates/brainstorming/feature.md`（及按类型）加同名节或指向设计节的说明。**不改既有节名**。
**acceptance**：`grep -l "关键决策与取舍" templates/design/*.md templates/brainstorming/*.md | wc -l` ≥ 2；既有节名未被改名（`git diff --name-only` 仅涉及新增行）。

### t8 前端壳：头部三块 + Tab 容器 + 懒加载 + 局部更新（frontend）
**implementation**：`src/client/views/report-head.ts`（结论头：身份/阶段条/一句话结论 + **窗口跳转按钮** + 操作条按钮与后果说明 + 终态只读）、`report-band.ts`（做到哪了 / 缺口 / 结果与成效三格）、`report-tabs.ts`（六个同级 Tab + 角标数字 + **切到才请求** + 未激活面板不入 DOM + 内存缓存 `reqId::tab::revision`）；`board-mount.ts` 改为**分段局部更新**（SSE 只换头部 + 当前 Tab），保留现有 `captureDetailDraft` 草稿逻辑；档二收敛到同一数据模型（档一不改）。
**acceptance**：`pnpm test -- tests/report-shell` 断言 ① 首屏请求数 ≤ 2 且不含正文；② 未点过的 Tab 请求数 = 0；③ 未激活面板 `querySelector('[data-panel="token"]') === null`；④ 模拟 revision 变更后滚动位置/展开态/当前 Tab 不变；⑤ 终态下动作按钮数为 0；⑥ 档二渲染不含文档表/成本/提示词正文选择器。

### t9 汇报 Tab（frontend）
**implementation**：`src/client/views/trunk.ts` 渲染七条（2~4 行摘要 + `来源` 标：现有/节新增/全新 + 自动/人写/人工留痕）；`missing` → 「文档未提供该节」；`highlights[].evidence` 为空 → 「未提供证据（不计入亮点）」虚线样式；「点开原文」接现有 `open-doc`。
**acceptance**：渲染断言（T-9/T-10/T-11）全过；字符串级反例：无证据亮点**不得**出现在正常亮点样式中（`data-evid="no"` 命中）。

### t10 文档 Tab（frontend）
**implementation**：`src/client/views/docs-panel.ts`：文档 15 份**逐行铺开**（类型/路径/登记/状态；`file-missing` 划线标灰）+ 核验表（**实际结果 / 来源 agent\|human / 需人工 / 意见 / 裁决**，列照抄 `verification.ts`）+ 门禁裁决留痕（结论/方式/时间/理由）。
**acceptance**：渲染断言（T-5/T-13/T-16）全过：文档行数 == 台账文档数、核验三列在、`file-missing` 有划线样式。

### t11 DAG Tab（frontend）
**implementation**：`src/client/views/dag-panel.ts`：**挂现有** `dag-mount`（画布与交互一律不改）；下方「每步执行结果」表 8 列（卡/阶段/谁做/触发/起止/结果/产出·汇报/证据·错误），含 `❌ failed（错误原文，attempt N）` 与 `manual` 触发示例。
**acceptance**：渲染断言：表头 8 列齐；`failed` 行渲染 `error` 原文；`trigger=manual` 显示为 `manual`；现有 DAG 画布容器存在且 `dag/view-state` 用例仍绿。

### t12 对话 Tab（frontend）
**implementation**：`src/client/views/dialogue-panel.ts`：一条流（human/agent 气泡 + system 居中灰条），回填事件带「回填」标，底部回复框沿用现有评论提交；默认 20 条 + 「加载更早」分页。
**acceptance**：渲染断言（T-12）全过：产物不含 `tool/call`/`reasoning` 等字样；系统消息与人类消息同容器且时间序正确；回复框存在（`[data-role="comment-input"]`）。

### t13 Token Tab（frontend）
**implementation**：改 `src/client/token-info.ts`：主视图换成**按阶段** 8 列（含每次调用均 / 缓存命中）+ 可优化点列表（每条带依据数字）+ 三态（`full/partial/none`，`partial` 列 `missingStages`）；系统提示词块**移出**（迁到提示词 Tab）。
**acceptance**：渲染断言（T-14/T-17）全过：占比合计 == 总计、两新列在、优化点含数字、`none` 态页面**不出现 `0`**。

### t14 提示词 Tab（frontend）
**implementation**：迁 `node-panel-process.ts` 三段（注入规定vs实际 / 上下文）到提示词 Tab，与 A 段（固定系统提示词：每段 `<pre>` **正文** + 被裁片段正文 + 「本次完整系统提示词（4 段合并）」）、B 段（注入留痕：来源/后果/被裁/正文入口）合并；`renderProcessFold` 从死代码变为被调用。
**acceptance**：渲染断言（T-18/T-20/T-21）全过：每段 `<pre>` 非空；`origin='unknown'` → 「来源未知」；`delivered=null` → 「投递不可知」（**不得**默认成"已投递"）；`truncated` → 显示"已截断"。

### t15 渲染断言·架构与降级（test）
**implementation**：新增 `tests/report-shell.test.ts` 与 `tests/report-degrade.test.ts`，覆盖 T-1~T-8、T-15~T-19（请求计数、DOM 缺席、无内层滚动、降级三态、禁 0）。
**acceptance**：`pnpm test -- tests/report-shell.test.ts tests/report-degrade.test.ts` 全绿；断言数与 T-1~T-8/T-15~T-19 逐条对应（≥ 13 条）。

### t16 渲染断言·内容与留痕（test）
**implementation**：新增 `tests/report-content.test.ts`、`tests/report-prompt.test.ts`、`tests/report-template.test.ts`，覆盖 T-9~T-14、T-20~T-22（抽取缺节、核验三列、对话过滤、按阶段、亮点反应付、留痕字段、模板两节）。
**acceptance**：`pnpm test -- tests/report-content.test.ts tests/report-prompt.test.ts tests/report-template.test.ts` 全绿；含至少 3 条**反例断言**（无证据亮点不上桌、旧留痕不默认投递、缺节不回退 description）。

### t17 渲染探针（test）
**implementation**：新增 `scripts/req-report-probe.mts`（仿 `scripts/list-responsive-probe.mts`：真实 render + 真实 CSS + headless Chrome）：宽 1280 / 窄 900 × 在途 / 终态四组合，断言首屏四问可答、无横向溢出、无内层滚动容器、未激活面板缺席；环境不可用退出码 2。
**acceptance**：`npx tsx scripts/req-report-probe.mts` 退出码 0 且输出四组合 PASS 行；人为改坏一处（如加 `overflow:auto`）后退出码变为 1（反向验证探针有效）。

### t18 迁移兼容核对 + 构建与自检（test）
**implementation**：核对降级矩阵（旧留痕 / 旧需求无快照 / 文档缺节 / 端口未装配）在真实标本下均走显式降级；确认 6 个查询**只读**、不因台账后端（json|sqlite）不同而行为分叉；跑构建与知识层自检。
**acceptance**：`pnpm build`（C-11）退出码 0 且 `dist/` 与 `lib/client.js` 均有新产物；`pnpm build:client`（C-12）输出 `[verify-client] OK`；`pnpm typecheck`（C-15）0；`pnpm kb:check`（C-13）0；双后端各跑一次 6 端点读用例，返回体逐字段一致。

## 四、判定口径

1. 每卡 acceptance 均可执行（命令 + 期望），无空话；
2. 单卡 DU ≤ 16，本计划无超容量卡（如需加卡在实施中重交计划并重新批准）；
3. 依赖只走 `depends_on`：t1/t7 为起点，t18 为终点；
4. 契约定死（t1）先于一切实现；迁移兼容（t18）单列一张卡；
5. 回归红线：现有 session-jump / open-doc / dag view-state / 评论草稿 / 无快照不补 0 用例**必须继续绿**。
