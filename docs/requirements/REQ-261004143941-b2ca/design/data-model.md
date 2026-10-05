---
serves: FR-1, FR-3
---

# REQ-261004143941-b2ca 设计 · 数据模型（tokenTotal 的口径与缺失语义）

## 字段定义（serves: FR-1）

| 字段 | 类型 | 必填 | 出现条件 | 语义 |
|---|---|---|---|---|
| `requirement.tokenTotal` | `number`（≥0 整型） | 否 | 计算结果 `> 0` | 该需求**累计消耗** token = 各流程节点差值之和 |

**没有新增存储字段**：`tokenTotal` 是**读时投影**（派生量），不是台账字段，不进 `record.json`、不进 schema 版本、不进队列。

## 取值口径：必须与 nodes 同源（serves: FR-1, FR-3）

```ts
const tokenView = assembleRequirementToken(target, { tasks })
const tokenTotal = totalTokens(tokenView.totals)      // 四桶之和（既有单点 totalTokens）
const nodes = nodeTokensOf(tokenView)                  // 同一份视图，避免两处各算一次
// 落响应：...(tokenTotal > 0 ? { tokenTotal } : {})
```

`assembleRequirementToken` 的合计规则（既有实现，本次不改）：**节点有快照 → 用节点差值；节点无快照但其任务执行有差值 → 用执行差值兜底**。

**为什么不能用记录上的 `tokenUsage.totals`**（本需求实测踩到的坑，见 requirement.md E-5）：该字段只在**离开某阶段时**增量写入，仍在进行中的阶段不在其中。实测 `REQ-261004121649-bfa7`：record 的 `totals` = 12,650,950（仅 draft/brainstorming/design/decomposing），而 `assembling` 视图另含 `implementing` 的任务执行差值 12,173,419。若用 record 总数，用户看到的「累计」会**少掉当前正在烧的那一段**——恰是用户最关心的那一段。

**自洽性要求（可断言）**：同一响应内 `tokenTotal === Σ nodes[].tokens.total`（`nodes` 里没有 `tokens` 的节点按 0 计）。因为两者同源于一份视图，这条恒等式在实现正确时成立，测试可机械验证。

**不含什么（本次明确）**：不含子代理（subagent）会话消耗（子代理是独立 session，不在本窗口会话投影内——按人裁定另立项）；不含提示词成本折算（那是 Token tab 的估算口径，不混入本数字）。

## 缺失语义：缺失 ≠ 0（serves: FR-1, FR-2）

| 情形 | 响应 | UI |
|---|---|---|
| 有快照，累计 > 0 | `tokenTotal: <n>` | 渲染 `🪙 <fmtTokens(n)>` |
| 完全无快照（累计 = 0） | **不发该键** | **不渲染**（不出现 `🪙 0`） |
| 会话无锚定需求 | `hasRequirement: false` | 组件整体返回 `null`（既有行为） |
| 需求存在但快照部分缺失 | 按可得部分合计（缺失节点按 0 计） | 照常渲染；缺失节点明细在详情页标「无快照」 |

口径沿本仓一贯纪律（同 `TokenSnapshot` / `requirementFacts.tokenUsage`）：「取不到」与「确实是 0」在展示层必须可区分；本字段发 `0` 会被读成「这个需求一次都没花」，故**一律缺席**。

## 迁移与回滚（serves: FR-1）

- **迁移**：无。老需求记录缺 `tokenUsage` → 视图合计为 0 → 键缺席 → 与今天视觉一致。
- **回滚**：删除响应字段与渲染块即可；无写盘、无 schema 变更、无缓存失效需求。
- **性能**：与今天同级——`assembleRequirementToken` 是同步纯投影，`handleSessionProgress` 本来就要调它（`nodeTokensOf` 内部调过一次）；本次改为**同一结果复用**，请求成本不增反微降。
