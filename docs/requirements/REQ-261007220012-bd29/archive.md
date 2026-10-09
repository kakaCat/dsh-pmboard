# 归档结论（REQ-261007220012-bd29 reqboard 体检第三批工具面精简（27→21，S1~S6））

> 归档目录：`docs/requirements/REQ-261007220012-bd29` ｜ 类型：refactor
> 渲染时刻：2026-10-07T15:12:57.379Z（由归档提交注入）

## 一句话结论

reqboard 工具面 27 → 21：删弃用别名与 6 个冗余槽位、合并查询面与修缮簇（task_amend），语义零损失、五处口径由派生门禁锁死；退役/合并动作序列沉淀在 docs/architecture/tool-face-inventory.md。

## 合并去向

- `docs/architecture/tool-face-inventory.md` — ✅ 存在 5127 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/project-manual.md` — ✅ 存在 211108 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 64 份 · 对照机器产物 3 类 / 40 份（按 kind 分组）：

**requirement**（1 份）
- `docs/requirements/REQ-261007220012-bd29/requirement.md`

**plan**（1 份）
- `docs/requirements/REQ-261007220012-bd29/decomposition.md`

**verification**（1 份）
- `docs/requirements/REQ-261007220012-bd29/verification.md`

**retro**（1 份）
- `docs/requirements/REQ-261007220012-bd29/retro.md`

**notes**（60 份）
- `docs/requirements/REQ-261007220012-bd29/design/architecture.md`
- `docs/requirements/REQ-261007220012-bd29/design/interfaces.md`
- `docs/requirements/REQ-261007220012-bd29/design/data-model.md`
- `docs/requirements/REQ-261007220012-bd29/design/migration.md`
- `docs/requirements/REQ-261007220012-bd29/design/test-cases.md`
- `docs/requirements/REQ-261007220012-bd29/reviews/self-review.md`
- `docs/requirements/REQ-261007220012-bd29/tests/evidence.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-2727b0-dev.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-6bf013-integrate.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-0e87d2-review.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-b603b6-test.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-14c8be-dev.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-2d1abf-integrate.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-5ad80b-review.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-b65d24-test.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-5251be-dev.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-b96bc1-integrate.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-38f407-review.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-7bb731-test.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-b24703-dev.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-9e29b1-integrate.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-795d16-review.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-e7d151-test.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-084edc-s5.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-06c363-s6.md`
- `docs/requirements/REQ-261007220012-bd29/evidence/t-34ec16-fr7.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-c21292.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-38c7cd.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-856177.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-ef2395.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-084edc.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-06c363.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-34ec16.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-2727b0.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-6bf013.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-0e87d2.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-b603b6.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-14c8be.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-2d1abf.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-5ad80b.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-b65d24.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-5251be.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-b96bc1.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-38f407.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-7bb731.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-b24703.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-9e29b1.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-795d16.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-e7d151.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-10e826.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-214c00.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-c14abb.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-92324a.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-92b152.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-c170f8.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-b46944.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-f35be1.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-1bc4c0.md`
- `docs/requirements/REQ-261007220012-bd29/tasks/t-0a592d.md`
- `docs/requirements/REQ-261007220012-bd29/archive.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 40 份 · 共 356295 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 65166 字节
- 追溯报告目录（rtm-*/） · 33 个 · 53841 字节
- 台账镜像（queue.json） · 1 个 · 237288 字节
  - 摘要：任务 33 · 依赖边 31 · 就绪 0 · 生成时间 2026-10-07T14:18:33.469Z · 237288 字节

## 说明书更新点

- `docs/architecture/project-manual.md#机制备忘-工具清单的唯一事实源与两条派生校验-2026-10-06-req-261006201508-5cb6` — 多了一条认知：唯一事实源 + 派生校验是**精简的前提**——正因为五处口径已绑成断言，删/合并 7 个槽位才一眼能看出漏改面；并指向新的领域篇《工具面清单与精简手册》。
- `docs/architecture/project-manual.md#变更记录` — 登记本批：27→21 的六步动作序列、两处易漏连带面（错误码清单刷新脚本 / 注入片段生成），以及三条教训（删除需授权且旧名硬断要改口径；必填约束放宽须由用例兜底；「用例一行不改」这类断言必须按文件实测 diff 核）。
- `docs/architecture/tool-face-inventory.md#工具面清单与精简手册` — 新增一份可复用的工具面手册：21 个槽位现状清单、五处口径与两处易漏连带面、六步退役/合并动作序列、以及「不许顺手改用例判定/台账/状态机」的边界。

## 相关

- 需求：`REQ-261007220012-bd29`（refactor）
- 归档目录：`docs/requirements/REQ-261007220012-bd29`
- 渲染时刻：2026-10-07T15:12:57.379Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
