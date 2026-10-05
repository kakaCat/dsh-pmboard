---
serves: FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9
---

# REQ-261002175818-80a8 拆分计划 · 拆分阶段预判单轮余量

## TL;DR

一句话：**给拆分环节装一把尺子（卡片体量）和一条刻度（一轮容量），让「这张卡一轮改不完」在批准之前被看见。**

现场是一句人话：*「余量 = 我这一轮还能清醒处理的细节量；它不够支撑一次『100 个文件必须一次改完』的手术。」*

**本计划自应用了它自己要建的东西**（见文末「体量自检」）：这个需求整体 24 个文件、36.4 DU，
超过一轮容量 16 DU → **本就必须分批**；切成 10 张卡后最大单卡 5.75 DU，全部装得下。

改动落在 **10 张卡、4 个批次**：算术与契约（t1–t4）→ 判定与呈现（t5–t7）→ 兼容与纪律（t8–t9）→ 收口（t10）。

三件事**不做**：不做硬拒绝（软门禁，人可知情放行）、不做校准闭环（另立需求）、不改 DSH 侧 token-meter（只读投影）。

## 改动盘点（对照设计文档逐份）

| 设计文档 | 落点文件 | 改动 | 接收任务 |
|---|---|---|---|
| design/architecture.md | `src/domain/task/Footprint.ts`（新） | 体量算术与判定纯函数（零 import 外层） | t1 |
| design/data-model.md | `src/domain/limits.ts` | 增 5 条具名常量（容量 16 DU、三权重、单值上限） | t1 |
| design/data-model.md | `src/shared/protocol.ts` | `CardFootprint` / `PlanTask.footprint?` / `TaskRecord.footprint?` / `OverCapacityItem` / `CapacityNote` / `ContextPressureSnapshot`；`normalizePlanTasks` 白名单补一项并调两个校验 | t2 |
| design/architecture.md | `src/application/internal/plan-landing.ts` | `PlanTaskDraft` 与 `TaskRecord` 两条映射各补一行 | t2 |
| design/architecture.md | `src/application/internal/approved-plan-landing.ts`、`src/application/use-cases/Decompose.ts` | `draftOf()` 与 Decompose 的两条手写映射各补一行 | t2 |
| design/interfaces.md | `src/tools/SubmitTool/SubmitTool.ts` | 入参 `tasks[].footprint`、出参 `overCapacity`/`capacityNote`/`tasks[]` 回显 | t3 |
| design/interfaces.md | `src/application/ports.ts`、`src/adapters/SessionProbeAdapter.ts`、`tests/application/harness.ts` | 新端口 `contextPressure` + 三级降级读取 + 替身补实现 | t4 |
| design/architecture.md | `src/application/use-cases/SubmitArtifact.ts` | 判定 + 返回体 `overCapacity`/`capacityNote` + 旁挂标记校验 | t5 |
| design/architecture.md | `src/application/internal/content-gate-wiring.ts`、`src/application/internal/artifact-gates.ts` | 标记在场门禁 + `plan_overcapacity_marker_missing` 码 | t5 |
| design/interfaces.md | `src/plugin-config.ts` | `capacity.{roundDetailUnits,markerGate}` + `resolveRoundCapacity` | t5 |
| design/interfaces.md | `src/application/use-cases/AskConfirm.ts`、`src/http/routers/requirements.ts` | 弹框自动追加清单（调用方零改动）+ 看板批准评论 | t6 |
| design/architecture.md | `src/application/internal/node-input-package.ts`、`src/application/use-cases/IsolateNodeContext.ts` | 「一轮余量（参考）」节，照「断点」节写法 | t7 |
| design/interfaces.md | `src/application/use-cases/TaskTree.ts`、`src/tools/TaskTreeTool/TaskTreeTool.ts` | 顶层余量参考 + 每卡 `footprint`/`footprintState`（白名单三处同改） | t7 |
| design/test-cases.md | `tests/plan-footprint-compat.test.ts`（新） | 兼容与缺省（未声明 ≠ 0） | t8 |
| design/architecture.md | `src/domain/prompt/fragments/decomposing/{heavy,light}.md` + 生成物 | 拆分节点的容量纪律段 | t9 |
| design/test-cases.md | 全量回归、尺寸/类型门禁、真实冒烟三条 | 收口与证据留档 | t10 |

## 覆盖对照表

| 需求条款 | 条款内容 | 接收任务 |
|---|---|---|
| FR-1 | 计划卡可声明体量 footprint（三字段） | t1、t2、t3、t9、t10 |
| FR-2 | 声明不得小于证据（防蒙门禁） | t1、t2、t5、t10 |
| FR-3 | 容量判据是单一源的自标定常量 | t1、t5、t9、t10 |
| FR-4 | 超容量在提交返回体结构化报出 | t3、t5、t6、t10 |
| FR-5 | 超容量在计划文档标红且校验标记在场 | t5、t9、t10 |
| FR-6 | 超容量进入批准闸门的问题文本 | t6、t10 |
| FR-7 | footprint 端到端贯通到落库任务卡 | t2、t10 |
| FR-8 | 余量参考只读展示并标注非判据 | t4、t7、t10 |
| FR-9 | 不判定缺失声明的卡，不 bump schemaVersion | t2、t7、t8、t10 |

