# 归档结论（REQ-261007200706-89b7 修复 reqboard 体检第二批文案契约漂移（G1/G2/G3/G6/G7/G8/G9））

> 归档目录：`docs/requirements/REQ-261007200706-89b7` ｜ 类型：refactor
> 渲染时刻：2026-10-07T17:05:44.990Z（由归档提交注入）

## 一句话结论

agent 可见文案不许漂移：七组文案/契约漂移（死路径、手写问数、submit「五类」漏 prototype、历史叙事、长文本注记误挂、拦截清单枚举、monorepo 残留）清零，并把「路径可达 + 禁词前缀」探针挂进 prompts:check——文案修复从"靠体检发现"变成"提交即被拦住"。

## 合并去向

- `docs/architecture/project-manual.md` — ✅ 存在 218260 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）
- `docs/architecture/prompt-context-layering.md` — ✅ 存在 10108 字节（生效根 /Users/mac/Documents/ai/dsh/dsh-pmboard，判据来源 by=project-id）

## 人读材料

清单 40 份 · 对照机器产物 3 类 / 35 份（按 kind 分组）：

**requirement**（1 份）
- `docs/requirements/REQ-261007200706-89b7/requirement.md`

**plan**（1 份）
- `docs/requirements/REQ-261007200706-89b7/decomposition.md`

**verification**（1 份）
- `docs/requirements/REQ-261007200706-89b7/verification.md`

**retro**（1 份）
- `docs/requirements/REQ-261007200706-89b7/retro.md`

**notes**（36 份）
- `docs/requirements/REQ-261007200706-89b7/design/architecture.md`
- `docs/requirements/REQ-261007200706-89b7/design/data-model.md`
- `docs/requirements/REQ-261007200706-89b7/design/interfaces.md`
- `docs/requirements/REQ-261007200706-89b7/design/migration.md`
- `docs/requirements/REQ-261007200706-89b7/design/test-cases.md`
- `docs/requirements/REQ-261007200706-89b7/reviews/self-review.md`
- `docs/requirements/REQ-261007200706-89b7/tests/evidence.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-11f25a.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-2f2bdf.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-30857b.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-34f8ff.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-352e17.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-516ddb.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-540531.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-54debe.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-55c3e1.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-59aefb.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-5acdf4.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-5d876c.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-6b1057.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-6c0ef3.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-6f52a8.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-70bbad.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-7a8806.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-c15e63.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-c702ff.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-cd4f34.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-ce91f7.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-d36c56.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-dc1eaf.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-ddf3c5.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-de8c5f.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-dfca3e.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-ee9299.md`
- `docs/requirements/REQ-261007200706-89b7/tasks/t-fed418.md`
- `docs/requirements/REQ-261007200706-89b7/archive.md`

## 机器产物（可重建，折叠）

已折叠 3 类 / 35 份 · 共 338698 字节（逐文件不铺开；原文件位置与数量不变）：
- 追溯报告（rtm-*.yml） · 6 个 · 72121 字节
- 追溯报告目录（rtm-*/） · 28 个 · 43395 字节
- 台账镜像（queue.json） · 1 个 · 223182 字节
  - 摘要：任务 28 · 依赖边 30 · 就绪 0 · 生成时间 2026-10-07T13:04:32.704Z · 223182 字节

## 说明书更新点

- `docs/architecture/project-manual.md#机制备忘-长文本工具入参的写法约定-防整轮报废` — 该节末尾新增「补记（2026-10-07）：约定按语义两级化」——好指引要连适用语义一起搬（「拆成多次调用」只对幂等工具成立，挂在一次性副作用工具上=危险指引），并加上「不该在的场合不在场」的 TC-2b 反向锁与两张登记表的真实读数
- `docs/architecture/prompt-context-layering.md#九-agent-可见文案的四条纪律与机械对账-2026-10-07-req-261007200706-89b7` — 新增一节：把文案漂移当缺陷类治——派生量不手写 / 出处住代码注释 / 细则住拒绝回执 / 路径可达与禁词前缀机械对账，每条纪律指名判据与命令，并附「好判据挂不上命令等于没有」的接线教训

## 相关

- 需求：`REQ-261007200706-89b7`（refactor）
- 归档目录：`docs/requirements/REQ-261007200706-89b7`
- 渲染时刻：2026-10-07T17:05:44.990Z（归档材料提交时刻的渲染读数）
- 本文件是**渲染物，不是事实源**：内容一律由归档提交派生（FR-5 边界 3）。
