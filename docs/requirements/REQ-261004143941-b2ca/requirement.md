---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: [frontend, backend]
---

# REQ-261004143941-b2ca · 会话右上角流程图 token 统计不展示：窄窗口改显累计总数

## TL;DR

- **是什么**：会话标题行右侧的需求流程图，**窄窗口下每节点 token 会整批消失**（档位 B/C/D 直接 `display:none`），用户实测反馈「token 统计不展示了」。
- **为什么现在做**：数据其实一直有——接口 `GET /session/:id/progress` 正常返回每节点 token（实测 design 10.9M / implementing 12.2M），**纯展示层档位把它藏了**；而 token 是判断「这个需求烧了多少」的唯一入口。
- **得到什么**：**任意窗口宽度**都能在流程图计数旁看到「需求累计 Token」总数；宽窗口下每节点 token 维持现状不变。

## 一句话目标 + 可证伪判定标准

**目标**：会话头部流程图的 token 统计**不再随窗口变窄而消失**——窄档（容器 <1000px）改显一个「需求累计 Token 总数」（挂在计数旁，恒定可见），宽档（≥1000px）保持现有「每节点 token」显示。

**判定标准（跑什么、看到什么算完成）**：

1. `./node_modules/.bin/tsx scripts/header-progress-probe.mts` 退出码 **0**，且 6 档 DIAG 里**每档可见 token 元素数 ≥ 1**（当前实测：A=2，B/C/D=0 → 改造后 B/C/D 也应 ≥1）。
2. `./node_modules/.bin/vitest run tests/header-progress-responsive.test.ts` 全绿，且新增断言覆盖：`tokenTotal` 有值 → 各档都渲染；`tokenTotal` 缺席 / 为 0 → **不渲染**（缺失 ≠ 0）。
3. 接口实测自洽：`curl -s http://127.0.0.1:19387/dashboard/api/reqboard/session/<sid>/progress` → `data.requirement.tokenTotal` 等于**同一响应内 Σ `data.nodes[].tokens.total`**；无任何快照的需求 → 该键**缺席**（不是 0）。
4. `pnpm build:client` 退出码 0（C-12：`[verify-client] OK …`）。
5. 回归不变量不破：探针 6 档 `rowRightOverflow ≤ 0`、`docOverflow = 0`、`chartScrollX = 0`、`problems=NONE`——常显总数**不得撑破标题行**。

## 轻路径依据（为什么可以走轻档）

- 改动面小：**一个响应字段 + 一处渲染 + 对应测试**，不新增子系统、不动数据模型、无持久化、无迁移。
- 无未定决策：显示形态（窄档显总数）与口径（沿用现有「会话快照差值 + 任务执行兜底」）都已由人裁定。
- **单向升级**：一旦出现「要动快照口径」「要把子代理会话并入统计」「要重做档位模型」中任一项 → 立即停手升级为重档（子代理口径已按此裁定**移出本需求**，另立项）。

## 业务流程图

```
窗口会话 ──▶ GET /session/:id/progress
                 │
                 ├─ requirement.tokenTotal = Σ各节点（节点快照优先 / 任务执行差值兜底）
                 │        └─ 无快照 → 键缺席（不补 0）
                 └─ nodes[].tokens.total = 每节点（现状不动）
                          │
                          ▼
        会话头部流程图（.dsh-pm-cprog-inline）
                 ├─ 宽档 ≥1000px：圆点 + 节点名 + **每节点 token** + 连线 + 计数 + 累计总数
                 └─ 窄档 <1000px：节点 token 按档位隐藏，**累计总数恒在**（新增，不受档位影响）
```

## 产品定义

**是什么**：对会话头部流程图 token 展示的一次**降级策略修正**——把「窄窗口一个 token 数字都没有」改成「至少常显一个需求累计总数」。

**核心价值**：token 是长任务里唯一能回答「这活儿烧了多少」的读数。现在窄窗口下它整批消失，用户只能去详情页 Token tab 翻——而这正是用户实测反馈的痛点。

