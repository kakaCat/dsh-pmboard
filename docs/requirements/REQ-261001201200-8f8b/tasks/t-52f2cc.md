# t-52f2cc 迁移兼容与端到端验证（回归基线 + 回滚说明）·研发

> 需求：REQ-261001201200-8f8b 修复节点确认后不唤醒 agent：AgentDeliverer 缺 idFactory 致 Dive 唤醒链断裂

## 在做什么
迁移兼容与端到端验证（回归基线 + 回滚说明）·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-01T12:29:45.326Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

研发段：把「升级这件事对老数据/老调用方意味着什么」写清楚——结论是零迁移：台账字段没变、存量数据不回填、旧调用方不用改。

### 完成项

- notes/migration-and-rollback.md：schema 零变更 / 不回填的理由 / 旧调用方与旧测试处置 / 回滚清单 / 兼容性风险表
- 确认 idFactory 为可选入参，未传回落 newCommentId()，旧调用方零改动
- 确认 HTTP 返回体未新增键（恢复信息并入既有 advanceNote）

### 改动文件

- `docs/requirements/REQ-261001201200-8f8b/evidence/verification.md`
- `docs/requirements/REQ-261001201200-8f8b/notes/migration-and-rollback.md`

---
