# 接口设计（REQ-261004222448-292a）

<!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-14, FR-15 -->

> 端点全部**只读**（`GET`），挂在现有 `/dashboard/api/reqboard/` 下；沿用现有路由的 `ok()/fail()` 信封与 `available=false` 降级纪律。
> 现有可复用端点不动：`/state` · `/requirements/:id` · `/requirements/:id/token` · `/requirements/:id/marks` · `/requirements/:id/stage/:stage` · `/injection-log` · `/isolation-log` · `/file`。

## 端点总览 `serves: FR-11`

| 端点 | 对应 Tab / 位置 | 复用 or 新增 | 首次请求时机 |
|---|---|---|---|
| `GET /requirements/:id/report` | 常驻头部（结论头 + 操作条 + 状态带） | **新增**（聚合） | 进详情（唯一首屏请求） |
| `GET /requirements/:id/report/trunk` | 📋 汇报 | **新增**（抽取） | 切到「汇报」（默认 Tab，紧随首屏） |
| `GET /requirements/:id/docs` | 📄 文档 | **新增**（聚合） | 切到「文档」 |
| `GET /requirements/:id/dag` | 🕸 DAG | **新增**（聚合） | 切到「DAG」 |
| `GET /requirements/:id/dialogue` | 💬 对话 | **新增**（会话抽文本） | 切到「对话」 |
| `GET /requirements/:id/prompts` | 🧱 提示词 | **新增**（装配 + 留痕聚合） | 切到「提示词」 |
| `GET /requirements/:id/token` | 🪙 Token | **扩展**（加两列 + 优化点） | 切到「Token」 |
| `GET /file?path=` | 所有「点开原文」 | 复用 | 点开时 |

## GET /requirements/:id/report `serves: FR-3, FR-4, FR-5`

**用途**：首屏唯一请求——结论头、操作条、状态带三格。

**调用方**：详情页挂载时（不切 Tab）。

**接口定义**：
```typescript
interface ReportResponse {
  head: {
    id: string; title: string; category: string; promptDifficulty?: string
    status: RequirementStatus; blocked: boolean; blockedReason?: string
    createdAt: number; updatedAt: number
    seats: { windowKey: string; role: 'owner'|'worker'|'observer'; joinedAt: number }[]
    sessionJump: { windowKey: string; archived: boolean }[]   // 已归档仍可点（先恢复再打开）
  }
  progress: {
    stageEnteredAt?: number; stageStayedMs?: number; sinceUpdateMs: number
    tasks: { total: number; done: number; running: number; todo: number; subChainDone: number; subChainTotal: number }
  }
  verdictLine: string            // 一句话结论：在跑什么 / 谁在跑 / 几件事等人 / 下一步谁动手
  waitingHuman: number           // 「几件事等人」的数字（与缺口条数一致）
  gaps: {                       // FR-4
    severity: 'red'|'yellow'|'gray'
    what: string; why: string
    ref?: { kind: 'clause'|'artifact'|'task'|'confirm'; id: string }
  }[]
  actions: {                     // FR-3 操作条：按当前状态给合法动作
    key: 'move'|'plan-approve'|'plan-reject'|'verify-pass'|'verify-rework'|'cancel'
    label: string; to?: RequirementStatus; consequence: string; humanOnly: boolean
  }[]
  nextStepForAgent?: string      // 给实施窗口 agent 的下一步（可空）
}
```

**错误码**：`REQBOARD_NOT_FOUND`（需求不存在）→ 页面走「未找到」三态之一。

## GET /requirements/:id/report/trunk `serves: FR-1, FR-2, FR-14, FR-15`

**用途**：汇报七条。**每一项都必须带 `source`（来源）与 `missing`（缺节）标记**——这是"不许编"的接口级保证。

```typescript
type TrunkSource = 'doc' | 'ledger' | 'auto' | 'human' | 'new-section'
interface TrunkItem {
  key: 'why'|'problem'|'approach'|'scope'|'decision'|'tech'|'highlight'
  source: TrunkSource[]           // 现有 / 节新增 / 全新
  summary: string[]               // 2~4 行摘要；空数组 = 无内容
  missing?: 'doc-section-missing' // 文档未提供该节 → 前端渲染「文档未提供该节」
  openRefs: { label: string; path?: string; doc?: string }[]  // 「点开原文」/「看往返」
  facts?: { label: string; value: string; evidence?: string[] }[]  // 仅 highlight：a 类自动事实
  highlights?: { diff: string; why: string; evidence: string[] }[] // 仅 highlight：b 类人写（evidence 空数组 = 未提供证据）
  achievement?: string[]          // 成果清单（自动汇总）
}
interface TrunkResponse {
  items: TrunkItem[]
  sources: { docLastUpdated?: number }   // 供页面标「文档最后更新于」
}
```

