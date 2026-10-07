---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 数据模型（REQ-261006201920-2adc）

> 本文档面向：开发、测试、验收。只列**新增或语义收紧**的字段；未列出的字段一律不动。

## 新增字段一览 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 字段 | 归属 | 类型 | 必填 | 默认 | 说明 |
|---|---|---|---|---|---|
| `resultSuperseded` | 验收单项 | string（≤500 字符） | 否 | 无 | 被人的覆盖动作取代的 **agent 原文**，留档用；重复覆盖时保留**最初那次** |
| `resultChangeReason` | 验收单项 | string（≤500 字符） | 否 | 无 | 人覆盖 agent 实测结果时**必须给出**的理由；不覆盖则不写 |
| `changeReason` | 裁决入参 | string | 否 | 无 | 覆盖理由的**入参形态**；仅当该次裁决构成覆盖时才被读取 |
| `requirementRefs` | 返工任务规格 | string[] | 否 | 继承来源卡 | 与 `TaskRecord.requirementRefs` 同义 |
| `prototypeRefs` | 返工任务规格 | string[] | 否 | 继承来源卡 | 不继承会让 UI 卡的返工卡被 UI 卡门禁拒绝 |
| `decisionRefs` | 返工任务规格 | string[] | 否 | 继承来源卡 | RTM `covers_decisions` 的输入 |
| `footprint` | 返工任务规格 | `CardFootprint` | 否 | 继承来源卡 | 体量声明，供超容量软门禁 |
| `acceptanceSource` | 返工任务规格 | `'criterion' \| 'origin' \| 'synthesized'` | 否 | `'criterion'` | 返工卡标准取自哪里（可追溯，供验收核对） |

## 验收单项的扩展语义 <!-- serves: FR-3 -->

`SheetItemLike` 现有字段一个不改，只**新增两个可选字段**，并收紧 `result` 的写入口径：

| 场景 | `result` | `resultSource` | `resultSuperseded` | `resultChangeReason` |
|---|---|---|---|---|
| agent 提交实测结果 | agent 文本 | `agent` | 不写 | 不写 |
| 人**不覆盖**直接通过 | 保持 agent 文本 | 保持 `agent` | 不写 | 不写 |
| 人**覆盖**且给了理由 | 人的文本 | `human` | agent 原文 | 人的理由 |
| 人**覆盖**但没给理由 | **不写**（保持 agent 原文） | 保持 `agent` | 不写 | 不写 |

**纪律**：覆盖是一个**原子三元组**（`result` + `resultSource='human'` + `resultSuperseded` + `resultChangeReason`）——
四者要么一起写、要么一个都不写。半截写入（例如翻了来源却没留原文）会让「谁填的」与「原文是什么」同时不可考。

## 状态与判据的关系（不新增状态） <!-- serves: FR-3, FR-4 -->

| 判据 | 输入 | 输出 | 落点 |
|---|---|---|---|
| 结果可复核 | 裁决文本（opinion 优先，其次 `result`） | 无锚点 → `unverified` | `applyVerdicts` |
| 人工项事实 | `needsHuman === true` 的项 + 文本 | 长度 ≤ 6 或无事实形态 → **拒绝** | `applyVerdicts`（前置校验） |
| 覆盖理由 | 入参 `changeReason` + 现有 `result` / `resultSource` | 缺理由 → **拒绝该次覆盖** | `verdicts.applyVerdicts`（应用层） |
| 处置模板 | 系统项的 `opinion` | 不命中两义模板 → **拒绝** | `applyVerdicts`（前置校验） |
| 处置完备 | 验收单 | 有未处置系统项 → **不放行归档** | `isFullyDecided` / `sheetGateStatus` |

裁决五值（`pending` / `passed` / `failed` / `not_verifiable` / `unverified`）**逐字不变**；本次只改 `passed` 的**进入条件**。

## 占位符词表（声明式闭集） <!-- serves: FR-1 -->

| token | 回填来源 | 兜底 |
|---|---|---|
| `<REQ>` | 需求 id | 必有（无兜底） |
| `<taskId>` | 本卡 id | 必有（无兜底） |
| `<本卡改动涉及的测试文件>` / `<相关测试文件>` / `<本卡接口/契约对应的测试文件>` | 父卡验收标准里点名的测试路径 | `tests/` |
| `<新增回归用例>` / `<回归用例>` / `<探针用例>` / `<自检用例>` / `<校验用例>` / `<e2e用例>` | 同上 | `tests/` |
| `<脚本>` / `<执行脚本>` | 父卡验收标准里点名的脚本路径 | `*.mts` |

**不变量**：`STAGE_ACCEPTANCE` 里出现的尖括号 token **必须全部在本表内**（用例锁死）——
否则「新落库卡占位符残留为 0」无法证明。回填产物里**不得再有尖括号 token**（回填器自检）。

## 是否改表 / 迁移与回滚 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 项 | 口径 |
|---|---|
| 改表 / schema | **否**。零 DDL；台账是 JSON 分片（`~/.dsh/reqboard/requirements/<REQ>/verification.json` 等） |
| 迁移 | **无迁移脚本**、无数据回填；新增字段全部可选，缺失即「未发生该动作」 |
| 回滚 | 还原本需求改动的源文件即可；**已写入的新字段无需清理**（旧代码读不到可选字段不会出错） |
| 历史数据 | 逐字不动；不重算、不改写任何历史验收单与任务卡 |
| 兼容下限 | 旧版看板不传 `changeReason` → 覆盖不生效、agent 原文保留、裁决照常记录（**不报错**） |

## 兼容性检查清单 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- [ ] 旧台账（无新字段）能被新代码完整读取，且不产生额外写入。
- [ ] 旧版看板/工具与新服务端混跑时不出现 500（缺 `changeReason` 是**合法**输入）。
- [ ] `TaskRecord` 的既有字段含义不变；新增字段走「加性可选、零迁移」纪律。
- [ ] 裁决五值的既有读法（`isFullyDecided` / `sheetGateStatus` / 客户端徽标）不新增取值。
