---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11]
---

# 后端（host 侧）设计（REQ-261005141830-7a3b）

> 需求源：`requirement.md`（FR-1~FR-11）；`sides: [backend]`（本需求不改客户端）。
> 架构见 `architecture.md`，字段见 `data-model.md`，签名与错误码见 `interfaces.md`。

## 文件级改动清单 `serves: FR-1, FR-2, FR-3, FR-5`

| 文件 | 改动 | 类型 |
|---|---|---|
| `src/application/ports.ts` | 新增 `ProjectRegistryPort` / `ProjectEntry` 声明 | 修改（加性） |
| `src/application/internal/project-identity.ts` | `projectIdOfWindow` / `rootOfProject` / `sameProjectOf` | **新增** |
| `src/adapters/WorkspaceRegistryProjectPort.ts` | `workspaceRegistry.list()` → `ProjectEntry[]`（数字 id 归一、坏条目跳过、抛错吞掉返回 undefined） | **新增** |
| `src/adapters/SessionWindowOpener.ts` | `sessionIds → id` 的解析抽成共用实现（改用同一份） | 修改 |
| `src/application/internal/support.ts` | 新增内部 `rootOf(record, deps)`；`applyRequirementWorkspaceRoot` / `ensureWritableProjectRoot` / `assertWritableRequirementProject` 的"根从哪来"换成它 | 修改（语义加性） |
| `src/application/use-cases/CreateRequirement.ts` / `CaptureRequirement.ts` | 立项写入 `projectId`；未归属时写评论标注 | 修改 |
| `src/domain/requirement/RequirementSummary.ts` | `SUMMARY_KEYS` 加 `projectId`；`factsOf` / `summarize` 转出 | 修改 |
| `src/repositories/ShardedRequirementWriter.ts` / `SqliteRequirementWriter.ts` / `sqliteRows.ts` / `sqliteSchema.ts` | `project_id` 列与映射；老库幂等 `ALTER TABLE ADD COLUMN` | 修改 |
| `src/repositories/ShardedRequirementStore.ts` / `SqliteRequirementStore.ts` | `filter.projectId` 过滤分支 | 修改 |
| `src/adapters/ArtifactSync.ts` | `partitionByProject` 的分区键换 `projectId`（保留 `others` / `unattributed` 桶） | 修改 |
| `src/application/internal/knowledge-bootstrap.ts` | 自举去重键换 `projectId`（无 id 回路径） | 修改 |
| `src/application/dive/session-driver.ts`（+ `round-driver.ts` 取需求处） | idle 拍解析窗口 `projectId` 并比对归属；起轮仍按席位 / `sourceSessionId` | 修改 |
| `src/application/use-cases/BindSeat.ts` / `HandoffOwner.ts` | 两侧 `projectId` 校验 → `REQBOARD_CROSS_PROJECT_SEAT` | 修改 |
| `src/application/use-cases/ExecuteTask.ts` | 子代理 prompt 根 / 凭证校验根改取需求项目的根 | 修改 |
| `src/index.ts` | 装配 `ProjectRegistryProjectPort`；`sessionWorkspace` 扩成 `sessionProject` | 修改 |
| `src/http/routers/shared.ts` / `requirements.ts` | 读根解析改用 `sessionProject`；响应加 `projectSource` | 修改 |
| `src/client/**` | **不动**（本需求 sides=[backend]；回执多出的字段前端不读） | — |

## 装配与端口注入 `serves: FR-2, FR-6`

- 端口按**惰性解析器**注入（与 `sessionController`、`workspaceRegistry` 现值取法一致）：
  装配期拿不到 ≠ 永远拿不到 ⇒ 每次调用现取，不在构造期缓存。
- `index.ts` 已有一处 `inject(['workspaceRegistry'], …)`（开窗用）——**复用同一个服务句柄**，
  不再单独 inject 第二次（避免两个解析器各自漂移）。
- 未装配时的行为：`list()` 返回 `undefined` ⇒ 判定走路径兜底 + 标注；**不抛、不阻断**。

## 并发与执行时序 `serves: FR-5, FR-7`

```
窗口 A（P1）写入                          窗口 B（P2）读状态
   │                                        │
   ├─ 按记录取根 rootOf(record): P1          ├─ syncWorkspaceRootFromExec → 单例根 := P2
   │                                        │
   ├─ applyWorkspaceRoot(deps, P1)  ← 校正回自己
   ├─ 复核：单例根 == P1 ?  ✓
   └─ 写盘落在 P1
```

- 共享单例的"被邻居改走"是既有事实，本需求**不消灭单例**：靠"按记录取根 + 写前校正 + 复核"兜住。
- 同项目多窗口并发时，两者的根本来就相同 ⇒ 校正互不伤害（这正是按项目判定的收益）。
- Dive 的 idle 拍是**同步判定**：`projectId` 解析必须走同步快照（端口 `list()` 同步返回），
  不得引入 async 到判定路径上（否则 drive 拍的时序契约被破坏）。

## 错误处理与可观测 `serves: FR-9, FR-11`

| 情形 | 处理 |
|---|---|
| 注册表未装配 / `list` 抛错 | 返回 `undefined` → 路径兜底 + 标注；日志 `project=unattributed` |
| 记录有 `projectId` 但项目条目已删 | 回落记录 `workspaceRoot`，标注来源为兜底；写侧照旧复核 |
| 两侧 `projectId` 不等（派席 / 交接） | `REQBOARD_CROSS_PROJECT_SEAT`，文案给两个 id 与各自根 |
| 跨项目命中（读 / 扫描 / 起轮） | 跳过 + 留痕（需求评论或 `[dive-diag]` 行），**不静默** |
| 声明根不可用 / 校正失效 | 既有两码不变：`REQBOARD_INVALID_WORKSPACE` / `REQBOARD_PROJECT_ROOT_MISMATCH` |

## 性能与体量 `serves: FR-6`

- 项目表 `list()`：O(项目数) 内存遍历，个位到十位级；**无每请求 I/O**。
- 同步判定路径上只多一次"数组内查 `sessionIds` 包含"（与既有 `resolveSourceProject` 同量级）。
- 台账查询加 `projectId` 过滤不新增索引需求（现有实现是内存过滤 + 分片列表）。
- 摘要多一个短字符串字段 ⇒ 写放大可忽略（不触 `writeAmplificationWarnBytes`）。

## 静态门禁与旁路防护 `serves: FR-5`

- `tests/project-scope.test.ts` 的写盘点扫描名单（`PROTECTED_WRITERS`）**同步更新**：
  新判定函数登记入库，让"新出现未保护写盘点即红"这条门禁继续有效——**不放宽、不豁免**。
- `tests/design-gate-workspace-root.test.ts` 的"读盘前缺根校正"静态断言必须排除注释行
  （既有教训）：新增调用点要么走收敛入口，要么被点名。
- 层边界：`application/` 不 import `node:` 与宿主包 ⇒ `realpath` 与注册表访问一律经端口注入
  （`tests/layer-boundary.test.ts` 兜底）。
