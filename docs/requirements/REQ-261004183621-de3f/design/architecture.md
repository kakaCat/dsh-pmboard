---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6]
sides: [backend]
---

# 设计 · 架构（REQ-261004183621-de3f 归档清单对账）

## 现状与改动面 `serves: FR-1, FR-2`

**现状（已核实）**

| 事实 | 位置 |
|---|---|
| 提交先校验材料 → 写台账 → 登记 archive 产物 → **最后才**遍历目录算未列，且只警告不拦 | [SubmitArchive.ts:92-99](../../../../src/application/use-cases/SubmitArchive.ts#L92-L99)、[:159-186](../../../../src/application/use-cases/SubmitArchive.ts#L159-L186) |
| 未列判定的口径：`listedPaths.has(workspacePath) \|\| listedPaths.has(relPath)`；跳过点文件 | [SubmitArchive.ts:164-176](../../../../src/application/use-cases/SubmitArchive.ts#L164-L176) |
| 「只警告不拦」是**刻意**的（注释：归档材料可能有意只收关键文档） | [SubmitArchive.ts:159-160](../../../../src/application/use-cases/SubmitArchive.ts#L159-L160) |
| 归档记录形状（无对账字段） | [protocol.ts:825-842](../../../../src/shared/protocol.ts#L825-L842) |
| 补录先例：单一写入口 + 全量替换语义 + 幂等 + 留痕 | [AmendTaskRefs.ts](../../../../src/application/use-cases/AmendTaskRefs.ts) |
| 看板归档面读 `req.archive?.docs` | [verification.ts:74-75](../../../../src/client/views/verification.ts#L74-L75) |

**改动面**：`SubmitArchive`（对账前移 + 三分类 + 拒绝）、新增豁免常量（domain）、新增补录用例（照 `AmendTaskRefs` 先例）、`SubmitTool` schema、看板归档面、`plugin-config`（回退开关）。

**不动**：`assertArchiveMaterials` 的必填/合并去向规则、金字塔生长（`manual_updates`）、`merged_into` 校验、需求状态机。

## 对账三分类的实现落点 `serves: FR-1, FR-2`

```
submitArchive(deps, args, exec)
  ① 解析与校验（docs / merged_into / manual_updates …）        ← 不变
  ② assertArchiveMaterials                                    ← 不变
  ③ 【新】对账：walk(dir) → { listed, exempted, unlisted }      ← 由「事后」前移到「写台账之前」
  ④ 【新】闸门：unlisted 非空且未被 unlisted_ack 覆盖 → 拒绝（零台账改动）
  ⑤ mutate 台账（archive 记录含 ③ 的结果）                      ← 由 ③ 的结果写入
  ⑥ 登记 archive 产物、沉淀知识条目、写留痕评论                  ← 不变（评论内容加对账摘要）
  ⑦ 返回体给出三份清单（unlisted_files/warning 保留兼容）        ← 语义不变、来源改为 ③
```

- **单次遍历**：③ 只 walk 一次，⑤⑥⑦ 复用同一结果（不重算——重算就是第二份口径）。
- **拒绝点必须在 ④**：现有实现是"先归档再警告"，改成"先拦后写"，否则会出现"拒绝了但台账已写"的半截状态。
- **`warn` 模式**：④ 只在 `enforce` 下拒绝；`warn` 时跳过拒绝但照常把结果写进记录与评论。

## 豁免规则常量（domain 纯数据） `serves: FR-3`

新模块 `src/domain/requirement/archive-exemptions.ts`：

```ts
export interface ArchiveExemptionRule {
  readonly id: string
  /** 相对需求目录的匹配（前缀目录或文件名通配，语义由 matchesArchiveExemption 单点实现）。 */
  readonly match: { readonly dir?: string; readonly glob?: string }
  readonly reason: string
}
export const ARCHIVE_EXEMPTIONS: readonly ArchiveExemptionRule[] = [
  { id: 'rtm-reports', match: { glob: 'rtm-*.yml' }, reason: '追溯报告由工具重建（每个需求必然一堆）' },
  { id: 'rtm-dir',     match: { dir: 'rtm-*' },       reason: '同上（分任务报告目录）' },
  { id: 'ledger-mirror', match: { glob: 'queue.json' }, reason: '台账镜像，工具重建' },
  { id: 'runtime-state', match: { dir: 'state' },      reason: '运行态留痕，工具重建' },
] as const
export function matchArchiveExemption(relPath: string): ArchiveExemptionRule | undefined
```

- **domain 无 IO**：只做字符串匹配（相对路径输入）。
- **不豁免**：`tasks/**`、`evidence/**`、`design/**`、`tests/**`、`reviews/**`、`*.md`（人写的工作记录与证据正是清单该收的）。
- 单点：`rtm-implementing/t-x.yml` 命中 `dir: 'rtm-*'` 前缀（实现按"路径任一段以 `rtm-` 开头"匹配，见 interfaces）。

## 补录通道的架构位置（单一写入口） `serves: FR-4`

新增 `src/application/use-cases/AmendArchiveManifest.ts`（照 `AmendTaskRefs` 的三条硬口径改造成**追加**语义）：

| 维度 | 口径 |
|---|---|
| 入口 | 工具（`reqboard_archive_amend`）+ 看板路由（归档页按钮）**共用同一用例** |
| 语义 | **只追加**：`docs[]` 增量；同 path 已存在 → 跳过（`skipped`） |
| 状态守卫 | 需求必须 `archived`（或 legacy `done`）；其它状态拒绝 |
| 留痕 | 需求评论一条（谁/何时/补了哪些/为什么） |
| 不碰 | `verification.md` 等产物文件、`merged_into`、`manual_updates`、需求状态 |
| 幂等 | 同一批再调 → 全部 `skipped`，队列/台账写入序号不变 |

**为什么不复用 `submitArchive`**：那个用例的语义是"提交一份归档材料"（含必填校验、知识沉淀、状态自动化），补录只是"清单追加"；混在一起会让"重交是否覆盖"变得含混（同一 path 的幂等键冲突）。

## 可见性：台账字段 + 评论 + 看板 `serves: FR-5`

```
archive.reconcile = { gate, listed, exempted, unlisted, at }      ← 新增（数据契约见 data-model.md）
需求评论：归档/补录时写一条对账摘要（计数 + 未列明细前 N 条）
看板：client/views/verification.ts 的归档区块新增「对账」行（三份计数 + 未列明细折叠）
```

- 看板**只读展示**：读失败不影响归档主流程（沿用现有"展示失败不阻断"口径）。
- 存字段而非只写评论：评论是留痕（审计），字段是查询面（看板/接口不必解析自然语言）。

## 行为变更、灰度与回滚 `serves: FR-6`

| 项 | 设计 |
|---|---|
| 行为变更 | 未列未豁免：**警告 → 拒绝**（缺省 `enforce`） |
| 灰度 | `archive.unlistedGate: 'enforce' \| 'warn'`（缺省 `enforce`；`warn` = 旧语义 + 新增留痕） |
| 非法配置 | 装配期抛错（与 `knowledge.autoBootstrap` 同口径，不静默回缺省） |
| 回滚 | 配置回 `warn`（保留对账与留痕，信息量不低于旧版）；revert 提交 = 完全回旧 |
| 存量归档 | 不追溯、不批量补录；需要时对个别需求走补录通道 |
