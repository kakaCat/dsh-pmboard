---
req_id: REQ-261004150249-731e
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: backend
---

# 续作交接：上下文将满时开新会话接管原项目（落对工作区 · owner 交接 · 接续投递）

> 面向：产品、开发、测试——**写给人看**。
> 人读三件套：TL;DR + ASCII 流程图 + 功能点总览表。
> 排版纪律：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
> 名称说明：看板上的需求名是立项弹框里一次**提问**被当成名称（`交接owner是什么意思`，同类还有 `可以改成agent-dh吗`），以本文件的**范围**为准。

## TL;DR

- **是什么**：给「一个窗口干不完、上下文顶墙」这件事一条**可判定的续作路径**——在原项目里开新会话，新会话接管同一条需求（owner 交接），并把断点与上下文交接过去，接着干到完成。
- **为什么现在做**：实测这条链路三处全断——① 新会话落在宿主目录 `/Users/mac/.dsh/profiles/desktop`、不挂任何 workspace → 新窗口里任何写盘被 `PROJECT_ROOT_MISMATCH` 拒绝；② owner 不可转交 → 新窗口永远只是 worker，推不动阶段、过不了人工门；③ 跨窗口投递从未装配 → `seed_text` 恒 `delivered:false`。
- **得到什么**：`reqboard_handoff` 一条命令（或看板「改绑到本窗口」一次点击）完成「开窗 + 落对项目 + owner 交接 + 接续投递 + 留痕」，全部**原子**生效，失败不留半个交接。

## 一句话目标 + 可证伪判定标准

**目标**：当原窗口上下文将满时，能在**同一个项目**里开出一个新会话，由它**接管**同一条需求（owner），并拿到断点与节点输入包，继续推进——整个过程不需要人复述上下文。

**判定标准（跑什么、看到什么算完成）**：

1. `./node_modules/.bin/vitest run tests/handoff-owner.test.ts` 全绿（新增），且覆盖：
   - `create` 透传 `workspaceId` / `cwd`（不再回落宿主 `process.cwd()`）；
   - 交接一次 mutate 落定：新窗口 owner + 原窗口 observer + `sourceSessionId` 同步；
   - 非 owner 调用 `reqboard_handoff` → `REQBOARD_SEAT_NOT_OWNER`；
   - 交接失败（任一前置不满足）**整条不动**（不留半个交接）。
2. `npx tsx scripts/handoff-probe.mts` 退出码 **0**（新增探针，对临时台账 dry-run）：打印 `from/to/old_role/new_role/source_session` 五个读数，并断言 `seats` 与 `sourceSessionId` **指向同一个窗口**。
3. 水位分支单测：`0.75 / 0.85 / 0.90` 三个边界值与「读数缺席」分支各一条断言；**缺席时不得发生自动交接**。
4. 实机（人可复核）：在原项目里开新会话 → 侧栏落在**该项目分组**（不是「未分组」）→ 新窗口 `reqboard_status` 返回 `my_seat.role == "owner"` → 在新窗口写一个产物，**不报** `PROJECT_ROOT_MISMATCH`。
5. 回归：`pnpm build` 退出码 0；`./node_modules/.bin/vitest run tests/capture-window-bound-policy.test.ts tests/bind-seat.test.ts tests/open-window-tool.test.ts` 全绿（既有 handoff / 席位 / 开窗契约不破）。

## 档位依据（重档）

- **新决策点 ≥2**：交接授权归属（agent 自主 vs 人确认）、水位阈值、席位与 `sourceSessionId` 的口径统一。
- **动数据契约**：席位不变式（至少一个 owner）、`seats` 与 `sourceSessionId` 必须同指一窗。
- **跨子系统中枢**：会话开窗（adapters）+ 席位授权（application/internal）+ 跨窗口投递（新端口装配）+ 写盘根核验，四处需一致。
- **不可反向降级**：出现「要动进度路由语义」「要改门禁判据」即升级，不再降回轻档。

## 业务流程图

