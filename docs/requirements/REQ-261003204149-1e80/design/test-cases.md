---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
---

# 测试策略 · REQ-261003204149-1e80 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

> 一句话：**每条 FR 都要有"撤掉修复就变红"的判别力证据**——回退是破坏性动作，
> 只测"能退"等于没测；必须同时测"退了以后什么不再作数"和"前进的门没被顺手放宽"。

## TL;DR <!-- serves: FR-1, FR-2, FR-3 -->

新增 `tests/move-rollback.test.ts`（规划名）+ `tests/rollback-revocation.test.ts`（规划名，纯函数层）。
两者都用既有夹具 `tests/application/harness.ts`（真 TaskStore、真 store），不造 mock 端口。

## 测试装置 <!-- serves: FR-1 -->

```ts
// 造一个"走得最远"的需求：implementing + 已确认 design 章 + 已批准计划 + 2 张卡（1 done、1 in_progress）
async function seedDeepRollbackFixture(h): Promise<{ req, tasks }>
```

夹具要能**同时**满足：`artifacts` 里 design 有 `confirmedAt`、`plan.approvedAt` 已写、
`taskStore` 里有活卡——这样回退才能一次性暴露"章 / 批准 / 卡"三类副作用。

## 用例表 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6 -->

| # | 覆盖 | 用例 | 期望（可证伪） |
|---|---|---|---|
| TC-1 | FR-1 | agent 调 `reqboard_move(to='design')`（from=implementing） | 成功；`status==='design'`；**不出现** `REQBOARD_HUMAN_GATE` |
| TC-2 | FR-1 | 同上，检查返回体 | 含 `rollback` 且四键齐全；`tasks_canceled===2`；`tasks_reworked===2` |
| TC-3 | FR-1 | 检查时间线 | 新增一条 status 事件；评论含 `implementing → design` 与 reason 原文 |
| TC-4 | FR-2 | `decomposing` 且**无** `decomposition` 产物 → 退 `design` | 成功（判别力：撤掉豁免后必红于 `missing_artifact`） |
| TC-5 | FR-2 | 反向：`decomposing` → `implementing` 且计划未批准 | **仍被拒**（前进门未放宽） |
| TC-6 | FR-3 | TC-1 之后检查产物簿 | 下游产物 `confirmedAt===undefined`；`plan.approvedAt===undefined` |
| TC-7 | FR-3 | 回程：直接 `design → decomposing` | 被 `artifact_not_confirmed` 拒（不得白送 G2） |
| TC-8 | FR-3 | 重复回退到同一目标 | 幂等：`docSyncPending` 不产生重复 source 条目 |
| TC-9 | FR-4 | 旧卡状态 | 全部 `canceled`，且各带一条 `revisions[kind='rollback']` |
| TC-10 | FR-4 | 重做卡 | 数量与旧卡一一对应；`reworkOf` 指向旧卡；`dependsOn` 为空；`status==='todo'` |
| TC-11 | FR-4 | 回退态下重走 `design → 批准计划 → reqboard_decompose` | 落库成功；未取消卡数 = 新计划卡数（无重复、无双份） |
| TC-12 | FR-4 | 反例：非回退态重复 `reqboard_decompose` | **仍被拒**（`REQBOARD_ALREADY_DECOMPOSED`，事故 B 防线未削弱） |
| TC-13 | FR-5 | 同一 from→to 分别走工具与看板路由 | `status` 与错误码一致；两侧返回体结构一致 |
| TC-14 | FR-6 | 回退到 `design` 后取注入/断点 | `pendingAction` 指向设计阶段动作；不含验收/实施指引 |
| TC-15 | FR-6 | dive armed 需求回退 | `dive.activation==='disarmed'`（自动链不残留旧阶段指向） |
| TC-16 | FR-1 | 回退到 `draft`（跨多级） | 成功；下游全部撤章；`canceled/archived` 目标仍被拒 |

## 判别力（A/B）硬要求 <!-- serves: FR-2, FR-3, FR-4 -->

每条关键断言都要能证明"它抓得住退化"——实现阶段逐条做一次"撤掉修复看是否变红"，并把证据落 `notes/`：

| 修复点 | 撤掉后应当变红的用例 |
|---|---|
| 产物门豁免 | TC-4（`missing_artifact`） |
| 撤销语义 | TC-6 / TC-7（章还在 ⇒ 能直接推回上游） |
| 旧卡处置 + 守卫放宽 | TC-11（`REQBOARD_ALREADY_DECOMPOSED`） |
| `rollback` 的 schema 声明 | `tests/output-contract.test.ts` 的回退用例（`未在 output.schema 声明`） |
| 双通道收敛 | TC-13（两侧行为分叉） |

## 回归与门禁 <!-- serves: FR-1 -->

按本仓规范条目执行（见 `reqboard_kb(kind='standard')`）：

1. `npx vitest run tests/move-rollback.test.ts tests/rollback-revocation.test.ts` → 全绿。
2. `npx vitest run` → 失败数 **不高于**开工前基线（先在 HEAD 取一次数）。
3. `npx tsc --noEmit` → 无新增错误（与开工前基线比对）。
4. `pnpm build` → 退出码 0，`dist/` 与 `lib/client.js` 均更新，`[verify-client] OK`。

## 覆盖矩阵 <!-- serves: FR-5, FR-6 -->

| FR | 用例 | 判别力证据 |
|---|---|---|
| FR-1 | TC-1·2·3·16 | 回退可发起且交代作废清单 |
| FR-2 | TC-4·5 | 半途可退 + 前进门未松 |
| FR-3 | TC-6·7·8 | 章与批准如实作废 |
| FR-4 | TC-9·10·11·12 | 卡有归宿 + 事故 B 防线未削弱 |
| FR-5 | TC-13 | 两侧同源 |
| FR-6 | TC-14·15 | 注入与 armed 按新阶段 |

> 六条 FR 全部有用例；无"只在文档里存在"的条款。
