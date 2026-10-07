# 归档结论（REQ-261006201814-ac4f 测试反向与异常覆盖补强（错误码矩阵 / 红基线分诊 / hermetic 夹具））

> 归档目录：`docs/requirements/REQ-261006201814-ac4f` ｜ 类型：feature
> 渲染时刻：2026-10-07T08:01:25.639Z（由归档提交注入）

## 一句话结论

给测试立判据：错误码口径由脚本生成（零覆盖 23 → 5）、红基线分诊让 refresh 再也洗不绿、测试进程由内核级沙箱拦住仓内写入；src 零改动。

## 合并去向

- `docs/architecture/project-manual.md` — ✅ 存在 205843 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/guides/acceptance-sheet-workflow.md` — ✅ 存在 6486 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 67 份 · 对照机器产物 3 类 / 64 份（按 kind 分组）：

**plan**（1 份）
- `docs/requirements/REQ-261006201814-ac4f/decomposition.md`

**notes**（64 份）
- `docs/requirements/REQ-261006201814-ac4f/design/architecture.md`
- `docs/requirements/REQ-261006201814-ac4f/design/data-model.md`
- `docs/requirements/REQ-261006201814-ac4f/design/interfaces.md`
- `docs/requirements/REQ-261006201814-ac4f/design/test-cases.md`
- `docs/requirements/REQ-261006201814-ac4f/design/use-cases.md`
- `docs/requirements/REQ-261006201814-ac4f/prototypes/INDEX.md`
- `docs/requirements/REQ-261006201814-ac4f/prototypes/detail.html`
- `docs/requirements/REQ-261006201814-ac4f/reviews/delivery-review.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-007168.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-0df2f6.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-0ebf90.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-0ef7ef.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-0f2829.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-222f06.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-2c5be8.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-2d73aa.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-2e7b44.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-30e361.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-41e512.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-4245b2.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-4594a8.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-494cf9.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-4a486d.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-4c2f6a.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-4ccfd6.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-500e70.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-51e6f9.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-549fd6.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-588db4.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-644550.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-6ce03a.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-6ee399.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-707495.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-780910.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-78d787.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-8191a7.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-826916.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-88a974.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-88d6db.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-8f2d59.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-90aa93.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-992222.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-a1ac90.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-a1dcc3.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-a35a46.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-af996f.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-b729f1.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-bb286e.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-c07948.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-c0bd61.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-c13504.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-c1462a.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-c3f340.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-d0015d.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-d25b30.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-d3dc76.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-d9f816.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-dea44a.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-e60b41.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-e965b8.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-f4d774.md`
- `docs/requirements/REQ-261006201814-ac4f/tasks/t-f780bf.md`
- `docs/requirements/REQ-261006201814-ac4f/tests/verification-evidence.md`
- `docs/requirements/REQ-261006201814-ac4f/archive.md`

**requirement**（1 份）
- `docs/requirements/REQ-261006201814-ac4f/requirement.md`

**verification**（1 份）
- `docs/requirements/REQ-261006201814-ac4f/verification.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 64 份 · 共 637028 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 94465 字节
- 追溯报告目录（rtm-*/） · 57 个 · 93391 字节
- 台账镜像（queue.json） · 1 个 · 449172 字节
  - 摘要：任务 67 · 依赖边 60 · 就绪 1 · 生成时间 2026-10-06T12:39:23.575Z · 449172 字节

## 说明书更新点

- `docs/architecture/project-manual.md#机制备忘-测试判据的三层自证-错误码口径-红基线分诊-hermetic-沙箱-2026-10-07-req-261006201814-ac4f` — 新增一节：口径由脚本生成（读数不写死、双形态 + 假阴性率、豁免棘轮双锁）；红基线分诊让 refresh 洗不绿；hermetic 沙箱的最小开关集（child_process/worker/net + 抑制警告）与残留洞；全局配置 A/B 必须覆盖能力全部维度；两条读数失效警告。
- `docs/architecture/project-manual.md#四-验收单-点通过却不计数-的真相-验收方法论` — 把该节补精确：RESULT_ANCHOR 只认五类锚点（19/19 与 3/3 不算，要写 N 条通过或 → N）；修法是 agent 重交 v2 让值带锚点、人零输入点通过，而不是让人反复点或手打。
- `docs/guides/acceptance-sheet-workflow.md#有结果-的真正底线是-有据-不是-有字-2026-10-07-req-261006201814-ac4f-实测` — 指南第二节新增小节：给出 effectiveText 与 RESULT_ANCHOR 的判定式、agent 写法模板（npx vitest run <文件> 退出码 0（N/N 通过））与「5 项以上未复核时重交升版」的处理路径。

## 相关

- 需求：`REQ-261006201814-ac4f`（feature）
- 归档目录：`docs/requirements/REQ-261006201814-ac4f`
- 渲染时刻：2026-10-07T08:01:25.639Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