```
原窗口（owner，水位升高）
    │  contextPressure: pressureTokens / contextWindow
    ├─ < 0.75            继续干
    ├─ ≥ 0.75 (warn)     写断点 + 预告「下个边界该分叉」
    └─ ≥ 0.85 (fork)     阶段边界到达？（未到 → pendingHandoff 等边界）
             │
             ▼
      reqboard_handoff（新工具）/ 看板「改绑到本窗口」
             │
             ├─ ① 开新会话：workspaceId → 落回本项目（侧栏归组）  [FR-1]
             ├─ ② 原子交接：新窗口 owner / 原窗口 observer / sourceSessionId 同步  [FR-2]
             ├─ ③ 接续投递：断点 + 节点输入包（自署 kind，非 user）  [FR-4]
             └─ ④ 留痕评论：from → to、角色变化、原因
             │
             ▼
      新窗口（owner）────────────────────────────────────▶ 继续推进至完成
原窗口（observer）：看得见进度，不再可写
```

## 产品定义

**是什么**：一套**主动续作**能力。当某个窗口的上下文快装不下时，把它名下的需求**交接**给一个新窗口——新窗口落在同一个项目、拿到 owner 席位与断点上下文，原窗口退为旁观。

**核心价值**：长需求（brainstorming→design→decomposing→implementing→accepting）经常比一个窗口的上下文寿命更长。现状是「窗口顶墙 = 工作硬停」：这套 profile 里 DSH 自动压缩是关的（后置链日志实测 `h2-compact=skip（compaction_disabled）`），没有第二道保险。

**与现状的区别**：

| 环节 | 现状（实测） | 本需求改后 |
|---|---|---|
| 新会话落点 | 宿主目录 `/Users/mac/.dsh/profiles/desktop`，无 workspace 归属 | 源会话所属 workspace（或源 cwd），侧栏归入该项目 |
| 新窗口角色 | 只能 `worker`（推不动阶段、过不了人工门） | 可 **owner 接管**；原窗口自动降 observer |
| 断点与上下文 | `seed_text` 恒 `delivered:false`（端口未装配） | 断点 + 节点输入包投递到位，自署来源 |
| 何时分叉 | 没有判据，全靠人喊 | 水位三档 + 阶段边界优先；读数缺席不猜 |

## 用户与角色

| 角色 | 什么场景用 | 痛点（现状） |
|---|---|---|
| 用户 / PM | 窗口快满，想让人接着干完 | 说「开新会话继续」→ 新窗口落错项目、接不上活、得自己复述上下文 |
| Agent（原窗口） | 水位到顶，要体面退场 | 没有交接工具；只能当 worker 派席，等于把活挂空 |
| Agent（新窗口） | 接管同一条需求继续推进 | 写盘被 `PROJECT_ROOT_MISMATCH` 拒；不是 owner，推不动阶段 |
| 插件维护者 | 排「为什么新窗口干不了活」 | 席位看 `seats`、流程图看 `sourceSessionId`，两套口径难对齐 |

## 功能点

### 功能点总览

| 编号 | 功能（一句话概述） | 优先级 |
|------|------------------|--------|
| FR-1 | 开新会话必须落在源会话的项目（workspaceId 优先 → cwd），不再回落宿主目录 | P0 |
| FR-2 | owner 交接原子化：席位 + sourceSessionId + 留痕一次落定，失败不留半个 | P0 |
| FR-3 | 分叉判据：水位三档 + 阶段边界优先 + 读数缺席不猜 | P0 |
| FR-4 | 接续投递：装配跨窗口投递，投断点 + 节点输入包（自署 kind） | P0 |
| FR-5 | 入口 `reqboard_handoff`：owner 授权 + 自主边界（仅顶墙可自主） | P0 |
| FR-6 | 可证伪回归：单测 + 探针 + 实机复核 | P0 |

### 详细说明

