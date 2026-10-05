# t-70dc5f 误物化能一次清掉：仅人的批量清理入口 + 可核对回执·研发

> 需求：REQ-261004121649-bfa7 回退把需求埋了：重做卡递归膨胀且没有撤销入口

## 在做什么
误物化能一次清掉：仅人的批量清理入口 + 可核对回执·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-04T08:51:25.155Z，窗口 session-51baeeda-dbe8-4048-8bc8-b036050d7957）

研发段：清场这件事现在点一次就能做完。这一步做完，什么变了——一次回退物化了哪些卡被记在台账上，清理入口按这份清单一次取消，不再需要人去队列里逐张挑（实测一次要挑 53 张）。

### 完成项

- 新增 src/application/internal/rollback-cleanup.ts：清场的纯判定（匹配、跳过、父子还原），不改入参只返回计划
- 新增 src/application/use-cases/RollbackCleanup.ts：落库编排（先任务后需求），判定与落库各归一处
- 新增 POST /dashboard/api/reqboard/req/rollback-cleanup（routes.ts 注册）
- 物化清单落库：RollbackMark 新增 seq / lastMaterialized，rollback.ts 新增 recordRollbackMaterialized，两条回退路径同款调用
- 自测：tests/rollback-cleanup.test.ts → 11 passed
- 类型检查：本批 7 个文件零错误（npx tsc --noEmit 全量 211 条均为他人在途文件）

### 改动文件

- `src/application/internal/rollback-cleanup.ts`
- `src/application/use-cases/RollbackCleanup.ts`
- `src/application/internal/rollback.ts`
- `src/http/routers/requirements.ts`
- `src/http/routes.ts`
- `src/shared/protocol.ts`
- `src/application/use-cases/MoveRequirement.ts`
- `tests/rollback-cleanup.test.ts`

### 下一步

联调段：确认入口与两条回退路径的清单口径一致

---
