# 归档结论（REQ-261007230908-5ccb reqboard 体检第四批治理设施（错误码注册表 + 双拼归一单源 + 收官盘点））

> 归档目录：`docs/requirements/REQ-261007230908-5ccb` ｜ 类型：feature
> 渲染时刻：2026-10-07T17:02:57.175Z（由归档提交注入）

## 一句话结论

reqboard 治理设施：133 个大写错误码有注册表事实源与机械门（双向一致 / prompt 子集 / client 派生），双拼字段取值单源化——体检报告 §4.3 十项建议收官

## 合并去向

- `docs/architecture/error-code-registry.md` — ✅ 存在 6370 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/project-manual.md` — ✅ 存在 212670 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 48 份 · 对照机器产物 3 类 / 40 份（按 kind 分组）：

**notes**（45 份）
- `docs/requirements/REQ-261007230908-5ccb/closure-audit.md`
- `docs/requirements/REQ-261007230908-5ccb/design/architecture.md`
- `docs/requirements/REQ-261007230908-5ccb/design/backend.md`
- `docs/requirements/REQ-261007230908-5ccb/design/data-model.md`
- `docs/requirements/REQ-261007230908-5ccb/design/interfaces.md`
- `docs/requirements/REQ-261007230908-5ccb/design/test-cases.md`
- `docs/requirements/REQ-261007230908-5ccb/design/use-cases.md`
- `docs/requirements/REQ-261007230908-5ccb/prototypes/INDEX.md`
- `docs/requirements/REQ-261007230908-5ccb/prototypes/detail.html`
- `docs/requirements/REQ-261007230908-5ccb/reviews/review-2026-10-07.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-03cbb9.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-0b04ae.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-0e39e2.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-0fa1ae.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-11b7d0.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-2d8968.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-3629f3.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-36bb20.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-3df3ef.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-5e8f8e.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-6feb35.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-739dda.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-7fcc91.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-86810e.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-89aaec.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-8f8ced.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-954881.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-99e283.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-9d8356.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-a296ad.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-a5c4f7.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-b483e0.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-b99234.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-ba812a.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-bdc29d.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-bf89ba.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-cd208f.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-d72214.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-da8518.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-dafa69.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-dff2c4.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-ec4a20.md`
- `docs/requirements/REQ-261007230908-5ccb/tasks/t-fbcd87.md`
- `docs/requirements/REQ-261007230908-5ccb/tests/self-check.md`
- `docs/requirements/REQ-261007230908-5ccb/archive.md`

**plan**（1 份）
- `docs/requirements/REQ-261007230908-5ccb/decomposition.md`

**requirement**（1 份）
- `docs/requirements/REQ-261007230908-5ccb/requirement.md`

**verification**（1 份）
- `docs/requirements/REQ-261007230908-5ccb/verification.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 40 份 · 共 290166 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 50829 字节
- 追溯报告目录（rtm-*/） · 33 个 · 37328 字节
- 台账镜像（queue.json） · 1 个 · 202009 字节
  - 摘要：任务 33 · 依赖边 37 · 就绪 0 · 生成时间 2026-10-07T15:38:13.829Z · 202009 字节

## 说明书更新点

- `docs/architecture/project-manual.md#机制备忘-错误码注册表与双拼归一单源-2026-10-07-req-261007230908-5ccb` — 新增机制备忘：错误码注册表是唯一事实源、四条门与新增码的正确顺序；双拼字段取值单源与后处理归属

## 相关

- 需求：`REQ-261007230908-5ccb`（feature）
- 归档目录：`docs/requirements/REQ-261007230908-5ccb`
- 渲染时刻：2026-10-07T17:02:57.175Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
