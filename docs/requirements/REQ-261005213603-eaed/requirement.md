---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [frontend]
prototype_exempt: 本需求零可视变化——运行圈复用既有 renderRunningDot，DOM/class/样式/位置一字不动，只改判据与 title/aria 文案，没有「长什么样」可画
---

# 看板运行圈补「后台 run 在跑」判据（REQ-261005213603-eaed）

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：重档（判据扩展要正面推翻上一条需求的文档红线） ｜ 立项：2026-10-05
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`
> 立项依据：用户原话「运行这个圆圈，agent运行子运行的时候没有算运行，需要添加上」

## TL;DR <!-- serves: FR-1 -->

一句话：**看板那个转圈，从「绑定窗口正在跑回合」扩成「这条需求此刻真在动」——agent 投到后台跑子卡链（run 在飞）时也点亮。**

- 现状缺口：自动链 / `reqboard_task_run` 是**投递式**（投递即返回），跑子卡时窗口早已空闲 ⇒ 圆圈沉默，看板答不了「此刻在不在动」。
- 补的判据：该需求有**新鲜推进锁**（`advance.lockAt` 未过期）——host 源码自称这是「有 run 在跑」的唯一凭据。
- 代价极小：`/state` 摘要**已经在发** `advanceLockAt`，本次纯客户端补齐，零 host 接口、零台账字段、零迁移。

## 业务流程图 <!-- serves: FR-1 -->

```
agent 在窗口里调 reqboard_task_run（投递即返回，回合结束）
        │
        ├─ host：认领推进锁 adv.lockAt  ──每 30s 心跳续租──┐
        │                                                │
        └─ 后台 job：跑子卡（开发/复核/联调/测试…）        │
                                                         ▼
看板（client）读 /state 摘要的 advanceLockAt ──▶ 新鲜？
        │                                        │
        │ 是                                     │ 否 / 缺键
        ▼                                        ▼
  REQ-id ⟳ 分类 · …（亮圈，title=后台 run 进行中）   无指示（不猜）
        │
   锁清除 / 心跳停（>15min）──SSE 或 20s 轮询──▶ 圈灭
