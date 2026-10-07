# 归档结论（REQ-261007125552-32cb 拆分粒度细化：接口级/组件级任务卡 + 设计先行）

> 归档目录：`docs/requirements/REQ-261007125552-32cb` ｜ 类型：feature
> 渲染时刻：2026-10-07T07:10:25.217Z（由归档提交注入）

## 一句话结论

拆分粒度从"凭经验"锁到接口级/组件级：设计文档交出接口清单/组件树（硬门）→ 拆分计划对照表逐条覆盖（硬门）→ 一卡多接口拒、files>5 与多锚点只警告；RTM 一对多为原生能力不改模型。

## 合并去向

- `docs/architecture/decomposition-granularity-gates.md` — ✅ 存在 6189 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/project-manual.md` — ✅ 存在 197952 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 37 份 · 对照机器产物 3 类 / 32 份（按 kind 分组）：

**requirement**（1 份）
- `docs/requirements/REQ-261007125552-32cb/requirement.md`

**plan**（1 份）
- `docs/requirements/REQ-261007125552-32cb/decomposition.md`

**verification**（1 份）
- `docs/requirements/REQ-261007125552-32cb/verification.md`

**notes**（34 份）
- `docs/requirements/REQ-261007125552-32cb/design/architecture.md`
- `docs/requirements/REQ-261007125552-32cb/design/backend.md`
- `docs/requirements/REQ-261007125552-32cb/design/data-model.md`
- `docs/requirements/REQ-261007125552-32cb/design/interfaces.md`
- `docs/requirements/REQ-261007125552-32cb/design/test-cases.md`
- `docs/requirements/REQ-261007125552-32cb/design/use-cases.md`
- `docs/requirements/REQ-261007125552-32cb/reviews/final-review.md`
- `docs/requirements/REQ-261007125552-32cb/tests/evidence.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-cbb1b8.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-9b7245.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-5e3737.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-04635a.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-7b131b.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-a99b12.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-1fb094.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-8c2a5e.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-da1879.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-9c3608.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-b8958d.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-29ef80.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-f64801.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-8f5cce.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-fb8d1c.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-a1b795.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-47dfda.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-adca1e.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-fe0e98.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-e798d7.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-4c4e32.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-b9df55.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-e9cb83.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-f6d563.md`
- `docs/requirements/REQ-261007125552-32cb/tasks/t-3024d9.md`
- `docs/requirements/REQ-261007125552-32cb/archive.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 32 份 · 共 282203 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 69232 字节
- 追溯报告目录（rtm-*/） · 25 个 · 42579 字节
- 台账镜像（queue.json） · 1 个 · 170392 字节
  - 摘要：任务 25 · 依赖边 23 · 就绪 0 · 生成时间 2026-10-07T05:18:16.215Z · 170392 字节

## 说明书更新点

- `docs/architecture/project-manual.md#机制备忘-拆分粒度三件套与两条实测词法坑-2026-10-07-req-261007125552-32cb` — 新增一节：给「输入」加门比给「输出」加限制更有效（设计清单 → 拆分对照 → 粒度门禁三步）；两条实测词法坑（表头判据是全局命名空间，对照表列名必须避开「计划 key」；covers 标注必须独立行裸写）；提示词 light 档 2500 字符预算硬约束；验收方法论——逐项结果必须带命令/计数锚点，否则人工点通过会被记 unverified。
- `docs/architecture/decomposition-granularity-gates.md#0-一句话` — 新增领域篇（L2，六个小节）：三层判据与唯一实现、七条词法契约表（含列名避让与接口声明词法）、生效口径与存量不追溯、light 档预算约束、五处可复核入口、三条可复用教训。

## 相关

- 需求：`REQ-261007125552-32cb`（feature）
- 归档目录：`docs/requirements/REQ-261007125552-32cb`
- 渲染时刻：2026-10-07T07:10:25.217Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
