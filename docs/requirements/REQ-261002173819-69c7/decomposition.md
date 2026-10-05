---
serves: FR-1, FR-2, FR-3, FR-4
---

# REQ-261002173819-69c7 拆分计划 · 修复 reqboard 自动化断链

## TL;DR

2026-10-02 `REQ-261002161439-277d` 窗口实测：12 个回合全部正常收尾，但两条自动化通道同时死掉，之后每一步都靠人手动打「继续」。

- **Dive**：agent 为解死锁调 `clear_pause` → `disarmed+idle`，按设计**只有人**能救回；
- **自动实施链**：首次投递即失败（`session "[object Object]" has no live agent`），失败后**不回收锁** → 后续 15 分钟被 `REQBOARD_ADVANCE_LOCKED` 挡下，`advance.history` 长度为 0（一步未跑）；
- **放大器**：`reqboard_clear_pause` 副作用生效却返回 `INVALID_TOOL_OUTPUT`，调用方无法判断锁开没开。

本次把它修成：**失败响亮、锁不残留、人有显式接回开关**。改动落在 **5 张卡**：契约口径（t1）→ 失败路径（t2）／人工接回（t3）／渲染修复（t4）→ 收口（t5）。

三件事**不做**：不改 Dive 状态机与心跳策略、不新增 agent 侧"武装"工具、不动存储层（属 277d）。

## 改动盘点（对照设计文档逐份）

| 设计文档 | 落点文件 | 改动 | 接收任务 |
|---|---|---|---|
| design/architecture.md | `src/application/internal/support.ts` | 新增 `dispatchOwnerOf(exec)`（转出 dive 的 `agentIdOf`，单一口径） | t1 |
| design/interfaces.md | `src/application/ports.ts` | `JobStartSpec.owner`：`unknown` → `string \| undefined` | t1 |
| design/interfaces.md | `src/application/use-cases/AdvanceChain.ts` | 投递 owner 改传 id；`AdvanceStop` 增 `'dispatch_failed'` | t1、t2 |
| design/architecture.md | `src/application/use-cases/AdvanceChain.ts` | 投递失败 → 回收 `advance.lockAt/runId` + `history` + `comment` | t2 |
| design/data-model.md | `src/shared/protocol.ts` | `AdvanceEvent` 增 `'DISPATCH_FAILED'`（唯一枚举新增） | t2 |
| design/interfaces.md | `src/application/internal/rearm.ts` | 新增 `armExplicit`（**只给人用**，自动路径不调） | t3 |
| design/use-cases.md | `src/http/routers/requirements.ts` | 看板「继续」的 `rearmIfRecoverable` 调用 → `armExplicit`（不新增返回键） | t3 |
| design/interfaces.md | `src/tools/ClearPauseTool/ClearPauseTool.ts`、`src/tools/render-summaries.ts` | 补 `output.render` + `clearPauseSummary` | t4 |
| design/test-cases.md | `tests/advance-dispatch-owner.test.ts`（新）、`tests/reqboard/autorun-rearm.test.ts`（新）、`tests/tools-render-coverage.test.ts`（新）、`tests/dive-rearm.test.ts`（扩写）、`tests/clear-pause-lossless.test.ts`（扩写）、`tests/unit/dsh-jobs-adapter.test.ts`（夹具改字符串 id） | 新增/扩写用例 | t1、t2、t3、t4、t5 |
| design/test-cases.md | 全量回归、`pnpm build`、真实台账端到端 | 回归基线 + 端到端接回验证 | t5 |

## 覆盖对照表

| 需求条款 | 条款内容 | 接收任务 |
|---|---|---|
| FR-1 | 自动链投递失败必须回收推进锁 | t2、t5 |
| FR-2 | 投递失败原因可诊断（owner 口径修正，不留 `[object Object]`） | t1、t2、t5 |
| FR-3 | 看板「继续」把 `disarmed+idle` 接回自动化（仅人） | t3、t5 |
| FR-4 | `reqboard_clear_pause` 补 `output.render`，工具不再假报错 | t4、t5 |

## 任务表