```

## 产品定义 <!-- serves: FR-1 -->

**看板的运行圈要回答「这条需求此刻有没有人在干活」。**

- 是什么：一条需求级的「在跑」事实指示，位于泳道卡与列表行（紧跟 REQ id）。
- 核心价值：人不必点开详情、不必翻会话列表，扫一眼看板就知道该不该等、该不该插手。
- 与现状的区别：今天它只认「绑定窗口在跑回合」；而本插件的主路径是**投递式后台 run**——最该被看见的那段「正在干活」恰好不亮。

## 用户与角色 <!-- serves: FR-1 -->

| 角色 | 什么场景用 | 痛点 |
|---|---|---|
| 看板的人（PM / 需求发起人） | 打开看板判断「这条需求现在动不动、我要不要等它跑完」 | 后台跑子卡时圆圈沉默，只好靠翻会话 / 猜，容易误判「卡住了」而人工插手 |
| 多窗口协作者 | 别人窗口替这条需求投了 run | 圆圈只看自己窗口，跨窗口在跑看不见 |
| 后来实现者 | 读 `docs/architecture/client-running-indicator.md` 与 283d 设计红线 | 旧文档写死「禁用 advanceLockAt」，不改文档就会按旧红线把本能力判成缺陷 |

## 功能点（需求条款） <!-- serves: FR-1 -->

### 功能点清单

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 看板的人看到：需求有后台 run 在跑子卡时，卡面 Run 圈点亮（判据 = 会话回合 ∪ 新鲜推进锁） | P0 |
| FR-2 | 维护者读到：推进锁新鲜度的口径与 host 同源同阈值（15min），缺失/异常一律判「不在跑」 | P0 |
| FR-3 | 读者看到：两种成因共用同一个圈，只用 title/aria 文案区分；DOM/class/位置一字不动 | P0 |
| FR-4 | 看板的人看到：run 起圈自亮、run 止圈自灭（复用既有 SSE + 20s 轮询，不加新定时器） | P0 |
| FR-5 | 看板的人看到：无关需求、无绑定需求、读数不可得时**不出圈、不出空壳**（不误报） | P0 |
| FR-6 | 后来实现者读到：283d 与架构篇的旧红线标注「已被本需求取代」，不会被误导 | P1 |

### 功能点详细说明

### FR-1: 运行圈判据扩展为「会话回合 ∪ 新鲜推进锁」

**功能描述**：看板的人看到：需求有后台 run 在跑子卡时，卡面 Run 圈点亮。

**详细说明**：
- **使用场景**：agent 在窗口调 `reqboard_task_run`（或自动链自动触发）后回合已结束，后台 job 正在跑子卡；人此时打开看板。
- **操作流程**：
  1. agent 投递后台 run（窗口回合结束）；
  2. host 认领推进锁并每 30s 心跳续租；
  3. 人打开/停留看板 → 该需求卡面的 REQ id 后出现转圈，hover 显示「后台 run 进行中」。
- **预期结果**：
  - 该需求出现**恰好一个**运行圈（与既有会话圈不叠加成两个）；
  - 同泳道其它没有 run 的需求不出现圈。
- **边界条件**：
  - 需求状态为终态（archived / canceled）时不进泳道，谈不上圈；
  - 人工建卡（无 seats 且无 sourceSessionId）但持锁：仍算在跑（锁是需求级事实，与窗口绑定无关）。

**验收标准**：
1. 构造 `advanceLockAt = now - 60_000` 的需求 → 泳道卡 HTML 含 `data-running="true"`（`npx vitest run tests/client-view.test.ts`）。
2. 同一需求同时满足「会话在跑」与「锁新鲜」→ `data-running="true"` 出现次数恰为 1。
3. 会在跑的需求（锁新鲜）与不会在跑的需求同页 → 只有前者出圈。

### FR-2: 推进锁新鲜度的口径与降级

**功能描述**：维护者读到：推进锁新鲜度的口径与 host 同源同阈值，缺失/异常一律判「不在跑」。

**详细说明**：
- **使用场景**：任何一次卡面渲染（渲染时必须能一眼看出判据是什么、阈值从哪来）。
- **操作流程**：
  1. 读摘要键 `advanceLockAt`；
  2. 判 `Number.isFinite` 且 `now - advanceLockAt < LIMITS.advanceLockStaleMs`（15min，与 host `AdvanceChain` 同源）；
  3. 不新增任何阈值常量。
- **预期结果**：
  - 新鲜 → 在跑；恰好等于阈值 → 不在跑（与 host 的 `<` 同口径）；
  - 缺键 / `null` / 字符串 / `NaN` / 时间在未来 → 不伪造：缺键与非法值判不在跑；未来时间按 host 同口径判新鲜（不倒扣）。
- **边界条件**：
  - 进程被杀留下的残锁：最多误亮到 15min，与 host WIP 闸门对残锁的容忍度**同一口径**（不另造更严的 UI 阈值）。

**验收标准**：
1. 真值表单测全绿（缺键 / `undefined` / `null` / 字符串 / `NaN` / 恰好 stale / 未来时间 / 新鲜）——`npx vitest run tests/client-session-running.test.ts`。
2. 代码里不存在第二处 stale 阈值字面量（判据只引用 `LIMITS.advanceLockStaleMs`）。

### FR-3: 两种成因共用同一个圈，只区分文案

**功能描述**：读者看到：两种成因共用同一个圈，只用 title/aria 文案区分；DOM/class/位置一字不动。

**详细说明**：
- **使用场景**：人 hover 圈，想知道「是窗口在跑，还是后台 run 在跑」。
- **操作流程**：渲染单点按成因给 `title` / `aria-label`；DOM 形状不变。
- **预期结果**：
  - 会话成因：`aria-label="会话进行中"`（既有文案，不回归）；
  - run 成因：`aria-label="后台 run 进行中"`（文案区分，读屏可辨）；
  - class / `data-running="true"` / SVG 结构 / 位置（紧跟 REQ id）全不变。
- **边界条件**：
  - `prefers-reduced-motion` 降级（静态半环）对两种成因一致；
  - 不新增 CSS 分片规则、不新增图标。

**验收标准**：
1. `tests/client-view.test.ts` 的两条**位置契约**断言（ID 紧跟圆圈、标题列无圈）仍绿。
2. 断言 run 成因的 `aria-label="后台 run 进行中"`，且会话成因仍为 `aria-label="会话进行中"`。
3. `pnpm build:client` 退出码 0（样式分片与关键符号齐全）。

### FR-4: run 起圈自亮、run 止圈自灭

**功能描述**：看板的人看到：run 起圈自亮、run 止圈自灭，不需要刷新页面。

**详细说明**：
- **使用场景**：人停在看板上不动，等待 run 跑完。
- **操作流程**：
  1. 持锁 / 清锁 / 30s 心跳都会 bump 台账 revision → 既有 SSE 触发重取 → 重绘；
  2. 无 SSE 时由既有 20s 轮询兜底。
- **预期结果**：
  - 持锁后首次重绘（≤1 次 SSE 往返）即出现圈；
  - 锁清除后 ≤20s 内圈消失。
- **边界条件**：
  - **不新增定时器、不新增订阅**；`dispose()` 行为不变。

**验收标准**：
1. `tests/board-attach.test.ts` 既有实时增隐用例仍绿（会话侧不回归）。
2. 断言「锁变新鲜 → 一次状态更新后渲染含圈」「锁清除 → 下一次渲染不含圈」（同一测试文件新增用例）。
3. 代码 diff 中不出现新的 `setInterval` / `setTimeout`。

### FR-5: 不误报——无关需求、无绑定、读数不可得都不出圈

**功能描述**：看板的人看到：无关需求、无绑定需求、读数不可得时不出圈、不出空壳。

**详细说明**：
- **使用场景**：同页 45 条需求，只有 1 条在跑。
- **操作流程**：判据按需求逐条取，与其它需求无耦合。
- **预期结果**：
  - 别的需求持锁不影响本需求；本需求缺 `advanceLockAt` 且无会话在跑 → 无指示；
  - 读数不可得（旧服务端无该键）→ 静默降级为「不在跑」，不抛错、不显示「未知」。
- **边界条件**：
  - 服务端为旧版（摘要不带 `advanceLockAt`）→ 行为与改动前逐字节一致。

**验收标准**：
1. 省略 `running` 参数且需求无 `advanceLockAt` 时，`buildBoard` 输出**不含** `data-running`（既有 TC-09 断言仍绿）。
2. 断言「A 需求持锁、B 需求不持锁」→ 只有 A 出圈。
3. 断言 `advanceLockAt` 为非有限值时不出圈且不抛错。

### FR-6: 旧红线标注「已被本需求取代」

**功能描述**：后来实现者读到 283d 与架构篇的旧红线时，能看到取代标注，不会被误导。

**详细说明**：
- **使用场景**：有人读 `docs/architecture/client-running-indicator.md` 或 283d 设计文档，准备照旧红线把 advanceLockAt 判据当缺陷删掉。
- **操作流程**：在两处旧的「禁止的近似推断」清单上就地标注取代关系（指向本需求与新的判据定义），**不删历史**。
- **预期结果**：
  - 旧文档读者能看到「`advanceLockAt` 判据：已被 REQ-261005213603-eaed 取代为正式判据」；
  - `executions[].outcome === 'running'` 仍保持禁用（本次未启用，红线只剩这一条）。
- **边界条件**：
  - 只改文档标注，不改 283d 的需求档案正文与验收结论（历史不可改写）。

**验收标准**：
1. `grep -n "REQ-261005213603-eaed" docs/architecture/client-running-indicator.md docs/requirements/REQ-261004210128-283d/design/data-model.md` 两处均有命中。
2. 两处文档中 `executions[].outcome === 'running'` 的禁用表述**仍在**。

**功能点关系图**：
```
FR-1（判据扩展，核心）
  ├─ FR-2（新鲜度口径与降级）
  ├─ FR-3（呈现：同圈不同文案）
  ├─ FR-4（实时增隐）
  ├─ FR-5（不误报边界）
  └─ FR-6（旧红线取代留痕，文档层）
