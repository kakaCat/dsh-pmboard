# REQ-261001210304-0dfb 修复会话节点面板 DAG 刷新即重置视图状态（滚动/方向/开关/页签）

> 档位：轻档（两条根因同源、均为 client 单点改造；无第二个未定决策）· 类型：feature（实为缺陷修复，按立项弹框作答归档）
>
> 升级触发（单向，出现即停手改重档）：出现第二个独立决策 / 要动架构 / 要改数据模型 / 要动服务端协议。

## TL;DR

**现象**：会话右上角流程图 → 点「拆分 / 实施」节点展开详情面板后，DAG **每 ≤5 秒**（以及每个 SSE 任务事件）回到初始态：外层滚动回顶、方向回「纵向」、「关键路径 / 只看主线」熄灭、悬停钉住丢失、`[DAG]/[泳道]` 页签跳回 DAG。用户描述原话：「会刷新一下把看 dag 的图，重置到初始状态」——等于只能看第一屏，每次刷新后都要重调一遍。

**两条链路，同一次刷新各走一遍**（都不是"DAG 自己重置"，而是面板被重建且视图状态无处可存）：

```
每 ≤5s 兜底轮询 / 每个 SSE 任务事件（use-panel-refresh.ts:63-96）
   └─► onData(全新 overview 对象) → setOverview(data)          use-panel-refresh.ts:77-82
         ├─① 挂载 effect 依赖 stageOverview（对象身份每次都变）  conversation-progress.ts:238-251
         │     └─► tryMountDagCanvas → mountDagCanvas
         │           ├─ disposeDagCanvas(canvasId)               views/dag-view.ts:331
         │           └─ createDagViewer(..., initial)            views/dag-view.ts:348
         │                 initial = { dir:'vertical', crit:false, focus:false, pinned:null }  ← 写死
         │                 ⇒ 方向 / 关键路径 / 只看主线 / 钉住 全部归零
         └─② 面板 __html 每次都不同（含「数据时间 HH:MM:SS」+ data-fetched-at）
               panel-freshness.ts:59-71 → conversation-progress.ts:350-363
               └─► React 重设整段 innerHTML
                     ├─ <canvas> 元素销毁重建 ⇒ 视图状态、监听一并作废
                     ├─ .dsh-pm-dag-canvas-wrap（max-height:640px; overflow:auto，styles/dag.ts:49）
                     │     scrollTop / scrollLeft 归零
                     └─ 页签 is-active / hidden 按模板重置回 DAG（node-panel.ts:247-252；
                           页签切换只 toggle class，见 conversation-progress.ts:170-188）
```

**修法一句话**：把视图状态（方向 / 两个开关 / 钉住 / 页签）从"只活在 viewer 内存与 DOM class"改为**按画布记忆并可在 remount 时回填**，同时消掉"时间戳一变就整段重建 DOM"这条链路，让刷新只换数据、不动阅读位置。

## 判定标准（可证伪，全部可跑）

| 断言 | 量法（命令 / 观察点） | 通过条件（括号内为修前实测值） |
|------|----------------------|--------------------------------|
| A1 视图状态保活（单测） | 新增用例：同一 canvas 连续两次 `mountDagCanvas`，中间 `patch({dir:'horizontal',crit:true,focus:true,pinned:'t-b'})` → `npx vitest run tests/<新用例>` | 第二次挂载后 `viewer.state()` 仍为 `horizontal/true/true/'t-b'`（**修前必红**：回 `vertical/false/false/null`，见本目录 `evidence/probe-dag-reset.mts` A 段实跑输出） |
| A2 面板字符串稳定性（单测） | 两次 `renderNodePanel`（仅 `freshness.fetchedAt` 差 5 秒）比对：断言承载 DAG 的片段（canvas 标签 + `dsh-pm-dag-panel` 段）逐字节相同 | 相同（**修前必红**：两轮 `__html` 不同，首个差异点即 `data-fetched-at` / 「数据时间」，见探针 B 段实跑输出） |
| A3 页签保活 | 切到「泳道」后经历一轮刷新（模拟：改 `freshness.fetchedAt` 重渲染 + 重新挂载） | 仍停在泳道（修前：页签态只存在于 DOM class，重绘即回 DAG） |
| A4 滚动位置保活 | 浏览器内手测：面板滚到中段 → 等 ≥2 个轮询周期 + 触发一次任务事件 | `.dsh-pm-dag-canvas-wrap` 的 `scrollTop` 不归零（修前：每次刷新回到 0） |
| A5 切换需求不串档 | A 需求调成横向 + 只看主线 → 关面板 → 切到 B 需求打开同一节点 | B 需求为初始态（不得继承 A 的视图状态） |
| A6 既有回归全绿 | `npx vitest run tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-freshness-render.test.ts tests/panel-refresh.test.ts` | 全绿；`pwsh`-free 环境直接 `npx vitest run` 亦不新增红 |
| A7 类型与构建 | `npx tsc --noEmit -p tsconfig.json`（本仓既有红不算本次）；`pnpm build:client` | 本次改动文件无新增类型错误；client 构建通过（`scripts/verify-client-build.mjs` 绿） |

