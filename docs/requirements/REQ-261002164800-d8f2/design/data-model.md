---
serves: FR-2, FR-3, FR-4, FR-5, FR-7
---

# 数据模型：refs 字段、兼容口径、回填报告 serves: FR-2, FR-3, FR-4, FR-5, FR-7

> 本次**不改存储介质、不升 schema 版本**：只新增可选字段与一条回填路径，旧数据零迁移即可读。

## PlanTask 增字段 serves: FR-2

| 字段 | 类型 | 必填 | 默认 | 约束 |
|---|---|---|---|---|
| `requirement_refs` | `string[]` | 否 | 缺省（不写空数组） | 每项匹配 `^(?:FR\|BUG\|RF\|SP\|DOC\|CH)-\d+$`；去重；非法即拒 |

- `PlanTask`（`protocol.ts`）与 `normalizePlanTasks` 同步增字段：**保留**并校验，不再白名单丢弃。
- 提交计划时即校验（`reqboard_submit(kind=plan)`），错误码 `REQBOARD_BAD_REQUIREMENT_REF`，点名 `key` 与非法值。
- 兼容：存量台账 `plan.tasks` 无该字段 ⇒ 读为"无显式 refs"，由文档覆盖表兜底（FR-3）。

## TaskRecord.requirementRefs 语义 serves: FR-2, FR-3, FR-4

| 状态 | 含义 | 谁写 |
|---|---|---|
| `["FR-1","FR-2"]` | 该卡承接这两条 | 建卡（`plan-landing`）或补写用例（`AmendTaskRefs`） |
| `[]` / 缺省 | 无落点（合法：纯文档/维护卡） | 同上 |

- 该字段是 **RTM `serves` 的唯一来源**（`rtm-yaml.ts:57`），因此：
  - 建卡时必须写对（这次修的目标）；
  - 落库后仍可补写（FR-4）；
  - 读数必须取自**真实任务记录**（FR-7）。
- 兼容：旧队列无该字段 ⇒ 读为 `[]`；不批量改写旧文件（改写由 FR-5 回填负责，且只补有来源者）。

## 文档覆盖表契约（第二数据源） serves: FR-3

- 载体：`docs/requirements/<REQ>/decomposition.md` 的「覆盖对照表」区块，列头含「需求条款」「接收任务」。
- 解析：复用既有 `taskRefsFromDecomposition`（不新增解析器，避免两份真相）。
- 语义：`接收任务` 列里出现的**计划 key**（如 `t2、t3`）⇒ 该 key 承接对应 FR。
- 优先级：显式 `requirement_refs` > 文档表；同 key 两者都有时**显式优先**，文档表不再覆盖（与现状 `planRefsFromDoc` 的"仅在缺失时补齐"一致）。

## 兼容与版本 serves: FR-2, FR-3

- schema 版本不变（queue 仍 `schemaVersion: 9`）；两个字段均为可选 ⇒ 新旧版本可互读。
- 回滚：代码回退后，新增字段被旧代码忽略（`PlanTask` 旧解析器丢字段、`TaskRecord` 旧代码不读该字段），数据不损坏。
- 在途约束：v10 分片迁移（REQ-261002161439-277d）进行中，本设计只经 `TaskStore` 端口读写；不引入新的文件格式。

## 读数口径（一处事实） serves: FR-7

```
落库返回体的 task_coverage[i].covers_frs  ←  TaskRecord.requirementRefs（真实记录）
rtm-implementing/<task>.yml 的 serves      ←  同上
看板「未被接收（红）」                      ←  文档覆盖表（collectTaskRefs，既有读法）
```

- 前两者本次统一到真实记录；第三者保持文档读法（人写的那份表）。
- **新增一致性读数**：`landApprovedPlan` 返回 `sources`，落库后若 `sources[key]='doc'`，说明该卡 refs 来自文档表；若 `'none'` 则进 `unrefed`。
- 修正项：`plan-landing.ts:318` 现把 `LandedTaskRef[]` 当 `TaskRecord[]` 喂 `generateRTMData` ⇒ 读数恒空。改为按 `createdIds` 从 `TaskStore` 取真实记录后传入。

## 回填报告数据形 serves: FR-5

```jsonc
{
  "generated_at": "2026-10-02T…Z",
  "dry_run": false,
  "requirements": [
    {
      "requirement_id": "REQ-261002161439-277d",
      "status": "implementing",
      "candidates": [ { "task_id": "t-ccddb3", "key": "t2", "refs": ["FR-1","FR-5"] } ],
      "unresolved": [ { "task_id": "t-07b058", "key": "t10", "why": "覆盖表未写该 key" } ],
      "skipped":    [ { "task_id": "t-1dac0f", "why": "子卡：随父卡" } ],
      "applied": 10
    }
  ],
  "totals": { "candidates": 0, "unresolved": 0, "applied": 0 }
}
```

- 报告即**回滚凭据**：`candidates[].refs` 写入前记录原值 `before`，`--restore <report.json>` 可原样还原。
- `unresolved` 必须逐卡列出（"文档表本身没写"是事实，不许静默归零）；`skipped` 说明为何不动（子卡、已取消、已归档）。