| 顺序 | key | 业务标题 | 类型 | 依赖 | 验收要点 |
|---|---|---|---|---|---|
| 1 | t1 | 后台任务的"户主"改成身份证号：owner 口径收口 | implement / backend | — | `owner` 传 id 字符串；`dispatchOwnerOf` 与 `agentIdOf` 逐例一致；typecheck 不高于基线 |
| 2 | t2 | 投递失败不留锁、留痕可读 | implement / backend | t1 | 失败后 `lockAt/runId` 为空且立刻可重试；`history` 新增 `DISPATCH_FAILED` 且正文不含 `[object Object]` |
| 3 | t3 | 给人一个开关：看板「继续」能接回手动模式的需求 | implement / backend | — | `disarmed+idle` → `armed+active` 并留人工痕；重复点零写入；自动路径仍不碰 |
| 4 | t4 | 解锁工具的"回执"修好：补 output.render | implement / backend | — | 全工具渲染覆盖用例绿（含故障注入变红）；`clear_pause` 回执与台账一致 |
| 5 | t5 | 收口：兼容核对、回归基线与端到端接回 | test / backend | t2、t3、t4 | 既有契约零回归；`pnpm test` ≤106；`pnpm build` 退出码 0；对 277d 点「继续」60s 内起轮 |

## 批次与依赖（为什么这样切）

```
        批1 契约口径                 批2 三条独立修复                批3 收口
   ┌────────────────────┐   ┌──────────────────────────┐   ┌──────────────────┐
   │ t1 owner 传 id      │──►│ t2 失败回收锁 + 留痕      │──►│                  │
   │ （AdvanceChain 改参）│   │                          │   │ t5 兼容 + 回归    │
   └────────────────────┘   ├──────────────────────────┤   │ + 端到端接回      │
                            │ t3 armExplicit + 看板接线 │──►│                  │
                            ├──────────────────────────┤   │                  │
                            │ t4 clear_pause render     │──►│                  │
                            └──────────────────────────┘   └──────────────────┘
```

- **t1 必须最先**：t2 的"失败"要按 owner 口径分类（`owner_unresolvable` vs `dispatch_failed`），口径没定死就会写出第二套判定。
- **t3、t4 与 t1/t2 无耦合**：分别只碰 `rearm.ts`+`requirements.ts` 与 `ClearPauseTool.ts`+`render-summaries.ts`，可与 t2 并行。
- **t5 是三者的收口**：只有 t2（锁不残留）、t3（人能接回）、t4（回执可信）同时在位，"断链可恢复"才成立——端到端那条验收命令正是三者的合取。
- 不按 FR 一一对应切卡，是因为 FR-1 与 FR-2 共用同一段错误路径（同一文件、同一分支），拆开会留下"改了 owner 没改锁"的中间态，`advance.history` 依然为空。

## 关键验收命令（t5 逐条跑）

```
# 目标用例
npx vitest run tests/advance-dispatch-owner.test.ts tests/dive-rearm.test.ts \
               tests/reqboard/autorun-rearm.test.ts tests/tools-render-coverage.test.ts \
               tests/clear-pause-lossless.test.ts tests/unit/dsh-jobs-adapter.test.ts

# 既有契约零回归
npx vitest run tests/tools-schema.test.ts tests/output-contract.test.ts tests/task-run-contract.test.ts \
               tests/dive-round-state.test.ts tests/dive-round-driver.test.ts

# 类型 / 全量 / 构建
pnpm typecheck && pnpm test && pnpm build      # typecheck ≤223；test 失败 ≤106；build 退出码 0

# 端到端（人工一次）：对 REQ-261002161439-277d 点看板「继续」
# 期望 60s 内：dive.activation=armed、phase=active、roundsInStage 由 0 → 1
```

## 与 277d 已知缺口的交接

`REQ-261002161439-277d` 的 `notes/known-defects.md` §3.1/§3.2/§3.4 记录的三条工具面缺陷里，**§3.4（clear_pause 渲染崩溃）由本需求 t4 修掉**；§3.1/§3.2（settle 自动落库未跑、手动落库 refs 为空）属计划落库链，**不在本需求边界**，仍留在那份文档里等后续需求。
