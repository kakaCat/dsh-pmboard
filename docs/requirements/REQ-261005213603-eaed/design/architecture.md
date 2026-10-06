# 架构设计（REQ-261005213603-eaed）

> 每章标题行带 `serves: FR-x` 标注。写给零上下文的执行者：只读本文 + requirement.md 就能动手。
> 全部改动在 client 侧；host 与台账零改动（数据本就下发）。

## 目标与总体方案 `serves: FR-1, FR-2`

**问题**：需求条款 FR-1 / FR-2——看板运行圈只认「绑定窗口在跑回合」，而后台 run 跑子卡链时窗口空闲 ⇒ 圆圈沉默。

**当前状况**：

- `src/client/session-running.ts` 是运行态读数的唯一入口：`requirementRunning(req, isRunning)` = 席位窗口任一在跑回合；
- `src/client/views/board.ts` 两处映射（泳道卡 `L126`、列表行 `L365`）→ `renderRunningDot`；
- 后台 run 在 `ctx.jobs` 里执行（投递即返回），窗口会话 `running` 为 false ⇒ 无指示。

**设计方案**：判据从「会话回合」扩为「会话回合 ∪ 新鲜推进锁」：

```
running(req, now) =  requirementRunning(req, isRunning)        // 既有，一字不改
                  ∪  requirementRunInFlight(req, now)          // 新增：advanceLockAt 未过期
```

**为什么可行**：host 已把「有 run 在跑」的唯一凭据写进 `/state` 摘要（`advanceLockAt`，`RequirementSummary.ts:236`），
run 期间每 30s 心跳续租（`AdvanceChain.ts:445`），WIP 闸门用的就是同一条判据（`AdvanceChain.ts:884`）。

**不这么做的后果**：本插件主路径（投递式 run）永远不亮圈，看板答不了「此刻在不在动」——本次立项的直接成因。

## 模块改动地图 `serves: FR-1, FR-3`

```
  /state 摘要(含 advanceLockAt) ──SSE/20s 轮询──▶ board-mount.render()
                                                      │  state（含每条需求）
                                                      ▼
                                    buildBoard(state, now, …, runningSids)
                                                      │
                       ┌──────────────────────────────┴─────────────────┐
                       ▼                                                ▼
        renderReqCard(card, now, archived, mark)          renderListCard(card, now, archived, sids)
                       │                                                │
                       └──────────────▶ renderRunningDot(mark) ◀─────────┘
                                              （唯一渲染单点）

  session-running.ts（新增 requirementRunInFlight / requirementRunningMark）
        ▲ 读 state.requirements[].advanceLockAt（host 既有键）
```

**改动清单**：

| 模块/文件 | 类型 | 改动内容 | 原因（serves 哪条 FR） | 影响范围 |
|---|---|---|---|---|
| `src/client/session-running.ts` | 改 | 新增 `RunningMark` / `requirementRunInFlight` / `requirementRunningMark` / `requirementBusy`；`requirementRunning` 原样保留 | FR-1、FR-2 | 纯函数，无 IO；旧导出不动 |
| `src/client/render/dom-utils.ts` | 改 | `renderRunningDot(mark)`：入参由布尔改为 mark，两种成因给不同 title/aria | FR-3 | DOM 形状不变；`false` 时仍返回空串 |
| `src/client/views/artifacts.ts` | 改 | `renderReqCard` 第 4 参由 `running: boolean` 改为 `mark?: RunningMark` | FR-3 | 仅 board.ts 一处调用方 + 测试 2 参调用 |
| `src/client/views/board.ts` | 改 | 两处映射改调 `requirementRunningMark`；列表行 `_now` 变为实际使用 | FR-1、FR-4 | 泳道/列表输出随判据变化 |
| `src/client/types.ts` | 改 | `RequirementRecord` 补 `advanceLockAt?: number` | FR-2 | 纯类型声明，运行时无动作 |
| `docs/architecture/client-running-indicator.md` | 改 | 判据节 + 红线节加取代标注 | FR-6 | 文档 |
| `docs/requirements/REQ-261004210128-283d/design/{data-model,architecture}.md` | 改 | 旧红线就地标注「已被 REQ-261005213603-eaed 取代」 | FR-6 | 文档（不改历史结论） |