**FR-1: 开新会话落在源会话的项目**
`WindowOpenerPort.create` 增参 `{ cwd?: string; workspaceId?: string }`（DSH 二者互斥）；`SessionWindowOpener.create` 原样透传给 `sessionController.create`。
解析顺序：① 源会话所属 workspaceId（DSH 按 `workspace.path` 建会话并 `attachSession` → 侧栏直接归入该项目）→ ② 源会话 `header.cwd` → ③ 两者都拿不到：**响亮失败**（`REQBOARD_OPEN_WINDOW_UNAVAILABLE`），**不再**静默落到 `defaultCwd = 宿主 process.cwd()`。
同一修复覆盖 `reqboard_capture(on_window_bound=handoff)`。
判据：新会话 `header.cwd` === 源会话 `header.cwd`；workspace 归属与源一致。

**FR-2: owner 交接原子化**
新增 `application/internal/handoff-write.ts`：在**一次 mutate** 内完成 ① 新窗口入席 `owner` ② 原窗口降 `observer` ③ `sourceSessionId` → 新窗口 ④ 留痕评论（from / to / 角色变化 / 原因）。任一前置不满足 → 整条不动。
看板入口同步修正：`applyRebind` 目前只改 `sourceSessionId`、**一个 `seats` 都不动**，对已有显式席位的需求回执 `rebound:true` 却是假的（席位权威，新窗口仍不算绑定）。改后看板「改绑到本窗口」= 一次合法接管。
不变式：交接后 `seats` 与 `sourceSessionId` **必须同指一窗**。
判据：新窗口 `openRequirementsForVia` 命中且 `seatOf(...).role === 'owner'`；原窗口 `observer`；`sourceSessionId` === 新窗口。

**FR-3: 分叉判据与时机**
读数取 `deps.session.contextPressure(windowKey)`（`contextWindow` / `pressureTokens` / `projectedTokens`）。
三档（可配 `handoff.{warn,fork,critical}`，缺省 `0.75 / 0.85 / 0.90`）：

- `warn`：写断点 + 预告，不开窗；
- `fork`：到**阶段边界**时开窗并交接；未到边界 → 记 `pendingHandoff` 等边界；
- `critical`：不等边界，立即交接（兜底）。

读数缺席（`source !== 'projection'` 或字段缺席）→ **不猜、不补 0、不自动交接**，如实说明并提示人。
定位纪律：余量在此处**是分叉判据，仍不是产物/阶段门禁**（与既有 `CAPACITY_REFERENCE_NOTE` 的边界显式区分）。
判据：三档边界值 + 缺席分支各一条单测；`critical` 覆盖 `pendingHandoff`。

**FR-4: 接续投递**
装配 `CrossWindowDeliveryPort`（`adapters/`，冷会话先 resume）。投递内容 = 断点（`interruption`）+ 节点输入包（`application/internal/node-input-package`）。
红线：消息必须**自署 kind**（如 `reqboard-handoff`），**绝不**走会把来源无条件标成 `{kind:'user'}` 的 prompt 入口。
投递失败**不回滚交接**，但必须如实回报（`delivery.delivered=false` + `reason`）并提供重试入口。
判据：单测断言 kind 非 `user`；投递失败时回执字段形状。

**FR-5: 入口 `reqboard_handoff`**
入参 `{ reason?, mode?: 'fork' | 'create', to_window? }`；返回 `{ success, requirement_id, from_window, to_window, old_role, new_role, delivery, context_pressure }`。
授权：调用窗口必须是该需求 owner（`canWrite(seat, 'move-requirement')`），否则 `REQBOARD_SEAT_NOT_OWNER`。
**自主边界**：仅「原窗口已达 `fork` / `critical` 档」允许 agent 自主交接；其余情形（并行分卡、用户口头要求）要求人确认或在看板操作。
判据：非 owner 调用被拒；自主路径仅在达档时可执行。

**FR-6: 可证伪回归**
新增 `tests/handoff-owner.test.ts` 与 `scripts/handoff-probe.mts`，断言见上文「判定标准」第 1–3 条；实机复核见第 4 条。

## 接口

