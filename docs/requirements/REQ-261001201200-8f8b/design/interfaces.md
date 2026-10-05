# REQ-261001201200-8f8b 接口设计 · 装配契约、判别器与恢复入口 serves: FR-1, FR-2, FR-3, FR-4

> 本需求不新增对外工具，不改台账 schema；下面全部是插件内部契约与既有 HTTP 契约的补充。

## AgentDeliverer 构造与投递契约（改） serves: FR-1

```ts
class AgentDeliverer implements AgentDeliveryPort, DiveRoundDeliveryPort {
  constructor(resolveAgents: () => unknown, idFactory: () => string, plugin: string)

  createRoundMessage(params: {
    requirementId: string; revision: number; round: number; text: string
  }): { message: unknown; messageId: string }

  deliverMessage(windowKey: string, message: unknown): { delivered: boolean; reason?: string }
}
```

| 项 | 契约 |
|----|------|
| `resolveAgents` | 惰性取 agents 服务；取不到 → 投递返回 delivered=false（不抛） |
| `idFactory` | 必填且必须是函数；构造期若传入非函数（如误传 {plugin}）→ **立即抛 TypeError**，把装配错误暴露在启动期 |
| `plugin` | 消息署名，写入 source.plugin |
| `createRoundMessage` | 纯构造，不 IO；产出带 source.kind=dive 的回合消息 |
| `deliverMessage` | 三态返回、**永不抛**（既有契约逐字保留） |

**错误语义**：构造错误响亮（启动期抛）；投递错误安静降级（返回 delivered=false + reason）。二者严格分开——修前的 bug 正是把装配错误拖到了运行期并被吞掉。

## CaptureRuntimeDeps（组合根入参，改） serves: FR-1

```ts
export interface CaptureRuntimeDeps {
  plugin: string
  getAgents: () => unknown
  idFactory?: () => string   // 新增：缺省回落到 newCommentId()（protocol 既有导出）
}
```

| 字段 | 类型 | 必填 | 缺省 | 说明 |
|------|------|------|------|------|
| `idFactory` | `() => string` | 否 | `newCommentId()` | 消息 id 工厂；仅用于消息 id，**不入台账** |
| | | | | 传了但不是函数 → 由 AgentDeliverer 构造期抛出 |

## round-state 判别器（新增，纯函数） serves: FR-4

```ts
/** 是否「因基础设施原因被误解除武装」——可自动恢复。零 IO、无副作用。 */
export function isRecoverableDisarm(req: RequirementRecord | undefined): boolean
// 真值条件：req.dive.activation === "disarmed" 且 req.dive.phase === "active"
```

判别矩阵（用**既有字段**区分，不新增字段）：

| activation | phase | 语义 | 可自动恢复 |
|-----------|-------|------|-----------|
| armed | active | 自动续跑启用中 | 不适用 |
| disarmed | active | 驱动失败 / 检查点失败 / 投递失败 / agent 错误 / teardown 遗留 → **误停摆** | 是（FR-4） |
| disarmed | idle | 人主动 clear_pause → 手动模式 | 否 |
| 任意 | paused | 终态暂停（round-limit / aborted） | 否（需人 clear_pause） |

## rearmIfRecoverable（新增，唯一恢复写入口） serves: FR-4

```ts
export interface RearmDeps { repo: ReqboardRepository; now: () => number }

/** 可恢复才写；返回是否真的重新武装。幂等：写回后 activation=armed，二次调用即 false。 */
export async function rearmIfRecoverable(
  deps: RearmDeps, requirementId: string,
  trigger: "requirement-moved" | "board-resume",
): Promise<boolean>
```

| 项 | 契约 |
|----|------|
| 写入字段 | `dive.activation = "armed"`、`dive.lastActiveAt = now`、`version += 1`、`updatedAt = now` |
| 写不写 comment | 写：`[Dive 自动恢复] 检测到误停摆（activation=disarmed, phase=active），已重新武装（触发：<trigger>）` |
| 不满足条件 | 直接返回 false，**零写入**（不产生无意义台账噪声） |
| 调用点 | ① `round-driver.onRequirementMoved`（自动恢复点）；② `POST /req/autorun` 且 on=true（人显式表达要继续） |
| 幂等 | 是（条件写；已 armed 则不写） |

## disarm 留痕（改） serves: FR-3

```ts
function disarm(state: DriverState, reason: string): void   // 签名不变
```

| 项 | 契约 |
|----|------|
| comment 形状 | 沿用既有 CommentRecord：id 形如 `c-dive-disarm-<now>`、createdBy = system |
| comment 正文 | `[Dive] 已解除武装（手动模式）：<reason>`，reason 取既有 disarm 原因（driver-failed / checkpoint-failed / queue-failed / agent-error / max-tokens / aborted / prompt-rejected / teardown） |
| 何时不写 | `reason === "teardown"` 时不写（插件正常收尾，不算停摆） |
| 时序纪律 | 与既有 disarm 写同样 fire-and-forget + track()，**不 await**、不阻塞驱动链 |

## HTTP 契约（不改形状，只补行为） serves: FR-4

`POST /dashboard/api/reqboard/req/autorun`（既有）：body `{ id, on, reason }`；`on=true` 时在置 autoRun 之后额外尝试一次 `rearmIfRecoverable(..., "board-resume")`，返回体形状不变（仍为需求记录 + 可选 advanceNote）。

## 兼容性 serves: FR-1, FR-3, FR-4

- **对外零破坏**：不新增工具、不改工具入参出参、不改 HTTP 返回形状、不改台账字段。
- **未传 idFactory 的旧调用方**：走缺省工厂，行为不变。
- **已 disarmed 的存量需求**：不批量重写；由恢复入口按事件触发。
- **回滚**：还原 3 个文件的改动即可；无数据迁移、无 schema 变更，回滚后行为与修前逐字一致。
