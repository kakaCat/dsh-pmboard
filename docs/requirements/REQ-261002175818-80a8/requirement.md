---
requirement_refs: [FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7, FR-8, FR-9]
---

# 拆分阶段预判单轮余量：卡片体量声明与超容量强制分批

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**重档**（依据见文末「档位依据与单向升级」） ｜ 立项：2026-10-02
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

一句话：**让「这张卡一轮改不完」在拆分阶段就被看见，而不是在实施到一半时才发现清醒度不够。**

现场是一句人话：*「余量 = 我这一轮还能清醒处理的细节量；它不够支撑一次『100 个文件必须一次改完』的手术。」*
今天拆分粒度完全靠人拍脑袋——容量约束**不在任何门禁里**。于是一张 100 文件的卡会被正常批准、正常开工，
直到跑了一半才暴露，损失的是整轮产出而不是单个文件。

**本需求做两件事**：让计划卡**声明体量**（三个可数的确定量），并让超容量的卡在**批准之前**被标红。

**不做两件事**：不做硬拒绝（人仍可在批准闸门放行）、不做预测偏差的校准闭环（另立需求）。

## 现状 → 目标

```
 现状（容量不在门禁里）                     目标（拆分时就看见）
 ─────────────────────────────              ─────────────────────────────
  拆分节点写计划                              拆分节点写计划
     │ 粒度靠印象                               │ 每张卡声明体量 footprint
     ▼                                          ▼
  20 张卡（含一张 100 文件手术）             机械校验：声明 ≥ implementation 点到的路径数
     │ 无人比对容量                              │ 声明小于证据 → 拒绝（不许蒙门禁）
     ▼                                          ▼
  人批准（只看标题与验收）                   容量比对：detailUnits vs 一轮容量常量
     │                                            │ 超容量 → 标红 + 建议 N 批（不拒绝）
     ▼                                          ▼
  实施到一半：清醒度不够                     批准闸门前人已看到超容量清单
     │ 整轮产出报废                              │ 人自行决定：放行 / 要求再拆
     ▼                                          ▼
  （无回程）                                 放行 → 落库（卡上带体量与超容量标记）
```

## 判定标准（可证伪）

| 断言 | 量法 | 通过条件 |
|------|------|----------|
| A1 体量可声明 | 调 `reqboard_submit(kind=plan)` 传一张带 `footprint` 的卡 | 返回 `success:true`；**落库任务卡上 `footprint` 三字段与计划逐字相同**（不是只到协议层） |
| A2 不许蒙门禁 | 同一张卡：`implementation` 里点到 3 个 `src/...`/`tests/...` 路径，却声明 `files:1` | 返回 `REQBOARD_INVALID_INPUT`，reason 含「声明小于证据」与实际路径计数；修成 `files:3` 即通过 |
| A3 超容量被算出 | 造卡 `files:100, anchors:20, chars:6000`（容量常量 16 DU） | 返回 `overCapacity` 命中该卡，`detailUnits ≈ 113`、`suggestedBatches = ceil(113/16) = 8`，`capacityNote.source='constant'`、`calibrated=false` |
| A4 超容量不是错误 | 同 A3 | 返回 `success:true`（**不是** error）；计划仍可提交、仍可被批准（软门禁） |
| A5 三处可见 | 同 A3，依次看提交返回体 / `decomposition.md` 任务表 / 批准闸门问题文本 | 返回体有结构化 `overCapacity`；计划文档该卡行含超容量标记「⚠️超容量(建议8批)」；批准文本出现该卡 key——**缺任一处即判失败** |
| A6 余量参考不冒充判据 | 读节点输入包 / `reqboard_task_tree` 的余量展示字段 | 值来自 `contextPressure` 投影；同一条展示里带有「参考值，非门禁判据」标注 |
| A7 未声明不冒充 0 | 用一张**无** `footprint` 的旧式计划提交；再对旧台账（无该字段）调任务树 | 提交照旧通过且 `overCapacity=[]`；任务树回显「未声明」；两者都**不报错、不当成 0 判定** |

## 边界

