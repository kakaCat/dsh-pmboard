# 数据模型设计（REQ-261007095750-9f48）<!-- serves: FR-1, FR-2, FR-3 -->

> 「数据层与回滚」在本需求的结论是**几乎没有**：不改表、不改 schema、不加字段。
> 本文把这件事**证明**清楚（而不是含糊带过），并写明受影响的投影形状与真实数据样本口径。

## 1. 结论：本次不新增 / 不修改任何字段或表 <!-- serves: FR-1 -->

| 维度 | 结论 | 依据 |
|---|---|---|
| 新增字段 | **0** | 改动只有 `PATH_RE` 正则；`declaredFiles` 出入参形状不变（`design/interfaces.md` §1） |
| 修改字段 | **0** | `WorkSurfaceTask` / `WorkSurfaceConflict` 一字未动 |
| 新表 / 新文件格式 | **0** | 无持久化层改动；不写盘 |
| schema 版本 | **不变** | 台账 schema 与本需求无关 |
| 数据回填 | **不需要** | 判据是**读时计算**的：每次提交现算，不缓存、不落库（这是它不需要迁移的原因） |

**为什么"读时计算"是关键**：如果把抽取结果落库，扩根就变成一次数据迁移（要回填旧记录、要版本兼容）；
正因为它是纯函数读时算，本次才能做到"改一行正则 + 零迁移 + 可精确回滚"。

## 2. 受影响的内存投影（形状不变，含义变宽）<!-- serves: FR-2 -->

```
TaskRecord.implementation   ← 台账里的卡（plan.json 的 tasks[].implementation，人写的实施说明）
        │  declaredFiles()   ← 本次唯一改动点（口径变宽）
        ▼
Set<string> declaredFiles   ← 内存投影：该卡声明的文件集合
        ├─▶ WorkSurfaceConflict[]  { file: string, keys: [string, string] }
        └─▶ dependency_warnings: string[]
```

| 投影 | 形状 | 本次变化 |
|---|---|---|
| `declaredFiles(t.implementation)` | `string[]` | 元素可能更多（`src/**`、`.mts` 现在抽得到）——**类型与去重语义不变** |
| `WorkSurfaceConflict` | `{ file, keys: [string, string] }` | 形状不变；`file` 的取值域变大 |
| `dependency_warnings` | `string[]`（人读文本） | 形状不变；出现频率可能上升（正是修复目的） |

**不落库的推论**：同一份计划在扩根前后**重复提交**可能得到不同结论（改前绿、改后红）——
这是**判据变严**，不是数据不一致；处理方式见 §4「存量口径」。

## 3. 真实数据样本与计数口径（FR-3 的"读数"从哪来） <!-- serves: FR-3 -->

| 项 | 口径 |
|---|---|
| 样本源 | `docs/requirements/*/decomposition.md` 里的**任务表行**（计划文档的任务表，不是台账卡） |
| 取样条件 | 该行 `implementation` 单元格文本含 `src/` 字样 |
| 分母 | 命中取样条件的行数（上一需求实测 **530**） |
| 分子 | 其中 `declaredFiles(该单元格)` 至少抽出一条的行数（上一需求实测 **429 行抽不到** ⇒ 分子 ≈ 101） |
| 对照 | 同一批样本在**改前正则可执行的历史产物**上的读数（上一需求评审给出的 101/530 = 19% 即改前基线） |
| 零交集边命中 | 用同一批行的 `key`/`depends_on` 组装 `WorkSurfaceTask[]`，统计 `zeroOverlapDependencyWarnings` 的条数（改前 / 改后） |
| 冲突门命中 | 同上组装，统计 `findWorkSurfaceConflicts` 的条数（改前 / 改后）；新增命中要逐条判真伪 |

**读数纪律**：两个数字（比例、命中数）必须**同批样本、同一命令、可复跑**；
不许只报"改后变好了"而不给改前基线（上一需求评审抓到的正是这种"只有结论没有基线"）。

## 4. 迁移、兼容与回滚 <!-- serves: FR-1, FR-3 -->

| 维度 | 结论 |
|---|---|
| 迁移脚本 | 无（无数据变更） |
| 兼容窗口 | 不需要灰度：判据在提交时现算，越早拦越便宜 |
| 存量口径 | **不回溯**：历史计划不回改；扩根只影响**新提交**的计划。历史"本该红"的情况如实报数，不补判决 |
| 回滚 | 还原 `PATH_RE` 的根与扩展名（一处）即精确回到今天；无残留状态需要清理 |
| 回滚后遗症 | 无（除"这两个小时内的新计划曾按更严口径判过"——若因此被拦，处置是改计划而非放宽口径） |

## 5. 明确不改的数据面 <!-- serves: FR-1 -->

- 不新增 `dep_reasons` / `skipIntegrationReason` 之外的字段（那两个字段是上一需求的，形态见`design/interfaces.md`）；
- 不改 `TaskRecord.requirementRefs`、不动 RTM 生成物结构；
- 不改 `docs/requirements/<REQ>/queue.json` 的形状（台账镜像与本需求无关）。
