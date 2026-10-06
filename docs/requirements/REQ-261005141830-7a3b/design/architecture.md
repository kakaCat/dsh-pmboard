---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 架构设计（REQ-261005141830-7a3b）

> 需求源：`requirement.md`（FR-1~FR-11）。本份定「项目身份怎么查、根从哪来、判定在哪收敛」。
> 字段契约见 `data-model.md`，签名与错误码见 `interfaces.md`，用例见 `use-cases.md`，验收见 `test-cases.md`。

## TL;DR `serves: FR-1, FR-2, FR-3`

一句话：**把"根从哪来"这一处换掉** —— 判定与定位一律从 `projectId` 起步，路径降为兜底。

- 映射链：`session → projectId → workspaceRoot`（N 个窗口 → 1 个项目；1 个项目带 1 个根）。
- **不新增收敛点**：读侧 `applyRequirementWorkspaceRoot`（12 处调用）与写侧
  `ensureWritableProjectRoot` / `assertWritableRequirementProject`（共 15 处调用）**继续是唯一入口**，
  只把「记录声明的根是多少」这一处判断换成"由 `projectId` 带出"。
- 因此本需求**不动那 27 个调用点**：这是本次架构上唯一重要的事。

## 分层与职责边界 `serves: FR-1, FR-2, FR-3`

| 层 | 放什么 | 为什么 |
|---|---|---|
| `application/internal/project-identity.ts`（新增） | 纯函数：会话→项目、项目→根、**同一项目判据** | 零 IO、可单测；application 层禁 import 宿主包（层边界门禁） |
| `application/ports.ts`（加性） | `ProjectRegistryPort` 接口声明 | 端口在 application，实现留在 adapters |
| `adapters/WorkspaceRegistryProjectPort.ts`（新增） | `workspaceRegistry.list()` 的**唯一** I/O 实现 | 与 `SessionWindowOpener.resolveSourceProject` 的 `sessionIds → workspace.id` 口径同源，**抽成一份**避免两处漂移 |
| `application/internal/support.ts`（改一处） | 根解析：`record.projectId → 项目根`，缺则回落 `record.workspaceRoot` | 既有收敛点，读写两侧共用 |
| `index.ts`（组合根） | 装配端口、把 `sessionWorkspace` 扩成 `sessionProject` | 组合根是唯一知道宿主服务名的地方 |

## 现状病灶（一次查表都没有） `serves: FR-3, FR-4, FR-5`

```
用例入口 agentIdFromExec ──▶ syncWorkspaceRootFromExec ──▶ docs.setWorkspaceRoot(本窗口 cwd)
                                                              （宿主级共享单例，last-writer-wins）
「是不是同一个项目」──▶ sameProjectRoot(a, b)   ← 只做字符串形状比较，不注入 realpath
看板扫描 ──▶ partitionByProject(records, cwd, cwd, realpathSync)
```

三条事实（均已核实）：

1. 全仓**没有 `projectId`**（`protocol.ts` 的注释写着"预留字段已删除，全仓引用 0、从未落过盘"）。
2. "同一项目"的判据是**路径字符串形状**（软链 / 相对写法 / 移动 / 复制都会裂成两个身份）。
3. 宿主**早就给了项目 id**（`workspaceRegistry` 的 `id` + `path` + `sessionIds`），但只在开窗落点用过一次。

后果：多窗口多项目并行时，根是共享可变单例、判据是不可靠的路径 ⇒ 需求与产物可能被算到错项目（R-1~R-5）。

## 目标架构：两次查表 + 两个既有收敛点 `serves: FR-1, FR-2, FR-3, FR-4`

```
【方向一】窗口 → 项目 → 根        触发者：立项 / 看板请求 / Dive 的 idle 拍 / 派席校验
   windowKey ──①查项目表(sessionIds 含它)──▶ 项目条目 { id, path, sessionIds }
                                                 ├─▶ projectId    = id    （同一次查表拿到）
                                                 └─▶ workspaceRoot = path

【方向二】需求 → 项目 → 根        触发者：读盘闸门 / 写盘守卫 / 执行链 prompt 根
   REQ id ──③取记录──▶ record.projectId ──④查项目表(id == projectId)──▶ workspaceRoot
                                                                          │
                          ┌───────────────────────────────────────────────┤
                          ▼                                               ▼
        applyRequirementWorkspaceRoot（读侧，12 处调用）      ensureWritableProjectRoot（写侧，15 处调用）
```

**关键点**：`projectId` 与 `workspaceRoot` 是**同一条项目条目上的两个字段**，一次查表同时拿到；
不存在"先查 id、再按路径反推根"这种两步映射。缺 `projectId` 时才回落记录自带路径（存量兜底）。

## 两把键：归属项目级、投递窗口级 `serves: FR-4, FR-7, FR-10`

| 动作 | 用哪把键 | 理由 |
|---|---|---|
| 归属判定（这条需求算不算我项目） | **`projectId`（项目级）** | 同项目 N 个窗口共享；窗口不同不得裂成两个项目 |
| 读 / 写 / 扫描是否处理这条记录 | **`projectId`** | 与根来源一致 |
| 起轮 / 投递 / 弹框 / 席位 | **`windowKey`（窗口级）** | 同项目两窗口若都按项目级起轮 → **重复起轮**；席位本来就按窗口 |

