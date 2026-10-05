---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 架构设计：看板会话运行中指示（REQ-261004210128-283d） `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8`

> 类型：feature ｜ 端侧：**仅 frontend（客户端插件）**。`requirement.md` 未声明 `sides`，故不另交 `frontend.md`——
> 本需求的前端设计即在本文与 `interfaces.md` 内，无 backend 侧改动。
> 语言强度：设计以技术为主；每个二级章节标 `serves:`。

## 目标与不变量 `serves: FR-3, FR-4`

**代码层目标（可证伪）**：看板泳道卡与列表行在「该需求绑定的会话正在跑」时出现转圈指示，回合结束不刷新页面即消失；
读数不可得时**不出现**。判定锚点：卡内 `[data-running="true"]` 元素的有无。

三条不变量（后文所有取舍都服从它们）：

| 编号 | 不变量 | 可证伪方式 |
|------|--------|------------|
| INV-1 | 运行态**只读不写**：不落盘、不进台账、不进任何持久化结构 | `git diff` 中 `src/repositories/**`、`record.json` 零改动 |
| INV-2 | 判据**只有一处**：需求→会话映射与「在跑吗」判定各一个函数，泳道与列表共用 | `grep -rn "running" src/client` 命中集合 ⊆ 设计点名的文件 |
| INV-3 | 无关会话的运行态抖动**不触发**看板重绘 | 重绘计数探针（见 `test-cases.md` TC-08） |

## 模块与依赖方向 `serves: FR-1, FR-2`

```
src/client/
├── session-running.ts      【新增】运行态读数 + 订阅（唯一 I/O 入口，鸭子探测，零 host import）
├── session-jump.ts         【微改】SessionsServiceFace.list 的类型放宽（补可选 subscribe）
├── views/
│   ├── board.ts            【改】buildBoard / renderListCard 透传 running 集合
│   └── artifacts.ts        【改】renderReqCard 渲染指示
├── render/dom-utils.ts     【改】新增 renderRunningDot（唯一渲染单点）
├── board-mount.ts          【改】订阅接线 + dispose + 重绘门控
├── types.ts                【改】RequirementSummary / RequirementRecord 补 seats 声明
└── styles/board.ts         【改】指示样式（分片归属章在场）
```

依赖方向（保持既有单向性，无环）：

```
board-mount ──▶ views/board ──▶ views/artifacts ──▶ render/dom-utils
     │                                                    ▲
     └──────────────▶ session-running ────────────────────┘（只导出数据与订阅，不 import 渲染层）
                          │
                          └──▶ session-jump.windowServiceAccess()（复用既有唯一惰性服务投影点）
```

**为什么复用 `windowServiceAccess` 而不是再读一遍 `window.__dshPmSessions`**：本仓已有唯一一处「DSH 客户端服务投影」实现
（`session-jump.ts:56-90`），并在 `session-jump.test.ts` 有注入式测试范式。再写第二份全局读法 = 又一份真相；
`session-running.ts` 只接收该投影的 `getSessions()`，测试同样注入假投影。

## 运行态数据通路 `serves: FR-1, FR-5`

```
  DSH host                                    DSH client（复用官方，不自造）
  ┌───────────────────────┐                   ┌──────────────────────────────────────────┐
  │ agents.get(id).status │  control stream   │ ctx.remote.$on('api-session/status',     │
  │   === 'running'       │ ────────────────▶ │   (sessionId, running) =>                │
  │ （会话列表 RPC 亦带）  │  api-session/     │     handleSessionStatus(sessionId, run)  │
  └───────────────────────┘   status          └──────────────────┬───────────────────────┘
                                                                 ▼
                                              ctx.sessions.list  ← createSnapshotStore
                                              { ids, byId: { [sid]: { running, … } } }
                                                                 │ subscribe(fn)
                                                                 ▼
                                          session-running.ts：runningSessionIds()
                                                                 │ 集合变化才继续
                                                                 ▼
                                          board-mount：scheduleRender() → buildBoard(…, running)
                                                                 ▼
                                          泳道卡 renderReqCard / 列表行 renderListCard
                                                 → renderRunningDot(running)
```

关键事实（均已读源码核实，非假设）：

- `byId[sid].running` 由官方 `ClientSessions.projectList()` 写入；**缺失行 / 缺失字段**都可能出现（未拉到的会话）。
- `api-session/status` 是**全量**会话的运行态推送（不是只推当前会话），因此非当前会话也能实时增隐。
- 侧栏用的正是同一字段（`node.running` → `StateDot state='ongoing'`），本需求**与侧栏同源**，不另造推断。

## 渲染链与单点纪律 `serves: FR-3, FR-4`

```
渲染单点（唯一）：
  renderRunningDot(running: boolean): string      // 关 → ''，开 → 内联 SVG 转圈环

三个透传口（都加**带默认值**的可选参数，旧调用点零改动）：
  buildBoard(state, now, view, listOpts, archived, running = NO_RUNNING)
    ├─ 泳道：renderReqCard(card, now, archived, runningOf(card))
    └─ 列表：renderListCard(card, now, archived, runningOf(card))

判定单点（唯一）：
  requirementRunning(req, isRunning): boolean     // seats 权威 ∪ sourceSessionId 折算
```

