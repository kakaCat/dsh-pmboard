# 归档结论（REQ-261007135258-331a 确认通道接线收敛：四条通道统一走「落章 + 推进 + 收尾」单点）

> 归档目录：`docs/requirements/REQ-261007135258-331a` ｜ 类型：feature
> 渲染时刻：2026-10-07T06:25:29.070Z（由归档提交注入）

## 一句话结论

四条确认通道统一走「落章 + 推进 + 收尾」单点：推进与收尾各收敛到一处，看板推进与窗口在线解耦，门禁回执改指 reqboard_ask_confirm。

## 合并去向

- `docs/architecture/confirm-gate-advance.md` — ✅ 存在 11454 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/project-manual.md` — ✅ 存在 194516 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 37 份 · 对照机器产物 3 类 / 32 份（按 kind 分组）：

**requirement**（1 份）
- `docs/requirements/REQ-261007135258-331a/requirement.md`

**plan**（1 份）
- `docs/requirements/REQ-261007135258-331a/decomposition.md`

**notes**（33 份）
- `docs/requirements/REQ-261007135258-331a/design/architecture.md`
- `docs/requirements/REQ-261007135258-331a/design/backend.md`
- `docs/requirements/REQ-261007135258-331a/design/data-model.md`
- `docs/requirements/REQ-261007135258-331a/design/interfaces.md`
- `docs/requirements/REQ-261007135258-331a/design/test-cases.md`
- `docs/requirements/REQ-261007135258-331a/design/use-cases.md`
- `docs/requirements/REQ-261007135258-331a/reviews/final-review.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-167e72.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-1eded6.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-391a5b.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-3bb415.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-3c4004.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-3e6726.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-4d8dc0.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-4fae3f.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-64982e.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-668b4f.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-67f4b5.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-689c9b.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-9373c5.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-983312.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-a1b3e5.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-b414bc.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-b8a3b7.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-cd1673.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-ce2730.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-d413a8.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-e78d50.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-ea5c7e.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-f677ce.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-fc2a6a.md`
- `docs/requirements/REQ-261007135258-331a/tasks/t-fc4732.md`
- `docs/requirements/REQ-261007135258-331a/archive.md`

**verification**（2 份）
- `docs/requirements/REQ-261007135258-331a/tests/verification-evidence.md`
- `docs/requirements/REQ-261007135258-331a/verification.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 32 份 · 共 267248 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 60607 字节
- 追溯报告目录（rtm-*/） · 25 个 · 38455 字节
- 台账镜像（queue.json） · 1 个 · 168186 字节
  - 摘要：任务 25 · 依赖边 25 · 就绪 0 · 生成时间 2026-10-07T05:57:54.779Z · 168186 字节

## 说明书更新点

- `docs/architecture/project-manual.md#机制备忘-确认通道的接线收敛-确认了就该动-要成为结构性质-2026-10-07-req-261007135258-331a` — 新增一节：四通道接线收敛（推进单点 / 收尾单点 / 看板与窗口在线解耦 / 门禁回执指统一入口），含四通道×五件事矩阵、四条判据表、三条可复用教训与「新增通道必须调单点」自检；并登记 vitest 权限模型未放行 child_process 的已知缺口。
- `docs/architecture/confirm-gate-advance.md#7-四通道收敛-落章-推进-收尾-四处接线同一单点-2026-10-07-req-261007135258-331a` — 把确认门的推进契约扩到四条通道：新增改造前「四通道 × 五件事」接线矩阵、收敛后的四条契约、三条纪律（失败不回滚 / 幂等 / 新增通道必须调单点）与可复核锚点表。

## 相关

- 需求：`REQ-261007135258-331a`（feature）
- 归档目录：`docs/requirements/REQ-261007135258-331a`
- 渲染时刻：2026-10-07T06:25:29.070Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
