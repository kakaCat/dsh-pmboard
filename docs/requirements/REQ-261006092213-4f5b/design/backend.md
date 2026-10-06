# 后端设计 · REQ-261006092213-4f5b <!-- serves: FR-1, FR-2, FR-4, FR-6, FR-7, FR-8 -->

> 关注点：谁写台账、写什么、按什么顺序、失败怎么响亮。规则单点在 domain，用例层只编排。

## 提交校验与结果绑定 <!-- serves: FR-1, FR-2 -->

`application/use-cases/SubmitVerification.ts` 的改动顺序（不可换序）：

1. 既有参数校验（`summary` / `evidence` 必填、证据路径存在性）——不动。
2. 新增：读 `results`（缺省 = 老调用方）。**形状判定单点在 `matchStructuredResults`**——它是全函数，
   非数组与原始值元素一律进 `invalid`；用例层只做「有没有传 `results`」的预检以走 legacy 分支，
   **不得**复制逐项判定（复核 F2：原本文档两处互斥，现定死于纯函数侧）。
3. 既有门禁（文档完整性 / 对照项前置 / 覆盖度）——不动。
4. **组装 `buildSheet`**（不动其编号与顺序规则）。⚠️ 步骤序更正（复核 R1）：组装必须排在硬门**之前**
   ——可预见集合是**按组装出来的项**判的（`E2E 覆盖：有` 行与原型豁免说明行的豁免，只有靠项才判得出），
   而 `buildSheet` 是纯函数、不落库 ⇒ 到这一步台账仍零变更。**预览单与落库单必须是同一次调用产出的同一份**，
   不得为了跑门禁重算第二次（重算即口径漂移）。
5. **新增硬门**：`matchStructuredResults(built.sheet.items, results)`；
   `missing` / `duplicate` / `invalid` / `empty` / `conflict` 任一非空 → `reject`（点名到 ref），
   `unmatched` 先过下一步的分类；错误码按 interfaces.md 的「体检字段 → 错误码」表逐条对应。
6. **`unmatched` 分类**（复核 R2 + 三轮复核补漏）：调用方组装 `knownKeys`，**四类、后两类按本轮实际产出条件化**：
   · 各**顶层父卡**键 `task:<id>` —— 始终加；
   · `requirement` —— 始终加；
   · 本轮**实际产出**的原型对照键 `prototype:<compare.path>` —— 仅当 compare 给出原型路径时加
     （`prototype_exempt` 生效 / 无原型时**不加**）；
   · 本轮**实际产出**的裁定对照键 `decision:<ids>` —— 仅当 `decisionIds` 非空时加。
   然后调 `splitUnmatched`：只有 `unknown` 才 `reject`（`REQBOARD_RESULT_REF_INVALID`）；
   `outOfScope`（本版不含但确实存在，**返工续版的正常情形**）如实进返回体 `results_out_of_scope`，**不拒**。
   ⚠️ 两条反例纪律：① **不要把 `knownKeys` 放宽成「全部活卡」**——子卡的父卡若不是活卡，
   该子卡 ref 会被放行、且没有父卡项 `missing` 兜底，那就真被掩盖了（保持「顶层父卡」口径）；
   ② 对照项键**必须条件化**，本轮没有该对照项却放进去 = 无条件放行野 ref。
   安全性：漏交代仍被 `missing` 抓住，越界放行不会让任何项免于交代。
7. **落结果**：`applyStructuredResults(built.sheet.items, results)` 就地写字段（**前置条件：conflict 为空**）；
   返回体的 `results_bound` 取它的 `changed`、`results_matched` 取它的 `matched`。
8. 兼容：`evidence` 里的 `id :: 结果` 文本形态仍解析，但**未命中的键进返回体**（不再丢返回值）。

## 可预见项集合（硬门范围） <!-- serves: FR-2 -->

```
可预见 = 活卡中的顶层父卡（parentId === undefined）   ← 与 buildSheet 的收项口径同源
       ∪ 需求级项（固定一条：判据文本 === REQUIREMENT_LEVEL_CRITERION）
       ∪ 对照项（原型对照 / 裁定对照，若适用）
不可预见（豁免）= 孤儿用例 · 不可照着验 · E2E 覆盖（含「有」那一行） · 原型豁免说明行 ·
                 三方一致性 · 锚点失效 · FR 追溯断链
```

