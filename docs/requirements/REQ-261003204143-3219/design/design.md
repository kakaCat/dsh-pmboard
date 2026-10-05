---
req_id: REQ-261003204143-3219
serves: FR-1, FR-2, FR-3
---

# 设计：reqboard_capture 回执 ↔ 输出 schema 契约修复

> 类型：bug（轻档）｜ 方法：先复现 → 根因定位 → 修复方案 → 回归落点。
> 读者：实施者与复核者（技术语言为主，每节标注服务的功能点）。

## 目标（serves: FR-1, FR-2, FR-3）

一句话（可证伪）：**reqboard_capture 任意分支的回执，用绑定层同款校验器
（`@deepseek-ai/dsh-tools` 的 `validateJsonSchemaValue`）过自己声明的
`output.schema`，违例数 = 0**；且 `answers` 五键有单一事实源，
新增问项漏改 schema 时测试红并点名。

## 复现（serves: FR-2）

**实测现场**（2026-10-03 20:44，本窗口真实调用，非构造）：

```
tool "reqboard_capture" returned invalid output:
"value.answers.workspace" is not a declared property (additionalProperties: false)
```

后果：用户已答完五问，回执被校验层整个拒收——弹框立项通道 100% 断流。

**最小复现用例**：`tests/capture-output-contract.test.ts`（已落盘）——
直调 `execute` 拿**真实回执**（成功 + 用户取消两条路径），
用 `validateJsonSchemaValue(tool.output.schema, receipt)` 断言零违例。
在 schema 缺 `workspace` 声明时两条用例必红；
反向演练（实施卡内执行）：从 schema 摘 `workspace` → 红，加回 → 绿。

## 根因（serves: FR-1）

REQ-260929210741-30ae 给弹框加第五问「工作区」时，**三处同步漏了一处**：

| 位置 | 当时是否同步 |
|---|---|
| `application/internal/capture-mapping.ts` 的 `CaptureMapping.answers`（5 键） | ✅ 已加 `workspace` |
| `tests/capture-tool.test.ts`（五问口径断言） | ✅ 已同步 |
| `tools/CaptureTool/CaptureTool.ts` 的 `output.schema.answers`（只 4 键 + `additionalProperties:false`） | ❌ **漏改** |

防线缺口（为什么漏了没人报警）：

| 既有防线 | 覆盖什么 | 为什么没抓住 |
|---|---|---|
| output-contract 静态扫描（`RESPONSE_SOURCES`） | 顶层 `return {...}` 键 | **嵌套对象**（`answers.*`）的键扫不到 |
| `capture-tool.test.ts` | 回执形状断言 | 断言的是值，**不过 schema** |

判定依据：校验行为在 `dsh-tools/lib/index.js:468`——逐键比对
`additionalProperties:false`，未声明键即整条违例，行为本身是**对的**（是它抓住了漂移）。

## 修复方案（serves: FR-1, FR-2, FR-3）

### FR-1 · schema 补声明（核对即过，不重复改）（serves: FR-1）

`CaptureTool.ts` 的 `output.schema.answers.properties` 补
`workspace: { type: 'string' }`。
**现状说明**：该修复已在工作区存在（并行窗口落地，注释锚点与本设计一致），
实施时只做**存在性核对**（grep 锚点 + 契约用例绿），不重复改动、不回滚。

### FR-2 · 动态契约用例（已落盘，保持绿）（serves: FR-2）

`tests/capture-output-contract.test.ts`：两条路径（成功立项 / 用户取消）的真实回执
过工具自己声明的 `output.schema`。校验器直接用 dsh-tools 导出的同一个，
不另写"差不多"的检查。

### FR-3 · answers 键清单收敛一处共享常量（serves: FR-3）

| 处 | 改动 |
|---|---|
| `capture-mapping.ts` | 导出 `CAPTURE_ANSWER_KEYS = ['title','category','difficulty','docLocation','workspace'] as const`；`CaptureMapping.answers` 类型改由它派生（`Record<(typeof CAPTURE_ANSWER_KEYS)[number], string>`）——**加键不加常量 = 类型错** |
| `CaptureTool.ts` | `answers.properties` 由 `CAPTURE_ANSWER_KEYS` 生成（`Object.fromEntries`），不再手写五行——**常量与 schema 物理同源** |
| `capture-output-contract.test.ts` | 增断言：`mapCaptureAnswers(全量作答).answers` 键集 === `CAPTURE_ANSWER_KEYS`，且 schema `answers.properties` 键集 === `CAPTURE_ANSWER_KEYS` |

反向演练（实施卡内执行并记录）：从常量摘一个键 → tsc 错 + 用例红并点名。

### 与并行窗口（REQ-261003204149-1e80）的分工（serves: FR-1, FR-3）

他们扩展的 `RESPONSE_SOURCES` 静态扫描管**顶层** return 键；
本需求管 **answers 嵌套层** + **动态过 schema**——两层互补，不重复、不改他们的文件。
`SubmitTool` 的 `auto_confirm` 修复同属并行窗口范围，本需求**不碰**。

## 回归测试落点（serves: FR-2, FR-3）

| 文件 | 角色 |
|---|---|
| `tests/capture-output-contract.test.ts` | 主用例（FR-2 动态过 schema + FR-3 键集同源断言） |
| `tests/capture-tool.test.ts` | 既有五问口径套件，零回归 |
| `tests/tools-schema.test.ts` | 工具构造不抛（schema 合法性） |

## 验收口径（serves: FR-1, FR-2, FR-3）

```bash
# 主判据：契约用例 + 既有套件全绿
npx vitest run tests/capture-output-contract.test.ts tests/capture-tool.test.ts tests/tools-schema.test.ts
# 期望：3 文件全绿

# 反向演练（实施记录中给证据）：
# ① 从 CaptureTool schema 摘 workspace → capture-output-contract 红且点名 answers.workspace
# ② 从 CAPTURE_ANSWER_KEYS 摘一键 → tsc 报错 + 键集断言红
```

## 边界（不做）（serves: FR-1）

- 不改五问题目、默认值、哨兵解析逻辑（弹框内容无缺陷）。
- 不碰 `SubmitTool.auto_confirm` 与 `RESPONSE_SOURCES` 三个缺映射工具——并行窗口在制。
- 不把静态扫描面扩到嵌套对象——FR-3 的共享常量 + 动态用例已是更小的根治。