| 入口 | 形态 | 变化 |
|---|---|---|
| `reqboard_handoff` | agent 工具（新增） | 一条命令完成开窗 + 交接 + 投递 + 留痕 |
| `POST /dashboard/api/reqboard/req/rebind` | 看板（已有） | **行为修正**：同步席位（当前只改 `sourceSessionId`） |
| `WindowOpenerPort.create` | application 端口（已有） | 增参 `{ cwd?, workspaceId? }` |
| `CrossWindowDeliveryPort` | application 端口（已声明未装配） | 本次装配 |

错误码：`REQBOARD_SEAT_NOT_OWNER`（非 owner 发起）、`REQBOARD_OPEN_WINDOW_UNAVAILABLE`（开窗能力不可用 / 拿不到项目根）、`REQBOARD_HANDOFF_NO_CONTEXT`（读数缺席且非人工发起）。

## 数据契约

| 字段 | 位置 | 契约 |
|---|---|---|
| `WindowSeat.role` | `RequirementRecord.seats[]` | `owner` / `worker` / `observer`；**至少一个 owner**（既有守卫保持） |
| `sourceSessionId` | `RequirementRecord` | 与 `seats` 里 owner 的 `windowKey` **必须同指一窗**（本需求新增不变式） |
| `handoff` | 插件配置（新增） | `{ warn, fork, critical }`，缺省 `0.75 / 0.85 / 0.90`；非 `0<warn<fork<critical≤1` 装配期抛错（与 `seatsMax` 同纪律） |
| `delivery` | 工具回执 | `{ delivered: boolean; kind: string; reason?: string }`；未投递时不得省略 |

兼容与回滚：存量无 `seats` 的记录经读端折算为单 owner，交接第一次把它们**物化**；回滚 = 看板再改绑一次（`applyRebind` 幂等）。

## 边界

- **不做**：并行分叉（多 worker 窗口分卡抢活）——本次只解决「顶墙续作」，并行另立项。
- **不做**：改进度路由语义（让 `session/:id/progress` 认席位）——本次靠交接**同步改写** `sourceSessionId` 对齐；两套口径合一另议。
- **不做**：`reqboard_kb` 的项目根解析错误——本窗口实测它把根解析成 `/Users/mac/.dsh/profiles/desktop`（而 `docs/knowledge/` 明明在本仓）→ 同一根因类，**另立项**。
- **不做**：把余量升级为产物/阶段门禁（它只是分叉判据）。
- **不做**：自动压缩（DSH compaction 按 profile 现状关闭，本需求不动该开关）。

没写进上述边界的，即本次不做。

## 决策记录（由 agent 拟定，供人否决）

| 编号 | 决策 | 值 |
|---|---|---|
| D-1 | owner 是否可转接 | **可**（用户裁定） |
| D-2 | 水位阈值 | `0.75 / 0.85 / 0.90`，可配 |
| D-3 | 交接授权 | agent 自主**仅限顶墙触发**；其余情形人操作/确认 |
| D-4 | 原窗口去向 | 降 `observer`（不退席，保留可见） |
| D-5 | 口径统一 | 席位权威；交接时**同步改写** `sourceSessionId` |
| D-6 | 本次范围 | 只做顶墙续作；不做并行分叉、不做 progress 认席位 |

## 批准闸门与下一步

- 下一步：**design** —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；未获批准不得进入。
- 设计阶段只写设计文档（`docs/requirements/REQ-261004150249-731e/design/`），需交齐 feature 设计集：`architecture.md`、`data-model.md`、`interfaces.md`、`test-cases.md`、`use-cases.md`、`backend.md`（`sides: backend`）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | 🔴 **未被接收** | — |
| FR-2 | 🔴 **未被接收** | — |
| FR-3 | 🔴 **未被接收** | — |
| FR-4 | 🔴 **未被接收** | — |
| FR-5 | 🔴 **未被接收** | — |
| FR-6 | 🔴 **未被接收** | — |

> 🔴 **未被接收（6 条）**：FR-1、FR-2、FR-3、FR-4、FR-5、FR-6

<!-- reqboard:marks:end -->
