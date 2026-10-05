---
title: REQ-261001213924-1441 复核报告
type: review
requirement: REQ-261001213924-1441
created: 2026-10-02
---

# 复核报告 · 唤醒链的活性、可恢复性与可观测性

## 1. 复核结论（一句话）

八张卡的实现都成立，但**需求最初登记的前提（agent/* 被 scope 过滤器丢弃）不成立**；经人裁决保留实现、更正理由。
其余三处病因都有生产证据，且已修并各自带上防复发用例。

## 2. 前提更正（本次复核最重要的结论）

| 项 | 原登记 | 复核结论 | 依据 |
|----|--------|----------|------|
| FR-3 动机 | agent/* 事件被 `scopeTarget` 过滤器丢弃，故驱动点全网失聪 | **未获支持**。过滤器对**未打标签**的 ctx 一律放行；本插件 ctx 未打标签 | `packages/core/scope/src/index.ts:165-181`（`if (tag === undefined) return true`） |
| 替代解释 | — | 宿主插件规范要求把 per-agent 行为注册到 `agent.ctx`，**理由是生命周期归属**（agent 处置即注销；卸载插件不会自动移除 agent.ctx 注册） | `packages/preset/agent-preset/skills/cordis-plugin-development/references/practices.md:19` |
| 反证 | — | 宿主自带的 `goal-round-driver` 同样把 `agent/status` 挂在**插件 ctx** 上，且在生产可用 | `packages/goal/goal-round-driver/src/index.ts:245,269` |
| 装载面 | — | 本插件以普通 loader 条目装载，无 isolate/scope；boot 各包内无任何 scope 打标 | `~/.dsh/profiles/web/cordis.patch.yml`；`packages/boot/*/src` 无 `scopeTarget/kScope/isolate` |
| 事件面 | — | `agentCarrier(agent) = scopeTarget(agent, agent)`，且 Agent 未定义 baseFilter ⇒ 只按监听方 ctx 的 scope 标签判定 | `packages/core/agent/src/dispatch.ts:94-96` |

裁决（2026-10-02，人工确认）：**保留实现，理由改写为「生命周期归属 + 失败响亮」**，源码级反证写入 `design/architecture.md` 与 `design/interfaces.md`。

## 3. 三处**已被生产证据证实**的病因（构成本次真正的修复面）

1. **回合计数从不按阶段归零** → 撞上阶段局部上限（draft/archived 只有 1 回合）即永久暂停。
   生产证据：台账 `[Dive 回合上限] 阶段 archived 达上限 1 回合 → 终态暂停 paused/round-limit`（REQ-261001210304-0dfb）。
2. **运行时故障改写人的意图** → `disarm` 写 `activation=disarmed`，而它事实上是终态（除立项外无第二条重新武装路径）：一次异常 = 该需求永久失去自动化。
3. **teardown 也改写 activation** → 每次插件重启把所有需求打成手动模式。
   生产证据：修复前 7 条进行中需求中 5 条 disarmed；有需求创建后 3 秒即被 disarm。

## 4. 契约变更（破坏性面很小，且都有兼容）

| 变更 | 兼容策略 |
|------|----------|
| 新增 `dive.driverHealth { state, reason, since, attempts }` | 旧记录无该字段时读侧按 `phase` 推导（`isDrivableRequirement`），启动迁移补齐 |
| 新增 `dive.lastWakeAt` / `dive.migratedAt` | 纯新增字段，旧读者忽略 |
| `activation` 语义收窄为「只有人能改」 | 唯一例外：启动迁移对「误停摆（disarmed+active）」恢复为 armed |
| `phase` 降级为读侧兼容 | 不再写；旧台账继续可读 |
| `roundsInStage` 语义改为「本阶段」 | 跨阶段归零；存量启动迁移归零一次 |
| per-agent 六路订阅搬到 `agent.ctx` | 对外接口不变；`wireDiveRoundSubscriptions` 增加一个 `onAgentCreated` 回调参数（可选） |

## 5. 风险与未闭环项（如实记录，不静默降级）

1. `agent/created` 对**插件装载前就已存在**的 agent 是否补发，未在宿主机源码中确认；若宿主不补发，这些窗口需要重启一次才会被 per-agent 订阅覆盖。缓解：拿不到 `agent.ctx` 时 warn + 诊断日志 + 需求 comment 三者齐备，不会静默。
2. 全量测试 98 failed / 2974 passed（基线 97 / 2897）。本次因契约变更而红的 7 条已同步更新（dive-manager-wiring 3、dive-manager-alignment 4）并全绿；其余失败集中在与本需求无关的既有红（含 5 条 dive 相邻：`dive-session-driver-wiring` 的 FR-11 里程碑 3 条、`dive-gate-prompt` 的 TC-15 2 条，其失败路径经 `milestoneReminderFor` / `findStaleUnconfirmedArtifact`，本次未改动这些文件）。
3. `layer-boundary` 的两条长期红（`application/` 越界 import、`domain/` 内 `Date.now()`）是存量问题，本次未扩大也未修复。

## 6. 复核清单（逐项）

- [x] 每张卡都有可运行的验收命令，且命令在实施后被真实执行
- [x] 契约变更同步落到设计文档（含前提更正与实施期补充 `migratedAt`）
- [x] 运行时故障不再有任何改写 `activation` 的路径（仅启动迁移对误停摆恢复，且有注释留痕）
- [x] 「订阅成立」与「事件送达」被拆成两件事观测（[WAKE-RX] 接收证明）
- [x] 迁移幂等可验证（第二次零写入，逐字节比对）
- [ ] 真机重启后再跑一轮真实交互（用 [WAKE-RX] 实测「事件是否送达」）——留给验收人决定是否需要