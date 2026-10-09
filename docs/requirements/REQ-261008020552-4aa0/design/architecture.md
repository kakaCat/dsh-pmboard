---
doc: architecture
requirement_id: REQ-261008020552-4aa0
serves: [FR-1, FR-2, FR-3, FR-4, FR-5]
---

# 架构设计：工具面 21→19 收编 + task_move/submit 描述结构减负

> 写给零上下文的执行者：配合 requirement.md 阅读即可施工。
> 铁律：**行为零变化**——只动描述结构（文案位置）与工具收编（壳层分派）；
> 用例判定逻辑、状态机、台账写路径、错误码与触发条件逐字保持。
> 唯一有意偏差 = D-3（见 §4），已显式申报。

## 1. 设计总览 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

两类改动，五个回滚单元（U1~U5，各自独立 commit、可单独 revert）：

```
收编（壳层分派，用例复用）              描述减负（文案搬家，结构不动）
U1 archive_amend → task_amend(op=archive)      U3 task_move 1265 → ≤630
U2 note_interruption → task_amend(op=interruption)  U4 submit tasks[] 1717 → ≤860
U5 同步面收尾（registry/README/package.json/docs/知识层）
```

依赖序：U1~U4 互不依赖；U5 最后做（收口已落地单元的清单/文档口径）。

## 2. 依赖与调用方清单（refactor 必备：谁调用、谁被调用、怎么验证没漏） <!-- serves: FR-1, FR-2, FR-5 -->

**archive_amend 调用面**（全仓 grep `reqboard_archive_amend|ArchiveAmendTool|defineArchiveAmendTool` 得出）：

| 调用方 | 位置 | 处置 |
|--------|------|------|
| 工具注册 | `src/index.ts:57,1155` | 摘除 import + register |
| 工具登记表 | `src/tools/registry.ts:161-167` | 删条目；TaskAmend 条目 responseSources 加 `AmendArchiveManifest.ts` |
| 壳导出 | `src/tools/index.ts`（桶文件） | 摘除导出 |
| 渲染摘要 | `src/tools/ArchiveAmendTool/summary.ts` | 迁入 `TaskAmendTool/summary.ts` 为 op=archive 分支 |
| HTTP 看板路由 | `src/http/routers/requirements.ts:785` | **路由与用例不动**，仅注释改指 task_amend（看板补录入口与工具共用同一用例） |
| 用例注释 | `AmendArchiveManifest.ts:13` | 注释改写 |
| e2e 测试 | `tests/archive-reconcile-e2e.test.ts:26,104` | 改打 `defineTaskAmendTool` op=archive |
| 行为测试 | `tests/archive-amend.test.ts` | 直接用例级调用（不走壳）→ 仅 D-3 文案断言若有则同步 |
| 提示词清单 | `tests/ask-confirm-prompt.test.ts:42` | 工具名改写 |
| 文档 | README / tool-face-inventory.md / project-manual.md:145 | 同步改写 |

**note_interruption 调用面**（grep `reqboard_note_interruption|NoteInterruptionTool|defineNoteInterruptionTool`）：

| 调用方 | 位置 | 处置 |
|--------|------|------|
| 工具注册 | `src/index.ts:65,1157` | 摘除 |
| 工具登记表 | `src/tools/registry.ts:113-119` | 删条目；TaskAmend responseSources 加 `NoteInterruption.ts` |
| 渲染摘要 | `src/tools/render-summaries.ts:170 noteInterruptionSummary` | 迁入 `TaskAmendTool/summary.ts` 为 op=interruption 分支 |
| 长文本登记表 | `src/tools/shared.ts:69` | 删 `{reqboard_note_interruption, reason}` 行（`{reqboard_task_amend, reason}` 已在 :70，语义覆盖） |
| 阶段动作表 | `src/domain/stage/StageActions.ts:20` | 删条目；守卫 op 化见 §3.4 |
| 用例/协议注释 | `src/shared/protocol.ts:1363`、`src/application/internal/interruption.ts:145` | 注释改写 |
| 工具行为测试 | `tests/interruption-checkpoint.test.ts:23,152-175` | 改打 task_amend op=interruption；`bp.tool` 断言随 D-3 改 |
| arg-guidance | `tests/arg-guidance.test.ts:29,65` | 删 defineNoteInterruptionTool 映射行 |
| 文档 | README / tool-face-inventory.md:20 / knowledge/architecture.md:77 / knowledge/glossary.md:21 / project-manual.md:189,211 | 同步改写 |

