# t-d57ede 存量台账分类迁移与兼容回滚·联调

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
存量台账分类迁移与兼容回滚·联调

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`npx vitest run <本卡接口/契约对应的测试文件>` → 全绿（请求样例与期望响应一致）

---
## 汇报 1（2026-10-02T01:11:51.708Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

联调段：六种存量形态逐行验一遍，再加幂等与「不改人的意图」负例。

### 完成项

- 矩阵 6 行各自断言（含最老的"连 dive 字段都没有"的记录）
- 第二次迁移零写入（逐字节比对）
- 人主动暂停（disarmed+idle）全流程 activation 不变

### 改动文件

- `src/application/internal/migrate-dive-state.ts`
- `src/shared/protocol.ts`
- `src/index.ts`
- `tests/dive-migration.test.ts`
- `docs/requirements/REQ-261001213924-1441/design/data-model.md`

---