1. **做**：卡片体量声明（三字段）+ 声明下限机械校验 + 容量比对 + 超容量软门禁（提交返回体 / 计划文档标记 / 批准文本，三处可见）。
2. **不做**：**不做硬拒绝**——超容量卡仍可提交、仍可被人批准放行；也**不改**现有拆分粒度默认模板（`stages` 映射表与子卡链逻辑零改动）。
3. **不做**：不做预测偏差的校准闭环（预测 vs 实际回归、权重标定）、不改 DSH 侧 `token-meter`（只读它的投影）；**不新开 HTTP 路由**，新字段只经工具与台账。

## 产品定义

本插件（`dsh-pmboard`）在需求流水线里替人守门：立项 → 需求分析 → 设计 → 拆分 → 实施 → 验收 → 归档。
本需求守的是**拆分这道门**。

它引入一个此前不存在的量——**一轮的细节容量**：一次交付里「要同时记住并正确处置的独立决定」的上限。
超了不是错误，是**风险**；本需求把风险从「实施中途才暴露」提前到「批准之前就摆在桌上」。

产品形态是三件具体可见的东西：

- 计划里的每张卡多一个**体量声明**（改几个文件、几条验收锚点、多少字符）；
- 提交计划时返回一个**超容量清单**（哪张卡、超多少、建议切几批）；
- 计划文档与批准闸门上，超容量的卡**被标出来**。

## 用户与角色

| 角色 | 今天的痛 | 本需求后拿到的 |
|------|----------|----------------|
| 提需求的人 | 手术式改动跑到一半才发现一轮做不完，整轮报废 | 拆分阶段就看到「这张卡要 8 批」 |
| 拆分节点（agent） | 粒度靠印象，没有可对照的尺子 | 一把可算的尺子 + 一个必须写的声明字段 |
| 批准人 | 只看标题与验收就点头，容量风险看不见 | 批准前看到超容量清单，可要求再拆或知情放行 |
| 实施节点（agent） | 拿到一张体量未知的卡，跑到一半撑不住 | 卡上带着体量与超容量标记 |

## 功能点

- **FR-1: 计划卡可声明体量 footprint**
  在 `PlanTask` 上新增可选字段 `footprint: { files, anchors, chars }`（三个正整数，缺失＝未声明）。
  拆分节点写计划时按卡声明；三个量都是可数的确定量，不含主观打分。

- **FR-2: 声明不得小于证据（防蒙门禁）**
  提交时取 `implementation` 正文里出现的路径（`src/`、`tests/`、`docs/`、`scripts/` 前缀）去重计数作为**下限**。
  `footprint.files < 下限` → `REQBOARD_INVALID_INPUT`，reason 给出实际计数与修复指引（补implementation 或改声明）。
  这是一个**单向约束**：允许声明留余量，不允许声明缩水。

- **FR-3: 容量判据是单一源的自标定常量**
  新建纯函数域模块 `src/domain/capacity/round-capacity.ts`（零 import 外层，遵守 C-01）：
  权重与容量常量**只在这里定义一次**，`detailUnits = files×1 + anchors×0.5 + chars/2000`，缺省容量 **16 DU**。
  允许经插件配置 `capacity.roundDetailUnits` 覆盖；`capacityNote.calibrated=false` 明示常量尚未标定。

- **FR-4: 超容量在提交返回体结构化报出**
  `reqboard_submit(kind=plan)` 返回体新增 `overCapacity: [{ key, title, detailUnits, capacity, suggestedBatches, hint }]`
  与 `capacityNote: { source, value, calibrated }`。`suggestedBatches = ceil(detailUnits / capacity)`，仅超容量时出现且 ≥2。
  **超容量不是 error**：`success` 仍为 `true`（软门禁的机器语义）。

- **FR-5: 超容量在计划文档被标红且校验标记在场**
  计划文档 `decomposition.md` 的任务表里，超容量卡行前带标记「⚠️超容量(建议N批)」。
  提交时校验该标记**确实在场**——否则「标红」会像 `PlanTask.stages` 那样静默失效。