**验证没漏的方法**：合并后 `grep -rn "reqboard_archive_amend\|reqboard_note_interruption\|ArchiveAmendTool\|NoteInterruptionTool\|defineArchiveAmendTool\|defineNoteInterruptionTool" src tests README.md package.json` 必须零命中；I-1~I-3 不变量（tools-dispatch / apply-wiring / output-contract）机械兜住 registry ↔ 目录 ↔ 注册名三方一致。

**事件入口不受影响**：`noteInterruptionForWindow`（turn/end 事件入口，组合根调用）不经过工具壳，本批不动。

## 3. 收编设计：task_amend 扩 2 个 op <!-- serves: FR-1, FR-2 -->

### 3.1 op 契约（定死：参数 / 返回 / 错误码） <!-- serves: FR-1, FR-2 -->

`TASK_AMEND_OPS` 扩为 `['refs','adopt','chain','archive','interruption']`，`REQUIRED_OF` 追加：

| op | 必填集 | 入参映射（原工具 → 新 op） | 分派用例（复用，判定不改） |
|----|--------|---------------------------|---------------------------|
| archive | `docs`、`reason` | `requirement_id?` / `docs`（非空 [{kind,path}]）/ `reason` 平移 | `amendArchiveManifest` |
| interruption | `reason` | `reason` / `requirement_id?` 平移 | `noteInterruption` |

**parameters 增量**：仅新增 `docs` 数组参数（items={kind,path}，additionalProperties:false，从 ArchiveAmendTool 平移）；其余入参复用现有键。`reason`/`requirement_id` 描述追加 op 适用说明（一句话）。

**output.schema 增量**（并集纪律不变）：`appended`（string[]）、`skipped`（[{path,reason}]）、`interruption`（对象子 schema 从 NoteInterruptionTool 平移：at/reason/stage/pendingAction/tool）。既有键不动。

**返回体等价**：
- op=archive：用例返回 `{requirement_id, appended, skipped, status, note}`，壳补 `success:true` 与 `op` 回显——与原 ArchiveAmendTool 返回键集完全一致 + op。
- op=interruption：用例返回 `{success:true, requirement_id, interruption, note}`，壳补 `op` 回显——与原 NoteInterruptionTool 完全一致 + op。
- 失败路径：两用例 `reject(...)` 抛错原样上抛（与原工具一致；task_amend 壳不 catch 用例错误，现状如此）。

### 3.2 挂起确认守卫按 op 分流（行为等价的关键点） <!-- serves: FR-2 -->

现状：task_amend 壳对所有调用先 `assertNoPendingConfirm`（TaskMoveTool 同款写路径守卫）；
但原 **NoteInterruptionTool 没有此前置**（断点补写在挂起确认期间也允许），
原 ArchiveAmendTool 有此前置。

设计：壳内先解析 op，**`op === 'interruption'` 时跳过 `assertNoPendingConfirm`**，
其余 op（含未知 op）保持先守卫后分派（现状逐字保持）。
此分支是行为等价，不是行为变更——不这样做才是变更。

### 3.3 渲染分派 <!-- serves: FR-1, FR-2 -->

`TaskAmendTool/summary.ts`：`taskAmendSummary` 增加两个分支——
`op === 'archive'` → 迁入的 `archiveAmendSummary`（实现逐字平移）；
`op === 'interruption'` → 迁入的 `noteInterruptionSummary`（实现逐字平移）。
`render-summaries.ts` 中迁出的 `noteInterruptionSummary` 删除；
`ArchiveAmendTool/summary.ts` 随目录删除。tools-render-coverage 机械校验守住。

### 3.4 阶段守卫 op 化（boundary-guard） <!-- serves: FR-1, FR-2 -->

现状：`TOOL_STAGE_MAP` 中 `reqboard_task_amend = ['implementing','accepting']`；
`reqboard_note_interruption = undefined`（全阶段放行）；`reqboard_archive_amend` **不在表内**
（`isOutOfBounds` 对未列工具返回 false = 全阶段放行）。
若不做 op 化，archived 态需求上调 op=archive、或任意阶段调 op=interruption，
都会被注入「越界纠偏提示」（advisory）——指引行为回归。

设计：仿 `SUBMIT_KIND_STAGES` 既有先例，在 `guardToolCall` 增加 task_amend 参数级分支：

```
TASK_AMEND_OP_STAGES = {
  refs/adopt/chain → 不进入本分支（回落工具级判定，现状不动）
  archive       → undefined（全阶段放行；归档态由用例自身守卫）
  interruption  → undefined（全阶段放行）
}
op 缺失/未知 → 回落工具级判定（现状）
```

