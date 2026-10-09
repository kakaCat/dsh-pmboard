# 归档结论（REQ-261007223647-da5d P1：弹框与确认门体验优化）

> 归档目录：`docs/requirements/REQ-261007223647-da5d` ｜ 类型：feature
> 渲染时刻：2026-10-07T17:04:52.956Z（由归档提交注入）

## 一句话结论

弹框与确认门三件事落地：作答到达即落盘（超时不吞票、重投如实查询）、立项口径收口为四问（推荐后缀 / ✖️ 居末 / 一键过）、看板首屏 pending 横带与根来源红字；顺带修好「重投读口从未实现」这一假通。

## 合并去向

- `docs/architecture/pending-confirm-visibility.md` — ✅ 存在 7149 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/gate-read-root.md` — ✅ 存在 22617 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/project-manual.md` — ✅ 存在 218260 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 80 份 · 对照机器产物 3 类 / 71 份（按 kind 分组）：

**plan**（1 份）
- `docs/requirements/REQ-261007223647-da5d/decomposition.md`

**notes**（77 份）
- `docs/requirements/REQ-261007223647-da5d/design/architecture.md`
- `docs/requirements/REQ-261007223647-da5d/design/backend.md`
- `docs/requirements/REQ-261007223647-da5d/design/data-model.md`
- `docs/requirements/REQ-261007223647-da5d/design/frontend.md`
- `docs/requirements/REQ-261007223647-da5d/design/interfaces.md`
- `docs/requirements/REQ-261007223647-da5d/design/test-cases.md`
- `docs/requirements/REQ-261007223647-da5d/design/use-cases.md`
- `docs/requirements/REQ-261007223647-da5d/prototypes/INDEX.md`
- `docs/requirements/REQ-261007223647-da5d/prototypes/detail.html`
- `docs/requirements/REQ-261007223647-da5d/reviews/review-log.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-01914d.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-01ff92.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-02c55a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-0648bf.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-0bb141.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-1ca419.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-225f97.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-2281a6.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-279628.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-289f9a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-2c3288.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-2c33b8.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-3000f0.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-36ed5a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-3c19b8.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-3dad5a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-4183d8.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-4231d9.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-432019.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-470b5b.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-4750fc.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-492618.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-4c8234.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-4f2c5f.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-53b7c9.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-56b510.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-5ac9e4.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-5f569a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-65cda7.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-6c3cbd.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-6ddd3f.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-784112.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-78e590.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-7a4d8b.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-7cd1c1.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-7e2939.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-84815f.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-96f753.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-9f512b.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-a429de.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-a7a182.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-adcd2a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-af61f4.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-afd035.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-b15fb4.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-b4e8c5.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-b7ee98.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-b83325.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-bc9944.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-c2410a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-c2e4b8.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-cb6079.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-ceec5a.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-d03905.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-d7e33b.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-d7fb36.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-e0e0be.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-e4855d.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-e80d61.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-eadc95.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-f2ff7b.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-f4a1c2.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-f4c2ed.md`
- `docs/requirements/REQ-261007223647-da5d/tasks/t-f4e515.md`
- `docs/requirements/REQ-261007223647-da5d/tests/acceptance-evidence.md`
- `docs/requirements/REQ-261007223647-da5d/tests/prototype-compare.md`
- `docs/requirements/REQ-261007223647-da5d/archive.md`

**requirement**（1 份）
- `docs/requirements/REQ-261007223647-da5d/requirement.md`

**verification**（1 份）
- `docs/requirements/REQ-261007223647-da5d/verification.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 71 份 · 共 600781 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 93353 字节
- 追溯报告目录（rtm-*/） · 64 个 · 81561 字节
- 台账镜像（queue.json） · 1 个 · 425867 字节
  - 摘要：任务 64 · 依赖边 68 · 就绪 0 · 生成时间 2026-10-07T15:49:10.351Z · 425867 字节

## 说明书更新点

- `docs/architecture/pending-confirm-visibility.md#弹框留痕与-pending-票可见性-l2-领域篇` — 新增一份可复用的领域篇：交互留痕三类与「作答到达即落盘」、确认票等待走 askWithBudget（pending 不是错误）、pendingForRequirement 读口曾漏实现导致重投端点假通、/state 的 pending_confirms 六键与三条「仍然有意义」谓词单点、看板横带三态与票行形状（对齐原型 #FR-5）、remaining_ms 读时派生不落库。
- `docs/architecture/project-manual.md#机制备忘-弹框留痕与-pending-票可见性-2026-10-08-req-261007223647-da5d` — 多了一条认知：端口在类型里声明了不等于实现了——缺方法只会在生产路径上退化成「不可用」（重投端点就是这么假通了一个需求周期）；「谁在等」的筛选条件只许有一处（agent 侧与看板共用 livePendingConfirmsOf）；权威原型是逐字判据（按钮文案、倒计时格式、图标都照锚点对齐）。
- `docs/architecture/project-manual.md#变更记录` — 登记本批：新增领域篇《弹框留痕与 pending 票可见性》、读根篇补客户端侧根来源诊断、以及三条教训与一条遗留（留痕写入失败时回执仍写「已留痕」，待裁决）。
- `docs/architecture/gate-read-root.md#客户端侧的根来源诊断与红字徽章-2026-10-08-req-261007223647-da5d` — 客户端侧根来源诊断：absolutizeDocPathWithSource 四态（req-root / session-root / server-root / none）+ peekLastRootSource + 面板「地址可能不准（根来源：X）」红字，打开行为不变；附三条变更须知（需求级根命中不许再回落、红字不许变成拒绝打开、手搓视图不加噪音）。

## 相关

- 需求：`REQ-261007223647-da5d`（feature）
- 归档目录：`docs/requirements/REQ-261007223647-da5d`
- 渲染时刻：2026-10-07T17:04:52.956Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
