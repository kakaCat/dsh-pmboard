---
serves: FR-1, FR-2, FR-6, FR-8
---

# 数据模型设计：看板会话运行中指示（REQ-261004210128-283d） `serves: FR-1, FR-2, FR-6, FR-8`

> 结论先行：**不改表、不改 schema、不新增落库字段、无数据迁移**。本需求只**读**两份既有契约。

## 只读契约 A：会话运行态 `serves: FR-1`

来源：DSH 客户端会话控制器服务 `ctx.sessions.list`（`createSnapshotStore`）。

| 字段 | 类型 | 语义 | 缺失时的处理 |
|------|------|------|--------------|
| `ids` | `readonly string[]` | 会话 id 有序列表 | 不使用（本需求按 `byId` 点查） |
| `byId[sessionId].running` | `boolean` | 该会话的 Agent **是否正在执行回合**（host 侧 `agents.get(id)?.status === 'running'`，并经 `api-session/status` 实时推送） | 行缺失 / 字段缺失 / 非 `true` → 一律判「不在跑」 |

补充事实（供实施者核对，不是假设）：

- `byId` 的键是**会话 id**（`session-<uuid>`），与需求上的 `sourceSessionId` / `seats[].windowKey` **同一取值域**；
- 该 store 支持 `subscribe(fn)`；通知频率**高于**本需求关心的粒度（任意会话变化都会通知）→ 必须门控（见 `architecture.md`）；
- 侧栏会话行的转圈用的就是这个字段，判据同源。

## 只读契约 B：需求席位与来源窗口 `serves: FR-2`

来源：看板首屏 `GET /dashboard/api/reqboard/`（`/state`）下发的需求摘要（`listSummaries()` 原样）。

| 字段 | 类型 | 语义 | 缺省含义 |
|------|------|------|----------|
| `sourceSessionId` | `string?` | 立项来源窗口（= owner 会话 id）；人工建卡不填 | 无绑定窗口 |
| `seats` | `WindowSeat[]?` | 需求席位（owner / worker / observer） | **存量需求** → 读端折算为单 owner（`sourceSessionId` + `createdAt`） |

```ts
// 客户端本地最小声明（client 半不 import host 模块）
interface ClientWindowSeat { windowKey: string; role: 'owner' | 'worker' | 'observer'; joinedAt: number }
```

## 判定函数输入输出表 `serves: FR-2, FR-6`

`requirementRunning(req, isRunning)` 的真值表（`isRunning` 为逐会话判定）：

| `seats` | `sourceSessionId` | 在跑的会话 | 结论 | 理由 |
|---------|-------------------|------------|------|------|
| `[owner:a, worker:b]` | `a` | `b` | **true** | 席位权威，任一在跑即算 |
| `[owner:a, worker:b]` | `a` | 无 | false | 全部空闲 |
| 缺省 | `a` | `a` | true | 折算单 owner |
| 缺省 | `a` | `b` | false | 无关会话不影响 |
| 缺省 | 缺省 | 任意 | false | 人工建卡，无绑定 |
| `[]`（显式空数组，异常数据） | `a` | `a` | false | 显式 `seats` 为权威；空席 = 无绑定（与 host `seatsOf` 一致：有值即原样返回） |

`runningSessionIds()` 的输出：`byId` 中 `running === true` 的全部 id 的**集合**（`ReadonlySet<string>`），
服务不可得时返回 `NO_RUNNING`（同一空集实例）。

## 缺失语义 `serves: FR-6`

沿用本仓「缺失 ≠ 0」的同款纪律，但**方向相反**：这里的缺失被解释为「没有在跑」——

| 缺失项 | 为什么不报错 / 不显示「未知」 | 后果 |
|--------|------------------------------|------|
| 服务 / 列表 / 订阅能力缺失 | 旧客户端或服务未装配，不是业务失败；看板主体功能不受影响 | 无指示（静默降级） |
| 某会话不在 `byId`（未拉取 / 已删除） | 「查不到 = 不在跑」是本需求唯一不伪造的解读 | 该会话不计入 |
| `running` 字段形状异常 | 宁可漏报也不误报（误报会让人以为有窗口在干活） | 判「不在跑」 |

**禁止的近似推断**（出现即视为实现缺陷）：

- 用 `updatedAt` 距今小于阈值推断「在跑」；
- 用 `autoRun === true` 推断「在跑」（机制开着 ≠ 有回合在跑）；
- 用 `advanceLockAt` 新鲜度推断「在跑」（那是 host 侧派发锁，粒度不同）；
- 用 `tasks[].executions[].outcome === 'running'` 推断「在跑」（历史执行记录，可能是残留）。

## 是否改表 / 迁移 / 回滚 `serves: FR-8`

| 问题 | 结论 |
|------|------|
| 是否改 SQLite schema / `record.json` 结构 | **否**。零新增字段、零迁移脚本 |
| 是否需要数据回填 | **否**。运行态是瞬时读数，无历史数据概念 |
| 是否需要开关 / 灰度 | **不需要**。降级由「服务是否存在」自然决定；缺指示不影响任何既有功能 |
| 回滚路径 | 回退客户端改动并 `pnpm build:client` 重建 `lib/client.js`；无数据侧回滚（无数据变更） |
| 跨版本兼容 | 新客户端 + 旧服务端（摘要无 `seats`）→ 折算单 owner，仍可用；旧客户端 + 新服务端 → 无指示，其余零回归 |

## 持久化红线 `serves: FR-6, FR-8`

1. **运行态绝不落盘**：不进 `RequirementRecord`、不进台账、不进 `sessionStorage` / `localStorage`、
   不进任何模块级缓存副本（每次渲染实时读）。
2. **不改 RTM / 注入 / 断点**：本需求不触碰任何 `docs/requirements/<REQ>/rtm-*.yml` 或 `queue.json`。
3. **判据可回放**：给定「假投影 + 需求摘要」，判定结果**完全确定**（纯函数），
   因此测试无需真实会话即可覆盖全部真值表行。