`TOOL_STAGE_MAP` 删 `reqboard_note_interruption` 行，`reqboard_task_amend` 行不动。
守卫仅注入提示、不拦调用——本改动恢复的是「提示等价」。

## 4. D-3 有意偏差：旧工具名字面量替换（对需求「用例一行不改」的唯一修订点） <!-- serves: FR-1, FR-2 -->

两处 agent 可见/台账留痕文本含将被删除的工具名，保留 = 死路指引（agent 按错误文案去调
不存在的工具），故做**仅文案与留痕字段值**的替换，错误码、触发条件、抛出路径全部不变：

| 位置 | 现状 | 改为 |
|------|------|------|
| `AmendArchiveManifest.ts` 8 处 reject 前缀 | `reqboard_archive_amend 未执行：…` | `reqboard_task_amend(op=archive) 未执行：…` |
| `NoteInterruption.ts` 3 处 reject/fmt 前缀 | `reqboard_note_interruption 未执行：…` | `reqboard_task_amend(op=interruption) 未执行：…` |
| `NoteInterruption.ts:92` 留痕入参 | `tool='reqboard_note_interruption'`（写入 `interruption.tool`） | `'reqboard_task_amend'` |

- 历史台账记录**不改写**（interruption.tool 的历史值保持原样，见 migration.md）。
- 测试影响面（已实测）：`tests/interruption-checkpoint.test.ts:175`（bp.tool 断言）一处必改；
  reject 文案断言 grep 零命中，实施时以同 grep 复核为准，逐条留痕。
- 除本表外，两个用例的判定、拒绝条件、幂等性、留痕结构一行不动。

## 5. FR-3 设计：task_move 描述减负（1265 → ≤630） <!-- serves: FR-3 -->

**原则**：参数形状（键名/类型/必填/枚举/additionalProperties）、返回体、错误码逐字不动；
只压缩 description 与 parameters 描述字符串；撤下的细则必须有「回执之家」（多数已存在，实测见下）。

**逐字段去向映射**：

| 位置 | 现字符 | 撤下内容 | 去向（之家） | 目标字符 |
|------|--------|---------|-------------|---------|
| description | 494 | 节流细则（60s/doneMax 数值与豁免）、budget 幂等/CAS 细则 | `throttleGuidance()` 已含「确定等待 ms」与可做之事（MoveTask.ts:286）；CAS 重试指引已在 REQBOARD_CONFLICT 回执（subtask-budget.ts:285） | ~200 |
| `tasks` 描述 + batchItemSchema | 312 | 逐项语义长句 | 压成短句；空数组/超 20 项拒绝回执已含具体消息（TaskMoveTool.ts:238,246） | ~130 |
| `budget` 子树（含 3 子字段） | 278 | 形状说明、CAS 语义、幂等说明 | `readSubtaskBudgetArg` 形状报错已含 `{release:true, add?, expectedWindowIndex?}`（subtask-budget.ts:366-380）；CAS 回执已含「按当前窗口号重试」 | ~110 |
| 扁平四参（task_id/to/reason/acceptance） | ~187 | 不动（`reason` 必须保留 LONG_TEXT_STYLE_NOTE——arg-guidance 机械锁） | — | ~187 |

合计目标 ≤630（≥50% 削减）。

**新增门禁测试 `tests/task-move-prompt-budget.test.ts`**（仿 submit-prompt-budget 双判据）：
① 没减够——`defineTaskMoveTool(stub deps)` 后 description.length + parameters 描述递归和 ≤630；
② 减过头——细则之家逐条断言（调真实函数取 message，不 grep 源码）：
throttleGuidance 含「确定等待」、CAS 回执含「按当前窗口号」、readSubtaskBudgetArg 形状报错含 `{release:true`。
③ 行为锁：task-move-batch / task-move-role / subtask-budget / chain-budget /
done-throttle-guidance / done-throttle-message / amend-acceptance / legacy-compat-6749 全绿。

## 6. FR-4 设计：submit tasks[] 子 schema 描述下沉（1717 → ≤860） <!-- serves: FR-4 -->

**原则**：同 FR-3。`enum` 与结构（数组/对象/required）是结构化数据，模型可见、不占描述字符——
描述里手写重复的枚举清单（phase/side/stages）直接删，不算撤细则。SUBMIT_PROMPT 本身不动
（1289 ≤ 1300 预算不破）；`results[]` 子树（510）不在本批范围。

