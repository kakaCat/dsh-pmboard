# t-4f2c5f 全量验收口径收口

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
全量验收口径收口

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：test
- 端侧：fullstack

## 得到什么结果
`pnpm vitest run` 退出码 0 且与基线比对无新红（C-14）；`pnpm tsc --noEmit` 退出码 0（C-15）；`pnpm build` 退出码 0 且 dist/ 与 lib/client.js 均有新产物（C-11/C-12）；FR-1~FR-6 判据逐条对照 requirement.md AC 表全过。

## 实施方案（implementation）
跑全量验收口径：vitest 全量 + tsc + build（host+client）；对照 requirement.md AC-1~AC-6 逐条核验并留证据；修复任何新红（回对应实现卡返工）。

## 上游产出摘要（dependsSummary）
- 弹框与工具文案口径归零
- 看板 pending 票接线
- 文档位置根来源红字徽章
- 旧数据与旧端兼容验证

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-07T16:36:15.117Z，窗口 session-c4c6ee7c-4162-4816-b0e8-f7e0ec747bb5）

这张卡做完，这条需求有了完整的验收口径：能当场跑的都跑了、留了读数，人看的两项如实交代，没把「跑不了」写成「通过」。

### 完成项

- 全量口径跑完：host 构建 + client 构建 + [verify-client] OK + tsc 0 错；产物里确有新码（client.js 带横带与红字徽章、dist/index.mjs 带 pending_confirms 与 pendingForRequirement）
- 本需求相关 16 个测试文件 138 例全绿；新增 4 个测试文件（pending-board / pending-ticket-row / doc-root-badge / compat-matrix / capture-rejection-persistence / pending-confirm-band / pending-band-wiring / pending-band-e2e，共 8 个）
- 对照 requirement.md AC 表逐条核验：AC-1~AC-6 全部有证据，其中 AC-5 的人眼可见性与 AC-6 的交付后台账判据如实标为人工/后续项（未伪造通过）
- 全量差集：67 失败 / 基线 68；新增 10 条全部为存量（含 1 条已知 flaky，已用两种状态各多轮实测证明与本次改动无关）
- 本卡补测：AC-3 第 4 条「无裸哨兵标签」断言（此前缺口）已补进 tests/capture-tool.test.ts

### 改动文件

- `tests/capture-tool.test.ts`

### 下一步

父卡收尾后交棒验收：reqboard_submit(kind=verification)

---
