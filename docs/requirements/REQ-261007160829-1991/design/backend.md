---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 后端设计（REQ-261007160829-1991）

## 服务与接口实现 `serves: FR-1, FR-2, FR-3, FR-4`

本需求不新增服务、不新增端口；改动集中在**域函数**与两个调用点（弹框用例 / HTTP 路由）。

| 改动点 | 现在在做什么 | 本需求之后 |
|---|---|---|
| `AcceptanceSheetSpec.applyVerdicts` | 内联判 `blankPass` / `anchorMiss`，降级只改 `status` | 判定抽成 I-1；降级同时写原因；人工自填无锚点抛错 |
| `ResultBinding.matchStructuredResults` | 体检形状 / 重复 / 交代完整性 | 多体检一项：锚点 |
| `SubmitVerification.bindStructuredResults` | 把体检结果映射成拒绝码 | 多映射一枚码 |
| `AcceptSheet`（弹框用例） | 第 2 问题干写「通过必填」；回执写死一句「点了通过却没结果」 | 题干附形态要求；回执按真实原因分派 |
| `verdicts.ts`（HTTP） | 回执写死一句「未复核 N 项」 | 同一单点文案函数 |
| `VerdictNotices`（新建） | — | 形态提示 + 未复核汇总 / 补法文案的唯一出处 |

## 数据流 `serves: FR-1, FR-2, FR-3`

```
提交侧（FR-1）
  agent 提交 results
    → matchStructuredResults(items, results)        体检：形状/冲突/重复/交代/锚点(I-5)
    → bindStructuredResults(...)                    映射成拒绝码（顺序：形状→冲突→重复→交代→指不到→漏项→锚点）(I-6)
    → applyStructuredResults(items, results)         落库（既有，不变）

裁决侧（FR-2 / FR-3）
  人点「通过」（弹框第 1/2 问，或看板行）
    → verdicts: {itemId, status:'passed', opinion?}
    → applyVerdicts(...)
         └─ judgePassedVerdict(item, opinion)       判落点与原因(I-1)
              ├─ passed                     → status=passed，清原因
              ├─ unverified(blank_pass)     → status=unverified + 原因
              ├─ unverified(anchor_missing) → status=unverified + 原因
              └─ 人工自填 + 无锚点          → 抛 REQBOARD_VERDICT_ANCHOR_MISSING（I-2 判定）
    → 回执 note = unverifiedSummaryOf(items) + unverifiedAdviceOf(reason)   (I-7)
```

## 关键逻辑 `serves: FR-1, FR-2, FR-3, FR-4`

### S-1 judgePassedVerdict（判定落点与原因，纯函数）`serves: FR-2`

输入 `{item, opinion}`，按**固定顺序**判定，输出 `{status, reason?}`：

1. 是人工项（`needsHuman === true`）且无文本 → `unverified(blank_pass)`；有文本 → `passed`（人工项走事实形态判据，**不吃**锚点判据——与既有口径逐字一致）。
2. 「待判文本」为空 → `unverified(blank_pass)`。**待判文本的取值与 `applyVerdicts` 的 `effectiveText` 逐字同源**：有 `opinion` 用它，否则用 `item.result`（人工项除外——判定依据只在人眼里，`result` 只是供人参照的材料）。
3. 待判文本非空、是系统项（`isSystemItem`，即 `gapKind` 非空或存量「不可照着验」前缀项）→ `passed`（系统项判处置，不吃锚点）。
4. 待判文本非空、`hasResultAnchor(文本)` 为真 → `passed`。
5. 其余（文本非空、无锚点）→ `unverified(anchor_missing)`。

> **实施期修正（2026-10-07，卡 t-3951af 提出并经本窗口裁定）**：本节原文第 2/3 条写作「无文本且无 result → blank_pass；**无文本但有 result → passed**」。后一条是**设计笔误**：照它实现会让「人留空点通过 + agent 交来的无锚点 `result`」由 `unverified` **变成 `passed`**——那正是本需求要消灭的静默放行（存量已观测到 131 个无锚点通过项），且与本文档「关键决策」第 3 条「不改判据词表」自相矛盾。故按既有行为修正为上表第 2 条：**零输入通过同样要过锚点判据**。等价性由穷举探针钉住（90 组可比输入下与 `applyVerdicts` 落点零不一致），并有专门用例 `result: '功能正常，没有问题'` → `unverified(anchor_missing)`。

### S-2 人工自填的判定与拒绝 `serves: FR-3`