无新增文件、无删除文件。

## 判据定义与新鲜度口径 `serves: FR-1, FR-2`

**定义（唯一实现点：`session-running.ts`）**：

```
requirementRunInFlight(req, now, staleMs = LIMITS.advanceLockStaleMs):
    lock = req.advanceLockAt
    if typeof lock !== 'number' or !Number.isFinite(lock): return false
    return (now - lock) < staleMs            // 与 host AdvanceChain 同运算符（同口径）

requirementRunningMark(req, isRunning, now, staleMs?):
    if requirementRunning(req, isRunning): return { cause: 'session' }
    if requirementRunInFlight(req, now, staleMs): return { cause: 'run' }
    return undefined
```

**口径来源（不许复制字面量）**：

| 量 | 取值 | 出处 |
|---|---|---|
| stale 阈值 | `LIMITS.advanceLockStaleMs` = 15min | `src/domain/limits.ts:46` |
| 心跳周期 | `LIMITS.heartbeatIntervalMs` = 30s | `src/domain/limits.ts:64`（文档用，代码不读） |
| 运算符 | `now - lockAt < staleMs`（恰好等于 → 不新鲜） | `AdvanceChain.ts:747`、`:884` |

**成因优先级（钉死）**：两种成因同时成立时取 `session`——「有窗口正在跑回合」是更直接的事实，`run` 成因兜底。

**时钟偏差**：`advanceLockAt` 落在未来时 `now - lockAt` 为负 ⇒ 判新鲜（与 host 同一表达式，不另写规则）。

## 数据结构变更 `serves: FR-2`

**新增（客户端类型声明，无运行时结构）**：

```typescript
// src/client/types.ts —— RequirementRecord 增一个可选键（与 /state 摘要同形）
advanceLockAt?: number   // host 推进锁持有时刻（ms）；缺省 = 没有 run 在跑
```

**为什么是「补声明」而不是「新增字段」**：`/state` 摘要早已下发该键（`SUMMARY_KEYS` 已含 `advanceLockAt`），
客户端此前没读、也没声明。改的是类型视角，不是数据。

**兼容性分析**：

| 变更项 | 旧版本行为 | 新版本行为 | 迁移方案 |
|---|---|---|---|
| `advanceLockAt` 键 | 服务端旧版不下发 | 下发时用于判据 | 无迁移：缺键 = 判「不在跑」（与今天逐字节一致） |
| `RequirementRecord` 类型 | 无该键 | 可选键 | 无：可选字段，构造方零改动 |
| 台账 / SQLite / record.json | — | **零改动** | 无 |

## 接口变更 `serves: FR-1, FR-3`

**无新增对外接口**（无 HTTP、无工具、无事件）。改的是客户端内部函数签名：

| 函数 | 旧签名 | 新签名 | 兼容性 |
|---|---|---|---|
| `requirementRunningMark` | —（新增） | `(req, isRunning, now, staleMs?) => RunningMark \| undefined` | 新 |
| `requirementRunInFlight` | —（新增） | `(req, now, staleMs?) => boolean` | 新 |
| `requirementBusy` | —（新增） | `(req, isRunning, now, staleMs?) => boolean`（= mark 存在） | 新 |
| `requirementRunning` | `(req, isRunning) => boolean` | 不变 | 旧调用点零改动 |
| `renderRunningDot` | `(running: boolean) => string` | `(mark?: RunningMark) => string` | 内部两处调用点同步改；返回形状不变 |
| `renderReqCard` | `(card, now, archived, running = false)` | `(card, now, archived, mark?)` | 仅 `board.ts` 一处调用；`tests/token-card.test.ts` 2 参调用不受影响 |
| `buildBoard` / `buildListView` / `renderListCard` | 第 5/4 参 = 在跑会话 id 集合 | **签名不变** | 既有测试与订阅门控零改动 |

