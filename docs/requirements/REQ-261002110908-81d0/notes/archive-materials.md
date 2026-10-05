# 归档材料（准备就绪，待那一条陈旧挂起确认清掉后提交）

> 状态：**未提交**。原因：验收提交时自动触发的确认门 `pc-a89210`（target=artifact, kind=verification）被 30s 工具超时**打断**，
> 台账里留下一条 interrupted 的挂起记录；它拦住本窗口的写路径（含 `reqboard_submit(kind=archive)`）。
> 需求此时已 `archived` → 本窗口不再"绑定"该需求 → `reqboard_ask_confirm` 也无法再发起/覆盖（REQBOARD_NO_BOUND_REQ）。
> **解除方式**：① 人在项目看板点一次确认；或 ② 等该挂起记录到期自动失效（创建于 04:10:14，按其 30 分钟口径约 04:40 失效）。

## 提交载荷（可直接照抄）

- **dir**: `docs/requirements/REQ-261002110908-81d0`
- **merged_into**: `["docs/architecture/project-manual.md"]`
- **manual_updates**: `[{ path: "docs/architecture/project-manual.md", section: "机制备忘：长文本工具入参的写法约定（防整轮报废）", summary: "同节补记本需求独有的三条教训：审批链需要「0 输出不得推进」守卫、失败恢复指引必须被自己的门禁验证过、驱动需要「无进展护栏」；并记录 reqboard_clear_pause 接线修复与债务标记清偿。" }]`
  （**已实际落笔**：手册该节末尾「补记」段 + 「变更记录」一行，2026-10-02 REQ-261002110908-81d0）
- **index_entry**: 长文本工具入参写法约定：半角引号漏转义会让工具参数 JSON 非法、整轮报废，故把「怎么写」写成工具自带的约定——一处共享常量 LONG_TEXT_ARG_NOTE（三锚点：短句 ≤60 字 / 需引号用「」/ 超长拆多次调用）+ 覆盖清单 LONG_TEXT_FIELDS（15 条 / 8 工具），遍历用例守覆盖、反向可证伪；零行为变更。附带修复唯一解锁口 reqboard_clear_pause（此前从未工作过）并记录死锁三条口径。
- **docs（15 条）**：
  requirement.md（requirement）/ decomposition.md（plan）/ verification.md（verification）/
  design 五份（notes）/ reviews/review-report.md（notes）/ tests/test-evidence.md（notes）/
  notes 五份（incident-autorun-deadlock、baseline-2026-10-02、work-done-during-wedge、proposed-fix-clear-pause、draft-bug-requirement-autorun-recovery）（notes）

## 与同源需求的重复（如实记录）

同一交付在台账里有**两条已归档需求**：

| 需求 | 窗口 | 说明 |
|---|---|---|
| REQ-261002110908-81d0（本条） | session-be1bdc3d | 原需求。经历「批准落库 0 卡 → implementing 死锁 → Dive 无限轮询」，解锁后补完 5 张卡与验收（8/8 通过） |
| REQ-261002115204-ba52 | session-06ef20c5 | 用户在新窗口**重开**的需求，已完整走完流程并写过手册该节，归档材料已提交 |

两条同源、实现与证据同源；本条归档材料补交后，建议人在看板决定是否保留两条（取消/归档为人工动作，agent 不可越过）。