**与现状的区别**：
- 现状：`FLOW_TIERS.token = 1000`，容器 <1000px 时 `.dsh-pm-flow-token { display:none }`，token 数字**全部消失**；
- 改后：节点级 token 仍按档位降级（宽档才显），但**累计总数不参与降级**，任何宽度都能看到「这个需求累计烧了多少」。

## 用户与角色

| 角色 | 什么场景用 | 痛点（现状） |
|---|---|---|
| 看板使用者 / PM | 会话跑到一半瞥一眼标题行，想知道烧了多少 | 窗口一窄 token 全没，得点开详情翻 Token tab |
| Agent（各窗口） | 靠流程图确认「这条需求当前阶段」 | 计数在、token 不在，无法自证消耗 |
| 插件维护者 | 改档位/样式 | 档位单一源在 `FLOW_TIERS`，改展示要能回归验证 |

## 边界

- **不做**：不改 token 口径——仍是「执行会话累计快照差值 + 任务执行差值兜底」，**不**改接 DSH per-turn 用量。
- **不做**：**不**把子代理（subagent）会话消耗计进统计（已实测确认现状不计入；按人裁定移出本需求，另立项）。
- **不做**：**不**放宽/取消每节点 token 的宽度档位（节点级 token 仍只在容器 ≥1000px 显示）。

没写进上述边界的，即本次不做。

## 功能点（需求条款）

### 功能点总览

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 进度接口新增需求累计 `tokenTotal`（缺失即不发该键，不补 0） | P0 |
| FR-2 | 流程图计数旁常显累计 Token（不参与宽度档位降级） | P0 |
| FR-3 | 每节点 token 与档位行为保持不变，且新增常显不撑破标题行 | P0 |
| FR-4 | 可证伪回归：探针各档可见 token ≥1 + 单测覆盖缺失/零值语义 | P0 |

### 详细说明

**FR-1: 进度接口新增需求累计 tokenTotal**
`GET /dashboard/api/reqboard/session/:sessionId/progress` 的 `data.requirement` 新增可选字段 `tokenTotal: number`，取值口径与流程图节点**同源**：`assembleRequirementToken(target, {tasks})` 的 `totals` 四桶之和（节点快照优先，缺失用该节点任务执行差值兜底）。
语义：**> 0 才发该键**；无任何快照（总数 0）→ **键缺席**（缺失 ≠ 0，前端据此不渲染）。
判据：接口实测 `tokenTotal === Σ data.nodes[].tokens.total`；无快照需求无该键。

**FR-2: 流程图计数旁常显累计 Token**
会话头部流程图（`RequirementProgressAction`）在计数文案（`3/12`）旁新增一个 token 徽章，文案为 `🪙 <fmtTokens(tokenTotal)>`，`title` 说明口径（「需求累计 Token（各节点快照差值合计，含任务执行兜底）」）。
该元素位于 `.dsh-pm-flow` **之外**，**不受任何 `@container` 档位规则影响**：A/B/C/D 四档都恒在。
`tokenTotal` 缺席或 0 → **不渲染该元素**（不显示 `🪙 0`）。
判据：探针 6 档可见 token 元素数 ≥ 1；模型层单测：有值渲染、缺席/0 不渲染。

**FR-3: 档位与不变量不破**
每节点 token（`.dsh-pm-flow-token`）的显隐仍由 `FLOW_TIERS` 档位决定（本次**不动** `FLOW_TIERS` 数值）；新增的常显总数必须与既有不变量共存：标题行不被撑破（probe `rowRightOverflow ≤ 0`、`docOverflow = 0`）、芯片内部零滚动（`chartScrollX = 0`）、当前节点与计数恒在。
判据：探针 6 档 `problems=NONE`。