详细契约见 `interfaces.md`。

## 实时性与重绘路径 `serves: FR-4`

**链路（零新增定时器）**：

```
run 认领锁 / 30s 心跳 / 清锁  ──▶ 台账 revision bump ──▶ SSE /state 帧
                                                          │
                                          board-mount.fetchAll() ──▶ state = s ──▶ render()
                                                          │
                                    buildBoard(..., runningSids) 逐卡算 mark（now = Date.now()）
无 SSE 时：既有 20s 轮询（board-mount.ts:55 POLL_MS）兜底
```

**时刻表（设计保证）**：

| 事件 | 可见延迟 | 机制 |
|---|---|---|
| run 开始（锁写入） | ≤1 个 SSE 往返（近实时） | 台账变更 → SSE → 重取重绘 |
| run 进行中 | 保持亮 | 30s 心跳续租（revision 每次都 bump） |
| run 结束（finally 清锁） | 近实时（同上） | 锁清除 → SSE |
| 锁自然过期（进程死） | ≤20s（下一个轮询） | 新鲜度按 `now` 实时判，轮询触发重绘 |

**为什么不加新定时器**：SSE 与 20s 轮询已在（`session-running` 那套门控是给**会话 store 通知**用的，
本次新增信号的数据源是 `/state`，本来就走重取重绘）。

**门控不变**：`runningNow()` / `runningChanged()` 仍只看会话集合——run 侧抖动的重绘由 `/state` 变更驱动，
不需要也不应该在会话 store 通知里比较。

## 降级与不误报矩阵 `serves: FR-5, FR-2`

| 场景 | 检测 | 行为 |
|---|---|---|
| 服务端旧版（摘要无 `advanceLockAt`） | 键不存在 | 判「不在跑」→ 无指示（与改动前逐字节一致） |
| `advanceLockAt` 为 `null` / 字符串 / `NaN` / `Infinity` | `typeof === 'number'` + `Number.isFinite` | 判「不在跑」（不猜） |
| 锁已过期（`now - lockAt ≥ 15min`） | 阈值比较 | 判「不在跑」 |
| 残锁（进程被杀，最后心跳 ≤15min 前） | 阈值比较 | **最多误亮 15min**——与 host WIP 闸门同一容忍度，不另造 UI 阈值 |
| 需求无窗口绑定但持锁 | 锁判据与席位无关 | 算在跑（锁是需求级事实） |
| 无关需求持锁 | 逐需求判定 | 不影响本需求 |
| 会话 store 服务缺失（旧客户端） | 既有降级路径 | 会话判据为空，run 判据仍可用（本次不新增服务依赖） |

## 旧红线取代方案 `serves: FR-6`

要改的两处（**只加标注，不删历史**）：

| 文件 | 位置 | 现状 | 改法 |
|---|---|---|---|
| `docs/architecture/client-running-indicator.md` | `L38`（判据节）、`L76`（禁止的近似推断） | 写死「不用 advanceLockAt 新鲜度」 | 在该条后就地标注：已被 REQ-261005213603-eaed 取代为**正式判据**（附判据表达式与阈值出处）；`executions[].outcome==='running'` 仍保持禁用 |
| `docs/requirements/REQ-261004210128-283d/design/data-model.md` | `L64-68`（禁止的近似推断） | 同上 | 同上加取代标注（不修改该需求的验收结论与历史内容） |
| `docs/requirements/REQ-261004210128-283d/design/architecture.md` | `L133`（红线） | 同上 | 同上 |

