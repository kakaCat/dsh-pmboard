---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8
---

# 拆分计划：看板会话运行中指示（REQ-261004210128-283d）

> 目标：把「会话正在跑」这个既有信号接到看板泳道卡与列表行上——**纯客户端**，零 host 改动、零数据模型改动。
> 做法：一个读数/映射单点 + 一个渲染单点 + 一处挂载接线（订阅与重绘门控），其余全是透传参数。
> 本计划与 `design/` 一套五份文档逐条一致；本阶段不二次创作设计。

## 1. 改动盘点（对照设计）

**新增（2 个文件）**

| 文件 | 内容 | 设计出处 |
|------|------|----------|
| `src/client/session-running.ts` | `NO_RUNNING` / `isSessionRunning` / `runningSessionIds` / `subscribeSessionRunning` / `requirementRunning`（鸭子探测，零 host import） | interfaces.md §新增模块 |
| `tests/client-session-running.test.ts` | TC-01～TC-07 + 真值表 | test-cases.md §单测用例 |

**修改（7 个文件）**

| 文件 | 改什么 | 设计出处 |
|------|--------|----------|
| `src/client/session-jump.ts` | `SessionsServiceFace.list` 类型补可选 `subscribe`（一行类型放宽，行为不变） | architecture.md §模块与依赖方向 |
| `src/client/types.ts` | `RequirementSummary` / `RequirementRecord` 补 `seats?: ClientWindowSeat[]`（**只补声明**） | data-model.md §只读契约 B |
| `src/client/render/dom-utils.ts` | 新增 `renderRunningDot(running)`（唯一渲染单点） | interfaces.md §新增渲染单点 |
| `src/client/views/artifacts.ts` | `renderReqCard` 末尾加可选 `running` 参数并渲染指示 | interfaces.md §修改三处签名 |
| `src/client/views/board.ts` | `buildBoard` / `renderListCard` 透传 `running`；两处调用 `requirementRunning` | 同上 |
| `src/client/board-mount.ts` | 订阅 + 「相关运行集合变化」门控 + `dispose` 退订 | interfaces.md §订阅接线 |
| `src/client/styles/board.ts` | 指示样式 + `prefers-reduced-motion` 分支（分片归属章在场） | architecture.md §样式与主题 |

**删除**：无。

**明确不动**：`src/http/**`、`src/repositories/**`、`src/application/**`、任何 `reqboard_*` 工具、台账字段、SSE 帧。

## 2. 任务表

| key | 标题（业务） | phase | side | depends_on | files | anchors | chars | 容量(DU) |
|-----|--------------|-------|------|------------|-------|---------|-------|----------|
| t1 | 接上会话运行态读数，判定「哪条需求在跑」 | implement | frontend | — | 3 | 4 | 1400 | 5.70 |
| t2 | 泳道卡与列表行显示运行中转圈 | ui | frontend | t1 | 4 | 4 | 1600 | 6.80 |
| t3 | 让转圈随会话实时亮灭，且不误触发重绘 | ui | frontend | t1, t2 | 1 | 3 | 1000 | 3.00 |
| t4 | 为运行中指示补齐自动化用例 | test | frontend | t1, t2, t3 | 3 | 8 | 1800 | 7.90 |
| t5 | 跑通构建 / 类型 / 全量回归并留下人工证据 | review | frontend | t4 | 1 | 5 | 1200 | 4.10 |

**卡内明细**

**key**: t1
- **在做什么**：新建运行态读数与映射单点，供渲染层与挂载层调用。
- **implementation**：新建 `src/client/session-running.ts`：`isSessionRunning`（`ctx.sessions.list` 的 `byId[sid].running === true`，服务缺失/行缺失/形状异常一律 `false`）、`runningSessionIds`（服务不可得返回 `NO_RUNNING`）、`subscribeSessionRunning`（缺 `subscribe` 时返回 no-op 退订）、`requirementRunning`（`seats` 权威 ∪ `sourceSessionId` 折算）；改 `src/client/session-jump.ts` 的 `SessionsServiceFace.list` 类型补可选 `subscribe`；改 `src/client/types.ts` 补 `ClientWindowSeat` 与 `seats?` 声明。**不抛错、不打 error 日志**。
- **acceptance**：`pnpm typecheck` 对上述文件零错误；`node -e` 不可覆盖时由 t4 的用例证明——假投影 `byId={a:{running:true},b:{running:false}}` 下 `isSessionRunning('a')===true`、`('b')===false`；`sessions` 缺失时三个导出函数均不抛且返回 `false` / 空集 / 可安全调用的 no-op。

**key**: t2
- **在做什么**：让泳道卡与列表行显示同一个转圈指示。
- **implementation**：改 `src/client/render/dom-utils.ts` 新增 `renderRunningDot(running)`（`false → ''`；`true → span.dsh-pm-running[data-running="true"][role=img][aria-label]` + 内联 SVG）；改 `src/client/views/artifacts.ts` 的 `renderReqCard` 在窗口 chip 行渲染指示；改 `src/client/views/board.ts` 的 `buildBoard` / `renderListCard` 在标题列渲染指示，运行判定统一走 `requirementRunning`；改 `src/client/styles/board.ts` 加样式（`currentColor` + 25% track + 呼吸 arc，1.5s）与 `@media (prefers-reduced-motion: reduce)` 静态环。三处新参数一律 `= NO_RUNNING` 缺省。
- **acceptance**：`npx vitest run tests/client-view.test.ts` 通过——传 `running=new Set(['s-a'])` 时输出含 `data-running="true"` 恰 1 次且 `aria-label` 非空；**省略** `running` 时输出不含 `data-running` 且与改动前基线逐字节一致；同输入两次调用结果逐字节相等。

