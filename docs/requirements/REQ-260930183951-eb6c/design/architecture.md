# REQ-260930183951-eb6c 架构设计 · 验收单自证失败修复 serves: FR-1, FR-2, FR-3, FR-4

> **TL;DR**：三处小改 + 一处新探针，把「验收单可用」这一前提补回来——
> 任务投影真的带 `parentId`（FR-1）、锚点失效变成可见项（FR-2）、系统项连续编号（FR-3）、
> 需求级项标题可区分（FR-4）。**不动任何既有判定语义，不改台账结构，无数据迁移。**
>
> **重建说明**：本文件 2026-09-30 19:39 被并发写入者从磁盘删除（`docs/` 树被整体替换），
> 此处按原稿重建（落章记录仍在 ledger，路径不变）。

## 总览 serves: FR-1, FR-2, FR-3, FR-4

| 症状（现状） | 代码位置 | 本需求动作 | FR |
|---|---|---|---|
| 验收单给 domain 的任务只有 `{id,title,acceptance}`，`parentId` 被丢掉 → domain 二次过滤恒等通过 | `SubmitVerification.ts` | 抽出投影单点 `toSheetTasks`，保留 `parentId` | FR-1 |
| 验收标准引用不存在的 `tests/*.test.ts` 时无人知晓，人照抄执行直接失败 | 无（缺口） | 新增探针 `collectMissingAnchors` + 一条不阻断的可见项 | FR-2 |
| 系统项写死预留位 `taskCount+2..+6`，未触发即留空洞（`v1-30 → v1-33`） | `AcceptanceSheetSpec.buildSheet` | 编号改为按最终顺序连续 | FR-3 |
| 需求级来源的项标题统一渲染成「需求级验收」，三处硬编码同名 | `SubmitVerification.ts`、`verification-doc-writer.ts`、`AcceptSheet.ts` | 标题收敛到 domain 单点，按缺口类型区分 | FR-4 |

## A-1 问题定位：为什么「双保险」只有一层是真的 serves: FR-1

```
SubmitVerification（调用方）                 AcceptanceSheetSpec（domain）
  targetTasks.filter(parentId === undefined)   input.tasks.filter(parentId === undefined)
        │  ← 这一层是真的（前提：队列里的 parentId 有值）
        └── map(t => ({id, title, acceptance}))   ← 这里把 parentId 丢了
                        │
                        └──► domain 侧拿到的每个 task.parentId 都是 undefined
                             → 过滤条件恒真 → 二次过滤是死代码
                             → 只有「直接调 buildSheet 并手工传 parentId」的测试能证明它"存在"
```

结论：**不能靠"再写一条经 use case 的父子卡用例"来证明 FR-1**——只要调用方那层还在，该用例删掉投影也不会变红。所以 FR-1 拆成两条断言：投影单测（可证伪）+ 全链路行为用例（防回归）。

## A-2 改动落点与数据流 serves: FR-1, FR-2, FR-3, FR-4

```
SubmitVerification（application/use-cases）
  ├─ toSheetTasks(targetTasks)            ← 新增单点：剔 canceled + 保留 parentId（FR-1）
  ├─ collectMissingAnchors(docs, tasks)   ← 新增探针：锚点存在性（FR-2）
  └─ buildSheet({ tasks, …, anchorGaps }) ← 新增可选输入（FR-2）
                │
                ▼
        domain/workflow/AcceptanceSheetSpec.buildSheet
          ├─ 任务项：只收 parentId === undefined（既有语义不变）
          ├─ 需求级项 + 系统项（孤儿 / 不可照着验 / E2E / 三方一致性 / 锚点失效 / 追溯断链）
          └─ 编号：一次性按最终顺序连续分配（FR-3）
                │
                ▼
        需求级项标题：requirementItemTitle(criterion, gapKind)   ← 新增单点（FR-4）
          消费者三处：SubmitVerification 渲染 · verification-doc-writer 回填 · AcceptSheet 弹框
```

## A-3 单一事实源 serves: FR-1, FR-2, FR-3, FR-4

| 关注点 | 单点位置 | 消费者 | 为什么必须单点 |
|---|---|---|---|
| 台账/队列任务 → 验收单任务投影 | `application/internal/sheet-tasks.ts`（`toSheetTasks`） | `SubmitVerification` | 投影散落 = 字段丢一次没人发现（本次事故正是如此） |
| 验收单编号 | `domain/workflow/AcceptanceSheetSpec.buildSheet` | `SubmitVerification`、verdicts、看板 | 编号是人对单据的引用键，口径必须唯一 |
| 需求级项标题 | `domain/workflow/AcceptanceSheetSpec.requirementItemTitle` | 上述**三处**调用点 | 三处各写一份「需求级验收」= 本轮重名的直接成因 |
| 锚点存在性探针 | `application/internal/content-gate-wiring.ts`（与 orphan / e2e / consistency 探针同址） | `SubmitVerification` | 同类探针同址，读一次工作区即可（`docs.exists` 同步） |

## A-4 边界与不做 serves: FR-1, FR-2, FR-3, FR-4

- **不改判定语义**：`applyVerdicts`（`passed` 必填实际结果）、断链提示项、`statusHistory` 读法一律不动。
- **不回填历史单据**：编号与标题的新口径只作用于**新生成**的验收单；存量 `items[].id` 原样保留（`id` 对读侧是不透明串）。
- **不改持久化结构**：不新增必填字段、不新增枚举值、不改台账 schema。
- **不引入新端口**：锚点探针用既有的 `DocRepository.exists(relPath)`（同步、无 I/O 装配变更）。
- **不代 2d65 重走验收**：重建生效 + 重交 verification 属运维动作，只作为本需求验收时的验证步骤执行一次。

**升级信号（出现即停手升重档）**：需要改 `VerificationItem` / `VerificationSheet` 持久化结构、需要改裁决 API 契约、锚点探针需要新的文件系统端口。

## A-5 数据层与回滚 serves: FR-1, FR-2, FR-3, FR-4

- **是否改表 / 改 schema**：**否**。台账（`requirements` / `verification.sheet`）与队列文件结构零变更；本次只是把既有可选字段 `SheetTaskLike.parentId` 真的传值，并新增一个**可选**的 `SheetBuildInput.anchorGaps`。
- **迁移方式**：无。存量需求下次提交验收时自然按新口径生成新单；历史单不动。
- **回滚路径**：还原改动的源文件 + 撤销新增测试即可，无数据迁移、无补偿脚本。回滚后旧单仍可正常裁决（`id` 与 `gapKind` 都是读侧可选/不透明）。
