# 数据模型与契约 · REQ-261006092213-4f5b <!-- serves: FR-1, FR-3, FR-4, FR-5, FR-6, FR-8 -->

> 结论先行：**台账字段零新增、零迁移**。本需求只是把已有字段的写路径接对，
> 外加一个**瞬时输入**（工具参数 `results`，不落台账）。

## 台账字段（沿用，不改类型） <!-- serves: FR-1, FR-5 -->

| 字段 | 位置 | 类型 / 值域 | 谁写 | 语义 |
|---|---|---|---|---|
| `result` | `VerificationItem` | `string \| undefined`，≤500 字符 | agent（提交时）/ 人（裁决改动时） | 该项**实测结果**（命令 + 输出摘要） |
| `resultSource` | 同上 | `'agent' \| 'human'`（缺省 undefined） | 同上 | 结果的来源，台账据此分辨谁填的 |
| `needsHuman` | 同上 | `boolean`（缺省 undefined） | agent 提交时显式声明；原型对照项由代码标 | 该项**只能人看** |
| `humanReason` | 同上 | `string`（`needsHuman=true` 时非空） | 同上 | 为什么必须人看 |
| `status` | 同上 | `pending / passed / failed / not_verifiable / unverified` | 仅人的通道 | 裁决结论 |

这三组字段已在**三处契约**同步（`domain/SheetItemLike`、`shared/protocol.VerificationItem`、
`client/types.VerificationItem`），并有编译期断言锁（`tests/verify-item-result.test.ts` 的 A8）。
**本次不新增字段** ⇒ 不需要第四处同步，也不需要迁移。

### `resultSource='human'` 的写者（本次补上） <!-- serves: FR-4 -->

现状 `'human'` 分支**没有任何写入者**（只读展示），本次补上唯一写者：

- 人裁决时，若填入的意见文本 **≠** 该项已有 `result` → 视为"人改了结果"：
  写 `result = opinion`、`resultSource = 'human'`、同时 `opinion = opinion`。
- 若人未填 → 保留 agent 的 `result` 与 `resultSource='agent'`，`opinion` 记该项 `result`（裁决留痕）。

**「人填过不覆盖」的保护范围**（复核 F6 更正，原文档没写清）：只保护 `result` 与 `resultSource`
两个字段——`needsHuman` 与 `humanReason` 是「谁能看」的属性，**不属于**「谁填了结果」，
agent 重交时照常写入；否则人工项上的"必须人看"标记会被静默丢掉。

**`needsHuman` 的落库条件**（复核 F5）：只在 `humanReason` 非空时写入。宁可整条不写，
也不留 `needsHuman=true` 而理由空的半截记录（`applyStructuredResults` 与 `matchStructuredResults`
两处同守此约：前者不写，后者报 `empty`）。

这条规则让"来源可辨"落地：台账里 `agent 实测` 与 `人工填写` 不再是死分支。

## 状态语义（底线恢复真实） <!-- serves: FR-6 -->

| 状态 | 判定 | 能否归档 |
|---|---|---|
| `passed` | 有结果（`opinion` 或 `result` 非空）且人选通过 | 是 |
| `unverified` | 人选通过但**两者皆空**（新口径下不再回退整单证据） | **否**（不计入通过） |
| `not_verifiable` | 人给原因（不可验收 / 不适用） | 是（算已裁决） |
| `failed` | 人给意见 | 否（触发返工） |
| `pending` | 未裁决 | 否 |

**放行判据**：`items` 中不存在 `pending` 且不存在 `unverified` ⇒ 可归档。

## 输入形状：`results`（瞬时，不落台账） <!-- serves: FR-1, FR-2 -->

```jsonc
"results": [
  { "ref": { "kind": "task", "taskId": "t-7c41a9" }, "result": "npx vitest run tests/x.test.ts → 4 passed" },
  { "ref": { "kind": "requirement" },               "result": "全量回归 ≤ 基线；文档齐" },
  { "ref": { "kind": "prototype-compare", "prototypePath": "prototypes/verification-result.html#FR-4" },
    "needsHuman": true, "humanReason": "界面视觉需人对照权威原型" }
]
```

- `ref` 是**判别联合**，成员与 `VerificationItemSource` 一一对应（`task` / `requirement` /
  `prototype-compare` / `decision-compare`），**不发明第二套键**。
- 每项必须**二选一**：给 `result`（非空），或给 `needsHuman:true` + 非空 `humanReason`。
  两者都缺 = 漏项；两者都给 = 视为需要人看（`needsHuman` 优先），并保留 `result` 供人参照。
- `results` 不落台账：它的投影就是上表的 `result` / `resultSource` / `needsHuman` / `humanReason`。

## 契约三处 + 一处编译锁 <!-- serves: FR-1 -->

| 处 | 文件 | 本次改动 |
|---|---|---|
| domain | `src/domain/workflow/AcceptanceSheetSpec.ts` | 无字段改动；新增/调整纯函数 |
| protocol | `src/shared/protocol.ts` | 无字段改动 |
| client | `src/client/types.ts` | 无字段改动（新增展示用读取） |
| 锁 | `tests/verify-item-result.test.ts` | 保留原有四字段断言；新增 `results` 匹配用例 |

## 迁移与兼容 <!-- serves: FR-8 -->

| 场景 | 行为 |
|---|---|
| 新调用方（带 `results`） | 逐项绑定；缺项被拒 |
| 老调用方（不带 `results`） | 提交成功；项无 `result` ⇒ 裁决时要么人填、要么记 `unverified` |
| 文本写法（`evidence` 里 `id :: 结果`） | 仅作**兼容**：命中即绑（量少），未命中的键作为 warning 进返回体，不再静默 |
| 存量在册验收单 | 不回写、不重算 |
| 回滚开关 | `DSH_REQBOARD_NO_ITEM_RESULT=1` ⇒ 关闭结构化绑定并恢复 `evidence[0]` 兜底（今天的行为） |

## 不新增表 / 不改 schema 的判据 <!-- serves: FR-8 -->

- 无 `schemaVersion` 提升：`result` / `resultSource` / `needsHuman` / `humanReason` 自 v9 起已在协议里。
- 无数据回填脚本：所有写入都发生在"提交验收材料"与"裁决"两个动作上。
- 回滚只需一行环境变量，不需要代码回滚（回滚后新写入的 `result` 仍留在台账，只影响后续绑定行为）。
