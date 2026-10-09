# 归档结论（REQ-261008103718-f1ea 修复 PM 插件立项弹框功能失效问题）

> 归档目录：`docs/requirements/REQ-261008103718-f1ea` ｜ 类型：bug
> 渲染时刻：2026-10-08T04:15:35.685Z（由归档提交注入）

## 一句话结论

立项弹框失效修复：宿主 askTimed 的 callId=undefined 使弹框请求被网关判 not lossless JSON data 而拒收；移除透传改走官方 ask() 路径 + 源头修 description:undefined + 通道边界无损清洗，实测弹框恢复（两段弹框渲染、作答、立项成功）。

## 合并去向

- `docs/guides/dialog-not-showing-troubleshooting.md` — ✅ 存在 3270 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 16 份 · 对照机器产物 3 类 / 10 份（按 kind 分组）：

**requirement**（1 份）
- `docs/requirements/REQ-261008103718-f1ea/requirement.md`

**plan**（1 份）
- `docs/requirements/REQ-261008103718-f1ea/decomposition.md`

**retro**（1 份）
- `docs/requirements/REQ-261008103718-f1ea/retro.md`

**verification**（3 份）
- `docs/requirements/REQ-261008103718-f1ea/tests/test-results.md`
- `docs/requirements/REQ-261008103718-f1ea/verification.md`
- `docs/requirements/REQ-261008103718-f1ea/diag-evidence.log`

**notes**（10 份）
- `docs/requirements/REQ-261008103718-f1ea/design/solution.md`
- `docs/requirements/REQ-261008103718-f1ea/design/architecture.md`
- `docs/requirements/REQ-261008103718-f1ea/design/interfaces.md`
- `docs/requirements/REQ-261008103718-f1ea/design/data-model.md`
- `docs/requirements/REQ-261008103718-f1ea/design/test-cases.md`
- `docs/requirements/REQ-261008103718-f1ea/reviews/design-review.md`
- `docs/requirements/REQ-261008103718-f1ea/tasks/t-c5da35.md`
- `docs/requirements/REQ-261008103718-f1ea/tasks/t-04b737.md`
- `docs/requirements/REQ-261008103718-f1ea/tasks/t-57b07b.md`
- `docs/requirements/REQ-261008103718-f1ea/archive.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 10 份 · 共 21448 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 12842 字节
- 追溯报告目录（rtm-*/） · 3 个 · 2650 字节
- 台账镜像（queue.json） · 1 个 · 5956 字节
  - 摘要：任务 3 · 依赖边 2 · 就绪 1 · 生成时间 2026-10-08T02:47:20.966Z · 5956 字节

## 说明书更新点

- 无（bug 修复：改动集中在插件内部通道适配（UserQuestionsAdapter/capture-mapping/lossless-json）与文档（requirement/test-results/retro）。根因与防回归已按规范合并进 docs/guides/dialog-not-showing-troubleshooting.md（guides/ 既有排查手册体系，未自创平行目录）；retro.md 记录误判时间线与教训。）

## 相关

- 需求：`REQ-261008103718-f1ea`（bug）
- 归档目录：`docs/requirements/REQ-261008103718-f1ea`
- 渲染时刻：2026-10-08T04:15:35.685Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
