# REQ-261002105242-a3fb 归档材料

> 状态：**材料已备，待登记**（`reqboard_submit(kind=archive)` 被一个中断的确认门 pc-04ca68 挡住，
> 需要人在看板点确认或回一句「确认」由窗口走 evidence 路径落章）。
> 需求本身已于 2026-10-02 验收 8/8 通过并归档（REQ-9f4a44：验收通过即 archived；本步为材料补齐）。

## 需求目录

`docs/requirements/REQ-261002105242-a3fb`

## 文档清单

| kind | 路径 |
|------|------|
| requirement | docs/requirements/REQ-261002105242-a3fb/requirement.md |
| plan | docs/requirements/REQ-261002105242-a3fb/decomposition.md |
| verification | docs/requirements/REQ-261002105242-a3fb/verification.md |
| notes | docs/requirements/REQ-261002105242-a3fb/design/architecture.md |
| notes | docs/requirements/REQ-261002105242-a3fb/design/interfaces.md |
| notes | docs/requirements/REQ-261002105242-a3fb/design/data-model.md |
| notes | docs/requirements/REQ-261002105242-a3fb/design/test-cases.md |
| notes | docs/requirements/REQ-261002105242-a3fb/design/use-cases.md |
| notes | docs/requirements/REQ-261002105242-a3fb/reviews/self-review.md |
| notes | docs/requirements/REQ-261002105242-a3fb/tests/test-evidence.md |
| notes | docs/requirements/REQ-261002105242-a3fb/evidence/probe-live-output.txt |

## 合并去向（已真写进项目文档）

1. **`docs/architecture/archived-entry.md`**（新增 L2 领域篇）——归档需求可回看入口的完整机制：
   三层事实（盘上 / 接口 / 渲染都在，坏的只有入口）、投影契约六条约束、为什么不做归档快照、可跑判据与三项已知次优。
2. **`docs/architecture/project-manual.md`**（更新两处）——
   - L1 索引表新增一行指向上述 L2 篇；
   - 新增「机制备忘：归档不等于数据被收回（可回看入口与终态只读）」一节（含 5 条问答与判据）。

## 一句话索引条目

归档不是数据被收回：补回看板入口（泳道底部折叠归档条 + 列表终态组）、终态详情改只读，
并清掉服务端已移除端点的三处 client 残留；零持久化变更、零迁移。

## 说明书更新点

| 文档 | 章节 | 多了什么认知 |
|------|------|-------------|
| docs/architecture/project-manual.md | 机制备忘：归档不等于数据被收回（可回看入口与终态只读） | 看见归档需求的可见性由 `toReqCards` / `toTerminalCards` 两个投影决定；终态必须**显式只读**，不许靠 switch 巧合 |
| docs/architecture/archived-entry.md | 全篇（新增） | 归档需求可回看入口的机制、契约与判据；「数据本来就在，只需要入口与只读口径」这一判断 |

## 验收结论（留档）

- 验收单 8/8 通过（`reqboard_accept_sheet`：5/5 + 3/3），需求状态 → archived。
- 交付证据：`tests/test-evidence.md`（含修前必红、真实数据探针、全量回归对比、3 处偏差记账）。
- 内部自评：`reviews/self-review.md`（4 项问题 + 4 项已知次优）。
