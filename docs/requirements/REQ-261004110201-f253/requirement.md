---
req_id: REQ-261004110201-f253
requirement_refs: [FR-1, FR-2, FR-3, FR-4]
sides: backend
---

# PM 工作流业务设计：模型路由 + 阶段遥测 + 确认聚合深化 + 优先级与 WIP 上限

> 面向：产品、开发、测试、用户——**写给人看**。
> **人读三件套**：TL;DR + ASCII 流程图 + 功能点总览表。
> **排版纪律**：禁超过 4 行的连续段落；并列 ≥3 项用列表/表格；图一律 ASCII 字符画，**禁 mermaid**。
>
> 类型：feature ｜ 档位：**重档（expert）** ｜ 立项：2026-10-04
> 工作区：`/Users/mac/Documents/ai/dsh/dsh-pmboard`

## TL;DR

一句话目标：**让实施链从「跑得对」进到「跑得省、跑得值、排得清」**——
按阶段路由模型、按阶段看得到成本与产出、多需求并行时有优先级与在制上限。

**可证伪判定标准**（跑什么、看到什么算完成）：

```bash
# ① 模型路由生效：生成的子卡脚本里带上路由表指定的 provider/model
npx vitest run tests/stage-model-routing.test.ts     # 断言脚本含 agent(prompt,{schema,provider,model})
# ② 阶段遥测可查：每段时长/产出/成本落盘且能读出来
npx vitest run tests/stage-telemetry.test.ts         # 断言 byStage 汇总含 时长/产出数/零产出标记
# ③ 优先级与 WIP：多需求并行时按优先级排序、超上限不投递并如实说明
npx vitest run tests/requirement-priority.test.ts    # 断言排序与拒投原因
# ④ 全量零回归
pnpm test                                            # 失败数 ≤ 基线
```

派工发生在子代理里（LLM 调用），所以「省」的杠杆只有两个：**换模型**与**少跑废步骤**。

## 业务流程图

```
 今天（同一个模型跑所有阶段）                本需求后（按阶段路由 + 可观测）
 ────────────────────────────────            ────────────────────────────────
 父卡开工 → 子卡 dev                           父卡开工 → 子卡 dev
              │                                            │
              ▼                                            ▼
        agent(prompt,{schema})                     路由表：dev→强模型
              │                                    路由表：review/test→便宜档
              ▼                                            │
        review 段也烧强模型                                ▼
              │                                    agent(prompt,{schema,provider,model})
              ▼                                            │
        无人知道哪段花了多少 / 哪段零产出                   ▼
                                                  每段落：时长/产出数/成本/零产出标记
                                                           │
                                                           ▼
                                                  看板与回执可查 → 模板与路由据此校准
 ────────────────────────────────            ────────────────────────────────
 多需求并行：谁先跑 = 谁先被扫到                多需求并行：按 priority 排序 + 全局 WIP 上限
```

## 产品定义

`dsh-pmboard` 把需求流水线搬进 GUI；**实施链**（AdvanceChain）按 DAG 自动派工，
每张子卡在子代理里跑一次 workflow。

现状的三个空白（均为实测/源码坐实）：

| 空白 | 现状证据 |
|---|---|
| 模型不路由 | `workflow-script.ts` 生成脚本时只传 `schema`，**不传 provider/model**（引擎 `agent()` 本身支持 override） |
| 阶段不遥测 | `tokenUsage.byStage` / `execution.tokenUsage` 底座已在，但**没有产出数与零产出标记**，也没有面向人的查询口 |
| 多需求无调度 | `scanAndResume` 顺序遍历所有 `autoRun` 需求，无优先级、无全局在制上限 |

## 用户与角色

| 角色 | 关心什么 | 本需求给他什么 |
|---|---|---|
| 人（看板使用者） | 钱花在哪、为什么这条需求先跑 | 阶段成本/产出可见；优先级可排、可解释 |
| agent（窗口驾驶者） | 别把弱段跑成强成本 | 路由表生效，无需 agent 逐卡指定 |
| 维护者 | 模板该不该留这一段 | 零产出段被标记出来，校准有据 |

## 功能点

