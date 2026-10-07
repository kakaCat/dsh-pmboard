---
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
---

# 架构设计（REQ-261006201920-2adc）

> 本文档面向：开发、测试、验收。设计语言以技术为主；每节标题带 `serves:`，缺标注 = 孤儿章节被门禁拦。

## 目标与总体方案 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

**问题**：验收这件事在三层各自漏——计划期只查「有没有命令字样」，子卡落库不回填模板占位符，裁决期只要有字就算数。

**当前状况**：

- 计划期判据 `checkAcceptance` 的 `VERIFIABLE_ANCHOR` 含 `npx`/`vitest` 等命令词，所以 `npx vitest run <相关测试文件>` 判绿。
- 子卡验收标准来自 `STAGE_ACCEPTANCE` 模板**字面量**，`makeChild` 原样落库。
- 返工卡由 `reworkSpecFor` 直接取验收项判据原文，**不过任何判据**。
- 裁决期 `applyVerdicts` 只判「有没有文字」，不判文字是否可复核；系统缺口项的处置只要非空即可。

**设计方案**：不新增状态、不新增门类，只在**已有的三层落点**各补一条判据，并给每条配可复跑的用例。

| 层 | 落点（唯一） | 本需求新增的判据 |
|---|---|---|
| 计划期 | `domain/task/Acceptability.checkAcceptance` | 命令的操作数仍是占位符 → 拒 |
| 落库期 | `application/internal/lazy-expand.makeChild` | 按声明式词表回填模板占位符，残留即报错 |
| 落库期 | `domain/workflow/AcceptanceSheetSpec.reworkSpecFor` | 返工卡标准必须过两道判据；继承来源卡引用与体量 |
| 裁决期 | `domain/workflow/AcceptanceSheetSpec.applyVerdicts` | 结果锚点 / 人工项事实 / 覆盖理由 / 处置模板 |

**不这么做的后果**：验收标准继续是模板、裁决继续是两个字，归档照旧放行——「验收」这个词在台账上不再对应任何事实。

## 三层判据与唯一事实源 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

判据一律**单点**，调用方只做搬运（本仓「两处判定必漂移」的既有教训）：

| 判据 | 唯一实现处 | 谁调用 |
|---|---|---|
| 占位符（计划期） | `Acceptability.checkAcceptance` | `shared/protocol.normalizePlanTasks`、`AmendTaskAcceptance` |
| 「怎么验」（验收期） | `Acceptability.checkHowToVerify` | `SubmitVerification`、返工卡落库路径 |
| 占位符词表与回填器 | `domain/task/SubtaskTemplate`（模板的生产者） | `application/internal/lazy-expand` |
| 结果锚点 / 人工项事实 / 处置模板 | `domain/workflow/AcceptanceSheetSpec` | `application/internal/verdicts`（两通道共用） |

**为什么回填器放 `SubtaskTemplate`**：占位符是**模板自己生产的**，词表与生产者同处才不会被改漏；
判据（正则）放 `Acceptability`，因为作者手写的占位符不限于词表，判据必须比词表宽。

## 模块改动地图 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

```
                     计划提交                         父卡开工
   protocol.normalizePlanTasks ──▶ checkAcceptance      lazy-expand.expandSubtasks
                                        │                    │
                                        │ 占位符即拒          │ makeChild
                                        │                    └─▶ fillStageAcceptance（新增：词表回填）
                                        │                              │
                                        │                              └─▶ 残留即抛（响亮）
                                        │
   裁决（两条通道）                      │                     返工
   http/routers/verdicts ──┐            │        reworkSpecFor ──▶ checkAcceptance + checkHowToVerify
   use-cases/AcceptSheet ──┴─▶ applyVerdicts                      └─▶ 继承 origin 的 refs/footprint
                                  │
                                  ├─▶ 结果锚点判据 / 人工项事实判据 / 处置模板
                                  └─▶ verdicts.applyVerdicts（应用层）
                                          └─▶ 覆盖必须带理由 + 原文留档（resultSuperseded）
```

**改动清单**：

