---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 架构设计（REQ-261007100513-6749）

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

**问题**：reqboard 驱动的请求成本由三处结构性浪费构成，实测于 REQ-261006130057-7a43（全树 2,324 请求 / 输入 412.2M / 墙钟 21.0h）。

**当前怎么做的**：

1. **易变内容住在 system prompt 头部**：`src/gate-wiring.ts:173` 注册的唯一 section，其 `text` 每轮重算；需求状态、当前任务、阶段纪律正文一变，头部就换版本。实测 30 次注入 / 16 个版本。
2. **记账一次一卡一往返**：`reqboard_task_move` 一次只推一张卡，回执不带父子卡状态；owner 常常「推一张 → 再查一次树」。实测 owner 窗口 23% 的 prompt 花在记账往返上。
3. **子卡无预算**：单卡 65–157 次请求无人拦，一次返工 4 张卡 15 分钟烧 72M 输入。

**设计方案**：按「变化频率 × 文本体积」把上下文分层，并给三个浪费点各加一道结构性约束。

```
                       ┌─────────────────────────────────────────┐
  每轮请求 ──▶ 头部段  │ 只在绑定关系变化时改（同阶段逐字节稳定） │  ← FR-1
                       └─────────────────────────────────────────┘
     │
     └── 尾部增量 ──▶ 看板状态行（≈30 tok）                        ← FR-2
                     阶段纪律正文（阶段切换时一次，≈3.3K tok）
                     当前任务最小块（任务切换时一次，≤300 tok）
                           │
                           └─ 内容哈希去重 + 短窗去抖             ← FR-3
                           └─ 通道不可得 → 退回头部 + 留痕        ← FR-2 失败路径

  记账：task_move(批量) ──一次 mutate 落多卡──▶ 回执带父子卡摘要   ← FR-4
        节流拒绝 ──▶ 回执带 throttleRemainingMs + 可做之事          ← FR-5
        同批卡互不触发节流（凭证门逐卡照旧）

  子卡：预算窗口（默认 60）──到顶──▶ 先停 ──▶ 报告卡评论 ──▶ 等 owner 放行  ← FR-6
```

**不这么做的后果**：头部重写会**整段**作废前缀缓存——实测就地替换（13,338 字重写后下一次请求 prompt 215,924 → 215,832，Δ=−92），不是追加；所以每次阶段/任务变化都按全价重发 13 万–35 万 token。尾部注入只在前缀之后追加，前缀命中不受影响。

**成本模型（如实声明）**：尾部注入会**累积**在历史里（历史不可变，改动历史反而再次作废缓存）。按 7a43 的真实请求时间线投影：

| 方案 | 等效成本（按缓存命中价 1/10 折算） |
|---|---|
| 现状（16 次头部重写全价重发） | 3,899,184 full-price token |
| 尾部增量（6 次阶段正文 + 15 次任务块 + 9 次状态行，内容哈希去重后） | 828,258 full-price 等效 |
| 降幅 | **约 79%** |

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