**抽取规则（服务端只读文档、不生成叙述）**：

| key | 抽自 | 缺节时 |
|---|---|---|
| `why` | 需求文档 §产品定义 + 立项评论/弹框作答 | `missing` |
| `problem` | 需求文档 §产品定义（问题 / 影响面 / 收益预期） | `missing` |
| `approach` | 设计文档 §架构（主线）+ `plan.summary` | `missing` |
| `scope` | 需求文档 §边界 | `missing` |
| `decision` | 设计文档 §关键决策与取舍（**FR-13 新增节**）+ 人工门往返留痕 | 命中留痕即有内容 |
| `tech` | 设计文档 §技术方案与亮点（**FR-13 新增节**）+ §架构 | `missing`（"设计模式：未使用"照实渲染） |
| `highlight` | 同节的人写部分 + 自动事实（改动规模 / 测试数 / 覆盖度） | 人写缺证据 → `evidence: []` |

## GET /requirements/:id/docs `serves: FR-7`

```typescript
interface DocsResponse {
  documents: {
    kind: 'requirement'|'design'|'plan'|'task-detail'|'verification'|'retro'|'notes'
    path: string; registeredAt?: number
    state: 'confirmed'|'pending'|'unregistered'|'file-missing'   // file-missing → 标灰
  }[]                                  // **全部铺开**，不截断、不内层滚动
  generated: { label: string; path: string }[]   // queue.json / rtm-*.yml（生成物）
  verification?: {                     // 照抄现有 verification.ts 的列
    version: number; reviewedAt?: number; decision?: 'pass'|'rework'; reviewNote?: string
    items: {
      id: string; criterion: string
      result?: string; resultSource?: 'agent'|'human'; needsHuman?: boolean; humanReason?: string
      evidence: string[]; status: 'pending'|'passed'|'failed'; opinion?: string; decidedAt?: number
    }[]
  }
  gates: {                             // 门禁裁决留痕（FR-7）
    gate: 'requirement'|'design'|'plan'|'implementation'|'verification'|'archive'
    verdict: 'passed'|'rejected'|'pending'|'not-reached'
    via?: 'dialog'|'board'|'evidence-text'; at?: number; by?: ActorRef; reason?: string
  }[]
  archive?: { dir: string; docs: ArchiveDoc[]; mergedInto: string[]; indexEntry: string
              manualUpdates?: ManualUpdate[]; reconcile?: unknown }
}
```

## GET /requirements/:id/dag `serves: FR-8`

```typescript
interface DagResponse {
  tasks: {                             // 图数据（`dag-view` 现有入参形状）
    id: string; title: string; parentId?: string; stageKind?: StageKind
    status: TaskStatus; dependsOn: string[]; claimedBy?: string
    layer?: number; chainMissing?: boolean    // 与现有 `[链未生成]`/`[手动]` 判定同源
  }[]
  steps: {                             // 每步执行结果（照抄 ExecutionRecord + lastReport）
    taskId: string; stage: string
    sessionId?: string; trigger: 'manual'|'auto'
    startedAt: number; endedAt?: number
    outcome: 'running'|'succeeded'|'failed'|'cancelled'
    error?: string; evidence: string[]; attempt: number
    report?: { summary: string; completed: string[]; filesChanged: string[]; nextStep?: string }
    outputCount?: number
  }[]
  criticalPath?: string[]
}
```

## GET /requirements/:id/dialogue `serves: FR-6`

**用途**：一条流。**服务端过滤**——只回人机文本与系统消息，工具/推理/过程叙述不出现在响应里（前端拿不到就不会渲染错）。

```typescript
interface DialogueResponse {
  items: (
    | { kind: 'human'|'agent'; at: number; windowKey?: string; text: string }
    | { kind: 'system'; at: number; text: string; inferred?: boolean;   // 回填标
        evt: 'stage-advance'|'plan-rejected'|'handoff'|'interrupt'|'confirm-pending'|'verify' }
  )[]
  page: { before?: number; hasMore: boolean; total: number }   // 分页：默认最近 20 条
}
```

**过滤规则（必须写死在服务端并有断言）**：取 `user/message`（`source.kind === 'user'`）与 `assistant/message` 的 **text 块**；
**排除** `tool/call`、`tool/result`、`reasoning` 块、`run_code` 包裹内容与"正在读取文件…"这类过程叙述。系统消息措辞取 `StatusEvent.reason` / 交接 / 中断 / 挂起确认留痕**原文，不重新措辞**。