- 判据：`isHumanAuthored(item, opinion)` = 文本非空 **且 `item.result` 非空** **且** `opinion.trim() !== item.result.trim()`（= 复用 `isResultOverride` 的「人真的动了原文」三条件）。
  > **实施期修正（2026-10-07）**：本节原式写作「文本非空 且 与 `item.result` 不同」，未排除「`item.result` 为空」的情形 —— 那会把人**自填首份文本**（无原文可改）也判成人工自填并拒收，与既有刻意口径冲突（TC-10：无 result + 无锚点文本 → `unverified`，不抛错）。裁定收窄为上式：**拒绝只针对「破坏了已有原文」的改写**。
- 命中 S-1 第 6 条 **且** `isHumanAuthored` 为真 → 抛 `REQBOARD_VERDICT_ANCHOR_MISSING`。
- 抛错在**写盘之前**（`applyVerdicts` 是纯计算，调用方拿到结果才 mutate），故拒绝 = 台账零改动。
- 文案必须可执行：`验收项 <id> 你写的结论没有可核验锚点（"<前 40 字>"）——请补一条命令 + 读数 / 一个证据路径 / 一个明确计数后重交；原 agent 实测结果未被改动。`

### S-3 提交侧锚点体检 `serves: FR-1`

- 在 `matchStructuredResults` 里逐条结果做：命中项 → 非人工项 → 非系统项 → 文本非空 → `!hasResultAnchor` ⇒ 入 `unanchored`。
- 人工项（`needsHuman: true`）与系统项**明确排除**：它们的判据分别是事实形态与处置两义，套锚点判据等于逼人编命令（既有注释已钉死这条理由）。
- 判据函数**只允许一处**：`hasResultAnchor`（`AcceptanceSheetSpec.ts` 既有导出）。禁止在 `ResultBinding` 里另写正则。

### S-4 形态提示与回执文案 `serves: FR-2, FR-4`

- 弹框第 2 问题干 = 既有题干 + `ACCEPT_RESULT_FORM_HINT`（同一常量也用于拒绝回执的 `how`）。
- 回执 = `unverifiedSummaryOf(items)`（计数分类）+ `unverifiedAdviceOf(reason)`（该补什么）。
- 两条通道（工具回执 / HTTP 回执）都调这**两个**函数；实现里不得再出现写死的「未复核」句。

## 错误处理 `serves: FR-1, FR-3`

| 情形 | 表现 | 台账 |
|---|---|---|
| 提交结果无锚点 | 拒绝 `REQBOARD_RESULT_UNANCHORED`，逐条点名 + 样例 | 零改动 |
| 人自填无锚点 | 拒绝 `REQBOARD_VERDICT_ANCHOR_MISSING`，点名 + 补法 | 零改动 |
| 降级（无文本 / 非人工无锚点） | 正常落库，`status=unverified` + 原因 | 写原因 |
| 判据纯函数异常 | 向上抛，工具/HTTP 如实报错（**不吞成 unverified**） | 零改动 |
| 回执文案生成异常 | 降级为中性措辞，**不影响**已落库的裁决 | 不回滚 |

## 数据库设计 `serves: FR-2`

- **新增/修改表**：不适用：本仓台账以整条需求记录的 JSON 为权威原件（SQLite 的结构化列只是镜像），新增可选字段不涉及 DDL。
- **字段说明 / 索引 / 约束**：随 `data-model.md`（只增一个可选字段，无索引影响、无新约束）。

## 性能考量 `serves: FR-1, FR-2`

- 新增判定是**纯字符串正则**，作用于单条结果文本（长度上限 500 字符），相对既有 JSON 写盘可忽略。
- 无新增 IO、无新增请求、无循环放大（每个提交/裁决项各判一次）。

## 安全设计 `serves: FR-1, FR-3`

### 输入校验 `serves: FR-1, FR-3`

- 新增校验只**收紧**输入（拒绝更严），不放宽任何既有校验；拒绝文案不含用户隐私，只回显被点名项与其结论的前 40 字。

### 敏感信息 `serves: FR-1`

- 结果文本本就落台账（既有行为）；本需求不改留档范围，也不把文本写入日志。

## 关键决策与取舍 `serves: FR-1, FR-2, FR-3, FR-4`

- **判据单点**：`hasResultAnchor` 一个实现、两个调用点（提交 + 裁决）。本仓教训是「两处判定必漂移」。
- **拒绝 vs 降级**：对人的**新写文本**拒绝（可当场改），对**取自 agent 的文本**降级 + 留原因（不把历史欠账转嫁给点通过的人）。
- **不改判据词表**：松紧调整需要台账数据支撑，属另一条需求；本轮改的是「结论可见性」。
- **文案进 domain**：文案单点放在 domain（纯字符串），让工具层与 HTTP 层都无法各写一份。