**逐字段去向映射**（21 个属性 → 一句话；下列撤下内容的之家）：

| 撤下内容 | 之家（拒绝/告警回执，G3 模式） | 动作 |
|---------|------------------------------|------|
| 三对双拼（dep_reasons/depReasons、skip_integration_reason/skipIntegrationReason、granularity_exempt/granularityExempt）的长说明 | 各字段描述合并为一句「snake/camel 等价，两者都认」 | 仅压缩 |
| dep_reasons 写法课（`key=理由` 格式、零交集边才要） | `plan-deps-check.ts:99` 伪依赖拒绝消息——**追加**写法句 | 回执追加 |
| granularity_exempt 生效条件 | `plan-granularity.ts` envelope `how:` 已含「granularity_exempt:"理由" 显式豁免」 | 验证在场即可 |
| footprint 三量口径（files ≥ implementation 路径数等） | plan-granularity 形态软门 warnings 文案——**追加**口径句 | 回执追加 |
| skipIntegration=true 必须带 reason 的联动 | normalizePlanTasks/plan-landing 的对应拒绝消息——**追加**联动句 | 回执追加 |
| prototypeRefs 必填条件（UI 卡 feature/refactor） | 原型锚点门禁拒绝消息（plan-prototype-anchor-gate）——**追加**条件句 | 回执追加 |
| template 模板键全清单 | 模板键非法时的拒绝回执列全部合法键（找现有点；无则在其校验处追加） | 回执追加 |
| stages/template 的「不填默认模板」推导规则 | 保留一句（这是选择依据，非细则） | 仅压缩 |

**回执追加纪律**：只追加细则句；错误码、结构化字段、既有文案语序不变；
既有测试若逐字断言消息全文，只允许为追加句放宽文案断言，禁止改码/字段断言，逐条留痕。

**门禁测试扩展**（submit-prompt-budget.test.ts 或新增姐妹文件）：
① tasks[] 子树描述递归和 ≤860；SUBMIT_PROMPT ≤1300 不破；
② 细则之家逐条断言（每条撤下的规则能在对应拒绝回执里读到）；
③ 行为锁：plan-granularity / plan-depends-e2e / plan-footprint-tool-schema /
plan-prototype-anchor-gate / canceled-coverage-gate（REQBOARD_TESTING_COVERAGE_GATE）/
dual-field / plan-footprint 全绿。

## 7. 文件结构（新建/修改/删除，拆分阶段变更盘点依据） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

**删除**（U1/U2）：
- `src/tools/ArchiveAmendTool/`（ArchiveAmendTool.ts / index.ts / summary.ts）
- `src/tools/NoteInterruptionTool/`（NoteInterruptionTool.ts / index.ts / prompt.ts）

**修改**：
| 文件 | 职责一句话 | 单元 |
|------|-----------|------|
| `src/tools/TaskAmendTool/TaskAmendTool.ts` | op 枚举/必填集/docs 参数/output 并集/分派/守卫按 op 分流 | U1+U2 |
| `src/tools/TaskAmendTool/prompt.ts` | 两 op 各一句 + 承接指路（单字面量纪律） | U1+U2 |
| `src/tools/TaskAmendTool/summary.ts` | 两个渲染分支迁入 | U1+U2 |
| `src/tools/registry.ts` | −2 条目、TaskAmend responseSources +2 用例、计数注释 | U1+U2 |
| `src/tools/index.ts` / `src/index.ts` | 摘除导出与注册 | U1+U2 |
| `src/tools/render-summaries.ts` | 删迁出的 noteInterruptionSummary | U2 |
| `src/tools/shared.ts` | 长文本登记表删 note_interruption 行 | U2 |
| `src/domain/stage/StageActions.ts` | 删 note_interruption 条目 | U2 |
| `src/application/dive/boundary-guard.ts` | task_amend op 级守卫分支 | U1+U2 |
| `src/application/use-cases/AmendArchiveManifest.ts` | 仅 D-3 文案（8 处前缀） | U1 |
| `src/application/use-cases/NoteInterruption.ts` | 仅 D-3 文案 + tool 字面量 | U2 |
| `src/http/routers/requirements.ts`、`src/shared/protocol.ts`、`src/application/internal/interruption.ts` | 注释改写 | U1/U2 |
| `src/tools/TaskMoveTool/TaskMoveTool.ts` | 描述压缩（形状不动） | U3 |
| `src/tools/SubmitTool/SubmitTool.ts` | tasks[] 描述压缩（形状不动） | U4 |
| plan 各门禁文件（plan-deps-check / plan-granularity / 锚点门禁 / normalizePlanTasks 等） | 回执只追加细则句 | U4 |
| README.md / package.json / tool-face-inventory.md / project-manual.md / knowledge 两页 | 21→19 与工具名口径 | U5 |