**key**: t3
- **在做什么**：把实时性与重绘门控接上，避免别的窗口一动就整块重绘。
- **implementation**：改 `src/client/board-mount.ts`：挂载时 `unsubRunning = subscribeSessionRunning(...)`；回调内计算「当前 state 中需求的相关会话集合 ∩ runningSessionIds()」，与 `lastRunning` 做集合相等比较，变化才 `scheduleRender()`；每次 `render()` 后更新 `lastRunning`；`dispose()` 退订并清句柄。
- **acceptance**：`npx vitest run tests/board-attach.test.ts` 通过——无关会话切换 `running` 时渲染计数不变；相关会话切换时计数 +1 且输出与状态一致；`dispose()` 后再通知不触发渲染。

**key**: t4
- **在做什么**：把设计里的判定标准固化成可跑的用例。
- **implementation**：新建 `tests/client-session-running.test.ts`；扩 `tests/client-view.test.ts` 与 `tests/board-attach.test.ts`。覆盖 TC-01～TC-14：真值表（席位权威 / 折算单 owner / 人工建卡）、降级（服务缺失 / 列表缺失 / 无 `subscribe` / 行缺失）、订阅与退订幂等、渲染幂等与省略参数零回归、重绘门控。假投影范式沿用既有会话跳转用例的注入写法（只读参考，不修改该文件）。
- **acceptance**：`npx vitest run tests/client-session-running.test.ts tests/client-view.test.ts tests/board-attach.test.ts` 全绿，且 TC-01～TC-14 每条都能在用例名中定位。

**key**: t5
- **在做什么**：跑通三道基线门禁，并在真实浏览器里留下可见证据。
- **implementation**：跑 `pnpm typecheck`（C-15）、`pnpm build:client`（C-12，产物 `lib/client.js`）、`pnpm test`（C-14）并与基线比对；人工浏览器验证 TC-11a～TC-11e（泳道出圈 / 列表出圈 / 回合结束自动消失 / 减少动效下静态环 / 暗色可辨），截图归档到 `docs/requirements/REQ-261004210128-283d/evidence/`。
- **acceptance**：`pnpm typecheck` 退出码 0 且错误数 ≤223；`pnpm build:client` 输出 `[verify-client] OK`；`pnpm test` 失败数 ≤106；证据目录含 5 张截图（文件名含 TC 编号）。

## 3. 批次与依赖

```
批次 1：t1                  （契约与读数单点，无依赖）
批次 2：t2 ──▶ t3           （先能渲染，再把实时性与门控接上）
批次 3：t4                  （用例固化前三批的行为）
批次 4：t5                  （构建 / 类型 / 全量回归 + 人工证据）
```

依赖只向后引用（无前向引用）；每张卡都能独立验收（零会话历史的新窗口只凭卡片即可开工）。

## 4. 需求条款 ↔ 接收任务（覆盖对照）

| 需求条款 | 接收任务 | 说明 |
|----------|----------|------|
| FR-1 | t1, t4 | 运行态读数单点（纯客户端） |
| FR-2 | t1, t4 | 席位权威 ∪ 来源窗口折算 |
| FR-3 | t2, t5 | 泳道卡指示（+ 人工浏览器证据） |
| FR-4 | t2, t4 | 列表行指示（与泳道共用渲染单点） |
| FR-5 | t3, t4 | 实时订阅 + 重绘门控 |
| FR-6 | t1, t4 | 诚实降级、不伪造 |
| FR-7 | t2, t5 | 动效偏好与无障碍（+ 人工证据） |
| FR-8 | t3, t4, t5 | 生命周期、零回归、构建与类型基线 |

## 5. 容量核算（口径见 `src/domain/limits.ts`，此处只列算出的值）

`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 16 DU。

| key | 算式 | 结果 | 是否超容量 |
|-----|------|------|------------|
| t1 | 3 + 2.0 + 0.70 | 5.70 | 否 |
| t2 | 4 + 2.0 + 0.80 | 6.80 | 否 |
| t3 | 1 + 1.5 + 0.50 | 3.00 | 否 |
| t4 | 3 + 4.0 + 0.90 | 7.90 | 否 |
| t5 | 1 + 2.5 + 0.60 | 4.10 | 否 |

**无超容量卡**，故无「⚠️超容量(建议N批)」标记。

## 6. 迁移与兼容（本需求无数据迁移，单列说明）

- **无 schema / 台账改动**：不新增字段、不写迁移脚本、不回填；运行态只读不落盘。
- **旧调用方零改动**：三处渲染签名新参数均带默认值（`NO_RUNNING`），省略即今天的行为。
- **跨版本**：新客户端 + 旧服务端（摘要无 `seats`）→ 折算单 owner；旧客户端 + 新服务端 → 无指示，其余零回归。
- **回滚**：回退本次客户端改动并 `pnpm build:client` 重建 `lib/client.js`；无数据侧回滚。

## 7. 批准闸门

本计划经人批准后自动落库任务卡并进入实施；未获批准不得落库（`reqboard_decompose` 代码级拒绝）。
