# 后端设计（REQ-261004222448-292a）

<!-- serves: FR-1, FR-4, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-14, FR-15 -->

> 后端只做三件事：**只读聚合**（服务端算，前端不遍历）、**会话文本抽取**（过滤工具与推理）、**留痕补记**（Dive 轮次）。
> 本需求**不新增写端点**（除内部留痕写入），不新增数据表，不动状态机。
> 端点契约见 `interfaces.md`；字段与迁移见 `data-model.md`；断言见 `test-cases.md`。

## 服务与接口实现 `serves: FR-11`

| 编号 | 类型 | 名称 | 职责说明 | 输入 | 输出 | 调用方 | 依赖 | serves |
|---|---|---|---|---|---|---|---|---|
| S-1 | 接口 | `GET /requirements/:id/report` | 首屏唯一请求：结论头 + 操作条 + 状态带 | `id` (string) | `ReportResponse` 或降级信封 | 前端详情挂载 | S-2, RequirementStore, 席位读端 | FR-3, FR-4, FR-5 |
| S-2 | 函数 | `buildGaps` | 从条款接收 / 产物登记 / 追溯断链 / 挂起确认算出缺口 | `req`, `tasks`, `marks`, `pendingConfirms` | `Gap[]`（含 severity / what / why / ref） | S-1 | 与 `reqboard_status` 同源投影 | FR-4 |
| S-3 | 函数 | `buildStageTokenTable` | 按**阶段**聚合 token，并给出「每次调用均」「缓存命中」 | `tokenUsage`, `tasks[].executions`, `stageTelemetry` | `StageToken[]` | S-1, S-7 | 现有 `assembleRequirementToken` | FR-10 |
| S-4 | 函数 | `buildOptimizations` | 由阶段表 + 零产出推导**可优化点**（每条带依据数字） | `StageToken[]`, `stageTelemetry` | `Optimization[]` | S-7 | S-3 | FR-10 |
| S-5 | 函数 | `extractTrunk` | 从需求 / 设计文档**按既有节名**抽汇报七条；抽不到即 `missing` | 文档路径集, `plan.summary`, 门禁留痕 | `TrunkItem[]` | S-5b（trunk 路由） | 文档读取端口（`/file` 同源） | FR-1, FR-2, FR-14, FR-15 |
| S-5b | 接口 | `GET /requirements/:id/report/trunk` | 汇报 Tab 数据 | `id` | `TrunkResponse` | 默认 Tab | S-5 | FR-1, FR-2, FR-14, FR-15 |
| S-6 | 函数 | `buildDialogue` | 会话事件 → 人机文本流 + 系统消息；**过滤工具与推理**；游标分页 | `sessionId(s)`, `before`, `limit` | `DialogueResponse` | dialogue 路由 | `SessionProbeAdapter` 的两条读法 | FR-6 |
| S-7 | 接口 | `GET /requirements/:id/token`（扩展） | 在现有响应上加 `byStage.perCallTokens/cacheHitPct` + `optimizations` + `availability` | `id` | `TokenResponseExt` | Token Tab | S-3, S-4 | FR-10 |
| S-8 | 服务 | `recordInjection`（扩展） | 写留痕时带上 `origin` / `delivered` / `text`（≤8 000 字符截断） | `InjectionLogInput` | `void`（同步，落盘串行化） | 三个记录点 | `InjectionLogFile`（ring 500，原子写） | FR-9 |
| S-9 | 服务 | `recordRoundDelivery`（新增） | Dive 轮次真正投递处**补记一条留痕**（含投递成败） | `windowKey`, `text`, `delivered`, `reason?` | `void` | `AgentDeliverer.createRoundMessage` / `deliverMessage` | S-8 | FR-9 |
| S-10 | 接口 | `GET /requirements/:id/{docs,dag,prompts}` | 三个 Tab 的聚合端点 | `id` | 各自 Response | 对应 Tab | RequirementStore / QueueTaskStore / injection+isolation 读端 | FR-7, FR-8, FR-9 |

## 数据流 `serves: FR-11, FR-12`

