---
requirement_refs: [FR-1, FR-2, FR-4, FR-5]
---

# 接口设计（REQ-261007125552-32cb）

> 本需求不新增对外工具/HTTP 接口；新增的是**文档格式契约**（接口清单表 / 对照表）、**内部判定函数签名**与**错误码契约**。按 FR-1 自举要求，本份自带「接口清单」节。

## 接口清单 `serves: FR-1`

> 本节即 FR-1 要求设计文档必备的「接口清单」——本需求自身的清单，同时作为格式范例。

| 接口 id | 形态 | 职责 | serves |
|---|---|---|---|
| IF-1 | 函数 `countInterfaceDeclarations(implementation: string): string[]` | 从实施描述中提取接口声明清单（纯函数，domain/task/Granularity.ts） | FR-4 |
| IF-2 | 函数 `assertGranularityGates(docs, req, rawTasks, planPath): Promise<GranularityReport>` | 粒度门禁唯一分派入口（plan-granularity.ts） | FR-2, FR-4, FR-5 |
| IF-3 | 错误码 `plan_card_multi_interface` | 一卡声明 >1 接口时的拒绝码 | FR-4 |
| IF-4 | 错误码 `plan_interface_map_missing` / `plan_component_map_missing` | 清单条目无卡接 / 对照表行指向未知 key | FR-2 |
| IF-5 | 错误码 `REQBOARD_DESIGN_CONTENT_GATE`（复用，聚合新增维度） | design 提交时缺接口清单/组件树节 | FR-1 |
| IF-6 | 返回体字段 `granularity_warnings: string[]` | 软门点名（files 超阈值 / UI 卡多锚点 / 对照表降级原因） | FR-2, FR-5 |

## 文档格式契约一：接口清单表 `serves: FR-1`

**位置**：`docs/requirements/<REQ>/design/interfaces.md`，节标题含「接口清单」（二级节）。

**表头判据**（机器可扫，与 template-gate-probe 同口径登记）：

| 接口 id | 形态 | 职责 | serves |
|---|---|---|---|

**填写规则**：

- 每个新增/修改的对外接口（HTTP 路由 / 工具 / 公开函数 / 错误码契约）一行；
- `接口 id` 用 `IF-N` 连续编号（对照表与测试引用它）；
- `形态` 列写可识别的声明，如 `POST /api/x`、`tool reqboard_xxx`、`函数 f(...)`、`错误码 XXX`。

**豁免**：需求无对外接口面（纯内部重构）时，在节内写「不适用：<理由>」保留节——保留节能被机械判定，删节不能（与「失败与并发路径」同口径）。

## 文档格式契约二：页面组件树 `serves: FR-1`

**位置**：`docs/requirements/<REQ>/design/frontend.md`，节标题含「组件树」（二级节，sides 含 frontend 时必备）。

**形态**：ASCII 树 + 组件清单表（表头：`组件 | 父级 | 职责 | serves`），叶子组件是拆卡粒度单位。

## 文档格式契约三：拆分对照表 `serves: FR-2`

**位置**：`docs/requirements/<REQ>/decomposition.md`，两段对照表（无 UI 时只留接口段）。

**表头判据**：

- 接口段：表头同时含「接口」与「接收卡 key」；
- 组件段：表头同时含「组件」与「接收卡 key」。

> ⚠️ 词法冲突规避（实测）：对照表的 key 列**必须**叫「接收卡 key」，不得叫「计划 key」——
> `readPlanDocTaskTable` 取文档里**第一张**表头含「计划 key」的表当任务表，对照表若用同名
> 会被误认成任务表，导致「文档所见=批准所见」门误报任务表缺行。两个判据的词法互不重叠是本契约的一部分。

**行语义**：左列 = 设计清单条目（`IF-N` 或组件名），右列 = 接收它的计划 key（可一对多：一个接口被契约卡+实现卡同接是合法的，用逗号分隔）。

**判定**（FR-2 硬门）：

1. 设计清单有条目、对照表无此行 → 拒，点名 `IF-N`；
2. 对照表行的 key 不在 `tasks[].key` 全集 → 拒，点名该 key；
3. 设计无清单节 → 降级 warn（返回体注明降级原因）。

## 接口声明词法（FR-4 检测口径） `serves: FR-4`

`countInterfaceDeclarations` 只认以下**声明式写法**（防误报的核心：描述性文字不算）：

- HTTP 路由：`` `(GET|POST|PUT|PATCH|DELETE) /path` ``（反引号可有可无，动词必须全大写、紧跟空格与 `/` 开头路径）；
- 工具定义：`tool: <name>` 或 `工具：<name>`；
- 同一声明重复出现（如正文+示例各一次）按**去重后**计数。

**明确不认**（防误报）：散文里的「接口」「API」字样；小写方法名；无路径的裸动词。

## 豁免字段契约 `serves: FR-4`

```typescript
// PlanTask 新增可选字段（snake 为主，camel 兼容）
granularity_exempt?: string  // ≤300 字符；非空才生效
```

- 一卡多接口确属合理（契约卡、聚合组装卡）时填理由 → 放行，理由进返回体 `granularity_warnings`（豁免不静默）；
- 空串 / 未填 = 未豁免；
- `normalizePlanTasks` 白名单透传（与 skipIntegrationReason 同款的「搬运+去空」）。

## 异常情况 `serves: FR-2, FR-4`

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| `plan_card_multi_interface` | 卡 implementation 去重后接口声明 >1 且无豁免 | envelope：点名卡 key + 识别到的接口清单 + 建议拆法（一接口一卡，契约先行） |
| `plan_interface_map_missing` | 清单条目无对照行 / 对照行 key 悬空 | envelope：点名 IF-N 或悬空 key + 补表指引 |
| `plan_component_map_missing` | 组件树条目无对照行（同上，组件段） | 同上 |
| `REQBOARD_DESIGN_CONTENT_GATE` | design 提交时缺接口清单/组件树节 | 聚合报错（复用既有信封，一次报全） |