- **FR-6: 超容量进入批准闸门的问题文本**
  批准计划（`reqboard_ask_confirm(target=plan)`）的问题文本必须包含超容量卡清单（key + 建议批数）。
  由提交返回体驱动，节点实施片段要求照抄——把风险**摆在批准这个动作面前**，而不是埋在返回体里。

- **FR-7: footprint 端到端贯通到落库任务卡**
  字段必须走通 `工具入参 schema → normalizePlanTasks → plan-landing → TaskRecord` 全链。
  本仓已有两次静默丢弃的先例（`stages`、`requirement_refs`），故本条的验收**自带反向证伪**：
  删掉 `normalizePlanTasks` 白名单里的一项，对应用例必须变红。

- **FR-8: 余量参考只读展示，并标注非判据**
  读 DSH 的 `contextPressure`（`contextWindow` / `pressureTokens` / `projectedTokens`）与 `contextBreakdown`，
  在节点输入包与 `reqboard_task_tree` 里显示「当轮余量参考」，并**同一条展示内**标注「参考值，非门禁判据」。
  理由写进代码注释：token-meter 自述这些字段非原子、且 "not a gating input"——**判据是我们的常量，不是它的读数**。

- **FR-9: 不判定缺失声明的卡，不 bump schemaVersion**
  `footprint` 全链可缺省；旧计划（无声明）提交照旧通过、`overCapacity=[]`；旧台账读出即旧行为（回显「未声明」）。
  维持 `REQBOARD_SCHEMA_VERSION = 9`：新增字段全部可缺省，不冒充 0、不迁移、不报错。

## 接口（对外入口）

| 入口 | 输入变化 | 输出变化 | 错误语义 |
|------|----------|----------|----------|
| `reqboard_submit(kind=plan)` | `tasks[].footprint?: { files, anchors, chars }`（新增可选） | 新增 `overCapacity[]`、`capacityNote` | 形状非法（非正整数 / 未知键）或**声明小于证据** → `REQBOARD_INVALID_INPUT`；超容量**不报错** |
| `reqboard_task_tree` | 无 | 卡上回显 `footprint` 与超容量标记；新增只读「当轮余量参考」 | 未声明 → 回显「未声明」，不报错 |
| 节点输入包（拆分节点） | 无 | 注入「一轮容量」纪律段落（含常量值、权重口径、必须声明 footprint、超容量要写标记与进批准文本） | 无 |

## 数据契约

```ts
/** 卡片体量声明（FR-1）：三个可数的确定量；缺失 = 未声明（不冒充 0）。 */
export interface CardFootprint {
  /** 本次要改/新建的文件数（正整数；不得小于 implementation 里点到的路径数 → FR-2） */
  files: number
  /** 验收锚点数：可执行断言条数（正整数） */
  anchors: number
  /** 实施描述与目标改动量合计字符数（正整数，沿用本仓字符口径） */
  chars: number
}
```

- `PlanTask.footprint?: CardFootprint`（计划层，可选）
- `TaskRecord.footprint?: CardFootprint`（落库层，可选；与计划层逐字一致 → FR-7）
- 返回体 `OverCapacityItem = { key, title, detailUnits, capacity, suggestedBatches, hint }`
- 返回体 `capacityNote = { source: 'constant' | 'config', value: number, calibrated: false }`
- 权重与容量常量单一源：`src/domain/capacity/round-capacity.ts`；可经 `capacity.roundDetailUnits` 覆盖

## 迁移与兼容

| 旧物 | 怎么办 | 依据 |
|------|--------|------|
| 旧计划（无 footprint） | 提交照旧通过，不判定、不报错；`overCapacity=[]` | FR-9：可缺省 = 旧行为 |
| 旧台账任务卡（无 footprint） | 任务树回显「未声明」 | 不冒充 0（同 `token-usage.ts` 的「不拿 0 冒充缺失」口径） |
| `REQBOARD_SCHEMA_VERSION` | **维持 9，不 bump** | 本仓先例：子卡层字段「全部可缺省：旧台账读出即旧行为，不 bump schemaVersion」 |
| 回滚 | 停止读取 footprint 判定路径即回到当前行为；台账里多出的字段是 JSON 容错字段，不阻塞旧版本 | 无破坏性变更 |

