# 数据模型（REQ-261004222448-292a）

<!-- serves: FR-9, FR-12, FR-13 -->

> 本需求**不改台账需求记录、不改 `queue.json`、不动状态机**。
> 唯一的数据结构变更是**注入留痕新增三个字段**；另有一条"不落库"的设计（主干抽取）。

## 存储形态（先讲清边界） `serves: FR-9`

| 数据 | 现在存哪 | 本需求是否动 |
|---|---|---|
| 需求台账（`RequirementRecord`） | **双后端**：`json` 分片（默认，`~/.dsh/reqboard`）｜ **SQLite**（`SqliteRequirementStore`，设置里切、重启生效、过人工确认门） | **不动结构**（只读新字段？无——台账不加字段） |
| 任务 DAG | 每个需求目录 `docs/requirements/<REQ>/queue.json` | **不动** |
| 注入留痕 | `~/.dsh/state/prompt-injection-log.json`（ring buffer 500，原子写） | **加 3 个字段**（见下） |
| 节点隔离留痕 | `~/.dsh/state/node-isolation-log.json` | 不动 |
| 设置 | `~/.dsh/dsh-reqboard-settings.json` | 不动 |

**由此得出的一条硬约束（写进用例与断言）**：

> 因为台账后端可在 `json` / `sqlite` 之间切换，**任何新增读取都必须在两条实现上语义一致**：
> 走同一 `RequirementStore` 端口、共享用例、共享测试；**不许只实现一条腿**。
> 本需求的 6 个查询**全部只读现有字段**，因此天然满足；但**新增字段若将来落到台账，必须同时落分片格式与 `sqliteSchema`**。

## 注入留痕：新增字段 `serves: FR-9`

### 变更 `serves: FR-9`

```typescript
// src/application/internal/injection-log.ts
export interface InjectionLogEntry {
  at: number; windowKey: string; stage: string; difficulty: string; category: string
  routeKey: string; hitLevel: string; fragmentIds: string[]; charCount: number
  trimmed: string[]; difficultyReasons?: string[]
  // ── 新增（v2）─────────────────────────────────────────────
  origin: 'gate-h3' | 'dive-node' | 'dive-round'      // 三个记录点，谁记的
  delivered: boolean                                  // 是否**真的投递进会话**（不是"有留痕=收到了"）
  text?: string                                       // 正文（供页面读"内容"）
  truncated?: boolean                                 // text 超上限被截断
}
```

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| `origin` | 联合枚举 | 新条目必填 | 旧条目 = `'unknown'`（读端） | 三个值对应三个记录点：`h3-inject.ts:111` / `session-driver.ts:292` / `AgentDeliverer.createRoundMessage` |
| `delivered` | boolean | 新条目必填 | 旧条目 = `null`（读端） | `h3-inject` 与 `dive-round` = `true`；`dive-node` = **`false`**（现有注释明说采集半不再投递） |
| `text` | string | 可选 | 无 | **单条上限 8 000 字符**；超出截断并置 `truncated: true`；不存正文时页面显示「内容不可得」 |

### 写入点（三处，缺一即留痕有洞） `serves: FR-9`

| 记录点 | 现有行为 | 本需求改动 |
|---|---|---|
| `application/gate/handlers/h3-inject.ts:111` | 记留痕（投递进会话） | 补 `origin:'gate-h3'`、`delivered:true`、`text` |
| `application/dive/session-driver.ts:292` | 记留痕（**只留痕、不投递**） | 补 `origin:'dive-node'`、`delivered:false`、`text` |
| `adapters/AgentDeliverer.ts:67 createRoundMessage` | **无留痕（采集缺口）** | **新增一条留痕**：`origin:'dive-round'`、`delivered` = 投递结果（失败也记，`text` 为轮次消息正文） |

### 迁移与兼容 `serves: FR-9, FR-12`

- **无破坏性迁移**：ring buffer 是 JSON 文件，旧条目缺字段即可；
- **读端降级**（FR-12）：`origin` 缺失 → 显示「来源未知」；`delivered` 缺失 → 显示「投递不可知」（**绝不默认成"已投递"**）；`text` 缺失 → 按钮置灰 + 「内容不可得」；
- **容量不变**：`INJECTION_LOG_CAP = 500` 不动（存正文会加大单条体积：按平均 3KB 估算，满 500 条约 1.5MB，可接受；超限按 ring 截断，不做特殊处理）；
- **回滚路径**：旧构建读新文件时忽略未知字段（JSON 宽松），无 schema 校验失败风险。

## 主干抽取：**读时算、不落库** `serves: FR-1, FR-13`

| 决策 | 理由 |
|---|---|
| 不缓存抽取结果 | 与现有 `systemPrompt.assemble`（读时装配、不落台账）同款；文档一改即生效，免失效逻辑 |
| 不向台账加字段 | 台账已有双后端，加字段要动两处并考虑迁移，收益不足 |
| 抽取失败即 `missing` | 服务端**必须能判定"文档没写这一节"**（按既有节名精确匹配），否则前端会编 |
| 文档模板补两节 | `decision` / `tech` 今天无节可抽 → **FR-13** 在模板里加「关键决策与取舍」「技术方案与亮点」 |

**节名匹配规则**（写死，供断言）：需求文档 `## 产品定义` / `## 边界`；设计文档 `## 架构` / `## 关键决策与取舍` / `## 技术方案与亮点`。匹配不到 → `missing: 'doc-section-missing'`。

## 前端状态（不落盘，只存内存） `serves: FR-11`

| 状态 | 存哪 | 失效条件 |
|---|---|---|
| 当前 Tab | 内存 + 视图状态（按 `reqId`） | 换需求即重置 |
| 各 Tab 数据缓存 | 内存 Map：`reqId::tab::revision` | revision 变更时只失效**当前 Tab + 头部** |
| 面板滚动/展开态 | 由"分段局部更新"天然保住，无需额外存储 | — |
| 评论草稿 | 沿用现有 `captureDetailDraft`（不改） | — |
