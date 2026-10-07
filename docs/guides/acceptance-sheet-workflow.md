# 验收单怎么用：agent 交结果、人只裁决

> 面向**要用/要改验收单的人与 agent**。机制与架构先读领域篇：[验收单机制（L2）](../architecture/acceptance-sheet.md)；
> 为什么这么设计、六处放行判据与回滚开关的来龙去脉在 [项目说明书 · 机制备忘](../architecture/project-manual.md#机制备忘验收项由执行方实测人只做裁决2026-10-06req-261006092213-4f5b)。
> 本页只回答三件事：**agent 怎么交结果**、**人要点什么**、**哪里一碰就红**。

## 一、agent：提交验收材料时**逐项**交结果

`reqboard_submit(kind=verification, summary, evidence, results=[…])`。

`ref` 与验收项来源**同构**（不发明第二套键，也不依赖提交后才生成的验收项 id）：

```jsonc
"results": [
  { "ref": { "kind": "task", "taskId": "t-62130a" }, "result": "npx vitest run tests/x.test.ts → 25 passed" },
  { "ref": { "kind": "requirement" },               "result": "pnpm baseline:check → 失败用例集合差为空（新增 0 / 不再失败 0），exit 0" },
  { "ref": { "kind": "prototype-compare", "prototypePath": "prototypes/x.html" },
    "needsHuman": true, "humanReason": "界面视觉需人对照权威原型" },
  { "ref": { "kind": "decision-compare", "decisionIds": ["D-1","D-5"] }, "result": "D-1 …；D-5 …" }
]
```

- **可预见项必须逐项交代**：顶层父卡任务 + 需求级 + 对照项（原型 / 裁定）。
  漏项 / 坏 ref / 重复 / 空结果会被**拒绝并点名到 ref**（`REQBOARD_RESULT_COVERAGE_MISSING` /
  `_REF_INVALID` / `_REF_DUPLICATE` / `_RESULT_EMPTY`），拒绝时**台账零变更**。
- **系统项豁免**（孤儿用例 / 不可照着验 / E2E 覆盖 / 三方一致性 / 锚点失效 / 追溯断链）：
  提交时才由代码算出，agent 无从预见，不参与逐项交代。
- **自查回执**：`results_bound`（真正写进台账的条数）、`results_matched`、`results_unmatched`、
  `results_out_of_scope`（返工续版里本版不含的 ref，正常）、`results_coverage`（`complete` / `legacy`）。
- 跑不了只能人看的项：写 `needsHuman: true` + `humanReason`（**无理由即拒**）。

## 二、人：有结果就点通过，没结果别点通过

| 情形 | 你怎么做 |
|---|---|
| 该项 `result` 非空、非 `needsHuman` | **只点「通过」**——不打字，`opinion` 自动取该项 `result`（来源仍是 agent） |
| 你想改结果（复跑过、以你的为准） | 改输入框即可：写 `result = 你的文本`、`resultSource = 'human'` |
| `needsHuman: true`（界面视觉 / 线下流程） | **唯一要你动笔的项**：写你看到的事实（不写就记未复核） |
| 点通过但两者皆空 | 记 **`unverified`（未复核）**：不计入通过，也**不放行归档** |
| **`result` 非空但文本里没有「可复核锚点」** | **照样记 `unverified`**（见下）——人点「通过」也没用 |
| 要退回 | 点不通过 + 写意见（预填值原样不算意见） |

### 「有结果」的真正底线是「**有据**」，不是「有字」（2026-10-07，REQ-261006201814-ac4f 实测）

`applyVerdicts` 的判据（`domain/workflow/AcceptanceSheetSpec.ts`）：

```
effectiveText = opinion非空 ? opinion : (needsHuman ? '' : item.result)
passed 成立 ⟺ 非 needsHuman ∧ 非系统项 ∧ effectiveText 命中 RESULT_ANCHOR
否则（blankPass 或 anchorMiss）→ unverified
```

`RESULT_ANCHOR` 认五类锚点：**文件扩展名**（`.ts/.md/.json/.png/…`）· **命令词**
（`npx/npm/pnpm/node/tsx/vitest/git/tsc/python3/…`）· **`退出码`** 或 `exit N` ·
**`N 条|项|个|通过|失败`** · **`→ 数字`**。

**实测踩的坑**：agent 把结果写成「矩阵 19/19；每格三件套 + 计数断言」「豁免用例 3/3；
双向相等」——人点「通过」却全记成 `unverified`。原因是 `19/19`、`3/3` **不在词表里**
（要写成 `19 条通过` 或 `→ 19`），而「A/B 产物 introduced=0 · fixed=3」也没有任何锚点。
**给 agent 的写法**：每条结果至少给一个锚点，最稳的是 **`npx vitest run <文件> 退出码 0（N/N 通过）`**。

**遇到 5 项以上 `unverified` 怎么办**：不要让人反复点。agent 重交一次
`reqboard_submit(kind=verification, results=[…带锚点的文本…])` 即可——验收单升版（v2），
新单的值全部带锚点，人**只需零输入点通过**。别让人手打（那是把 agent 的活推给人）。

## 三、维护者：改哪里会连带红

- **六处放行判据必须同改**：`sheetGateStatus` · `isFullyDecided` · `isFullyDecidedItems` ·
  `AcceptSheet.finalizeIfAllPassed` · RTM 门禁映射（`unverified → pending`） · 看板「验收通过」的
  不合规通过判定（含前端 `verifyConfirmCopy` 的确认文案）。漏一处，「未复核」就从那条路悄悄放行。
- **`needsHuman` 项不吃 `result` 兜底**：域层 `applyVerdicts` 与弹框 `resultOf` 同口径；
  看板该行**不预填**并带 `data-needs-human="1"`。
- **`RESULT_ANCHOR` 是 `passed` 的进入条件**（不是提示）：改这个词表 = 改「什么样算通过」，
  会连带红 `tests/result-binding.test.ts` 与 `tests/accept-sheet-zero-input.test.ts`。
  收紧它会让**存量已通过项**在新裁决下变未复核；放宽它会放行无据通过。两边都要在需求里说清。
- **预填 `value` 必须是台账 `item.result` 原文**（可截断的只有展示行）：截断过的 `value` 会在
  "人一个字没改"时把台账改短、还把来源误标成 `human`（实测踩过，见需求 `evidence/prototype-conformance.md`）。
- **回滚**：`DSH_REQBOARD_NO_ITEM_RESULT=1` → 提交侧不结构化绑定（`results_coverage='legacy'`）、
  裁决侧恢复 `evidence[0]` 兜底且不写 `result`。两个效果缺一即算开关失效。
- **台账零新增**：沿用 `result` / `resultSource` / `needsHuman` / `humanReason`；
  `results` 是瞬时入参。客户端 `VerificationItem.status` 必须是**五值**
  （`pending/passed/failed/not_verifiable/unverified`）——写成三值会让未复核判不出来。
- **一碰就红的用例**：`tests/result-binding.test.ts`、`tests/accept-sheet-tool.test.ts`、
  `tests/accept-sheet-zero-input.test.ts`、`tests/verdicts-http.test.ts`、
  `tests/verify-item-result.test.ts`、`tests/stage-panel.test.ts`、`tests/domain/req-b918-gates.test.ts`。
