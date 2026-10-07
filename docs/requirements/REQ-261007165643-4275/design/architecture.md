---
serves: [FR-1, FR-2, FR-3, FR-4]
---

# 架构说明（REQ-261007165643-4275）

> 本需求为 spike（只读调研），**不引入任何架构变更**。本文件为验收文档齐备性而设，
> 实质架构认知全部沉淀在 [research-report.md](research-report.md)。

## 架构认知摘要 <!-- serves: FR-2 -->

调研涉及的既有架构分层（只读对象）：

```
src/tools/        27 个工具壳（schema + prompt + 分派）
src/application/  用例 / 门禁 / 查询 / dive 自动链
src/domain/       状态机 / 模板 / 错误码（小写 16 码集中，大写 136 码散落）
src/repositories/ 台账存储（QueueTaskStore / ShardedRequirementWriter，进程内队列）
src/http/         HTTP 路由（actor 自报、无鉴权 → H2 敞口）
```

## 本需求对架构的影响 <!-- serves: FR-4 -->

无直接影响。间接影响：FR-4 的 S1~S6 精简路径与 G1~G10 治理建议若被裁决采纳，
将各立后续 feature/refactor 需求，届时在对应需求的设计文档中给出架构变更。