> t10 出现在每一行，不是凑数：它是收口卡（全量回归 + 冒烟三条），**逐条验证上面每一条**。
> 落库门禁要求「每张卡都有条款引用」——只看条款被谁接收会漏掉这种"验证型"卡。

## 任务表

| 顺序 | key | 业务标题 | 类型 | 依赖 | 验收要点 |
|---|---|---|---|---|---|
| 1 | t1 | 体量算术落地：三个可数的量、一条声明下限 | implement / backend | — | `tests/round-capacity.test.ts` T1–T4 全绿；未声明→undefined；113 DU→8 批；缩水抛专用码 |
| 2 | t2 | 体量声明进台账、活到任务卡上（防静默丢弃） | implement / backend | t1 | `tests/plan-footprint-propagation.test.ts` 全绿；**删白名单一项必须变红** |
| 3 | t3 | 工具门面：让体量进得来、超容量出得去 | implement / backend | t2 | `tests/output-contract.test.ts` 全绿（漏声明键即红） |
| 4 | t4 | 余量读数接进来：只读、可缺省、不冒充 0 | implement / backend | t2 | `tests/capacity-reference.test.ts` 降级用例全绿；typecheck ≤ 223 |
| 5 | t5 | 超容量看得见（一）：提交时说清哪张卡装不下 | implement / backend | t3、t4 | `tests/plan-footprint.test.ts` + `tests/plan-overcapacity-notice.test.ts` 全绿；`markerGate='warn'` 仍给 gaps |
| 6 | t6 | 超容量看得见（二）：批准前摆在人眼前 | implement / backend | t5 | T8a–T8d 全绿；无超容量卡时弹框文本**逐字节不变** |
| 7 | t7 | 余量参考上屏：节点输入包与任务树，都标「非判据」 | implement / backend | t4 | T9a–T9d 全绿；不可得时整节不出现 |
| 8 | t8 | 老数据别被新规矩绊倒（迁移与兼容单列） | test / backend | t5、t7 | T10a–T10d 全绿；`footprint` 键不存在（hasOwnProperty 为 false） |
| 9 | t9 | 让下一个拆分节点自己会算容量 | doc / backend | t5 | `check-prompt-fragments.mjs` 退出 0；`tests/prompt-gates.test.ts` 全绿 |
| 10 | t10 | 收口：兼容核对、回归基线与真实冒烟 | test / backend | t6、t8、t9 | 全量失败数 ≤ 106；尺寸命中 0；冒烟三条数字留档 |

## 体量自检（本需求用自己的尺子量自己）

权重与容量取 design/data-model.md 的口径：`detailUnits = files×1 + anchors×0.5 + chars/2000`，容量 **16 DU**。
声明口径按 FR-2 的下限规则取 `files = max(改动文件数, implementation 里点到的去重路径数)`——
**读懂一个文件也要占清醒度**，所以点到即计入。

| key | files | anchors | chars | detailUnits | 超容量 |
|---|---|---|---|---|---|
| t1 | 4 | 2 | 774 | 5.39 | 否 |
| t2 | 4 | 1 | 609 | 4.80 | 否 |
| t3 | 1 | 1 | 401 | 1.70 | 否 |
| t4 | 3 | 2 | 450 | 4.22 | 否 |
| t5 | 4 | 1 | 648 | 4.82 | 否 |
| t6 | 2 | 1 | 400 | 2.70 | 否 |
| t7 | 4 | 1 | 465 | 4.73 | 否 |
| t8 | 5 | 1 | 501 | 5.75 | 否 |
| t9 | 3 | 3 | 335 | 4.67 | 否 |
| t10 | 1 | 3 | 334 | 2.67 | 否 |

**结论与四条诚实说明**：

1. **本需求整体不拆 = 24 个文件 / 36.4 DU / 建议 3 批**——它自己就是那个「一轮改不完的手术」，
   这正是它要解决的问题的实证；切成 10 张卡后最大单卡 5.75 DU，**无卡超容量，故本计划无需写「⚠️超容量」标记**。
2. 这些数字是**按设计口径手工声明**的（门禁要 t5 才落地），所以它们同时是本设计的第一个真实用例样本；
   `anchors` 按验收里可执行命令/断言的条数计，`chars` 按 implementation + acceptance 合计字符数计。
3. t10 的 files=1 来自 acceptance 里点到的 `tests/size-budget.test.ts`（该卡不新增文件）——
   这正是「点到即计入」口径的体现，不是笔误。
4. **上表的 footprint 目前只活在本文档里**：工具入参 schema 要到 t3 才收 `footprint` 键，
   故本次提交的 tasks **不带** footprint（否则被 `additionalProperties:false` 拒收）。
   这不是遗漏——它正是 FR-7 要打通的那条链在链子造好之前的必然状态。