```
  [改] gate-wiring.ts ── section.text 只产头部（稳定）
        │
        ├──▶ [新] internal/volatile-notice.ts ── 易变段组装（纯函数）
        │         └── 分类：status | stage | task | capture
        │
        └──▶ [新] internal/notice-delivery.ts ── 投递编排
                  ├── agents.get(windowKey) → inbox.prepend('next-step', msg)
                  ├── 内容哈希表（按窗口）去重 + 短窗去抖
                  └── 失败 → 头部兜底 + InjectionLog 留痕

  [改] use-cases/MoveTask.ts ── 拆成「计划（只校验）」+「落笔（一次 mutate）」
        │
        ├──▶ [改] tools/TaskMoveTool ── 新增 tasks[] 批量入参（旧扁平形态保留）
        │         └── 回执：results[] 逐项 + tree 摘要（复用 TaskTree 节点投影）
        │
        └──▶ [改] support.ts / DoneEvidenceSpec 口径 ── 同批卡互不触发节流
                  └── 回执新增 throttleRemainingMs + guidance

  [新] internal/subtask-budget.ts ── 预算纯判定（窗口/幂等放行）
        │
        ├──▶ [改] use-cases/ExecuteTask.ts ── executeSubtask 开窗（workflow/team 两条路线共同入口）
        ├──▶ [新] internal/request-counter.ts ── 只读订阅 session/event 的 assistant/message 计数
        │         （子会话识别：parentSession / delegationDepth；**不套 isIgnoredSession**）
        └──▶ [改] tools/TaskMoveTool ── budget.release 放行（不新增工具）
                  └── 到顶挂起复用 internal/awaiting-confirm.ts 的 enter/exit 范式
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves） | 影响范围 |
|---|---|---|---|---|
| `src/application/internal/capture-section.ts` | 改 | 头部组装只留「绑定关系 + 常量块」；易变三类移出 | FR-1 | 头部文本变短；既有断言语义需保持（`capture.test.ts`） |
| `src/application/internal/volatile-notice.ts` | 新增 | 易变段纯组装 + 分类 + 最小块渲染 | FR-2, FR-3 | 新模块，无外部依赖 |
| `src/application/internal/notice-delivery.ts` | 新增 | 投递编排、内容哈希去重、短窗去抖、降级兜底 | FR-2, FR-3 | 新增端口实现；失败必须响亮 |
| `src/gate-wiring.ts` | 改 | section.text 只产头部；易变段改经投递 | FR-1, FR-2 | 唯一 system prompt 注册点 |
| `src/application/ports.ts` | 改 | 新增 `VolatileNoticePort`（投递意图）+ 预算相关端口方法 | FR-2, FR-6 | 端口新增是纯加法 |
| `src/application/use-cases/MoveTask.ts` | 改 | 拆「计划/落笔」两段，支持多卡 | FR-4 | 单卡路径成为批量的特例 |
| `src/tools/TaskMoveTool/TaskMoveTool.ts` | 改 | 新增 `tasks[]` 与 `budget` 入参；回执加 `results[]`/`tree`/`throttleRemainingMs` | FR-4, FR-5, FR-6 | 旧字段只增不减 |
| `src/application/internal/subtask-budget.ts` | 新增 | 预算窗口纯判定（默认 60、覆盖、幂等放行） | FR-6 | 新模块 |
| `src/application/internal/request-counter.ts` | 新增 | 只读订阅 `session/event` 的 `assistant/message` 计数（按子会话归属） | FR-6 | 新订阅器；**不得**复用 `isIgnoredSession` 过滤（它把子会话排除在外） |
| `src/application/use-cases/ExecuteTask.ts` | 改 | `executeSubtask` 开窗（workflow / team 两条路线共同入口） | FR-6 | 只加开窗与到顶判定，不改派发语义 |
| `src/application/internal/awaiting-confirm.ts` | 复用 | 到顶挂起走 `enterAwaitingConfirm` / `exitAwaitingConfirm` | FR-6 | 复用既有「停下等人」范式，不新造 |
| `src/application/internal/task-comment.ts` | 新增 | 内部 `appendTaskComment`（非工具） | FR-6 | 卡评论落在 `TaskRecord.comments`，只能由用例/系统写 |
| `src/domain/limits.ts` | 改 | 新增 `subtaskRequestBudget: 60` 与 `noticeDebounceMs` | FR-2, FR-6 | 常量集中处 |
| `src/shared/protocol.ts` | 改 | `TaskRecord` 加可选 `budgetRequests?`；新增 `VolatileNoticeKind` 等类型 | FR-6 | 只增可选字段 |
| `scripts/token-cost-report.mts` + `package.json` | 新增 | 同口径成本度量命令 `pnpm cost:report` | FR-1..FR-6（验收） | 新增脚本，不改既有门禁 |

## 数据结构变更 `serves: FR-6`

### 新增/修改的数据结构 `serves: FR-6`

```typescript
// src/shared/protocol.ts —— TaskRecord 新增（**可选**，缺省即现行为）
interface TaskRecord {
  /** 本卡请求预算覆盖值（缺省 = LIMITS.subtaskRequestBudget）。仅覆盖用，不参与状态机。 */
  budgetRequests?: number
}

// 新增：易变段分类（写入留痕，供看板与排障）
type VolatileNoticeKind = 'status' | 'stage' | 'task' | 'capture'

