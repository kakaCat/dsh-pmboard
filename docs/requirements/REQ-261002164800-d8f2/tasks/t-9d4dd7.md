# t-9d4dd7 定死 refs 契约：编号校验纯函数 + PlanTask 字段 + 计划入参 schema

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
定死 refs 契约：编号校验纯函数 + PlanTask 字段 + 计划入参 schema

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/reqboard/requirement-refs.test.ts 全绿：合法值去重保序，X-1 / FR-99x / 空串被拒且错误文本含卡 key 与非法值；pnpm typecheck 改动文件零错误。修前该用例全红（字段在协议层被丢弃）。

## 实施方案（implementation）
新增 src/domain/task/RequirementRefs.ts（零 IO：REF_ID_RE / refInvalidReason / normalizeRequirementRefs，去重 + 自然序）；src/shared/protocol.ts 的 PlanTask 增可选 requirement_refs，normalizePlanTasks 保留并校验（非法抛 REQBOARD_BAD_REQUIREMENT_REF，点名 key 与非法值）；src/tools/SubmitTool/SubmitTool.ts 的 parameters.tasks.items.properties 补 requirement_refs（保持 additionalProperties:false）。验证：tests/reqboard/requirement-refs.test.ts。

## 上游产出摘要（dependsSummary）
- （无依赖）

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T09:04:39.836Z，窗口 session-fcfe356b-c62e-48cd-aee7-a94245188531）

这一步做完，计划里写的需求条款第一次真的能落到卡上：提交计划时能写、写错当场被点名，不再被协议层静默丢掉

### 完成项

- 卡 t-9d4dd7 四段子卡（研发 / 联调 / 复核 / 测试）全部 done
- 新增零 IO 领域模块 src/domain/task/RequirementRefs.ts（编号形态、去重、自然序、逐项非法原因）
- PlanTask 增 requirement_refs 字段，normalizePlanTasks 保留并校验，非法抛 REQBOARD_BAD_REQUIREMENT_REF 并点名卡与值
- reqboard_submit(kind=plan) 入参 schema 补该字段（此前只声明在返回体上，入参 additionalProperties:false 直接拒收）
- 16 条单测全绿；全量 97 failed ≤ 基线 106；类型 187 ≤ 基线 223

### 改动文件

- `src/domain/task/RequirementRefs.ts`
- `src/shared/protocol.ts`
- `src/tools/SubmitTool/SubmitTool.ts`
- `tests/reqboard/requirement-refs.test.ts`

### 下一步

开工下一张 ready 卡 t-90dc24（取数单点 refsForLanding）

---