## 首次落库失败与修复（留痕）

**现象**：计划批准后自动链落库失败，台账评论：

> `[自动开跑失败] reqboard_decompose 未执行：计划卡缺少需求条款引用（t10）`

**根因（两个通道同时漏了同一张卡）**：

1. **工具入参通道不可用**：宿主进程持有的是今天 09:30 构建之前的工具 schema，
   `tasks[].requirement_refs` 被 `additionalProperties:false` 在绑定层直接拒收——
   本计划提交时因此**没能**通过入参携带引用（不是漏写，是写不进去）；
2. **文档通道被我漏写**：本表最初只把 t1…t9 映射到 FR-1…FR-9，**t10（收口卡）没有任何条款**。

两条通道各自失效、恰好互相掩盖：提交时的覆盖度门只问「每条 FR 有没有被某张卡接收」（通过），
落库门才问「每张卡有没有条款引用」（t10 落空）。**只看一个方向的覆盖，就看不见这个缺口。**

**修复**：把 t10 补进本表每一行（它是逐条验证的收口卡），重新提交计划并重新批准。

**这条留痕的用途**：它是本需求要解决的问题的一个同构样本——覆盖关系是**双向**的，
而门禁只守了一个方向。是否把「双向覆盖」纳入门禁，属后续裁定，本需求不做。

## 批次与依赖（为什么这样切）

```
   批1 算术与契约              批2 判定与呈现                批3 兼容与纪律        批4 收口
 ┌──────────────────┐    ┌────────────────────────┐    ┌────────────────┐   ┌──────────┐
 │ t1 体量算术       │───►│ t2 契约与贯通            │───►│ t3 工具门面     │──►│          │
 └──────────────────┘    └────────────────────────┘    └────────────────┘   │          │
                                  │                      ┌────────────────┐  │          │
                                  ├─────────────────────►│ t4 余量端口     │─►│ t5 判定  │
                                  │                      └────────────────┘  │ 与门禁   │
                                  │                                          └────┬─────┘
                                  │                                               │
                                  │            ┌──────────────┬──────────────┬────┘
                                  │            ▼              ▼              ▼
                                  │      ┌───────────┐  ┌───────────┐  ┌───────────┐
                                  │      │ t6 批准   │  │ t9 提示词 │  │ t7 余量   │
                                  │      │ 可见性    │  │ 纪律      │  │ 上屏      │
                                  │      └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
                                  │            │              │              │
                                  │            │              │        ┌─────▼─────┐
                                  │            │              │        │ t8 兼容   │
                                  │            │              │        └─────┬─────┘
                                  └────────────┴──────────────┴──────────────▼
                                                                      ┌──────────┐
                                                                      │ t10 收口 │
                                                                      └──────────┘
```

- **t1 必须最先**：判定是本需求唯一的算法，协议层、用例层、弹框层共用它；先写死它，后面三处才不会各写一份。
- **t2 是承重墙**：`footprint` 要走通四处手写映射（本仓 `stages`、`requirement_refs` 都在这条路上静默丢过），
  所以它单独成卡、且验收自带反向证伪。
- **t3 与 t4 可并行**：一个碰工具 schema、一个碰适配器，互不依赖；但都依赖 t2 的契约。
- **t5 是唯一"门"**：判定落地 + 返回体 + 标记校验都在这里，此后 t6/t7/t9 只是把同一个结论摆到不同地方。
- **t8 单列**（feature 档纪律）：迁移与兼容不塞进功能卡，避免"顺手兼容"变成没人验收的角落。
- **t10 是合取收口**：只有 t6（人看得见）、t8（老数据不破）、t9（下一轮会自己算）同时在位，需求才算立住。

## 关键验收命令（t10 逐条跑）

```bash
# 目标用例（与 requirement.md §验收 同名，六份）
npx vitest run tests/round-capacity.test.ts tests/plan-footprint.test.ts
npx vitest run tests/plan-footprint-propagation.test.ts tests/plan-overcapacity-notice.test.ts
npx vitest run tests/capacity-reference.test.ts tests/plan-footprint-compat.test.ts

# 门禁与回归
npx vitest run tests/output-contract.test.ts tests/layer-boundary.test.ts tests/size-budget.test.ts
node scripts/inline-prompt-fragments.mjs && node scripts/check-prompt-fragments.mjs
npx vitest run tests/prompt-gates.test.ts
pnpm typecheck            # 不高于基线 223
npx vitest run            # 失败数 ≤ 基线 106

# 真实冒烟三条（数字留档 evidence/）
# ① {files:100,anchors:20,chars:6000} → overCapacity 命中、suggestedBatches = 8
# ② {files:1,anchors:2,chars:800}      → overCapacity 为空（不误报）
# ③ 删掉 ② 的 footprint 再提交          → 照旧通过（未声明 ≠ 0）
```
