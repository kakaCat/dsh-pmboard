---
req_id: REQ-261004150249-731e
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 架构设计（REQ-261004150249-731e）

> feature 重档。纪律：**未配置就是现状**——没配 `handoff` 阈值、没到水位、没人调 `reqboard_handoff` 时，
> 开窗 / 席位 / 投递 / 写盘根四处行为与改造前**逐字不变**（由既有 open-window / bind-seat / capture 用例守住）。

## 目标与总体方案 `serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6`

一句话（可证伪）：**上下文将满时，一条命令就能把需求交接给原项目里的新窗口，且新窗口当场可写、可推进**——
判据是「新窗口 `my_seat.role == owner` 且写产物不报 `PROJECT_ROOT_MISMATCH`」。

方案分三块，各自独立可关：

```
  ① 开窗落点（FR-1）              ② 交接写（FR-2/FR-5）              ③ 判据与投递（FR-3/FR-4）
 ┌──────────────────────┐   ┌───────────────────────────┐   ┌────────────────────────────┐
 │ resolveSourceProject │   │ handoffOwner（一次 mutate）│   │ handoffPolicy（纯函数）     │
 │  workspaceRegistry   │──▶│  新窗 owner / 旧窗 observer │──▶│  pressure 三档 → 动作       │
 │   → workspaceId      │   │  sourceSessionId 同步       │   │ crossWindowDeliver 投断点   │
 │   → cwd（兜底）      │   │  留痕评论（from/to/why）    │   │  + 节点输入包               │
 └──────────────────────┘   └───────────────────────────┘   └────────────────────────────┘
          │                              │                                │
          ▼                              ▼                                ▼
   sessionController.create     RequirementRecord（seats+sourceSessionId）   AgentDeliverer.deliver
```

**为什么三块分开**：开窗落点是 DSH 适配问题（FR-1 修完即使不交接也有价值）；交接写是台账不变式问题；
判据是策略问题（阈值可能调、读数可能缺席）。混在一个用例里会让"读数缺席"这种正常情况也得回滚一次交接。

## 模块改动地图 `serves: FR-1, FR-2, FR-3, FR-4, FR-5`

| 文件 | 改动 | 服务 FR |
|---|---|---|
| `src/adapters/SessionWindowOpener.ts` | `create(opts?: { cwd?, workspaceId? })` 透传 DSH `sessionController.create` | FR-1 |
| `src/application/ports.ts` | `WindowOpenerPort.create` 签名扩展；`ContextPressureSnapshot` 复用（不新增类型） | FR-1, FR-3 |
| `src/application/use-cases/OpenWindow.ts` | `mode=create` 时解析源项目并带上；解析失败**响亮失败** | FR-1 |
| `src/application/use-cases/CaptureRequirement.ts` | handoff 分支同样带上源项目（`opener.create()` → 带参） | FR-1 |
| `src/application/internal/handoff-write.ts`（新增） | `handoffOwner()`：席位 + `sourceSessionId` + 留痕，一次 mutate | FR-2 |
| `src/application/internal/binding-write.ts` | `applyRebind` 同步席位（看板改绑 = 一次合法接管） | FR-2 |
| `src/application/internal/handoff-policy.ts`（新增） | `decideHandoff()` 纯函数：pressure → `none/warn/fork/critical` | FR-3 |
| `src/application/use-cases/HandoffOwner.ts`（新增） | 用例编排：开窗 → 交接 → 投递 → 回执 | FR-1,2,4,5 |
| `src/tools/HandoffTool/`（新增） | `reqboard_handoff` 薄壳 | FR-5 |
| `src/plugin-config.ts` | `handoff: { warn, fork, critical }` 解析（非法装配期抛错） | FR-3 |
| `src/index.ts` | 装配 `crossWindowDeliver: deliverer` + `workspaceRegistry` inject + 注册工具 | FR-1,4,5 |

