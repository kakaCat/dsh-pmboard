---
serves: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-9, FR-11]
---

# 接口设计（REQ-261005141830-7a3b）

> 需求源：`requirement.md`（FR-1~FR-11）。本份定**签名、返回形状、错误码**；字段语义见 `data-model.md`。
> 全部改动**加性**：既有函数签名与对外工具入参形状不变。

## 新增端口：`ProjectRegistryPort` `serves: FR-2, FR-3`

```ts
/** 项目注册表端口（application/ports.ts）。唯一 I/O 实现在 adapters/WorkspaceRegistryProjectPort.ts。 */
export interface ProjectRegistryPort {
  /** 项目条目快照；注册表未装配 / list 非函数 / 抛错 → 返回 undefined（不抛、不伪装空数组）。 */
  list(): readonly ProjectEntry[] | undefined
}

/** 只取本项目真正要用的三个字段（结构类型，不与宿主类型耦合）。 */
export interface ProjectEntry {
  id: string           // 数字型宿主 id 已在适配器归一为字符串
  path: string         // = 该项目的 workspaceRoot；空串视同缺失
  sessionIds: string[] // 会话 → 项目 的反查键；非数组条目在适配器被跳过
}
```

| 项 | 约定 |
|---|---|
| 未装配 | `list()` 返回 `undefined` → 上层一律走路径兜底 + 标注（FR-8），**不阻断** |
| 容错 | `list` 抛错 → 适配器捕获后返回 `undefined`（与现有 `SessionWindowOpener.registry()` 同款） |
| 复用 | `sessionIds → workspace.id`、数字 id 归一的逻辑**从 `SessionWindowOpener` 抽出为共用实现**，不写第二份 |

## 纯函数签名：`application/internal/project-identity.ts` `serves: FR-1, FR-4`

```ts
/** 会话 → 项目 id（N:1）。命中返回 id；未装配 / 未命中 / 条目缺 id → undefined。 */
export function projectIdOfWindow(
  registry: readonly ProjectEntry[] | undefined,
  sessionId: string,
): string | undefined

/** 项目 id → 项目根（1:1，同一条目上的 path）。找不到条目或 path 为空 → undefined。 */
export function rootOfProject(
  registry: readonly ProjectEntry[] | undefined,
  projectId: string,
): string | undefined

/** 「是不是同一个项目」的**全仓唯一判据**。 */
export function sameProjectOf(
  a: { projectId?: string; workspaceRoot?: string } | undefined,
  b: { projectId?: string; workspaceRoot?: string } | undefined,
  realpath?: (p: string) => string,
): SameProjectVerdict

export interface SameProjectVerdict {
  same: boolean
  /** true = 判据来自项目 id；false = 走了路径兜底（调用方必须向外标注） */
  attributed: boolean
  /** 用了哪个判据：进回执 / 评论 / 日志，便于现场一眼看出 */
  by: 'project-id' | 'path-fallback'
}
```

语义钉子（顺序即语义）：

1. 两侧都有 `projectId` → 比 id 相等；**根不参与比较**（同 id 必然同根）。
2. 任一侧缺 `projectId` → 用 `sameProjectRoot(路径形状)` 比较，`attributed=false`。
3. `realpath` 解算器**可注入**（application 层禁 `node:`）：适配器注入 `realpathSync`，纯函数不 import fs。
4. 两侧都缺且无法比较 → `{ same: false, by: 'path-fallback', attributed: false }`（**不猜"是同一项目"**）。

## 根解析入口（既有函数，语义加性变更） `serves: FR-3, FR-5`

| 函数（`application/internal/support.ts`） | 现状 | 改后 |
|---|---|---|
| `applyRequirementWorkspaceRoot(deps, requirement)`（:155，12 处调用） | 根 := `requirement.workspaceRoot` | 根 := `rootOf(requirement)`：有 `projectId` → 项目条目 `path`；否则回落 `workspaceRoot` |
| `syncWorkspaceRootForRequirement(deps, exec, requirement)`（:169） | 委托上一实现 | 不变（自动受益） |
| `ensureWritableProjectRoot(deps, record, caller?)`（:344） | 判定输入 = `record.workspaceRoot` | 判定输入 = `rootOf(record)`；其余判定顺序（存在性硬校验 → 校正 → 复核 → 拒绝）逐字不变 |
| `assertWritableRequirementProject(deps, reqId, caller?)` | 同口径 | 同口径 |

```ts
/** 新增的内部单点：由记录取根（有 id 用 id，缺 id 回落路径）。 */
function rootOf(
  record: { projectId?: string; workspaceRoot?: string } | undefined,
  deps: WorkspaceRootTargets,
): { root: string; attributed: boolean; by: 'project-id' | 'path-fallback' } | undefined
```

拒绝条件**一个都不放宽**：声明根绝对但不可用 → `REQBOARD_INVALID_WORKSPACE`；
校正后仍不一致 → `REQBOARD_PROJECT_ROOT_MISMATCH`（给两个绝对路径）。

## 看板 / 组合根：会话解析端口 `serves: FR-6`

```ts
// index.ts 装配（原 sessionWorkspace 的扩展，保留旧字段以兼容老前端）
sessionProject?: (sessionId: string | undefined) => { projectId?: string; root?: string } | undefined
```

| 项 | 约定 |
|---|---|
| 命中 | 返回 `{ projectId, root }`（同一次查表拿到两值） |
| 未命中 | 返回 `undefined` → 路由回落 legacy cwd 并在响应里如实标注 `docsRootSource`（既有行为） |
| 过滤 | 看板列表按 `projectId` 过滤；`docsRootSource` 之外新增 `projectSource`（`project-id` / `path-fallback`） |

## 派席 / 交接：错误码 `serves: FR-11`

```ts
// BindSeat / HandoffOwner 入口新增校验
requireSameProject(reqRecord, targetWindowKey)  // 不通过即 reject
```

| 码 | 触发 | 文案要求 |
|---|---|---|
| `REQBOARD_CROSS_PROJECT_SEAT`（新增） | 需求 `projectId` ≠ 目标窗口 `projectId` | 必须给**两个** `projectId` 与各自根，写明"跨项目不得派席/交接" |

边界：`remove=true`（解绑）**不做**跨项目校验（只做减法，不引入新写入方）；任一侧缺 `projectId` 时走路径兜底判定并在回执标注（FR-9），不静默放行。

## 工具回执与评论字段 `serves: FR-9`

| 载体 | 新增字段 | 说明 |
|---|---|---|
| 工具回执 | `projectId`、`projectSource`（`project-id` / `path-fallback`） | 纯加性，前端不读也不报错 |
| 需求评论 | 跨项目命中 / 未归属时追加一条 | 写明两侧 `projectId`（或路径）与判据来源 |
| 日志 | `dive:` / `reqboard:` 前缀行尾加 `project=<id|unattributed>` | 现场排查不靠猜 |

## 兼容与默认值 `serves: FR-1, FR-9`

- 所有新增字段**可选**；不传 = 老行为（全量、按路径、无标注）。
- 工具入参形状不变：不新增必填参数，`reqboard_capture` 不新增第五问以外的提问。
- 端口未装配（宿主无 workspace 注册表）→ 全局降级为路径兜底 + 标注，功能不中断（FR-8）。
