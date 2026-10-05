---
req_id: REQ-261003204143-3219
requirement_refs: [FR-1, FR-2, FR-3]
sides: backend
---

# 修复 reqboard_capture 弹框答案契约：answers.workspace 未声明导致立项必炸

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：bug ｜ 档位：**轻档（bounded）** ｜ 立项：2026-10-03
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

一句话：**立项弹框收集的答案里有一个 `workspace` 字段，而工具输出 schema 没声明它——于是每一次弹框立项的回执都被校验层整个拒收，弹框通道 100% 不可用。**

现场是 2026-10-03 的真实踩坑：agent 调 `reqboard_capture`、用户照常作答五问，
工具却只返回一条硬错误——`"value.answers.workspace" is not a declared property (additionalProperties: false)`。
需求没建成、答案白答，agent 只能改走 `reqboard_create` 手工路径兜底。

根因是**一处三处不同步**：REQ-260929210741-30ae 给弹框加了第五问「工作区」，
用例层（`mapCaptureAnswers` 的 `answers` 契约）与单元测试都同步了，
**唯独工具输出 schema（`CaptureTool.ts` 的 `output.schema.answers`）漏加**——
且现有 output-contract 静态扫描只覆盖 `agent-tools.ts`，不覆盖 `src/tools/` 目录，漂移无人报警。

**本需求做一件事**：让 capture 回执与输出 schema 重新同源，并补上"回执必须过自己声明的 schema"的反向用例。
**不做一件事**：不改五问的题目与取值逻辑（弹框内容本身没有问题）。

## 业务流程图

```
 今天（每条回执都被拒收）                    本需求后（回执通过校验）
 ────────────────────────────              ──────────────────────────────
  用户答完五问                               用户答完五问
    │ answers = {..., workspace}               │ answers = {..., workspace}
    ▼                                          ▼
  captureRequirement 组回执                   captureRequirement 组回执
    │ 含 answers.workspace                     │ 含 answers.workspace
    ▼                                          ▼
  绑定层按 output.schema 校验                 绑定层按 output.schema 校验
    │ answers 只声明 4 键 +                    │ answers 声明 5 键
    │ additionalProperties:false               │ （含 workspace）
    ▼                                          ▼
  ✗ 整份回执判非法 → invalid output          ✓ 回执送达 agent
    │ 立项结果/失败原因全丢                      │ success/fallback/note 可见
    ▼                                          ▼
  agent 拿到无信息硬错误，只能猜               agent 按回执继续流水线
```

## 产品定义

`reqboard_capture` 是 PM 插件的**立项弹框入口**：一次调用弹出「名称/类型/难度/文档位置/工作区」五问，
作答即创建需求、绑定窗口、推进到 brainstorming。它是 agent 侧首选立项通道
（`reqboard_create` 只是弹框不可用时的手工兜底）。该通道炸掉 = 所有走弹框的立项全部断流。

### 证据锚点（源码钉死，不依赖猜测）

| 位置 | 事实 |
|---|---|
| `src/application/internal/capture-mapping.ts:194-200` | `CaptureMapping.answers` 契约含 5 键（含 `workspace`） |
| `src/application/use-cases/CaptureRequirement.ts:58` | 失败回执的默认 answers 也含 `workspace: ''` |
| `src/application/use-cases/CaptureRequirement.ts:275` | 成功回执 `answers: mapped.answers`（含 `workspace`） |
| `src/tools/CaptureTool/CaptureTool.ts:46-55` | 输出 schema 的 answers 只声明 4 键 + `additionalProperties:false` |
| `tests/output-contract.test.ts` 头注 | 静态扫描只覆盖 `agent-tools.ts`，`src/tools/` 目录不在扫描面 |

## 功能点总览

| # | 功能点 | 验收方式 |
|---|---|---|
| FR-1 | 输出 schema 补声明 `answers.workspace`（string），与 `CaptureMapping.answers` 五键逐一对齐 | `npx vitest run tests/capture-tool.test.ts` 全绿 + 新增契约用例绿 |
| FR-2 | 新增反向用例：capture **成功与失败两条路径**的回执，键集必须 ⊆ 工具自己声明的输出 schema（嵌套 answers 逐键比对） | 新增用例先在修复前红（证明能抓住本次漂移）、修复后绿 |
| FR-3 | 防再漂移：answers 键清单收敛为**一处共享常量**（用例/ schema / 测试三处同源引用），新增问项漏改 schema 时测试红并点名 | 反向演练：从常量摘一个键 → 用例红 |

## 复现步骤

1. 任意窗口调 `reqboard_capture`（弹框通道立项）；
2. 用户照常答完五问（含第 5 问「工作区」，任选一项）；
3. 观察工具回执。

**期望**：返回立项回执（success/requirement_id/board_link）。
**实际**（2026-10-03 20:44 本窗口实测）：工具只返回硬错误
`"value.answers.workspace" is not a declared property (additionalProperties: false)`，
回执整体被校验层拒收；成功与失败分支均必现（两路径的 answers 都带 `workspace`）。

非弹框等价复现：`npx vitest run tests/capture-output-contract.test.ts`——
用绑定层同款校验器过真实回执，schema 缺 `workspace` 声明时两条用例红。

## 根因

REQ-260929210741-30ae 给弹框加第五问「工作区」时三处同步漏了一处：
`CaptureMapping.answers`（5 键，含 `workspace`）与单测已同步，
**`CaptureTool.ts` 的 `output.schema.answers` 只声明 4 键且 `additionalProperties:false`**。
既有静态契约扫描只比**顶层** return 键，嵌套 `answers.*` 的键漂移扫不到；
既有单测断言回执取值但**不过 schema**——两层防线都照不到嵌套键，漂移存活至今。
（逐文件行号锚点见上文「证据锚点」表；校验器行为在 `dsh-tools/lib/index.js:468`。）

## 回归

| 落点 | 断什么 |
|---|---|
| `tests/capture-output-contract.test.ts`（本需求新增） | 成功 + 取消两条路径的真实回执过工具自己声明的 `output.schema`（绑定层同款 `validateJsonSchemaValue`）；`answers` 键集与共享常量同源断言 |
| `tests/capture-tool.test.ts`（既有） | 五问口径零回归 |
| `tests/tools-schema.test.ts`（既有） | 工具构造不抛（schema 合法性） |

反向演练（实施时执行并留证据）：① 从 schema 摘 `workspace` → 契约用例红并点名；
② 从共享常量 `CAPTURE_ANSWER_KEYS` 摘一键 → tsc 错 + 键集断言红。

## 边界（不做）

- 不改五问题目、默认值、哨兵解析（`resolveWorkspaceAnswer`）——弹框内容逻辑是对的。
- 不把 output-contract 静态扫描面扩到全 `src/tools/`——那是更大的清偿，另立需求；
  本需求只对 capture 这一处补动态契约用例。
- 不动宿主绑定层的校验行为（additionalProperties:false 拒收是**对的**，是它抓住了这次漂移）。

## 验收判据（可复核）

```bash
# 修复前：新增契约用例红（抓住 answers.workspace 未声明）
# 修复后：以下全绿
npx vitest run tests/capture-tool.test.ts
# 既有套件零回归
npx vitest run tests/capture.test.ts tests/capture-hook.test.ts tests/tools-schema.test.ts
```

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

> 本需求文档尚未定义功能点编号。

<!-- reqboard:marks:end -->
