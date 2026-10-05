# REQ-261002110908-81d0 接口设计 · 工具描述与共享常量的契约 `serves: FR-1, FR-2, FR-3`

> 本需求**没有** HTTP、没有工具签名变更。本文件把「描述文本」当接口来钉：
> 谁读它、必须读到哪些锚点、改动时谁必须同步。
> 原则：**新增文本一律附加**，既有语义句不改写；缺失锚点由用例拦（不是运行时）。

## 1. reqboard_task_report 描述契约 `serves: FR-1`

**用途**：任务完工汇报（追加到任务卡文档 + 登记 `task_detail` 产物）。
**读者**：实施阶段的 agent（工具描述随工具定义注入模型）。

**接口定义**（签名**不变**，仅描述文本附加）：

```ts
// 入参：字段名 / 类型 / 必填 / 上限全部不变（契约见 data-model.md 第 3 节）
interface TaskReportInput {
  task_id: string
  summary: string
  completed?: string[]
  files_changed?: string[]
  next_step?: string
}
// 返回体：不变（success / task_id / requirement_id / doc_path / artifact_registered / report_index / note）
```

**描述必须含的锚点**（缺一即被 TC-1 判红）：

| 落点 | 锚点（文案要点） | 服务 |
|---|---|---|
| `description`（`TASK_REPORT_PROMPT`） | 「大汇报拆成多次调用（幂等追加）」 | FR-1 |
| `summary` 说明 | 「避免半角双引号，需要就写「」」 | FR-1 |
| `completed` 说明 | 「每条短句（建议 ≤60 字）」+ 同上引号约定 | FR-1 |
| `next_step` 说明 | 同上引号约定（一句话即可） | FR-1 |

**异常情况**：**无新增**。拒绝条件与错误码（`REQBOARD_INVALID_INPUT` 等）一字不改。

**合规写法示例**（模型应产出）：

```text
completed: ["复核 interfaces.md §5 的四处残留，逐一落地无遗漏",
            "只删「必然失败的路径」，未新增接口替代"]
```

**反例**（本次事故原文，务必在描述里点明避免）：中文串里出现 出现"看似还有残留"的假信号 这类裸引号。

## 2. 覆盖清单与同类工具 `serves: FR-2`

| 工具 | 长文本字段 | 纳入 | 理由 |
|---|---|---|---|
| `reqboard_task_report` | `summary` / `completed[]` / `next_step` | 是 | 本次事故现场 |
| `reqboard_submit` | `summary` / `evidence[]` / `change_note` | 是 | 验收材料同样是长中文 |
| `reqboard_ask_confirm` | `question` / `evidence` | 是 | 弹框问题与证据原文 |
| `reqboard_task_move` | `reason` / `acceptance` | 是 | 理由与验收标准长文本 |
| `reqboard_capture` | `summary` / `reason` | 是 | 立项摘要 |
| `reqboard_note_interruption` | `reason` | 是 | 断点原因原文 |
| `reqboard_task_regenerate` / `reqboard_task_adopt` | `reason` | 是 | 同上 |
| 其余工具 | — | 否 | 无可自由书写的长文本字段 |

**不变量**：清单内每个 `field` 必须是该工具 `parameters` 的真实键——键名漂移即 TC-2 报缺项。

## 3. 共享常量接口 `serves: FR-2`

```ts
// src/tools/shared.ts
/** 长文本入参写法约定（唯一来源） */
export const LONG_TEXT_ARG_NOTE: string

/** 工具 x 长文本字段 覆盖清单 */
export const LONG_TEXT_FIELDS: readonly { readonly tool: string; readonly field: string }[]
```

**不变量（可被用例断言）**：

| 编号 | 不变量 |
|---|---|
| I-1 | `LONG_TEXT_ARG_NOTE` 同时含三锚点：短句上限、`「」` 代引号、拆多次调用 |
| I-2 | `LONG_TEXT_ARG_NOTE` ≤120 字（防止描述膨胀挤占注入预算，C-03） |
| I-3 | 清单内每个字段的 `description` 都包含 `LONG_TEXT_ARG_NOTE` 的锚点短语 |
| I-4 | 清单外不新增同类长文本字段（新增即补清单，否则 TC-4 红） |

**错误码**：无（纯文本常量，不产生运行时错误）。

## 4. 阶段提示词片段契约 `serves: FR-3`

| 片段 | 新增行（要点） | 生成产物 |
|---|---|---|
| `implementing/light.md` | 汇报前自检：正文无半角引号、`completed` 每条短句、太长拆多次 | `generated/` 对应文件（C-16 生成） |
| `implementing/light/overrides.md` | 同上（本仓覆盖条目加一条） | 同上 |
| `implementing/heavy/overrides.md` | 同上 | 同上 |

**约束**：不改受 C-17 保护的 heavy 正文（只加覆盖层），片段与产物必须一致（`node scripts/check-prompt-fragments.mjs` 退出码 0）。

**示例**（片段里的原文形态）：

```markdown
- [ ] **汇报自检**：调 reqboard_task_report 前先看一遍——正文不出现半角双引号（要引号用「」），
      completed 每条短句，文本太长就拆成多次调用（幂等追加）。
```

## 5. HTTP API 变更 `serves: FR-1`

**无**：本需求不新增/修改任何 HTTP 端点与响应体。