⇒ 本需求**不放宽起轮权**：归属变项目级，投递仍窗口级（`FR-7` 的验收 3 专门锁这条）。

## 接线表（改哪里 / 明确不改哪里） `serves: FR-5, FR-6, FR-7, FR-11`

| 模块 | 现状 | 改后 | 动调用点？ |
|---|---|---|---|
| `application/internal/support.ts` | 根 = `record.workspaceRoot` | 根 = `rootOf(record)`：有 `projectId` → 项目条目 `path`；否则回落 `workspaceRoot` | **不动**（27 处调用自动受益） |
| `domain/requirement/RequirementSummary.ts` | `SUMMARY_KEYS` 无 `projectId` | 加 `projectId` + `factsOf`/`summarize` 转出 | 不动 |
| `repositories/*`（shard / sqlite） | 只有 `workspace_root` 列 | 加 `project_id` 列与映射；filter 加 `projectId` | 不动 |
| `adapters/ArtifactSync.ts` | `partitionByProject` 比路径 | 分区键换 `projectId`（保留 `others` / `unattributed` 桶） | 局部 |
| `application/internal/knowledge-bootstrap.ts` | 去重键 = 归一路径 | 去重键 = `projectId`（无 id 回路径） | 局部 |
| `http/routers/shared.ts` + `index.ts` | `sessionWorkspace(sid) → cwd` | 扩成 `sessionProject(sid) → { projectId, root }` | 局部 |
| `application/dive/session-driver.ts` / `round-driver.ts` | 归属读共享根与路径 | 归属比 `projectId`；起轮仍看席位 / `sourceSessionId` | 局部 |
| `application/use-cases/BindSeat.ts` / `HandoffOwner.ts` | 零项目校验 | 两侧 `projectId` 校验 → 跨项目拒 | 局部 |
| `application/use-cases/ExecuteTask.ts` | 取 `deps.docs.workspaceRoot()` | 取需求项目的根 | 局部 |
| **37 处根解析调用点** | — | — | **一行不改** |

## 落地顺序（6 批，各自可验证、可回滚） `serves: FR-8, FR-9`

| 批 | 内容 | 验证 | 回滚 |
|---|---|---|---|
| B1 | 端口 + 纯函数 + 契约字段（**不接任何调用方**） | 新增单测；既有测试零变化 | 去掉装配即回原状 |
| B2 | `support.ts` 根解析换源 | `design-gate-workspace-root` + `project-scope` 回归 | 恢复一处判断 |
| B3 | 立项写 `projectId` + 未归属标注 | 新单测 + capture 路径用例 | 字段可缺省 |
| B4 | 看板 / 扫描 / 知识层 / 查询过滤 | `project-scope` + E2E | 各点独立 |
| B5 | Dive 归属 + 派席/交接校验 | 含"同项目双窗口不重复起轮"用例 | 各点独立 |
| B6 | 可观测（回执/评论/日志）+ 文档更新 | `pnpm typecheck` + wiki 自检 | 纯加性 |

## 不做的架构改造 `serves: FR-8`

- **不做 per-window 的 docs / queueRepo 实例**（那是更大的架构改造；本次只换判据与根的来源）。
- **不自铸项目 id**：项目实体就用宿主 `workspaceRegistry` 那一条（`id` + `path` + `sessionIds`）。
- **不升 `REQBOARD_SCHEMA_VERSION`**：`projectId` 是可选字段 + 读端折算（与 `seats` 同款先例）。
- **不提供跨项目派席的显式覆盖开关**（D-9 裁定：默认拒绝）。

## 风险与对策 `serves: FR-9, FR-11`

| 风险 | 对策 |
|---|---|
| 宿主注册表未装配 / 项目已删 | 一律回落记录自带路径并标注 `attributed=false`（FR-8），不阻断、不猜 |
| 静态写盘点门禁把新判定点当旁路 | B2 就把新函数登记进 `tests/project-scope.test.ts` 的名单，**不放宽门禁** |
| 同项目多窗口重复起轮 | 归属项目级、起轮窗口级（本份"两把键"节 + FR-7 验收 3） |
| 存量 56 条无 `projectId` | 不迁移；读端折算 + 标注；回滚只需去掉端口装配 |

## 变更记（相对需求文档的更正） `serves: FR-9`

- 需求文档 `requirement.md` 的查找链路一节写的是"读侧 7 处 / 写侧 30 处"（量级说法）。
  **本份以实测为准**：`applyRequirementWorkspaceRoot` 12 处调用、`ensureWritableProjectRoot` +
  `assertWritableRequirementProject` 共 15 处调用（grep 排除了定义行与 import 行）。
  其中读盘闸门那 7 处是 12 处里的子集（口径见 `docs/architecture/gate-read-root.md`）。
- 需求文档已确认（brainstorming 已落章），按平台规则**不在 implementing 阶段前重交需求文档**；
  该更正以本节留痕，实施与验收以本设计的两组数字为准。