## 产品定义

会话右上角的「节点」面板是**监控 + 操作**界面：用户展开「实施 / 拆分」节点，是为了**读那张依赖图**——按自己的习惯切纵向/横向、开关键路径或只看主线、悬停比对上下游、滚到关注的层去看。面板的刷新职责只有一件：**把新数据换上来**。

因此「刷新」与「视图状态」是两件事，必须解耦：

| 关注点 | 归谁 | 现状 |
|--------|------|------|
| 数据新鲜度（每 5s 轮询 + SSE 加速 + 数据时间/失败红条） | `panel-refresh.ts` / `use-panel-refresh.ts` | 正常，本次**不动** |
| DAG 视图状态（dir / crit / focus / pinned） | `dag/integration.ts` 的 viewer 闭包 state | 只活在内存，重挂即丢 |
| 页签选择（DAG / 泳道） | 注入 HTML 上的 `is-active` / `hidden` class | 只活在 DOM，重绘即丢 |
| 外层滚动位置 | `.dsh-pm-dag-canvas-wrap` 的 DOM 属性 | 只活在 DOM，整段 innerHTML 重建即归零 |

前一次改造（REQ-261001124111-5d36）为了消灭「假空态」，把刷新做成**打开即拉 + 5 秒兜底**；副作用是「重建整块面板」的频率从"偶尔"变成"每 5 秒一次"，于是把上面后三行原本偶发的问题放大成了常态。本次修的是这个副作用，**不推翻刷新策略**。

## 用户与角色

- **会话里的用户（本次立项来源）**：看实施进度时被每 5 秒打断一次——调好的横向视图、开好的关键路径、滚到的位置、切好的泳道页，全在下一轮刷新时消失；用户只能反复重调，或干脆不看。截图证据：面板内滚动条已在中段、DAG 只露出第一张卡。
- **实施 agent / 看板使用者**：需求详情页的 DAG（`#dag-canvas`，board-mount 的 SSE 重绘路径）与本处共用 `mountDagCanvas`，存在同类问题；本次以会话面板为主，共用的状态记忆机制顺带覆盖需求详情（见「边界」）。
- **插件维护者**：需要一个守卫测试，把"DAG 视图状态不得因刷新丢失"和"面板 `__html` 不得因轮询时间戳整段变化"两条不变量钉住，防止下次改刷新/改渲染时再退化。

## 功能点

- **FR-1: DAG 视图状态按画布记忆并在重挂时回填**——方向 / 关键路径 / 只看主线 / 钉住四项状态不再只活在 viewer 闭包里：由一处**状态记忆**持有（键含 canvasId 与需求 id），`mountDagCanvas` 支持传入"上次状态"作为 initial，重挂后按记忆恢复；记忆为空时才用现有缺省 `{ dir:'vertical', crit:false, focus:false, pinned:null }`。
- **FR-2: 页签选择与外层滚动位置在刷新后保持**——`[DAG]/[泳道]` 页签选择不再只靠 DOM class 表达（重绘后按记忆恢复），`.dsh-pm-dag-canvas-wrap` 的 `scrollTop/scrollLeft` 在面板 HTML 重绘后按刷新前取值恢复。
- **FR-3: 面板 HTML 的刷新稳定性**——使轮询产生的易变字段（`数据时间 HH:MM:SS`、`data-fetched-at`）**不再导致承载 DAG 的整段 DOM 被重建**：要么让这部分不参与整段字符串的身份差异（例如把时间戳改为渲染后由 DOM 补丁更新），要么让整段 innerHTML 替换对画布与容器无感（元素复用 + 状态回填）。具体机制在 design 阶段收敛为**一个**方案，但 A2 判据必须在（修前必红）。
- **FR-4: 状态记忆的作用域与清理**——记忆按 `canvasId + 需求 id` 隔离：切换需求不得继承上一需求的方向/开关/页签（A5）；面板关闭、画布被换掉、实例释放时按既有 `disposers` 生命周期清理，不得造成跨会话串档或内存泄漏。
- **FR-5: 回归与守卫测试**——新增 A1/A2 两条单测（修前必红、修后必绿），并保证 A6 列出的既有用例全绿；探针脚本 `evidence/probe-dag-reset.mts` 保留为复现证据（修后其 A 段断言应能翻转成"保活"）。

## 接口与契约

