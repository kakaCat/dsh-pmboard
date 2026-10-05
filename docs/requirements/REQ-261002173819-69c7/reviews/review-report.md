---
req: REQ-261002173819-69c7
kind: review
title: 交付评审报告（四条修复 + 环境缺陷登记）
---

# 交付评审报告 · REQ-261002173819-69c7

> 评审对象：本需求四张实施卡（t1–t4）与收口卡（t5）的全部改动。
> 评审方式：逐卡复核（每卡 4 道子卡门：研发 → 联调 → 复核 → 测试）+ 收口后整体回读。
> 结论先说：**四条 FR 全部落地并验证；无返工项；发现 4 条边界外缺陷，已登记待另立需求。**

## 1 逐条结论（对照需求文档 FR-1..FR-4）

| 条款 | 要求 | 落地 | 证据 | 结论 |
|------|------|------|------|------|
| FR-1 | 投递失败回收推进锁 | `AdvanceChain` catch 段先 `releaseClaim` 再返回；`AdvanceStop` 增 `dispatch_failed` | 用例 D-1/D-2/D-7；实机见 evidence §6.3 | ✅ |
| FR-2 | owner 口径修正（传 id 字符串） | `dispatchOwnerOf` + `JobStartSpec.owner: string` + 调用点改造 | 用例 D-4a/D-4b/D-5/D-6；实机 `owner_missing` 分支 | ✅ |
| FR-3 | 人可把 `disarmed+idle` 接回 | 新增 `armExplicit`（只给人用），看板「继续」接上 | 用例 R-1..R-9；**生产台账实测** 277d 变 armed+active | ✅ |
| FR-4 | `clear_pause` 补渲染 | `output.render` + `clearPauseSummary`；新增全工具渲染覆盖守卫 | 用例 T-1..T-4；故障注入变红后复绿 | ✅ |

## 2 如实登记的实现选择（非缺陷，供验收对照）

| # | 卡 | 选择 | 理由 |
|---|----|------|------|
| S-1 | t2 | comment id 用仓库既有 `ids.comment()`，而非设计里的字面前缀 | 既有惯例优先，避免两处写法漂移 |
| S-2 | t2 | `owner_missing` 只进 comment，不进 `advance.history.detail` | 让 `AdvanceEvent` 只加一个取值（非失败情形不必新增枚举） |
| S-3 | t2 | 新增 `releaseNote`：锁回收自身失败时把原因追加进 `reason` | 设计未写，但符合「失败要响亮」 |
| S-4 | t1 | `dispatchOwnerOf` 只转出 dive 的 `agentIdOf`，不抄第二份 | 口径单一来源 |
| S-5 | t3 | 触发条件写成「`disarmed` 且 phase 非 active」，比设计多覆盖旧语义 `paused` | 对人按继续而言更完整 |
| S-6 | t3 | 顺带清掉已废弃的 `dive.pausedReason` | 避免与 `idle` 自相矛盾的残留字段 |
| S-7 | t4 | 渲染走 `shared.ts` 的 `renderSmart`，不自写拼接 | 与其余 20+ 工具同源 |

## 3 偏差与未覆盖项

| # | 项 | 处置 |
|---|----|------|
| D-1 | `AgentTeamsAdapter.ts:94` 也有 `owner:`，但那是**团队服务**的字段，不是 JobsPort | 不影响本需求；已在 t1 复核里写明 |
| D-2 | `ReqboardDiveManager.ts:26` 另有一份局部 `agentIdOf`（永不返回 undefined，只用于诊断与订阅键） | 未被本 FR 的 owner 口径使用；如实登记 |
| D-3 | 卡面原写「`roundsInStage` 由 0 变 1」 | **2026-10-02 经人裁定降级为「环境受限未实测」**：该子项验的是 Dive 既有投递行为（本需求未改），被绑定窗口已死 + N-1 挡住。改以需求自身判据 A4 为准（已在生产台账实测） |

## 4 评审中发现、但**不在本需求边界**的缺陷（建议另立需求）

| # | 缺陷 | 证据 |
|---|------|------|
| N-1 | **armed + 绑定窗口已死 = 静默停摆**：唤醒心跳的 `wake` 端口「受理即算成功」（`ReqboardDiveManager.ts:66` 恒返 true），投不出去也记 healthy、照刷 `lastWakeAt` | 实测：277d armed 两分钟、`roundsInStage` 恒 0，而 `lastWakeAt` 在 10:25:02 被刷新、`driverHealth=healthy` |
| N-2 | **窗口绑定可被静默改写**：`sourceSessionId` 被改过（本仓 src 无任何写入点） | `~/.dsh/dsh-reqboard.json.bak-bind`（revision 2721）里 277d = `session-8c9338a3`；现台账 = `session-afb5b804` |
| N-3 | **高频产物逐条催办 + 一次只确认一个** → 弹框量产 | `artifact-gates.ts:62-64`（仅 `design` 成组）；本需求已积累 23 个 `task_detail` + 16 个 `task_output` 待确认 |
| N-4 | 本 profile 关掉了 `@deepseek-ai/dsh-tool-jobs`，自动实施链**无法投递后台任务** | 实机错误：`background jobs unavailable: no job controller serves this agent` |

## 5 评审结论

- 四条修复**语义正确、边界清晰、证据可复核**；未发现功能性偏离与未覆盖安全边界。
- 全部改动**不破坏既有契约**：`RequirementRecord` 与 `schemaVersion` 零字段变更，看板返回键不变，旧台账可原样读取。
- 回归面**零新增失败**：全量失败文件集合在 t1 前 / t2 后 / t3 后 / t4 后四轮完全一致（49 = 49 = 49 = 49）。
- **建议通过验收**；同时把 N-1..N-4 作为后续需求输入（其中 N-1 是本需求想消灭的形态的残余，优先级最高）。
