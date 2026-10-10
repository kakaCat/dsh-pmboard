# 归档结论（REQ-261009174713-7bc8 按 packages/goal 结构把 dsh-pmboard 重构为多子包单插件）

> 归档目录：`docs/requirements/REQ-261009174713-7bc8` ｜ 类型：refactor
> 渲染时刻：2026-10-10T10:15:35.813Z（由归档提交注入）

## 一句话结论

dsh-pmboard 重构为 19 个 workspace 包 + 单插件（L0 公共/RTM · L0.5 类型契约与六类型 · L1 core · L2 工具/驱动/工作流/客户端/命令面 · L3 资产）：五闸全绿、五类迁移基线 diff 全过、测试随包迁移 546/79；架构说明归于 docs/architecture/workspace-packages.md。

## 合并去向

- `docs/architecture/` — ✅ 存在 992 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 12 份 · 对照机器产物 3 类 / 98 份（按 kind 分组）：

**requirement**（1 份）
- `docs/requirements/REQ-261009174713-7bc8/requirement.md`

**plan**（1 份）
- `docs/requirements/REQ-261009174713-7bc8/decomposition.md`

**verification**（1 份）
- `docs/requirements/REQ-261009174713-7bc8/verification.md`

**retro**（1 份）
- `docs/requirements/REQ-261009174713-7bc8/retro.md`

**notes**（8 份）
- `docs/requirements/REQ-261009174713-7bc8/tests/verification-evidence.md`
- `docs/requirements/REQ-261009174713-7bc8/reviews/refactor-review.md`
- `docs/requirements/REQ-261009174713-7bc8/design/architecture.md`
- `docs/requirements/REQ-261009174713-7bc8/design/migration.md`
- `docs/requirements/REQ-261009174713-7bc8/design/interfaces.md`
- `docs/requirements/REQ-261009174713-7bc8/design/data-model.md`
- `docs/requirements/REQ-261009174713-7bc8/design/test-cases.md`
- `docs/requirements/REQ-261009174713-7bc8/archive.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 98 份 · 共 863215 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 109105 字节
- 追溯报告目录（rtm-*/） · 91 个 · 108437 字节
- 台账镜像（queue.json） · 1 个 · 645673 字节
  - 摘要：任务 91 · 依赖边 103 · 就绪 0 · 生成时间 2026-10-09T10:45:15.910Z · 645673 字节

## 说明书更新点

- `docs/architecture/workspace-packages.md#layers` — 新增（架构说明）：19 包按 L0→L3 分层与各自允许依赖，单向依赖硬纪律，根包为聚合发布单元、子包 private+exports 指 src；白名单唯一权威是 scripts/package-boundary-check.mts 的 LAYERS。
- `docs/architecture/workspace-packages.md#type-layer` — 新增：类型判据收敛为六个 pmboard-type-<cat> 包各一份 RequirementTypeSpec（kit 构建即校验），并给出「加一个需求类型三步」。
- `docs/architecture/workspace-packages.md#layout` — 新增：测试随包（packages/<pkg>/tests/**）与仓库级/集成（tests/**）双落点 + vitest include 与三前缀别名；各包 README 承载职责/允许依赖/测试命令。

## 相关

- 需求：`REQ-261009174713-7bc8`（refactor）
- 归档目录：`docs/requirements/REQ-261009174713-7bc8`
- 渲染时刻：2026-10-10T10:15:35.813Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
