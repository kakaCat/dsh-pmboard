# 数据模型设计（REQ-261007191737-0eb5）

> 本需求的「库」是台账 JSON（`~/.dsh/reqboard/requirements/<REQ>/verification.json` 的 `sheet.items[]`）。
> 没有 DDL、没有迁移脚本；迁移方式 = **可选字段 + 读取侧容错**，回滚方式 = 环境变量开关。

## 新增/修改的数据结构 <!-- serves: FR-2 -->

### SheetItem.opinionSource <!-- serves: FR-1, FR-2 -->

| 项 | 内容 |
|---|---|
| 字段名 | `opinionSource` |
| 位置 | `SheetItemLike`（`src/domain/workflow/AcceptanceSheetSpec.ts:165` 起）＋协议镜像 `VerificationItem`（`src/shared/protocol.ts`） |
| 类型 | `'agent' \| 'human'`，**可选**（缺席合法） |
| 约束 | 只增不改；不参与任何状态机判定（判定只看 `status` / `opinion`） |
| 写入时机 | 与 `opinion` **同一次 `mutate`**：`applySheetVerdicts` 落 `opinion` 的那处（`AcceptanceSheetSpec.ts:900-935` 区段）同时写来源 |
| 取值规则 | 裁决文本非空（弹框自填 / 看板输入 / 人改写 agent 原文）→ `'human'`；文本为空但 `humanFactForProxy(item)` 命中（**域层代写**）→ `'agent'` |
| 清除时机 | 该项被重新裁决且本次裁决**没有**文本（记 `unverified`）时一并清空，避免「状态未复核却留着上次来源」的错配 |
| 缺失语义 | 老台账 / 未产生新写入 → 按「人写 / 未知」渲染，**不得**猜成 `'agent'`（覆盖率与复盘都靠这个区分） |

```jsonc
// verification.json · sheet.items[i]（只列相关字段）
{
  "id": "v3-18",
  "status": "passed",
  "needsHuman": true,
  "humanReason": "界面视觉需人对照权威原型",
  "result": "与权威原型对照：布局一致；差异 1 处（格子取 208×n）",   // agent 提交时落章
  "resultSource": "agent",
  "opinion": "与权威原型对照：布局一致；差异 1 处（格子取 208×n）",  // 代写采纳，与 result 同文
  "opinionSource": "agent",                                     // 【本次新增】人只点了通过
  "decidedBy": { "kind": "human", "sessionId": "session-…" }
}
```

## 与 resultSource 的分工 <!-- serves: FR-2 -->

| 字段 | 回答的问题 | 谁写 | 典型组合 |
|---|---|---|---|
| `result` / `resultSource` | 「**实测结果**是谁填的」 | agent 提交时落章；人覆盖时改写并留 `resultSuperseded` | `resultSource='agent'` |
| `opinion` / `opinionSource` | 「**这条裁决结论**是谁写的」 | 裁决时写（人 / 代写） | agent 代写 → `opinionSource='agent'` |

两者**可以同时存在且方向相反**（agent 给 result、agent 代写 opinion、人点通过），因此**不能复用同一字段**——复用会让「谁裁决的」与「谁实测的」互相覆盖，复盘时无法区分。

## 兼容性与迁移 <!-- serves: FR-1, FR-3, FR-5 -->

- **向前兼容**：新增字段可选；老台账读取路径不变（所有读点都按 `opinionSource === 'agent'` 判定，缺席即非 agent）。
- **老验收单**：既有 `unverified` / 旧 `opinion` 不回填、不改写（与需求「边界·不回填存量」一致）。
- **迁移方式**：无脚本。字段在下一次裁决写入时自然出现；没有写入的项永远缺席，渲染为「人写 / 未知」。
- **回滚路径**：`DSH_REQBOARD_NO_HUMAN_PROXY` 置位 → 代写路径整段跳过（不再写 `'agent'`），已写入的 `'agent'` 保留但不再新增；行为回到今天（`humanFactForProxy` 恒返回 `undefined`）。

## 数据不变量 <!-- serves: FR-2, FR-3 -->

| 编号 | 不变量 |
|---|---|
| I-1 | `opinionSource === 'agent'` ⇒ `opinion` 非空**且**等于该项当次的 `result`（逐字），否则视为脏数据，渲染按「未知」处理 |
| I-2 | `status === 'unverified'` ⇒ 无 `opinionSource`（本次未产生文本，来源必须清空） |
| I-3 | `opinionSource === 'agent'` 只可能由「人发起的裁决」产生：agent 侧没有任何写 `status='passed'` 的通路（见 `design/backend.md` 的安全设计） |
| I-4 | 写 `opinion` 与写 `opinionSource` 必须同一次写入；写失败整体回滚，不产生「状态已通过、来源缺失」的半成品 |

## 关键决策与取舍 <!-- serves: FR-2 -->

| 取舍点 | 否掉了什么 | 为什么 |
|---|---|---|
| 新增 `opinionSource` 而非复用 `resultSource` | 少一个字段 | 见上表：两个字段回答两个不同问题，复用会互相覆盖（需求 D-4 的原话是「不得冒充人写的」） |
| 只增可选字段、不做数据迁移 | 给存量项补 `'human'` | 存量无法可靠区分（历史上人的文本可能来自 `evidence[0]` 兜底），补写等于造数据 |
| 不把来源并入 `opinion` 文本（如加前缀） | 零字段改动 | 文本会进入 `verification.md` 渲染与回执，加前缀会污染裁决原文，且客户端与文档渲染要各自剥前缀 |

## 技术方案与亮点 <!-- serves: FR-2 -->

- **同生共死**：来源字段与 `opinion` 在同一个写入点、同一次 `mutate` 内写；清除规则同样绑在 `status` 赋值处，杜绝「通过却来源残留」。
- **只读投影**：看板、`verification.md`、RTM 快照三处都只读该字段；唯一写入点是域层那一处，判据与写法各只有一份。