| 文件 | 动作 | 职责（一句话） |
|---|---|---|
| `src/domain/task/Acceptability.ts` | 改 | 新增占位符判据常量与 `checkAcceptance` 分支 |
| `src/domain/task/SubtaskTemplate.ts` | 改 | 新增占位符声明表 + `fillStageAcceptance` 回填器（纯函数） |
| `src/application/internal/lazy-expand.ts` | 改 | `makeChild` 落库前回填 + 残留断言 |
| `src/domain/workflow/AcceptanceSheetSpec.ts` | 改 | 返工规格过检与继承；裁决期三条新判据；处置模板 |
| `src/application/internal/verdicts.ts` | 改 | 覆盖写入带理由与原文留档；返工卡落库带 refs/footprint |
| `src/http/routers/verdicts.ts` | 改 | 解析并透传 `changeReason` |
| `src/application/use-cases/AcceptSheet.ts` | 改 | 覆盖项补问变更理由（弹框通道） |
| `src/client/views/panels/verify.ts` | 改 | 裁决行渲染变更理由输入与原文保留展示 |
| `src/client/stage-panel.ts` | 改 | 同口径渲染（验收面板第二处收集链） |
| `src/client/board-mount.ts` | 改 | 收集并提交 `changeReason`；前置守卫 |
| `src/client/styles/board.ts` | 改 | 新控件样式（复用既有令牌，不新增色板） |

**新增文件**：无（全部落在既有单点上，避免再造一个「判据散落」的入口）。

## 占位符词表与回填器 <!-- serves: FR-1 -->

**词表是声明式闭集**，与 `STAGE_ACCEPTANCE` 同处 `SubtaskTemplate.ts`：

| 占位符 | 语义 | 回填取值 | 取不到时的兜底 |
|---|---|---|---|
| `<REQ>` | 本需求 id | `requirementId` | 不可缺（必有） |
| `<taskId>` | 本卡 id | 子卡生成时的 id | 不可缺（必有） |
| `<本卡改动涉及的测试文件>` | 本卡测试文件 | 父卡验收标准里点名的 `tests/**` 路径 | `tests/` |
| `<相关测试文件>` | 同上 | 同上 | `tests/` |
| `<本卡接口/契约对应的测试文件>` | 联调相关测试 | 同上 | `tests/` |
| `<新增回归用例>` / `<回归用例>` | 回归用例 | 同上 | `tests/` |
| `<探针用例>` / `<自检用例>` / `<校验用例>` / `<e2e用例>` | 本卡用例 | 同上 | `tests/` |
| `<脚本>` / `<执行脚本>` | 本卡脚本 | 父卡验收标准里点名的 `scripts/**` 路径 | `*.mts`（保住 `npx tsx scripts/*.mts` 这条可跑命令） |

**回填器的三条纪律**：

1. **只认词表内的 token**；出现词表外的尖括号 token → **抛错**（不许静默放行，否则「残留为 0」不可证）。
2. 回填后的文本里**不得再有尖括号 token**（回填器自检，失败即抛）。
3. `STAGE_ACCEPTANCE` 模板字面量**原样不动**——已有用例断言模板自身的锚点与 `<taskId>` 形态；
   回填发生在**落库那一刻**，不改模板、不改 `buildSubtaskSpecs` 的返回值。

**提取父卡测试文件的判据**：从父卡验收标准里取形如 `tests/...` 且带测试后缀（`.test.ts`/`.spec.ts`/`.test.js`…）的路径，去重后以空格连接；取不到即用兜底。

## 返工卡落库路径 <!-- serves: FR-2 -->

返工卡的来源是**验收项**，验收项的来源可能是任务卡、也可能是需求级/对照项。因此标准取值按优先级：

```
item.criterion（判据原文）
   ├─ 过 checkAcceptance 且过 checkHowToVerify  →  直接用
   ├─ 否则取 originTask.acceptance（来源卡标准）
   │     └─ 过两道判据 → 用它当返工卡标准；判据原文进 description 留档
   └─ 否则（无来源卡的对照项 / 来源卡标准也不可执行）
         └─ 合成可证伪标准：以「修复对象 + 可跑命令 + 期望读数」三段式拼出，仍过两道判据
```

**继承面**：`requirementRefs` / `prototypeRefs` / `decisionRefs` / `footprint` 从来源卡逐字继承。
`prototypeRefs` 也必须继承——否则 UI 卡的返工卡会因缺原型锚点被 UI 卡门禁拒绝，等于把返工卡钉死。

**为什么不是「判据不过就拒绝」**：返工卡由人点「退回返工」或系统在 failed 裁决时物化，拒绝会让**人工门变成死路**。
本仓既有纪律：硬拦必须配修复路径。故采取「兜底标准仍然可证伪」而不是「拒绝落库」。

## 裁决结果契约与两通道 <!-- serves: FR-3 -->

**权威判据在服务端**，两条通道只是采集器：