**识别口径不按 `source.kind`**（复核 F1，阻断级）：上面那些豁免行的 `kind` 与需求级项**同为
`requirement`**——只按 kind 判会让它们与需求级项共用一个引用键，`apply` 的后写覆盖先写，
结果落到错误的行上，而体检还报「齐了」。故：任务项与两个对照项按 kind 认，`requirement` 来源
**只认判据文本等值**那一条。不变量：可预见项的引用键必须唯一，撞键即 `conflict` 响亮报出。


口径必须与 `buildSheet` 吃**同一份组装产物**（`built.sheet.items`，见上面第 ④ 步），
否则会出现"硬门说齐了、验收单里却少一项"的口径漂移（本仓有过 `parentId` 未透传的历史事故）。

## 裁决口径 <!-- serves: FR-6 -->

`AcceptSheet.ts` 的 `resultOf`（唯一实现）：

```
第 2 问自填 → 第 1 问自填 → item.result        // 三者皆空 ⇒ unverified
```

- **删除** `it.evidence[0]` 兜底（它是"未复核不可达"的直接原因）。
- `needsHuman` 项照旧要求人填（保留第 2 问）。
- 回滚开关开启时恢复旧顺序（含 `evidence[0]`）。

`domain/workflow/AcceptanceSheetSpec.ts` 的 `applyVerdicts`：

- `passed` 校验由「opinion 非空」放宽为「opinion 或 item.result 非空」；
  两者皆空时**不抛错**，改记为 `unverified`（底线而非形式合规）。
- `failed` / `not_verifiable` 的意见必填不变；系统项处置必填不变。

## 放行判据 <!-- serves: FR-6 -->

`finalizeIfAllPassed`（`AcceptSheet.ts`）现状只看 `pending`，会出现"全部 unverified 也报全通过并归档"。
改成：

```
若 items 中存在 pending 或 unverified ⇒ 不弹归档确认，返回真实计数与下一步
否则 ⇒ 弹「验收通过并归档」（人工门不变）
```

`sheetGateStatus` 已把 `unverified` 视为待裁决，本处与其对齐（原先只有它对齐、放行路径漏了）。

## HTTP 逐项裁决 <!-- serves: FR-4, FR-6 -->

`http/routers/verdicts.ts`：

- 路由层预校验放宽：`passed` + 空 `opinion` 不再 `badInput`；改由 `applyVerdicts` 统一判定。
- 写入规则：`opinion` 非空且 ≠ `item.result` ⇒ 同时写 `result = opinion`、`resultSource = 'human'`。
- 响应保持既有形状（逐项结果 + 通过率 + 是否可归档），不新增破坏性字段。

## 文档落盘：`verification.md` <!-- serves: FR-7 -->

`domain/workflow/VerificationDoc.ts` 的验收结果表：

- 「实际结果」列改用 `item.result`；`item.result` 为空时回落到 `item.opinion` 并标「（人工）」。
- 新增来源标注：`agent 实测` / `人工填写` / `未标注`（与看板同词，避免两处措辞漂移）。
- 验收列表的"操作步骤/预期结果"派生逻辑不变。

## 响亮失败与留痕 <!-- serves: FR-2 -->

- 拒绝一律三段式：缺什么 / 缺哪些（点名到 ref）/ 怎么补。
- 提交被拒时**台账零变更**（校验都在 `mutate` 之前）。
- 绑定结果成功与否写进返回体（`results_bound` / `results_matched` / `results_unmatched` /
  `results_out_of_scope` / `results_coverage`），供 agent 自查，不靠"我以为它绑上了"。

## 兼容与回滚 <!-- serves: FR-8 -->

| 面 | 处理 |
|---|---|
| 老调用方（无 `results`） | 提交成功；项无 `result`；裁决按 UC-5/UC-6 口径 |
| 文本写法 | 兼容绑定 + 未命中键上报 |
| 存量在册验收单 | 不回写、不重算 |
| 回滚开关 | `DSH_REQBOARD_NO_ITEM_RESULT=1` ⇒ 关闭结构化绑定 + 恢复 `evidence[0]` 兜底 |
| 台账/schema | 零新增字段、零迁移（见 data-model.md） |

## 判据（可失败） <!-- serves: FR-1, FR-6 -->

- `npx vitest run tests/result-binding.test.ts`：漏项 → `REQBOARD_RESULT_COVERAGE_MISSING`，且台账未变。
- `npx vitest run tests/accept-sheet-tool.test.ts`：有结果的项弹框只收 1 问；零输入 → `passed`（`opinion === result`）。
- 反例用例：无结果项点通过 → `unverified`；随后 `finalize` 不弹归档。
- `pnpm typecheck` 退出码 0；`pnpm test` 失败数 ≤ 基线 106（C-14 / C-15）。
