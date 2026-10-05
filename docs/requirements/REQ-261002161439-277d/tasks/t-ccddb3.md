# t-ccddb3 先定契约：需求存储端口与错误码（与旧端口并存）

> 任务卡骨架（reqboard_decompose 自动生成）；汇报经 reqboard_task_report 追加到本文件

## 在做什么
先定契约：需求存储端口与错误码（与旧端口并存）

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 范围
- 阶段：implement
- 端侧：backend

## 得到什么结果
npx vitest run tests/reqboard/store-contract.test.ts 全绿（先只跑 InMemoryRequirementStore）；契约测试对 RequirementStore 的每个方法至少 1 条断言，且断言里覆盖全部 7 个错误码；npx tsc --noEmit 错误数 ≤ 基线 223；grep 端口方法名与 design/interfaces.md 逐条对齐无缺项（人工比对一次，缺项即返工）。

## 实施方案（implementation）
在 src/application/ports.ts 内**新增**（不删旧 ReqboardRepository，切换在 t8）：RequirementStore 端口（get/getSummary/listSummaries/listComments/listHistory/head/create/mutate/mutateIf/appendComment/sweep/replaceAll/subscribe + peekSummaries）与支撑类型 RequirementFilter/LedgerHead/MutateResult/SweepResult/RequirementChange/MutationOutcome/RequirementDraft/RequirementReader；新增错误码常量（REQBOARD_CONFLICT/NOT_FOUND/ALREADY_EXISTS/COLD_IMMUTABLE/VALIDATION_FAILED/CORRUPT_SHARD/IO_FAILED）。签名逐条照 design/interfaces.md 抄；注释写明三条纪律：mutate 的原子性由适配器保证、sweep 仅启动对账可用、peekSummaries 非权威。在 tests/application/harness.ts 新增 InMemoryRequirementStore（与既有 InMemoryRepo 并存），并写 tests/reqboard/store-contract.test.ts 契约清单（覆盖全部方法与全部错误码，先只跑内存替身）。

## 上游产出摘要（dependsSummary）
- 把数据放哪、长什么样定成纯函数：路径、摘要、日志行

## 执行方式提示（executorHint）
优先新窗口或 subagent 执行；按本卡自足执行，不读会话历史
## 汇报 1（2026-10-02T08:51:41.831Z，窗口 session-8c9338a3-fc36-4c3a-bda1-d73c7e78d783）

t2 收尾：需求存储端口契约落地（14 方法 + 7 错误码 + 内存替身），契约测试 32 用例全绿，与设计比对无缺项。

### 完成项

- RequirementStore 端口落地：14 个方法（含 peekSummaries 同步投影）
- 支撑类型齐备：Filter/Head/MutateResult/SweepResult/Change/Draft/Outcome/SummaryPage 等
- 7 个传输错误码常量 REQUIREMENT_STORE_ERROR 落地并被全部断言
- 旧 MutateResult 改名 LedgerMutateResult，名字让给新端口（3 处引用同步）
- 内存替身 InMemoryRequirementStore 实现同一契约，与单册替身并存
- 契约测试 32 用例全绿，14/14 方法与 7 个错误码全覆盖
- 与设计机械双向比对：声明的 13 个方法一个不缺（ALIGN OK）
- typecheck 187 与基线逐条一致；全量回归 97 failed 未变、通过数 +32
- 两处不一致与一处证明缺口已留痕 notes/known-defects.md

### 改动文件

- `src/application/ports.ts`
- `tests/application/harness.ts`
- `tests/reqboard/store-contract.test.ts`
- `docs/requirements/REQ-261002161439-277d/notes/known-defects.md`

### 下一步

开 t3（原子写搬迁 + 分片仓储）：新增 atomicWrite.ts 与 RequirementShardRepository.ts，配分片仓储单测。

---
