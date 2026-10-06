---
serves: [FR-1, FR-2, FR-3, FR-4, FR-8, FR-9, FR-10]
---

# 数据模型设计（REQ-261005141830-7a3b）

> 需求源：`requirement.md`（FR-1~FR-11）。本份定**字段、来源、落库列、缺失语义与兼容**；
> 为什么这样分层见 `architecture.md`，签名见 `interfaces.md`。

## 新增字段：`RequirementRecord.projectId` `serves: FR-1`

| 属性 | 值 |
|---|---|
| 名称 | `projectId`（可选，`string`） |
| 语义 | 该需求所属**项目**的稳定唯一标识 = 宿主 `workspaceRegistry` 条目的 `id` |
| 来源 | 立项窗口的会话 id → `sessionIds` 反查项目条目（FR-2）；**不由人填、不由路径推导** |
| 归一 | 数字型 `id` 一律转字符串（沿用 `SessionWindowOpener.resolveSourceProject` 的口径） |
| 缺省 | 不写该键 = 未归属（存量需求、或窗口不属于任何项目） |
| 落盘 | 热记录 `record.json` 的标量字段（**不是**大字段，进摘要与索引） |

一条铁律：**根不落在需求记录上**（需求只记 `projectId`）。记录上出现 `workspaceRoot` 时，
它的角色是"存量兜底快照"，不是判据权威。

## 既有字段的角色变化：`workspaceRoot` `serves: FR-3, FR-8`

| 阶段 | 改造前 | 改造后 |
|---|---|---|
| 立项写入 | 写（会话 cwd / 第五问路径） | **仍写**（作根快照与兜底），但不再作为判据权威 |
| 读盘 / 写盘取根 | 读它当唯一权威 | 先由 `projectId` 带出项目根；**它只作 `projectId` 缺失时的兜底** |
| 跨项目判定 | 拿它与调用方根做字符串形状比较 | 不参与判定（判定比 `projectId`）；仅在任一侧缺 `projectId` 时作兜底比较 |

## 摘要投影与落库列 `serves: FR-1, FR-10`

| 位置 | 现状 | 改动 |
|---|---|---|
| `domain/requirement/RequirementSummary.ts` | `SUMMARY_KEYS` 含 `workspaceRoot`、不含 `projectId` | `SUMMARY_KEYS` 加 `'projectId'`；`factsOf` / `summarize` 各转出一行 |
| `repositories/ShardedRequirementWriter.ts` | 落 `workspace_root` | 旁边加 `project_id` |
| `repositories/SqliteRequirementWriter.ts` | 同上 | 同上 |
| `repositories/sqliteSchema.ts` | 两张表各有 `workspace_root TEXT` | 各加一列 `project_id TEXT`（幂等 ALTER，见"兼容"节） |
| `repositories/sqliteRows.ts` | 列↔字段映射表 | 加 `['project_id', 'projectId']` 与写侧 `project_id: record.projectId ?? null` |

**为什么必须进摘要**：看板按项目聚合、Dive 归属判定都在**窄投影**上做（`peekFacts()`），
`projectId` 不进摘要就等于每拍都要回读整条记录（本仓已因同类问题烧过 4h36m，见 `REQ-261004065652-5c1c`）。

## 查询过滤：`filter.projectId` `serves: FR-10`

| 项 | 内容 |
|---|---|
| 形状 | `RequirementFilter.projectId?: string`（可选，与既有可选 `workspaceRoot` 并列） |
| 语义 | 传了就只返回该项目的需求；不传 = 全量（老行为，零变化） |
| 实现点 | `ShardedRequirementStore` 与 `SqliteRequirementStore` 各一处过滤分支 |
| 用途 | 看板"本项目有哪些需求"、项目级统计、聚合校验 |

## 项目条目投影（只读，不落盘） `serves: FR-2, FR-3`

宿主注册表条目 → 本项目只取三个字段：

| 字段 | 类型 | 用途 | 缺失语义 |
|---|---|---|---|
| `id` | `string`（数字归一为字符串） | 即 `projectId` | 缺失 → 该条目不参与匹配（不编造 id） |
| `path` | `string` | 即该项目的 `workspaceRoot` | 缺失 → 视同未命中（有 id 无根 = 不可用） |
| `sessionIds` | `string[]` | 会话 → 项目的反查键 | 非数组 → 跳过该条目（沿用现有适配器口径） |

**不缓存、不落盘**：每次现取（与 `SessionWindowOpener` 的惰性解析同款口径——装配期拿不到 ≠ 永远拿不到）。
代价是一次 O(项目数) 的内存遍历；项目数是个位到十位级，可接受。

## 缺失值语义与判定优先级 `serves: FR-4, FR-8`

```
sameProjectOf(a, b):
  a.projectId 与 b.projectId 都有 ──▶ 比 id 相等 ................ by = 'project-id'
  任一侧缺 ──────────────────────▶ 比路径形状（sameProjectRoot） . by = 'path-fallback'
                                    且 attributed = false（必须向外标注）
  两侧都缺且路径也无法比较 ─────────▶ same = false, by = 'path-fallback'（不猜"是同一项目"）
```

- `attributed=false` 是**如实降级**，不是静默放行：调用方必须把 `by` 与两侧取值写进回执/评论/日志（FR-9）。
- 绝不允许"缺失 = 当前项目"的默认值——那正是历史跨项目污染的来源。

## 兼容、迁移与回滚 `serves: FR-8`

| 项 | 决策 | 理由 |
|---|---|---|
| schema 版本 | **维持 9** | 可选字段 + 读端折算（与 `seats` 同款先例，REQ-261003215944-9e04） |
| 存量记录（无 `projectId`） | **不迁移**，读端回落 `workspaceRoot` 并标注 | 用户裁定 D-3；56 条存量照常可用 |
| SQLite 老库 | 新列可空；迁移用幂等 `ALTER TABLE ... ADD COLUMN`（老库已存在同名列则跳过） | 不重建表、不丢数据 |
| 老分片 | 缺键即 `undefined`，不写回填 | 避免"读一下就改盘"的隐式写入 |
| 回滚 | 去掉端口装配 + `rootOf` 回落分支即可回原行为；字段留在盘上无害 | 无数据回滚需求 |

## 台账现状取证（设计与验收共用） `serves: FR-10`

```
$ python3 -c "import json,glob,collections,os;p=os.path.expanduser('~/.dsh/reqboard')+'/**/record.json';print(collections.Counter((json.load(open(f)).get('workspaceRoot'),json.load(open(f)).get('projectId')) for f in glob.glob(p,recursive=True)).most_common())"
[(('/Users/mac/Documents/ai/dsh/dsh-pmboard', None), 56),
 (('/Users/mac/Documents/ai/dsh/dsh-notice-webhook', None), 7),
 (('/Users/mac/Documents/ai/pi-investment/quantsys-v2', None), 6),
 ((None, None), 3)]
```

读法：**同一个项目下已经有 56 条需求**，而带 `projectId` 的是 **0 条** —— 缺的不是"能不能多条"，
是"能按项目一次问出来"。这 3 条 `workspaceRoot` 也为空的记录，就是 FR-8 里"未归属"那一桶的真实样本。
