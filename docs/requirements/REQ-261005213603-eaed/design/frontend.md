---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
---

# 前端设计（REQ-261005213603-eaed）

> 条件必交（`sides` 含 frontend）。本文档写清「运行圈这一刻长什么样、由谁决定、怎么验」。
> **本次视觉零变化**：没有新页面、新组件、新样式类，只有判据与 `title`/`aria-label` 文案。

## 原型与豁免 `serves: FR-3`

**无原型，且不适用**（requirement.md front-matter `prototype_exempt`，裁定 D-4）：

| 问题 | 结论 |
|---|---|
| 有可视变化吗？ | **没有**。圆圈复用既有 `renderRunningDot`，DOM 结构 / class / 尺寸 / 位置 / 动效一字不动 |
| 需要 `prototypes/INDEX.md` 吗？ | 不需要（无原型产物 ⇒ 无权威路径可标，也无 `#FR-N` 锚点可引用） |
| 有 `protoRefs` 吗？ | **无**（锚点不计入 serves，本次压根没有锚点） |
| 豁免何时生效？ | 需求文档经人确认后（`prototype_exempt` 需落章才生效，agent 不能自己豁免自己） |

**呈现点对照表**（锚点列填「—」是**如实**：没有原型可指）：

| 页面/组件（编号） | 原型锚点（`P-x/C-x ↔ #FR-N`） | 关联 D-x | 该处结构与交互（一句话） |
|---|---|---|---|
| C-1 运行圈（泳道卡） | — | D-1、D-3、D-4 | 卡面顶部紧跟 REQ id 的 13×13 转圈；hover 提示成因 |
| C-2 运行圈（列表行） | — | D-1、D-3 | ID 单元格内同一形状的圈；与 C-1 同一渲染单点 |
| C-3 自动链 pill（既有，不改） | — | — | 机制指示（`autoRun` 四档），与本次判据无关；**不得**与圆圈混用 |

## 目录与文件落点 `serves: FR-1`

```
src/client/
├── session-running.ts      （本次改：新增判据函数与 RunningMark；既有导出不动）
├── render/dom-utils.ts     （本次改：renderRunningDot 入参改 mark，文案按成因）
├── views/artifacts.ts      （本次改：renderReqCard 第 4 参改 mark）
├── views/board.ts          （本次改：两处映射改调 requirementRunningMark）
├── types.ts                （本次改：RequirementRecord 补 advanceLockAt?: number）
└── styles/board.ts         （**不改**：.dsh-pm-running 及其动效规则原样复用）
```

**落点理由**：判据必须留在 `session-running.ts`——它是既有的「运行态读数与映射唯一入口」；
新开文件会把同一个概念拆成两处，违反本仓「判据单点」纪律。

## 渲染结构与文案 `serves: FR-3`

**DOM（两种成因共用同一棵树，只有 `aria-label` / `title` 文案不同）**：

```
<span class="dsh-pm-running" data-running="true" role="img"
      aria-label="会话进行中 | 后台 run 进行中"
      title="会话进行中（该需求绑定窗口正在执行回合） | 后台 run 进行中（子卡链在执行，窗口可以已空闲）">
  <svg class="dsh-pm-running-svg" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <circle class="dsh-pm-running-track" cx="8" cy="8" r="6"/>
    <circle class="dsh-pm-running-arc"   cx="8" cy="8" r="6"/>
  </svg>
</span>
```

**文案对照**：

| 入参 | `aria-label` | `title` |
|---|---|---|
| `{ cause: 'session' }` | `会话进行中`（既有，逐字不变） | `会话进行中（该需求绑定窗口正在执行回合）` |
| `{ cause: 'run' }` | `后台 run 进行中` | `后台 run 进行中（子卡链在执行，窗口可以已空闲）` |
| `undefined` | ——（返回 `''`，不渲染） | —— |

**位置契约（既有，不许动）**：