// 新增：投递结果（与既有 DeliveryResult 同形，便于测试与降级分支）
interface NoticeDeliveryResult {
  delivered: boolean
  channel: 'inbox-next-step' | 'system-prompt-fallback'
  reason?: string
}
```

### 兼容性分析 `serves: FR-6`

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `TaskRecord.budgetRequests` | 字段不存在 | 缺省视为 `LIMITS.subtaskRequestBudget`（60） | 无需回填：读取侧 `?? 默认值` |
| 预算计数所在处 | 不存在 | 运行态文件 `state/subtask-budget.json`（与 `state/prompt-injection-log.json` 同类） | 无迁移：文件缺失即从 0 起算 |
| 回滚 | — | 删掉可选字段与运行态文件即可 | 旧版本读到未知字段按可选忽略，无破坏 |

## 接口变更 `serves: FR-4, FR-5, FR-6`

详述见 [interfaces.md](interfaces.md)——本节只列结论：

- `reqboard_task_move`：新增可选 `tasks[]`（批量）与 `budget` 子对象；回执新增 `results[]`、`tree`、`throttleRemainingMs`、`guidance`。**旧扁平入参与旧返回字段全部保留**。
- **不新增工具**：放行与批量都挂在既有 `reqboard_task_move` 上。理由：工具 schema 每轮请求都要重发，新增一个工具的 schema（约 800 字符）在全树尺度上就是数十万 token——本需求正是为此而立。

## 依赖关系 `serves: FR-2`

- **强依赖**：宿主 agent inbox（`inbox.prepend('next-step', message)`，`InboxTarget = 'next-turn' | 'next-step'`）+ `agents()` 端口（`get(id)`）。
- **强依赖**：既有 `InjectionLogPort`（留痕）与 `LIMITS`（常量集中处）。
- **弱依赖**：`TaskStore.mutate`（已支持一次改多张卡，无需扩展）。
- **无新增第三方依赖**。

## 目录结构 `serves: FR-2, FR-6`

```
src/application/internal/
  volatile-notice.ts      <新增> 易变段纯组装（无 I/O）
  notice-delivery.ts      <新增> 投递编排 + 去重/去抖 + 降级
  subtask-budget.ts       <新增> 预算窗口纯判定
  capture-section.ts      <改>   只剩头部（稳定）组装
src/application/dive/
  round-driver.ts         <改>   子卡派发处接预算窗口
scripts/
  token-cost-report.mts   <新增> 同口径成本度量（pnpm cost:report）
```

## 关键算法/流程 `serves: FR-1, FR-2, FR-3, FR-4, FR-6`

### 头部/尾部分层判据 `serves: FR-1, FR-2`

| 内容 | 变化频率 | 体积 | 落点 |
|---|---|---|---|
| 未绑定引导文案（静态版） | 每会话 0–1 次 | 小 | 头部 |
| 已绑定需求的 id + 标题 | 绑定/换绑/改标题 | 小 | 头部 |
| 流水线纪律 + 归档规范常量块 | 从不 | 中 | 头部 |
| 看板状态行（`当前状态：X`） | 每次阶段推进 | ≈30 tok | 尾部 |
| 阶段纪律正文 | 每次阶段切换 | ≈3.3K tok | 尾部 |
| 当前任务最小块 | 每次任务切换 | ≤300 tok | 尾部 |
| 待捕获提示（含用户消息节选） | 每条用户消息 | ≈700 tok | 尾部 |

**为什么状态行也要出头部**：它随阶段推进变 5 次左右；留在头部就是 5 次全量重算（每次 ≈13 万–35 万 token）。放尾部只付自身 ≈30 token。

### 去重与去抖 `serves: FR-3`

```
组装易变段 → 分类（status/stage/task/capture）
   │
   ├─ 逐类算内容哈希 → 与该窗口「上次投递哈希」比对
   │      相同 → 丢弃（不投递）
   │      不同 → 进入去抖窗口
   │
   └─ 去抖：窗口内（LIMITS.noticeDebounceMs）同类只保留**最后一次**
           窗口到期 → 投递 → 更新哈希表 → InjectionLog 记一条
```

- 去重键 = **内容哈希**（不是时间窗）：时间窗会吞掉真实变化，纪律丢失比多投一次严重。
- **空态不单独投递（2026-10-07 实施期补入的设计规则）**：「无在制任务」是收尾与开工之间的瞬态、本身零信息量；把它当成一次状态变化去投递，正是实测「13,338 ↔ 13,897 两个版本来回翻版」（16:45:34/16:45:58、16:52:39/16:53:50）的根因。规则：空态**不单独投递**，只在阶段变化时随阶段通知一并投递；若空态持续超过 5 分钟且期间既无新任务也无阶段变化，才补投一次（避免窗口长期误以为有任务在跑）。
- 去抖只针对**同一窗口的同一类**：不同类（状态行 vs 任务块）各自独立，避免互相吞。
- 最终态保证：去抖窗口内多次变化 → 投递最后一次，不投中间态。

### 批量推进的部分失败 `serves: FR-4`

```
一次调用 tasks[]
   │
   ├─ 逐项计划（planMove）：只读校验（席位 / 绑定 / 状态机合法边 / 依赖门 /
   │   父卡上限 / done 凭证门逐卡 / 节流）——**不写盘**
   │        └─ 非法项 → 记入 results[i].code，不阻断其它项
   │
   ├─ 一次 mutateQueue 落笔全部合法项（store 原生支持整份原子写）
   │        └─ 顺序契约照旧：任务先写，需求 rollup 后写
   │
   └─ 逐项 results[] + 父子卡树摘要（复用 TaskTree 节点投影，只取一层）