## GET /requirements/:id/prompts `serves: FR-9`

```typescript
interface PromptsResponse {
  system: {                            // A · 固定系统提示词（读时装配）
    routeKey?: string; hitLevel?: string; perTurnChars?: number; perTurnEstTokens?: number
    sections: { id: string; kind: 'file'|'shell'; chars: number; text: string }[]
    trimmed: { id: string; chars: number; text?: string }[]     // 被裁片段：给正文（回答"为什么不知道某术语"）
    unavailable?: true                 // 装配服务不可得 → 降级（FR-12）
  }
  injections: {                        // B · 注入留痕
    at: number; windowKey: string
    origin: 'gate-h3'|'dive-node'|'dive-round'|'unknown'   // unknown = 旧条目缺字段
    delivered: boolean | null          // null = 旧条目不可知（**不默认 true**）
    routeKey?: string; fragmentIds: string[]; charCount?: number; trimmed: string[]
    text?: string; truncated?: boolean
  }[]
  context: {                           // C · 上下文
    medianUsagePct?: number; compressions: number; policy: string[]
    isolations: { at: number; stage: string; status: string; packageChars: number; reason: string }[]
    available: boolean
  }
}
```

## GET /requirements/:id/token（扩展） `serves: FR-10`

在现有响应上**新增**（其余字段与语义不变）：

```typescript
interface TokenResponseExt {
  byStage: {                           // 现有按节点表的升级：节点＝阶段
    stage: string; calls: number
    inputTokens: number; outputTokens: number; cacheReadTokens: number; totalTokens: number
    sharePct: number
    perCallTokens: number              // 新增：合计 ÷ 调用数（跨阶段可比）
    cacheHitPct: number                // 新增：缓存命中率
  }[]
  optimizations: {                     // 新增：可优化点（每条必须带依据数字）
    title: string; basis: string; suggestion: string
  }[]
  availability: 'full'|'partial'|'none'  // 三态；partial 需给 missingStages[]
  missingStages?: string[]
  boundsAreLowerBound?: boolean        // partial 时合计为下界
}
```

## Tab 懒加载契约（前端） `serves: FR-11`

| 规则 | 说明 |
|---|---|
| 首屏 | 只发 `report`；`trunk` 随默认 Tab 发出（同一次进入共 2 个请求，且都不含正文） |
| 切 Tab | **切到才请求**该 Tab 端点；同一会话内已取过的 Tab 走内存缓存（键：`reqId::tab::revision`） |
| 未激活面板 | **不在 DOM 中**（切走即卸载）；不在首屏请求里 |
| 分页 | `dialogue` / `injections` 支持 `before`/`limit`；默认 20 / 20 |
| 局部更新 | SSE revision 变更时**只重取当前 Tab + 头部**；滚动位置、展开态、阅读位置不变 |
| 内层滚动 | **禁止**（`overflow: auto\|scroll` 不得出现在面板内） |

## 降级响应契约 `serves: FR-12`

所有新增端点共用同一降级形状（沿用现有 `available=false` 纪律）：

```typescript
type Degrade = { available: false; reason: 'port-unavailable'|'file-missing'|'ledger-unreadable'|'no-snapshot'; note: string }
```

| 情形 | 响应 | 页面 |
|---|---|---|
| 端口未装配 | `available:false, reason:'port-unavailable'` | 「不可用（端口未装配）」——**不写"0 条"** |
| 文件不存在 | `documents[].state = 'file-missing'` | 路径划线 + 「文件缺失」 |
| 无 token 快照 | `availability:'partial'|'none'` | 「部分数据（下界）」/「无 token 快照」 |
| 文档缺节 | `TrunkItem.missing = 'doc-section-missing'` | 「文档未提供该节」 |
| 旧留痕缺新字段 | `origin:'unknown'`, `delivered:null` | 「来源未知 / 投递不可知」 |

## 展示面入参（三档密度） `serves: FR-3`

| 档 | 入口 | 取哪些块 | 禁止 |
|---|---|---|---|
| 一 会话头部 | `conversation.session.header.utilities`（现有） | 仅 `report.progress` + `verdictLine` | 其它一切（**本需求不改这一档**） |
| 二 会话内面板 | 现有会话面板 | `report`（head/progress/gaps/actions） | 文档表、成本、提示词正文、DAG 明细 |
| 三 详情页 | 本需求主体 | 全部（按 Tab 懒加载） | — |
