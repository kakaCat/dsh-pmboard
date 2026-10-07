---
req: REQ-261007135258-331a
serves: [FR-3, FR-4]
---

# 数据模型设计（REQ-261007135258-331a · 确认通道接线收敛）

> 本份回答「改不改表 / 改不改 schema、怎么迁移、怎么回滚」。结论先行：**零持久化字段变更**。

## 结论 `serves: FR-3`

**无 schema 变更、无新增字段、无数据迁移。** 本需求改的是**写入时机与责任人**
（谁在什么时候写停手位 / 健康位），不是数据结构本身。

| 持久化面 | 变更 | 说明 |
|---|---|---|
| `RequirementRecord`（热记录 + parts） | 无 | 字段集、类型、数量全不变 |
| `dive.driverHealth` | 无字段变更 | 复用既有 `{state, reason, since, attempts}`；本次只让**更多通道**够到"清成 healthy"这一步 |
| `dive.roundsInStage` | 无字段变更 | 跨阶段归零仍由既有 `applyDiveTransition('confirm-advance')` 负责 |
| `artifacts[].confirmedAt` / `confirmedVia` | 无字段变更 | 首写即事实（`stampArtifactOnce`）不动 |
| `plan.approvedAt` / `approvedVia` | 无字段变更 | 同上（`stampPlanOnce`） |
| `comments.jsonl` / `history.jsonl` | 无结构变更 | 只是**更多通道**会写出既有的两类留痕（`[自动推进]`、`[Dive 恢复]`） |
| 队列 / 任务卡 | 无 | 本需求不碰任务侧 |

## 状态与字段语义（改动后必须成立） `serves: FR-3`

| 字段 | 取值 | 语义（本需求依赖的部分） |
|---|---|---|
| `dive.activation` | `armed` / `disarmed` | **只有人能改**；收尾绝不写它 |
| `dive.driverHealth.state` | `healthy` / `paused` | `paused` ⇒ `isDrivableRequirement() === false`（不起轮） |
| `dive.driverHealth.reason` | `awaiting-confirm:<ref>` / `wake-undeliverable` / … | 前缀 `awaiting-confirm:` 是"有人在等弹框"的唯一台账形态 |
| `status` | 阶段枚举 | 推进结果；`from → to` 由 `history.jsonl` 留痕 |
| `statusHistory`（由 history 重建） | — | 每条迁移带 `reason`，本需求让四通道的 `reason` 都含来源标签 |

**不变量（INV）**：

- **INV-1**：一次确认最多产生一条状态迁移（同一 `(需求, 门)` 重复确认幂等）。
- **INV-2**：推进成功 ⇒ `driverHealth.state !== 'paused'`（除非收尾写失败——那时**响亮留痕**且下一趟心跳可再清）。
- **INV-3**：收尾**只**清 `awaiting-confirm:*` 前缀的停手位；`wake-undeliverable` 等其他原因不动（避免"顺手复活"成第二个复活点）。

## 兼容性分析 `serves: FR-3, FR-4`

| 记录形态 | 旧行为 | 新行为 | 是否需要迁移 |
|---|---|---|---|
| 常态（有 `driverHealth`，healthy） | 正常 | 正常（逐字节不变） | 否 |
| 停手位遗留（`awaiting-confirm:*` 但无在途弹框） | 看板/文字证据通道**清不掉**，等心跳 TTL 对账（≤30/60 分钟） | 任一条通道确认即清（同一次调用内） | 否（心跳对账仍保留为兜底） |
| 旧记录无 `driverHealth`（迁移前） | 读侧回落 `phase` 判定 | 不变 | 否 |
| 已落章未推进（章在、状态未动） | 只有会话通道能补推进 | 四通道都能补推进（同一实现） | 否 |
| 终态（`done`/`archived`/`canceled`） | 不参与确认 | 不变（收尾对终态零动作） | 否 |
| 看板确认时窗口离线 | `advanced:false`（只落章） | `advanced:true, delivered:false` | 否（语义变更，见 TC-4） |

## 迁移与回滚 `serves: FR-4`

**迁移**：无。理由：没有字段增删改，读取侧也不引入新键——存量记录按既有路径直接可用。
存量停手位不批量清洗（清洗会掩盖"为什么没清"），交给既有心跳对账与本次新增的统一收尾自然消化。

**灰度 / 开关**：不新增开关。理由：本需求是**接线收敛**，不改变任何既有判定语义；
若上线后发现异常，走既有回退路径（下一节）。

**回滚**：纯代码回滚（`git revert` 本次提交）即可——因为没有数据迁移，不存在"数据已被改写、
代码回不去"的情形。回滚后：

- 已清成 `healthy` 的停手位**保持 healthy**（这是常态，不是需要回滚的中间态）；
- 已按新语义推进的阶段迁移**不回收**（台账事实不可逆，回收需要人走 rollback 流程）；
- 通道回退到"各自内联"的旧形态（功能可用性不下降，只是缺口回来）。

## 与既有台账工具的相容 `serves: FR-3`

- `reqboard_status` 的 `pending_confirms` / `design_docs[].confirmed` 读数不变；
- 看板 `traceability_chain` 与 `rtm_health` 投影键不变（本需求不加键）；
- `scripts/req-doc-validate.mts` 与 `normalize-ledger-paths.ts` 不在本次改动面内。
