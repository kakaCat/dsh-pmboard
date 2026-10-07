---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 后端设计（REQ-261007100513-6749）

> `sides=backend`（无界面产出）。本文件聚焦服务与接口实现、数据流、关键逻辑、错误处理与落盘。

## 服务与接口实现 `serves: FR-2, FR-3, FR-4, FR-6`

### S-1 头部/尾部分层 `serves: FR-1, FR-2, FR-3`

**头部（system prompt section，唯一注册点 `src/gate-wiring.ts:173`）**

- `section.text` 的返回值**只由窗口绑定关系决定**：未绑定 → 静态引导文案（含 windowKey 前 16 位，会话内不变）；已绑定 → 需求 id + 标题 + 常量块（流水线纪律 / 归档规范）。
- 需求**状态**、**当前任务**、**阶段纪律正文**从头部移除（它们此前是 16 个版本的来源）。
- `interpolate:false` 保持不变（既有事故：宿主会逐字扫描 `{{name}}`，非法占位符会让整轮跑不起来——`gate-wiring.ts:180-189`）。

**尾部（新模块 `internal/volatile-notice.ts` + `internal/notice-delivery.ts`）**

```
写路径用例（MoveTask / AdvanceChain / SubmitArtifact / TaskReport …）
   └─ VolatileNoticePort.notify(windowKey, kind?)          ← 只表达意图
          └─ 适配器实现：
               ① buildVolatileNotice() 产 text + kind
               ② noticeHash(text) 与 state.volatileNotice.lastDelivered[kind] 比对
                    相同 → return {delivered:false, reason:'内容未变'}（不写留痕）
               ③ 进入去抖：pending[kind] = pickDebounced(...)
               ④ 到期：agents.get(windowKey) → inboxOf(agent).prepend('next-step', msg)
                    msg = { id, role:'user', content:[{type:'text',text}],
                            source:{kind:'dive', plugin, requirementId, revision, round} }   ← 自署来源，不冒充人类
               ⑤ 投递失败（窗口不可得）→ 头部兜底 + InjectionLog(origin='system-prompt') + 诊断留痕
```

- **为什么要去抖**：实测存在「20 秒内两态来回翻两次」（13,338 ↔ 13,897 两个版本在 `16:45:34/16:45:58` 与 `16:52:39/16:53:54` 各翻一次）——去抖窗口内同类只投最后一次。
- **为什么按内容哈希而非时间窗去重**：时间窗会吞掉真实变化；纪律丢失比多投一次严重。
- **投递通道**：`inboxOf(agent)`（`round-state.ts:348`）→ `inbox.prepend(target, message)`，`InboxTarget` 全集只有 `'next-step' | 'next-turn'`；**禁止**用 `agent.followup()` 一类会新起回合的路径（本仓曾因此返工：`session-driver.ts:104` 注释记录该路径会额外起一轮「只有纪律、没有提问」的 loop）。

### S-2 批量推进 `serves: FR-4, FR-5`

**实现落点**：`src/application/use-cases/MoveTask.ts` 拆为两段，单卡路径 = 批量的特例。

```typescript
// ① 只读校验产计划（不写盘）：席位 → 绑定 → 存在性 → 状态机合法边 → 依赖门 →
//    父卡上限 → done 凭证门（逐卡）→ 节流判定。每项产 { taskId, to, reason, acceptance?, mutation } 或 { code, error }
export async function planMoveTasks(deps, args, exec): Promise<MovePlan[]>
// ② 一次落笔：一个 mutateQueue 落全部合法项（store 原生支持同份原子写多张卡）
//    顺序契约照旧：任务先写 → 需求 rollup 后写 → RTM 同步（失败不阻断）
export async function applyMovePlans(deps, plans: MovePlan[]): Promise<TaskMoveItemResult[]>
```

- **事务性**：本仓无跨卡事务 API；原子性 = 单文件级（temp → fsync → rename，`QueueRepository.ts:314-339`）。批量落笔落在**同一次** `mutateQueue` 回调里，故对看板与读端表现为一次变更广播。
- **节流口径（FR-5）**：`findRecentAgentDoneTask` / `doneThrottleRemainingMs`（`DoneEvidenceSpec.ts:41/65`）的判据**不改**，只把「本批提交的卡」从「近 60s 内已关闭的其他卡」里排除（同批互不触发）。事故 C 的防线由逐卡 done 凭证门继续承载：一次调用关 4 张没汇报的卡，仍会在每张卡上被 `REQBOARD_NO_REPORT` / `REQBOARD_NO_EVIDENCE` 拒。
- **回执**：`results[]` 逐项 + `tree` 摘要（复用 `TaskTree.ts:34` 的 `TaskTreeNodeView`，只取一层）+ `throttleRemainingMs` + `guidance`。