**为什么必须改文档**：不改，后来实现者会照旧红线把新判据当缺陷删掉（这是一条会被"反向修复"的能力）。

**判定命令**：

```bash
grep -n "REQ-261005213603-eaed" docs/architecture/client-running-indicator.md \
  docs/requirements/REQ-261004210128-283d/design/data-model.md
grep -n "executions\[\].outcome" docs/architecture/client-running-indicator.md   # 仍须命中（未撤销）
```

## 风险与对策 `serves: FR-1, FR-5`

| 风险 | 触发条件 | 影响 | 对策 |
|---|---|---|---|
| 残锁误亮 | 进程被杀、锁未清 | ≤15min 假「在跑」 | 与 host WIP 闸门同容忍；stale 后由轮询在 ≤20s 内熄灭（FR-4） |
| 时钟偏差 | 系统时间回拨 | 锁被判新鲜 | 与 host 同一表达式（同一偏差，不放大） |
| 摘要键静默改名 | host 侧改投影 | 圆圈永久不亮 | 读侧只认 `advanceLockAt`；host 侧 `SUMMARY_KEYS` 已有测试锁定该键，改名会先红 |
| 双成因重复渲染 | 会话与锁同时成立 | 一张卡两个圈 | `requirementRunningMark` 返回单个 mark；`renderRunningDot` 一个出口（FR-3 验收 2） |
| 误把执行记录当判据 | 后续维护者"顺手"加 | 崩溃残留长期误报 | 旧红线中 `executions` 一条**保留**并加说明（FR-6 验收 2） |

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 判据集合 | 锁 ∪ 执行记录 | 锁（advanceLockAt 新鲜） | D-2：执行记录崩溃后不闭合，误报无上界；锁有 30s 心跳 + 15min stale |
| 新鲜度阈值 | UI 专用阈值（90s 等） | `LIMITS.advanceLockStaleMs` | 阈值必须单一来源（本仓"两份真相必然漂移"教训） |
| 呈现 | 颜色/图标/动效区分成因 | 同圈，`title`/`aria` 区分 | D-3：视觉零变化 ⇒ 回归面最小 |
| 数据通路 | 新增 host「谁在跑」接口 | 复用 `/state` 摘要既有键 | host 早已把唯一凭据写进摘要（`AdvanceChain.ts:884` 注释） |
| 重绘 | 为 run 侧新增定时器 | 复用 SSE + 20s 轮询 | 不加新时序面；消失延迟 ≤20s 已够 |
| 布尔还是 mark | 保留布尔 + 另加成因参数 | 收敛成单个 `RunningMark` | 两个并行参数会漂移（`running=false` + `cause=run` 这种非法态不该可表达） |

## 技术方案与亮点 `serves: FR-1, FR-2`

- **判据单点、渲染单点**：判据只有 `requirementRunningMark` 一处；渲染只有 `renderRunningDot` 一处；两处视图（泳道/列表）共用同一函数。
- **与常规做法的差异**：没造 host 接口，也没造前端推断层——把 host 既有的「在制判据」直接接上（可核验指向：`AdvanceChain.ts:884` 的 WIP 判据、`:445` 的心跳、`RequirementSummary.ts:236` 的投影）。
- **可测性**：判据是注入 `now` 与 `staleMs` 的纯函数 ⇒ 真值表可穷举（含未来时间、恰好 stale、非有限值）。

## 不做什么（架构边界） `serves: FR-1, FR-5`

- 不用 `updatedAt` / `autoRun` / `executions[].outcome` 推断在跑（后两者之一正是本次被否掉的方案）。
- 不改 host 接口 / 台账 schema / 协议；不新增配置开关与灰度机制（能力是纯加法，回滚 = 回退代码）。
- 不铺开到 DAG 节点、需求详情页、归档条、阶段面板。
- 不做局部 DOM patch（一次门控重绘的既有取舍，见 `client-running-indicator.md`）。
