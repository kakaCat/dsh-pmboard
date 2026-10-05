# 接口设计（REQ-261003215944-9e04）

> 每个接口必须标注 `serves: FR-x`（缺标注 = 孤儿接口被门禁拦）。
> 分成三层：**Agent 工具**（会进模型上下文）、**内部接口**（不进上下文）、**HTTP/客户端**（看板）。
> 原则：能不给 Agent 开的就不开——凡是"改人的意图"的能力一律不新增工具。

## Agent 工具：reqboard_open_window（新增） `serves: FR-1, FR-7, FR-8`

**用途**：用 DSH 现成的会话 fork/create 造一个新窗口，并（可选）把底稿自署 kind 投递过去。

**调用方**：Agent（本窗口）。人也可以说"开个新窗口做这个"来触发。

**接口定义**：
```ts
interface OpenWindowInput {
  /** fork = 带上下文（默认）；create = 全新空会话 */
  mode?: 'fork' | 'create'
  /** 仅 fork：切点（含）。缺省 = 最近一个完整回合 */
  atSeq?: number
  /** 子会话标题（可选；DSH 侧落地为 title 改名） */
  title?: string
  /** 是否自动投递底稿（默认取配置 openWindow.autoSeed） */
  seed?: boolean
  /** 底稿正文（可选；不传则由调用方在后续回合自行组织） */
  seedText?: string
}

interface OpenWindowOutput {
  success: boolean
  /** 新窗口码（= 新会话 id = 新 root agent id） */
  windowKey: string
  /** fork 时给出源会话 id */
  parentSessionId?: string
  /** 诚实降级说明：**不得**宣称"已打开新窗口" */
  degradedNote: string
  /** 投递结果（self-signed kind） */
  delivery?: { delivered: boolean; kind: string; reason?: string }
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `mode` | `'fork' \| 'create'` | 否 | 造窗手段 | `'fork'` |
| `atSeq` | `number` | 否 | fork 切点（含） | 最近完整回合 |
| `title` | `string` | 否 | 子会话标题 | 源会话标题 |
| `seed` | `boolean` | 否 | 是否投递底稿 | 配置 `openWindow.autoSeed` |
| `seedText` | `string` | 否 | 底稿正文 | 无 |

**返回值说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `windowKey` | `string` | 新窗口码，以 `session-` 开头，≠ 源窗口 |
| `parentSessionId` | `string?` | fork 的源会话 |
| `degradedNote` | `string` | 固定含「会话已创建，请在侧栏打开（本页可切换）」 |
| `delivery.kind` | `string` | 自署来源，如 `reqboard-open-window`（**永不为 `'user'`**） |

**异常情况**：

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | 源会话无已完成回合 / `sessionController` 不可得 | 「无法 fork（无已完成回合），可改用 mode=create」+ 原 error code |
| `REQBOARD_DRIVER_REQUIRED` | 调用者不是本窗口的 live driver | 沿用既有文案 |
| `fallback=board` | 弹框/会话通道都不可用 | 不伪造开窗，提示走看板 |

## Agent 工具：reqboard_bind（新增） `serves: FR-2, FR-3`

**用途**：给一条需求加/减席位（owner 唯一，不可被解绑）。

```ts
interface BindInput {
  /** 目标需求；缺省 = 本窗口绑定需求 */
  requirementId?: string
  /** 席位窗口；缺省 = 本窗口 */
  windowKey?: string
  role: 'worker' | 'observer'      // owner 由立项/换绑产生，不走本工具
  /** true = 解绑该席位 */
  remove?: boolean
}
interface BindOutput {
  success: boolean
  seats: WindowSeat[]              // 变更后的完整席位表
  changed: boolean                 // 幂等：重复加入 → false
}
```

**参数说明**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `requirementId` | `string` | 否 | 目标需求 | 本窗口绑定需求 |
| `windowKey` | `string` | 否 | 席位窗口 | 本窗口 |
| `role` | `'worker' \| 'observer'` | 是 | 席位角色 | 无 |
| `remove` | `boolean` | 否 | 解绑 | `false` |

**异常情况**：

| 错误码 | 触发条件 | 返回内容 |
|---|---|---|
| `REQBOARD_INVALID_INPUT` | `role` 非法 / 解绑 owner / 目标不是本窗口绑定需求 | 指明字段与合法值 |
| `REQBOARD_SEAT_LIMIT` | 超 `seats.max`（默认 8） | 当前席位表 + 上限 |
| `REQBOARD_NOT_BOUND_TO_WINDOW` | 需求不属于本窗口 | 沿用既有文案 |

**授权**（FR-3）：只有 **owner 席位**可调本工具；worker 调用 → 越权码拒绝。

## Agent 工具：reqboard_capture（修改） `serves: FR-4, FR-5`

**只加一个入参，语义不变**：

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|---|---|---|---|---|
| `onWindowBound` | `'second' \| 'handoff'` | 否 | 本窗口已绑定在飞需求时的分支 | `'second'` |

**行为变化**：

| 场景 | 改前 | 改后 |
|---|---|---|
| 本窗口已绑定需求 | 弹框前直接 `REQBOARD_WINDOW_BOUND` | `second` = 本窗口立第二条；`handoff` = 先 `reqboard_open_window` 再在新窗口立项 |
| 无人工回合（自主回合） | `REQBOARD_DIRECT_HUMAN_REQUIRED` | **完全不变**（G0 不伸缩，FR-5） |

## Agent 工具：reqboard_status（修改） `serves: FR-2`

返回体新增字段：

| 字段 | 类型 | 说明 |
|---|---|---|
| `seats` | `WindowSeat[]` | 当前席位表（读端折算后，**不是**只在返回体里算） |
| `mySeat` | `WindowSeat \| undefined` | 本窗口的席位（无 → `undefined`，不伪装 worker）。**JSON 层键名是 `my_seat`** 并随工具面惯例用 snake_case（本表写的是 TS 形状）；无席位时该键整体省略 |

## 内部接口：Dive 状态转化（不进模型上下文） `serves: FR-9, FR-10`

**用途**：把"改 `dive.*`"这件事收成一个方法，供所有入口调用。

```ts
// 域层纯函数（src/domain/dive/transition.ts）
export function transitionDive(
  prev: RequirementDive,
  input: { event: DiveEvent; now: number; reason?: string; actor: ActorKind },
): { changed: boolean; next: RequirementDive; comment?: DiveComment }