### S-3 子卡预算软门禁 `serves: FR-6`

**两条派发路线的事实（决定计数源）**：

| 路线 | 谁起子会话 | 插件可见性 |
|---|---|---|
| 自动链（workflow） | 宿主引擎：`deps.workflow.start(...)`（`ExecuteTask.ts:476`）→ 脚本体 `await agent(prompt,{schema})`（`workflow-script.ts:139`） | 插件看不到子会话的逐步事件，只在运行结束拿到 `WorkflowRunOutcome` |
| 团队 | `runSubtaskViaTeam` → `ensureWorker` → `teams.spawnWorker`（`team-dispatch.ts:89/102`） | Worker 是自建会话，插件可经 `session/event` 观测 |
| owner 手动派发（7a43 的实际主路） | owner 窗口调 DSH `subagent` 工具 → 子会话 `origin=subagent`、`parentSession=owner` | 插件可经 `session/event` 收到子会话事件（**注意**：`isIgnoredSession`（`session-message-filter.ts:93-97`）当前把这类会话从 tool/call 与 user/message 的处理里排除，新订阅器**不得**复用该过滤器） |

**计数源与归属（本设计的关键取舍）**：

- **计数单位 = `assistant/message` 事件条数**（一条 = 一次 LLM 请求；诊断报告用的就是这个口径：7a43 主窗口 517 条）。**没有任何插件事件携带 usage**，token 数字只能走会话投影（`tokenTotals` / `cachedSnapshot!(['tokenUsage'])`）——本设计不用 token 当主计数，但**保留为降级口径**。
- **归属 = 子会话**：一个子会话 = 一张卡的某一段（正常 1:1，7a43 逐卡逐段各一个会话）。当一张卡由多个子会话承载时，预算按会话各自计，卡评论里汇总。
- **归属解法（2026-10-07 实施期只读勘察；原设计此处留的「按在制卡猜」兜底已可去掉）**：`ExecutionRecord.sessionId?: string`（`src/shared/protocol.ts:1246`）已记录每一次执行所属的会话 ⇒ **子会话 → 任务卡是精确查表**（按 `task.executions[].sessionId === 会话 id`），不需要启发式；确实查不到归属时才落「未归属」并在卡评论标注。另：`ExecutionRecord.tokenUsage`（`src/shared/protocol.ts:1255`）也已在账，可当**二级信号**（主计数仍为用户裁定的「请求条数」）。
- **挂载点**：`ExecuteTask.executeSubtask`（两条路线的共同入口，`ExecuteTask.ts:374`）负责**开窗**；新增只读订阅器（`session/event` → 只认 `assistant/message`，按 `parentSession`/`delegationDepth` 识别子会话）负责**计数**；计数落运行态文件（见 [data-model.md](data-model.md)）。

**到顶处置（复用本仓最同构的既有范式）**：

```
used >= limit
  ├─ ① 先停：拒绝发起新请求（该卡进入「预算到顶」态；不 kill，不静默继续）
  ├─ ② 再报：appendTaskComment(卡评论) + 通知 owner
  │        · owner 窗口活跃 → inbox.prepend('next-step', notice)
  │        · owner 窗口空闲 → inbox.prepend('next-turn', notice)   ← 排队等下个回合，**不起新回合**
  │        · **禁止**用 deliver()/followup（会新起 agent 回合，正是本需求要消灭的开销）
  └─ ③ 等放行：enterAwaitingConfirm(...) 挂起（awaiting-confirm.ts:102）
             owner 调 task_move({task_id, budget:{release:true}, reason})
                → releaseBudget() 幂等推进窗口 → exitAwaitingConfirm(...)（:184，onCleared 触发驱动续跑）
                → appendTaskComment 留痕
```

**为什么用 `enterAwaitingConfirm` 而不是新造挂起机制**：本仓已有「停下等人、显式放行再续跑」的完整范式（含 `onCleared` 触发驱动、超时/中断语义），新造一套必然在超时与重入上分叉。

## 数据流 `serves: FR-1, FR-2, FR-4, FR-6`

