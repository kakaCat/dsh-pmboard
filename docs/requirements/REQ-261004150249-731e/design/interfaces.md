---
req_id: REQ-261004150249-731e
serves: FR-1, FR-4, FR-5
---

# 接口设计（REQ-261004150249-731e）

> 三个对外入口（agent 工具 / 看板 HTTP / application 端口）+ 一张错误码表。
> 原则：**端口签名与实现同批改**，不留"参数加了但没人传"的半截状态。

## 工具：`reqboard_handoff`（新增） `serves: FR-5`

```
reqboard_handoff(
  reason?: string,            // 交接原因（进留痕评论；建议写明水位与阶段）
  mode?: 'fork' | 'create',   // 缺省 create（顶墙续作不需要旧上下文，靠断点+输入包接续）
  to_window?: string          // 指定接管窗口（缺省 = 新建）
) → {
  success: true,
  requirement_id: string,
  from_window: string,
  to_window: string,
  old_role: 'observer',
  new_role: 'owner',
  delivery: { delivered: boolean, kind: 'reqboard-handoff', reason?: string },
  context_pressure: { contextWindow?, pressureTokens?, projectedTokens?, source: string }
}
```

**授权**：调用窗口必须是该需求 owner（`canWrite(seatOf(req, wk), 'move-requirement')`），
否则 `REQBOARD_SEAT_NOT_OWNER`——与 `reqboard_move` 同判据、同错误码，不另立一套。

**自主边界（D-3）**：`decideHandoff` 返回 `fork` / `critical` 时允许 agent 自主交接；
返回 `none` / `warn` / `unknown` 而仍被调用 → 必须带 `reason` 且回执里标注
`self_initiated: false`（人明确要求的口头路径）。**不给后台自动行为**：没有定时器、没有后台扫描。

## application 端口：`WindowOpenerPort.create`（扩展签名） `serves: FR-1`

```ts
// application/ports.ts（现状：create(): Promise<OpenWindowOutcome>）
create(opts?: { cwd?: string; workspaceId?: string }): Promise<OpenWindowOutcome>
```

| 实现 | 行为 |
|---|---|
| `SessionWindowOpener.create` | 原样透传 `svc.create({ cwd })` **或** `svc.create({ workspaceId })`（DSH 二者互斥，同时给会 `gateway/bad-request`） |
| 单测替身 | 记录收到的 opts，供断言"确实带上了项目" |

**源项目解析（`resolveSourceProject`，adapters 内唯一 I/O）**：

```
① ctx.workspaceRegistry.list().find(w => w.sessionIds.includes(sourceSessionId)) → { workspaceId }
② 源会话 header.cwd（exec.agent.session.header.cwd） → { cwd }
③ 都取不到 → 返回 undefined ⇒ 调用方响亮失败（REQBOARD_OPEN_WINDOW_UNAVAILABLE）
```

**为什么 workspaceId 优先**：DSH `create({ workspaceId })` 取 `workspace.path` 建会话并 `attachSession`
（`packages/api/session-controller/src/commands.ts:119,133`）→ 侧栏直接归入该项目分组；
只给 `cwd` 时新会话不进任何 workspace，会掉进侧栏「未分组」（现状病灶之一）。

## application 端口：`CrossWindowDeliveryPort`（装配，不改形状） `serves: FR-4`

已声明（`ports.ts:1146` 所在块）且**已有实现**：`AgentDeliverer implements … CrossWindowDeliveryPort`
（`adapters/AgentDeliverer.ts:123 createMessage` / `:145 deliver`，冷会话走
`sessionController.resolveAgent` resume）。

本次只做两件事：

| 动作 | 位置 |
|---|---|
| 装配 `crossWindowDeliver: deliverer` | `src/index.ts`（`useCaseDeps` 内 `windowOpener` 旁） |
| 复用为交接底稿投递 | `HandoffOwner.ts`：`createMessage({ text, kind: 'reqboard-handoff' })` → `deliver(toWindow, msg)` |

**红线（不放宽）**：`kind` 自署且**永不为 `user`**——绝不走会话控制器的 prompt 入口（那会把来源标成人类）。

## 看板 HTTP：`POST /dashboard/api/reqboard/req/rebind`（行为修正） `serves: FR-2`

请求体与响应形状**不变**（`{ id, windowKey, reason? }` → `{ id, rebound, from, to, note? }`），
变的是**副作用**：由"只改 `sourceSessionId`"改为"经 `handoffOwner` 同时改席位"。

| 现状 | 改后 |
|---|---|
| 已有显式 `seats` 的需求：只改 `sourceSessionId` → 席位权威判新窗口**未绑定**，回执却 `rebound:true` | 席位同步：新窗口 owner、原窗口 observer → 回执与事实一致 |
| `windowKey` 不在线 | 仍拒（`onlineAgent` 前置，行为不变） |

## 错误码表 `serves: FR-1, FR-4, FR-5`

| 码 | 触发 | 台账是否改动 |
|---|---|---|
| `REQBOARD_SEAT_NOT_OWNER` | 非 owner 调用 `reqboard_handoff` / 看板改绑 | 否 |
| `REQBOARD_OPEN_WINDOW_UNAVAILABLE` | 开窗服务缺失 / 源项目解析不出（拿不到 workspaceId 与 cwd） | 否 |
| `REQBOARD_HANDOFF_TARGET_INVALID` | `to_window` 不存在、等于源窗口、或不是活窗口 | 否 |
| `REQBOARD_HANDOFF_NO_CONTEXT` | 读数缺席（`source !== 'projection'`）且无人明确要求 | 否 |
| `REQBOARD_HANDOFF_WRITE_FAILED` | 交接 mutate 失败（如并发改动导致复查不过） | 否（整条回退） |

**投递失败不是错误码**：交接已成立 → `success: true` + `delivery.delivered: false` + `reason`
（与 `reqboard_open_window` 的既有诚实降级同款）。