放置位置（两处各自唯一稳定锚点）：

| 视图 | 锚点 | 理由 |
|------|------|------|
| 泳道卡 | 卡面窗口 chip 行（`renderReqCard` 的 `sessionChip` 处） | 「谁绑的」与「谁在跑」并排，读者一次扫完 |
| 列表行 | 标题列（`dsh-pm-list-title` 后） | 列表行没有独立 chip 行；标题列是唯一稳定锚点 |

## 重绘判据与性能 `serves: FR-5, FR-8`

**为什么必须门控**：`ctx.sessions.list` 这个 store 在**任意**会话的列表/活动/标题变化时都会通知
（官方 `projectList()` 是整表重投影）。无脑重绘 = 别的窗口每动一下，看板整块 `innerHTML` 重刷。
而 `render()` 会销毁并重建 `.dsh-pm-lanes`（横向滚动容器）——已有专门的滚动位置存取（REQ-261004184822-9881）来兜住，
但那是**兜底**，不该被高频触发。

**门控实现（两段）**：

```
① 相关集合收敛：只取「当前 BoardState 里出现过的需求」所绑定的会话 id 子集
   relevant = ⋃ seats(req) ∪ {sourceSessionId}   （req ∈ state.requirements）
② 集合相等比较：与「上一次渲染用过的 running 集合」逐个比对
   相等 → 直接 return（零 DOM 操作）；不等 → scheduleRender()
```

**明确不做**：不做局部 DOM patch（找到那个点、只改它的 class）。理由：两处渲染点 + 分页 + 排序 + 泳道重排，
局部 patch 的失效路径远多于一次门控重绘；门控已把高频路径挡掉，收益不抵复杂度。

## 降级矩阵与不伪造 `serves: FR-6`

| 场景 | 检测 | 行为 |
|------|------|------|
| `sessions` 服务未注入（旧客户端） | `getSessions()` → `undefined` | 全部判定为「不在跑」，零指示；`subscribe` 返回 no-op 退订 |
| `list` 缺失 / `subscribe` 缺失 | 鸭子探测 | 读数可降级为空集；订阅缺失 → 只失去实时性（下次重绘仍正确） |
| `byId[sid]` 缺该行 | 缺行 | 该会话判「不在跑」（**不猜、不抛**） |
| `running` 非布尔 | 类型守卫 `=== true` | 判「不在跑」 |
| 需求既无 `seats` 又无 `sourceSessionId` | 人工建卡 | 不渲染指示，也不渲染空壳 |

**红线**：不得用 `updatedAt` / `autoRun` / `advanceLockAt` 之类做近似推断（那是伪造运行态）。读数不可得的呈现 = **没有指示**，不是灰点、不是「未知」。

## 生命周期（挂载 / HMR / 退订） `serves: FR-8`

- 挂载（`createBoardAttachment`）：订阅一次，保存退订句柄；与 `unsubEvents`、`pollTimer` 同处 `dispose()`。
- `dispose()`：先置 `disposed = true`（既有纪律），再退订；退订后的通知**不得**触发渲染（单测断言）。
- HMR：`index.ts` 的 `window.__dshReqboardClient?.dispose()` 已在 `apply()` 开头执行；本模块无模块级可变状态，
  故重复 `apply` 不叠加监听。
- 无「模块级单例 store」：运行态不缓存副本，每次渲染时**实时读**（与 `archivedSids()` 同款），避免第二份真相。

## 样式、主题与动效偏好 `serves: FR-7`

- 样式落在既有分片 `src/client/styles/board.ts`（该文件头有归属章，`verify-client-build` 会校验）；
- 视觉照搬侧栏语义：`stroke: currentColor` + 25% 透明 track + 呼吸 arc，1.5s 一圈；
- 颜色不写死：沿用 `var(--dsw-*, fallback)` 既有写法，暗色主题自动可读；
- `@media (prefers-reduced-motion: reduce)`：停动画，保留静态半环（语义不丢）；
- 无障碍：容器 `role="img"` + `aria-label="会话进行中"`，`title` 写明「绑定窗口正在执行回合」。

## 不做什么（架构边界） `serves: FR-6`

1. **不新增 host 接口 / 不新增 SSE 帧**：运行态完全走官方既有客户端 store。
2. **不改台账与协议**：`RequirementRecord` 落库字段零新增；仅客户端**类型声明**补 `seats`。
3. **不在其它渲染点铺开**：归档条、详情页、DAG 节点、阶段面板本期不动（用户点名的是泳道图 + 列表）。
4. **不用任务执行会话当补充判据**：`tasks[].executions[].sessionId` 记录的是同一绑定窗口的历史执行记录，
   纳入只会引入「旧记录残留 = 正在跑」的误报面。