```
① 写路径（任务状态/需求阶段变化）
   use-case ──写台账（mutateQueue）──▶ queue.json 落盘（原子 rename）
        │
        └─ VolatileNoticePort.notify(windowKey, kind)
                └─ 去重/去抖 ──▶ inbox.prepend ──▶ 下一轮请求（会话尾部，前缀缓存不动）
                                          └─ 失败 ──▶ 头部兜底（下一次装配写入，代价=一次全量重算，但纪律不丢）

② 读路径（每轮请求装配）
   assembleContext ──▶ gate-wiring section.text ──▶ 头部（逐字节稳定）
                                  └─ 易变段不再参与装配（改走尾部）

③ 记账（批量）
   task_move({tasks:[...]}) ──▶ planMoveTasks（只读校验，逐项）──▶ applyMovePlans
        └─ 一次 mutateQueue（多卡）──▶ 需求 rollup ──▶ RTM 同步（失败不阻断）
        └─ 回执：results[] + tree + throttleRemainingMs + guidance

④ 子卡执行
   派发（workflow / team / owner 手动）──▶ executeSubtask：开窗
        └─ 子会话 assistant/message ×N ──▶ 订阅器计数（运行态文件）
              └─ 到顶 ──▶ 先停 → 卡评论 + owner 通知 → enterAwaitingConfirm
                    └─ owner 放行（task_move.budget.release）──▶ 窗口+1 → exitAwaitingConfirm → 续跑
```

## 关键逻辑 `serves: FR-1, FR-3, FR-4, FR-6`

### 头部稳定性判据（可断言）`serves: FR-1`

```
同样的 (facts, tasksSnapshot, windowKey) → 头部文本逐字节相等
需求 status 变化 / 在制卡变化 / 阶段变化 → 头部文本**仍然相等**
绑定关系变化（bind / unbind / 换绑）→ 允许变化一次
```

### 去抖的最终态保证 `serves: FR-3`

```
pending = pickDebounced(pending, incoming, now, debounceMs)
   incoming.hash === pending.hash            → 保持 pending（只顺延 dueAt）
   now >= pending.dueAt                      → 投递 pending 后替换为 incoming
   否则                                       → 替换为 incoming（最后一次胜出）
```

### 批量部分失败的顺序契约 `serves: FR-4`

```
① planMoveTasks 全部算完（只读，含逐卡 done 凭证门与节流判定）
② applyMovePlans 一次 mutateQueue（合法项全落，非法项不落）
③ 需求 rollup（applyTaskRollupVia）
④ RTM 同步（syncRTMYaml，失败不阻断并留痕）
⑤ 回执组装：results[] 顺序 = 入参 tasks[] 顺序（便于调用方逐项对齐）
```

### 预算窗口的幂等放行 `serves: FR-6`

```
releaseBudget(w, add):
   if (w.releasedAtWindowIndex === w.windowIndex) return { window: w, released: false }   // 幂等命中
   return { window: { ...w, windowIndex: w.windowIndex+1, used: 0, limit: add, reportedAt: undefined }, released: true }
```

- `limit` 在**开窗时定格**（事后改台账/改 `budgetRequests` 不影响已开窗口），避免「同一窗口前后两次判定不同」的漂移。

## 错误处理 `serves: FR-2, FR-4, FR-6`

| 情形 | 处理 | 证据 |
|---|---|---|
| 投递通道不可得 | 头部兜底 + 告警 | `InjectionLog(origin='system-prompt', delivered=true)` + 诊断记录 |
| 内容未变 | 不投递、不留痕 | 返回 `delivered:false, reason:'内容未变'` |
| 计数不可得（子会话事件缺失 / 运行态文件损坏） | **不阻断**，卡评论标注「计数不可得」，按「未知」处理而非 0 | 卡评论 + 诊断 |
| 批量某项非法 | 该项 `results[i].code`，其余照常 | 逐项结果 |
| 批量全部失败 | `success:false` + `results[]` 逐项原因 | 顶层 + 逐项 |
| 树摘要不可得 | 回执省略 `tree` 并给 `tree_note` | 回执字段 |
| 预算放行重复 | 幂等命中（`released:false`），不叠加窗口 | `budget.released=false` |
| owner 通知失败 | 卡评论已落（主通道），通知失败只告警；不因通知失败回滚已落账的状态 | 诊断 + 卡评论 |

## 数据库设计 `serves: FR-6`

- **无数据库**。落盘为 JSON：台账 `docs/requirements/<REQ>/queue.json`（唯一任务存储）+ 运行态文件 `state/subtask-budget.json`、`state/volatile-notice.json`。
- **写原子性**：既有 `QueueRepository` 的 temp → fsync → rename；运行态文件同法。
- **新增可选字段的改动点（探针实测清单，避免遗漏导致投影丢字段）**：
  1. `src/shared/protocol.ts:1691` `TaskRecord` 加 `budgetRequests?: number`；
  2. 客户端镜像 `src/client/types.ts:298`；
  3. 服务端手工投影四处：`QueryStageDetail.ts:336`、`sheet-tasks.ts:36`、`QueryDag.ts:92`、`http/routers/stages.ts:392`；
  4. **不要**加进 `REQUIRED_TASK_FIELDS`（`validateQueue.ts:64`）；
  5. **不** bump `REQBOARD_SCHEMA_VERSION`（9）与 `QUEUE_VERSION`（1）——加性可选字段零迁移（`normalizeQueueFile` 展开保留未知键）；
  6. 改了客户端必须 `pnpm build:client`（C-12，另有 STALE_BUILD 门）。