**测试**：改 tests/archive-reconcile-e2e / interruption-checkpoint / arg-guidance /
ask-confirm-prompt / task-amend-tool（新 op 用例）；新增 tests/task-move-prompt-budget.test.ts；
扩展 submit 预算门禁；D-3 波及断言逐条留痕。

**新建**：无源码新文件（除上述一个新测试文件）。

## 8. 行为等价验证设计（refactor 必备） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

**等价矩阵**：每个被收编工具的既有行为测试 ↔ 合并后测试（改打新 op，断言除 D-3 申报点外不变）：

| 原测试 | 合并后 | 等价判据 |
|--------|--------|---------|
| archive-amend.test.ts（用例级） | 不动（仍打用例） | 原样绿（D-3 文案断言若有则同步） |
| archive-reconcile-e2e.test.ts（壳级） | 改打 task_amend(op=archive) | 追加/幂等/状态守卫断言不变 |
| interruption-checkpoint.test.ts（壳级） | 改打 task_amend(op=interruption) | 断点字段断言不变；bp.tool 随 D-3 |
| interruption-dedupe.test.ts（用例级） | 不动 | 原样绿 |
| task-move-* / subtask-budget / chain-budget / done-throttle-* / amend-acceptance / legacy-compat-6749 | 不动 | 原样绿（FR-3 行为零变化的证据） |
| plan-* / dual-field / canceled-coverage-gate | 仅回执追加句的断言放宽 | 码/字段断言不变 |

**体量复测口径**（与基线同一脚本，判据可机械复跑）：

```bash
node_modules/.bin/tsx <脚本>   # defineTaskMoveTool/defineSubmitTool(stub deps)
# task_move：description.length + parameters 描述递归和 ≤ 630（基线 1265）
# submit：tasks[] 子树描述递归和 ≤ 860（基线 1717）；SUBMIT_PROMPT ≤ 1300
```

**契约面**：`pnpm vitest run tests/tools-dispatch.test.ts tests/output-contract.test.ts
tests/apply-wiring.test.ts tests/readme-tool-face.test.ts tests/toolviews-contract.test.ts
tests/tools-render-coverage.test.ts` 全绿（注册名单 = 19）。

**全量闸**（C-11~C-15）：`pnpm test`、`pnpm baseline:check`（失败集合差为空）、
`pnpm typecheck`、`pnpm kb:check`、`pnpm build`。

## 9. 回滚单元与批间独立验证（一次只改一类东西） <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

| 单元 | 内容 | 批间验证（过了才进下一单元） |
|------|------|------------------------------|
| U1 | op=archive 收编 + D-3(archive 部分) | archive-amend / archive-reconcile-e2e / task-amend-tool 绿；契约四件绿 |
| U2 | op=interruption 收编 + D-3(interruption 部分) + 守卫 op 化 | interruption-* / arg-guidance / StageActions 相关测试绿；契约四件绿 |
| U3 | task_move 描述压缩 | task-move-prompt-budget 新门禁 + §5 行为锁清单绿 |
| U4 | submit tasks[] 描述压缩 + 回执追加 | submit 预算门禁扩展 + §6 行为锁清单绿 |
| U5 | 同步面收尾（README/package.json/docs/知识层/注释） | readme-tool-face / kb:check / pnpm test 全绿 |

任一单元出问题 `git revert` 该单元 commit 即可；台账数据（~/.dsh/reqboard）不受影响。

## 10. 风险与边界 <!-- serves: FR-1, FR-2, FR-3, FR-4, FR-5 -->

- **存量调用硬断**：agent 按旧记忆调被删工具名 → unknown tool。缓解：task_amend prompt
  写明承接（参照第三批指路文案做法）。
- **减过头**：细则之家断言（§5②/§6②）机械防住；宁可少减不留孤儿规则。
- **回执追加撞断言**：只允许放宽文案断言，禁止改码/字段断言（§6 纪律）。
- **不做**：用例判定逻辑、状态机、台账 schema、HTTP 路由、client 端（toolviews 已初核零引用，
  若实施中发现反例退回设计）、双拼归一化（G10 另立）、task_amend 改名。