```
看板通道：verify.ts / stage-panel.ts 渲染 ──▶ board-mount 收集 ──▶ POST /req/verdicts ──┐
                                                                                        ├─▶ applyVerdicts（域）
弹框通道：reqboard_accept_sheet ──▶ questions.ask ──▶ AcceptSheet ───────────────────────┘
```

**覆盖的判定**：一条 `passed` 裁决带了文本、且该文本与该项**已有的 agent 实测结果不同**、且 `resultSource === 'agent'` → 记为「覆盖」。
覆盖必须带 `changeReason`；缺理由时**该次覆盖被拒**（不是整批拒绝，文案给出「可不覆盖 / 或补理由」两条路）。

**原文留档**：覆盖生效时把 agent 原文写进 `resultSuperseded`，人的文本写进 `result` 并把 `resultSource` 置 `human`。
重复覆盖时 `resultSuperseded` 保留**最初那次**的 agent 原文（不被中间值冲掉）。

**弹框通道怎么取理由**：`AcceptSheet` 在第一轮问答后，对「会被判为覆盖」的项**补一轮问答**（id 形如 `<itemId>#change-reason`）；
未作答该项 → 不执行覆盖（保留 agent 原文），并按未覆盖记录裁决。

## 系统缺口处置判定点 <!-- serves: FR-4 -->

处置模板的判据在域层，两种语义形态（已处置 / 确认无需），**不锁死措辞、锁死有没有给出结论**：

| 形态 | 认得的写法 | 附加要求 |
|---|---|---|
| 已处置 | 补了 / 已补 / 补上 / 新增 / 加了 / 修了 / 已覆盖 | 给出补了什么（去空白后长度 > 6） |
| 确认无需 | 确认无需 / 无需 / 不需要 / 不适用 / 暂不 / 不做 | 给出为什么（去空白后长度 > 6） |

**与既有实现的关系**：`applyVerdicts` 现有前置校验是「系统项通过时 opinion 非空」，本次**收紧为命中模板**；
`dispositionMissingItems` 从「只被用例调用」升级为 `isFullyDecided` / `sheetGateStatus` 的输入——
于是「处置为空」不只是登记一条读数，而是真的**不放行归档**。

## 与相邻窗口的接缝：锚点词表 <!-- serves: FR-3 -->

另一窗口正在建设 `domain/workflow/EvidenceAnchor.ts`（自称「可核验锚点」的唯一事实源，服务**条款级判据**与**结单证据**）。
本需求需要的是**裁决 result 的锚点**，属同族不同面。接缝约定：

- **不 import 未提交的文件**（两个窗口互相拖死）；本需求在自己的改动面内定义 result 锚点词表。
- **公开差集**：result 锚点必须认**截图 / 日志 / 图片**等证据介质（`.png`/`.jpg`/`.webp`/`.log` 等），
  因为「只能人看」的项的证据就是截图；而条款级词表不含这些后缀。
- **共享核心一致**：命令词、代码/文档路径、明确计数三类两边都认——收尾时把两份并到一处即可，不需重判。

## 不做的事（边界） <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

- **不追溯改写存量卡**（含 944 张带占位符的历史卡）：证据优先，历史标准保持可考。
- **不做存量批量回填工具**：同上，且批量改写会让「当时的标准」不可复原。
- **不碰原型门、归档校验、测试基线**（D-1 原文：「只动验收/卡片质量这一片文件域，不要碰原型门、归档校验、测试基线（那三块有别的窗口在做）」）。
- **不放宽任何既有判据**：`VERIFIABLE_ANCHOR`、`HOW_TO_VERIFY`、四道人工门逐字不变。
- **不新增状态值**：裁决五值（pending/passed/failed/not_verifiable/unverified）原样。

## 回滚与兼容 <!-- serves: FR-1, FR-2, FR-3, FR-4 -->

| 项 | 口径 |
|---|---|
| 是否改表 / schema | **否**。台账为 JSON 分片，本需求只**新增可选字段**，零 DDL、零迁移脚本 |
| 字段兼容 | `resultSuperseded` / `resultChangeReason` / `changeReason` 全部可选；旧记录缺字段照常可读 |
| 旧调用方 | 看板旧版不传 `changeReason` 时：**不覆盖**（保留 agent 原文），仍记录裁决——不报错、不丢裁决 |
| 回滚方式 | 还原本需求改动的文件即可；无数据回填、无状态修复 |
| 历史台账 | 逐字可读；本需求不重算任何历史验收单 |