**FR-4: 可证伪回归**
① `scripts/header-progress-probe.mts` 的标本模型带上 `tokenTotal`，断言**每档可见 token 元素数 ≥ 1**（改造前 B/C/D 档为 0，此断言能红 → 能证伪）；
② `tests/header-progress-responsive.test.ts` 补模型/渲染断言：`tokenTotal` 有值 → 各档可见；缺席或 0 → 不渲染；
③ 接口层补断言：`tokenTotal` 与 Σnodes 自洽、无快照缺席。
判据：上述命令退出码 0。

## 数据契约

| 项 | 内容 |
|---|---|
| 新增字段 | `data.requirement.tokenTotal?: number`（`/session/:sessionId/progress`） |
| 类型 / 必填 | 数字；**可选**，缺席 = 无快照（不得读成 0） |
| 取值口径 | `totalTokens(assembleRequirementToken(req, {tasks}).totals)`，仅 `> 0` 时输出 |
| 兼容 | 老客户端忽略未知字段 → 行为不变；老需求无快照 → 键缺席 |
| 迁移 | 无（不落台账、不改存储 schema、不写盘） |
| 回滚 | 删除该字段与前端徽章即可，无残留 |

## 现状证据（E）

- **E-1**：接口数据完整。`curl .../session/session-97bd3bf9-…/progress` → `nodes`：需求分析 827,822 / 设计 10,901,086 / 拆分 922,042 / 实施 12,173,419（2026-10-04 本机实测）。
- **E-2**：隐藏发生在展示层。`src/client/flow-chart-model.ts:51-55` `FLOW_TIERS = { token: 1000, link: 780, label: 600 }`；`src/client/styles/board.ts:268-271` `@container (max-width: 1000px) { .dsh-pm-flow-token { display: none } }`。
- **E-3**：探针实测（真容器查询，`scripts/header-progress-probe.mts`）：视口 1280→容器 1232 **tier A，tokens=2**；视口 1024→容器 976 **tier B，tokens=0**；900→852 B，0；768→720 C，0；640→592 D，0；480→452 D，0。
- **E-4**：节点 token 是后端算好的（`src/http/routers/stages.ts:432-440` `nodeTokensOf`），前端只是按档位隐藏——补总数无需改数据采集。
- **E-5**：**总数不能用 `requirementTotalTokens`（记录上的 `tokenUsage.totals`）**。实测 `REQ-261004121649-bfa7`：record 的 `totals` = 12,650,950（= Σ draft/brainstorming/design/decomposing），**不含仍在进行的 implementing**（那 12.17M 只存在于任务执行差值兜底里）。故总数必须与节点同源走 `assembleRequirementToken(...).totals`。
- **E-6**（移出本需求，另立项）：子代理消耗**不在**统计内——pmboard 快照只读执行窗口自己的 session 投影；DSH `tokenUsage` 投影（`packages/llm/token-meter/src/usage-projection.ts`）是会话级，子代理是独立 session（`origin:"subagent"`、`delegationDepth:1`），父会话只收到无 usage 字段的 `subagent-settled` 文本通知。实测本工作区 88 个会话中 33 个为子代理会话。

## 已定决策与待裁定项

- **已定**：窄档改显「需求累计 Token 总数」，节点级 token 仍随档位降级（用户裁定）。
- **已定**：本需求只修显示；token 口径不变；**子代理口径另立项**（用户裁定）。
- **待裁定（design 阶段）**：总数徽章的措辞/位数与 `title` 文案；是否给总数加最小可读宽度（防档位 D 挤压计数）。二者都不改接口契约。

## 下一步（批准闸门）

- 本产物登记后调 `reqboard_ask_confirm(target=artifact, kind=requirement)` 请人确认；**未获批准不得进入 design**。

<!-- 本需求不做子代理口径；该项按人裁定另立项。 -->

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1 |
| FR-2 | ✅ 已接收 | t2 |
| FR-3 | ✅ 已接收 | t2、t4 |
| FR-4 | ✅ 已接收 | t4、t3 |

> 无未接收条款（4 条全部有落点）。

<!-- reqboard:marks:end -->