- 泳道卡：`<span class="dsh-pm-card-id">REQ-…</span><span class="dsh-pm-running"`（紧跟 ID）
- 列表行：同形状，落在 ID 单元格（`<td>`）内，标题列**不得**出现圈

**样式**：零改动（`.dsh-pm-running` / `-svg` / `-track` / `-arc` 与 `@keyframes` 全复用；`prefers-reduced-motion` 分支不变）。

## 数据流与状态 `serves: FR-1, FR-4`

```
state.requirements[].advanceLockAt ─┐
                                    ├─▶ requirementRunningMark(req, isRunning, now) ─▶ mark ─▶ DOM
会话在跑集合（sessions.list 订阅）───┘
                     ▲
                     └─ 由 board-mount 既有的门控维护（本次不改）
```

| 状态 | 谁持有 | 本次改动 |
|---|---|---|
| 会话在跑集合 | `board-mount` 的 `runningNow()` + 订阅门控 | 不改 |
| 推进锁新鲜 | **每次渲染现算**（`state` + `Date.now()`） | 新增；不留缓存 |
| 重绘触发 | `/state` 变更（SSE）与 20s 轮询 | 不改（复用） |

**前端不做的事**：不发新请求、不订阅新 store、不设新定时器、不把 mark 写进任何 store。

## 交互与可访问性 `serves: FR-3, FR-5`

- **交互**：圆圈不可点（与今天一致），不新增点击区域；点击穿透到卡片（`data-action="open-req"`）行为不变。
- **读屏**：`role="img"` + `aria-label` 区分两种成因（新判据对读屏用户同样可辨）。
- **动效偏好**：`prefers-reduced-motion: reduce` 下两种成因都降级为静态半环。
- **不误报的视觉语义**：没在跑 ⇒ **什么都不渲染**（无灰点、无「未知」占位）。

## 判据与可失败断言 `serves: FR-3, FR-5`

| 断言（可在测试里直接判） | 失败即意味着 |
|---|---|
| 泳道卡 HTML 含 `<span class="dsh-pm-card-id">REQ-x</span><span class="dsh-pm-running"` | 位置契约被破坏 |
| `data-running="true"` 在单卡内出现次数 == 1（会话 + 锁双成立时也是 1） | 双成因渲染了两个圈 |
| `cause='run'` 时 `aria-label="后台 run 进行中"` 且 `cause='session'` 时仍为 `aria-label="会话进行中"` | 文案回归或成因串号 |
| 列表视图标题列切片内不含 `data-running` | 位置回归到标题列 |
| `buildBoard(state, 1)`（需求无 `advanceLockAt`）输出不含 `data-running` | 破坏了「缺参数逐字节一致」 |
| `BOARD_CSS` 仍含 `.dsh-pm-running` 与 `@keyframes dsh-pm-running-spin` | 样式分片被改坏 |

## 关键决策与取舍 `serves: FR-1`

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 两种成因的视觉 | 换色 / 换图标 / 加徽标 | 同圈，仅 `title`/`aria` | D-3、D-4：视觉零变化 ⇒ 原型豁免成立、回归面最小 |
| 成因参数形态 | 布尔 + `cause` 两参数 | 单个 `RunningMark` | 两参数能表达非法态；渲染层不该猜 |
| 渲染实现 | 每个视图各自判据 | 两视图共用一个 mark 函数 + 一个渲染函数 | 本仓「判据单点、渲染单点」既有纪律 |
| 样式 | 给 run 成因新增 class（便于统计） | 不加 class | 加 class 就是在 DOM 上开第二处判据（可从 DOM 反推成因），目前没有消费方需要 |

## 技术方案与亮点 `serves: FR-3`

- **零视觉变化的能力升级**：通过「一个渲染单点 + 一个值类型」把新判据接进既有卡面，样式分片与位置契约零改动（可核验指向：`tests/client-view.test.ts` 的位置契约两条断言仍绿）。
- **成因可见但不喧哗**：视觉上不加噪声，只在 `title`/`aria` 里暴露成因——满足排障与读屏，不改变扫视体验。
