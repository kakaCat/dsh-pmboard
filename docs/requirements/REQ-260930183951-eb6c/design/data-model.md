# REQ-260930183951-eb6c 数据模型设计 · 验收单自证失败修复 serves: FR-1, FR-2, FR-3, FR-4

> **是否改表 / 改 schema：否。** 台账（`requirements[].verification.sheet`）与队列文件（`queue.json`）
> 结构与版本号都不动；本次只让既有可选字段真的带上值，并新增一个可选输入字段。
>
> **重建说明**：2026-09-30 19:39 被并发写入者删除，此处按原稿重建（落章记录仍在 ledger，路径不变）。

## D-1 验收单编号契约 serves: FR-3

**字段**：`VerificationSheet.items[].id`（`string`，既有字段，语义变更＝更严）。

| 项 | 旧口径 | 新口径 |
|---|---|---|
| 任务项 | `v<ver>-<idx+1>` | `v<ver>-<n>`，`n` = 该任务在**最终顺序**中的位次 |
| 需求级项 | `v<ver>-<taskCount+1>` | 连续位次 |
| 孤儿用例 | `v<ver>-<taskCount+2>`（预留位） | 连续位次（不占位则不消耗号） |
| 不可照着验 | `v<ver>-<taskCount+3>`（预留位） | 连续位次 |
| E2E 覆盖 | `v<ver>-<taskCount+4>`（预留位） | 连续位次 |
| 三方一致性 | `v<ver>-<taskCount+5>`（预留位） | 连续位次 |
| 锚点失效 | **不存在** | 连续位次（新增项） |
| FR 追溯断链 | `v<ver>-<taskCount+6>`（预留位） | 连续位次 |

**不变量**：同一验收单内 `id` 唯一、`n` 从 1 连续到 `items.length`、**无空洞**。
**读侧契约**：`id` 对读侧是**不透明键**（只做等值引用与展示），不解析其中的数字——因此本次编号口径变更**不需要读侧改造**。

## D-2 新增输入字段：`SheetBuildInput.anchorGaps` serves: FR-2

| 字段 | 类型 | 必填 | 缺省 | 语义 |
|---|---|---|---|---|
| `anchorGaps` | `readonly string[]` | 否 | 缺省（等价 `[]`） | 锚点失效清单，元素形如 `"<任务标题或 id> → tests/foo.test.ts"` |

**落库形态**：非空时**只**产出一条 `VerificationItem`（不逐条产项，避免验收单被同类项注水）：

```jsonc
{
  "id": "v1-9",                                  // 连续位次（FR-3）
  "source": { "kind": "requirement" },
  "criterion": "验收锚点失效：以下验收标准引用的测试文件在仓库中不存在——<list>。请把锚点改为真实文件，或回写设计/任务卡；本条不阻断验收，但通过时意见须写明处置方式。",
  "evidence": ["…本轮证据…"],
  "status": "pending",
  "gapKind": "consistency"                       // 复用既有枚举值（见 D-4）
}
```

**criterion 前缀 `验收锚点失效：` 是契约的一部分**：FR-4 的标题单点靠它把"锚点失效"与"三方一致性"两个同为 `gapKind: 'consistency'` 的项区分开。改动该前缀等于同时改标题判定，须一起改（常量 `ANCHOR_GAP_PREFIX`）。

## D-3 `SheetTaskLike.parentId` 语义 serves: FR-1

| 项 | 契约 |
|---|---|
| 类型 | `parentId?: string`（既有可选字段） |
| 有值 | **子卡**——buildSheet 的 `input.tasks.filter(t => t.parentId === undefined)` 会剔除它，子卡的验收由父卡项覆盖 |
| 无值 / 空串 | **顶层卡**（父卡或存量卡）——进入验收单 |
| 生产路径 | 由 `toSheetTasks` 从队列任务透传（**本次修复点**：此前该键在生产路径上永远缺失，使上面的过滤恒真） |
| 唯一事实源 | 队列 `TaskRecord.parentId`（台账不存任务，schema v9 起任务只在队列） |

## D-4 `gapKind` 复用（不新增枚举值） serves: FR-2, FR-4

- 既有枚举：`'e2e' | 'orphan' | 'consistency' | 'traceability'`。
- 锚点失效项**复用 `'consistency'`**：语义同族（"说的与实际对不上"），避免动 `protocol.ts` 的持久化联合类型（那是需要迁移评审的改动，超出本需求边界）。
- 类别可区分性由 **criterion 前缀**保证（D-2 + I-4），不靠枚举扩展。

## D-5 兼容与迁移矩阵 serves: FR-1, FR-2, FR-3, FR-4

| 场景 | 行为 | 迁移动作 |
|---|---|---|
| 存量已生成验收单（如 2d65 的 `v1-33`） | 原样保留（`id` / 标题按生成时口径） | 无 |
| 存量单据被裁决 / 退回返工 | 走 `reworkOnly` 分支，按新口径连续重排编号；已过项保留结论 | 无 |
| 新提交验收的需求（无子卡） | 行为与旧版一致（顺序编号本就等于旧编号） | 无 |
| 新提交验收的需求（有子卡） | **行为变化**：验收单不再含子卡项（本次要修的目标） | 无 |
| 验收标准引用了不存在的测试文件 | **新增可见项**（此前静默） | 无 |
| 台账 schema / 队列 schema | 零变更 | 无 |
| 回滚 | 还原源文件即可；已生成的单仍可正常读（`id`、`gapKind` 均为读侧可选/不透明） | 无 |