// 应用层唯一写盘入口（src/application/dive/applyDiveTransition.ts）
export async function applyDiveTransition(
  deps: DiveDeps, requirementId: string, event: DiveEvent, actor: ActorKind,
): Promise<{ changed: boolean; code?: string }>
```

**调用方与对应事件**（全部改为调它）：

| 调用方 | 事件 | 位置 |
|---|---|---|
| 立项 | `arm` | `src/application/internal/support.ts:629` |
| `reqboard_clear_pause` | `disarm-manual` | `src/application/use-cases/ClearPause.ts:74` |
| 需求回退 | `disarm-rollback` | `src/application/internal/rollback.ts:72`（actor 透传） |
| 驱动失败/达上限 | `pause-runtime` | `src/application/dive/round-driver.ts:193` |
| 自动恢复 | `recover-auto` | `src/application/internal/rearm.ts:56` |
| 看板「继续」 | `arm-explicit` | `src/http/routers/requirements.ts:557` |
| 阶段推进 | `advance-stage` | `src/application/internal/token-usage.ts:293` |
| **确认推进（新增）** | `confirm-advance` | `src/application/use-cases/AskConfirm.ts` / `ConfirmArtifact.ts` |

**异常情况**：本接口**永不抛**（调用点在事件/请求路径上）；非法事件 → `changed:false`；
弹框在途 → `confirm-advance`/`recover-auto` 零写入并返回 `code:'dialog-in-flight'`。

## HTTP：看板接口（修改） `serves: FR-11`

### `GET /dashboard/api/reqboard/state` `serves: FR-11`

| 字段 | 改前 | 改后 |
|---|---|---|
| `data.workspaceRoot` | 插件宿主 cwd（`~/.dsh/profiles/<profile>`） | **会话工作区**（`header.cwd`） |
| `data.sessionWorkspaceRoot` | 无 | 新增（与上同值，语义更明确） |
| `data.docsRootSource` | 无 | 新增：`'session' \| 'requirement' \| 'legacy-cwd'`（诊断用） |

### `POST /dashboard/api/reqboard/docs/resolve` 与 `GET /dashboard/api/reqboard/file` `serves: FR-11`

**语义不变，只换根**：判定继续走**唯一一处** `classify()`（`src/http/routers/artifacts.ts:87`），
根取"会话根 → 需求根 → legacy cwd"三段；三者都取不到时返回
`REQBOARD_DOC_ROOT_UNAVAILABLE` 且**不**拼绝对路径。

| 请求 | 改前实测 | 改后期望 |
|---|---|---|
| `{"paths":["docs/requirements/REQ-…/requirement.md"]}` | `openable:true`（靠需求级回退救） | 不变 |
| `{"paths":["README.md"]}` | `not_found` ✘ | `openable:true` |
| `{"paths":["docs/knowledge/INDEX.md"]}` | `not_found` ✘ | `openable:true` |
| `{"paths":["docs/handoff/multi-window-collaboration-draft.md"]}` | `not_found` ✘ | `openable:true` |

## 客户端接口（修改） `serves: FR-11`

```ts
// Before：无需求段 → 回落 cachedWorkspaceRoot（= 插件宿主 cwd ✘）
// After ：无需求段 → 回落 cachedSessionWorkspaceRoot；两者都无 → 原样返回相对路径 + 诊断
export function absolutizeDocPath(path: string): string
export function setDocWorkspaceContext(
  workspaceRoot: string | undefined,
  homeDir: string | undefined,
  reqRoots?: Record<string, string>,
  sessionWorkspaceRoot?: string | undefined,
): void
```

**影响范围**：`board-mount.ts`（fetchAll 传参）、`open-doc.ts`、`conversation-progress.ts`、`node-panel*.ts`、`stage-panel.ts`
（后四者只消费 `displayDocPath`/`openDocInSidebar`，签名不变，无需各自改）。

## 错误码总表 `serves: FR-1, FR-2, FR-4, FR-11`

| 错误码 | 新增/既有 | 触发 | 恢复 |
|---|---|---|---|
| `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | 新增 | fork 无完成回合 / 服务不可得 | 改 `mode:'create'` |
| `REQBOARD_SEAT_LIMIT` | 新增 | 席位超上限 | 先解绑 |
| `REQBOARD_DOC_ROOT_UNAVAILABLE` | 新增 | 三个根都取不到 | 检查会话/需求 `workspaceRoot` |
| `REQBOARD_INVALID_INPUT` | 既有 | 参数非法（含解绑 owner） | 改参数 |
| `REQBOARD_WINDOW_BOUND` | 既有（**降级**） | 仅在显式要求拒绝时出现 | 传 `onWindowBound` |
| `REQBOARD_DIRECT_HUMAN_REQUIRED` | 既有（**不变**） | 自主回合立项/拆分 | 人来说一句话 |

## 明确不新增的接口（红线） `serves: FR-5, FR-6, FR-7`

| 不做 | 理由 |
|---|---|
| `reqboard_arm` / 任何"把 disarmed 改回 armed"的工具 | 改**人的意图**只有人能发起（`rearm.ts:105`）；看板「继续」是人手动作 |
| agent 侧"自主立项/自主拆分"入口 | G0/G3 是 floor 铁律，伸缩需另立 ADR |
| `sessionController.prompt` 的任何包装 | 它把消息标 `{kind:'user'}`（`commands.ts:331-336`），等于造后门 |
| 跨窗口广播/信箱（本期） | 见 `docs/handoff/multi-window-collaboration-draft.md` 期 3，另立需求 |
