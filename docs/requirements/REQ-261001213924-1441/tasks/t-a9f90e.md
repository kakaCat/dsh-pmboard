# t-a9f90e 存量台账分类迁移与兼容回滚·测试

> 需求：REQ-261001213924-1441 修复唤醒链的订阅作用域：agent/* 事件被 scope 过滤器丢弃，Dive 驱动点全网失聪

## 在做什么
存量台账分类迁移与兼容回滚·测试

## 解决什么问题
（未填写——开工前补充这张卡要解决的业务问题）

## 得到什么结果
`pnpm test` → 失败数 ≤ 开工前基线；`npx tsc --noEmit` → 错误数 ≤ 基线（贴汇总输出）

---
## 汇报 1（2026-10-02T01:11:52.344Z，窗口 session-fc0c4b27-505e-4897-adf1-f6d70f624de4）

测试段：迁移用例全绿，相关套件无回归。

### 完成项

- npx vitest run tests/dive-migration.test.ts → 7 passed
- dive 相关八个文件一起跑 → 97 passed（另 2 条 layer-boundary 是存量问题：domain 里 Date.now、application 里既有 node:fs/cordis import，与本次改动无关）

### 改动文件

- `src/application/internal/migrate-dive-state.ts`
- `src/shared/protocol.ts`
- `src/index.ts`
- `tests/dive-migration.test.ts`
- `docs/requirements/REQ-261001213924-1441/design/data-model.md`

---
