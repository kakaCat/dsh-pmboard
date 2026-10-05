# 拆分计划 · 验收不再要人填结果

> 目标 + 做法：**先把契约定死（数据结构 + 接口），再做两处实现，最后单列兼容卡与回归卡**。
> 卡不跨层：数据契约、接口解析、弹框交互、看板接线各归各卡。

    t1 数据契约（先行）
      ├─► t2 材料绑定 result（接口）
      ├─► t3 弹框只问裁决（接口）
      └─► t4 兼容与迁移（单列）
             │
             ▼
          t5 看板接线 ──► t6 回归

## 条款覆盖对照表

| 需求条款 | 接收任务 | 覆盖说明 |
|---|---|---|
| FR-1 | t1、t2、t4、t6 | 契约 → 提交时逐项落 result → 兼容 → 回归 |
| FR-2 | t1、t3、t6 | 契约 → 有 result 只问裁决 → 回归 |
| FR-3 | t1、t3、t5、t6 | 契约 → 弹框标注 → 看板标记 → 回归 |

本轮不做：无（3 条 FR 全部有接收任务）。

## 任务表

| key | 标题 | phase | 依赖 | 验收（可跑） |
|---|---|---|---|---|
| t1 | 定契约：验收项带 result 与人工确认标记 | implement | — | npx vitest run tests/verify-item-result.test.ts → 契约字段可读写；旧单读为 undefined |
| t2 | 材料即结果：提交验收材料时逐项绑定 | implement | t1 | 同上：evidence 带 <id> :: <结果> → 该项 result 与 resultSource 正确；无 :: 的老写法不绑定 |
| t3 | 弹框只问裁决：有结果就不逼人填 | implement | t1 | 同上：有 result 的项提问数 1；needsHuman 项题干含理由 |
| t4 | 兼容与迁移：旧单/旧调用方/回滚 | implement | t1 | 同上：旧验收单无 result 时行为与今天一致；关闭解析即回旧行为 |
| t5 | 看板接线：展示结果与「需人工确认」 | ui | t2, t3 | pnpm run build:client → 通过；验收面板可见 result 与需人工确认标记 |
| t6 | 回归：五项断言 + 基线不劣化 | test | t2, t3, t4, t5 | npx vitest run tests/verify-item-result.test.ts → 5/5 绿；pnpm test 失败数 ≤ 106；tsc ≤ 212 |

## 红线

1. 人工裁决不可省：任何路径都不自动置 passed（A2 锁住）。
2. 无 result 时选通过仍记 unverified（A3 锁住）。
3. 无 :: 的旧 evidence 行为不变（A5 锁住）。
