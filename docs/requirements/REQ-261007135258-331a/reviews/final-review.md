# 评审记录 · REQ-261007135258-331a

> 评审对象：design/architecture.md、backend.md、data-model.md、interfaces.md、test-cases.md、use-cases.md（6 份）
> ＋ decomposition.md（6 张父卡 / 24 张子卡）；以及四条确认通道的最终实现面。
> 评审时间：2026-10-07 · 评审人：本窗口 agent（复核子卡 t-fc4732 / t-689c9b / t-983312 / t-e78d50 的结论汇总 ＋ 本窗口独立逆验证）

## 评审要点与结论

| # | 评审点 | 结论 |
|---|--------|------|
| 1 | 推进单点唯一 | 通过：看板（requirements.ts:522）与文字证据（ConfirmArtifact.ts:256）均改调 `applyConfirmedAdvance`；两处内联 `transitionRequirement` 归零（ConfirmArtifact.ts grep 空输出） |
| 2 | 收尾单点唯一 | 通过：`finishConfirmAdvance`（confirm-advance-finish.ts）＝清停手位 ＋ 复位运行时健康；四通道只经推进单点触发，不再各写一套 |
| 3 | 看板推进与窗口在线解耦 | 通过：`onlineAgent` 只决定 `delivered` 与 note；离线用例断言 `advanced===true`、`delivered===false`、note 含「窗口不在线」 |
| 4 | 门禁指路改指统一入口 | 通过：decision-gates.ts（183/199）与 stage-gate-timeline.ts（360）的 how 均指 `reqboard_ask_confirm`；`reqboard_move(requirement_id` 两个文件零命中 |
| 5 | 失败路径不回滚 | 通过：收尾两步各自 try/catch、永不抛；`applyConfirmedAdvance` 迁移异常吞进 `advanceNote`；内容门 / G2 仍在调用方前置、只拦推进不吞落章 |
| 6 | 并发与幂等 | 通过：乐观护栏 `req.status !== input.from` 幂等跳过；`stampArtifactOnce` / `stampPlanOnce` 首写即事实；`exitAwaitingConfirm` 幂等 |
| 7 | 对拍用例非空转 | 通过（逆验证）：在单点收尾前临时短路 → `confirm-channel-parity` 3 例红并点名 evidence/board 通道与四元组本体；恢复后 5 例全绿 |
| 8 | 契约不变 | 通过：`applyConfirmedAdvance` 新增键全部可选（不传＝改造前行为）；回执键逐字不变；未新增人工门、未改 skip 语义与 NODE_ISOLATION 默认值 |

## 评审中发现并处理的问题

1. **对拍用例类型错误**：`confirm-channel-parity.test.ts` 向 `GatePromptPort.prompt` 传了端口不接收的 `fingerprint` 入参（运行时被忽略，`tsc` 报 TS2353）。已删除该入参，`pnpm typecheck` 转 0。
2. **跨需求类型冲突**：`query-docs-roots.test.ts` 的子类 `RootDocs` 与 `FakeDocs`（另一在飞需求的 harness 改动新增）重声明私有字段 `root`，`tsc` 报 TS2415。已把子类字段改名为 `docRoot`（仅测试夹具，零行为变更）。
3. **FR-3 断言缺失**：`confirm-evidence.test.ts` 原本没有「证据确认后停手位被清」的断言（只有 `advance:false` 不推进）。已补一条并做逆验证：跳过收尾时该例必红，恢复后转绿。
4. **t-391a5b 静态 grep 口径过宽**：原卡要求 `requirements.ts` 全文件零 `transitionRequirement(`，但 236（人工 move 路由）与 359（批准计划落库路由）是其它功能的合法调用，删除即破坏计划外调用方。经人工裁决（2026-10-07）按 FR-1 精确口径执行：只锁「确认即推进分支零命中」，并同步修订该卡验收标准。

## 遗留观察（不影响本次交付，但请人工留意）

- **全量 `pnpm test` 仍红**：HEAD 基线 41 文件 / 76 例红；当前工作树 52 文件 / 100 例红。差额主因是当前树 `vitest.config.ts` 的 Node 权限模型未放行 `child_process`（在飞需求 REQ-261006201814-ac4f），53 处依赖 `execSync` 的用例被内核拒。本需求改动的模块不在失败集合内。经人工裁决，t-391a5b 验收收窄为「需求自身判据」并如实留痕。
- **RTM 实施覆盖度读数**：看板 `implementation_coverage` 显示 47 条设计锚点 covered 0、`rtm_health.missing_files` 含 `rtm-accepting.yml`。属投影/回收节奏问题，与本需求代码无关，进入验收后由看板页面核。