```

## 边界（不做什么） <!-- serves: FR-1 -->

- 不做 `tasks[].executions[].outcome === 'running'` 判据：那是历史执行记录，进程被杀会留永不闭合的残留 ⇒ 长期误报（用户 2026-10-05 裁定只用推进锁）。
- 不做新阈值：不另造 90s/2min 之类「UI 专用新鲜度」——那会与 host WIP 闸门形成两份口径。
- 不做新的视觉形态：不加颜色/图标/动效区分两种成因（视觉零变化是本需求的前提，见 D-4）。
- 不铺开到 DAG 节点、需求详情页、归档条：用户点名的是泳道卡与列表行两处；其余位置另立需求评估。
- 不改 host 接口 / 台账 schema / 协议：`advanceLockAt` 已在摘要下发（本次只补客户端类型声明）。
- 不改既有「会话回合」判据与它的降级矩阵：会话侧行为一字不变。

## 讨论与裁定记录（D-x） <!-- serves: FR-1 -->

| 编号 | 原话来源 | 裁定 | 影响 FR | 判据 |
|---|---|---|---|---|
| D-1 | 用户原话「运行这个圆圈，agent运行子运行的时候没有算运行，需要添加上」 | agent 在后台跑子运行（子卡链 run）时必须点亮运行圈——运行圈不再只认窗口回合 | FR-1, FR-4, FR-5 | 整体验收第 3 条（跑自动链后卡面出现 `data-running="true"`） |
| D-2 | 弹框选择「推进锁新鲜（advanceLockAt 未过期）」 | 判据只用推进锁新鲜；执行记录判据不启用（旧红线中仅撤销 advanceLockAt 这一条） | FR-1, FR-2, FR-6 | FR-2 验收第 1 条真值表单测；FR-6 验收第 2 条 |
| D-3 | 弹框选择「可以，按此写需求文档」 | 方案照准：DOM/class/位置零变化，两种成因只用 title/aria 区分 | FR-3 | FR-3 验收第 1、2 条 |
| D-4 | 弹框选择「写豁免（prototype_exempt）+ 落 D-x」 | 本需求零可视变化 ⇒ 原型门走豁免，不交 `prototypes/*.html` | FR-3 | front-matter 的 `prototype_exempt` 经人确认后，brainstorming→design 不再报 `prototype_missing` |

## 非功能需求 <!-- serves: FR-1 -->

- 性能：每张卡一次 O(1) 判定，无新增网络请求（复用既有 `/state` 与 SSE）；不新增 DOM 节点。
- 兼容：旧服务端（摘要不含 `advanceLockAt`）⇒ 行为与改动前逐字节一致（FR-5 验收 1）。
- 可测：判据为纯函数（注入 `now` 与阈值），单测零 DOM、零 IO。

## 验收标准（整体） <!-- serves: FR-1 -->

1. 跑 `npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts` → 全绿，且新增用例覆盖 FR-2/FR-3/FR-4/FR-5 的每条断言。
2. 跑 `pnpm typecheck`、`pnpm build:client` → 退出码 0（规范 C-15 / C-12）。
3. 端到端人工复现（可证伪）：对某需求跑一次自动链（或 `reqboard_task_run`）→ **不刷新页面**看泳道卡，REQ id 后出现 `[data-running="true"]`；run 结束后 ≤20s 内该元素消失。
4. `pnpm test` 全量失败集合**不超过**改动前基线（规范 C-14：基线必须用改动前的同一命令在同一工作区取得）。
5. FR-6 的两条 grep 断言命中。

## 关键决策与取舍

| 取舍点 | 否掉的方案 | 选了 | 为什么（依据） |
|---|---|---|---|
| 后台 run 的在跑判据 | 执行记录 `outcome==='running'` | 推进锁新鲜（`advanceLockAt`） | D-2：执行记录会被崩溃残留，误报无上界；推进锁有 30s 心跳 + 15min stale，误报有上界且与 host WIP 闸门同口径 |
| 新鲜度阈值 | 另造 UI 专用阈值（如 90s） | 复用 `LIMITS.advanceLockStaleMs`（15min） | 阈值必须单一来源：两条口径必然漂移（本仓既有教训） |
| 两种成因的呈现 | 颜色/图标/动效区分 | 同一个圈，仅 title/aria 区分 | D-3：视觉零变化让改动面与回归面最小 |
| 与 283d 红线的关系 | 静默破例 | 就地标注「已被取代」+ D-x 落账 | FR-6：不标取代，后来实现者会照旧红线把它当缺陷删掉 |
| 原型 | 交一份「视觉完全一样」的对照稿 | `prototype_exempt` 豁免 | D-4：无可视变化时画原型是伪造交付物 |

## 技术方案与亮点

需求阶段已拍板的结论（细节进 `design/architecture.md`）：

- **判据单点**：`src/client/session-running.ts` 扩为 `会话回合 ∪ 推进锁新鲜`；新增纯函数与组合入口，`requirementRunning` 语义不变。
- **渲染单点不变**：仍只有 `renderRunningDot` 一处（`src/client/render/dom-utils.ts`），只加一个「成因」参数。
- **接线两处**：`src/client/views/board.ts` 的泳道卡与列表行共用同一映射函数（口径不散）。
- **数据零新增**：`/state` 摘要已在发 `advanceLockAt`（`src/domain/requirement/RequirementSummary.ts:236`），客户端只补类型声明 `advanceLockAt?: number`。
- **与常规做法的差异**：不做「新造一个 host 接口告诉前端谁在跑」——host 早已把「有 run 在跑」的唯一凭据写进摘要，本次只把它接上（可核验指向：`src/application/use-cases/AdvanceChain.ts:884` 的 WIP 判据、`:445` 的心跳续租）。

## 依赖与约束 <!-- serves: FR-1 -->

- 依赖（强）：`/state` 摘要下发 `advanceLockAt`（已存在）；host 推进锁语义（认领 + 30s 心跳 + 15min stale）不变。
- 依赖（强）：既有 `/state` 摘要 + SSE 通道 + 20s 轮询（本次不新增通道）。
- 约束：阈值与 host 同源（`src/domain/limits.ts` 的 `advanceLockStaleMs`），不得复制字面量。
- 约束：不改 283d 的历史验收结论，只加取代标注。
- 约束：`sides: [frontend]`，但可视零变化 ⇒ 原型门走 `prototype_exempt` 豁免（D-4，经人确认后生效）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t3、t-ff7d59、t-787d69、t-66ef12 |
| FR-2 | ✅ 已接收 | t1、t3、t5、t-ff7d59、t-66ef12、t-eea3c3 |
| FR-3 | ✅ 已接收 | t2、t3、t-787d69、t-66ef12 |
| FR-4 | ✅ 已接收 | t2、t3、t5、t-787d69、t-66ef12、t-eea3c3 |
| FR-5 | ✅ 已接收 | t1、t3、t5、t-66ef12、t-eea3c3 |
| FR-6 | ✅ 已接收 | t5、t4、t-d8d6b7 |

> 无未接收条款（6 条全部有落点）。

<!-- reqboard:marks:end -->
