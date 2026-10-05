---
serves: FR-1, FR-4, FR-5, FR-6
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [backend]
---

# 设计 · 数据模型（REQ-261004183621-de3f 归档清单对账）

## ArchiveRecord 增量字段 `serves: FR-1, FR-5`

在 [ArchiveRecord](../../../../src/shared/protocol.ts#L825-L842) 上**新增两个可选字段**（不改既有字段语义）：

```ts
export interface ArchiveReconcile {
  /** 生效的闸门（如实记录当次行为，便于事后解释"为什么这次没拦/拦了"）。 */
  gate: 'enforce' | 'warn'
  listed: string[]                                      // 已列（= docs 的 path）
  exempted: Array<{ path: string; rule: string }>        // 命中豁免规则（rule = 规则 id）
  unlisted: string[]                                     // 未列（事实）
  acknowledged: Array<{ path: string; reason: string }>   // 显式豁免声明（处置）
  at: number
}

export interface ArchiveAmendment {
  /** 本次追加的清单条目。 */
  docs: ArchiveDoc[]
  reason: string
  at: number
  by: ActorRef
}

export interface ArchiveRecord {
  // …既有字段不变…
  /** 首次提交时的对账结果（缺省 = 本次改动之前归档的存量记录）。 */
  reconcile?: ArchiveReconcile
  /** 补录留痕（只追加；缺省 = 从未补录）。 */
  amendments?: ArchiveAmendment[]
}
```

| 字段 | 类型 | 必填 | 缺省 | 谁写 |
|---|---|---|---|---|
| `reconcile` | `ArchiveReconcile` | 否（存量记录没有） | 无 | `submitArchive`（首次对账） |
| `amendments[]` | `ArchiveAmendment` | 否 | 无 | `amendArchiveManifest`（每次补录追加一条） |
| `docs` | `ArchiveDoc[]` | 是 | —— | 首次提交写；补录**追加**（不覆盖） |

## 三种清单的形状与不变量 `serves: FR-1`

| 清单 | 形状 | 不变量 |
|---|---|---|
| `listed` | `string[]`（工作区相对路径，与 `docs[].path` 同集合） | `listed === docs.map(d => d.path)`（同一事实，不各存一份） |
| `exempted` | `Array<{path, rule}>` | 每条必带 `rule`（命中规则 id）；`rule` 必须存在于 `ARCHIVE_EXEMPTIONS` |
| `unlisted` | `string[]`（事实：既没进清单、也没命中豁免） | 与 `listed`、`exempted.path` **不相交** |
| `acknowledged` | `Array<{path, reason}>` | `path ⊆ unlisted`；`reason` 非空 |

**集合等式（单测主断言）**：

```
listed ∪ {exempted.path} ∪ unlisted = 目录内文件全集（跳过点文件）
```

## 补录的数据语义 `serves: FR-4`

| 项 | 口径 |
|---|---|
| 追加粒度 | 一次调用 = 一条 `ArchiveAmendment`（含本次 `docs` 增量 + reason + 时间 + 操作者） |
| 与 `docs` 的关系 | `archive.docs` 追加；`amendments` 记录"哪一次追加了什么" → 可复原清单的演进 |
| 幂等键 | `path`（已存在 → 跳过；`amendments` **不新增**空条目） |
| 全量替换？ | **不**——与 `AmendTaskRefs` 刻意不同：清单是历史记录，"删条目"不在本需求范围 |
| 去重 | 同一批内重复 path → 只追加一次（保序：按传入顺序） |
| 上限 | 单次 ≤200 条；累计不做上限（受 400 字符/路径约束） |

## 留痕与可见性 `serves: FR-5`

| 面 | 内容 | 约束 |
|---|---|---|
| 需求评论 | 一条对账摘要：`gate`、三份计数、未列明细前 8 条 + `等 N 条`、豁免明细前 3 条 | 复用既有评论写入路径（`createdBy` 如实标注 agent/human） |
| 补录评论 | 一条：补了 N 条（列前 8）、原因 | 同上 |
| 看板 | 归档区块新增「对账」行：`已列 N · 豁免 N · 未列 N · 闸门=…`；未列非空时展开明细 | 只读；读失败不阻断归档主流程 |
| 接口 | 需求详情返回体带 `archive.reconcile`（已有 `archive` 透传，无需新增字段） | 老客户端忽略未知字段 |

## 兼容与迁移 `serves: FR-6`

| 场景 | 行为 |
|---|---|
| 存量已归档需求（无 `reconcile`） | 不追溯、不补算；看板显示"未对账（本功能上线前归档）" |
| 老客户端 | 读不到 `reconcile` 即忽略；`unlisted_files` / `warning` 保留 |
| 本需求自身归档 | 走新流程（首次提交即对账；若有未列会当场被拦——预计不会，因为清单会列全） |
| 回滚 | 配置 `warn` → 语义回旧（字段仍写，信息更多）；revert 提交 → 完全回旧（字段消失，老记录无影响） |
| 写入前校验 | 台账写入前必须已有对账结果（拒绝路径零写入）——单测断言"拒绝后队列/台账序号不变" |