### 流程 1：进入详情（首屏） `serves: FR-11, FR-12`

```
事件：用户在看板点开需求（或深链进入）
  ↓
步骤 1：前端挂载详情壳（结论头骨架 + Tab 栏），发 S-1
  ↓ RequirementStore（json 分片 或 SQLite，同一端口）
  ├─ 命中 → 组装 ReportResponse
  └─ 未命中/不可读 → 降级信封 { available:false, reason }（页面走三态）
步骤 2：渲染结论头 / 操作条 / 状态带（不渲染任何 Tab 面板）
  ↓
步骤 3：默认 Tab = 汇报 → 发 S-5b（抽取）
  ↓ 文档读取（只读，不写）
  ├─ 每节命中 → 摘要 + source
  └─ 未命中 → missing:'doc-section-missing'
步骤 4：渲染汇报七条（正文均不取）

【副作用】：无（全部只读）；SSE 订阅沿用现有
```

### 流程 2：切 Tab（懒加载 + 缓存） `serves: FR-11`

```
事件：用户点某个 Tab
  ↓
步骤 1：查内存缓存 key = reqId::tab::revision
  ├─ 命中 → 直接渲染（不发请求）
  └─ 未命中 → 步骤 2
步骤 2：发该 Tab 端点（docs / dag / dialogue / token / prompts）
  ↓
步骤 3：**卸载上一个面板**（不在 DOM 里）、渲染新面板
【副作用】：无；不触碰其它 Tab 的缓存
```

### 流程 3：台账变更（局部更新） `serves: FR-11`

```
事件：SSE 收到 revision 变更
  ↓
步骤 1：只失效「头部 + 当前 Tab」的缓存（其它 Tab 缓存保留）
步骤 2：重取 S-1（+ 当前 Tab 端点）
步骤 3：**分段替换**对应 DOM 段（不整页 innerHTML）
【副作用】：无；滚动位置 / 展开态 / 当前 Tab 保持不变
```

### 流程 4：留痕补记（唯一的写路径） `serves: FR-9`

```
事件：闸门 H3 注入 / Dive 节点结算 / Dive 轮次投递
  ↓
步骤 1：组装 InjectionLogInput（origin / delivered / text）
  ↓ S-8 recordInjection
  ├─ text ≤ 8 000 → 原样
  └─ text > 8 000 → 截断 + truncated:true
步骤 2：appendToInjectionLog（ring 500，超界丢最旧）
  ↓
步骤 3：InjectionLogFile 串行队列 + 原子写（沿用现有）
【副作用】：`~/.dsh/state/prompt-injection-log.json` 追加一条
```

## 关键逻辑 `serves: FR-1, FR-4, FR-6, FR-10, FR-15`

### S-5 extractTrunk（抽取） `serves: FR-1, FR-2, FR-14, FR-15`

**功能**：把"为何做 / 解决什么 / 实现思路 / 范围边界 / 关键决策与取舍 / 技术方案 / 亮点与差异"从**现有文档的既有节**里读出来。

**处理步骤**：
1. 定位文档：需求文档（`requirement.md`）、设计文档（`design/*.md`，可多份）、计划 `plan.summary`、人工门留痕；
2. **按写死的节名匹配**（`## 产品定义` / `## 边界` / `## 架构` / `## 关键决策与取舍` / `## 技术方案与亮点`）取该节正文；
3. 截取该节前若干行作为摘要（**不生成新叙述、不改写措辞**）；
4. 未匹配到 → `summary: []` + `missing: 'doc-section-missing'`；
5. `highlight` 的两类分开：
   - **a 类自动事实**：改动规模（执行记录里的 filesChanged 去重计数）、新增测试数、FR 覆盖度——**全部可计算**；
   - **b 类人写**：取「技术方案与亮点」节里形如"差异 + 为什么 + 证据"的条目；**`evidence` 为空 → 前端渲染「未提供证据（不计入亮点）」**。

