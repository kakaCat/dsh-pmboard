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
| 要退回 | 点不通过 + 写意见（预填值原样不算意见） |

「全部通过 → 归档」的放行判据是**无 `pending` 且无 `unverified`**；有未复核项时不会弹归档确认，
强行点「验收通过」会被按「不合规通过」要求写覆盖说明（覆盖会进 `acceptanceOverride` + 评论 + 状态事件三处留痕）。

## 三、维护者：改哪里会连带红

- **六处放行判据必须同改**：`sheetGateStatus` · `isFullyDecided` · `isFullyDecidedItems` ·
  `AcceptSheet.finalizeIfAllPassed` · RTM 门禁映射（`unverified → pending`） · 看板「验收通过」的
  不合规通过判定（含前端 `verifyConfirmCopy` 的确认文案）。漏一处，「未复核」就从那条路悄悄放行。
- **`needsHuman` 项不吃 `result` 兜底**：域层 `applyVerdicts` 与弹框 `resultOf` 同口径；
  看板该行**不预填**并带 `data-needs-human="1"`。
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