- **FR-1: 按阶段路由模型**——插件配置提供路由表（`stageKind × difficulty → {provider?, model?}`，缺省空 = 现状不变）；生成子卡脚本时把命中的 provider/model 注入 `agent(prompt, {schema, provider, model})`；未命中/未配置一律回落现状（不注入）。
- **FR-2: 阶段遥测**——每次子卡执行在既有 `execution` 记录上补齐：`durationMs`（已有）、`outputCount`（产出条目数：filesChanged+completed 计数）、`zeroOutput`（布尔）；需求级 `tokenUsage.byStage` 汇总按阶段给出 `count/durationMs/outputCount/zeroOutputCount`；提供只读查询口（回执字段或看板接口）如实列出。
- **FR-3: 零产出段标记与告警**——某阶段连续 N 次 `zeroOutput`（默认 2，配置可调）→ 需求评论留一条结构化告警（阶段名/次数/最近一次耗时），**不自动改模板**（改模板是人裁决）。
- **FR-4: 需求级优先级与全局 WIP 上限**——`RequirementRecord` 新增可选 `priority`（number，缺省 0，越大越先）；`scanAndResume` 与看板排序都按它降序（同值按 createdAt 升序，稳定）；插件配置新增 `maxInFlightRequirements`（缺省 0 = 不限），超上限时**不投递**并如实回执原因（谁在跑、上限多少）。

## 接口

| 入口 | 输入 | 输出 | 错误语义 |
|---|---|---|---|
| 路由表（plugin config） | `stageRouting: { '<stageKind>': { provider?, model? } }` | 生成脚本时注入 | 键非法（未知 stageKind/provider 形态）→ 装配期响亮抛错，不静默忽略 |
| 遥测查询（`reqboard_status` 或运行态回执） | 现有参数 | 新增只读字段 `stage_telemetry`（按阶段聚合） | 无数据 → 整体省略键（不发空壳） |
| 优先级 | 需求级 `priority`（看板可改、工具可带） | 排序与回执如实反映 | 非数字 → 拒绝并说明 |
| WIP 上限 | `maxInFlightRequirements`（number ≥ 0） | 超限时 `dispatched:false` + 原因 | 0 = 不限（现状行为不变） |

## 数据契约

| 字段 | 位置 | 类型 | 必填 | 默认 | 兼容 |
|---|---|---|---|---|---|
| `execution.outputCount` | TaskRecord.executions[] | number | 否 | 0 | 新增可选键；旧记录无键按 0 读 |
| `execution.zeroOutput` | 同上 | boolean | 否 | 由 outputCount 推导 | 新增可选键 |
| `tokenUsage.byStage[stage]` | RequirementRecord | 旧桶 + 新计数键（count/durationMs/outputCount/zeroOutputCount） | 否 | 缺省桶 | 追加键，不动旧键 |
| `RequirementRecord.priority` | 需求记录 | number | 否 | 0 | 新增可选键；旧数据无键 = 0（排序稳定） |

**迁移与兼容**：不新增必填键、不改存储版本；未配置路由表 + 未设优先级 + WIP=0 时，**行为逐字等于现状**（本需求的核心兼容承诺）。
**回滚**：路由表与 WIP 都是配置项，删掉配置即回现状；遥测字段为只读增量，留着不影响任何判定。

## 边界

1. **不做**自动优选模型（先人工配置路由表；自动优选需要评测基线，另立需求）。
2. **不做**自动改阶段模板（零产出只标记与告警，改模板由人裁决）。
3. **不做**跨需求的成本预算硬闸（只做 WIP 上限与可见性；预算闸属后续）。

## 档位依据（重档）

`expert`：跨三层（协议新增字段 / 应用层调度与遥测 / 生成器与配置面）、
有 4 个新决策点（路由表形态、遥测字段口径、WIP 上限语义、优先级排序稳定性），
且要动数据契约——**出现任一即重档，本需求四条全中**。
升级信号（出现立即停手升级，不许降级）：要改存储版本 / 要做模型自动优选 / 要把遥测写进判定门。

## 批准闸门与下一步

下一步：design —— 用 `reqboard_ask_confirm(target=artifact, kind=requirement)` 交棒；
未获批准不得进入设计。

<!-- reqboard:marks:begin 机器维护，请勿手改 -->

#### 条款接收状态（随卡的生命周期自动更新）

| 编号 | 接收状态 | 承载任务 |
|------|---------|---------|
| FR-1 | 🔴 **未被接收** | — |
| FR-2 | 🔴 **未被接收** | — |
| FR-3 | 🔴 **未被接收** | — |
| FR-4 | 🔴 **未被接收** | — |

> 🔴 **未被接收（4 条）**：FR-1、FR-2、FR-3、FR-4

<!-- reqboard:marks:end -->