**边界条件**：
- 文档不存在 / 不可读 → 该条 `missing`（不是 500）；
- 节存在但为空 → `missing`（空节 ≠ 有内容）；
- 同一节出现在多份设计文档 → 合并，保留来源路径；
- **绝不因为"抽不到"而回退到 `req.description` 硬编**（那会让"缺节"不可见）。

### S-2 buildGaps（缺口判定） `serves: FR-4`

**处理步骤**（四类，逐类判定，输出带 `ref`）：
1. **未接收条款**：`clause_receive_status` 中 `state === 'unreceived'` → `severity: red`，`ref:{kind:'clause',id}`；
2. **必备产物缺失**：当前阶段应有而未登记/未确认的产物（与现有 `artifact-gates` 判定同源）→ `yellow/red`（门禁未过为红）；
3. **追溯断链**：FR → 设计 → 任务 → 测试 任一环缺失 → `yellow`；
4. **挂起确认未作答**：`pending_confirms` 非空 → `yellow`，`why` 里带**被拦住的写路径**；
5. 无缺口 → 返回空数组，页面渲染「无缺口」一行（**不画空表格**）。

### S-3 / S-4 按阶段聚合与优化点 `serves: FR-10`

1. 以**阶段**为键聚合：调用数、输入/输出/缓存、合计、占比；
2. `perCallTokens = 合计 ÷ 调用数`（跨阶段可比，用于发现"上下文重复"）；
3. `cacheHitPct = 缓存读 ÷ (缓存读 + 未缓存输入)`；
4. `availability`：快照齐 → `full`；部分 → `partial` + `missingStages` + `boundsAreLowerBound:true`；全缺 → `none`；
5. 优化点（每条必须有依据）：占比最高且缓存命中最低的阶段 → 建议节点隔离/输入包裁剪；重复执行的阶段（如 v2 重跑）→ 估算可省量；`zeroOutputRuns > 0` → 建议加"无产出即停"。

**边界条件**：`totalTokens == 0` 且无快照 → `availability:'none'`，**不得输出 0 值表格**。

### S-6 buildDialogue（会话文本抽取） `serves: FR-6`

1. 取会话事件（`snapshotEvents()` 或 `persistence.open→read()`，二选一按可得性）；
2. **保留**：`user/message`（`source.kind === 'user'`）与 `assistant/message` 的 **text 块**；
3. **排除**：`tool/call`、`tool/result`、`reasoning` 块、`run_code` 包裹内容、以及"正在读取文件…"这类过程叙述；
4. 插入系统消息：阶段推进 / 计划退回 / 交接 / 中断 / 挂起确认 / 验收裁决，**措辞取台账原文**（`StatusEvent.reason` 等），回填事件带 `inferred:true`；
5. 按时间合并成单列；游标分页（默认最近 20 条，`hasMore` 标明还有多少）。

**边界条件**：会话不可得 → `available:false`（不返回空数组冒充"没有对话"）。

### S-9 recordRoundDelivery（Dive 轮次留痕） `serves: FR-9`

1. 在 `createRoundMessage` 构造出消息后、`deliverMessage` 返回后各记录一次结果；
2. 成功 → `delivered:true`；失败（窗口不在线 / `followup` 抛错）→ `delivered:false` + `reason`；
3. `text` = 轮次消息正文（同样受 8 000 字符上限约束）。

## 错误处理 `serves: FR-12`

| 情形 | HTTP | 错误码 / 降级标记 | 页面表现 | 重试 | 降级 |
|---|---|---|---|---|---|
| 需求不存在 | 404 | `REQBOARD_NOT_FOUND` | 「未找到」三态 | 否 | — |
| 台账不可读 | 200 | `available:false, reason:'ledger-unreadable'` | 「不可用（台账读不到）」 | 否 | 只读呈现 |
| 留痕端口未装配 | 200 | `reason:'port-unavailable'` | 「不可用（端口未装配）」——**不写 0 条** | 否 | 该块隐藏值、保留说明 |
| 文档文件不存在 | 200 | `documents[].state='file-missing'` | 路径划线 + 「文件缺失」 | 否 | 沿用 `doc-missing` 标灰 |
| 文档缺节 | 200 | `missing:'doc-section-missing'` | 「文档未提供该节」 | 否 | 不编、不留白 |
| 无 token 快照 | 200 | `availability:'partial'/'none'` | 「部分数据（下界）」/「无 token 快照」 | 否 | 不补 0 |
| 旧留痕缺新字段 | 200 | `origin:'unknown'`, `delivered:null` | 「来源未知 / 投递不可知」 | 否 | **不默认成"已投递"** |
| 内部异常 | 500 | `INTERNAL_ERROR` | 段落级「加载失败 + 重试」 | 1 次 | 其它段继续可用（互不牵连） |

