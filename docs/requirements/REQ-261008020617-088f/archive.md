# 归档结论（REQ-261008020617-088f 层边界收口：15 处 application/ I/O 越界端口化 + 层门补豁免面）

> 归档目录：`docs/requirements/REQ-261008020617-088f` ｜ 类型：refactor
> 渲染时刻：2026-10-08T04:23:04.238Z（由归档提交注入）

## 一句话结论

层边界收口：application/ 的 15 处 I/O 越界清零（三份同构 RTM 门合并为 rtm-gates 单点 · 新增 HostFsPort/DiagSinkPort 端口与宿主实现 · 路径判定收口纯函数 · Dive Service 外移适配层），层门补上显式豁免面（理由必填 / 只减不增 / 过期即红，本次 0 条录用）——规则一条未放宽。

## 合并去向

- `docs/architecture/project-manual.md` — ✅ 存在 224387 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/gate-read-root.md` — ✅ 存在 23028 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 53 份 · 对照机器产物 3 类 / 48 份（按 kind 分组）：

**requirement**（1 份）
- `docs/requirements/REQ-261008020617-088f/requirement.md`

**plan**（1 份）
- `docs/requirements/REQ-261008020617-088f/decomposition.md`

**verification**（1 份）
- `docs/requirements/REQ-261008020617-088f/verification.md`

**retro**（1 份）
- `docs/requirements/REQ-261008020617-088f/retro.md`

**notes**（49 份）
- `docs/requirements/REQ-261008020617-088f/design/architecture.md`
- `docs/requirements/REQ-261008020617-088f/design/migration.md`
- `docs/requirements/REQ-261008020617-088f/design/data-model.md`
- `docs/requirements/REQ-261008020617-088f/design/interfaces.md`
- `docs/requirements/REQ-261008020617-088f/design/test-cases.md`
- `docs/requirements/REQ-261008020617-088f/reviews/verification-review.md`
- `docs/requirements/REQ-261008020617-088f/tests/evidence.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-3ac912.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-bdc020.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-56cf20.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-b602f1.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-8ba560.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-89c4b2.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-713e3f.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-920291.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-fa4275.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-3b104c.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-0786cd.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-ce4694.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-68f2a5.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-6a958f.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-a5c088.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-56f055.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-6334ba.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-b45bdc.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-2392a4.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-43b907.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-1acef2.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-4015d5.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-5e3012.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-09c338.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-d2890d.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-9b13d3.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-4f8221.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-2abc03.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-02e835.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-d18c15.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-bfcceb.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-01fbef.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-987ec0.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-c0a71e.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-54f247.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-afafc8.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-903c9a.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-7c3395.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-dca1de.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-911edb.md`
- `docs/requirements/REQ-261008020617-088f/tasks/t-a019a3.md`
- `docs/requirements/REQ-261008020617-088f/archive.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 48 份 · 共 475574 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 85750 字节
- 追溯报告目录（rtm-*/） · 41 个 · 80845 字节
- 台账镜像（queue.json） · 1 个 · 308979 字节
  - 摘要：任务 41 · 依赖边 43 · 就绪 0 · 生成时间 2026-10-07T18:16:51.870Z · 308979 字节

## 说明书更新点

- `docs/architecture/project-manual.md#机制备忘-层边界收口-端口面与豁免面-2026-10-08-req-261008020617-088f` — 新增四行口径表（RTM 门单点 / HostFsPort 与 FileHostFs / diag-log 门面与 FileDiagSink / 豁免台账四条判据）与两条可复用教训（强转 as unknown as UseCaseDeps 的夹具会掩盖必填端口；node:path.isAbsolute 逐平台），并在「变更记录」表补一行指向本需求。
- `docs/architecture/gate-read-root.md#契约-唯一收敛入口` — 契约表补一行「适用面（2026-10-08 起）」：三份 RTM 门合并为 rtm-gates.ts 后由传 workspaceRoot 字符串改为传 DocRepository，故同样受本页的根校正纪律约束。

## 相关

- 需求：`REQ-261008020617-088f`（refactor）
- 归档目录：`docs/requirements/REQ-261008020617-088f`
- 渲染时刻：2026-10-08T04:23:04.238Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