```

**为什么不做整体回滚**：整批回滚会把已合法推进的卡退回原状态，制造「状态倒退」这一更大的事故；逐项落账 + 逐项原因与既有 `SubmitTool.results[]` 的逐项点名口径一致。

### 预算窗口与幂等放行 `serves: FR-6`

```
子卡派发 → 开窗 {windowIndex: 0, used: 0, limit: task.budgetRequests ?? LIMITS.subtaskRequestBudget}
   每次请求 → used += 1（原子递增，运行态文件）
       used >= limit
            │
            ├─ ① 先停：拒绝发起新请求（本卡进入「预算到顶」态）
            ├─ ② 再报：写卡评论 + 通知 owner（先停后报，顺序可断言）
            └─ ③ 等放行：owner 调 reqboard_task_move({task_id, budget:{release:true}, reason})
                     → windowIndex += 1、used 重置、写卡评论留痕
                     → 重复放行幂等（同一 windowIndex 只生效一次）
```

## 安全/性能考虑 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

- **注入不得冒充人类**：尾部注入消息的 `source.kind` 必须自署（复用 `{kind:'dive', plugin, requirementId, revision, round}` 形态），**不得**伪装成 `kind:'user'`——否则窗口 agent 会把系统提示当人话执行。
- **成本**：头部段变短且冻结；尾部注入按内容哈希去重、按最小块渲染；不新增工具（避免每轮重发新 schema）。
- **不得让缓存优化削弱门禁**：done 凭证门、席位检查、状态机合法边、60s 节流的**判据一条不改**；本需求只改注入落点与往返次数。
- **诚实降级**：通道不可得、计数不可得、树摘要不可得，三种都必须在回执或卡评论里写出来（禁静默按 0/空处理）。

## 测试策略 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

详见 [test-cases.md](test-cases.md)：8 条用例覆盖 6 条 FR + 端到端度量；回归靠 `pnpm test` + `pnpm baseline:check` + `pnpm typecheck`。

## 设计模式 `serves: FR-2, FR-4`

- **纯函数 + 端口**：`volatile-notice.ts` / `subtask-budget.ts` 是纯函数（可单测、无 I/O），投递与计数落盘走端口（可 fake）。
- **计划/落笔分离（plan-apply）**：`MoveTask` 拆成「只读校验产计划」与「一次落笔」，让批量与单卡共用同一套校验，且部分失败可逐项解释。
- **最小块渲染**：尾部注入只带「当下要做什么」，细节（任务说明/验收全文）留在卡文档与工具按需查询里——控制累积体积。

## 错误处理 `serves: FR-2, FR-4, FR-5, FR-6`

| 情形 | 处理 | 可观测证据 |
|---|---|---|
| 投递通道不可得（`窗口 {w} 不在线`） | 退回头部注入 + 告警 | `InjectionLog` 一条（`origin='system-prompt'`, `delivered=true`）+ 降级诊断记录 |
| 批量中某项非法边 | 该项返回 `code='invalid_transition'`，其余照常 | `results[i]` |
| 批量中某项撞节流 | 该项返回 `throttleRemainingMs` + `guidance`，其余照常 | `results[i]` |
| 节流拒绝（非批量） | 回执带 `throttleRemainingMs` + 可做之事 | 顶层字段 |
| 预算到顶 | 先停 → 汇报 → 等放行 | 卡评论 + owner 通知 |
| 预算计数不可得 | 不阻断，但标注「计数不可得」 | 卡评论 |
| 树摘要组装失败 | 回执省略 `tree` 并说明原因 | 回执 `tree_note` |

## 配置项 `serves: FR-2, FR-5, FR-6`

| 配置 | 位置 | 缺省 | 说明 |
|---|---|---|---|
| `LIMITS.subtaskRequestBudget` | `src/domain/limits.ts` | 60 | 子卡请求预算（卡上 `budgetRequests` 可覆盖） |
| `LIMITS.noticeDebounceMs` | `src/domain/limits.ts` | 30000 | 同类易变段去抖窗口（**2026-10-07 实施期修正**：原设计写 1000，但实测两态往返间隔是 16s / 24s / 71s，1 秒级窗口合并不了；真正的翻版根因是「空态」被当成一次状态变化——见「去重与去抖」） |
| `doneThrottleMs` | 既有（`ports.ts:1521` / `limits.ts:28`） | 60000 | 不改判据，只改回执可见性 |

## 监控埋点 `serves: FR-2, FR-3, FR-4, FR-6`

- `InjectionLog` 新增 `origin` 取值 `'system-notice'`（尾部注入）与既有 `'system-prompt'`（降级兜底），读端必须容忍未知取值（老日志无新值，反向安全）。
- 卡评论留痕三类事件：预算到顶汇报、放行、节流拒绝后的可做之事。
- 新增 `pnpm cost:report`：按需求输出请求数 / 未命中 / 命中缓存 / 输出 / 墙钟 + 缓存失效点清单（同诊断报告口径）。