**关键发现（本次设计的事实基础）**：`AgentDeliverer` **已经**实现了 `CrossWindowDeliveryPort`
（`createMessage` / `deliver`，含冷会话 resume，见 `adapters/AgentDeliverer.ts:123,145`），
只是 `useCaseDeps.crossWindowDeliver` 从未被赋值（`ports.ts:1146` 是唯一出现处）——
所以 FR-4 是**一行装配**，不是新写一个适配器。

## 交接时序（五步，全在一个工具调用内） `serves: FR-1, FR-2, FR-4, FR-5`

```
agent/人 ──▶ reqboard_handoff
   │
   ├─ 0 授权：调用窗口在该需求上是 owner（canWrite(seat,'move-requirement')）
   ├─ 1 开窗：resolveSourceProject(源会话) → create({ workspaceId | cwd })
   │        失败 → REQBOARD_OPEN_WINDOW_UNAVAILABLE（不改台账）
   ├─ 2 交接：handoffOwner（一次 mutate：seats + sourceSessionId + 留痕）
   │        失败 → 整条不动（不留半个交接）
   ├─ 3 投递：断点 + 节点输入包 → crossWindowDeliver.deliver
   │        失败 → 交接**成立**，回执如实标 delivered:false + reason
   └─ 4 回执：from/to/old_role/new_role/delivery/context_pressure
```

**顺序纪律**：先开窗后交接——开窗失败时台账零改动；先交接后投递——投递失败不回滚（人已在场，重试成本低）。

## 分层与纪律 `serves: FR-2, FR-3`

- **C-01 层边界**：`handoff-policy`（纯函数，只吃 `ContextPressureSnapshot`）与 `handoff-write`
  （只吃 `RequirementRecord` 草稿）都放 `application/internal`，**不 import `node:` / 不 import DSH**；
  `workspaceRegistry` 的读取只发生在 `SessionWindowOpener`（adapters，唯一 I/O 实现）。
- **C-02 单文件 ≤400 行**：`HandoffOwner.ts` 只做编排；判定在 `handoff-policy`、写在 `handoff-write`，
  三处都在 400 行内留足余量。
- **C-06 产物闸门**：交接**不触碰**阶段与产物确认状态——它只换人，不推进流水线。

## 不变量 `serves: FR-2`

| 不变量 | 谁守 | 违反症状 |
|---|---|---|
| 任一记录**至少一个 owner** | `seatsOf` 折算 + `BindSeat` 既有守卫 + `handoffOwner` 前置校验 | 记录对所有人不可见也不可写 |
| `seats` 里的 owner 与 `sourceSessionId` **同指一窗** | `handoffOwner`（本需求新增）；`applyRebind` 修正后同理 | 席位权威说 A、流程图锚点说 B |
| 交接前后该需求**恰好一个 owner** | `handoffOwner` 内一次 mutate 内完成降级与升级 | 两个窗口都自称 owner |

## 兼容与回滚 `serves: FR-1, FR-2`

- **存量记录**（无 `seats`）：读端折算为单 owner；第一次交接把它**物化**成显式两条（owner=新窗、observer=旧窗）。
- **未配置 `handoff`**：阈值取缺省 `0.75/0.85/0.90`；`handoffPolicy` 只在显式调用或达档时生效，
  不存在后台自动行为 → 不配置也**不会**发生任何自动开窗。
- **回滚**：看板「改绑到本窗口」再指回原窗口即可（`applyRebind` 幂等）；代码回滚无需数据迁移
  （物化的 `seats` 与折算语义等价）。

## 规范自证 `serves: FR-6`

```bash
npx vitest run tests/layer-boundary.test.ts      # C-01
npx vitest run tests/size-budget.test.ts         # C-02
npx vitest run tests/content-gates.test.ts       # C-07（设计章节 serves 标注）
npx vitest run tests/acceptance-criteria.test.ts # C-08
npx tsc --noEmit                                 # C-15
```
