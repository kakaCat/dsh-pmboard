# t-fcf3f1 数据契约：projectId 字段、摘要投影、落库列与查询过滤·研发

> 需求：REQ-261005141830-7a3b 修复 Dive 项目归属以路径判定：改用项目 id 唯一标识

## 在做什么
数据契约：projectId 字段、摘要投影、落库列与查询过滤·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-05T06:52:12.860Z，窗口 session-5ae0ddcc-04c0-4c3e-8ef0-86661f9234aa）

这一步做完，需求第一次能"按项目问出来"：以前只能一条条拿路径去比（还比不准），现在一条查询就能拿到某个项目下的全部需求；同时项目身份进入了驱动判定读的那份窄投影，为后面「谁该起轮」铺好路。

### 完成项

- 记录契约新增可选 projectId（需求记录级），并把 workspaceRoot 的注释改成「角色降级为存量兜底」，防止后人再把它当唯一权威
- 摘要与窄投影都带上 projectId：摘要键集、factsOf（驱动判定读的同步投影）、summarize 各一处
- 建档入参（NewRequirement）与查询过滤（RequirementFilter.projectId）各加一处：让「这个项目下有哪些需求」成为一次查询
- 两个真实写入器（分片 / SQLite）落 project_id；SQLite 行映射（列清单、列↔键映射、写值）同步补齐；两张表的建表 DDL 各加一列
- 两个真实存储（分片 / SQLite）加按项目过滤分支
- 内存测试替身补齐同口径（落字段 + 按项目筛）——它与真实存储不同源的话，新用例会在替身上假装通过
- 用例：T-08（记录与摘要都带 projectId）、T-08b（不传则不带该键，不伪造空串）、T-10（同项目一次问出 / 另一项目 0 条 / 不传即全量）、T-16（SQLite 往返 + 未归属读回不带键）

### 改动文件

- `src/shared/protocol.ts`
- `src/domain/requirement/RequirementSummary.ts`
- `src/application/ports.ts`
- `src/repositories/ShardedRequirementWriter.ts`
- `src/repositories/SqliteRequirementWriter.ts`
- `src/repositories/sqliteRows.ts`
- `src/repositories/sqliteSchema.ts`
- `src/repositories/ShardedRequirementStore.ts`
- `src/repositories/SqliteRequirementStore.ts`
- `tests/application/harness.ts`
- `tests/project-identity.test.ts`

### 下一步

联调：让四个存储实现（分片 / SQLite / 内存替身 / 只读替身）对「按项目筛」给出一致结论。

---
