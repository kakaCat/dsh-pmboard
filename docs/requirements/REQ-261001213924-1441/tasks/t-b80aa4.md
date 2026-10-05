# t-b80aa4 存量台账分类迁移与兼容回滚·研发

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
存量台账分类迁移与兼容回滚·研发

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡改动涉及的测试文件>` → 全绿；并附 `git diff --stat` 摘要

---
## 汇报 1（2026-10-02T01:11:51.394Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

研发段：给老台账做一次「归队」——把它们从只有相位的老形态，整成新契约认得的状态。

### 完成项

- 新增 migrate-dive-state：按数据模型矩阵逐条迁移（误停摆恢复 / 人主动暂停不动 / 终态暂停降级为可恢复 / 常态补健康 / 旧计数归零 / 无 dive 保守补全）
- 幂等靠 dive.migratedAt 印章（形态相同的新旧记录也能区分），盖章不 bump version（不让在飞回合的预留失效）
- 接到启动对账上跑一次；失败不致命（读侧仍兼容 phase），结果写诊断日志

### 改动文件

- `src/application/internal/migrate-dive-state.ts`
- `src/shared/protocol.ts`
- `src/index.ts`
- `tests/dive-migration.test.ts`
- `docs/requirements/REQ-261001213924-1441/design/data-model.md`

---