- **无迁移、可回滚**：删字段 + 删两个运行态文件即可；旧版本读到未知字段/文件按忽略处理。

## 性能考量 `serves: FR-1, FR-2, FR-4, FR-5`

| 指标 | 现状（7a43 实测） | 改造后（投影） |
|---|---|---|
| 头部重写造成的全价未命中 | 3,899,184 token（16 次重写） | ≈0（头部只随绑定关系变化） |
| 尾部增量等效成本 | — | ≈828,258 full-price 等效（6 次阶段正文 + 15 次任务块 + 9 次状态行，内容哈希去重后） |
| 该条浪费线降幅 | — | **约 79%** |
| owner 记账请求占比 | 23%（≈120 次请求 / 33M prompt） | ≤10%（批量 + 回执自带树摘要，去掉「推一张再查一次树」的第二步） |
| 子卡请求长尾 | 单卡 65–157 次，无上限 | 默认 60 次到顶先停（超限汇报，人工决定是否续） |
| 工具 schema 重发 | 57 个工具 ≈55.2K 字符/请求 | **不增加**（不新增工具） |

- 去抖窗口（1000ms）与内容哈希去重保证稳态下「每阶段注入次数 ≤ 状态真实变化次数」。
- 计数走运行态文件（不写台账），避免每请求触发 `queue.json` 的原子写与缓存 revision 抖动。

## 安全设计 `serves: FR-2, FR-4, FR-6`

- **注入自署来源**：尾部注入消息的 `source.kind` 必须是 `'dive'` 一类自署来源，**不得**伪装 `'user'`——否则窗口 agent 会把系统提示当人话执行（本仓 `capturePromptForMessage` 已确立「不冒充人类发言」的纪律）。
- **不改任何准入判据**：席位（`canWrite` / owner）、人工门、状态机合法边、done 凭证门、依赖门、父卡上限——**一条不动**；本需求只改注入落点与往返次数。
- **放行需要理由**：`budget.release` 必须带 `reason`（进卡评论与需求留痕），且只有 owner 席位可调（复用 `task_move` 既有席位检查）。
- **卡评论只走内部 helper**：`appendTaskComment` 不是工具（避免 agent 绕过门禁直接写评论）；调用方必须是已过席位检查的用例或系统路径。
- **运行态文件的信任边界**：计数文件可被删除/损坏 → 按「计数不可得」显式降级，**绝不**因缺文件而放宽预算。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-4, FR-6`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 预算计数源 | token 投影（`tokenTotals`） | `assistant/message` 条数 | 用户裁定的单位是「次请求」（D-3）；token 保留为降级口径 |
| 预算归属 | 按卡聚合（跨会话累加） | 按子会话（卡的一段） | 4 张卡并行时无法从会话反查卡（7a43 实测同窗口 4 个并行子会话）；正常 1:1 时两者等价 |
| 到顶处置机制 | 新造挂起/暂停机制 | 复用 `enterAwaitingConfirm` / `exitAwaitingConfirm` | 本仓已有含 `onCleared` 触发驱动与超时语义的完整范式，新造必然分叉 |
| owner 通知通道 | `deliver()` / `followup` | `inbox.prepend`（活跃 `next-step` / 空闲 `next-turn`） | `followup` 会新起一整轮 agent loop——本需求立项的动因就是消灭这类开销 |
| 批量写事务 | 引入跨卡事务 API | 单次 `mutateQueue` + 逐项结果 | store 原生支持一次改多张卡；跨卡事务是仓储层大改，收益不抵风险 |

## 技术方案与亮点 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

- **先量化再改**：所有设计取舍都有 7a43 的实测数字支撑（3,899,184 → 828,258 等效成本、23% 记账占比、单卡 157 次请求长尾）。
- **两个新范式都复用既有骨架**：投递复用 `InjectionLog` 留痕 + inbox 尾部注入；到顶挂起复用 `enterAwaitingConfirm`。新增代码只在「分层组装」「去重去抖」「批量计划/落笔」「预算纯判定」四处。
- **不新增工具、不 bump schema、不改门禁判据**——三条自我约束保证本需求不会用「加一层」的方式解决「层太多」的问题。
- **可回归**：`pnpm cost:report` 把诊断口径固化成命令，改造前后同口径对比（见 [test-cases.md](test-cases.md) TC-8）。