## 数据库设计 `serves: FR-9`

**本需求不新增表、不新增索引。** 数据形态与唯一变更如下表（详版见 `data-model.md`）：

| 存储 | 形态 | 本需求变更 |
|---|---|---|
| 需求台账 | **双后端**：`json` 分片（默认）/ **SQLite**（`SqliteRequirementStore`） | **无结构变更**（6 个查询全为只读现有字段） |
| 任务 DAG | `docs/requirements/<REQ>/queue.json` | 无 |
| 注入留痕 | `~/.dsh/state/prompt-injection-log.json`（ring 500） | **加 3 字段**：`origin` / `delivered` / `text`(+`truncated`) |

**若要落库（本需求不做，写清路径以免下次踩）**：新增字段必须**同时**改 `sqliteSchema.ts` 的分片定义与 JSON 分片格式，并补双向迁移；**单腿实现会随"存储后端可切换"在切换后丢数据**——这是本仓最容易翻车的地方。

## 性能考量 `serves: FR-11`

| 指标 | 目标 | 说明 |
|---|---|---|
| 首屏请求数 | **≤ 2**（`report` + 默认 Tab `trunk`），且**不含正文** | 断言 T-1 |
| 切 Tab 请求 | 每 Tab **1 次**；同 revision 内重切不重复请求 | 断言 T-2 / T-8 |
| 未激活面板 | **0 DOM 节点** | 断言 T-3 |
| 内层滚动容器 | **0** | 断言 T-4 |
| 台账读放大 | revision 变更只重取「头部 + 当前 Tab」 | 断言 T-6 |
| 留痕文件体积 | ring 500 × 平均 ≈3KB 正文 ≈ 1.5MB 上限 | 可接受；超界丢弃最旧 |

**瓶颈分析**：最慢环节是 `prompts`（装配 + 两次留痕读）与 `dialogue`（会话事件解析）——两者都在**非首屏**、且可缓存，故不影响首屏体感。

## 安全设计 `serves: FR-11`

### 鉴权 `serves: FR-11`

| 接口 | 鉴权要求 | 说明 |
|---|---|---|
| 全部 6 条新增只读端点 | 沿用现有 dashboard API 的会话上下文 | **不新增匿名可达面** |
| `GET /file?path=` | 沿用现有路径解析与存在性预检 | 文档路径来自台账登记值，不接受前端任意路径 |

### 输入校验 `serves: FR-11`

| 参数 | 校验规则 | 拒绝示例 | 理由 |
|---|---|---|---|
| `:id` | 需求 id 形状（`REQ-<数字>-<hex>`） | `../../etc/passwd` | 防路径遍历（`queue.json` 路径由 id 拼出） |
| `before` / `limit` | 正整数，`limit ≤ 50` | `-1`、`1e9` | 防分页放大 |
| `dialog{windowKey}` | 必须属于该需求的席位/来源窗口集合 | 任意窗口 id | 防跨需求读别人的会话 |

### 敏感信息 `serves: FR-11`

| 项目 | 是否敏感 | 处理 |
|---|---|---|
| 提示词正文（`text`） | 否（本仓内部提示词） | 全量返回，受 8 000 字符上限 |
| 会话文本（`dialogue.text`） | 是（可能含用户输入） | **只返回人机文本**，工具/推理一律不返回；不写日志正文 |
| 文档正文 | 否 | 走现有 `/file` 预览链路 |