- **`mountDagCanvas(tasks, ready?, canvasId?)`（src/client/views/dag-view.ts:327）**：新增可选入参承载"上次视图状态"（形状复用既有 `DagState` 子集：`dir/crit/focus/pinned`）。**缺省不传 = 现状行为**（`initial` 常量），需求详情页等旧调用方不改也能跑。
- **视图状态记忆（模块边界待 design 定）**：对外只暴露 `read(canvasId, reqId)` / `write(canvasId, reqId, state)` / `clear(canvasId)` 三个语义（是否单独成模块由 design 决定）；**不落盘**（内存 Map），页面重载后回初始态是明确可接受的行为。
- **不变形状**：`DagState` / `DagViewer`（`render/patch/state/layout/destroy`）契约不变；`dag/*`（布局、卡片、边线、交互）**零改动**。
- **面板 HTML 契约**：新增不变量——"同一份数据 + 仅新鲜度时间戳不同"两轮渲染，承载 DAG 的片段必须逐字节相同（A2）；`data-*` 钩子若因方案需要调整，须同步 node-panel / panel-freshness 的既有断言。
- **不改**：服务端协议、`StageOverview` 返回体、台账 schema、刷新周期与 SSE 语义。

## 迁移与兼容

- **纯 client 改动**：不动 host / 协议 / 台账，无数据迁移，无版本兼容分支。
- **旧调用方**：`mountDagCanvas` 新入参可选；`board-mount.ts`（需求详情 SSE 重绘）与 `conversation-progress.ts` 均沿用既有调用形态也能工作，改造按需增量。
- **旧测试**：`tests/dag-view.test.ts` 现有挂载用例（实例表隔离 / 释放时机）语义不变，应保持全绿；`tests/panel-freshness-render.test.ts` 若涉及时间戳渲染方式，改动方案须同步其断言（design 阶段确认改动面）。
- **回滚**：改动集中在 client 的 2–3 个文件，回滚即还原，无数据副作用。

## 边界

**做**：

1. 视图状态记忆与重挂回填（方向 / 关键路径 / 只看主线 / 钉住），覆盖会话节点面板的「拆分 / 实施」两处 DAG。
2. 页签选择与外层滚动位置在刷新后保持（FR-2）。
3. 面板 HTML 刷新稳定性（FR-3）+ 守卫测试（FR-5）；共用 `mountDagCanvas` 的需求详情页 DAG 因同一机制自动受益，不另做专属改造。

**不做**：

1. **不改 DAG 渲染与布局算法**（`src/client/dag/*` 只读复用），不改卡片外观、依赖归约、关键路径算法。
2. **不改刷新策略与数据通道**（仍 5 秒兜底轮询 + SSE 加速；「数据时间 / 刷新失败 / 插件已更新」三块可见性口径不动）。
3. **不做跨页面重载的持久化**（不写 localStorage / 台账 / 服务端）；F5 之后回初始态是可接受行为。

## 证据（本次实测）

1. **复现探针（可跑，不依赖浏览器）**：`npx tsx docs/requirements/REQ-261001210304-0dfb/evidence/probe-dag-reset.mts`
   - A 段实跑：轮询前 `{"dir":"horizontal","crit":true,"focus":true,"pinned":"t-b"}` → 一轮刷新后 `{"dir":"vertical","crit":false,"focus":false,"pinned":null}`（断言通过 = 缺陷复现）。
   - B 段实跑：两次渲染（仅 `fetchedAt` 差 5 秒）`__html` 逐字节相同 = **false**，首个差异点即 `data-fetched-at="1700000000000"` → `"1700000005000"`（同时「数据时间」文本也不同）。
2. **静态根因锚点**：`views/dag-view.ts:348`（写死的 initial）、`conversation-progress.ts:238-251`（依赖含 `stageOverview` 对象身份）、`use-panel-refresh.ts:77-82`（每轮 `setOverview` 新对象）、`panel-freshness.ts:59-71`（时间戳进字符串）、`styles/dag.ts:49`（`overflow:auto` 的滚动容器）、`conversation-progress.ts:170-188`（页签只 toggle class）。
3. **用户实测（本需求来源）**：会话右上角节点面板 DAG，滚动到中段后每次自动刷新即回顶、方向回纵向——截图见本需求立项会话。
4. **既有测试基线**：`npx vitest run tests/dag-view.test.ts tests/node-panel.test.ts tests/panel-freshness-render.test.ts tests/panel-refresh.test.ts`（design/实施阶段复跑并记录结果）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t4 |
| FR-2 | ✅ 已接收 | t2、t4、t3 |
| FR-3 | ✅ 已接收 | t3 |
| FR-4 | ✅ 已接收 | t1、t4 |
| FR-5 | ✅ 已接收 | t3、t5 |

> 无未接收条款（5 条全部有落点）。

<!-- reqboard:marks:end -->