## 验收（怎么跑）

```bash
# 1 域纯函数：权重合成 / 边界值 / 超容量判定 / 建议批数（16 DU 边界、113 DU → 8 批）
npx vitest run tests/round-capacity.test.ts

# 2 声明下限校验：点 3 个路径却声明 files=1 → 拒绝；声明 ≥ 计数 → 通过（A2）
npx vitest run tests/plan-footprint.test.ts

# 3 端到端贯通 + 反向证伪：删 normalizePlanTasks 白名单一项 → 本用例必须变红（A1 / FR-7）
npx vitest run tests/plan-footprint-propagation.test.ts

# 4 软门禁三处可见：返回体 overCapacity / 计划文档标记在场 / 批准文本含卡 key（A3 / A4 / A5）
npx vitest run tests/plan-overcapacity-notice.test.ts

# 5 余量参考只读且带「非门禁判据」标注（A6）
npx vitest run tests/capacity-reference.test.ts

# 6 缺省路径：旧计划照旧通过、旧台账回显未声明、schemaVersion 仍为 9（A7 / FR-9）
npx vitest run tests/plan-footprint-compat.test.ts

# 7 尺寸与类型门禁（C-02 本次文件命中 0 / C-15 不高于基线 223）
npx vitest run tests/size-budget.test.ts && pnpm typecheck
```

**真实冒烟**（对齐立项时的那句话）：

1. 造一张 `files:100, anchors:20, chars:6000` 的卡提交 → `overCapacity` 命中、`suggestedBatches ≥ 2`（预期 8）；
2. 造一张单文件小改卡（1 文件 / 2 锚点 / 800 字符，≈2.4 DU）→ `overCapacity=[]`，不误报；
3. 把 2 的结果删掉 `footprint` 再提交 → 照旧通过（A7）。

## 与标题的偏差（术语澄清）

立项标题写的是「超容量**强制批次**」，而本次裁定是**软门禁**（人可在批准闸门放行）。两者不冲突，但必须说清：

- **生成侧强制**：拆分节点**必须**按容量切卡——这是对产出形态的要求；
- **落库侧不强制**：超容量计划**不会被拒绝**，人知情即可放行。

若后续裁定要改回硬门禁，属**单向升级**（见下节）：需重新批准计划门禁语义，不在本次范围。

## 档位依据与单向升级

**为什么重档**（不满足轻档的「改动面小、无新决策点」）：

- 要动**数据模型**（`PlanTask` / `TaskRecord` 新增字段），触碰 schema 与台账；
- 要**新增子系统**（容量域模块 + 门禁判定 + 三处呈现）；
- 立项前已出现多个未定决策（门禁强度 / 容量口径 / 范围切分），已逐条裁定。

**单向升级**：一旦出现第二个未定决策、要动架构、要新增子系统或改数据模型，立即停手升级——**本需求立项即为重档**。
反向降级不允许。

## 批准闸门

下一步：**design** —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；**未获批准不得进入**。

设计阶段要交齐 feature 全套设计文档（`design/` 下）：`architecture.md`、`data-model.md`、`interfaces.md`、
`test-cases.md`、`use-cases.md`（若声明 frontend/backend 端侧，另加对应条件必交文档）。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | ✅ 已接收 | t1、t2、t3、t9、t10 |
| FR-2 | ✅ 已接收 | t1、t2、t10、t5 |
| FR-3 | ✅ 已接收 | t1、t9、t10、t5 |
| FR-4 | ✅ 已接收 | t3、t10、t5、t6 |
| FR-5 | ✅ 已接收 | t9、t10、t5 |
| FR-6 | ✅ 已接收 | t10、t6 |
| FR-7 | ✅ 已接收 | t2、t10 |
| FR-8 | ✅ 已接收 | t10、t4、t7 |
| FR-9 | ✅ 已接收 | t2、t10、t7、t8 |

> 无未接收条款（9 条全部有落点）。

<!-- reqboard:marks:end -->
