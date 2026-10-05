# t-ab73f4 体量声明进台账、活到任务卡上（防静默丢弃）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
体量声明进台账、活到任务卡上（防静默丢弃）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/plan-footprint-propagation.test.ts 全绿：台账 plan.tasks 与队列卡上的 footprint 三字段与计划逐字相同。反向证伪：临时删掉 normalizePlanTasks 白名单里的 footprint 一项 → 该用例必须变红（恢复后复绿），证明这条线会响。

## 实施方案（implementation）
protocol.ts：新增 CardFootprint / PlanTask.footprint? / TaskRecord.footprint? / OverCapacityItem / CapacityNote / ContextPressureSnapshot；normalizePlanTasks 在白名单 out.push 处调 normalizeFootprint 与 assertFootprintFloor（照 requirement_refs 先例，shared→domain 纯函数是本仓既有方向）；不 bump REQBOARD_SCHEMA_VERSION（维持 9）。plan-landing.ts 的 PlanTaskDraft 与 TaskRecord 逐字段映射各补一行；approved-plan-landing.ts 的 draftOf 补一行；Decompose.ts 的 creative 与「计划携带任务表」两条映射各补一行。

## 上游产出摘要（dependsSummary）
- 体量算术落地：三个可数的量、一条声明下限

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-04T04:50:32.929Z，窗口 session-5c6b1a8b-3234-4f35-b28f-1f1a20834721）

这一步做完，「体量声明」第一次**真的活在任务卡上**，而不是只在计划文档里。它穿过了四处手写映射（本仓两次栽在这里的同一段路），而且每一处都被证明「删掉就会有用例变红」。另外复核让我改了两次：我原先以为测的是两条路径，实际一条没走到、一条测成了别的分支——现在四条路径都有会响的线。

### 完成项

- 契约落地：PlanTask.footprint? / TaskRecord.footprint?（CardFootprint 类型取自 domain 单一源）
- normalizePlanTasks 白名单带上 footprint，并当场过两道校验（形状 + 声明≥证据）
- 四处手写映射全部补齐：plan-landing（draft+落库）、approved-plan-landing.draftOf、Decompose 两条
- 端到端贯通用例 7/7 全绿：队列卡上的三字段与计划逐字相同
- 反向证伪：删白名单行 → 关键用例变红；还原后校验和一致（e8255819ad92ed7e）
- 独立复核的 2 处覆盖洞已补并各自变异验证会红（删 draftOf 透传 → 1 failed；删创作型映射 → 1 failed）
- 计划权威语义被用例钉住：计划带任务表时，落库以批准的计划为准，入参声明不会覆盖
- 未声明语义逐路径实测：5 处透传点全部「不带键」，无一处写成 footprint: undefined
- 全量回归 97 failed / 3811 passed（≤ 基线 106，与 t1 收尾持平 = 零新增失败）；tsc 145（≤ 223）；两个门禁本卡文件命中 0
- 越界发现已如实上报：SubmitTool 入参 schema 缺 footprint（P0，t3 的验收线）、draftOf 丢 template（真缺陷）、四处旁路映射语义未定

### 改动文件

- `src/shared/protocol.ts`
- `src/application/internal/plan-landing.ts`
- `src/application/internal/approved-plan-landing.ts`
- `src/application/use-cases/Decompose.ts`
- `tests/plan-footprint-propagation.test.ts`

### 下一步

t3（工具门面：入参/出参 schema，含复核点出的 P0）与 t4（余量端口与适配器）都只依赖本卡，可并行开工；t5 等两者完成。

---
